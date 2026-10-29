/**
 * Study plan for a goal ("crack the Amazon SDE2 loop", "learn caching for Friday"): an ordered list of course
 * items packed into dated study days, plus an RFC 5545 calendar of it. Used by the course chat (a tool that
 * turns a learning path into a schedule) and by You → Saved paths (a path whose steps carry `due` dates
 * downloads as an .ics). The full planner at /learn/plan (lib/learn/plan/schedule.ts) is the course-wide
 * one; this is the light, item-list version.
 *
 * Time per item comes from the course's own estimates, in this order:
 *   minutes          an explicit total (wins)
 *   readingMinutes   CourseLesson.minutes: the reader header's formula (lib/reading-time.ts, 130 wpm + 2 min a
 *                    code block), computed in lib/learn/course.ts for every lesson, quest, problem and LLD round
 *   words            when only a word count is known: ceil(words / 130), the same reading speed
 *   lectureMinutes   LectureSummary.minutes / lectureCard().minutes (lib/learn/lecture/load.ts: narration words
 *                    at 150 wpm + 8%)
 *   labMinutes       LabSummary.minutes (lib/learn/labs, the lab file's `minutes`, default 30)
 * reading + lecture + lab are added up; an item with none of them gets a per-kind default (DEFAULT_MINUTES).
 *
 * Layout of a plan over `days` calendar days from `startDate` (the goal date is the day after the last one):
 *   study days    every day, or Monday-Friday with `skipWeekends`
 *   final day     mock practice (a mock item from the list when there is one, else the mock lobby)
 *   revision      the study days just before the final day (1 from 5 study days, 2 from 12), each revisiting
 *                 its share of the items plus the review queue
 *   content       the rest, packed in order at hoursPerDay (10% slack). Reading splits across days in chunks
 *                 of 15+ min; mocks, trials, labs and problems don't. What doesn't fit is `overflow`.
 *
 * Pure and self-contained (type-only imports): the Node tests (scripts/tests/study-plan.test.mjs) load it
 * directly. Dates are yyyy-mm-dd and all date maths is UTC, so neither DST nor the machine's zone moves a day;
 * calendar events are all-day (VALUE=DATE), so they sit on the same date in Asia/Kolkata or anywhere else.
 */
import type { SavedPath } from "./saved-paths";

// ---------------------------------------------------------------- types

export type StudyItem = {
  /** stable id (search index id L:week/slug, a game key lesson:week/slug, …) */
  id: string;
  /** search kind (lesson, lecture, lab, quest, problem, lld, mock, …) or plan kind (trial, boss, review) */
  kind: string;
  title: string;
  /** site-relative ("/learn/…") or absolute https */
  href: string;
  /** explicit total minutes (wins over the parts below) */
  minutes?: number;
  /** reading minutes (CourseLesson.minutes) */
  readingMinutes?: number;
  /** word count, when reading minutes aren't known */
  words?: number;
  /** lecture minutes (LectureSummary.minutes) */
  lectureMinutes?: number;
  /** lab minutes (LabSummary.minutes) */
  labMinutes?: number;
  /** may be split across days; default by kind (reading yes, a mock / trial / lab / problem no) */
  splittable?: boolean;
};

export type StudyStepKind = string;

export type StudyStep = {
  /** the item's id; revision steps are `revise:<item id>`, the review queue `review-queue`, generic mock `mock-practice` */
  id: string;
  kind: StudyStepKind;
  title: string;
  href: string;
  minutes: number;
  /** chunk k of n when an item spans days */
  part: [number, number] | null;
};

export type StudyDayType = "study" | "revision" | "mock";

export type StudyDay = {
  /** yyyy-mm-dd */
  date: string;
  /** 1-based study-day number */
  n: number;
  type: StudyDayType;
  minutes: number;
  steps: StudyStep[];
};

export type StudyPlan = {
  v: 1;
  /** stable for the same goal + start date (calendar UIDs build on it) */
  id: string;
  goal: string;
  startDate: string;
  /** last calendar day of the plan */
  endDate: string;
  /** the day after the plan: the interview / deadline */
  goalDate: string;
  hoursPerDay: number;
  minutesPerDay: number;
  skipWeekends: boolean;
  /** dated days with something on them, in order */
  days: StudyDay[];
  /** items (or their tails) that didn't fit before the revision days */
  overflow: { item: StudyItem; minutes: number }[];
  fits: boolean;
  /** minutes of course items to study (excluding revision and the mock day) */
  workMinutes: number;
  /** hours/day (0.5 steps) at which everything would fit, or null when it already does */
  suggestedHoursPerDay: number | null;
  /** why the plan is empty: no study day in the range, or nothing to study */
  problem: "no-days" | "no-items" | null;
};

