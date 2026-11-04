"use client";

import { useEffect, useLayoutEffect } from "react";
import { useGame } from "@/game/GameProvider";
import { READING_FLAG, applyReading, cleanReading, readReading, writeReading } from "@/lib/learn/readingModes";
import { usePageTone, useReadingSettings } from "./useReading";

/**
 * Keeps <html> in step with the reading settings after the first paint (READING_JS did it before):
 * client-side navigation between reading and other pages switches the mode on and off, a change in the
 * panel or the site theme toggle applies at once. Also carries the settings to the account (the game
 * flags sync, src/game/useGameSync.ts): the newer copy wins, so a change on the tablet reaches the laptop.
 */
export default function ReadingModeHost() {
  const settings = useReadingSettings();
  const { reading, siteDark } = usePageTone();
  const { hydrated, flags, setFlag } = useGame();
  const synced = flags[READING_FLAG];

  // before paint, so a navigation never shows the new page in the old mode
  useLayoutEffect(() => {
    // straight from storage: during hydration the hook still answers the defaults
    applyReading(reading, readReading(), siteDark);
  }, [reading, settings, siteDark]);

  useEffect(() => {
    if (!hydrated) return;
    const local = readReading();
    const remote = synced == null ? null : cleanReading(synced);
    if (remote && remote.updatedAt > local.updatedAt) writeReading(remote);
    else if (local.updatedAt > (remote?.updatedAt ?? 0)) setFlag(READING_FLAG, local);
  }, [hydrated, synced, settings, setFlag]);

  return null;
}
