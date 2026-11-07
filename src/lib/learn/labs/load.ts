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
import { countTests, labTestCounts, parseLab } from "./parse";
import { PYODIDE_VERSION, WORKER_REV } from "./runtime";
import { familyOf, labHref, type Lab, type LabLang, type LabLangView, type LabLesson, type LabSource, type LabSrc, type LabSummary, type LessonLabLink } from "./types";

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

const FENCE: Record<LabLang, string> = { python: "python", javascript: "js", typescript: "ts" };
const srcFence = (s: LabSrc | null, lang: LabLang) => (s ? (lang === "python" ? "python" : s.ts ? "ts" : "js") : "python");

type Prepared = { sources: LabSource[]; summaries: LabSummary[] };

/** Every lab's source and summary (no rendered HTML): small enough to cache as one entry. */
async function prepare(): Promise<Prepared> {
  const [map, all] = await Promise.all([getCourseMap(COURSE_ID), loadLabSources()]);
  const ctx: MockCtx = { weeks: map?.weeks ?? [], sideQuests: map?.sideQuests ?? [] };
  const seen = new Set<string>();
  const sources: LabSource[] = [];
  const summaries: LabSummary[] = [];
  for (const s of all) {
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
      type: s.type,
      week: s.week,
      weekCode: pad(s.week),
      weekKey: week?.key ?? null,
      worldTitle: week?.title ?? `Week ${s.week}`,
      order: s.order,
      difficulty: s.difficulty,
      minutes: s.minutes,
      interviewMinutes: s.interviewMinutes,
      xp: s.xp,
      summary: s.summary,
      href: labHref(s.id),
      lessons,
      languages: s.languages,
      paths: s.paths,
      tests: labTestCounts(s),
      features: { stages: s.stages.length, followUps: s.followUps.length, viz: s.viz?.view ?? null, chaos: !!s.chaos, scale: !!s.scale },
      // a runtime upgrade is a new version too, so saved copies refresh with it
      version: `${s.version}-${PYODIDE_VERSION}-${WORKER_REV}`,
    };
    sources.push(s);
    summaries.push(summary);
  }
  return { sources, summaries };
}

/** One lab, rendered (brief, hints, code in every language): a few hundred KB, cached per lab. */
async function renderLab(s: LabSource, summary: LabSummary): Promise<Lab> {
  const fence = (code: string, lang: string) => (code.trim() ? blockHtml("```" + lang + "\n" + code.replace(/\s+$/, "") + "\n```") : Promise.resolve(""));
  const langs: Partial<Record<LabLang, LabLangView>> = {};
  for (const lang of s.languages) {
    const fam = familyOf(lang);
    const fc = s.family[fam];
    const lc = s.code[lang]!;
    const [solutionHtml, givenHtml, visibleTestsHtml, reproHtml, stageHtml] = await Promise.all([
      fence(lc.solution, FENCE[lang]),
      fence(fc?.given?.code ?? "", srcFence(fc?.given ?? null, lang)),
      fence(fc?.visible?.code ?? "", srcFence(fc?.visible ?? null, lang)),
      fence(fc?.repro?.code ?? "", srcFence(fc?.repro ?? null, lang)),
      Promise.all(s.stages.map((st) => fence(st.family[fam]?.visible?.code ?? "", srcFence(st.family[fam]?.visible ?? null, lang)))),
    ]);
    langs[lang] = {
      lang,
      starter: lc.starter,
      solution: lc.solution,
      solutionHtml,
      given: fc?.given ?? null,
      givenHtml,
      visible: fc?.visible ?? null,
      visibleTestsHtml,
      hidden: fc?.hidden ?? null,
      repro: fc?.repro ?? null,
      reproHtml,
      chaos: fc?.chaos ?? null,
      scale: fc?.scale ?? null,
      tests: { visible: countTests(fc?.visible, fam), hidden: countTests(fc?.hidden, fam), repro: countTests(fc?.repro, fam) },
      stages: s.stages.map((st, i) => ({
        delta: st.lang[lang]?.delta ?? "",
        solution: st.lang[lang]?.solution ?? "",
        visible: st.family[fam]?.visible ?? null,
        hidden: st.family[fam]?.hidden ?? null,
        visibleTestsHtml: stageHtml[i],
        tests: { visible: countTests(st.family[fam]?.visible, fam), hidden: countTests(st.family[fam]?.hidden, fam) },
      })),
      followUps: s.followUps.map((f) => ({ tests: f.tests[fam] ?? null, count: countTests(f.tests[fam], fam) })),
    };
  }
  const html = (md: string) => blockHtml(md);
  const hintsHtml = (hs: { title: string; md: string }[]) => Promise.all(hs.map(async (h) => ({ title: h.title, html: await blockHtml(h.md) })));
  const [briefHtml, solutionNotesHtml, hints, stages, followUps, incident] = await Promise.all([
    html(s.brief),
    html(s.solutionNotes),
    hintsHtml(s.hints),
    Promise.all(s.stages.map(async (st) => ({ title: st.title, briefHtml: await html(st.brief), hints: await hintsHtml(st.hints) }))),
    Promise.all(s.followUps.map(async (f) => ({ title: f.title, promptHtml: await html(f.prompt), answerHtml: await html(f.answer) }))),
    s.incident ? Promise.all([html(s.incident.report), html(s.incident.story)]).then(([reportHtml, storyHtml]) => ({ reportHtml, storyHtml })) : Promise.resolve(null),
  ]);
  return {
    ...summary,
    briefHtml,
    hints,
    solutionNotesHtml,
    timeoutSec: s.timeoutSec,
    langs,
    stages,
    followUps,
    incident,
    viz: s.viz,
    chaos: s.chaos,
    scale: s.scale,
  };
}

