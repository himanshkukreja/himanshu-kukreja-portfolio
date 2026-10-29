/**
 * The course chat's wire format and its text rules. Pure: the route, the client and the eval share it.
 *
 * Citations: the model never writes a link. Tools hand it short refs (s1, s2, …) for real index entries, and
 * it cites them as [[s3]] (or [[s3, s7]]). `cleanAnswer` keeps only refs the tools returned in this
 * conversation and strips every URL, markdown link and HTML tag, so the only links a learner can click are
 * the index's own hrefs, resolved from the refs.
 */
import type { Kind } from "@/lib/search/smart/types";

/** A cited resource, copied from the index or the site guide (never from the model). */
export type ChatSource = { id: string; kind: Kind | "guide"; title: string; sub: string; href: string; at: number };

export type QuizKind = "mcq" | "checkpoint" | "drill";
/** A practice question as the chat shows it (never with its answer). */
export type QuizCard = {
  qref: string;
  /** the item's stable id (mcq:<bank id>, cp:<week>/<slug>#<n>, drill:<quest>#<id>) */
  item: string;
  kind: QuizKind;
  question: string;
  /** an MCQ's options, lettered A, B, C, D in this order */
  options?: string[];
  /** the ref of the lesson or quest it comes from */
  from?: string;
  /** "W04 · Caching patterns · checkpoint" */
  label: string;
};
/** What check_answer found (MCQ: deterministic; free text: graded by the model against the reference). */
export type QuizResult = { qref: string; answer: string; correct: boolean | null; correctLetter?: string };

export type PathStepRef = { ref: string; why: string; /** a study plan's day for this step (YYYY-MM-DD) */ date?: string };
export type PathCard = { pref: string; title: string; note: string; steps: PathStepRef[]; /** a dated study plan (make_study_plan): the page offers a calendar file */ plan?: { start: string; days: number; hoursPerDay: number } };

/** Where the learner is when they ask (the panel on a lesson, quest or lecture page). */
export type PageContext = {
  path: string;
  title?: string;
  /** the heading nearest the top of the screen, and its anchor id */
  heading?: string;
  headingId?: string;
  /** text the learner selected on the page */
  selection?: string;
  /** a lecture or short page: the second the video is at */
  videoAt?: number;
};

export type ChatTurn = { role: "user" | "assistant"; text: string };

/** A mock interview in the chat (a course mock, or a side quest's design round built from its drills). */
export type MockPhaseCard = { id: string; title: string; minutes: number; opener: string };
export type MockCard = { key: string; title: string; company: string; interviewer: string; href: string; phases: MockPhaseCard[] };
/** What the page sends while a mock is on: the phase and its conversation, or every phase's to score it. */
export type MockState = {
  key: string;
  phase: string;
  /** this phase's exchange so far (the interviewer's lines and the candidate's), oldest first */
  history: ChatTurn[];
  /** "end": grade the whole interview (then `phases` holds every phase's exchange) */
  action?: "turn" | "end";
  phases?: Record<string, ChatTurn[]>;
};

/** POST /api/learn/ai/chat */
export type ChatRequest = {
  /** a random id per conversation (groups its messages in the admin log; not personal) */
  chat: string;
  /** the conversation, the new user message last */
  messages: ChatTurn[];
  /** refs from earlier in this conversation: ref → index id (the server checks each id again) */
  sources?: Record<string, string>;
  /** practice questions asked earlier: qref → item id */
  quizzes?: Record<string, string>;
  /** learning paths built earlier: pref → path */
  paths?: Record<string, Omit<PathCard, "pref">>;
  /** the new message answers this practice question */
  answerTo?: string;
  page?: PageContext | null;
  /** a mock interview is on: the message goes to the interviewer (or "end" scores it) */
  mock?: MockState | null;
};

/** The chat's quota today (GET /api/learn/ai/chat, and on every answer). */
export type ChatQuota = {
  /** messages on the main model (Sonnet) left today */
  mainLeft: number;
  mainPerDay: number;
  /** messages left today in all (the anti-abuse ceiling) */
  totalLeft: number;
  /** the next message goes to the fast model (Haiku 5.5) */
  fast: boolean;
  /** answering with the learner's own key: no quota */
  ownKey: boolean;
};

