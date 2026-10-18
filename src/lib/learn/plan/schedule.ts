/**
 * Study planner: turns the course map + the learner's real progress + a target interview date into
 * a day-by-day plan, and measures how far the learner is from the plan they accepted.
 *
 * Pure and self-contained (type-only imports): the planner page, the progress card and the Node
 * test runner (scripts/tests/plan.test.mjs) all use this file.
 *
 * Algorithm
 *  1. Items in course order: each world's lessons, the trial part that tests a lesson right after
 *     it (Part N ↔ Day N / Foundations part N, "Integration" ↔ the boss, as the trial pages pair
 *     them), the boss, then the world's mock interview (or all mocks in the final stretch), then
 *     side quests. Done items drop out; a half-read lesson keeps only its unread minutes.
 *  2. Study dates: every date from `from` up to the day before the interview whose weekday is on.
 *  3. The last study dates form the final stretch: revision days (the last one is always the day
 *     before the interview), with the mock interviews between them when "mocks at the end".
 *  4. One catch-up (buffer) day per calendar week that has 3+ study days: its last study day.
 *  5. Items are packed into the remaining days at `minutes` per day (10% slack). Reading splits
 *     across days (chunks of 15+ min); trial parts and mocks don't, and a mock starts a fresh day.
 *  6. Didn't fit? Buffer days are turned into study days, latest first, until it fits. Still
 *     doesn't fit: the tail is listed as overflow and the page offers the minutes/day that fits.
 * Dates are yyyy-mm-dd and all date maths is done in UTC, so DST never adds or drops a day.
 */
import type { CourseLesson, CourseMap } from "../types";
import type { CourseMock } from "../mock/types";

// ---------------------------------------------------------------- types

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday … 6 = Sunday

export type PlanInclude = { core: boolean; bosses: boolean; trials: boolean; sideQuests: boolean; mocks: boolean };

export type PlanSettings = {
  /** yyyy-mm-dd: the interview. The plan ends the day before. */
  target: string;
  /** weekdays with study time, 0 = Monday */
  days: Weekday[];
  /** minutes per study day */
  minutes: number;
  /** "20:00": when sessions start (calendar export) */
  time: string;
  include: PlanInclude;
  mocksAt: "worlds" | "end";
  /** revision days in the final stretch */
  revision: number;
  /** one catch-up day per week */
  buffer: boolean;
  /** world to start from (earlier worlds are skipped); null = the first */
  startWeek: string | null;
  /** calendar reminder, minutes before; 0 = none */
  reminder: number;
};

export type PlanRecord = {
  v: 1;
  id: string;
  settings: PlanSettings;
  /** the accepted plan ("baseline") starts here … */
  baseStart: string;
  /** … and counts as done what was done before this moment (epoch ms) */
  baseAt: number;
  createdAt: number;
  updatedAt: number;
};

export type ItemKind = "lesson" | "boss" | "trial" | "sidequest" | "mock";

export type PlanItem = {
  /** game-style key: lesson:<week>/<slug>, boss:<week>, trial:<week>/part-<n>, mock:<id>, sidequest:<slug> */
  id: string;
  kind: ItemKind;
  /** world key; null for side quests and mocks in the final stretch */
  week: string | null;
  title: string;
  /** "W02 · DAY 03" */
  tag: string;
  href: string;
  minutes: number;
  splittable: boolean;
};

/** What the learner has done with an item. */
export type ItemStatus = {
  done: boolean;
  /** minutes still to read (in-progress lessons); ignored when done */
  left: number;
  /** epoch ms the item was finished, 0 when unknown */
  doneAt: number;
};

export type Entry = {
  id: string;
  kind: ItemKind | "revision";
  title: string;
  tag: string;
  href: string;
  /** minutes planned for this item on this day */
  minutes: number;
  /** chunk k of n when a lesson spans days */
  part: [number, number] | null;
  done: boolean;
};

export type DayType = "study" | "buffer" | "revision" | "mock";

export type PlanDay = { date: string; type: DayType; entries: Entry[]; minutes: number };

