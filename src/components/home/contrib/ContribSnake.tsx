"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useGame } from "@/game/GameProvider";
import type { ContribData } from "@/lib/github-contrib";
import { track } from "@/lib/track";
import { ROWS, SnakeEngine, type Dir, type GridCell, type Mode } from "./engine";
import { draw, readPalette, type Layout, type Palette } from "./draw";

/* ───────── small external stores (no setState-in-effect) ───────── */

const BEST_KEY = "hk.snake.best";
const bestListeners = new Set<() => void>();
function subscribeBest(cb: () => void) {
  bestListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    bestListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeBest(n: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(n));
  } catch {
    // private mode: best score lasts for this visit only
  }
  bestListeners.forEach((l) => l());
}

function mediaStore(query: string) {
  return {
    subscribe(cb: () => void) {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    get: () => window.matchMedia(query).matches,
    server: () => false,
  };
}
const reducedStore = mediaStore("(prefers-reduced-motion: reduce)");
const coarseStore = mediaStore("(pointer: coarse)");

/* ───────── formatting ───────── */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (n: number) => n.toLocaleString("en-US");
function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WD[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function fakeSha(n: number) {
  let h = 2166136261 ^ n;
  for (let i = 0; i < 4; i++) h = Math.imul(h ^ (h >>> 13), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  w: 0,
  d: 1,
  s: 2,
  a: 3,
  W: 0,
  D: 1,
  S: 2,
  A: 3,
};

const SCORE_BADGE = 500;

const HALF_YEAR = 26;

type Hud = { mode: Mode; score: number; eaten: number; won: boolean; newBest: boolean };
const HUD0: Hud = { mode: "attract", score: 0, eaten: 0, won: false, newBest: false };

function computeLayout(width: number, cols: number, weeks: ContribData["weeks"]): Layout {
  const roomy = width >= 640;
  const gutterL = roomy ? 32 : 0;
  const gutterT = 18;
  const pitch = Math.max(5, Math.min(24, Math.floor((width - gutterL) / Math.max(1, cols))));
  const gap = pitch >= 14 ? 3 : pitch >= 9 ? 2 : 1;
  const cell = pitch - gap;
  const months: Layout["months"] = [];
  const minGap = Math.max(3, Math.ceil(24 / pitch)); // columns a label needs before the next one
  let last = "";
  weeks.forEach((w, c) => {
    const first = w.days.find((d) => d);
    if (!first) return;
    const m = first.date.slice(5, 7);
    if (m !== last) {
      last = m;
      const prev = months[months.length - 1];
      if (prev && c - prev.col < minGap) {
        // Too close: a partial first month gives way; otherwise keep the earlier label.
        if (prev.col > 1) return;
        months.pop();
      }
      months.push({ col: c, text: MON[Number(m) - 1] });
    }
  });
  // Drop a trailing label that would run off the right edge.
  if (months.length && (cols - months[months.length - 1].col) * pitch < 24) months.pop();
  return {
    cols,
    pitch,
    cell,
    gutterL,
    gutterT,
    width: gutterL + cols * pitch - gap,
    height: gutterT + ROWS * pitch - gap,
    months,
    dayLabels: roomy,
  };
}

export default function ContribSnake({ data }: { data: ContribData }) {
  const { award, awardOnce } = useGame();
  const reduced = useSyncExternalStore(reducedStore.subscribe, reducedStore.get, reducedStore.server);
  const coarse = useSyncExternalStore(coarseStore.subscribe, coarseStore.get, coarseStore.server);
  const best = useSyncExternalStore(subscribeBest, readBest, () => 0);

  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const palRef = useRef<Palette | null>(null);
  const hoverRef = useRef(-1);
  const reducedRef = useRef(false);
  const visibleRef = useRef(false);
  const kickRef = useRef<() => void>(() => {});
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const tipTimer = useRef(0);
  /** Direction changes the player made this game: XP needs real steering, not pressing start and watching it wrap. */
  const turnsRef = useRef(0);

  const [eng] = useState(() => new SnakeEngine());
  const [width, setWidth] = useState(0);
  const [fullYear, setFullYear] = useState(false);
  const [hud, setHud] = useState<Hud>(HUD0);
  const [tip, setTip] = useState<{ idx: number; x: number; y: number } | null>(null);
  const [announce, setAnnounce] = useState("");

  const narrow = width > 0 && width < 640;
  const cols = narrow && !fullYear ? Math.min(HALF_YEAR, data.weeks.length) : data.weeks.length;
  const weeks = useMemo(() => data.weeks.slice(-cols), [data.weeks, cols]);
  const cells = useMemo<GridCell[]>(() => {
    const out: GridCell[] = [];
    for (const w of weeks) for (let r = 0; r < ROWS; r++) out.push(w.days[r] ?? null);
    return out;
  }, [weeks]);
  const layout = useMemo(() => (width ? computeLayout(width, cols, weeks) : null), [width, cols, weeks]);
  const inGame = hud.mode !== "attract";
  const showPad = (hud.mode === "play" || hud.mode === "paused") && (coarse || narrow);

  /* ── measure ── */
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── engine events → HUD, XP, best ── */
  useEffect(() => {
    eng.setListener((e) => {
      if (e.type === "eat") {
        if (e.mode === "attract") {
          if (counterRef.current) counterRef.current.textContent = fmt(e.score);
          return;
        }
        setHud((h) => ({ ...h, score: e.score, eaten: e.eaten }));
        if (e.eaten >= 5 && turnsRef.current >= 2) award("snake", "Played the contribution snake");
        if (e.score >= SCORE_BADGE && turnsRef.current >= 6) awardOnce("snake:500", 50, `Snake charmer · ate ${SCORE_BADGE}+ contributions`);
      } else if (e.type === "over") {
        const prevBest = readBest();
        const newBest = e.score > prevBest;
        if (newBest) writeBest(e.score);
        setHud({ mode: "over", score: e.score, eaten: e.eaten, won: e.won, newBest });
        setAnnounce(`${e.won ? "Board cleared" : "Game over"}. Ate ${e.score} contributions.`);
        track("contrib_snake", { score: e.score });
      }
    });
  }, [eng, award, awardOnce]);

  /* ── grid changes (data / range) reset the board ── */
  useEffect(() => {
    eng.setCells(cells, cols, performance.now());
    if (counterRef.current) counterRef.current.textContent = "0";
    // Board was rebuilt underneath the HUD; bring the HUD back to attract mode to match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHud(HUD0);
    kickRef.current();
  }, [eng, cells, cols]);

  useEffect(() => {
    reducedRef.current = reduced;
    kickRef.current();
  }, [reduced]);

  /* ── canvas sizing ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(layout.width * dpr);
    canvas.height = Math.round(layout.height * dpr);
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutRef.current = layout;
    kickRef.current();
  }, [layout]);

  /* ── render loop: rAF only while visible, on-screen and something moves ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !root || !ctx) return;
    let raf = 0;

    const refreshPalette = () => {
      palRef.current = readPalette(ctx, root);
      kick();
    };
    const frame = (now: number) => {
      raf = 0;
      const L = layoutRef.current;
      const P = palRef.current;
      if (!L || !P) return;
      const idleAttract = eng.mode === "attract" && reducedRef.current;
      if (!idleAttract) eng.update(now);
      draw(ctx, eng, P, L, now, hoverRef.current, true);
      const moving = eng.mode === "play" || (eng.mode === "attract" && !reducedRef.current) || eng.transient(now);
      if (moving && visibleRef.current && !document.hidden) raf = requestAnimationFrame(frame);
    };
    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }
    kickRef.current = kick;

    const pauseGame = () => {
      if (eng.mode !== "play") return;
      eng.pause(performance.now());
      setHud((h) => ({ ...h, mode: "paused" }));
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) kick();
        else pauseGame();
      },
      { rootMargin: "80px" }
    );
    io.observe(root);
    const onVis = () => {
      if (document.hidden) pauseGame();
      else kick();
    };
    document.addEventListener("visibilitychange", onVis);
    const mo = new MutationObserver(refreshPalette);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    refreshPalette();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      kickRef.current = () => {};
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [eng]);

  /* ── controls ── */
  const start = useCallback(() => {
    eng.startPlay(performance.now());
    setHud({ ...HUD0, mode: "play" });
    setTip(null);
    setAnnounce("Snake started. Steer with the arrow keys.");
    turnsRef.current = 0;
    boardRef.current?.focus({ preventScroll: true });
    kickRef.current();
  }, [eng]);

  const quit = useCallback(() => {
    eng.resetAttract(performance.now());
    if (counterRef.current) counterRef.current.textContent = "0";
    setHud(HUD0);
    kickRef.current();
  }, [eng]);

  const togglePause = useCallback(() => {
    const now = performance.now();
    if (eng.mode === "play") {
      eng.pause(now);
      setHud((h) => ({ ...h, mode: "paused" }));
    } else if (eng.mode === "paused") {
      eng.resume(now);
      setHud((h) => ({ ...h, mode: "play" }));
      boardRef.current?.focus({ preventScroll: true });
    }
    kickRef.current();
  }, [eng]);

  const steer = useCallback(
    (d: Dir) => {
      if (eng.mode === "paused") {
        eng.resume(performance.now());
        setHud((h) => ({ ...h, mode: "play" }));
        kickRef.current();
      }
      if (eng.mode === "play") turnsRef.current += 1;
      eng.turn(d);
    },
    [eng]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const onButton = (e.target as HTMLElement).tagName === "BUTTON";
    const k = e.key;
    const mode = eng.mode;
    if (mode === "play" || mode === "paused") {
      if (k in KEY_DIR) {
        e.preventDefault();
        steer(KEY_DIR[k]);
      } else if (k === "p" || k === "P" || (k === " " && !onButton)) {
        e.preventDefault();
        togglePause();
      } else if (k === "Escape") {
        e.preventDefault();
        quit();
      }
      return;
    }
    if (onButton) return;
    if (k === "p" || k === "P" || k === "Enter" || k === " " || (mode === "over" && (k === "r" || k === "R"))) {
      e.preventDefault();
      start();
    } else if (k === "Escape" && mode === "over") {
      e.preventDefault();
      quit();
    }
  };

  const onBlur = (e: React.FocusEvent) => {
    if (eng.mode === "play" && !rootRef.current?.contains(e.relatedTarget as Node | null)) {
      eng.pause(performance.now());
      setHud((h) => ({ ...h, mode: "paused" }));
      kickRef.current();
    }
  };

  /* ── pointer: hover tooltip, click-to-play, swipe ── */
  const cellAt = (e: React.PointerEvent) => {
    const L = layoutRef.current;
    const canvas = canvasRef.current;
    if (!L || !canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - L.gutterL;
    const y = e.clientY - rect.top - L.gutterT;
    if (x < 0 || y < 0) return -1;
    const c = Math.floor(x / L.pitch);
    const r = Math.floor(y / L.pitch);
    if (c >= L.cols || r >= ROWS) return -1;
    const idx = c * ROWS + r;
    return cells[idx] ? idx : -1;
  };

  const showTip = (idx: number) => {
    const L = layoutRef.current;
    hoverRef.current = idx;
    kickRef.current();
    if (idx < 0 || !L) return setTip(null);
    const c = Math.floor(idx / ROWS);
    const r = idx % ROWS;
    setTip({ idx, x: L.gutterL + c * L.pitch + L.cell / 2, y: L.gutterT + r * L.pitch });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = swipeRef.current;
    if (inGame && s && s.id === e.pointerId) {
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 18) {
        steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
        swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }
      return;
    }
    if (e.pointerType !== "mouse" || inGame) return;
    const idx = cellAt(e);
    if (idx !== hoverRef.current) showTip(idx);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (inGame) swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    swipeRef.current = null;
    if (inGame) return;
    if (e.pointerType === "mouse") {
      start();
      return;
    }
    // Touch: tap shows the cell's tooltip for a moment (the play button starts the game).
    const idx = cellAt(e);
    showTip(idx);
    window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => showTip(-1), 2400);
  };

  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && hoverRef.current !== -1) showTip(-1);
  };

  useEffect(() => () => window.clearTimeout(tipTimer.current), []);

  /* ── derived copy ── */
  const tipCell = tip ? cells[tip.idx] : null;
  const tipText = tipCell
    ? `${tipCell.count === 0 ? "No" : fmt(tipCell.count)} contribution${tipCell.count === 1 ? "" : "s"} · ${shortDate(tipCell.date)}`
    : "";
  const tipX = tip && layout ? Math.max(84, Math.min(layout.width - 84, tip.x)) : 0;
  const totalShown = useMemo(() => cells.reduce((s, c) => s + (c?.count || 0), 0), [cells]);
  const months = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of data.weeks) for (const d of w.days) if (d) m.set(d.date.slice(0, 7), (m.get(d.date.slice(0, 7)) || 0) + d.count);
    return [...m.entries()];
  }, [data.weeks]);

  const statusLabel =
    hud.mode === "attract" ? (reduced ? "idle · reduced motion" : "attract · auto") : hud.mode === "play" ? "play" : hud.mode === "paused" ? "paused" : hud.won ? "cleared" : "game over";

  const commitMsg = `git commit -m "ate ${fmt(hud.score)} contribution${hud.score === 1 ? "" : "s"}"`;

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} onBlur={onBlur} className="min-w-0 border border-line-strong bg-surface">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line px-3 py-2.5 font-mono text-[11px] uppercase tracking-label sm:px-[18px] sm:py-3 sm:text-xs">
        <span className="flex items-center gap-2.5">
          <span className="font-semibold text-signal-text">./contrib-snake</span>
          <span className={`inline-flex items-center gap-1.5 ${hud.mode === "over" ? "text-fg" : "text-fg-3"}`}>
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 ${hud.mode === "play" ? "animate-hk-blink bg-signal" : hud.mode === "attract" ? "bg-signal" : "bg-fg-4"}`}
            />
            {statusLabel}
          </span>
        </span>
        <span className="flex items-center gap-3 text-fg-3">
          {inGame ? (
            <>
              <span>
                score <span className="text-fg">{fmt(hud.score)}</span>
              </span>
              <span className="hidden sm:inline">
                len <span className="text-fg">{3 + hud.eaten}</span>
              </span>
            </>
          ) : (
            <span>
              eaten <span ref={counterRef} className="text-fg">0</span>
              <span className="hidden sm:inline"> / {fmt(totalShown)}</span>
            </span>
          )}
          <span>
            best <span className="text-signal-text">{fmt(best)}</span>
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-[18px]">
        {/* board */}
        <div
          ref={boardRef}
          tabIndex={0}
          role="application"
          aria-roledescription="game"
          aria-label={`Contribution snake. ${inGame ? "Arrow keys or W A S D steer, P pauses, Escape quits." : "Press P or Enter to play."}`}
          aria-describedby="contrib-summary"
          className={`relative w-full outline-offset-4 ${layout ? "" : "min-h-[102px] sm:min-h-[186px]"}`}
        >
          <canvas
            ref={canvasRef}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerCancel={() => (swipeRef.current = null)}
            className={`mx-auto block select-none ${inGame ? "touch-none" : "cursor-pointer touch-pan-y"}`}
            aria-hidden
          />
          {tip && tipText && layout ? (
            <span
              role="tooltip"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap border border-line-strong bg-bg px-2 py-1 font-mono text-[11px] text-fg"
              style={{ left: `calc(50% - ${layout.width / 2}px + ${tipX}px)`, top: tip.y - 6 }}
            >
              {tipText}
            </span>
          ) : null}
          {hud.mode === "paused" ? (
            <button
              type="button"
              onClick={togglePause}
              className="absolute left-1/2 top-1/2 min-h-10 -translate-x-1/2 -translate-y-1/2 border border-signal bg-bg px-3 font-mono text-xs uppercase tracking-label text-signal-text"
            >
              ❚❚ paused · {coarse ? "tap" : "press P"} to resume
            </button>
          ) : null}
        </div>

        {/* game over */}
        {hud.mode === "over" ? (
          <div className="flex animate-hk-in flex-col gap-3 border border-signal bg-bg p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 flex-col gap-1 font-mono text-[13px] leading-relaxed">
              <span className="break-words text-fg">
                <span className="text-signal-text">$</span> {commitMsg}
              </span>
              <span className="text-fg-3">
                [main {fakeSha(hud.score + hud.eaten * 7919)}] 1 snake changed, {hud.eaten} insertion{hud.eaten === 1 ? "" : "s"}(+),{" "}
                {hud.won ? "0 deletions(-) · board cleared" : "1 deletion(-) · bit its own tail"}
              </span>
              {hud.newBest && hud.score > 0 ? <span className="text-signal-text">new personal best ★</span> : null}
              {hud.score < SCORE_BADGE ? (
                <span className="text-fg-4">eat {fmt(SCORE_BADGE)}+ for the Snake charmer badge (+50 XP)</span>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={start} className="min-h-11 bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal hover:brightness-110">
                ↻ play again
              </button>
              <button type="button" onClick={quit} className="min-h-11 border border-line-strong px-3.5 font-mono text-[13px] text-fg hover:bg-surface-2">
                esc
              </button>
            </div>
          </div>
        ) : null}

        {/* d-pad (touch / narrow) */}
        {showPad ? (
          <div className="grid select-none grid-cols-3 gap-1.5 self-center" aria-label="Direction pad">
            {(
              [
                [0, "↑", "col-start-2"],
                [3, "←", "col-start-1 row-start-2"],
                [2, "↓", "col-start-2 row-start-2"],
                [1, "→", "col-start-3 row-start-2"],
              ] as const
            ).map(([d, glyph, pos]) => (
              <button
                key={d}
                type="button"
                aria-label={["Up", "Right", "Down", "Left"][d]}
                onPointerDown={(e) => {
                  e.preventDefault();
                  steer(d);
                }}
                onClick={(e) => {
                  if (e.detail === 0) steer(d);
                }}
                className={`${pos} grid h-12 w-14 touch-none place-items-center border border-line-strong bg-bg font-mono text-lg text-fg active:border-signal active:bg-signal active:text-on-signal`}
              >
                {glyph}
              </button>
            ))}
          </div>
        ) : null}

        {/* controls + legend */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {hud.mode === "attract" ? (
              <button type="button" onClick={start} className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal hover:brightness-110">
                ▶ play
                <kbd className="hidden border border-on-signal/30 px-1 font-mono text-[11px] font-normal sm:inline">P</kbd>
              </button>
            ) : hud.mode !== "over" ? (
              <>
                <button type="button" onClick={togglePause} className="min-h-11 border border-line-strong px-3.5 font-mono text-[13px] text-fg hover:bg-surface-2">
                  {hud.mode === "paused" ? "▶ resume" : "❚❚ pause"}
                </button>
                <button type="button" onClick={quit} className="min-h-11 border border-line-strong px-3.5 font-mono text-[13px] text-fg-3 hover:bg-surface-2 hover:text-fg">
                  ■ quit
                </button>
              </>
            ) : null}
            {narrow ? (
              <div className="flex border border-line-strong font-mono text-[12px]" role="group" aria-label="Range">
                {(
                  [
                    [false, "26w"],
                    [true, "1y"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={fullYear === v}
                    onClick={() => setFullYear(v)}
                    className={`min-h-11 min-w-11 px-2.5 ${fullYear === v ? "bg-fg text-bg" : "text-fg-3 hover:text-fg"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <span className="font-mono text-[11px] text-fg-4">
              {inGame
                ? coarse || narrow
                  ? "swipe or d-pad · walls wrap · don't bite your tail"
                  : "←↑↓→ / WASD · P pause · esc quit · walls wrap · don't bite your tail"
                : coarse
                  ? "tap a square for its day"
                  : "click the grid or press P to play"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-fg-4" aria-hidden>
            less
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className="h-2.5 w-2.5" style={{ background: legendColor(l) }} />
            ))}
            more
          </div>
        </div>
      </div>

      {/* screen-reader summary + announcements */}
      <div id="contrib-summary" className="sr-only">
        <p>
          GitHub contributions for {data.user}{data.source === "offline" ? " (offline placeholder, GitHub could not be reached)" : ""}:{" "}
          {fmt(data.total)} in the last year. Current streak {data.currentStreak} days, longest streak {data.longestStreak} days.
          {data.bestDay ? ` Busiest day ${shortDate(data.bestDay.date)} with ${data.bestDay.count} contributions.` : ""}
        </p>
        <ul>
          {months.map(([ym, n]) => (
            <li key={ym}>
              {MON[Number(ym.slice(5, 7)) - 1]} {ym.slice(0, 4)}: {fmt(n)} contributions
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

/** Legend swatches use the same ramp as the canvas, expressed with CSS tokens. */
function legendColor(level: number) {
  if (level === 0) return "var(--c-surface-2)";
  const pct = [0, 30, 52, 75, 91][level];
  return `color-mix(in srgb, var(--c-signal) ${pct}%, var(--c-surface-2))`;
}
