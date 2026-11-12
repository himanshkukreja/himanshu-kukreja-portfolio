import "server-only";
/**
 * The interview-readiness estimate on the server (./readiness-model.ts has the rules): one learner's records, by the
 * verified user id, gathered into each track's inputs. All of it is progress the site already keeps; nothing new is
 * stored. Read whatever the memory switch says (the outcome log is Layer 1 of the learner model: progress, AI audit §7).
 *
 *   System design   lessons and the problem bank's case studies (learning_progress + game_done), trial parts
 *                   (trial_attempts + game_done), quick checks right first time (analytics quiz answers, absent for
 *                   GPC or opt-out learners, then game_done's right-first-time keys), mock levels (the outcome log's AI
 *                   scorecards; the mock room's self-assessed verdict flag when there are none), system design labs
 *   LLD             the 28 pattern lessons and 30 case studies, LLD mock scorecards (lld_mock), LLD labs
 *   DSA             concept lessons, patterns (modules) with 2+ solves, solves, first-submit solves, DSA explain-backs
 *
 * Kept a minute per learner (the dashboard and the reading ask together).
 */
import { supabase } from "@/lib/supabase";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { lessonKey, type CourseLesson, type CourseMap } from "@/lib/learn/types";
import { getLabSummaries } from "@/lib/learn/labs/load";
import type { LabSummary } from "@/lib/learn/labs/types";
import { buildSnapshot, type ProgressRaw } from "@/lib/ai/chat/progress-model";
import { loadOutcomes } from "./events";
import type { OutcomeEvent } from "./events-model";
import { dsaIndex, dsaRows } from "./brief";
import { dsaReadiness, lldReadiness, sdmReadiness, type DsaInput, type InputId, type Link, type LldInput, type MockRun, type Readiness, type SdmInput, type Track } from "./readiness-model";

const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** A lab of the LLD track: a machine-coding build or a pattern refactor. */
export const isLldLab = (l: Pick<LabSummary, "paths" | "lessons" | "topic">) => l.paths.includes("design-patterns") || /low-level design/i.test(l.topic) || l.lessons.some((x) => /low-level-design/.test(x.href));

/** The self-assessed verdict flag, as a level: a hire at the bar picked is that level, a lean hire one below. */
function selfLevel(verdict: string, bar: string): string {
  const order = ["below-junior", "junior", "sde", "senior", "staff"];
  const i = Math.max(0, order.indexOf(bar));
  if (verdict === "hire" || verdict === "strong-hire") return order[i];
  if (verdict === "lean-hire") return order[Math.max(0, i - 1)];
  return order[Math.max(0, i - 2)];
}

type Gathered = { map: CourseMap | null; raw: ProgressRaw; quiz: { right: number; answered: number }; events: OutcomeEvent[]; labs: LabSummary[]; partial: boolean };

async function gather(userId: string): Promise<Gathered> {
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const [map, prof, rows, trials, quiz, events, labs] = await Promise.all([
    getCourseMap(COURSE_ID).catch(() => null),
    supabase.from("user_profiles").select("xp, game_done, game_flags, current_streak").eq("id", userId).maybeSingle(),
    supabase.from("learning_progress").select("week, lesson_slug, status, progress_percentage, max_progress, completed_at, last_accessed_at").eq("user_id", userId).eq("course_id", COURSE_ID).limit(3000),
    supabase.from("trial_attempts").select("week, part, score, total, passed").eq("user_id", userId).eq("course_id", COURSE_ID).limit(1000),
    supabase
      .from("analytics_events")
      .select("metadata")
      .eq("user_id", userId)
      .eq("event_type", "event")
      .eq("metadata->>name", "quiz_answer")
      .gte("created_at", since)
      .limit(3000),
    within(loadOutcomes(userId), 4000, [] as OutcomeEvent[]),
    within(getLabSummaries(), 10_000, null),
  ]);
  const p = (prof.error ? null : prof.data) as { xp?: number; game_done?: Record<string, number> | null; game_flags?: Record<string, unknown> | null; current_streak?: number } | null;
  // first attempts only (a retry after a miss isn't "right first time")
  let right = 0;
  let answered = 0;
  for (const e of (quiz.error ? [] : (quiz.data ?? [])) as { metadata: Record<string, unknown> | null }[]) {
    const m = e.metadata ?? {};
    if (m.first !== true && m.first !== "true") continue;
    answered++;
    if (m.correct === true || m.correct === "true") right++;
  }
  return {
    map,
    raw: {
      profile: p ? { xp: p.xp, game_done: p.game_done, current_streak: p.current_streak } : null,
      rows: (rows.error ? [] : (rows.data ?? [])) as ProgressRaw["rows"],
      trials: (trials.error ? [] : (trials.data ?? [])) as ProgressRaw["trials"],
      cards: [],
      flags: p?.game_flags && typeof p.game_flags === "object" ? p.game_flags : {},
    },
    quiz: { right, answered },
    events,
    labs: labs ?? [],
    // a cold server's lab index can take a while: the estimate leaves labs out this time and isn't kept
    partial: !labs || !map,
  };
}

