/**
 * Reading modes (Kindle-style): the colour mode, font, text size, line spacing and page width a learner
 * picks in the reader's "Aa" panel (components/learn/reading/ReadingPanel).
 *
 * - Reading routes only (lessons, side quests, problem bank, LLD, case files, war stories, papers,
 *   revision, cheat sheets, mock interviews): every other page keeps the site's light/dark theme.
 * - The mode is a token set in globals.css under html[data-read-mode="<mode>"]; everything built on the
 *   --c-* tokens follows. The html `dark` class is the page's tone: on a reading route it follows the
 *   mode (dusk and night are dark, the rest light), elsewhere the site theme (next-themes keeps that in
 *   html[data-theme], src/components/ThemeProvider.tsx). So `dark:` variants, `.dark` rules, mermaid and
 *   the code palette all match the mode too.
 * - Saved in this browser (localStorage, read before paint by READING_JS in <head>); signed-in learners
 *   also carry it in their game flags (READING_FLAG), so it follows the account.
 * - Going site-wide later: widen READING_ROUTE (or drop the route check) and the tokens already apply.
 */
import { CONTENT_AREA, COURSE_ID, cleanPath } from "./paths";

export type ReadMode = "site" | "light" | "sepia" | "paper" | "mint" | "dusk" | "night";
export type ReadFont = "sans" | "serif";
export type ReadLeading = "compact" | "normal" | "relaxed";
export type ReadWidth = "narrow" | "normal" | "wide";

export type ReadingSettings = {
  mode: ReadMode;
  font: ReadFont;
  /** px, one of TEXT_SIZES */
  size: number;
  leading: ReadLeading;
  width: ReadWidth;
  /** epoch ms of the last change (0: never changed); the newer copy wins across devices */
  updatedAt: number;
};

/** Text size steps (px); the reader's "Aa" cycled these before the panel. */
export const TEXT_SIZES = [17, 19, 21] as const;

/** Today's size key, kept so sizes saved before the panel carry over. */
export const SIZE_KEY = "hk.reader.size";
/** The rest of the settings (mode, font, spacing, width), JSON. */
export const LOOK_KEY = "hk.reader.look";
/** Game flag carrying the settings to the account (src/lib/learn/saved-paths.ts mergeGameFlags: newer wins). */
export const READING_FLAG = "pref:reader";

export const DEFAULT_READING: ReadingSettings = { mode: "site", font: "sans", size: TEXT_SIZES[0], leading: "normal", width: "normal", updatedAt: 0 };

type ModeInfo = {
  id: Exclude<ReadMode, "site">;
  name: string;
  dark: boolean;
  /** preview colours for the panel swatches and the browser chrome (keep in sync with globals.css) */
  bg: string;
  fg: string;
  accent: string;
};

export const READ_MODES: ModeInfo[] = [
  { id: "light", name: "Light", dark: false, bg: "#F5F4F0", fg: "#0B0B0B", accent: "#C2410C" },
  { id: "paper", name: "Paper", dark: false, bg: "#F7F3EA", fg: "#222018", accent: "#B04A10" },
  { id: "sepia", name: "Sepia", dark: false, bg: "#F4ECD8", fg: "#3B2F20", accent: "#9A4A12" },
  { id: "mint", name: "Mint", dark: false, bg: "#E6EEDF", fg: "#23301F", accent: "#94420E" },
  { id: "dusk", name: "Dusk", dark: true, bg: "#23201C", fg: "#D9CFBF", accent: "#E0965A" },
  { id: "night", name: "Night", dark: true, bg: "#000000", fg: "#F3F2EE", accent: "#FF6B2B" },
];

export const FONTS: { id: ReadFont; name: string }[] = [
  { id: "sans", name: "Sans" },
  { id: "serif", name: "Serif" },
];
export const LEADINGS: { id: ReadLeading; name: string }[] = [
  { id: "compact", name: "Compact" },
  { id: "normal", name: "Normal" },
  { id: "relaxed", name: "Relaxed" },
];
export const WIDTHS: { id: ReadWidth; name: string }[] = [
  { id: "narrow", name: "Narrow" },
  { id: "normal", name: "Normal" },
  { id: "wide", name: "Wide" },
];

