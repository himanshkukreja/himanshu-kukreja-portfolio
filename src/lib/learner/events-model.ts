/**
 * The outcome log's shape and rules (table learner_events, supabase/migrations/20261112_learner_events.sql; the AI
 * audit's O2 and §7 Layer 1). Pure, so the routes, the brief, the eval and the tests share it.
 *
 * A row is one AI-graded result: what was graded (`ref`), the verdict or level (`outcome`) and `detail`, which holds ids
 * and levels only (missed rubric signal ids, missed key point numbers, hint level, rubric scores), never the learner's
 * text, answers, code or chat. `cleanDetail` enforces that before anything is written: keys are short slugs, values
 * are numbers, booleans, short id-like strings or short lists of them, and the whole object stays under 1 KB.
 *
 * Per kind (ref · outcome · detail):
 *   explain_back   concept id ("dsa:<id>" for DSA) · solid|partial|misconception · miss: key point numbers (1-based)
 *   mock_phase     "<slug>/<phase id>" · junior|sde|senior|staff|below-junior|none · miss, met: signal ids; run
 *   mock_overall   slug · the round's level · run, target (the level the learner picked), weak (weakest phase id)
 *   lld_mock       slug · the round's level · run, phases {p1: level…}, miss: signal ids, cl/of: checklist lines met
 *   lab_hint       lab id · hint-1|hint-2|hint-3 · level, fails (failed runs so far), stage
 *   lab_pass       lab id · pass · fails, stage (written with the review that follows a pass)
 *   lab_review     lab id · clean|minor|issues · c, x, e, r (rubric scores 1-5), n (issues)
 *   war_room       slug · strong|solid|shaky|rough · wrong, first, calls, hurts, miss: call numbers wrong first
 *   paper          "<paper key>/q<n>" · "<score>/<max>" · score, max, miss: scheme point numbers not fully awarded
 *   chat_quiz      question-bank item id · right|wrong|answered · kind
 */

export const EVENT_KINDS = ["explain_back", "mock_phase", "mock_overall", "lld_mock", "lab_run", "lab_hint", "lab_pass", "lab_review", "war_room", "paper", "chat_quiz"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** what the learner_outcomes view adds (DSA Mastery submits, from their own table) */
export type OutcomeKind = EventKind | "dsa_submit";
export type EventCourse = "sdm" | "dsa";

type DetailScalar = number | boolean | string;
export type EventDetail = Record<string, DetailScalar | DetailScalar[] | Record<string, DetailScalar>>;

export type OutcomeEvent = { course: EventCourse; kind: OutcomeKind; ref: string; outcome: string | null; detail: EventDetail; at: number };
export type NewEvent = { course: EventCourse; kind: EventKind; ref: string; outcome?: string | null; detail?: Record<string, unknown> };

export const DETAIL_MAX_BYTES = 1024;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,159}$/;
const OUTCOME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/+-]{0,31}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
/** an id or level: no spaces, short (signal ids "p3.s2", levels, slugs); anything that could be prose is dropped */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9:._/+-]{0,47}$/;

export const cleanRef = (v: unknown): string | null => (typeof v === "string" && REF_RE.test(v) ? v : null);
export const cleanOutcome = (v: unknown): string | null => (typeof v === "string" && OUTCOME_RE.test(v.trim()) ? v.trim().toLowerCase() : null);

function scalar(v: unknown): DetailScalar | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "string" && ID_RE.test(v)) return v;
  return undefined;
}

/** `detail` reduced to ids and levels, ≤ 1 KB (the longest list is halved until it fits); {} when nothing is usable. */
export function cleanDetail(d: unknown): EventDetail {
  const out: EventDetail = {};
  if (!d || typeof d !== "object" || Array.isArray(d)) return out;
  for (const [k, v] of Object.entries(d as Record<string, unknown>).slice(0, 16)) {
    if (!KEY_RE.test(k)) continue;
    if (Array.isArray(v)) {
      const xs = v.map(scalar).filter((x): x is DetailScalar => x !== undefined).slice(0, 16);
      if (xs.length) out[k] = xs;
    } else if (v && typeof v === "object") {
      const o: Record<string, DetailScalar> = {};
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>).slice(0, 12)) {
        const s = KEY_RE.test(k2) ? scalar(v2) : undefined;
        if (s !== undefined) o[k2] = s;
      }
      if (Object.keys(o).length) out[k] = o;
    } else {
      const s = scalar(v);
      if (s !== undefined) out[k] = s;
    }
  }
  // over the cap: shorten the longest list, then drop keys from the end
  const size = () => new TextEncoder().encode(JSON.stringify(out)).length;
  while (size() > DETAIL_MAX_BYTES) {
    const lists = Object.entries(out).filter(([, v]) => Array.isArray(v) && v.length > 1) as [string, DetailScalar[]][];
    if (lists.length) {
      const [k, v] = lists.sort((a, b) => b[1].length - a[1].length)[0];
      out[k] = v.slice(0, Math.ceil(v.length / 2));
    } else delete out[Object.keys(out).pop()!];
  }
  return out;
}

