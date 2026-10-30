import "server-only";
/**
 * Server: written papers from the content repo (resources/papers/<key>.md), through the same GitHub / SDM_LOCAL_DIR
 * layer as the lessons, parsed strictly (parse.ts), with their question and model-answer Markdown rendered to HTML and
 * their sources resolved to lesson titles and deep links. Cached like the course map (1 h, tag "course-map", so POST
 * /api/revalidate-courses refreshes it with the course); pages that use it are ISR.
 *
 * Release: production reads resources/papers only. Development also reads resources/papers-next (the staging copy,
 * winning over papers/), so unreleased papers can be tried locally before they ship.
 *
 * A paper shows only when its week or side quest is in the course map; a broken file is left out (and the reason is
 * logged in development), never shown half-parsed.
 */
import { createHash } from "crypto";
import { unstable_cache } from "next/cache";
import { ContentFetchError, fetchGitHubContent, fetchMarkdownContent, isContentMissing } from "@/lib/github";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import type { CourseLesson, CourseMap } from "@/lib/learn/types";
import { PAPER_KEY_RE, parsePaper, sourceHref, type PaperKind, type ParsedPaper } from "./parse";
import type { PaperSummary, PaperView } from "./types";

export const PAPERS_DIR = "resources/papers";
const NEXT_DIR = "resources/papers-next";
const DEV = process.env.NODE_ENV !== "production";

async function md2html(md: string): Promise<string> {
  const { unified } = await import("unified");
  const remarkParse = (await import("remark-parse")).default;
  const remarkGfm = (await import("remark-gfm")).default;
  const remarkRehype = (await import("remark-rehype")).default;
  const rehypeStringify = (await import("rehype-stringify")).default;
  // raw HTML in the Markdown is dropped (remark-rehype's default): the content is text, tables and code only
  const file = await unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify).process(md);
  return String(file);
}

