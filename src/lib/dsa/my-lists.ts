/**
 * "My lists": a learner's own named problem lists (Google prep, Weekend DP). Pure and import-free, so the hook, the pages
 * and node --test share it.
 *
 * Storage: no table. Each list is one game flag, `pref:dsa-list:<id>` -> MyList, so it lives in this browser (hk.game.v1)
 * for everyone and in user_profiles.game_flags once signed in (src/game/useGameSync.ts). `pref:` flags carry `updatedAt`, so
 * when two devices meet the newer copy of each list wins (src/lib/learn/saved-paths.ts mergeGameFlags), and a deleted list
 * stays as a tiny tombstone so a stale copy elsewhere cannot bring it back. Limits keep the profile small: MAX_LISTS live
 * lists x MAX_PROBLEMS ids (about 120 KB at the very top, ~6 KB a typical list).
 *
 * Sharing: the list is encoded into the link itself (deflate + base64url of name, description and ids): no table, no
 * token, nothing stored on a server. The link is read-only by construction (it is a copy), and "Copy to my lists" makes the
 * viewer a list of their own. A shared link carries ids only; a viewer sees the problems that exist in the bank.
 */

export const LIST_FLAG = "pref:dsa-list:";
export const MAX_LISTS = 20;
export const MAX_PROBLEMS = 200;
export const NAME_MAX = 60;
export const DESC_MAX = 200;

export type MyList = {
  v: 1;
  id: string;
  name: string;
  desc: string;
  /** problem ids in the learner's order */
  ids: string[];
  createdAt: number;
  updatedAt: number;
  /** removed: kept as a tombstone (no ids) so other devices drop it too */
  deleted?: true;
};

const clean = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const uniqIds = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((i): i is string => typeof i === "string" && ID_RE.test(i)))].slice(0, MAX_PROBLEMS) : []);
export const cleanName = (x: unknown) => clean(x, NAME_MAX);
export const cleanDesc = (x: unknown) => clean(x, DESC_MAX);

/** A stored flag value -> a list, or null when it is not one. */
export function cleanList(v: unknown): MyList | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === "string" && /^[a-z0-9]{4,16}$/.test(o.id) ? o.id : "";
  if (!id) return null;
  const createdAt = Number(o.createdAt) || 0;
  const updatedAt = Number(o.updatedAt) || createdAt;
  if (o.deleted === true) return { v: 1, id, name: "", desc: "", ids: [], createdAt, updatedAt, deleted: true };
  const name = cleanName(o.name);
  if (!name) return null;
  return { v: 1, id, name, desc: cleanDesc(o.desc), ids: uniqIds(o.ids), createdAt, updatedAt };
}

