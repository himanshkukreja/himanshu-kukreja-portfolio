/** The facet groups of the problems page, shared by the filter panel and the export dialog. */
import type { GroupId } from "@/lib/dsa/problem-filters";
import type { Option, ProblemData } from "@/lib/dsa/problem-rows";
import { ALGORITHMS, PATTERNS, STRUCTURES } from "@/lib/dsa/taxonomy";

export const LEVELS: Option[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];
export const STATUSES: Option[] = [
  { id: "todo", label: "Not started" },
  { id: "tried", label: "Tried" },
  { id: "solved", label: "Solved" },
];
export const KINDS: Option[] = [
  { id: "warm-up", label: "Warm-up" },
  { id: "practice", label: "Practice" },
  { id: "checkpoint", label: "Checkpoint" },
];
export const TIMES: Option[] = [
  { id: "quick", label: "15 min or less" },
  { id: "mid", label: "15 to 30 min" },
  { id: "long", label: "30 min or more" },
];
export const VIDEO: Option[] = [{ id: "1", label: "Has a solution video" }];
export const toOptions = (l: { id: string; label: string }[]): Option[] => l.map((f) => ({ id: f.id, label: f.label }));

export type GroupDef = { id: GroupId; title: string; options: Option[]; open: boolean; max: number };

export function groupDefs(d: ProblemData): GroupDef[] {
  return [
    { id: "structures", title: "Data structures", options: toOptions(STRUCTURES), open: true, max: 7 },
    { id: "algorithms", title: "Algorithms", options: toOptions(ALGORITHMS), open: true, max: 7 },
    { id: "patterns", title: "Patterns", options: toOptions(PATTERNS), open: false, max: 6 },
    { id: "level", title: "Difficulty", options: LEVELS, open: true, max: 9 },
    { id: "status", title: "Status", options: STATUSES, open: true, max: 9 },
    { id: "step", title: "Step in the course", options: d.steps, open: false, max: 6 },
    { id: "kind", title: "Kind", options: KINDS, open: false, max: 9 },
    { id: "video", title: "Video", options: VIDEO, open: false, max: 9 },
    { id: "company", title: "Company type", options: d.companies, open: false, max: 6 },
    { id: "time", title: "Time", options: TIMES, open: false, max: 9 },
  ];
}
