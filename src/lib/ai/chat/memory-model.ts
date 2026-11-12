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
  /** where each item came from and when (the memory page's provenance): keyed by `srcKey(field, stored item)`; items
   *  noted before 12 Nov 2026 have none (the page shows the memory's last update for them) */
  src: Record<string, ItemSrc>;
  updatedAt: number;
};

/** Who wrote an item: the course chat, a DSA Mastery tutor (its chat or the problem tutor), the learner (an edit, or a
 *  setting such as "Teach me"), the goal chat ("onboarding", lib/learner/goal-chat-model.ts) or the learner's feedback on
 *  an answer ("feedback": the explanation style that worked, lib/ai/teaching.ts). */
export type ItemSrcBy = "chat" | "dsa" | "you" | "onboarding" | "feedback";
const SRC_BY: ItemSrcBy[] = ["chat", "dsa", "you", "onboarding", "feedback"];
export type ItemSrc = { by: ItemSrcBy; at: string };

export const MEMORY_LIMITS = { goals: 3, studied: 12, struggles: 8, prefs: 5, quiz: 8, sessions: 8, item: 140, level: 140, summary: 280 } as const;
/** DSA Mastery's own items, on top of the course chat's caps */
export const DSA_MEMORY_LIMITS = { studied: 8, struggles: 6, mistakes: 6, sessions: 6 } as const;

export const DSA_TAG = "[dsa] ";
const isDsa = (s: string) => s.startsWith(DSA_TAG);
/** An item's words without its course tag. */
export const untag = (s: string) => (isDsa(s) ? s.slice(DSA_TAG.length) : s);
export const tagDsa = (s: string) => (isDsa(s) ? s : `${DSA_TAG}${s}`);
export const courseOf = (s: string): MemoryCourse => (isDsa(s) ? "dsa" : "sdm");

export const emptyMemory = (): ChatMemory => ({ v: 1, goals: [], level: "", studied: [], struggles: [], prefs: [], quiz: [], mistakes: [], sessions: [], src: {}, updatedAt: 0 });

/* ------------------------------------------------------------------ provenance */

/** The list fields (and the level) an item's provenance is kept for; sessions carry their own date and course. */
const SRC_FIELDS = ["goals", "level", "studied", "struggles", "prefs", "quiz", "mistakes"] as const;
type SrcField = (typeof SRC_FIELDS)[number];
export const srcKey = (field: SrcField, stored: string) => `${field}|${field === "level" ? "" : stored.toLowerCase()}`;
const itemsOf = (m: Pick<ChatMemory, SrcField>, f: SrcField): string[] => (f === "level" ? (m.level ? [m.level] : []) : m[f]);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Provenance kept only for items that exist, each valid. */
function cleanSrc(x: unknown, m: Pick<ChatMemory, SrcField>): Record<string, ItemSrc> {
  const out: Record<string, ItemSrc> = {};
  if (!x || typeof x !== "object" || Array.isArray(x)) return out;
  const o = x as Record<string, unknown>;
  for (const f of SRC_FIELDS)
    for (const it of itemsOf(m, f)) {
      const k = srcKey(f, it);
      const v = o[k] as { by?: unknown; at?: unknown } | undefined;
      if (v && SRC_BY.includes(v.by as ItemSrcBy) && typeof v.at === "string" && DAY_RE.test(v.at)) out[k] = { by: v.by as ItemSrcBy, at: v.at };
    }
  return out;
}

/**
 * The provenance after a writer's update: an item it kept keeps its old line (or none, for an item noted before
 * provenance existed); an item it added is stamped with the writer and the day.
 */
