/**
 * The DSA home's outline (src/lib/dsa/outline.ts): parts in order, modules, lessons, checkpoint rows, planned content.
 *   node --test scripts/tests/dsa-outline.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildOutline, fmtDuration, moduleOfLesson } from "../../src/lib/dsa/outline.ts";

const concept = (id, n, extra = {}) => ({ id, type: "concept", title: id, required: true, href: extra.built === false ? null : `/dsa/concepts/${id}`, ref: id, built: extra.built !== false });
const academy = {
  parts: [
    { id: "part-1", title: "Toolkit", label: "Part 1", summary: "", regions: ["m1"] },
    { id: "part-2", title: "Data structures", label: "Part 2", summary: "", regions: ["m3"] },
  ],
  final: { id: "final", type: "boss", title: "Launch week", required: true, href: null, built: false },
  regions: [
    { id: "m1", code: "m1", module: "m1-x", title: "Lab", moduleTitle: "Complexity", detail: "outline", step: "1.1", intro: null, objective: "obj", stretches: [{ id: "s1", title: "c", nodes: [concept("a", 0, { built: false })] }], side: [], boss: null },
    {
      id: "m3", code: "m3", module: "m3-hashing", title: "Hash", moduleTitle: "Hashing", detail: "full", step: "2.2", intro: null, objective: null,
      stretches: [
        { id: "s1", title: "s", nodes: [concept("h1"), { id: "p1", type: "practice", title: "P", required: true, built: true, href: "/dsa/problems/p1", ref: "p1" }, concept("h2"), { id: "m3.checkpoint-1", type: "checkpoint", title: "Checkpoint", required: true, built: true, href: null, quiz: "m3-hashing/h2", problems: [{ id: "x", title: "X", built: true }, { id: "y", title: "Y", built: true }] }] },
      ],
      side: [], boss: { id: "m3.boss", type: "boss", title: "Hash review", required: true, href: null, built: false },
    },
  ],
};
const concepts = [
  { id: "a", module: "m1-x", status: "planned", title: "A" },
  { id: "h1", module: "m3-hashing", status: "built", title: "H1" },
  { id: "h2", module: "m3-hashing", status: "built", title: "H2" },
];
const problems = [{ id: "p1", concept: "h1" }, { id: "p2", concept: "h1" }, { id: "x", concept: "h2" }];

test("parts in order with modules, lessons and totals", () => {
  const o = buildOutline(academy, concepts, problems, {}, { h1: 40, h2: 30 });
  assert.deepEqual(o.parts.map((p) => p.label), ["PART 1", "PART 2"]);
  const m3 = o.parts[1].modules[0];
  assert.equal(m3.regionCode, "m3");
  assert.equal(m3.step, "2.2");
  assert.equal(m3.title, "Hashing");
  assert.deepEqual(m3.lessons.map((l) => l.conceptId), ["h1", "h2"]);
  assert.equal(m3.minutes, 70);
  assert.equal(m3.problemCount, 3);
  assert.equal(m3.lessons[0].problemCount, 2);
  assert.equal(m3.lessons[0].lectureSlug, "dsa--m3-hashing--h1");
  assert.equal(o.totals.ready, 2);
  assert.equal(o.totals.planned, 1);
  assert.equal(o.totals.problems, 3);
});

test("planned modules and lessons have no links", () => {
  const o = buildOutline(academy, concepts, problems, {});
  const m1 = o.parts[0].modules[0];
  assert.equal(m1.planned, true);
  assert.equal(m1.lessons[0].href, null);
  assert.equal(m1.lessons[0].lectureSlug, undefined);
});

test("a checkpoint row follows the last lesson of its stretch and opens the owner's #check; practice is never a row", () => {
  const m3 = buildOutline(academy, concepts, problems, {}).parts[1].modules[0];
  assert.equal(m3.checkpoints.length, 1);
  const c = m3.checkpoints[0];
  assert.equal(c.afterLesson, "h2");
  assert.equal(c.quizOwner, "h2");
  assert.equal(c.href, "/dsa/concepts/h2#check");
  assert.equal(c.problems.length, 2);
  assert.equal(m3.lessons.some((l) => l.conceptId === "p1"), false);
});

test("the final review closes the last part; lookups", () => {
  const o = buildOutline(academy, concepts, problems, {});
  assert.equal(o.parts[1].final.title, "Launch week");
  assert.equal(moduleOfLesson(o, "h2").index, 1);
  assert.equal(moduleOfLesson(o, "zzz"), null);
  assert.equal(fmtDuration(220), "3 h 40 min");
  assert.equal(fmtDuration(120), "2 h");
  assert.equal(fmtDuration(40), "40 min");
});
