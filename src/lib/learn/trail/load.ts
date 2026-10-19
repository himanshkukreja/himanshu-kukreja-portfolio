import "server-only";
/**
 * Server: the reading trail from the content repo (resources/reading-trail/*.yml) through the same
 * GitHub / SDM_LOCAL_DIR layer as lessons, joined with the course map for lesson titles and links.
 * Cached like the course map (Next data cache, tag "course-map", 5 min). A missing folder or a
 * broken file never breaks a page: lessons just render without a trail.
 */
import { unstable_cache } from "next/cache";
import { fetchGitHubContent, fetchMarkdownContent, isContentMissing, ContentFetchError } from "@/lib/github";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import type { CourseLesson, CourseMap } from "@/lib/learn/types";
import { mergeTrailFiles, parseTrailFile, TRAIL_DIR, TRAIL_FILE_RE, type ParsedFile, type ParsedLesson } from "./parse";
import type { TrailEntry, TrailIndexGroup, TrailIndexLesson, TrailLessonRef } from "./types";

async function readFiles(): Promise<Record<string, ParsedLesson>> {
  let files: { name: string; path: string; type: string }[] = [];
  try {
    files = await fetchGitHubContent(TRAIL_DIR);
  } catch (e) {
    if (isContentMissing(e)) return {};
    throw e; // transient (rate limit, 5xx): never cache an empty trail
  }
  const picked = files.filter((f) => f.type === "file" && TRAIL_FILE_RE.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  const parsed = await Promise.all(
    picked.map(async (f): Promise<{ name: string; parsed: ParsedFile } | null> => {
      try {
        return { name: f.name, parsed: parseTrailFile(await fetchMarkdownContent(f.path), f.name) };
      } catch (e) {
        if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
        return null;
      }
    })
  );
  const { lessons, errors } = mergeTrailFiles(parsed.filter((x): x is { name: string; parsed: ParsedFile } => !!x));
  if (errors.length && process.env.NODE_ENV !== "production") console.warn(`[reading-trail] ${errors.length} problem(s): ${errors.slice(0, 5).join(" | ")}`);
  return Object.fromEntries(lessons);
}

const cached = unstable_cache(readFiles, ["reading-trail-v1"], { revalidate: 3600, tags: [COURSE_MAP_TAG] });

async function sources(): Promise<Record<string, ParsedLesson>> {
  try {
    // local content (SDM_LOCAL_DIR) is read fresh in development so edits show up on reload
    return process.env.SDM_LOCAL_DIR && process.env.NODE_ENV !== "production" ? await readFiles() : await cached();
  } catch (e) {
    console.error("[reading-trail] failed to load", e);
    return {};
  }
}

/** The trail for one lesson or side quest (empty when it has none). */
export async function getTrailForLesson(week: string, slug: string): Promise<TrailEntry[]> {
  const all = await sources();
  return all[`${week}/${slug}`]?.entries ?? [];
}

const refOf = (l: CourseLesson): TrailLessonRef => ({ key: `${l.week}/${l.slug}`, week: l.week, slug: l.slug, title: l.title, code: l.code, tag: l.tag, href: l.href });

/** Every trail entry grouped by world (course order) and then side quests, for /learn/reading. */
export async function getTrailIndex(): Promise<{ groups: TrailIndexGroup[]; total: number }> {
  const [all, map] = await Promise.all([sources(), getCourseMap(COURSE_ID).catch((): CourseMap | null => null)]);
  if (!map) return { groups: [], total: 0 };
  const pick = (lessons: CourseLesson[]): TrailIndexLesson[] =>
    lessons.map((l) => ({ ...refOf(l), entries: all[`${l.week}/${l.slug}`]?.entries ?? [] })).filter((l) => l.entries.length);
  const groups: TrailIndexGroup[] = map.weeks
    .map((w) => ({ key: w.key, code: `W${w.code}`, title: w.title, lessons: pick([...w.lessons, ...(w.boss ? [w.boss] : [])]) }))
    .filter((g) => g.lessons.length);
  const quests = pick(map.sideQuests);
  if (quests.length) groups.push({ key: "bonus-problems", code: "SQ", title: "Side quests", lessons: quests });
  const total = groups.reduce((a, g) => a + g.lessons.reduce((b, l) => b + l.entries.length, 0), 0);
  return { groups, total };
}
