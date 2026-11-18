/**
 * Practice bank grouping (src/lib/dsa/problem-groups.ts).
 *   node --test scripts/tests/dsa-problem-groups.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`),
);
const { DEFAULT_GROUPING, TOPIC_ORDER, firstOpenId, groupRows, highlightParts, isOpen, parseGrouping, solvedIn } = await import("../../src/lib/dsa/problem-groups.ts");

const row = (id, module, level, order, extra = {}) => ({ id, module, level, order, seq: order, patterns: [], companies: [], ...extra });
const names = { topic: (m) => `T:${m}`, pattern: (p) => `P:${p}`, company: (c) => `C:${c}` };

test("topic is the default and unknown values fall back to it", () => {
  assert.equal(DEFAULT_GROUPING, "topic");
  assert.equal(parseGrouping(null), "topic");
  assert.equal(parseGrouping("lesson"), "topic");
  assert.equal(parseGrouping("none"), "none");
  assert.equal(parseGrouping("company"), "company");
});

test("topics come in course order, unknown modules last, and rows sort by difficulty then order", () => {
  const rows = [row("a", "s6-graphs", "hard", 1), row("b", "m2-arrays-strings", "medium", 2), row("c", "m2-arrays-strings", "easy", 5), row("d", "m2-arrays-strings", "easy", 3), row("e", "zz-new", "easy", 1), row("f", "m1-complexity", "easy", 1)];
  const g = groupRows(rows, "topic", names);
  assert.deepEqual(g.map((x) => x.id), ["m1-complexity", "m2-arrays-strings", "s6-graphs", "zz-new"]);
  assert.deepEqual(g[1].rows.map((r) => r.id), ["d", "c", "b"]);
  assert.deepEqual(g[1].split, { easy: 2, medium: 1, hard: 0 });
  assert.equal(g[0].title, "T:m1-complexity");
});

test("the topic order matches the owner's list: sliding window before recursion, linked lists before stacks, tries after graphs", () => {
  const at = (m) => TOPIC_ORDER.indexOf(m);
  assert.ok(at("m5-sliding-window") < at("m6-recursion"));
  assert.ok(at("m8-binary-search") < at("s1-linked-lists"));
  assert.ok(at("s2-stacks") < at("s3-queues-and-deques") && at("s3-queues-and-deques") < at("s4-trees-and-bst"));
  assert.ok(at("s6-graphs") < at("s7-tries") && at("s7-tries") < at("a1-graph-traversal"));
  assert.equal(new Set(TOPIC_ORDER).size, TOPIC_ORDER.length);
});

test("keepOrder leaves the rows as the learner's sort made them", () => {
  const rows = [row("x", "m1-complexity", "hard", 9), row("y", "m1-complexity", "easy", 1)];
  assert.deepEqual(groupRows(rows, "topic", names, true)[0].rows.map((r) => r.id), ["x", "y"]);
});

test("difficulty groups run easy, medium, hard; company groups put no-company last; none gives no groups", () => {
  const rows = [row("a", "m1", "hard", 1, { companies: ["fintech"] }), row("b", "m1", "easy", 2), row("c", "m1", "medium", 3, { companies: ["e-commerce", "fintech"] })];
  assert.deepEqual(groupRows(rows, "level", names).map((g) => g.title), ["Easy", "Medium", "Hard"]);
  const c = groupRows(rows, "company", names);
  assert.deepEqual(c.map((g) => g.title), ["C:e-commerce", "C:fintech", "Not tied to a company type"]);
  assert.deepEqual(groupRows(rows, "none", names), []);
});

test("pattern groups follow the course order of their first problem; no pattern is Other patterns, last", () => {
  const rows = [row("a", "m1", "easy", 9, { patterns: ["late"], seq: 9 }), row("b", "m1", "easy", 1, { patterns: ["early"], seq: 1 }), row("c", "m1", "easy", 2)];
  assert.deepEqual(groupRows(rows, "pattern", names).map((g) => g.title), ["P:early", "P:late", "Other patterns"]);
});

test("the first group with an unsolved problem starts open; the learner's own choice wins", () => {
  const g = groupRows([row("a", "m1-complexity", "easy", 1), row("b", "m2-arrays-strings", "easy", 1), row("c", "m2-arrays-strings", "easy", 2)], "topic", names);
  const solved = new Set(["a"]);
  const first = firstOpenId(g, (id) => solved.has(id));
  assert.equal(first, "m2-arrays-strings");
  assert.equal(solvedIn(g[0], (id) => solved.has(id)), 1);
  assert.equal(isOpen(null, "topic:m2-arrays-strings", "m2-arrays-strings", first), true);
  assert.equal(isOpen(null, "topic:m1-complexity", "m1-complexity", first), false);
  assert.equal(isOpen({ "topic:m2-arrays-strings": false, "topic:m1-complexity": true }, "topic:m2-arrays-strings", "m2-arrays-strings", first), false);
  assert.equal(isOpen({ "topic:m1-complexity": true }, "topic:m1-complexity", "m1-complexity", first), true);
  assert.equal(firstOpenId([], () => false), null);
  assert.equal(firstOpenId(g, () => true), "m1-complexity");
});

test("highlight splits around the search words", () => {
  assert.deepEqual(highlightParts("Two Sum II", "sum"), [{ text: "Two ", hit: false }, { text: "Sum", hit: true }, { text: " II", hit: false }]);
  assert.deepEqual(highlightParts("Valid Anagram", "a"), [{ text: "Valid Anagram", hit: false }]);
  assert.deepEqual(highlightParts("C++ (x)", "c++ ("), [{ text: "C++", hit: true }, { text: " (x)", hit: false }]);
});
