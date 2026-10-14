"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { BTN_GHOST, BTN_INVERT, BTN_PRIMARY, MSG_BOX, type GameProps } from "./shared";

const TICKS = 30;
const TICK_MS = 500;
const WIN = 18;

type Outcome = "ok" | "slow" | "fast" | "shed";
type Seen = "up" | "down" | "probe-up" | "probe-down" | null;

type S = {
  bt: number;
  bOpen: boolean;
  bScore: number;
  bBlocked: number;
  bLog: Outcome[];
  bRun: boolean;
  bSeen: Seen;
  bMsg: string;
};

const INITIAL: S = {
  bt: 0,
  bOpen: false,
  bScore: 0,
  bBlocked: 0,
  bLog: [],
  bRun: false,
  bSeen: null,
  bMsg: "Start the shift. The bank API will have a bad day at some point.",
};

/** The bank API fails on ticks 8 through 19. */
const schedule = (t: number): "up" | "down" => (t >= 8 && t <= 19 ? "down" : "up");

const CELL: Record<Outcome, string> = {
  ok: "bg-fg text-bg",
  slow: "bg-bad text-[#000]",
  fast: "bg-signal text-on-signal",
  shed: "bg-line-strong text-fg",
};

export default function TripTheBreaker({ onWin, active }: GameProps) {
  const [s, setS] = useState<S>(INITIAL);
  // The interval reads the latest state from here; every write goes through commit() so it never lags.
  const ref = useRef<S>(INITIAL);
  const commit = useCallback((next: S) => {
    ref.current = next;
    setS(next);
  }, []);

  // One interval per running shift. It pauses while another game is selected and is always cleared on unmount.
  useEffect(() => {
    if (!s.bRun || !active) return;
    const id = window.setInterval(() => {
      const cur = ref.current;
      if (!cur.bRun) return;
      const t = cur.bt + 1;
      const h = schedule(t);
      let pts = 0;
      let out: Outcome;
      let blocked = cur.bBlocked;
      if (!cur.bOpen) {
        if (h === "up") {
          pts = 1;
          out = "ok";
        } else {
          pts = -3;
          out = "slow";
          blocked += 40;
        }
      } else if (h === "down") {
        pts = 1;
        out = "fast";
      } else {
        pts = -1;
        out = "shed";
      }
      const score = cur.bScore + pts;
      const next: S = {
        ...cur,
        bt: t,
        bScore: score,
        bBlocked: blocked,
        bLog: [...cur.bLog, out],
        bSeen: cur.bOpen ? cur.bSeen : h,
      };
      if (t >= TICKS) {
        next.bRun = false;
        next.bMsg = `Shift over. Score ${score} / 30. ${
          score >= WIN
            ? "You opened fast and closed only after a probe came back healthy."
            : "Open as soon as calls start timing out, and use a half-open probe to find out when to close."
        }`;
      }
      commit(next);
      if (t >= TICKS && score >= WIN) onWin(score, `${score} pts`);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [s.bRun, active, commit, onWin]);

  const start = () =>
    commit({ ...INITIAL, bRun: true, bMsg: "Traffic flowing. Watch for timeouts." });

  const toggle = () => {
    const cur = ref.current;
    commit({
      ...cur,
      bOpen: !cur.bOpen,
      bSeen: null,
      bMsg: cur.bOpen
        ? "Closed. Real traffic goes to the bank again."
        : "Open. Requests fail in 10 ms instead of 3.5 s. You can’t see the bank now; probe to check.",
    });
  };

  const probe = () => {
    const cur = ref.current;
    const h = schedule(cur.bt + 1);
    commit({
      ...cur,
      bSeen: h === "up" ? "probe-up" : "probe-down",
      bMsg: h === "up" ? "One trial request succeeded. Safe to close." : "Trial request timed out. Stay open.",
    });
  };

  let health: string;
  if (s.bt === 0) health = "unknown";
  else if (!s.bOpen) health = s.bSeen === "down" ? "TIMING OUT" : "HEALTHY";
  else health = s.bSeen === "probe-up" ? "HEALTHY (probe)" : s.bSeen === "probe-down" ? "STILL DOWN (probe)" : "? hidden while open";
  const healthClass = health.startsWith("HEALTHY")
    ? "text-ok"
    : health.startsWith("TIMING") || health.startsWith("STILL")
      ? "text-bad-text"
      : "text-fg-3";

  const counts = s.bLog.reduce<Record<Outcome, number>>(
    (acc, o) => ({ ...acc, [o]: acc[o] + 1 }),
    { ok: 0, slow: 0, fast: 0, shed: 0 }
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[13px] text-fg-3">
          payments → bank-api · tick {s.bt}/{TICKS}
        </span>
        <span className="font-mono text-[13px] text-fg">
          score <span className="font-semibold text-signal-text">{s.bScore}</span> · blocked threads {s.bBlocked}
        </span>
      </div>

      <div
        role="img"
        aria-label={`Request outcomes per tick: ${s.bt} of ${TICKS} ticks played. ${counts.ok} ok, ${counts.slow} timed out, ${counts.fast} failed fast, ${counts.shed} shed while healthy.`}
        className="grid min-h-16 grid-cols-[repeat(15,minmax(0,1fr))] gap-[3px] sm:grid-cols-[repeat(30,minmax(0,1fr))]"
      >
        {Array.from({ length: TICKS }, (_, k) => {
          const o = s.bLog[k];
          return (
            <span
              key={k}
              className={`grid min-h-10 place-items-center text-[11px] ${o ? CELL[o] : "border border-line"}`}
            >
              {o === "slow" ? "✗" : o === "ok" ? "✓" : o === "fast" ? <Zap className="h-3 w-3" aria-hidden /> : o === "shed" ? "–" : ""}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`flex min-w-[150px] flex-col gap-1 px-4 py-3 ${
            s.bOpen ? "bg-signal text-on-signal" : "border border-fg bg-bg text-fg"
          }`}
        >
          <span className="font-mono text-[11px] tracking-label">BREAKER</span>
          <span className="font-mono text-[26px] font-semibold">{s.bOpen ? "OPEN" : "CLOSED"}</span>
        </div>
        <div className="flex min-w-[180px] flex-col gap-1 border border-line px-4 py-3">
          <span className="font-mono text-[11px] tracking-label text-fg-3">BANK-API HEALTH</span>
          <span className={`font-mono text-lg font-semibold ${healthClass}`}>{health}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={start} disabled={s.bRun} className={`${BTN_PRIMARY} min-h-12`}>
          {s.bRun ? "shift in progress…" : s.bt >= TICKS ? "new shift" : "start shift"}
        </button>
        <button type="button" onClick={toggle} disabled={!s.bRun} className={`${BTN_INVERT} min-h-12`}>
          {s.bOpen ? "close breaker" : "open breaker"}
        </button>
        <button
          type="button"
          onClick={probe}
          disabled={!s.bRun || !s.bOpen}
          className={`${BTN_GHOST} min-h-12`}
        >
          half-open probe
        </button>
      </div>

      <div className={`${MSG_BOX} text-sm leading-[1.55]`} aria-live="polite">
        {s.bMsg}
      </div>
    </>
  );
}
