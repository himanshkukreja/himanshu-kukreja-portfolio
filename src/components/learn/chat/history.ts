"use client";

/**
 * The course chat's history on this device, and its sync with the learner's account.
 *
 * localStorage (per signed-in learner; try/catch everywhere: blocked storage just means no history):
 *   hk.chats.v1:<uid>            the index: which conversation is open, and every conversation's title and dates
 *   hk.chats.t:<uid>:<id>        one conversation (the shape useCourseChat keeps)
 *   hk.chat.v1:<uid>             the old single conversation: moved into the history on first read
 *
 * Signed in, once the chat_threads table exists (GET /api/learn/ai/chat/threads says `available`), every
 * conversation is uploaded a moment after it changes and the list is merged on load, so history follows the
 * learner across devices; deletes and renames go to the account too. Until then history stays on the device.
 * Kept 90 days after the last update (here and on the server), at most 100 conversations; only the newest 40 keep
 * their messages on the device once they are safely in the account (older ones load when opened).
 */
import { userFetch } from "@/components/learn/progress/userFetch";
import { cleanTitle, THREAD_RETENTION_DAYS, THREADS_MAX, titleFrom, type ThreadMeta } from "@/lib/learn/chat-history";
import type { Conversation } from "./useCourseChat";

/** The same window event useCourseChat listens to: open views re-read the conversation. */
export const HISTORY_EVENT = "hk:course-chat-sync";
const API = "/api/learn/ai/chat/threads";
const LOCAL_BODIES = 40;
const PUSH_DELAY = 2500;

const idxKey = (uid: string) => `hk.chats.v1:${uid}`;
const bodyKey = (uid: string, id: string) => `hk.chats.t:${uid}:${id}`;
const legacyKey = (uid: string) => `hk.chat.v1:${uid}`;
/** A storage event that concerns this learner's chat (another tab changed it). */
export const isHistoryKey = (uid: string, k: string | null) => k === null || k === idxKey(uid) || k === legacyKey(uid) || k.startsWith(`hk.chats.t:${uid}:`);

export type LocalThread = ThreadMeta & {
  /** the learner renamed it */
  named?: boolean;
  /** the account's updatedAt this copy matches (unset: never uploaded) */
  synced?: number;
  /** changed since the last upload */
  dirty?: boolean;
  /** a change counter, so an upload that raced a change doesn't clear `dirty` */
  rev?: number;
  /** only in the account: the messages load when it is opened */
  remote?: boolean;
};
type Index = { v: 1; active: string | null; threads: LocalThread[] };
export type SyncState = "unknown" | "on" | "off";

const rid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const freshConversation = (): Conversation => ({ v: 1, chat: rid(), messages: [], sources: {}, quizzes: {}, paths: {}, memoryTurns: 0, updatedAt: Date.now() });

