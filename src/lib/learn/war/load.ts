import "server-only";
/**
 * Server: War stories from the content repo (resources/war-stories/stories/*.md and war-room/*.md),
 * through the same GitHub / SDM_LOCAL_DIR layer and course renderer as the lessons. Cached like the
 * course map (tag "course-map"); a missing folder or a broken file means fewer stories, never an error page.
 */
import { unstable_cache } from "next/cache";
import { fetchGitHubContent, fetchMarkdownContent, isContentMissing, ContentFetchError } from "@/lib/github";
import { renderLesson } from "@/lib/course/render";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import type { CourseLesson, CourseMap } from "@/lib/learn/types";
import { parseStory, parseWarRoom } from "./parse";
import { storyHref, warRoomHref, type LessonLink, type Story, type StorySummary, type WarRoom, type WarRoomSummary } from "./types";

const DIR = "resources/war-stories";
const FILE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

async function list(path: string): Promise<{ name: string; path: string }[]> {
  try {
    const files = await fetchGitHubContent(path);
    return files.filter((f) => f.type === "file" && FILE_RE.test(f.name) && f.name.toLowerCase() !== "readme.md");
  } catch (e) {
    if (isContentMissing(e)) return [];
    throw e; // transient (rate limit, 5xx): never cache an empty list
  }
}

async function read(path: string, name: string): Promise<string | null> {
  try {
    return await fetchMarkdownContent(path);
  } catch (e) {
    if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
    if (process.env.NODE_ENV !== "production") console.warn(`[war-stories] ${name}: ${(e as Error).message}`);
    return null;
  }
}

/** Course renderer output without the lesson stage wrapper. */
async function html(md: string): Promise<string> {
  if (!md.trim()) return "";
  const r = await renderLesson(md, { kind: "day-content" });
  return r.html
    .replace(/<header class="sd-stage-head"[\s\S]*?<\/header>/g, "")
    .replace(/<section data-sd="stage"[^>]*>/g, "")
    .replace(/<\/section>\s*$/g, "");
}

function lessonLink(ref: string | null, map: CourseMap | null): LessonLink | null {
  if (!ref || !map) return null;
  const [week, slug] = ref.split("/");
  const all: CourseLesson[] = [...map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]), ...map.sideQuests, ...(map.problems || []), ...(map.lld || [])];
  const l = all.find((x) => x.week === week && x.slug === slug);
  return l ? { title: l.title, href: l.href, code: l.tag } : null;
}

type Built = { stories: StorySummary[]; storyBySlug: Record<string, Story>; rooms: WarRoomSummary[]; roomBySlug: Record<string, WarRoom> };

async function build(): Promise<Built> {
  const [storyFiles, roomFiles, map] = await Promise.all([list(`${DIR}/stories`), list(`${DIR}/war-room`), getCourseMap(COURSE_ID).catch(() => null)]);

  const stories = (
    await Promise.all(
      storyFiles.map(async (f): Promise<Story | null> => {
        const raw = await read(f.path, f.name);
        if (!raw) return null;
        const { story, errors } = parseStory(raw, f.name);
        if (!story) {
          if (process.env.NODE_ENV !== "production") console.warn(`[war-stories] ${f.name}: ${errors.join("; ")}`);
          return null;
        }
        const { body, lesson, ...s } = story;
        return { ...s, href: storyHref(s.slug), html: await html(body), lesson: lessonLink(lesson, map) };
      }),
    )
  )
    .filter((s): s is Story => !!s)
    .sort((a, b) => a.title.localeCompare(b.title));

  const rooms = (
    await Promise.all(
      roomFiles.map(async (f): Promise<WarRoom | null> => {
        const raw = await read(f.path, f.name);
        if (!raw) return null;
        const { room, errors } = parseWarRoom(raw, f.name);
        if (!room) {
          if (process.env.NODE_ENV !== "production") console.warn(`[war-stories] ${f.name}: ${errors.join("; ")}`);
          return null;
        }
        const { postmortem, real, lesson, ...r } = room;
        return {
          ...r,
          href: warRoomHref(r.slug),
          decisions: r.beats.filter((b) => b.kind === "decision").length,
          postmortemHtml: await html(postmortem),
          realHtml: await html(real),
          lesson: lessonLink(lesson, map),
        };
      }),
    )
  )
    .filter((r): r is WarRoom => !!r)
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    stories: stories.map(({ html: _h, sources: _s, lesson: _l, ...s }) => (void _h, void _s, void _l, s)),
    storyBySlug: Object.fromEntries(stories.map((s) => [s.slug, s])),
    rooms: rooms.map(({ slug, title, sev, company, product, starts, minutes, decisions, basedOn, basedOnUrl, href }) => ({ slug, title, sev, company, product, starts, minutes, decisions, basedOn, basedOnUrl, href })),
    roomBySlug: Object.fromEntries(rooms.map((r) => [r.slug, r])),
  };
}

const cached = unstable_cache(() => build(), ["war-stories-v1"], { revalidate: 3600, tags: [COURSE_MAP_TAG] });

async function data(): Promise<Built> {
  try {
    // local content (SDM_LOCAL_DIR) is read fresh in development so edits show up on reload
    return process.env.SDM_LOCAL_DIR && process.env.NODE_ENV !== "production" ? await build() : await cached();
  } catch (e) {
    console.error("[war-stories] failed to load", e);
    return { stories: [], storyBySlug: {}, rooms: [], roomBySlug: {} };
  }
}

export async function getWarStories(): Promise<{ stories: StorySummary[]; rooms: WarRoomSummary[] }> {
  const d = await data();
  return { stories: d.stories, rooms: d.rooms };
}

export async function getStory(slug: string): Promise<Story | null> {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  return (await data()).storyBySlug[slug] ?? null;
}

export async function getWarRoom(slug: string): Promise<WarRoom | null> {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  return (await data()).roomBySlug[slug] ?? null;
}
