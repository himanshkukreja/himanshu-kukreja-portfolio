/**
 * The shape a design-pattern lesson is expected to have, and the parser that reads it. Pure, so node
 * --test runs it (scripts/tests/lld.test.mjs). One markdown file per pattern, named by the pattern's
 * slug (src/lib/learn/lld/meta.ts PATTERNS) in resources/design-patterns/ (PATTERN_DIR):
 *
 *   # Strategy                          the title
 *   *One line under it.*                optional deck (shown under the title)
 *
 *   ## The problem                      what hurts without the pattern (prose, a small code or figure is fine)
 *
 *   ## Before and after                 two ```mermaid classDiagram fences, in this order: the design
 *                                       without the pattern, then with it. Prose between/after them is
 *                                       the note for the fence above it.
 *
 *   ## Code                             a ```python, ```java, ```cpp and ```javascript fence (any subset;
 *                                       a missing one shows as "not written yet"). Several fences of one
 *                                       language are kept in order. "### Python" style sub-headings are
 *                                       optional and ignored.
 *
 *   ## When not to use it               the cases where the pattern is the wrong tool
 *
 *   ## Lab                              the id of a code lab (resources/labs/<id>.md) to link, on the first line
 *   ## Quiz                             a ```quiz fence (the course's quick-check format)
 *   ## <anything else>                  kept, shown after the quiz as extra reading
 *
 * Not in the file, because the site has them: the case studies that use the pattern (from the case
 * metadata), the lecture (lectures/design-patterns--<slug>.json) and the clips (shorts of that lecture).
 * Every section is optional: an empty one shows as a quiet "not written yet" slot, so a half-written
 * lesson still publishes. When resources/plan/design-patterns-plan.md defines a different shape, change
 * SECTION_RULES below and the template follows.
 */
// the .ts extension lets node --test load this file (the app's bundler resolves it too); tsc only allows it with a flag
// @ts-expect-error TS5097
import { LANG_ALIAS, splitSections } from "./steps.ts";
import type { LldLang } from "./steps";

export type PatternSections = {
  title: string | null;
  deck: string | null;
  problem: string;
  /** markdown of the "before" and "after" figures (each a mermaid fence plus its note) */
  before: string;
  after: string;
  code: Partial<Record<LldLang, string>>;
  notUse: string;
  lab: string | null;
  quiz: string;
  extra: { title: string; md: string }[];
};

type Key = "problem" | "ba" | "code" | "notUse" | "lab" | "quiz";
export const SECTION_RULES: [RegExp, Key][] = [
  [/^(the )?problem|^why\b|^the pain/i, "problem"],
  [/^before\b|^uml\b/i, "ba"],
  [/^code\b|^implementation|^in code/i, "code"],
  [/^when not to use|^when to avoid|^don'?t use|^anti-?pattern/i, "notUse"],
  [/^lab\b|^try it/i, "lab"],
  [/^quiz\b|^check\b|^quick check/i, "quiz"],
];

const FENCE = /^(`{3,}|~{3,})\s*([A-Za-z+#]*)[^\n]*\n([\s\S]*?)\n\1\s*$/gm;

/** Splits a "Before and after" body into the two figures. A body with one mermaid fence is "before" only. */
export function splitBeforeAfter(md: string): { before: string; after: string } {
  const lines = md.split("\n");
  const starts: number[] = [];
  let fence: string | null = null;
  lines.forEach((l, i) => {
    const f = /^\s*(`{3,}|~{3,})\s*(\w*)/.exec(l);
    if (!f) return;
    if (!fence) {
      fence = f[1];
      if (f[2].toLowerCase() === "mermaid") starts.push(i);
    } else if (l.trim() === fence) fence = null;
  });
  if (!starts.length) return { before: md.trim(), after: "" };
  if (starts.length === 1) return { before: md.trim(), after: "" };
  // the note after the first figure belongs to it; the second figure starts where its own fence does
  // (any prose directly above that fence belongs to the second figure)
  let cut = starts[1];
  while (cut > 0 && lines[cut - 1].trim() !== "" && !/^\s*(`{3,}|~{3,})\s*$/.test(lines[cut - 1])) cut--;
  if (cut <= starts[0]) cut = starts[1];
  return { before: lines.slice(0, cut).join("\n").trim(), after: lines.slice(cut).join("\n").trim() };
}

/** Code fences of a "Code" section grouped by tab language, each group's fences joined in order. Fences in other languages are dropped. */
export function groupCode(md: string): Partial<Record<LldLang, string>> {
  const out: Partial<Record<LldLang, string[]>> = {};
  for (const m of md.matchAll(FENCE)) {
    const lang = LANG_ALIAS[m[2].toLowerCase()];
    if (!lang) continue;
    (out[lang] ||= []).push(`\`\`\`${lang}\n${m[3]}\n\`\`\``);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, (v as string[]).join("\n\n")])) as Partial<Record<LldLang, string>>;
}

export function parsePatternLesson(md: string): PatternSections {
  const { head, sections } = splitSections(md);
  const out: PatternSections = { title: null, deck: null, problem: "", before: "", after: "", code: {}, notUse: "", lab: null, quiz: "", extra: [] };
  out.title = head.find((l) => /^#\s+\S/.test(l))?.replace(/^#\s+/, "").trim() ?? null;
  out.deck = head.find((l) => /^\*[^*].*\*$/.test(l.trim()))?.trim().replace(/^\*|\*$/g, "") ?? null;
  for (const s of sections) {
    const key = RULES_KEY(s.title);
    const body = s.lines.join("\n").trim();
    if (!key) {
      if (body) out.extra.push({ title: s.title, md: body });
      continue;
    }
    if (key === "problem") out.problem = [out.problem, body].filter(Boolean).join("\n\n");
    else if (key === "ba") Object.assign(out, splitBeforeAfter(body));
    else if (key === "code") {
      const g = groupCode(body);
      for (const [l, c] of Object.entries(g) as [LldLang, string][]) out.code[l] = [out.code[l], c].filter(Boolean).join("\n\n");
    } else if (key === "notUse") out.notUse = [out.notUse, body].filter(Boolean).join("\n\n");
    else if (key === "lab") out.lab = /[a-z0-9]+(?:-[a-z0-9]+)*/i.exec(body.replace(/^[^A-Za-z0-9]*/, "").split(/\s/)[0] || "")?.[0]?.toLowerCase() ?? null;
    else if (key === "quiz") out.quiz = body;
  }
  return out;
}

function RULES_KEY(title: string): Key | null {
  const t = title.replace(/[`*_]/g, "").trim();
  for (const [re, key] of SECTION_RULES) if (re.test(t)) return key;
  return null;
}

/** Which slots a parsed lesson fills (for "not written yet" tiles and the writers' list). */
export function patternGaps(s: PatternSections | null): string[] {
  if (!s) return ["The whole lesson"];
  const gaps: string[] = [];
  if (!s.problem) gaps.push("The problem it solves");
  if (!s.before) gaps.push("Before UML");
  if (!s.after) gaps.push("After UML");
  for (const l of ["python", "java", "cpp", "javascript"] as LldLang[]) if (!s.code[l]) gaps.push(`${l === "cpp" ? "C++" : l[0].toUpperCase() + l.slice(1)} code`);
  if (!s.notUse) gaps.push("When not to use it");
  if (!s.lab) gaps.push("Lab");
  if (!s.quiz) gaps.push("Quiz");
  return gaps;
}
