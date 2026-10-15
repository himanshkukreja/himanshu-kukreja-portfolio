"use client";

/**
 * Arena leaderboard: weekly leagues (L1 Intern → L6 Principal, promotion zone) and all-time.
 * Data: GET /api/learn/leaderboard (scored server-side). Your row is highlighted and pinned;
 * guests get a "sign in to rank" card with the score this browser has earned.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useGame } from "@/game/GameProvider";
import { LEAGUE_RULES, LEAGUES, POINTS, POINTS_TABLE, type BoardResponse, type BoardRow, type Breakdown } from "@/lib/learn/arena/shared";
import { useArenaLocal, useBoard } from "./store";
import { BackLink, BTN, Kicker, LABEL, PageTitle, SectionTitle, TierBadge } from "./ui";

function shortDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

const BREAKDOWN_LABEL: Record<keyof Breakdown, string> = {
  lesson: "lessons",
  stage: "stages",
  quiz: "quick checks",
  daily: "daily",
  trial: "trials",
  review: "review",
  active: "active days",
};

/** Award the "Top 10" quest when the server says so. */
function useTop10(data: BoardResponse | null) {
  const { award, done, hydrated } = useGame();
  useEffect(() => {
    if (!hydrated || done["arena:top10"] || !data?.me) return;
    if (data.period === "week" && data.me.globalRank && data.me.globalRank <= 10 && data.me.points > 0) award("arena:top10", "Top 10 this week");
  }, [data, award, done, hydrated]);
}

