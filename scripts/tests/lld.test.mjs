/**
 * The low-level design section's pure parts (src/lib/learn/lld): heading → step mapping, the
 * restructured lesson, the class explorer's parsing, the case-study filters, the pattern map and the
 * suggested path. With SDM_LOCAL_DIR (the content repo's resources folder) the real 22 lessons are
 * checked too.
 *   node --test scripts/tests/lld.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CASES, PATTERNS, PATTERN_GROUPS, CORE_PATTERNS, caseBySlug } from "../../src/lib/learn/lld/meta.ts";
import { STEPS, restructureLld, splitSections, stepOfHeading, findMermaid, MOUNTS } from "../../src/lib/learn/lld/steps.ts";
import { parseClassDiagram, extractPythonClass, explorerClasses } from "../../src/lib/learn/lld/classes.ts";
import { filterCases, patternMap, suggestedPath, nextOnPath, parseFilters, filtersToQuery, facets, casePct, NO_FILTERS } from "../../src/lib/learn/lld/filters.ts";

const FIXTURE = `# Design a Widget

*A deck line.*

:::mission[Design a widget]{level="Medium"}
- **60 min** round
:::

Intro text.

## How the round runs

Interviewer says hi.

## Requirements and clarifying questions

Ask things.

\`\`\`text
## not a heading, inside a fence
\`\`\`

## The classes

Pull the nouns.

\`\`\`mermaid
%% title: Widget
classDiagram
  class Widget {
    +run() int
  }
  class Shape {
    <<interface>>
    +area() float
  }
  Widget "1" *-- "many" Part
  Shape <|.. Circle
  Widget --> Shape
\`\`\`

Say these three things aloud.

## The interfaces

\`\`\`python
from abc import ABC

class Shape(ABC):
    def area(self): ...

@dataclass
class Part:
    x: int

# a comment between classes
def helper():
    pass
\`\`\`

## Mid-way deep dive

More code reasoning.

## The patterns, and why

| Pattern | Where |
|---|---|
| **Strategy** | Shape |

## Concurrency and edge cases

One lock.

## The code

\`\`\`python
print("x")
\`\`\`
\`\`\`js
console.log(1)
\`\`\`

## Extending it: the follow-ups

- one

## Common mistakes

- none
`;

test("headings map onto the seven steps", () => {
  assert.equal(stepOfHeading("Requirements and clarifying questions"), "requirements");
  assert.equal(stepOfHeading("The classes"), "entities");
  assert.equal(stepOfHeading("The states"), "diagram");
  assert.equal(stepOfHeading("The patterns, and why"), "patterns");
  assert.equal(stepOfHeading("Concurrency and edge cases"), "concurrency");
  assert.equal(stepOfHeading("Extending it: the follow-ups"), "followups");
  assert.equal(stepOfHeading("Common mistakes"), "followups");
  assert.equal(stepOfHeading("How the round runs"), "intro");
  assert.equal(stepOfHeading("The interfaces"), "code");
  assert.equal(stepOfHeading("The code"), "code");
  assert.equal(stepOfHeading("The matching engine"), "code", "a deep dive between the interfaces and the code is code");
  assert.deepEqual(STEPS.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7]);
});

test("splitSections ignores headings inside code fences", () => {
  const { head, sections } = splitSections(FIXTURE);
  assert.ok(head.join("\n").includes("# Design a Widget"));
  assert.ok(!sections.some((s) => s.title.startsWith("not a heading")));
  assert.equal(sections.length, 10);
});

test("findMermaid finds the class diagram's fence", () => {
  const lines = ["a", "```mermaid", "%% title: x", "classDiagram", "  class A", "```", "b"];
  assert.deepEqual(findMermaid(lines), { start: 1, end: 6 });
  assert.equal(findMermaid(["```mermaid", "flowchart TD", "```"]), null);
});

test("restructureLld: seven step headings in order, the diagram split off the entities", () => {
  const { markdown, analysis } = restructureLld(FIXTURE, { labs: true });
  const heads = [...markdown.matchAll(/^# (Step \d+: .+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads, STEPS.map((s) => `Step ${s.n}: ${s.label}`));
  const at = (n) => markdown.indexOf(`# Step ${n}:`);
  assert.ok(markdown.indexOf("Pull the nouns.") > at(2) && markdown.indexOf("Pull the nouns.") < at(3));
  assert.ok(markdown.indexOf("classDiagram") > at(3) && markdown.indexOf("classDiagram") < at(4));
  assert.ok(markdown.indexOf("Say these three things aloud.") > at(3) && markdown.indexOf("Say these three things aloud.") < at(4));
  // the interfaces and the later "The code" both land in step 5, the deep dive too
  assert.ok(markdown.indexOf("class Shape(ABC)") > at(5) && markdown.indexOf("Mid-way deep dive") > at(5));
  assert.ok(markdown.indexOf("Mid-way deep dive") < at(6));
  // the intro stays before step 1
  assert.ok(markdown.indexOf("Interviewer says hi.") < at(1));
  for (const m of [MOUNTS.gateDiagram, MOUNTS.explorer, MOUNTS.entities, MOUNTS.gateCode, MOUNTS.tabs, MOUNTS.lab]) assert.ok(markdown.includes(m), m);
  assert.deepEqual(analysis.present, STEPS.map((s) => s.key));
  assert.deepEqual(analysis.fallthrough, ["Mid-way deep dive"]);
  assert.ok(analysis.langs.includes("python") && analysis.langs.includes("javascript"), "js fences are recognised and renamed");
  assert.ok(markdown.includes("```javascript"));
  assert.ok(analysis.missing.includes("Interview checklist (a generic one is shown)"));
  assert.ok(analysis.missing.some((m) => m.startsWith("Code in Java, C++")));
  assert.ok(!markdown.includes("Not written for this problem yet"));
});

test("a missing step gets a placeholder and is listed", () => {
  const { markdown, analysis } = restructureLld("# Design A\n\n## Requirements and clarifying questions\n\nask\n");
  assert.equal([...markdown.matchAll(/^# Step \d+:/gm)].length, 7);
  assert.ok(analysis.missing.includes("Patterns applied") && analysis.missing.includes("Class diagram"));
  assert.equal([...markdown.matchAll(/Not written for this problem yet/g)].length, 6);
  assert.deepEqual(analysis.present, ["requirements"]);
});

test("a lesson's own interview checklist replaces the generic one", () => {
  const { markdown, analysis } = restructureLld(FIXTURE + "\n## Interview checklist\n\n- [ ] mine\n");
  assert.ok(analysis.hasChecklist);
  assert.ok(markdown.includes("- [ ] mine"));
  assert.ok(!markdown.includes("The lesson has no checklist of its own yet"));
});

test("the class diagram parser reads classes, stereotypes, members and links", () => {
  const src = FIXTURE.match(/```mermaid\n([\s\S]*?)\n```/)[1];
  const cs = parseClassDiagram(src);
  const by = Object.fromEntries(cs.map((c) => [c.name, c]));
  assert.deepEqual(Object.keys(by).sort(), ["Circle", "Part", "Shape", "Widget"]);
  assert.equal(by.Shape.stereotype, "interface");
  assert.deepEqual(by.Widget.members, ["+run() int"]);
  assert.deepEqual(by.Widget.links, [{ to: "Part", how: "owns" }, { to: "Shape", how: "uses" }]);
  assert.deepEqual(by.Circle.links, [{ to: "Shape", how: "implements" }]);
  assert.deepEqual(parseClassDiagram("flowchart TD\n A-->B"), []);
});

test("extractPythonClass takes decorators and the body, stops at the next top-level statement", () => {
  const py = `x = 1\n\n@dataclass\nclass Part:\n    x: int\n\n# a comment\ndef helper():\n    pass\n`;
  assert.equal(extractPythonClass(py, "Part"), "@dataclass\nclass Part:\n    x: int");
  assert.equal(extractPythonClass(py, "Nope"), null);
  const ex = explorerClasses(FIXTURE);
  assert.ok(ex.find((c) => c.name === "Shape").code.startsWith("class Shape(ABC):"));
  assert.equal(ex.find((c) => c.name === "Circle").code, null);
});

/* ------------------------------------------------------------------ metadata */

