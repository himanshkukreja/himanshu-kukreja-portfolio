/**
 * The home's Continue card (src/lib/dsa/continue.ts) and the tutor card's sentence (src/lib/dsa/left-off.ts).
 *   node --test scripts/tests/dsa-continue.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { nextStep } from "../../src/lib/dsa/continue.ts";
import { leftOffText } from "../../src/lib/dsa/left-off.ts";

const c = (id, built = true) => ({ id: `m.${id}`, type: "concept", title: id.toUpperCase(), required: true, href: built ? `/dsa/concepts/${id}` : null, ref: id, built });
const p = (id) => ({ id: `m.${id}`, type: "practice", title: `Problem ${id}`, required: true, href: `/dsa/problems/${id}`, ref: id, built: true, level: "easy" });
const cp = (id, quiz, lab) => ({ id, type: "checkpoint", title: "Checkpoint", required: true, href: null, built: true, quiz, problems: [{ id: "q1", title: "Q1", built: true }], ...(lab ? { lab: { id: lab, title: "Lab", href: "" } } : {}) });
const region = (nodes) => ({ id: "r1", code: "m3", module: "mod", title: "Hash", moduleTitle: "Hashing", detail: "full", status: "x", intro: null, line: null, objective: null, stretches: [{ id: "s1", title: "s", nodes }], side: [], boss: null });
const spec = (nodes) => ({ id: "academy", regions: [region(nodes)], parts: [{ id: "part-2", title: "Data structures", label: "Part 2", summary: "", regions: ["r1"] }], final: null });
const NODES = [c("one"), p("a"), p("b"), c("two"), p("c"), cp("m.cp1", "mod/two")];
const concepts = [{ id: "one", title: "One", summary: "first", minutes: 40 }, { id: "two", title: "Two", summary: "second", minutes: 30 }];
const problems = ["a", "b", "c", "q1"].map((id) => ({ id, title: id, level: "easy", minutes: 10, concept: "one" }));
const sig = (o = {}) => ({ concepts: new Set(), solved: new Set(), checkpoints: new Set(), labs: new Set(), tries: new Set(), beats: new Map(), ...o });
const run = (nodes, s, opts) => nextStep(spec(nodes), concepts, problems, sig(s), opts);

test("a new guest starts at lesson 1", () => {
  const n = run(NODES, {});
  assert.equal(n.state, "start");
  assert.equal(n.lessonId, "one");
  assert.match(n.label, /^Start lesson 1/);
  assert.equal(n.step, "learn");
  assert.equal(n.href, "/dsa/concepts/one");
  assert.deepEqual(n.steps.map((s) => s.id), ["learn", "try", "practice", "check"]);
  assert.equal(n.steps[1].optional, true);
});

test("mid-Learn goes to #learn with time left", () => {
  const n = run(NODES, { beats: new Map([["one", new Set(["scenario", "see"])]]) });
  assert.equal(n.state, "continue");
  assert.equal(n.step, "learn");
  assert.equal(n.href, "/dsa/concepts/one#learn");
  assert.match(n.label, /Learn · ONE/);
  assert.ok(n.minutesLeft >= 5 && n.minutesLeft % 5 === 0);
});

test("frontier on a practice node: the next unsolved problem", () => {
  const n = run(NODES, { concepts: new Set(["one"]), beats: new Map([["one", new Set(["a", "b", "c", "d", "e", "f"])]]), solved: new Set(["a"]) });
  assert.equal(n.step, "practice");
  assert.equal(n.href, "/dsa/problems/b");
  assert.equal(n.label, "Continue: Problem b");
  assert.deepEqual(n.practice, { solved: 1, total: 2 });
  assert.equal(n.stepLabel, "Practice · 2 of 2");
});

test("a lab-only learner: the lab ticks Try, the lesson still starts at Learn", () => {
  const nodes = [c("one"), p("a"), cp("m.cp1", "mod/one", "lab-1")];
  const n = run(nodes, { labs: new Set(["lab-1"]) });
  assert.equal(n.state, "continue");
  assert.equal(n.step, "learn");
  assert.equal(n.steps[1].done, true);
  assert.equal(n.steps[1].optional, false);
});

test("a lab lesson makes Try the current step once Learn is done", () => {
  const nodes = [c("one"), cp("m.cp1", "mod/one", "lab-1")];
  const n = run(nodes, { concepts: new Set(["one"]) });
  // the lesson is complete, so the frontier is the checkpoint: Try (the lab) comes before Check
  assert.equal(n.step, "try");
  assert.equal(n.href, "/dsa/concepts/one#try");
});

test("checkpoint frontier belongs to its quiz owner and ends at Check", () => {
  const all = { concepts: new Set(["one", "two"]), solved: new Set(["a", "b", "c"]) };
  const n = run(NODES, all);
  assert.equal(n.lessonId, "two");
  assert.equal(n.step, "check");
  assert.equal(n.href, "/dsa/concepts/two#check");
});

test("everything built is done: up to date", () => {
  const n = run(NODES, { concepts: new Set(["one", "two"]), solved: new Set(["a", "b", "c", "q1"]), checkpoints: new Set(["m.cp1"]) });
  assert.equal(n.state, "caught-up");
});

test("planned lessons only: empty", () => {
  assert.equal(run([c("x", false)], {}).state, "empty");
});

test("the tutor sentence", () => {
  const t = leftOffText({ lesson: "Prefix sums", solved: 1, total: 5, problems: [{ id: "a", title: "Subarrays" }], fails: { a: { WA: 2 } }, nextTitle: "Next one" });
  assert.match(t, /solved 1 of 5/);
  assert.match(t, /"Subarrays" gave you a wrong answer twice/);
  assert.match(t, /Next up: "Next one"/);
  assert.doesNotMatch(leftOffText({ lesson: "L", solved: 0, total: 0, problems: [], fails: {}, nextTitle: null }), /solved/);
});