export type Schedule = {
  from: string;
  days: PlanDay[];
  /** items that didn't fit before the interview */
  overflow: { item: PlanItem; minutes: number }[];
  overflowMinutes: number;
  /** minutes of content to place (excluding revision) */
  workMinutes: number;
  /** study days available for content (incl. buffers) × minutes */
  capacityMinutes: number;
  fits: boolean;
  /** buffer days turned into study days to make it fit */
  buffersUsed: number;
  buffersLeft: number;
  /** last day with course content, null when nothing is left */
  contentEnd: string | null;
  stretchStart: string | null;
  studyDays: number;
  /** a reason the plan is empty: "past" (interview date passed), "no-days" (no weekday picked) */
  problem: "past" | "no-days" | "nothing-left" | null;
};

// ---------------------------------------------------------------- dates (UTC maths, no DST)

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toUtc = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};
const fromUtc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * 86_400_000);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
/** 0 = Monday */
export const weekdayOf = (d: string): Weekday => (((new Date(toUtc(d)).getUTCDay() + 6) % 7) as Weekday);
export const isDate = (s: unknown): s is string => typeof s === "string" && DATE.test(s) && !Number.isNaN(toUtc(s));

/** Local yyyy-mm-dd of an epoch ms (the learner's own calendar day). */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday of the week containing d */
const weekKey = (d: string) => addDays(d, -weekdayOf(d));

// ---------------------------------------------------------------- settings

export const DEFAULT_INCLUDE: PlanInclude = { core: true, bosses: true, trials: true, sideQuests: false, mocks: true };

export function defaultSettings(today: string, target?: string | null): PlanSettings {
  return {
    target: target && isDate(target) && target > today ? target : addDays(today, 8 * 7),
    days: [0, 1, 2, 3, 4],
    minutes: 60,
    time: "20:00",
    include: { ...DEFAULT_INCLUDE },
    mocksAt: "worlds",
    revision: 3,
    buffer: true,
    startWeek: null,
    reminder: 15,
  };
}

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** Validate anything read from storage or another device. null when unusable. */
export function cleanSettings(input: unknown): PlanSettings | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!isDate(o.target)) return null;
  const days = Array.isArray(o.days) ? Array.from(new Set(o.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort() : [];
  const inc = (o.include && typeof o.include === "object" ? o.include : {}) as Record<string, unknown>;
  const b = (k: keyof PlanInclude) => (typeof inc[k] === "boolean" ? (inc[k] as boolean) : DEFAULT_INCLUDE[k]);
  const time = typeof o.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.time) ? o.time : "20:00";
  return {
    target: o.target,
    days: days as Weekday[],
    minutes: clampInt(o.minutes, 15, 600, 60),
    time,
    include: { core: b("core"), bosses: b("bosses"), trials: b("trials"), sideQuests: b("sideQuests"), mocks: b("mocks") },
    mocksAt: o.mocksAt === "end" ? "end" : "worlds",
    revision: clampInt(o.revision, 0, 14, 3),
    buffer: o.buffer !== false,
    startWeek: typeof o.startWeek === "string" && /^week-\d+/.test(o.startWeek) ? o.startWeek : null,
    reminder: clampInt(o.reminder, 0, 24 * 60, 15),
  };
}

export function cleanRecord(input: unknown): PlanRecord | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const settings = cleanSettings(o.settings);
  if (!settings || typeof o.id !== "string" || !/^[a-z0-9]{6,32}$/.test(o.id) || !isDate(o.baseStart)) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { v: 1, id: o.id, settings, baseStart: o.baseStart, baseAt: n(o.baseAt), createdAt: n(o.createdAt), updatedAt: n(o.updatedAt) };
}

// ---------------------------------------------------------------- items

const pad = (n: number) => String(n).padStart(2, "0");
const minutesOf = (l: CourseLesson) => (l.minutes > 0 ? l.minutes : 20);
/** about a minute a question; the trial pages pass at 80% */
export const trialMinutes = (questions: number) => Math.max(10, Math.round(questions));

