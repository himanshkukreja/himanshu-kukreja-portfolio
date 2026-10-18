/**
 * Concept terms: types and the term matcher, shared by the server (renderer marking, mastery data)
 * and the client (review-card attribution on the mastery map). No server-only imports here.
 *
 * Matching rules (see resources/concepts/README.md in the content repo):
 * - every concept matches its `term` and each alias, case-insensitively, on word boundaries;
 * - acronym words in a form (two or more capitals: CAP, WAL, TTL, SLOs, mTLS, gRPC, HTTP/2) must keep
 *   their capitals, so "cap" or "wal" in prose never fire; the other words ignore case;
 * - spaces and hyphens are interchangeable ("write-ahead log" = "write ahead log"), straight and
 *   curly apostrophes too, and a trailing "s" / "es" plural is accepted;
 * - a form never matches inside a hyphenated word ("non-idempotent" does not mark "idempotent");
 * - when two forms overlap, the longest wins ("idempotency key" before "idempotency").
 */

/** Where a concept is taught: a lesson ("<week folder>/<slug>") and a section id in its HTML. */
export type ConceptRef = { lesson: string; anchor: string };

export type Concept = {
  id: string;
  term: string;
  aliases: string[];
  /** one line, at most 25 words */
  definition: string;
  taught: ConceptRef;
  /** other sections that teach or revisit it */
  also: ConceptRef[];
  related: string[];
  /** the 2-minute refresher: 3-5 short points */
  refresher: string[];
  /** false: listed on the map but never marked in prose (a term too common to underline) */
  mark: boolean;
};

export type MarkScope = "stage" | "chapter" | "page";

export type CatalogueSettings = {
  /** a term is marked once per stage (Part / Phase), per chapter (## heading) or once per page */
  scope: MarkScope;
  /** at most this many marked terms per scope */
  maxPerSection: number;
};

export type Catalogue = { version: number; settings: CatalogueSettings; concepts: Concept[] };

export const DEFAULT_SETTINGS: CatalogueSettings = { scope: "stage", maxPerSection: 12 };

export const COURSE_BASE = "/learn/system-design-mastery";

export const refHref = (r: ConceptRef) => `${COURSE_BASE}/${r.lesson}#${r.anchor}`;

/** "week-02-failure-first-design/day-02-…" → "W02 · Day 2"; side quests, capstones, previews and foundations too. */
export function refCode(lesson: string): string {
  const [folder = "", slug = ""] = lesson.split("/");
  if (folder === "bonus-problems") {
    const n = slug.match(/bonus-(\d+)/)?.[1];
    return n ? `SQ-${n.padStart(2, "0")}` : "Side quest";
  }
  const w = folder.match(/^week-(\d+)/)?.[1];
  const W = w ? `W${w.padStart(2, "0")}` : "";
  let what = "";
  let m: RegExpMatchArray | null;
  if ((m = slug.match(/^day-(\d+)/))) what = `Day ${parseInt(m[1], 10)}`;
  else if ((m = slug.match(/foundations-part-(\d+)/))) what = `Part ${m[1]}`;
  else if (slug.startsWith("capstone")) what = "Boss";
  else if (slug.includes("preview")) what = "Preview";
  return [W, what].filter(Boolean).join(" · ") || slug;
}

/* ------------------------------------------------------------------ matcher */

export type TermForm = { id: string; form: string; exact: boolean };

/** A word written as an acronym (CAP, WAL, mTLS, gRPC, HTTP/2, BM25): it must keep its capitals. */
const isAcronym = (word: string) => (word.match(/[A-Z]/g) || []).length >= 2;

/** A form with at least one acronym word: matched case-sensitively on those words. */
export function isExactForm(form: string): boolean {
  return form.split(/[\s-]+/).some(isAcronym);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Comparison key for a matched string: lowercase, spaces/hyphens/apostrophes normalised. */
export function formKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[\s\u00a0-]+/g, " ")
    .trim();
}

function formSource(form: string): string {
  return escapeRe(form.trim())
    .replace(/[\s-]+/g, "[\\s\\u00a0-]+")
    .replace(/'/g, "['’]");
}

