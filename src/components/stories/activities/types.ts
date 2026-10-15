import type { ReactNode } from "react";

/** Handed to every step. `done(score)` ends the step (call it once, from an event handler). */
export type StepCtx = {
  done: (score: number) => void;
  /** prefers-reduced-motion: skip animations, jump to end states. */
  reduced: boolean;
};

export type ActivityStep = {
  id: string;
  /** Short label for the progress rail, e.g. "Run the rush". */
  label: string;
  /** Points available in this step. */
  max: number;
  render: (ctx: StepCtx) => ReactNode;
};

export type ActivityDef = {
  /** Format, used for analytics and the chip in the header, e.g. "simulation", "spot the bug". */
  kind: string;
  title: string;
  blurb: string;
  /** Rough play time shown before starting. */
  minutes: number;
  steps: ActivityStep[];
};

/** Game flag holding per-story results: { [slug]: { best, max, runs } }. */
export const ACTIVITY_FLAG = "caseActivities";
/** awardOnce() key prefix; one per story. The "Case cracker" badge counts these. */
export const ACTIVITY_KEY_PREFIX = "caseplay:";
export const ACTIVITY_XP = 25;
/**
 * Share of the points a run needs before it counts as "solved": the XP, the SOLVED ◆ chip on the index and the
 * Case cracker quest all key off it. Every step is built so that guessing, "pick everything" or "always the
 * same option" lands under this line.
 */
export const PASS_RATIO = 0.7;

export function passScore(max: number): number {
  return Math.ceil(max * PASS_RATIO);
}
/** Quest (catalog.ts) awarded once every story below has its activity solved. */
export const ALL_ACTIVITIES_QUEST = "cases:all";

/** Every story that ships an end-of-file activity (see ./registry.tsx). */
export const ACTIVITY_SLUGS = [
  "irctc-tatkal-500-seats-2-million-users",
  "integer-overflow-auto-increment-crisis",
  "leader-follower-replication-node-outages",
  "cdn-cache-poisoning-disaster",
  "digipin-scalable-location-service",
  "scalable-spam-detection-bloom-filter",
  "distributed-transactions-2pc-saga-pattern",
  "websockets-vs-webrtc-video-communication",
  "ios-bridge-cross-platform-streaming",
  "bridgelink-remote-android-testing",
] as const;

export type ActivityResult = { best: number; max: number; runs: number };

/** A stored result counts as solved only when its best run cleared the pass line. */
export function isSolved(r: ActivityResult | undefined): boolean {
  return !!r && r.max > 0 && r.best >= passScore(r.max);
}

export function readActivityResults(raw: unknown): Record<string, ActivityResult> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, ActivityResult> = {};
  for (const [slug, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Partial<ActivityResult>;
    if (typeof r.best === "number" && typeof r.max === "number") out[slug] = { best: r.best, max: r.max, runs: Number(r.runs) || 1 };
  }
  return out;
}
