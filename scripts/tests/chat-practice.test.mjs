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

const ix = {
  problems: new Map([
    ["busiest-launch-stretch", { title: "Busiest stretch on the launch dashboard", concept: "fixed-window", level: "easy" }],
    ["compact-log-buffer", { title: "Compact the log buffer", concept: "read-write-pointers", level: "easy" }],
    ["best-distinct-bundle", { title: "Best bundle of distinct products", concept: "fixed-window", level: "medium" }],
    ["k-closest-points", { title: "K closest points", concept: "heaps", level: "medium" }],
  ]),
  concepts: new Map([["fixed-window", "Fixed-size sliding window"], ["read-write-pointers", "Read and write pointers"]]),
};
const iso = (t) => new Date(t).toISOString();
// the learner model's rows (lib/learner/brief.ts dsaRows): submits newest first
const raw = {
  done: { "dsa:p:best-distinct-bundle": T - 2 * DAY, "dsa:c:fixed-window": T - 3 * DAY },
  onboarding: null,
  rows: [],
  subs: [
    { problem_id: "k-closest-points", language: "python", verdict: "TLE", created_at: iso(T - 1000) },
    { problem_id: "busiest-launch-stretch", language: "java", verdict: "AC", created_at: iso(T) },
    { problem_id: "busiest-launch-stretch", language: "python", verdict: "AC", created_at: iso(T - 60_000) },
    { problem_id: "busiest-launch-stretch", language: "cpp", verdict: "CE", created_at: iso(T - 120_000) },
    { problem_id: "compact-log-buffer", language: "python", verdict: "AC", created_at: iso(T - DAY) },
    { problem_id: "compact-log-buffer", language: "python", verdict: "WA", created_at: iso(T - DAY - 60_000) },
    { problem_id: "compact-log-buffer", language: "python", verdict: "ERR", created_at: iso(T - DAY - 120_000) },
  ],
  prog: [{ problem_id: "best-distinct-bundle", status: "solved", editorial_viewed: true }],
};
const profile = { lang: null, level: null, levelFrom: null, goal: null, solved: 3, attempted: 4, lessonsDone: 1, bits: null, struggles: [{ concept: "Heaps", why: "1 failed submit on 1 problem, 1 still unsolved" }], editorialFirst: { n: 1, of: 4 }, patterns: [] };

test("the DSA digest over the learner model's rows: solves newest first, concepts, problems that took tries", () => {
  const d = dsaDigest(raw, ix, profile);
  assert.equal(d.solved, 3);
  assert.equal(d.attempted, 4);
  assert.equal(d.lessonsDone, 1);
  assert.deepEqual(d.recent.map((r) => r.id), ["busiest-launch-stretch", "compact-log-buffer", "best-distinct-bundle"]);
  // the earliest Accepted is the solve's time; languages from Accepted submits only
  assert.equal(d.recent[0].at, T - 60_000);
  assert.deepEqual(d.recent[0].langs.sort(), ["java", "python"]);
  assert.equal(d.recent[0].concept, "Fixed-size sliding window");
  assert.deepEqual(d.concepts[0], { name: "Fixed-size sliding window", solved: 2 });
  assert.deepEqual(d.struggles, profile.struggles);
  // one CE before an Accepted isn't a struggle; an unsolved problem with a failed submit is, and comes first
  assert.deepEqual(d.hard.map((h) => h.id), ["k-closest-points", "compact-log-buffer", "best-distinct-bundle"]);
  assert.deepEqual(d.hard[1], { id: "compact-log-buffer", title: "Compact the log buffer", failed: 2, verdicts: ["WA", "ERR"], solved: true, revealed: false });
  assert.equal(d.hard[2].revealed, true);
  assert.deepEqual(d.habits, []);
});

test("an unknown problem id still reads as words; the editorial habit shows from two", () => {
  const d = dsaDigest({ ...raw, done: { "dsa:p:two-sum-sorted": T }, subs: [], prog: [] }, ix, { ...profile, editorialFirst: { n: 3, of: 5 }, patterns: ["compile errors on 2 problems"] });
  assert.equal(d.recent[0].title, "two sum sorted");
  assert.deepEqual(d.habits, ["compile errors on 2 problems", "revealed the editorial before solving on 3 of their last 5 problems"]);
});

test("the stored-data note names what isn't stored", () => {
  assert.match(STORED_NOTE, /Not stored: explain-it-back/);
  assert.match(STORED_NOTE, /hints used in code labs/);
});
