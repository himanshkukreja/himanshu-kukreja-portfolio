/**
 * The course chat's view of practice beyond lessons and of DSA Mastery (lib/ai/chat/practice-model.ts): code labs,
 * war rooms, papers, quick checks and mock verdicts from game_done / game_flags, and the DSA digest (AI audit
 * 12 Nov 2026: the chat ignored the cleared LRU lab and told a learner with 5 DSA solves "no coding problems are logged").
 *   node --test scripts/tests/chat-practice.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { dsaDigest, practiceOf, STORED_NOTE } from "../../src/lib/ai/chat/practice-model.ts";

const DAY = 86_400_000;
const T = Date.parse("2026-11-12T10:00:00Z");
const map = { mocks: [{ id: "mock-03-flipkart-cart", slug: "mock-03-flipkart-cart", title: "Cart at sale scale", company: "Flipkart" }] };
const titleOf = new Map([["week-04-caching/day-02-cache-invalidation", { title: "Invalidation Strategies" }]]);

test("labs, war rooms, papers, drills, explains and quick checks come from game_done", () => {
  const done = {
    "lab:lru-cache": T - 2 * DAY,
    "lab-iv:lru-cache": T - DAY,
    "lab-iv:token-bucket": T - 3 * DAY,
    "warroom:black-friday-db": T - 4 * DAY,
    "paper:w04-caching": T - 5 * DAY,
    "drill:url-shortener#d2": T,
    "explain:two-pointers": T - DAY,
    "quiz:system-design-mastery/week-04-caching/day-02-cache-invalidation:1:2": T - DAY,
    "quiz:system-design-mastery/week-04-caching/day-02-cache-invalidation:2:1": T - 2 * DAY,
    "quiz:ace": T,
    "dsa:lab:grid-search": T,
    "lesson:week-04-caching/day-01-caching-patterns": T,
  };
  const p = practiceOf(done, {}, map, titleOf);
  assert.deepEqual(p.labs, [
    { id: "lru-cache", cleared: T - 2 * DAY, interview: T - DAY },
    { id: "token-bucket", cleared: 0, interview: T - 3 * DAY },
  ]);
  assert.deepEqual(p.warRooms, [{ slug: "black-friday-db", at: T - 4 * DAY }]);
  assert.deepEqual(p.papers, [{ key: "w04-caching", passed: T - 5 * DAY, best: null, attempts: 0 }]);
  assert.deepEqual(p.drills, [{ id: "url-shortener#d2", at: T }]);
  assert.deepEqual(p.explains, [{ id: "two-pointers", at: T - DAY }]);
  // quiz:ace is a badge, not a question; DSA's own keys (dsa:lab:) aren't SDM labs
  assert.equal(p.quickChecks.total, 2);
  assert.deepEqual(p.quickChecks.lessons, [{ week: "week-04-caching", slug: "day-02-cache-invalidation", title: "Invalidation Strategies", n: 2, at: T - DAY }]);
});

test("mock verdict flags and paper scores come from game_flags", () => {
  const flags = {
    "mock:mock-03-flipkart-cart": { best: { at: T - DAY, level: "sde2", verdict: "lean-hire", pct: 64.4 }, last: { at: T, level: "sde2", verdict: "lean-no-hire", pct: 48 }, n: 2 },
    "mock:broken": { best: { verdict: 3 } },
    "paper:w05-scaling": { v: 1, attempts: 2, best: { score: 31, max: 50, at: T, attempt: "a2" } },
    "pref:reader": { size: 2 },
  };
  const p = practiceOf({}, flags, map, titleOf);
  assert.deepEqual(p.mockResults, [
    { id: "mock-03-flipkart-cart", title: "Cart at sale scale (Flipkart)", n: 2, best: { verdict: "lean-hire", level: "sde2", pct: 64, at: T - DAY }, last: { verdict: "lean-no-hire", level: "sde2", pct: 48, at: T } },
  ]);
  assert.deepEqual(p.papers, [{ key: "w05-scaling", passed: 0, best: { score: 31, max: 50 }, attempts: 2 }]);
});

test("an empty record is empty", () => {
  const p = practiceOf({}, {}, map, titleOf);
  assert.equal(p.labs.length + p.warRooms.length + p.papers.length + p.mockResults.length + p.quickChecks.total, 0);
});

const problems = new Map([
  ["busiest-launch-stretch", { title: "Busiest stretch on the launch dashboard", level: "easy", patterns: ["sliding-window-fixed"] }],
  ["compact-log-buffer", { title: "Compact the log buffer", level: "easy", patterns: ["read-write-pointers", "two-pointers"] }],
  ["best-distinct-bundle", { title: "Best bundle of distinct products", level: "medium", patterns: ["sliding-window-fixed", "window-counts"] }],
  ["k-closest-points", { title: "K closest points", level: "medium", patterns: ["heap"] }],
]);

test("the DSA digest: solves newest first, patterns, and struggles", () => {
  const d = dsaDigest({
    solved: new Set(["busiest-launch-stretch", "compact-log-buffer", "best-distinct-bundle"]),
    solvedAt: new Map([["busiest-launch-stretch", T], ["compact-log-buffer", T - DAY], ["best-distinct-bundle", T - 2 * DAY]]),
    langs: new Map([["busiest-launch-stretch", new Set(["python", "java"])]]),
    conceptsDone: 2,
    problems,
    failed: [
      { problem: "compact-log-buffer", verdict: "WA" },
      { problem: "compact-log-buffer", verdict: "ERR" },
      { problem: "busiest-launch-stretch", verdict: "CE" },
      { problem: "k-closest-points", verdict: "TLE" },
    ],
    progress: [{ problem: "best-distinct-bundle", status: "solved", hints: 2, editorial: false }],
  });
  assert.equal(d.solved, 3);
  assert.equal(d.attempted, 4);
  assert.equal(d.conceptsDone, 2);
  assert.deepEqual(d.recent.map((r) => r.id), ["busiest-launch-stretch", "compact-log-buffer", "best-distinct-bundle"]);
  assert.deepEqual(d.recent[0].langs, ["python", "java"]);
  assert.deepEqual(d.patterns[0], { name: "sliding-window-fixed", solved: 2 });
  // one CE before an Accepted isn't a struggle; an unsolved problem with a failed submit is, and comes first
  assert.deepEqual(d.struggles.map((s) => s.id), ["k-closest-points", "best-distinct-bundle", "compact-log-buffer"]);
  assert.deepEqual(d.struggles[2], { id: "compact-log-buffer", title: "Compact the log buffer", failed: 2, verdicts: ["WA", "ERR"], solved: true, hints: 0, editorial: false });
});

test("an unknown problem id still reads as words", () => {
  const d = dsaDigest({ solved: new Set(["two-sum-sorted"]), solvedAt: new Map(), langs: new Map(), conceptsDone: 0, problems: new Map(), failed: [], progress: [] });
  assert.equal(d.recent[0].title, "two sum sorted");
});

test("the stored-data note names what isn't stored", () => {
  assert.match(STORED_NOTE, /Not stored: explain-it-back/);
  assert.match(STORED_NOTE, /hints used in code labs/);
});
