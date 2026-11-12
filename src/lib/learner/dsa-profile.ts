/**
 * DSA Mastery's side of the learner model (src/lib/learner): the profile read live from the learner's own records on
 * every message (Layer 2 of the AI audit's §7: pure code over existing rows, never stored again):
 *
 *   user_profiles.game_done    lessons finished (dsa:c: keys), solved problems (dsa:p:), Bits (lib/dsa/rewards.ts)
 *   user_profiles.game_flags   the signed-in onboarding (pref:dsa-onboarding: experience, language, goal)
 *   learning_progress (dsa)    problems solved
 *   dsa_submissions            failed submits per problem and concept, the verdict mix (TLE, runtime errors), the
 *                              languages they submit in
 *   dsa_problem_progress       editorials revealed before solving (POST /api/dsa/editorial/<id>)
 *
 * plus what the page knows on this device and sends with each message: the language picked (dsa.lang), "Show
 * everything" (dsa.view) and the welcome's answer (dsa.welcome). Pure: the route loads the rows, the eval passes fixtures.
 */
import { awardsOf, computeBits } from "@/lib/dsa/rewards";
import { DSA_LANGS, type DsaLang } from "@/lib/dsa/types";

export type DsaExp = "new" | "some" | "experienced";

export type DsaClientSignals = { lang: DsaLang | null; full: boolean; exp: DsaExp | null };

/** What the page sends with each message (localStorage on the learner's device): checked, never trusted beyond its shape. */
export function readClientSignals(x: unknown): DsaClientSignals | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const lang = DSA_LANGS.includes(o.lang as DsaLang) ? (o.lang as DsaLang) : null;
  const exp = o.exp === "new" || o.exp === "some" || o.exp === "experienced" ? o.exp : null;
  return { lang, full: o.full === true, exp };
}

export type DsaLearnerRaw = {
  done: Record<string, number>;
  /** the onboarding's record (pref:dsa-onboarding), when they took it */
  onboarding: { exp?: unknown; pace?: { lang?: unknown; goal?: unknown } } | null;
  /** learning_progress rows of course 'dsa' */
  rows: { week: string; lesson_slug: string; status: string | null; last_accessed_at?: string | null }[];
  /** dsa_submissions, newest first */
  subs: { problem_id: string; language: string; verdict: string; created_at: string }[];
  /** dsa_problem_progress */
  prog: { problem_id: string; status: string; editorial_viewed: boolean; updated_at?: string | null }[];
};

export type DsaIndex = {
  problems: Map<string, { title: string; concept: string; level: string }>;
  concepts: Map<string, string>;
};

export type DsaProfile = {
  lang: DsaLang | null;
  level: DsaExp | null;
  /** where the level came from */
  levelFrom: "show-everything" | "welcome" | "onboarding" | "record" | null;
  goal: string | null;
  solved: number;
  attempted: number;
  lessonsDone: number;
  bits: number | null;
  /** concepts their record shows as hard, with the reason */
  struggles: { concept: string; why: string }[];
  /** of the problems they attempted recently, how many had the editorial revealed before a solve */
  editorialFirst: { n: number; of: number };
  /** verdict patterns over recent failed submits: "too slow (TLE on 3 problems)" */
  patterns: string[];
  /** what they were last working on */
  recent: string[];
};

const GOALS: Record<string, string> = { placements: "campus placements", interviews: "coding interviews", cp: "competitive programming" };
const LESSON_KEY = /^dsa:c:(.+)$/;