function stampSrc(prev: ChatMemory, next: Pick<ChatMemory, SrcField>, by: ItemSrcBy, day: string): Record<string, ItemSrc> {
  const out: Record<string, ItemSrc> = {};
  for (const f of SRC_FIELDS) {
    const before = new Set(itemsOf(prev, f).map((x) => x.toLowerCase()));
    for (const it of itemsOf(next, f)) {
      const k = srcKey(f, it);
      if (prev.src?.[k]) out[k] = prev.src[k];
      else if (!before.has(it.toLowerCase())) out[k] = { by, at: day };
    }
  }
  return out;
}

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
  const lists = {
    goals: list(o.goals, MEMORY_LIMITS.goals),
    level: scrub(o.level, MEMORY_LIMITS.level),
    studied: list(o.studied, MEMORY_LIMITS.studied, MEMORY_LIMITS.item, DSA_MEMORY_LIMITS.studied),
    struggles: list(o.struggles, MEMORY_LIMITS.struggles, MEMORY_LIMITS.item, DSA_MEMORY_LIMITS.struggles),
    prefs: list(o.prefs, MEMORY_LIMITS.prefs),
    quiz: list(o.quiz, MEMORY_LIMITS.quiz, 180),
    // DSA's own field: every item is a DSA item
    mistakes: list(Array.isArray(o.mistakes) ? o.mistakes.map((x) => (typeof x === "string" ? tagDsa(x) : x)) : [], 0, MEMORY_LIMITS.item, DSA_MEMORY_LIMITS.mistakes),
  };
  return { v: 1, ...lists, sessions, src: cleanSrc(o.src, lists), updatedAt: Number(o.updatedAt) || 0 };
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
  const next = {
    goals: u.goals.length || Array.isArray(o.goals) ? u.goals : prev.goals,
    level: u.level || prev.level,
    studied: Array.isArray(o.studied) ? [...u.studied, ...dsaOf(prev.studied)] : prev.studied,
    struggles: Array.isArray(o.struggles) ? [...u.struggles, ...dsaOf(prev.struggles)] : prev.struggles,
    prefs: Array.isArray(o.prefs) ? u.prefs : prev.prefs,
    quiz: Array.isArray(o.quiz) ? u.quiz : prev.quiz,
    mistakes: prev.mistakes,
  };
  return { v: 1, ...next, sessions, src: stampSrc(prev, next, "chat", day), updatedAt: now.getTime() };
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
  const next = {
    goals: Array.isArray(o.goals) ? u.goals : prev.goals,
    level: u.level || prev.level,
    prefs: Array.isArray(o.prefs) ? u.prefs : prev.prefs,
    studied: Array.isArray(o.studied) ? [...sdmOf(prev.studied), ...u.studied] : prev.studied,
    struggles: Array.isArray(o.struggles) ? [...sdmOf(prev.struggles), ...u.struggles] : prev.struggles,
    quiz: prev.quiz,
    mistakes: Array.isArray(o.mistakes) ? u.mistakes : prev.mistakes,
  };
  return { v: 1, ...next, sessions, src: stampSrc(prev, next, "dsa", day), updatedAt: now.getTime() };
}

export const MEMORY_FIELDS = ["goals", "level", "studied", "struggles", "prefs", "quiz", "mistakes", "sessions"] as const;
export type MemoryField = (typeof MEMORY_FIELDS)[number];

/** One item the learner removed on the memory page (its × button): a list item by its stored text, the level, or a session by its line. */
export function removeMemoryItem(m: ChatMemory, field: MemoryField, item: string): ChatMemory {
  const key = item.trim().toLowerCase();
  let next: ChatMemory;
  if (field === "level") next = { ...m, level: "" };
  else if (field === "sessions") next = { ...m, sessions: m.sessions.filter((s) => s.summary.toLowerCase() !== key) };
  else next = { ...m, [field]: m[field].filter((x) => x.toLowerCase() !== key) };
  return { ...next, src: cleanSrc(m.src, next) };
}

/** The cap an edited item is held to (the same as a written one). */
const capOf = (field: MemoryField) => (field === "level" ? MEMORY_LIMITS.level : field === "sessions" ? MEMORY_LIMITS.summary : field === "quiz" ? 180 : MEMORY_LIMITS.item);

/**
 * One item the learner rewrote on the memory page (its pencil): the new words go through the same scrub and cap as
 * anything a tutor writes, a DSA item stays a DSA item, and its provenance becomes "you" on that day (a session keeps
 * its date and course). null when the edit is unusable: an unknown item, or nothing left after the scrub (forget it
 * instead). Rewriting an item to one that already exists just drops the old one.
 */
