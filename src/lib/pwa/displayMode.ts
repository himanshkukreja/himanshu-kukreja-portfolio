"use client";

/**
 * How the site is being shown: a browser tab, the installed app (standalone window, or on desktop
 * Chrome/Edge with the title bar folded into the page: window-controls-overlay), or fullscreen.
 *
 * - The manifest asks for `display_override: ["window-controls-overlay", "standalone"]`. The
 *   reader can flip the overlay off and on with the chevron in the app's title bar, which fires
 *   `geometrychange` on navigator.windowControlsOverlay and flips the display-mode media query.
 * - The lesson's focus mode goes real fullscreen for a while: that is not a change of how the app
 *   is installed, so `appDisplayMode()` reports the mode underneath it.
 */

export type DisplayMode = "browser" | "standalone" | "window-controls-overlay" | "minimal-ui" | "fullscreen";

type WCO = EventTarget & { visible: boolean; getTitlebarAreaRect: () => DOMRect };

export const wco = (): WCO | null => {
  if (typeof navigator === "undefined") return null;
  return ((navigator as Navigator & { windowControlsOverlay?: WCO }).windowControlsOverlay ?? null) as WCO | null;
};

const mq = (q: string) => typeof window !== "undefined" && !!window.matchMedia?.(q).matches;

/** The display mode right now (fullscreen included). */
export function displayMode(): DisplayMode {
  if (typeof window === "undefined") return "browser";
  if (mq("(display-mode: window-controls-overlay)") || wco()?.visible) return "window-controls-overlay";
  if (mq("(display-mode: fullscreen)")) return "fullscreen";
  if (mq("(display-mode: standalone)") || (navigator as Navigator & { standalone?: boolean }).standalone === true) return "standalone";
  if (mq("(display-mode: minimal-ui)")) return "minimal-ui";
  return "browser";
}

let lastApp: DisplayMode | null = null;

/**
 * The mode the app runs in, ignoring the lesson's temporary fullscreen: an installed window in
 * fullscreen stays "standalone" / "window-controls-overlay", a browser tab stays "browser".
 */
export function appDisplayMode(): DisplayMode {
  const m = displayMode();
  const fs = typeof document !== "undefined" && !!(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement);
  if (m === "fullscreen" && fs) return lastApp ?? "browser";
  lastApp = m;
  return m;
}

/** Running as the installed app (or a home-screen web app on iPhone). */
export const isInstalledMode = (m: DisplayMode = appDisplayMode()) => m === "standalone" || m === "window-controls-overlay" || m === "minimal-ui";

/** Calls `cb` whenever the display mode or the title-bar overlay geometry changes. */
export function watchDisplayMode(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const queries = ["(display-mode: window-controls-overlay)", "(display-mode: standalone)", "(display-mode: fullscreen)", "(display-mode: minimal-ui)"]
    .map((q) => window.matchMedia?.(q))
    .filter((m): m is MediaQueryList => !!m);
  queries.forEach((m) => m.addEventListener?.("change", cb));
  const overlay = wco();
  overlay?.addEventListener("geometrychange", cb);
  document.addEventListener("fullscreenchange", cb);
  return () => {
    queries.forEach((m) => m.removeEventListener?.("change", cb));
    overlay?.removeEventListener("geometrychange", cb);
    document.removeEventListener("fullscreenchange", cb);
  };
}

/** Coarse platform for install analytics (no version numbers, nothing identifying). */
export function platformOf(): "ios" | "android" | "windows" | "macos" | "chromeos" | "linux" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/CrOS/.test(ua)) return "chromeos";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "macos";
  if (/Linux/.test(ua)) return "linux";
  return "other";
}

/**
 * Window title for the installed app. Chrome shows "<app name> - <page title>" in the app's
 * title bar and task switcher unless the title already starts with the app name, so the course
 * name (and the site name) are dropped from page titles there; the course map becomes just the
 * app name. Browser tabs keep the full SEO titles (this only runs in installed mode).
 */
export const APP_NAME = "System Design Mastery";

const SUFFIXES = [/\s*·\s*free course\s*·\s*Himanshu Kukreja$/i, /\s*·\s*Learn\s*·\s*Himanshu Kukreja$/i, /\s*[|·]\s*System Design Mastery$/i, /\s*·\s*Himanshu Kukreja$/i];

export function appTitle(title: string): string {
  let t = title.trim();
  if (!t) return APP_NAME;
  for (let i = 0; i < 3; i++) {
    const before = t;
    for (const re of SUFFIXES) t = t.replace(re, "");
    if (t === before) break;
  }
  t = t.trim();
  if (!t || t === APP_NAME) return APP_NAME;
  return t;
}
