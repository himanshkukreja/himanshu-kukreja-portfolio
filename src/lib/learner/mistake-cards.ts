import "server-only";
/**
 * Mistakes → spaced-review cards on the server (./mistake-cards-model.ts has the rules): syncMistakeCards(request,
 * userId) reads the learner's outcome log and DSA Mastery submits by the verified user id, loads the course content the
 * cards are built from, and adds at most the day's allowance of new cards to review_cards. Called by
 * POST /api/learn/review/mistakes, which the review badge's loader calls at most every half hour (lib/learn/useReviewDue.ts).
 *
 * The same rules as the outcome log (lib/learner/events.ts mayRecord): nothing with Global Privacy Control or the
 * analytics opt-out, or while memory is off. The cards hold only course content (the missed key point's text, the
 * rubric line, the lab's follow-up, the question and its right answer), never the learner's words.
 *
 * Source "mistake" needs supabase/migrations/20261112_review_cards_mistake_source.sql (NOT applied until the owner
 * approves). Until then the insert is refused by the source check, and the cards go in under source "interview" with
 * the same "mistake:" ref (the page shows them as mistake cards; the migration moves them to "mistake").
 */
import { supabase } from "@/lib/supabase";
import { getCatalogue } from "@/lib/concepts/load";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import { getLab } from "@/lib/learn/labs/load";
import { getWeekQuestions } from "@/lib/learn/arena/bank";
import { COURSE_ID } from "@/lib/learn/course";
import { privateRequest } from "@/lib/ai/chat/capture";
import { loadOutcomes, mayRecord } from "./events";
import { dsaIndex, dsaRows } from "./brief";
import { dsaRepeatedMistakes, mistakeCandidates, MISTAKE_CARDS_PER_DAY, MISTAKE_PREFIX, neededContent, pickNewCards, type MistakeCard, type MistakeContent } from "./mistake-cards-model";

