import "server-only";
/**
 * AI planning on the server (owner-approved 12 Nov 2026; the rules are in ./planning-model.ts and ./connections-model.ts):
 * one learner's records, by the verified user id, gathered for
 *
 *   loadStruggles(userId)            the topics missed twice or more in 14 days, named and linked from the course content
 *   recapSource(userId, key)         the course text an on-demand recap is grounded in (a concept's refresher and the
 *                                    lesson section that teaches it, a DSA lesson's invariant and key points), and the
 *                                    key points the learner missed (as the course's words, never theirs)
 *   loadConnections(userId, ctx)     the "Connected to what you've done" lines for a page
 *   companyPlan(userId, slug)        a company's plan items across System Design, LLD and DSA, ordered by readiness
 *
 * Everything is progress the site already keeps (learning_progress, game_done/game_flags, the outcome log, DSA Mastery's
 * submits): nothing new is stored and no learner text is read. Kept 30 seconds per learner.
 */
import { supabase } from "@/lib/supabase";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { lessonKey, type CourseLesson, type CourseMap } from "@/lib/learn/types";
import { getCatalogue } from "@/lib/concepts/load";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { getCompany } from "@/lib/learn/prep/load";
import { getLearningResource } from "@/lib/github";
import { lessonContext } from "@/lib/ai/retrieve";
import { buildSnapshot, type ProgressRaw } from "@/lib/ai/chat/progress-model";
import { DSA_FULL } from "@/lib/dsa/flags";
import type { ConceptSummary, ProblemSummary } from "@/lib/dsa/types";
import { loadOutcomes } from "./events";
import { missOf, type OutcomeEvent } from "./events-model";
import { dsaRows } from "./brief";
import { loadReadiness } from "./readiness";
import type { Readiness } from "./readiness-model";
import { cleanNudgePrefs, findStruggles, interleave, NUDGE_FLAG, recapDone, RECAP_MINUTES, trackWeights, type CompanyItem, type NamedStruggle, type Track } from "./planning-model";
import { connections, type Connection, type LinkCtx, type LinkIndex, type LinkProgress } from "./connections-model";
import type { ItemStatus } from "@/lib/learn/plan/schedule";

const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/* ------------------------------------------------------------------ the learner's facts */

type DsaContent = { concepts: ConceptSummary[]; problems: ProblemSummary[]; links: { id: string; sdm: string[]; labs: string[] }[] };

let dsaMemo: { at: number; p: Promise<DsaContent> } | null = null;
/** DSA Mastery's concept and problem indexes and its concepts' System Design links, kept ten minutes. */
function dsaContent(): Promise<DsaContent> {
  if (dsaMemo && Date.now() - dsaMemo.at < 10 * 60_000) return dsaMemo.p;
  const p = (async () => {
    const { getConceptIndex, getProblemIndex, getConceptLinks } = await import("@/lib/dsa/load");
    const [concepts, problems, links] = await Promise.all([getConceptIndex().catch(() => []), getProblemIndex().catch(() => []), within(getConceptLinks(), 15_000, [])]);
    return { concepts, problems, links };
  })();
  dsaMemo = { at: Date.now(), p };
  p.catch(() => (dsaMemo = null));
  return p;
}

const dsaHref = (c: Pick<ConceptSummary, "id" | "kind">) => (c.kind === "structure" ? `/dsa/structures/${c.id}` : c.kind === "algorithm" ? `/dsa/algorithms/${c.id}` : `/dsa/concepts/${c.id}`);

type Facts = {
  map: CourseMap | null;
  flags: Record<string, unknown>;
  done: Record<string, number>;
  raw: ProgressRaw;
  sdmDone: Set<string>;
  sdmPct: Map<string, number>;
  events: OutcomeEvent[];
  dsa: DsaContent;
  dsaSolved: Set<string>;
  dsaConceptsDone: Set<string>;
  /** the learner has touched DSA Mastery (or it is live for everyone) */
  dsaOn: boolean;
};

const factsCache = new Map<string, { at: number; p: Promise<Facts> }>();