export function editMemoryItem(m: ChatMemory, field: MemoryField, item: string, text: string, now: Date): ChatMemory | null {
  const key = item.trim().toLowerCase();
  const day = now.toISOString().slice(0, 10);
  const words = scrub(untag(typeof text === "string" ? text.trim() : ""), capOf(field));
  if (!words) return null;
  if (field === "sessions") {
    const i = m.sessions.findIndex((s) => s.summary.toLowerCase() === key);
    if (i < 0) return null;
    return { ...m, sessions: m.sessions.map((s, j) => (j === i ? { ...s, summary: words } : s)), updatedAt: now.getTime() };
  }
  if (field === "level") {
    if (!m.level) return null;
    const next = { ...m, level: words, updatedAt: now.getTime() };
    return { ...next, src: { ...cleanSrc(m.src, next), [srcKey("level", words)]: { by: "you", at: day } } };
  }
  const xs = m[field];
  const i = xs.findIndex((x) => x.toLowerCase() === key);
  if (i < 0) return null;
  const stored = field === "mistakes" || isDsa(xs[i]) ? `${DSA_TAG}${words}` : words;
  const dup = xs.some((x, j) => j !== i && x.toLowerCase() === stored.toLowerCase());
  const list = dup ? xs.filter((_, j) => j !== i) : xs.map((x, j) => (j === i ? stored : x));
  const next = { ...m, [field]: list, updatedAt: now.getTime() } as ChatMemory;
  const src = cleanSrc(m.src, next);
  if (!dup) src[srcKey(field, stored)] = { by: "you", at: day };
  return { ...next, src };
}

/* ------------------------------------------------------------------ prefs and goals set by the learner, not a tutor */

/**
 * The prefs after a learner's setting or feedback: items `drop` matches go, `add` (scrubbed, capped like any note) goes
 * first, stamped `by` on that day; the rest keep their place and provenance, within the cap (the oldest go last).
 * Used for "Teach me" (by "you") and the explanation style that worked (by "feedback"): lib/ai/teaching.ts.
 */
export function setPrefs(m: ChatMemory, o: { drop: (s: string) => boolean; add?: string | null; by: ItemSrcBy; now: Date }): ChatMemory {
  const add = o.add ? scrub(o.add, MEMORY_LIMITS.item) : "";
  const kept = m.prefs.filter((x) => !o.drop(x) && x.toLowerCase() !== add.toLowerCase());
  const prefs = (add ? [add, ...kept] : kept).slice(0, MEMORY_LIMITS.prefs);
  const next = { ...m, prefs, updatedAt: o.now.getTime() };
  const src = cleanSrc(m.src, next);
  if (add) src[srcKey("prefs", add)] = { by: o.by, at: o.now.toISOString().slice(0, 10) };
  return { ...next, src };
}

/**
 * What the goal chat captured (lib/learner/goal-chat-model.ts), written as notes with provenance "onboarding": its goals
 * go first (an earlier onboarding's goals are replaced; the tutors' own goals stay after them, within the cap); its
 * level replaces the level (the learner just said it); its prefs replace an earlier onboarding's prefs and go after the
 * learner's own settings ("Teach me", the style that worked) and before the tutors' notes. Everything is scrubbed and
 * capped like any note. Nothing given for a field: that field stays as it was.
 */
export function applyOnboarding(m: ChatMemory, cap: { goals?: string[]; level?: string; prefs?: string[] }, now: Date): ChatMemory {
  const day = now.toISOString().slice(0, 10);
  const by = (f: "goals" | "prefs", x: string) => m.src?.[srcKey(f, x)]?.by;
  const clean = (xs: string[] | undefined) => (xs ?? []).map((x) => scrub(x, MEMORY_LIMITS.item)).filter(Boolean);
  const goals = clean(cap.goals);
  const prefs = clean(cap.prefs);
  const level = cap.level ? scrub(cap.level, MEMORY_LIMITS.level) : "";
  const dedupe = (xs: string[]) => xs.filter((x, i) => xs.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  const nextGoals = goals.length ? dedupe([...goals, ...m.goals.filter((x) => by("goals", x) !== "onboarding")]).slice(0, MEMORY_LIMITS.goals) : m.goals;
  const own = m.prefs.filter((x) => by("prefs", x) === "you" || by("prefs", x) === "feedback");
  const tutors = m.prefs.filter((x) => !own.includes(x) && by("prefs", x) !== "onboarding");
  const nextPrefs = prefs.length ? dedupe([...own, ...prefs, ...tutors]).slice(0, MEMORY_LIMITS.prefs) : m.prefs;
  const next = { ...m, goals: nextGoals, prefs: nextPrefs, level: level || m.level, updatedAt: now.getTime() };
  const src = cleanSrc(m.src, next);
  for (const g of goals) if (nextGoals.includes(g)) src[srcKey("goals", g)] = { by: "onboarding", at: day };
  for (const p of prefs) if (nextPrefs.includes(p)) src[srcKey("prefs", p)] = { by: "onboarding", at: day };
  if (level) src[srcKey("level", level)] = { by: "onboarding", at: day };
  return { ...next, src };
}