/** Server-sent events of one answer, in order: status/sources/quiz/path/save/graded as tools run, delta while the text streams, then done or error. */
export type ChatEvent =
  | { type: "start"; fast: boolean; model: string }
  /** a step the server is on (one per tool call, plus the model's own thinking/writing). `label` is the line to show;
   *  `noun` (optional) says what a read is ("lesson", "lecture", …) so the page can sum reads up ("read 3 lessons") */
  | { type: "status"; tool: string; label: string; noun?: string }
  /** refs handed to the page; `quiet`: the learner's own context (progress, the page they're on), not something looked up */
  | { type: "sources"; sources: Record<string, ChatSource>; quiet?: boolean }
  | { type: "quiz"; quiz: QuizCard }
  | { type: "graded"; result: QuizResult }
  | { type: "path"; path: PathCard }
  | { type: "save"; pref: string }
  | { type: "mock"; mock: MockCard }
  | { type: "round"; n: number }
  /** 2–3 likely next questions for this answer (sent just before done; none for a quiz question, a decline or a mock) */
  | { type: "followups"; items: string[] }
  | { type: "delta"; text: string }
  | { type: "done"; text: string; offTopic: boolean; quota: ChatQuota | null; tools: number; ms: number; callId: number | null; mode?: "tutor" | "interviewer" | "scorecard"; /** ms to the first text the learner saw (server side) */ ttft?: number | null }
  | { type: "error"; message: string };

/**
 * Follow-ups: the model ends a real answer with one line, <<followups>>["…","…"], the questions the learner is
 * likely to ask next. The server never streams that line (followupFilter), takes it off the answer
 * (splitFollowups) and sends the questions as their own event; cleanAnswer drops it too, wherever text comes from.
 */
export const FOLLOWUPS_MARK = /<<\s*follow-?ups\s*>>/i;
/** the start of the mark at the very end of streamed text ("<", "<<", "<<follo"…): held until it is clear */
export const FOLLOWUPS_PARTIAL = /<<?\s*(?:f(?:o(?:l(?:l(?:o(?:w(?:-?(?:u(?:p(?:s\s*>?)?)?)?)?)?)?)?)?)?)?$/i;
export const FOLLOWUP_MAX = 80;