const strip = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** The content the cards need, loaded once (every loader is cached), as the model's lookups. */
async function contentFor(need: ReturnType<typeof neededContent>): Promise<MistakeContent> {
  const sdmConcepts = need.concepts.filter((r) => !r.startsWith("dsa:"));
  const dsaConcepts = need.concepts.filter((r) => r.startsWith("dsa:")).map((r) => r.slice(4));
  const weeks = [...new Set(need.mcqs.map((id) => /^quiz:[^/]+\/([^/]+)\//.exec(id)?.[1] ?? /^trial:([^:]+):/.exec(id)?.[1] ?? "").filter(Boolean))];
  const [cat, dsa, mocks, labs, banks] = await Promise.all([
    sdmConcepts.length ? within(getCatalogue().then((c) => c.catalogue), 8000, null) : Promise.resolve(null),
    dsaConcepts.length ? import("@/lib/dsa/load").then(({ getConcept, conceptHref }) => Promise.all(dsaConcepts.map(async (id) => ({ id, href: conceptHref(id), page: await getConcept(id).catch(() => null) })))).catch(() => []) : Promise.resolve([]),
    Promise.all(need.mocks.map(async (slug) => [slug, await getMockInterview(slug).catch(() => null)] as const)),
    Promise.all(need.labs.map(async (id) => [id, await getLab(id).catch(() => null)] as const)),
    Promise.all(weeks.map((w) => within(getWeekQuestions(w), 8000, []))),
  ]);
  const concepts = new Map<string, ReturnType<MistakeContent["concept"]>>();
  for (const k of cat?.concepts ?? []) {
    if (!sdmConcepts.includes(k.id)) continue;
    const [week, slug] = (k.taught?.lesson ?? "").split("/");
    concepts.set(k.id, { term: k.term, points: [k.definition, ...k.refresher].filter(Boolean), ...(week && slug ? { week, slug, anchor: k.taught.anchor || undefined } : {}) });
  }
  for (const d of dsa) if (d.page) concepts.set(`dsa:${d.id}`, { term: d.page.title, points: [d.page.invariant, ...d.page.keyPoints].filter(Boolean), href: d.href });
  const mockMap = new Map(mocks);
  const labMap = new Map(labs);
  const bank = new Map(banks.flat().map((q) => [q.id, q]));
  return {
    concept: (ref) => concepts.get(ref) ?? null,
    mock: (slug) => {
      const m = mockMap.get(slug);
      if (!m) return null;
      return {
        code: m.code,
        title: m.title,
        phases: m.phases.map((p) => ({
          id: p.id,
          title: p.title,
          question: strip(p.prompts[0]?.text ?? p.prompts[0]?.html ?? ""),
          signals: p.rubric.map((s) => ({ id: s.id, text: s.text, ...(s.study[0] ? { study: { title: s.study[0].title, href: s.study[0].href } } : {}) })),
        })),
      };
    },
    lab: (id) => {
      const l = labMap.get(id);
      return l ? { title: l.title, href: `/labs/${l.id}`, followUps: l.followUps.map((f) => ({ q: strip(f.promptHtml) || f.title, a: strip(f.answerHtml) })) } : null;
    },
    mcq: (id) => {
      const q = bank.get(id) ?? [...bank.values()].find((x) => x.id.replace(/[^A-Za-z0-9:._/-]+/g, "_") === id);
      return q ? { prompt: q.prompt, answer: q.options[q.answer] ?? "", explain: q.explain, week: q.week, slug: q.slug, label: q.label } : null;
    },
  };
}

const DAY = 86_400_000;

/** The row for a card (back: the review queue's encoding of extras, lib/learn/review.ts encodeBack). */
function rowOf(userId: string, c: MistakeCard, source: string, due: string) {
  const detail = Object.fromEntries(Object.entries(c.detail).filter(([, v]) => v !== undefined && v !== ""));
  return {
    user_id: userId,
    source,
    source_ref: c.ref,
    course_id: c.course === "dsa" ? "dsa" : COURSE_ID,
    week: c.week ?? null,
    lesson_slug: c.lessonSlug ?? null,
    stage: c.stage ?? null,
    front: c.front,
    back: Object.keys(detail).length ? JSON.stringify({ hk: 1, a: c.back, d: detail }) : c.back,
    box: 1,
    due_at: due,
  };
}

export type MistakeSync = { added: number; skipped?: "private" | "off" | "full" | "none" };

export async function syncMistakeCards(request: Request | null, userId: string, now = Date.now()): Promise<MistakeSync> {
  if (request && privateRequest(request)) return { added: 0, skipped: "private" };
  if (!(await mayRecord(request, userId))) return { added: 0, skipped: "off" };
  // what's already in the queue (either source, while the migration is pending) and how many were made in the last day
  const { data: have, error } = await supabase.from("review_cards").select("source_ref, created_at").eq("user_id", userId).like("source_ref", `${MISTAKE_PREFIX}%`).limit(2000);
  if (error) return { added: 0, skipped: "none" };
  const existing = new Set((have ?? []).map((r) => (r as { source_ref: string }).source_ref));
  const madeToday = (have ?? []).filter((r) => now - Date.parse((r as { created_at: string }).created_at) < DAY).length;
  if (madeToday >= MISTAKE_CARDS_PER_DAY) return { added: 0, skipped: "full" };

  const [events, dsaHard] = await Promise.all([
    loadOutcomes(userId),
    Promise.all([dsaRows(userId), dsaIndex()])
      .then(([raw, ix]) => dsaRepeatedMistakes(raw, ix, now))
      .catch(() => []),
  ]);
  const need = neededContent(events, dsaHard, now);
  if (!need.concepts.length && !need.mocks.length && !need.labs.length && !need.mcqs.length) return { added: 0, skipped: "none" };
  const content = await contentFor(need);
  const picks = pickNewCards(mistakeCandidates(events, dsaHard, content, now), existing, madeToday);
  if (!picks.length) return { added: 0, skipped: "none" };
  // due at once in every time zone (yesterday's UTC date is "today or earlier" everywhere)
  const due = new Date(now - DAY).toISOString().slice(0, 10);
  const insert = (source: string) => supabase.from("review_cards").upsert(picks.map((c) => rowOf(userId, c, source, due)), { onConflict: "user_id,source,source_ref", ignoreDuplicates: true });
  let r = await insert("mistake");
  // the source check doesn't allow "mistake" yet (migration pending): the bridge source, the same "mistake:" refs
  if (r.error?.code === "23514") r = await insert("interview");
  if (r.error) {
    console.warn("[learner] mistake cards:", r.error.message);
    return { added: 0, skipped: "none" };
  }
  return { added: picks.length };
}
