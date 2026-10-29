/**
 * Section drop-off for course lessons, aggregated from events the lesson reader already sends (no new event,
 * no new table). Pure: no I/O, so scripts/dropoff-check.ts runs it on fixture events.
 *
 * The events (LessonProgressTracker, tracking v2, stored in analytics_events with the page-view id `pv`):
 *   lesson_open      { course, week, lesson, stage }       once per lesson visit; `stage` = where it resumes
 *   stage_reach      { course, week, lesson, stage, index, total }   once per section per visit, when the
 *                    reading line enters it after the reader has scrolled/clicked/pressed a key (the section
 *                    the page opens on never fires one)
 *   stage_done       { …, stage, index, total }             the section was genuinely read (reading-time rules)
 *   lesson_complete  { …, minutes }                         the lesson was completed
 *
 * Per lesson and reader (signed-in user id, else the browser's visitor id, merged when a browser signed in):
 *   furthest   the highest section index the reader opened at, reached or read in the window
 *   reached[i] readers whose furthest >= i (section 0 = every starter)
 *   stopped[i] readers whose furthest == i: they never got past section i
 *   drop[i]    reached[i-1] - reached[i]: the readers lost between the previous section and this one
 * Time to reach: wall-clock seconds from lesson_open to that section's stage_reach in the same page view,
 * only for visits that opened at the first section (a resumed visit says nothing about the sections before).
 */

export const DROP_EVENTS = ["lesson_open", "stage_reach", "stage_done", "lesson_complete"] as const;
export type DropEventName = (typeof DROP_EVENTS)[number];

/** Under this many readers a section (or lesson) is shown but greyed out and never ranked. */
export const MIN_READERS = 20;
/** How many of the largest judged drops a lesson highlights. */
export const HIGHLIGHT_DROPS = 3;
/** A drop smaller than this share isn't highlighted even when it is among the largest… */
export const HIGHLIGHT_MIN_SHARE = 0.1;
/** …nor one under this fraction of the lesson's worst drop (so a −15% next to a −50% isn't marked alike). */
export const HIGHLIGHT_OF_WORST = 0.5;
/** A visit left open longer than this before reaching a section is not a reading time. */
const MAX_REACH_SEC = 4 * 3600;

/** A row as read from analytics_events (event_type = "event"). */
export type RawRow = { visitor_id: string | null; user_id: string | null; created_at: string; metadata: Record<string, unknown> | null };

export type DropEvent = {
  reader: string;
  at: number;
  name: DropEventName;
  week: string;
  lesson: string;
  stage: string;
  index: number | null;
  total: number | null;
  pv: string;
};

export type SectionRef = { id: string; title: string; label?: string; minutes?: number };

export type SectionStat = SectionRef & {
  index: number;
  /** readers who got at least this far */
  reached: number;
  /** reached / lesson starters */
  pct: number;
  /** readers lost since the previous section (null for the first) */
  drop: number | null;
  /** drop / reached at the previous section */
  dropShare: number | null;
  /** readers whose furthest section is this one */
  stopped: number;
  /** readers who genuinely read it (stage_done) in the window */
  read: number;
  /** median seconds from opening the lesson (at the top) to reaching this section */
  medianSec: number | null;
  /** visits behind medianSec */
  timed: number;
  /** reached by fewer than MIN_READERS */
  lowSample: boolean;
  /** one of the lesson's largest judged drops */
  highlight: boolean;
};

export type WorstDrop = { index: number; id: string; title: string; share: number; lost: number; from: number };

export type LessonDropoff = {
  week: string;
  lesson: string;
  starters: number;
  /** readers who reached the last section */
  finished: number;
  /** finished / starters */
  completion: number;
  /** readers with lesson_complete in the window */
  completed: number;
  /** stage events whose section isn't in the lesson any more (renamed or removed heading) */
  unmatched: number;
  sections: SectionStat[];
  /** the largest judged drop (previous section reached by MIN_READERS+) */
  worst: WorstDrop | null;
};

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};
const isDropName = (n: string): n is DropEventName => (DROP_EVENTS as readonly string[]).includes(n);

/**
 * Raw rows → events, with one reader key per person: a browser that was ever signed in counts as that user,
 * so reading as a guest and then signing in is one reader, not two. Rows of another course are dropped.
 */
export function toEvents(rows: RawRow[], courseId?: string): DropEvent[] {
  const userOf = new Map<string, string>();
  for (const r of rows) if (r.user_id && r.visitor_id && !userOf.has(r.visitor_id)) userOf.set(r.visitor_id, r.user_id);
  const out: DropEvent[] = [];
  for (const r of rows) {
    const m = r.metadata || {};
    const name = str(m.name);
    if (!isDropName(name)) continue;
    if (courseId && m.course != null && str(m.course) !== courseId) continue;
    const week = str(m.week);
    const lesson = str(m.lesson);
    const reader = r.user_id ? `u:${r.user_id}` : r.visitor_id ? (userOf.has(r.visitor_id) ? `u:${userOf.get(r.visitor_id)}` : `v:${r.visitor_id}`) : "";
    const at = Date.parse(r.created_at);
    if (!week || !lesson || !reader || !Number.isFinite(at)) continue;
    out.push({ reader, at, name, week, lesson, stage: str(m.stage), index: int(m.index), total: int(m.total), pv: str(m.pv) });
  }
  return out;
}