export type BuildStudyPlanInput = {
  goal: string;
  /** calendar days the plan spans, from startDate (1-366) */
  days: number;
  /** yyyy-mm-dd, the first day */
  startDate: string;
  hoursPerDay: number;
  /** course items in the order to study them */
  items: StudyItem[];
  /** study Monday-Friday only */
  skipWeekends?: boolean;
  /** override the number of revision days (clamped so at least one content day remains) */
  revisionDays?: number;
};

// ---------------------------------------------------------------- dates (UTC maths)

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toUtc = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};
const p2 = (n: number) => String(n).padStart(2, "0");
const fromUtc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
};
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * 86_400_000);
/** a real calendar date in yyyy-mm-dd (2026-02-30 is not) */
export const isDate = (s: unknown): s is string => typeof s === "string" && DATE.test(s) && fromUtc(toUtc(s)) === s;
/** 0 = Monday … 6 = Sunday */
export const weekdayOf = (d: string) => (new Date(toUtc(d)).getUTCDay() + 6) % 7;
export const isWeekend = (d: string) => weekdayOf(d) >= 5;

// ---------------------------------------------------------------- estimates

/** Minutes for an item with no estimate of its own, by kind (search kinds + plan kinds). */
export const DEFAULT_MINUTES: Record<string, number> = {
  lesson: 25,
  section: 10,
  lecture: 15,
  moment: 5,
  short: 2,
  quest: 35,
  problem: 45,
  lld: 60,
  case: 20,
  mock: 60,
  war: 15,
  concept: 5,
  faq: 3,
  lfaq: 3,
  lab: 30,
  drill: 10,
  sheet: 10,
  card: 5,
  trail: 15,
  company: 15,
  trial: 15,
  boss: 60,
  review: 20,
};
const FALLBACK_MINUTES = 20;
/** reading speed the course uses for technical prose (lib/reading-time.ts) */
export const WORDS_PER_MINUTE = 130;

const SPLITTABLE_KINDS = new Set(["lesson", "quest", "boss", "case", "war", "trail", "section", "company", "lecture", "sheet"]);

const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** The item's study time in whole minutes (see the file header for the order). */
export function estimateMinutes(item: Pick<StudyItem, "kind" | "minutes" | "readingMinutes" | "words" | "lectureMinutes" | "labMinutes">): number {
  if (pos(item.minutes)) return Math.max(1, Math.round(pos(item.minutes)));
  const reading = pos(item.readingMinutes) || (pos(item.words) ? Math.ceil(pos(item.words) / WORDS_PER_MINUTE) : 0);
  const total = reading + pos(item.lectureMinutes) + pos(item.labMinutes);
  if (total > 0) return Math.max(1, Math.round(total));
  return DEFAULT_MINUTES[item.kind] ?? FALLBACK_MINUTES;
}

export const isSplittable = (item: Pick<StudyItem, "kind" | "splittable">) => (typeof item.splittable === "boolean" ? item.splittable : SPLITTABLE_KINDS.has(item.kind));

// ---------------------------------------------------------------- ids

/** FNV-1a 32-bit, base 36 */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Same goal + start date → same id, so a re-planned calendar updates its events instead of duplicating them. */
export const studyPlanId = (goal: string, startDate: string) => `sp${hash(`${goal.trim().toLowerCase()}|${startDate}`)}`;

// ---------------------------------------------------------------- packing

const SLACK = 0.1;
const MIN_CHUNK = 15;
const REVIEW_QUEUE_MIN = 20;
const MOCK_HREF = "/learn/mock";
const REVIEW_HREF = "/learn/review";
const MAX_REVISE_STEPS = 8;

type Work = { item: StudyItem; minutes: number; split: boolean };

