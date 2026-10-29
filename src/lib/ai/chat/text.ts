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
  | { type: "status"; tool: string; label: string }
  | { type: "sources"; sources: Record<string, ChatSource> }
  | { type: "quiz"; quiz: QuizCard }
  | { type: "graded"; result: QuizResult }
  | { type: "path"; path: PathCard }
  | { type: "save"; pref: string }
  | { type: "mock"; mock: MockCard }
  | { type: "round"; n: number }
  | { type: "delta"; text: string }
  | { type: "done"; text: string; offTopic: boolean; quota: ChatQuota | null; tools: number; ms: number; callId: number | null; mode?: "tutor" | "interviewer" | "scorecard"; /** ms to the first text the learner saw (server side) */ ttft?: number | null }
  | { type: "error"; message: string };

export const REF_RE = /\[\[\s*([a-z]\d{1,4}(?:\s*,\s*[a-z]\d{1,4})*)\s*\]\]/gi;
export const OFF_TOPIC_MARK = /^\s*\[\[\s*off[_ -]?topic\s*\]\]\s*/i;

/** Plain text from the model as the chat may show it: no links, no HTML, only known source refs. */
export function cleanAnswer(text: string, known: (ref: string) => boolean): string {
  return (
    text
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

/** Text while it streams: a half-written [[s1 at the end is held back, and unknown refs are hidden. */
export function streamingText(text: string, known: (ref: string) => boolean): string {
  const open = text.lastIndexOf("[[");
  const shown = open >= 0 && text.indexOf("]]", open) < 0 ? text.slice(0, open) : text;
  return cleanAnswer(shown, known);
}

const nextNum = (keys: string[], prefix: string) => keys.reduce((n, k) => (k.startsWith(prefix) ? Math.max(n, Number(k.slice(prefix.length)) || 0) : n), 0) + 1;
export const nextRef = (keys: string[], prefix: "s" | "q" | "p") => `${prefix}${nextNum(keys, prefix)}`;

export const isRef = (x: unknown, prefix: "s" | "q" | "p"): x is string => typeof x === "string" && new RegExp(`^${prefix}\\d{1,4}$`).test(x);

/** Status lines while a tool runs. */
export const TOOL_LABEL: Record<string, string> = {
  search_course: "searching the course…",
  find_lecture_moment: "finding the moment in the lectures…",
  list_by_kind: "listing what the course has…",
  get_item: "reading the course…",
  current_page: "looking at this page…",
  get_progress: "checking your progress…",
  get_week_plan: "reading the course plan…",
  get_practice: "finding a practice question…",
  check_answer: "checking your answer…",
  build_path: "building your path…",
  save_path: "saving your path…",
  get_saved_paths: "opening your saved paths…",
  site_guide: "checking how the site works…",
  start_mock: "setting up the interview…",
  review_my_design: "looking at your design…",
  get_due_reviews: "checking what's due for review…",
  make_study_plan: "laying out your plan…",
};

/** 👍 / 👎 and "this was wrong" on one answer (POST /api/learn/ai/chat/feedback). */
export type ChatFeedback = { callId: number; rating: -1 | 0 | 1; wrong: boolean; note: string };
