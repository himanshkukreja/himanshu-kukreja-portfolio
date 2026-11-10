/**
 * Solved/Unsolved view and progress summary (src/lib/dsa/problem-filters.ts), the Extra practice kind
 * (problem-rows.ts), "Reset problem" (src/lib/dsa/reset.ts) and "My stats" (src/lib/dsa/stats.ts).
 *   node --test scripts/tests/dsa-progress-features.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`),
);
const F = await import("../../src/lib/dsa/problem-filters.ts");
const { buildProblemData } = await import("../../src/lib/dsa/problem-rows.ts");
const R = await import("../../src/lib/dsa/reset.ts");
const S = await import("../../src/lib/dsa/stats.ts");
const { SOLVE_BITS, awardsOf, computeBits, eventKey, awardKeys } = await import("../../src/lib/dsa/rewards.ts");

const row = (id, level, extra = {}) => ({ id, title: id, seq: 1, order: 1, concept: "c", module: "m", level, rating: null, minutes: 10, kind: "practice", structures: [], algorithms: [], patterns: [], companies: [], video: false, tags: [], text: id, ...extra });

/* ------------------------------------------------------------ status view */

test("the segmented control is a shortcut onto the Status facet and the st= param", () => {
  let s = F.emptyState();
  assert.equal(F.statusViewOf(s), "all");
  s = F.withStatusView(s, "solved");
  assert.deepEqual(s.sel.status, ["solved"]);
  assert.equal(F.serializeState(s), "st=solved");
  assert.equal(F.statusViewOf(F.parseState("st=solved")), "solved");
  s = F.withStatusView(s, "unsolved");
  assert.equal(F.serializeState(s), "st=todo%2Ctried");
  assert.equal(F.statusViewOf(F.parseState("st=tried,todo")), "unsolved");
  assert.equal(F.statusViewOf(F.parseState("st=todo")), "all", "a single facet pick that is not a view reads as All");
  assert.deepEqual(F.withStatusView(s, "all").sel.status, []);
});

test("view counts come from the other filters, and Solved shows only solved rows", () => {
  const rows = [row("a", "easy"), row("b", "easy"), row("c", "medium"), row("d", "hard")];
  const solved = new Set(["a", "c"]);
  const tried = new Set(["b"]);
  const statusOf = (id) => (solved.has(id) ? "solved" : tried.has(id) ? "tried" : "todo");
  const all = F.evaluate(rows, F.emptyState(), statusOf);
  assert.deepEqual(F.statusViewCounts(all.counts.status), { all: 4, unsolved: 2, solved: 2 });
  const onlySolved = F.evaluate(rows, F.withStatusView(F.emptyState(), "solved"), statusOf);
  assert.deepEqual(onlySolved.results.map((r) => r.id), ["a", "c"]);
  assert.deepEqual(F.statusViewCounts(onlySolved.counts.status), { all: 4, unsolved: 2, solved: 2 }, "the counts stay the same while Solved is chosen");
  const easyOnly = F.evaluate(rows, { ...F.emptyState(), sel: { ...F.emptyState().sel, level: ["easy"] } }, statusOf);
  assert.deepEqual(F.statusViewCounts(easyOnly.counts.status), { all: 2, unsolved: 1, solved: 1 });
});

test("the progress summary covers the whole bank with the level split", () => {
  const rows = [row("a", "easy"), row("b", "easy"), row("c", "medium"), row("d", "hard")];
  const sum = F.solvedSummary(rows, (id) => id === "a" || id === "d");
  assert.equal(sum.solved, 2);
  assert.equal(sum.total, 4);
  assert.deepEqual(sum.byLevel, { easy: { solved: 1, total: 2 }, medium: { solved: 0, total: 1 }, hard: { solved: 1, total: 1 } });
});

test("a district problem is Extra practice, not Practice", () => {
  const p = (id, role) => ({ id, title: id, level: "easy", module: "m", concept: "c", order: 1, minutes: 5, role, patterns: [], classic: [], companyTypes: [], blurb: "" });
  const d = buildProblemData([p("x", "district"), p("y", undefined), p("z", "checkpoint")], { labels: {}, concepts: [], videos: [] });
  assert.deepEqual(d.rows.map((r) => r.kind), ["district", "practice", "checkpoint"]);
});

