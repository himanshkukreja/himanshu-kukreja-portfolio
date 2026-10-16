/**
 * Case files CMS: shapes shared by the admin UI (client), the API routes and the store (server).
 * Client-safe: no server imports.
 *
 * A row has WORKING fields (what the editor autosaves) and, once published, a LIVE snapshot
 * (`live`) that the public site reads. Editing a published case file never changes the live page
 * until "Update live" (publish) copies the working fields into `live` again.
 */
import type { CaseActivityData } from "@/components/stories/activities/data";
import type { CaseType, Debrief } from "@/components/stories/case-types";

export type CaseFileStatus = "draft" | "published" | "archived";

/** Everything the editor edits (and the live snapshot holds). */
export type CaseFileFields = {
  slug: string;
  title: string;
  excerpt: string;
  type: CaseType;
  tags: string[];
  /** "Opened" date shown on the case file, YYYY-MM-DD */
  date: string;
  coverUrl: string;
  coverAlt: string;
  motionCoverUrl: string;
  bodyMd: string;
  debrief: Debrief | null;
  activity: CaseActivityData | null;
  seoTitle: string;
  seoDescription: string;
};

export type CaseFileRow = CaseFileFields & {
  id: string;
  status: CaseFileStatus;
  /** imported from content/stories/<slug>.md: when published it replaces the repo version */
  overridesFile: boolean;
  /** assigned at first publish (CASE-0NN), never reused */
  caseNumber: number | null;
  publishedAt: string | null;
  lastPublishedAt: string | null;
  archivedAt: string | null;
  version: number;
  /** working version that `live` was copied from */
  liveVersion: number | null;
  live: CaseFileFields | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RevisionAction = "create" | "save" | "autosave" | "publish" | "unpublish" | "archive" | "restore" | "import" | "revert" | "duplicate";

export type CaseFileRevision = {
  id: string;
  caseFileId: string;
  version: number;
  action: RevisionAction;
  snapshot: CaseFileFields;
  createdBy: string | null;
  createdAt: string;
};

export type ProblemLevel = "error" | "warning";
export type ProblemArea = "details" | "body" | "debrief" | "activity" | "seo";

export type Problem = {
  level: ProblemLevel;
  area: ProblemArea;
  /** field name in the form (title, excerpt, coverUrl…) when the problem is about one */
  field?: string;
  /** 1-based line in the markdown body */
  line?: number;
  /** stable rule id (e.g. "mermaid-parse", "excerpt-length") */
  rule: string;
  message: string;
};

export type Validation = {
  ok: boolean;
  errors: number;
  warnings: number;
  problems: Problem[];
  stats: { words: number; minutes: number; chapters: number; diagrams: number; blocks: number; images: number };
  at: string;
};

/** One row of the admin list: CMS rows and the repo's markdown stories side by side. */
export type CaseFileListItem = {
  /** CMS row id, or "file:<slug>" for a repo story */
  id: string;
  origin: "db" | "file";
  slug: string;
  title: string;
  status: CaseFileStatus | "repo";
  type: CaseType;
  caseId: string | null;
  date: string | null;
  cover: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  version: number | null;
  /** the working copy differs from the live snapshot */
  unpublishedChanges: boolean;
  /** published at least once (its case number is public and can't be freed) */
  everPublished: boolean;
  /** CMS row that overrides this repo story / repo story this CMS row overrides */
  overrides: boolean;
  overriddenBy: string | null;
  views: number | null;
  uniqueViews: number | null;
  errors: number | null;
  warnings: number | null;
};

export type CaseFilesSetup = {
  store: "supabase" | "file";
  ready: boolean;
  missing: string[];
  bucket: string;
  storage: "supabase" | "local";
};

export type CaseFilesList = { setup: CaseFilesSetup; items: CaseFileListItem[]; nextCaseId: string };

export type CaseFileDetail = { row: CaseFileRow; validation: Validation; caseId: string | null; setup: CaseFilesSetup };

export type RenderResult = {
  html: string;
  checkpoints: { id: string; label: string }[];
  minutes: number;
  caseId: string;
  validation: Validation;
};

export const EMPTY_FIELDS: CaseFileFields = {
  slug: "",
  title: "",
  excerpt: "",
  type: "incident",
  tags: [],
  date: "",
  coverUrl: "",
  coverAlt: "",
  motionCoverUrl: "",
  bodyMd: "",
  debrief: null,
  activity: null,
  seoTitle: "",
  seoDescription: "",
};

export const FIELD_KEYS = Object.keys(EMPTY_FIELDS) as (keyof CaseFileFields)[];

/** Same working copy as the live one? (drives the "unpublished changes" badge) */
export function sameFields(a: CaseFileFields | null, b: CaseFileFields | null): boolean {
  if (!a || !b) return false;
  return FIELD_KEYS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

/** "the-great-id-crisis" from any title. */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .reduce<{ s: string; full: boolean }>(
      (acc, word) => (acc.full ? acc : !acc.s ? { s: word.slice(0, 80), full: word.length >= 80 } : acc.s.length + 1 + word.length <= 80 ? { s: `${acc.s}-${word}`, full: false } : { s: acc.s, full: true }),
      { s: "", full: false }
    ).s;
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Paths under /stories that are not case files (or must never become one). */
export const RESERVED_SLUGS = new Set(["new", "preview", "frame", "index", "feed", "rss", "admin", "api", "draft", "drafts", "archive", "page"]);

export const UPLOAD_LIMITS = {
  /** bytes */
  image: 6 * 1024 * 1024,
  motion: 1024 * 1024,
  types: ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"],
  motionTypes: ["image/svg+xml"],
} as const;

export const PREVIEW_HEADER = "x-hk-admin-preview";