/** Events grouped by `${week}/${lesson}`. */
export function byLesson(events: DropEvent[]): Map<string, DropEvent[]> {
  const out = new Map<string, DropEvent[]>();
  for (const e of events) {
    const k = `${e.week}/${e.lesson}`;
    const list = out.get(k);
    if (list) list.push(e);
    else out.set(k, [e]);
  }
  return out;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** One lesson's section funnel. `sections` is the lesson's heading list in reading order. */
export function aggregateLesson(week: string, lesson: string, events: DropEvent[], sections: SectionRef[]): LessonDropoff {
  const n = sections.length;
  const pos = new Map(sections.map((s, i) => [s.id, i]));
  let unmatched = 0;
  // a stage id the lesson no longer has: trust the recorded index only when the lesson still has as many sections
  const indexOf = (e: DropEvent): number | null => {
    const p = pos.get(e.stage);
    if (p != null) return p;
    if (e.index != null && e.total === n && e.index >= 0 && e.index < n) return e.index;
    return null;
  };

  const furthest = new Map<string, number>();
  const readers = new Map<string, Set<number>>();
  const completed = new Set<string>();
  const opens = new Map<string, number>(); // pv → lesson_open time, visits that opened at the top
  const reaches: { pv: string; at: number; i: number }[] = [];

  for (const e of events) {
    if (!furthest.has(e.reader)) furthest.set(e.reader, 0);
    if (e.name === "lesson_complete") {
      completed.add(e.reader);
      continue;
    }
    const i = e.name === "lesson_open" ? (e.stage ? indexOf(e) : 0) : indexOf(e);
    if (i == null) {
      if (e.name !== "lesson_open") unmatched++;
      continue;
    }
    if (i > furthest.get(e.reader)!) furthest.set(e.reader, i);
    if (e.name === "stage_done") {
      const s = readers.get(e.reader) || new Set<number>();
      s.add(i);
      readers.set(e.reader, s);
    }
    if (!e.pv) continue;
    if (e.name === "lesson_open" && i === 0) {
      const prev = opens.get(e.pv);
      if (prev == null || e.at < prev) opens.set(e.pv, e.at);
    } else if (e.name === "stage_reach") reaches.push({ pv: e.pv, at: e.at, i });
  }

  const starters = furthest.size;
  const reached = new Array<number>(n).fill(0);
  const stopped = new Array<number>(n).fill(0);
  for (const f of furthest.values()) {
    if (!n) break;
    stopped[Math.min(f, n - 1)]++;
    for (let i = 0; i <= Math.min(f, n - 1); i++) reached[i]++;
  }
  const read = new Array<number>(n).fill(0);
  for (const s of readers.values()) for (const i of s) read[i]++;

  // first reach of each section per visit, timed from that visit's lesson_open
  const firstReach = new Map<string, number>();
  for (const r of reaches) {
    const open = opens.get(r.pv);
    if (open == null) continue;
    const sec = (r.at - open) / 1000;
    if (sec < 0 || sec > MAX_REACH_SEC) continue;
    const k = `${r.pv}#${r.i}`;
    const prev = firstReach.get(k);
    if (prev == null || sec < prev) firstReach.set(k, sec);
  }
  const times: number[][] = Array.from({ length: n }, () => []);
  for (const [k, sec] of firstReach) times[Number(k.slice(k.lastIndexOf("#") + 1))].push(sec);

  const stats: SectionStat[] = sections.map((s, i) => {
    const prev = i ? reached[i - 1] : 0;
    const drop = i ? prev - reached[i] : null;
    const med = i ? median(times[i]) : null;
    return {
      ...s,
      index: i,
      reached: reached[i],
      pct: starters ? reached[i] / starters : 0,
      drop,
      dropShare: i && prev ? (prev - reached[i]) / prev : null,
      stopped: stopped[i],
      read: read[i],
      medianSec: med == null ? null : Math.round(med),
      timed: i ? times[i].length : 0,
      lowSample: reached[i] < MIN_READERS,
      highlight: false,
    };
  });

  // judged drops: the previous section had enough readers to say something
  const judged = stats.filter((s) => s.index > 0 && s.dropShare != null && s.dropShare > 0 && reached[s.index - 1] >= MIN_READERS);
  judged.sort((a, b) => b.dropShare! - a.dropShare! || b.drop! - a.drop! || a.index - b.index);
  const bar = Math.max(HIGHLIGHT_MIN_SHARE, (judged[0]?.dropShare ?? 0) * HIGHLIGHT_OF_WORST);
  judged
    .slice(0, HIGHLIGHT_DROPS)
    .filter((s) => s.dropShare! >= bar)
    .forEach((s) => (s.highlight = true));
  const w = judged[0];
  const finished = n ? reached[n - 1] : 0;

  return {
    week,
    lesson,
    starters,
    finished,
    completion: starters ? finished / starters : 0,
    completed: completed.size,
    unmatched,
    sections: stats,
    worst: w ? { index: w.index, id: w.id, title: w.title, share: w.dropShare!, lost: w.drop!, from: reached[w.index - 1] } : null,
  };
}

// ------------------------------------------------------------------ API shapes (GET /api/admin/course/dropoff)

export type DropoffLessonRow = {
  key: string;
  week: string;
  lesson: string;
  title: string;
  tag: string;
  weekCode: string;
  weekTitle: string;
  order: number;
  core: boolean;
  sections: number;
  starters: number;
  finished: number;
  completion: number;
  completed: number;
  worst: WorstDrop | null;
};

export type DropoffDetail = LessonDropoff & { key: string; title: string; tag: string; href: string };

export type DropoffResponse = {
  days: number;
  minReaders: number;
  /** dev sample data (DROPOFF_FIXTURES=1) */
  sample: boolean;
  generatedAt: string;
  /** distinct readers across all lessons */
  readers: number;
  /** events read */
  events: number;
  weeks: { code: string; title: string }[];
  /** every lesson in course order (starters 0 when nobody opened it in the window) */
  lessons: DropoffLessonRow[];
  /** events on lessons the course map doesn't have any more */
  orphanEvents: number;
  detail: DropoffDetail | null;
};
