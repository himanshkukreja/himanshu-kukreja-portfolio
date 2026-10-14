import type { Stage } from "@/lib/course/types";

/** Appendix-like stages are optional: not needed for completion, not counted in "Stage N/M". */
export const isOptionalStage = (s: Stage) => /^(appendix|exercises|further-reading|resources|wrap-up|self-assessment|summary)/.test(s.id);

/** Warm-up stages (preface / capstone intro): required, but not numbered. */
const warm = (id: string) => id === "preface" || id === "intro";

/** Stages counted in "Stage N/M": required stages except the preface (a warm-up). */
export function numberedStages(required: Stage[]): Stage[] {
  const n = required.filter((s) => !warm(s.id));
  return n.length ? n : required;
}

export function stagePosition(id: string, required: Stage[]): { n: number; total: number } {
  const list = numberedStages(required);
  return { n: list.findIndex((s) => s.id === id) + 1, total: list.length };
}

type P = { stages: Stage[]; required: Stage[]; current: string; completed: boolean; done: ReadonlySet<string> };

/** "Stage 2/5 · Part II", "Preface · warm-up", "Complete · 5/5". */
export function stageLine(p: P): string {
  const { n, total } = stagePosition(p.current, p.required);
  if (p.completed) return `Complete · ${total}/${total}`;
  const st = p.stages.find((s) => s.id === p.current);
  if (!st) return "";
  if (warm(p.current)) return `${st.label} · warm-up`;
  if (!n) return `${st.label} · optional`;
  if (total === 1) return st.label === "Lesson" ? "One stage" : st.label;
  return `Stage ${n}/${total} · ${st.label}`;
}

/** short form for the dock: "STAGE 2/5", "PREFACE", "DONE · 5/5" */
export function stageShort(p: P): string {
  const { n, total } = stagePosition(p.current, p.required);
  if (p.completed) return `DONE · ${total}/${total}`;
  if (warm(p.current)) return (p.stages.find((s) => s.id === p.current)?.label ?? "PREFACE").toUpperCase();
  if (!n) return "OPTIONAL";
  return `STAGE ${n}/${total}`;
}

export function doneCount(p: P): number {
  return numberedStages(p.required).filter((s) => p.done.has(s.id)).length;
}

export const fmtMin = (m: number) => (m >= 90 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