// Cached in pieces: the summaries (every lesson page's "Try it in code" card reads them) and one entry per
// lab. All 30 labs rendered together were ~13 MB, over the 2 MB data cache item limit, so the whole set was
// re-rendered on every uncached lab or lesson page (~24 s / ~12 s on Vercel, Nov 2026).
const cachedPrepared = unstable_cache(async () => {
  const p = await prepare();
  return { summaries: p.summaries };
}, ["code-labs-v2-summaries"], { revalidate: 604800, tags: [COURSE_MAP_TAG] });

const cachedLab = unstable_cache(
  async (id: string) => {
    const p = await prepare();
    const i = p.sources.findIndex((x) => x.id === id);
    return i < 0 ? null : renderLab(p.sources[i], p.summaries[i]);
  },
  ["code-labs-v2-lab"],
  { revalidate: 604800, tags: [COURSE_MAP_TAG] }
);

// local content (SDM_LOCAL_DIR) is read fresh in development so edits show up on reload
const fresh = () => !!process.env.SDM_LOCAL_DIR && process.env.NODE_ENV !== "production";

async function summariesData(): Promise<LabSummary[]> {
  try {
    return fresh() ? (await prepare()).summaries : (await cachedPrepared()).summaries;
  } catch (e) {
    console.error("[labs] failed to load", e);
    return [];
  }
}

export async function getLabSummaries(): Promise<LabSummary[]> {
  return summariesData();
}

export async function getLab(id: string): Promise<Lab | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) return null;
  try {
    if (!fresh()) return await cachedLab(id);
    const p = await prepare();
    const i = p.sources.findIndex((x) => x.id === id);
    return i < 0 ? null : await renderLab(p.sources[i], p.summaries[i]);
  } catch (e) {
    console.error("[labs] failed to load", id, e);
    return null;
  }
}

/** Labs that practise a lesson (its "Try it in code" card), by the lesson's path. */
export async function getLabsForLesson(course: string, week: string, slug: string): Promise<LessonLabLink[]> {
  const base = `/${week}/${slug}`;
  return (await summariesData())
    .filter((s) => s.lessons.some((l) => l.href === base || l.href.startsWith(`${base}#`)))
    .map(({ id, title, topic, summary, href, difficulty, minutes, xp, tests, languages, type }) => ({ id, title, topic, summary, href, difficulty, minutes, xp, tests, languages, type }));
}
