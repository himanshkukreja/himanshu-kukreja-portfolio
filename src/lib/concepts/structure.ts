/**
 * A lesson's structure for concept attribution, without rendering it: which stage each heading id
 * belongs to, and the ```quiz blocks of each stage (numbered exactly as the renderer numbers them,
 * see markQuizzes in src/lib/course/render.ts). Parsing only, so the mastery map can read every
 * lesson the catalogue points at in about a second.
 *
 * The stage split is the renderer's own (splitStages / majorStage); the hero strip and heading ids
 * mirror renderLessonDetailed and detect/blocks.ts headingId. validate-concepts.mjs checks the
 * catalogue's anchors against fully rendered HTML.
 */
import type { Code, Heading, Root, RootContent } from "mdast";
import type { LessonKind } from "@/lib/course/types";
import { majorStage, splitStages } from "@/lib/course/render";
import { stripEmoji, startsWithEmoji, toText } from "@/lib/course/md";
import { IdRegistry, slugify } from "@/lib/course/slug";
import { parseQuiz, type QuizQuestion } from "@/lib/course/detect/quiz-parse";
import { quizSignature } from "@/lib/course/detect/quiz";

export type StageQuiz = { block: number; sig: string; questions: QuizQuestion[] };
export type LessonStructure = {
  stages: { id: string; quizzes: StageQuiz[] }[];
  /** heading id (and scoped variants) → stage id */
  headingStage: Map<string, string>;
};

const SERIES_RE = /^System Design Mastery Series$/i;
const CHAPTER_RE = /^Chapter\s+(\d+)\s*[:.–—-]\s*(.*)$/i;
const NUMBERED_RE = /^(\d+(?:\.\d+)+)\.?\s+(.*)$/;
const QUESTION_RE = /^Question\s+(\d+)\s*[:.]\s*(.*)$/i;
const PREVIEW_CH_RE = /^(Concept|Day)\s+(\d+)\s*[:.–—-]\s*(.*)$/i;

/** detect/blocks.ts headingId, base id only. */
function headingBase(clean: string): string {
  let m = clean.match(CHAPTER_RE);
  if (m) return `ch-${m[1]}-${slugify(m[2], 48)}`.replace(/-$/, "");
  m = clean.match(NUMBERED_RE);
  if (m) return `s-${m[1].replace(/\./g, "-")}-${slugify(m[2], 48)}`.replace(/-$/, "");
  m = clean.match(QUESTION_RE);
  if (m) return `q-${m[1]}-${slugify(m[2], 40)}`.replace(/-$/, "");
  m = clean.match(PREVIEW_CH_RE);
  if (m) return `${m[1].toLowerCase()}-${m[2]}-${slugify(m[3], 48)}`.replace(/-$/, "");
  return slugify(clean) || "section";
}

function walk(node: unknown, fn: (n: { type: string }) => void) {
  const n = node as { type?: string; children?: unknown[] };
  if (!n || typeof n !== "object" || !n.type) return;
  fn(n as { type: string });
  if (Array.isArray(n.children)) n.children.forEach((c) => walk(c, fn));
}

export async function lessonStructure(markdown: string, kind: LessonKind): Promise<LessonStructure> {
  const { unified } = await import("unified");
  const remarkParse = (await import("remark-parse")).default;
  const remarkGfm = (await import("remark-gfm")).default;
  const remarkDirective = (await import("remark-directive")).default;
  const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);
  const mdast = (await parser.run(parser.parse(markdown))) as Root;
  // a top-level :::mission is lifted out of the body (and its fences are not numbered)
  const at = mdast.children.findIndex((n) => (n as { type: string; name?: string }).type === "containerDirective" && (n as { name?: string }).name === "mission");
  if (at >= 0) mdast.children.splice(at, 1);

  // global quiz numbering: every ```quiz fence in document order
  const quizIndex = new Map<Code, number>();
  let qi = 0;
  walk(mdast, (n) => {
    if (n.type === "code" && ((n as Code).lang || "").toLowerCase() === "quiz") quizIndex.set(n as Code, qi++);
  });

  // hero: title h1, deck h2, thematic breaks, optional lede h1 (as in renderLessonDetailed)
  const nodes = [...mdast.children];
  let k = 0;
  while (k < nodes.length && nodes[k].type === "thematicBreak") k++;
  let leadingTitle = false;
  if (nodes[k]?.type === "heading" && (nodes[k] as Heading).depth === 1) {
    leadingTitle = true;
    k++;
  }
  if (leadingTitle && nodes[k]?.type === "heading" && (nodes[k] as Heading).depth === 2) k++;
  while (k < nodes.length && nodes[k].type === "thematicBreak") k++;
  let body: RootContent[] = nodes.slice(k).filter((n) => !(n.type === "heading" && n.depth === 2 && SERIES_RE.test(stripEmoji(toText(n)))));
  const ledeText = body[0]?.type === "heading" && (body[0] as Heading).depth === 1 ? toText(body[0]) : "";
  if (ledeText && (startsWithEmoji(ledeText) || (kind === "bonus" && /\?\s*$/.test(ledeText))) && !majorStage(ledeText, kind)) body = body.slice(1);

  const raw = splitStages(body, kind);
  const ids = new IdRegistry();
  raw.forEach((s) => (s.head.id = ids.claim(s.head.id)));

  const headingStage = new Map<string, string>();
  const stages = raw.map((s) => {
    const quizzes: StageQuiz[] = [];
    headingStage.set(s.head.id, s.head.id);
    s.nodes.forEach((n) =>
      walk(n, (x) => {
        if (x.type === "heading") {
          const base = headingBase(stripEmoji(toText(x)).trim());
          if (!headingStage.has(base)) headingStage.set(base, s.head.id);
          headingStage.set(`${s.head.id}-${base}`, s.head.id);
        } else if (x.type === "code" && quizIndex.has(x as Code)) {
          const value = (x as Code).value;
          const quiz = parseQuiz(value);
          if (quiz) quizzes.push({ block: quizIndex.get(x as Code)!, sig: quizSignature(value), questions: quiz.questions });
        }
      }),
    );
    return { id: s.head.id, quizzes };
  });
  return { stages, headingStage };
}

/** The stage an anchor sits in, or null when it can't be resolved. */
export function stageOf(structure: LessonStructure, anchor: string): string | null {
  const hit = structure.headingStage.get(anchor);
  if (hit) return hit;
  // ids scoped by a parent heading: "<parent id>-<base>"
  let best: { len: number; stage: string } | null = null;
  structure.headingStage.forEach((stage, base) => {
    if (anchor.endsWith(`-${base}`) && (!best || base.length > best.len)) best = { len: base.length, stage };
  });
  return (best as { len: number; stage: string } | null)?.stage ?? null;
}
