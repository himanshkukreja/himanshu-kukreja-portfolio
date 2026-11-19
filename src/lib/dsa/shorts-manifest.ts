import "server-only";
import { readDerived, writeDerived } from "@/lib/content-r2";
import { lectureHash } from "@/lib/learn/lecture/load";
import type { Lecture } from "@/lib/learn/lecture/types";
import { conceptHref, conceptLectureHref, getConceptIndex, getConceptShortIds, getDsaShort, getStepLabels } from "./load";
import { getDsaShortAny, getLeanIndex, getLeanShortIds } from "./kinds-load";
import { dsaBundleVersion } from "./content";
import { stepRank } from "./steps";
import { leanLectureHref } from "./kinds";

/**
 * DSA's shorts as ONE manifest per content commit (<prefix>/derived/shorts-v1-<sha>.json in R2), the same pattern as
 * ⌘K's moments (search-index-build.ts). Walking ~650 shorts per request (a content read and a media.json each) blew a
 * Worker's subrequest limit: later fetches failed, every short read "not recorded", and the feed said "No shorts here
 * yet". The deploy warm-up builds the manifest in slices of a few lessons (GET /api/dsa/ai-warm?part=shorts&chunk=n,
 * then ?part=shorts to put the slices together); lists read the one object, kept in this isolate for a minute or two.
 * POST /api/revalidate-courses?source=dsa rebuilds it (fresh slices) so a render that just published media shows at once.
 */

const MEDIA = () => (process.env.NEXT_PUBLIC_LECTURE_MEDIA || "").replace(/\/$/, "");
/** same fingerprint as lectureHash() in src/lib/learn/lecture/load.ts and export.mjs */
export const hashOf = lectureHash;
export const wordsOf = (l: Lecture) => l.scenes.reduce((a, s) => a + s.steps.reduce((b, st) => b + st.say.split(/\s+/).length, 0), 0);

