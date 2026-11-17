/**
 * In-lesson exercises and the "learnt" rule (owner, 17 Nov 2026). Pure and import-free, so the lesson readers, the footer
 * and scripts/tests/dsa-exercise-gate.test.mjs run the same code.
 *
 * A lesson counts as learnt only when its exercises are solved along with the reading rules (src/components/LessonProgressTracker.tsx).
 * Solved ids live as `dsa:ex:<lesson>:<id>` done keys (synced with the account, timestamped) and in `dsa.ex.<lesson>` on this
 * device; each solved exercise is worth BITS_TABLE.exercise Bits once (the key is the award, src/lib/dsa/rewards.ts).
 * A lesson already learnt (its `dsa:c:` key) is never un-learnt by exercises added later.
 */

export const exerciseKey = (lesson: string, id: string) => `dsa:ex:${lesson}:${id}`;

/**
 * The ids of the exercises in a rendered lesson, in page order, once each: `<figure ... data-dsa="exercise" data-id="<id>" ...>`.
 * The id attribute comes before `data-ex` (a JSON blob that may hold any character), so the scan stops there.
 */
export function exerciseIdsOf(html: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (html || "").matchAll(/<figure\b[^>]*?\bdata-dsa="exercise"[^>]*?\bdata-id="([^"]+)"/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** The exercise ids not solved yet. `done` is the game store's done map, `local` this device's ids for the lesson (dsa.ex.<lesson>). */
export function exercisesLeft(lesson: string, ids: readonly string[], done: Record<string, number> | null | undefined, local: Record<string, unknown> = {}): string[] {
  return ids.filter((id) => !(done && done[exerciseKey(lesson, id)]) && !local[id]);
}

/** "2 exercises left" / "1 exercise left" (empty when none are). */
export const exercisesLeftText = (n: number) => (n > 0 ? `${n} ${n === 1 ? "exercise" : "exercises"} left` : "");

/** How many exercises of a lesson a done map holds (solved ids, whatever the page lists today). */
export function exercisesSolved(done: Record<string, number> | null | undefined, lesson: string): number {
  const prefix = `dsa:ex:${lesson}:`;
  let n = 0;
  for (const k of Object.keys(done || {})) if (k.startsWith(prefix)) n++;
  return n;
}