export function learnerFacts(userId: string): Promise<Facts> {
  const hit = factsCache.get(userId);
  if (hit && Date.now() - hit.at < 30_000) return hit.p;
  const p = (async (): Promise<Facts> => {
    const [map, prof, rows, events, draw, dsa] = await Promise.all([
      getCourseMap(COURSE_ID).catch(() => null),
      supabase.from("user_profiles").select("game_done, game_flags").eq("id", userId).maybeSingle(),
      supabase.from("learning_progress").select("week, lesson_slug, status, progress_percentage, max_progress, completed_at, last_accessed_at").eq("user_id", userId).eq("course_id", COURSE_ID).limit(3000),
      within(loadOutcomes(userId), 4000, [] as OutcomeEvent[]),
      within(dsaRows(userId), 4000, null),
      within(dsaContent(), 8000, { concepts: [], problems: [], links: [] } as DsaContent),
    ]);
    const pr = (prof.error ? null : prof.data) as { game_done?: Record<string, number> | null; game_flags?: Record<string, unknown> | null } | null;
    const done = (pr?.game_done && typeof pr.game_done === "object" ? pr.game_done : {}) as Record<string, number>;
    const flags = (pr?.game_flags && typeof pr.game_flags === "object" ? pr.game_flags : {}) as Record<string, unknown>;
    const lrows = (rows.error ? [] : (rows.data ?? [])) as ProgressRaw["rows"];
    const sdmDone = new Set<string>();
    const sdmPct = new Map<string, number>();
    for (const r of lrows) {
      if (!r.week || !r.lesson_slug) continue;
      const k = lessonKey(r.week, r.lesson_slug);
      if (r.status === "completed") sdmDone.add(k);
      sdmPct.set(k, Math.max(sdmPct.get(k) ?? 0, Number(r.max_progress ?? r.progress_percentage) || 0));
    }
    for (const k of Object.keys(done)) if (k.startsWith("lesson:")) sdmDone.add(k.slice(7));
    const dsaSolved = new Set<string>();
    const dsaConceptsDone = new Set<string>();
    if (draw) {
      for (const r of draw.rows) if (r.week === "problems" && r.status === "completed") dsaSolved.add(r.lesson_slug);
      for (const r of draw.prog) if (r.status === "solved") dsaSolved.add(r.problem_id);
      for (const s of draw.subs) if (s.verdict === "AC") dsaSolved.add(s.problem_id);
    }
    for (const k of Object.keys(done)) {
      if (k.startsWith("dsa:p:")) dsaSolved.add(k.slice(6));
      if (k.startsWith("dsa:c:")) dsaConceptsDone.add(k.slice(6));
    }
    const dsaOn = DSA_FULL || dsaSolved.size > 0 || dsaConceptsDone.size > 0 || !!draw?.subs.length;
    return { map, flags, done, raw: { profile: { game_done: done }, rows: lrows, trials: [], cards: [], flags }, sdmDone, sdmPct, events, dsa, dsaSolved, dsaConceptsDone, dsaOn };
  })();
  factsCache.set(userId, { at: Date.now(), p });
  if (factsCache.size > 500) factsCache.delete(factsCache.keys().next().value as string);
  p.catch(() => factsCache.delete(userId));
  return p;
}

export const forgetPlanning = (userId: string) => factsCache.delete(userId);

const allLessons = (map: CourseMap | null): CourseLesson[] =>
  map ? [...map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]), ...map.sideQuests, ...(map.problems ?? []), ...(map.lld ?? [])] : [];

/* ------------------------------------------------------------------ struggles */

