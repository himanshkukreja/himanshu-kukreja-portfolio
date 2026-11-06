/**
 * Site themes and reading settings (Kindle-style).
 *
 * - The theme (Light, Paper, Sepia, Mint, Dusk, Night) is the colour of the whole course site
 *   (systemdesignmastery.dev, every page but /admin): picked from the header's theme menu
 *   (components/site/ThemeMenu) or the theme row of the reader's "Aa" panel (components/learn/reading/
 *   ReadingPanel), one shared setting. The portfolio (himanshukukreja.in) and /admin keep the plain
 *   light / dark site theme (next-themes, html[data-theme], src/components/ThemeProvider.tsx).
 * - Font, text size, line spacing and page width apply on reading routes only (READING_ROUTE: lessons, side
 *   quests, problem bank, LLD, case files, war stories, papers, revision, cheat sheets, mock interviews).
 * - The theme is a token set in globals.css under html[data-read-mode="<theme>"] (light and night are the
 *   :root and .dark tokens themselves); everything built on the --c-* tokens follows. The html `dark` class
 *   is the page's tone: on a themed page it follows the theme (dusk and night are dark), elsewhere the site
 *   theme. So `dark:` variants, `.dark` rules, mermaid and the code palette all match the theme too.
 * - Saved in this browser (localStorage, read before paint by READING_JS in <head>); signed-in learners
 *   also carry it in their game flags (READING_FLAG), so it follows the account.
 * - "site" is a stored mode that was never picked, or the old "Site theme" choice: it resolves to Light or
 *   Night from the browser's old light / dark choice (resolveMode), and ReadingModeHost saves that once.
 */
import { CONTENT_AREA, COURSE_ID, cleanPath } from "./paths";
import { COURSE_HOST_NAMES, PORTFOLIO_HOST_NAMES, isPortfolioHost } from "@/lib/site/hosts";

export type ThemeId = "light" | "sepia" | "paper" | "mint" | "dusk" | "night";
export type ReadMode = "site" | ThemeId;
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
  id: ThemeId;
  name: string;
  /** a few words under the name in the theme menu */
  hint: string;
  dark: boolean;
  /** preview colours for the panel swatches and the browser chrome (keep in sync with globals.css) */
  bg: string;
  fg: string;
  accent: string;
};

