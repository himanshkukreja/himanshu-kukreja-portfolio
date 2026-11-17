/**
 * The skill radar on Progress: strength per topic group, worked out from what the learner has actually done. Pure, so node
 * --test runs it (scripts/tests/dsa-radar.test.mjs).
 *
 * A topic group is a handful of metro stations that belong together (GROUPS). Its strength is 0 to 100, a weighted share of
 *   problems     solved problems of the group's topics, difficulty-weighted (Easy 1, Medium 2, Hard 3), out of all of them   50%
 *   lessons      the group's written lessons learnt (a lesson with exercises counts when they are solved)                      20%
 *   checkpoints  the group's checkpoint quizzes passed                                                                           20%
 *   exercises    solved in-lesson exercises, one per learnt lesson is full marks (counts once any is solved)                     10%
 * A part with nothing written in it yet (no problems, lessons or checkpoints) is left off. When a part has no checkpoints,
 * or no exercise solved yet, that share is dropped and the others are scaled up, so a part is never marked down for what it
 * does not have.
 */
import type { Outline } from "./outline";
import type { Metro, ProblemRef } from "./metro/model";

export type RadarGroup = { id: string; label: string; stations: string[] };

/** The six topic groups, by station id (layout.ts). A station in no group joins the last one. */
export const GROUPS: RadarGroup[] = [
  { id: "foundations", label: "Foundations", stations: ["m0-toolkit", "m1-complexity"] },
  { id: "arrays", label: "Arrays and hashing", stations: ["m2-arrays-strings", "m3-hashing", "m4-two-pointers", "m5-sliding-window", "a7-string-basics", "a9-range-queries"] },
  { id: "linear", label: "Lists, stacks, queues", stations: ["s1-linked-lists", "s2-stacks", "s3-queues-and-deques"] },
  { id: "trees", label: "Trees and heaps", stations: ["s4-trees-and-bst", "s7-tries", "s5-heaps"] },
  { id: "graphs", label: "Graphs", stations: ["s6-graphs", "a1-graph-traversal", "a2-shortest-paths", "a3-topological-sort", "a4-union-find"] },
  { id: "search", label: "Search and optimise", stations: ["m6-recursion", "m7-sorting", "m8-binary-search", "a5-greedy", "a6-dynamic-programming", "a8-bits-and-maths"] },
];

export const LEVEL_WEIGHT = { easy: 1, medium: 2, hard: 3 } as const;
export const SHARE = { problems: 0.5, lessons: 0.2, checkpoints: 0.2, exercises: 0.1 } as const;

export type RadarAxis = {
  id: string;
  label: string;
  /** 0..100 */
  strength: number;
  problems: { solved: number; total: number; weighted: number; weightedTotal: number };
  lessons: { done: number; total: number };
  checkpoints: { passed: number; total: number };
  exercises: number;
};

export type RadarInput = {
  outline: Outline;
  metro: Pick<Metro, "stations">;
  problems: ProblemRef[];
  concepts: ReadonlySet<string>;
  solved: ReadonlySet<string>;
  checkpoints: ReadonlySet<string>;
  /** the game store's done map (for the `dsa:ex:<lesson>:<id>` exercise keys) */
  done: Record<string, number>;
};

export function skillRadar(i: RadarInput): RadarAxis[] {
  const groupOf = new Map<string, string>();
  for (const g of GROUPS) for (const s of g.stations) groupOf.set(s, g.id);
  const lastId = GROUPS[GROUPS.length - 1].id;
  const stationOf = new Map(i.metro.stations.map((s) => [s.id, s]));
  // concept -> group, from the stations' written lessons
  const groupOfConcept = new Map<string, string>();
  for (const s of i.metro.stations) for (const c of s.lessonIds) groupOfConcept.set(c, groupOf.get(s.id) ?? lastId);
  // checkpoint node -> group, through the lesson whose quiz it is
  const cps: { node: string; group: string }[] = [];
  for (const part of i.outline.parts)
    for (const m of part.modules) {
      const st = stationOf.get(m.regionId);
      if (!st) continue;
      for (const c of m.checkpoints) if (c.built) cps.push({ node: c.nodeId, group: groupOf.get(st.id) ?? lastId });
    }
  const exByLesson = new Map<string, number>();
  for (const k of Object.keys(i.done)) {
    if (!k.startsWith("dsa:ex:")) continue;
    const lesson = k.slice(7, k.indexOf(":", 7));
    exByLesson.set(lesson, (exByLesson.get(lesson) || 0) + 1);
  }

  const axes: RadarAxis[] = [];
  for (const g of GROUPS) {
    const stations = g.stations.map((id) => stationOf.get(id)).filter((s): s is NonNullable<typeof s> => !!s && !s.planned);
    const lessons = stations.flatMap((s) => s.lessonIds);
    const probs = i.problems.filter((p) => groupOfConcept.get(p.concept) === g.id);
    const mine = cps.filter((c) => c.group === g.id);
    const w = (p: ProblemRef) => LEVEL_WEIGHT[p.level ?? "medium"] ?? 2;
    const weightedTotal = probs.reduce((n, p) => n + w(p), 0);
    const solvedProbs = probs.filter((p) => i.solved.has(p.id));
    const weighted = solvedProbs.reduce((n, p) => n + w(p), 0);
    const learnt = lessons.filter((c) => i.concepts.has(c)).length;
    const exercises = lessons.reduce((n, c) => n + (exByLesson.get(c) || 0), 0);
    const passed = mine.filter((c) => i.checkpoints.has(c.node)).length;
    if (!lessons.length && !probs.length) continue;

    const parts: { share: number; value: number }[] = [];
    if (weightedTotal) parts.push({ share: SHARE.problems, value: weighted / weightedTotal });
    if (lessons.length) parts.push({ share: SHARE.lessons, value: learnt / lessons.length });
    if (mine.length) parts.push({ share: SHARE.checkpoints, value: passed / mine.length });
    if (exercises > 0) parts.push({ share: SHARE.exercises, value: Math.min(1, exercises / Math.max(1, learnt)) });
    const shareSum = parts.reduce((n, p) => n + p.share, 0);
    const strength = shareSum ? Math.round((parts.reduce((n, p) => n + p.share * p.value, 0) / shareSum) * 100) : 0;
    axes.push({
      id: g.id,
      label: g.label,
      strength,
      problems: { solved: solvedProbs.length, total: probs.length, weighted, weightedTotal },
      lessons: { done: learnt, total: lessons.length },
      checkpoints: { passed, total: mine.length },
      exercises,
    });
  }
  return axes;
}

/** The radar polygon's points for axes 0..n-1 clockwise from the top: [x, y] at strength s (0..100) in a circle of radius r. */
export function radarPoint(index: number, count: number, strength: number, r: number, cx = 0, cy = 0): [number, number] {
  const a = (Math.PI * 2 * index) / Math.max(1, count) - Math.PI / 2;
  const d = (Math.max(0, Math.min(100, strength)) / 100) * r;
  return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
}
