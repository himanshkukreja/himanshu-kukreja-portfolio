import "server-only";
import matter from "gray-matter";
import { unstable_cache } from "next/cache";
import { DSA_CONTENT_TAG, dsaFresh, readDsa, dsaItem, dsaItemKey } from "./content";
import { getConceptIndex, lessonDir, lessonHref } from "./load";
import { parseExercise } from "./exercises";
import { fencesOf, hash32, parseQuizFence, plainLine, firstSentences, type WarmQ } from "./warmup";

/**
 * The warm-up question pools (server): the quiz questions and predict exercises of a lesson, read from its lesson.md and
 * never written here. One lesson's questions are cached with the DSA content (tag dsa-content; fresh on every read in
 * development with DSA_LOCAL_DIR). GET /api/dsa/warmup assembles the tiers; the browser picks (src/lib/dsa/warmup.ts).
 */

const TOOLKIT = "m0-toolkit";

async function loadOne(id: string): Promise<WarmQ[]> {
  const concept = (await getConceptIndex()).find((c) => c.id === id && c.status === "built");
  if (!concept) return [];
  const md = await readDsa(`${lessonDir(concept)}/lesson.md`);
  if (!md) return [];
  const { data, content } = matter(md, {});
  const meta = { concept: id, lesson: String((data as { title?: string }).title || concept.title), href: lessonHref(concept) };
  const out = fencesOf(content, "quiz").flatMap((f) => parseQuizFence(f, meta));
  // predict exercises in choices mode (an exact-answer one needs a text box: not a 30-second tap)
  for (const f of fencesOf(content, "predict")) {
    const r = parseExercise("predict", f);
    if (!r.ok || r.ex.kind !== "predict" || r.ex.mode !== "choices") continue;
    const code = r.ex.code.python ?? Object.values(r.ex.code)[0];
    const answer = r.ex.choices.findIndex((c) => c.correct);
    const why = firstSentences(plainLine(r.ex.explain.join(" ")));
    if (!code || answer < 0 || !why) continue;
    out.push({ id: `${id}:${hash32(r.ex.question).toString(36)}`, ...meta, kind: "predict", question: plainLine(r.ex.question), code, options: r.ex.choices.map((c) => plainLine(c.text)), answer, why });
  }
  return out;
}

const cachedOne = unstable_cache(dsaItem(loadOne), ["dsa-warmup-v1", dsaItemKey(loadOne)], { revalidate: 604800, tags: [DSA_CONTENT_TAG] });
const questionsOf = (id: string): Promise<WarmQ[]> => (dsaFresh() ? loadOne(id) : cachedOne(id));

const many = async (ids: string[]) => (await Promise.all([...new Set(ids)].map((id) => questionsOf(id).catch(() => [] as WarmQ[])))).flat();

/** The three tiers for a learner: their recent lessons, the lessons of their station, the Toolkit (always sent: it is the new-learner fallback). */
export async function getWarmupTiers(recent: string[], station: string[]): Promise<WarmQ[][]> {
  const index = await getConceptIndex();
  const toolkit = index.filter((c) => c.module === TOOLKIT && c.status === "built").map((c) => c.id);
  return Promise.all([many(recent), many(station), many(toolkit)]);
}
