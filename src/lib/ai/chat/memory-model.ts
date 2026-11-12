/**
 * The course chat's long-term memory of one learner (table chat_memory, one row per user): their learning
 * goals, level, what they studied and struggled with, how they like answers, recent quiz results and a short
 * summary of each past conversation. Written by a small Haiku 5.5 call (FEATURES "chat-memory") from the
 * learner's own conversations; read into each new chat so the tutor can say "last time you were stuck on…".
 *
 * One learner model for both courses (12 Nov 2026, the AI audit's §7): DSA Mastery's tutors write into and read from
 * the same row. Goals, level and how they like answers are shared; topic items carry their course: a DSA item is stored
 * with the "[dsa] " tag (studied, struggles, and DSA's own `mistakes`), a DSA session with `course: "dsa"`. The course
 * chat reads and rewrites only its own items (`memoryLines`, `sdmNotes`, `mergeMemory` keeps the DSA ones as they are),
 * DSA's tutors only theirs plus the shared lines (`dsaNotes`, `mergeDsaMemory`), each within its own caps.
 *
 * Pure: shape, limits and the scrub every value goes through, shared by the route, the memory page and the eval.
 * Only learning data: `cleanMemory` drops emails, phone numbers, links and anything over its length cap, so
 * even a summary that slipped would not keep contact details. Saved paths are not copied here (they live in
 * the learner's profile already and are read live).
 */

export type MemoryCourse = "sdm" | "dsa";
export type MemorySession = { at: string; chat: string; summary: string; /** absent: the course chat's */ course?: "dsa" };
export type ChatMemory = {
  v: 1;
  /** "Flipkart SDE-2 interview in 3 weeks" */
  goals: string[];
  /** "3 years backend (Java), new to distributed systems" */
  level: string;
  /** topics worked on in depth or practised (never ones only named in a plan or path) */
  studied: string[];
  /** topics they found hard or got wrong */
  struggles: string[];
  /** how they like answers: "short answers", "examples from Indian apps", "Hinglish" */
  prefs: string[];
  /** recent practice results: "W04 cache invalidation checkpoint: partly right (missed delete vs update)" */
  quiz: string[];
  /** DSA Mastery: recurring mistake types ("[dsa] off-by-one on a window's start index") */
  mistakes: string[];
  /** one per past conversation, newest first */
  sessions: MemorySession[];
  updatedAt: number;
};

export const MEMORY_LIMITS = { goals: 3, studied: 12, struggles: 8, prefs: 5, quiz: 8, sessions: 8, item: 140, level: 140, summary: 280 } as const;
/** DSA Mastery's own items, on top of the course chat's caps */
export const DSA_MEMORY_LIMITS = { studied: 8, struggles: 6, mistakes: 6, sessions: 6 } as const;

export const DSA_TAG = "[dsa] ";
const isDsa = (s: string) => s.startsWith(DSA_TAG);
/** An item's words without its course tag. */
export const untag = (s: string) => (isDsa(s) ? s.slice(DSA_TAG.length) : s);
export const tagDsa = (s: string) => (isDsa(s) ? s : `${DSA_TAG}${s}`);
export const courseOf = (s: string): MemoryCourse => (isDsa(s) ? "dsa" : "sdm");

export const emptyMemory = (): ChatMemory => ({ v: 1, goals: [], level: "", studied: [], struggles: [], prefs: [], quiz: [], mistakes: [], sessions: [], updatedAt: 0 });

/**
 * Text that may be stored: plain, short, no contact details or links. Identifiers stay as written: underscores
 * and backticks are kept (`proxy_cache_lock`, `max_connections`); only tag brackets and markdown's * and # go.
 */
