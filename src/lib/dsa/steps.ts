/**
 * Step labels: how a module shows to a learner. The M/S/A codes live in files and ids only; learners see
 * "<part>.<step> <plain topic>" ("2.3 Linked lists") with the building name as a small subtitle.
 * The numbers come from the world's order (part index, then the module's place inside that part), computed here and
 * nowhere else, so inserting a topic renumbers everything. Pure and import-free (types only).
 */
import type { WorldSpec } from "./types";

export type StepLabel = {
  /** "2.3" */
  step: string;
  /** the plain topic name: "Linked lists" */
  title: string;
  /** the building's name, a small subtitle: "Carriage House" */
  building: string;
  /** "2.3 Linked lists" */
  label: string;
};

export type StepLabels = Record<string, StepLabel>;

/** Module id to its StepLabel, from the world's parts and regions (course.yml gives the plain titles). */
export function buildStepLabels(world: Pick<WorldSpec, "parts" | "regions"> | null, modules: Record<string, { title: string; building?: string }>): StepLabels {
  const out: StepLabels = {};
  const make = (module: string, region: { title: string; moduleTitle: string | null } | undefined, step: string): StepLabel => {
    const title = modules[module]?.title || region?.moduleTitle || region?.title || module;
    const building = modules[module]?.building || region?.title || "";
    return { step, title, building: building === title ? "" : building, label: step ? `${step} ${title}` : title };
  };
  const placed = new Set<string>();
  (world?.parts || []).forEach((p, pi) => {
    p.regions.forEach((rid, ri) => {
      const r = world?.regions.find((x) => x.id === rid);
      if (!r?.module || placed.has(r.module)) return;
      placed.add(r.module);
      out[r.module] = make(r.module, r, `${pi + 1}.${ri + 1}`);
    });
  });
  for (const r of world?.regions || []) if (r.module && !out[r.module]) out[r.module] = make(r.module, r, "");
  return out;
}

const plain = (module: string) => module.replace(/^[msa]\d+-/, "").replace(/-/g, " ");

/** The label for a module id, with a plain fallback for an unknown one (never a code). */
export function stepOf(labels: StepLabels, module: string): StepLabel {
  return labels[module] || { step: "", title: plain(module), building: "", label: plain(module) };
}

/** A lesson's place inside its module: lesson 2 of 5. */
export type LessonSlot = { n: number; of: number };

/**
 * Where a lesson sits among its module's lessons (written or planned, in concept order), or null when the module has
 * just one lesson. A module such as "2.3 Linked lists" holds several lessons and several stops on the map; the step
 * number stays the module's, so the lesson's place is added to it, never a second number.
 */
export function lessonSlot(concepts: { id: string; module: string; order?: number }[], id: string): LessonSlot | null {
  const me = concepts.find((c) => c.id === id);
  if (!me) return null;
  const mates = concepts.filter((c) => c.module === me.module).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (mates.length < 2) return null;
  return { n: mates.findIndex((c) => c.id === id) + 1, of: mates.length };
}

/** "2.3 Linked lists · lesson 2 of 5" for a lesson in a multi-lesson module, "2.3 Linked lists" otherwise. */
export function lessonLabel(labels: StepLabels, module: string, slot: LessonSlot | null): string {
  const base = stepOf(labels, module).label;
  return slot ? `${base} · lesson ${slot.n} of ${slot.of}` : base;
}

/** A sortable number for a module in learner order (part, then step); unknown modules sort last. */
export function stepRank(labels: StepLabels, module: string): number {
  const m = labels[module]?.step.match(/^(\d+)\.(\d+)$/);
  return m ? Number(m[1]) * 1000 + Number(m[2]) : 999999;
}
