import "server-only";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { getLearningResource } from "@/lib/github";
import { parseMCQMarkdown } from "@/lib/mcq-parser";
import { getLessonStages } from "@/lib/learn/actions";
import type { CourseLesson, CourseMap } from "@/lib/learn/types";

/**
 * Course structure for admin analytics: every lesson in reading order with titles, plus MCQ answer
 * keys and lesson stage lists. Built from the same course map the Learn hub renders (cached there
 * for a minute) and memoised here for 5 minutes.
 */
export { COURSE_ID };

export type LessonRef = {
  week: string;
  slug: string;
  title: string;
  code: string;
  tag: string;
  label: string;
  kind: CourseLesson["kind"];
  href: string;
  minutes: number;
  /** reading order across the whole course (plan = -1) */
  order: number;
  /** week lessons + bosses (what course progress % counts) */
  core: boolean;
  weekCode: string;
  weekTitle: string;
};

export type CourseIndex = {
  map: CourseMap;
  ordered: LessonRef[];
  byKey: Map<string, LessonRef>;
  weeks: { key: string; code: string; title: string; nodes: LessonRef[] }[];
  coreTotal: number;
};

const TTL = 5 * 60_000;
let indexCache: { at: number; value: Promise<CourseIndex> } | null = null;

async function build(): Promise<CourseIndex> {
  const map = await getCourseMap(COURSE_ID);
  if (!map) throw new Error("course map unavailable");
  const ordered: LessonRef[] = [];
  const weeks: CourseIndex["weeks"] = [];
  const push = (l: CourseLesson, core: boolean, weekCode: string, weekTitle: string) => {
    const ref: LessonRef = {
      week: l.week,
      slug: l.slug,
      title: l.title,
      code: l.code,
      tag: l.tag,
      label: l.label,
      kind: l.kind,
      href: l.href,
      minutes: l.minutes,
      order: ordered.length,
      core,
      weekCode,
      weekTitle,
    };
    ordered.push(ref);
    return ref;
  };
  map.weeks.forEach((w) => {
    const nodes = w.lessons.map((l) => push(l, true, w.code, w.title));
    if (w.boss) nodes.push(push(w.boss, true, w.code, w.title));
    weeks.push({ key: w.key, code: w.code, title: w.title, nodes });
  });
  map.sideQuests.forEach((l) => push(l, false, "SQ", "Side quests"));
  const byKey = new Map(ordered.map((r) => [`${r.week}/${r.slug}`, r]));
  if (map.plan) {
    byKey.set(`${map.plan.week}/${map.plan.slug}`, {
      week: map.plan.week,
      slug: map.plan.slug,
      title: map.plan.title,
      code: "PLAN",
      tag: "PLAN",
      label: map.plan.label,
      kind: map.plan.kind,
      href: map.plan.href,
      minutes: map.plan.minutes,
      order: -1,
      core: false,
      weekCode: "PLAN",
      weekTitle: "Plan",
    });
  }
  // trials (MCQ files) so their slugs resolve to a title too
  map.weeks.forEach((w) => {
    if (!w.trial) return;
    byKey.set(`${w.trial.week}/${w.trial.slug}`, {
      week: w.trial.week,
      slug: w.trial.slug,
      title: w.trial.title,
      code: "TRIAL",
      tag: `W${w.code} · TRIAL`,
      label: `Trial · ${w.title}`,
      kind: "day-content",
      href: w.trial.href,
      minutes: 0,
      order: 10_000 + w.num,
      core: false,
      weekCode: w.code,
      weekTitle: w.title,
    });
  });
  return { map, ordered, byKey, weeks, coreTotal: weeks.reduce((a, w) => a + w.nodes.length, 0) };
}

export async function getCourseIndex(): Promise<CourseIndex> {
  if (indexCache && Date.now() - indexCache.at < TTL) return indexCache.value;
  if (indexCache) {
    // stale-while-revalidate: serve the previous index, rebuild in the background
    const stale = indexCache.value;
    const fresh = build();
    indexCache = { at: Date.now(), value: stale };
    fresh.then((v) => (indexCache = { at: Date.now(), value: Promise.resolve(v) })).catch(() => {});
    return stale;
  }
  const value = build();
  indexCache = { at: Date.now(), value };
  try {
    return await value;
  } catch (e) {
    indexCache = null;
    throw e;
  }
}

/** Title for any lesson key, falling back to a readable slug. */
export function lessonTitle(idx: CourseIndex, week: string, slug: string): string {
  return idx.byKey.get(`${week}/${slug}`)?.title || slug.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function lessonTag(idx: CourseIndex, week: string, slug: string): string {
  const ref = idx.byKey.get(`${week}/${slug}`);
  if (ref) return ref.tag;
  const n = week.match(/week-(\d+)/)?.[1];
  return n ? `W${n.padStart(2, "0")}` : week.toUpperCase();
}

// ------------------------------------------------------------------ MCQ answer keys

export type McqKey = {
  title: string;
  parts: { n: number; title: string; numbers: number[] }[];
  questions: Map<number, { part: number; text: string; correct: string; options: Record<string, string> }>;
};

const mcqCache = new Map<string, { at: number; value: Promise<McqKey | null> }>();

export async function getMcqKey(week: string, slug: string): Promise<McqKey | null> {
  const k = `${week}/${slug}`;
  const hit = mcqCache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = (async () => {
    const data = await getLearningResource(week, slug);
    if (!data) return null;
    const a = parseMCQMarkdown(data.content);
    const questions: McqKey["questions"] = new Map();
    const parts: McqKey["parts"] = [];
    a.sections
      .filter((s) => s.questions.length)
      .forEach((s, i) => {
        parts.push({ n: i + 1, title: s.title.replace(/^Part\s+\d+\s*[:·-]\s*/i, ""), numbers: s.questions.map((q) => q.number) });
        s.questions.forEach((q) =>
          questions.set(q.number, {
            part: i + 1,
            text: q.text.replace(/\*\*/g, "").trim(),
            correct: q.correctAnswer,
            options: Object.fromEntries(q.options.map((o) => [o.label, o.text])),
          })
        );
      });
    return { title: a.title || data.resource.title, parts, questions };
  })().catch(() => null);
  mcqCache.set(k, { at: Date.now(), value });
  return value;
}

// ------------------------------------------------------------------ stages

export type StageRef = { id: string; label: string; title: string; minutes: number };

/** Stage list of a lesson (rendered from the markdown; cached 5 min by the Learn action). */
export async function getStages(week: string, slug: string): Promise<StageRef[]> {
  try {
    return await getLessonStages(week, slug);
  } catch {
    return [];
  }
}

/** Which stage a scroll/progress % most likely sits in (stages weighted by reading minutes). */
export function stageAtPct(stages: StageRef[], pct: number): StageRef | null {
  if (!stages.length) return null;
  const total = stages.reduce((a, s) => a + Math.max(1, s.minutes), 0);
  const target = (Math.max(0, Math.min(100, pct)) / 100) * total;
  let acc = 0;
  for (const s of stages) {
    acc += Math.max(1, s.minutes);
    if (target <= acc) return s;
  }
  return stages[stages.length - 1];
}
