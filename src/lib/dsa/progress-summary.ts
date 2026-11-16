/**
 * The numbers at the top of Progress: lessons done, problems by level, checkpoints passed and a bar per part. Pure.
 * Totals count READY content only (built lessons, problems in the bank); planned lessons are noted beside them, never added.
 */
export type ProgressProblem = { id: string; level: "easy" | "medium" | "hard" };
export type ProgressPart = { id: string; title: string; concepts: string[] };

export type Summary = {
  lessons: number;
  solved: number;
  problemsTotal: number;
  checkpoints: number;
  byLevel: Record<"easy" | "medium" | "hard", { solved: number; total: number }>;
  parts: { id: string; title: string; done: number; total: number }[];
};

export function summarise(i: { problems: ProgressProblem[]; parts: ProgressPart[]; concepts: ReadonlySet<string>; solved: ReadonlySet<string>; checkpoints: ReadonlySet<string> }): Summary {
  const byLevel: Summary["byLevel"] = { easy: { solved: 0, total: 0 }, medium: { solved: 0, total: 0 }, hard: { solved: 0, total: 0 } };
  let solved = 0;
  for (const p of i.problems) {
    const b = byLevel[p.level];
    if (!b) continue;
    b.total++;
    if (i.solved.has(p.id)) {
      b.solved++;
      solved++;
    }
  }
  const all = new Set(i.parts.flatMap((p) => p.concepts));
  const lessons = [...all].filter((c) => i.concepts.has(c)).length;
  return {
    lessons,
    solved,
    problemsTotal: i.problems.length,
    checkpoints: i.checkpoints.size,
    byLevel,
    parts: i.parts.map((p) => ({ id: p.id, title: p.title, done: p.concepts.filter((c) => i.concepts.has(c)).length, total: p.concepts.length })),
  };
}
