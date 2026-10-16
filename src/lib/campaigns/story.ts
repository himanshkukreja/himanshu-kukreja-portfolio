/**
 * "Case file update" template: one email per story, built from content/stories (frontmatter, H2
 * headings, debrief) and the story's end-of-case activity (src/components/stories/activities).
 * Server-only (reads files). Every field of the generated document stays editable in the composer.
 */
import { getCaseFiles } from "@/components/stories/case-files";
import { CASE_TYPE_LABEL, parseDebrief } from "@/components/stories/case-types";
import { ACTIVITY_SLUGS, ACTIVITY_XP } from "@/components/stories/activities/types";
import { SITE } from "./links";
import { storyContent, type StoryActivity } from "./story-doc";
import type { StoryOption } from "./types";

const DEBRIEF_XP = 50; // DebriefCard.tsx

type Activity = StoryActivity;

const strLit = (src: string, key: string) => {
  const m = new RegExp(`${key}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(src);
  return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, " ") : null;
};

/** Title + blurb of each story's activity, read from the activity source (fail-soft: none). */
async function activities(): Promise<Map<string, Activity>> {
  const out = new Map<string, Activity>();
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const dir = path.join(process.cwd(), "src", "components", "stories", "activities");
    const registry = await fs.readFile(path.join(dir, "registry.tsx"), "utf8");
    for (const m of registry.matchAll(/"([a-z0-9-]+)":\s*dynamic\(\(\)\s*=>\s*import\("\.\/([A-Za-z0-9]+)"\)/g)) {
      try {
        const src = await fs.readFile(path.join(dir, `${m[2]}.tsx`), "utf8");
        const def = src.slice(src.indexOf(": ActivityDef = {"));
        const title = strLit(def, "title");
        const blurb = strLit(def, "blurb");
        const minutes = Number(/minutes:\s*(\d+)/.exec(def)?.[1] || 0);
        if (title) out.set(m[1], { kind: strLit(def, "kind") || "activity", title, blurb: blurb || "", minutes });
      } catch {
        /* one unreadable activity doesn't matter */
      }
    }
  } catch {
    /* sources not deployed: generic teaser */
  }
  return out;
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

async function storyBodies(): Promise<Map<string, { body: string; hasDebrief: boolean }>> {
  const out = new Map<string, { body: string; hasDebrief: boolean }>();
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const matter = (await import("gray-matter")).default;
    const dir = path.join(process.cwd(), "content", "stories");
    for (const name of (await fs.readdir(dir)).filter((n) => n.endsWith(".md"))) {
      const { data, content } = matter(await fs.readFile(path.join(dir, name), "utf8"));
      const slug = (typeof data.slug === "string" && data.slug) || name.replace(/\.md$/, "");
      out.set(slug, { body: content, hasDebrief: !!parseDebrief(data.debrief) });
    }
  } catch {
    /* no stories dir */
  }
  return out;
}

export const absoluteCover = (cover?: string | null) => (!cover ? null : /^https?:\/\//i.test(cover) ? cover : `${SITE}${cover.startsWith("/") ? "" : "/"}${cover}`);

/** Every story, newest first, with a ready-to-send document and how many people already got it. */
export async function listStoryOptions(sent?: Map<string, Set<string>>): Promise<StoryOption[]> {
  const [cases, bodies, acts] = await Promise.all([getCaseFiles(), storyBodies(), activities()]);
  return cases.map((c) => {
    const b = bodies.get(c.slug);
    const activity = acts.get(c.slug) || null;
    const hasActivity = (ACTIVITY_SLUGS as readonly string[]).includes(c.slug);
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
