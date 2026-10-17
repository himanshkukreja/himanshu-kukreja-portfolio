/**
 * Server: one mock interview, rendered, for /learn/mock/[slug]. Cached like the course map
 * (Next data cache, tag "course-map", 5 min), so /api/revalidate-courses refreshes both.
 * Kept apart from load.ts so course.ts can import load.ts without a cycle.
 */
import { unstable_cache } from "next/cache";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import { buildMock, loadMockSources } from "./load";
import type { MockInterview } from "./types";

async function build(slug: string): Promise<MockInterview | null> {
  const [map, sources] = await Promise.all([getCourseMap(COURSE_ID), loadMockSources()]);
  const src = sources.find((s) => s.slug === slug);
  if (!src || !map) return null;
  const mock = await buildMock(src, { weeks: map.weeks, sideQuests: map.sideQuests });
  return mock.phases.length ? mock : null;
}

const cached = unstable_cache((slug: string) => build(slug), ["mock-interview-v1"], { revalidate: 300, tags: [COURSE_MAP_TAG] });

export async function getMockInterview(slug: string): Promise<MockInterview | null> {
  if (!/^mock-\d+-[\w-]+$/.test(slug)) return null;
  // local content (SDM_LOCAL_DIR) is read fresh so edits show up on reload
  return process.env.SDM_LOCAL_DIR && process.env.NODE_ENV !== "production" ? build(slug) : cached(slug);
}