function pack(work: Work[], dayCount: number, cap: number) {
  const slots: StudyStep[][] = Array.from({ length: dayCount }, () => []);
  const used: number[] = Array.from({ length: dayCount }, () => 0);
  const overflow: { item: StudyItem; minutes: number }[] = [];
  const slack = Math.max(5, cap * SLACK);
  let d = 0;
  for (const w of work) {
    let m = w.minutes;
    const chunks: { day: number; minutes: number }[] = [];
    while (m > 0) {
      if (d >= dayCount) {
        overflow.push({ item: w.item, minutes: m });
        break;
      }
      const free = cap - used[d];
      if (m <= free + slack) {
        chunks.push({ day: d, minutes: m });
        used[d] += m;
        m = 0;
        if (used[d] >= cap) d++;
      } else if (w.split && free >= MIN_CHUNK && m - free >= MIN_CHUNK) {
        chunks.push({ day: d, minutes: free });
        used[d] += free;
        m -= free;
        d++;
      } else if (used[d] === 0) {
        // longer than a whole day and can't be split: the day is its own
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
      slots[c.day].push({ id: w.item.id, kind: w.item.kind, title: w.item.title, href: w.item.href, minutes: Math.round(c.minutes), part: total > 1 ? [k + 1, total] : null }),
    );
  }
  return { slots, overflow, used };
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");

/** Revision days in the final stretch for this many study days (before the mock day). */
export const revisionDaysFor = (studyDays: number) => (studyDays >= 12 ? 2 : studyDays >= 5 ? 1 : 0);

/**
 * Turn an ordered list of course items into dated study days: content, then revision, then a final mock
 * practice day. Never throws; an empty range or list gives an empty plan with `problem` set.
 */
export function buildStudyPlan(input: BuildStudyPlanInput): StudyPlan {
  const goal = clean(input.goal, 200) || "Study plan";
  // no valid start: today in India (the site's default zone, UTC+5:30, no DST)
  const startDate = isDate(input.startDate) ? input.startDate : fromUtc(Date.now() + 330 * 60_000);
  const span = Math.min(366, Math.max(1, Math.floor(Number(input.days) || 1)));
  const hours = Math.min(16, Math.max(0.25, Number(input.hoursPerDay) || 1));
  const cap = Math.round(hours * 60);
  const skipWeekends = !!input.skipWeekends;
  const endDate = addDays(startDate, span - 1);
  const base = {
    v: 1 as const,
    id: studyPlanId(goal, startDate),
    goal,
    startDate,
    endDate,
    goalDate: addDays(endDate, 1),
    hoursPerDay: hours,
    minutesPerDay: cap,
    skipWeekends,
  };

  const items: StudyItem[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(input.items) ? input.items.slice(0, 500) : []) {
    if (!raw || typeof raw !== "object") continue;
    const id = clean(raw.id, 200);
    const title = clean(raw.title, 200);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    items.push({ ...raw, id, title, kind: clean(raw.kind, 20) || "lesson", href: clean(raw.href, 500) });
  }

  const study: string[] = [];
  for (let i = 0; i < span; i++) {
    const d = addDays(startDate, i);
    if (!skipWeekends || !isWeekend(d)) study.push(d);
  }
  const empty = (problem: StudyPlan["problem"]): StudyPlan => ({ ...base, days: [], overflow: [], fits: problem === "no-items", workMinutes: 0, suggestedHoursPerDay: null, problem });
  if (!study.length) return empty("no-days");
  if (!items.length) return empty("no-items");

  // the final day: a mock from the list (the last one), else the mock lobby
  const mockIdx = items.map((i) => i.kind).lastIndexOf("mock");
  const hasMockDay = study.length >= 2;
  const mockItem = hasMockDay && mockIdx >= 0 ? items[mockIdx] : null;
  const content = mockItem ? items.filter((_, i) => i !== mockIdx) : items;
  const want = typeof input.revisionDays === "number" && Number.isFinite(input.revisionDays) ? Math.max(0, Math.floor(input.revisionDays)) : revisionDaysFor(study.length);
  const revisionCount = Math.max(0, Math.min(want, study.length - (hasMockDay ? 1 : 0) - 1));
  const contentDates = study.slice(0, study.length - revisionCount - (hasMockDay ? 1 : 0));
  const revisionDates = study.slice(contentDates.length, contentDates.length + revisionCount);
  const mockDate = hasMockDay ? study[study.length - 1] : null;

  const work: Work[] = content.map((item) => ({ item, minutes: estimateMinutes(item), split: isSplittable(item) }));
  const workMinutes = work.reduce((a, w) => a + w.minutes, 0);
  const packed = pack(work, contentDates.length, cap);

  const days: StudyDay[] = [];
  contentDates.forEach((date, i) => {
    const steps = packed.slots[i];
    if (steps.length) days.push({ date, n: 0, type: "study", minutes: steps.reduce((a, s) => a + s.minutes, 0), steps });
  });

  // revision: each day revisits its share of the items (by minutes, in order) after the review queue
  if (revisionDates.length) {
    const groups: Work[][] = revisionDates.map(() => []);
    // only what the plan actually studies (an item that overflowed entirely isn't revised)
    const studied = new Set(packed.slots.flat().map((s) => s.id));
    const revise = work.filter((x) => studied.has(x.item.id));
    const reviseMinutes = revise.reduce((a, w) => a + w.minutes, 0);
    let acc = 0;
    for (const w of revise) {
      const k = Math.min(revisionDates.length - 1, Math.floor((acc / Math.max(1, reviseMinutes)) * revisionDates.length));
      groups[k].push(w);
      acc += w.minutes;
    }
    revisionDates.forEach((date, k) => {
      const queue = Math.min(REVIEW_QUEUE_MIN, cap);
      const steps: StudyStep[] = [{ id: "review-queue", kind: "review", title: "Review queue: the cards due today", href: REVIEW_HREF, minutes: queue, part: null }];
      // the longest items get the time; at most MAX_REVISE_STEPS, each at least 5 minutes
      const pick = [...groups[k]].sort((a, b) => b.minutes - a.minutes).slice(0, MAX_REVISE_STEPS);
      const keep = new Set(pick.map((w) => w.item.id));
      const ordered = groups[k].filter((w) => keep.has(w.item.id));
      const left = Math.max(0, cap - queue);
      const per = ordered.length ? Math.max(5, Math.floor(left / ordered.length)) : 0;
      for (const w of ordered) {
        if (steps.reduce((a, s) => a + s.minutes, 0) + 5 > cap + Math.max(5, cap * SLACK)) break;
        steps.push({ id: `revise:${w.item.id}`, kind: "revision", title: `Revise · ${w.item.title}`, href: w.item.href, minutes: Math.min(per, w.minutes), part: null });
      }
      days.push({ date, n: 0, type: "revision", minutes: steps.reduce((a, s) => a + s.minutes, 0), steps });
    });
  }

  if (mockDate) {
    const steps: StudyStep[] = mockItem
      ? [{ id: mockItem.id, kind: "mock", title: mockItem.title, href: mockItem.href, minutes: estimateMinutes(mockItem), part: null }]
      : [{ id: "mock-practice", kind: "mock", title: `Mock interview practice: ${goal}`, href: MOCK_HREF, minutes: Math.min(60, cap), part: null }];
    const left = cap - steps[0].minutes;
    if (left >= MIN_CHUNK) steps.push({ id: "review-queue", kind: "review", title: "Review queue: the cards due today", href: REVIEW_HREF, minutes: Math.min(REVIEW_QUEUE_MIN, left), part: null });
    days.push({ date: mockDate, n: 0, type: "mock", minutes: steps.reduce((a, s) => a + s.minutes, 0), steps });
  }

  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  days.forEach((d, i) => (d.n = i + 1));
  const fits = packed.overflow.length === 0;
  // the smallest half-hour step (up to 16 h) at which every item fits the content days
  let suggested: number | null = null;
  if (!fits && contentDates.length) {
    for (let h = Math.ceil(hours * 2) / 2 + 0.5; h <= 16; h += 0.5) {
      if (!pack(work, contentDates.length, Math.round(h * 60)).overflow.length) {
        suggested = h;
        break;
      }
    }
  }
  return { ...base, days, overflow: packed.overflow, fits, workMinutes, suggestedHoursPerDay: suggested, problem: null };
}

/**
 * The date each item is planned to be finished (its last chunk), for saving onto a saved path's steps
 * (SavedStep.due). Revision, review-queue and generic mock steps are left out.
 */
export function planDueDates(plan: Pick<StudyPlan, "days">): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of plan.days) for (const s of d.steps) if (d.type !== "revision" && s.id !== "review-queue" && s.id !== "mock-practice") out[s.id] = d.date;
  return out;
}

