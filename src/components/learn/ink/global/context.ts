"use client";

/**
 * Which notebook page belongs to the page a learner is on. The Notebook panel opens on every /learn page (and the
 * case files), so it needs to know "where am I": the host derives that from the pathname, and the lesson reader
 * adds what the URL can't tell (the week's label and topic, for naming the notebook a new page goes in).
 *
 * Context keys (stored in notebook_pages.lesson_key, a free text column of up to 200 chars; no schema change):
 *   lesson reader pages   "<week>/<slug>"     lessons, previews, capstones, side quests, interview problems, LLD,
 *                                             and a lesson's revision deck (the same key as its lesson). Exactly the
 *                                             key used since the notebook shipped, and the one "Check against
 *                                             lesson" and "Save to notes" resolve against the course.
 *   other content         "<kind>/<id>"       war/<slug>, case/<slug>, lab/<id>, short/<id>, lecture/<slug>,
 *                                             concept/<id>, sheet/<slug>, cheatsheet/<week>, company/<slug>,
 *                                             design/<slug>, answer/<id>
 *   everything else       null                the hub, prep lists, the chat, dashboards: the panel opens the page
 *                                             used last, else the "Clips" inbox
 * The prefixes are never a week folder name ("week-…", "bonus-problems", "problem-bank", "low-level-design",
 * "overview"), so isLessonKey() tells the two apart.
 */
import { useSyncExternalStore } from "react";

export type InkContextKind = "lesson" | "war" | "case" | "lab" | "short" | "lecture" | "concept" | "sheet" | "cheatsheet" | "company" | "design" | "answer";

export type InkContext = {
  /** the lesson_key pages written here are tagged with; null on pages that aren't one piece of content */
  key: string | null;
  kind: InkContextKind | null;
  /** what a new page is called (the lesson / story / lab title) */
  title: string;
  /** the notebook a new page goes in */
  notebook: string;
  href: string;
};

/** The prefixes of non-lesson context keys. */
export const CONTEXT_PREFIXES = ["war", "case", "lab", "short", "lecture", "concept", "sheet", "cheatsheet", "company", "design", "answer"] as const;
const PREFIX_RE = new RegExp(`^(?:${CONTEXT_PREFIXES.join("|")})/`);

/** A course lesson's "<week>/<slug>" (what the lesson AI actions and content_notes understand), not another context. */
export const isLessonKey = (key: string | null | undefined): key is string => !!key && /^[A-Za-z0-9-]{1,120}\/[A-Za-z0-9-]{1,120}$/.test(key) && !PREFIX_RE.test(key);

const NOTEBOOK: Record<Exclude<InkContextKind, "lesson">, string> = {
  war: "War stories",
  case: "Case files",
  lab: "Code labs",
  short: "Shorts",
  lecture: "Lectures",
  concept: "Concepts",
  sheet: "Sheets",
  cheatsheet: "Cheat sheets",
  company: "Interview prep",
  design: "Design of the week",
  answer: "Interview prep",
};

/** Plain words for where a page was written, e.g. "War story", for the page switcher and cards. */
export const KIND_LABEL: Record<InkContextKind, string> = {
  lesson: "Lesson",
  war: "War story",
  case: "Case file",
  lab: "Code lab",
  short: "Short",
  lecture: "Lecture",
  concept: "Concept",
  sheet: "Design sheet",
  cheatsheet: "Cheat sheet",
  company: "Company prep",
  design: "Design of the week",
  answer: "Answer",
};

/** The page's own heading, else the document title without the site suffix. */
export function pageHeading(): string {
  if (typeof document === "undefined") return "";
  const h1 = document.querySelector("main h1, article h1, h1");
  const fromH1 = h1?.textContent?.replace(/\s+/g, " ").trim();
  if (fromH1 && fromH1.length <= 140) return fromH1.replace(/[.]$/, "");
  return (document.title || "").split(/\s+[|·]\s+/)[0].trim();
}

const RULES: [RegExp, InkContextKind | "lesson-revise"][] = [
  [/^\/learn\/war-stories\/war-room\/([^/]+)/, "war"],
  [/^\/learn\/war-stories\/(?!shorts(?:\/|$))([^/]+)/, "war"],
  [/^\/stories\/([^/]+)/, "case"],
  [/^\/learn\/labs\/([^/]+)/, "lab"],
  [/^\/learn\/shorts\/([^/]+)/, "short"],
  [/^\/learn\/lectures\/([^/]+)/, "lecture"],
  [/^\/learn\/concepts\/([^/]+)/, "concept"],
  [/^\/learn\/sheets\/([^/]+)/, "sheet"],
  [/^\/learn\/cheatsheet\/(?!all(?:\/|$))([^/]+)/, "cheatsheet"],
  [/^\/learn\/prep\/companies\/([^/]+)/, "company"],
  [/^\/learn\/design-week\/([^/]+)/, "design"],
  [/^\/learn\/answer\/([^/]+)/, "answer"],
];

/**
 * /learn/<course>/<week>/<slug>: a lesson reader page. Not the other three-level routes: a design-week entry, a
 * revision deck, the full-screen page editor, a company's prep page, a war room, a certificate print.
 */
export const isReaderRoute = (p: string) => /^\/learn\/(?!(?:design-week|revise|notebook|prep|war-stories|certificate|arena|mock|canvas|labs|shorts|lectures|concepts|sheets|cheatsheet|answer)\/)[^/]+\/[^/]+\/[^/]+/.test(p);