function get<T>(k: string): T | null {
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function set(k: string, v: unknown): boolean {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}
function del(k: string) {
  try {
    window.localStorage.removeItem(k);
  } catch {
    /* blocked */
  }
}

const isConv = (c: unknown): c is Conversation => !!c && (c as Conversation).v === 1 && Array.isArray((c as Conversation).messages) && typeof (c as Conversation).chat === "string";
const hasAsk = (c: Conversation) => c.messages.some((m) => m.role === "user");
/** The title a conversation gets when the learner hasn't named it. */
const derivedTitle = (c: Conversation) => c.title || titleFrom(c.messages) || "Conversation";
const metaOf = (c: Conversation, prev?: LocalThread): LocalThread => ({
  id: c.chat,
  // a name the learner gave wins; then the AI's (useCourseChat's "title" event); then the first question, cut short
  title: prev?.named ? prev.title : derivedTitle(c),
  named: prev?.named,
  createdAt: prev?.createdAt ?? c.messages[0]?.at ?? c.updatedAt,
  updatedAt: Math.max(c.updatedAt || 0, c.messages[c.messages.length - 1]?.at || 0),
  synced: prev?.synced,
  dirty: true,
  rev: (prev?.rev ?? 0) + 1,
});

/* ------------------------------------------------------------------ the index */

function readIndex(uid: string): Index {
  const raw = get<Index>(idxKey(uid));
  const idx: Index = raw && raw.v === 1 && Array.isArray(raw.threads) ? { v: 1, active: typeof raw.active === "string" ? raw.active : null, threads: raw.threads.filter((t) => t && typeof t.id === "string") } : { v: 1, active: null, threads: [] };
  // the single conversation the chat kept before history: it becomes the first one in the list
  const legacy = get<Conversation>(legacyKey(uid));
  if (legacy !== null) {
    if (isConv(legacy)) {
      const c = { ...freshConversation(), ...legacy };
      set(bodyKey(uid, c.chat), c);
      if (hasAsk(c) && !idx.threads.some((t) => t.id === c.chat)) idx.threads.push(metaOf(c));
      idx.active = c.chat;
    }
    del(legacyKey(uid));
    writeIndex(uid, idx);
  }
  return idx;
}

/** Saves the index after the rules: 90 days, 100 conversations, 40 kept with their messages once uploaded. */
function writeIndex(uid: string, idx: Index) {
  const cutoff = Date.now() - THREAD_RETENTION_DAYS * 86_400_000;
  const keep: LocalThread[] = [];
  for (const t of [...idx.threads].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const old = t.updatedAt < cutoff && t.id !== idx.active;
    if (old || (keep.length >= THREADS_MAX && t.id !== idx.active)) {
      del(bodyKey(uid, t.id));
      continue;
    }
    if (keep.length >= LOCAL_BODIES && t.id !== idx.active && t.synced && !t.dirty && !t.remote) {
      del(bodyKey(uid, t.id));
      t.remote = true;
    }
    keep.push(t);
  }
  idx.threads = keep;
  set(idxKey(uid), idx);
}

const broadcast = () => queueMicrotask(() => window.dispatchEvent(new Event(HISTORY_EVENT)));

/* ------------------------------------------------------------------ what useCourseChat reads and writes */

/** The open conversation (or a new one). */
export function readActive(uid: string): Conversation {
  const idx = readIndex(uid);
  const c = idx.active ? get<Conversation>(bodyKey(uid, idx.active)) : null;
  return isConv(c) ? { ...freshConversation(), ...c } : freshConversation();
}

/** The open conversation changed: keep it, list it (once it has a question), and upload it shortly. */
export function saveActive(uid: string, c: Conversation) {
  if (!set(bodyKey(uid, c.chat), c)) {
    // storage full: let the oldest uploaded conversations load from the account instead, then try once more
    const idx = readIndex(uid);
    for (const t of [...idx.threads].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, 10))
      if (t.id !== c.chat && t.synced && !t.dirty) {
        del(bodyKey(uid, t.id));
        t.remote = true;
      }
    writeIndex(uid, idx);
    if (!set(bodyKey(uid, c.chat), c)) return;
  }
  const idx = readIndex(uid);
  const prevActive = idx.active;
  idx.active = c.chat;
  if (hasAsk(c)) {
    const i = idx.threads.findIndex((t) => t.id === c.chat);
    const m = metaOf(c, i >= 0 ? idx.threads[i] : undefined);
    if (i >= 0) idx.threads[i] = m;
    else idx.threads.push(m);
    schedulePush(uid, c.chat);
  }
  // leaving an empty new chat: nothing to keep of it
  if (prevActive && prevActive !== c.chat && !idx.threads.some((t) => t.id === prevActive)) del(bodyKey(uid, prevActive));
  writeIndex(uid, idx);
}

/* ------------------------------------------------------------------ the account (chat_threads) */

const sync = new Map<string, SyncState>();
export const syncState = (uid: string): SyncState => sync.get(uid) ?? "unknown";
const timers = new Map<string, number>();
const lastSync = new Map<string, number>();

function schedulePush(uid: string, id: string) {
  if (uid === "dev" || syncState(uid) === "off") return;
  const k = `${uid}:${id}`;
  window.clearTimeout(timers.get(k));
  timers.set(k, window.setTimeout(() => void push(uid, id), PUSH_DELAY));
}

/** The conversation as the account stores it (an answer still being written is left out). */
function toServer(t: LocalThread, c: Conversation) {
  const messages = c.messages.filter((m) => m.role === "user" || m.text || m.error || m.quizzes?.length || m.paths?.length);
  return { title: t.title, createdAt: t.createdAt, messages, state: { sources: c.sources, quizzes: c.quizzes, paths: c.paths, ratings: c.ratings ?? {}, mock: c.mock ?? null, memoryTurns: c.memoryTurns, aiTitle: c.title, titleAgain: c.titleAgain } };
}

