"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { DEFAULT_READING, isReadingPath, isThemedHere, readReading, resolveMode, subscribeReading, themeInfo, type ReadingSettings, type ThemeId } from "@/lib/learn/readingModes";

const serverReading = () => DEFAULT_READING;
const noop = () => () => {};

/** The saved reading settings and theme (defaults during the server render and hydration). */
export function useReadingSettings(): ReadingSettings {
  return useSyncExternalStore(subscribeReading, readReading, serverReading);
}

/** Does the course theme colour this page (src/lib/learn/readingModes.ts isThemedPage)? False on the server. */
export function useThemedPage(): boolean {
  const path = usePathname() || "/";
  return useSyncExternalStore(
    noop,
    () => isThemedHere(path),
    () => false
  );
}

/**
 * This page and its tone: `themed` on course pages (the theme decides the colours), `reading` on reading
 * routes there (the type settings apply), `theme` the theme in force (null elsewhere), `dark` when the page is dark.
 */
export function usePageTone(): { themed: boolean; reading: boolean; theme: ThemeId | null; dark: boolean; siteDark: boolean } {
  const path = usePathname() || "/";
  const themed = useThemedPage();
  const settings = useReadingSettings();
  const { resolvedTheme } = useTheme();
  const siteDark = resolvedTheme === "dark";
  const theme = themed ? resolveMode(settings.mode, siteDark) : null;
  return {
    themed,
    reading: themed && isReadingPath(path),
    theme,
    dark: theme ? themeInfo(theme).dark : siteDark,
    siteDark,
  };
}