/** Every plannable item in course order for these settings (done or not). */
export function buildItems(map: CourseMap, s: PlanSettings): PlanItem[] {
  const out: PlanItem[] = [];
  const weeks = [...map.weeks].sort((a, b) => a.num - b.num);
  const startNum = s.startWeek ? weeks.find((w) => w.key === s.startWeek)?.num ?? -1 : -1;
  const inRange = (num: number) => num >= startNum;
  const mocks: CourseMock[] = [...(map.mocks || [])].sort((a, b) => a.n - b.n);
  const mockItem = (m: CourseMock, week: string | null): PlanItem => ({
    id: `mock:${m.id}`,
    kind: "mock",
    week,
    title: `Mock interview · ${m.company} · ${m.title}`,
    tag: `MOCK ${pad(m.n)}`,
    href: m.href,
    minutes: m.minutes > 0 ? m.minutes : 60,
    splittable: false,
  });
  const lessonItem = (l: CourseLesson, kind: "lesson" | "boss" | "sidequest"): PlanItem => ({
    id: kind === "boss" ? `boss:${l.week}` : `lesson:${l.week}/${l.slug}`,
    kind,
    week: kind === "sidequest" ? null : l.week,
    title: kind === "boss" ? `Boss · ${l.title}` : l.kind === "week-preview" ? `Preview · ${l.title}` : l.title,
    tag: l.tag,
    href: l.href,
    minutes: minutesOf(l),
    splittable: true,
  });

  for (const w of weeks) {
    if (!inRange(w.num)) continue;
    // trial part → the lesson it tests (same pairing as the trial page)
    const pool = w.lessons.filter((l) => l.kind !== "week-preview");
    const afterLesson = new Map<string, number[]>();
    const afterBoss: number[] = [];
    (w.trial?.parts || []).forEach((p, idx) => {
      if (/integration/i.test(p.title) || (/advanced/i.test(p.title) && !pool[idx]) || !pool[idx]) afterBoss.push(p.n);
      else afterLesson.set(pool[idx].slug, [...(afterLesson.get(pool[idx].slug) || []), p.n]);
    });
    const trialItem = (n: number): PlanItem => {
      const p = w.trial!.parts.find((x) => x.n === n)!;
      return {
        id: `trial:${w.trial!.week}/part-${n}`,
        kind: "trial",
        week: w.key,
        title: `Trial part ${n} · ${p.title}`,
        tag: `W${w.code} · TRIAL ${n}`,
        href: p.href,
        minutes: trialMinutes(p.questions),
        splittable: false,
      };
    };
    for (const l of w.lessons) {
      if (s.include.core) out.push(lessonItem(l, "lesson"));
      if (s.include.trials) (afterLesson.get(l.slug) || []).forEach((n) => out.push(trialItem(n)));
    }
    if (w.boss && s.include.bosses) out.push(lessonItem(w.boss, "boss"));
    if (s.include.trials) afterBoss.forEach((n) => out.push(trialItem(n)));
    if (s.include.mocks && s.mocksAt === "worlds") mocks.filter((m) => m.after === w.key).forEach((m) => out.push(mockItem(m, w.key)));
  }
  if (s.include.sideQuests) map.sideQuests.forEach((q) => out.push(lessonItem(q, "sidequest")));
  return out;
}

/** Mocks for the final stretch (mocksAt "end"): every mock, in order. */
export function stretchMocks(map: CourseMap, s: PlanSettings): PlanItem[] {
  if (!s.include.mocks || s.mocksAt !== "end") return [];
  return [...(map.mocks || [])]
    .sort((a, b) => a.n - b.n)
    .map((m) => ({
      id: `mock:${m.id}`,
      kind: "mock" as const,
      week: null,
      title: `Mock interview · ${m.company} · ${m.title}`,
      tag: `MOCK ${pad(m.n)}`,
      href: m.href,
      minutes: m.minutes > 0 ? m.minutes : 60,
      splittable: false,
    }));
}

// ---------------------------------------------------------------- scheduling

export type ScheduleInput = {
  items: PlanItem[];
  /** mocks for the final stretch */
  stretch: PlanItem[];
  status: Record<string, ItemStatus>;
  settings: PlanSettings;
  /** first day the plan may use */
  from: string;
  /** items finished before this moment (epoch ms) are left out; later ones stay, marked done */
  cutoff: number;
};

