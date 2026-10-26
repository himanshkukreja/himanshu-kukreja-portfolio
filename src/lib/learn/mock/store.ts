"use client";

/**
 * Mock interview state on the client.
 * - The run in progress (notes, whiteboard, clock, prompts fired, self-scores) lives in this
 *   browser only: localStorage `hk.mock.v1:<id>`. Nothing is sent to the server.
 * - Results go through the game engine, which syncs to the account for signed-in learners:
 *   done keys `mock:<id>` (+150 XP) and `offer:<id>` (+100 XP), and a small flag `mock:<id>`
 *   with the best and last verdict.
 */
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import type { CourseMock, MockLevel } from "./types";
import { mockDoneKey, mockFlagKey, mockOfferKey, mockStoreKey } from "./types";
import type { SignalScore, Verdict } from "./score";
import { VERDICTS } from "./score";

export type Screen = "lobby" | "room" | "debrief";

export type MockResult = { at: number; level: MockLevel; verdict: Verdict; pct: number };

export type MockRun = {
  v: 1;
  /** content version the scores belong to */
  version: string;
  screen: Screen;
  level: MockLevel;
  phase: number;
  maxPhase: number;
  /** seconds on the clock per phase id */
  used: Record<string, number>;
  /** message id → overall seconds when it arrived */
  fired: Record<string, number>;
  /** phase id → Done pressed once */
  submitted: Record<string, boolean>;
  notes: Record<string, string>;
  /** curveball id → answer */
  answers: Record<string, string>;
  board: string;
  /** the whiteboard drawing (Excalidraw scene JSON); `board` keeps the text notes */
  sketch?: string;
  /** phase id → hints shown */
  hints: Record<string, number>;
  pauses: number;
  scores: Record<string, SignalScore>;
  /** phase id → model answer open in the debrief */
  revealed: Record<string, boolean>;
  startedAt: number | null;
  endedAt: number | null;
  /** a round started and not yet debriefed */
  live: boolean;
  /** this attempt's scorecard was submitted */
  claimed: boolean;
  attempt: number;
  history: MockResult[];
};

export const freshRun = (version: string, level: MockLevel, keep?: Pick<MockRun, "attempt" | "history">): MockRun => ({
  v: 1,
  version,
  screen: "lobby",
  level,
  phase: 0,
  maxPhase: 0,
  used: {},
  fired: {},
  submitted: {},
  notes: {},
  answers: {},
  board: "",
  sketch: "",
  hints: {},
  pauses: 0,
  scores: {},
  revealed: {},
  startedAt: null,
  endedAt: null,
  live: false,
  claimed: false,
  attempt: keep?.attempt ?? 0,
  history: keep?.history ?? [],
});

export function readRun(id: string): MockRun | null {
  try {
    const raw = window.localStorage.getItem(mockStoreKey(id));
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<MockRun>;
    return r && r.v === 1 ? ({ ...freshRun(r.version || "", r.level || "sde"), ...r } as MockRun) : null;
  } catch {
    return null;
  }
}

export function writeRun(id: string, run: MockRun) {
  try {
    window.localStorage.setItem(mockStoreKey(id), JSON.stringify(run));
  } catch {
    // storage full or blocked: the round still works for this visit
  }
}

/** Result summary kept in the game flags (synced for signed-in learners). */
export type MockFlag = { best: MockResult; last: MockResult; n: number };

export function readFlag(v: unknown): MockFlag | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Partial<MockFlag>;
  return f.best && f.last && VERDICTS.includes(f.best.verdict) ? (f as MockFlag) : null;
}

export function nextFlag(prev: MockFlag | null, r: MockResult): MockFlag {
  const better = !prev || VERDICTS.indexOf(r.verdict) > VERDICTS.indexOf(prev.best.verdict) || (r.verdict === prev.best.verdict && r.pct > prev.best.pct);
  return { best: better ? r : prev!.best, last: r, n: (prev?.n || 0) + 1 };
}

export type MockStatus = {
  mock: CourseMock;
  state: "done" | "live" | "ready" | "ahead";
  result: MockFlag | null;
  offer: boolean;
};

/**
 * Status of every mock for the hub and progress page: done (scorecard submitted), live (a round
 * in progress on this device), ready (the world it follows has been started) or ahead.
 */
export function useMockStatus(mocks: CourseMock[] | undefined, startedWeeks: Set<string> | null): MockStatus[] {
  const { done, flags, hydrated } = useGame();
  const [live, setLive] = useState<Record<string, boolean>>({});
  const list = useMemo(() => mocks || [], [mocks]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next: Record<string, boolean> = {};
      list.forEach((m) => (next[m.id] = !!readRun(m.id)?.live));
      setLive(next);
    }, 0);
    return () => window.clearTimeout(t);
  }, [list]);
  return useMemo(
    () =>
      list.map((m) => {
        const d = hydrated && !!done[mockDoneKey(m.id)];
        const result = hydrated ? readFlag(flags[mockFlagKey(m.id)]) : null;
        const state: MockStatus["state"] = d ? "done" : live[m.id] ? "live" : startedWeeks?.has(m.after) ? "ready" : "ahead";
        return { mock: m, state, result: d ? result : null, offer: hydrated && !!done[mockOfferKey(m.id)] };
      }),
    [list, done, flags, hydrated, live, startedWeeks]
  );
}
