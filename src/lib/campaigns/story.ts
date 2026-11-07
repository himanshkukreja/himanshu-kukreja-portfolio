/**
 * "Case file update" template: one email per story, built from every published story (repo
 * content/stories + CMS case files, via listStorySources: frontmatter, H2 headings, debrief) and the
 * story's end-of-case activity (TSX in src/components/stories/activities, or the CMS activity data).
 * Server-only. Every field of the generated document stays editable in the composer.
 */
import { getCaseFiles } from "@/components/stories/case-files";
import { listStorySources } from "@/lib/stories";
import { CASE_TYPE_LABEL, parseDebrief } from "@/components/stories/case-types";
import { ACTIVITY_SLUGS, ACTIVITY_XP } from "@/components/stories/activities/types";
import { SITE } from "./links";
import { storyContent, type StoryActivity } from "./story-doc";
import type { StoryOption } from "./types";
import { STORY_ACTIVITIES } from "@/generated/stories";

const DEBRIEF_XP = 50; // DebriefCard.tsx

type Activity = StoryActivity;

/** Title + blurb of each story's activity (extracted from the activity sources at build time). */
async function activities(): Promise<Map<string, Activity>> {
  return new Map(Object.entries(STORY_ACTIVITIES));
}

const SKIP_HEADING = /understanding the problem|summary|conclusion|introduction|key takeaways|final thoughts|lessons for|the end|epilogue|references|further reading|appendix|contribut|what comes next|future|getting started|try it/i;

/** 3 "what you'll learn" bullets from the story's H2 headings (subtitle after a colon when there is one). */
function learnBullets(body: string): string[] {
  const heads = [...body.replace(/```[\s\S]*?```/g, "").matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].replace(/[*_`]/g, "").trim());
  const picked = heads
    .filter((h) => !SKIP_HEADING.test(h))
    .map((h) => {
      const parts = h.split(/:\s+/);
      const t = (parts.length > 1 && parts[1].length > 12 ? parts.slice(1).join(": ") : h).replace(/[.!]+$/, "");
      return t.charAt(0).toUpperCase() + t.slice(1);
    });
  const uniq = [...new Set(picked)];
  if (uniq.length <= 3) return uniq;
  // spread across the story: first, middle, last
  return [uniq[0], uniq[Math.floor(uniq.length / 2)], uniq[uniq.length - 1]];
}

async function storyBodies(): Promise<Map<string, { body: string; hasDebrief: boolean; activity: Activity | null }>> {
  const out = new Map<string, { body: string; hasDebrief: boolean; activity: Activity | null }>();
  try {
    for (const s of await listStorySources()) {
      const a = s.activity && s.activity.steps.length ? { kind: s.activity.kind, title: s.activity.title, blurb: s.activity.blurb, minutes: s.activity.minutes } : null;
      out.set(s.slug, { body: s.body, hasDebrief: !!parseDebrief(s.debrief), activity: a });
    }
  } catch {
    /* no stories */
  }
  return out;
}

export const absoluteCover = (cover?: string | null) => (!cover ? null : /^https?:\/\//i.test(cover) ? cover : `${SITE}${cover.startsWith("/") ? "" : "/"}${cover}`);

/** Every story, newest first, with a ready-to-send document and how many people already got it. */
export async function listStoryOptions(sent?: Map<string, Set<string>>): Promise<StoryOption[]> {
  const [cases, bodies, acts] = await Promise.all([getCaseFiles(), storyBodies(), activities()]);
  return cases.map((c) => {
    const b = bodies.get(c.slug);
    const activity = b?.activity || acts.get(c.slug) || null;
    const hasActivity = !!b?.activity || (ACTIVITY_SLUGS as readonly string[]).includes(c.slug);
    const xp = (hasActivity ? ACTIVITY_XP : 0) + (b?.hasDebrief ? DEBRIEF_XP : 0) || ACTIVITY_XP;
    const typeLabel = CASE_TYPE_LABEL[c.type];
    const cover = absoluteCover(c.cover);
    return {
      slug: c.slug,
      caseId: c.caseId,
      title: c.title,
      type: c.type,
      typeLabel,
      mins: c.mins,
      date: c.date || null,
      cover,
      excerpt: c.excerpt || null,
      sentTo: sent?.get(c.slug)?.size ?? 0,
      content: storyContent({ slug: c.slug, caseId: c.caseId, title: c.title, typeLabel, mins: c.mins, cover, excerpt: c.excerpt || null, bullets: b ? learnBullets(b.body) : [], activity, xp }),
    };
  });
}
