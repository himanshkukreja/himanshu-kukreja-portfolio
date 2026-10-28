import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { listShorts } from "@/lib/learn/shorts/load";
import { shortLines, shortPacks } from "@/lib/learn/shorts/pack";
import { curve, HOOK_SEC, lossByStep, MIN_VIEWS, shortViews, summarize } from "@/lib/learn/shorts/retention";
import { SHORT_CATEGORIES } from "@/lib/learn/shorts/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ID_RE = /^shorts--[A-Za-z0-9-]{1,160}$/;

/**
 * GET ?days=30 → drop-off per live short that has views: hook hold (past 3 s), finished, median point reached and
 * the step that loses the most viewers after the hook, plus each short's first line for the hook leaderboard.
 * GET ?days=30&id=<short id> → that short's retention curve (per second) and every narrated step with its time
 * and the viewers lost while it played. See src/lib/learn/shorts/retention.ts.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const q = new URL(request.url).searchParams;
  const days = Math.min(180, Math.max(1, Number(q.get("days")) || 30));
  const id = q.get("id");
  try {
    const [views, packs, live] = await Promise.all([shortViews(days), shortPacks(), listShorts().catch(() => [])]);
    const pack = new Map(packs.map((p) => [p.id, p]));
    const meta = new Map(live.map((s) => [s.id, s]));
    const label = new Map<string, string>(SHORT_CATEGORIES.map((c) => [c.id, c.label]));

    if (id) {
      if (!ID_RE.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
      const p = pack.get(id);
      const m = meta.get(id);
      const pcts = views[id] || [];
      const sum = summarize(id, pcts, p, m?.seconds ?? 60);
      const lines = (await shortLines(id)) || [];
      const loss = p && p.starts.length === lines.length ? lossByStep(pcts, p, sum.duration) : null;
      return NextResponse.json({
        days,
        hookSec: HOOK_SEC,
        minViews: MIN_VIEWS,
        title: m?.title ?? id,
        group: m ? `${label.get(m.category) || m.category} · ${m.label}` : "",
        stale: p?.stale ?? false,
        ...sum,
        curve: curve(pcts, sum.duration).map((x) => Math.round(x * 1000) / 10),
        lines: lines.map((l, i) => ({
          ...l,
          from: p && loss ? p.starts[i] : null,
          to: p && loss ? (i + 1 < p.starts.length ? p.starts[i + 1] : sum.duration) : null,
          lost: loss ? loss[i] : null,
        })),
      });
    }

    const shorts = live
      .filter((s) => views[s.id]?.length)
      .map((s) => {
        const p = pack.get(s.id);
        return { ...summarize(s.id, views[s.id], p, s.seconds), title: s.title, group: `${label.get(s.category) || s.category} · ${s.label}`, poster: s.poster, hook: p?.hook ?? s.title };
      });
    return NextResponse.json({ days, hookSec: HOOK_SEC, minViews: MIN_VIEWS, live: live.length, shorts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