export async function loadStruggles(userId: string, now = Date.now()): Promise<NamedStruggle[]> {
  const f = await learnerFacts(userId);
  const conceptOf = new Map(f.dsa.problems.map((p) => [p.id, p.concept]));
  const raw = findStruggles(f.events, now, (id) => conceptOf.get(id) ?? null);
  if (!raw.length) return [];
  const cat = raw.some((s) => s.key.startsWith("sdm:")) ? await within(getCatalogue(), 6000, null) : null;
  const lessons = new Map(allLessons(f.map).map((l) => [lessonKey(l.week, l.slug), l]));
  const dsaC = new Map(f.dsa.concepts.map((c) => [c.id, c]));
  const out: NamedStruggle[] = [];
  for (const s of raw) {
    if (s.key.startsWith("sdm:")) {
      const c = cat?.catalogue.concepts.find((x) => x.id === s.key.slice(4));
      if (c) out.push({ ...s, label: c.term, href: `/concepts/${c.id}`, recap: true });
    } else if (s.key.startsWith("dsa:")) {
      const c = dsaC.get(s.key.slice(4));
      if (c && f.dsaOn) out.push({ ...s, label: c.title, href: dsaHref(c), recap: true });
    } else if (s.key.startsWith("lesson:")) {
      const l = lessons.get(s.key.slice(7));
      if (l) out.push({ ...s, label: l.title, href: l.href, recap: true });
    }
  }
  return out;
}

/** The nudge prefs as the account holds them (the client merges its own copy; the server only reads). */
export async function nudgePrefs(userId: string) {
  return cleanNudgePrefs((await learnerFacts(userId)).flags[NUDGE_FLAG]);
}

/* ------------------------------------------------------------------ the recap's grounding */

export type RecapSource = { key: string; label: string; href: string; text: string; missed: string[] };

export async function recapSource(userId: string, key: string): Promise<RecapSource | null> {
  const s = (await loadStruggles(userId)).find((x) => x.key === key);
  if (!s) return null;
  const f = await learnerFacts(userId);
  // the key points the latest explain-back missed, by number (the course's own words come from the topic's text)
  const ev = f.events.find((e) => e.kind === "explain_back" && (key.startsWith("dsa:") ? e.ref === key : `sdm:${e.ref}` === key));
  const missNums = ev ? missOf(ev).map(Number).filter((n) => n > 0) : [];
  const src = await topicText(key, missNums);
  return src ? { ...src, label: src.label || s.label, href: src.href || s.href } : null;
}

/**
 * The course text a topic's recap is grounded in, and its missed key points (numbers → the course's words): a System
 * Design concept's definition, refresher and the lesson section that teaches it; a DSA lesson's invariant and key points;
 * a lesson's most relevant sections. The route and the eval (scripts/ai-eval/planning.ts) share it.
 */
export async function topicText(key: string, missNums: number[] = []): Promise<RecapSource | null> {
  if (key.startsWith("sdm:")) {
    const { catalogue } = await getCatalogue();
    const c = catalogue.concepts.find((x) => x.id === key.slice(4));
    if (!c) return null;
    const points = [c.definition, ...c.refresher];
    const [week, slug] = c.taught.lesson.split("/");
    const lesson = week && slug ? await within(getLearningResource(week, slug), 8000, null) : null;
    const section = lesson ? lessonContext(lesson.content, `${c.term} ${c.definition}`, "", 4500) : "";
    return {
      key,
      label: c.term,
      href: `/${c.taught.lesson}#${c.taught.anchor}`,
      text: [`Concept: ${c.term}`, `Definition: ${c.definition}`, `Refresher:\n${c.refresher.map((r) => `- ${r}`).join("\n")}`, section ? `From the lesson that teaches it:\n${section}` : ""].filter(Boolean).join("\n\n"),
      missed: missNums.map((n) => points[n - 1]).filter(Boolean),
    };
  }
  if (key.startsWith("dsa:")) {
    const { getConcept, getConceptIndex } = await import("@/lib/dsa/load");
    const d = await within(getConcept(key.slice(4)), 8000, null);
    if (!d) return null;
    const points = [d.invariant, ...d.keyPoints].filter(Boolean);
    const c = (await getConceptIndex().catch(() => [])).find((x) => x.id === d.id);
    // the lesson's own words (and worked examples) as plain text, the parts nearest its invariant first
    const plain = d.html
      .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|li|h\d|pre|div|tr)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*(\n\s*)+/g, "\n\n");
    const excerpt = lessonContext(plain, `${d.title} ${d.invariant} example`, "", 3500);
    return {
      key,
      label: d.title,
      href: c ? dsaHref(c) : `/dsa/concepts/${d.id}`,
      text: [`DSA lesson: ${d.title}`, d.invariant ? `Invariant: ${d.invariant}` : "", d.keyPoints.length ? `Key points:\n${d.keyPoints.map((k) => `- ${k}`).join("\n")}` : "", excerpt.trim() ? `From the lesson:\n${excerpt.trim()}` : ""].filter(Boolean).join("\n\n"),
      missed: missNums.map((n) => points[n - 1]).filter(Boolean),
    };
  }
  if (key.startsWith("lesson:")) {
    const [week, slug] = key.slice(7).split("/");
    const lesson = await within(getLearningResource(week, slug), 8000, null);
    if (!lesson) return null;
    const title = lesson.resource.title || slug;
    return { key, label: title, href: `/${week}/${slug}`, text: `Lesson: ${title}\n\n${lessonContext(lesson.content, title, "", 5000)}`, missed: [] };
  }
  return null;
}

