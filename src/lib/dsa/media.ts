import "server-only";
import { unstable_cache } from "next/cache";
import type { Lecture } from "@/lib/learn/lecture/types";
import type { LectureSummary } from "@/lib/learn/lecture/load";
import type { PlayableShort } from "@/lib/learn/shorts/types";
import { conceptHref, conceptLectureHref, getConceptIndex, getConceptLecture, getProblemIndex, getSolutionVideo, getStepLabels } from "./load";
import { hashOf, publishedMedia as published, shortRow, shortRows, wordsOf, type ShortRow } from "./shorts-manifest";
import { DSA_CONTENT_TAG, dsaFresh, dsaItem, dsaItemKey } from "./content";
import { stepOf, stepRank } from "./steps";
import { controlMap, isLive, questKey, shortKey, type Control } from "@/lib/learn/controls";

/**
 * DSA Mastery's videos: the concept lectures (/dsa/lectures) and the vertical shorts (/dsa/shorts). Their recorded
 * media sits with SD Mastery's on the lecture host (NEXT_PUBLIC_LECTURE_MEDIA) at lectures/<quest>/, published by
 * scripts/lecture/publish.mjs; media.json's `source` is the hash of the script it was made from (lectureHash), so a
 * changed script reads as "not recorded" until it is rendered again. Lists are built from the cached per-concept
 * items in load.ts, a few at a time, and media.json is read through the fetch cache (an hour), never per visit.
 */

const MEDIA = () => (process.env.NEXT_PUBLIC_LECTURE_MEDIA || "").replace(/\/$/, "");
async function inBatches<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

/** built concepts in learner order: the module's step (part, then place in the part), then the concept's place in it */
async function builtInOrder() {
  const labels = await getStepLabels();
  return (await getConceptIndex()).filter((c) => c.status === "built").sort((a, b) => stepRank(labels, a.module) - stepRank(labels, b.module) || a.order - b.order);
}

export type DsaLectureSummary = LectureSummary & { recorded: boolean; concept: string };

