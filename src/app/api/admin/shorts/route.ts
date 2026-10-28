import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { shortsStats, shortScore } from "@/lib/learn/shorts/stats";
import { listShorts } from "@/lib/learn/shorts/load";
import { SHORT_CATEGORIES } from "@/lib/learn/shorts/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/admin/shorts?days=30 → per-short engagement (see src/lib/learn/shorts/stats.ts). */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const days = Math.min(180, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  try {
    const [st, list] = await Promise.all([shortsStats(days), listShorts().catch(() => [])]);
    const meta = new Map(list.map((s) => [s.id, s]));
    const label = new Map<string, string>(SHORT_CATEGORIES.map((c) => [c.id, c.label]));
    return NextResponse.json({
      ...st,
      live: list.length,
      shorts: st.shorts
        .map((s) => {
          const m = meta.get(s.id);
          return { ...s, title: m?.title || s.id, group: m ? `${label.get(m.category) || m.category} · ${m.label}` : "", href: `/learn/shorts?v=${encodeURIComponent(s.id)}`, length: m?.seconds ?? null, score: Math.round(shortScore(s) * 100) / 100 };
        })
        .sort((a, b) => b.viewers - a.viewers),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
