/**
 * DSA problems page: the taxonomy (src/lib/dsa/taxonomy.ts) and the filter logic (src/lib/dsa/problem-filters.ts,
 * problem-rows.ts).
 *   node --test scripts/tests/dsa-problem-filters.test.mjs
 * (Node >= 22.18 strips the TypeScript types of the imported modules.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// the modules import each other without extensions (as the app's bundler wants); let node find the .ts files
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`),
);
const { facetsOf, PATTERN_MAP, STRUCTURES, ALGORITHMS, PATTERNS } = await import("../../src/lib/dsa/taxonomy.ts");
const { activeCount, clearAll, emptyState, evaluate, normaliseQuery, parseState, serializeState, timeBucket, toggle } = await import("../../src/lib/dsa/problem-filters.ts");
const { buildProblemData, companyId } = await import("../../src/lib/dsa/problem-rows.ts");

/* ---------------------------------------------------------------- taxonomy */

test("every facet an entry maps to exists in the lists", () => {
  const ids = { s: new Set(STRUCTURES.map((f) => f.id)), a: new Set(ALGORITHMS.map((f) => f.id)), p: new Set(PATTERNS.map((f) => f.id)) };
  for (const [tag, m] of Object.entries(PATTERN_MAP)) for (const k of ["s", "a", "p"]) for (const id of m[k] || []) assert.ok(ids[k].has(id), `${tag} -> ${id}`);
});

test("the union over the tags, plus the module's topic", () => {
  const f = facetsOf({ patterns: ["hashing", "sliding-window-variable"], module: "m5-sliding-window" });
  assert.deepEqual(f.structures, ["array", "hash"]);
  assert.deepEqual(f.patterns, ["sliding-window"]);
  const t = facetsOf({ patterns: ["tree-recursion"], module: "s4-trees-and-bst" });
  assert.deepEqual(t.structures, ["tree"]);
  assert.deepEqual(t.algorithms, ["recursion"]);
  // homed in the heaps module with a tag that names no structure
  assert.deepEqual(facetsOf({ patterns: ["greedy"], module: "s5-heaps" }).structures, ["heap"]);
});

test("dijkstra is a shortest-paths algorithm on a graph with a heap", () => {
  const f = facetsOf({ patterns: ["dijkstra"], module: "a2-shortest-paths" });
  assert.deepEqual([f.structures, f.algorithms], [["heap", "graph"], ["shortest-paths"]]);
});

test("unknown pattern tags are reported, never thrown, and the known ones still count", () => {
  const f = facetsOf({ patterns: ["made-up-tag", "stacks"], module: "no-such-module" });
  assert.deepEqual(f.unknown, ["made-up-tag"]);
  assert.deepEqual(f.structures, ["stack"]);
  assert.doesNotThrow(() => facetsOf({}));
  assert.doesNotThrow(() => facetsOf({ patterns: undefined, module: undefined, structures: "heap", algorithms: 5 }));
});

test("explicit structures/algorithms replace, and a + prefix adds", () => {
  const replaced = facetsOf({ patterns: ["hashing"], module: "m3-hashing", structures: ["Heap"] });
  assert.deepEqual(replaced.structures, ["heap"]);
  const added = facetsOf({ patterns: ["hashing"], module: "m3-hashing", structures: ["+Linked list"], algorithms: ["+dp"] });
  assert.deepEqual(added.structures, ["hash", "linked-list"]);
  assert.deepEqual(added.algorithms, ["dynamic-programming"]);
  const bad = facetsOf({ patterns: ["hashing"], structures: ["nonsense", "+also-nonsense"] });
  assert.deepEqual(bad.structures, ["hash"]);
  assert.equal(bad.unknown.length, 2);
});

/* ---------------------------------------------------------------- filters */

const P = (id, o = {}) => ({
  id, title: id.replace(/-/g, " "), module: "m3-hashing", concept: "hashing", line: "", level: "easy", order: 1, patterns: ["hashing"], minutes: 15, classic: [],
  rating: 3, role: "practice", companyTypes: ["fintech"], blurb: "", ...o,
});
const labels = { "m3-hashing": { step: "1.3", title: "Hashing", building: "", label: "1.3 Hashing" }, "s2-stacks": { step: "2.2", title: "Stacks", building: "", label: "2.2 Stacks" } };
const data = buildProblemData(
  [
    P("pair-sum", { classic: ["lc-1"], blurb: "Find two payments that add up" }),
    P("pair-sum-two", { classic: ["lc-15"], level: "medium", rating: 5, minutes: 25, role: "checkpoint", companyTypes: ["big-tech-product"] }),
    P("bracket-check", { module: "s2-stacks", concept: "stacks", patterns: ["stacks"], level: "hard", rating: 8, minutes: 40, companyTypes: ["infra-platform", "cloud-infrastructure"] }),
    P("odd-one", { patterns: ["brand-new-tag"], minutes: null, rating: null }),
  ],
  { labels, concepts: [{ id: "hashing", title: "Hashing", order: 1 }, { id: "stacks", title: "Stacks", order: 1 }], videos: ["bracket-check"] },
);
const todo = () => "todo";