/** Lessons completed: a completed row or the game's lesson: award. */
function completedSet(raw: ProgressRaw): Set<string> {
  const s = new Set<string>();
  for (const r of raw.rows) if (r.status === "completed" && r.week && r.lesson_slug) s.add(lessonKey(r.week, r.lesson_slug));
  for (const k of Object.keys(raw.profile?.game_done ?? {})) if (k.startsWith("lesson:")) s.add(k.slice(7));
  return s;
}

const linkOf = (l: CourseLesson | undefined, verb: string): Link | undefined => (l ? { label: `${verb}: ${l.title}`, href: l.href } : undefined);
const runsOf = (events: OutcomeEvent[], kind: "mock_overall" | "lld_mock", title: (slug: string) => string | undefined): MockRun[] =>
  events.filter((e) => e.kind === kind && e.outcome).map((e) => ({ slug: e.ref, title: title(e.ref), level: e.outcome!, at: e.at }));

function sdmInput(g: Gathered): SdmInput | null {
  const map = g.map;
  if (!map) return null;
  const snap = buildSnapshot(g.raw, map);
  const done = completedSet(g.raw);
  const unreleased = (w: string) => /-next(?:--|\/|$)/.test(w);
  const weeks = map.weeks.filter((w) => !unreleased(w.key));
  const problems = (map.problems ?? []).filter((l) => !unreleased(l.week));
  const doneLabs = new Set([...snap.practice.labs.filter((l) => l.cleared).map((l) => l.id), ...g.events.filter((e) => e.kind === "lab_pass").map((e) => e.ref)]);
  const sdLabs = g.labs.filter((l) => !isLldLab(l));
  const partsTotal = snap.weeks.reduce((a, w) => a + w.partsTotal, 0);
  const partsPassed = snap.weeks.reduce((a, w) => a + w.partsPassed, 0);
  const mockTitle = (slug: string) => map.mocks?.find((m) => m.slug === slug || m.id === slug)?.title;
  let mocks = runsOf(g.events, "mock_overall", mockTitle);
  // no AI scorecard yet: the mock room's own self-assessed verdict (game_flags mock:<id>)
  if (!mocks.length)
    mocks = snap.practice.mockResults.flatMap((m) => {
      const out: MockRun[] = [];
      if (m.last) out.push({ slug: m.slug, title: m.title, level: selfLevel(m.last.verdict, m.last.level), at: m.last.at || 1, self: true });
      if (m.best && (!m.last || m.best.at !== m.last.at)) out.push({ slug: m.slug, title: m.title, level: selfLevel(m.best.verdict, m.best.level), at: m.best.at || 0, self: true });
      return out;
    });

  // the links for what would raise it
  const links: Partial<Record<InputId, Link>> = {};
  const nextLesson = snap.next[0] && weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]).find((l) => l.week === snap.next[0].week && l.slug === snap.next[0].slug);
  if (nextLesson) links.lessons = linkOf(nextLesson, "Next lesson");
  const nextCase = problems.find((l) => !done.has(lessonKey(l.week, l.slug)));
  if (nextCase) links.cases = linkOf(nextCase, "Case study");
  for (const w of weeks) {
    const part = w.trial?.parts.find((x) => !snap.trials.some((t) => t.code === w.code && t.part === x.n && t.passed));
    if (w.trial && part && (snap.weeks.find((s) => s.key === w.key)?.started || !links.trials)) {
      links.trials = { label: `Trial W${w.code} part ${part.n}: ${part.title}`, href: part.href };
      if (snap.weeks.find((s) => s.key === w.key)?.started) break;
    }
  }
  if (nextLesson) links.quickChecks = { label: `Quick checks in ${nextLesson.title}`, href: nextLesson.href };
  const lastMock = mocks[0];
  const nextMock = (map.mocks ?? []).find((m) => !mocks.some((r) => r.slug === m.slug || r.slug === m.id));
  const mockLink = lastMock && levelRank(lastMock.level) < 2 ? (map.mocks ?? []).find((m) => m.slug === lastMock.slug || m.id === lastMock.slug) : nextMock;
  if (mockLink) links.mocks = { label: `Mock ${mockLink.code}: ${mockLink.title} (${mockLink.company})`, href: mockLink.href };
  const nextLab = sdLabs.find((l) => !doneLabs.has(l.id) && (!snap.currentWeek || l.weekKey === snap.currentWeek.key)) ?? sdLabs.find((l) => !doneLabs.has(l.id));
  if (nextLab) links.labs = { label: `Lab: ${nextLab.title}`, href: nextLab.href };

  return {
    lessons: { done: snap.lessonsDone, total: snap.lessonsTotal },
    cases: { done: problems.filter((l) => done.has(lessonKey(l.week, l.slug))).length, total: problems.length },
    trials: { passed: partsPassed, attempted: Math.max(partsPassed, snap.trials.length), total: partsTotal },
    quickChecks: g.quiz.answered ? g.quiz : { right: snap.practice.quickChecks.total, answered: snap.practice.quickChecks.total },
    mocks,
    labs: { done: sdLabs.filter((l) => doneLabs.has(l.id)).length, total: sdLabs.length },
    links,
  };
}