const SLACK = 0.1;
const MIN_CHUNK = 15;

export const REVISION_ENTRY = (minutes: number, last: boolean): Entry => ({
  id: last ? "revision:final" : "revision",
  kind: "revision",
  title: last ? "Final revision · review queue, cheat sheets, numbers drill, sleep early" : "Revision · review queue, weak trial parts, numbers drill",
  tag: "REVISION",
  href: "/learn/review",
  minutes,
  part: null,
  done: false,
});

type Work = { item: PlanItem; minutes: number; done: boolean };

function workList(items: PlanItem[], status: Record<string, ItemStatus>, cutoff: number): Work[] {
  const out: Work[] = [];
  for (const item of items) {
    const st = status[item.id];
    if (st?.done) {
      // finished before the plan began: not part of it. Finished since: keep its slot, ticked.
      if (st.doneAt && st.doneAt >= cutoff) out.push({ item, minutes: item.minutes, done: true });
      continue;
    }
    const left = st ? Math.min(item.minutes, Math.max(0, st.left)) : item.minutes;
    if (left <= 0.5) continue;
    out.push({ item, minutes: Math.max(5, Math.round(left)), done: false });
  }
  return out;
}

/** Pack work into content days. Returns the per-day entries and what didn't fit. */
function pack(work: Work[], days: string[], cap: number) {
  const slots: Entry[][] = days.map(() => []);
  const used: number[] = days.map(() => 0);
  const overflow: { item: PlanItem; minutes: number }[] = [];
  let d = 0;
  const slack = Math.max(5, cap * SLACK);
  for (const w of work) {
    let m = w.minutes;
    const chunks: { day: number; minutes: number }[] = [];
    // a mock interview starts on a fresh day
    if (w.item.kind === "mock" && d < days.length && used[d] > 0) d++;
    while (m > 0) {
      if (d >= days.length) {
        overflow.push({ item: w.item, minutes: m });
        break;
      }
      const free = cap - used[d];
      if (m <= free + slack) {
        chunks.push({ day: d, minutes: m });
        used[d] += m;
        m = 0;
        if (used[d] >= cap) d++;
      } else if (w.item.splittable && free >= MIN_CHUNK && m - free >= MIN_CHUNK) {
        chunks.push({ day: d, minutes: free });
        used[d] += free;
        m -= free;
        d++;
      } else if (used[d] === 0) {
        // longer than a whole day and can't be split: it gets the day to itself
        chunks.push({ day: d, minutes: m });
        used[d] += m;
        m = 0;
        d++;
      } else {
        d++;
      }
    }
    const spilled = overflow.length > 0 && overflow[overflow.length - 1].item === w.item;
    const total = chunks.length + (spilled ? 1 : 0);
    chunks.forEach((c, k) =>
      slots[c.day].push({
        id: w.item.id,
        kind: w.item.kind,
        title: w.item.title,
        tag: w.item.tag,
        href: w.item.href,
        minutes: Math.round(c.minutes),
        part: total > 1 ? [k + 1, total] : null,
        done: w.done,
      })
    );
  }
  return { slots, overflow };
}