type Candidate = { id: string; re: RegExp; exact: string | null; len: number };

/**
 * Forms indexed by their first word: scanning a text is one Map lookup per word plus a sticky regex
 * test for the few forms that start with it (one big alternation regex is far too slow on lessons).
 */
export type Matcher = { byFirst: Map<string, Candidate[]> };

const WORD = /[\p{L}\p{N}]+/gu;
const firstWord = (form: string) => (form.match(/[\p{L}\p{N}]+/u)?.[0] || "").toLowerCase();

export function conceptForms(c: Pick<Concept, "id" | "term" | "aliases">): TermForm[] {
  const seen = new Set<string>();
  const out: TermForm[] = [];
  for (const f of [c.term, ...c.aliases]) {
    const form = (f || "").trim();
    if (form.length < 2) continue;
    const k = formKey(form) + (isExactForm(form) ? `#${form}` : "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: c.id, form, exact: isExactForm(form) });
  }
  return out;
}

export function buildMatcher(forms: TermForm[]): Matcher | null {
  if (!forms.length) return null;
  const byFirst = new Map<string, Candidate[]>();
  const seen = new Set<string>();
  for (const f of forms) {
    const key = formKey(f.form) + (f.exact ? `#${f.form}` : "");
    if (seen.has(key)) continue;
    seen.add(key);
    const w = firstWord(f.form);
    if (!w) continue;
    // sticky and case-insensitive; optional plural; not followed by more word or a hyphenated compound
    const re = new RegExp(`(?:${formSource(f.form)})(?:es|s)?(?![\\p{L}\\p{N}_]|-[\\p{L}\\p{N}])`, "iuy");
    const list = byFirst.get(w) || [];
    list.push({ id: f.id, re, exact: f.exact ? f.form : null, len: f.form.length });
    byFirst.set(w, list);
  }
  byFirst.forEach((l) => l.sort((a, b) => b.len - a.len));
  return { byFirst };
}

/** An acronym word must keep its capitals ("CAP", not "cap"); other words ignore case. */
function exactOk(exact: string, hit: string): boolean {
  const want = exact.split(/[\s\u00a0-]+/);
  const got = hit.split(/[\s\u00a0-]+/);
  if (want.length !== got.length) return false;
  const last = got.length - 1;
  return want.every((w, i) => !isAcronym(w) || (i === last ? got[i].slice(0, w.length) : got[i]) === w);
}

export type Hit = { index: number; text: string; id: string };

/** Leftmost-longest, non-overlapping term hits in a text. */
export function findTerms(m: Matcher, text: string): Hit[] {
  const out: Hit[] = [];
  if (!text) return out;
  WORD.lastIndex = 0;
  for (let w = WORD.exec(text); w; w = WORD.exec(text)) {
    const at = w.index;
    // not the tail of a hyphenated compound ("non-idempotent"), not glued to "_"
    const prev = text[at - 1];
    if (prev === "_" || (prev === "-" && /[\p{L}\p{N}]/u.test(text[at - 2] || ""))) continue;
    const word = w[0].toLowerCase();
    const cands = m.byFirst.get(word) || (word.endsWith("es") ? m.byFirst.get(word.slice(0, -2)) : undefined) || (word.endsWith("s") ? m.byFirst.get(word.slice(0, -1)) : undefined);
    if (!cands) continue;
    for (const c of cands) {
      c.re.lastIndex = at;
      const hit = c.re.exec(text);
      if (!hit) continue;
      if (c.exact && !exactOk(c.exact, hit[0])) continue;
      out.push({ index: at, text: hit[0], id: c.id });
      WORD.lastIndex = at + hit[0].length;
      break;
    }
  }
  WORD.lastIndex = 0;
  return out;
}

/** Every concept id mentioned in a piece of text (used for quiz / trial / review attribution). */
export function conceptsIn(m: Matcher, text: string): Set<string> {
  return new Set(findTerms(m, text).map((h) => h.id));
}