const levelRank = (l: string) => ["none", "below-junior", "junior", "sde", "senior", "staff"].indexOf(l) - 1;

function lldInput(g: Gathered): LldInput | null {
  const map = g.map;
  if (!map) return null;
  const done = completedSet(g.raw);
  const all = map.lld ?? [];
  const patterns = all.filter((l) => /^dp-\d+/.test(l.slug));
  const cases = all.filter((l) => /^lld-\d+/.test(l.slug));
  const isDone = (l: CourseLesson) => done.has(lessonKey(l.week, l.slug));
  const doneGame = Object.keys(g.raw.profile?.game_done ?? {});
  const doneLabs = new Set([...doneGame.filter((k) => k.startsWith("lab:")).map((k) => k.slice(4)), ...g.events.filter((e) => e.kind === "lab_pass").map((e) => e.ref)]);
  const labs = g.labs.filter(isLldLab);
  const caseTitle = (slug: string) => cases.find((c) => c.slug === slug)?.title;
  const mocks = runsOf(g.events, "lld_mock", caseTitle);

  const links: Partial<Record<InputId, Link>> = {};
  const p = patterns.find((l) => !isDone(l));
  if (p) links.patterns = linkOf(p, "Pattern");
  const c = cases.find((l) => !isDone(l));
  if (c) links.cases = linkOf(c, "Case study");
  // a mock on a case study they finished and haven't run as a round yet (else their latest round again)
  const mockCase = cases.find((l) => isDone(l) && !mocks.some((m) => m.slug === l.slug)) ?? (mocks[0] ? cases.find((l) => l.slug === mocks[0].slug) : undefined) ?? cases[0];
  if (mockCase) links.mocks = { label: `LLD mock round: ${mockCase.title}`, href: `/mock/${mockCase.slug}` };
  const lab = labs.find((l) => !doneLabs.has(l.id) && l.lessons.some((x) => cases.some((cs) => isDone(cs) && x.href.endsWith(`/${cs.slug}`)))) ?? labs.find((l) => !doneLabs.has(l.id));
  if (lab) links.labs = { label: `Lab: ${lab.title}`, href: lab.href };

  return {
    patterns: { done: patterns.filter(isDone).length, total: patterns.length },
    cases: { done: cases.filter(isDone).length, total: cases.length },
    mocks,
    labs: { done: labs.filter((l) => doneLabs.has(l.id)).length, total: labs.length },
    links,
  };
}

