/**
 * Saved learning paths: an AI learning path from smart search (or a set of its results) that a learner
 * keeps, opens from any tab or device, and ticks off step by step. Pure: the hook
 * (components/learn/saved/useSavedPaths.ts), the game sync's merge and the checks share it.
 *
 * Storage: no table of its own. Each saved path is one game flag, `spath:<id>` → SavedPath, so it lives in
 * this browser (hk.game.v1) for everyone and in user_profiles.game_flags for signed-in learners, synced the
 * way the study plan and reading-trail marks are (src/game/useGameSync.ts). One flag per path keeps the
 * merge per path: two devices (or tabs) keep the copy with the newer `updatedAt`, and a removed path stays
 * as a small tombstone (deleted, no steps, ~150 bytes) so a stale copy elsewhere can't bring it back.
 *
 * Every step is copied from the search index (title, place, link, the AI's "why"): a saved path never holds
 * a link the model wrote, and `cleanSavedPath` drops anything that isn't a site-relative link.
 */
import { queryKey } from "@/lib/search/smart/text";
import { KINDS, type Hit, type Kind } from "@/lib/search/smart/types";

export const SAVED_PATH_PREFIX = "spath:";
/** at most this many saved paths per learner (they ride in the profile's game_flags) */
export const SAVED_PATHS_MAX = 24;
/** at most this many steps per saved path (a learning path has 7; a saved set of results 10) */
export const SAVED_STEPS_MAX = 12;

export type SavedStep = {
  /** the index id (L:week/slug, S:…#anchor, M:lecture@83, …) */
  id: string;
  kind: Kind;
  title: string;
  sub: string;
  href: string;
  /** the second a lecture moment starts (-1: none) */
  at: number;
  /** the AI's one line on why this step (empty for a saved set of results) */
  why: string;
};

export type SavedPath = {
  v: 1;
  id: string;
  /** "path": an AI learning path · "results": a set of search results */
  source: "path" | "results";
  /** the search it came from (opens again at /learn/search?q=) */
  q: string;
  /** what the learner is after, in a line (the AI's intent; the query for a set of results) */
  title: string;
  /** the AI's honest note when the course covers it only partly */
  note: string;
  steps: SavedStep[];
  /** step id → when it was ticked (epoch ms) */
  ticks: Record<string, number>;
  createdAt: number;
  updatedAt: number;
  /** removed: kept as a tombstone (no steps) so other devices drop it too */
  deleted?: true;
};

export type SaveInput = {
  source: SavedPath["source"];
  q: string;
  title?: string;
  note?: string;
  steps: (Hit & { why?: string })[];
};

const KIND_SET = new Set<string>(KINDS);
const str = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
/** site-relative links only: "/learn/…" (never "//host", "javascript:", or anything the model could have written) */
const safeHref = (x: unknown) => {
  const h = str(x, 400);
  return /^\/(?!\/)[^\s\\]*$/.test(h) ? h : "";
};

/** FNV-1a, 32-bit, base 36: a short stable id for a query */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** One saved path per query and source: saving the same search again updates it (ticks kept). */
export const savedPathId = (source: SavedPath["source"], q: string) => `${source === "path" ? "p" : "r"}${hash(queryKey(q) || q.trim().toLowerCase())}`;
export const savedPathKey = (id: string) => `${SAVED_PATH_PREFIX}${id}`;
export const isSavedPathKey = (key: string) => key.startsWith(SAVED_PATH_PREFIX);

function cleanStep(x: unknown): SavedStep | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = str(o.id, 200);
  const kind = str(o.kind, 20);
  const href = safeHref(o.href);
  const title = str(o.title, 200);
  if (!id || !KIND_SET.has(kind) || !href || !title) return null;
  const at = Number(o.at);
  return { id, kind: kind as Kind, title, sub: str(o.sub, 120), href, at: Number.isFinite(at) && at >= 0 ? Math.floor(at) : -1, why: str(o.why, 220) };
}