function Row({ r, promoteLine }: { r: BoardRow; promoteLine?: boolean }) {
  return (
    <li
      className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-3 py-2.5 sm:grid-cols-[3rem_1fr_auto_auto] sm:px-4 ${
        r.me ? "bg-signal/10 shadow-[inset_3px_0_0_var(--c-signal)]" : ""
      } ${promoteLine ? "border-b border-dashed border-signal" : "border-b border-line"}`}
      aria-current={r.me ? "true" : undefined}
    >
      <span className={`font-mono text-sm tabular-nums ${r.rank <= 3 ? "font-semibold text-signal-text" : "text-fg-3"}`}>#{r.rank}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`truncate text-[15px] ${r.me ? "font-semibold text-fg" : "text-fg"}`}>{r.name}</span>
        {r.me && <span className="shrink-0 bg-signal px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-on-signal">you</span>}
        {r.zone === "promote" && (
          <span className="shrink-0 font-mono text-[11px] text-signal-text" title="Promotion zone">
            ▲
          </span>
        )}
      </span>
      <span className="hidden font-mono text-xs text-fg-3 sm:inline">{r.streak ? `${r.streak}d streak` : ""}</span>
      <span className="text-right font-display text-lg font-extrabold tabular-nums text-fg">{r.points}</span>
    </li>
  );
}

export function BoardList({ rows, promote, limit, empty }: { rows: BoardRow[]; promote: number; limit?: number; empty: string }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const me = rows.find((r) => r.me);
  const meHidden = me && !shown.includes(me);
  if (!rows.length) return <p className="m-0 border border-dashed border-line-strong p-5 text-[15px] text-fg-3">{empty}</p>;
  return (
    <div className="border border-line bg-surface">
      <ol className="m-0 list-none p-0" aria-label="Rankings">
        {shown.map((r, i) => (
          <Row key={`${r.rank}-${r.name}`} r={r} promoteLine={promote > 0 && i === promote - 1 && i < shown.length - 1} />
        ))}
      </ol>
      {meHidden && me && (
        <ol className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] m-0 list-none border-t border-signal bg-bg p-0 lg:bottom-0" aria-label="Your rank">
          <Row r={me} />
        </ol>
      )}
    </div>
  );
}

export function ScoringTable() {
  return (
    <section aria-labelledby="pts-h" className="flex flex-col gap-4">
      <SectionTitle id="pts-h">How scoring works</SectionTitle>
      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th scope="col" className={`${LABEL} px-3 py-2 font-normal`}>
                Action
              </th>
              <th scope="col" className={`${LABEL} px-3 py-2 font-normal`}>
                Points
              </th>
              <th scope="col" className={`${LABEL} px-3 py-2 font-normal`}>
                Rule
              </th>
            </tr>
          </thead>
          <tbody>
            {POINTS_TABLE.map((p) => (
              <tr key={p.what} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-2.5 font-semibold text-fg">
                  {p.what}
                </th>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-signal-text">{p.pts}</td>
                <td className="px-3 py-2.5 text-fg-2">{p.rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 grid list-none gap-1.5 p-0 text-[14px] leading-relaxed text-fg-2">
        <li>■ Only signed-in activity counts, and only what the server can check: answers are re-checked against the course source, duplicates are dropped, and a day caps at {POINTS.dayCap} points.</li>
        <li>
          ■ Leagues follow the levels: L1 Intern → L6 Principal. Everyone starts in Intern. Each Monday 00:00 IST the top {Math.round(LEAGUE_RULES.promoteShare * 100)}% of a league (at least one player, with {LEAGUE_RULES.promoteMin}+ points) moves up; a week with zero points drops you one league.
        </li>
        <li>■ XP is separate: it lives on your profile and levels you up. Points rank you against everyone else.</li>
      </ul>
    </section>
  );
}

export function GuestRankCard({ compact = false }: { compact?: boolean }) {
  const { openAuthModal } = useAuthModal();
  const local = useArenaLocal();
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 border border-dashed border-signal bg-surface ${compact ? "p-4" : "p-5 sm:p-6"}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className={LABEL}>you · guest</span>
        <span className="font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] text-fg">
          {local ? local.local : "–"} <span className="font-mono text-sm font-normal tracking-normal text-fg-3">local pts</span>
        </span>
        <span className="text-[14px] text-fg-2">Saved in this browser only. Sign in to rank on the board and keep your streak everywhere.</span>
      </div>
      <button type="button" onClick={() => openAuthModal()} className={BTN}>
        Sign in to rank
      </button>
    </div>
  );
}

export default function Leaderboard() {
  const [period, setPeriod] = useState<"week" | "all">("week");
  const { data, error, loading, signedIn } = useBoard(period);
  useTop10(data);
  const [tierPick, setTierPick] = useState<number | null>(null);
  const tier = tierPick ?? data?.me?.tier ?? 0;

  const rows = useMemo(() => (data ? (period === "week" ? data.rows.filter((r) => r.tier === tier) : data.rows) : []), [data, period, tier]);
  const league = data?.leagues.find((l) => l.tier === tier);

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-10 px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
      <section aria-labelledby="lb-h" className="flex flex-col gap-4">
        <BackLink />
        <Kicker>❯ arena · {data ? `week of ${shortDay(data.weekStart)} – ${shortDay(data.weekEnd)} · resets monday 00:00 ist` : "leaderboard"}</Kicker>
        <PageTitle id="lb-h">Leaderboard</PageTitle>
      </section>

      <div role="tablist" aria-label="Period" className="flex gap-1.5">
        {(["week", "all"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={`min-h-11 border px-4 font-mono text-[13px] ${period === p ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg hover:bg-surface-2"}`}
          >
            {p === "week" ? "This week · leagues" : "All time"}
          </button>
        ))}
      </div>

      {data?.me && (
        <section aria-label="Your standing" className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
          <div className="flex flex-col gap-1 bg-bg px-4 py-3">
            <span className={LABEL}>league</span>
            <TierBadge tier={data.me.tier} size="md" />
          </div>
          <div className="flex flex-col gap-1 bg-bg px-4 py-3">
            <span className={LABEL}>{period === "week" ? "rank in league" : "rank"}</span>
            <span className="font-display text-[28px] font-extrabold leading-none text-fg">{data.me.rank ? `#${data.me.rank}` : "–"}</span>
          </div>
          <div className="flex flex-col gap-1 bg-bg px-4 py-3">
            <span className={LABEL}>{period === "week" ? "points this week" : "points"}</span>
            <span className="font-display text-[28px] font-extrabold leading-none text-signal-text">{data.me.points}</span>
          </div>
          <div className="flex flex-col gap-1 bg-bg px-4 py-3">
            <span className={LABEL}>daily streak</span>
            <span className="font-display text-[28px] font-extrabold leading-none text-fg">{data.me.dailyStreak}d</span>
          </div>
          {Object.keys(data.me.breakdown).length > 0 && (
            <p className="col-span-2 m-0 bg-bg px-4 py-2.5 font-mono text-xs text-fg-3 sm:col-span-4">
              {Object.entries(data.me.breakdown)
                .map(([k, v]) => `${BREAKDOWN_LABEL[k as keyof Breakdown]} ${v}`)
                .join(" · ")}
            </p>
          )}
        </section>
      )}
      {!loading && !signedIn && <GuestRankCard />}

      <section aria-labelledby="board-h" className="flex flex-col gap-4">
        {period === "week" && data && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="League">
            {LEAGUES.map((l) => {
              const info = data.leagues.find((x) => x.tier === l.tier);
              const on = l.tier === tier;
              return (
                <button
                  key={l.tier}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTierPick(l.tier)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 border px-3 font-mono text-xs ${on ? "border-signal bg-surface-2 text-fg" : "border-line text-fg-3 hover:text-fg"}`}
                >
                  <span className="font-semibold">{l.code}</span> {l.name}
                  <span className="text-fg-4">{info?.players || 0}</span>
                </button>
              );
            })}
          </div>
        )}
        <h2 id="board-h" className="sr-only">
          {period === "week" ? `${LEAGUES[tier].name} league this week` : "All time"}
        </h2>
        {period === "week" && league && (
          <p className="m-0 font-mono text-xs text-fg-3">
            {league.code} {league.name} league · {league.players} active · {league.promote ? `top ${league.promote} promote ▲` : `promotion needs ${LEAGUE_RULES.promoteMin}+ pts`}
          </p>
        )}
        {loading ? (
          <div className="h-[260px] animate-pulse border border-line bg-surface" aria-label="Loading" />
        ) : error ? (
          <p className="m-0 border border-line bg-surface p-5 text-fg-2">The leaderboard didn&apos;t load. Try again in a minute.</p>
        ) : (
          <BoardList
            rows={rows}
            promote={period === "week" ? league?.promote || 0 : 0}
            empty={
              period === "week"
                ? "Nobody has scored in this league yet this week. A daily challenge takes two minutes."
                : "No scores yet. Finish a lesson or play the daily challenge to get on the board."
            }
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/learn/arena/daily" className={BTN}>
            Play today&apos;s challenge →
          </Link>
        </div>
      </section>

      <ScoringTable />
    </main>
  );
}
