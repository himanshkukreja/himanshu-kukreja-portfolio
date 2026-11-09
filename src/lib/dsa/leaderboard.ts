import type { BeltId } from "./rewards";

/**
 * The DSA Mastery leaderboard's response (GET /api/dsa/leaderboard?period=week|all). DSA only: Bits and belts, never
 * SD Mastery XP or the Arena board. Built from each signed-in learner's `dsa_bits` summary in game_flags
 * (src/lib/dsa/rewards.ts bitsFlagOf), so it needs no new table. Names are "First L." for public profiles and
 * engineer-xxxx otherwise, never emails or ids.
 */
export type DsaBoardRow = { rank: number; name: string; bits: number; belt: BeltId; me?: true };

export type DsaBoardResponse = {
  period: "week" | "all";
  /** Monday (IST) of the week the weekly board counts */
  weekStart: string;
  players: number;
  rows: DsaBoardRow[];
  /** the signed-in viewer (Authorization header): their rank and Bits on this board, null when not on it */
  me: { rank: number | null; bits: number } | null;
  generatedAt: string;
};
