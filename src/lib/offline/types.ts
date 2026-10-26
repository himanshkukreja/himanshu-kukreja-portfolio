/**
 * Offline reading: what can be saved (the catalog, built on the server from the real content) and
 * what a saved article looks like in this browser (SavedMeta, kept in Cache Storage `hk-meta`).
 * Plain JSON on both sides.
 */

export type OfflineKind =
  | "hub"
  | "plan"
  | "lesson"
  | "preview"
  | "capstone"
  | "sidequest"
  | "problem"
  | "lld"
  | "trial"
  | "mock"
  | "story"
  | "warstory"
  | "lecture"
  | "revision"
  | "cheatsheet"
  | "lab"
  | "tool";

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
  /** extra URLs saved with it (a trial's ?part=N pages, a world deck's lesson decks) */
  variants?: string[];
  /** lectures: the folder of its recorded media ("<base>/<id>/", absolute or same-origin), saved with the page */
  mediaBase?: string;
  /** lectures: the page it teaches (lesson, side quest, problem, case file, mock) */
  subject?: string;
  /** lectures: running time */
  minutes?: number;
};

export type CatalogGroup = {
  id: string;
  title: string;
  kind: "course" | "world" | "side-quests" | "problems" | "lld" | "mocks" | "case-files" | "war-stories" | "lectures";
  items: CatalogItem[];
};

export type Catalog = {
  course: string;
  /** build that answered (saved pages remember theirs) */
  build: string;
  generatedAt: number;
  /** estimated reader app files (JS, CSS, fonts, diagram renderer), shared by every saved page */
  appBytes: number;
  /** code labs' Python runtime (Pyodide), stored once with the first saved lab */
  runtimeBytes?: number;
  /** lectures' background music: the same file for every lecture, stored once (lecture `bytes` leave it out) */
  lectureSharedBytes?: number;
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
  /** code labs: the Python runtime files it runs on (kept in hk-runtime while this copy exists) */
  runtime?: string[];
  /** images it needs (same-origin paths or absolute URLs); lectures: also their media files' keys in hk-media */
  media: string[];
  /** lectures: the stored media files (content-addressed keys in hk-media, shared files stored once) */
  files?: { url: string; key: string; bytes: number }[];
  /** lectures: the page it teaches, and its running time */
  subject?: string;
  minutes?: number;
};

export const OFFLINE_CACHES = {
  pages: "hk-pages",
  meta: "hk-meta",
  static: "hk-static",
  media: "hk-media",
  runtime: "hk-runtime",
} as const;

/**
 * A saved page is reachable at these app routes (kept in sync with ARTICLE in public/sw.js, which
 * leaves out only the course map: it is answered by its own HUB rule there).
 */
export const SAVEABLE_PATH =
  /^\/learn\/[^/]+\/[^/]+\/[^/]+\/?$|^\/learn\/mock\/[^/]+\/?$|^\/learn\/(?:revise|cheatsheet)\/[^/]+\/?$|^\/learn\/labs(?:\/[^/]+)?\/?$|^\/learn\/(?:numbers|plan|practice|reading|revise|mock|mastery|prep)\/?$|^\/learn\/lectures\/[^/]+\/?$|^\/learn\/war-stories(?:\/[^/]+)?\/?$|^\/stories\/[^/]+\/?$|^\/learn\/system-design-mastery\/?$/;

/** A lecture's recorded media file (any origin): the service worker answers saved ones from hk-media. */
export const LECTURE_FILE = /\/[A-Za-z0-9-]+\/(?:media\.json|narration\.mp3|music\.mp3|captions\.vtt|poster\.jpg|chapters\.json)$/;
