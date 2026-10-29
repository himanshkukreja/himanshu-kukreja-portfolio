/**
 * The course chat's long-term memory of one learner (table chat_memory, one row per user): their learning
 * goals, level, what they studied and struggled with, how they like answers, recent quiz results and a short
 * summary of each past conversation. Written by a small Haiku 5.5 call (FEATURES "chat-memory") from the
 * learner's own conversations; read into each new chat so the tutor can say "last time you were stuck on…".
 *
 * Pure: shape, limits and the scrub every value goes through, shared by the route, the memory page and the eval.
 * Only learning data: `cleanMemory` drops emails, phone numbers, links and anything over its length cap, so
 * even a summary that slipped would not keep contact details. Saved paths are not copied here (they live in
 * the learner's profile already and are read live).
 */

export type MemorySession = { at: string; chat: string; summary: string };
export type ChatMemory = {
  v: 1;
  /** "Flipkart SDE-2 interview in 3 weeks" */
  goals: string[];
  /** "3 years backend (Java), new to distributed systems" */
  level: string;
  /** topics studied or discussed */
  studied: string[];
  /** topics they found hard or got wrong */
  struggles: string[];
  /** how they like answers: "short answers", "examples from Indian apps", "Hinglish" */
  prefs: string[];
  /** recent practice results: "W04 cache invalidation checkpoint: partly right (missed delete vs update)" */
  quiz: string[];
  /** one per past conversation, newest first */
  sessions: MemorySession[];
  updatedAt: number;
};

export const MEMORY_LIMITS = { goals: 3, studied: 12, struggles: 8, prefs: 5, quiz: 8, sessions: 8, item: 140, level: 140, summary: 280 } as const;

export const emptyMemory = (): ChatMemory => ({ v: 1, goals: [], level: "", studied: [], struggles: [], prefs: [], quiz: [], sessions: [], updatedAt: 0 });

/** Text that may be stored: plain, short, no contact details or links. */
export function scrub(x: unknown, max: number): string {
  if (typeof x !== "string") return "";
  return x
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/[<>`*_#]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const list = (x: unknown, n: number, max: number = MEMORY_LIMITS.item): string[] => {
  if (!Array.isArray(x)) return [];
  const out: string[] = [];
  for (const v of x) {
    const s = scrub(v, max);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= n) break;
  }
  return out;
};

export function cleanMemory(x: unknown): ChatMemory {
  if (!x || typeof x !== "object") return emptyMemory();
  const o = x as Record<string, unknown>;
  const sessions: MemorySession[] = [];
  for (const s of Array.isArray(o.sessions) ? o.sessions : []) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const summary = scrub(r.summary, MEMORY_LIMITS.summary);
    const at = /^\d{4}-\d{2}-\d{2}$/.test(String(r.at)) ? String(r.at) : "";
    const chat = /^[a-z0-9]{4,40}$/i.test(String(r.chat)) ? String(r.chat) : "";
    if (summary && at) sessions.push({ at, chat, summary });
    if (sessions.length >= MEMORY_LIMITS.sessions) break;
  }
  return {
    v: 1,
    goals: list(o.goals, MEMORY_LIMITS.goals),
    level: scrub(o.level, MEMORY_LIMITS.level),
    studied: list(o.studied, MEMORY_LIMITS.studied),
    struggles: list(o.struggles, MEMORY_LIMITS.struggles),
    prefs: list(o.prefs, MEMORY_LIMITS.prefs),
    quiz: list(o.quiz, MEMORY_LIMITS.quiz, 180),
    sessions,
    updatedAt: Number(o.updatedAt) || 0,
  };
}

export const isEmptyMemory = (m: ChatMemory) => !m.goals.length && !m.level && !m.studied.length && !m.struggles.length && !m.prefs.length && !m.quiz.length && !m.sessions.length;

/** The memory as lines for the chat's learner context. */
export function memoryLines(m: ChatMemory): string[] {
  const out: string[] = [];
  if (m.goals.length) out.push(`Goals: ${m.goals.join("; ")}`);
  if (m.level) out.push(`Level: ${m.level}`);
  if (m.prefs.length) out.push(`Prefers: ${m.prefs.join("; ")}`);
  if (m.studied.length) out.push(`Studied or discussed: ${m.studied.join("; ")}`);
  if (m.struggles.length) out.push(`Found hard: ${m.struggles.join("; ")}`);
  if (m.quiz.length) out.push(`Recent practice: ${m.quiz.join("; ")}`);
  if (m.sessions.length) out.push(`Past chats (newest first):\n${m.sessions.map((s) => `  - ${s.at}: ${s.summary}`).join("\n")}`);
  return out;
}

/**
 * The model's update merged in: lists and level come from the model (it got the old memory and rewrites it),
 * this conversation's summary replaces its own earlier summary (same chat id) and goes first.
 */
export function mergeMemory(prev: ChatMemory, update: unknown, chat: string, now: Date): ChatMemory {
  const u = cleanMemory(update);
  const o = update && typeof update === "object" ? (update as Record<string, unknown>) : {};
  const summary = scrub(o.session ?? o.summary, MEMORY_LIMITS.summary);
  const day = now.toISOString().slice(0, 10);
  const sessions = summary ? [{ at: day, chat, summary }, ...prev.sessions.filter((s) => s.chat !== chat)] : prev.sessions;
  return {
    v: 1,
    goals: u.goals.length || Array.isArray(o.goals) ? u.goals : prev.goals,
    level: u.level || prev.level,
    studied: Array.isArray(o.studied) ? u.studied : prev.studied,
    struggles: Array.isArray(o.struggles) ? u.struggles : prev.struggles,
    prefs: Array.isArray(o.prefs) ? u.prefs : prev.prefs,
    quiz: Array.isArray(o.quiz) ? u.quiz : prev.quiz,
    sessions: sessions.slice(0, MEMORY_LIMITS.sessions),
    updatedAt: now.getTime(),
  };
}