async function dsaInput(userId: string, events: OutcomeEvent[]): Promise<DsaInput | null> {
  const [raw, ix] = await Promise.all([within(dsaRows(userId), 4000, null), within(dsaIndex(), 6000, null)]);
  if (!raw || !ix) return null;
  const solved = new Set<string>();
  for (const r of raw.rows) if (r.week === "problems" && r.status === "completed") solved.add(r.lesson_slug);
  for (const r of raw.prog) if (r.status === "solved") solved.add(r.problem_id);
  for (const k of Object.keys(raw.done)) if (k.startsWith("dsa:p:")) solved.add(k.slice(6));
  const failed = new Set<string>();
  const submitted = new Set<string>();
  for (const s of raw.subs) {
    submitted.add(s.problem_id);
    if (s.verdict === "AC") solved.add(s.problem_id);
    else failed.add(s.problem_id);
  }
  const lessonsDone = Object.keys(raw.done).filter((k) => /^dsa:c:/.test(k)).length;
  // patterns: the modules behind the concepts; one counts with two or more solved problems in it
  const modules = new Set([...ix.concepts.keys()].map((c) => ix.modules.get(c)).filter((m): m is string => !!m));
  const perModule = new Map<string, number>();
  for (const id of solved) {
    const m = ix.modules.get(`p:${id}`);
    if (m) perModule.set(m, (perModule.get(m) ?? 0) + 1);
  }
  const subSolved = [...solved].filter((id) => submitted.has(id));
  // DSA explain-backs: the latest verdict per concept
  const latest = new Map<string, string>();
  for (const e of events) if (e.kind === "explain_back" && e.ref.startsWith("dsa:") && !latest.has(e.ref) && e.outcome) latest.set(e.ref, e.outcome);
  return {
    lessons: { done: Math.min(lessonsDone, ix.concepts.size), total: ix.concepts.size },
    patterns: { done: [...perModule.values()].filter((n) => n >= 2).length, total: modules.size },
    solved: solved.size,
    firstTry: { done: subSolved.filter((id) => !failed.has(id)).length, total: subSolved.length },
    explains: { done: [...latest.values()].filter((v) => v === "solid").length, total: latest.size },
    links: { lessons: { label: "DSA Mastery lessons", href: "/dsa" }, patterns: { label: "DSA problems by pattern", href: "/dsa/problems" }, solved: { label: "DSA problems", href: "/dsa/problems" }, firstTry: { label: "DSA problems", href: "/dsa/problems" } },
  };
}

const cache = new Map<string, { at: number; p: Promise<Readiness[]> }>();

/** The learner's estimate for each track asked for (a track whose content didn't load is left out). */
export function loadReadiness(userId: string, tracks: Track[]): Promise<Readiness[]> {
  const key = `${userId}|${tracks.join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    const g = await gather(userId);
    if (g.partial) setTimeout(() => cache.get(key)?.p === p && cache.delete(key), 0);
    const out: Readiness[] = [];
    for (const t of tracks) {
      if (t === "sdm") {
        const x = sdmInput(g);
        if (x) out.push(sdmReadiness(x));
      } else if (t === "lld") {
        const x = lldInput(g);
        if (x) out.push(lldReadiness(x));
      } else {
        const x = await dsaInput(userId, g.events);
        if (x) out.push(dsaReadiness(x));
      }
    }
    return out;
  })();
  cache.set(key, { at: Date.now(), p });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  p.catch(() => cache.delete(key));
  return p;
}

export const forgetReadiness = (userId: string) => {
  for (const k of cache.keys()) if (k.startsWith(`${userId}|`)) cache.delete(k);
};
