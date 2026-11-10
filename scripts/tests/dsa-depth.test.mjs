/**
 * Depth plan, Nov 2026: modules with several lessons (step labels, checkpoints, warm-up text, problem-bank links,
 * badges), the Interview practice districts and the Listen keys of structure and algorithm lessons.
 *   node --test scripts/tests/dsa-depth.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildStepLabels, lessonLabel, lessonSlot, stepOf } from "../../src/lib/dsa/steps.ts";
import { checkpointFor, mapHref, warmupsIntro, writtenLessonPaths } from "../../src/lib/dsa/lesson-stops.ts";
import { districtName, groupDistricts, waveLabel } from "../../src/lib/dsa/districts.ts";
import { badgeDefsFor, earnedBadges } from "../../src/lib/dsa/rewards.ts";
import { listenKey } from "../../src/lib/listen/manifest.ts";

const node = (id, type, o = {}) => ({ id, type, title: id, required: true, href: null, built: true, ...o });
const concepts = [
  { id: "linked-lists", module: "s1-linked-lists", order: 1, title: "Linked lists", status: "built", kind: "structure" },
  { id: "list-reversal", module: "s1-linked-lists", order: 2, title: "Reversing lists in place", status: "planned", kind: "structure" },
  { id: "fast-and-slow-pointers", module: "s1-linked-lists", order: 3, title: "Fast and slow pointers", status: "planned", kind: "structure" },
  { id: "stacks", module: "s2-stacks", order: 1, title: "Stacks", status: "built", kind: "structure" },
];
const s1 = {
  id: "s1-linked-lists",
  code: "s1",
  title: "Carriage House",
  moduleTitle: "Linked lists",
  module: "s1-linked-lists",
  stretches: [
    { id: "s1", title: "Linked lists", nodes: [node("s1.linked-lists", "concept", { ref: "linked-lists" }), node("s1.checkpoint-1", "checkpoint", { quiz: "s1-linked-lists/linked-lists" })] },
    {
      id: "s2",
      title: "Reversal and two speeds",
      nodes: [
        node("s1.list-reversal", "concept", { ref: "list-reversal", built: false }),
        node("s1.fast-and-slow-pointers", "concept", { ref: "fast-and-slow-pointers", built: false }),
        node("s1.checkpoint-2", "checkpoint", { quiz: "s1-linked-lists/fast-and-slow-pointers", built: false }),
      ],
    },
  ],
  side: [],
  boss: null,
};

test("step labels: a module holds several lessons, each shows its place in it", () => {
  const world = { parts: [{ regions: ["s1-linked-lists"] }], regions: [{ id: "s1-linked-lists", module: "s1-linked-lists", title: "Carriage House", moduleTitle: "Linked lists" }] };
  const labels = buildStepLabels(world, {});
  assert.equal(stepOf(labels, "s1-linked-lists").label, "1.1 Linked lists");
  assert.equal(lessonLabel(labels, "s1-linked-lists", lessonSlot(concepts, "list-reversal")), "1.1 Linked lists · lesson 2 of 3");
  assert.deepEqual(lessonSlot(concepts, "fast-and-slow-pointers"), { n: 3, of: 3 });
  assert.equal(lessonSlot(concepts, "stacks"), null, "a one-lesson module shows no slot");
  assert.equal(lessonLabel(labels, "s2-stacks", lessonSlot(concepts, "stacks")), "stacks", "unknown modules never show a code");
  assert.equal(lessonSlot(concepts, "nope"), null);
});

test("checkpoints: own, shared section (lesson stop stands in), and none", () => {
  const own = checkpointFor("academy", s1, "s1-linked-lists", "linked-lists");
  assert.equal(own.nodeId, "s1.checkpoint-1");
  assert.equal(own.own, true);
  assert.equal(own.key, "dsa:gate:academy:s1-linked-lists:1");
  const second = checkpointFor("academy", s1, "s1-linked-lists", "fast-and-slow-pointers");
  assert.equal(second.nodeId, "s1.checkpoint-2");
  // list-reversal shares checkpoint 2 and has none of its own: its lesson stop on the map
  const shared = checkpointFor("academy", s1, "s1-linked-lists", "list-reversal");
  assert.equal(shared.nodeId, "s1.list-reversal");
  assert.equal(shared.own, false);
  assert.equal(shared.problems.length, 0);
  assert.equal(checkpointFor("academy", s1, "s1-linked-lists", "not-on-the-map"), null);
  assert.equal(checkpointFor("academy", undefined, "x", "y"), null);
  assert.equal(mapHref(shared), "/dsa?node=s1.list-reversal");
  assert.equal(mapHref(null), "/dsa", "never an empty ?node=");
});

test("warm-ups intro: per lesson, never repeated across a module", () => {
  const first = warmupsIntro({ id: "linked-lists", title: "Linked lists" });
  const second = warmupsIntro({ id: "list-reversal", title: "Reversing lists in place" });
  const third = warmupsIntro({ id: "fast-and-slow-pointers", title: "Fast and slow pointers" });
  assert.match(first, /ListNode/);
  assert.notEqual(second, first);
  assert.notEqual(third, second);
  assert.match(second, /reversing lists in place/);
  assert.equal(warmupsIntro({ id: "x", title: "X", warmups: "  Own words.  " }), "Own words.", "front matter wins");
  assert.notEqual(warmupsIntro({ id: "dijkstra", title: "Dijkstra's shortest paths" }), warmupsIntro({ id: "bfs-dfs-grid", title: "BFS and DFS on a grid" }), "algorithm lessons no longer share the grid text");
});

test("problem bank: only written lessons link", () => {
  const lessons = writtenLessonPaths([{ id: "a", kind: "structure", status: "built" }, { id: "b", kind: "structure", status: "planned" }, { id: "c", status: "built" }, { id: "d", kind: "algorithm", status: "built" }]);
  assert.deepEqual(lessons, { a: "/dsa/structures/a", c: "/dsa/concepts/c", d: "/dsa/algorithms/d" }, "the planned lesson b has no entry");
});

test("badges: a module counts only shipped stops; the world waits for everything", () => {
  const spec = { id: "academy", title: "Academy", regions: [s1] };
  const [mod, world] = badgeDefsFor(spec);
  assert.deepEqual(mod.need, ["c:linked-lists", "q:s1.checkpoint-1"], "unwritten lessons are left out");
  assert.equal(mod.ready, true);
  assert.equal(mod.pending, 3);
  assert.match(mod.detail, /3 more on the way/);
  assert.equal(world.ready, false, "the world needs every stop written");
  const sig = { concepts: new Set(["linked-lists"]), solved: new Set(), checkpoints: new Set(["s1.checkpoint-1"]), labs: new Set() };
  assert.ok(earnedBadges([mod, world], sig).has(mod.id), "earnable while later lessons are planned");
  assert.ok(!earnedBadges([mod, world], sig).has(world.id));
  // a module with nothing written is still not ready
  const none = { ...s1, stretches: [s1.stretches[1]] };
  assert.equal(badgeDefsFor({ id: "academy", title: "Academy", regions: [none] })[0].ready, false);
  // a district's planned problems count as pending, and an empty district keeps the world from being ready
  const d1 = { id: "d1", code: "d1", title: "Pay Exchange", moduleTitle: "Arrays", planned: 4, stretches: [{ id: "x", title: "x", nodes: [node("d1.p", "practice", { ref: "p" })] }], side: [], boss: null };
  const d2 = { id: "d2", code: "d2", title: "Stream Studios", moduleTitle: "Windows", stretches: [{ id: "x", title: "x", nodes: [] }], side: [], boss: null };
  const defs = badgeDefsFor({ id: "product-districts", title: "Interview practice", regions: [d1, d2] });
  assert.equal(defs[0].pending, 4);
  assert.equal(defs.length, 2, "an empty district has no badge yet");
  assert.equal(defs[1].ready, false);
});

test("districts: streets with built problems, planned counts, opening waves", () => {
  const districts = [
    { id: "d1-arrays", wave: "launch", links: ["m2"], streets: [{ id: "counting", title: "Counting" }, { id: "pairs", title: "Pairs" }, { id: "empty", title: "Empty" }] },
    { id: "d5-lists", wave: "w1", streets: [{ id: "reverse", title: "Reverse" }] },
  ];
  const rows = [
    { id: "p1", home: "d1-arrays/counting" },
    { id: "p2", home: "d1-arrays/counting" },
    { id: "p3", home: "d1-arrays/counting" },
    { id: "p4", home: "d1-arrays/pairs" },
    { id: "p5", home: "d1-arrays/surprise-street" },
    { id: "q1", home: "d5-lists/reverse" },
    { id: "z1", home: "d9-other/x" },
  ];
  const built = new Map([["p1", { id: "p1", title: "One", level: "easy" }], ["p2", { id: "p2", title: "Two", level: "medium" }], ["p4", { id: "p4", title: "Four", level: "hard" }]]);
  const out = groupDistricts(districts, rows, built, (id) => id.split("-")[0]);
  const d1 = out["d1-arrays"];
  assert.equal(d1.built, 3);
  assert.equal(d1.planned, 2);
  assert.deepEqual(d1.stretches.map((s) => [s.id, s.nodes.length, s.planned]), [["counting", 2, 1], ["pairs", 1, 0], ["empty", 0, 0], ["surprise-street", 0, 1]]);
  const n = d1.stretches[0].nodes[0];
  assert.equal(n.id, "d1.p1");
  assert.equal(n.href, "/dsa/problems/p1");
  assert.equal(n.type, "practice");
  assert.equal(n.required, true);
  assert.equal(n.level, "easy");
  assert.equal(out["d5-lists"].built, 0, "an unbuilt district keeps its streets and counts");
  assert.equal(out["d5-lists"].planned, 1);
  assert.equal(out["d9-other"], undefined, "rows of a district the plan does not list are ignored");
  assert.equal(waveLabel("launch"), "Opens at launch");
  assert.equal(waveLabel("w3"), "Opens with wave 3");
  assert.equal(waveLabel(undefined), "Opens later");
  assert.equal(districtName("Arrays & Hashing (interview level)"), "Arrays & Hashing");
});

test("listen keys: pattern, structure and algorithm lessons, several per module", () => {
  assert.equal(listenKey("dsa", "m4-two-pointers", "three-sum"), "dsa/m4-two-pointers/three-sum");
  assert.equal(listenKey("dsa", "s1-linked-lists", "linked-lists"), "dsa/s1-linked-lists/linked-lists");
  assert.equal(listenKey("dsa", "s1-linked-lists", "list-reversal"), "dsa/s1-linked-lists/list-reversal");
  assert.equal(listenKey("dsa", "a6-dynamic-programming", "grid-dp"), "dsa/a6-dynamic-programming/grid-dp");
  assert.notEqual(listenKey("dsa", "s1-linked-lists", "linked-lists"), listenKey("dsa", "s1-linked-lists", "list-reversal"));
});