/* ------------------------------------------------------------ reset */

test("reset clears exactly the room's stored keys for the problem", () => {
  assert.deepEqual(R.deviceKeysFor("two-sum"), [
    "dsa.code.two-sum.python",
    "dsa.code.two-sum.javascript",
    "dsa.code.two-sum.java",
    "dsa.code.two-sum.cpp",
    "dsa.hints.two-sum",
    "dsa.fails.two-sum",
    "dsa.history.two-sum",
    "dsa.editorial.two-sum",
  ]);
  assert.equal(R.guestLessonKeyFor("two-sum"), "dsa/problems/two-sum");
});

test("reset drops the solved mark, keeps the Bits, and a later solve counts again without new Bits", () => {
  let done = { "dsa:p:two-sum": 1_000, [eventKey(awardKeys.solve("two-sum"), 18)]: 1_000, "dsa:daily:2026-11-09": 1_000 };
  const bitsBefore = computeBits(awardsOf(done)).total;
  done = R.doneAfterReset(done, "two-sum", 2_000);
  assert.ok(!("dsa:p:two-sum" in done));
  assert.equal(computeBits(awardsOf(done)).total, bitsBefore, "the Bits stay");
  assert.ok(Object.keys(done).some((k) => k.startsWith("dsa:rs:two-sum=")));
  // solving again: the event key exists, so no new Bits; the solved mark comes back stamped later
  done = { ...done, "dsa:p:two-sum": 3_000 };
  assert.equal(computeBits(awardsOf(done)).total, bitsBefore);
  assert.ok("dsa:p:two-sum" in R.applyResets(done));
});

test("a stale solved mark from another device or the account does not come back through the merge", () => {
  const done = { "dsa:p:a": 500, "dsa:p:b": 500, [R.resetKey("a", 1_000)]: 1_000 };
  const out = R.applyResets(done);
  assert.ok(!("dsa:p:a" in out) && "dsa:p:b" in out);
  const plain = { "dsa:p:b": 1 };
  assert.equal(R.applyResets(plain), plain, "nothing to undo returns the same map");
  assert.deepEqual([...R.resetTimes({ [R.resetKey("a", 5)]: 5, [R.resetKey("a", 9)]: 9 })], [["a", 9]]);
});

test("a reset tombstone is worth no Bits", () => {
  assert.equal(computeBits(awardsOf({ [R.resetKey("a", 5)]: 5 })).total, 0);
});

/* ------------------------------------------------------------ stats */

const DAY = 86_400_000;
const T = Date.UTC(2026, 10, 10, 12); // 10 Nov 2026, noon UTC
const at = (daysAgo) => T - daysAgo * DAY;
const rows = [
  { id: "a", level: "easy", module: "s1", structures: ["array"], algorithms: ["sorting"] },
  { id: "b", level: "medium", module: "s1", structures: ["array", "hash"], algorithms: [] },
  { id: "c", level: "hard", module: "s2", structures: ["tree"], algorithms: ["dfs"] },
  { id: "d", level: "easy", module: "s2", structures: ["tree"], algorithms: [] },
];

test("streaks: current survives until the day ends, longest is the best run", () => {
  const days = new Set(["2026-11-10", "2026-11-09", "2026-11-08", "2026-11-01", "2026-10-31", "2026-10-30", "2026-10-29"]);
  assert.deepEqual(S.streaksOf(days, "2026-11-10"), { current: 3, longest: 4 });
  assert.deepEqual(S.streaksOf(new Set(["2026-11-09"]), "2026-11-10"), { current: 1, longest: 1 }, "yesterday still counts today");
  assert.deepEqual(S.streaksOf(new Set(["2026-11-05"]), "2026-11-10"), { current: 0, longest: 1 });
});

