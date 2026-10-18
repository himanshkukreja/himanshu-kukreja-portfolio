/**
 * Lab file (resources/labs/<id>.md) → LabSource. Pure: no Next or "@/" imports, so the Node checker
 * (scripts/labs/check-labs.mjs, run with type stripping) parses labs with this same code.
 *
 *   ---
 *   id, title, topic, week, order, difficulty, minutes, xp?, timeout?, summary, lessons: [{ref, anchor, label}]
 *   ---
 *   ## Brief          markdown
 *   ## Given          ```python  read-only support code (fake clock, fake broker), runs before the reader's code
 *   ## Starter        ```python  what the editor opens with
 *   ## Hints          ### one heading per hint
 *   ## Solution       ```python  + optional markdown notes after the fence
 *   ## Tests          ```python  visible tests (def test_*)
 *   ## Hidden tests   ```python  run on every Run, listed only after it
 */
import { createHash } from "crypto";
import matter from "gray-matter";
import type { LabDifficulty, LabHint, LabLessonRef, LabSource } from "./types";

const DEFAULT_XP: Record<LabDifficulty, number> = { easy: 60, medium: 90, hard: 120 };
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class LabParseError extends Error {
  file: string;
  problems: string[];
  constructor(file: string, problems: string[]) {
    super(`${file}: ${problems.join("; ")}`);
    this.file = file;
    this.problems = problems;
  }
}

/** "## Heading" sections, ignoring headings inside code fences. */
function sections(body: string, level: 2 | 3): { title: string; text: string }[] {
  const out: { title: string; lines: string[] }[] = [];
  const head = level === 2 ? /^##\s+(.+?)\s*#*\s*$/ : /^###\s+(.+?)\s*#*\s*$/;
  let fence: string | null = null;
  let cur: { title: string; lines: string[] } | null = null;
  const pre: string[] = [];
  for (const line of body.split("\n")) {
    const f = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null;
    }
    const m = !fence && !f ? line.match(head) : null;
    if (m && (level === 3 || !line.startsWith("###"))) {
      cur = { title: m[1].trim(), lines: [] };
      out.push(cur);
      continue;
    }
    (cur ? cur.lines : pre).push(line);
  }
  const res = out.map((s) => ({ title: s.title, text: s.lines.join("\n").trim() }));
  if (pre.join("").trim()) res.unshift({ title: "", text: pre.join("\n").trim() });
  return res;
}

/** The first ```python fence of a section, and the markdown around it. */
function code(text: string): { code: string; rest: string } | null {
  const m = text.match(/(^|\n)(`{3,})\s*(?:python|py)?[^\n]*\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/);
  if (!m) return null;
  const rest = (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).trim();
  return { code: m[3].replace(/\s+$/, "") + "\n", rest };
}

const countTests = (src: string) => (src.match(/^def test_\w+\s*\(/gm) || []).length;

export function parseLab(md: string, file: string): LabSource {
  const problems: string[] = [];
  const { data, content } = matter(md);
  const fm = data as Record<string, unknown>;
  const str = (k: string) => (typeof fm[k] === "string" ? (fm[k] as string).trim() : "");
  const num = (k: string, d: number) => (typeof fm[k] === "number" && Number.isFinite(fm[k]) ? (fm[k] as number) : d);

  const id = str("id") || file.replace(/^.*\//, "").replace(/\.md$/, "");
  if (!ID_RE.test(id)) problems.push(`id "${id}" must be kebab-case`);
  const title = str("title");
  if (!title) problems.push("title is required");
  const difficulty = (str("difficulty") || "medium") as LabDifficulty;
  if (!(difficulty in DEFAULT_XP)) problems.push(`difficulty must be easy, medium or hard (got "${difficulty}")`);
  const week = num("week", -1);
  if (week < 0) problems.push("week (a course week number) is required");

  const lessons: LabLessonRef[] = [];
  if (Array.isArray(fm.lessons)) {
    for (const l of fm.lessons as unknown[]) {
      if (typeof l === "string") lessons.push({ ref: l.trim() });
      else if (l && typeof l === "object" && typeof (l as LabLessonRef).ref === "string") {
        const o = l as LabLessonRef;
        lessons.push({ ref: o.ref.trim(), ...(o.anchor ? { anchor: String(o.anchor).replace(/^#/, "") } : {}), ...(o.label ? { label: String(o.label) } : {}) });
      } else problems.push("lessons: each entry needs a ref (e.g. W01-D3)");
    }
  }
  if (!lessons.length) problems.push("lessons: link at least one lesson");

  const secs = sections(content, 2);
  const get = (name: string) => secs.find((s) => s.title.toLowerCase() === name)?.text ?? null;
  const need = (name: string) => {
    const t = get(name);
    if (t == null) problems.push(`missing "## ${name[0].toUpperCase()}${name.slice(1)}" section`);
    return t ?? "";
  };
  const fenced = (name: string, required: boolean) => {
    const t = required ? need(name) : get(name);
    if (t == null) return { code: "", rest: "" };
    const c = code(t);
    if (!c) {
      if (required || t.trim()) problems.push(`"## ${name}" needs a \`\`\`python fence`);
      return { code: "", rest: t };
    }
    return c;
  };

  const brief = need("brief");
  const given = fenced("given", false).code;
  const starter = fenced("starter", true).code;
  const sol = fenced("solution", true);
  const visible = fenced("tests", true).code;
  const hidden = fenced("hidden tests", false).code;
  const hintText = get("hints") ?? "";
  const hints: LabHint[] = sections(hintText, 3)
    .filter((h) => h.text)
    .map((h, i) => ({ title: h.title || `Hint ${i + 1}`, md: h.text }));

  if (visible && !countTests(visible)) problems.push("## Tests has no def test_*()");
  if (hidden && !countTests(hidden)) problems.push("## Hidden tests has no def test_*()");
  if (problems.length) throw new LabParseError(file, problems);

  return {
    id,
    title,
    topic: str("topic") || title,
    week,
    order: num("order", 100),
    difficulty,
    minutes: Math.max(5, Math.round(num("minutes", 30))),
    xp: Math.max(10, Math.round(num("xp", DEFAULT_XP[difficulty]))),
    timeoutSec: Math.min(30, Math.max(2, num("timeout", 8))),
    summary: str("summary"),
    lessons,
    brief,
    given,
    starter,
    hints,
    solution: sol.code,
    solutionNotes: sol.rest,
    visible,
    hidden,
    version: createHash("sha1").update(md).digest("hex").slice(0, 10),
  };
}

export const labTestCounts = (l: Pick<LabSource, "visible" | "hidden">) => ({ visible: countTests(l.visible), hidden: countTests(l.hidden) });
