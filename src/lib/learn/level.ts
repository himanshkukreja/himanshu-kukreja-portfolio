/**
 * One difficulty scale for everything the course teaches (lessons, side quests, problems, LLD,
 * case files): Beginner → Intermediate → Advanced → Expert. Articles that state a level in their
 * mission block (`:::mission[…]{level="Medium|Hard|Expert"}`) keep it; course weeks get one by how
 * far into the course they are, and each world's capstone is a step harder.
 */
export const LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"] as const;
export type Level = (typeof LEVELS)[number];

const FROM_ARTICLE: Record<string, Level> = { easy: "Beginner", beginner: "Beginner", medium: "Intermediate", intermediate: "Intermediate", hard: "Advanced", advanced: "Advanced", expert: "Expert" };

/** The `level="…"` of an article's mission block, if it states one. */
export function levelFromMarkdown(md: string): Level | undefined {
  const m = md.match(/:::mission\[[^\]]*\]\{[^}]*level="([A-Za-z]+)"/);
  return m ? FROM_ARTICLE[m[1].toLowerCase()] : undefined;
}

const step = (l: Level, by = 1): Level => LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(l) + by)];

/** A course lesson's level from its week (00–11) and whether it is the week's capstone. */
export function levelForWeek(week: number, capstone: boolean): Level {
  const base: Level = week <= 0 ? "Beginner" : week <= 4 ? "Intermediate" : "Advanced";
  return capstone ? step(base) : base;
}

/** Badge colours (no purple): green, blue, orange, red. */
export const LEVEL_TONE: Record<Level, { fg: string; border: string }> = {
  Beginner: { fg: "#30a46c", border: "#30a46c66" },
  Intermediate: { fg: "#4da3ff", border: "#4da3ff66" },
  Advanced: { fg: "#ff8a4c", border: "#ff8a4c66" },
  Expert: { fg: "#ff5c5c", border: "#ff5c5c66" },
};