/** The live lists in the flags, oldest first (the order they were made). */
export function listsFrom(flags: Record<string, unknown>): MyList[] {
  const out: MyList[] = [];
  for (const [k, v] of Object.entries(flags)) {
    if (!k.startsWith(LIST_FLAG)) continue;
    const l = cleanList(v);
    if (l && !l.deleted && k === LIST_FLAG + l.id) out.push(l);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export const flagKey = (id: string) => LIST_FLAG + id;

const RAND = "abcdefghijkmnpqrstuvwxyz23456789";
/** A short random id; `rand` is injectable for tests. */
export function newId(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += RAND[Math.floor(rand() * RAND.length)];
  return s;
}

/* ------------------------------------------------------------------ operations (each returns the new list, or null when refused) */

export type OpResult = { ok: true; list: MyList } | { ok: false; reason: string };

export function createList(existing: MyList[], name: string, desc = "", now = Date.now(), id = newId()): OpResult {
  const n = cleanName(name);
  if (!n) return { ok: false, reason: "Give the list a name." };
  if (existing.length >= MAX_LISTS) return { ok: false, reason: `You can keep ${MAX_LISTS} lists. Delete one to make room.` };
  if (existing.some((l) => l.name.toLowerCase() === n.toLowerCase())) return { ok: false, reason: "You already have a list with that name." };
  return { ok: true, list: { v: 1, id, name: n, desc: cleanDesc(desc), ids: [], createdAt: now, updatedAt: now } };
}

export function renameList(list: MyList, siblings: MyList[], name: string, desc: string, now = Date.now()): OpResult {
  const n = cleanName(name);
  if (!n) return { ok: false, reason: "Give the list a name." };
  if (siblings.some((l) => l.id !== list.id && l.name.toLowerCase() === n.toLowerCase())) return { ok: false, reason: "You already have a list with that name." };
  return { ok: true, list: { ...list, name: n, desc: cleanDesc(desc), updatedAt: now } };
}

/** The tombstone that replaces a deleted list. */
export const tombstone = (list: MyList, now = Date.now()): MyList => ({ v: 1, id: list.id, name: "", desc: "", ids: [], createdAt: list.createdAt, updatedAt: now, deleted: true });

export function addProblem(list: MyList, problemId: string, now = Date.now()): OpResult {
  if (!ID_RE.test(problemId)) return { ok: false, reason: "That problem can't be added." };
  if (list.ids.includes(problemId)) return { ok: true, list };
  if (list.ids.length >= MAX_PROBLEMS) return { ok: false, reason: `A list holds ${MAX_PROBLEMS} problems.` };
  return { ok: true, list: { ...list, ids: [...list.ids, problemId], updatedAt: now } };
}

export function removeProblem(list: MyList, problemId: string, now = Date.now()): MyList {
  return list.ids.includes(problemId) ? { ...list, ids: list.ids.filter((i) => i !== problemId), updatedAt: now } : list;
}

/** Move the problem at `from` to position `to` (both clamped). */
export function moveProblem(list: MyList, from: number, to: number, now = Date.now()): MyList {
  const n = list.ids.length;
  if (from < 0 || from >= n) return list;
  const t = Math.max(0, Math.min(n - 1, to));
  if (t === from) return list;
  const ids = [...list.ids];
  const [x] = ids.splice(from, 1);
  ids.splice(t, 0, x);
  return { ...list, ids, updatedAt: now };
}

/** Move a problem one place up (-1) or down (+1): the keyboard alternative to dragging. */
export const nudgeProblem = (list: MyList, problemId: string, dir: -1 | 1, now = Date.now()): MyList => moveProblem(list, list.ids.indexOf(problemId), list.ids.indexOf(problemId) + dir, now);

/* ------------------------------------------------------------------ the list page's numbers */

export type Progress = { total: number; solved: number; easy: number; medium: number; hard: number; solvedByLevel: { easy: number; medium: number; hard: number } };

/** Solved / total and the difficulty split, over the problems that exist in the bank (`levelOf` is undefined for an unknown id). */
export function progressOf(ids: string[], levelOf: (id: string) => string | undefined, solved: (id: string) => boolean): Progress {
  const p: Progress = { total: 0, solved: 0, easy: 0, medium: 0, hard: 0, solvedByLevel: { easy: 0, medium: 0, hard: 0 } };
  for (const id of ids) {
    const lv = levelOf(id);
    if (!lv) continue;
    p.total++;
    const s = solved(id);
    if (s) p.solved++;
    if (lv === "easy" || lv === "medium" || lv === "hard") {
      p[lv]++;
      if (s) p.solvedByLevel[lv]++;
    }
  }
  return p;
}

/** The first problem in the list's order the learner has not solved (and that exists), or null when none is left. */
export function nextUnsolved(ids: string[], exists: (id: string) => boolean, solved: (id: string) => boolean): string | null {
  return ids.find((i) => exists(i) && !solved(i)) ?? null;
}

/** Lists that hold a problem (for the "Add to list" checkboxes). */
export const listsHolding = (lists: MyList[], problemId: string): MyList[] => lists.filter((l) => l.ids.includes(problemId));

/* ------------------------------------------------------------------ share links */

export type SharedList = { name: string; desc: string; ids: string[] };

const toB64u = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  void w.write(data as unknown as BufferSource).catch(() => {});
  void w.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/**
 * The share payload: "z" + deflate(JSON) in base64url, or "p" + plain base64url when this browser has no CompressionStream.
 * JSON is [name, desc, ids...] with the ids joined by "," (a few hundred bytes for a typical list).
 */
export async function encodeShare(l: SharedList): Promise<string> {
  const json = JSON.stringify([cleanName(l.name), cleanDesc(l.desc), uniqIds(l.ids).join(",")]);
  const raw = new TextEncoder().encode(json);
  if (typeof CompressionStream === "undefined") return "p" + toB64u(raw);
  return "z" + toB64u(await pipe(raw, new CompressionStream("deflate-raw")));
}

/** A share payload -> the list, or null when it is not one (never throws). Everything is cleaned again: the link is untrusted. */
export async function decodeShare(payload: string): Promise<SharedList | null> {
  try {
    if (!payload || payload.length > 20_000 || !/^[zp][A-Za-z0-9_-]+$/.test(payload)) return null;
    const bytes = fromB64u(payload.slice(1));
    const raw = payload[0] === "z" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
    if (raw.length > 60_000) return null;
    const a = JSON.parse(new TextDecoder().decode(raw));
    if (!Array.isArray(a)) return null;
    const name = cleanName(a[0]);
    if (!name) return null;
    return { name, desc: cleanDesc(a[1]), ids: uniqIds(typeof a[2] === "string" ? a[2].split(",") : []) };
  } catch {
    return null;
  }
}

/** A copy of a shared list as the viewer's own (a unique name: "Google prep", then "Google prep (2)"). */
export function copyShared(existing: MyList[], s: SharedList, now = Date.now(), id = newId()): OpResult {
  let name = s.name;
  for (let n = 2; existing.some((l) => l.name.toLowerCase() === name.toLowerCase()); n++) name = `${s.name.slice(0, NAME_MAX - 6)} (${n})`;
  const made = createList(existing, name, s.desc, now, id);
  return made.ok ? { ok: true, list: { ...made.list, ids: uniqIds(s.ids) } } : made;
}
