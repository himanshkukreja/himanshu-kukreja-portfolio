import "server-only";
/**
 * ⌘K's DSA index, built once per content commit. Two parts, each one R2 object (<prefix>/derived/search-<part>-v1-<sha>.json,
 * the same pattern as the tutor's catalog, ai/search.ts): "docs" (lessons and problems, the palette's scorer input) and
 * "moments" (lecture and short narration windows, loaded only for "In lectures" deep links). Building them is ~330 content
 * reads plus a media.json per lecture (20-250 s on Workers, Nov 2026), so the deploy warm-up (GET /api/dsa/ai-warm) builds
 * them; visitors read the object in one go. Per isolate the body is kept in memory.
 */
import { readDerived, writeDerived } from "@/lib/content-r2";
import { conceptLectureHref, getConceptIndex, getConceptLecture, getProblemIndex, getStepLabels } from "./load";
import { getDsaShortAny as getDsaShort, getLeanIndex, getLeanLecture } from "./kinds-load";
import { leanLectureHref } from "./kinds";
import { listDsaShorts } from "./media";
import { dsaBundleVersion } from "./content";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import { flatten, type LectureMedia } from "@/lib/learn/lecture/types";
import { shortText, transcriptWindows, TRANSCRIPT_SHORT, TRANSCRIPT_TIMED, TRANSCRIPT_UNTIMED, type TranscriptIndex, type TranscriptMoment, type TranscriptSource } from "@/lib/learn/lecture/transcript";
import { stepOf } from "./steps";
import { buildDsaDocs, slimDoc, type DsaMoments, type DsaSearchIndex } from "./search-index";

export type SearchPart = "docs" | "moments";
/** moments as stored: the shorts' parent lectures too, so the publishing controls are applied when served, not when built */
export type StoredMoments = DsaMoments & { shortOf: Record<string, string> };

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

export async function buildDocs(): Promise<DsaSearchIndex> {
  const [concepts, problems, labels, lean] = await Promise.all([getConceptIndex().catch(() => []), getProblemIndex().catch(() => []), getStepLabels().catch(() => ({})), getLeanIndex().catch(() => [])]);
  const whereOf = (x: (typeof lean)[number]) => (x.station ? stepOf(labels, x.station).label : x.moduleTitle);
  const docs = buildDsaDocs(concepts, problems, (m) => stepOf(labels, m).step, lean.map((x) => ({ id: x.id, module: x.module, kind: x.kind, title: x.title, summary: x.summary, where: whereOf(x) })));
  return { v: 2, docs: docs.map(slimDoc) };
}

export async function buildMoments(): Promise<StoredMoments> {
  const [concepts, labels, shorts, lean] = await Promise.all([getConceptIndex().catch(() => []), getStepLabels().catch(() => ({})), listDsaShorts({ ignoreControls: true }).catch(() => []), getLeanIndex().catch(() => [])]);
  const whereOf = (x: (typeof lean)[number]) => (x.station ? stepOf(labels, x.station).label : x.moduleTitle);
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
  // lean lessons' lectures: the same moments, linking to their own lecture pages
  const leanBuilt = await pool(lean, async (x) => {
    const lec = await getLeanLecture(x.module, x.id).catch(() => null);
    if (!lec) return null;
    const t = await timings(lec.quest, lectureHash(lec), flatten(lec).length);
    const stale = t === "stale";
    return { x, lec, stale, windows: transcriptWindows(lec, stale ? "none" : t ?? "estimate") };
  });
  for (const b of leanBuilt) {
    if (!b || !b.windows.length) continue;
    const k = l.push([b.lec.quest, b.lec.title, whereOf(b.x), leanLectureHref(b.x.kind, b.x.module, b.x.id), b.stale ? TRANSCRIPT_UNTIMED : TRANSCRIPT_TIMED]) - 1;
    for (const w of b.windows) m.push([k, w.at, w.text]);
  }
  // shorts: one entry each (controls are applied when served)
  const shortOf: Record<string, string> = {};
  const scripts = await pool(shorts, async (s) => ({ s, l: await getDsaShort(s.id).catch(() => null) }));
  for (const { s, l: sh } of scripts) {
    const text = sh ? shortText(sh) : "";
    if (!text) continue;
    const k = l.push([s.id, s.title, s.label, `/dsa/shorts?v=${encodeURIComponent(s.id)}`, TRANSCRIPT_SHORT]) - 1;
    m.push([k, -1, text]);
    shortOf[s.id] = s.lecture;
  }
  return { v: 1, transcripts: { v: 1, built: new Date().toISOString(), l, m } satisfies TranscriptIndex, shortOf };
}

type Entry = { sha: string | null; body: string; at: number };
const memory = new Map<SearchPart, Entry>();
const building = new Map<string, Promise<{ body: string; from: "memory" | "r2" | "built" }>>();
/** without a bundle sha (local files) the body is rebuilt after this */
const NO_SHA_TTL = 5 * 60_000;

/** The content commit's sha, or null (no bundle: local files). */
export const contentSha = () => dsaBundleVersion().catch(() => null);

/** A part's JSON text for this content commit: this isolate's memory, else the R2 object, else built (and written to R2). */
export async function loadSearchPart(part: SearchPart, sha: string | null): Promise<{ body: string; from: "memory" | "r2" | "built" }> {
  const hit = memory.get(part);
  if (hit && hit.sha === sha && (sha || Date.now() - hit.at < NO_SHA_TTL)) return { body: hit.body, from: "memory" };
  const key = `${part}:${sha}`;
  let p = building.get(key);
  if (!p) {
    p = (async () => {
      const name = sha ? `search-${part}-v1-${sha}` : null;
      if (name) {
        const raw = await readDerived("dsa", name);
        if (raw && raw.charCodeAt(0) === 123) {
          memory.set(part, { sha, body: raw, at: Date.now() });
          return { body: raw, from: "r2" as const };
        }
      }
      const body = JSON.stringify(part === "docs" ? await buildDocs() : await buildMoments());
      if (name) await writeDerived("dsa", name, body);
      memory.set(part, { sha, body, at: Date.now() });
      return { body, from: "built" as const };
    })().finally(() => building.delete(key));
    building.set(key, p);
  }
  return p;
}
