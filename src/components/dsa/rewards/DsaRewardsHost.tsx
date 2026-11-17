"use client";

/**
 * Background awards on every DSA Mastery page (mounted with the header's Bits chip, renders nothing):
 *   - mastery badges: the badge definitions (/api/dsa/badges, once per page load) against the learner's progress;
 *     a newly complete module or world grants its badge Bits once (badge:<id>);
 *   - daily streak milestones (3, 7, 14, 30, 60, 100 days in a row), once each (streak:<days>);
 *   - the welcome bonus for accounts that finished the onboarding before Bits existed (flag dsa:welcome-bonus);
 *   - the leaderboard summary (game_flags.dsa_bits: total, this week, belt) for signed-in learners, rewritten when it
 *     changes, so the DSA board reads one small object per learner.
 * Everything is idempotent (stable award keys), so running on every page is safe.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { istDate, istMidnight, weekStartOf } from "@/lib/learn/arena/shared";
import {
  awardKeys,
  awardsOf,
  bitsFlagOf,
  DSA_BITS_FLAG,
  DSA_WELCOME_BONUS,
  DSA_WELCOME_FLAG,
  earnedBadges,
  eventBits,
  streakMilestones,
  type BadgeDef,
  type DsaBitsFlag,
} from "@/lib/dsa/rewards";
import { useDsaProgress } from "@/components/dsa/progress/useDsaProgress";
import { useDsaStreak } from "@/components/dsa/daily/useDsaDaily";
import { announceTool, dsaGrant } from "./award";
import { STATIONS } from "@/lib/dsa/metro/layout";
import { TOOLS, newlyEarned, toolKey } from "@/lib/dsa/metro/toolbox";

let defsP: Promise<BadgeDef[] | null> | null = null;
let stationsP: Promise<{ id: string; lessonIds: string[] }[] | null> | null = null;

/** The stations and their written lessons, fetched once per page load (null when unavailable). */
function fetchStations() {
  if (!stationsP) {
    stationsP = fetch("/api/dsa/toolbox")
      .then((r) => (r.ok ? (r.json() as Promise<{ stations: { id: string; lessonIds: string[] }[] }>) : null))
      .then((j) => j?.stations ?? null)
      .catch(() => null);
    void stationsP.then((v) => {
      if (!v) stationsP = null;
    });
  }
  return stationsP;
}

/** The badge definitions, fetched once per page load and shared (null when unavailable). */
export function fetchBadgeDefs(): Promise<BadgeDef[] | null> {
  if (!defsP) {
    defsP = fetch("/api/dsa/badges")
      .then((r) => (r.ok ? (r.json() as Promise<{ defs: BadgeDef[] }>) : null))
      .then((j) => j?.defs ?? null)
      .catch(() => null);
    void defsP.then((v) => {
      if (!v) defsP = null;
    });
  }
  return defsP;
}

export function useBadgeDefs(initial?: BadgeDef[] | null): BadgeDef[] | null {
  const [defs, setDefs] = useState<BadgeDef[] | null>(initial ?? null);
  useEffect(() => {
    if (initial) return;
    let off = false;
    void fetchBadgeDefs().then((d) => {
      if (!off) setDefs(d);
    });
    return () => {
      off = true;
    };
  }, [initial]);
  return defs;
}

export default function DsaRewardsHost() {
  const { user } = useAuth();
  const { done, flags, hydrated, markDone, peekDone, setFlag } = useGame();
  const progress = useDsaProgress();
  const streak = useDsaStreak();
  const defs = useBadgeDefs();
  // both are stable callbacks of the game provider
  const game = useMemo(() => ({ markDone, peekDone }), [markDone, peekDone]);

  // mastery badges
  useEffect(() => {
    if (!defs || !progress.ready) return;
    const earned = earnedBadges(defs, progress);
    for (const d of defs) {
      if (!earned.has(d.id)) continue;
      const label = d.kind === "world" ? `Badge · ${d.name} complete` : `Badge · ${d.name} mastered`;
      dsaGrant(game, awardKeys.badge(d.id), d.bits, label);
    }
  }, [defs, progress, game]);

  // tools: a finished station earns its tool. The key is written once (so the toast is a one-time event, on every device);
  // a station finished before tools existed is recorded without a toast
  const [stations, setStations] = useState<{ id: string; lessonIds: string[] }[] | null>(null);
  useEffect(() => {
    let off = false;
    void fetchStations().then((v) => {
      if (!off) setStations(v);
    });
    return () => {
      off = true;
    };
  }, []);
  useEffect(() => {
    if (!stations || !progress.ready || !hydrated) return;
    const now = Date.now();
    const { record, announce } = newlyEarned(stations, progress.concepts, game.peekDone(), now);
    if (!record.length) return;
    const { added } = game.markDone(record.map(toolKey));
    for (const key of added) {
      const id = key.slice("dsa:tool:".length);
      if (announce.includes(id)) announceTool({ station: STATIONS.find((x) => x.id === id)?.label ?? id, name: TOOLS[id]?.name ?? id, icon: TOOLS[id]?.icon ?? "layers" });
    }
  }, [stations, progress.ready, progress.concepts, hydrated, game, done]);

  // daily streak milestones
  useEffect(() => {
    if (!streak) return;
    for (const m of streakMilestones(Math.max(streak.best, streak.current))) dsaGrant(game, awardKeys.streak(m.days), m.bits, `Daily streak · ${m.days} days in a row`);
  }, [streak, game]);

  // the welcome bonus, for accounts onboarded before Bits existed
  const welcomed = !!flags[DSA_WELCOME_FLAG];
  useEffect(() => {
    if (!hydrated || !welcomed) return;
    if (eventBits(game.peekDone(), awardKeys.welcome()) < 0) dsaGrant(game, awardKeys.welcome(), DSA_WELCOME_BONUS.amount, "Welcome to DSA Mastery");
  }, [hydrated, welcomed, game]);

  // the leaderboard summary (signed in only: guests have no board row)
  const signedIn = !!user;
  const stored = flags[DSA_BITS_FLAG] as DsaBitsFlag | undefined;
  useEffect(() => {
    if (!hydrated || !signedIn) return;
    const t = window.setTimeout(() => {
      const wk = weekStartOf(istDate());
      const next = bitsFlagOf(awardsOf(game.peekDone()), wk, istMidnight(wk));
      if (stored && stored.b === next.b && stored.w === next.w && stored.wk === next.wk && stored.belt === next.belt) return;
      if (!stored && next.b === 0) return;
      setFlag(DSA_BITS_FLAG, next);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [hydrated, signedIn, done, stored, setFlag, game]);

  return null;
}
