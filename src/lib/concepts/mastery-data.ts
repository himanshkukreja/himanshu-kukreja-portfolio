import "server-only";
import { unstable_cache } from "next/cache";
import { fetchMarkdownContent } from "@/lib/github";
import { COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import { parseMCQMarkdown } from "@/lib/mcq-parser";
import type { LessonKind } from "@/lib/course/types";
import { getCatalogue, lessonLabels } from "./load";
import { lessonStructure, stageOf, type LessonStructure } from "./structure";
import { buildMatcher, conceptForms, conceptsIn, COURSE_BASE, refCode, refHref } from "./match";
import type { MasteryConcept, MasteryData } from "./mastery";

/**
 * What the concept mastery map needs from the server, computed once per catalogue / content
 * version: every concept with its refresher, the stages it is taught in, and the quick-check and
 * trial questions attributed to it. Learner data stays on the client (src/lib/concepts/mastery.ts).
 *
 * Attribution (section based):
 * - quick checks in the stage of `taught_in`: a question whose text mentions the concept counts 1,
 *   the stage's other questions 0.35; in `also` stages only mentioning questions count;
 * - trial questions of the concept's weeks whose question or correct answer mentions it count 1.
 */
const OTHER_QUESTION_WEIGHT = 0.35;

const kindOf = (slug: string): LessonKind =>
  slug.startsWith("day-") ? "day-content" : slug.startsWith("capstone") ? "capstone" : slug.startsWith("bonus") ? "bonus" : slug.startsWith("foundations") ? "foundations" : slug.includes("preview") ? "week-preview" : "day-content";

const plain = (s: string) => s.replace(/`([^`]*)`/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

async function build(): Promise<MasteryData> {
  const [{ catalogue }, map] = await Promise.all([getCatalogue(), getCourseMap().catch(() => null)]);
  const labels = lessonLabels(map);
  const lessonList: string[] = [];
  const lessonIdx = new Map<string, number>();
  const idxOf = (lk: string) => {
    if (!lessonIdx.has(lk)) {
      lessonIdx.set(lk, lessonList.length);
      lessonList.push(lk);
    }
    return lessonIdx.get(lk)!;
  };

  // every lesson the catalogue points at, parsed once
  const wanted = new Set<string>();
  catalogue.concepts.forEach((c) => [c.taught, ...c.also].forEach((r) => wanted.add(r.lesson)));
  const structures = new Map<string, LessonStructure>();
  await Promise.all(
    Array.from(wanted).map(async (lk) => {
      try {
        const md = await fetchMarkdownContent(`resources/${lk}.md`);
        structures.set(lk, await lessonStructure(md, kindOf(lk.split("/")[1] || "")));
      } catch {
        // a missing lesson just contributes no quick checks
      }
    }),
  );

  // trials: questions per week folder
  type TrialQ = { n: number; part: number; label: string; text: string };
  const trials = new Map<string, { href: string; questions: TrialQ[] }>();
  await Promise.all(
    (map?.weeks || []).map(async (w) => {
      if (!w.trial) return;
      try {
        const md = await fetchMarkdownContent(`resources/${w.trial.week}/${w.trial.slug}.md`);
        const a = parseMCQMarkdown(md);
        const questions: TrialQ[] = [];
        a.sections
          .filter((s) => s.questions.length > 0)
          .forEach((s, i) =>
            s.questions.forEach((q) => {
              const right = q.options.find((o) => o.label === q.correctAnswer)?.text || "";
              questions.push({ n: q.number, part: i + 1, label: q.correctAnswer, text: plain(`${q.text} ${right}`) });
            }),
          );
        trials.set(w.key, { href: w.trial.href, questions });
      } catch {
        // no trial for this week
      }
    }),
  );
  const weekList = Array.from(trials.keys()).sort();
  const sigs: Record<string, string> = {};

  const concepts: MasteryConcept[] = catalogue.concepts.map((c) => {
    const matcher = buildMatcher(conceptForms(c));
    const mentions = (text: string) => !!matcher && conceptsIn(matcher, text).has(c.id);
    const refs: MasteryConcept["refs"] = [];
    const quiz: MasteryConcept["quiz"] = [];
    // practise: the taught stage's quick check that mentions the concept, else its first one, else an `also` one
    const pick: { taughtHit?: string; taught?: string; alsoHit?: string } = {};
    [c.taught, ...c.also].forEach((ref, ri) => {
      const st = structures.get(ref.lesson);
      const stage = st ? stageOf(st, ref.anchor) : null;
      const l = idxOf(ref.lesson);
      refs.push([l, stage || ""]);
      if (!st || !stage) return;
      const s = st.stages.find((x) => x.id === stage);
      s?.quizzes.forEach((qz) => {
        sigs[`${l}:${qz.block}`] = qz.sig;
        qz.questions.forEach((q, qi) => {
          const hit = mentions(plain([q.q, q.options[q.answer] || "", ...q.explain].join(" ")));
          const w = hit ? 1 : ri === 0 ? OTHER_QUESTION_WEIGHT : 0;
          if (!w) return;
          quiz.push([l, qz.block, qi, q.answer, w]);
          const link = `${COURSE_BASE}/${ref.lesson}#sd-quiz-${qz.block}`;
          if (ri === 0) {
            pick.taught ??= link;
            if (hit) pick.taughtHit ??= link;
          } else if (hit) pick.alsoHit ??= link;
        });
      });
    });
    const practiceQuiz = pick.taughtHit || pick.taught || pick.alsoHit;
    const weeks = new Set([c.taught, ...c.also].map((r) => r.lesson.split("/")[0]));
    const trial: MasteryConcept["trial"] = [];
    let practiceTrial: string | undefined;
    weeks.forEach((wk) => {
      const t = trials.get(wk);
      if (!t) return;
      t.questions.forEach((q) => {
        if (!mentions(q.text)) return;
        trial.push([weekList.indexOf(wk), q.n, q.label, q.part]);
        practiceTrial ??= `${t.href}?part=${q.part}`;
      });
    });
    const group = c.taught.lesson.split("/")[0];
    return {
      id: c.id,
      term: c.term,
      def: c.definition,
      refresher: c.refresher,
      related: c.related,
      forms: [c.term, ...c.aliases],
      group,
      href: refHref(c.taught),
      code: refCode(c.taught.lesson),
      ...(labels[c.taught.lesson]?.title ? { title: labels[c.taught.lesson].title } : {}),
      refs,
      quiz,
      trial,
      practice: { ...(practiceQuiz ? { quiz: practiceQuiz } : {}), ...(practiceTrial ? { trial: practiceTrial } : {}) },
    };
  });

  const groupKeys = Array.from(new Set(concepts.map((c) => c.group))).sort((a, b) => (a === "bonus-problems" ? 1 : b === "bonus-problems" ? -1 : a.localeCompare(b)));
  const groups = groupKeys.map((key) => {
    const w = map?.weeks.find((x) => x.key === key);
    return { key, code: w ? `W${w.code}` : key === "bonus-problems" ? "SQ" : key, title: w ? w.title : key === "bonus-problems" ? "Side quests" : key };
  });
  return { course: map?.courseId || "system-design-mastery", lessons: lessonList, weeks: weekList, sigs, concepts, groups };
}

const cached = unstable_cache(build, ["concept-mastery-v1"], { revalidate: 600, tags: [COURSE_MAP_TAG] });

export async function getMasteryData(): Promise<MasteryData | null> {
  try {
    const d = await cached();
    return d.concepts.length ? d : null;
  } catch {
    return null;
  }
}
