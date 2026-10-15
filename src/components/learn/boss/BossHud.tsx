"use client";

import { useEffect, useRef } from "react";
import { useChromeHidden } from "@/components/site/readerChrome";
import { mmss, type Phase } from "./shared";

/**
 * Fixed fight HUD: phase stepper sized by budget, the phase clock, start/pause and the next action.
 * Sits above the mobile dock on phones and at the bottom edge on desktop; pads the page so it never
 * covers the end of the lesson.
 */
export default function BossHud(props: {
  phases: Phase[];
  current: number;
  maxPhase: number;
  used: Record<string, number>;
  revealed: Record<string, boolean>;
  running: boolean;
  canRun: boolean;
  totalMin: number;
  totalUsed: number;
  timed: boolean;
  isLast: boolean;
  onToggle: () => void;
  onGo: (k: number) => void;
  onReveal: () => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const { phases, current, used, revealed } = props;
  const cur = phases[current];
  const ref = useRef<HTMLDivElement>(null);
  // phones: the reading toolbar under the HUD slides away while scrolling down; follow it
  const barHidden = useChromeHidden();

  // Keep the end of the page reachable under the HUD, and lift the reader's floating tools
  // (bottom-right on desktop) above it while the fight is on.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const body = document.body;
    const root = document.documentElement;
    const original = body.style.paddingBottom;
    const lifted = new Map<HTMLElement, string>();
    const apply = () => {
      const h = el.offsetHeight;
      const desktop = window.innerWidth >= 1024;
      // the phone reading toolbar (bottom-anchored reader UI) the HUD rides on
      let bar = 0;
      document.querySelectorAll<HTMLElement>("[data-reader-ui]").forEach((t) => {
        if (t === el || (lifted.get(t) ?? t.style.bottom) === "") return;
        const cs = getComputedStyle(t);
        if (cs.position === "fixed" && cs.display !== "none") bar = Math.max(bar, t.offsetHeight);
      });
      el.style.setProperty("--boss-bar", `${bar}px`);
      body.style.paddingBottom = `${h + (desktop ? 0 : 70) + 16}px`;
      root.style.setProperty("--boss-hud-h", `${h}px`);
      document.querySelectorAll<HTMLElement>("[data-reader-ui]").forEach((t) => {
        if (getComputedStyle(t).position !== "fixed") return;
        // top-anchored reader UI (the pinned stage bar) stays put: a bottom would stretch it
        if (t.style.top !== "" || t.closest("header")) return;
        if (!lifted.has(t)) lifted.set(t, t.style.bottom);
        t.style.bottom = desktop ? `${h + 16}px` : lifted.get(t) || "";
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    document.querySelectorAll<HTMLElement>("[data-reader-ui]").forEach((t) => ro.observe(t));
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      body.style.paddingBottom = original;
      root.style.removeProperty("--boss-hud-h");
      lifted.forEach((bottom, t) => {
        t.style.bottom = bottom;
      });
    };
  }, []);

  if (!cur) return null;
  const budget = (cur.budgetMinutes || 0) * 60;
  const u = used[cur.id] || 0;
  const left = budget - u;
  const isRevealed = !!revealed[cur.id];
  const clock = budget ? (left >= 0 ? mmss(left) : `+${mmss(left)}`) : mmss(u);
  const clockCls = budget ? (left < 0 ? "text-bad-text" : left <= 60 ? "text-signal-text" : "text-fg") : "text-fg";
  const sub = budget
    ? `${left < 0 ? "OVER BUDGET" : `LEFT IN P${cur.n}`}${props.timed ? ` · TOTAL ${mmss(props.totalUsed)} / ${props.totalMin}:00` : ""}`
    : `ELAPSED IN P${cur.n} · NO BUDGET`;
  const runLabel = props.running ? "Pause" : u > 0 ? "Resume" : "Start clock";

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Boss fight controls"
      className={`fixed inset-x-0 z-[45] border-t border-line-strong bg-bg/95 backdrop-blur transition-[bottom] duration-200 lg:bottom-0 lg:pb-0 ${
        barHidden ? "bottom-0 pb-[env(safe-area-inset-bottom,0px)]" : "bottom-[var(--boss-bar,58px)]"
      }`}
    >
      <div className="mx-auto flex max-w-[1320px] flex-col gap-2 px-4 py-2.5 sm:px-6 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6 lg:py-3">
        <div className="flex min-w-0 flex-col gap-1.5 lg:flex-[1_1_520px]">
          <span className="hidden font-mono text-[11px] uppercase tracking-label text-fg-3 lg:block">
            Phases · width = minutes · P{cur.n} of {phases.length}
          </span>
          <ol aria-label="Interview phases" className="m-0 flex list-none gap-[3px] p-0">
            {phases.map((p, k) => {
              const b = (p.budgetMinutes || 0) * 60;
              const pu = used[p.id] || 0;
              const over = b > 0 && pu > b;
              const isCur = k === current;
              const done = !!revealed[p.id];
              const reachable = k <= props.maxPhase;
              const frac = b ? Math.min(1, pu / b) : done ? 1 : 0;
              return (
                <li key={p.id} className="min-w-0" style={{ flex: `${p.budgetMinutes || Math.max(1, Math.round(p.minutes / 2))} 1 0px` }}>
                  <button
                    type="button"
                    onClick={() => props.onGo(k)}
                    disabled={!reachable}
                    aria-current={isCur ? "step" : undefined}
                    aria-label={`Phase ${p.n}: ${p.title}${p.budgetMinutes ? `, ${p.budgetMinutes} minutes` : ""}${done ? ", answered" : ""}${over ? ", over budget" : ""}`}
                    title={p.title}
                    className={`relative flex h-2 w-full items-center justify-center overflow-hidden lg:h-auto lg:min-h-[44px] lg:flex-col lg:gap-px lg:pb-[7px] lg:pt-1 ${
                      isCur
                        ? "bg-surface-2 lg:border-2 lg:border-signal lg:bg-transparent"
                        : done
                        ? "bg-surface-2 lg:border lg:border-line-strong lg:bg-surface"
                        : reachable
                        ? "bg-surface-2 lg:border lg:border-line-strong lg:bg-transparent"
                        : "cursor-not-allowed bg-surface-2 lg:border lg:border-dashed lg:border-line lg:bg-transparent"
                    }`}
                  >
                    <span className={`hidden font-mono text-xs font-semibold lg:block ${isCur ? "text-signal-text" : reachable ? "text-fg" : "text-fg-4"}`}>P{p.n}</span>
                    <span className="hidden font-mono text-[10px] text-fg-3 lg:block">{p.budgetMinutes ? `${p.budgetMinutes}m` : "–"}</span>
                    <span
                      aria-hidden="true"
                      className={`absolute bottom-0 left-0 h-full lg:h-[3px] ${over ? "bg-bad" : isCur ? "bg-signal" : done ? "bg-fg-4" : "bg-transparent"}`}
                      style={{ width: `${Math.round(frac * 100)}%` }}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={props.onExit}
            aria-label="Leave the fight, your attempt is saved"
            className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-lg text-fg hover:border-fg-3"
          >
            ×
          </button>
          <span className="flex min-w-0 flex-1 flex-col lg:hidden">
            <span className="font-mono text-[10px] tracking-label text-fg-3">
              P{cur.n}/{phases.length}
              {cur.budgetMinutes ? ` · ${cur.budgetMinutes} MIN` : ""}
            </span>
            <span className="truncate text-sm font-semibold text-fg">{cur.title}</span>
          </span>
          <div role="timer" aria-label={budget ? "Phase time remaining" : "Phase time elapsed"} className="flex flex-col items-end gap-0.5">
            <span className={`font-mono text-2xl font-semibold leading-none lg:text-[30px] ${clockCls}`}>{clock}</span>
            <span className="whitespace-nowrap font-mono text-[9px] text-fg-3 lg:text-[11px]">{sub}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isRevealed && (
            <button
              type="button"
              onClick={props.onToggle}
              aria-pressed={props.running}
              className={`min-h-[44px] px-3.5 text-sm font-semibold ${props.running ? "border border-line-strong text-fg" : "border border-signal text-signal-text"}`}
            >
              {runLabel}
            </button>
          )}
          {!isRevealed ? (
            <button type="button" onClick={props.onReveal} className="min-h-[44px] flex-1 bg-signal px-4 text-sm font-semibold text-on-signal hover:opacity-90 lg:flex-none">
              Done · reveal model answer
            </button>
          ) : (
            <button type="button" onClick={props.onNext} className="min-h-[44px] flex-1 bg-fg px-4 text-sm font-semibold text-bg lg:flex-none">
              {props.isLast ? "Finish → debrief" : "Next phase →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
