/**
 * The design-pattern lessons (docs/design-patterns/design-patterns-plan.md): the catalogue of 28, the lesson shape the
 * pattern page reads (src/lib/learn/lld/pattern-format.ts), and the staged-content preview switch.
 *   node --test scripts/tests/lld-pattern.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CASES, PATTERNS, PATTERN_DIR, patternByLessonId, patternCode, patternLessonId, patternSlugOfFile, publishedPatternSlugs, patternBySlug } from "../../src/lib/learn/lld/meta.ts";
import { parsePatternLesson, patternGaps, splitBeforeAfter, groupCode, liftMermaid, missionAsPanel } from "../../src/lib/learn/lld/pattern-format.ts";
import { stagedPathFor, stagedPreviewOn } from "../../src/lib/content-staged.ts";

const F = "```";

/* ------------------------------------------------------------------ the catalogue and its loader */

test("the catalogue is the plan's 28 lessons, numbered 1 to 28 with the plan's ids", () => {
  assert.equal(PATTERNS.length, 28);
  assert.deepEqual(PATTERNS.map((p) => p.n), Array.from({ length: 28 }, (_, i) => i + 1));
  assert.equal(new Set(PATTERNS.map(patternLessonId)).size, 28);
  assert.equal(patternLessonId(patternBySlug("strategy")), "dp-16-strategy");
  assert.equal(patternLessonId(patternBySlug("factory-method-and-abstract-factory")), "dp-07-factory-method-and-abstract-factory");
  assert.equal(patternCode(patternBySlug("singleton")), "DP-06");
  assert.equal(patternByLessonId("dp-28-pattern-map-of-the-case-studies").slug, "pattern-map-of-the-case-studies");
  assert.equal(PATTERN_DIR, "resources/low-level-design", "lessons sit with the case studies");
  // the plan's section 2 groups: 5 foundations, 4 creational, 6 structural, 9 behavioural, 4 in practice
  const count = (g) => PATTERNS.filter((p) => p.group === g).length;
  assert.deepEqual(["foundations", "creational", "structural", "behavioural", "practice"].map(count), [5, 4, 6, 9, 4]);
});

test("the pattern list loader reads dp-NN-* files: published ones are lessons, the rest are coming soon", () => {
  const names = ["lld-01-parking-lot.md", "dp-16-strategy.md", "dp-06-singleton.md", "dp-99-nothing.md", "dp-16-wrong-slug.md", "dp-16-strategy.json", "README.md"];
  assert.deepEqual([...publishedPatternSlugs(names)].sort(), ["singleton", "strategy"]);
  assert.equal(patternSlugOfFile("dp-16-strategy.md"), "strategy");
  assert.equal(patternSlugOfFile("strategy.md"), null, "the old resources/design-patterns/<slug>.md naming is gone");
  assert.equal(publishedPatternSlugs([]).size, 0);
});

test("every case study's pattern chips point at a lesson in the catalogue, matching the plan's table for the spot checks", () => {
  const slugs = new Set(PATTERNS.map((p) => p.slug));
  for (const c of CASES) for (const p of c.patterns) assert.ok(slugs.has(p), `${c.slug}: ${p}`);
  const of = (n) => CASES.find((c) => c.n === n).patterns;
  assert.equal(CASES.filter((c) => c.patterns.includes("strategy")).length, 24, "Strategy is in 24 of 30");
  assert.equal(CASES.filter((c) => c.patterns.includes("state")).length, 15, "State is in 15 of 30");
  assert.equal(CASES.filter((c) => c.patterns.includes("facade")).length, 12, "Facade is in 12 of 30");
  assert.deepEqual(of(10), ["oop-and-composition", "command", "iterator", "concurrency-patterns"]);
  assert.ok(of(22).includes("proxy") && of(18).includes("mediator-and-memento"));
});

/* ------------------------------------------------------------------ the lesson shape */

const LESSON = [
  "# The Strategy Pattern",
  "*One job, many ways.*",
  "",
  ":::mission[Pull an if-ladder apart]{level=\"Medium\"}",
  "- **3** rules",
  ":::",
  "",
  "Intro paragraph.",
  "",
  "::clip[pay-the-bill]",
  "",
  "## The first version: one function that grows",
  "",
  ":::tabs[The first version]{id=\"before\"}",
  F + "python",
  "print(1)",
  F,
  ":::",
  "",
  "## The pattern",
  "Intent and roles.",
  "",
  F + "mermaid",
  "%% title: With the pattern",
  "classDiagram",
  "  class Checkout",
  F,
  "",
  "Checkout holds a Rule.",
  "",
  "## The code",
  "",
  ":::tabs[Strategy]{id=\"strategy\"}",
  F + "python",
  "x = 1",
  F,
  F + "java",
  "int x = 1;",
  F,
  F + "cpp",
  "int x = 1;",
  F,
  F + "javascript",
  "const x = 1;",
  F,
  ":::",
  "",
  "## Who picks the strategy?",
  "At the edge.",
  "",
  "## When not to use it",
  ":::panel[Skip it when]{tone=\"warn\"}",
  "One rule.",
  ":::",
  "",
  "## Where it shows up in the case studies",
  "| Lesson | Class |",
  "|---|---|",
  "| lld-01 | PricingStrategy |",
  "",
  "## In the interview",
  "Say the reason.",
  "",
  "## Common mistakes",
  "Too many classes.",
  "",
  F + "quiz",
  "%% title: Quick check",
  "? q",
  F,
  "",
].join("\n");

