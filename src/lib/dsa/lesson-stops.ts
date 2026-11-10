/**
 * Pure helpers for lessons that share a module (a structure or algorithm module holds 3 to 6 lessons since 10 Nov
 * 2026). Import-free apart from types, so node --test can run it.
 *
 * - checkpointFor: the checkpoint a lesson's quiz counts towards. A lesson has its own checkpoint when the map has one
 *   whose `quiz` is "<module>/<lesson>". Lessons in the same section can share the section's checkpoint (the plan's
 *   S1: "list-reversal" and "fast-and-slow-pointers" are one section with one checkpoint, which belongs to the second);
 *   then the first has none of its own, so it points at its own lesson stop on the map: "Back to the map" opens that
 *   stop, and the quiz is recorded under it without ever marking a checkpoint done.
 * - warmupsIntro: the text above a lesson's warm-up problems, per lesson (never per structure type, which repeats).
 */
import type { ConceptCheckpoint, WorldRegion } from "./types";

const gateKey = (world: string, region: string, n: string | number) => `dsa:gate:${world}:${region}:${n}`;

export function checkpointFor(world: string, region: WorldRegion | undefined, module: string, lesson: string): ConceptCheckpoint | null {
  if (!region) return null;
  for (const s of region.stretches) {
    const n = s.nodes.find((x) => x.type === "checkpoint" && x.quiz === `${module}/${lesson}`);
    if (n) {
      const num = n.id.match(/checkpoint-(\d+)$/)?.[1] || "1";
      return { nodeId: n.id, key: gateKey(world, region.id, num), pass: n.pass ?? 0.8, problems: n.problems || [], own: true };
    }
  }
  // no checkpoint of its own: its lesson stop on the map stands in (back link, quiz record); none on the map, none here
  for (const s of region.stretches) {
    const n = s.nodes.find((x) => x.type === "concept" && x.ref === lesson);
    if (n) return { nodeId: n.id, key: gateKey(world, region.id, n.id), pass: 0.8, problems: [], own: false };
  }
  return null;
}

/** Where "Back to the map" goes: the lesson's checkpoint or lesson stop, else the map itself. */
export const mapHref = (cp: Pick<ConceptCheckpoint, "nodeId"> | null): string => (cp?.nodeId ? `/dsa?node=${encodeURIComponent(cp.nodeId)}` : "/dsa");

/** The first lessons' texts, by lesson id (the structure type alone repeats for a module's second lesson). */
const FIRST: Record<string, string> = {
  "linked-lists": "Short, easy problems on the moves you just built: walking, turning arrows, two pointers. Each takes a linked list as input (ListNode in every language).",
  stacks: "Short problems that use the stack you just built: matching brackets, undoing, evaluating an expression, and finding the next bigger value. The first ones are easy; the last ones are a step up, and each says so.",
  "queues-and-deques":
    "Short problems that use the queue you just built: counting recent requests, a moving average, a simulation that sends items to the back, a stack made from queues and a ring of log lines. The first ones are easy; the last one is a step up, and each says so.",
  "trees-and-bst":
    "Short problems that walk the trees you just met: the total size of a folder, the levels of an org chart, a mirrored menu, a price tree that must follow the search rule, and a thread listed row by row. Each takes a tree as arrays of left and right children. The first ones are easy; the last two are a step up.",
  "heaps-and-priority-queues":
    "Short problems that use the heap you just built: pressing the two heaviest parcels, the kth best score of a stream, the cheapest few offers, the busiest endpoints and the nearest drivers. Most keep only the best k items in a small heap. The first ones are easy; the last two are a step up.",
  graphs: "Short problems on the graphs you just stored: building an adjacency list from edges, counting connections, a mutual follower check, the town judge and an isolated station. Each gives the edges as a list of pairs. The first ones are easy; the last one is a step up.",
  tries: "Short problems on the tries you just built: words that share a start, a prefix check and a search box that suggests words. Each gives its words as a list. The first ones are easy; the last one is a step up.",
  "bfs-dfs-grid": "Short problems that use what you just built: a fill, a count of regions, the fewest moves, a spread from many starts. Each takes a grid as input, as rows of text or rows of numbers.",
};

/**
 * The text above a lesson's warm-ups: the lesson's own `warmups` front matter when it has one, the text written for
 * the first lessons, else a plain line made from the lesson's title (so a new lesson never repeats another's text).
 */
export function warmupsIntro(lesson: { id: string; title: string; warmups?: string }): string {
  if (lesson.warmups?.trim()) return lesson.warmups.trim();
  if (FIRST[lesson.id]) return FIRST[lesson.id];
  return `Short problems on ${lesson.title.charAt(0).toLowerCase()}${lesson.title.slice(1)}, from easy to medium. Each says its level.`;
}

/** Where a lesson lives on the site (the same rule as load.ts lessonHref, kept here so this module stays import-free). */
export const lessonPath = (c: { id: string; kind?: string }) => (c.kind === "structure" ? `/dsa/structures/${c.id}` : c.kind === "algorithm" ? `/dsa/algorithms/${c.id}` : `/dsa/concepts/${c.id}`);

/** Lesson id to its page, for written lessons only: a planned lesson has no page, so nothing may link to it. */
export const writtenLessonPaths = (concepts: { id: string; kind?: string; status?: string }[]): Record<string, string> =>
  Object.fromEntries(concepts.filter((c) => c.status === "built").map((c) => [c.id, lessonPath(c)]));