test("rows carry facets, steps and a merged company vocabulary", () => {
  assert.deepEqual(data.unknown, ["brand-new-tag"]);
  assert.deepEqual(data.steps.map((s) => s.label), ["1.3 Hashing", "2.2 Stacks"]);
  assert.equal(companyId("cloud-infrastructure"), "infrastructure");
  assert.deepEqual(data.rows.find((r) => r.id === "bracket-check").companies, ["infrastructure"]);
  assert.equal(data.rows.find((r) => r.id === "bracket-check").video, true);
});

test("no filters returns every problem in course order", () => {
  const r = evaluate(data.rows, emptyState(), todo);
  assert.equal(r.total, 4);
  assert.deepEqual(r.results.map((x) => x.id), ["odd-one", "pair-sum", "pair-sum-two", "bracket-check"]);
});

test("OR within a group, AND across groups", () => {
  let s = toggle(emptyState(), "level", "easy");
  s = toggle(s, "level", "hard");
  assert.deepEqual(evaluate(data.rows, s, todo).results.map((r) => r.id).sort(), ["bracket-check", "odd-one", "pair-sum"]);
  s = toggle(s, "structures", "stack");
  assert.deepEqual(evaluate(data.rows, s, todo).results.map((r) => r.id), ["bracket-check"]);
});

test("counts show what each option would give", () => {
  let s = toggle(emptyState(), "level", "easy");
  const r = evaluate(data.rows, s, todo);
  // the level group's own counts ignore its own selection...
  assert.equal(r.counts.level.get("medium"), 1);
  assert.equal(r.counts.level.get("hard"), 1);
  // ...while other groups count within the selection
  assert.equal(r.counts.structures.get("hash"), 2);
  assert.equal(r.counts.kind.get("checkpoint") || 0, 0);
  s = toggle(s, "kind", "checkpoint");
  assert.equal(evaluate(data.rows, s, todo).total, 0);
});

test("status comes from the learner's progress", () => {
  const solved = new Set(["pair-sum"]);
  const st = (id) => (solved.has(id) ? "solved" : "todo");
  assert.deepEqual(evaluate(data.rows, toggle(emptyState(), "status", "solved"), st).results.map((r) => r.id), ["pair-sum"]);
  assert.equal(evaluate(data.rows, emptyState(), st).counts.status.get("todo"), 3);
});

test("time buckets, video and company filters", () => {
  assert.deepEqual([timeBucket(15), timeBucket(16), timeBucket(30), timeBucket(31), timeBucket(null)], ["quick", "mid", "mid", "long", null]);
  assert.deepEqual(evaluate(data.rows, toggle(emptyState(), "time", "long"), todo).results.map((r) => r.id), ["bracket-check"]);
  assert.deepEqual(evaluate(data.rows, toggle(emptyState(), "video", "1"), todo).results.map((r) => r.id), ["bracket-check"]);
  assert.deepEqual(evaluate(data.rows, toggle(emptyState(), "company", "big-tech-product"), todo).results.map((r) => r.id), ["pair-sum-two"]);
});

test("search finds title words, statement words and the classic twin by number or name", () => {
  const find = (q) => evaluate(data.rows, { ...emptyState(), q }, todo).results.map((r) => r.id).sort();
  assert.deepEqual(find("bracket"), ["bracket-check"]);
  assert.deepEqual(find("payments"), ["pair-sum"]);
  assert.deepEqual(find("LC 1"), ["pair-sum"]); // not lc-15
  assert.deepEqual(find("lc15"), ["pair-sum-two"]);
  assert.deepEqual(find("two sum"), ["pair-sum", "pair-sum-two"].sort()); // the twin's name (and the title words of the second)
  assert.deepEqual(find("3sum"), ["pair-sum-two"]);
  assert.deepEqual(normaliseQuery("  LC-1  Stack"), ["lc-1", "stack"]);
});

test("sorts: easiest, hardest, quickest", () => {
  const ids = (sort) => evaluate(data.rows, { ...emptyState(), sort }, todo).results.map((r) => r.id);
  assert.deepEqual(ids("easiest").slice(0, 2), ["odd-one", "pair-sum"]); // an unrated problem uses its level; ties keep course order
  assert.equal(ids("hardest")[0], "bracket-check");
  assert.equal(ids("easiest").at(-1), "bracket-check");
  assert.equal(ids("quickest")[0], "pair-sum");
  assert.equal(ids("quickest").at(-1), "odd-one");
});

test("URL round trip, and clearing keeps the sort", () => {
  let s = toggle(toggle(toggle(emptyState(), "structures", "array"), "structures", "hash"), "video", "1");
  s = { ...s, q: "two sum", sort: "hardest" };
  const qs = serializeState(s);
  assert.equal(qs, "q=two+sum&ds=array%2Chash&video=1&sort=hardest");
  assert.deepEqual(parseState(qs), s);
  assert.equal(serializeState(emptyState()), "");
  assert.equal(activeCount(s), 3);
  const c = clearAll(s);
  assert.deepEqual([activeCount(c), c.q, c.sort], [0, "", "hardest"]);
  assert.equal(parseState("sort=bogus").sort, "course");
});