export function buildDsaProfile(raw: DsaLearnerRaw, ix: DsaIndex, client: DsaClientSignals | null): DsaProfile {
  // solved and attempted problems; failed submits per problem
  const solved = new Set<string>();
  const fails = new Map<string, number>();
  const lastAt = new Map<string, number>();
  for (const r of raw.rows) if (r.week === "problems" && r.status === "completed") solved.add(r.lesson_slug);
  for (const r of raw.prog) if (r.status === "solved") solved.add(r.problem_id);
  for (const k of Object.keys(raw.done)) if (k.startsWith("dsa:p:")) solved.add(k.slice(6));
  const langCount = new Map<string, number>();
  const verdicts = new Map<string, Set<string>>();
  for (const s of raw.subs) {
    if (s.verdict === "AC") solved.add(s.problem_id);
    else fails.set(s.problem_id, (fails.get(s.problem_id) ?? 0) + 1);
    if (s.verdict !== "AC" && s.verdict !== "WA") {
      const set = verdicts.get(s.verdict) ?? new Set<string>();
      set.add(s.problem_id);
      verdicts.set(s.verdict, set);
    }
    langCount.set(s.language, (langCount.get(s.language) ?? 0) + 1);
    const t = Date.parse(s.created_at);
    if (Number.isFinite(t)) lastAt.set(s.problem_id, Math.max(lastAt.get(s.problem_id) ?? 0, t));
  }
  const revealed = new Set(raw.prog.filter((r) => r.editorial_viewed).map((r) => r.problem_id));
  for (const r of raw.prog) {
    const t = r.updated_at ? Date.parse(r.updated_at) : NaN;
    if (Number.isFinite(t)) lastAt.set(r.problem_id, Math.max(lastAt.get(r.problem_id) ?? 0, t));
  }
  const attempted = new Set([...solved, ...fails.keys(), ...revealed]);

  // the language: the one picked on this device, else the one they submit in most, else the onboarding's
  const topLang = [...langCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const onbLang = raw.onboarding?.pace?.lang;
  const lang = client?.lang ?? (DSA_LANGS.includes(topLang as DsaLang) ? (topLang as DsaLang) : DSA_LANGS.includes(onbLang as DsaLang) ? (onbLang as DsaLang) : null);

  // the level: "Show everything" says experienced; else the welcome's or the onboarding's answer; else the record
  const onbExp = raw.onboarding?.exp === "new" || raw.onboarding?.exp === "some" || raw.onboarding?.exp === "experienced" ? (raw.onboarding.exp as DsaExp) : null;
  let level: DsaExp | null = null;
  let levelFrom: DsaProfile["levelFrom"] = null;
  if (client?.full) [level, levelFrom] = ["experienced", "show-everything"];
  else if (client?.exp) [level, levelFrom] = [client.exp, "welcome"];
  else if (onbExp) [level, levelFrom] = [onbExp, "onboarding"];
  else if (solved.size >= 40) [level, levelFrom] = ["experienced", "record"];
  else if (attempted.size === 0) [level, levelFrom] = ["new", "record"];

  // struggles: concepts with failed submits, reveals and unsolved attempts (2+ signals)
  const per = new Map<string, { fails: number; problems: Set<string>; reveals: number; open: number }>();
  for (const id of attempted) {
    const p = ix.problems.get(id);
    if (!p?.concept) continue;
    const c = per.get(p.concept) ?? { fails: 0, problems: new Set<string>(), reveals: 0, open: 0 };
    const f = fails.get(id) ?? 0;
    if (f) {
      c.fails += f;
      c.problems.add(id);
    }
    if (revealed.has(id)) c.reveals++;
    if (!solved.has(id)) c.open++;
    per.set(p.concept, c);
  }
  const struggles = [...per.entries()]
    .map(([id, c]) => ({ id, c, score: c.fails + 2 * c.reveals + c.open }))
    .filter((x) => x.score >= 3 && (x.c.fails >= 2 || x.c.reveals >= 1))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ id, c }) => ({
      concept: ix.concepts.get(id) ?? id,
      why: [c.fails ? `${c.fails} failed submit${c.fails === 1 ? "" : "s"} on ${c.problems.size} problem${c.problems.size === 1 ? "" : "s"}` : "", c.reveals ? `editorial revealed early on ${c.reveals}` : "", c.open ? `${c.open} still unsolved` : ""].filter(Boolean).join(", "),
    }));

  // the editorial habit, over their last 8 problems
  const recentIds = [...attempted].sort((a, b) => (lastAt.get(b) ?? 0) - (lastAt.get(a) ?? 0)).slice(0, 8);
  const editorialFirst = { n: recentIds.filter((id) => revealed.has(id)).length, of: recentIds.length };

  const patterns: string[] = [];
  const tle = verdicts.get("TLE")?.size ?? 0;
  const rte = verdicts.get("RE")?.size ?? 0;
  const ce = verdicts.get("CE")?.size ?? 0;
  if (tle >= 2) patterns.push(`solutions too slow for the limits (time limit exceeded on ${tle} problems)`);
  if (rte >= 2) patterns.push(`runtime errors (index or null access) on ${rte} problems`);
  if (ce >= 2) patterns.push(`compile errors on ${ce} problems`);

  const lessonsDone = Object.keys(raw.done).filter((k) => LESSON_KEY.test(k)).length;
  const recent = recentIds
    .slice(0, 3)
    .map((id) => {
      const p = ix.problems.get(id);
      if (!p) return "";
      return `${p.title} (${p.level}, ${ix.concepts.get(p.concept) ?? p.concept}): ${solved.has(id) ? "solved" : `not solved yet${fails.get(id) ? `, ${fails.get(id)} failed submit${fails.get(id) === 1 ? "" : "s"}` : ""}`}${revealed.has(id) ? ", editorial revealed before solving" : ""}`;
    })
    .filter(Boolean);

  const goal = typeof raw.onboarding?.pace?.goal === "string" ? (GOALS[raw.onboarding.pace.goal] ?? null) : null;
  const bits = Object.keys(raw.done).some((k) => k.startsWith("dsa:")) ? computeBits(awardsOf(raw.done)).total : null;
  return { lang, level, levelFrom, goal, solved: solved.size, attempted: attempted.size, lessonsDone, bits, struggles, editorialFirst, patterns, recent };
}


/** One problem's record, for the tutor on that problem: failed submits, solved, editorial revealed. */
export function problemFacts(raw: DsaLearnerRaw, id: string): { fails: number; solved: boolean; revealed: boolean; langs: string[] } {
  let fails = 0;
  let solved = raw.rows.some((r) => r.week === "problems" && r.lesson_slug === id && r.status === "completed") || !!raw.done[`dsa:p:${id}`];
  const langs = new Set<string>();
  for (const s of raw.subs)
    if (s.problem_id === id) {
      if (s.verdict === "AC") solved = true;
      else fails++;
      langs.add(s.language);
    }
  const p = raw.prog.find((r) => r.problem_id === id);
  if (p?.status === "solved") solved = true;
  return { fails, solved, revealed: !!p?.editorial_viewed, langs: [...langs] };
}
