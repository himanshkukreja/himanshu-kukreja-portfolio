import type { Stage } from "@/lib/course/types";

export const BOSS_XP = 200;
export const bossKey = (week: string) => `boss:${week}`;

/** A capstone phase: a stage plus its number and the interviewer's opening line. */
export type Phase = Stage & { n: number; prompt: string | null };

export const mmss = (sec: number) => {
  const a = Math.abs(Math.round(sec));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};
