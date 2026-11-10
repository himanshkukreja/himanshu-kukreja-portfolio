/**
 * The interview walkthrough of a case study: how a low-level design lesson's markdown headings map
 * onto the seven steps an LLD interview follows. Pure (no imports), so node --test runs it
 * (scripts/tests/lld.test.mjs).
 *
 * The 22 lessons share one shape (resources/low-level-design/lld-NN-*.md):
 *
 *   # Design …            title, then a :::mission block and a short intro
 *   ## How the round runs                       → intro (before step 1)
 *   ## Requirements and clarifying questions    → step 1
 *   ## The classes                              → step 2 (the prose) and step 3 (from the ```mermaid diagram on)
 *   ## The states                               → step 3 (a state machine is a diagram too)
 *   ## The interfaces / The code / deep dives   → step 5 (every other section is code or code's reasoning)
 *   ## The patterns, and why                    → step 4
 *   ## Concurrency and edge cases               → step 6
 *   ## Extending it: the follow-ups, ## Common mistakes, the closing quiz → step 7
 *
 * `restructureLld` rewrites the markdown so each step is one `# Step N: …` section, which the course
 * renderer turns into one stage (src/lib/course/render.ts, kind "lld"): the stage rail, the side
 * tracker, checkpoints and resume all work on steps without a second progress system. A step with no
 * content gets a short "not written yet" panel and is listed in `missing` so writers can fill it.
 *
 * Writers can add to a lesson by following the same headings. Other-language code goes in step 5 as
 * ```java / ```cpp / ```javascript fences (the code tabs pick them up); an "## Interview checklist"
 * section (a task list) replaces the generic checklist.
 */

export type StepKey = "requirements" | "entities" | "diagram" | "patterns" | "code" | "concurrency" | "followups";

export type Step = { n: number; id: string; key: StepKey; label: string; short: string; ask: string };

export const STEPS: Step[] = [
  { n: 1, id: "step-1", key: "requirements", label: "Clarify the requirements", short: "Requirements", ask: "Ask the questions whose answers change the code, and agree what is in and out of scope." },
  { n: 2, id: "step-2", key: "entities", label: "Identify the entities", short: "Entities", ask: "Pull the nouns out of the problem: each noun is a class, each verb that varies is an interface." },
  { n: 3, id: "step-3", key: "diagram", label: "Class diagram", short: "Class diagram", ask: "Draw the classes, their jobs and how they connect before writing any code." },
  { n: 4, id: "step-4", key: "patterns", label: "Patterns applied", short: "Patterns", ask: "Name each pattern you used and say the trade-off, not only the name." },
  { n: 5, id: "step-5", key: "code", label: "Code", short: "Code", ask: "Build it bottom-up and run a small main that proves the rules." },
  { n: 6, id: "step-6", key: "concurrency", label: "Concurrency and edge cases", short: "Concurrency", ask: "Say where two callers can collide, where the lock goes, and which edge cases you handle." },
  { n: 7, id: "step-7", key: "followups", label: "Follow-ups and the interview checklist", short: "Follow-ups", ask: "Expect a new requirement in the last 15 minutes: each one should be a small, local change." },
];

export const STEP_BY_KEY: Record<StepKey, Step> = Object.fromEntries(STEPS.map((s) => [s.key, s])) as Record<StepKey, Step>;

export const LLD_LANGS = [
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
  { id: "javascript", label: "JavaScript" },
] as const;
export type LldLang = (typeof LLD_LANGS)[number]["id"];

/** Fence names writers may use → the tab id (and the code figure's data-lang). */
export const LANG_ALIAS: Record<string, LldLang> = { python: "python", py: "python", java: "java", cpp: "cpp", "c++": "cpp", cplusplus: "cpp", javascript: "javascript", js: "javascript", typescript: "javascript", ts: "javascript" };

/* ------------------------------------------------------------------ splitting */

export type Section = { title: string; lines: string[] };

