import "server-only";
/**
 * The Shorts feed: every released vertical short (resources/shorts/shorts--<long id>[--<part>].json, its
 * media on the lecture host at lectures/<short id>/video.mp4 + poster.jpg), with its category (from the
 * long lecture it comes from), topic tags, and links to the full lecture at the right moment and to the
 * written article. A short can stand alone (a war story told only as a short + its article): `of` then
 * names the story and `full` is null. Cached like the course map (tag "course-map", refreshed by
 * revalidate-courses).
 */
import { unstable_cache } from "next/cache";
import { fetchGitHubContent, isContentMissing } from "@/lib/github";
import { COURSE_MAP_TAG } from "@/lib/learn/course";
import { getShort, lectureHash } from "@/lib/learn/lecture/load";

import type { PlayableShort, ShortCategory } from "./types";

export type FeedShort = PlayableShort;

export function categoryOf(longId: string): ShortCategory {
  if (longId.startsWith("war-stories--")) return "stories";
  if (longId.startsWith("problem-bank--")) return "problems";
  if (longId.startsWith("low-level-design--")) return "lld";
  if (longId.startsWith("case-files--")) return "cases";
  if (longId.startsWith("mock-interviews--")) return "mocks";
  if (longId.startsWith("bonus-")) return "quests";
  return "course";
}

async function load(): Promise<FeedShort[]> {
  const base = (process.env.NEXT_PUBLIC_LECTURE_MEDIA || "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(base)) return [];
  let files: { name: string; type: string }[] = [];
  try {
    files = await fetchGitHubContent("resources/shorts");
  } catch (e) {
    if (isContentMissing(e)) return [];
    throw e;
  }
  const ids = files.filter((f) => f.type === "file" && /^shorts--[A-Za-z0-9-]+\.json$/.test(f.name)).map((f) => f.name.replace(/\.json$/, ""));
  // the long lectures that exist: a short of a story without one has no "full lecture" link
  const lectures = new Set(
    (await fetchGitHubContent("resources/lectures").catch(() => [] as { name: string; type: string }[]))
      .filter((f) => f.type === "file" && f.name.endsWith(".json"))
      .map((f) => f.name.replace(/\.json$/, ""))
  );
  const all = await Promise.all(ids.map((id) => getShort(id).catch(() => null)));
  return all.flatMap((l) => {
    if (!l?.short) return [];
    const v = lectureHash(l);
    const words = l.scenes.reduce((a, s) => a + s.steps.reduce((b, st) => b + st.say.split(/\s+/).length, 0), 0);
    return [
      {
        id: l.quest,
        title: l.title,
        label: l.short.label,
        category: categoryOf(l.short.of),
        topics: l.short.topics ?? [],
        lecture: l.short.of,
        full: !lectures.size || lectures.has(l.short.of) ? `/learn/lectures/${l.short.of}${l.short.at ? `?at=${encodeURIComponent(l.short.at)}` : ""}` : null,
        article: l.short.article,
        src: `${base}/${l.quest}/video.mp4?v=${v}`,
        poster: `${base}/${l.quest}/poster.jpg?v=${v}`,
        // ~150 words a minute of narration, plus the pauses between steps
        seconds: Math.round((words / 150) * 60 * 1.08),
      },
    ];
  });
}

/**
 * The feed's order for this hour: a seeded shuffle that changes every hour. The page is cached, so this is what
 * the server can pick; the first short then starts straight from the HTML, before any JavaScript has loaded.
 * (The browser re-deals the rest on arrival, unseen first, and keeps this first one unless it was watched.)
 */
export function hourlyOrder<T>(items: T[], now = Date.now()): T[] {
  let seed = Math.floor(now / 3_600_000) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out = [...items];
  for (let k = out.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [out[k], out[j]] = [out[j], out[k]];
  }
  return out;
}

export const listShorts = unstable_cache(load, ["shorts-feed-v2"], { revalidate: 3600, tags: [COURSE_MAP_TAG] });
