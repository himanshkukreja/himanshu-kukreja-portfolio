import { fetchMarkdownContent, formatWeekTopic, getAllLearningResources, titleFromMarkdown, type LearningResource, ContentFetchError, isContentMissing } from "@/lib/github";
import { controlMap, isLive, questKey } from "@/lib/learn/controls";
import { unstable_cache } from "next/cache";
import { calculateReadingTime } from "@/lib/reading-time";
import { isMCQDocument, parseMCQMarkdown } from "@/lib/mcq-parser";
import type { CourseLesson, CourseMap, CourseTrial, CourseWeek } from "./types";
import type { CourseMock } from "./mock/types";
import { loadMockSources, summarize } from "./mock/load";
import { levelForWeek, levelFromMarkdown, type Level } from "./level";

export const COURSE_ID = "system-design-mastery";

/** Badge for clearing each world (Learn design copy). */
const WORLD_BADGES: Record<number, string> = {
  0: "Ground floor",
  1: "Shard lord",
  2: "Fault tolerant",
  3: "Async native",
  4: "Cache hit",
  5: "Quorum",
  6: "Fan-out",
  7: "Inverted",
  8: "Watermark",
  9: "Isolation",
  10: "On-call ready",
};

export function worldBadge(num: number): string {
  return WORLD_BADGES[num] || `World ${String(num).padStart(2, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

function weekNum(week: string): number {
  const m = week.match(/week-(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}

/** "Part 1: System Design Fundamentals" -> "System Design Fundamentals" */
function stripPartPrefix(title: string) {
  return title.replace(/^Part\s+\d+\s*[:·-]\s*/i, "").trim();
}

function toLesson(r: LearningResource, courseId: string, minutes: number): CourseLesson {
  const n = weekNum(r.week);
  const W = n >= 0 ? `W${pad(n)}` : "";
  const href = `/learn/${courseId}/${r.week}/${r.slug}`;
  if (r.type === "foundations") {
    const part = parseInt(r.slug.match(/part-(\d+)/)?.[1] || "1", 10);
    const title = stripPartPrefix(r.title);
    return { week: r.week, slug: r.slug, title, kind: "foundations", minutes, code: `P${part}`, label: `Part ${part} · ${title}`, tag: `${W} · PART ${part}`, href };
  }
  if (r.type === "week-preview") {
    return { week: r.week, slug: r.slug, title: r.title, kind: "week-preview", minutes, code: "PRE", label: "Preview", tag: `${W} · PREVIEW`, href };
  }
  if (r.type === "capstone") {
    return { week: r.week, slug: r.slug, title: r.title, kind: "capstone", minutes, code: "B", label: `Boss · ${r.title}`, tag: `${W} · BOSS`, href };
  }
  if (r.type === "problem" || r.type === "lld") {
    const k = parseInt(r.slug.match(/^(?:problem|lld)-(\d+)/)?.[1] || "0", 10);
    const code = r.type === "problem" ? `IP-${pad(k)}` : `LLD-${pad(k)}`;
    return { week: r.week, slug: r.slug, title: r.title, kind: r.type, minutes, code, label: r.title, tag: code, href };
  }
  if (r.type === "bonus") {
    const k = parseInt(r.slug.match(/bonus-(\d+)/)?.[1] || "0", 10);
    return { week: r.week, slug: r.slug, title: r.title, kind: "bonus", minutes, code: `SQ-${pad(k)}`, label: r.title, tag: `SQ-${pad(k)}`, href };
  }
  if (r.type === "overview") {
    return { week: r.week, slug: r.slug, title: r.title, kind: "overview", minutes, code: "PLAN", label: r.title, tag: "PLAN", href };
  }
  const day = parseInt(r.slug.match(/day-(\d+)/)?.[1] || "0", 10);
  return { week: r.week, slug: r.slug, title: r.title, kind: "day-content", minutes, code: `D${day}`, label: `Day ${day} · ${r.title}`, tag: `${W} · DAY ${pad(day)}`, href };
}

async function buildCourseMap(courseId: string): Promise<CourseMap> {
  const resources = (await getAllLearningResources()).filter((r) => r.course === courseId);

  // One read per file: minutes for lessons, parts for MCQs.
  const minutes: Record<string, number> = {};
  // the problem bank and LLD track take their titles from each file's H1
  const titles: Record<string, string> = {};
  const levels: Record<string, Level> = {};
  const trials: Record<string, CourseTrial> = {};
  await Promise.all(
    resources.map(async (r) => {
      try {
        const md = await fetchMarkdownContent(r.path);
        if (r.type === "mcq") {
          if (!isMCQDocument(md)) return;
          const a = parseMCQMarkdown(md);
          const base = `/learn/${courseId}/${r.week}/${r.slug}`;
          const parts = a.sections
            .filter((s) => s.questions.length > 0)
            .map((s, i) => ({
              n: i + 1,
              title: stripPartPrefix(s.title),
              questions: s.questions.length,
              range: s.questionRange,
              href: `${base}?part=${i + 1}`,
            }));
          if (parts.length) {
            trials[r.week] = {
              week: r.week,
              slug: r.slug,
              title: a.title || r.title,
              href: base,
              parts,
              totalQuestions: a.totalQuestions,
              passPct: 80,
            };
          }
          return;
        }
        minutes[`${r.week}/${r.slug}`] = calculateReadingTime(md).minutes;
        const lv = levelFromMarkdown(md);
        if (lv) levels[`${r.week}/${r.slug}`] = lv;
        if (r.type === "problem" || r.type === "lld") {
          const h1 = titleFromMarkdown(md);
          if (h1) titles[`${r.week}/${r.slug}`] = h1.replace(/^(Interview Problem|Problem|LLD|Low-Level Design)\s*\d*\s*[:·—-]\s*/i, "");
        }
      } catch (e) {
        // a file that's gone keeps a zero estimate; a transient fetch failure (rate limit, 5xx)
        // throws so the cached course map is never rebuilt without its trials and estimates
        if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
      }
    })
  );

  const lessonOf = (r: LearningResource) => {
    const l = toLesson(r, courseId, minutes[`${r.week}/${r.slug}`] || 0);
    const n = weekNum(r.week);
    const level = levels[`${r.week}/${r.slug}`] ?? (n >= 0 ? levelForWeek(n, r.type === "capstone") : undefined);
    return level ? { ...l, level } : l;
  };

  const weekKeys = Array.from(new Set(resources.filter((r) => r.week.startsWith("week-")).map((r) => r.week))).sort();
  const weeks: CourseWeek[] = weekKeys.map((key) => {
    const rs = resources.filter((r) => r.week === key);
    const lessons = rs.filter((r) => r.type === "foundations" || r.type === "week-preview" || r.type === "day-content").map(lessonOf);
    const bossRes = rs.find((r) => r.type === "capstone");
    const boss = bossRes ? lessonOf(bossRes) : null;
    const num = weekNum(key);
    return {
      key,
      num,
      code: pad(num),
      title: formatWeekTopic(key),
      lessons,
      boss,
      trial: trials[key] || null,
      minutes: lessons.reduce((a, l) => a + l.minutes, 0) + (boss?.minutes || 0),
      badge: worldBadge(num),
    };
  });

  // publishing controls (/admin/publishing): a hidden or not-yet-due side quest is left out of the course
  const controls = await controlMap();
  const sideQuests = resources.filter((r) => r.type === "bonus" && isLive(controls.get(questKey(r.slug)))).map(lessonOf);
  const extra = (t: "problem" | "lld") => resources.filter((r) => r.type === t).map((r) => ({ ...lessonOf(r), ...(titles[`${r.week}/${r.slug}`] ? { title: titles[`${r.week}/${r.slug}`], label: titles[`${r.week}/${r.slug}`] } : {}) }));
  const problems = extra("problem");
  const lld = extra("lld");
  // Mock interviews between worlds; a missing folder or a broken file just means fewer mocks.
  const mocks: CourseMock[] = (await loadMockSources().catch((e) => {
    if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
    return [];
  }))
    .map((src) => {
      try {
        const { covers: _covers, ...m } = summarize(src, { weeks, sideQuests });
        void _covers;
        return m;
      } catch {
        return null;
      }
    })
    .filter((m): m is CourseMock => !!m && m.phases > 0)
    // in course order: by the world each mock follows (mock numbers are ids, so later mocks can sit earlier)
    .sort((a, b) => Number(a.afterCode) - Number(b.afterCode) || a.n - b.n);
  const planRes = resources.find((r) => r.type === "overview");
  const plan = planRes ? lessonOf(planRes) : null;

  const coreLessons = weeks.reduce((a, w) => a + w.lessons.length, 0);
  const coreMinutes = weeks.reduce((a, w) => a + w.minutes, 0);
  const totalMinutes = coreMinutes + sideQuests.reduce((a, l) => a + l.minutes, 0) + (plan?.minutes || 0);

  return {
    courseId,
    title: "System Design Mastery",
    description:
      "A campaign for backend engineers going from intermediate to advanced. Clear a week's lessons, beat its interview boss, pass the trial, and move to the next world.",
    plan,
    weeks,
    sideQuests,
    mocks,
    problems,
    lld,
    stats: {
      worlds: weeks.length,
      mocks: mocks.length,
      coreLessons,
      bosses: weeks.filter((w) => w.boss).length,
      sideQuests: sideQuests.length,
      problems: problems.length,
      lld: lld.length,
      trialParts: weeks.reduce((a, w) => a + (w.trial?.parts.length || 0), 0),
      coreHours: Math.round(coreMinutes / 60),
      totalHours: Math.round(totalMinutes / 60),
    },
  };
}

// The map is the same for every visitor. Next's data cache shares it across serverless
// instances (an in-memory cache alone meant a ~2 s GitHub rebuild on most production requests);
// /api/revalidate-courses clears it via the "course-map" tag. The in-memory layer below
// de-duplicates concurrent builds within one instance.
export const COURSE_MAP_TAG = "course-map";
const buildCached = unstable_cache((courseId: string) => buildCourseMap(courseId), ["course-map-v2"], {
  revalidate: 3600,
  tags: [COURSE_MAP_TAG],
});
const cache = new Map<string, { at: number; map: Promise<CourseMap> }>();
const TTL = 60_000;

export async function getCourseMap(courseId: string = COURSE_ID): Promise<CourseMap | null> {
  if (courseId !== COURSE_ID) return null;
  const hit = cache.get(courseId);
  if (hit && Date.now() - hit.at < TTL) return hit.map;
  const map = buildCached(courseId);
  cache.set(courseId, { at: Date.now(), map });
  try {
    return await map;
  } catch (e) {
    cache.delete(courseId);
    throw e;
  }
}