type ServerThread = { id: string; title?: string; updatedAt: number; messages: unknown[]; state: Record<string, unknown> };
function fromServer(r: ServerThread): Conversation {
  const s = r.state ?? {};
  return {
    ...freshConversation(),
    chat: r.id,
    messages: (r.messages ?? []) as Conversation["messages"],
    sources: (s.sources ?? {}) as Conversation["sources"],
    quizzes: (s.quizzes ?? {}) as Conversation["quizzes"],
    paths: (s.paths ?? {}) as Conversation["paths"],
    ratings: (s.ratings ?? {}) as Conversation["ratings"],
    mock: (s.mock ?? null) as Conversation["mock"],
    memoryTurns: typeof s.memoryTurns === "number" ? s.memoryTurns : 0,
    ...(typeof s.aiTitle === "string" && s.aiTitle ? { title: s.aiTitle } : {}),
    ...(s.titleAgain === true ? { titleAgain: true } : {}),
    updatedAt: r.updatedAt,
  };
}

function dropLocal(uid: string, id: string) {
  const idx = readIndex(uid);
  idx.threads = idx.threads.filter((t) => t.id !== id);
  if (idx.active === id) idx.active = null;
  del(bodyKey(uid, id));
  writeIndex(uid, idx);
}

/** The server said the table isn't there (or the learner isn't signed in): history stays on this device. */
const off = (uid: string) => {
  sync.set(uid, "off");
  broadcast();
};

