import "server-only";
/**
 * Section drop-off report for /admin/course/dropoff (see ./aggregate.ts for what is counted). Admin-only and on
 * demand: GET /api/admin/course/dropoff reads the four lesson events of the window once, drops the owner's test
 * traffic, and keeps the events plus the per-lesson summary 5 minutes per window on the instance (like the gap
 * radar). Never runs on a public page view.
 *
 * Sections are the lesson's stages (its top-level headings; each is the element id the reader scrolls to):
 *   - the summary cuts every lesson with the same line-based splitter smart search uses (renderer's rules, no
 *     markdown render: the whole course in well under a second), from the in-memory content snapshot;
 *   - the selected lesson uses the reader's own stage list (rendered, cached 5 min by the Learn action), which
 *     adds the rail labels ("Part II") and reading minutes.
 */
import { supabase } from "@/lib/supabase";
import { dropInternal } from "@/lib/analytics/excludeServer";
import { getLearningResource } from "@/lib/github";
import { COURSE_ID, getCourseIndex, getStages, type LessonRef } from "@/lib/admin/learners/course";
import { lessonSections } from "@/lib/search/smart/sections";
import type { LessonKind } from "@/lib/course/types";
import {
  aggregateLesson,
  byLesson,
  DROP_EVENTS,
  MIN_READERS,
  toEvents,
  type DropEvent,
  type DropoffDetail,
  type DropoffLessonRow,
  type DropoffResponse,
  type RawRow,
  type SectionRef,
} from "./aggregate";
import { dropoffFixtures, sampleRows } from "./fixtures";

const TTL = 5 * 60_000;
const PAGE = 1000;
const MAX_ROWS = 300_000;
const WORDS_PER_MIN = 230;

type Built = Omit<DropoffResponse, "detail"> & { byKey: Map<string, DropEvent[]>; refs: Map<string, LessonRef> };

const memo = new Map<string, { at: number; value: Promise<Built> }>();

async function readEvents(name: string, since: string): Promise<RawRow[]> {
  const rows: RawRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("visitor_id, user_id, created_at, metadata")
      .eq("event_type", "event")
      .eq("metadata->>name", name)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`analytics_events: ${error.message}`);
    rows.push(...((data || []) as RawRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const words = (s: string) => (s.match(/\S+/g) || []).length;

/** A lesson's sections (stages) from its markdown: id, heading, rough reading minutes. [] when it can't be read. */
async function sectionsOf(week: string, slug: string): Promise<SectionRef[]> {
  try {
    const data = await getLearningResource(week, slug);
    if (!data || data.resource.type === "mcq") return [];
    const parts = lessonSections(data.content, data.resource.type as LessonKind);
    const stages = parts.sections.filter((s) => s.depth === 1 && s.id === s.stage);
    const w = new Map<string, number>();
    for (const s of parts.sections) w.set(s.stage, (w.get(s.stage) || 0) + words(s.text));
    return stages.map((s) => ({ id: s.id, title: s.title, minutes: Math.max(1, Math.round((w.get(s.id) || 0) / WORDS_PER_MIN)) }));
  } catch {
    return [];
  }
}

async function build(days: number, sample: boolean): Promise<Built> {
  const idx = await getCourseIndex();
  const ordered = idx.ordered;
  const refs = new Map(ordered.map((r) => [`${r.week}/${r.slug}`, r]));

  let raw: RawRow[];
  const sampleSections = new Map<string, SectionRef[]>();
  if (sample) {
    const picks = [...ordered.filter((r) => r.core).slice(0, 8), ...ordered.filter((r) => !r.core).slice(0, 2)];
    const withSections = await pool(picks, 4, async (r) => ({ week: r.week, slug: r.slug, sections: await sectionsOf(r.week, r.slug) }));
    withSections.forEach((l) => sampleSections.set(`${l.week}/${l.slug}`, l.sections));
    raw = sampleRows(withSections, days);
  } else {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const lists = await Promise.all(DROP_EVENTS.map((n) => readEvents(n, since)));
    raw = await dropInternal(lists.flat());
  }

  const events = toEvents(raw, COURSE_ID);
  const byKey = byLesson(events);
  const withData = ordered.filter((r) => byKey.has(`${r.week}/${r.slug}`));
  const sections = new Map<string, SectionRef[]>();
  await pool(withData, 8, async (r) => {
    const k = `${r.week}/${r.slug}`;
    sections.set(k, sampleSections.get(k) ?? (await sectionsOf(r.week, r.slug)));
  });

  let orphanEvents = 0;
  for (const [k, list] of byKey) if (!refs.has(k)) orphanEvents += list.length;

  const lessons: DropoffLessonRow[] = ordered.map((r) => {
    const k = `${r.week}/${r.slug}`;
    const secs = sections.get(k) ?? [];
    const agg = aggregateLesson(r.week, r.slug, byKey.get(k) ?? [], secs);
    return {
      key: k,
      week: r.week,
      lesson: r.slug,
      title: r.title,
      tag: r.tag,
      weekCode: r.weekCode,
      weekTitle: r.weekTitle,
      order: r.order,
      core: r.core,
      sections: secs.length,
      starters: agg.starters,
      finished: agg.finished,
      completion: agg.completion,
      completed: agg.completed,
      worst: agg.worst,
    };
  });

  const weeks: DropoffResponse["weeks"] = [];
  for (const r of ordered) if (!weeks.some((w) => w.code === r.weekCode)) weeks.push({ code: r.weekCode, title: r.weekTitle });

  const readers = new Set<string>();
  for (const e of events) if (refs.has(`${e.week}/${e.lesson}`)) readers.add(e.reader);

  return {
    days,
    minReaders: MIN_READERS,
    sample,
    generatedAt: new Date().toISOString(),
    readers: readers.size,
    events: events.length,
    weeks,
    lessons,
    orphanEvents,
    byKey,
    refs,
  };
}

function built(days: number, fresh = false): Promise<Built> {
  const sample = dropoffFixtures();
  const k = `${days}|${sample}`;
  const hit = memo.get(k);
  if (hit && !fresh && Date.now() - hit.at < TTL) return hit.value;
  const value = build(days, sample);
  memo.set(k, { at: Date.now(), value });
  value.catch(() => memo.delete(k));
  return value;
}

/** The summary of every lesson for the window, plus the funnel of `lessonKey` (`<week>/<slug>`) when given. */
export async function dropoffReport(opts: { days: number; lessonKey?: string | null; fresh?: boolean }): Promise<DropoffResponse> {
  const b = await built(opts.days, opts.fresh);
  const { byKey, refs, ...rest } = b;
  let detail: DropoffDetail | null = null;
  const ref = opts.lessonKey ? refs.get(opts.lessonKey) : undefined;
  if (ref) {
    const k = `${ref.week}/${ref.slug}`;
    // the reader's own stage list (labels, rendered minutes); the line-based cut when it can't be rendered
    const rendered = await getStages(ref.week, ref.slug);
    const secs: SectionRef[] = rendered.length ? rendered.map((s) => ({ id: s.id, title: s.title, label: s.label, minutes: s.minutes })) : await sectionsOf(ref.week, ref.slug);
    detail = { ...aggregateLesson(ref.week, ref.slug, byKey.get(k) ?? [], secs), key: k, title: ref.title, tag: ref.tag, href: ref.href };
  }
  return { ...rest, detail };
}
