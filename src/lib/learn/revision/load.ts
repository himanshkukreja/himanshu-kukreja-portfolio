import "server-only";
import { createHash } from "crypto";
import { unstable_cache } from "next/cache";
import { fetchGitHubContent, fetchMarkdownContent, isContentMissing, ContentFetchError } from "@/lib/github";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import type { CourseLesson, CourseWeek } from "@/lib/learn/types";
import { parseRevision, type RevCard, type RevWeek } from "./parse";

/**
 * Revision decks and cheat sheets read resources/revision/week-XX.md from the content repo (the same
 * source as the lessons: GitHub, or SDM_LOCAL_DIR locally) and join them with the course map for
 * titles, tags and links. A missing folder or a broken file means fewer cards, never an error page.
 */

const DIR = "resources/revision";

export type DeckLesson = {
  slug: string;
  title: string;
  /** "Day 1 · Partitioning Deep-Dive", "Boss · Design a URL Shortener at Scale" */
  label: string;
  /** "Day 1", "Part 3", "Boss" */
  short: string;
  /** "W01 · DAY 01" */
  tag: string;
  kind: CourseLesson["kind"];
  /** the lesson itself */
  href: string;
  cards: RevCard[];
};

export type DeckWeek = {
  /** week folder, e.g. week-01-data-at-scale */
  key: string;
  /** URL segment, e.g. week-01 */
  id: string;
  num: number;
  /** "01" */
  code: string;
  title: string;
  badge: string;
  lessons: DeckLesson[];
  cards: number;
  /** lessons of the week (days + boss / parts) with no cards yet */
  missing: number;
  /** hash of the source file: offline copies know when they are out of date */
  version: string;
};

type Source = { week: RevWeek; hash: string };

async function readAll(): Promise<Source[]> {
  let files: { name: string; path: string; type: string }[] = [];
  try {
    files = await fetchGitHubContent(DIR);
  } catch (e) {
    if (isContentMissing(e)) return [];
    throw e; // transient (rate limit, 5xx): never cache an empty deck list
  }
  const picked = files.filter((f) => f.type === "file" && /^week-\d+\.md$/.test(f.name));
  const out = await Promise.all(
    picked.map(async (f) => {
      try {
        const md = await fetchMarkdownContent(f.path);
        const { week } = parseRevision(md);
        if (!week || !week.lessons.length) return null;
        return { week, hash: createHash("sha1").update(md).digest("hex").slice(0, 12) };
      } catch (e) {
        if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
        return null;
      }
    })
  );
  return out.filter((x): x is Source => !!x);
}

const cachedSources = unstable_cache(readAll, ["revision-v1"], { revalidate: 300, tags: [COURSE_MAP_TAG] });

const pad = (n: number) => String(n).padStart(2, "0");
export const weekId = (num: number) => `week-${pad(num)}`;

/** Lessons of a week a deck can cover, in course order: parts / days, then the boss. */
function revisable(w: CourseWeek): CourseLesson[] {
  return [...w.lessons.filter((l) => l.kind === "foundations" || l.kind === "day-content"), ...(w.boss ? [w.boss] : [])];
}

function shortOf(l: CourseLesson): string {
  if (l.kind === "capstone") return "Boss";
  return l.label.split(" · ")[0].replace(/^Day 0/, "Day ");
}

function toDeck(w: CourseWeek, src: Source | undefined): DeckWeek {
  const bySlug = new Map((src?.week.lessons ?? []).map((l) => [l.slug, l.cards]));
  const all = revisable(w);
  const lessons: DeckLesson[] = all
    .filter((l) => (bySlug.get(l.slug)?.length ?? 0) > 0)
    .map((l) => ({
      slug: l.slug,
      title: l.title,
      label: l.kind === "capstone" ? `Boss · ${l.title}` : l.label.replace(/^Day 0/, "Day "),
      short: shortOf(l),
      tag: l.tag,
      kind: l.kind,
      href: l.href,
      cards: bySlug.get(l.slug)!,
    }));
  return {
    key: w.key,
    id: weekId(w.num),
    num: w.num,
    code: w.code,
    title: w.title,
    badge: w.badge,
    lessons,
    cards: lessons.reduce((a, l) => a + l.cards.length, 0),
    missing: all.length - lessons.length,
    version: src?.hash ?? "none",
  };
}

/** Every world with its revision cards (worlds without cards keep an empty lesson list). */
export async function getRevisionWeeks(course: string = COURSE_ID): Promise<DeckWeek[]> {
  const map = await getCourseMap(course);
  if (!map) return [];
  const sources = await cachedSources().catch(() => [] as Source[]);
  const byKey = new Map(sources.map((s) => [s.week.week, s]));
  return map.weeks.map((w) => toDeck(w, byKey.get(w.key)));
}

/** "week-01", "week-1", "01" or the full folder name → that world. */
export async function getRevisionWeek(param: string, course: string = COURSE_ID): Promise<DeckWeek | null> {
  const p = decodeURIComponent(param).toLowerCase();
  const m = p.match(/^(?:week-)?(\d{1,2})(?:-.*)?$/);
  const weeks = await getRevisionWeeks(course);
  return weeks.find((w) => w.key === p || (m && w.num === parseInt(m[1], 10))) ?? null;
}
