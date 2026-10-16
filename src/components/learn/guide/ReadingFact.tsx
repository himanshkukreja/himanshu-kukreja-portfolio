"use client";

/**
 * The reading rules (READING in src/lib/learn/engagedClock.ts) are a client module, so the server
 * guide can't read them directly; this renders one of them (still server-side rendered as text).
 */
import { READING } from "@/lib/learn/engagedClock";

const VALUES = {
  share: `${Math.round(READING.share * 100)}%`,
  minSec: `${READING.minSec} seconds`,
  maxSec: `${Math.round(READING.maxSec / 60)} minutes`,
  coverage: `${Math.round(READING.coverage * 100)}%`,
  completeShare: `${Math.round(READING.completeShare * 100)}%`,
  idle: `${Math.round(READING.idleMs / 1000)} seconds`,
} as const;

export type ReadingKey = keyof typeof VALUES;

export default function ReadingFact({ k }: { k: ReadingKey }) {
  return <>{VALUES[k]}</>;
}
