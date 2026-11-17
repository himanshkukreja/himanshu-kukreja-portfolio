/**
 * The Review tab's flip-card mapping (src/lib/dsa/flip.ts) on top of the unchanged Leitner scheduler.
 *   node --test scripts/tests/dsa-flip.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { FLIP_CHOICES, choiceForKey, choiceForSwipe, gradeFor, nextReviewLine, progressLabel, progressPct, sampleCards } from "../../src/lib/dsa/flip.ts";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// the real scheduler functions, cut out of src/lib/learn/review.ts (the file itself imports the browser client)
const src = readFileSync(new URL("../../src/lib/learn/review.ts", import.meta.url), "utf8");
const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to)).replace(/^export /gm, "");
const body = cut("export const LEITNER_INTERVALS", "export const REVIEW_XP_PER_CARD") + cut("export function intervalForBox", "export function schedule");
const { intervalForBox, nextBox } = new Function(`${stripTypeScriptTypes(body)}; return { intervalForBox, nextBox };`)();

test("buttons map to the existing scheduler grades", () => {
  assert.deepEqual(FLIP_CHOICES.map((c) => [c.label, c.key, gradeFor(c.id)]), [["Again", "1", "again"], ["Hard", "2", "hard"], ["Got it", "3", "good"]]);
});

test("the schedule they produce: Again resets, Hard stays, Got it moves up one box", () => {
  assert.equal(nextBox(gradeFor("again"), 4), 1);
  assert.equal(nextBox(gradeFor("hard"), 4), 4);
  assert.equal(nextBox(gradeFor("got"), 4), 5);
  assert.equal(nextBox(gradeFor("got"), 5), 5);
  assert.equal(intervalForBox(nextBox(gradeFor("got"), 1)), 3);
});

test("keys 1, 2, 3 grade; others do nothing", () => {
  assert.equal(choiceForKey("1"), "again");
  assert.equal(choiceForKey("2"), "hard");
  assert.equal(choiceForKey("3"), "got");
  for (const k of ["4", " ", "a", "0", "Enter"]) assert.equal(choiceForKey(k), null);
});

test("swipe: left Again, right Got it, short or vertical drags nothing", () => {
  assert.equal(choiceForSwipe(-120, 10), "again");
  assert.equal(choiceForSwipe(120, -20), "got");
  assert.equal(choiceForSwipe(-40, 0), null);
  assert.equal(choiceForSwipe(90, 140), null);
});

test("progress label and bar", () => {
  assert.equal(progressLabel(5, 12), "6 of 12 due");
  assert.equal(progressLabel(0, 3, true), "1 of 3 to practise");
  assert.equal(progressPct(6, 12), 50);
  assert.equal(progressPct(0, 0), 0);
});

test("empty state names the next review", () => {
  assert.equal(nextReviewLine([2, 5, 9]), "Nothing due — next review in 2 days");
  assert.equal(nextReviewLine([-1, 1]), "Nothing due — next review tomorrow");
  assert.equal(nextReviewLine([]), "Nothing due");
});

test("practice sample keeps distinct cards and never mutates the pool", () => {
  const pool = Array.from({ length: 30 }, (_, i) => i);
  const s = sampleCards(pool, 10);
  assert.equal(s.length, 10);
  assert.equal(new Set(s).size, 10);
  assert.equal(pool.length, 30);
  assert.deepEqual(sampleCards([1, 2], 10, () => 0).sort(), [1, 2]);
});
