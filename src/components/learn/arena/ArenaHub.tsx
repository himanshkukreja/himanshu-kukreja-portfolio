"use client";

/**
 * /learn/arena — the fun centre of the course: today's challenge, your league, the review queue and
 * the practice games (Arena games + the Engineering Playground boards, each tied to the lessons that
 * teach it).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { levelProgress, QUEST_BY_ID } from "@/game/catalog";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { ARENA_COURSE, lessonHref, PRACTICE_GAMES, type PracticeGame } from "@/lib/learn/arena/games";
import { DAILY_N, DAILY_SECONDS, dailyNumber } from "@/lib/learn/arena/shared";
import { dailyStreakLocal, useArenaLocal, useBoard, useToday } from "./store";
import { BoardList, GuestRankCard } from "./Leaderboard";
import { BTN, BTN_GHOST, fmtMs, Kicker, LABEL, msToIstMidnight, PageTitle, ResultSquares, SectionTitle, TierBadge } from "./ui";

function Countdown() {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(msToIstMidnight());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  if (ms === null) return <span className="font-mono text-xs text-fg-3">resets 00:00 IST</span>;
  return (
    <span className="font-mono text-xs text-fg-3">
      next in {Math.floor(ms / 3_600_000)}h {String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0")}m
    </span>
  );
}

function GameCard({ g, best, cleared }: { g: PracticeGame; best?: number; cleared: boolean }) {
  return (
    <li className={`flex flex-col gap-3 border p-4 sm:p-[18px] ${cleared ? "border-line-strong bg-surface-2" : "border-line bg-surface"}`}>
      <div className="flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
        <span>{g.kind === "arena" ? `arena · ${g.seconds}s` : "playground"}</span>
        <span className={cleared ? "text-fg" : "text-signal-text"}>{cleared ? "cleared ✓" : `+${QUEST_BY_ID[g.quest]?.xp ?? 40} xp`}</span>
      </div>
      <Link href={g.href} className="group flex flex-col gap-1.5">
        <span className="font-display text-[22px] font-bold leading-[1.05] tracking-[-0.02em] text-fg group-hover:text-signal-text">{g.name}</span>
        <span className="text-[14px] leading-snug text-fg-2">{g.hook}</span>
      </Link>
      <div className="mt-auto flex flex-col gap-1.5 border-t border-line pt-3">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-4">taught in</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {g.lessons.slice(0, 2).map((l) => (
            <Link key={l.slug} href={lessonHref(ARENA_COURSE, l)} className="font-mono text-xs text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
              {l.label}
            </Link>
          ))}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Link href={g.href} className={`${BTN_GHOST} min-h-10`}>
          play →
        </Link>
        {best !== undefined && <span className="font-mono text-xs text-fg-3">best {best}</span>}
      </div>
    </li>
  );
}

export default function ArenaHub({ bank }: { bank: { questions: number; quizzes: number; trials: number } | null }) {
  const today = useToday();
  const local = useArenaLocal();
  const { xp, done, hydrated } = useGame();
  const { dueCount, ready: dueReady } = useReviewCards();
  const board = useBoard("week");
  const me = board.data?.me || null;

  const played = today && local ? local.daily[today] : undefined;
  const streak = today && local ? dailyStreakLocal(local.daily, today) : null;
  const streakNow = Math.max(streak?.current || 0, me?.dailyStreak || 0);
  const lp = levelProgress(xp);
  const arenaGames = PRACTICE_GAMES.filter((g) => g.kind === "arena");
  const playGames = PRACTICE_GAMES.filter((g) => g.kind === "play");
  const tier = me?.tier ?? 0;
  const leagueRows = board.data ? board.data.rows.filter((r) => r.tier === tier) : [];
  const league = board.data?.leagues.find((l) => l.tier === tier);

  const stats = (
    <div className="grid h-full grid-cols-2 gap-px border border-line bg-line">
      <div className="flex flex-col gap-1 bg-bg px-4 py-3">
        <span className={LABEL}>level</span>
        <span className="font-display text-[26px] font-extrabold leading-none tracking-[-0.03em] text-fg">
          {hydrated ? `${lp.level.code} · ${lp.level.name}` : "–"}
        </span>
        <span className="font-mono text-xs text-fg-3">{hydrated ? `${xp} xp${lp.next ? ` · ${lp.next.min - xp} to ${lp.next.code}` : ""}` : ""}</span>
      </div>
      <div className="flex flex-col gap-1 bg-bg px-4 py-3">
        <span className={LABEL}>daily streak</span>
        <span className="font-display text-[26px] font-extrabold leading-none tracking-[-0.03em] text-signal-text">{streak ? `${streakNow}d` : "–"}</span>
        <span className="font-mono text-xs text-fg-3">best {Math.max(streak?.best || 0, streakNow)}d</span>
      </div>
      <div className="flex flex-col gap-1 bg-bg px-4 py-3">
        <span className={LABEL}>this week</span>
        <span className="font-display text-[26px] font-extrabold leading-none tracking-[-0.03em] text-fg">{me ? me.points : local ? local.local : "–"}</span>
        <span className="font-mono text-xs text-fg-3">{me ? (me.rank ? `#${me.rank} in league` : "not ranked yet") : "local pts · guest"}</span>
      </div>
      <div className="flex flex-col gap-1 bg-bg px-4 py-3">
        <span className={LABEL}>league</span>
        <span className="pt-0.5">
          <TierBadge tier={tier} size="md" />
        </span>
        <span className="font-mono text-xs text-fg-3">{bank ? `${bank.questions.toLocaleString("en-IN")} questions in the bank` : ""}</span>
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-28 pt-6 sm:gap-12 sm:px-6 sm:pt-14">
      <section aria-labelledby="arena-h" className="flex flex-wrap items-end justify-between gap-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <Kicker>❯ arena · learn by playing</Kicker>
          <PageTitle id="arena-h">Arena</PageTitle>
          <p className="max-w-[640px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
            A daily challenge, weekly leagues and quick games, all built from the course. Every answer you get right here is something you&apos;ll get right in an interview.
          </p>
        </div>
        <div className="hidden w-full flex-[1_1_380px] self-stretch lg:block lg:max-w-[480px]">{stats}</div>
      </section>

      <section aria-label="Today" className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Daily */}
        <div className="flex flex-col gap-4 border border-signal bg-surface p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={LABEL}>daily challenge{today ? ` · #${dailyNumber(today)}` : ""}</span>
            <Countdown />
          </div>
          {played ? (
            <>
              <h2 className="font-display text-[clamp(34px,5vw,52px)] font-extrabold leading-none tracking-[-0.04em] text-fg">
                {played.correct}/{played.total} <span className="text-signal-text">· {played.score}</span>
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <ResultSquares results={played.results} />
                <span className="font-mono text-sm text-fg-2">{fmtMs(played.ms)}</span>
              </div>
              <p className="m-0 text-[15px] text-fg-2">Done for today. Replays are practice; come back after midnight IST to keep the streak.</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/learn/arena/daily" className={BTN_GHOST}>
                  Share · practice replay
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-[clamp(34px,5vw,52px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
                {DAILY_N} questions.
                <br />
                {DAILY_SECONDS} seconds each<span className="text-signal-text">.</span>
              </h2>
              <p className="m-0 max-w-[520px] text-[15px] text-fg-2">
                Same five for everyone today, drawn from every quick check and trial in the course. Faster right answers score more.
                {streakNow > 0 ? ` Your ${streakNow}-day streak is on the line.` : ""}
              </p>
              <div>
                <Link href="/learn/arena/daily" className={`${BTN} min-h-12 px-7 text-[15px]`}>
                  Play today&apos;s challenge →
                </Link>
              </div>
            </>
          )}
        </div>

        {/* League preview */}
        <div className="flex min-w-0 flex-col gap-3 border border-line bg-raised p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={LABEL}>{league ? `${league.code} ${league.name} league · this week` : "this week"}</span>
            <Link href="/learn/arena/leaderboard" className="font-mono text-xs text-signal-text underline underline-offset-4">
              full board →
            </Link>
          </div>
          {board.loading ? (
            // the first request after a quiet spell rebuilds the board and can take a few seconds
            <div role="status" className="flex h-[200px] flex-col justify-center gap-2 border border-line bg-surface px-4">
              <span className="h-3 w-2/3 animate-pulse bg-line" />
              <span className="h-3 w-1/2 animate-pulse bg-line" />
              <span className="mt-2 font-mono text-xs text-fg-3">Tallying this week&apos;s league…</span>
            </div>
          ) : board.error ? (
            <p className="m-0 text-[15px] text-fg-3">The board is resting. Try again in a minute.</p>
          ) : (
            <BoardList rows={leagueRows} promote={league?.promote || 0} limit={5} empty="Nobody has scored in this league yet this week. Be first: the daily challenge takes two minutes." />
          )}
          {!board.loading && !board.signedIn && <GuestRankCard compact />}
        </div>
      </section>

      {/* phones: your numbers after today's challenge */}
      <div className="-mt-6 lg:hidden">{stats}</div>

      {/* Review */}
      <Link
        href="/learn/review"
        className="flex flex-wrap items-center justify-between gap-4 border border-line bg-surface px-5 py-4 hover:border-fg-4 sm:px-6"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className={LABEL}>review queue · spaced repetition</span>
          <span className="text-[17px] font-semibold text-fg">
            {dueReady ? (dueCount ? `${dueCount} card${dueCount === 1 ? "" : "s"} due today` : "Nothing due. Your memory is in good shape.") : "Loading your deck…"}
          </span>
          <span className="text-[14px] text-fg-3">Missed trial questions, flagged cards and highlights come back right before you forget them.</span>
        </span>
        <span className="flex items-center gap-3">
          {dueReady && dueCount > 0 && <span className="grid h-9 min-w-9 place-items-center bg-signal px-2 font-mono text-sm font-semibold text-on-signal">{dueCount}</span>}
          <span className="font-mono text-sm text-signal-text">daily standup →</span>
        </span>
      </Link>

      {/* Games */}
      <section aria-labelledby="games-h" className="flex flex-col gap-4">
        <SectionTitle id="games-h" aside={<span className="text-[15px] text-fg-3">60–90 second rounds. Best scores stay in this browser.</span>}>
          Arena games
        </SectionTitle>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-2 p-0">
          {arenaGames.map((g) => (
            <GameCard key={g.id} g={g} best={local?.best[g.key]} cleared={hydrated && !!done[g.quest]} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="play-h" className="flex flex-col gap-4">
        <SectionTitle id="play-h" aside={<span className="text-[15px] text-fg-3">The Engineering Playground, mapped to the lessons.</span>}>
          Playground
        </SectionTitle>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-2 p-0">
          {playGames.map((g) => (
            <GameCard key={g.id} g={g} cleared={hydrated && !!done[g.quest]} />
          ))}
        </ul>
      </section>

      <Link href="/learn/arena/leaderboard#pts-h" className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong px-5 py-4 hover:border-fg-4">
        <span className="flex flex-col gap-1">
          <span className={LABEL}>how scoring works</span>
          <span className="text-[15px] text-fg-2">Lessons +50 · stages +5 · quick checks +3 · daily up to +60 · trials +40 · review +10 · active day +5</span>
        </span>
        <span className="font-mono text-sm text-signal-text">points table →</span>
      </Link>
      <Link href="/learn/guide#arena" className="-mt-6 inline-flex min-h-10 items-center self-start font-mono text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg sm:-mt-8">
        new to the Arena? XP vs points, leagues and streaks explained →
      </Link>
    </main>
  );
}
