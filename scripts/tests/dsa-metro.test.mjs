/**
 * The DSA metro map: the hand-authored layout against the real course, the route over the lines, the goals and the arrow-key
 * steps (src/lib/dsa/metro/).   node --test scripts/tests/dsa-metro.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EDGES, LINE_OF_PART, LINKS, STATIONS, TAGS, VIEW } from "../../src/lib/dsa/metro/layout.ts";
import { buildMetro, computeRoute, goalStation, interchangeText, routeInfo, stepToward } from "../../src/lib/dsa/metro/model.ts";

const ACADEMY = join(process.env.DSA_LOCAL_DIR || join(homedir(), ".cache/hk-render/dsa-content"), "resources/worlds/academy.yml");
const real = existsSync(ACADEMY)
  ? (() => {
      const src = readFileSync(ACADEMY, "utf8");
      const body = src.slice(src.indexOf("\nregions:"));
      return { regions: [...body.matchAll(/^ {2}- id: (\S+)/gm)].map((m) => m[1]), parts: [...src.slice(0, src.indexOf("\nregions:")).matchAll(/^ {2}- id: (\S+)/gm)].map((m) => m[1]) };
    })()
  : null;

test("layout: every station is a real topic and every topic has a station", { skip: !real && "academy.yml not available" }, () => {
  const ids = STATIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate station");
  for (const id of ids) assert.ok(real.regions.includes(id), `${id} is not a region of the academy`);
  for (const r of real.regions) assert.ok(ids.includes(r), `topic ${r} has no station`);
  for (const p of real.parts) assert.ok(p in LINE_OF_PART, `part ${p} has no line`);
});

test("layout: edges, links and tags only name stations; stations sit inside the viewBox and do not overlap", () => {
  const ids = new Set(STATIONS.map((s) => s.id));
  for (const e of EDGES) assert.ok(ids.has(e.from) && ids.has(e.to), `${e.from}-${e.to}`);
  for (const [a, b] of LINKS) assert.ok(ids.has(a) && ids.has(b));
  for (const t of TAGS) assert.ok(t.x >= 0 && t.x < VIEW.w && t.y >= 0 && t.y < VIEW.h);
  for (const s of STATIONS) assert.ok(s.x > 20 && s.x < VIEW.w - 20 && s.y > 20 && s.y < VIEW.h - 30, s.id);
  for (const a of STATIONS) for (const b of STATIONS) if (a.id < b.id) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 70, `${a.id} and ${b.id} are too close`);
});

test("layout: every station is reachable along the lines", () => {
  const adj = new Map();
  for (const e of EDGES) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)).push(e.from);
  }
  assert.equal(computeRoute(adj, "m0-toolkit", "a9-range-queries").length > 0, true);
  for (const s of STATIONS) assert.ok(computeRoute(adj, "m0-toolkit", s.id).length > 0, s.id);
});

// a small course on the real ids
const lesson = (id, built = true, minutes = 10) => ({ conceptId: id, title: id, href: built ? `/dsa/concepts/${id}` : null, kind: "concept", minutes, problemCount: 2, built, nodeId: id });
const mod = (regionId, lessons) => ({ regionCode: regionId.split("-")[0], regionId, moduleId: regionId, step: "", title: regionId, objective: "", lessons, checkpoints: [], minutes: lessons.filter((l) => l.built).reduce((n, l) => n + l.minutes, 0), problemCount: 0, planned: false, placement: { built: false }, boss: null, readyLessons: lessons.length });
const MODS = {
  "part-1": ["m0-toolkit", "m1-complexity"],
  "part-2": ["m2-arrays-strings", "m3-hashing", "s1-linked-lists", "s2-stacks", "s3-queues-and-deques", "s4-trees-and-bst", "s5-heaps", "s6-graphs", "s7-tries"],
  "part-3": ["m6-recursion", "m7-sorting", "m8-binary-search", "a1-graph-traversal", "a2-shortest-paths", "a3-topological-sort", "a4-union-find", "a5-greedy", "a6-dynamic-programming", "a7-string-basics", "a8-bits-and-maths", "a9-range-queries"],
  "part-4": ["m4-two-pointers", "m5-sliding-window"],
};
const outline = {
  parts: Object.entries(MODS).map(([id, regs], i) => ({
    id,
    label: `PART ${i + 1}`,
    title: ["Toolkit", "Data structures", "Algorithms", "Patterns"][i],
    summary: "",
    modules: regs.map((r) => mod(r, [lesson(`${r}-1`), lesson(`${r}-2`, r !== "s7-tries")])),
  })),
  totals: { lessons: 0, ready: 0, planned: 0, problems: 0 },
};
const none = { concepts: new Set(), solved: new Set() };

test("model: every module of the outline gets a station on its part's line", () => {
  const m = buildMetro(outline, none);
  assert.equal(m.stations.length, STATIONS.length);
  assert.equal(m.byId.get("m3-hashing").line, "ds");
  assert.deepEqual(m.byId.get("m3-hashing").lines, ["ds", "pat"]);
  assert.equal(m.byId.get("m4-two-pointers").line, "pat");
  assert.equal(m.byId.get("a6-dynamic-programming").line, "algo");
  assert.deepEqual(m.lines.map((l) => l.id), ["toolkit", "ds", "pat", "algo"]);
});

test("model: station state comes from the lessons done", () => {
  const m = buildMetro(outline, { concepts: new Set(["m0-toolkit-1", "m0-toolkit-2", "m1-complexity-1"]), solved: new Set() });
  assert.equal(m.byId.get("m0-toolkit").state, "done");
  assert.equal(m.byId.get("m1-complexity").state, "prog");
  assert.equal(m.byId.get("m2-arrays-strings").state, "todo");
  assert.equal(m.byId.get("m1-complexity").nextLesson, 2);
  assert.equal(m.byId.get("m1-complexity").href, "/dsa/concepts/m1-complexity-2");
  assert.equal(m.edges.find((e) => e.from === "m0-toolkit" && e.to === "m1-complexity").done, false);
  // a topic with a planned lesson counts only the written ones
  assert.equal(m.byId.get("s7-tries").total, 1);
  assert.equal(m.byId.get("s7-tries").all, 2);
});

test("route: Hashing to Trees skips the Queues branch; a new learner's route starts at the Toolkit", () => {
  const m = buildMetro(outline, none);
  assert.deepEqual(computeRoute(m.adj, "m3-hashing", "s4-trees-and-bst"), ["m3-hashing", "s1-linked-lists", "s2-stacks", "s4-trees-and-bst"]);
  assert.deepEqual(computeRoute(m.adj, "s4-trees-and-bst", "s4-trees-and-bst"), ["s4-trees-and-bst"]);
  const r = routeInfo(m, "m0-toolkit", null, none, outline);
  assert.equal(r.goal, "s4-trees-and-bst");
  assert.equal(r.ids[0], "m0-toolkit");
  assert.equal(r.ids.at(-1), "s4-trees-and-bst");
  assert.equal(r.stops, 7);
  assert.equal(r.lessons, 14);
});

test("route: nothing between two unconnected ids; the interchange is a way through", () => {
  const m = buildMetro(outline, none);
  assert.deepEqual(computeRoute(m.adj, "m0-toolkit", "nowhere"), []);
  // Graphs is on the Data structures and Algorithms lines: Trees to Graph traversal goes through it
  assert.deepEqual(computeRoute(m.adj, "s4-trees-and-bst", "a1-graph-traversal"), ["s4-trees-and-bst", "s5-heaps", "s6-graphs", "a1-graph-traversal"]);
});

test("goals: scratch moves on once a milestone is done; topic and interview are fixed", () => {
  const all = (ids) => new Set(ids.flatMap((id) => [`${id}-1`, `${id}-2`]));
  let m = buildMetro(outline, none);
  assert.equal(goalStation(m, null, "m0-toolkit"), "s4-trees-and-bst");
  m = buildMetro(outline, { concepts: all(["s4-trees-and-bst"]), solved: new Set() });
  assert.equal(goalStation(m, { kind: "scratch" }, "m0-toolkit"), "s6-graphs");
  assert.equal(goalStation(m, { kind: "interview" }, "m0-toolkit"), "a6-dynamic-programming");
  assert.equal(goalStation(m, { kind: "topic", station: "m5-sliding-window" }, "m0-toolkit"), "m5-sliding-window");
  assert.equal(goalStation(m, { kind: "topic", station: "bogus" }, "m0-toolkit"), "s6-graphs");
});

test("tooltips: an interchange says which lines it is on", () => {
  const m = buildMetro(outline, none);
  const title = (l) => m.lines.find((x) => x.id === l).title;
  assert.equal(interchangeText(m.byId.get("m3-hashing"), title), "Hashing is on two lines: Data structures and Patterns.");
  assert.equal(interchangeText(m.byId.get("m0-toolkit"), title), "");
});

test("keyboard: arrow keys move along the lines and never dead-end", () => {
  const m = buildMetro(outline, none);
  assert.equal(stepToward(m, "m3-hashing", "right"), "s1-linked-lists");
  assert.equal(stepToward(m, "m3-hashing", "left"), "m2-arrays-strings");
  assert.equal(stepToward(m, "m3-hashing", "down"), "m4-two-pointers");
  assert.equal(stepToward(m, "s2-stacks", "down"), "s3-queues-and-deques");
  assert.equal(stepToward(m, "s2-stacks", "right"), "s4-trees-and-bst");
  assert.equal(stepToward(m, "s5-heaps", "down"), "s6-graphs");
  assert.ok(stepToward(m, "m0-toolkit", "down"), "falls back to the nearest station that way");
});
