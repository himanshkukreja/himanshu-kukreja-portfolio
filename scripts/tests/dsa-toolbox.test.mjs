/**
 * Progress upgrades (17 Nov 2026): the toolbox (a finished station earns its tool), the skill radar, and in-lesson exercises
 * counting towards "learnt" and Bits.   node --test scripts/tests/dsa-toolbox.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { STATIONS } from "../../src/lib/dsa/metro/layout.ts";
import { buildMetro, stationDone } from "../../src/lib/dsa/metro/model.ts";
import { BANDS, TOOLS, bandFor, isFresh, newlyEarned, toolKey, toolbox } from "../../src/lib/dsa/metro/toolbox.ts";
import { GROUPS, LEVEL_WEIGHT, radarPoint, skillRadar } from "../../src/lib/dsa/skill-radar.ts";
import { exerciseIdsOf, exerciseKey, exercisesLeft, exercisesLeftText, exercisesSolved } from "../../src/lib/dsa/exercise-gate.ts";
import { BITS_TABLE, awardsOf, bitsOfKey, computeBits } from "../../src/lib/dsa/rewards.ts";

const lesson = (id, built = true) => ({ conceptId: id, title: id, href: built ? `/dsa/concepts/${id}` : null, kind: "concept", minutes: 10, problemCount: 2, built, nodeId: id });
const cp = (nodeId) => ({ nodeId, afterLesson: "", quizOwner: "", href: null, problems: [], hasLab: false, minutes: 5, built: true });
const mod = (regionId, lessons, checkpoints = []) => ({ regionCode: regionId.split("-")[0], regionId, moduleId: regionId, step: "", title: regionId, objective: "", lessons, checkpoints, minutes: 10, problemCount: 0, planned: false, placement: { built: false }, boss: null, readyLessons: lessons.length });
const PARTS = {
  "part-1": ["m0-toolkit", "m1-complexity"],
  "part-2": ["m2-arrays-strings", "m3-hashing", "s1-linked-lists", "s2-stacks", "s3-queues-and-deques", "s4-trees-and-bst", "s5-heaps", "s6-graphs", "s7-tries"],
  "part-3": ["m6-recursion", "m7-sorting", "m8-binary-search", "a1-graph-traversal", "a2-shortest-paths", "a3-topological-sort", "a4-union-find", "a5-greedy", "a6-dynamic-programming", "a7-string-basics", "a8-bits-and-maths", "a9-range-queries"],
  "part-4": ["m4-two-pointers", "m5-sliding-window"],
};
// every topic has two written lessons, except Tries (none written: it must not get a tool yet)
const outline = {
  parts: Object.entries(PARTS).map(([id, regs]) => ({
    id, label: id, title: id, summary: "",
    modules: regs.map((r) => (r === "s7-tries" ? mod(r, [lesson(`${r}-1`, false)]) : mod(r, [lesson(`${r}-1`), lesson(`${r}-2`)], [cp(`${r}/cp`)]))),
  })),
  totals: { lessons: 0, ready: 0, planned: 0, problems: 0 },
};
const problems = [
  { id: "p-easy", concept: "m0-toolkit-1", level: "easy" },
  { id: "p-med", concept: "m0-toolkit-2", level: "medium" },
  { id: "p-hard", concept: "m0-toolkit-2", level: "hard" },
  { id: "p-hash", concept: "m3-hashing-1", level: "medium" },
];
const prog = (concepts = [], solved = [], checkpoints = []) => ({ concepts: new Set(concepts), solved: new Set(solved), checkpoints: new Set(checkpoints) });

test("tools: every metro station has a named tool with an icon", () => {
  for (const s of STATIONS) assert.ok(TOOLS[s.id]?.name && TOOLS[s.id]?.icon, s.id);
});

test("station done: the one rule (written lessons all done), also used by the map", () => {
  assert.equal(stationDone([], new Set()), false, "nothing written is never done");
  assert.equal(stationDone(["a", "b"], new Set(["a"])), false);
  assert.equal(stationDone(["a", "b"], new Set(["a", "b", "z"])), true);
  const m = buildMetro(outline, prog(["m0-toolkit-1", "m0-toolkit-2", "m1-complexity-1"]), problems);
  assert.equal(m.byId.get("m0-toolkit").state, "done");
  assert.equal(m.byId.get("m1-complexity").state, "prog");
  assert.deepEqual(m.byId.get("m0-toolkit").lessonIds, ["m0-toolkit-1", "m0-toolkit-2"]);
});

test("toolbox: a finished station earns its tool, dated by its last lesson, used in the solved problems of the topic", () => {
  const t0 = Date.UTC(2026, 10, 10);
  const done = { "dsa:c:m0-toolkit-1": t0, "dsa:c:m0-toolkit-2": t0 + 86_400_000, "dsa:c:m1-complexity-1": t0 };
  const m = buildMetro(outline, prog(["m0-toolkit-1", "m0-toolkit-2", "m1-complexity-1"], ["p-easy", "p-hard", "p-hash"]), problems);
  const box = toolbox(m, done, "m1-complexity");
  const tk = box.tools.find((t) => t.id === "m0-toolkit");
  assert.equal(tk.earned, true);
  assert.equal(tk.name, "Toolkit");
  assert.equal(tk.earnedAt, t0 + 86_400_000);
  assert.equal(tk.usedIn, 2, "p-easy and p-hard are tagged with the Toolkit topic");
  const cx = box.tools.find((t) => t.id === "m1-complexity");
  assert.equal(cx.earned, false);
  assert.equal(cx.usedIn, 0);
  assert.deepEqual([cx.lessonsDone, cx.lessons], [1, 2]);
  assert.equal(box.next.id, "m1-complexity", "the station the learner is on is the next tool");
  assert.equal(box.earned.length, 1);
  assert.equal(box.usedTotal, 2);
  // Tries has no lesson written: no tool, not counted
  assert.equal(box.tools.some((t) => t.id === "s7-tries"), false);
  assert.equal(box.total, STATIONS.length - 1);
  assert.equal(box.tools[0].id, "m0-toolkit", "earned tools come first");
});

test("toolbox: a recorded tool stays earned if a lesson is added to its topic later", () => {
  const m = buildMetro(outline, prog(["m0-toolkit-1"]), problems);
  const without = toolbox(m, {});
  assert.equal(without.tools.find((t) => t.id === "m0-toolkit").earned, false);
  const kept = toolbox(m, { [toolKey("m0-toolkit")]: 5000 });
  const t = kept.tools.find((x) => x.id === "m0-toolkit");
  assert.equal(t.earned, true);
  assert.equal(t.earnedAt, 5000, "no lesson times to go by: the key's time");
});

test("toolbox: the next tool, with nobody on a station, is the most advanced locked one", () => {
  const m = buildMetro(outline, prog(["m3-hashing-1", "s1-linked-lists-1", "s1-linked-lists-2"]), problems);
  const box = toolbox(m, {});
  assert.equal(box.next.id, "m3-hashing");
  assert.equal(toolbox(m, {}, "s2-stacks").next.id, "s2-stacks");
});

test("bands: by tools earned, the next one reachable even with few tools", () => {
  assert.equal(bandFor(0, 24).band.id, "foundations");
  assert.equal(bandFor(7, 22).band.id, "building");
  assert.equal(bandFor(7, 22).nextAt, 12);
  assert.equal(bandFor(12, 24).band.id, "fluent");
  assert.equal(bandFor(24, 24).band.id, "interview");
  assert.equal(bandFor(24, 24).next, null);
  // only 6 tools exist (early course): the top band is capped so the bar can fill
  const few = bandFor(6, 6);
  assert.equal(few.band.id, "interview");
  assert.equal(BANDS.length, 4);
});

test("fresh: earned in the last two days", () => {
  const now = Date.now();
  assert.equal(isFresh({ earned: true, earnedAt: now - 3600_000 }, now), true);
  assert.equal(isFresh({ earned: true, earnedAt: now - 5 * 86_400_000 }, now), false);
  assert.equal(isFresh({ earned: false, earnedAt: null }, now), false);
});

test("toast: a tool is recorded once and announced only when the station was finished just now", () => {
  const now = Date.now();
  const stations = [{ id: "m0-toolkit", lessonIds: ["a", "b"] }, { id: "m1-complexity", lessonIds: ["c"] }, { id: "m2-arrays-strings", lessonIds: [] }, { id: "m3-hashing", lessonIds: ["d"] }];
  const concepts = new Set(["a", "b", "c"]);
  // Toolkit finished long ago (a quiet backfill), Complexity two minutes ago (announce), Hashing not done, Arrays nothing written
  const done = { "dsa:c:a": now - 9 * 86_400_000, "dsa:c:b": now - 8 * 86_400_000, "dsa:c:c": now - 120_000 };
  const first = newlyEarned(stations, concepts, done, now);
  assert.deepEqual(first.record, ["m0-toolkit", "m1-complexity"]);
  assert.deepEqual(first.announce, ["m1-complexity"]);
  // after the keys are written (they sync to the account), nothing is recorded or announced again, on any device
  const again = newlyEarned(stations, concepts, { ...done, [toolKey("m0-toolkit")]: now, [toolKey("m1-complexity")]: now }, now);
  assert.deepEqual(again, { record: [], announce: [] });
});

test("radar: strength per topic group from solves (difficulty-weighted), lessons, quizzes and exercises", () => {
  const empty = skillRadar({ outline, metro: buildMetro(outline, prog(), problems), problems, concepts: new Set(), solved: new Set(), checkpoints: new Set(), done: {} });
  assert.deepEqual(empty.map((a) => a.id), GROUPS.map((g) => g.id));
  assert.ok(empty.every((a) => a.strength === 0));

  // Foundations: Toolkit's two lessons learnt, the Easy and the Hard solved (the Medium is not): weighted 1+3 of 1+2+3
  const p = prog(["m0-toolkit-1", "m0-toolkit-2"], ["p-easy", "p-hard"], ["m0-toolkit/cp"]);
  const axes = skillRadar({ outline, metro: buildMetro(outline, p, problems), problems, concepts: p.concepts, solved: p.solved, checkpoints: p.checkpoints, done: {} });
  const f = axes.find((a) => a.id === "foundations");
  assert.deepEqual(f.problems, { solved: 2, total: 3, weighted: 1 * LEVEL_WEIGHT.easy + LEVEL_WEIGHT.hard, weightedTotal: 6 });
  assert.deepEqual(f.lessons, { done: 2, total: 4 });
  assert.deepEqual(f.checkpoints, { passed: 1, total: 2 });
  // 0.5*(4/6) + 0.2*(2/4) + 0.2*(1/2) over 0.9, no exercise share yet
  assert.equal(f.strength, Math.round(((0.5 * (4 / 6) + 0.2 * 0.5 + 0.2 * 0.5) / 0.9) * 100));
  assert.equal(axes.find((a) => a.id === "linear").strength, 0);

  // a solved exercise adds its share; one per learnt lesson is full marks
  const withEx = skillRadar({ outline, metro: buildMetro(outline, p, problems), problems, concepts: p.concepts, solved: p.solved, checkpoints: p.checkpoints, done: { [exerciseKey("m0-toolkit-1", "e1")]: 1, [exerciseKey("m0-toolkit-2", "e1")]: 1 } });
  const f2 = withEx.find((a) => a.id === "foundations");
  assert.equal(f2.exercises, 2);
  assert.equal(f2.strength, Math.round(((0.5 * (4 / 6) + 0.2 * 0.5 + 0.2 * 0.5 + 0.1 * 1) / 1.0) * 100));
  assert.ok(f2.strength > f.strength);
});

test("radar: points sit on the axes, clockwise from the top", () => {
  assert.deepEqual(radarPoint(0, 4, 100, 100).map(Math.round), [0, -100]);
  assert.deepEqual(radarPoint(1, 4, 100, 100).map(Math.round), [100, 0]);
  assert.deepEqual(radarPoint(2, 4, 50, 100).map(Math.round), [0, 50]);
  assert.deepEqual(radarPoint(0, 6, 150, 10).map(Math.round), [0, -10], "clamped to 100");
});

const FIG = (id) => `<figure class="sdb dsa-block dsa-widget dsa-exercise" data-sd="dsa-exercise" data-dsa="exercise" data-id="${id}" data-ex-kind="bug" data-ex='{"id":"${id}"}' id="ex-${id}"><p>q</p></figure>`;

test("exercises: ids are read from the rendered lesson, once each, in page order", () => {
  const html = `<section>${FIG("bs-off-by-one")}<p>text</p>${FIG("pred-1")}${FIG("bs-off-by-one")}<figure data-dsa="trace" id="ex-not-this"></figure></section>`;
  assert.deepEqual(exerciseIdsOf(html), ["bs-off-by-one", "pred-1"]);
  assert.deepEqual(exerciseIdsOf("<p>no exercises</p>"), []);
  assert.deepEqual(exerciseIdsOf(null), []);
});

test("exercises: ids are found even when the data-ex JSON holds > and quotes", () => {
  const f = `<figure class="sdb dsa-exercise" data-dsa="exercise" data-id="bs-x" data-ex-kind="bug" data-ex="{&#x22;q&#x22;:&#x22;a > b&#x22;}" id="ex-bs-x"><p>q</p></figure>`;
  assert.deepEqual(exerciseIdsOf(f), ["bs-x"]);
});

test("exercises: left = not in the game store and not on this device; the text says how many", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(exercisesLeft("lesson", ids, {}), ["a", "b", "c"]);
  assert.deepEqual(exercisesLeft("lesson", ids, { [exerciseKey("lesson", "a")]: 5 }, { b: 9 }), ["c"]);
  assert.deepEqual(exercisesLeft("lesson", ids, { [exerciseKey("lesson", "a")]: 5, [exerciseKey("lesson", "b")]: 5, [exerciseKey("lesson", "c")]: 5 }), []);
  // another lesson's solves do not count
  assert.deepEqual(exercisesLeft("lesson", ["a"], { [exerciseKey("other", "a")]: 5 }), ["a"]);
  assert.equal(exercisesLeftText(2), "2 exercises left");
  assert.equal(exercisesLeftText(1), "1 exercise left");
  assert.equal(exercisesLeftText(0), "");
  assert.equal(exercisesSolved({ [exerciseKey("l", "a")]: 1, [exerciseKey("l", "b")]: 1, [exerciseKey("m", "a")]: 1 }, "l"), 2);
});

test("exercises: each solved exercise is worth 5 Bits, once, whatever the sync does", () => {
  assert.equal(BITS_TABLE.exercise, 5);
  assert.ok(BITS_TABLE.exercise > BITS_TABLE.quickCheck && BITS_TABLE.exercise <= BITS_TABLE.dryRun, "between a quick check and a dry run");
  const k = exerciseKey("windows", "ex1");
  assert.equal(bitsOfKey(k), 5);
  const a = awardsOf({ [k]: 100, [exerciseKey("windows", "ex2")]: 200, "dsa:tool:m0-toolkit": 300 });
  assert.equal(a.filter((x) => x.kind === "exercise").length, 2);
  assert.equal(computeBits(a).total, 10, "tool keys are worth nothing; two exercises are 10");
  // the same key merged from two devices is still one award
  assert.equal(computeBits([...a, ...awardsOf({ [k]: 999 })]).total, 10);
  assert.equal(computeBits(a).byKind.exercise, 10);
});