/** The row to insert (null: not a valid event). */
export function eventRow(userId: string, e: NewEvent): { user_id: string; course: EventCourse; kind: EventKind; ref: string; outcome: string | null; detail: EventDetail } | null {
  const ref = cleanRef(e.ref);
  if (!ref || !(EVENT_KINDS as readonly string[]).includes(e.kind) || (e.course !== "sdm" && e.course !== "dsa")) return null;
  return { user_id: userId, course: e.course, kind: e.kind, ref, outcome: e.outcome == null ? null : cleanOutcome(e.outcome), detail: cleanDetail(e.detail) };
}

/* ------------------------------------------------------------------ reading a grader's words as ids */

const STOP = new Set("about above after again also and any are because been before being both but can could does doing down each from further have having here how into its itself just more most must need not now off once only other over own same should some such than that the their them then there these they this those through too under until very was were what when where which while who why will with would you your yours".split(" "));
const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, "").slice(0, 6);
const terms = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []).filter((w) => !STOP.has(w)).map(stem));

/**
 * Which rubric items a grader's free text names (its MISSED or MISSING line), as their ids: an item counts when most of
 * its own distinctive words appear in the text (the grader quotes or paraphrases the rubric line). Deterministic, so the
 * log stores ids, never the grader's or the learner's words. `min`: the share of an item's words that must appear.
 */
export function namedItems(text: string, items: { id: string; text: string }[], min = 0.5): string[] {
  const t = terms(text);
  if (!t.size || /^\s*(none|nothing|n\/a)\b/i.test(text)) return [];
  const out: string[] = [];
  for (const it of items) {
    const w = [...terms(it.text)];
    if (!w.length) continue;
    const hit = w.filter((x) => t.has(x)).length;
    // a long rubric line is usually quoted by its first clause: judge it on its first dozen words too
    const head = [...terms(it.text.split(/[;:,(]/)[0])];
    const headHit = head.length >= 2 ? head.filter((x) => t.has(x)).length / head.length : 0;
    if (hit / w.length >= min || headHit >= 0.75) out.push(it.id);
  }
  return out;
}

/** A scorecard's sections: "### P1 · Title" blocks and "### Overall", with their LEVEL / MET / MISSED lines. */
export function scorecardParts(text: string): { title: string; level: string; met: string; missed: string; checklist: string }[] {
  return text
    .split(/^###\s+/m)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [title, ...rest] = b.split("\n");
      const body = rest.join("\n");
      const get = (k: string) => body.match(new RegExp(`^\\**${k}:?\\**:?\\s*([\\s\\S]*?)(?=^\\**[A-Z]+:|$(?![\\s\\S]))`, "m"))?.[1]?.trim() || "";
      return { title: title.replace(/\*/g, "").trim(), level: levelWord(get("LEVEL")), met: get("MET"), missed: get("MISSED"), checklist: get("CHECKLIST") };
    });
}

const LEVEL_WORDS = ["below-junior", "junior", "sde", "senior", "staff"];
/** "SDE (strong)" → "sde"; "not answered" → "none" */
export function levelWord(s: string): string {
  const t = s.toLowerCase();
  if (/not answered|not attempted/.test(t)) return "none";
  const m = t.match(/below[- ]junior|junior|sde|senior|staff/);
  return m ? m[0].replace(" ", "-") : "";
}

/* ------------------------------------------------------------------ levels, for growth */

const RANKS: Partial<Record<OutcomeKind, string[]>> = {
  explain_back: ["misconception", "partial", "solid"],
  mock_phase: ["none", ...LEVEL_WORDS],
  mock_overall: ["none", ...LEVEL_WORDS],
  lld_mock: ["none", ...LEVEL_WORDS],
  lab_review: ["issues", "minor", "clean"],
  war_room: ["rough", "shaky", "solid", "strong"],
};
/** An outcome's place on its kind's scale (higher is better); null when it has none (a paper's "7/10" is a fraction). */
export function rankOf(kind: OutcomeKind, outcome: string | null): number | null {
  if (!outcome) return null;
  if (kind === "paper") {
    const m = outcome.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
  }
  const r = RANKS[kind]?.indexOf(outcome) ?? -1;
  return r >= 0 ? r : null;
}

/** How a level reads to a learner ("sde" → "SDE", "below-junior" → "below junior"). */
export const levelLabel = (s: string | null) => (!s ? "" : s === "sde" ? "SDE" : s === "none" ? "not answered" : s.replace(/-/g, " "));

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string | number => typeof x === "string" || typeof x === "number").map(String) : []);
export const missOf = (e: Pick<OutcomeEvent, "detail">): string[] => listOf(e.detail.miss);

/** dd Mon */
export const dayOf = (at: number) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
