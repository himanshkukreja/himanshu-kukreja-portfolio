"use client";

/**
 * The seam between the course chat and saved learning paths (src/components/learn/saved/useSavedPaths.ts):
 * the one place the chat saves a path. A chat path is saved like a smart-search path (source "path"), keyed
 * by its title, with every step copied from the index entry the server resolved (never a model-written link).
 * Site-help refs are not lessons, so they never become steps.
 */
import { useCallback } from "react";
import { useSavedPaths, type SaveResult } from "@/components/learn/saved/useSavedPaths";
import type { ChatSource, PathCard } from "@/lib/ai/chat/text";
import type { Kind } from "@/lib/search/smart/types";

export function useChatPathSaver(): (path: PathCard, sources: Record<string, ChatSource>) => SaveResult {
  const { save } = useSavedPaths();
  return useCallback(
    (path, sources) => {
      const steps = path.steps
        .map((s) => ({ s: sources[s.ref], why: s.why, due: s.date }))
        .filter((x): x is { s: ChatSource; why: string; due: string | undefined } => !!x.s && x.s.kind !== "guide")
        // a study plan's steps keep their dates (SavedStep.due), so /learn/saved shows and exports them
        .map(({ s, why, due }) => ({ id: s.id, kind: s.kind as Kind, title: s.title, sub: s.sub, href: s.href, summary: "", at: s.at, score: 0, why, ...(due ? { due } : {}) }));
      return save({ source: "path", q: path.title, title: path.title, note: path.note, steps });
    },
    [save],
  );
}