/* ------------------------------------------------------------------ connections */

let ixMemo: { at: number; p: Promise<LinkIndex> } | null = null;
async function linkIndex(map: CourseMap | null, dsa: DsaContent): Promise<LinkIndex> {
  if (ixMemo && Date.now() - ixMemo.at < 10 * 60_000) return ixMemo.p;
  const p = (async () => {
    const labs = await within(getLabSummaries(), 10_000, []);
    const byId = new Map(dsa.concepts.map((c) => [c.id, c]));
    const lessons: LinkIndex["lessons"] = {};
    for (const l of allLessons(map)) lessons[lessonKey(l.week, l.slug)] = { title: l.title, href: l.href };
    return {
      concepts: dsa.links.flatMap((x) => {
        const c = byId.get(x.id);
        return c ? [{ id: c.id, title: c.title, href: dsaHref(c), sdm: x.sdm, labs: x.labs }] : [];
      }),
      labs: labs.map((l) => ({ id: l.id, title: l.title, href: l.href, lessons: l.lessons.map((x) => x.href.replace(/^\/+/, "").split("#")[0]) })),
      lessons,
    };
  })();
  ixMemo = { at: Date.now(), p };
  p.catch(() => (ixMemo = null));
  return p;
}

export type ConnectionAsk = { kind: "sdm"; key: string } | { kind: "dsa-concept"; id: string } | { kind: "dsa-problem"; id: string };