/** The site theme's browser-chrome colours (light is the default theme). */
export const SITE_CHROME = { light: "#F5F4F0", dark: "#000000" } as const;

const MODE_IDS = new Set<string>(["site", ...READ_MODES.map((m) => m.id)]);
const pick = <T extends string>(v: unknown, list: { id: T }[], fallback: T): T => (list.some((x) => x.id === v) ? (v as T) : fallback);

/** A stored or synced value → valid settings (anything unknown falls back to the default). */
export function cleanReading(raw: unknown, size?: unknown): ReadingSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = Number(size ?? o.size);
  return {
    mode: MODE_IDS.has(o.mode as string) ? (o.mode as ReadMode) : DEFAULT_READING.mode,
    font: pick(o.font, FONTS, DEFAULT_READING.font),
    size: (TEXT_SIZES as readonly number[]).includes(n) ? n : DEFAULT_READING.size,
    leading: pick(o.leading, LEADINGS, DEFAULT_READING.leading),
    width: pick(o.width, WIDTHS, DEFAULT_READING.width),
    updatedAt: Number(o.updatedAt) || 0,
  };
}

export const sameReading = (a: ReadingSettings, b: ReadingSettings) =>
  a.mode === b.mode && a.font === b.font && a.size === b.size && a.leading === b.leading && a.width === b.width;

// ---- the reading routes ----------------------------------------------------------------------------

const AREA = CONTENT_AREA.source.replace(/^\^|\$$/g, "");

/**
 * Clean course paths that are reading pages: a lesson / side quest / problem / LLD page, a case file, a war
 * story, a written paper, a revision deck, a cheat sheet or sheet, a mock interview.
 */
export const READING_ROUTE = new RegExp(
  `^/(?:${AREA}/[^/]+|case-files/(?!feed\\.xml$)[^/]+|war-stories/(?!(?:war-room|shorts)(?:/|$))[^/]+|papers/[^/]+|revise/[^/]+(?:/[^/]+)?|cheatsheet/[^/]+|sheets/[^/]+|mock/(?!peers(?:/|$))[^/]+)/?$`
);

