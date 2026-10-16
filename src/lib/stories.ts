/**
 * Case files ("stories"): ONE source of truth for every public surface (/stories, /stories/[slug],
 * home teaser, newsletter "case file update", analytics titles, /api/stories).
 *
 * Two origins, merged here:
 *   - file: content/stories/*.md in the repo (frontmatter + markdown), unchanged;
 *   - db:   case files published from the admin CMS (public.case_files, the LIVE snapshot only;
 *           drafts and archived rows never reach these functions).
 * A CMS row only replaces a repo story with the same slug when it was explicitly imported from it
 * (overrides_file = true); any other slug clash is ignored (the validator blocks it before publish).
 */
import { cache } from "react";
import type { CaseActivityData } from "@/components/stories/activities/data";

export type StoryFrontmatter = {
  slug: string;
  title: string;
  excerpt?: string;
  cover?: string;
  date?: string;
  tags?: string[];
};

export type Story = StoryFrontmatter & {
  content: string; // HTML
};

/** A story with everything the reader, the ledger and the newsletter need. */
export type StorySource = StoryFrontmatter & {
  origin: "file" | "db";
  /** markdown body, frontmatter stripped */
  body: string;
  /** raw `type` (resolveCaseType decides) */
  type?: unknown;
  /** raw `debrief` (parseDebrief decides) */
  debrief?: unknown;
  coverAlt?: string;
  /** transparent animated layer over the cover (CMS covers; repo covers derive it from /covers/<name>.png) */
  motionCover?: string;
  /** CMS end-of-file activity (repo stories ship TSX activities instead) */
  activity?: CaseActivityData | null;
  seoTitle?: string;
  seoDescription?: string;
  /** CMS rows: persisted case number (CASE-0NN), assigned at first publish */
  caseNumber?: number | null;
  /** repo stories (and CMS rows that override one): the repo file's own date, which fixes its case id */
  fileDate?: string;
  /** CMS rows: last change to the live snapshot */
  updatedAt?: string;
};

/* ─────────────────────────────── repo files ─────────────────────────────── */

async function parseFrontmatter(raw: string) {
  const matter = (await import("gray-matter")).default;
  return matter(raw);
}

async function readFile(path: string): Promise<string> {
  const fs = await import("fs/promises");
  return fs.readFile(path, "utf8");
}

async function listStoryFiles(): Promise<string[]> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "content", "stories");
  const entries: string[] = [];
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const it of items) {
      if (it.isFile() && it.name.endsWith(".md")) {
        entries.push(path.join(dir, it.name));
      }
    }
  } catch {
    // ignore if dir doesn't exist
  }
  return entries;
}

async function readFileStories(): Promise<StorySource[]> {
  const pathMod = await import("path");
  const files = await listStoryFiles();
  const out: StorySource[] = [];
  for (const file of files) {
    const raw = await readFile(file);
    const { data, content } = await parseFrontmatter(raw);
    // Derive slug from filename if not present in frontmatter
    const fm = { ...(data as Record<string, unknown>) };
    const slug = (fm.slug as string) || pathMod.basename(file, ".md");

    // Derive title from first markdown heading if missing
    let title = (fm.title as string) || "";
    if (!title) {
      const m = content.match(/^#\s+(.+)$/m) || content.match(/^(.+)\n=+$/m) || content.match(/^##\s+(.+)$/m);
      if (m && m[1]) title = m[1].trim();
    }

    if (!slug || !title) continue; // skip invalid entries

    out.push({
      origin: "file",
      slug,
      title,
      excerpt: (fm.excerpt as string) || undefined,
      cover: (fm.cover as string) || undefined,
      date: (fm.date as string) || undefined,
      tags: (fm.tags as string[]) || undefined,
      type: fm.type,
      debrief: fm.debrief,
      body: content,
      fileDate: (fm.date as string) || undefined,
    });
  }
  return out;
}

/* ─────────────────────────────── CMS rows ─────────────────────────────── */

/** Published CMS case files (live snapshots). Fails soft: no table / no network → the repo stories alone. */
async function readLiveRows(): Promise<StorySource[]> {
  try {
    const { getCaseFileStore } = await import("@/lib/case-files/store");
    const rows = await Promise.race([
      getCaseFileStore().listLive(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("case_files read timed out")), 8000)),
    ]);
    return rows.map((r) => ({
      origin: "db" as const,
      slug: r.slug,
      title: r.live.title,
      excerpt: r.live.excerpt || undefined,
      cover: r.live.coverUrl || undefined,
      coverAlt: r.live.coverAlt || undefined,
      motionCover: r.live.motionCoverUrl || undefined,
      date: r.live.date || (r.publishedAt ? r.publishedAt.slice(0, 10) : undefined),
      tags: r.live.tags,
      type: r.live.type,
      debrief: r.live.debrief,
      activity: r.live.activity,
      seoTitle: r.live.seoTitle || undefined,
      seoDescription: r.live.seoDescription || undefined,
      body: r.live.bodyMd,
      caseNumber: r.overridesFile ? null : r.caseNumber,
      updatedAt: r.updatedAt,
      ...(r.overridesFile ? { overrides: true } : {}),
    }));
  } catch (e) {
    const msg = (e as Error)?.message || "";
    if (!/tables are missing/i.test(msg)) console.warn("[stories] CMS case files unavailable:", msg);
    return [];
  }
}

/** Every public story (repo + published CMS), unsorted. Deduplicated per request. */
export const listStorySources = cache(async (): Promise<StorySource[]> => {
  const [files, live] = await Promise.all([readFileStories(), readLiveRows()]);
  const bySlug = new Map(files.map((f) => [f.slug, f]));
  for (const row of live as (StorySource & { overrides?: boolean })[]) {
    const file = bySlug.get(row.slug);
    if (file) {
      // only an explicit import may replace a repo story; it keeps the repo story's case id
      if (row.overrides) {
        const { overrides: _o, ...rest } = row;
        void _o;
        bySlug.set(row.slug, { ...rest, fileDate: file.fileDate });
      }
      continue;
    }
    if (!row.slug || !row.title) continue;
    const { overrides: _o, ...rest } = row;
    void _o;
    bySlug.set(row.slug, rest);
  }
  return [...bySlug.values()];
});

export async function getStorySource(slug: string): Promise<StorySource | null> {
  return (await listStorySources()).find((s) => s.slug === slug) || null;
}

/* ─────────────────────────────── existing API ─────────────────────────────── */

export async function getAllStories(): Promise<StoryFrontmatter[]> {
  const stories: StoryFrontmatter[] = (await listStorySources()).map((s) => ({
    slug: s.slug,
    title: s.title,
    excerpt: s.excerpt,
    cover: s.cover,
    date: s.date,
    tags: s.tags,
  }));
  // sort by date desc if present
  stories.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  return stories;
}

export async function getStoryBySlug(slug: string): Promise<Story | null> {
  const src = await getStorySource(slug);
  if (!src) return null;
  const { markdownToHtml } = await import("./markdown");
  const html = await markdownToHtml(src.body);
  const { body: _b, origin: _o, ...rest } = src;
  void _b;
  void _o;
  return { ...rest, slug, content: html };
}

/** Raw markdown body (frontmatter stripped) — used by the story reader's rich renderer. */
export async function getStoryMarkdown(slug: string): Promise<string | null> {
  return (await getStorySource(slug))?.body ?? null;
}

/** Repo stories only (the admin's "in repo" list and import source). */
export async function getRepoStories(): Promise<StorySource[]> {
  return readFileStories();
}
