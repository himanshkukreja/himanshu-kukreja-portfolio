import type { ReactNode } from "react";
import type { Stage } from "@/lib/course/types";

export const BOSS_XP = 200;
export const bossKey = (week: string) => `boss:${week}`;

/** A capstone phase: a stage plus its number and the interviewer's opening line. */
export type Phase = Stage & { n: number; prompt: string | null };

export const mmss = (sec: number) => {
  const a = Math.abs(Math.round(sec));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};

/**
 * Copy and reward for a boss-mode run. Capstones fight the week's boss (`boss:<week>`, +200 XP);
 * side quests run the same timed phases as a "timed run" that pays the existing side-quest bonus
 * key (`sidequest:<slug>`) if the quest hasn't paid it already. No new XP keys.
 */
export type RunCopy = {
  quest: boolean;
  xp: number;
  /** "Boss" / "Timed run" */
  noun: string;
  /** "Boss defeated" / "Quest run cleared" */
  win: string;
  /** "DEFEATED ✓" / "CLEARED ✓" */
  badge: string;
  /** "capstone" / "side quest" */
  source: string;
  /** briefing art in place of the boss diamond (the side quest's emblem) */
  art?: ReactNode;
};

export const BOSS_COPY: RunCopy = { quest: false, xp: BOSS_XP, noun: "Boss", win: "Boss defeated", badge: "DEFEATED ✓", source: "capstone" };