/**
 * A saved path with dated steps as a plan (one study day per due date, steps in path order), for the
 * calendar download on /learn/saved. Undated steps are left out; null when no step has a date.
 */
export function savedPathPlan(p: Pick<SavedPath, "id" | "title" | "steps">): Pick<StudyPlan, "id" | "goal" | "days"> | null {
  const byDate = new Map<string, StudyStep[]>();
  for (const s of p.steps) {
    if (!s.due || !isDate(s.due)) continue;
    const list = byDate.get(s.due) || [];
    list.push({ id: s.id, kind: s.kind, title: s.title, href: s.href, minutes: estimateMinutes({ kind: s.kind }), part: null });
    byDate.set(s.due, list);
  }
  if (!byDate.size) return null;
  const days = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, steps], i): StudyDay => ({ date, n: i + 1, type: "study", minutes: steps.reduce((a, s) => a + s.minutes, 0), steps }));
  return { id: `spath-${p.id}`, goal: p.title, days };
}

// ---------------------------------------------------------------- iCalendar (RFC 5545)

const CRLF = "\r\n";
export const ICS_DOMAIN = "himanshukukreja.in";
export const SITE_ORIGIN = "https://www.himanshukukreja.in";

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, newline. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

const utf8Len = (s: string) => {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};

/** RFC 5545 §3.1: lines over 75 octets split with CRLF + one space, never inside a UTF-8 character. */
export function foldLine(line: string): string {
  if (utf8Len(line) <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  let limit = 75;
  for (const ch of line) {
    const l = utf8Len(ch);
    if (len + l > limit) {
      out.push(cur);
      cur = "";
      len = 0;
      limit = 74; // a continuation line starts with the space
    }
    cur += ch;
    len += l;
  }
  if (cur) out.push(cur);
  return out.join(`${CRLF} `);
}

export function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
}

