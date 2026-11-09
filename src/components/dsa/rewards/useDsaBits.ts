"use client";

/**
 * The learner's DSA Mastery Bits and belt (computed from the game store on every change) and the award functions.
 * DSA's own currency: SD Mastery's XP and level are untouched (src/lib/dsa/rewards.ts).
 */
import { useCallback, useMemo } from "react";
import { useGame } from "@/game/GameProvider";
import { awardsOf, beltFor, computeBits, type Award, type AwardKind, type BeltProgress } from "@/lib/dsa/rewards";
import { dsaAward, dsaGrant } from "./award";

export type DsaBits = {
  ready: boolean;
  bits: number;
  belt: BeltProgress;
  awards: Award[];
  byKind: Partial<Record<AwardKind, number>>;
  /** mark progress keys done and toast the Bits they add */
  award: (keys: string[], label: string) => number;
  /** an event award once (or upgraded, with upgrade) */
  grant: (awardKey: string, bits: number, label: string, opts?: { upgrade?: boolean; also?: string[]; quiet?: boolean }) => number;
};

/** Only the award functions (no totals computed): for components that award but don't show Bits. */
export function useDsaAward(): Pick<DsaBits, "award" | "grant"> {
  const { markDone, peekDone } = useGame();
  const award = useCallback((keys: string[], label: string) => dsaAward({ markDone, peekDone }, keys, label), [markDone, peekDone]);
  const grant = useCallback<DsaBits["grant"]>((k, b, label, opts) => dsaGrant({ markDone, peekDone }, k, b, label, opts), [markDone, peekDone]);
  return useMemo(() => ({ award, grant }), [award, grant]);
}

/**
 * LessonProgressProvider's `award` for DSA lessons: a beat (dsa:s:) or the finished lesson (dsa:c:) earns its Bits
 * once; the XP amount the course engine passes is ignored.
 */
export function useDsaLessonAward(): (key: string, xp: number, label: string) => number {
  const { award } = useDsaAward();
  return useCallback((key: string, _xp: number, label: string) => award([key], label), [award]);
}

export function useDsaBits(): DsaBits {
  const { done, hydrated } = useGame();
  const { award, grant } = useDsaAward();
  const summary = useMemo(() => {
    const awards = awardsOf(hydrated ? done : {});
    const s = computeBits(awards);
    return { awards, bits: s.total, byKind: s.byKind, belt: beltFor(s.total) };
  }, [done, hydrated]);
  return { ready: hydrated, ...summary, award, grant };
}
