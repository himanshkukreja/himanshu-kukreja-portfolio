import "server-only";
/**
 * One learner model for both courses (the AI audit's §7, 12 Nov 2026), read on the server by the verified user id:
 *
 *   dsaRows(userId)        the learner's DSA records, one read for everything a DSA tutor message needs (the unlock rule
 *                          in lib/dsa/ai/unlock.ts and the profile here), kept a minute per learner and isolate
 *   learnerBrief(userId, { course, feature, ref, client })
 *                          at most six lines for the learner's turn (./brief-model.ts): level, language and how they like
 *                          answers; their record and habits; the struggles relevant to `ref`; recurring mistakes; where
 *                          they left off; one link to the other course when it helps. Plus up to four "adapt" lines
 *                          (how to fit this answer: a beginner's analogy first, an experienced learner's terse answer, the
 *                          editorial habit, a known weak spot). Memory switched off: only what the learner set on the page
 *                          (language, level).
 *
 * Only `course: "dsa"` is built so far; the course chat still reads its own snapshot and memory lines (lib/ai/chat), and
 * can move onto this reader later.
 */
import { supabase } from "@/lib/supabase";
import { dsaNotes, untag, type DsaNotes } from "@/lib/ai/chat/memory-model";
import { loadMemory, type MemoryState } from "@/lib/ai/chat/server";
import { getConceptIndex, getProblemIndex } from "@/lib/dsa/load";
import { DSA_COURSE_ID } from "@/lib/dsa/types";
import { ONBOARDING_FLAG } from "@/lib/dsa/onboarding/recommend";
import { dsaAdaptLines, dsaBriefLines, learnerTurnBlock, type BriefRef } from "./brief-model";
import { buildDsaProfile, problemFacts, type DsaClientSignals, type DsaIndex, type DsaLearnerRaw, type DsaProfile } from "./dsa-profile";

/* ------------------------------------------------------------------ the rows */

const rowsCache = new Map<string, { at: number; p: Promise<DsaLearnerRaw> }>();

export function forgetDsaRows(userId: string) {
  rowsCache.delete(userId);
}

/** A missing table (a migration not applied) or a failed read counts as no rows. */
export function dsaRows(userId: string): Promise<DsaLearnerRaw> {
  const hit = rowsCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async (): Promise<DsaLearnerRaw> => {
    const [prof, lp, subs, prog] = await Promise.all([
      supabase.from("user_profiles").select("game_done, game_flags").eq("id", userId).maybeSingle(),
      supabase.from("learning_progress").select("week, lesson_slug, status").eq("user_id", userId).eq("course_id", DSA_COURSE_ID).limit(5000),
      supabase.from("dsa_submissions").select("problem_id, language, verdict, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5000),
      supabase.from("dsa_problem_progress").select("problem_id, status, editorial_viewed, updated_at").eq("user_id", userId).limit(5000),
    ]);
    const row = (prof.error ? null : prof.data) as { game_done?: Record<string, number> | null; game_flags?: Record<string, unknown> | null } | null;
    const onb = row?.game_flags?.[ONBOARDING_FLAG];
    return {
      done: (row?.game_done && typeof row.game_done === "object" ? row.game_done : {}) as Record<string, number>,
      onboarding: onb && typeof onb === "object" ? (onb as DsaLearnerRaw["onboarding"]) : null,
      rows: (lp.error ? [] : (lp.data ?? [])) as DsaLearnerRaw["rows"],
      subs: (subs.error ? [] : (subs.data ?? [])) as DsaLearnerRaw["subs"],
      prog: (prog.error ? [] : (prog.data ?? [])) as DsaLearnerRaw["prog"],
    };
  })();
  rowsCache.set(userId, { at: Date.now(), p });
  if (rowsCache.size > 500) rowsCache.delete(rowsCache.keys().next().value as string);
  p.catch(() => rowsCache.delete(userId));
  return p;
}

/* ------------------------------------------------------------------ the index (titles, concepts, modules) */

let ixMemo: { at: number; p: Promise<DsaIndex & { modules: Map<string, string> }> } | null = null;
/** Problem titles, concepts and modules, kept ten minutes (also the course chat's DSA digest: lib/ai/chat/server.ts). */
export function dsaIndex(): Promise<DsaIndex & { modules: Map<string, string> }> {
  if (ixMemo && Date.now() - ixMemo.at < 10 * 60_000) return ixMemo.p;
  const p = Promise.all([getProblemIndex().catch(() => []), getConceptIndex().catch(() => [])]).then(([ps, cs]) => ({
    problems: new Map(ps.map((x) => [x.id, { title: x.title, concept: x.concept, level: x.level }])),
    concepts: new Map(cs.map((x) => [x.id, x.title])),
    modules: new Map([...cs.map((x) => [x.id, x.module] as const), ...ps.map((x) => [`p:${x.id}`, x.module] as const)]),
  }));
  ixMemo = { at: Date.now(), p };
  p.catch(() => (ixMemo = null));
  return p;
}

/* ------------------------------------------------------------------ the brief */

export type LearnerBrief = {
  /** the <learner> block for the learner's turn ("" when nothing is known) */
  text: string;
  lines: string[];
  /** how to adapt this answer (directives) */
  adapt: string[];
  /** the ref problem's record (failed submits, solved, revealed): the tutor needs it whatever the memory switch says */
  facts: ReturnType<typeof problemFacts> | null;
  profile: DsaProfile | null;
  notes: DsaNotes | null;
  memory: Pick<MemoryState, "available" | "paused">;
};

export async function learnerBrief(
  userId: string,
  o: { course: "dsa"; feature: "dsa-chat" | "dsa-tutor"; ref?: { problemId?: string; conceptId?: string }; client?: DsaClientSignals | null },
): Promise<LearnerBrief> {
  const [raw, mem, ix] = await Promise.all([
    dsaRows(userId).catch(() => null),
    Promise.race([loadMemory(userId), new Promise<null>((r) => setTimeout(() => r(null), 2500))]).catch(() => null),
    dsaIndex().catch(() => null),
  ]);
  const on = !!mem && mem.available && !mem.paused;
  const pid = o.ref?.problemId;
  const facts = raw && pid ? problemFacts(raw, pid) : null;
  const profile = on && raw && ix ? buildDsaProfile(raw, ix, o.client ?? null) : null;
  const notes = on && mem ? dsaNotes(mem.memory) : null;
  const meta = pid ? ix?.problems.get(pid) : undefined;
  const ref: BriefRef = {};
  if (pid && meta && ix) ref.problem = { id: pid, title: meta.title, concept: meta.concept, conceptTitle: ix.concepts.get(meta.concept) ?? meta.concept, module: ix.modules.get(`p:${pid}`) ?? "" };
  if (pid) ref.facts = facts;
  const cid = o.ref?.conceptId;
  if (cid && ix?.concepts.has(cid)) ref.concept = { title: ix.concepts.get(cid)!, module: ix.modules.get(cid) ?? "" };
  const sdmStudied = on && mem ? mem.memory.studied.filter((x) => untag(x) === x).slice(0, 3) : [];
  const lines = dsaBriefLines({ feature: o.feature, profile, notes, client: o.client ?? null, ref, sdmStudied });
  const adapt = dsaAdaptLines({ feature: o.feature, profile, notes, client: o.client ?? null, ref });
  return { text: learnerTurnBlock(lines, adapt), lines, adapt, facts, profile, notes, memory: { available: !!mem?.available, paused: !!mem?.paused } };
}
