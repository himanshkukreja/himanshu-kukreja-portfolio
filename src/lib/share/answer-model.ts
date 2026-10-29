/**
 * Shareable smart-search answers (/learn/answer/<id>): the stored shape and the validation every share goes
 * through. Pure, shared by the endpoint, the store, the page and the button.
 *
 * Only the answer leaves the learner's search: the question, the answer's plain-text runs and citation
 * numbers, and for each cited source its title, kind, a short place line and a site-relative course link.
 * No intent, note, path, scores, credits or anything else from SmartAnswer.
 */
import { KINDS, type AnswerPart, type Kind } from "@/lib/search/smart/types";
import { scrubPrivate } from "@/lib/admin/gaps/text";

/** Shared answer pages are noindex until this is true (then they are indexable and followed). */
export const ANSWER_PAGES_INDEXABLE = false;
/** Shares per learner per rolling 24 hours. */
export const SHARES_PER_DAY = 20;
export const SHARED_ANSWERS_TABLE = "shared_answers";

export type SharedCite = { kind: Kind; title: string; sub: string; href: string };
export type SharedAnswer = { id: string; createdAt: string; question: string; answer: AnswerPart[]; cites: SharedCite[] };

export const ID_RE = /^[A-Za-z0-9]{10}$/;
const CTRL_CLASS = "[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]";
const CTRL = new RegExp(CTRL_CLASS, "g");
const HAS_CTRL = new RegExp(CTRL_CLASS);
const clean = (s: string, max: number) => s.replace(CTRL, " ").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * A site-relative course link: /learn/... (lessons, lectures, concepts, labs, revise, reading...) or
 * /stories/<slug> (case files). No scheme, no host, no protocol-relative "//", no backslashes.
 */
export function isCourseHref(href: unknown): href is string {
  if (typeof href !== "string" || href.length < 6 || href.length > 400) return false;
  if (!/^\/(learn|stories)(\/|$|[?#])/.test(href) || href.startsWith("//") || /[\\\s<>"'`]/.test(href) || HAS_CTRL.test(href)) return false;
  try {
    const u = new URL(href, "https://site.invalid");
    return u.origin === "https://site.invalid" && /^\/(learn|stories)(\/|$)/.test(u.pathname) && !u.pathname.includes("//");
  } catch {
    return false;
  }
}

export type ShareInput = { question: string; answer: AnswerPart[]; cites: SharedCite[] };
export type ShareProblem = "question" | "answer" | "cites" | "href";

/** POST body → what is stored, or the first problem. */
export function validateShare(body: unknown): { ok: true; value: ShareInput } | { ok: false; problem: ShareProblem; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { question?: unknown; answerParts?: unknown; answer?: unknown; cites?: unknown };
  const question = clean(scrubPrivate(String(b.question ?? ""), "[removed]"), 300);
  if (question.length < 3) return { ok: false, problem: "question", error: "The question is missing." };

  const rawCites = Array.isArray(b.cites) ? b.cites : [];
  if (!rawCites.length || rawCites.length > 12) return { ok: false, problem: "cites", error: "An answer needs 1 to 12 sources." };
  const cites: SharedCite[] = [];
  for (const c of rawCites) {
    const x = (c && typeof c === "object" ? c : {}) as { kind?: unknown; title?: unknown; sub?: unknown; href?: unknown };
    if (!isCourseHref(x.href)) return { ok: false, problem: "href", error: "Every source must be a link to the course." };
    const kind = (KINDS as readonly string[]).includes(String(x.kind)) ? (x.kind as Kind) : null;
    const title = clean(String(x.title ?? ""), 160);
    if (!kind || !title) return { ok: false, problem: "cites", error: "A source is missing its title or kind." };
    cites.push({ kind, title, sub: clean(String(x.sub ?? ""), 120), href: x.href });
  }

  const parts = Array.isArray(b.answerParts) ? b.answerParts : Array.isArray(b.answer) ? b.answer : [];
  if (!parts.length || parts.length > 80) return { ok: false, problem: "answer", error: "The answer is missing." };
  const answer: AnswerPart[] = [];
  let chars = 0;
  for (const p of parts) {
    if (typeof p === "number") {
      if (!Number.isInteger(p) || p < 0 || p >= cites.length) return { ok: false, problem: "answer", error: "The answer cites a source it doesn't list." };
      answer.push(p);
    } else if (typeof p === "string") {
      const s = p.replace(CTRL, " ").replace(/[ \t]+/g, " ").slice(0, 1500);
      chars += s.length;
      if (s) answer.push(s);
    } else return { ok: false, problem: "answer", error: "The answer has something that isn't text or a citation." };
  }
  if (chars > 4000) return { ok: false, problem: "answer", error: "The answer is too long to share." };
  if (!answer.some((p) => typeof p === "string" && p.trim().length > 0)) return { ok: false, problem: "answer", error: "The answer is missing." };
  return { ok: true, value: { question, answer, cites } };
}

/** Stored JSON back into a page-safe answer (the stored rows were validated, but the page never trusts them). */
export function readShared(row: { id: string; created_at: string; question: string; answer: unknown; cites: unknown }): SharedAnswer | null {
  const v = validateShare({ question: row.question, answerParts: row.answer, cites: row.cites });
  if (!v.ok) return null;
  return { id: row.id, createdAt: row.created_at, ...v.value };
}

/** A plain-text line of the answer (meta description, OG image). */
export function answerText(a: Pick<SharedAnswer, "answer">, max = 200): string {
  const t = a.answer
    .filter((p): p is string => typeof p === "string")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : t;
}