/** Every built concept's lecture in course order, grouped by step ("4.2 Sliding window"). */
export async function listDsaLectures(): Promise<DsaLectureSummary[]> {
  const built = await builtInOrder();
  const labels = await getStepLabels();
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
      code: stepOf(labels, c.module).step,
      title: l.title,
      quest: c.title,
      summary: l.summary,
      href: conceptLectureHref(c.id),
      questHref: conceptHref(c.id),
      minutes,
      checkpoints: l.scenes.filter((s) => s.kind === "quiz").length,
      chapters: l.scenes.length,
      group: stepOf(labels, c.module).label,
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

const card = (r: ShortRow): PlayableShort & { recorded: boolean } => ({
  id: r.id,
  title: r.title,
  label: r.label,
  category: "course",
  topics: r.topics,
  lecture: r.of,
  full: r.full,
  article: r.article,
  src: `${MEDIA()}/${r.id}/video.mp4?v=${r.v}`,
  poster: `${MEDIA()}/${r.id}/poster.jpg?v=${r.v}`,
  seconds: r.seconds,
  recorded: r.recorded,
});

/**
 * Every DSA short whose recorded video matches its script (others aren't watchable yet), in course order. The feed
 * shuffles them; `full` opens the concept's lecture at the short's moment, `article` the concept page. Read from the
 * shorts manifest (one R2 object per content commit, shorts-manifest.ts), never by walking the shorts; it throws until
 * the deploy warm-up has built it (so a page doesn't cache an empty list).
 */
export async function listDsaShorts(opts: { includeUnpublished?: boolean; ignoreControls?: boolean } = {}): Promise<(PlayableShort & { recorded: boolean })[]> {
  // publishing controls (/admin/publishing): a hidden or not-yet-scheduled short leaves every list; no row = live, and a
  // read failure hides nothing (controlMap returns an empty map)
  const controls: Map<string, Control> = opts.ignoreControls ? new Map() : await controlMap().catch(() => new Map<string, Control>());
  const rows = await shortRows();
  return rows.filter((r) => (r.recorded || opts.includeUnpublished) && isLive(controls.get(shortKey(r.id))) && isLive(controls.get(questKey(r.of)))).map(card);
}

/** One short for its own page: just that short's script and media.json (no listing). null: no such short, or hidden. */
export async function getDsaShortCard(id: string): Promise<(PlayableShort & { recorded: boolean }) | null> {
  const r = await shortRow(id);
  if (!r) return null;
  const controls = await controlMap().catch(() => new Map<string, Control>());
  return isLive(controls.get(shortKey(r.id))) && isLive(controls.get(questKey(r.of))) ? card(r) : null;
}

/** each short's first scene headline, for the home's Quick review covers (an empty map until the manifest is built) */
export async function dsaShortHeads(): Promise<Record<string, string>> {
  const rows = await shortRows().catch(() => []);
  return Object.fromEntries(rows.filter((r) => r.head).map((r) => [r.id, r.head]));
}

/** Short ids (a lesson's or the home's list) with the hidden and not-yet-scheduled ones taken out (publishing controls; a read failure hides nothing). */
export async function liveDsaShortIds(ids: string[]): Promise<string[]> {
  const controls = await controlMap().catch(() => new Map<string, Control>());
  return ids.filter((id) => isLive(controls.get(shortKey(id))));
}

/** A problem's solution video as the Editorial tab plays it (src/components/dsa/problem/SolutionVideo.tsx). */
export type SolutionVideoData = {
  /** what the course's lecture player needs (captions, music, speed, chapters, like SD Mastery's videos) */
  player: { lecture: Lecture; quest: string; source: string; mediaBase: string };
  src: string;
  poster: string;
  /** WebVTT text (the tab makes a same-origin track of it, so captions need no CORS) */
  captions: string;
  chapters: { title: string; at: number }[];
  duration: number;
};

/**
 * The published solution video for a problem (lectures/dsa--solution--<id>/), or null: no solution.json, no media host,
 * or media recorded from another script. media.json and the captions are read through the fetch cache (an hour).
 */
export async function solutionVideoFor(id: string): Promise<SolutionVideoData | null> {
  const base = MEDIA();
  if (!/^https?:\/\//.test(base)) return null;
  const l = await getSolutionVideo(id).catch(() => null);
  if (!l) return null;
  const v = hashOf(l);
  try {
    const res = await fetch(`${base}/${l.quest}/media.json`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const m = (await res.json()) as { source?: string; duration?: number; starts?: number[]; video?: string };
    if (m.source !== v || !m.video) return null;
    const vtt = await fetch(`${base}/${l.quest}/captions.vtt?v=${v}`, { next: { revalidate: 3600 } })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    // a chapter per scene, at its first step
    const starts = m.starts || [];
    let n = 0;
    const chapters = l.scenes.map((s) => {
      const at = starts[n] ?? 0;
      n += s.steps.length;
      return { title: s.title, at: Number(at.toFixed(2)) };
    });
    return { player: { lecture: l, quest: l.quest, source: v, mediaBase: base }, src: `${base}/${l.quest}/video.mp4?v=${v}`, poster: `${base}/${l.quest}/poster.jpg?v=${v}`, captions: vtt, chapters, duration: Number(m.duration) || 0 };
  } catch {
    return null;
  }
}

/**
 * Every problem whose solution video is published, as one data-cache item (an hour, and the "dsa-content" tag: a content
 * release works it out again). GET /api/dsa/problem-videos serves it to the problems page, which shows the video marks
 * and the "Has solution video" filter once it arrives. Built cold it reads every problem's solution (its page bundle)
 * and media.json, 6 at a time (~250 of each, 20-40 s on staging); after that one read, and a stale copy is served while
 * the next hour's is worked out. Past the per-problem cache items: inside this one they'd each be written (~480 R2
 * writes, 64 s, Nov 2026).
 */
const videoIds = async (): Promise<string[]> => problemsWithVideo((await getProblemIndex()).map((p) => p.id), { fresh: true });
const videoIdsCached = unstable_cache(dsaItem(videoIds), ["dsa-problem-videos-v1", dsaItemKey(videoIds)], {
  revalidate: 3600,
  tags: [DSA_CONTENT_TAG],
});
export async function problemVideoIds(): Promise<string[]> {
  return dsaFresh() ? problemsWithVideo((await getProblemIndex()).map((p) => p.id)) : videoIdsCached();
}

/**
 * The problems whose solution video is published (script and recorded media match), for the "Has solution video"
 * filter. A few at a time; media.json through the fetch cache, or with `fresh` straight from the media host.
 */
export async function problemsWithVideo(ids: string[], opts: { fresh?: boolean } = {}): Promise<string[]> {
  if (!/^https?:\/\//.test(MEDIA())) return [];
  const rows = await inBatches(ids, 6, async (id) => {
    try {
      const l = await getSolutionVideo(id, opts);
      const m = l ? await published(l.quest, opts.fresh) : null;
      return m && l && m.source === hashOf(l) ? id : "";
    } catch {
      return "";
    }
  });
  return rows.filter(Boolean);
}
