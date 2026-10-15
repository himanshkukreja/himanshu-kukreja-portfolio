/**
 * Case-file reading progress: the lesson rules (READING in lib/learn/engagedClock) applied to a
 * story's checkpoint sections. A section is the text from one checkpoint heading (h2) to the
 * next; the text before the first heading is the "intro" section when it is long enough to read.
 * Each section's estimated minutes = the story's minutes × its share of the words.
 *
 * Stored per device in localStorage `hk.story.v1` → { "<slug>": { d: {secId: seconds}, s: {secId: seenMask}, r: [read secIds] } }.
 */
import { stageNeedSeconds } from "@/lib/learn/engagedClock";

export const STORY_READING_KEY = "hk.story.v1";
export const INTRO_ID = "_intro";
export const WHOLE_ID = "_all";

export type StoryRecord = { d: Record<string, number>; s: Record<string, number>; r: string[] };
export type Section = { id: string; label: string; minutes: number; need: number };

const EMPTY: StoryRecord = { d: {}, s: {}, r: [] };

function readAll(): Record<string, StoryRecord> {
  try {
    const raw = window.localStorage.getItem(STORY_READING_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readStoryRecord(slug: string): StoryRecord {
  if (typeof window === "undefined") return EMPTY;
  const r = readAll()[slug];
  return r ? { d: { ...(r.d ?? {}) }, s: { ...(r.s ?? {}) }, r: Array.isArray(r.r) ? [...r.r] : [] } : { d: {}, s: {}, r: [] };
}

/** Merge up: seconds take the max, seen slices OR, read ids union. */
export function writeStoryRecord(slug: string, rec: StoryRecord) {
  try {
    const all = readAll();
    const prev = all[slug] ?? EMPTY;
    const d = { ...(prev.d ?? {}) };
    for (const [k, v] of Object.entries(rec.d)) d[k] = Math.max(d[k] ?? 0, Math.round(v));
    const s = { ...(prev.s ?? {}) };
    for (const [k, v] of Object.entries(rec.s)) s[k] = ((s[k] ?? 0) | v) >>> 0;
    const r = Array.from(new Set([...(prev.r ?? []), ...rec.r]));
    all[slug] = { d, s, r };
    window.localStorage.setItem(STORY_READING_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: progress lives for this visit
  }
}

const words = (t: string) => (t.match(/\S+/g) || []).length;

/** Text between two points of the article, ignoring renderer chrome. */
function textBetween(content: HTMLElement, from: HTMLElement | null, to: HTMLElement | null): string {
  const r = document.createRange();
  if (from) r.setStartBefore(from);
  else r.setStart(content, 0);
  if (to) r.setEndBefore(to);
  else r.setEnd(content, content.childNodes.length);
  const frag = r.cloneContents();
  frag.querySelectorAll("[data-sd-chrome], script, style").forEach((n) => n.remove());
  return frag.textContent || "";
}

/** The story's sections with their estimated minutes and reading-time requirement. */
export function buildSections(content: HTMLElement, checkpoints: { id: string; label: string }[], totalMinutes: number): Section[] {
  const heads = checkpoints.map((c) => document.getElementById(c.id));
  const list: { id: string; label: string; w: number }[] = [];
  const valid = checkpoints.filter((_, i) => heads[i] && content.contains(heads[i]));
  if (!valid.length) {
    list.push({ id: WHOLE_ID, label: "Case file", w: words(textBetween(content, null, null)) });
  } else {
    const els = valid.map((c) => document.getElementById(c.id) as HTMLElement);
    const intro = words(textBetween(content, null, els[0]));
    if (intro >= 60) list.push({ id: INTRO_ID, label: "Briefing", w: intro });
    valid.forEach((c, i) => list.push({ id: c.id, label: c.label, w: words(textBetween(content, els[i], els[i + 1] ?? null)) }));
  }
  const total = Math.max(1, list.reduce((a, s) => a + s.w, 0));
  const mins = totalMinutes > 0 ? totalMinutes : total / 230;
  return list.map((s) => {
    const minutes = (mins * s.w) / total;
    return { id: s.id, label: s.label, minutes, need: stageNeedSeconds(minutes) };
  });
}

/** Viewport rects of the sections (fresh lookups: the article can be re-rendered). */
export function sectionRects(content: HTMLElement, sections: Section[]): ({ top: number; bottom: number } | null)[] {
  const box = content.getBoundingClientRect();
  const tops = sections.map((s) => {
    if (s.id === INTRO_ID || s.id === WHOLE_ID) return box.top;
    const el = document.getElementById(s.id);
    return el && el.isConnected ? el.getBoundingClientRect().top : null;
  });
  return sections.map((_, i) => {
    const top = tops[i];
    if (top === null) return null;
    const next = tops.slice(i + 1).find((t): t is number => t !== null);
    return { top, bottom: next ?? box.bottom };
  });
}
