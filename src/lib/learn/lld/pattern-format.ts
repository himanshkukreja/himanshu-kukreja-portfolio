/**
 * The shape a design-pattern lesson has, and the parser that reads it. Pure, so node --test runs it
 * (scripts/tests/lld-pattern.test.mjs). One article per lesson, resources/low-level-design/dp-NN-<slug>.md
 * (src/lib/learn/lld/meta.ts PATTERNS, PATTERN_DIR); the plan (docs/design-patterns/design-patterns-plan.md,
 * section 3.1) fixes its sections, and the pattern page (PatternPage) lays them out in slots:
 *
 *   # The Strategy Pattern               the title
 *   *One line under it.*                 optional deck
 *   :::mission[...] ... ::clip[...]      the intro: everything before the first ## (shown above the problem)
 *
 *   ## The first version                 the problem: the code most people write first, what it costs, a checkpoint
 *   ## The pattern                       the intent, the roles and the class diagram(s): mermaid fences are lifted
 *                                        into the UML slot (two diagrams: before and after; one: the pattern's)
 *   ## The code                          the refactor as a :::tabs block (Python, Java, C++, JavaScript)
 *   ## <deep sections>                   kept in order (who picks, look-alikes, ...), shown after the code
 *   ## When not to use it                its own slot
 *   ## Where it shows up in the case studies   the table of rounds; shown above the site's own case-study links
 *   ## In the interview / Common mistakes      kept, shown after the case studies
 *   ```quiz                              the closing quick check, wherever it sits (lifted out of its section)
 *
 * The older, flatter shape still parses: "## The problem", "## Before and after" (two mermaid fences),
 * "## Code" (plain fences), "## Lab" and "## Quiz".
 *
 * Not in the file, because the site has them: the case studies that use the pattern (from the case metadata), the
 * lab (labs whose `lessons` name this lesson), the lecture, the clips and shorts, and the FAQ (lesson-faq/).
 * Every section is optional: an empty one shows as a quiet "not written yet" slot, so a half-written lesson
 * still publishes.
 */
// the .ts extension lets node --test load this file (the app's bundler resolves it too); tsc only allows it with a flag
// @ts-expect-error TS5097
import { LANG_ALIAS, splitSections } from "./steps.ts";
import type { LldLang } from "./steps";

export type PatternSections = {
  title: string | null;
  deck: string | null;
  /** what sits before the first ## (the mission block, the opening paragraphs, the analogy clip) */
  intro: string;
  /** "The first version" (or "The problem"): what breaks without the pattern */
  problem: string;
  /** "The pattern": the intent and the roles, without its diagrams */
  pattern: string;
  /** the class diagrams (mermaid fences, each with its note): before the pattern, and with it */
  before: string;
  after: string;
  /** "The code" as markdown (a :::tabs block, or plain fences) */
  code: string;
  /** the languages the code section has a fence for */
  codeLangs: LldLang[];
  /** sections between the code and "When not to use it" */
  deep: { title: string; md: string }[];
  notUse: string;
  /** "Where it shows up in the case studies": the lesson's own table */
  cases: string;
  /** sections after "When not to use it" (in the interview, common mistakes, anything else) */
  closing: { title: string; md: string }[];
  lab: string | null;
  quiz: string;
};

type Key = "problem" | "pattern" | "ba" | "code" | "notUse" | "cases" | "lab" | "quiz";
export const SECTION_RULES: [RegExp, Key][] = [
  [/^the first version|^(the )?problem|^why\b|^the pain/i, "problem"],
  [/^the pattern\b/i, "pattern"],
  [/^before\b|^uml\b/i, "ba"],
  [/^the code\b|^code\b|^implementation|^in code/i, "code"],
  [/^when not to use|^when to avoid|^don'?t use|^anti-?pattern/i, "notUse"],
  [/^where it shows up|^in the case studies/i, "cases"],
  [/^lab\b|^try it/i, "lab"],
  [/^quiz\b|^check\b|^quick check/i, "quiz"],
];

const FENCE = /^(`{3,}|~{3,})\s*([A-Za-z+#]*)[^\n]*\n([\s\S]*?)\n\1\s*$/gm;

/** Mermaid fences of `md` (each with the prose that follows it up to the next fence) and what is left once they are lifted out. */
export function liftMermaid(md: string): { rest: string; figures: string[] } {
  const lines = md.split("\n");
  const figures: string[] = [];
  const keep: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = /^\s*(`{3,}|~{3,})\s*mermaid\b/i.exec(lines[i]);
    if (!open) {
      keep.push(lines[i++]);
      continue;
    }
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== open[1]) j++;
    figures.push(lines.slice(i, Math.min(j + 1, lines.length)).join("\n"));
    i = j + 1;
  }
  return { rest: keep.join("\n").replace(/\n{3,}/g, "\n\n").trim(), figures };
}

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
  if (starts.length < 2) return { before: md.trim(), after: "" };
  // the note after the first figure belongs to it; the second figure starts where its own fence does
  // (any prose directly above that fence belongs to the second figure)
  let cut = starts[1];
  while (cut > 0 && lines[cut - 1].trim() !== "" && !/^\s*(`{3,}|~{3,})\s*$/.test(lines[cut - 1])) cut--;
  if (cut <= starts[0]) cut = starts[1];
  return { before: lines.slice(0, cut).join("\n").trim(), after: lines.slice(cut).join("\n").trim() };
}

/** The tab languages a markdown body has fences for (tabs or plain), in tab order. */
export function codeLanguages(md: string): LldLang[] {
  const found = new Set<LldLang>();
  for (const m of md.matchAll(FENCE)) {
    const l = LANG_ALIAS[m[2].toLowerCase()];
    if (l) found.add(l);
  }
  return (["python", "java", "cpp", "javascript"] as LldLang[]).filter((l) => found.has(l));
}

/** Code fences of a section grouped by tab language, each group's fences joined in order. Fences in other languages are dropped. */
export function groupCode(md: string): Partial<Record<LldLang, string>> {
  const out: Partial<Record<LldLang, string[]>> = {};
  for (const m of md.matchAll(FENCE)) {
    const lang = LANG_ALIAS[m[2].toLowerCase()];
    if (!lang) continue;
    (out[lang] ||= []).push(`\`\`\`${lang}\n${m[3]}\n\`\`\``);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, (v as string[]).join("\n\n")])) as Partial<Record<LldLang, string>>;
}

