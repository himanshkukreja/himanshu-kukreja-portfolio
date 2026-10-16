// Client-safe types and helpers for the "Case files" (stories) section.
// Server-only loading lives in ./case-files.ts.

export type CaseType = "incident" | "design" | "build";

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  incident: "Incident",
  design: "System design",
  build: "Build log",
};

/** Fallback type map, used when a story has no `type` frontmatter field. */
const TYPE_BY_SLUG: Record<string, CaseType> = {
  "cdn-cache-poisoning-disaster": "incident",
  "integer-overflow-auto-increment-crisis": "incident",
  "leader-follower-replication-node-outages": "incident",
  "distributed-transactions-2pc-saga-pattern": "incident",
  "ios-bridge-cross-platform-streaming": "build",
  "bridgelink-remote-android-testing": "build",
};

const TYPE_ALIASES: Record<string, CaseType> = {
  incident: "incident",
  incidents: "incident",
  design: "design",
  "system design": "design",
  "system-design": "design",
  build: "build",
  "build log": "build",
  "build-log": "build",
  buildlog: "build",
};

export function resolveCaseType(slug: string, frontmatterType?: unknown): CaseType {
  if (typeof frontmatterType === "string") {
    const t = TYPE_ALIASES[frontmatterType.trim().toLowerCase()];
    if (t) return t;
  }
  return TYPE_BY_SLUG[slug] || "design";
}

export const WORDS_PER_MINUTE = 220;

export function readMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function formatCaseId(n: number): string {
  return `CASE-${String(n).padStart(3, "0")}`;
}

type Dated = { slug: string; date?: string };

function time(d?: string): number {
  const t = d ? new Date(d).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/** CASE ids are assigned by date ascending (oldest = CASE-001); same-day ties break on slug. */
export function assignCaseIds<T extends Dated>(list: T[]): Map<string, string> {
  const asc = [...list].sort((a, b) => time(a.date) - time(b.date) || a.slug.localeCompare(b.slug));
  return new Map(asc.map((s, i) => [s.slug, formatCaseId(i + 1)]));
}

/** Newest first, same ordering rule as the ids (reverse). */
export function sortNewestFirst<T extends Dated>(list: T[]): T[] {
  return [...list].sort((a, b) => time(b.date) - time(a.date) || b.slug.localeCompare(a.slug));
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function parts(d?: string): { y: number; m: number; day: number } | null {
  if (!d) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (iso) return { y: +iso[1], m: +iso[2] - 1, day: +iso[3] };
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), day: t.getUTCDate() };
}

/** "AUG 2026" — the ledger's Opened column. */
export function formatMonthYear(d?: string): string {
  const p = parts(d);
  return p ? `${MONTHS[p.m]} ${p.y}` : "—";
}

/** "AUG 5, 2026" — case headers. */
export function formatLongDate(d?: string): string {
  const p = parts(d);
  return p ? `${MONTHS[p.m]} ${p.day}, ${p.y}` : "";
}

export type CaseFile = {
  slug: string;
  caseId: string;
  title: string;
  excerpt?: string;
  cover?: string;
  /** CMS case files: the cover's alt text (repo stories use the title) */
  coverAlt?: string;
  /** CMS case files: explicit animated cover layer (repo covers derive /covers/<name>.motion.svg) */
  motionCover?: string;
  date?: string;
  tags: string[];
  type: CaseType;
  mins: number;
  hasDebrief: boolean;
  /** repo markdown or the admin CMS */
  origin?: "file" | "db";
};

export type Debrief = {
  question: string;
  options: string[];
  answer: number;
  explain?: string;
};

export function parseDebrief(raw: unknown): Debrief | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const options = Array.isArray(r.options) ? r.options.filter((o): o is string => typeof o === "string" && !!o.trim()) : [];
  const answer = typeof r.answer === "number" ? r.answer : Number(r.answer);
  if (typeof r.question !== "string" || !r.question.trim() || options.length < 2) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
  return {
    question: r.question.trim(),
    options,
    answer,
    explain: typeof r.explain === "string" ? r.explain.trim() : undefined,
  };
}

export const READ_FLAG = "readStories";
export const SAVED_FLAG = "savedStories";
export const DEBRIEF_FLAG = "storyDebriefs";

export function flagList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export const TATKAL_SLUG = "irctc-tatkal-500-seats-2-million-users";
