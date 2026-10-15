import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { buildAudience, type Audience, type Recipient } from "@/lib/announce/audience";
import { ANNOUNCE_KEY, ANNOUNCE_SUBJECT } from "@/lib/announce/learn-revamp";
import { MAX_BATCH, failedIn, sendBatch, transportKind } from "@/lib/announce/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One batch at a time per server instance (the claim rows guard across instances). */
let busy = false;

const phrase = (n: number) => `send to ${n}`;

/**
 * POST — the real send, one batch per call; the admin page loops until `remaining` is 0.
 *
 *   first call:  { audience: "learners" | "all", confirm: "send to <n>" }
 *                → snapshots the n eligible recipients into a newsletter_campaigns row, sends a batch
 *   next calls:  { campaignId, confirm: "send to <n>", retryFailed? }
 *                → sends the next batch from that snapshot
 *
 * Every call re-checks unsubscribes and skips anyone this announcement already reached, so stopping,
 * retrying or a double click can't email someone twice. The console transport (default outside
 * production) writes nothing and walks the snapshot with `cursor` instead.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  if (busy) return NextResponse.json({ error: "A batch is already running. Wait for it to finish." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const confirm = typeof body?.confirm === "string" ? body.confirm.trim().toLowerCase() : "";
  const audience: Audience = body?.audience === "all" ? "all" : "learners";
  const campaignId = Number.isInteger(body?.campaignId) && body.campaignId > 0 ? (body.campaignId as number) : null;
  const cursor = Number.isInteger(body?.cursor) && body.cursor > 0 ? (body.cursor as number) : 0;
  const retryFailed = body?.retryFailed === true;
  const kind = transportKind();

  busy = true;
  try {
    const live = await buildAudience();
    const byEmail = new Map(live.all.map((r) => [r.email, r]));

    // ── console (dev) — no campaign row, no logs: walk the current list with a cursor ──
    if (kind === "console") {
      const list = [...live[audience]].sort((a, b) => a.email.localeCompare(b.email));
      if (confirm !== phrase(list.length)) {
        return NextResponse.json({ error: `Type "${phrase(list.length)}" to confirm.`, expected: phrase(list.length) }, { status: 400 });
      }
      const batch = list.slice(cursor, cursor + MAX_BATCH);
      const { results } = await sendBatch(null, batch);
      const next = cursor + batch.length;
      return NextResponse.json({
        transport: kind,
        campaignId: null,
        cursor: next,
        total: list.length,
        sent: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok),
        remaining: Math.max(0, list.length - next),
      });
    }

    // ── smtp — snapshot on the first call, then batches from the snapshot ──
    let id = campaignId;
    let snapshot: string[];
    if (!id) {
      const list = live[audience];
      if (!list.length) return NextResponse.json({ error: "Nobody left to send to in this audience." }, { status: 400 });
      if (confirm !== phrase(list.length)) {
        return NextResponse.json({ error: `Type "${phrase(list.length)}" to confirm.`, expected: phrase(list.length) }, { status: 400 });
      }
      snapshot = list.map((r) => r.email);
      const { data: camp, error } = await supabase
        .from("newsletter_campaigns")
        .insert({ subject: ANNOUNCE_SUBJECT, story_slugs: [ANNOUNCE_KEY, `audience:${audience}`], subscriber_emails: snapshot })
        .select("id")
        .single();
      if (error || !camp) return NextResponse.json({ error: `Couldn't create the campaign: ${error?.message || "no row"}` }, { status: 500 });
      id = camp.id as number;
    } else {
      const { data: camp, error } = await supabase.from("newsletter_campaigns").select("id, story_slugs, subscriber_emails").eq("id", id).single();
      const slugs = (camp?.story_slugs || []) as string[];
      if (error || !camp || !slugs.includes(ANNOUNCE_KEY)) return NextResponse.json({ error: "Unknown announcement campaign." }, { status: 404 });
      snapshot = ((camp.subscriber_emails || []) as string[]).map((e) => String(e).toLowerCase());
      if (confirm !== phrase(snapshot.length)) {
        return NextResponse.json({ error: `Type "${phrase(snapshot.length)}" to confirm.`, expected: phrase(snapshot.length) }, { status: 400 });
      }
    }

    const failed = retryFailed ? new Set<string>() : await failedIn(id);
    // still eligible (not unsubscribed, not already reached) and not failed earlier in this run
    const pending: Recipient[] = snapshot.filter((e) => byEmail.has(e) && !failed.has(e)).map((e) => byEmail.get(e)!);
    const batch = pending.slice(0, MAX_BATCH);
    const { results } = await sendBatch(id, batch);
    return NextResponse.json({
      transport: kind,
      campaignId: id,
      total: snapshot.length,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok),
      remaining: pending.length - batch.length,
      skippedFailed: failed.size,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  } finally {
    busy = false;
  }
}