test("every case study's patterns exist in the catalogue, and the catalogue's groups are known", () => {
  const slugs = new Set(PATTERNS.map((p) => p.slug));
  assert.equal(slugs.size, PATTERNS.length, "pattern slugs are unique");
  const groups = new Set(PATTERN_GROUPS.map((g) => g.id));
  for (const p of PATTERNS) assert.ok(groups.has(p.group), p.slug);
  for (const c of CASES) for (const p of c.patterns) assert.ok(slugs.has(p), `${c.slug}: ${p}`);
  for (const p of CORE_PATTERNS) assert.ok(slugs.has(p), p);
  assert.equal(CASES.length, 22);
  assert.equal(new Set(CASES.map((c) => c.slug)).size, 22);
  assert.equal(caseBySlug("lld-02-lru-cache").name, "LRU Cache");
});

const rows = CASES.map((c) => ({
  ...c,
  title: `Design ${c.name}`,
  href: `/low-level-design/${c.slug}`,
  companies: c.n === 1 ? [{ slug: "flipkart", name: "Flipkart", reported: true }, { slug: "swiggy", name: "Swiggy", reported: true }] : c.n === 5 ? [{ slug: "flipkart", name: "Flipkart", reported: true }] : [],
}));

test("filters combine, and an empty filter shows everything", () => {
  assert.equal(filterCases(rows, NO_FILTERS).length, 22);
  const strat = filterCases(rows, { ...NO_FILTERS, pattern: "strategy" });
  assert.ok(strat.length > 10 && strat.every((r) => r.patterns.includes("strategy")));
  const hardStrat = filterCases(rows, { pattern: "strategy", difficulty: "Hard", company: null });
  assert.ok(hardStrat.length > 0 && hardStrat.every((r) => r.difficulty === "Hard" && r.patterns.includes("strategy")));
  assert.deepEqual(filterCases(rows, { ...NO_FILTERS, company: "flipkart" }).map((r) => r.n), [1, 5]);
  assert.deepEqual(filterCases(rows, { pattern: "composite", difficulty: "Medium", company: null }), []);
});

