import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { dropInternal } from "@/lib/analytics/excludeServer";
import { getAllLearningResources } from "@/lib/github";
import { COURSE_ID, COURSE_MAP_TAG } from "@/lib/learn/course";
import { CONTROLS_TAG, getControls, isLive, questKey, shortKey, type Control } from "@/lib/learn/controls";
import { listAllShorts } from "@/lib/learn/shorts/load";
import { shortsStats } from "@/lib/learn/shorts/stats";
import { SHORT_CATEGORIES } from "@/lib/learn/shorts/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const state = (c: Control | undefined) => (!c ? "live" : c.status === "scheduled" && isLive(c) ? "live" : c.status);

/** Page views per quest page (and distinct viewers) in the range, the owner's test traffic dropped. */
async function questViews(since: string): Promise<Map<string, { views: number; viewers: number }>> {
  type Row = { page_path: string; visitor_id: string | null; user_id: string | null; metadata: Record<string, unknown> | null };
  const rows: Row[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("page_path, visitor_id, user_id, metadata")
      .eq("event_type", "page_view")
      .like("page_path", `/learn/${COURSE_ID}/bonus-problems/%`)
      .gte("created_at", since)
      .range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  const out = new Map<string, { views: number; viewers: Set<string> }>();
  for (const r of await dropInternal(rows)) {
    const slug = r.page_path.split("/")[4]?.split(/[?#]/)[0];
    if (!slug) continue;
    const e = out.get(slug) || { views: 0, viewers: new Set<string>() };
    e.views++;
    e.viewers.add(r.user_id || r.visitor_id || "anon");
    out.set(slug, e);
  }
  return new Map([...out].map(([k, v]) => [k, { views: v.views, viewers: v.viewers.size }]));
}

/** GET ?days=30 → every released short and side quest with its publishing state and numbers. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const days = Math.min(180, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  try {
    const [shorts, controls, stats, resources, qv, votes] = await Promise.all([
      listAllShorts(),
      getControls(),
      shortsStats(days),
      getAllLearningResources(),
      questViews(since),
      supabase.from("lecture_votes").select("lecture_id").like("lecture_id", "bonus-%").limit(20000),
    ]);
    const ctl = new Map(controls.map((c) => [c.key, c]));
    const st = new Map(stats.shorts.map((s) => [s.id, s]));
    const label = new Map<string, string>(SHORT_CATEGORIES.map((c) => [c.id, c.label]));
    const qVotes = new Map<string, number>();
    for (const r of (votes.data || []) as { lecture_id: string }[]) qVotes.set(r.lecture_id, (qVotes.get(r.lecture_id) || 0) + 1);
    const quests = resources.filter((r) => r.course === COURSE_ID && r.type === "bonus");
    return NextResponse.json(
      {
        days,
        shorts: shorts.map((s) => {
          const c = ctl.get(shortKey(s.id));
          const n = st.get(s.id);
          const questHidden = s.lecture.startsWith("bonus-") && !isLive(ctl.get(questKey(s.lecture)));
          return {
            id: s.id,
            title: s.title,
            group: `${label.get(s.category) || s.category} · ${s.label}`,
            category: s.category,
            lecture: s.lecture,
            poster: s.poster,
            seconds: s.seconds,
            status: state(c),
            publishAt: c?.publish_at ?? null,
            pin: c?.pin ?? null,
            questHidden,
            viewers: n?.viewers ?? 0,
            plays: n?.plays ?? 0,
            avgSec: n?.views ? Math.round(n.sec / n.views) : null,
            finish: n?.views ? Math.round((n.done / n.views) * 100) : null,
            votes: n?.votes ?? 0,
            saves: n?.saves ?? 0,
            comments: n?.comments ?? 0,
          };
        }),
        quests: quests.map((q) => {
          const c = ctl.get(questKey(q.slug));
          const v = qv.get(q.slug);
          return {
            slug: q.slug,
            title: q.title,
            href: `/learn/${COURSE_ID}/${q.week}/${q.slug}`,
            status: state(c),
            publishAt: c?.publish_at ?? null,
            views: v?.views ?? 0,
            viewers: v?.viewers ?? 0,
            votes: qVotes.get(q.slug) || 0,
            shorts: shorts.filter((s) => s.lecture === q.slug).length,
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

type Action = { keys?: unknown; action?: unknown; at?: unknown; pin?: unknown };
const KEY_RE = /^(short|quest):[A-Za-z0-9-]{3,200}$/;

/**
 * POST { keys: ["short:<id>" | "quest:<slug>"], action: "publish" | "hide" | "schedule" | "pin" | "unpin", at?, pin? }
 * Applies to every key, then refreshes what the site caches so it shows within a minute.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const b = (await request.json().catch(() => ({}))) as Action;
  const keys = Array.isArray(b.keys) ? b.keys.filter((k): k is string => typeof k === "string" && KEY_RE.test(k)).slice(0, 500) : [];
  const action = String(b.action || "");
  if (!keys.length) return NextResponse.json({ error: "Pick at least one item." }, { status: 400 });
  if (!["publish", "hide", "schedule", "pin", "unpin"].includes(action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  let at: string | null = null;
  if (action === "schedule") {
    const t = Date.parse(String(b.at || ""));
    if (!Number.isFinite(t) || t < Date.now() + 60_000) return NextResponse.json({ error: "Pick a time at least a minute from now." }, { status: 400 });
    at = new Date(t).toISOString();
  }
  if ((action === "pin" || action === "unpin") && keys.some((k) => !k.startsWith("short:"))) return NextResponse.json({ error: "Only shorts can be pinned." }, { status: 400 });

  const existing = new Map((await getControls()).map((c) => [c.key, c]));
  let nextPin = Math.max(0, ...[...existing.values()].map((c) => c.pin || 0));
  const rows = keys.map((key) => {
    const prev = existing.get(key);
    const base = { key, kind: key.startsWith("short:") ? "short" : "quest", status: prev?.status ?? "live", publish_at: prev?.publish_at ?? null, pin: prev?.pin ?? null, updated_by: admin.email, updated_at: new Date().toISOString() };
    if (action === "publish") return { ...base, status: "live", publish_at: null };
    if (action === "hide") return { ...base, status: "hidden", publish_at: null };
    if (action === "schedule") return { ...base, status: "scheduled", publish_at: at };
    if (action === "pin") return { ...base, pin: prev?.pin ?? Math.min(50, ++nextPin) };
    return { ...base, pin: null };
  });
  const { error } = await supabase.from("content_controls").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // what the site caches: the controls, the course map (quests), the feed and the affected pages
  revalidateTag(CONTROLS_TAG);
  if (keys.some((k) => k.startsWith("quest:"))) revalidateTag(COURSE_MAP_TAG);
  revalidatePath("/learn/shorts");
  for (const k of keys) {
    const [kind, id] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)];
    if (kind === "short") revalidatePath(`/learn/shorts/${id}`);
    else {
      revalidatePath(`/learn/${COURSE_ID}/bonus-problems/${id}`);
      revalidatePath(`/learn/lectures/${id}`);
    }
  }
  revalidatePath(`/learn/${COURSE_ID}`);
  revalidatePath("/sitemap.xml");
  return NextResponse.json({ ok: true, updated: rows.length });
}
