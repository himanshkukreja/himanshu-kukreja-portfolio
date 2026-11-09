import "server-only";
import crypto from "crypto";
import type { Lecture } from "@/lib/learn/lecture/types";
import type { LectureSummary } from "@/lib/learn/lecture/load";
import type { PlayableShort } from "@/lib/learn/shorts/types";
import { conceptHref, conceptLectureHref, getConceptIndex, getConceptLecture, getConceptShortIds, getDsaShort } from "./load";

/**
 * DSA Mastery's videos: the concept lectures (/dsa/lectures) and the vertical shorts (/dsa/shorts). Their recorded
 * media sits with SD Mastery's on the lecture host (NEXT_PUBLIC_LECTURE_MEDIA) at lectures/<quest>/, published by
 * scripts/lecture/publish.mjs; media.json's `source` is the hash of the script it was made from (lectureHash), so a
 * changed script reads as "not recorded" until it is rendered again. Lists are built from the cached per-concept
 * items in load.ts, a few at a time, and media.json is read through the fetch cache (an hour), never per visit.
 */

const MEDIA = () => (process.env.NEXT_PUBLIC_LECTURE_MEDIA || "").replace(/\/$/, "");
/** same fingerprint as lectureHash() in src/lib/learn/lecture/load.ts and export.mjs */
const hashOf = (l: Lecture) => crypto.createHash("sha1").update(JSON.stringify(l)).digest("hex").slice(0, 12);
const wordsOf = (l: Lecture) => l.scenes.reduce((a, s) => a + s.steps.reduce((b, st) => b + st.say.split(/\s+/).length, 0), 0);

/** The published media's script hash and length, or null (not published, or no media host). */
async function published(quest: string): Promise<{ source: string; duration: number } | null> {
  const base = MEDIA();
  if (!/^https?:\/\//.test(base)) return null;
  try {
    const res = await fetch(`${base}/${quest}/media.json`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const m = (await res.json()) as { source?: string; duration?: number; video?: string };
    return m.source && m.video ? { source: m.source, duration: Number(m.duration) || 0 } : null;
  } catch {
    return null;
  }
}

async function inBatches<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

/** built concepts in course order: module number (m4 before m10), then the concept's place in it */
const modNum = (m: string) => Number(m.match(/^m(\d+)/)?.[1] ?? 99);
async function builtInOrder() {
  return (await getConceptIndex()).filter((c) => c.status === "built").sort((a, b) => modNum(a.module) - modNum(b.module) || a.order - b.order);
}

const moduleCode = (m: string) => m.split("-")[0].toUpperCase();
const moduleName = (m: string) => {
  const t = m.replace(/^m\d+-/, "").replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export type DsaLectureSummary = LectureSummary & { recorded: boolean; concept: string };

/** Every built concept's lecture in course order, grouped by module ("M5 · Sliding window"). */
export async function listDsaLectures(): Promise<DsaLectureSummary[]> {
  const built = await builtInOrder();
  const rows = await inBatches(built, 4, async (c) => {
    const l = await getConceptLecture(c.id).catch(() => null);
    if (!l) return null;
    const words = wordsOf(l);
    const version = hashOf(l);
    const media = await published(l.quest);
    const recorded = !!media && media.source === version;
    const minutes = recorded && media.duration ? Math.max(1, Math.round(media.duration / 60)) : Math.max(1, Math.round((words / 150) * 1.08));
    const row: DsaLectureSummary = {
      slug: l.quest,
      code: moduleCode(c.module),
      title: l.title,
      quest: c.title,
      summary: l.summary,
      href: conceptLectureHref(c.id),
      questHref: conceptHref(c.id),
      minutes,
      checkpoints: l.scenes.filter((s) => s.kind === "quiz").length,
      chapters: l.scenes.length,
      group: `${moduleCode(c.module)} · ${moduleName(c.module)}`,
      track: "dsa",
      version,
      jsonLength: JSON.stringify(l).length,
      words,
      recorded,
      concept: c.id,
    };
    return row;
  });
  return rows.filter((x): x is DsaLectureSummary => !!x);
}

/**
 * Every DSA short whose recorded video matches its script (others aren't watchable yet), in course order. The feed
 * shuffles them; `full` opens the concept's lecture at the short's moment, `article` the concept page.
 */
export async function listDsaShorts(opts: { includeUnpublished?: boolean } = {}): Promise<(PlayableShort & { recorded: boolean })[]> {
  const base = MEDIA();
  const built = await builtInOrder();
  const ids = (await inBatches(built, 6, (c) => getConceptShortIds(c.id))).flat();
  const rows = await inBatches(ids, 6, async (id) => {
    const l = await getDsaShort(id).catch(() => null);
    if (!l?.short || !l.dsa) return null;
    const v = hashOf(l);
    const media = await published(l.quest);
    const recorded = !!media && media.source === v;
    if (!recorded && !opts.includeUnpublished) return null;
    const words = wordsOf(l);
    const row: PlayableShort & { recorded: boolean } = {
      id: l.quest,
      title: l.title,
      label: l.short.label,
      category: "course",
      topics: l.short.topics ?? [],
      lecture: l.short.of,
      full: `${conceptLectureHref(l.dsa.concept)}${l.short.at ? `?at=${encodeURIComponent(l.short.at)}` : ""}`,
      article: conceptHref(l.dsa.concept),
      src: `${base}/${l.quest}/video.mp4?v=${v}`,
      poster: `${base}/${l.quest}/poster.jpg?v=${v}`,
      seconds: recorded && media.duration ? Math.round(media.duration) : Math.round((words / 150) * 60 * 1.08),
      recorded,
    };
    return row;
  });
  return rows.filter((x): x is PlayableShort & { recorded: boolean } => !!x);
}