/** The published media's script hash and length, or null (not published, or no media host). `fresh`: past the fetch cache. */
export async function publishedMedia(quest: string, fresh = false): Promise<{ source: string; duration: number } | null> {
  const base = MEDIA();
  if (!/^https?:\/\//.test(base)) return null;
  try {
    const res = await fetch(`${base}/${quest}/media.json`, fresh ? { cache: "no-store" } : { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const m = (await res.json()) as { source?: string; duration?: number; video?: string };
    return m.source && m.video ? { source: m.source, duration: Number(m.duration) || 0 } : null;
  } catch {
    return null;
  }
}

/** One short as the manifest keeps it (src and poster are made from `v` when listed) */
export type ShortRow = {
  id: string;
  title: string;
  label: string;
  /** the first scene's headline (Quick review's cover until the video is rendered) */
  head: string;
  topics: string[];
  /** the long lecture's id (short.of): its publishing control and the share counts */
  of: string;
  full: string;
  article: string;
  /** the script's hash: the media is current when media.json's source is this */
  v: string;
  recorded: boolean;
  seconds: number;
};

type LeanItem = Awaited<ReturnType<typeof getLeanIndex>>[number];

/** The manifest row for a short script (`lean`: its lesson when it is a lean one) and its published media (null: none). */
export function rowOf(l: Lecture, lean: LeanItem | undefined, media: { source: string; duration: number } | null): ShortRow | null {
  if (!l.short || !l.dsa) return null;
  const v = hashOf(l);
  const recorded = !!media && media.source === v;
  return {
    id: l.quest,
    title: l.title,
    label: l.short.label,
    head: l.scenes?.[0]?.title ?? "",
    topics: l.short.topics ?? [],
    of: l.short.of,
    full: `${lean ? leanLectureHref(lean.kind, lean.module, lean.id) : conceptLectureHref(l.dsa.concept)}${l.short.at ? `?at=${encodeURIComponent(l.short.at)}` : ""}`,
    article: lean ? lean.href : conceptHref(l.dsa.concept),
    v,
    recorded,
    seconds: recorded && media.duration ? Math.round(media.duration) : Math.round((wordsOf(l) / 150) * 60 * 1.08),
  };
}

/** one short by its id, with its own media.json read just now (the short's page; no listing) */
export async function shortRow(id: string): Promise<ShortRow | null> {
  const l = await getDsaShortAny(id).catch(() => null);
  if (!l?.short || !l.dsa) return null;
  const isConcept = !!(await getDsaShort(id).catch(() => null));
  const lean = isConcept ? undefined : (await getLeanIndex().catch(() => [])).find((y) => y.module === l.dsa!.module && y.id === l.dsa!.concept);
  return rowOf(l, lean, await publishedMedia(l.quest, true));
}

/* ------------------------------------------------------------------ the slices */

/** lessons per slice: each short takes a content read and a media.json, and a Worker request may make only so many */
export const SHORTS_CHUNK = 10;
const POOL = 6;
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

type Item = { kind: "concept"; id: string } | { kind: "lean"; lean: LeanItem };
/** built concepts in learner order, then the lean lessons (streets, camp tents, sets) */
async function items(): Promise<Item[]> {
  const [concepts, labels, lean] = await Promise.all([getConceptIndex().catch(() => []), getStepLabels().catch(() => ({})), getLeanIndex().catch(() => [])]);
  const built = concepts.filter((c) => c.status === "built").sort((a, b) => stepRank(labels, a.module) - stepRank(labels, b.module) || a.order - b.order);
  return [...built.map((c): Item => ({ kind: "concept", id: c.id })), ...lean.map((x): Item => ({ kind: "lean", lean: x }))];
}
export const shortsChunks = async () => Math.ceil((await items()).length / SHORTS_CHUNK);

/** The rows of slice n's lessons (media.json read just now, past every cache). */
export async function buildShortsChunk(n: number): Promise<ShortRow[]> {
  const part = (await items()).slice(n * SHORTS_CHUNK, (n + 1) * SHORTS_CHUNK);
  const rows = await pool(part, async (it) => {
    const ids = it.kind === "concept" ? await getConceptShortIds(it.id).catch(() => []) : await getLeanShortIds(it.lean.module, it.lean.id).catch(() => []);
    const out: ShortRow[] = [];
    for (const id of ids) {
      const l = await getDsaShortAny(id).catch(() => null);
      if (!l?.short || !l.dsa) continue;
      const row = rowOf(l, it.kind === "lean" ? it.lean : undefined, await publishedMedia(l.quest, true));
      if (row) out.push(row);
    }
    return out;
  });
  return rows.flat();
}

const chunkName = (sha: string, n: number) => `shorts-chunk-v1-${sha}-${n}`;
const finalName = (sha: string) => `shorts-v1-${sha}`;

/** The content commit's sha, or null (no bundle: local files). */
export const shortsSha = () => dsaBundleVersion().catch(() => null);

/** Slice n of this commit: its R2 object, else built and written there; `fresh` builds it again (media just published). */
export async function loadShortsChunk(sha: string | null, n: number, fresh = false): Promise<{ rows: ShortRow[]; from: "r2" | "built" }> {
  if (sha && !fresh) {
    const raw = await readDerived("dsa", chunkName(sha, n));
    if (raw && raw.charCodeAt(0) === 91) {
      try { return { rows: JSON.parse(raw) as ShortRow[], from: "r2" }; } catch {}
    }
  }
  const rows = await buildShortsChunk(n);
  if (sha) await writeDerived("dsa", chunkName(sha, n), JSON.stringify(rows));
  return { rows, from: "built" };
}

/** Put the slices R2 holds together into the commit's manifest object (throws if a slice is missing). */
export async function assembleShorts(sha: string): Promise<{ rows: number; recorded: number }> {
  const total = await shortsChunks();
  const got = await pool(Array.from({ length: total }, (_, n) => n), async (n) => {
    const raw = await readDerived("dsa", chunkName(sha, n));
    try { return raw ? (JSON.parse(raw) as ShortRow[]) : null; } catch { return null; }
  });
  const missing = got.flatMap((x, n) => (x ? [] : [n]));
  if (missing.length) throw new Error(`shorts slices missing: ${missing.join(",")}`);
  const rows = (got as ShortRow[][]).flat();
  if (!(await writeDerived("dsa", finalName(sha), JSON.stringify({ v: 1, built: new Date().toISOString(), rows })))) throw new Error("shorts manifest could not be written");
  memory = null;
  return { rows: rows.length, recorded: rows.filter((r) => r.recorded).length };
}

/**
 * After media was published (POST /api/revalidate-courses?source=dsa): every slice read again, then the manifest. The
 * slices are other requests of this site (each has its own subrequest budget), 4 at a time; `auth` is the caller's
 * Authorization header (a fresh build is for admins only).
 */
export async function rebuildShorts(origin: string, auth: string): Promise<void> {
  const sha = await shortsSha();
  if (!sha) return;
  const call = async (n: number) => {
    const r = await fetch(`${origin}/api/dsa/ai-warm?part=shorts&chunk=${n}&fresh=1`, { headers: { authorization: auth }, cache: "no-store" });
    return r.ok ? ((await r.json()) as { chunks?: number }) : null;
  };
  const first = await call(0);
  if (!first?.chunks) return;
  let todo = Array.from({ length: first.chunks - 1 }, (_, i) => i + 1);
  for (let round = 0; round < 2 && todo.length; round++) {
    const failed: number[] = [];
    let k = 0;
    await Promise.all(Array.from({ length: 4 }, async () => { while (k < todo.length) { const n = todo[k++]; if (!(await call(n).catch(() => null))) failed.push(n); } }));
    todo = failed;
  }
  await fetch(`${origin}/api/dsa/ai-warm?part=shorts`, { headers: { authorization: auth }, cache: "no-store" }).catch(() => null);
}

/* ------------------------------------------------------------------ reading */

let memory: { sha: string | null; rows: ShortRow[]; at: number } | null = null;
let loading: Promise<ShortRow[]> | null = null;
/** how long this isolate keeps the manifest before it reads the object again (a rebuild shows within this) */
const TTL = 90_000;
const NO_SHA_TTL = 5 * 60_000;

/** Every short's row, in course order: this isolate's copy, else the commit's R2 object. Throws when it isn't built yet. */
export async function shortRows(): Promise<ShortRow[]> {
  if (memory && Date.now() - memory.at < (memory.sha ? TTL : NO_SHA_TTL)) return memory.rows;
  if (!loading) {
    loading = (async () => {
      const sha = await shortsSha();
      if (sha) {
        const raw = await readDerived("dsa", finalName(sha));
        if (raw && raw.charCodeAt(0) === 123) {
          const rows = (JSON.parse(raw) as { rows: ShortRow[] }).rows;
          memory = { sha, rows, at: Date.now() };
          return rows;
        }
        throw new Error("shorts manifest is not built for this commit yet (GET /api/dsa/ai-warm?part=shorts&chunk=n)");
      }
      // local files: no bundle, so nothing to key an object by; build it here
      const total = await shortsChunks();
      const rows = (await pool(Array.from({ length: total }, (_, n) => n), (n) => buildShortsChunk(n))).flat();
      memory = { sha, rows, at: Date.now() };
      return rows;
    })().finally(() => { loading = null; });
  }
  return loading;
}
