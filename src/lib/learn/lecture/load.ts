import "server-only";
import crypto from "crypto";
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

/** Fingerprint of a lecture's script; recorded media made from another version is ignored. */
export const lectureHash = (l: Lecture) => crypto.createHash("sha1").update(JSON.stringify(l)).digest("hex").slice(0, 12);

/** Where recorded lecture media lives: the R2 public URL, or public/lecture-media in development. */
export const lectureMediaBase = () => process.env.NEXT_PUBLIC_LECTURE_MEDIA || (process.env.NODE_ENV === "development" ? "/lecture-media" : null);

/** What the side-quest page shows about its lecture (v2 lectures only; v1 was the experiment). */
export function lectureCard(l: Lecture | null) {
  if (!l || l.v !== 2) return null;
  const words = l.scenes.reduce((a, s) => a + s.steps.reduce((b, st) => b + st.say.split(/\s+/).length, 0), 0);
  return { href: `/learn/lectures/${l.quest}`, minutes: Math.max(1, Math.round((words / 150) * 1.08)), checkpoints: l.scenes.filter((s) => s.kind === "quiz").length, chapters: l.scenes.length };
}
