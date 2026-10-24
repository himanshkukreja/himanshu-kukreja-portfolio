import "server-only";
/**
 * Server: side-quest design sheets from the content repo (resources/design-sheets/<quest slug>.md):
 * the whole design of a side quest on a few printable pages (numbers, architecture, UML flows, data
 * model, lifecycle, decisions, failure modes, interview lines). Same GitHub / SDM_LOCAL_DIR layer and
 * course renderer as the lessons, so diagrams get the same Mermaid figures and icons. Cached like the
 * course map (tag "course-map"); a missing folder or a broken file just means fewer sheets.
 */
import { createHash } from "crypto";
import { unstable_cache } from "next/cache";
import { fetchGitHubContent, fetchMarkdownContent, isContentMissing, ContentFetchError } from "@/lib/github";
import { renderLesson } from "@/lib/course/render";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import type { CourseLesson } from "@/lib/learn/types";

export const SHEETS_DIR = "resources/design-sheets";
const FILE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export type SheetSummary = {
  /** the side quest's slug, also the sheet's URL segment */
  slug: string;
  /** "India's UPI" (the quest's title) */
  title: string;
  /** the one-line blockquote under the H1 */
  summary: string;
  /** "SQ-01" */
  code: string;
  href: string;
  quest: { href: string; minutes: number };
  diagrams: number;
  /** section headings, in order (for the contents row) */
  sections: { id: string; title: string }[];
  version: string;
};

export type DesignSheet = SheetSummary & { html: string };

type Built = { summaries: SheetSummary[]; sheets: Record<string, DesignSheet> };

export const sheetHref = (slug: string) => `/learn/sheets/${slug}`;

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

/** The H1 and the lede blockquote become the page header, so they are taken out of the body. */
function split(md: string): { summary: string; body: string } {
  let body = md.replace(/^﻿?\s*#\s+[^\n]*\n/, "");
  let summary = "";
  const lede = body.match(/^\s*>\s?([^\n]+(?:\n>\s?[^\n]+)*)\n/);
  if (lede) {
    summary = lede[1].replace(/\n>\s?/g, " ").trim();
    body = body.slice(lede[0].length);
  }
  return { summary, body };
}

async function render(md: string): Promise<string> {
  const r = await renderLesson(md, { kind: "day-content" });
  return r.html
    .replace(/<header class="sd-stage-head"[\s\S]*?<\/header>/g, "")
    .replace(/<section data-sd="stage"[^>]*>/g, "")
    .replace(/<\/section>\s*$/g, "");
}

async function build(): Promise<Built> {
  let files: { name: string; path: string; type: string }[] = [];
  try {
    files = await fetchGitHubContent(SHEETS_DIR);
  } catch (e) {
    if (isContentMissing(e)) return { summaries: [], sheets: {} };
    throw e; // transient (rate limit, 5xx): never cache an empty list
  }
  const map = await getCourseMap(COURSE_ID);
  const quests = new Map<string, CourseLesson>((map?.sideQuests ?? []).map((q) => [q.slug, q]));
  const picked = files.filter((f) => f.type === "file" && FILE_RE.test(f.name) && f.name.toLowerCase() !== "readme.md");
  const out = await Promise.all(
    picked.map(async (f): Promise<DesignSheet | null> => {
      const slug = f.name.replace(/\.md$/, "");
      const q = quests.get(slug);
      if (!q) return null; // a sheet ships with its quest, never before it
      try {
        const md = await fetchMarkdownContent(f.path);
        const { summary, body } = split(md);
        const html = await render(body);
        // the renderer turns a "##" heading into <h3 class="sd-h sd-h2"> (the lesson's h2 is its stage)
        const sections = [...html.matchAll(/<h3 id="([^"]+)" class="sd-h sd-h2">([\s\S]*?)<\/h3>/g)].map((m) => ({
          id: m[1],
          title: decode(m[2].replace(/<a class="sd-anchor"[\s\S]*?<\/a>/g, "")),
        }));
        return {
          slug,
          title: q.title,
          summary,
          code: q.code,
          href: sheetHref(slug),
          quest: { href: q.href, minutes: q.minutes },
          diagrams: (html.match(/<figure[^>]*class="[^"]*\bsd-mermaid\b/g) || []).length,
          sections,
          version: createHash("sha1").update(md).digest("hex").slice(0, 10),
          html,
        };
      } catch (e) {
        if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
        if (process.env.NODE_ENV !== "production") console.warn(`[sheets] ${f.name}: ${(e as Error).message}`);
        return null;
      }
    })
  );
  const order = [...quests.keys()];
  const list = out.filter((s): s is DesignSheet => !!s).sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  return {
    summaries: list.map(({ html: _html, ...s }) => (void _html, s)),
    sheets: Object.fromEntries(list.map((s) => [s.slug, s])),
  };
}

const cached = unstable_cache(() => build(), ["design-sheets-v1"], { revalidate: 3600, tags: [COURSE_MAP_TAG] });

async function data(): Promise<Built> {
  try {
    // local content (SDM_LOCAL_DIR) is read fresh in development so edits show up on reload
    return process.env.SDM_LOCAL_DIR && process.env.NODE_ENV !== "production" ? await build() : await cached();
  } catch (e) {
    console.error("[sheets] failed to load", e);
    return { summaries: [], sheets: {} };
  }
}

export async function getSheetSummaries(): Promise<SheetSummary[]> {
  return (await data()).summaries;
}

export async function getSheet(slug: string): Promise<DesignSheet | null> {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  return (await data()).sheets[slug] ?? null;
}
