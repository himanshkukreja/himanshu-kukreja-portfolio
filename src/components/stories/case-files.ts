// Server-only: builds the "Case files" ledger on top of the story loader.
// listStorySources() (src/lib/stories.ts) is the source of truth for which stories exist (repo
// markdown + published CMS case files); this adds the type, read time (word count ÷ 220) and CASE ids.
import { listStorySources, type StorySource } from "@/lib/stories";
import { assignCaseIds, formatCaseId, parseDebrief, readMinutes, resolveCaseType, sortNewestFirst, type CaseFile } from "./case-types";

/** Count what a reader reads: drop HTML comments (image prompts) before counting. */
export function storyWords(body: string): number {
  const text = body.replace(/<!--[\s\S]*?-->/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}

/**
 * CASE ids. Repo stories keep the numbers they always had (date ascending among the repo files,
 * CASE-001…), also when a CMS import overrides one. CMS case files carry the number they were given
 * at first publish (the sequence continues after the repo stories, in publish order).
 */
export function caseIdsFor(sources: StorySource[]): Map<string, string> {
  const repo = sources.filter((s) => s.origin === "file" || s.fileDate !== undefined);
  const ids = assignCaseIds(repo.map((s) => ({ slug: s.slug, date: s.fileDate ?? s.date })));
  let next = repo.length;
  const cms = sources.filter((s) => !ids.has(s.slug)).sort((a, b) => (a.caseNumber ?? 1e9) - (b.caseNumber ?? 1e9) || a.slug.localeCompare(b.slug));
  for (const s of cms) {
    const n = s.caseNumber && s.caseNumber > next ? s.caseNumber : next + 1;
    next = Math.max(next, n);
    ids.set(s.slug, formatCaseId(n));
  }
  return ids;
}

export function toCaseFile(s: StorySource, caseId: string): CaseFile {
  // CMS-only fields are left out (not undefined) for repo stories, so their props/HTML stay byte-identical.
  const extra: Partial<CaseFile> = {};
  if (s.coverAlt) extra.coverAlt = s.coverAlt;
  if (s.motionCover) extra.motionCover = s.motionCover;
  if (s.origin === "db") extra.origin = "db";
  return {
    slug: s.slug,
    caseId,
    title: s.title,
    excerpt: s.excerpt,
    cover: s.cover,
    date: s.date,
    tags: Array.from(new Set(Array.isArray(s.tags) ? s.tags : [])),
    type: resolveCaseType(s.slug, s.type),
    mins: readMinutes(storyWords(s.body)),
    hasDebrief: !!parseDebrief(s.debrief),
    ...extra,
  };
}

/** All case files, newest first. */
export async function getCaseFiles(): Promise<CaseFile[]> {
  const sources = await listStorySources();
  const ids = caseIdsFor(sources);
  return sortNewestFirst(sources).map((s) => toCaseFile(s, ids.get(s.slug) || "CASE-000"));
}
