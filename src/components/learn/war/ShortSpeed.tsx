"use client";

/**
 * Playback speed for the shorts: one speed for every short (it carries over as the viewer swipes on), in
 * steps of 0.1 from 0.5× to 2×, remembered on this device (localStorage, a per-viewer convenience).
 * - Keys, anywhere on the page with a short on screen (not while typing): ] or > faster, [ or < slower,
 *   \ back to 1×. Cmd/Ctrl/Alt combinations are left to the browser (Cmd+[ is "back" on a Mac).
 * - Touch and mouse: a "1.0×" control that opens − / value / + (the value resets to 1×). A stepper rather
 *   than a tap that cycles presets: it reaches every 0.1 step the keys do (0.9×, 1.1×), and one tap back is
 *   one step back instead of a lap through every preset.
 * - Each change flashes the new speed over the short on screen (SpeedToast).
 * The browser keeps the voice's pitch at any speed (preservesPitch, set explicitly in the player).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Minus, Plus } from "lucide-react";

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
const KEY = "hk.shorts.rate";
/** whole tenths only, so repeated ±0.1 never drifts (0.30000000000000004) */
const clamp = (r: number) => Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(r * 10) / 10));
export const fmtSpeed = (r: number) => `${r.toFixed(1)}×`;

/** `n` counts the viewer's changes (also a press at a limit), so the toast flashes on each one */
type State = { rate: number; n: number };
const SERVER: State = { rate: 1, n: 0 };
let state: State | null = null;
const subs = new Set<() => void>();
const snapshot = (): State => {
  if (!state) {
    let saved = NaN;
    try {
      saved = Number(localStorage.getItem(KEY));
    } catch {
      // no storage: 1× for this page
    }
    state = { rate: Number.isFinite(saved) && saved > 0 ? clamp(saved) : 1, n: 0 };
  }
  return state;
};
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
};
const setSpeed = (r: number) => {
  const cur = snapshot();
  const rate = clamp(r);
  state = { rate, n: cur.n + 1 };
  if (rate !== cur.rate)
    try {
      localStorage.setItem(KEY, String(rate));
    } catch {
      // private mode: the speed lasts for this page
    }
  for (const fn of subs) fn();
};
export const stepSpeed = (dir: 1 | -1) => setSpeed(snapshot().rate + dir * 0.1);
export const resetSpeed = () => setSpeed(1);

export const useSpeedState = () => useSyncExternalStore(subscribe, snapshot, () => SERVER);
export const useShortSpeed = () => useSpeedState().rate;

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/** The speed keys, on the whole page while `on` (the feed's short on screen, or a lone player). */
export function useSpeedKeys(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === "]" || e.key === ">") stepSpeed(1);
      else if (e.key === "[" || e.key === "<") stepSpeed(-1);
      else if (e.key === "\\") resetSpeed();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on]);
}

/** The new speed, briefly, over the middle of the short (above the paused play button); announced politely. */
export function SpeedToast() {
  const { rate, n } = useSpeedState();
  // the count when this player appeared, or when the last toast faded: nothing to show until it moves on
  const [gone, setGone] = useState(n);
  useEffect(() => {
    if (n === gone) return;
    const id = window.setTimeout(() => setGone(n), 900);
    return () => window.clearTimeout(id);
  }, [n, gone]);
  return (
    <span role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 top-[calc(50%-92px)] flex justify-center">
      {n !== gone && (
        <span key={n} className="bg-black/70 px-3 py-1.5 font-mono text-[15px] font-semibold tabular-nums text-[#f3f2ee] shadow-[0_4px_16px_rgba(0,0,0,0.4)] motion-safe:animate-hk-in">
          <span className="sr-only">Speed </span>
          {fmtSpeed(rate)}
          {(rate === SPEED_MAX || rate === SPEED_MIN) && <span className="ml-1.5 text-[11px] font-normal text-[#c9c8c4]">{rate === SPEED_MAX ? "max" : "min"}</span>}
        </span>
      )}
    </span>
  );
}

const HINT = "Speed: ] faster, [ slower, \\ resets";

/**
 * The speed control. "chip": a small "1.0×" button in the player's corner (the caller positions it), the
 * stepper opening above it.
 * "rail": a button in the feed's phone action rail, the stepper opening to its left.
 * It closes on Escape, a tap elsewhere, or a few idle seconds.
 */
export function SpeedControl({ variant, className = "" }: { variant: "chip" | "rail"; className?: string }) {
  const rate = useShortSpeed();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const idle = useRef(0);
  const touch = () => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setOpen(false), 4000);
  };
  useEffect(() => () => window.clearTimeout(idle.current), []);
  const odd = rate !== 1;
  const rail = variant === "rail";
  const step = `grid ${rail ? "h-11 w-11" : "h-9 w-9"} place-items-center bg-black/75 text-[#f3f2ee] hover:bg-signal hover:text-on-signal`;
  return (
    <div
      ref={wrap}
      className={`${rail ? "relative" : ""} ${className}`}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
        // the player takes Space for play/pause: here it presses the focused button
        else if (e.key === " " || e.key === "Enter") e.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          touch();
        }}
        aria-expanded={open}
        aria-label={`Playback speed ${fmtSpeed(rate)}`}
        aria-keyshortcuts={"] [ \\"}
        title={HINT}
        className={
          rail
            ? "flex flex-col items-center gap-1 font-mono text-[11px] font-semibold text-[#f3f2ee] [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]"
            : `grid h-9 min-w-9 place-items-center px-1.5 font-mono text-[11px] font-semibold tabular-nums shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-colors ${open ? "bg-signal text-on-signal" : `bg-black/60 hover:bg-signal hover:text-on-signal ${odd ? "text-signal" : "text-[#f3f2ee]"}`}`
        }
      >
        {rail ? (
          <>
            <span className={`grid h-11 w-11 place-items-center text-[12px] tabular-nums transition-colors [text-shadow:none] ${open ? "bg-signal text-on-signal" : `bg-black/55 ${odd ? "text-signal" : "text-[#f3f2ee]"}`}`}>{fmtSpeed(rate)}</span>
            speed
          </>
        ) : (
          fmtSpeed(rate)
        )}
      </button>
      {open && (
        <div
          role="group"
          aria-label="Playback speed"
          className={`absolute flex shadow-[0_4px_16px_rgba(0,0,0,0.45)] ${rail ? "right-full top-0 mr-2" : "bottom-full right-0 mb-1.5"}`}
          onPointerDown={touch}
        >
          <button
            type="button"
            onClick={() => {
              stepSpeed(-1);
              touch();
            }}
            aria-label="Slower"
            title="Slower ([)"
            className={step}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              resetSpeed();
              touch();
            }}
            aria-label={`${fmtSpeed(rate)}, reset to normal speed`}
            title={"Normal speed (\\)"}
            className={`${rail ? "h-11 w-14" : "h-9 w-12"} border-x border-white/15 bg-black/75 font-mono text-[12px] font-semibold tabular-nums ${odd ? "text-signal" : "text-[#f3f2ee]"} hover:bg-signal hover:text-on-signal`}
          >
            {fmtSpeed(rate)}
          </button>
          <button
            type="button"
            onClick={() => {
              stepSpeed(1);
              touch();
            }}
            aria-label="Faster"
            title="Faster (])"
            className={step}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
