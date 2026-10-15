import { NextResponse } from "next/server";
import { getLearner } from "@/app/api/learn/_lib/auth";
import { dailyStreak, getBoard, type Player } from "@/lib/learn/arena/leaderboard";
import { LEAGUE_RULES, LEAGUES, type BoardMe, type BoardResponse, type BoardRow } from "@/lib/learn/arena/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 300;

/**
 * GET /api/learn/leaderboard?period=week|all
 * Public; names are "First L." or engineer-xxxx, never emails or ids. With `Authorization: Bearer <jwt>`
 * the response also carries `me` (your rank, breakdown, daily streak) and your row is flagged — that
 * variant is private/no-store; the anonymous one is cached for ~60 s.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "all" ? "all" : "week";
  const viewer = request.headers.get("authorization") ? await getLearner(request) : null;

  let board;
  try {
    board = await getBoard();
  } catch (e) {
    console.error("[leaderboard]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Leaderboard unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const all = [...board.players.values()];
  const pts = (p: Player) => (period === "week" ? p.week : p.all);
  const byPoints = (a: Player, b: Player) => pts(b) - pts(a) || a.name.localeCompare(b.name);

  // weekly: rank inside your league; promotion zone = top share of the league's active players
  const leagues = LEAGUES.map((l) => {
    const members = all.filter((p) => p.tier === l.tier && p.week > 0).sort((a, b) => b.week - a.week);
    const promote = l.tier < LEAGUES.length - 1 ? members.slice(0, Math.max(1, Math.ceil(members.length * LEAGUE_RULES.promoteShare))).filter((p) => p.week >= LEAGUE_RULES.promoteMin).length : 0;
    return { ...l, players: members.length, promote, members };
  });

  const me = viewer ? board.players.get(viewer.id) || null : null;
  const rows: BoardRow[] = [];
  if (period === "week") {
    for (const l of leagues) {
      const list = l.members.slice();
      if (me && me.tier === l.tier && !list.includes(me)) list.push(me);
      list.forEach((p, i) => {
        rows.push({
          rank: p.week > 0 ? i + 1 : list.length,
          name: p.name,
          points: p.week,
          tier: l.tier,
          zone: p.week > 0 && i < l.promote ? "promote" : null,
          streak: dailyStreak(p.dailyDays, board.today) || undefined,
          ...(p === me ? { me: true } : {}),
        });
      });
    }
  } else {
    const list = all.filter((p) => p.all > 0).sort(byPoints);
    list.forEach((p, i) => {
      if (i < MAX_ROWS || p === me) rows.push({ rank: i + 1, name: p.name, points: p.all, tier: p.tier, zone: null, streak: dailyStreak(p.dailyDays, board.today) || undefined, ...(p === me ? { me: true } : {}) });
    });
  }

  let meOut: BoardMe | null = null;
  if (viewer) {
    const weekly = all.filter((p) => p.week > 0).sort((a, b) => b.week - a.week);
    const league = leagues[me?.tier ?? 0].members;
    meOut = {
      name: me?.name || "you",
      tier: me?.tier ?? 0,
      points: me ? pts(me) : 0,
      rank: me ? (period === "week" ? (me.week > 0 ? league.indexOf(me) + 1 : null) : all.filter((p) => p.all > 0).sort(byPoints).indexOf(me) + 1 || null) : null,
      globalRank: me && me.week > 0 ? weekly.indexOf(me) + 1 : null,
      allTime: me?.all || 0,
      breakdown: me ? (period === "week" ? me.breakdownWeek : me.breakdownAll) : {},
      dailyStreak: me ? dailyStreak(me.dailyDays, board.today) : 0,
      dailyToday: !!me?.dailyDays.has(board.today),
    };
  }

  const body: BoardResponse = {
    period,
    weekStart: board.weekStart,
    weekEnd: board.weekEnd,
    generatedAt: new Date(board.at).toISOString(),
    players: period === "week" ? all.filter((p) => p.week > 0).length : all.filter((p) => p.all > 0).length,
    leagues: leagues.map((l) => ({ tier: l.tier, code: l.code, name: l.name, players: l.players, promote: l.promote })),
    rows: period === "week" ? rows.slice(0, MAX_ROWS * 2) : rows,
    me: meOut,
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": viewer ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
