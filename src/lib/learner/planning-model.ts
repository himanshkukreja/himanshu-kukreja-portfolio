/**
 * AI planning (owner-approved 12 Nov 2026; the AI audit's O7 and O8): the rules behind the living study plan, the quiet
 * nudges and the company-targeted plan. Deterministic and pure (type-only imports), so the API route, the components and
 * the Node tests (scripts/tests/planning.test.mjs) share it. The only AI is optional prose on top (a "why this week" line,
 * a company plan's priorities paragraph, an on-demand recap), never the dates or the order.
 *
 *   struggles        topics the learner missed twice or more in the last 14 days, from the outcome log (learner_events
 *                    and DSA submits): an explain-back below "solid", a wrong chat quiz answer, a DSA problem failed on a
 *                    day it wasn't solved. A later success on the same thing clears its earlier misses.
 *   recap items      one 10-minute recap slot per open struggle, put at the front of the live plan (never the accepted
 *                    baseline, so it can't count as "behind"); done once the learner opened the recap.
 *   nudge            at most one quiet line: a struggle ("you missed X twice: 3-minute recap?") first, else the plan's
 *                    "on track / behind" line. A dismissal is remembered until a new miss (or, for the plan line, the
 *                    next week). Stored in the game flag `pref:nudges` (newer copy wins across devices).
 *   path re-dating   a chat plan (a saved path with step dates) whose steps slipped: undone overdue steps move to today
 *                    and the steps after them keep their spacing.
 *   company plan     the items a company's interview asks for (its page's questions and rounds), ordered by the
 *                    learner's readiness and weak spots, interleaved across System Design, LLD and DSA, then scheduled
 *                    by the /plan engine (lib/learn/plan/schedule.ts).
 */
import type { OutcomeEvent } from "./events-model";
import type { ItemStatus, PlanItem } from "../learn/plan/schedule";

export const STRUGGLE_DAYS = 14;
export const STRUGGLE_MIN = 2;
export const RECAP_MINUTES = 10;
const DAY = 86_400_000;

/* ------------------------------------------------------------------ struggles */

export type StruggleCourse = "sdm" | "dsa";

/**
 * What an outcome says about a topic: its topic key, the unit a success clears (a DSA problem, else the topic itself),
 * and whether it was a miss (true), a success (false) or neither (null: a compile error, an ungraded answer).
 *   sdm:<concept id>       an explain-back on a System Design concept
 *   dsa:<concept id>       a DSA explain-back, or a submit on a problem of that concept
 *   lesson:<week>/<slug>   a chat quiz question from that lesson (checkpoint "cp:" and bank "mcq:" items that name it)
 */
