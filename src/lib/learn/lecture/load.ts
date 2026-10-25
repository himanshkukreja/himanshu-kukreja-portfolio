import "server-only";
import { fetchMarkdownContent, isContentMissing } from "@/lib/github";
import type { Lecture } from "./types";

/** The lecture for a side quest, or null (none yet, or a broken file). */
export async function getLecture(slug: string): Promise<Lecture | null> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(slug)) return null;
  try {
    const raw = await fetchMarkdownContent(`resources/lectures/${slug}.json`);
    const l = JSON.parse(raw) as Lecture;
    return Array.isArray(l.scenes) && l.scenes.length ? l : null;
  } catch (e) {
    if (!isContentMissing(e) && process.env.NODE_ENV !== "production") console.warn(`[lecture] ${slug}:`, (e as Error).message);
    return null;
  }
}