test("a plan-format lesson parses into the template's slots", () => {
  const s = parsePatternLesson(LESSON);
  assert.equal(s.title, "The Strategy Pattern");
  assert.equal(s.deck, "One job, many ways.");
  assert.ok(s.intro.includes(":::mission") && s.intro.includes("::clip[pay-the-bill]") && !s.intro.includes("# The Strategy"));
  assert.ok(s.problem.includes(":::tabs[The first version]") && !s.problem.includes("classDiagram"));
  assert.ok(s.pattern.startsWith("Intent and roles.") && !s.pattern.includes("mermaid"), "the diagram is lifted into its own slot");
  assert.equal(s.before, "", "one diagram: it is the pattern's, not a before");
  assert.ok(s.after.includes("classDiagram"));
  assert.ok(s.code.includes(":::tabs[Strategy]"));
  assert.deepEqual(s.codeLangs, ["python", "java", "cpp", "javascript"]);
  assert.deepEqual(s.deep.map((x) => x.title), ["Who picks the strategy?"]);
  assert.ok(s.notUse.includes('tone="warn"'));
  assert.ok(s.cases.includes("PricingStrategy"));
  assert.deepEqual(s.closing.map((x) => x.title), ["In the interview", "Common mistakes"]);
  assert.ok(s.quiz.startsWith(F + "quiz") && !s.closing[1].md.includes("quiz"), "the quiz fence is lifted out of the last section");
  assert.deepEqual(patternGaps(s), []);
});

test("two diagrams make a before and an after; the mission becomes a panel the page can show", () => {
  const two = parsePatternLesson(["# S", "", "## The first version", "x", "", F + "mermaid", "classDiagram", "  class A", F, "", "## The pattern", "y", "", F + "mermaid", "classDiagram", "  class B", F].join("\n"));
  assert.ok(two.before.includes("class A") && two.after.includes("class B"));
  assert.equal(missionAsPanel(':::mission[Do it]{level="Hard"}\n- **1** x\n:::'), ':::panel[Mission (Hard): Do it]{tone="info"}\n- **1** x\n:::');
  assert.equal(liftMermaid("a\n" + F + "mermaid\nclassDiagram\n" + F + "\nb").rest, "a\nb");
});

test("a missing or partial lesson reports what is left", () => {
  assert.deepEqual(patternGaps(null), ["The whole lesson"]);
  const half = parsePatternLesson("# State\n\n## The first version\nx\n");
  assert.ok(half.problem === "x" && half.after === "" && half.code === "");
  const gaps = patternGaps(half);
  assert.ok(["The class diagram", "Java code", "When not to use it", "Quiz"].every((g) => gaps.includes(g)));
  assert.deepEqual(splitBeforeAfter("no figure"), { before: "no figure", after: "" });
  assert.deepEqual(groupCode(F + "java\nx\n" + F), { java: F + "java\nx\n" + F });
});

test("the older flat shape still parses (a Before and after section, plain code fences, a Lab line)", () => {
  const old = ["# Strategy", "", "## The problem", "Pricing keeps changing.", "", "## Before and after", "", F + "mermaid", "classDiagram", "  class Lot", F, "", "The if-chain.", "", F + "mermaid", "classDiagram", "  class Pricing", F, "", "## Code", F + "python", "a", F, F + "js", "b", F, "", "## Lab", "lru-cache", "", "## Quiz", F + "quiz", "? q", F].join("\n");
  const s = parsePatternLesson(old);
  assert.equal(s.problem, "Pricing keeps changing.");
  assert.ok(s.before.includes("class Lot") && s.after.includes("class Pricing"));
  assert.deepEqual(s.codeLangs, ["python", "javascript"]);
  assert.equal(s.lab, "lru-cache");
  assert.ok(s.quiz.includes(F + "quiz"));
});

/* ------------------------------------------------------------------ the staged preview */

test("staged preview is local only: it needs a local checkout and the switch, and never runs in production", () => {
  const on = { SDM_LOCAL_DIR: "/x/sdm", SDM_PREVIEW_STAGED: "1" };
  assert.equal(stagedPreviewOn(on), true);
  assert.equal(stagedPreviewOn({ SDM_PREVIEW_STAGED: "1" }), false, "no local checkout, no preview");
  assert.equal(stagedPreviewOn({ SDM_LOCAL_DIR: "/x/sdm" }), false, "no switch, no preview");
  assert.equal(stagedPreviewOn({ ...on, NODE_ENV: "production" }), false);
  assert.equal(stagedPreviewOn({ ...on, VERCEL_ENV: "production" }), false);
  assert.equal(stagedPreviewOn({ ...on, APP_ENV: "preview" }), false);
  assert.equal(stagedPreviewOn({ ...on, NODE_ENV: "development", APP_ENV: "development" }), true);
  assert.equal(stagedPathFor("resources/low-level-design/dp-16-strategy.md"), "docs/design-patterns/staged/low-level-design/dp-16-strategy.md");
  assert.equal(stagedPathFor("resources"), "docs/design-patterns/staged");
  assert.equal(stagedPathFor("docs/x.md"), null);
  assert.equal(stagedPathFor("resources/../secret"), null);
});
