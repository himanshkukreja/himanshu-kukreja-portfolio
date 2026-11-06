"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { useGame } from "@/game/GameProvider";
import { READING_FLAG, applyReading, cleanReading, isReadingPath, isThemedHere, readReading, resolveMode, storedSiteDark, writeReading } from "@/lib/learn/readingModes";
import { usePageTone, useReadingSettings } from "./useReading";

/**
 * Keeps <html> in step with the theme and the reading settings after the first paint (READING_JS did it
 * before): client-side navigation between course pages and /admin switches the theme on and off, reading
 * routes switch the type settings, a pick in the theme menu or the panel (or the site toggle on /admin)
 * applies at once. Also carries the settings to the account (the game flags sync, src/game/useGameSync.ts):
 * the newer copy wins, so a change on the tablet reaches the laptop.
 */
export default function ReadingModeHost() {
  const path = usePathname() || "/";
  const settings = useReadingSettings();
  const { siteDark } = usePageTone();
  const { hydrated, flags, setFlag } = useGame();
  const synced = flags[READING_FLAG];

  // before paint, so a navigation never shows the new page in the old theme. Straight from the tab and storage:
  // during hydration the hooks still answer their server values (unthemed, defaults), which would strip the
  // theme READING_JS put on until the re-render.
  useLayoutEffect(() => {
    const themed = isThemedHere(path);
    applyReading(themed, themed && isReadingPath(path), readReading(), storedSiteDark() ?? siteDark);
  }, [path, settings, siteDark]);

  // A theme never picked (or the old "Site theme" choice) becomes Light or Night from the old light / dark
  // switch, once, on a course page. Not stamped: a choice synced from another device still wins over it.
  useEffect(() => {
    if (!isThemedHere(path)) return;
    const s = readReading();
    if (s.mode === "site") writeReading({ ...s, mode: resolveMode("site", storedSiteDark() ?? siteDark) });
  }, [path, settings, siteDark]);

  useEffect(() => {
    if (!hydrated) return;
    const local = readReading();
    const remote = synced == null ? null : cleanReading(synced);
    if (remote && remote.updatedAt > local.updatedAt) writeReading(remote);
    else if (local.updatedAt > (remote?.updatedAt ?? 0)) setFlag(READING_FLAG, local);
  }, [hydrated, synced, settings, setFlag]);

  return null;
}