test("a solve's bonuses read back out of its Bits", () => {
  const e = SOLVE_BITS.easy;
  assert.deepEqual(S.solveFactsFromBits("easy", e.base + e.firstTry + e.noHints, SOLVE_BITS), { firstTry: true, noHints: true });
  assert.deepEqual(S.solveFactsFromBits("easy", e.base + e.noHints, SOLVE_BITS), { firstTry: false, noHints: true });
  assert.deepEqual(S.solveFactsFromBits("medium", SOLVE_BITS.medium.base, SOLVE_BITS), { firstTry: false, noHints: false });
  assert.deepEqual(S.solveFactsFromBits("hard", 10, SOLVE_BITS), { firstTry: null, noHints: null }, "the editorial share is not a bonus combination");
  assert.deepEqual(S.solveFactsFromBits("easy", undefined, SOLVE_BITS), { firstTry: null, noHints: null });
});

test("stats aggregate solves, topics, activity, lessons and submissions", () => {
  const done = {
    "dsa:p:a": at(1), "dsa:p:b": at(0), "dsa:p:c": at(20),
    [eventKey(awardKeys.solve("a"), 18)]: at(1),
    [eventKey(awardKeys.solve("b"), 30)]: at(0),
    [eventKey(awardKeys.solve("c"), 40)]: at(20),
    "dsa:c:arrays": at(3), "dsa:s:arrays/see": at(3), "dsa:s:arrays/try": at(3), "dsa:cpq:n1": at(3), "dsa:lab:l1": at(2), "dsa:tr:t1": at(2),
    "dsa:lec:arrays": at(5),
  };
  const awards = awardsOf(done);
  const histories = { a: [{ at: at(1), lang: "python", verdict: "AC" }], c: [{ at: at(20), lang: "java", verdict: "AC" }, { at: at(21), lang: "java", verdict: "WA" }] };
  const solveBits = { a: 18, b: 30, c: 40 };
  const st = S.computeStats({ done, solved: new Set(["a", "b", "c"]), rows, histories, solveBits, tiers: SOLVE_BITS, awards, now: T, tzOffsetMin: 0 });
  assert.equal(st.solved.total, 3);
  assert.deepEqual(st.solved.byLevel, { easy: { solved: 1, total: 2 }, medium: { solved: 1, total: 1 }, hard: { solved: 1, total: 1 } });
  assert.deepEqual(st.solved.byStructure.map((b) => [b.id, b.solved, b.total]), [["array", 2, 2], ["hash", 1, 1], ["tree", 1, 2]]);
  assert.deepEqual(st.solved.byStep.map((b) => [b.id, b.solved, b.total]), [["s1", 2, 2], ["s2", 1, 2]]);
  assert.deepEqual(st.lessons, { lessons: 1, steps: 2, quizzes: 1, labs: 1, dryRuns: 1 });
  assert.equal(st.videos.lectures, 1);
  assert.deepEqual(st.submissions.languages, { python: 1, java: 2 });
  assert.equal(st.submissions.total, 3);
  assert.equal(st.submissions.rate, 67);
  assert.equal(st.submissions.firstTry, 2, "a and b first try; c (40) is the base only");
  assert.equal(st.submissions.noHints, 1, "only a had no hints (b's 35 is base + first try)");
  assert.equal(st.activity.current, 4, "today back to the lesson three days ago");
  assert.ok(st.activity.longest >= 2);
  assert.equal(st.activity.heat.length % 7, 0);
  assert.equal(st.weekly.length, 26);
  assert.equal(st.weekly.reduce((n, w) => n + w.solves, 0), 3);
  assert.equal(st.weekly[25].bitsTotal, computeBits(awards).total, "the Bits line ends at the total");
});

test("a new learner has empty stats, not errors", () => {
  const st = S.computeStats({ done: {}, solved: new Set(), rows, histories: {}, solveBits: {}, tiers: SOLVE_BITS, awards: [], now: T, tzOffsetMin: 0 });
  assert.equal(st.solved.total, 0);
  assert.equal(st.activity.activeDays, 0);
  assert.equal(st.submissions.rate, null);
  assert.deepEqual(st.solved.byStructure, []);
});
