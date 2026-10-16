import "server-only";
import { getCourseIndex } from "@/lib/admin/learners/course";
import { getAllStories } from "@/lib/stories";
import type { TitleOf } from "./journeysModel";

/**
 * Path → readable title for the journeys screens (lesson and case-file titles from the course map
 * and story front-matter). Cached for 10 minutes; fails soft to "no title" (paths still show).
 */
const TTL = 10 * 60_000;
let memo: { at: number; value: Promise<TitleOf> } | null = null;

const STATIC: Record<string, string> = {
  "/": "Home",
  "/learn": "Learn hub",
  "/stories": "Case files",
  "/play": "Arcade",
  "/projects": "Projects",
  "/privacy": "Privacy & analytics",
  "/learn/dashboard": "Learn · progress",
  "/learn/review": "Learn · review",
  "/learn/notebook": "Learn · notebook",
  "/learn/notes": "Learn · notes",
  "/learn/bookmarks": "Learn · bookmarks",
  "/learn/arena": "Learn · arena",
};

async function build(): Promise<TitleOf> {
  const map = new Map<string, string>(Object.entries(STATIC));
  const [course, stories] = await Promise.allSettled([getCourseIndex(), getAllStories()]);
  if (course.status === "fulfilled") {
    for (const r of course.value.byKey.values()) map.set(r.href.replace(/\/$/, ""), r.title);
  }
  if (stories.status === "fulfilled") {
    for (const st of stories.value) map.set(`/stories/${st.slug}`, st.title);
  }
  return (path) => {
    if (!path) return null;
    const clean = path.split(/[?#]/)[0].replace(/\/$/, "") || "/";
    return map.get(clean) ?? null;
  };
}

export function titleResolver(): Promise<TitleOf> {
  const now = Date.now();
  if (memo && now - memo.at < TTL) return memo.value;
  const value = build().catch(() => ((p: string | null | undefined) => (p ? (STATIC[p] ?? null) : null)) as TitleOf);
  memo = { at: now, value };
  return value;
}