/** The answer without its follow-ups line, and the questions in it (checked: plain text, short, no repeats; at most 3). */
export function splitFollowups(text: string, asked = ""): { text: string; followups: string[] } {
  const m = FOLLOWUPS_MARK.exec(text);
  if (!m) return { text, followups: [] };
  const rest = text.slice(m.index + m[0].length);
  let raw: unknown[] = [];
  const a = rest.indexOf("[");
  const b = rest.lastIndexOf("]");
  if (a >= 0 && b > a) {
    try {
      const v = JSON.parse(rest.slice(a, b + 1));
      if (Array.isArray(v)) raw = v;
    } catch {
      raw = [...rest.slice(a, b + 1).matchAll(/"([^"\n]{3,200})"/g)].map((x) => x[1]);
    }
  }
  const seen = new Set([asked.trim().toLowerCase().replace(/[?.!\s]+$/, "")]);
  const followups: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const q = x
      .replace(REF_RE, "")
      .replace(/!?\[([^\]\n]*)\]\([^)]*\)/g, "$1")
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/[*_`#]+/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s+([?.!,;:])/g, "$1")
      .trim();
    const key = q.toLowerCase().replace(/[?.!\s]+$/, "");
    if (q.length < 4 || q.length > FOLLOWUP_MAX || seen.has(key)) continue;
    seen.add(key);
    followups.push(q);
    if (followups.length === 3) break;
  }
  return { text: text.slice(0, m.index).trimEnd(), followups };
}

/** Deltas in, deltas out without the follow-ups line (a round's text after the mark is dropped; `flush` at a round's end). */
export function followupFilter(emit: (d: string) => void) {
  let hold = "";
  let gone = false;
  return {
    push(d: string) {
      if (gone || !d) return;
      const s = hold + d;
      hold = "";
      const m = FOLLOWUPS_MARK.exec(s);
      if (m) {
        if (m.index > 0) emit(s.slice(0, m.index));
        gone = true;
        return;
      }
      const p = FOLLOWUPS_PARTIAL.exec(s);
      if (p) {
        if (p.index > 0) emit(s.slice(0, p.index));
        hold = s.slice(p.index);
      } else emit(s);
    },
    flush() {
      if (!gone && hold) emit(hold);
      hold = "";
      gone = false;
    },
  };
}

export const REF_RE = /\[\[\s*([a-z]\d{1,4}(?:\s*,\s*[a-z]\d{1,4})*)\s*\]\]/gi;
export const OFF_TOPIC_MARK = /^\s*\[\[\s*off[_ -]?topic\s*\]\]\s*/i;

/** Plain text from the model as the chat may show it: no links, no HTML, only known source refs. */
export function cleanAnswer(text: string, known: (ref: string) => boolean): string {
  return (
    text
      // the follow-ups line goes to its own cards, never into the text
      .replace(/<<\s*follow-?ups\s*>>[\s\S]*$/i, "")
      // a private plan line (tuned Haiku prompts) never reaches the learner
      .replace(/^[\s\S]*?<\/plan>\s*/i, "")
      .replace(/^\s*<plan>[^\n]*\n?/i, "")
      .replace(OFF_TOPIC_MARK, "")
      // markdown links and images keep their words, lose their target
      .replace(/!?\[([^\]\n]*)\]\((?:[^)\s]*)(?:\s+"[^"]*")?\)/g, "$1")
      .replace(/\b(?:https?:\/\/|www\.)[^\s)\]]+/gi, "")
      // HTML elements (the renderer escapes everything anyway; this keeps `List<Integer>` in code intact)
      .replace(/<\/?(?:a|script|iframe|img|div|span|p|br|hr|b|i|u|em|strong|style|link|meta|form|input|button|svg|object|embed|plan)\b[^>\n]*>/gi, "")
      // the course's internal block syntax never shows
      .replace(/^\s*:{2,}.*$/gm, "")
      // a ref written as (s3) or (s3, s7) instead of [[s3]] (the fast model, now and then): made a citation when every ref is known
      .replace(/\(\s*(s\d{1,4}(?:\s*,\s*s\d{1,4})*)\s*\)/gi, (m, list: string) => {
        const refs = list.split(",").map((r) => r.trim().toLowerCase());
        return refs.every(known) ? `[[${refs.join(", ")}]]` : m;
      })
      .replace(REF_RE, (_m, list: string) => {
        const keep = list
          .split(",")
          .map((r) => r.trim().toLowerCase())
          .filter((r) => r.startsWith("s") && known(r));
        return keep.length ? `[[${[...new Set(keep)].join(", ")}]]` : "";
      })
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * A turn as it goes back to the model in the history. Cards live on the page, not in the text, so the model
 * would otherwise not know a question was shown (it once "corrected" a grade it had given, saying it never
 * asked one): an answer to a practice question says which one, and a reply that showed one says so.
 */
export function historyText(m: { role: "user" | "assistant"; text: string; answerTo?: string; quizzes?: string[] }, quizzes: Record<string, { question: string } | undefined>, isNew = false): string {
  if (m.role === "user") return m.answerTo && !isNew ? `(my answer to ${m.answerTo}) ${m.text}` : m.text;
  const shown = (m.quizzes ?? []).map((q) => `(The page showed practice question ${q}${quizzes[q] ? `: "${quizzes[q]!.question.replace(/\s+/g, " ").slice(0, 160)}"` : ""}.)`);
  return shown.length ? `${m.text}\n\n${shown.join(" ")}` : m.text;
}

/** Text split into plain runs and citation groups, for rendering ([[s1, s3]] → ["s1","s3"]). */
export type CitePart = string | { refs: string[] };
export function splitCitations(text: string): CitePart[] {
  const out: CitePart[] = [];
  let last = 0;
  for (const m of text.matchAll(REF_RE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ refs: m[1].split(",").map((r) => r.trim().toLowerCase()) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The refs an answer cites, in first-cited order. */
export function citedRefs(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(REF_RE)) for (const r of m[1].split(",")) {
    const x = r.trim().toLowerCase();
    if (!seen.includes(x)) seen.push(x);
  }
  return seen;
}

/**
 * Text while it streams: anything at the end that cleanAnswer would rewrite once it is complete is held back
 * until it is (so nothing shows, then changes or disappears): a half-written [[s1, a (s3 ref, a markdown link
 * or URL, an HTML tag, a private <plan> that hasn't closed. Unknown refs are hidden.
 */
export function streamingText(text: string, known: (ref: string) => boolean): string {
  // a private plan still being written: nothing to show yet
  if (/^\s*<plan>/i.test(text) && !/<\/plan>/i.test(text)) return "";
  let shown = text;
  const fu = FOLLOWUPS_MARK.exec(shown) ?? FOLLOWUPS_PARTIAL.exec(shown);
  if (fu) shown = shown.slice(0, fu.index);
  const open = shown.lastIndexOf("[[");
  if (open >= 0 && shown.indexOf("]]", open) < 0) shown = shown.slice(0, open);
  const cut = (re: RegExp) => {
    const m = re.exec(shown);
    if (m) shown = shown.slice(0, m.index);
  };
  cut(/\(\s*(?:s\d{0,4}(?:\s*,\s*s?\d{0,4})*\s*)?$/i);
  cut(/!?\[[^\]\n]*(?:\](?:\([^)\n]*)?)?$/);
  cut(/\b(?:https?:\/\/|www\.)[^\s)\]]*$/i);
  cut(/\b(?:h|ht|htt|https?|https?:\/?|ww?w?\.?)$/i);
  cut(/<\/?(?:[a-z][^>\n]*)?$/i);
  return cleanAnswer(shown, known);
}

const nextNum = (keys: string[], prefix: string) => keys.reduce((n, k) => (k.startsWith(prefix) ? Math.max(n, Number(k.slice(prefix.length)) || 0) : n), 0) + 1;
export const nextRef = (keys: string[], prefix: "s" | "q" | "p") => `${prefix}${nextNum(keys, prefix)}`;

export const isRef = (x: unknown, prefix: "s" | "q" | "p"): x is string => typeof x === "string" && new RegExp(`^${prefix}\\d{1,4}$`).test(x);

/** Status lines while a tool runs (the fallback when `toolStatus` has nothing more specific). */
export const TOOL_LABEL: Record<string, string> = {
  search_course: "Searching the course…",
  find_lecture_moment: "Finding the moment in the lectures…",
  list_by_kind: "Listing what the course has…",
  get_item: "Reading the course…",
  current_page: "Reading this page…",
  get_progress: "Checking your progress…",
  get_week_plan: "Reading the course plan…",
  get_practice: "Picking a practice question…",
  check_answer: "Grading your answer…",
  build_path: "Building your path…",
  save_path: "Saving your path…",
  get_saved_paths: "Opening your saved paths…",
  site_guide: "Checking how the site works…",
  start_mock: "Setting up your mock interview…",
  review_my_design: "Reading your design…",
  get_due_reviews: "Checking what's due for review…",
  make_study_plan: "Building your plan…",
  // not tools: steps of the message itself
  context: "Checking your progress…",
  think: "Thinking…",
  write: "Writing your answer…",
  interviewer: "The interviewer is thinking…",
  scorecard: "Scoring your interview…",
};

const quoteOf = (x: unknown, n = 42): string => {
  const t = typeof x === "string" ? x.replace(/\s+/g, " ").replace(/["“”]/g, "").trim() : "";
  return t ? `“${t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t}”` : "";
};

/** What a read is, for the trail ("read 2 lessons"). */
export const NOUN_OF: Partial<Record<Kind | "guide", string>> = { lesson: "lesson", section: "section", lecture: "lecture", moment: "lecture moment", short: "short", quest: "side quest", problem: "problem", lld: "LLD round", case: "case file", mock: "mock", war: "war story", concept: "concept", lab: "lab", sheet: "design sheet", company: "company page" };

/**
 * The status line for one tool call, naming what it reads where that is cheap (the query, the title of the
 * ref it opens, the week, the plan's length). Model-written words are shown as plain text, clipped.
 */
export function toolStatus(name: string, input: unknown, titleOf: (ref: string) => string | undefined = () => undefined): string {
  // a clipped quote already ends in an ellipsis: "Reading “Deep dive 1: Partitioning…”", not "…”…"
  return statusLine(name, input, titleOf).replace(/…”…$/, "…”");
}
function statusLine(name: string, input: unknown, titleOf: (ref: string) => string | undefined): string {
  const a = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  switch (name) {
    case "search_course":
      return a.query ? `Searching the course for ${quoteOf(a.query)}…` : TOOL_LABEL.search_course;
    case "find_lecture_moment":
      return a.query ? `Finding the lecture moment for ${quoteOf(a.query)}…` : TOOL_LABEL.find_lecture_moment;
    case "get_item": {
      const t = typeof a.ref === "string" ? titleOf(a.ref.toLowerCase()) : undefined;
      return t ? `Reading ${quoteOf(t, 52)}…` : TOOL_LABEL.get_item;
    }
    case "get_week_plan": {
      const w = typeof a.week === "string" || typeof a.week === "number" ? Number(String(a.week).replace(/^w/i, "")) : NaN;
      return Number.isFinite(w) && w > 0 ? `Reading the Week ${w} plan…` : TOOL_LABEL.get_week_plan;
    }
    case "get_practice":
      return a.topic ? `Picking a practice question on ${quoteOf(a.topic, 36)}…` : TOOL_LABEL.get_practice;
    case "build_path":
      return a.title ? `Building your path: ${quoteOf(a.title, 44)}…` : TOOL_LABEL.build_path;
    case "make_study_plan": {
      const d = Number(a.days);
      return Number.isFinite(d) && d >= 1 ? `Building your ${Math.round(d)}-day plan…` : TOOL_LABEL.make_study_plan;
    }
    case "site_guide":
      return a.topic ? `Checking how the site works: ${quoteOf(a.topic, 36)}…` : TOOL_LABEL.site_guide;
    case "start_mock":
      return a.topic ? `Setting up a mock interview on ${quoteOf(a.topic, 36)}…` : TOOL_LABEL.start_mock;
    default:
      return TOOL_LABEL[name] ?? "Working…";
  }
}

/** Past tense of a step for the trail of what the tutor did; [one, many] ({n} is the count). No entry: not shown. */
const TOOL_DONE: Record<string, [string, string]> = {
  context: ["checked your progress", "checked your progress"],
  get_progress: ["checked your progress", "checked your progress"],
  search_course: ["searched the course", "searched the course {n}×"],
  find_lecture_moment: ["searched the lectures", "searched the lectures {n}×"],
  list_by_kind: ["listed the course", "listed the course {n}×"],
  get_item: ["read 1 {noun}", "read {n} {nouns}"],
  current_page: ["read this page", "read this page"],
  get_week_plan: ["read the course plan", "read {n} week plans"],
  get_practice: ["picked a question", "picked {n} questions"],
  check_answer: ["graded your answer", "graded {n} answers"],
  build_path: ["built your path", "built {n} paths"],
  save_path: ["saved your path", "saved {n} paths"],
  get_saved_paths: ["opened your saved paths", "opened your saved paths"],
  site_guide: ["checked the site guide", "checked the site guide {n}×"],
  start_mock: ["set up the interview", "set up the interview"],
  review_my_design: ["read your design", "read your design"],
  get_due_reviews: ["checked your reviews", "checked your reviews"],
  make_study_plan: ["laid out your plan", "laid out {n} plans"],
  scorecard: ["scored your interview", "scored your interview"],
};
const plural = (w: string) => (/y$/.test(w) && !/[aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(s|sh|ch)$/.test(w) ? `${w}es` : `${w}s`);

/** The finished steps as a short trail ("searched the course", "read 3 lessons"), in the order they first ran. */
export function trailOf(steps: { tool: string; noun?: string }[]): string[] {
  const order: string[] = [];
  const by = new Map<string, { n: number; nouns: Set<string> }>();
  for (const s of steps) {
    if (!TOOL_DONE[s.tool]) continue;
    let g = by.get(s.tool);
    if (!g) {
      g = { n: 0, nouns: new Set() };
      by.set(s.tool, g);
      order.push(s.tool);
    }
    g.n++;
    g.nouns.add(s.noun || "page");
  }
  return order.map((t) => {
    const g = by.get(t)!;
    const noun = g.nouns.size === 1 ? [...g.nouns][0] : "page";
    const [one, many] = TOOL_DONE[t];
    return (g.n === 1 ? one : many).replace("{n}", String(g.n)).replace("{nouns}", plural(noun)).replace("{noun}", noun);
  });
}

/** 👍 / 👎 and "this was wrong" on one answer (POST /api/learn/ai/chat/feedback). */
export type ChatFeedback = { callId: number; rating: -1 | 0 | 1; wrong: boolean; note: string };
