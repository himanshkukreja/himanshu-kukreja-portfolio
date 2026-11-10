/**
 * "Reset problem": a fresh start on one problem that keeps the Bits already earned (owner, 10 Nov 2026). Pure and
 * import-free: the problem room, the game sync merge and the unit tests (scripts/tests/dsa-reset.test.mjs) share it.
 *
 * What a reset clears
 *   this device (localStorage)   dsa.code.<id>.<lang> for every language, dsa.hints.<id>, dsa.fails.<id>,
 *                                dsa.history.<id> (run and submit history), dsa.editorial.<id> (the "revealed early" flag),
 *                                and the guest progress record hk.lesson.v1 "dsa/problems/<id>"
 *   the account's game store     dsa:p:<id> (the solved mark; the map and every list read it)
 *   the account's tables         learning_progress (course dsa, week problems, this problem), dsa_submissions rows for it
 *                                and dsa_problem_progress (the editorial_viewed flag): POST /api/dsa/reset/<id>
 * What it keeps
 *   the Bits: the event key dsa:b:solve:<id>=<bits> stays, so a re-solve gains 0 Bits (dsaGrant sees the key and writes
 *   only the solved mark; the room then shows "solved before"). Also kept: the daily-problem key, streak days, badges.
 *
 * The solved mark has to stay gone after a sync. The game store merges by union, so deleting dsa:p:<id> alone would be
 * undone by the account's copy (or another device). A reset therefore also writes a tombstone `dsa:rs:<id>=<ms>`
 * (a key like the Bits events, higher time wins); a dsa:p:<id> stamped at or before the tombstone does not count,
 * everywhere: the merge (src/game/useGameSync.ts), the progress hook and the stats. Solving again writes a new
 * dsa:p:<id> stamped later, which counts again. Tombstones weigh nothing: no Bits, no XP.
 *
 * The editorial: after a reset the room is a fresh problem, so the editorial locks again, on the device (flag and
 * history cleared) and on the account (the reveal flag and the submissions are cleared, which is what the server's
 * unlock rule reads: src/lib/dsa/ai/unlock.ts). The AI tutor's no-spoiler rule therefore follows the room.
 */

const LANGS = ["python", "javascript", "java", "cpp"] as const;

/** Every localStorage key the problem room keeps for a problem (exactly these are cleared). */
export function deviceKeysFor(id: string): string[] {
  return [...LANGS.map((l) => `dsa.code.${id}.${l}`), `dsa.hints.${id}`, `dsa.fails.${id}`, `dsa.history.${id}`, `dsa.editorial.${id}`];
}

/** The guest progress record's key in hk.lesson.v1 for a solved problem. */
// DSA_COURSE_ID "dsa", DSA_PROBLEMS_WEEK "problems" (types.ts), repeated so this file stays import-free
export const guestLessonKeyFor = (id: string) => `dsa/problems/${id}`;

export const RESET_PREFIX = "dsa:rs:";
export const resetKey = (id: string, at: number) => `${RESET_PREFIX}${id}=${Math.max(0, Math.round(at))}`;

/** problem id → the latest reset time (ms) written in a done map. */
export function resetTimes(done: Record<string, number> | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of Object.keys(done || {})) {
    if (!k.startsWith(RESET_PREFIX)) continue;
    const eq = k.lastIndexOf("=");
    if (eq <= RESET_PREFIX.length) continue;
    const at = Number(k.slice(eq + 1));
    if (!Number.isFinite(at)) continue;
    const id = k.slice(RESET_PREFIX.length, eq);
    out.set(id, Math.max(out.get(id) || 0, at));
  }
  return out;
}

/** The done map without solved marks that a later reset undid. Returns the same object when nothing changes. */
export function applyResets(done: Record<string, number>): Record<string, number> {
  const resets = resetTimes(done);
  if (!resets.size) return done;
  let out: Record<string, number> | null = null;
  for (const [id, at] of resets) {
    const k = `dsa:p:${id}`;
    if (k in done && (Number(done[k]) || 0) <= at) {
      out = out || { ...done };
      delete out[k];
    }
  }
  return out || done;
}

/** The done map after resetting one problem at `now`: the solved mark removed, the tombstone added. Bits keys untouched. */
export function doneAfterReset(done: Record<string, number>, id: string, now: number): Record<string, number> {
  const out = { ...done };
  delete out[`dsa:p:${id}`];
  out[resetKey(id, now)] = now;
  return applyResets(out);
}
