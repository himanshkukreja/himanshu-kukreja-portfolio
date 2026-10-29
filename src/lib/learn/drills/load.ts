import "server-only";
/**
 * Server: a side quest's follow-up drills (resources/quest-drills/<quest slug>.md) through the same
 * GitHub / SDM_LOCAL_DIR layer as the quest itself, so they are cached with the content and baked into
 * the quest page's ISR render. No file (or a broken one) means the quest simply shows no drills.
 */
import { fetchMarkdownContent, isContentMissing } from "@/lib/github";
import { DRILLS_DIR, linkSections, parseDrills, type QuestDrills } from "./parse";

export async function getQuestDrills(slug: string, toc: { id: string; text: string }[]): Promise<QuestDrills | null> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(slug)) return null;
  let raw: string;
  try {
    raw = await fetchMarkdownContent(`${DRILLS_DIR}/${slug}.md`);
  } catch (e) {
    if (!isContentMissing(e) && process.env.NODE_ENV !== "production") console.warn(`[drills] ${slug}: ${(e as Error).message}`);
    return null;
  }
  const drills = parseDrills(raw, slug);
  return drills ? linkSections(drills, toc) : null;
}
