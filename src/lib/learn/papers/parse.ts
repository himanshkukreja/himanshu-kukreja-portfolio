/**
 * Written papers: the strict parser for resources/papers/<key>.md (resources/papers-next/ until released). Pure, no
 * imports, so the site's loader (load.ts) and the content agent's check (scripts/check-papers.mjs, plain Node with type
 * stripping) run exactly the same code.
 *
 * Format (resources/papers-next/README.md in the content repo):
 *
 *   ---
 *   paper: week-04-caching
 *   title: "Week 4 written paper: Caching"
 *   minutes: 60
 *   ---
 *   ## Q1 · 6 marks · explain          (kind: explain | estimate | compare | diagram | design)
 *   Question text (Markdown)
 *   ::: source
 *   week-04-caching/day-03-thundering-herd#section-anchor     (one or more lines)
 *   :::
 *   ::: answer
 *   Model answer (Markdown)
 *   :::
 *   ::: scheme
 *   - [2] point the grader checks
 *   :::
 *
 * Strict: a paper with any error is refused whole (the loader leaves it out and says why in development), so a learner
 * never sees a half-parsed paper or a scheme that doesn't add up.
 */

export const PAPER_KINDS = ["explain", "estimate", "compare", "diagram", "design"] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];

/** Paper keys: a week folder (week-04-caching) or a side quest's file name (bonus-08-AWS-S3, case kept). */
export const PAPER_KEY_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

export type SchemePoint = { marks: number; text: string };
/** A source line: a lesson ("week-04-caching/day-03-thundering-herd") and the section's anchor (may be ""). */
export type PaperSource = { week: string; slug: string; anchor: string };

export type PaperQuestion = {
  /** 1-based, no gaps */
  n: number;
  marks: number;
  kind: PaperKind;
  /** Markdown */
  prompt: string;
  sources: PaperSource[];
  /** Markdown */
  answer: string;
  scheme: SchemePoint[];
};

export type ParsedPaper = {
  key: string;
  title: string;
  minutes: number;
  questions: PaperQuestion[];
  marks: number;
};

export type ParseResult = { ok: true; paper: ParsedPaper; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

const HEAD_RE = /^##[ \t]+Q(\d+)[ \t]+·[ \t]+(\d+)[ \t]+marks?[ \t]+·[ \t]+([a-z]+)[ \t]*$/;
const SCHEME_RE = /^[-*][ \t]+\[(\d+)\][ \t]+(\S.*)$/;
const SOURCE_RE = /^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*?)(?:\.md)?(?:#([A-Za-z0-9][A-Za-z0-9_-]*))?$/;
const BLOCKS = ["source", "answer", "scheme"] as const;

function frontMatter(src: string): { fm: Record<string, string>; body: string; bodyLine: number } | null {
  const m = src.match(/^﻿?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return null;
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_]+):[ \t]*(.*?)[ \t]*$/);
    if (!kv) continue;
    let v = kv[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1).replace(/\\"/g, '"');
    fm[kv[1]] = v;
  }
  return { fm, body: src.slice(m[0].length), bodyLine: m[0].split("\n").length - (m[0].endsWith("\n") ? 1 : 0) };
}

/**
 * Parse one paper. `key` is the file name without ".md" (the front matter's `paper` must match it). Errors name the
 * question and line so the content author can fix them.
 */
