import "server-only";
/**
 * ⌘K's DSA index, built once per content commit. Two parts, each one R2 object (<prefix>/derived/search-<part>-v1-<sha>.json,
 * the same pattern as the tutor's catalog, ai/search.ts): "docs" (lessons and problems, the palette's scorer input) and
 * "moments" (lecture and short narration windows, loaded only for "In lectures" deep links). Building them is ~330 content
 * reads plus a media.json per lecture (20-250 s on Workers, Nov 2026), so the deploy warm-up (GET /api/dsa/ai-warm) builds
 * them; visitors read the object in one go. Per isolate the body is kept in memory.
 */
import { readDerived, writeDerived } from "@/lib/content-r2";
import { conceptLectureHref, getConceptIndex, getConceptLecture, getConceptShortIds, getProblemIndex, getStepLabels } from "./load";
import { getDsaShortAny as getDsaShort, getLeanIndex, getLeanLecture, getLeanShortIds } from "./kinds-load";
import { leanLectureHref } from "./kinds";
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

/** a lecture's published media.json (null: none) */
async function mediaOf(slug: string): Promise<Partial<LectureMedia> | null> {
  const base = (lectureMediaBase() || "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(base)) return null;
  try {
    const res = await fetch(`${base}/${slug}/media.json`, { next: { revalidate: 86400 } });
    return res.ok ? ((await res.json()) as Partial<LectureMedia>) : null;
  } catch {
    return null;
  }
}
/** the recording's step timings when it was made from this exact script; "stale" when older; null (estimate) without one */
async function timings(slug: string, source: string, steps: number): Promise<number[] | "stale" | null> {
  const m = await mediaOf(slug);
  if (!m) return null;
  if (m.source !== source) return "stale";
  return Array.isArray(m.starts) && m.starts.length === steps ? m.starts : null;
}

export async function buildDocs(): Promise<DsaSearchIndex> {
  const [concepts, problems, labels, lean] = await Promise.all([getConceptIndex().catch(() => []), getProblemIndex().catch(() => []), getStepLabels().catch(() => ({})), getLeanIndex().catch(() => [])]);
  const whereOf = (x: (typeof lean)[number]) => (x.station ? stepOf(labels, x.station).label : x.moduleTitle);
  const docs = buildDsaDocs(concepts, problems, (m) => stepOf(labels, m).step, lean.map((x) => ({ id: x.id, module: x.module, kind: x.kind, title: x.title, summary: x.summary, where: whereOf(x) })));
  return { v: 2, docs: docs.map(slimDoc) };
}

/** One lecture or short in the moments: its source row, its windows, and (a short) its parent lecture */
export type MomentEntry = { s: TranscriptSource; m: [at: number, text: string][]; of?: string };
type Item = { kind: "concept"; id: string; step: string } | { kind: "lean"; id: string; module: string };
/** how many lessons (each with its lecture and shorts) one chunk covers: a Worker request may make ~1,000 subrequests, a lecture and its shorts take dozens */
export const CHUNK = 8;

async function momentItems(): Promise<{ items: Item[]; lean: Awaited<ReturnType<typeof getLeanIndex>>; labels: Awaited<ReturnType<typeof getStepLabels>> }> {
  const [concepts, labels, lean] = await Promise.all([getConceptIndex().catch(() => []), getStepLabels().catch(() => ({})), getLeanIndex().catch(() => [])]);
  const items: Item[] = [...concepts.filter((c) => c.status === "built").map((c): Item => ({ kind: "concept", id: c.id, step: c.module })), ...lean.map((x): Item => ({ kind: "lean", id: x.id, module: x.module }))];
  return { items, lean, labels };
}
export const momentChunks = async () => Math.ceil((await momentItems()).items.length / CHUNK);

/** The moments of chunk n's lessons: each one's lecture and its recorded shorts (controls are applied when served). */
export async function buildMomentChunk(n: number): Promise<MomentEntry[]> {
  const { items, lean, labels } = await momentItems();
  const out: MomentEntry[] = [];
  const parts = await pool(items.slice(n * CHUNK, (n + 1) * CHUNK), async (it) => {
    const rows: MomentEntry[] = [];
    let shortIds: string[] = [];
    if (it.kind === "concept") {
      const lec = await getConceptLecture(it.id).catch(() => null);
      if (lec) {
        const t = await timings(lec.quest, lectureHash(lec), flatten(lec).length);
        const w = transcriptWindows(lec, t === "stale" ? "none" : t ?? "estimate");
        if (w.length) rows.push({ s: [lec.quest, lec.title, stepOf(labels, it.step).step, conceptLectureHref(it.id), t === "stale" ? TRANSCRIPT_UNTIMED : TRANSCRIPT_TIMED], m: w.map((x) => [x.at, x.text]) });
      }
      shortIds = await getConceptShortIds(it.id).catch(() => []);
    } else {
      const x = lean.find((y) => y.module === it.module && y.id === it.id);
      if (!x) return rows;
      const lec = await getLeanLecture(x.module, x.id).catch(() => null);
      if (lec) {
        const t = await timings(lec.quest, lectureHash(lec), flatten(lec).length);
        const w = transcriptWindows(lec, t === "stale" ? "none" : t ?? "estimate");
        const where = x.station ? stepOf(labels, x.station).label : x.moduleTitle;
        if (w.length) rows.push({ s: [lec.quest, lec.title, where, leanLectureHref(x.kind, x.module, x.id), t === "stale" ? TRANSCRIPT_UNTIMED : TRANSCRIPT_TIMED], m: w.map((y) => [y.at, y.text]) });
      }
      shortIds = await getLeanShortIds(x.module, x.id).catch(() => []);
    }
    // a short is listed once it is recorded from its current script (what listDsaShorts requires), one entry with its whole narration
    for (const id of shortIds) {
      const sh = await getDsaShort(id).catch(() => null);
      if (!sh?.short || !sh.dsa) continue;
      const text = shortText(sh);
      if (!text) continue;
      const media = await mediaOf(sh.quest);
      if (!media || media.source !== lectureHash(sh)) continue;
      rows.push({ s: [sh.quest, sh.title, sh.short.label, `/dsa/shorts?v=${encodeURIComponent(sh.quest)}`, TRANSCRIPT_SHORT], m: [[-1, text]], of: sh.short.of });
    }
    return rows;
  });
  for (const r of parts) out.push(...r);
  return out;
}

/** The chunks' entries as the stored moments: lectures first, then shorts (the order the palette showed them in). */
export function assembleMoments(chunks: MomentEntry[][]): StoredMoments {
  const entries = chunks.flat();
  const l: TranscriptSource[] = [];
  const m: TranscriptMoment[] = [];
  const shortOf: Record<string, string> = {};
  for (const e of [...entries.filter((x) => x.s[4] !== TRANSCRIPT_SHORT), ...entries.filter((x) => x.s[4] === TRANSCRIPT_SHORT)]) {
    const k = l.push(e.s) - 1;
    for (const [at, text] of e.m) m.push([k, at, text]);
    if (e.of) shortOf[e.s[0]] = e.of;
  }
  return { v: 1, transcripts: { v: 1, built: new Date().toISOString(), l, m } satisfies TranscriptIndex, shortOf };
}

const chunkName = (sha: string, n: number) => `search-mchunk-v1-${sha}-${n}`;

/** Chunk n of this content commit: its R2 object, else built and written there. */
export async function loadMomentChunk(sha: string | null, n: number): Promise<{ entries: MomentEntry[]; from: "r2" | "built" }> {
  if (sha) {
    const raw = await readDerived("dsa", chunkName(sha, n));
    if (raw && raw.charCodeAt(0) === 91) {
      try { return { entries: JSON.parse(raw) as MomentEntry[], from: "r2" }; } catch {}
    }
  }
  const entries = await buildMomentChunk(n);
  if (sha) await writeDerived("dsa", chunkName(sha, n), JSON.stringify(entries));
  return { entries, from: "built" };
}

/** Moments from the chunks R2 holds (null if one is missing or there are none), for the final object. */
async function assembleFromR2(sha: string): Promise<StoredMoments | null> {
  const total = await momentChunks();
  if (!total) return null;
  const got = await pool(Array.from({ length: total }, (_, n) => n), async (n) => {
    const raw = await readDerived("dsa", chunkName(sha, n));
    try { return raw ? (JSON.parse(raw) as MomentEntry[]) : null; } catch { return null; }
  });
  return got.every((x) => x) ? assembleMoments(got as MomentEntry[][]) : null;
}

type Entry = { sha: string | null; body: string; at: number };
const memory = new Map<SearchPart, Entry>();
// Workers: a request must never await a promise another request created (it fails once that request ends): a build in progress is not shared between requests (the warm-up writes these to R2 ahead of time).
/** without a bundle sha (local files) the body is rebuilt after this */
const NO_SHA_TTL = 5 * 60_000;

/** The content commit's sha, or null (no bundle: local files). */
export const contentSha = () => dsaBundleVersion().catch(() => null);

/** A part's JSON text for this content commit: this isolate's memory, else the R2 object, else built (and written to R2). */
export async function loadSearchPart(part: SearchPart, sha: string | null): Promise<{ body: string; from: "memory" | "r2" | "built" }> {
  const hit = memory.get(part);
  if (hit && hit.sha === sha && (sha || Date.now() - hit.at < NO_SHA_TTL)) return { body: hit.body, from: "memory" };
  {
    return (async () => {
      const name = sha ? `search-${part}-v1-${sha}` : null;
      if (name) {
        const raw = await readDerived("dsa", name);
        if (raw && raw.charCodeAt(0) === 123) {
          memory.set(part, { sha, body: raw, at: Date.now() });
          return { body: raw, from: "r2" as const };
        }
      }
      let body: string;
      if (part === "docs") body = JSON.stringify(await buildDocs());
      else if (sha) {
        // moments are built chunk by chunk by the warm-up (loadMomentChunk); a request only puts finished chunks together
        const j = await assembleFromR2(sha);
        if (!j) throw new Error("moments are not built for this commit yet (GET /api/dsa/ai-warm?part=moments&chunk=n)");
        body = JSON.stringify(j);
      } else {
        const total = await momentChunks();
        body = JSON.stringify(assembleMoments(await pool(Array.from({ length: total }, (_, n) => n), (n) => buildMomentChunk(n))));
      }
      if (name) await writeDerived("dsa", name, body);
      memory.set(part, { sha, body, at: Date.now() });
      return { body, from: "built" as const };
    })();
  }
}
