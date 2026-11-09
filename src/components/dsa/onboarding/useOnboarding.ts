"use client";

import { useMemo } from "react";
import { useGame } from "@/game/GameProvider";
import { readRecord, type OnboardingRecord } from "@/lib/dsa/onboarding/recommend";
import { resolveStartRegion } from "@/lib/dsa/map/progress";
import type { WorldSpec } from "@/lib/dsa/types";

/** The learner's onboarding record (account flag `pref:dsa-onboarding`, which the game keeps on this device and syncs). */
export function useOnboardingRecord(): OnboardingRecord | null {
  const { flags } = useGame();
  return useMemo(() => readRecord(flags), [flags]);
}

/**
 * The Academy region the onboarding recommended, resolved against what is written (null for guests, skipped runs and
 * when nothing from there on is built). Only a recommendation: it moves "Continue" and highlights a building.
 */
export function useRecommendedStart(spec: WorldSpec | null): string | null {
  const rec = useOnboardingRecord();
  return useMemo(() => (spec && rec && rec.status === "done" ? resolveStartRegion(spec, rec.start) : null), [spec, rec]);
}

/** Opens the onboarding again (the More menu, the hub's quiet link). */
export const ONBOARDING_OPEN_EVENT = "dsa:onboarding-open";
export const openOnboarding = () => window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT));
