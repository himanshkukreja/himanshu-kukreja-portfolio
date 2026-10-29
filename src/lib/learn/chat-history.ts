/**
 * The course chat's history: the rules both sides share (browser and /api/learn/ai/chat/threads). Pure.
 *
 * A conversation is stored as `messages` (what the browser keeps: role, text, time, and which sources,
 * practice questions and paths each answer brought) plus `state` (what those point at: sources, quiz cards,
 * paths, a mock interview's progress, ratings). Capped at the last 60 messages and ~200 KB, oldest first.
 * Table: supabase/migrations/20261029_chat_threads.sql (90 days after the last update, at most 100 per learner).
 */
import { REF_RE } from "@/lib/ai/chat/text";

export const THREAD_MAX_MESSAGES = 60;
export const THREAD_MAX_BYTES = 200_000;
export const THREADS_MAX = 100;
export const THREAD_RETENTION_DAYS = 90;
export const THREAD_TITLE_MAX = 120;
export const THREAD_ID_RE = /^[a-z0-9]{6,40}$/;

export type ThreadMeta = { id: string; title: string; createdAt: number; updatedAt: number };
export type ThreadState = {
  sources?: Record<string, unknown>;
  quizzes?: Record<string, unknown>;
  paths?: Record<string, unknown>;
  ratings?: Record<string, unknown>;
  mock?: unknown;
  memoryTurns?: number;
};
export type ThreadBody = { messages: Record<string, unknown>[]; state: ThreadState };
export type ThreadRecord = ThreadMeta & ThreadBody;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** A short title: the learner's first question (not an answer to a practice question), cut at a word. */
export function titleFrom(messages: { role: string; text?: unknown; answerTo?: unknown }[], max = 72): string {
  const first = messages.find((m) => m.role === "user" && typeof m.text === "string" && m.text.trim() && !m.answerTo);
  const t = first ? oneLine((first.text as string).replace(REF_RE, "")) : "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

export function cleanTitle(t: unknown): string {
  return typeof t === "string" ? oneLine(t).slice(0, THREAD_TITLE_MAX) : "";
}

/* ------------------------------------------------------------------ sanitising (server side, on every write) */

const SITE_HREF = /^\/(?!\/)[^\s<>"]*$/;

/** A JSON value kept within bounds: strings <= 20k, arrays <= 200, objects <= 300 keys, depth <= 8, links site-relative. */
function clamp(v: unknown, depth = 0, key = ""): unknown {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    if (key === "href") return SITE_HREF.test(v) ? v.slice(0, 600) : undefined;
    return v.slice(0, 20_000);
  }
  if (depth >= 8) return undefined;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => clamp(x, depth + 1)).filter((x) => x !== undefined);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (n++ >= 300 || k.length > 60 || k === "__proto__" || k === "constructor" || k === "prototype") continue;
      const c = clamp(x, depth + 1, k);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return undefined;
}

const isMsg = (m: unknown): m is Record<string, unknown> =>
  !!m && typeof m === "object" && !Array.isArray(m) && ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") && typeof (m as { text?: unknown }).text === "string";

/** Every ref the messages use (citations, cards, and the sources the cards and paths point at). */
function usedRefs(messages: Record<string, unknown>[], state: ThreadState): Set<string> {
  const used = new Set<string>();
  const strs = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []);
  for (const m of messages) {
    for (const r of strs(m.cites)) used.add(r);
    for (const r of strs(m.quizzes)) used.add(r);
    for (const r of strs(m.paths)) used.add(r);
    if (typeof m.answerTo === "string") used.add(m.answerTo);
    for (const g of String(m.text).matchAll(REF_RE)) for (const r of g[1].split(",")) used.add(r.trim().toLowerCase());
  }
  for (const [q, card] of Object.entries(state.quizzes ?? {})) if (used.has(q)) {
    const from = (card as { from?: unknown })?.from;
    if (typeof from === "string") used.add(from);
  }
  for (const [p, card] of Object.entries(state.paths ?? {})) if (used.has(p)) {
    const steps = (card as { steps?: unknown })?.steps;
    if (Array.isArray(steps)) for (const s of steps) if (typeof (s as { ref?: unknown })?.ref === "string") used.add((s as { ref: string }).ref);
  }
  return used;
}

