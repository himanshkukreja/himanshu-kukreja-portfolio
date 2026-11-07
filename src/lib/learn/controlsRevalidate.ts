import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { COURSE_ID, COURSE_MAP_TAG } from "@/lib/learn/course";
import { CONTROLS_TAG } from "@/lib/learn/controls";

/**
 * What the site caches for publishing controls: the controls, the course map (quests), the feed and the
 * affected pages. Called on every admin change and by the hourly cron when a scheduled item goes live
 * (content pages keep their cache for a week, so they don't pick up a go-live time on their own).
 */
export function revalidateControlled(keys: string[]) {
  revalidateTag(CONTROLS_TAG);
  if (keys.some((k) => k.startsWith("quest:"))) revalidateTag(COURSE_MAP_TAG);
  revalidatePath("/learn/shorts");
  revalidatePath("/api/search/transcripts"); // ⌘K's "In lectures" leaves out hidden shorts and quests
  revalidatePath("/api/search/index/[part]", "page"); // smart search leaves them out too (and re-checks the controls per query)
  for (const k of keys) {
    const [kind, id] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)];
    if (kind === "short") revalidatePath(`/learn/shorts/${id}`);
    else {
      revalidatePath(`/learn/${COURSE_ID}/bonus-problems/${id}`);
      revalidatePath(`/learn/lectures/${id}`);
    }
  }
  revalidatePath(`/learn/${COURSE_ID}`);
  revalidatePath("/sitemap.xml");
}