test("facet counts respect the other filters", () => {
  const f = facets(rows, { pattern: null, difficulty: "Expert", company: null }, PATTERNS);
  assert.equal(f.difficulties.find((d) => d.value === "Expert").count, 3, "the selected facet counts under the other filters only");
  assert.equal(f.patterns.find((p) => p.value.slug === "single-writer").count, 1);
  assert.equal(f.patterns.find((p) => p.value.slug === "state").count, 0);
  assert.ok(!f.patterns.some((p) => p.value.slug === "prototype"), "a pattern no case uses is not offered as a filter");
  assert.deepEqual(f.companies.map((c) => c.value.slug), ["flipkart", "swiggy"].sort((a, b) => (a === "flipkart" ? -1 : 1)));
});

test("the pattern map lists each pattern's case studies in lesson order", () => {
  const map = patternMap(rows);
  assert.deepEqual(map.state.map((r) => r.n), [4, 5, 7, 11, 12, 13, 14, 15, 19]);
  assert.deepEqual(map.memento.map((r) => r.n), [18]);
  assert.equal(map.prototype, undefined);
  // every card appears under each of its patterns, and nowhere else
  for (const r of rows) for (const [slug, list] of Object.entries(map)) assert.equal(list.some((x) => x.slug === r.slug), r.patterns.includes(slug));
});

test("the suggested path runs foundations, core patterns, easy then hard, each case once", () => {
  const path_ = suggestedPath(rows, PATTERNS, CORE_PATTERNS);
  assert.deepEqual(path_.map((s) => s.id), ["foundations", "core", "easy", "hard"]);
  assert.ok(path_[0].patterns.includes("dependency-injection"));
  assert.deepEqual(path_[1].patterns, CORE_PATTERNS);
  assert.ok(path_[2].cases.every((s) => caseBySlug(s).difficulty === "Medium"));
  assert.ok(path_[3].cases.every((s) => caseBySlug(s).difficulty !== "Medium"));
  const all = [...path_[2].cases, ...path_[3].cases];
  assert.equal(new Set(all).size, 22);
  assert.deepEqual(nextOnPath(path_, new Set()), { stage: "easy", case: "lld-01-parking-lot" });
  assert.deepEqual(nextOnPath(path_, new Set(path_[2].cases)), { stage: "hard", case: path_[3].cases[0] });
  assert.equal(nextOnPath(path_, new Set(all)), null);
});

test("filters round-trip through the URL and drop unknown values", () => {
  const known = { patterns: PATTERNS.map((p) => p.slug), companies: ["flipkart"] };
  const f = { pattern: "state", difficulty: "Hard", company: "flipkart" };
  assert.equal(filtersToQuery(f), "?pattern=state&difficulty=Hard&company=flipkart");
  assert.deepEqual(parseFilters(new URLSearchParams(filtersToQuery(f)), known), f);
  assert.deepEqual(parseFilters({ pattern: "nope", difficulty: "Easy", company: "x" }, known), NO_FILTERS);
  assert.equal(filtersToQuery(NO_FILTERS), "");
});

test("card progress is 0 to 100, and 100 only when completed", () => {
  assert.equal(casePct(undefined), 0);
  assert.equal(casePct({ status: "in_progress", pct: 100 }), 99);
  assert.equal(casePct({ status: "completed", pct: 20 }), 100);
});

/* ------------------------------------------------------------------ the real lessons */

const LOCAL = process.env.SDM_LOCAL_DIR || "/Users/himanshukukreja/system-design-mastery/resources";
const DIR = path.join(LOCAL, "low-level-design");
test("the real lessons: every one has all seven steps and a diagram with code for most classes", { skip: !fs.existsSync(DIR) }, () => {
  const files = fs.readdirSync(DIR).filter((f) => /^lld-\d+-.+\.md$/.test(f)).sort();
  assert.equal(files.length, CASES.length, "one metadata row per lesson file");
  for (const f of files) {
    const slug = f.replace(/\.md$/, "");
    assert.ok(caseBySlug(slug), `${slug} has no row in CASES`);
    const md = fs.readFileSync(path.join(DIR, f), "utf8");
    const { analysis } = restructureLld(md);
    assert.deepEqual(analysis.present, STEPS.map((s) => s.key), `${slug}: steps present`);
    const cs = explorerClasses(md);
    assert.ok(cs.length >= 4, `${slug}: classes`);
    assert.ok(cs.filter((c) => c.code).length / cs.length >= 0.7, `${slug}: code found for most classes`);
    // the metadata's difficulty agrees with the lesson's own mission level
    const level = md.match(/:::mission[^\n]*\{level="(\w+)"\}/)?.[1];
    assert.equal(caseBySlug(slug).difficulty, level, `${slug}: difficulty`);
  }
});
