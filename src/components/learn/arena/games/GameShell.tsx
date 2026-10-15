"use client";

/**
 * Shared frame for the Arena games: intro → timed round → results. Owns the clock, the score,
 * the best score (this browser), the one-time quest XP and the `play` event. Boards get
 * { running, addScore, end, secondsLeft } and render the actual game.
 */
import "../arena.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useGame } from "@/game/GameProvider";
import { QUEST_BY_ID } from "@/game/catalog";
import { track } from "@/lib/track";
import { ARENA_COURSE, lessonHref, type PracticeGame } from "@/lib/learn/arena/games";
import { recordBest, useArenaLocal } from "../store";
import { BackLink, BTN, BTN_GHOST, Kicker, LABEL, PageTitle } from "../ui";

export type BoardApi = { running: boolean; secondsLeft: number; addScore: (n: number, why?: string) => void; end: () => void; round: number };

type Phase = "intro" | "run" | "over";

export default function GameShell({
  game,
  seconds,
  rules,
  summary,
  Board,
  clearAt,
}: {
  game: PracticeGame;
  seconds: number;
  rules: ReactNode;
  /** Points one round needs before the quest XP is paid. Wrong answers cost points, so guessing stays near zero. */
  clearAt: number;
  /** results-screen extra (e.g. what you got wrong), given the round's stats */
  summary?: (score: number) => ReactNode;
  Board: ComponentType<{ api: BoardApi }>;
}) {
  const { award, done } = useGame();
  const local = useArenaLocal();
  const best = local?.best[game.key];
  const [phase, setPhase] = useState<Phase>("intro");
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(seconds * 1000);
  const [round, setRound] = useState(0);
  const [isBest, setIsBest] = useState(false);
  const [flash, setFlash] = useState<{ id: number; n: number; why?: string } | null>(null);
  const endAt = useRef(0);
  const scoreRef = useRef(0);
  const headRef = useRef<HTMLHeadingElement>(null);

  const phaseRef = useRef<Phase>("intro");
  const end = useCallback(() => {
    if (phaseRef.current !== "run") return;
    phaseRef.current = "over";
    const s = scoreRef.current;
    const better = recordBest(game.key, s);
    setIsBest(better && s > 0);
    if (s >= clearAt) award(game.quest, `${game.name} · cleared at ${s} pts`);
    track("play", { game: game.id, result: s >= clearAt ? "clear" : s > 0 ? "run" : "zero", score: s });
    setPhase("over");
    window.scrollTo({ top: 0 });
    window.setTimeout(() => headRef.current?.focus(), 0);
  }, [game, award, clearAt]);

  useEffect(() => {
    if (phase !== "run") return;
    const id = window.setInterval(() => {
      const l = Math.max(0, endAt.current - performance.now());
      setLeft(l);
      if (l <= 0) end();
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, end]);

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setIsBest(false);
    setFlash(null);
    endAt.current = performance.now() + seconds * 1000;
    setLeft(seconds * 1000);
    setRound((r) => r + 1);
    phaseRef.current = "run";
    setPhase("run");
    window.scrollTo({ top: 0 });
  };

  const addScore = useCallback((n: number, why?: string) => {
    scoreRef.current = Math.max(0, scoreRef.current + n);
    setScore(scoreRef.current);
    setFlash({ id: Date.now(), n, why });
  }, []);

  const secs = Math.ceil(left / 1000);
  const pct = (left / (seconds * 1000)) * 100;
  const cleared = !!done[game.quest];

  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
      {phase !== "run" && (
        <section aria-labelledby="g-h" className="flex flex-col gap-4">
          <BackLink />
          <Kicker>
            ❯ arena · {seconds}s round {cleared ? "· cleared" : `· +${QUEST_BY_ID[game.quest]?.xp ?? 40} xp at ${clearAt} pts`}
          </Kicker>
          <PageTitle id="g-h">{game.name}</PageTitle>
          <p className="max-w-[620px] text-[17px] leading-relaxed text-fg-2">{game.hook}</p>
        </section>
      )}

      {phase === "intro" && (
        <section className="flex flex-col gap-5 border border-signal bg-surface p-5 sm:p-7">
          <span className={LABEL}>how to play</span>
          <div className="text-[15px] leading-relaxed text-fg-2">{rules}</div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={start} className={`${BTN} min-h-12 px-7 text-[15px]`}>
              Start · {seconds}s →
            </button>
            <span className="font-mono text-xs text-fg-3">
              clear at {clearAt} · {best !== undefined ? `best ${best}` : "no best yet"}
            </span>
          </div>
          <TaughtIn game={game} />
        </section>
      )}

      {phase === "run" && (
        <>
          <div className="sticky top-[calc(var(--hk-header-h,61px)+env(safe-area-inset-top,0px))] z-20 -mx-4 flex flex-col gap-2 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[13px] text-fg-2">{game.name}</span>
              <span className="flex items-baseline gap-3">
                <span aria-live="off" className="font-display text-[26px] font-extrabold leading-none tabular-nums text-fg">
                  {score}
                </span>
                <span className={`font-mono text-sm tabular-nums ${secs <= 10 ? "text-bad-text" : "text-fg-3"}`}>{secs}s</span>
              </span>
            </div>
            <div role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={secs} className="relative h-1.5 bg-surface-2">
              <span className={`absolute inset-y-0 left-0 ${secs <= 10 ? "bg-bad" : "bg-signal"}`} style={{ width: `${pct}%` }} />
            </div>
            <span aria-live="polite" className="sr-only">
              {flash ? `${flash.n >= 0 ? "+" : ""}${flash.n}${flash.why ? `, ${flash.why}` : ""}` : ""}
            </span>
          </div>
          <Board key={round} api={{ running: phase === "run", secondsLeft: secs, addScore, end, round }} />
          <button type="button" onClick={end} className={`${BTN_GHOST} self-start`}>
            End round
          </button>
        </>
      )}

      {phase === "over" && (
        <section aria-labelledby="over-h" className="flex flex-col gap-5 border border-signal bg-surface p-5 sm:p-7">
          <span className={LABEL}>round over</span>
          <h2 id="over-h" ref={headRef} tabIndex={-1} className="font-display text-[clamp(44px,7vw,72px)] font-extrabold leading-none tracking-[-0.04em] text-fg outline-none">
            {score}
            <span className="ml-2 align-middle font-mono text-sm font-normal tracking-normal text-fg-3">pts</span>
          </h2>
          <p className="m-0 font-mono text-sm text-fg-2">
            {score >= clearAt ? `cleared (${clearAt}+)` : `${clearAt - score} short of the ${clearAt} clear line`}
            {isBest ? " · new best on this device" : best !== undefined ? ` · best ${best}` : ""}
          </p>
          {summary?.(score)}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={start} className={BTN}>
              Play again →
            </button>
            <Link href="/learn/arena" className={BTN_GHOST}>
              Arena
            </Link>
            <Link href="/learn/arena/daily" className={BTN_GHOST}>
              Daily challenge
            </Link>
          </div>
          <TaughtIn game={game} />
        </section>
      )}
    </main>
  );
}

function TaughtIn({ game }: { game: PracticeGame }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <span className={LABEL}>taught in</span>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {game.lessons.map((l) => (
          <li key={l.slug}>
            <Link href={lessonHref(ARENA_COURSE, l)} className="inline-flex min-h-10 items-center border border-line px-3 font-mono text-xs text-fg-2 hover:border-fg-4 hover:text-fg">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
