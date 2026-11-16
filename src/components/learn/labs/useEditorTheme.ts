"use client";

import { useCallback, useMemo } from "react";
import { updateReading } from "@/lib/learn/readingModes";
import { usePageTone, useReadingSettings } from "@/components/learn/reading/useReading";
import { resolveEditorPalette, type EditorPick } from "@/lib/editor/themes";

/**
 * The code editor's look: the learner's pick (saved with the reading settings, so it also follows the account) and the
 * palette in force (Match site theme: the palette of the site theme; a manual pick wins).
 */
export function useEditorTheme() {
  const settings = useReadingSettings();
  const { theme, siteDark } = usePageTone();
  const pick = settings.editor;
  const palette = useMemo(() => resolveEditorPalette(pick, theme, siteDark), [pick, theme, siteDark]);
  const setPick = useCallback((p: EditorPick) => updateReading({ editor: p }), []);
  return { pick, palette, setPick };
}
