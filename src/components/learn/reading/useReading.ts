"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useCoursePathname } from "@/components/site/SiteMode";
import { DEFAULT_READING, isReadingPath, pageIsDark, readReading, subscribeReading, type ReadingSettings } from "@/lib/learn/readingModes";

const serverReading = () => DEFAULT_READING;

/** The saved reading settings (defaults during the server render and hydration). */
export function useReadingSettings(): ReadingSettings {
  return useSyncExternalStore(subscribeReading, readReading, serverReading);
}

/**
 * This page and its tone: `reading` on reading routes, `override` when a reading mode (not "Site theme")
 * decides the colours here, `dark` when the page is dark.
 */
export function usePageTone() {
  const path = useCoursePathname();
  const settings = useReadingSettings();
  const { resolvedTheme } = useTheme();
  const reading = isReadingPath(path);
  return {
    reading,
    override: reading && settings.mode !== "site",
    dark: pageIsDark(reading, settings, resolvedTheme === "dark"),
    siteDark: resolvedTheme === "dark",
  };
}
