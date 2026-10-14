"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { useGame } from "@/game/GameProvider";
import { GAMES, type GameKey, type GameMeta, type GameProps, type WinFn } from "./shared";
import CacheOrMiss from "./CacheOrMiss";
import HashRing from "./HashRing";
import TripTheBreaker from "./TripTheBreaker";
import BackOfEnvelope from "./BackOfEnvelope";
import RaceCondition from "./RaceCondition";
import IncidentCommander from "./IncidentCommander";

type Best = { v: number; t: string };
type BestMap = Partial<Record<GameKey, Best>>;

const BOARDS: Record<GameKey, ComponentType<GameProps>> = {
  cache: CacheOrMiss,
  ring: HashRing,
  breaker: TripTheBreaker,
  env: BackOfEnvelope,
  race: RaceCondition,
  inc: IncidentCommander,
};

/** Reads the persisted best runs, ignoring anything malformed. */
function readBest(raw: unknown): BestMap {
  if (!raw || typeof raw !== "object") return {};
  const out: BestMap = {};
  for (const g of GAMES) {
    const b = (raw as Record<string, unknown>)[g.key];
    if (b && typeof b === "object" && typeof (b as Best).t === "string" && typeof (b as Best).v === "number") {
      out[g.key] = { v: (b as Best).v, t: (b as Best).t };
    }
  }
  return out;
}

export default function PlaygroundShell() {
  const { award, done, xp, hydrated, flags, setFlag } = useGame();
  const [sel, setSel] = useState<GameKey>("cache");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Latest flags for the win handler without re-creating it (keeps the breaker's interval stable).
  const flagsRef = useRef(flags);
  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  const win = useCallback(
    (g: GameMeta, v: number, t: string) => {
      award(g.quest, `${g.name} cleared`);
      const best = readBest(flagsRef.current.playBest);
      const prev = best[g.key];
      const better = !prev || (g.higherIsBetter ? v > prev.v : v < prev.v);
      if (better) {
        const next = { ...best, [g.key]: { v, t } };
        flagsRef.current = { ...flagsRef.current, playBest: next };
        setFlag("playBest", next);
      }
    },
    [award, setFlag]
  );

  const winners = useMemo(() => {
    const m = {} as Record<GameKey, WinFn>;
    GAMES.forEach((g) => {
      m[g.key] = (v, t) => win(g, v, t);
    });
    return m;
  }, [win]);

  const bestMap = readBest(flags.playBest);
  const cleared = GAMES.filter((g) => !!done[g.quest]).length;
  const cur = GAMES.find((g) => g.key === sel) || GAMES[0];

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = GAMES.findIndex((g) => g.key === sel);
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % GAMES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + GAMES.length) % GAMES.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = GAMES.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setSel(GAMES[n].key);
    tabRefs.current[n]?.focus();
  };

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:pb-24">
      <section className="flex max-w-[900px] flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[13px] text-signal-text">❯ ./playground --break-things</span>
          <span className="border border-signal px-2 py-1.5 font-mono text-xs text-signal-text">
            {hydrated ? `${xp} xp · ${cleared}/6 cleared` : "– xp · –/6 cleared"}
          </span>
        </div>
        <h1 className="m-0 font-display text-[clamp(56px,8.5vw,132px)] font-extrabold leading-[0.84] tracking-tightest text-fg">
          Engineering
          <br />
          Playground<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 text-[17px] leading-[1.55] text-fg-2 sm:text-[19px]">
          Six tiny games, each about one idea that matters in production. Every one maps to a week of the course, so if you
          lose, you know what to read.
        </p>
      </section>

      <div
        role="tablist"
        aria-label="Games"
        onKeyDown={onTabKey}
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] md:gap-2 md:overflow-visible md:px-0 md:pb-0"
      >
        {GAMES.map((g, i) => {
          const on = g.key === sel;
          const won = hydrated && !!done[g.quest];
          const style = on
            ? "border-signal bg-signal text-on-signal"
            : won
              ? "border-signal bg-surface-2 text-fg hover:bg-surface"
              : "border-line bg-surface text-fg hover:bg-surface-2";
          return (
            <button
              key={g.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`play-tab-${g.key}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`play-panel-${g.key}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setSel(g.key)}
              className={`flex min-h-11 shrink-0 flex-col items-start justify-center border px-3 py-2.5 text-left font-sans md:min-h-[128px] md:justify-start md:gap-2 md:p-4 ${style}`}
            >
              <span className="hidden w-full justify-between font-mono text-[11px] tracking-[0.06em] md:flex">
                <span>{g.code}</span>
                <span>{won ? "CLEARED" : "+60 XP"}</span>
              </span>
              <span className="whitespace-nowrap text-[13px] font-semibold md:whitespace-normal md:font-display md:text-[22px] md:font-bold md:leading-[1.05] md:tracking-[-0.02em]">
                {won && (
                  <span className="md:hidden" aria-hidden>
                    ✓{" "}
                  </span>
                )}
                {g.name}
                {won && <span className="sr-only md:hidden"> (cleared)</span>}
              </span>
              <span className="hidden text-[13px] leading-[1.35] opacity-[0.85] md:block">{g.hook}</span>
            </button>
          );
        })}
      </div>

      <section className="flex flex-wrap gap-px border border-line-strong bg-line" aria-label={`${cur.name} game`}>
        <div className="flex min-w-0 flex-[999_1_640px] flex-col bg-raised p-4 sm:p-6 md:min-h-[520px]">
          {GAMES.map((g) => {
            const Board = BOARDS[g.key];
            const active = g.key === sel;
            return (
              <div
                key={g.key}
                id={`play-panel-${g.key}`}
                role="tabpanel"
                aria-labelledby={`play-tab-${g.key}`}
                className={active ? "flex flex-col gap-4" : "hidden"}
              >
                <Board onWin={winners[g.key]} active={active} />
              </div>
            );
          })}
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 bg-surface p-4 sm:p-6">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">{cur.code} · how to win</span>
          <h2 className="m-0 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.02em] text-fg">{cur.name}</h2>
          <p className="m-0 text-[15px] leading-[1.55] text-fg-2">{cur.rules}</p>
          <div className="flex flex-col gap-1 border border-dashed border-line-strong p-3.5">
            <span className="font-mono text-[11px] tracking-label text-fg-3">THE REAL LESSON</span>
            <span className="text-[15px] leading-normal text-fg">{cur.lesson}</span>
          </div>
          <Link
            href="/learn"
            className="flex min-h-12 items-center justify-between gap-3 border border-line-strong px-3.5 text-sm text-fg hover:bg-surface-2"
          >
            <span>{cur.week}</span>
            <span className="shrink-0 text-signal-text">read →</span>
          </Link>
          {cur.caseFile && (
            <Link
              href={cur.caseHref}
              className="flex min-h-12 items-center justify-between gap-3 border border-line-strong px-3.5 text-sm text-fg hover:bg-surface-2"
            >
              <span>{cur.caseFile}</span>
              <span className="shrink-0 text-signal-text">case file →</span>
            </Link>
          )}
          <span className="mt-auto font-mono text-xs text-fg-3">
            clear it: +60 XP · best: {(hydrated && bestMap[cur.key]?.t) || "—"}
          </span>
        </aside>
      </section>
    </main>
  );
}
