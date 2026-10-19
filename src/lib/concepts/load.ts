import "server-only";
import { createHash } from "crypto";
import { unstable_cache } from "next/cache";
import { fetchMarkdownContent, isContentMissing } from "@/lib/github";
import { COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import type { CourseMap } from "@/lib/learn/types";
import type { TermsOpts } from "@/lib/course/terms";
import { buildTermIndex, CATALOGUE_PATH, parseCatalogue, type LessonLabels, type TermIndex } from "./catalogue";
import { DEFAULT_SETTINGS, type Catalogue } from "./match";

/**
 * The concept catalogue from the content repo (resources/concepts/concepts.yml), cached like the
 * course map (same tag, so /api/revalidate-courses refreshes both). A missing or broken file means
 * no hover terms and an empty mastery map, never a failed page.
 */
const EMPTY: Catalogue = { version: 1, settings: DEFAULT_SETTINGS, concepts: [] };

async function load(): Promise<{ catalogue: Catalogue; errors: string[]; hash: string }> {
  let text = "";
  try {
    text = await fetchMarkdownContent(CATALOGUE_PATH);
  } catch (e) {
    if (!isContentMissing(e)) throw e; // transient: keep serving the last good catalogue
    return { catalogue: EMPTY, errors: ["catalogue not found"], hash: "none" };
  }
  const { catalogue, errors } = parseCatalogue(text);
  if (errors.length) console.warn(`[concepts] ${errors.length} catalogue problem(s): ${errors.slice(0, 5).join(" | ")}`);
  return { catalogue, errors, hash: createHash("sha1").update(text).digest("hex").slice(0, 12) };
}

const cachedLoad = unstable_cache(load, ["concept-catalogue-v1"], { revalidate: 3600, tags: [COURSE_MAP_TAG] });

export async function getCatalogue(): Promise<{ catalogue: Catalogue; hash: string }> {
  try {
    const r = await cachedLoad();
    return { catalogue: r.catalogue, hash: r.hash };
  } catch {
    return { catalogue: EMPTY, hash: "none" };
  }
}

export function lessonLabels(map: CourseMap | null): LessonLabels {
  const out: LessonLabels = {};
  if (!map) return out;
  map.weeks.forEach((w) => {
    w.lessons.forEach((l) => (out[`${l.week}/${l.slug}`] = { title: l.title }));
    if (w.boss) out[`${w.boss.week}/${w.boss.slug}`] = { title: w.boss.title };
  });
  map.sideQuests.forEach((q) => (out[`${q.week}/${q.slug}`] = { title: q.title }));
  return out;
}

let memo: { key: string; index: TermIndex } | null = null;

/** The term index the renderer marks with (built once per catalogue version per server instance). */
export async function getTermIndex(): Promise<TermIndex | null> {
  const { catalogue, hash } = await getCatalogue();
  if (!catalogue.concepts.length) return null;
  const map = await getCourseMap().catch(() => null);
  const key = `${hash}:${map ? map.stats.coreLessons : 0}`;
  if (memo?.key !== key) memo = { key, index: buildTermIndex(catalogue, lessonLabels(map)) };
  return memo.index;
}

/** Renderer option for a page: `here` is "<week folder>/<slug>" for course lessons (absent for case files). */
export async function termsFor(here?: string): Promise<TermsOpts | undefined> {
  const index = await getTermIndex().catch(() => null);
  return index ? { index, ...(here ? { here } : {}) } : undefined;
}