const pick = (rec: Record<string, unknown> | undefined, keep: Set<string>) => Object.fromEntries(Object.entries(rec ?? {}).filter(([k]) => keep.has(k)));
const size = (b: ThreadBody) => JSON.stringify(b).length;

/** The last 60 messages, then the oldest dropped until the whole thing is under ~200 KB (unused refs pruned). */
export function capThread(b: ThreadBody): ThreadBody {
  let messages = b.messages.slice(-THREAD_MAX_MESSAGES);
  const prune = (ms: Record<string, unknown>[]): ThreadBody => {
    if (ms.length === b.messages.length) return { messages: ms, state: b.state };
    const used = usedRefs(ms, b.state);
    return { messages: ms, state: { ...b.state, sources: pick(b.state.sources, used), quizzes: pick(b.state.quizzes, used), paths: pick(b.state.paths, used) } };
  };
  let out = prune(messages);
  while (messages.length > 1 && size(out) > THREAD_MAX_BYTES) {
    messages = messages.slice(Math.max(1, Math.ceil(messages.length / 8)));
    out = prune(messages);
  }
  return out;
}

/** What a client sent, made safe to store: known shapes only, bounded, site-relative links, capped. Null if unusable. */
export function sanitizeThread(raw: unknown): ThreadBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { messages?: unknown; state?: unknown };
  if (!Array.isArray(r.messages)) return null;
  const messages = (r.messages.slice(-THREAD_MAX_MESSAGES * 2).filter(isMsg).map((m) => clamp(m, 1)) as Record<string, unknown>[]).filter(isMsg);
  const s = (r.state && typeof r.state === "object" && !Array.isArray(r.state) ? r.state : {}) as Record<string, unknown>;
  const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (clamp(v, 1) as Record<string, unknown>) : {});
  const state: ThreadState = {
    sources: rec(s.sources),
    quizzes: rec(s.quizzes),
    paths: rec(s.paths),
    ratings: rec(s.ratings),
    ...(s.mock && typeof s.mock === "object" ? { mock: clamp(s.mock, 1) } : {}),
    memoryTurns: typeof s.memoryTurns === "number" && Number.isFinite(s.memoryTurns) ? Math.max(0, Math.floor(s.memoryTurns)) : 0,
  };
  // a source must have a site link to be shown
  for (const [k, v] of Object.entries(state.sources ?? {})) if (!v || typeof (v as { href?: unknown }).href !== "string") delete state.sources![k];
  const capped = capThread({ messages, state });
  return size(capped) <= THREAD_MAX_BYTES ? capped : null;
}

/* ------------------------------------------------------------------ the history list */

export type HistoryGroup = { label: string; items: ThreadMeta[] };

/** Today / Yesterday / Previous 7 days / Previous 30 days / Older, newest first (local days). */
export function groupByDay<T extends ThreadMeta>(threads: T[], now = new Date()): { label: string; items: T[] }[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups: { label: string; items: T[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Previous 30 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const t of [...threads].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const at = t.updatedAt;
    const g = at >= start ? 0 : at >= start - day ? 1 : at >= start - 7 * day ? 2 : at >= start - 30 * day ? 3 : 4;
    groups[g].items.push(t);
  }
  return groups.filter((g) => g.items.length);
}

/** "14:05" today, "Tue" this week, "12 Oct" this year, "12 Oct 2025" before. */
export function whenLabel(at: number, now = new Date()): string {
  const d = new Date(at);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at >= start) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (at >= start - 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