export function parsePaper(src: string, key: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = src.replace(/\r\n?/g, "\n");
  if (!PAPER_KEY_RE.test(key)) errors.push(`bad file name "${key}": letters, digits and single dashes only`);
  const f = frontMatter(text);
  if (!f) return { ok: false, errors: [...errors, "missing front matter (--- paper / title / minutes ---)"], warnings };
  const { fm, body, bodyLine } = f;
  if (fm.paper !== key) errors.push(`front matter "paper: ${fm.paper ?? ""}" doesn't match the file name "${key}"`);
  const title = (fm.title || "").trim();
  if (!title) errors.push("front matter: title is missing");
  if (title.length > 140) errors.push("front matter: title is over 140 characters");
  const minutes = Number(fm.minutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) errors.push(`front matter: minutes must be a whole number from 5 to 240 (got "${fm.minutes ?? ""}")`);
  for (const k of Object.keys(fm)) if (!["paper", "title", "minutes"].includes(k)) warnings.push(`front matter: unknown field "${k}" is ignored`);

  const lines = body.split("\n");
  type Draft = { n: number; marks: number; kind: string; line: number; prompt: string[]; blocks: Partial<Record<(typeof BLOCKS)[number], { line: number; lines: string[] }>>; order: string[] };
  const qs: Draft[] = [];
  let cur: Draft | null = null;
  let open: { name: (typeof BLOCKS)[number]; line: number; lines: string[] } | null = null;
  let fence = false;

  lines.forEach((raw, i) => {
    const ln = bodyLine + i + 1;
    const line = raw.replace(/[ \t]+$/, "");
    // code fences inside a question or an answer: their lines are text, never structure
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (open) {
      if (!fence && line === ":::") {
        if (cur!.blocks[open.name]) errors.push(`Q${cur!.n} (line ${open.line}): a second "::: ${open.name}" block`);
        else cur!.blocks[open.name] = { line: open.line, lines: open.lines };
        cur!.order.push(open.name);
        open = null;
      } else open.lines.push(raw);
      return;
    }
    if (fence) {
      if (cur) cur.prompt.push(raw);
      else if (line.trim()) errors.push(`line ${ln}: text before the first question`);
      return;
    }
    if (/^##[ \t]/.test(line)) {
      const h = line.match(HEAD_RE);
      if (!h) {
        errors.push(`line ${ln}: a "##" heading must read "## Q<n> · <marks> marks · <kind>" (got "${line.slice(0, 80)}")`);
        cur = null;
        return;
      }
      cur = { n: Number(h[1]), marks: Number(h[2]), kind: h[3], line: ln, prompt: [], blocks: {}, order: [] };
      qs.push(cur);
      return;
    }
    const b = line.match(/^:::[ \t]*([a-z]+)$/);
    if (b) {
      if (!cur) {
        errors.push(`line ${ln}: "::: ${b[1]}" before the first question`);
        return;
      }
      if (!(BLOCKS as readonly string[]).includes(b[1])) {
        errors.push(`Q${cur.n} (line ${ln}): unknown block "::: ${b[1]}" (source, answer and scheme only)`);
        return;
      }
      open = { name: b[1] as (typeof BLOCKS)[number], line: ln, lines: [] };
      return;
    }
    if (line === ":::") {
      errors.push(`line ${ln}: a ":::" that closes nothing`);
      return;
    }
    if (!cur) {
      if (line.trim()) errors.push(`line ${ln}: text before the first question`);
      return;
    }
    if (cur.order.length && line.trim()) {
      errors.push(`Q${cur.n} (line ${ln}): text after its blocks (the question text goes right under the heading)`);
      return;
    }
    cur.prompt.push(raw);
  });
  if (open) errors.push(`Q${cur ? (cur as Draft).n : "?"}: the "::: ${(open as { name: string }).name}" block opened on line ${(open as { line: number }).line} is never closed`);
  if (fence) errors.push("a code fence is never closed");

  if (!qs.length) errors.push("no questions (## Q1 · <marks> marks · <kind>)");
  if (qs.length > 12) errors.push(`${qs.length} questions: at most 12`);

  const questions: PaperQuestion[] = [];
  qs.forEach((q, k) => {
    const at = `Q${q.n} (line ${q.line})`;
    if (q.n !== k + 1) errors.push(`${at}: numbered ${q.n}, expected Q${k + 1} (from 1, no gaps)`);
    if (!(PAPER_KINDS as readonly string[]).includes(q.kind)) errors.push(`${at}: unknown kind "${q.kind}" (${PAPER_KINDS.join(", ")})`);
    if (q.marks < 1 || q.marks > 30) errors.push(`${at}: ${q.marks} marks (1 to 30)`);
    const prompt = q.prompt.join("\n").trim();
    if (!prompt) errors.push(`${at}: no question text`);
    if (prompt.length > 3000) errors.push(`${at}: question text is over 3,000 characters`);
    for (const name of BLOCKS) if (!q.blocks[name]) errors.push(`${at}: the "::: ${name}" block is missing`);
    if (q.order.join(",") !== BLOCKS.join(",") && BLOCKS.every((n) => q.blocks[n])) errors.push(`${at}: blocks must come in the order source, answer, scheme`);

    const sources: PaperSource[] = [];
    for (const s of q.blocks.source?.lines ?? []) {
      const t = s.trim();
      if (!t) continue;
      const m = t.match(SOURCE_RE);
      if (!m) {
        errors.push(`${at}: bad source line "${t.slice(0, 100)}" (<week-folder>/<lesson-file>#<anchor>)`);
        continue;
      }
      sources.push({ week: m[1], slug: m[2], anchor: m[3] || "" });
      if (!m[3]) warnings.push(`${at}: source "${t}" has no #anchor (it links to the top of the lesson)`);
    }
    if (q.blocks.source && !sources.length) errors.push(`${at}: the source block is empty`);

    const answer = (q.blocks.answer?.lines ?? []).join("\n").trim();
    if (q.blocks.answer && !answer) errors.push(`${at}: the answer block is empty`);
    if (answer.length > 6000) errors.push(`${at}: the model answer is over 6,000 characters`);

    const scheme: SchemePoint[] = [];
    for (const s of q.blocks.scheme?.lines ?? []) {
      const t = s.trim();
      if (!t) continue;
      const m = t.match(SCHEME_RE);
      if (!m) {
        errors.push(`${at}: bad scheme line "${t.slice(0, 100)}" (- [<marks>] <what the grader checks>)`);
        continue;
      }
      const marks = Number(m[1]);
      if (marks < 1 || marks > 10) errors.push(`${at}: scheme point "${m[2].slice(0, 60)}" is worth ${marks} (1 to 10)`);
      if (m[2].length > 400) errors.push(`${at}: scheme point is over 400 characters`);
      scheme.push({ marks, text: m[2].trim() });
    }
    if (q.blocks.scheme && !scheme.length) errors.push(`${at}: the scheme block is empty`);
    if (scheme.length > 16) errors.push(`${at}: ${scheme.length} scheme points (at most 16)`);
    const sum = scheme.reduce((a, p) => a + p.marks, 0);
    if (scheme.length && sum !== q.marks) errors.push(`${at}: the heading says ${q.marks} marks but the scheme adds up to ${sum}`);

    questions.push({ n: q.n, marks: q.marks, kind: q.kind as PaperKind, prompt, sources, answer, scheme });
  });

  if (errors.length) return { ok: false, errors, warnings };
  const marks = questions.reduce((a, q) => a + q.marks, 0);
  return { ok: true, paper: { key, title, minutes, questions, marks }, warnings };
}

/** The lesson URL of a source line (deep link to its section). */
export function sourceHref(courseId: string, s: PaperSource): string {
  return `/learn/${courseId}/${s.week}/${s.slug}${s.anchor ? `#${s.anchor}` : ""}`;
}
