/**
 * The Review tab's flip cards (pure; src/components/dsa/review/FlipReview.tsx runs it, scripts/tests/dsa-flip.test.mjs
 * tests it). The scheduler is unchanged: the Leitner boxes in src/lib/learn/review.ts. This file only maps the three
 * buttons (and keys, and swipes) onto its grades.
 *
 *   Again   → "again"  (back to box 1, due tomorrow)
 *   Hard    → "hard"   (stays in its box)
 *   Got it  → "good"   (up one box)
 * "easy" (two boxes up) is no longer a button on this tab; the scheduler still knows it.
 */
import type { ReviewGrade } from "@/lib/learn/review";

export type FlipChoice = "again" | "hard" | "got";

export const FLIP_CHOICES: { id: FlipChoice; label: string; key: string }[] = [
  { id: "again", label: "Again", key: "1" },
  { id: "hard", label: "Hard", key: "2" },
  { id: "got", label: "Got it", key: "3" },
];

const GRADE: Record<FlipChoice, ReviewGrade> = { again: "again", hard: "hard", got: "good" };

/** The scheduler grade for a button. */
export const gradeFor = (c: FlipChoice): ReviewGrade => GRADE[c];

/** The button a key stands for ("1", "2", "3"), or null. */
export function choiceForKey(key: string): FlipChoice | null {
  return FLIP_CHOICES.find((c) => c.key === key)?.id ?? null;
}

/** Swipe distance (px) that grades the card. */
export const SWIPE_AT = 80;

/** A horizontal swipe's grade: left is Again, right is Got it; short drags and mostly-vertical ones are nothing. */
export function choiceForSwipe(dx: number, dy: number): FlipChoice | null {
  if (Math.abs(dx) < SWIPE_AT || Math.abs(dx) < Math.abs(dy) * 1.2) return null;
  return dx < 0 ? "again" : "got";
}

/** "6 of 12 due" while on card 6 of a 12-card session (position is 0-based). */
export function progressLabel(position: number, total: number, practice = false): string {
  const n = Math.min(Math.max(position, 0) + 1, Math.max(total, 1));
  return `${n} of ${total}${practice ? " to practise" : " due"}`;
}

export const progressPct = (done: number, total: number) => (total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0);

/** The empty state's sentence: the next review among cards that are not due yet (days from today), if any. */
export function nextReviewLine(dueDays: number[]): string {
  const ahead = dueDays.filter((d) => d > 0);
  if (!ahead.length) return "Nothing due";
  const n = Math.min(...ahead);
  return `Nothing due — next review ${n === 1 ? "tomorrow" : `in ${n} days`}`;
}

/** A random sample for "Practise anyway" (Fisher-Yates over a copy; `rand` is injectable for tests). */
export function sampleCards<T>(items: T[], n: number, rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
