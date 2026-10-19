import "server-only";
/**
 * Server: code labs from the content repo (resources/labs/*.md) through the same GitHub /
 * SDM_LOCAL_DIR layer as lessons, rendered for the lab pages, the labs index, the lessons'
 * "Try it in code" cards and the offline catalog. Cached like the course map (Next data cache, tag
 * "course-map", 5 min). A missing folder or a broken file never breaks a page: it just means fewer
 * labs (broken files are logged in development).
 */
import { unstable_cache } from "next/cache";
import { fetchGitHubContent, fetchMarkdownContent, isContentMissing, ContentFetchError } from "@/lib/github";
import { renderLesson } from "@/lib/course/render";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import { resolveStudy, type MockCtx } from "@/lib/learn/mock/load";
import { labTestCounts, parseLab } from "./parse";
import { PYODIDE_VERSION, WORKER_REV } from "./runtime";
import { labHref, type Lab, type LabLesson, type LabSource, type LabSummary, type LessonLabLink } from "./types";

export const LABS_DIR = "resources/labs";
const FILE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** Every lab file that parses, in course order. Never throws. */
export async function loadLabSources(): Promise<LabSource[]> {
  let files: { name: string; path: string; type: string }[] = [];
  try {
    files = await fetchGitHubContent(LABS_DIR);
  } catch (e) {
    if (isContentMissing(e)) return [];
    throw e; // transient (rate limit, 5xx): never cache an empty lab list
  }
  const picked = files.filter((f) => f.type === "file" && FILE_RE.test(f.name) && f.name.toLowerCase() !== "readme.md");
  const out = await Promise.all(
    picked.map(async (f) => {
      try {
        return parseLab(await fetchMarkdownContent(f.path), f.name);
      } catch (e) {
        if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
        if (process.env.NODE_ENV !== "production") console.warn(`[labs] ${f.name}: ${(e as Error).message}`);
        return null;
      }
    })
  );
  return out.filter((x): x is LabSource => !!x).sort((a, b) => a.week - b.week || a.order - b.order || a.id.localeCompare(b.id));
}

/** Course renderer output without the stage wrapper (same as the mock interviews' blocks). */
async function blockHtml(md: string): Promise<string> {
  if (!md.trim()) return "";
  const r = await renderLesson(md, { kind: "day-content" });
  return r.html
    .replace(/<header class="sd-stage-head"[\s\S]*?<\/header>/g, "")
    .replace(/<section data-sd="stage"[^>]*>/g, "")
    .replace(/<\/section>\s*$/g, "");
}

const pad = (n: number) => String(n).padStart(2, "0");

type Built = { summaries: LabSummary[]; labs: Record<string, Lab> };

async function build(): Promise<Built> {
  const [map, sources] = await Promise.all([getCourseMap(COURSE_ID), loadLabSources()]);
  const ctx: MockCtx = { weeks: map?.weeks ?? [], sideQuests: map?.sideQuests ?? [] };
  const seen = new Set<string>();
  const summaries: LabSummary[] = [];
  const labs: Record<string, Lab> = {};
  for (const s of sources) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const week = map?.weeks.find((w) => w.num === s.week) ?? null;
    const lessons: LabLesson[] = s.lessons
      .map((l) => {
        const r = resolveStudy(l.ref, ctx);
        return r ? { code: r.code, title: r.title, href: l.anchor ? `${r.href}#${l.anchor}` : r.href, label: l.label ?? null } : null;
      })
      .filter((l): l is LabLesson => !!l);
    const summary: LabSummary = {
      id: s.id,
      title: s.title,
      topic: s.topic,
      week: s.week,
      weekCode: pad(s.week),
      weekKey: week?.key ?? null,
      worldTitle: week?.title ?? `Week ${s.week}`,
      order: s.order,
      difficulty: s.difficulty,
      minutes: s.minutes,
      xp: s.xp,
      summary: s.summary,
      href: labHref(s.id),
      lessons,
      tests: labTestCounts(s),
      // a runtime upgrade is a new version too, so saved copies refresh with it
      version: `${s.version}-${PYODIDE_VERSION}-${WORKER_REV}`,
    };
    summaries.push(summary);
    const fence = (code: string) => (code.trim() ? blockHtml("```python\n" + code.replace(/\s+$/, "") + "\n```") : Promise.resolve(""));
    const [briefHtml, solutionNotesHtml, hints, givenHtml, visibleTestsHtml, solutionHtml] = await Promise.all([
      blockHtml(s.brief),
      blockHtml(s.solutionNotes),
      Promise.all(s.hints.map(async (h) => ({ title: h.title, html: await blockHtml(h.md) }))),
      fence(s.given),
      fence(s.visible),
      fence(s.solution),
    ]);
    labs[s.id] = {
      ...summary,
      briefHtml,
      givenHtml,
      visibleTestsHtml,
      solutionHtml,
      given: s.given,
      starter: s.starter,
      hints,
      solution: s.solution,
      solutionNotesHtml,
      visibleTests: s.visible,
      hiddenTests: s.hidden,
      timeoutSec: s.timeoutSec,
    };
  }
  return { summaries, labs };
}

const cached = unstable_cache(() => build(), ["code-labs-v1"], { revalidate: 3600, tags: [COURSE_MAP_TAG] });

async function data(): Promise<Built> {
  try {
    // local content (SDM_LOCAL_DIR) is read fresh in development so edits show up on reload
    return process.env.SDM_LOCAL_DIR && process.env.NODE_ENV !== "production" ? await build() : await cached();
  } catch (e) {
    console.error("[labs] failed to load", e);
    return { summaries: [], labs: {} };
  }
}

export async function getLabSummaries(): Promise<LabSummary[]> {
  return (await data()).summaries;
}

export async function getLab(id: string): Promise<Lab | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) return null;
  return (await data()).labs[id] ?? null;
}

/** Labs that practise a lesson (its "Try it in code" card), by the lesson's path. */
export async function getLabsForLesson(course: string, week: string, slug: string): Promise<LessonLabLink[]> {
  const base = `/learn/${course}/${week}/${slug}`;
  return (await data()).summaries
    .filter((s) => s.lessons.some((l) => l.href === base || l.href.startsWith(`${base}#`)))
    .map(({ id, title, topic, summary, href, difficulty, minutes, xp, tests }) => ({ id, title, topic, summary, href, difficulty, minutes, xp, tests }));
}
