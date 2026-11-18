/**
 * Lean lessons beyond the Academy (owner, 18 Nov 2026): streets (Product Districts practice groups), camp tents (CP camp
 * topics) and sets (company-type sets and Core 150 gap sets). Their content lives in dsa-mastery resources/districts/,
 * camps/ and sets/ as <module>/<lesson>, NOT in concepts.yml: a lesson id repeats (every company set has a
 * `warm-up-round`), so the key is always <module>/<lesson> and the plan (resources/plan/curriculum.yml) is the index.
 *
 * Pure and import-free (types only), so node --test runs it and scripts/lecture/dsa-resolve.mjs can mirror its rules.
 *
 *   street     /dsa/districts/<district>/<street>     side branch off its `station`
 *   camp-tent  /dsa/camps/<camp>/<tent>               side branch off its `station`
 *   set        /dsa/sets/<module>/<set>               Core 150 gap sets: side branch off their `station`;
 *                                                     company sets (co-*): no station, no map; they live in Practice
 */
export type LeanKind = "street" | "camp-tent" | "set";
export const LEAN_KINDS: readonly LeanKind[] = ["street", "camp-tent", "set"];
/** The content folder and the URL folder of each kind (the same word). */
export const LEAN_ROOT: Record<LeanKind, string> = { street: "districts", "camp-tent": "camps", set: "sets" };
export const LEAN_KIND_WORD: Record<LeanKind, string> = { street: "Street", "camp-tent": "Camp tent", set: "Set" };
/** The learner's word for the branch on the map and in lists. */
export const LEAN_BRANCH_WORD: Record<LeanKind, string> = { street: "Street", "camp-tent": "Camp", set: "Gap set" };

export const isLeanKind = (k: unknown): k is LeanKind => k === "street" || k === "camp-tent" || k === "set";
export const leanKindOfRoot = (root: string): LeanKind | null => (LEAN_KINDS.find((k) => LEAN_ROOT[k] === root) as LeanKind | undefined) ?? null;

export const leanDir = (kind: LeanKind, module: string, lesson: string) => `resources/${LEAN_ROOT[kind]}/${module}/${lesson}`;
export const leanHref = (kind: LeanKind, module: string, lesson: string) => `/dsa/${LEAN_ROOT[kind]}/${module}/${lesson}`;
export const leanLectureHref = (kind: LeanKind, module: string, lesson: string) => `${leanHref(kind, module, lesson)}/lecture`;
/** The progress slug of a lean lesson (learning_progress lesson_slug, game keys dsa:c: and dsa:s:): unique where a lesson id is not. */
export const leanKey = (module: string, lesson: string) => `${module}--${lesson}`;
/** The lecture's media folder (the same shape as a concept's). */
export const leanQuest = (module: string, lesson: string) => `dsa--${module}--${lesson}`;
/** The route-less check: is this progress slug a lean lesson's? */
export const isLeanKey = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

/** A lean lesson as the plan lists it (built or not). */
export type LeanPlanLesson = {
  kind: LeanKind;
  module: string;
  id: string;
  title: string;
  /** the Academy module (course.yml id) whose metro station it branches from; null for company sets */
  station: string | null;
  /** the plan module's title ("Arrays & Hashing", "Basics", "Fintech interview set") */
  moduleTitle: string;
  /** camp tents: the camp's rating band */
  rating: [number, number] | null;
  /** a company set (module co-<type>) */
  company: boolean;
};

type PlanLike = { parts?: { modules?: { id?: string; title?: string; rating?: unknown; lessons?: { id?: string; title?: string; kind?: string; station?: string }[] }[] }[] };

/** Every street, camp tent and set of the plan, in plan order. */
export function parseLeanPlan(plan: unknown): LeanPlanLesson[] {
  const out: LeanPlanLesson[] = [];
  for (const part of (plan as PlanLike | null)?.parts || [])
    for (const m of part.modules || [])
      for (const l of m.lessons || []) {
        if (!isLeanKind(l.kind) || !m.id || !l.id) continue;
        const r = Array.isArray(m.rating) && m.rating.length === 2 && m.rating.every((n) => typeof n === "number") ? ([m.rating[0], m.rating[1]] as [number, number]) : null;
        out.push({ kind: l.kind, module: m.id, id: l.id, title: l.title || l.id, station: typeof l.station === "string" && l.station ? l.station : null, moduleTitle: m.title || m.id, rating: l.kind === "camp-tent" ? r : null, company: /^co-/.test(m.id) });
      }
  return out;
}

/** A lean lesson that is written and ready to show, as the home, Practice and search read it. */
export type LeanLesson = LeanPlanLesson & {
  summary: string;
  minutes: number;
  href: string;
  /** progress slug */
  key: string;
  /** problems on its ladder, in order */
  ladder: string[];
};

/** Plan rows (problems) by lean lesson: `home` is "<module>/<lesson>". */
export function leanRowsOf(plan: unknown): Map<string, string[]> {
  const rows = ((plan as { problems?: { id?: string; home?: string }[] } | null)?.problems || []).filter((r) => r.id && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(r.home || ""));
  const by = new Map<string, string[]>();
  for (const r of rows) (by.get(r.home as string) ?? by.set(r.home as string, []).get(r.home as string)!).push(r.id as string);
  return by;
}

/** "Street · Pairs and complements" for a tooltip or a link line. */
export const leanLabel = (l: Pick<LeanPlanLesson, "kind" | "title">) => `${LEAN_BRANCH_WORD[l.kind]} · ${l.title}`;

/** The `::ladder` data: one problem card. */
export type LadderItem = { id: string; title: string; level: "easy" | "medium" | "hard"; rating: number | null; adds: string; minutes: number | null; href: string };

/** Plan rows with a rating (camp problems): problem id to its Codeforces-style rating. */
export function leanRatingsOf(plan: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of (plan as { problems?: { id?: string; rating?: unknown }[] } | null)?.problems || []) if (r.id && typeof r.rating === "number") out.set(r.id, r.rating);
  return out;
}

/** The lean lesson a quest ("dsa--<module>--<lesson>") names, among those given. */
export function leanOfQuest(quest: string, all: readonly Pick<LeanPlanLesson, "module" | "id" | "kind">[]) {
  return all.find((l) => leanQuest(l.module, l.id) === quest) ?? null;
}
