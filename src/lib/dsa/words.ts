/**
 * DSA Mastery's plain words (owner, 9 Nov 2026: the beginner pass). The content repo's world spec keeps its theme
 * ("room", "paving stone", "front desk", "door", "stretch", "building"); the UI always says what a thing is. Theme
 * names ("Window Tower") only appear as small subtitles. Import-free: server and client share it.
 */

/** What each stop on the map is, for everyone. */
export const STOP = {
  concept: "Lesson",
  practice: "Practice problem",
  checkpoint: "Checkpoint quiz",
  /** a structure or algorithm lesson's build-it-yourself lab: it counts towards the checkpoint with the quiz */
  lab: "Lab",
  gate: "Next section",
  boss: "Module review",
  final: "Final",
} as const;

/** The Academy's parts (owner, 9 Nov 2026): the map's plain headings. */
export const PART = "Part";

/** A world's region (the spec's "building") is a module; a region's stretch is a section. */
export const MODULE = "Module";
export const SECTION = "Section";

/** The 6S beats with plain names first; the 6S word stays as a small subtitle. */
export const BEAT_PLAIN: Record<string, string> = {
  scenario: "The problem",
  struggle: "Try it",
  see: "The idea",
  shape: "The pattern",
  stretch: "Edge cases",
  say: "Recap",
};
export const BEAT_6S: Record<string, string> = { scenario: "Scenario", struggle: "Struggle", see: "See", shape: "Shape", stretch: "Stretch", say: "Say" };

/** "1. Scenario: the busiest three hours" → "The problem: the busiest three hours" (contents, search lines). */
export function plainBeatHeading(t: string): string {
  const m = t.trim().match(/^(\d+)\.\s*([A-Za-z]+)\s*[:.–—-]\s*(.+)$/);
  const id = m?.[2].toLowerCase();
  if (!m || !id || !BEAT_PLAIN[id]) return t;
  const rest = m[3].trim();
  return rest.toLowerCase() === BEAT_PLAIN[id].toLowerCase() ? BEAT_PLAIN[id] : `${BEAT_PLAIN[id]}: ${rest}`;
}

