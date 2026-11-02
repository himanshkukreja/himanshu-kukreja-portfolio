import "server-only";
import { getCourseIndex } from "@/lib/admin/learners/course";
import { getAllStories } from "@/lib/stories";
import type { TitleOf } from "./journeysModel";
import { cleanPath } from "@/lib/learn/paths";
import { sharedCache } from "@/lib/admin/sharedCache";

/**
 * Path → readable title for the journeys screens (lesson and case-file titles from the course map
 * and story front-matter). The map sits in the shared data cache (6 h, every instance) with a 10-minute memo per
 * instance; fails soft to "no title" (paths still show).
 */
const TTL = 10 * 60_000;
let memo: { at: number; value: Promise<TitleOf> } | null = null;

const STATIC: Record<string, string> = {
  "/": "Home / course hub",
  "/case-files": "Case files",
  "/play": "Arcade",
  "/projects": "Projects",
  "/privacy": "Privacy & analytics",
  "/dashboard": "Learn · progress",
  "/review": "Learn · review",
  "/notebook": "Learn · notebook",
  "/notes": "Learn · notes",
  "/bookmarks": "Learn · bookmarks",
  "/arena": "Learn · arena",
};

/** path → title for every lesson and case file (plain object: it lives in the shared data cache for hours). */
async function buildMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = { ...STATIC };
  const [course, stories] = await Promise.allSettled([getCourseIndex(), getAllStories()]);
  if (course.status === "fulfilled") {
    for (const r of course.value.byKey.values()) map[r.href.replace(/\/$/, "")] = r.title;
  }
  if (stories.status === "fulfilled") {
    for (const st of stories.value) map[`/case-files/${st.slug}`] = st.title;
  }
  return map;
}

const sharedMap = sharedCache("titles", buildMap, { revalidate: 6 * 3600, maxAge: 7 * 24 * 3600 });

function resolverOf(map: Record<string, string>): TitleOf {
  return (path) => {
    if (!path) return null;
    // events from before the move carry /learn/… and /stories/… paths: same titles
    const clean = cleanPath(path.split(/[?#]/)[0]).replace(/\/$/, "") || "/";
    return map[clean] ?? null;
  };
}

export function titleResolver(): Promise<TitleOf> {
  const now = Date.now();
  if (memo && now - memo.at < TTL) return memo.value;
  const value = sharedMap()
    .then(resolverOf)
    .catch(() => ((p: string | null | undefined) => (p ? (STATIC[p] ?? null) : null)) as TitleOf);
  memo = { at: now, value };
  return value;
}