export const READ_MODES: ModeInfo[] = [
  { id: "light", name: "Light", hint: "Bright and crisp", dark: false, bg: "#F5F4F0", fg: "#0B0B0B", accent: "#B93D0B" },
  { id: "paper", name: "Paper", hint: "Softer white", dark: false, bg: "#F7F3EA", fg: "#222018", accent: "#A8460F" },
  { id: "sepia", name: "Sepia", hint: "Warm, easy on the eyes", dark: false, bg: "#F4ECD8", fg: "#3B2F20", accent: "#9A4A12" },
  { id: "mint", name: "Mint", hint: "Pale sage green", dark: false, bg: "#E6EEDF", fg: "#23301F", accent: "#94420E" },
  { id: "dusk", name: "Dusk", hint: "Soft, warm dark", dark: true, bg: "#23201C", fg: "#D9CFBF", accent: "#E0965A" },
  { id: "night", name: "Night", hint: "True black", dark: true, bg: "#000000", fg: "#F3F2EE", accent: "#FF6B2B" },
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

export const sameReading = (a: ReadingSettings, b: ReadingSettings) => a.mode === b.mode && sameType(a, b);

/** The same type settings (font, size, spacing, width), whatever the theme. */
export const sameType = (a: ReadingSettings, b: ReadingSettings) => a.font === b.font && a.size === b.size && a.leading === b.leading && a.width === b.width;

export const themeInfo = (id: ThemeId) => READ_MODES.find((m) => m.id === id) ?? READ_MODES[0];

/** The theme a stored mode stands for: "site" (never picked, or the old "Site theme") follows the old light / dark choice. */
export function resolveMode(mode: ReadMode, siteDark: boolean): ThemeId {
  if (mode !== "site" && READ_MODES.some((m) => m.id === mode)) return mode;
  return siteDark ? "night" : "light";
}

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

// ---- the themed pages ------------------------------------------------------------------------------

/** /admin keeps the plain light / dark site theme, on the course host too. */
const ADMIN_ROUTE = /^\/admin(?:\/|$)/;
/** The course's own internal routes (what a preview host or an old link shows): course pages wherever they are served. */
const COURSE_ROUTE = /^\/(?:learn|stories)(?:\/|$)|^\/(?:cert|u)\//;

/**
 * Does the theme colour this page? Every page on the course host but /admin (shared routes such as
 * /auth/callback, /privacy and /newsletter follow the host). The real portfolio host never; any other host
 * (localhost, previews) when the dev switch says course (the hk_site cookie, src/middleware.ts), else on the
 * course's internal routes. READING_JS makes the same call before paint: keep the two in step.
 */
export function isThemedPage(host: string, path: string, cookie = ""): boolean {
  const p = (path || "/").replace(/[?#].*$/, "");
  if (ADMIN_ROUTE.test(p)) return false;
  const h = (host || "").trim().toLowerCase();
  if (COURSE_HOST_NAMES.includes(h) || COURSE_HOST_NAMES.includes(h.replace(/:\d+$/, ""))) return true;
  if (!h || isPortfolioHost(h)) return false;
  const forced = /(?:^|;\s*)hk_site=(course|portfolio)/.exec(cookie)?.[1];
  if (forced) return forced === "course";
  return COURSE_ROUTE.test(p);
}

/** isThemedPage for this tab (false during the server render). */
export const isThemedHere = (path: string) => typeof window !== "undefined" && isThemedPage(window.location.host, path, document.cookie);

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

/** Back to the default font, size, spacing and width; the theme is the site's and stays. */
export function resetReading() {
  writeReading({ ...DEFAULT_READING, mode: readReading().mode, updatedAt: Date.now() });
}

/** The browser's old light / dark choice (next-themes' localStorage "theme"); null when storage is unavailable. */
export function storedSiteDark(): boolean | null {
  try {
    return window.localStorage.getItem("theme") === "dark";
  } catch {
    return null;
  }
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

/** Is the page dark? A themed page follows its theme, every other page (portfolio, /admin) the site theme. */
export function pageIsDark(themed: boolean, s: ReadingSettings, siteDark: boolean): boolean {
  if (!themed) return siteDark;
  return themeInfo(resolveMode(s.mode, siteDark)).dark;
}

/** The browser chrome colour (meta theme-color) for the page as it is now. */
export function chromeColor(root: HTMLElement = document.documentElement): string {
  const mode = READ_MODES.find((m) => m.id === root.dataset.readMode);
  if (mode) return mode.bg;
  return root.classList.contains("dark") ? SITE_CHROME.dark : SITE_CHROME.light;
}

/**
 * Puts the theme and the reading settings on <html> (READING_JS does the same before paint; keep the two in
 * step): the theme on themed pages, the type settings on reading routes there.
 */
export function applyReading(themed: boolean, reading: boolean, s: ReadingSettings, siteDark: boolean) {
  const root = document.documentElement;
  const on = (name: string, value: string | null) => (value ? root.setAttribute(name, value) : root.removeAttribute(name));
  const read = themed && reading;
  root.classList.toggle("dark", pageIsDark(themed, s, siteDark));
  on("data-read-mode", themed ? resolveMode(s.mode, siteDark) : null);
  on("data-read-font", read && s.font !== "sans" ? s.font : null);
  on("data-read-leading", read && s.leading !== "normal" ? s.leading : null);
  on("data-read-width", read && s.width !== "normal" ? s.width : null);
  if (read) {
    root.style.setProperty("--reader-size", `${s.size}px`);
    // readers with their own base size (case files: 19px) step up from it instead
    root.style.setProperty("--reader-bump", `${s.size - TEXT_SIZES[0]}px`);
  } else {
    root.style.removeProperty("--reader-size");
    root.style.removeProperty("--reader-bump");
  }
}

/**
 * Plain ES2017, second in <head> (after IMPORT_JS): the page's theme, tone and reading settings on <html>
 * before first paint, and the browser chrome colour to match. Themed or not from the host and path
 * (isThemedPage); the site theme (portfolio, /admin, and the fallback for a theme never picked) is
 * next-themes' localStorage("theme"), light by default.
 */
export const READING_JS = `(function(){try{
var r=document.documentElement,ls=window.localStorage,dark=false,s={},size=0;
try{dark=ls.getItem("theme")==="dark";s=JSON.parse(ls.getItem(${JSON.stringify(LOOK_KEY)})||"{}")||{};size=Number(ls.getItem(${JSON.stringify(SIZE_KEY)}))}catch(e){}
var raw=location.pathname,h=location.host.toLowerCase(),hb=h.replace(/:\\d+$/,""),ch=${JSON.stringify(COURSE_HOST_NAMES)},ph=${JSON.stringify(PORTFOLIO_HOST_NAMES)};
var themed;
if(${ADMIN_ROUTE.toString()}.test(raw))themed=false;
else if(ch.indexOf(h)>=0||ch.indexOf(hb)>=0)themed=true;
else if(!h||ph.indexOf(h)>=0||ph.indexOf(hb)>=0)themed=false;
else{var f=/(?:^|;\\s*)hk_site=(course|portfolio)/.exec(document.cookie);themed=f?f[1]==="course":${COURSE_ROUTE.toString()}.test(raw)}
var p=raw.replace(/^\\/learn\\/${COURSE_ID}(?=\\/|$)/,"").replace(/^\\/learn(?=\\/|$)/,"").replace(/^\\/stories(?=\\/|$)/,"/case-files")||"/";
var read=themed&&${READING_ROUTE.toString()}.test(p);
var modes=${JSON.stringify(Object.fromEntries(READ_MODES.map((m) => [m.id, [m.dark ? 1 : 0, m.bg]])))};
var m=themed?(Object.prototype.hasOwnProperty.call(modes,s.mode)?s.mode:dark?"night":"light"):null;
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