export function schedule(input: ScheduleInput): Schedule {
  const { settings: s, from } = input;
  const cap = Math.max(15, s.minutes);
  const empty = (problem: Schedule["problem"]): Schedule => ({
    from,
    days: [],
    overflow: [],
    overflowMinutes: 0,
    workMinutes: 0,
    capacityMinutes: 0,
    fits: problem === "nothing-left",
    buffersUsed: 0,
    buffersLeft: 0,
    contentEnd: null,
    stretchStart: null,
    studyDays: 0,
    problem,
  });
  if (!isDate(from) || !isDate(s.target) || s.target <= from) return empty("past");
  const on = new Set(s.days);
  if (!on.size) return empty("no-days");

  const study: string[] = [];
  for (let d = from; d < s.target; d = addDays(d, 1)) if (on.has(weekdayOf(d))) study.push(d);
  if (!study.length) return empty("no-days");

  const work = workList(input.items, input.status, input.cutoff);
  const stretchWork = workList(input.stretch, input.status, input.cutoff);

  // final stretch: revision days, with the stretch mocks between them; never more than half the days
  const R = Math.max(0, s.revision);
  const M = stretchWork.length;
  const stretchLen = Math.min(R + M, Math.floor(study.length / 2));
  const stretchDays = study.slice(study.length - stretchLen);
  const pattern: ("revision" | "mock")[] = [];
  {
    let r = R;
    let m = M;
    // from the end: revision first (the day before the interview), then alternate
    while (pattern.length < stretchLen) {
      const wantRev = pattern.length % 2 === 0 ? r > 0 : m <= 0;
      if (wantRev && r > 0) {
        pattern.push("revision");
        r--;
      } else if (m > 0) {
        pattern.push("mock");
        m--;
      } else {
        pattern.push("revision");
        r--;
      }
    }
    pattern.reverse();
  }
  const mocksInStretch = pattern.filter((p) => p === "mock").length;
  // stretch mocks that didn't get a day go back into the content queue
  const lateMocks = stretchWork.slice(mocksInStretch);

  const contentDates = study.slice(0, study.length - stretchLen);
  // buffers: the last study day of each calendar week with 3+ study days
  const perWeek = new Map<string, string[]>();
  contentDates.forEach((d) => perWeek.set(weekKey(d), [...(perWeek.get(weekKey(d)) || []), d]));
  const buffers: string[] = [];
  if (s.buffer) perWeek.forEach((ds) => ds.length >= 3 && buffers.push(ds[ds.length - 1]));
  buffers.sort();

  const allWork = [...work, ...lateMocks];
  const workMinutes = allWork.reduce((a, w) => a + w.minutes, 0);
  let bufferSet = new Set(buffers);
  let used = 0;
  let packed = pack(
    allWork,
    contentDates.filter((d) => !bufferSet.has(d)),
    cap
  );
  while (packed.overflow.length && bufferSet.size) {
    // turn the latest remaining buffer into a study day and try again
    const latest = [...bufferSet].sort().pop()!;
    bufferSet = new Set([...bufferSet].filter((d) => d !== latest));
    used++;
    packed = pack(
      allWork,
      contentDates.filter((d) => !bufferSet.has(d)),
      cap
    );
  }
  const studyDates = contentDates.filter((d) => !bufferSet.has(d));
  const byDate = new Map<string, PlanDay>();
  studyDates.forEach((d, i) => byDate.set(d, { date: d, type: "study", entries: packed.slots[i], minutes: packed.slots[i].reduce((a, e) => a + e.minutes, 0) }));
  bufferSet.forEach((d) => byDate.set(d, { date: d, type: "buffer", entries: [], minutes: 0 }));
  let mi = 0;
  stretchDays.forEach((d, i) => {
    if (pattern[i] === "mock") {
      const w = stretchWork[mi++];
      byDate.set(d, {
        date: d,
        type: "mock",
        entries: [{ id: w.item.id, kind: "mock", title: w.item.title, tag: w.item.tag, href: w.item.href, minutes: w.item.minutes, part: null, done: w.done }],
        minutes: w.item.minutes,
      });
    } else {
      const last = i === stretchDays.length - 1;
      byDate.set(d, { date: d, type: "revision", entries: [REVISION_ENTRY(cap, last)], minutes: cap });
    }
  });
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  // trailing study days with nothing on them (finished early): leave them off the plan
  let lastContent = -1;
  days.forEach((d, i) => d.type === "study" && d.entries.length && (lastContent = i));
  const trimmed = days.filter((d, i) => d.type !== "study" || d.entries.length > 0 || i < lastContent);
  const contentEnd = lastContent >= 0 ? days[lastContent].date : null;
  const overflowMinutes = packed.overflow.reduce((a, o) => a + o.minutes, 0);
  used = Math.min(used, buffers.length);
  // drop buffer days after the content is finished: nothing to catch up on
  const finalDays = trimmed.filter((d) => d.type !== "buffer" || (contentEnd !== null && d.date < contentEnd));
  return {
    from,
    days: finalDays,
    overflow: packed.overflow,
    overflowMinutes,
    workMinutes,
    capacityMinutes: contentDates.length * cap,
    fits: packed.overflow.length === 0,
    buffersUsed: used,
    buffersLeft: [...bufferSet].filter((d) => contentEnd !== null && d < contentEnd).length,
    contentEnd,
    stretchStart: stretchDays[0] ?? null,
    studyDays: study.length,
    problem: allWork.length === 0 && stretchWork.length === 0 ? "nothing-left" : null,
  };
}