const FENCE = /^\s*(`{3,}|~{3,})/;

/** Splits a lesson into the lines before its first "## " heading and its "## " sections, ignoring headings inside code fences. */
export function splitSections(md: string): { head: string[]; sections: Section[] } {
  const head: string[] = [];
  const sections: Section[] = [];
  let fence: string | null = null;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1][0].repeat(f[1].length);
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
    }
    const h = !fence && !f ? /^##\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (h) sections.push({ title: h[1].trim(), lines: [] });
    else (sections.length ? sections[sections.length - 1].lines : head).push(line);
  }
  return { head, sections };
}

/** Index of the first ```mermaid fence's opening line and the line after its closing fence in `lines`, or null. */
export function findMermaid(lines: string[], kind = "classDiagram"): { start: number; end: number } | null {
  let fence: string | null = null;
  let start = -1;
  let isKind = false;
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE.exec(lines[i]);
    if (!f) continue;
    if (!fence) {
      fence = f[1];
      start = i;
      isKind = /^\s*(`{3,}|~{3,})\s*mermaid\b/i.test(lines[i]) && lines.slice(i + 1, i + 6).some((l) => l.trim().startsWith(kind));
    } else if (f[1][0] === fence[0] && f[1].length >= fence.length && lines[i].trim() === f[1]) {
      if (isKind) return { start, end: i + 1 };
      fence = null;
    }
  }
  return null;
}

const RULES: [RegExp, StepKey | "intro"][] = [
  [/^how the (round|interview) runs/i, "intro"],
  [/^(requirements|clarif)/i, "requirements"],
  [/^(the )?(classes|entities)\b|^identify/i, "entities"],
  [/^the states\b|^(the )?state machine/i, "diagram"],
  [/^(the )?patterns\b/i, "patterns"],
  [/^concurrency|^edge cases/i, "concurrency"],
  [/^extending\b|^follow-?ups?\b|^common mistakes|^interview checklist|^what interviewers/i, "followups"],
];

/** Which step a "## " heading belongs to. Anything unrecognised is code (the interfaces, the code and each deep dive between them). */
export function stepOfHeading(title: string): StepKey | "intro" {
  const t = title.replace(/[`*_]/g, "").trim();
  for (const [re, key] of RULES) if (re.test(t)) return key;
  return "code";
}

/* ------------------------------------------------------------------ restructure */

export const MOUNTS = {
  gateDiagram: "LLDMOUNT-gate-diagram",
  entities: "LLDMOUNT-entities",
  explorer: "LLDMOUNT-explorer",
  gateCode: "LLDMOUNT-gate-code",
  tabs: "LLDMOUNT-tabs",
  lab: "LLDMOUNT-lab",
} as const;

/** The checklist shown when a lesson has no "## Interview checklist" of its own. */
export const GENERIC_CHECKLIST = [
  "I agreed the scope with the interviewer and said what is out of scope",
  "I named the entities as nouns and gave each class one job",
  "I put every behaviour that will change behind an interface",
  "I named each pattern with its trade-off, not only its name",
  "I found the race, put one lock around find-and-change, and said why",
  "I listed the edge cases out loud: full, duplicate, bad input, time",
  "I ran a small main that proves the rules, and kept time as a parameter",
  "I answered a follow-up as a small, local change",
];

export type LldAnalysis = {
  /** step keys that have real content in the source lesson */
  present: StepKey[];
  /** what a writer still has to supply, in plain words */
  missing: string[];
  /** code languages found in step 5 (python always, others when a writer adds them) */
  langs: LldLang[];
  /** the H2 headings that fell through to "code" (so a new heading is noticed, not silently placed) */
  fallthrough: string[];
  hasDiagram: boolean;
  hasChecklist: boolean;
};

export type LldRestructured = { markdown: string; analysis: LldAnalysis };

const clean = (lines: string[]) => lines.join("\n").replace(/^\s*\n+/, "").replace(/\n+\s*$/, "");

function normaliseFences(body: string): string {
  return body.replace(/^(\s*)(`{3,}|~{3,})\s*([A-Za-z+#]+)([^\n]*)$/gm, (m, ind: string, f: string, lang: string, rest: string) => {
    const to = LANG_ALIAS[lang.toLowerCase()];
    return to && to !== lang ? `${ind}${f}${to}${rest}` : m;
  });
}

function langsIn(text: string): LldLang[] {
  const found = new Set<LldLang>();
  for (const m of text.matchAll(/^\s*(?:`{3,}|~{3,})\s*([A-Za-z+#]+)/gm)) {
    const l = LANG_ALIAS[m[1].toLowerCase()];
    if (l) found.add(l);
  }
  return LLD_LANGS.map((l) => l.id).filter((l) => found.has(l));
}

/** Rewrites a lesson as intro + seven "# Step N: …" sections (see the file header). Never throws; a lesson that doesn't follow the shape comes back as it was, with every step missing. */
export function restructureLld(md: string, opts: { labs?: boolean } = {}): LldRestructured {
  const { head, sections } = splitSections(md);
  const buckets: Record<StepKey | "intro", string[]> = { intro: [], requirements: [], entities: [], diagram: [], patterns: [], code: [], concurrency: [], followups: [] };
  const fallthrough: string[] = [];
  let hasChecklist = false;
  // the section whose heading becomes the step title (its own heading is dropped); the rest keep their H2
  const primary = new Set<StepKey>(["requirements", "entities", "patterns", "concurrency", "followups"]);
  const taken = new Set<StepKey>();

  for (const s of sections) {
    const key = stepOfHeading(s.title);
    if (key === "code" && !/^the (interfaces|code)\b/i.test(s.title)) fallthrough.push(s.title);
    if (/^interview checklist/i.test(s.title)) hasChecklist = true;
    if (key === "entities") {
      const m = findMermaid(s.lines);
      const before = m ? s.lines.slice(0, m.start) : s.lines;
      buckets.entities.push(clean(before));
      if (m) {
        // the names in the diagram are the entities: the client lists them under the prose (or alone)
        buckets.entities.push(MOUNTS.entities);
        buckets.diagram.push(clean(s.lines.slice(m.start, m.end)), MOUNTS.explorer, clean(s.lines.slice(m.end)));
      }
      continue;
    }
    const body = clean(s.lines);
    if (key === "intro") {
      buckets.intro.push(`## ${s.title}\n\n${body}`);
      continue;
    }
    const asPrimary = primary.has(key as StepKey) && !taken.has(key as StepKey);
    if (asPrimary) taken.add(key as StepKey);
    buckets[key].push(asPrimary ? body : `## ${s.title}\n\n${body}`);
  }

  const has = (k: StepKey) => buckets[k].some((b) => (k === "entities" ? b : b.replace(/LLDMOUNT-[a-z-]+/g, "")).trim().length > 0);
  const lang = langsIn(buckets.code.join("\n"));
  const present = STEPS.filter((s) => has(s.key)).map((s) => s.key);
  const missing: string[] = [];
  for (const s of STEPS) if (!has(s.key)) missing.push(s.label);
  if (!hasChecklist) missing.push("Interview checklist (a generic one is shown)");
  const otherLangs = LLD_LANGS.filter((l) => !lang.includes(l.id)).map((l) => l.label);
  if (otherLangs.length) missing.push(`Code in ${otherLangs.join(", ")}`);

  const out: string[] = [clean(head)];
  if (buckets.intro.length) out.push(buckets.intro.join("\n\n"));
  for (const step of STEPS) {
    const parts = buckets[step.key].filter((p) => p.trim());
    const bodyParts: string[] = [];
    if (step.key === "diagram" && parts.length) bodyParts.push(MOUNTS.gateDiagram);
    if (step.key === "code" && parts.length) {
      bodyParts.push(MOUNTS.gateCode, MOUNTS.tabs);
      if (opts.labs) bodyParts.push(MOUNTS.lab);
    }
    if (parts.length) {
      bodyParts.push(...parts.map((p) => (step.key === "code" ? normaliseFences(p) : p)));
    } else {
      bodyParts.push(`:::callout[Not written for this problem yet]{type="info"}\n${step.ask} This step has no write-up in the lesson yet, so work it out yourself, then compare with the steps around it.\n:::`);
    }
    if (step.key === "followups" && !hasChecklist) {
      bodyParts.push(`## Interview checklist\n\nTick these off before you say "done". The lesson has no checklist of its own yet, so this is the general one.\n\n${GENERIC_CHECKLIST.map((c) => `- [ ] ${c}`).join("\n")}`);
    }
    out.push(`# Step ${step.n}: ${step.label}\n\n${bodyParts.join("\n\n")}`);
  }
  return {
    markdown: out.filter(Boolean).join("\n\n") + "\n",
    analysis: { present, missing, langs: lang, fallthrough, hasDiagram: has("diagram"), hasChecklist },
  };
}

/** Where a step is in the original lesson text: used by tests and the writers' report. */
export function analyseLld(md: string): LldAnalysis {
  return restructureLld(md).analysis;
}
