import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { conceptLectureHref, getConceptIndex, getConceptLecture, getDsaShort, getProblemIndex, getStepLabels } from "@/lib/dsa/load";
import { listDsaShorts } from "@/lib/dsa/media";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import { flatten, type LectureMedia } from "@/lib/learn/lecture/types";
import { shortText, transcriptWindows, TRANSCRIPT_SHORT, TRANSCRIPT_TIMED, TRANSCRIPT_UNTIMED, type TranscriptIndex, type TranscriptMoment, type TranscriptSource } from "@/lib/learn/lecture/transcript";
import { stepOf } from "@/lib/dsa/steps";
import { buildDsaDocs, type DsaSearchIndex } from "@/lib/dsa/search-index";

export const runtime = "nodejs";
// ⌘K on a DSA page: lessons, problems and lecture/short moments, built once and served from the cache (CDN), refreshed with the
// content and when publishing controls change (revalidateControlled). Filtering happens in the browser, so no query is taken.
export const revalidate = 86400;

const POOL = 8;
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

/** the recording's step timings when it was made from this exact script; "stale" when older; null (estimate) without one */
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
  if (!DSA_FULL) return NextResponse.json({ v: 1, docs: [], transcripts: { v: 1, built: "", l: [], m: [] } } satisfies DsaSearchIndex);
  const [concepts, problems, labels, shorts] = await Promise.all([getConceptIndex().catch(() => []), getProblemIndex().catch(() => []), getStepLabels().catch(() => ({})), listDsaShorts().catch(() => [])]);
  const docs = buildDsaDocs(concepts, problems, (m) => stepOf(labels, m).step);

  const l: TranscriptSource[] = [];
  const m: TranscriptMoment[] = [];
  const built = await pool(
    concepts.filter((c) => c.status === "built"),
    async (c) => {
      const lec = await getConceptLecture(c.id).catch(() => null);
      if (!lec) return null;
      const t = await timings(lec.quest, lectureHash(lec), flatten(lec).length);
      const stale = t === "stale";
      return { c, lec, stale, windows: transcriptWindows(lec, stale ? "none" : t ?? "estimate") };
    },
  );
  for (const b of built) {
    if (!b || !b.windows.length) continue;
    const k = l.push([b.lec.quest, b.lec.title, stepOf(labels, b.c.module).step, conceptLectureHref(b.c.id), b.stale ? TRANSCRIPT_UNTIMED : TRANSCRIPT_TIMED]) - 1;
    for (const w of b.windows) m.push([k, w.at, w.text]);
  }
  // shorts: only the ones the publishing controls leave live (listDsaShorts), one entry each
  const scripts = await pool(shorts, async (s) => ({ s, l: await getDsaShort(s.id).catch(() => null) }));
  for (const { s, l: sh } of scripts) {
    const text = sh ? shortText(sh) : "";
    if (!text) continue;
    const k = l.push([s.id, s.title, s.label, `/dsa/shorts?v=${encodeURIComponent(s.id)}`, TRANSCRIPT_SHORT]) - 1;
    m.push([k, -1, text]);
  }
  const transcripts: TranscriptIndex = { v: 1, built: new Date().toISOString(), l, m };
  return NextResponse.json({ v: 1, docs, transcripts } satisfies DsaSearchIndex);
}