/** Smallest minutes/day (5-minute steps, up to 8 h) at which everything fits, or null. */
export function minutesToFit(input: ScheduleInput): number | null {
  const at = (m: number) => schedule({ ...input, settings: { ...input.settings, minutes: m } }).fits;
  if (at(input.settings.minutes)) return input.settings.minutes;
  let lo = input.settings.minutes;
  let hi = 480;
  if (!at(hi)) return null;
  while (hi - lo > 5) {
    const mid = Math.round((lo + hi) / 10) * 5;
    if (mid <= lo || mid >= hi) break;
    if (at(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ---------------------------------------------------------------- progress against the plan

export type Drift = {
  status: "on-track" | "behind" | "ahead" | "slightly-behind";
  /** whole study days of work, rounded */
  days: number;
  /** minutes of planned work not done yet from days before today */
  behindMinutes: number;
  /** minutes of work done that the plan scheduled after today */
  aheadMinutes: number;
};

/**
 * Compare the accepted plan with what's done: planned before today but not done is "behind",
 * done but planned after today is "ahead". In study days at the plan's minutes per day.
 */
export function drift(baseline: Schedule, items: PlanItem[], status: Record<string, ItemStatus>, today: string, cap: number): Drift {
  const minutesOf = new Map(items.map((i) => [i.id, i.minutes]));
  const before = new Map<string, number>();
  const through = new Map<string, number>();
  baseline.days.forEach((d) =>
    d.entries.forEach((e) => {
      if (e.kind === "revision") return;
      if (d.date < today) before.set(e.id, (before.get(e.id) || 0) + e.minutes);
      if (d.date <= today) through.set(e.id, (through.get(e.id) || 0) + e.minutes);
    })
  );
  const planned = new Map<string, number>();
  baseline.days.forEach((d) => d.entries.forEach((e) => e.kind !== "revision" && planned.set(e.id, (planned.get(e.id) || 0) + e.minutes)));
  let behind = 0;
  let ahead = 0;
  planned.forEach((total, id) => {
    const st = status[id];
    const full = minutesOf.get(id) ?? total;
    // how much of this item's planned minutes are done
    const doneShare = st?.done ? 1 : st ? Math.max(0, Math.min(1, 1 - st.left / Math.max(1, full))) : 0;
    const doneMin = doneShare * total;
    behind += Math.max(0, (before.get(id) || 0) - doneMin);
    ahead += Math.max(0, doneMin - (through.get(id) || 0));
  });
  const net = behind - ahead;
  const days = Math.round(Math.abs(net) / Math.max(1, cap));
  const status_: Drift["status"] = days >= 1 ? (net > 0 ? "behind" : "ahead") : net > 5 ? "slightly-behind" : "on-track";
  return { status: status_, days, behindMinutes: Math.round(behind), aheadMinutes: Math.round(ahead) };
}

// ---------------------------------------------------------------- small helpers for the UI

export function dayTitle(day: PlanDay): string {
  if (day.type === "buffer") return "Catch-up day";
  if (day.type === "revision") return day.entries[0]?.id === "revision:final" ? "Final revision" : "Revision day";
  if (day.type === "mock") return day.entries[0]?.title || "Mock interview";
  const first = day.entries[0];
  if (!first) return "Study";
  const more = day.entries.length - 1;
  const part = first.part ? ` (${first.part[0]}/${first.part[1]})` : "";
  return `${first.title}${part}${more > 0 ? ` + ${more} more` : ""}`;
}

export function newPlanId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `p${Date.now().toString(36)}${rnd}`.slice(0, 20);
}
