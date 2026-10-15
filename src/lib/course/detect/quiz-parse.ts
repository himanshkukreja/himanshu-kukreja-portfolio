/**
 * ```quiz fences (inline quick checks). Pure parser, shared by the renderer (detect/quiz.ts) and
 * the Arena question bank (src/lib/learn/arena/bank.ts), so both index blocks the same way.
 *
 *   %% title: Quick check · Circuit breaker states      (optional first line)
 *   ? Question text (one line, inline markdown ok)
 *   - [ ] wrong option
 *   - [x] right option                                  (exactly one)
 *   > Explanation (one or more lines)
 *
 * Spec: scratchpad/quiz/FORMAT.md. The parser is lenient: a malformed question is dropped,
 * and a block with no valid question is not a quiz (the renderer falls back to a code block).
 */

export type QuizQuestion = {
  /** question text (inline markdown) */
  q: string;
  options: string[];
  /** index of the correct option */
  answer: number;
  /** explanation lines (inline markdown) */
  explain: string[];
};

export type QuizBlock = { title: string; questions: QuizQuestion[] };

export const QUIZ_DEFAULT_TITLE = "Quick check";

export function parseQuiz(value: string): QuizBlock | null {
  const lines = value.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n");
  let title = QUIZ_DEFAULT_TITLE;
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first >= 0) {
    const m = lines[first].match(/^\s*%%\s*title:\s*(.+?)\s*$/);
    if (m) {
      title = m[1];
      lines.splice(first, 1);
    }
  }
  type Draft = { q: string; options: string[]; correct: number[]; explain: string[]; bad: boolean };
  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, "");
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^\s*\?\s+(\S.*)$/))) {
      cur = { q: m[1], options: [], correct: [], explain: [], bad: false };
      drafts.push(cur);
    } else if ((m = l.match(/^\s*[-*]\s+\[( |x|X)\]\s+(\S.*)$/))) {
      if (!cur || cur.explain.length) {
        if (cur) cur.bad = true;
        continue;
      }
      if (m[1].toLowerCase() === "x") cur.correct.push(cur.options.length);
      cur.options.push(m[2]);
    } else if ((m = l.match(/^\s*>\s?(.*)$/))) {
      if (cur) cur.explain.push(m[1]);
    } else if (l.trim() === "") {
      continue;
    } else if (cur && cur.explain.length) {
      // a wrapped explanation line without the "> " marker: keep it with the explanation
      cur.explain.push(l.trim());
    } else if (cur) {
      cur.bad = true;
    }
  }
  const questions: QuizQuestion[] = drafts
    .filter((d) => !d.bad && d.options.length >= 2 && d.options.length <= 6 && d.correct.length === 1)
    .map((d) => ({ q: d.q, options: d.options, answer: d.correct[0], explain: joinExplain(d.explain) }));
  if (!questions.length) return null;
  return { title, questions };
}

/** "> " lines → paragraphs: consecutive lines join (markdown semantics), a bare ">" splits. */
function joinExplain(lines: string[]): string[] {
  const paras: string[] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) paras.push(cur.join(" "));
      cur = [];
    } else cur.push(l.trim());
  }
  if (cur.length) paras.push(cur.join(" "));
  return paras;
}

/** Plain text of inline markdown (for share text, aria labels, the question bank). */
export function inlinePlain(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

export type InlineToken = { t: "text" | "code" | "strong" | "em"; v: string } | { t: "link"; v: string; href: string };

/** Tiny inline markdown tokenizer: `code`, **strong**, *em*, [text](url). Everything else is text. */
export function inlineTokens(s: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "strong", v: m[2] });
    else if (m[3] !== undefined) out.push({ t: "em", v: m[3] });
    else out.push({ t: "link", v: m[4], href: m[5] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}