const dateValue = (d: string) => d.replace(/-/g, "");

/** UID of a plan's event on a date: stable across exports, so re-importing updates rather than duplicates. */
export const icsUid = (planId: string, date: string, domain = ICS_DOMAIN) => `${planId.replace(/[^A-Za-z0-9-]/g, "")}-${dateValue(date)}@${domain}`;

/** An https URL for a step's link: site-relative links get the origin; anything else that isn't https is dropped. */
export function absoluteUrl(href: string, origin = SITE_ORIGIN): string {
  if (/^https:\/\/[^\s]+$/i.test(href)) return href;
  if (/^\/(?!\/)[^\s]*$/.test(href)) return `${origin.replace(/\/$/, "")}${href}`;
  return "";
}

export type IcsOptions = {
  /** the calendar's name, also the start of each event's title */
  title: string;
  /** the page the plan lives on (https); its origin makes site-relative links absolute */
  url: string;
  /** export time (DTSTAMP); default now */
  now?: Date;
  /** bump to make clients that match on UID take this copy over an older import; default 0 */
  sequence?: number;
};

const TYPE_LABEL: Record<StudyDayType, string> = { study: "Study", revision: "Revision", mock: "Mock practice" };

const minutesLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

/**
 * The plan as an .ics file: one all-day VEVENT per study day (DTSTART;VALUE=DATE, DTEND the next day,
 * exclusive), SUMMARY naming the day's items, DESCRIPTION listing each with its full https link, a stable
 * UID per plan + date, DTSTAMP in UTC, TEXT escaped, lines folded at 75 octets, CRLF line ends.
 */
export function toIcs(plan: Pick<StudyPlan, "id" | "days"> & { goal?: string }, opts: IcsOptions): string {
  const now = opts.now ?? new Date();
  const stamp = utcStamp(now);
  const origin = /^https:\/\/[^/\s]+/i.exec(opts.url)?.[0] ?? SITE_ORIGIN;
  const pageUrl = absoluteUrl(opts.url, origin);
  const title = clean(opts.title, 120) || "Study plan";
  const seq = Math.max(0, Math.floor(Number(opts.sequence) || 0));
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Himanshu Kukreja//System Design Mastery study plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(title)}`,
  ];
  const days = plan.days.filter((d) => isDate(d.date) && d.steps.length).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const total = days.length;
  days.forEach((d, i) => {
    const names = d.steps.map((s) => `${s.title}${s.part ? ` (${s.part[0]}/${s.part[1]})` : ""}`);
    const shown = names.slice(0, 3).join(" + ");
    const summary = `${title} · Day ${i + 1}/${total}${d.type === "study" ? "" : ` · ${TYPE_LABEL[d.type]}`}: ${shown}${names.length > 3 ? ` + ${names.length - 3} more` : ""}`;
    const desc = [
      `${TYPE_LABEL[d.type]} day ${i + 1} of ${total} · about ${minutesLabel(d.minutes)}`,
      ...(plan.goal ? [`Goal: ${plan.goal}`] : []),
      "",
      ...d.steps.flatMap((s, k) => {
        const link = absoluteUrl(s.href, origin);
        return [`${k + 1}. ${names[k]} · ${minutesLabel(s.minutes)}`, ...(link ? [`   ${link}`] : [])];
      }),
      ...(pageUrl ? ["", `Your plan: ${pageUrl}`] : []),
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsUid(plan.id, d.date)}`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${seq}`,
      `DTSTART;VALUE=DATE:${dateValue(d.date)}`,
      `DTEND;VALUE=DATE:${dateValue(addDays(d.date, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(desc)}`,
      ...(pageUrl ? [`URL:${pageUrl}`] : []),
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "CATEGORIES:Study",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