export function scrub(x: unknown, max: number): string {
  if (typeof x !== "string") return "";
  return x
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/[<>*#]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** A list kept within its caps: `n` course chat items and `dsa` DSA items (tagged "[dsa] ", the tag kept as written). */
const list = (x: unknown, n: number, max: number = MEMORY_LIMITS.item, dsa = 0): string[] => {
  if (!Array.isArray(x)) return [];
  const out: string[] = [];
  let a = 0;
  let b = 0;
  for (const v of x) {
    const raw = typeof v === "string" ? v.trimStart() : v;
    const tagged = typeof raw === "string" && isDsa(raw);
    const s = tagged ? `${DSA_TAG}${scrub((raw as string).slice(DSA_TAG.length), max)}` : scrub(raw, max);
    if (!untag(s) || out.some((o) => o.toLowerCase() === s.toLowerCase())) continue;
    if (tagged ? b >= dsa : a >= n) continue;
    out.push(s);
    if (tagged) b++;
    else a++;
  }
  return out;
};

export function cleanMemory(x: unknown): ChatMemory {
  if (!x || typeof x !== "object") return emptyMemory();
  const o = x as Record<string, unknown>;
  const sessions: MemorySession[] = [];
  let sdmN = 0;
  let dsaN = 0;
  for (const s of Array.isArray(o.sessions) ? o.sessions : []) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const summary = scrub(r.summary, MEMORY_LIMITS.summary);
    const at = /^\d{4}-\d{2}-\d{2}$/.test(String(r.at)) ? String(r.at) : "";
    const chat = /^[a-z0-9]{4,40}$/i.test(String(r.chat)) ? String(r.chat) : "";
    const dsa = r.course === "dsa";
    if (!summary || !at || (dsa ? dsaN >= DSA_MEMORY_LIMITS.sessions : sdmN >= MEMORY_LIMITS.sessions)) continue;
    sessions.push(dsa ? { at, chat, summary, course: "dsa" } : { at, chat, summary });
    if (dsa) dsaN++;
    else sdmN++;
  }
  return {
    v: 1,
    goals: list(o.goals, MEMORY_LIMITS.goals),
    level: scrub(o.level, MEMORY_LIMITS.level),
    studied: list(o.studied, MEMORY_LIMITS.studied, MEMORY_LIMITS.item, DSA_MEMORY_LIMITS.studied),
    struggles: list(o.struggles, MEMORY_LIMITS.struggles, MEMORY_LIMITS.item, DSA_MEMORY_LIMITS.struggles),
    prefs: list(o.prefs, MEMORY_LIMITS.prefs),
    quiz: list(o.quiz, MEMORY_LIMITS.quiz, 180),
    // DSA's own field: every item is a DSA item
    mistakes: list(Array.isArray(o.mistakes) ? o.mistakes.map((x) => (typeof x === "string" ? tagDsa(x) : x)) : [], 0, MEMORY_LIMITS.item, DSA_MEMORY_LIMITS.mistakes),
    sessions,
    updatedAt: Number(o.updatedAt) || 0,
  };
}

export const isEmptyMemory = (m: ChatMemory) => !m.goals.length && !m.level && !m.studied.length && !m.struggles.length && !m.prefs.length && !m.quiz.length && !m.mistakes.length && !m.sessions.length;

/** The course chat's own view: the shared lines and its own items (no DSA items). */
export function sdmNotes(full: ChatMemory): ChatMemory {
  return {
    ...full,
    studied: full.studied.filter((x) => !isDsa(x)),
    struggles: full.struggles.filter((x) => !isDsa(x)),
    mistakes: [],
    sessions: full.sessions.filter((s) => s.course !== "dsa"),
  };
}

/** DSA Mastery's view: the shared lines (goals, level, prefs) and the DSA items, untagged. */
export type DsaNotes = { goals: string[]; level: string; prefs: string[]; studied: string[]; struggles: string[]; mistakes: string[]; sessions: MemorySession[] };
export function dsaNotes(m: ChatMemory): DsaNotes {
  const mine = (xs: string[]) => xs.filter(isDsa).map(untag);
  return { goals: m.goals, level: m.level, prefs: m.prefs, studied: mine(m.studied), struggles: mine(m.struggles), mistakes: mine(m.mistakes), sessions: m.sessions.filter((s) => s.course === "dsa") };
}

/** The memory as lines for the chat's learner context (the course chat's own items; DSA's stay with DSA's tutors). */
export function memoryLines(full: ChatMemory): string[] {
  const m = sdmNotes(full);
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
  const o = update && typeof update === "object" ? (update as Record<string, unknown>) : {};
  // the course chat writes its own items only: anything it returns is untagged, and DSA's items stay as they were
  const own = (x: unknown) => (Array.isArray(x) ? x.map((v) => (typeof v === "string" ? untag(v.trimStart()) : v)) : x);
  const u = cleanMemory({ ...o, studied: own(o.studied), struggles: own(o.struggles), mistakes: [], sessions: [] });
  const summary = scrub(o.session ?? o.summary, MEMORY_LIMITS.summary);
  const day = now.toISOString().slice(0, 10);
  const dsaOf = (xs: string[]) => xs.filter(isDsa);
  const sdmSessions = prev.sessions.filter((s) => s.course !== "dsa");
  const sessions = [...(summary ? [{ at: day, chat, summary }, ...sdmSessions.filter((s) => s.chat !== chat)] : sdmSessions).slice(0, MEMORY_LIMITS.sessions), ...prev.sessions.filter((s) => s.course === "dsa")];
  return {
    v: 1,
    goals: u.goals.length || Array.isArray(o.goals) ? u.goals : prev.goals,
    level: u.level || prev.level,
    studied: Array.isArray(o.studied) ? [...u.studied, ...dsaOf(prev.studied)] : prev.studied,
    struggles: Array.isArray(o.struggles) ? [...u.struggles, ...dsaOf(prev.struggles)] : prev.struggles,
    prefs: Array.isArray(o.prefs) ? u.prefs : prev.prefs,
    quiz: Array.isArray(o.quiz) ? u.quiz : prev.quiz,
    mistakes: prev.mistakes,
    sessions,
    updatedAt: now.getTime(),
  };
}

/**
 * A DSA tutor's update merged in (lib/dsa/ai/memory.ts): it may rewrite the shared lines it was given (level, prefs; goals
 * only when it returns them) and its own items (studied, struggles, mistakes: stored tagged), and adds this session's
 * line as a DSA session. The course chat's items stay exactly as they were.
 */
export function mergeDsaMemory(prev: ChatMemory, update: unknown, chat: string, now: Date): ChatMemory {
  const o = update && typeof update === "object" ? (update as Record<string, unknown>) : {};
  // code comparisons survive the scrub (which drops < and >): "k > n" stays readable as "k ＞ n"
  const cmp = (v: string) => v.replace(/>=/g, "≥").replace(/<=/g, "≤").replace(/>/g, "＞").replace(/</g, "＜");
  const tagged = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => tagDsa(cmp(untag(v.trim())))) : []);
  const u = cleanMemory({ goals: o.goals, level: o.level, prefs: o.prefs, studied: tagged(o.studied), struggles: tagged(o.struggles), mistakes: tagged(o.mistakes) });
  const said = o.session ?? o.summary;
  const summary = scrub(typeof said === "string" ? cmp(said) : said, MEMORY_LIMITS.summary);
  const day = now.toISOString().slice(0, 10);
  const sdmOf = (xs: string[]) => xs.filter((x) => !isDsa(x));
  const dsaSessions = prev.sessions.filter((s) => s.course === "dsa");
  const sessions = [...prev.sessions.filter((s) => s.course !== "dsa"), ...(summary ? [{ at: day, chat, summary, course: "dsa" as const }, ...dsaSessions.filter((s) => s.chat !== chat)] : dsaSessions).slice(0, DSA_MEMORY_LIMITS.sessions)];
  return {
    v: 1,
    goals: Array.isArray(o.goals) ? u.goals : prev.goals,
    level: u.level || prev.level,
    prefs: Array.isArray(o.prefs) ? u.prefs : prev.prefs,
    studied: Array.isArray(o.studied) ? [...sdmOf(prev.studied), ...u.studied] : prev.studied,
    struggles: Array.isArray(o.struggles) ? [...sdmOf(prev.struggles), ...u.struggles] : prev.struggles,
    quiz: prev.quiz,
    mistakes: Array.isArray(o.mistakes) ? u.mistakes : prev.mistakes,
    sessions,
    updatedAt: now.getTime(),
  };
}

export const MEMORY_FIELDS = ["goals", "level", "studied", "struggles", "prefs", "quiz", "mistakes", "sessions"] as const;
export type MemoryField = (typeof MEMORY_FIELDS)[number];

/** One item the learner removed on the memory page (its × button): a list item by its stored text, the level, or a session by its line. */
export function removeMemoryItem(m: ChatMemory, field: MemoryField, item: string): ChatMemory {
  const key = item.trim().toLowerCase();
  if (field === "level") return { ...m, level: "" };
  if (field === "sessions") return { ...m, sessions: m.sessions.filter((s) => s.summary.toLowerCase() !== key) };
  return { ...m, [field]: m[field].filter((x) => x.toLowerCase() !== key) };
}
