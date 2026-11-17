/**
 * The daily warm-up question on the DSA home (pure and import-free apart from types: the server reads the lessons, the
 * browser picks and shows, scripts/tests/dsa-warmup.test.mjs tests both halves).
 *
 * One quick question a day (about 30 seconds), drawn from what the learner studied lately:
 *   1. the quiz questions and predict exercises of their most recent lessons,
 *   2. else those of the lessons in the station they are on,
 *   3. else the Toolkit lessons (a new learner has nothing yet).
 * The first tier that has a question is the pool. The pick is a hash of (learner, day, question), so it is the same all day
 * for that learner and, being a minimum over the pool, it rarely moves when the pool grows.
 *
 * Doing it counts as an activity day: the game key `dsa:warm:<day>` (synced to the account like every other DSA key, and the
 * way the Progress heatmap and streak can read it) plus record_learning_activity, which every lesson step already calls.
 */

export type WarmQ = {
  /** stable: `<lesson>:<hash of the question>` */
  id: string;
  concept: string;
  /** the lesson's title, and where it lives */
  lesson: string;
  href: string;
  kind: "quiz" | "predict";
  question: string;
  /** predict questions: the code to read */
  code?: string;
  options: string[];
  /** index into options */
  answer: number;
  /** one line: why */
  why: string;
};

export const warmKey = (day: string) => `dsa:warm:${day}`;
export const WARM_PREFIX = "dsa:warm:";

/** FNV-1a 32-bit (the same function as src/lib/learn/arena/shared.ts hash32, kept here so this file imports nothing). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Markdown → one line of plain text (inline code keeps its text; emphasis and links lose their marks). */
export function plainLine(md: string): string {
  return md
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The bodies of every ```<lang> fence in a markdown file, outside other fences. */
export function fencesOf(md: string, lang: string): string[] {
  const out: string[] = [];
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let open: { lang: string; at: number } | null = null;
  let buf: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,})\s*([\w-]*)\s*$/);
    if (!open && m && m[2]) {
      open = { lang: m[2], at: m[1].length };
      buf = [];
    } else if (!open && m) {
      open = { lang: "", at: m[1].length };
      buf = [];
    } else if (open && m && !m[2] && m[1].length >= open.at) {
      if (open.lang === lang) out.push(buf.join("\n"));
      open = null;
    } else if (open) buf.push(line);
  }
  return out;
}

// a question that points at something the card cannot show
const NEEDS_CONTEXT = /\b(above|below|following code|this code|the code|the table|the diagram|this diagram|figure|picture|animation|earlier example)\b/i;

type Meta = { concept: string; lesson: string; href: string };

/** Single-answer questions of a ```quiz fence (`? question`, `- [ ]` / `- [x]` options, `>` explanation). */
export function parseQuizFence(body: string, meta: Meta): WarmQ[] {
  const out: WarmQ[] = [];
  let cur: { q: string; opts: { t: string; ok: boolean }[]; why: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const ok = cur.opts.filter((o) => o.ok);
    const question = plainLine(cur.q);
    const why = plainLine(cur.why.join(" "));
    if (question && ok.length === 1 && cur.opts.length >= 2 && cur.opts.length <= 6 && why && !NEEDS_CONTEXT.test(question) && question.length <= 320) {
      out.push({
        id: `${meta.concept}:${hash32(question).toString(36)}`,
        ...meta,
        kind: "quiz",
        question,
        options: cur.opts.map((o) => plainLine(o.t)),
        answer: cur.opts.findIndex((o) => o.ok),
        why: firstSentences(why),
      });
    }
    cur = null;
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^\?\s+(.*)$/))) {
      flush();
      cur = { q: m[1], opts: [], why: [] };
    } else if (!cur) continue;
    else if ((m = raw.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/))) cur.opts.push({ t: m[2], ok: m[1] !== " " });
    else if ((m = raw.match(/^>\s?(.*)$/))) cur.why.push(m[1]);
    else if (raw.trim() && !raw.startsWith("%%") && !cur.opts.length) cur.q += ` ${raw.trim()}`;
  }
  flush();
  return out;
}

/** The "one-line why": the first sentence, or two when the first is very short. */
export function firstSentences(s: string, max = 220): string {
  const parts = s.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map((x) => x.trim()) ?? [s];
  let out = parts[0] || s;
  if (out.length < 60 && parts[1]) out += ` ${parts[1]}`;
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}

/** The options in a fixed shuffled order for this seed (so the right answer is not always where the lesson put it). */
export function shuffledOrder(n: number, seed: string): number[] {
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => hash32(`${seed}|${a}`) - hash32(`${seed}|${b}`) || a - b);
}

/** The pool is the first tier with a question; the pick is the lowest hash(seed | question id). Null when every tier is empty. */
export function pickWarmup(tiers: WarmQ[][], seed: string): { q: WarmQ; tier: number } | null {
  for (let t = 0; t < tiers.length; t++) {
    const pool = tiers[t];
    if (!pool.length) continue;
    let best: WarmQ | null = null;
    let bestH = Infinity;
    for (const q of pool) {
      const h = hash32(`warm|${seed}|${q.id}`);
      if (h < bestH || (h === bestH && best && q.id < best.id)) {
        bestH = h;
        best = q;
      }
    }
    if (best) return { q: best, tier: t };
  }
  return null;
}

/** The learner's seed for a day: the same string all day, different for another learner or another day. */
export const warmSeed = (userId: string | null | undefined, day: string) => `${userId || "guest"}|${day}`;

/** Lessons the learner touched lately, newest first (a finished lesson `dsa:c:<id>` or a step `dsa:s:<id>/<beat>`, stamped with when). */
export function recentConcepts(done: Record<string, number> | null | undefined, limit = 5): string[] {
  const at = new Map<string, number>();
  for (const [k, t] of Object.entries(done || {})) {
    const id = k.startsWith("dsa:c:") ? k.slice(6) : k.startsWith("dsa:s:") ? k.slice(6).split("/")[0] : "";
    if (id && Number.isFinite(t) && t > (at.get(id) ?? -1)) at.set(id, t);
  }
  return [...at.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([id]) => id);
}

/** True when the account (or this browser) already holds today's warm-up key. */
export const warmDoneToday = (done: Record<string, number> | null | undefined, day: string) => !!done && warmKey(day) in done;

/** Days (YYYY-MM-DD) with a finished warm-up, from game_done keys (for the Progress streak and heatmap). */
export function warmDaysOf(done: Record<string, number> | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const k of Object.keys(done || {})) if (k.startsWith(WARM_PREFIX)) out.add(k.slice(WARM_PREFIX.length));
  return out;
}
