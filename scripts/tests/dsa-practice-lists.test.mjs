/**
 * Practice's lists, saved problems, the Progress totals and the ⌘K index for DSA pages.
 *   node --test scripts/tests/dsa-practice-lists.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`),
);
const L = await import("../../src/lib/dsa/lists.ts");
const { summarise } = await import("../../src/lib/dsa/progress-summary.ts");
const { buildDsaDocs, mergeTranscripts, lessonWeek } = await import("../../src/lib/dsa/search-index.ts");

const rows = ["a", "b", "c", "d"].map((id, i) => ({ id, seq: i, order: i, title: id, companies: id === "a" ? ["fintech"] : [] }));
const lists = {
  "core-150": L.coreList([{ id: "a", classic: ["LC 1"] }, { id: "b", classic: [] }, { id: "c", classic: [] }], ["c", "zzz"]),
  "interview-patterns": L.districtList([
    { id: "d1", title: "Arrays", opens: "Opens at launch", planned: 2, stretches: [{ id: "s1", title: "Street one", nodes: [{ ref: "d", built: true }, { ref: "x", built: false }], planned: 1 }, { id: "s2", title: "Empty", nodes: [], planned: 0 }] },
    { id: "d5", title: "Lists", opens: "Opens with wave 2", planned: 4, stretches: [] },
  ]),
  "company-types": L.companyList(rows, [{ id: "fintech", label: "Fintech" }, { id: "saas", label: "SaaS" }]),
  "cp-camps": L.campList([{ id: "camp-1", title: "Basics", band: [800, 1000], tents: [{ id: "t", title: "T", ids: ["b", "gone"], href: null }] }], new Set(["a", "b", "c", "d"])),
};
const ctx = (over = {}) => ({ rows, saved: new Set(), daily: null, lists, ...over });

test("parseList accepts known ids and falls back to all", () => {
  assert.equal(L.parseList("list=core-150&q=x"), "core-150");
  assert.equal(L.parseList("list=nope"), "all");
  assert.equal(L.parseList(""), "all");
});

test("every list is either ready or carries a one-line planned state", () => {
  for (const l of L.LISTS) assert.ok(l.ready || l.planned?.line, l.id);
  // CP camps became a ready list (18 Nov 2026)
  assert.equal(L.LISTS.filter((l) => !l.ready && l.id !== "build-my-list").length, 4);
});

test("Core 150 holds classic twins and gap-fillers that exist; planned is the rest of 150", () => {
  assert.deepEqual([...lists["core-150"].ids].sort(), ["a", "c"]);
  assert.equal(lists["core-150"].planned, 148);
});

test("interview patterns: built problems under their streets, unwritten districts say how many and when", () => {
  const s = lists["interview-patterns"].sections;
  assert.deepEqual(s[0].ids, ["d"]);
  assert.deepEqual(s[0].streets.map((x) => x.title), ["Street one"]);
  assert.equal(L.plannedNote(s[0]), "2 more at launch");
  assert.equal(L.plannedNote(s[1]), "4 more with wave 2");
  assert.equal(L.plannedNote({}), "");
});

test("a list's ids only count problems that are in the bank", () => {
  assert.equal(L.listIdSet("all", ctx()), null);
  assert.deepEqual([...L.listIdSet("core-150", ctx())].sort(), ["a", "c"]);
  assert.deepEqual([...L.listIdSet("interview-patterns", ctx())], ["d"]);
  assert.deepEqual([...L.listIdSet("company-types", ctx())], ["a"]);
  assert.deepEqual([...L.listIdSet("cp-camps", ctx())], ["b"]);
});

test("daily and saved come from the learner; counts are ready problems", () => {
  assert.equal(L.listCount("daily", ctx()), null);
  assert.equal(L.listCount("daily", ctx({ daily: ["b", "gone"] })), 1);
  assert.equal(L.listCount("saved", ctx({ saved: new Set(["a", "b"]) })), 2);
  assert.equal(L.listCount("all", ctx()), 4);
});

test("saved: flags win, an explicit un-save beats the legacy device list", () => {
  assert.deepEqual(L.savedFrom({ "dsa:saved:x": 5, "dsa:saved:y": 0, other: 1 }, ["y", "z"]), ["x", "z"]);
  assert.deepEqual(L.savedFrom({}, []), []);
});

test("sections keep their order and drop rows the filters removed", () => {
  const out = L.sectionRows([{ id: "s", title: "S", ids: ["b", "a", "q"] }], rows.filter((r) => r.id !== "b"));
  assert.deepEqual(out[0].rows.map((r) => r.id), ["a"]);
});

test("recommended order: unsolved first, then course order; 50 rows a page", () => {
  const o = L.recommendedOrder(rows, (id) => id === "a");
  assert.deepEqual(o.map((r) => r.id), ["b", "c", "d", "a"]);
  const many = Array.from({ length: 120 }, (_, i) => i);
  assert.equal(L.pageOf(many, 1).rows.length, 50);
  assert.equal(L.pageOf(many, 3).rows.length, 20);
  assert.equal(L.pageOf(many, 99).page, 3);
  assert.equal(L.pageOf([], 1).pages, 1);
});

test("progress summary counts ready content only", () => {
  const s = summarise({
    problems: [{ id: "p1", level: "easy" }, { id: "p2", level: "hard" }],
    parts: [{ id: "part-2", title: "Structures", concepts: ["c1", "c2"] }, { id: "part-3", title: "Algorithms", concepts: ["c3"] }],
    concepts: new Set(["c1", "c3", "unknown"]),
    solved: new Set(["p2", "gone"]),
    checkpoints: new Set(["k1"]),
  });
  assert.equal(s.lessons, 2);
  assert.equal(s.solved, 1);
  assert.equal(s.problemsTotal, 2);
  assert.equal(s.checkpoints, 1);
  assert.deepEqual(s.byLevel.hard, { solved: 1, total: 1 });
  assert.deepEqual(s.parts.map((p) => `${p.done}/${p.total}`), ["1/2", "1/1"]);
});

test("search index: ready lessons and every problem, linked by their real paths", () => {
  const docs = buildDsaDocs(
    [
      { id: "hash-table-internals", module: "m2", order: 1, title: "Hash table internals", status: "built", summary: "How a hash table stores keys", kind: "structure" },
      { id: "planned-one", module: "m3", order: 2, title: "Planned", status: "planned", summary: "x" },
      { id: "two-pointers", module: "m4", order: 3, title: "Opposite ends", status: "built", summary: "Two pointers", kind: "concept" },
    ],
    [{ id: "refund-pair", title: "A refund pair for a total", module: "m2", concept: "hash-table-internals", level: "easy", patterns: ["two-sum"], classic: ["LC 1"], blurb: "Find two orders" }],
    () => "2.2",
  );
  assert.deepEqual(docs.map((d) => `${d.week}/${d.slug}`), ["dsa/structures/hash-table-internals", "dsa/concepts/two-pointers", "dsa/problems/refund-pair"]);
  assert.ok(docs[2].content.includes("two sum") && docs[2].content.includes("LC 1") && docs[2].content.includes("Hash table internals"));
  assert.equal(lessonWeek({ kind: "algorithm" }), "dsa/algorithms");
});

test("merging transcripts moves the DSA lecture numbers past the shared ones", () => {
  const base = { v: 1, built: "a", l: [["s", "S", "W1", "/lectures/s", 0]], m: [[0, 5, "base words"]] };
  const extra = { v: 1, built: "b", l: [["d", "D", "2.2", "/dsa/concepts/d/lecture", 0]], m: [[0, 9, "dsa words"]] };
  const out = mergeTranscripts(base, extra);
  assert.equal(out.l.length, 2);
  assert.deepEqual(out.m, [[0, 5, "base words"], [1, 9, "dsa words"]]);
  assert.deepEqual(base.m, [[0, 5, "base words"]]);
});