async function push(uid: string, id: string): Promise<void> {
  if (syncState(uid) === "off") return;
  const idx = readIndex(uid);
  const t = idx.threads.find((x) => x.id === id);
  const c = get<Conversation>(bodyKey(uid, id));
  if (!t || !isConv(c) || !hasAsk(c)) return;
  const rev = t.rev;
  const res = await userFetch(`${API}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(toServer(t, c)), headers: { "Content-Type": "application/json" } }).catch(() => null);
  if (!res) return;
  if (res.status === 410) {
    dropLocal(uid, id);
    broadcast();
    return;
  }
  const b = (await res.json().catch(() => ({}))) as { available?: boolean; thread?: ThreadMeta };
  if (b.available === false || res.status === 401) return off(uid);
  if (!res.ok || !b.thread) return;
  sync.set(uid, "on");
  const now = readIndex(uid);
  const m = now.threads.find((x) => x.id === id);
  if (!m) return;
  m.synced = b.thread.updatedAt;
  if (m.rev === rev) m.dirty = false;
  writeIndex(uid, now);
  broadcast();
}

/**
 * Bring this device and the account together: new conversations from other devices appear (their messages load
 * when opened), ones deleted elsewhere (or past 90 days) go, and local changes are uploaded. At most once a minute.
 */
export async function syncHistory(uid: string, force = false): Promise<SyncState> {
  if (uid === "dev") return "off";
  if (!force && Date.now() - (lastSync.get(uid) ?? 0) < 60_000) return syncState(uid);
  lastSync.set(uid, Date.now());
  const res = await userFetch(API).catch(() => null);
  if (!res) return syncState(uid);
  const b = (await res.json().catch(() => ({}))) as { available?: boolean; threads?: ThreadMeta[] };
  if (res.status === 401 || b.available === false) {
    off(uid);
    return "off";
  }
  if (!res.ok || !Array.isArray(b.threads)) return syncState(uid);
  sync.set(uid, "on");
  const server = new Map(b.threads.map((t) => [t.id, t]));
  const idx = readIndex(uid);
  const upload: string[] = [];
  let refreshActive = false;
  const next: LocalThread[] = [];
  for (const t of idx.threads) {
    const s = server.get(t.id);
    server.delete(t.id);
    if (!s) {
      // uploaded once and now gone: deleted on another device, or past the account's limits
      if (t.synced && !t.dirty) {
        del(bodyKey(uid, t.id));
        if (idx.active === t.id) idx.active = null;
        continue;
      }
      upload.push(t.id);
      next.push(t);
      continue;
    }
    if (t.dirty) upload.push(t.id);
    else if (s.updatedAt > (t.synced ?? 0)) {
      // continued on another device: take its version
      Object.assign(t, { title: s.title, updatedAt: s.updatedAt, synced: s.updatedAt, named: true });
      if (t.id === idx.active) refreshActive = true;
      else {
        del(bodyKey(uid, t.id));
        t.remote = true;
      }
    }
    next.push(t);
  }
  for (const s of server.values()) next.push({ ...s, synced: s.updatedAt, remote: true });
  idx.threads = next;
  writeIndex(uid, idx);
  if (refreshActive && idx.active) await loadThread(uid, idx.active, true);
  broadcast();
  for (const id of upload.slice(0, 25)) await push(uid, id);
  return "on";
}

/** A conversation's messages: from the device, or from the account (then kept on the device). */
async function loadThread(uid: string, id: string, fromAccount = false): Promise<Conversation | null> {
  const local = get<Conversation>(bodyKey(uid, id));
  if (!fromAccount && isConv(local)) return { ...freshConversation(), ...local };
  if (uid === "dev" || syncState(uid) === "off") return isConv(local) ? local : null;
  const res = await userFetch(`${API}/${encodeURIComponent(id)}`).catch(() => null);
  if (!res) return isConv(local) ? local : null;
  if (res.status === 410 || res.status === 404) {
    dropLocal(uid, id);
    broadcast();
    return null;
  }
  const b = (await res.json().catch(() => ({}))) as { thread?: ServerThread };
  if (!res.ok || !b.thread) return isConv(local) ? local : null;
  const c = fromServer(b.thread);
  set(bodyKey(uid, id), c);
  const idx = readIndex(uid);
  const t = idx.threads.find((x) => x.id === id);
  // a title in the account that isn't the one this conversation would get is a name the learner gave it (on another
  // device): it stays, and no later AI title replaces it
  const named = !!b.thread.title && b.thread.title !== derivedTitle(c);
  if (t) Object.assign(t, { remote: false, dirty: false, synced: b.thread.updatedAt, ...(named ? { named: true, title: b.thread.title } : {}) });
  writeIndex(uid, idx);
  return c;
}

/* ------------------------------------------------------------------ what the history list does */

/** Open a past conversation (the chat views follow through the window event). False when it is gone. */
export async function openThread(uid: string, id: string): Promise<boolean> {
  const c = await loadThread(uid, id);
  if (!c) return false;
  const idx = readIndex(uid);
  const prev = idx.active;
  idx.active = id;
  if (prev && prev !== id && !idx.threads.some((t) => t.id === prev)) del(bodyKey(uid, prev));
  writeIndex(uid, idx);
  broadcast();
  return true;
}

export async function renameThread(uid: string, id: string, title: string): Promise<void> {
  const name = cleanTitle(title);
  if (!name) return;
  const idx = readIndex(uid);
  const t = idx.threads.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, { title: name, named: true });
  writeIndex(uid, idx);
  broadcast();
  if (uid === "dev" || syncState(uid) === "off") return;
  if (!t.synced || t.dirty) return schedulePush(uid, id);
  await userFetch(`${API}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title: name }), headers: { "Content-Type": "application/json" } }).catch(() => null);
}

export async function deleteThread(uid: string, id: string): Promise<void> {
  window.clearTimeout(timers.get(`${uid}:${id}`));
  dropLocal(uid, id);
  broadcast();
  if (uid === "dev" || syncState(uid) === "off") return;
  await userFetch(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
}

export async function deleteAllThreads(uid: string): Promise<void> {
  const idx = readIndex(uid);
  for (const t of idx.threads) {
    window.clearTimeout(timers.get(`${uid}:${t.id}`));
    del(bodyKey(uid, t.id));
  }
  if (idx.active) del(bodyKey(uid, idx.active));
  writeIndex(uid, { v: 1, active: null, threads: [] });
  broadcast();
  if (uid === "dev" || syncState(uid) === "off") return;
  await userFetch(API, { method: "DELETE" }).catch(() => null);
}

/** The learner named this conversation (an AI title never replaces that). */
export const isNamed = (uid: string, id: string): boolean => !!readIndex(uid).threads.find((t) => t.id === id)?.named;

/** The list for the history views: conversations newest first, which one is open, where history lives. */
export function readHistory(uid: string): { threads: LocalThread[]; active: string | null } {
  const idx = readIndex(uid);
  return { threads: [...idx.threads].sort((a, b) => b.updatedAt - a.updatedAt), active: idx.active };
}
