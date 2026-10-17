"use client";

/**
 * The installed app's window, page side (mounted once by OfflineProvider):
 *
 * - <html data-display="browser|standalone|window-controls-overlay|…">, kept current when the
 *   reader folds the title bar in or out (chevron → geometrychange) or the app goes fullscreen.
 *   The CSS that moves the header out from under the window buttons keys off the display-mode
 *   media query itself (globals.css, "installed app window"); the attribute is for JS and tests.
 * - Window title: in the installed app Chrome shows "<app name> - <page title>", so page titles
 *   drop the course / site name there (lib/pwa/displayMode appTitle). Browser tabs keep the full
 *   SEO title: nothing here runs outside installed mode.
 * - Analytics: the display mode as a super/person property; a first launch of the home-screen app
 *   counts as an install where the browser has no `appinstalled` event (iPhone).
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { track } from "@/lib/track";
import { setAnalyticsContext } from "@/lib/analytics/client";
import { appDisplayMode, appTitle, isInstalledMode, platformOf, watchDisplayMode, type DisplayMode } from "@/lib/pwa/displayMode";

export const LAUNCH_KEY = "hk.pwa.installed";

export function markInstalled() {
  try {
    window.localStorage.setItem(LAUNCH_KEY, String(Date.now()));
  } catch {
    // storage unavailable
  }
}

export default function AppWindow({ onMode }: { onMode?: (m: DisplayMode) => void }) {
  const pathname = usePathname() || "/";
  const [mode, setMode] = useState<DisplayMode | null>(null);

  useEffect(() => {
    const apply = () => {
      const m = appDisplayMode();
      document.documentElement.dataset.display = m;
      setMode(m);
      onMode?.(m);
      setAnalyticsContext({ display_mode: m });
      // sticky offsets and the reader's geometry depend on the title-bar area
      window.dispatchEvent(new Event("hk:chrome"));
    };
    apply();
    return watchDisplayMode(apply);
  }, [onMode]);

  // first launch of the installed app (iPhone has no appinstalled event; elsewhere it already fired)
  useEffect(() => {
    if (!mode || !isInstalledMode(mode)) return;
    try {
      if (window.localStorage.getItem(LAUNCH_KEY)) return;
    } catch {
      return;
    }
    markInstalled();
    track("pwa_installed", { platform: platformOf(), via: "first_launch", display_mode: mode });
  }, [mode]);

  // installed-app window titles
  useEffect(() => {
    if (!mode || !isInstalledMode(mode)) return;
    let busy = false;
    const fix = () => {
      if (busy) return;
      const t = document.title;
      const next = appTitle(t);
      if (next === t) return;
      busy = true;
      document.title = next;
      busy = false;
    };
    fix();
    // route changes write the new title after this effect (and streamed metadata later still)
    const timers = [50, 300, 1000, 3000].map((ms) => window.setTimeout(fix, ms));
    const mo = new MutationObserver(fix);
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    const title = document.querySelector("title");
    if (title && !document.head.contains(title)) mo.observe(title, { childList: true, characterData: true, subtree: true });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      mo.disconnect();
    };
  }, [mode, pathname]);

  return null;
}
