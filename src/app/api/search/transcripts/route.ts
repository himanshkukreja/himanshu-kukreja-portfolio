import { NextResponse } from "next/server";
import { controlMap, isLive, questKey } from "@/lib/learn/controls";
import { getLecture, getShort, lectureHash, lectureMediaBase, listLectures } from "@/lib/learn/lecture/load";
import { listShorts } from "@/lib/learn/shorts/load";
import { flatten, type LectureMedia } from "@/lib/learn/lecture/types";
import { shortText, transcriptWindows, TRANSCRIPT_SHORT, TRANSCRIPT_TIMED, TRANSCRIPT_UNTIMED, type TranscriptIndex, type TranscriptMoment, type TranscriptSource } from "@/lib/learn/lecture/transcript";

export const runtime = "nodejs";
// The palette's transcript index (⌘K "In lectures"): built once and served from the cache (CDN), refreshed
// daily, on every content push (revalidate-courses) and when publishing controls change. The palette fetches
// it only once a query has 3+ characters; matching happens in the browser, so the request takes no query.
export const revalidate = 86400;

/** at most this many media.json requests at once */
const POOL = 12;

async function pool<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(POOL, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

/**
 * The step timings the player will use for this script: the recording's when media.json was made from this
 * exact script, "stale" when it was made from an older one (no timestamps: the player won't seek by them),
 * and null (estimate from the script, the player's own rule) when there is no recording or it can't be read.
 */
async function timings(slug: string, source: string, steps: number): Promise<number[] | "stale" | null> {
  const base = (lectureMediaBase() || "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(base)) return null;
  try {
    const res = await fetch(`${base}/${slug}/media.json`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const m = (await res.json()) as Partial<LectureMedia>;
    if (m.source !== source) return "stale";
    return Array.isArray(m.starts) && m.starts.length === steps ? m.starts : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [all, shorts, controls] = await Promise.all([listLectures().catch(() => []), listShorts().catch(() => []), controlMap().catch(() => new Map())]);
  // a hidden side quest's lecture is hidden too (as on its page)
  const lectures = all.filter((x) => !x.slug.startsWith("bonus-") || isLive(controls.get(questKey(x.slug))));

  const l: TranscriptSource[] = [];
  const m: TranscriptMoment[] = [];

  const built = await pool(lectures, async (s) => {
    const lec = await getLecture(s.slug).catch(() => null);
    if (!lec) return null;
    const t = await timings(s.slug, lectureHash(lec), flatten(lec).length);
    const stale = t === "stale";
    // untimed (stale recording): windows without seconds; the palette shows one link to the lecture
    const windows = transcriptWindows(lec, stale ? "none" : t ?? "estimate");
    return { s, stale, windows };
  });
  for (const b of built) {
    if (!b || !b.windows.length) continue;
    const k = l.push([b.s.slug, b.s.title, b.s.code, b.s.href, b.stale ? TRANSCRIPT_UNTIMED : TRANSCRIPT_TIMED]) - 1;
    for (const w of b.windows) m.push([k, w.at, w.text]);
  }

  const shortScripts = await pool(shorts, async (s) => ({ s, l: await getShort(s.id).catch(() => null) }));
  for (const { s, l: sh } of shortScripts) {
    const text = sh ? shortText(sh) : "";
    if (!text) continue;
    const k = l.push([s.id, s.title, s.label, `/learn/shorts?v=${encodeURIComponent(s.id)}`, TRANSCRIPT_SHORT]) - 1;
    m.push([k, -1, text]);
  }

  const body: TranscriptIndex = { v: 1, built: new Date().toISOString(), l, m };
  return NextResponse.json(body);
}
