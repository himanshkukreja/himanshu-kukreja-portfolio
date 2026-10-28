import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { isPlatform, type DistShort, type Platform, type Post } from "@/lib/learn/shorts/distribution";
import { listShorts } from "@/lib/learn/shorts/load";
import { shortLines, shortPacks } from "@/lib/learn/shorts/pack";
import { shortsStats, shortScore } from "@/lib/learn/shorts/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ID_RE = /^shorts--[A-Za-z0-9-]{1,160}$/;
const TABLE = "short_posts";
const SETUP = "The posting tracker isn't set up yet: apply supabase/migrations/20261029_short_posts.sql.";

type PostRow = { short_id: string; platform: string; status: "scheduled" | "posted"; scheduled_at: string | null; posted_at: string | null; url: string | null };

/** Every tracked post, or null when the table isn't there yet (the page then works read-only). */
async function readPosts(): Promise<{ rows: PostRow[]; error: string | null }> {
  const { data, error } = await supabase.from(TABLE).select("short_id, platform, status, scheduled_at, posted_at, url").limit(10_000);
  if (error) return { rows: [], error: /does not exist|could not find the table|schema cache/i.test(error.message) ? SETUP : error.message };
  return { rows: (data || []) as PostRow[], error: null };
}

/**
 * GET ?days=90 → every live short (hidden or scheduled ones left out) with what posting it needs and its posts.
 * GET ?id=<short id> → that short's transcript, one paragraph per scene.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const q = new URL(request.url).searchParams;
  const id = q.get("id");
  try {
    if (id) {
      if (!ID_RE.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
      const lines = await shortLines(id);
      if (!lines) return NextResponse.json({ error: "No such short." }, { status: 404 });
      const paras: string[] = [];
      for (const l of lines) {
        if (paras.length <= l.scene) paras.push(l.say);
        else paras[l.scene] += ` ${l.say}`;
      }
      return NextResponse.json({ id, transcript: paras.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
    }

    const days = Math.min(180, Math.max(1, Number(q.get("days")) || 90));
    const [live, packs, stats, posts] = await Promise.all([listShorts(), shortPacks(), shortsStats(days), readPosts()]);
    const pack = new Map(packs.map((p) => [p.id, p]));
    const st = new Map(stats.shorts.map((s) => [s.id, s]));
    const byShort = new Map<string, Partial<Record<Platform, Post>>>();
    for (const r of posts.rows) {
      if (!isPlatform(r.platform)) continue;
      const m = byShort.get(r.short_id) || {};
      m[r.platform] = { status: r.status, scheduledAt: r.scheduled_at, postedAt: r.posted_at, url: r.url };
      byShort.set(r.short_id, m);
    }
    const shorts: DistShort[] = live.map((s) => {
      const p = pack.get(s.id);
      const n = st.get(s.id);
      return {
        id: s.id,
        title: s.title,
        label: s.label,
        category: s.category,
        topics: s.topics,
        lecture: s.lecture,
        article: s.article,
        full: s.full,
        poster: s.poster,
        video: p?.video || s.src,
        duration: p?.duration ?? s.seconds,
        summary: p?.summary ?? "",
        hook: p?.hook ?? s.title,
        // a short nobody has watched yet scores like one watched by nobody: (0 + 1) / (0 + 4)
        score: Math.round((n ? shortScore(n) : 0.25) * 1000) / 1000,
        viewers: n?.viewers ?? 0,
        posts: byShort.get(s.id) || {},
      };
    });
    return NextResponse.json({ days, tracker: !posts.error, trackerError: posts.error, shorts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

type Body = { ids?: unknown; platform?: unknown; status?: unknown; at?: unknown; url?: unknown };

/**
 * POST { ids: [short id], platform: "youtube" | "instagram", status: "none" | "scheduled" | "posted", at?, url? }
 * none clears the row; scheduled needs `at`; posted takes `at` (default now) and an optional https `url`.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const b = (await request.json().catch(() => ({}))) as Body;
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x): x is string => typeof x === "string" && ID_RE.test(x)))].slice(0, 500) : [];
  const status = String(b.status || "");
  if (!ids.length) return NextResponse.json({ error: "Pick at least one short." }, { status: 400 });
  if (!isPlatform(b.platform)) return NextResponse.json({ error: "Unknown platform." }, { status: 400 });
  if (!["none", "scheduled", "posted"].includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  const platform = b.platform;

  if (status === "none") {
    const { error } = await supabase.from(TABLE).delete().eq("platform", platform).in("short_id", ids);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  const t = b.at == null || b.at === "" ? (status === "posted" ? Date.now() : NaN) : Date.parse(String(b.at));
  if (!Number.isFinite(t)) return NextResponse.json({ error: status === "scheduled" ? "Pick the date it's scheduled for." : "Bad date." }, { status: 400 });
  const at = new Date(t).toISOString();
  let url: string | null = null;
  if (status === "posted" && b.url != null && String(b.url).trim()) {
    url = String(b.url).trim();
    if (!/^https:\/\/\S+$/.test(url) || url.length > 500) return NextResponse.json({ error: "The post link must be an https:// URL." }, { status: 400 });
    if (ids.length > 1) return NextResponse.json({ error: "A post link belongs to one short." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const rows = ids.map((short_id) => ({
    short_id,
    platform,
    status,
    scheduled_at: status === "scheduled" ? at : null,
    posted_at: status === "posted" ? at : null,
    url,
    updated_by: admin.email,
    updated_at: now,
  }));
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "short_id,platform" });
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true, updated: rows.length });
}

const fail = (msg: string) =>
  /does not exist|could not find the table|schema cache/i.test(msg) ? NextResponse.json({ error: SETUP }, { status: 503 }) : NextResponse.json({ error: msg }, { status: 500 });