const safe = (s: string) => decodeURIComponent(s).replace(/[^A-Za-z0-9-]/g, "-").slice(0, 120);

/** "week-04-caching" → "Week 04"; the reader publishes the exact label, this is the fallback. */
function weekName(week: string): string {
  const n = week.match(/^week-(\d+)/)?.[1];
  if (n) return `Week ${n.padStart(2, "0")}`;
  if (week === "bonus-problems") return "Side quests";
  if (week === "problem-bank") return "Interview problems";
  if (week === "low-level-design") return "Low-level design";
  return "Lessons";
}

/** The context of a path (the title is read from the page when the panel opens). */
export function contextFor(pathname: string, lesson?: LessonContext | null): InkContext {
  const p = pathname.replace(/\/+$/, "") || "/";
  const title = pageHeading();
  const base = { href: p, title };
  const reader = p.match(/^\/learn\/[^/]+\/([^/]+)\/([^/]+)/);
  if (reader && isReaderRoute(p)) {
    const [week, slug] = [safe(reader[1]), safe(reader[2])];
    const key = `${week}/${slug}`;
    if (lesson && lesson.key === key) return { ...base, key, kind: "lesson", title: lesson.title || title, notebook: lesson.notebook };
    return { ...base, key, kind: "lesson", notebook: weekName(week) };
  }
  const revise = p.match(/^\/learn\/revise\/([^/]+)\/([^/]+)/);
  if (revise) return { ...base, key: `${safe(revise[1])}/${safe(revise[2])}`, kind: "lesson", title: title.replace(/^Revise:?\s*/i, ""), notebook: weekName(safe(revise[1])) };
  for (const [re, kind] of RULES) {
    const m = p.match(re);
    if (m && kind !== "lesson-revise") return { ...base, key: `${kind}/${safe(m[1])}`, kind, notebook: NOTEBOOK[kind as Exclude<InkContextKind, "lesson">] };
  }
  return { ...base, key: null, kind: null, notebook: "" };
}

/** Where a page's lesson_key points back to, for the page switcher and the notebook's page cards. */
export function describeKey(key: string | null | undefined): { kind: InkContextKind; label: string; short: string } | null {
  if (!key) return null;
  const [prefix, id] = key.split("/");
  if (!id) return null;
  if (!isLessonKey(key)) {
    const kind = prefix as InkContextKind;
    if (!(kind in KIND_LABEL)) return null;
    return { kind, label: `${KIND_LABEL[kind]} · ${humanize(id)}`, short: KIND_LABEL[kind] };
  }
  const n = prefix.match(/^week-(\d+)/)?.[1];
  const where = n ? `W${n.padStart(2, "0")}` : prefix === "problem-bank" ? "Problem" : prefix === "low-level-design" ? "LLD" : prefix === "bonus-problems" ? "Side quest" : "Lesson";
  return { kind: "lesson", label: `${where} · ${humanize(id)}`, short: where };
}

const humanize = (s: string) => {
  const t = s.replace(/^(?:day-\d+-|part-\d+-|bonus-\d+-|problem-\d+-|lld-\d+-)/, "").replace(/-/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : s;
};

// ------------------------------------------------------------------ what the lesson reader adds

export type LessonContext = { key: string; title: string; notebook: string };

let lessonCtx: LessonContext | null = null;
const subs = new Set<() => void>();
export function publishLessonContext(c: LessonContext | null) {
  lessonCtx = c;
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const useLessonContext = () =>
  useSyncExternalStore(
    subscribe,
    () => lessonCtx,
    () => null,
  );

// ------------------------------------------------------------------ where the panel and the button hide

/**
 * No notebook here: the full-screen page editor and the notebook itself, the Shorts feed, and the full-screen tools
 * (the design canvas, a mock interview room, an Arena game), as the chat button does.
 */
export const NO_NOTEBOOK = /^\/learn\/(?:notebook(?:\/|$)|shorts$|canvas\/|papers\/[^/]+|mock\/(?!peers)[^/]+|arena\/(?!leaderboard|daily)[^/]+)/;
export const notebookAllowed = (p: string) => !NO_NOTEBOOK.test(p) && (p === "/learn" || p.startsWith("/learn/") || /^\/stories\/[^/]+/.test(p));

/** The floating pen: everywhere the panel is, except where the page brings its own Notebook button (the lesson reader's tools). */
export const showPenButton = (p: string) => notebookAllowed(p) && !isReaderRoute(p);

// ------------------------------------------------------------------ small shared memory (this device)

export const LAST_PAGE = "hk.ink.last";
export const lastForKey = (key: string) => `hk.ink.lesson:${key}`;
export function readLS(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
export function writeLS(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    // private mode / blocked storage: the panel still works, it just won't remember
  }
}

/** Close the panel (the pen button toggles it; Esc closes it). */
export const NOTEBOOK_CLOSE = "hk:notebook-close";
export const closeNotebookPanel = () => window.dispatchEvent(new Event(NOTEBOOK_CLOSE));

/** Is the panel open? (html.hk-nb-open, set by the panel) */
const subscribeOpen = (f: () => void) => {
  const mo = new MutationObserver(f);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
};
export const useNotebookOpen = () =>
  useSyncExternalStore(
    subscribeOpen,
    () => document.documentElement.classList.contains("hk-nb-open"),
    () => false,
  );