export function classify(e: Pick<OutcomeEvent, "kind" | "ref" | "outcome">, conceptOfProblem: (id: string) => string | null): { key: string; unit: string; miss: boolean | null } | null {
  const o = (e.outcome || "").toLowerCase();
  if (e.kind === "explain_back") {
    const key = e.ref.startsWith("dsa:") ? e.ref : `sdm:${e.ref}`;
    return { key, unit: key, miss: o === "solid" ? false : o === "partial" || o === "misconception" ? true : null };
  }
  if (e.kind === "chat_quiz") {
    const m = e.ref.match(/^(?:cp|mcq):(week-[\w.-]+|bonus-problems|problem-bank|low-level-design)[/_]([\w.-]+?)(?:[#@_]|$)/);
    if (!m) return null;
    const key = `lesson:${m[1]}/${m[2]}`;
    return { key, unit: key, miss: o === "wrong" ? true : o === "right" ? false : null };
  }
  if (e.kind === "dsa_submit") {
    const c = conceptOfProblem(e.ref);
    if (!c) return null;
    const v = e.outcome || "";
    // a compile error is a typo, not a gap in the idea
    return { key: `dsa:${c}`, unit: `dsa:${c}|${e.ref}`, miss: v === "AC" ? false : v === "CE" || !v ? null : true };
  }
  return null;
}

export type Struggle = { key: string; course: StruggleCourse; misses: number; lastAt: number; firstAt: number };

/**
 * Open struggles, most misses first (then the most recent). A unit's misses before its latest success don't count; a DSA
 * problem counts once per day it was failed (ten quick resubmits are one bad afternoon, not ten misses).
 */
export function findStruggles(events: Pick<OutcomeEvent, "kind" | "ref" | "outcome" | "at">[], now: number, conceptOfProblem: (id: string) => string | null, o: { days?: number; min?: number } = {}): Struggle[] {
  const since = now - (o.days ?? STRUGGLE_DAYS) * DAY;
  const min = o.min ?? STRUGGLE_MIN;
  // oldest first, so a success clears what came before it
  const sorted = [...events].filter((e) => e.at >= since && e.at <= now + DAY).sort((a, b) => a.at - b.at);
  const units = new Map<string, { key: string; misses: Map<string, number> }>();
  for (const e of sorted) {
    const c = classify(e, conceptOfProblem);
    if (!c || c.miss === null) continue;
    const u = units.get(c.unit) ?? { key: c.key, misses: new Map<string, number>() };
    units.set(c.unit, u);
    if (!c.miss) {
      u.misses.clear();
      continue;
    }
    // per day for a DSA problem, per event otherwise
    const slot = c.unit.includes("|") ? new Date(e.at).toISOString().slice(0, 10) : `${e.at}:${u.misses.size}`;
    u.misses.set(slot, Math.max(u.misses.get(slot) ?? 0, e.at));
  }
  const byKey = new Map<string, Struggle>();
  for (const u of units.values()) {
    if (!u.misses.size) continue;
    const ats = [...u.misses.values()];
    const s = byKey.get(u.key) ?? { key: u.key, course: (u.key.startsWith("dsa:") ? "dsa" : "sdm") as StruggleCourse, misses: 0, lastAt: 0, firstAt: Infinity };
    s.misses += ats.length;
    s.lastAt = Math.max(s.lastAt, ...ats);
    s.firstAt = Math.min(s.firstAt, ...ats);
    byKey.set(u.key, s);
  }
  return [...byKey.values()].filter((s) => s.misses >= min).sort((a, b) => b.misses - a.misses || b.lastAt - a.lastAt);
}

/** A struggle with its words and links (the server names it from the course content). */
export type NamedStruggle = Struggle & {
  label: string;
  /** the section that teaches it (a lesson #anchor, a concept refresher or a DSA lesson) */
  href: string;
  /** true: an on-demand AI recap can be grounded in this topic's course text */
  recap: boolean;
};

/* ------------------------------------------------------------------ nudge preferences (game flag pref:nudges) */

export const NUDGE_FLAG = "pref:nudges";
export type NudgePrefs = { updatedAt: number; off: Record<string, number>; done: Record<string, number> };

const numMap = (v: unknown, max = 60): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  const es = Object.entries(v as Record<string, unknown>)
    .filter(([k, x]) => /^[\w:./@-]{1,160}$/.test(k) && Number.isFinite(Number(x)) && Number(x) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, max);
  for (const [k, x] of es) out[k] = Number(x);
  return out;
};
export function cleanNudgePrefs(v: unknown): NudgePrefs {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return { updatedAt: Number(o.updatedAt) || 0, off: numMap(o.off), done: numMap(o.done) };
}
/** The prefs with one key dismissed ("off") or its recap opened ("done") at `now`; bounded (the oldest go first). */
export function withNudge(p: NudgePrefs, what: "off" | "done", key: string, now: number): NudgePrefs {
  return { updatedAt: Math.max(now, p.updatedAt + 1), off: what === "off" ? numMap({ ...p.off, [key]: now }) : p.off, done: what === "done" ? numMap({ ...p.done, [key]: now }) : p.done };
}

/** A struggle's recap is done once opened after its latest miss. */
export const recapDone = (s: Pick<Struggle, "key" | "lastAt">, p: NudgePrefs) => (p.done[s.key] ?? 0) >= s.lastAt;

/* ------------------------------------------------------------------ the living plan's recap slots */

/** One recap slot per open struggle (at most `max`), for the front of the live plan. */
export function recapItems(struggles: NamedStruggle[], p: NudgePrefs, max = 3): { items: PlanItem[]; status: Record<string, ItemStatus> } {
  const items: PlanItem[] = [];
  const status: Record<string, ItemStatus> = {};
  for (const s of struggles.slice(0, max)) {
    const id = `recap:${s.key}`;
    items.push({ id, kind: "recap", week: null, title: `Recap · ${s.label}`, tag: `RECAP · MISSED ${s.misses}×`, href: s.href, minutes: RECAP_MINUTES, splittable: false });
    const done = recapDone(s, p);
    status[id] = { done, left: done ? 0 : RECAP_MINUTES, doneAt: done ? p.done[s.key] : 0 };
  }
  return { items, status };
}

/* ------------------------------------------------------------------ the plan line */

export type PlanStanding = { status: "on-track" | "behind" | "ahead" | "slightly-behind"; days: number; fits: boolean; target: string; past: boolean };

/** "On track for 15 Dec" / "2 study days behind: today's session catches up": the plan's quiet line, or null. */
export function planLine(s: PlanStanding | null, fmt: (d: string) => string): { key: string; text: string; tone: "ok" | "warn" } | null {
  if (!s || s.past) return null;
  if (s.status === "behind") return { key: `plan:behind`, text: `${s.days} study day${s.days === 1 ? "" : "s"} behind your plan to ${fmt(s.target)}. The dates have moved up to fit.`, tone: "warn" };
  if (!s.fits) return { key: `plan:nofit`, text: `Your plan to ${fmt(s.target)} runs past the date at this pace.`, tone: "warn" };
  if (s.status === "ahead") return { key: `plan:ahead`, text: `${s.days} study day${s.days === 1 ? "" : "s"} ahead of your plan to ${fmt(s.target)}.`, tone: "ok" };
  return { key: `plan:on-track`, text: `On track for ${fmt(s.target)}.`, tone: "ok" };
}

/** Monday (yyyy-mm-dd) of the week holding `day`. */
export function weekOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const wd = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - wd * DAY).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ the one nudge */

export type Nudge =
  | { kind: "struggle"; key: string; text: string; label: string; misses: number; href: string; recap: boolean; course: StruggleCourse }
  | { kind: "plan"; key: string; text: string; tone: "ok" | "warn"; href: string };

/**
 * At most one nudge: the newest open struggle the learner hasn't dismissed since its last miss and whose recap they
 * haven't opened (`course` first when given: the DSA home prefers DSA topics), else the plan line unless dismissed this
 * week. "on-track" lines are only shown when `showOk`, so a learner on track isn't told so on every visit.
 */
export function pickNudge(o: { struggles: NamedStruggle[]; prefs: NudgePrefs; plan: ReturnType<typeof planLine>; today: string; course?: StruggleCourse; showOk?: boolean }): Nudge | null {
  const open = o.struggles.filter((s) => (o.prefs.off[s.key] ?? 0) < s.lastAt && !recapDone(s, o.prefs));
  const pref = o.course ? [...open.filter((s) => s.course === o.course), ...open.filter((s) => s.course !== o.course)] : open;
  const s = pref[0];
  if (s) {
    const times = s.misses === 2 ? "twice" : `${s.misses} times`;
    return { kind: "struggle", key: s.key, label: s.label, misses: s.misses, href: s.href, recap: s.recap, course: s.course, text: `You missed ${s.label} ${times} in the last two weeks.` };
  }
  const p = o.plan;
  if (!p || (p.tone === "ok" && !o.showOk)) return null;
  const key = `${p.key}@${weekOf(o.today)}`;
  if (o.prefs.off[key]) return null;
  return { kind: "plan", key, text: p.text, tone: p.tone, href: "/plan" };
}

/* ------------------------------------------------------------------ re-dating a chat plan (saved path with dates) */

const toUtc = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};
const addDays = (d: string, n: number) => new Date(toUtc(d) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY);

