/**
 * The daily warm-up (src/lib/dsa/warmup.ts): reading questions from a lesson, tiers, the deterministic daily pick, the
 * activity key.   node --test scripts/tests/dsa-warmup.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fencesOf, parseQuizFence, pickWarmup, recentConcepts, shuffledOrder, warmDaysOf, warmDoneToday, warmKey, warmSeed } from "../../src/lib/dsa/warmup.ts";

const META = { concept: "prefix-sums", lesson: "Prefix sums", href: "/dsa/concepts/prefix-sums" };
const LESSON = `intro

::::beat[x]
\`\`\`python
x = 1
\`\`\`
\`\`\`quiz
%% title: Predict the cost
? A log holds 100,000 opens. How many earlier opens does the last open read?
- [ ] About 100
- [x] About 100,000
- [ ] About 10^10
> The last open reads every earlier open. So the work grows with the log.

? Which is the code below doing?
- [x] a
- [ ] b
> never shown, the question points at code.

? Two right answers?
- [x] a
- [x] b
> skipped.
\`\`\`
::::
`;

test("fences are found by language and quiz questions parse", () => {
  const f = fencesOf(LESSON, "quiz");
  assert.equal(f.length, 1);
  const qs = parseQuizFence(f[0], META);
  assert.equal(qs.length, 1, "questions that point at code or have two answers are left out");
  assert.equal(qs[0].options.length, 3);
  assert.equal(qs[0].options[qs[0].answer], "About 100,000");
  assert.equal(qs[0].why, "The last open reads every earlier open. So the work grows with the log.");
  assert.match(qs[0].id, /^prefix-sums:/);
  assert.equal(fencesOf(LESSON, "python").length, 1);
});

const q = (id) => ({ ...META, id, kind: "quiz", question: id, options: ["a", "b"], answer: 0, why: "w" });
const A = ["a1", "a2", "a3", "a4", "a5"].map(q);
const B = ["b1", "b2", "b3"].map(q);
const C = ["c1", "c2"].map(q);

test("the pick is the same all day for a learner, and uses the first tier with questions", () => {
  const seed = warmSeed("user-1", "2026-11-17");
  const p1 = pickWarmup([A, B, C], seed);
  assert.equal(pickWarmup([A, B, C], seed).q.id, p1.q.id);
  assert.equal(p1.tier, 0);
  assert.ok(A.some((x) => x.id === p1.q.id));
  assert.equal(pickWarmup([[], B, C], seed).tier, 1);
  assert.equal(pickWarmup([[], [], C], seed).tier, 2);
  assert.equal(pickWarmup([[], [], []], seed), null);
});

test("it changes from day to day and from learner to learner", () => {
  const days = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
  assert.ok(new Set(days.map((d) => pickWarmup([A], warmSeed("u", d)).q.id)).size >= 3);
  const users = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"];
  assert.ok(new Set(users.map((u) => pickWarmup([A], warmSeed(u, "2026-11-17")).q.id)).size >= 2);
});

test("a bigger pool rarely moves the day's question (minimum hash)", () => {
  const seed = warmSeed("u", "2026-11-17");
  const before = pickWarmup([A], seed).q.id;
  const after = pickWarmup([[...A, q("a6")]], seed).q.id;
  assert.ok(after === before || after === "a6");
});

test("recent lessons: newest first, steps count, no duplicates", () => {
  const done = { "dsa:c:one": 100, "dsa:s:two/read": 300, "dsa:s:two/try": 250, "dsa:c:three": 200, "dsa:p:problem": 900, "dsa:daily:2026-11-16": 800 };
  assert.deepEqual(recentConcepts(done, 5), ["two", "three", "one"]);
  assert.deepEqual(recentConcepts(done, 2), ["two", "three"]);
  assert.deepEqual(recentConcepts({}, 5), []);
  assert.deepEqual(recentConcepts(null), []);
});

test("options keep every choice, in a fixed order per seed", () => {
  const o = shuffledOrder(4, "x");
  assert.deepEqual([...o].sort(), [0, 1, 2, 3]);
  assert.deepEqual(shuffledOrder(4, "x"), o);
});

test("the activity key", () => {
  assert.equal(warmKey("2026-11-17"), "dsa:warm:2026-11-17");
  assert.equal(warmDoneToday({ "dsa:warm:2026-11-17": 1 }, "2026-11-17"), true);
  assert.equal(warmDoneToday({ "dsa:warm:2026-11-16": 1 }, "2026-11-17"), false);
  assert.deepEqual([...warmDaysOf({ "dsa:warm:2026-11-16": 1, "dsa:c:x": 2, "dsa:warm:2026-11-17": 3 })].sort(), ["2026-11-16", "2026-11-17"]);
});
