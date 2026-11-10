/**
 * The design-pattern lesson format (src/lib/learn/lld/pattern-format.ts): the slots a pattern page
 * fills, and what it reports as missing.
 *   node --test scripts/tests/lld-pattern.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parsePatternLesson, patternGaps, splitBeforeAfter, groupCode } from "../../src/lib/learn/lld/pattern-format.ts";

const F = "```";
const PATTERN_MD = [
  "# Strategy",
  "*Swap a rule without touching the class that uses it.*",
  "",
  "## The problem",
  "Pricing keeps changing.",
  "",
  "## Before and after",
  "",
  F + "mermaid",
  "classDiagram",
  "  class Lot",
  F,
  "",
  "The if-chain lives in Lot.",
  "",
  F + "mermaid",
  "classDiagram",
  "  class Lot",
  "  class Pricing {",
  "    <<interface>>",
  "  }",
  F,
  "",
  "Lot holds a Pricing.",
  "",
  "## Code",
  "",
  "### Python",
  F + "python",
  "class A: ...",
  F,
  F + "js",
  "const a = 1;",
  F,
  F + "ruby",
  "puts 1",
  F,
  "",
  "## When not to use it",
  "One rule that never changes.",
  "",
  "## Lab",
  "lru-cache",
  "",
  "## Quiz",
  F + "quiz",
  "? q",
  F,
  "",
  "## Go deeper",
  "More.",
  "",
].join("\n");

test("a pattern lesson parses into the template's slots", () => {
  const s = parsePatternLesson(PATTERN_MD);
  assert.equal(s.title, "Strategy");
  assert.equal(s.deck, "Swap a rule without touching the class that uses it.");
  assert.equal(s.problem, "Pricing keeps changing.");
  assert.ok(s.before.includes("class Lot") && s.before.includes("The if-chain lives in Lot.") && !s.before.includes("Pricing {"));
  assert.ok(s.after.includes("<<interface>>") && s.after.includes("Lot holds a Pricing."));
  assert.deepEqual(Object.keys(s.code).sort(), ["javascript", "python"], "js is the javascript tab; an unknown language is dropped");
  assert.ok(s.code.javascript.startsWith(F + "javascript"));
  assert.equal(s.notUse, "One rule that never changes.");
  assert.equal(s.lab, "lru-cache");
  assert.ok(s.quiz.includes(F + "quiz"));
  assert.deepEqual(s.extra, [{ title: "Go deeper", md: "More." }]);
  assert.deepEqual(patternGaps(s), ["Java code", "C++ code"]);
});

test("a missing or partial pattern lesson reports what is left", () => {
  assert.deepEqual(patternGaps(null), ["The whole lesson"]);
  const half = parsePatternLesson("# State\n\n## The problem\nx\n");
  assert.ok(half.problem === "x" && half.before === "" && half.lab === null);
  assert.ok(patternGaps(half).includes("When not to use it") && patternGaps(half).includes("Quiz"));
  assert.deepEqual(splitBeforeAfter("no figure"), { before: "no figure", after: "" });
  assert.deepEqual(groupCode(F + "java\nx\n" + F), { java: F + "java\nx\n" + F });
});