/** A stored value (this browser's or another device's) as a SavedPath, or null when it isn't one. */
export function cleanSavedPath(x: unknown): SavedPath | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = str(o.id, 40);
  const updatedAt = Number(o.updatedAt) || 0;
  if (!/^[a-z0-9]+$/.test(id) || !updatedAt) return null;
  const createdAt = Number(o.createdAt) || updatedAt;
  const source = o.source === "results" ? "results" : "path";
  if (o.deleted) return { v: 1, id, source, q: "", title: "", note: "", steps: [], ticks: {}, createdAt, updatedAt, deleted: true };
  const steps: SavedStep[] = [];
  const seen = new Set<string>();
  for (const s of Array.isArray(o.steps) ? o.steps : []) {
    const c = cleanStep(s);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    steps.push(c);
    if (steps.length >= SAVED_STEPS_MAX) break;
  }
  if (!steps.length) return null;
  const ticks: Record<string, number> = {};
  if (o.ticks && typeof o.ticks === "object") for (const [k, v] of Object.entries(o.ticks as Record<string, unknown>)) if (seen.has(k) && Number(v) > 0) ticks[k] = Number(v);
  const q = str(o.q, 300);
  return { v: 1, id, source, q, title: str(o.title, 200) || q, note: str(o.note, 300), steps, ticks, createdAt, updatedAt };
}

/** The saved paths in a set of game flags: live ones, newest first. */
export function listSavedPaths(flags: Record<string, unknown>): SavedPath[] {
  const out: SavedPath[] = [];
  for (const [k, v] of Object.entries(flags)) {
    if (!isSavedPathKey(k)) continue;
    const p = cleanSavedPath(v);
    if (p && !p.deleted && savedPathKey(p.id) === k) out.push(p);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** A new saved path (or the same search saved again: `prev`'s ticks carry over for steps it still has). */
export function buildSavedPath(input: SaveInput, now: number, prev?: SavedPath | null): SavedPath | null {
  const id = savedPathId(input.source, input.q);
  const draft = cleanSavedPath({
    v: 1,
    id,
    source: input.source,
    q: input.q,
    title: input.title || input.q,
    note: input.note || "",
    steps: input.steps.map((s) => ({ id: s.id, kind: s.kind, title: s.title, sub: s.sub, href: s.href, at: s.at, why: s.why ?? "" })),
    ticks: prev && !prev.deleted ? prev.ticks : {},
    createdAt: prev && !prev.deleted ? prev.createdAt : now,
    updatedAt: now,
  });
  return draft;
}

/** The tombstone a removed path leaves. */
export const removedSavedPath = (p: Pick<SavedPath, "id" | "source" | "createdAt">, now: number): SavedPath => ({
  v: 1,
  id: p.id,
  source: p.source,
  q: "",
  title: "",
  note: "",
  steps: [],
  ticks: {},
  createdAt: p.createdAt,
  updatedAt: now,
  deleted: true,
});

const updatedAtOf = (v: unknown) => (v && typeof v === "object" ? Number((v as { updatedAt?: unknown }).updatedAt) || 0 : 0);

/**
 * Merge rule for saved-path flags between two copies (two devices, or two tabs): per key, the copy with the
 * newer updatedAt wins; a key only one side has is kept. Other flags are left to the caller. Returns `base`
 * itself when nothing changes (so a React state update can be skipped).
 */
export function mergeSavedPathFlags(base: Record<string, unknown>, other: Record<string, unknown>): Record<string, unknown> {
  let out = base;
  for (const [k, v] of Object.entries(other)) {
    if (!isSavedPathKey(k)) continue;
    if (k in base && updatedAtOf(base[k]) >= updatedAtOf(v)) continue;
    if (out === base) out = { ...base };
    out[k] = v;
  }
  return out;
}

/**
 * The game flags after a device sync (src/game/useGameSync.ts mergeGame): this browser's flags win, as
 * they always have, except saved paths, where the newer copy of each wins. `localStale`: this browser's
 * copy predates the account's last reset, so the account's flags stand.
 */
export function mergeGameFlags(remote: Record<string, unknown>, local: Record<string, unknown>, localStale: boolean): Record<string, unknown> {
  return mergeSavedPathFlags({ ...remote, ...(localStale ? {} : local) }, remote);
}

/** "<week>/<slug>" for a step that is a whole lesson or side quest (its completion is lesson progress), else null. */
export function lessonKeyOfStep(step: Pick<SavedStep, "id" | "kind">): string | null {
  if (step.kind !== "lesson" && step.kind !== "quest") return null;
  const m = /^L:([^/#]+)\/([^/#]+)$/.exec(step.id);
  return m ? `${m[1]}/${m[2]}` : null;
}
