import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { supabase } from "@/lib/supabase";
import { getLearner } from "@/app/api/learn/_lib/auth";
import { displayName } from "@/lib/learn/arena/leaderboard";
import { istDate, weekStartOf } from "@/lib/learn/arena/shared";
import { BELTS, beltFor, DSA_BITS_FLAG, type BeltId, type DsaBitsFlag } from "@/lib/dsa/rewards";
import type { DsaBoardResponse, DsaBoardRow } from "@/lib/dsa/leaderboard";

/**
 * GET /api/dsa/leaderboard?period=week|all: DSA Mastery's own board (Bits; SD Mastery's XP and Arena board are
 * separate). Read from the existing store: each signed-in learner's `dsa_bits` summary in user_profiles.game_flags,
 * which the browser keeps in step with their awards (DsaRewardsHost). No new table.
 *
 * Weekly: Bits earned since Monday 00:00 IST (only summaries written this week count). All time: total Bits.
 * Public and cached ~60 s; with `Authorization: Bearer <jwt>` the viewer's own row is flagged (private, no-store).
 * 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 100;
const PAGE = 1000;
const MAX_SCAN = 20_000;

type Row = { id: string; full_name: string | null; profile_visibility: string | null; bits: Partial<DsaBitsFlag> | null };

const BELT_IDS = new Set<string>(BELTS.map((b) => b.id));

export async function GET(request: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "all" ? "all" : "week";
  const viewer = request.headers.get("authorization") ? await getLearner(request) : null;
  const weekStart = weekStartOf(istDate());

  const rows: Row[] = [];
  try {
    for (let from = 0; from < MAX_SCAN; from += PAGE) {
      const { data, error } = await supabase
        .from("user_profiles")
        .select(`id, full_name, profile_visibility, bits:game_flags->${DSA_BITS_FLAG}`)
        .not(`game_flags->${DSA_BITS_FLAG}`, "is", null)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...((data || []) as unknown as Row[]));
      if (!data || data.length < PAGE) break;
    }
  } catch (e) {
    console.error("[dsa-leaderboard]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The leaderboard is unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const scored = rows
    .map((r) => {
      const f = r.bits || {};
      const total = Math.max(0, Math.floor(Number(f.b) || 0));
      const week = f.wk === weekStart ? Math.max(0, Math.floor(Number(f.w) || 0)) : 0;
      const belt = (typeof f.belt === "string" && BELT_IDS.has(f.belt) ? f.belt : beltFor(total).belt.id) as BeltId;
      return { id: r.id, name: displayName(r.id, r.full_name, r.profile_visibility), bits: period === "week" ? week : total, belt };
    })
    .filter((r) => r.bits > 0)
    .sort((a, b) => b.bits - a.bits || a.name.localeCompare(b.name));

  // ties share a rank (1, 2, 2, 4)
  const ranked: (DsaBoardRow & { id: string })[] = [];
  scored.forEach((r, i) => {
    const rank = i > 0 && scored[i - 1].bits === r.bits ? ranked[i - 1].rank : i + 1;
    ranked.push({ rank, name: r.name, bits: r.bits, belt: r.belt, id: r.id });
  });
  const mine = viewer ? ranked.find((r) => r.id === viewer.id) || null : null;
  const out: DsaBoardRow[] = ranked.slice(0, MAX_ROWS).map(({ id, ...r }) => (viewer && id === viewer.id ? { ...r, me: true as const } : r));
  if (mine && mine.rank > MAX_ROWS) out.push({ rank: mine.rank, name: mine.name, bits: mine.bits, belt: mine.belt, me: true });

  const body: DsaBoardResponse = {
    period,
    weekStart,
    players: ranked.length,
    rows: out,
    me: viewer ? { rank: mine?.rank ?? null, bits: mine?.bits ?? 0 } : null,
    generatedAt: new Date().toISOString(),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": viewer ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=120", "x-robots-tag": "noindex" } });
}
