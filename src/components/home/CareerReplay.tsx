"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { Dot, Prompt, container, h2Class } from "./ui";
import { ERAS, SKILL_BY_ID, type Era, type EraId } from "./showcase/data";
import { Chip, label } from "./showcase/parts";
import { WORLD_EVT, openSkill } from "./showcase/bus";

// The career as a platformer campaign: each job is a world with a boss, the stairs climb with time,
// and Markdrop runs alongside as a bonus stage.
const WORLDS = ERAS.filter((e) => e.kind !== "venture");
const BONUS = ERAS.find((e) => e.kind === "venture")!;
const ALL: Era[] = [...WORLDS, BONUS];
const STEP_MS = 1300;

const worldCode = (e: Era) => {
  const i = WORLDS.indexOf(e);
  return i >= 0 ? `W${i}` : "B";
};

function Detail({ era, headingId }: { era: Era; headingId?: string }) {
  const live = era.end === null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">
          {worldCode(era)} · {era.period}
          {era.place ? ` · ${era.place}` : ""}
        </span>
        <span className="font-mono text-xs text-fg-3">{era.role}</span>
      </div>
      <h3 id={headingId} className="m-0 font-display text-[26px] font-extrabold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[34px]">
        {era.org}
        <span className="text-fg-3"> · </span>
        <span className="text-fg-2">{era.line}</span>
      </h3>
      <div className="grid gap-px border border-line bg-line md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ul className="m-0 flex list-none flex-col gap-2.5 bg-bg p-4 text-[15px] leading-normal text-fg-2">
          {era.points.map((p) => (
            <li key={p} className="flex gap-2.5">
              <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 bg-signal" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 bg-bg p-4">
          <div className="flex flex-col gap-1">
            <span className={label}>
              boss · {era.boss} · {live ? "in progress" : "cleared ✓"}
            </span>
            <span className="text-[15px] leading-snug text-fg">{era.bossNote}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>loot</span>
            <div className="flex flex-wrap gap-1.5">
              {era.wins.map((w) => (
                <Chip key={w} tone="signal">
                  {w}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>skills used · tap to inspect</span>
            <div className="flex flex-wrap gap-1.5">
              {era.skills.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => openSkill(k)}
                  className="min-h-10 border border-line-strong px-2.5 font-mono text-xs text-fg-2 hover:border-fg-3 hover:text-fg"
                >
                  {SKILL_BY_ID[k].name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CareerReplay() {
  const { award } = useGame();
  const [sel, setSel] = useState<EraId>("senseloaf");
  const [seen, setSeen] = useState<Set<EraId>>(() => new Set(["senseloaf"]));
  const [replaying, setReplaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const seenRef = useRef(seen);

  const visit = (id: EraId) => {
    const next = new Set(seenRef.current).add(id);
    seenRef.current = next;
    setSeen(next);
    if (next.size === ALL.length) award("replay", "Campaign cleared · every world visited");
  };

  const open = (id: EraId) => {
    window.clearInterval(timer.current);
    setReplaying(false);
    setSel(id);
    visit(id);
  };

  const replay = () => {
    window.clearInterval(timer.current);
    let k = 0;
    setReplaying(true);
    setSel(ALL[0].id);
    visit(ALL[0].id);
    timer.current = window.setInterval(() => {
      k += 1;
      if (k >= ALL.length) {
        window.clearInterval(timer.current);
        setReplaying(false);
        award("replay", "Campaign replayed · every world visited");
        return;
      }
      setSel(ALL[k].id);
      visit(ALL[k].id);
    }, STEP_MS);
  };

  useEffect(() => () => window.clearInterval(timer.current), []);

  // Other sections (hero quest, skill receipts) can open a world.
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<EraId>).detail;
      if (!ALL.some((x) => x.id === id)) return;
      window.clearInterval(timer.current);
      setReplaying(false);
      setSel(id);
      const next = new Set(seenRef.current).add(id);
      seenRef.current = next;
      setSeen(next);
      if (next.size === ALL.length) award("replay", "Campaign cleared · every world visited");
    };
    window.addEventListener(WORLD_EVT, on);
    return () => window.removeEventListener(WORLD_EVT, on);
  }, [award]);

  const cur = ALL.find((e) => e.id === sel)!;

  return (
    <section id="career" aria-labelledby="career-h" className={`${container} flex scroll-mt-20 flex-col gap-8 pb-14 pt-16 sm:pb-16 sm:pt-[88px]`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[760px] flex-col gap-3">
          <Prompt>./career --map</Prompt>
          <h2 id="career-h" className={h2Class}>
            Six worlds, one save file
            <Dot />
          </h2>
          <p className="m-0 text-base leading-relaxed text-fg-2 sm:text-[17px]">
            Every job was a level with a boss. The stairs climb with time; Markdrop runs alongside as a bonus stage. Open a
            world to see how it was cleared.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-fg-3" aria-live="polite">
            visited <span className="text-fg">{seen.size}</span>/{ALL.length}
          </span>
          <button
            type="button"
            onClick={replay}
            disabled={replaying}
            className="min-h-12 bg-signal px-[18px] font-mono text-sm font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {replaying ? "replaying…" : "▶ replay campaign"}
          </button>
        </div>
      </div>

      {/* desktop: the climb */}
      <div className="hidden lg:block">
        <div
          role="group"
          aria-label="Career worlds"
          className="grid h-[392px] grid-cols-[repeat(6,minmax(0,1fr))_minmax(0,0.92fr)] items-end gap-2.5 border-b border-line-strong"
        >
          {WORLDS.map((w, i) => {
            const on = sel === w.id;
            const live = w.end === null;
            return (
              <div key={w.id} className="relative flex min-w-0 flex-col items-stretch">
                <span aria-hidden className="flex h-8 items-end justify-between pb-1.5">
                  {on ? (
                    <span className="grid h-5 w-5 place-items-center bg-fg font-mono text-[9px] font-bold text-bg motion-safe:animate-bounce">
                      P1
                    </span>
                  ) : (
                    <span />
                  )}
                  {live && <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">now ▼</span>}
                </span>
                <button
                  id={`world-d-${w.id}`}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${worldCode(w)}: ${w.org}, ${w.role}, ${w.period}`}
                  onClick={() => open(w.id)}
                  className={`relative flex min-h-[112px] flex-col gap-1 border p-3 text-left transition-colors ${
                    on ? "border-signal bg-signal text-on-signal" : "border-line-strong bg-surface text-fg hover:border-fg-3"
                  }`}
                >
                  <span className="flex items-center justify-between font-mono text-[11px] opacity-75">
                    <span>{worldCode(w)}</span>
                    {seen.has(w.id) && !on && <span className="text-signal-text opacity-100">✓</span>}
                  </span>
                  <span className="text-[15px] font-semibold leading-tight">{w.org}</span>
                  <span className="font-mono text-[11px] opacity-75">{w.period}</span>
                  <span className="mt-auto truncate font-mono text-[11px] opacity-75">boss: {w.boss}</span>
                </button>
                <span
                  aria-hidden
                  className="block border-x border-t border-line bg-bg"
                  style={{
                    height: 18 + i * 44,
                    backgroundImage: "repeating-linear-gradient(135deg, var(--c-line) 0 1px, transparent 1px 10px)",
                  }}
                />
              </div>
            );
          })}
          <div className="flex min-w-0 flex-col items-stretch self-start pt-3">
            <span aria-hidden className="flex h-8 items-end pb-1.5">
              {sel === BONUS.id && (
                <span className="grid h-5 w-5 place-items-center bg-fg font-mono text-[9px] font-bold text-bg motion-safe:animate-bounce">
                  P1
                </span>
              )}
            </span>
            <button
              id={`world-d-${BONUS.id}`}
              type="button"
              aria-pressed={sel === BONUS.id}
              aria-label={`Bonus stage: ${BONUS.org}, ${BONUS.role}, ${BONUS.period}`}
              onClick={() => open(BONUS.id)}
              className={`flex min-h-[112px] flex-col gap-1 border border-dashed p-3 text-left transition-colors ${
                sel === BONUS.id ? "border-signal bg-signal text-on-signal" : "border-signal bg-bg text-fg hover:bg-surface"
              }`}
            >
              <span className="flex items-center justify-between font-mono text-[11px] opacity-75">
                <span>bonus · parallel</span>
                {seen.has(BONUS.id) && sel !== BONUS.id && <span className="text-signal-text opacity-100">✓</span>}
              </span>
              <span className="text-[15px] font-semibold leading-tight">{BONUS.org}</span>
              <span className="font-mono text-[11px] opacity-75">{BONUS.period}</span>
              <span className="mt-auto font-mono text-[11px] opacity-75">my own venture</span>
            </button>
            <span aria-hidden className="mx-auto h-16 border-l border-dashed border-signal" />
            <span aria-hidden className="text-center font-mono text-[10px] uppercase tracking-label text-fg-4">
              floating platform
            </span>
          </div>
        </div>
      </div>

      {/* phones + tablets: the same climb, as a compact strip */}
      <div className="flex flex-col gap-2 lg:hidden">
        <div role="group" aria-label="Career worlds" className="grid grid-cols-7 items-end gap-1 border-b border-line-strong">
          {ALL.map((w, i) => {
            const on = sel === w.id;
            const bonus = w.kind === "venture";
            return (
              <div key={w.id} className={`flex min-w-0 flex-col items-stretch ${bonus ? "self-start" : ""}`}>
                <span aria-hidden className="flex h-6 items-end justify-center pb-1">
                  {on && (
                    <span className="grid h-4 w-4 place-items-center bg-fg font-mono text-[8px] font-bold text-bg motion-safe:animate-bounce">
                      P1
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${bonus ? "Bonus stage" : worldCode(w)}: ${w.org}, ${w.period}`}
                  onClick={() => open(w.id)}
                  className={`relative flex h-11 items-center justify-center font-mono text-[11px] ${
                    on
                      ? "bg-signal font-semibold text-on-signal"
                      : bonus
                        ? "border border-dashed border-signal text-signal-text"
                        : "border border-line-strong bg-surface text-fg-2"
                  }`}
                >
                  {worldCode(w)}
                  {seen.has(w.id) && !on && <span aria-hidden className="absolute right-0.5 top-0 text-[9px] text-signal-text">✓</span>}
                </button>
                {!bonus && (
                  <span
                    aria-hidden
                    className="block border-x border-t border-line bg-bg"
                    style={{
                      height: 6 + i * 14,
                      backgroundImage: "repeating-linear-gradient(135deg, var(--c-line) 0 1px, transparent 1px 7px)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-label text-fg-4">
          <span>2019</span>
          <span>tap a world</span>
          <span>now</span>
        </div>
      </div>

      <div id="world-panel" className="scroll-mt-24 border border-line-strong bg-surface p-4 sm:p-6" aria-live="polite">
        <Detail era={cur} />
      </div>

    </section>
  );
}