/**
 * The steps' dates moved so nothing undone sits in the past: the earliest undone overdue step goes to today and every
 * undone step from its date on shifts by the same number of days (the plan's spacing stays). Done steps and steps without
 * a date keep theirs. Returns the new dates by step id (only the ones that changed) and how many days it slipped.
 */
export function redatePath(steps: { id: string; due?: string }[], isDone: (id: string) => boolean, today: string): { dues: Record<string, string>; slipped: number } {
  const undone = steps.filter((s) => s.due && !isDone(s.id));
  const overdue = undone.filter((s) => s.due! < today).map((s) => s.due!).sort();
  if (!overdue.length) return { dues: {}, slipped: 0 };
  const from = overdue[0];
  const shift = daysBetween(from, today);
  const dues: Record<string, string> = {};
  for (const s of undone) if (s.due! >= from) dues[s.id] = addDays(s.due!, shift);
  return { dues, slipped: shift };
}

/* ------------------------------------------------------------------ the company plan */

export type Track = "sdm" | "lld" | "dsa";
export type CompanyItem = PlanItem & { track: Track; why: string; priority: number };

/** The flag holding a company plan's settings (one at a time; its dates are recomputed from progress on every visit). */
export const COMPANY_PLAN_FLAG = "plan:co";
export type CompanyPlanRecord = { v: 1; company: string; name: string; target: string; minutes: number; days: number[]; createdAt: number; updatedAt: number };