export const isReadingPath = (path: string | null | undefined) => !!path && READING_ROUTE.test(cleanPath(path).replace(/[?#].*$/, ""));

// ---- storage -----------------------------------------------------------------------------------------

const listeners = new Set<() => void>();
let cached: { look: string | null; size: string | null; value: ReadingSettings } | null = null;

/** The saved settings (defaults when storage is unavailable). Stable between changes (useSyncExternalStore). */
export function readReading(): ReadingSettings {
  let look: string | null = null;
  let size: string | null = null;
  try {
    look = window.localStorage.getItem(LOOK_KEY);
    size = window.localStorage.getItem(SIZE_KEY);
  } catch {
    // storage unavailable: defaults
  }
  if (cached && cached.look === look && cached.size === size) return cached.value;
  let raw: unknown = null;
  try {
    raw = look ? JSON.parse(look) : null;
  } catch {
    raw = null;
  }
  cached = { look, size, value: cleanReading(raw, size ?? undefined) };
  return cached.value;
}

/** Saves settings (a change from the panel stamps updatedAt; a copy synced from the account keeps its own). */
export function writeReading(next: ReadingSettings) {
  const { size, ...look } = next;
  try {
    window.localStorage.setItem(LOOK_KEY, JSON.stringify(look));
    window.localStorage.setItem(SIZE_KEY, String(size));
  } catch {
    // storage unavailable: the change still applies to this page
    cached = { look: JSON.stringify(look), size: String(size), value: next };
  }
  listeners.forEach((l) => l());
}

/** One change from the panel: merged into the saved settings and stamped. */
export function updateReading(patch: Partial<Omit<ReadingSettings, "updatedAt">>) {
  writeReading({ ...readReading(), ...patch, updatedAt: Date.now() });
}

export function resetReading() {
  writeReading({ ...DEFAULT_READING, updatedAt: Date.now() });
}

export function subscribeReading(cb: () => void) {
  listeners.add(cb);
  // another tab changed them
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOOK_KEY || e.key === SIZE_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

// ---- the page --------------------------------------------------------------------------------------

/** Is the page dark? A reading route follows its mode; "site" (and every other page) the site theme. */
export function pageIsDark(reading: boolean, s: ReadingSettings, siteDark: boolean): boolean {
  if (!reading || s.mode === "site") return siteDark;
  return READ_MODES.find((m) => m.id === s.mode)?.dark ?? siteDark;
}

/** The browser chrome colour (meta theme-color) for the page as it is now. */
export function chromeColor(root: HTMLElement = document.documentElement): string {
  const mode = READ_MODES.find((m) => m.id === root.dataset.readMode);
  if (mode) return mode.bg;
  return root.classList.contains("dark") ? SITE_CHROME.dark : SITE_CHROME.light;
}

/** Puts the settings on <html> (READING_JS does the same before paint; keep the two in step). */
export function applyReading(reading: boolean, s: ReadingSettings, siteDark: boolean) {
  const root = document.documentElement;
  const on = (name: string, value: string | null) => (value ? root.setAttribute(name, value) : root.removeAttribute(name));
  root.classList.toggle("dark", pageIsDark(reading, s, siteDark));
  on("data-read-mode", reading && s.mode !== "site" ? s.mode : null);
  on("data-read-font", reading && s.font !== "sans" ? s.font : null);
  on("data-read-leading", reading && s.leading !== "normal" ? s.leading : null);
  on("data-read-width", reading && s.width !== "normal" ? s.width : null);
  if (reading) {
    root.style.setProperty("--reader-size", `${s.size}px`);
    // readers with their own base size (case files: 19px) step up from it instead
    root.style.setProperty("--reader-bump", `${s.size - TEXT_SIZES[0]}px`);
  } else {
    root.style.removeProperty("--reader-size");
    root.style.removeProperty("--reader-bump");
  }
}

/**
 * Plain ES2017, second in <head> (after IMPORT_JS): the page's tone and the saved reading settings on
 * <html> before first paint, and the browser chrome colour to match. The site theme is next-themes'
 * localStorage("theme"), light by default.
 */
export const READING_JS = `(function(){try{
var r=document.documentElement,ls=window.localStorage,dark=false,s={},size=0;
try{dark=ls.getItem("theme")==="dark";s=JSON.parse(ls.getItem(${JSON.stringify(LOOK_KEY)})||"{}")||{};size=Number(ls.getItem(${JSON.stringify(SIZE_KEY)}))}catch(e){}
var p=location.pathname.replace(/^\\/learn\\/${COURSE_ID}(?=\\/|$)/,"").replace(/^\\/learn(?=\\/|$)/,"").replace(/^\\/stories(?=\\/|$)/,"/case-files")||"/";
var read=${READING_ROUTE.toString()}.test(p);
var modes=${JSON.stringify(Object.fromEntries(READ_MODES.map((m) => [m.id, [m.dark ? 1 : 0, m.bg]])))};
var m=read&&modes[s.mode]?s.mode:null;
if(m)dark=!!modes[m][0];
r.classList.toggle("dark",dark);
if(m)r.setAttribute("data-read-mode",m);
if(read){
if(s.font==="serif")r.setAttribute("data-read-font","serif");
if(s.leading==="compact"||s.leading==="relaxed")r.setAttribute("data-read-leading",s.leading);
if(s.width==="narrow"||s.width==="wide")r.setAttribute("data-read-width",s.width);
if(${JSON.stringify(TEXT_SIZES)}.indexOf(size)>=0){r.style.setProperty("--reader-size",size+"px");r.style.setProperty("--reader-bump",(size-${TEXT_SIZES[0]})+"px")}
}
var c=m?modes[m][1]:dark?${JSON.stringify(SITE_CHROME.dark)}:${JSON.stringify(SITE_CHROME.light)};
var tc=function(){var l=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<l.length;i++)l[i].setAttribute("content",c);return l.length};
if(!tc())document.addEventListener("DOMContentLoaded",tc);
}catch(e){}})();`;
