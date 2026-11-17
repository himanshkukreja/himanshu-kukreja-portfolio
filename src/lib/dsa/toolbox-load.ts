import { getConceptIndex, getProblemIndex, getStepLabels, getWorld } from "./load";
import { buildOutline, type Outline } from "./outline";
import type { ProblemSummary } from "./types";

/** The course outline for the Progress page and the tool toasts (server only: the same loaders and builder as the home). */
export async function loadOutline(): Promise<{ outline: Outline | null; problems: ProblemSummary[] }> {
  const [academy, concepts, problems, steps] = await Promise.all([
    getWorld("academy").catch(() => null),
    getConceptIndex().catch(() => []),
    getProblemIndex().catch(() => [] as ProblemSummary[]),
    getStepLabels().catch(() => ({})),
  ]);
  if (!academy) return { outline: null, problems };
  return { outline: buildOutline(academy, concepts, problems, steps, {}), problems };
}

/** Station id -> its written lessons' concept ids (what the browser needs to tell when a tool is earned). */
export function stationLessons(outline: Outline): { id: string; lessonIds: string[] }[] {
  return outline.parts.flatMap((p) => p.modules.map((m) => ({ id: m.regionId, lessonIds: m.lessons.filter((l) => l.built).map((l) => l.conceptId) })));
}
