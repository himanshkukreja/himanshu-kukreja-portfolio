/**
 * Offline reading: what can be saved (the catalog, built on the server from the real content) and
 * what a saved article looks like in this browser (SavedMeta, kept in Cache Storage `hk-meta`).
 * Plain JSON on both sides.
 */

export type OfflineKind = "hub" | "plan" | "lesson" | "preview" | "capstone" | "sidequest" | "trial" | "mock" | "story";

export type CatalogItem = {
  /** path, e.g. /learn/system-design-mastery/week-02-…/day-03-circuit-breakers */
  url: string;
  title: string;
  kind: OfflineKind;
  /** short tag: "W02 · DAY 03", "SQ-04", "CASE-007" */
  tag: string;
  /** group id: "course", a week key, "side-quests", "mocks", "case-files" */
  group: string;
  /** source content hash: a saved copy with another version has an update */
  version: string;
  /** estimated storage once saved (gzip HTML + images), bytes */
  bytes: number;
  /** extra URLs saved with it (a trial's ?part=N pages) */
  variants?: string[];
};

export type CatalogGroup = {
  id: string;
  title: string;
  kind: "course" | "world" | "side-quests" | "mocks" | "case-files";
  items: CatalogItem[];
};

export type Catalog = {
  course: string;
  /** build that answered (saved pages remember theirs) */
  build: string;
  generatedAt: number;
  /** estimated reader app files (JS, CSS, fonts, diagram renderer), shared by every saved page */
  appBytes: number;
  groups: CatalogGroup[];
};

export type SavedMeta = {
  url: string;
  title: string;
  kind: OfflineKind;
  tag: string;
  group: string;
  groupTitle: string;
  version: string;
  variants?: string[];
  /** build that rendered the saved HTML (its app files are kept while this copy exists) */
  build: string;
  savedAt: number;
  updatedAt: number;
  /** stored bytes of this article's documents + images */
  size: number;
  /** /_next/static/** files it needs */
  assets: string[];
  /** images it needs (same-origin paths or absolute URLs) */
  media: string[];
};

export const OFFLINE_CACHES = {
  pages: "hk-pages",
  meta: "hk-meta",
  static: "hk-static",
  media: "hk-media",
} as const;

/** A saved page is reachable at these app routes (kept in sync with ARTICLE in public/sw.js). */
export const SAVEABLE_PATH = /^\/learn\/[^/]+\/[^/]+\/[^/]+\/?$|^\/learn\/mock\/[^/]+\/?$|^\/stories\/[^/]+\/?$|^\/learn\/system-design-mastery\/?$/;
