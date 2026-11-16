import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// the module is plain TypeScript with no imports: transpile it and load it as ESM
const src = readFileSync(new URL("../../src/lib/dsa/lesson-steps.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const { stepOfStage, groupStages, learnBeats, visibleStages, stepOfHash, nextStep, prevStep, hideStagesCss, normaliseLabel, stepSub } = mod;

const concept = ["intro", "scenario", "struggle", "see", "shape", "stretch", "say"].map((id) => ({ id }));
const structure = [
  { id: "intro", label: "Intro" },
  { id: "operations", label: "Operations" },
  { id: "sandbox", label: "Try it" },
  { id: "build", label: "Build it" },
  { id: "choose", label: "Use it well" },
  { id: "recap", label: "Recap" },
];
const algorithm = [
  { id: "intro", label: "Intro" },
  { id: "see", label: "See it move" },
  { id: "why", label: "Why it works" },
  { id: "build", label: "Build it" },
  { id: "choose", label: "Use it well" },
  { id: "recap", label: "Recap" },
];

test("concept: Scenario..Stretch are Learn, Say is Check", () => {
  const g = groupStages("concept", concept);
  assert.deepEqual(g.learn, ["intro", "scenario", "struggle", "see", "shape", "stretch"]);
  assert.deepEqual(g.check, ["say"]);
  assert.deepEqual(g.try, []);
  assert.deepEqual(g.practice, []);
});

test("structure: sandbox and lab are Try it, recap is Check", () => {
  const g = groupStages("structure", structure);
  assert.deepEqual(g.learn, ["intro", "operations", "choose"]);
  assert.deepEqual(g.try, ["sandbox", "build"]);
  assert.deepEqual(g.check, ["recap"]);
});

test("algorithm: the lab is Try it; See it move stays in Learn", () => {
  const g = groupStages("algorithm", algorithm);
  assert.deepEqual(g.learn, ["intro", "see", "why", "choose"]);
  assert.deepEqual(g.try, ["build"]);
  assert.deepEqual(g.check, ["recap"]);
});

test("the same label means different steps per kind", () => {
  assert.equal(stepOfStage("concept", { id: "x", label: "Try it" }), "learn");
  assert.equal(stepOfStage("structure", { id: "x", label: "Try it" }), "try");
});

test("an unknown beat goes to Learn; a label can stand in for the id", () => {
  assert.equal(stepOfStage("structure", "something-new"), "learn");
  assert.equal(stepOfStage("algorithm", { id: "b2", label: "Build it" }), "try");
  assert.equal(stepOfStage("concept", { id: "z", label: "Recap" }), "check");
  assert.equal(normaliseLabel("Use it well"), "use-it-well");
});

test("Read pages Learn's beats; the intro shows with the first", () => {
  assert.deepEqual(learnBeats("concept", concept), ["scenario", "struggle", "see", "shape", "stretch"]);
  assert.deepEqual(visibleStages({ kind: "concept", stages: concept, step: "learn", beat: null, whole: false }), ["intro", "scenario"]);
  assert.deepEqual(visibleStages({ kind: "concept", stages: concept, step: "learn", beat: "shape", whole: false }), ["shape"]);
  assert.deepEqual(visibleStages({ kind: "concept", stages: concept, step: "learn", beat: "nope", whole: false }), ["intro", "scenario"]);
});

test("whole lesson shows every beat of the step; other steps show their group", () => {
  assert.deepEqual(visibleStages({ kind: "structure", stages: structure, step: "learn", beat: "choose", whole: true }), ["intro", "operations", "choose"]);
  assert.deepEqual(visibleStages({ kind: "structure", stages: structure, step: "try", beat: null, whole: false }), ["sandbox", "build"]);
  assert.deepEqual(visibleStages({ kind: "concept", stages: concept, step: "practice", beat: null, whole: false }), []);
});

test("hashes and neighbours", () => {
  assert.equal(stepOfHash("#try"), "try");
  assert.equal(stepOfHash("#check"), "check");
  assert.equal(stepOfHash("#operations"), null);
  assert.equal(nextStep("learn"), "try");
  assert.equal(nextStep("check"), null);
  assert.equal(prevStep("learn"), null);
  assert.equal(prevStep("practice"), "try");
});

test("the hide stylesheet keeps the shown beats and nothing else", () => {
  const css = hideStagesCss(["intro", "scenario"]);
  assert.match(css, /:not\(\[data-stage-id="intro"\]\):not\(\[data-stage-id="scenario"\]\)/);
  assert.match(css, /display:none!important/);
  assert.match(hideStagesCss([]), /section\[data-sd="stage"\]\{display:none!important\}/);
  // ids are scrubbed so a stage id can never break out of the selector
  assert.ok(!hideStagesCss(['a"]x']).includes('"]x'));
});

test("the rail sub-line is honest about a concept without a lab", () => {
  const f = { learnBeats: 5, tryBeats: 0, traces: 0, races: 0, hasVisualizer: false, practice: 4, checkBeats: 1 };
  assert.equal(stepSub("try", "concept", f), "Lab coming");
  assert.equal(stepSub("try", "concept", { ...f, traces: 2 }), "Step through it");
  assert.equal(stepSub("practice", "concept", f), "4 problems");
  assert.equal(stepSub("practice", "concept", { ...f, practice: 1 }), "1 problem");
});