export async function loadConnections(userId: string, ask: ConnectionAsk): Promise<Connection[]> {
  const f = await learnerFacts(userId);
  // nothing to connect for a learner who hasn't touched DSA Mastery, while it isn't live
  if (!f.dsaOn) return [];
  const ix = await linkIndex(f.map, f.dsa);
  const solvedBy = new Map<string, number>();
  const conceptOf = new Map(f.dsa.problems.map((p) => [p.id, p.concept]));
  for (const id of f.dsaSolved) {
    const c = conceptOf.get(id);
    if (c) solvedBy.set(c, (solvedBy.get(c) ?? 0) + 1);
  }
  const snap = f.map ? buildSnapshot(f.raw, f.map) : null;
  const labsDone = new Set([...Object.keys(f.done).filter((k) => k.startsWith("lab:")).map((k) => k.slice(4)), ...f.events.filter((e) => e.kind === "lab_pass").map((e) => e.ref)]);
  // DSA up next: the first two built concepts after the last one finished (only once DSA is started)
  const built = f.dsa.concepts.filter((c) => c.status === "built");
  const lastDone = built.reduce((a, c, i) => (f.dsaConceptsDone.has(c.id) || solvedBy.has(c.id) ? i : a), -1);
  const dsaNext = new Set(lastDone >= 0 ? built.slice(lastDone + 1).filter((c) => !f.dsaConceptsDone.has(c.id)).slice(0, 2).map((c) => c.id) : []);
  const pr: LinkProgress = {
    sdmDone: f.sdmDone,
    sdmNext: new Set((snap?.next ?? []).map((n) => lessonKey(n.week, n.slug))),
    labsDone,
    dsaDone: f.dsaConceptsDone,
    dsaSolved: solvedBy,
    dsaNext,
  };
  let ctx: LinkCtx | null = null;
  if (ask.kind === "sdm") {
    const key = ask.key.replace(/^\/+|\/+$/g, "");
    ctx = { kind: "sdm", key, title: ix.lessons[key]?.title ?? "this lesson" };
  } else if (ask.kind === "dsa-concept") ctx = { kind: "dsa-concept", id: ask.id };
  else {
    const { getProblem } = await import("@/lib/dsa/load");
    const p = await within(getProblem(ask.id), 8000, null);
    if (!p) return [];
    const sdm = p.sdmLinks.filter((l) => l.kind !== "lab").map((l) => l.href.replace(/^\/+/, ""));
    const labs = p.sdmLinks.filter((l) => l.kind === "lab").map((l) => l.href.replace(/^\/labs\//, ""));
    ctx = { kind: "dsa-problem", id: p.id, concept: p.concept, sdm, labs };
  }
  return connections(ctx, ix, pr);
}

/* ------------------------------------------------------------------ the company plan */

export type CompanyPlanData = {
  company: { slug: string; name: string; href: string; rounds: string[]; focus: string[] };
  items: CompanyItem[];
  status: Record<string, ItemStatus>;
  weights: Record<Track, number>;
  bands: Partial<Record<Track, string>>;
  struggles: string[];
};

const scoreOf = (r: Readiness) => {
  const w = r.inputs.reduce((a, i) => a + i.weight, 0) || 1;
  return r.inputs.reduce((a, i) => a + i.score * i.weight, 0) / w;
};

export async function companyPlan(userId: string, slug: string): Promise<CompanyPlanData | null> {
  const [c, f, struggles] = await Promise.all([getCompany(slug), learnerFacts(userId), loadStruggles(userId).catch(() => [] as NamedStruggle[])]);
  if (!c || !f.map) return null;
  const tracks: Track[] = f.dsaOn ? ["sdm", "lld", "dsa"] : ["sdm", "lld"];
  const readiness = await within(loadReadiness(userId, tracks), 12_000, [] as Readiness[]);
  const rscore: Partial<Record<Track, number>> = {};
  const bands: Partial<Record<Track, string>> = {};
  for (const r of readiness) {
    rscore[r.track] = scoreOf(r);
    bands[r.track] = r.bandLabel;
  }
  const lessons = new Map(allLessons(f.map).map((l) => [l.href.replace(/^\/+/, ""), l]));
  const status: Record<string, ItemStatus> = {};
  const lists: Record<Track, CompanyItem[]> = { sdm: [], lld: [], dsa: [] };
  const seen = new Set<string>();
  const qTypes: Partial<Record<Track, number>> = {};

  // 1. the lessons the company's questions point to: reported questions first (the page's order)
  c.list.forEach((q, qi) => {
    const t: Track = q.type === "lld" ? "lld" : "sdm";
    qTypes[t] = (qTypes[t] ?? 0) + 1;
    for (const a of q.links) {
      const l = lessons.get(a.href.replace(/^\/+/, ""));
      if (!l) continue;
      const k = lessonKey(l.week, l.slug);
      const id = `lesson:${k}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const track: Track = l.kind === "lld" || /^\/?low-level-design\//.test(l.href) ? "lld" : t;
      const minutes = l.minutes > 0 ? l.minutes : 25;
      const done = f.sdmDone.has(k);
      const pct = f.sdmPct.get(k) ?? 0;
      status[id] = { done, left: done ? 0 : Math.max(5, Math.round(minutes * (1 - Math.min(95, pct) / 100))), doneAt: done ? f.done[`lesson:${k}`] || 1 : 0 };
      lists[track].push({
        id,
        kind: "lesson",
        week: l.week,
        title: l.title,
        tag: l.tag || l.label || "",
        href: l.href,
        minutes,
        splittable: true,
        track,
        why: `${q.evidence === "reported" ? "reported" : "likely"}: ${q.q}`,
        priority: (q.evidence === "reported" ? 1000 : 500) - qi,
      });
    }
  });

  // 2. a mock round per track, from the readiness levers (the code chose the link), at the end of that track's list
  for (const r of readiness) {
    const lever = r.levers.find((l) => l.id === "mocks" && l.link);
    if (!lever?.link || r.track === "dsa") continue;
    const id = `mock-lever:${r.track}:${lever.link.href}`;
    status[id] = { done: false, left: 60, doneAt: 0 };
    lists[r.track].push({ id, kind: "mock", week: null, title: lever.link.label, tag: "MOCK", href: lever.link.href, minutes: 60, splittable: false, track: r.track, why: lever.why || "a timed round under interview pressure", priority: 10 });
  }

  // 3. DSA for a coding round: the struggled concepts' practice first, then unfinished lessons in course order, then one
  // practice problem for each finished concept with fewer than two solves
  const weights = trackWeights(
    c.rounds.map((r) => `${r.name} ${r.note}`),
    rscore,
    qTypes,
  );
  if (f.dsaOn && weights.dsa > 0) {
    const built = f.dsa.concepts.filter((x) => x.status === "built");
    const byConcept = new Map<string, ProblemSummary[]>();
    for (const p of [...f.dsa.problems].sort((a, b) => a.order - b.order)) byConcept.set(p.concept, [...(byConcept.get(p.concept) ?? []), p]);
    const solvedIn = (cid: string) => (byConcept.get(cid) ?? []).filter((p) => f.dsaSolved.has(p.id)).length;
    const practice = (cid: string, why: string, priority: number) => {
      const p = (byConcept.get(cid) ?? []).find((x) => !f.dsaSolved.has(x.id));
      if (!p || seen.has(`dsa:p:${p.id}`)) return;
      seen.add(`dsa:p:${p.id}`);
      status[`dsa:p:${p.id}`] = { done: false, left: p.minutes ?? 25, doneAt: 0 };
      lists.dsa.push({ id: `dsa:p:${p.id}`, kind: "dsa", week: null, title: `Practice · ${p.title}`, tag: "DSA · PROBLEM", href: `/dsa/problems/${p.id}`, minutes: p.minutes ?? 25, splittable: false, track: "dsa", why, priority });
    };
    for (const s of struggles.filter((x) => x.key.startsWith("dsa:"))) practice(s.key.slice(4), `missed ${s.misses}× lately`, 900);
    let n = 0;
    for (const x of built) {
      if (n >= 14) break;
      const id = `dsa:c:${x.id}`;
      const done = f.dsaConceptsDone.has(x.id);
      if (!done) {
        status[id] = { done: false, left: 30, doneAt: 0 };
        lists.dsa.push({ id, kind: "dsa", week: null, title: x.title, tag: "DSA · LESSON", href: dsaHref(x), minutes: 30, splittable: true, track: "dsa", why: "the coding round: not finished yet", priority: 600 - n });
        n++;
      } else if (solvedIn(x.id) < 2) {
        practice(x.id, "the coding round: fewer than two solved", 550 - n);
        n++;
      }
    }
  }

  for (const t of tracks) lists[t].sort((a, b) => b.priority - a.priority);
  // recaps of open struggles first (done once their recap was opened since the last miss)
  const prefs = cleanNudgePrefs(f.flags[NUDGE_FLAG]);
  const recaps: CompanyItem[] = struggles.slice(0, 3).map((s) => {
    const id = `recap:${s.key}`;
    const d = recapDone(s, prefs);
    status[id] = { done: d, left: d ? 0 : RECAP_MINUTES, doneAt: d ? prefs.done[s.key] : 0 };
    return { id, kind: "recap", week: null, title: `Recap · ${s.label}`, tag: `RECAP · MISSED ${s.misses}×`, href: s.href, minutes: RECAP_MINUTES, splittable: false, track: s.course === "dsa" ? "dsa" : "sdm", why: `missed ${s.misses}× in two weeks`, priority: 2000 };
  });
  const items = interleave(lists, weights, recaps);
  return {
    company: { slug: c.slug, name: c.name, href: c.href, rounds: c.rounds.map((r) => r.name), focus: c.focus },
    items,
    status,
    weights,
    bands,
    struggles: struggles.slice(0, 3).map((s) => s.label),
  };
}