/** The ```quiz fences of a lesson (wherever they sit) and the lesson without them. */
function liftQuiz(md: string): { rest: string; quiz: string } {
  const quiz: string[] = [];
  const rest = md.replace(/^(`{3,})quiz[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, (m) => {
    quiz.push(m);
    return "";
  });
  return { rest, quiz: quiz.join("\n\n") };
}

const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");

export function parsePatternLesson(source: string): PatternSections {
  const { rest: md, quiz } = liftQuiz(source.replace(/\r\n/g, "\n"));
  const { head, sections } = splitSections(md);
  const out: PatternSections = { title: null, deck: null, intro: "", problem: "", pattern: "", before: "", after: "", code: "", codeLangs: [], deep: [], notUse: "", cases: "", closing: [], lab: null, quiz };
  const titleAt = head.findIndex((l) => /^#\s+\S/.test(l));
  out.title = titleAt >= 0 ? head[titleAt].replace(/^#\s+/, "").trim() : null;
  const deckAt = head.findIndex((l, i) => i > titleAt && /^\*[^*].*\*$/.test(l.trim()));
  out.deck = deckAt >= 0 ? head[deckAt].trim().replace(/^\*|\*$/g, "") : null;
  out.intro = head.filter((_, i) => i !== titleAt && i !== deckAt).join("\n").trim();

  let seenNotUse = false;
  const figures: { problem: string[]; pattern: string[] } = { problem: [], pattern: [] };
  for (const s of sections) {
    const key = ruleKey(s.title);
    const body = s.lines.join("\n").trim();
    if (!key) {
      if (body) (seenNotUse ? out.closing : out.deep).push({ title: s.title, md: body });
      continue;
    }
    if (key === "problem") {
      const l = liftMermaid(body);
      figures.problem.push(...l.figures);
      out.problem = join(out.problem, l.rest);
    } else if (key === "pattern") {
      const l = liftMermaid(body);
      figures.pattern.push(...l.figures);
      out.pattern = join(out.pattern, l.rest);
    } else if (key === "ba") Object.assign(out, splitBeforeAfter(body));
    else if (key === "code") out.code = join(out.code, body);
    else if (key === "notUse") {
      seenNotUse = true;
      out.notUse = join(out.notUse, body);
    } else if (key === "cases") out.cases = join(out.cases, body);
    else if (key === "lab") out.lab = /[a-z0-9]+(?:-[a-z0-9]+)*/i.exec(body.replace(/^[^A-Za-z0-9]*/, "").split(/\s/)[0] || "")?.[0]?.toLowerCase() ?? null;
    else if (key === "quiz") out.quiz = join(out.quiz, body);
  }
  // diagrams: a diagram in the first version is the "before"; the pattern's own is the "after"; a lone one is the pattern's
  if (!out.before && !out.after) {
    const all = [...figures.problem, ...figures.pattern];
    if (figures.problem.length && figures.pattern.length) {
      out.before = figures.problem.join("\n\n");
      out.after = figures.pattern.join("\n\n");
    } else if (all.length >= 2 && !figures.problem.length) {
      out.before = all[0];
      out.after = all.slice(1).join("\n\n");
    } else out.after = all.join("\n\n");
  }
  out.codeLangs = codeLanguages(out.code);
  return out;
}

/** The renderer lifts a top-level :::mission out of the body (it is the side-quest hero's); in a pattern page it stays as a panel. */
export const missionAsPanel = (md: string) => md.replace(/^:::mission\[([^\]\n]*)\](?:\{[^}\n]*level="(\w+)"[^}\n]*\})?[ \t]*$/m, (_m, obj: string, level?: string) => `:::panel[Mission${level ? ` (${level})` : ""}: ${obj}]{tone="info"}`);

function ruleKey(title: string): Key | null {
  const t = title.replace(/[`*_]/g, "").replace(/^[A-Z]\d+[.:]\s*/, "").trim();
  for (const [re, key] of SECTION_RULES) if (re.test(t)) return key;
  return null;
}

/** Which slots a parsed lesson fills (for "not written yet" tiles and the writers' list). */
export function patternGaps(s: PatternSections | null): string[] {
  if (!s) return ["The whole lesson"];
  const gaps: string[] = [];
  if (!s.problem) gaps.push("The problem it solves");
  if (!s.after) gaps.push("The class diagram");
  for (const l of ["python", "java", "cpp", "javascript"] as LldLang[]) if (!s.codeLangs.includes(l)) gaps.push(`${l === "cpp" ? "C++" : l[0].toUpperCase() + l.slice(1)} code`);
  if (!s.notUse) gaps.push("When not to use it");
  if (!s.quiz) gaps.push("Quiz");
  return gaps;
}
