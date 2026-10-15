/**
 * The Arena question bank (server only): every ```quiz question in the course plus every weekly
 * trial (MCQ assessment) question, read from the course source (GitHub, or SDM_LOCAL_DIR locally).
 * Built once per server instance and cached for 10 minutes.
 *
 * Ids are stable across builds:
 *   quiz:<course>/<week>/<slug>:<block>:<q>   (block = n-th ```quiz fence in the lesson, document order,
 *                                              the same numbering the renderer and the XP keys use)
 *   trial:<week>:p<part>:q<question number>
 */
import type { Code, Root } from "mdast";
import { fetchMarkdownContent, getAllLearningResources, type LearningResource } from "@/lib/github";
import { isMCQDocument, parseMCQMarkdown } from "@/lib/mcq-parser";
import { COURSE_ID } from "@/lib/learn/course";
import { parseQuiz } from "@/lib/course/detect/quiz-parse";

export type BankQuestion = {
  id: string;
  kind: "quiz" | "trial";
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
  week: string;
  slug: string;
  /** "W04 · Caching patterns" */
  label: string;
  href: string;
};

export type Bank = { questions: BankQuestion[]; byId: Map<string, BankQuestion>; builtAt: number; quizzes: number; trials: number };

const TTL = 10 * 60_000;
const g = globalThis as typeof globalThis & { __sdArenaBank?: { at: number; p: Promise<Bank> }; __sdArenaBankOk?: Bank; __sdArenaBankBuilding?: boolean };

const weekCode = (week: string) => {
  const m = week.match(/week-(\d+)/);
  return m ? `W${m[1].padStart(2, "0")}` : week === "bonus-problems" ? "SQ" : "";
};

function shortTitle(r: LearningResource): string {
  return r.title.replace(/^(Week\s+\d+\s*[—–-]\s*)?(Day\s+\d+|Part\s+\d+)\s*[:·-]\s*/i, "").trim();
}

/** ```quiz fences of a lesson in document order (all of them, valid or not, to keep the renderer's numbering). */
export async function lessonQuizFences(markdown: string): Promise<string[]> {
  if (!/```+\s*quiz/i.test(markdown) && !/~~~+\s*quiz/i.test(markdown)) return [];
  const { unified } = await import("unified");
  const remarkParse = (await import("remark-parse")).default;
  const remarkGfm = (await import("remark-gfm")).default;
  const { visit } = await import("unist-util-visit");
  const parser = unified().use(remarkParse).use(remarkGfm);
  const tree = (await parser.run(parser.parse(markdown))) as Root;
  const out: string[] = [];
  visit(tree, "code", (node: Code) => {
    if ((node.lang || "").toLowerCase() === "quiz") out.push(node.value);
  });
  return out;
}

async function build(): Promise<Bank> {
  const resources = (await getAllLearningResources()).filter((r) => r.course === COURSE_ID);
  const lists = await Promise.all(
    resources.map(async (r): Promise<BankQuestion[]> => {
      let md = "";
      try {
        md = await fetchMarkdownContent(r.path);
      } catch {
        return [];
      }
      const href = `/learn/${COURSE_ID}/${r.week}/${r.slug}`;
      if (r.type === "mcq") {
        if (!isMCQDocument(md)) return [];
        const a = parseMCQMarkdown(md);
        const out: BankQuestion[] = [];
        a.sections.forEach((s, si) => {
          s.questions.forEach((q) => {
            const answer = q.options.findIndex((o) => o.label === q.correctAnswer);
            if (answer < 0 || q.options.length < 2) return;
            out.push({
              id: `trial:${r.week}:p${si + 1}:q${q.number}`,
              kind: "trial",
              prompt: q.text.trim(),
              options: q.options.map((o) => o.text.trim()),
              answer,
              explain: (q.explanation || "").trim(),
              week: r.week,
              slug: r.slug,
              label: `${weekCode(r.week)} · Trial part ${si + 1}`,
              href: `${href}?part=${si + 1}`,
            });
          });
        });
        return out;
      }
      const fences = await lessonQuizFences(md);
      const out: BankQuestion[] = [];
      fences.forEach((value, block) => {
        const quiz = parseQuiz(value);
        if (!quiz) return;
        quiz.questions.forEach((q, qi) => {
          out.push({
            id: `quiz:${COURSE_ID}/${r.week}/${r.slug}:${block}:${qi}`,
            kind: "quiz",
            // inline markdown kept (`code`, **bold**); the daily runner renders it, share text strips it
            prompt: q.q,
            options: q.options,
            answer: q.answer,
            explain: q.explain.join(" "),
            week: r.week,
            slug: r.slug,
            label: `${weekCode(r.week)} · ${shortTitle(r)}`,
            href,
          });
        });
      });
      return out;
    }),
  );
  const questions = lists.flat().sort((a, b) => a.id.localeCompare(b.id));
  return {
    questions,
    byId: new Map(questions.map((q) => [q.id, q])),
    builtAt: Date.now(),
    quizzes: questions.filter((q) => q.kind === "quiz").length,
    trials: questions.filter((q) => q.kind === "trial").length,
  };
}

/** Cached for TTL, then stale-while-revalidate: the last good bank is served while a new one builds. */
export async function getQuestionBank(): Promise<Bank> {
  const hit = g.__sdArenaBank;
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const stale = g.__sdArenaBankOk;
  if (stale) {
    // keep serving the last good bank; refresh once in the background
    if (!g.__sdArenaBankBuilding) {
      g.__sdArenaBankBuilding = true;
      build()
        .then((b) => {
          g.__sdArenaBankOk = b;
          g.__sdArenaBank = { at: Date.now(), p: Promise.resolve(b) };
        })
        .catch(() => {})
        .finally(() => (g.__sdArenaBankBuilding = false));
    }
    return stale;
  }
  const p = build();
  const entry = { at: Date.now(), p };
  g.__sdArenaBank = entry;
  p.then((b) => (g.__sdArenaBankOk = b)).catch(() => {
    if (g.__sdArenaBank === entry) g.__sdArenaBank = undefined;
  });
  return p;
}
