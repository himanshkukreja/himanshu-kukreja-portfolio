import "server-only";
import { fetchMarkdownContent, isContentMissing } from "@/lib/github";

/**
 * "Learners often ask here": a few questions per lecture chapter with answers written once in
 * advance (resources/lecture-faq/<quest slug>.json, made by scripts/ai-batch/lecture-faq.ts), so most
 * learners get an answer in the player without spending AI credits.
 */
export type LectureFaq = { lecture: string; source: string; generated: string; scenes: Record<string, { q: string; a: string }[]> };

export async function getLectureFaq(slug: string): Promise<LectureFaq | null> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(slug)) return null;
  try {
    const f = JSON.parse(await fetchMarkdownContent(`resources/lecture-faq/${slug}.json`)) as LectureFaq;
    return f && typeof f.scenes === "object" ? f : null;
  } catch (e) {
    if (!isContentMissing(e) && process.env.NODE_ENV !== "production") console.warn(`[lecture-faq] ${slug}:`, (e as Error).message);
    return null;
  }
}
