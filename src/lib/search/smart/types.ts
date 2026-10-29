/**
 * Smart search (/learn/search): one index over everything the course has, ranked with BM25 plus a
 * system-design synonym map, and an optional AI learning path chosen only from the ranked candidates.
 * Pure types and labels, shared by the index route, the query route, the AI route, the page and the eval.
 */

export const KINDS = [
  "lesson",
  "section",
  "lecture",
  "moment",
  "short",
  "quest",
  "problem",
  "lld",
  "case",
  "mock",
  "war",
  "concept",
  "faq",
  "lfaq",
  "lab",
  "drill",
  "sheet",
  "card",
  "trail",
  "company",
] as const;
export type Kind = (typeof KINDS)[number];

/** Group labels (plural) and the one-word tag a result carries. */
export const KIND_LABEL: Record<Kind, { group: string; tag: string }> = {
  lesson: { group: "Lessons", tag: "Lesson" },
  section: { group: "Inside lessons", tag: "Section" },
  lecture: { group: "Lectures", tag: "Lecture" },
  moment: { group: "Lecture moments", tag: "Moment" },
  short: { group: "Shorts", tag: "Short" },
  quest: { group: "Side quests", tag: "Side quest" },
  problem: { group: "Interview problems", tag: "Problem" },
  lld: { group: "LLD rounds", tag: "LLD" },
  case: { group: "Case files", tag: "Case file" },
  mock: { group: "Mock interviews", tag: "Mock" },
  war: { group: "War stories", tag: "War story" },
  concept: { group: "Concepts", tag: "Concept" },
  faq: { group: "Lesson FAQs", tag: "FAQ" },
  lfaq: { group: "Lecture FAQs", tag: "Lecture FAQ" },
  lab: { group: "Code labs", tag: "Lab" },
  drill: { group: "Follow-up drills", tag: "Drill" },
  sheet: { group: "Design sheets", tag: "Sheet" },
  card: { group: "Revision cards", tag: "Revision card" },
  trail: { group: "Reading trail", tag: "Reading" },
  company: { group: "Companies", tag: "Company" },
};

/**
 * One searchable thing. `sub` is its place in the course ("W04 · Day 3 · Thundering Herd"), `summary` the
 * line a result shows, `text` what is scored (kept on the server), `kw` extra keywords (aliases, focus
 * areas), `gate` a publishing-control key (quest:<slug> / short:<id>) checked again at query time, `rel`
 * ids of resources this one points at (a company's study path, a concept's lesson section), `at` the
 * second a lecture moment starts (-1 = none).
 */
export type Doc = {
  id: string;
  kind: Kind;
  title: string;
  sub: string;
  href: string;
  summary: string;
  text: string;
  kw: string;
  gate: string;
  rel: string[];
  /** the lesson a section, FAQ, drill, revision card or reading-trail entry sits in; the lecture a moment or lecture FAQ belongs to */
  parent: string;
  at: number;
};

/**
 * The index parts, each served by /api/search/index/<part> (see build.ts for what each holds). Here, not
 * in build.ts, so scripts that can't import server code (the eval) can list them too.
 */
export const INDEX_PARTS = ["a", "b", "c", "d", "e"] as const;
export type IndexPart = (typeof INDEX_PARTS)[number];

/** Wire format of /api/search/index (arrays, not objects: it is ~2-3 MB). */
export type DocRow = [id: string, kind: Kind, title: string, sub: string, href: string, summary: string, text: string, kw: string, gate: string, rel: string[], parent: string];
/** `syn`: synonym groups from the concept catalogue (a term and its aliases), added to the curated map. */
export type DocIndex = { v: 1; built: string; d: DocRow[]; syn: string[][] };

export const rowToDoc = (r: DocRow): Doc => ({ id: r[0], kind: r[1], title: r[2], sub: r[3], href: r[4], summary: r[5], text: r[6], kw: r[7], gate: r[8], rel: r[9] ?? [], parent: r[10] ?? "", at: -1 });
export const docToRow = (d: Doc): DocRow => [d.id, d.kind, d.title, d.sub, d.href, d.summary, d.text, d.kw, d.gate, d.rel, d.parent];

/** A result as the page shows it (no body text). */
export type Hit = { id: string; kind: Kind; title: string; sub: string; href: string; summary: string; at: number; score: number };

/** GET /api/search/smart?q= */
export type SmartResults = {
  q: string;
  /** the words searched after stop words, typo fixes and synonyms (for "searched for …") */
  terms: string[];
  fixes: { from: string; to: string }[];
  expanded: string[];
  /** a question or a plain-English ask: the page offers (or starts) the learning path */
  natural: boolean;
  /** what the query asks for besides its topic: video, quick, interview, practice, revise, real, lld, beginner */
  intents: string[];
  /** only passing mentions matched: the course may not cover this */
  weak: boolean;
  groups: { kind: Kind; hits: Hit[] }[];
  total: number;
  ms: number;
  built: string;
};

/** One step of the AI learning path, resolved against the index (never a link the model wrote). */
export type PathStep = Hit & { why: string };
/** POST /api/learn/ai/search */
export type SmartAnswer = {
  /** what the learner is after, in a line */
  intent: string;
  /** "covered": the course teaches it · "partial": only nearby topics · "off_topic": not system design */
  scope: "covered" | "partial" | "off_topic";
  /** for partial / off_topic: an honest line about what the course does and doesn't have */
  note: string;
  path: PathStep[];
  quick: PathStep | null;
  /** answered from the per-query cache (no credits used) */
  cached: boolean;
  creditsLeft?: number | null;
};