export function cleanCompanyPlan(v: unknown): CompanyPlanRecord | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const company = typeof o.company === "string" && /^[a-z0-9-]{1,80}$/.test(o.company) ? o.company : null;
  const target = typeof o.target === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.target) ? o.target : null;
  if (!company || !target) return null;
  const days = Array.isArray(o.days) ? [...new Set(o.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [0, 1, 2, 3, 4];
  const minutes = Math.min(480, Math.max(15, Math.round(Number(o.minutes) || 60)));
  return { v: 1, company, name: typeof o.name === "string" ? o.name.slice(0, 80) : company, target, minutes, days: days.length ? days : [0, 1, 2, 3, 4], createdAt: Number(o.createdAt) || 0, updatedAt: Number(o.updatedAt) || 0 };
}

/**
 * The company plan's order: each track's own list stays in its priority order, and the tracks take turns by weight (a
 * weaker track, or one the company's rounds lean on, gets more turns), so a week mixes them instead of doing all of System
 * Design, then all of DSA. Recaps of open struggles go first. Deterministic: same inputs, same order.
 */
export function interleave(lists: Record<Track, CompanyItem[]>, weights: Record<Track, number>, recaps: CompanyItem[] = []): CompanyItem[] {
  const out: CompanyItem[] = [...recaps];
  const idx: Record<Track, number> = { sdm: 0, lld: 0, dsa: 0 };
  const credit: Record<Track, number> = { sdm: 0, lld: 0, dsa: 0 };
  const tracks: Track[] = ["sdm", "lld", "dsa"];
  const left = () => tracks.filter((t) => idx[t] < lists[t].length);
  for (let guard = 0; left().length && guard < 2000; guard++) {
    const live = left();
    for (const t of live) credit[t] += Math.max(0.05, weights[t]);
    const pick = live.sort((a, b) => credit[b] - credit[a] || tracks.indexOf(a) - tracks.indexOf(b))[0];
    out.push(lists[pick][idx[pick]++]);
    credit[pick] -= live.reduce((a, t) => a + Math.max(0.05, weights[t]), 0);
  }
  return out;
}

/**
 * How much of the plan each track gets: the company's rounds name the tracks it tests (a "Coding" round is DSA, "Machine
 * coding" or "LLD" is low-level design, "System design" is System Design), and a track gets more the further it is from
 * ready (readiness score 0-1). A track the company doesn't test gets none.
 */
export function trackWeights(rounds: string[], readiness: Partial<Record<Track, number>>, questionTypes: Partial<Record<Track, number>>): Record<Track, number> {
  const r = rounds.join(" | ").toLowerCase();
  const tests: Record<Track, boolean> = {
    sdm: /system design|design round|architecture|hld/.test(r) || (questionTypes.sdm ?? 0) > 0,
    lld: /machine coding|low[- ]level|lld|object[- ]oriented|ood/.test(r) || (questionTypes.lld ?? 0) > 0,
    dsa: /coding|dsa|algorithm|data structure|problem solving|online assessment|\boa\b/.test(r.replace(/machine coding/g, "")),
  };
  const w = {} as Record<Track, number>;
  for (const t of ["sdm", "lld", "dsa"] as Track[]) w[t] = tests[t] ? 0.4 + (1 - Math.min(1, Math.max(0, readiness[t] ?? 0))) : 0;
  return w;
}

/** The facts the company paragraph may use (numbers, labels and course titles only; never the learner's words). */
export function companyBrief(o: { company: string; rounds: string[]; focus: string[]; target: string; today: string; bands: Partial<Record<Track, string>>; weights: Record<Track, number>; struggles: string[]; first: { title: string; track: Track; why: string }[]; fits: boolean }): string {
  const label: Record<Track, string> = { sdm: "System design", lld: "Low-level design", dsa: "DSA" };
  const share = (["sdm", "lld", "dsa"] as Track[]).filter((t) => o.weights[t] > 0);
  const tot = share.reduce((a, t) => a + o.weights[t], 0) || 1;
  return [
    `Company: ${o.company}`,
    `Rounds: ${o.rounds.join("; ") || "not reported"}`,
    `Its questions lean on: ${o.focus.join(", ") || "not listed"}`,
    `Interview date: ${o.target} (${daysBetween(o.today, o.target)} days from today)`,
    `Readiness estimate per track: ${share.map((t) => `${label[t]}: ${o.bands[t] ?? "not started"}`).join("; ")}`,
    `Share of the plan: ${share.map((t) => `${label[t]} ${Math.round((o.weights[t] / tot) * 100)}%`).join(", ")}`,
    o.struggles.length ? `Missed twice or more lately (recaps first): ${o.struggles.join("; ")}` : "",
    `First items, in order: ${o.first.map((f, i) => `${i + 1}. ${f.title} (${label[f.track]}: ${f.why})`).join(" ")}`,
    o.fits ? "" : "The plan does not fit before the date at the chosen minutes a day.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A target date found in the learner's goal notes ("interview on 15 Dec", "2026-12-15", "Dec 15th"), if one is in the future. */
export function dateInText(text: string, today: string): string | null {
  const iso = text.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  let y = Number(today.slice(0, 4));
  let cand: string | null = null;
  if (iso) cand = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else {
    const m = text.toLowerCase().match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (!m) return null;
    const day = Number(m[1] ?? m[4]);
    const mon = MON.indexOf((m[2] ?? m[3]) as string) + 1;
    if (!day || day > 31 || !mon) return null;
    let c = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (c <= today) c = `${++y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cand = c;
  }
  if (!cand || Number.isNaN(toUtc(cand)) || new Date(toUtc(cand)).toISOString().slice(0, 10) !== cand) return null;
  return cand > today && daysBetween(today, cand) <= 400 ? cand : null;
}