/** Markdown as one line of plain text (review cards, the grader's context). */
const plain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`>#|]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A readable name for a section anchor (the renderer's ids): "s-2-3-pattern-3-write-through" → "2.3 Pattern 3 write
 * through", "cp-who-fetches-on-a-miss" → "Checkpoint: who fetches on a miss", "phase-3" → "Phase 3".
 */
function sectionLabel(anchor: string): string {
  if (!anchor) return "";
  let a = anchor;
  let pre = "";
  if (a.startsWith("cp-")) {
    pre = "Checkpoint: ";
    a = a.slice(3);
  } else if (/^(s|ch)-\d/.test(a)) a = a.replace(/^(s|ch)-/, "");
  const num = a.match(/^(\d+(?:-\d+)*)-(?=[a-z])/);
  const head = num ? `${num[1].replace(/-/g, ".")} ` : "";
  const words = (num ? a.slice(num[0].length) : a).replace(/-/g, " ").trim();
  const text = `${head}${words}`;
  return pre ? `${pre}${text}` : text.charAt(0).toUpperCase() + text.slice(1);
}

async function listDir(dir: string): Promise<{ name: string; path: string }[]> {
  try {
    return (await fetchGitHubContent(dir)).filter((f) => f.type === "file" && f.name.endsWith(".md") && f.name.toLowerCase() !== "readme.md");
  } catch (e) {
    if (isContentMissing(e)) return [];
    throw e; // transient (rate limit, 5xx): never cache an empty list
  }
}

type Owner = { kind: "week" | "quest"; code: string; label: string; title: string; href: string; order: number; week: string };

function owners(map: CourseMap): Map<string, Owner> {
  const out = new Map<string, Owner>();
  map.weeks.forEach((w) => {
    const first = w.lessons[0];
    out.set(w.key, { kind: "week", code: `W${w.code}`, label: `Week ${w.code} · ${w.title}`, title: w.title, href: first?.href ?? `/learn/${map.courseId}`, order: w.num, week: w.key });
  });
  map.sideQuests.forEach((q, i) => {
    out.set(q.slug, { kind: "quest", code: q.code, label: `${q.code} · ${q.title}`, title: q.title, href: q.href, order: 1000 + i, week: q.week });
  });
  return out;
}

function lessonIndex(map: CourseMap): Map<string, CourseLesson> {
  const all = [...map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]), ...map.sideQuests, ...(map.problems ?? []), ...(map.lld ?? [])];
  return new Map(all.map((l) => [`${l.week}/${l.slug}`, l]));
}

async function buildView(p: ParsedPaper, owner: Owner, lessons: Map<string, CourseLesson>, raw: string): Promise<PaperView> {
  const questions = await Promise.all(
    p.questions.map(async (q) => ({
      n: q.n,
      marks: q.marks,
      kind: q.kind,
      promptHtml: await md2html(q.prompt),
      promptText: plain(q.prompt).slice(0, 600),
      answerHtml: await md2html(q.answer),
      scheme: q.scheme,
      sources: q.sources
        .filter((s, k, all) => all.findIndex((x) => x.week === s.week && x.slug === s.slug && x.anchor === s.anchor) === k)
        .map((s) => {
          const l = lessons.get(`${s.week}/${s.slug}`);
          const lesson = l ? (l.kind === "bonus" ? l.title : `${l.tag.replace(/ · /g, " ")} · ${l.title}`) : `${s.week}/${s.slug}`;
          const section = sectionLabel(s.anchor);
          return { href: sourceHref(COURSE_ID, s), label: section ? `${lesson} · ${section}` : lesson, anchor: s.anchor };
        }),
    }))
  );
  const kinds: Partial<Record<PaperKind, number>> = {};
  p.questions.forEach((q) => (kinds[q.kind] = (kinds[q.kind] || 0) + 1));
  return {
    key: p.key,
    title: p.title,
    minutes: p.minutes,
    marks: p.marks,
    kind: owner.kind,
    code: owner.code,
    label: owner.label,
    ownerTitle: owner.title,
    ownerHref: owner.href,
    week: owner.week,
    order: owner.order,
    href: `/learn/papers/${p.key}`,
    kinds,
    version: createHash("sha1").update(raw).digest("hex").slice(0, 10),
    questions,
  };
}

type Built = { summaries: PaperSummary[]; papers: Record<string, PaperView>; parsed: Record<string, ParsedPaper> };

async function build(): Promise<Built> {
  const map = await getCourseMap(COURSE_ID);
  if (!map) return { summaries: [], papers: {}, parsed: {} };
  const own = owners(map);
  const lessons = lessonIndex(map);
  // papers-next wins in development (the newer, unreleased copy)
  const files = new Map<string, string>();
  for (const f of await listDir(PAPERS_DIR)) files.set(f.name.replace(/\.md$/, ""), f.path);
  if (DEV) for (const f of await listDir(NEXT_DIR)) files.set(f.name.replace(/\.md$/, ""), f.path);

  const parsed: Record<string, ParsedPaper> = {};
  const views = await Promise.all(
    [...files.entries()].map(async ([key, path]): Promise<PaperView | null> => {
      if (!PAPER_KEY_RE.test(key)) return null;
      const owner = own.get(key);
      if (!owner) return null; // a paper ships with its week or quest, never before it
      try {
        const raw = await fetchMarkdownContent(path);
        const r = parsePaper(raw, key);
        if (!r.ok) {
          if (DEV) console.warn(`[papers] ${key} left out:\n  ${r.errors.join("\n  ")}`);
          return null;
        }
        parsed[key] = r.paper;
        return await buildView(r.paper, owner, lessons, raw);
      } catch (e) {
        if (e instanceof ContentFetchError && !isContentMissing(e)) throw e;
        if (DEV) console.warn(`[papers] ${key}: ${(e as Error).message}`);
        return null;
      }
    })
  );
  const list = views.filter((v): v is PaperView => !!v).sort((a, b) => a.order - b.order);
  return {
    summaries: list.map(({ questions, ...s }) => ({ ...s, questions: questions.length })),
    papers: Object.fromEntries(list.map((p) => [p.key, p])),
    parsed: Object.fromEntries(list.map((p) => [p.key, parsed[p.key]])),
  };
}

const cached = unstable_cache(() => build(), ["written-papers-v1"], { revalidate: 3600, tags: [COURSE_MAP_TAG] });

async function data(): Promise<Built> {
  try {
    // local content (SDM_LOCAL_DIR) is read fresh in development so edits show up on reload
    return process.env.SDM_LOCAL_DIR && DEV ? await build() : await cached();
  } catch (e) {
    console.error("[papers] failed to load", e);
    return { summaries: [], papers: {}, parsed: {} };
  }
}

export async function getPaperSummaries(): Promise<PaperSummary[]> {
  return (await data()).summaries;
}

export async function getPaper(key: string): Promise<PaperView | null> {
  if (!PAPER_KEY_RE.test(key) || key.length > 120) return null;
  return (await data()).papers[key] ?? null;
}

/** The paper as written (Markdown question and model answer, the scheme): what the grader reads. */
export async function getParsedPaper(key: string): Promise<{ paper: ParsedPaper; title: string } | null> {
  if (!PAPER_KEY_RE.test(key) || key.length > 120) return null;
  const d = await data();
  const p = d.parsed[key];
  return p ? { paper: p, title: d.papers[key]?.title ?? p.title } : null;
}
