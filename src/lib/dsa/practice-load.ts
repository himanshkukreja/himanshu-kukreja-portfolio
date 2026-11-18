import "server-only";
import matter from "gray-matter";
import { readDsa } from "./content";
import { getConceptIndex, getProblemIndex, getStepLabels, getWorld } from "./load";
import { buildProblemData, type ProblemData } from "./problem-rows";
import { campList, companyList, companyRows, coreList, districtList, type PracticeLists } from "./lists";
import { getLeanIndex, getPlanFacts } from "./kinds-load";
import { districtName } from "./districts";

/**
 * What /dsa/practice needs from the content repo, worked out once per revalidation (the page is ISR): the problem rows
 * with their facets, and the curated lists that need the plan (Core 150 gap-fillers) or the world file (the 18 interview
 * districts with their streets). The rest of the lists (daily, saved) are per learner and load in the browser.
 */
export async function getPracticeData(): Promise<{ data: ProblemData; lists: PracticeLists }> {
  const [problems, concepts, labels, world, plan, lean, facts] = await Promise.all([
    getProblemIndex().catch(() => []),
    getConceptIndex().catch(() => []),
    getStepLabels().catch(() => ({})),
    getWorld("product-districts").catch(() => null),
    readDsa("resources/plan/curriculum.yml").catch(() => null),
    getLeanIndex().catch(() => []),
    getPlanFacts().catch(() => ({ lessons: [], rows: [], ratings: [] })),
  ]);
  const data = buildProblemData(problems, { labels, concepts, videos: [] });
  if (data.unknown.length) console.warn(`[dsa taxonomy] pattern tags with no facets yet: ${data.unknown.join(", ")}`);
  // the plan's Core 150 gap-fillers that are built (a row counts only when its problem exists)
  let gaps: string[] = [];
  try {
    const rows = plan ? (matter(`---\n${plan}\n---\n`, {}).data as { problems?: { id: string; home?: string }[] }).problems || [] : [];
    gaps = rows.filter((r) => (r.home || "").startsWith("core-150-gaps/")).map((r) => r.id);
  } catch {
    gaps = [];
  }
  const lists: PracticeLists = {
    "core-150": coreList(problems, gaps),
    "interview-patterns": districtList((world?.regions || []).map((r) => ({ id: r.id, title: r.moduleTitle || districtName(r.title), opens: r.opens, planned: r.planned, stretches: r.stretches }))),
    // each written company set (kinds.ts) is linked from its type's section
    "company-types": companyList(companyRows(problems, data.rows), data.companies, lean.filter((l) => l.company).map((l) => ({ module: l.module, title: `${l.title} (set lesson)`, href: l.href }))),
    // the camps: every camp tent of the plan, with the problems the plan homes in it (written or not), its lesson when written
    "cp-camps": campList(campsOf(facts, lean), new Set(problems.map((p) => p.id))),
  };
  return { data, lists };
}

/** The plan's camps (module camp-N): their tents, each tent's problem rows and its lesson link when written. */
function campsOf(facts: Awaited<ReturnType<typeof getPlanFacts>>, lean: Awaited<ReturnType<typeof getLeanIndex>>) {
  const rows = new Map(facts.rows);
  const camps = new Map<string, { id: string; title: string; band: [number, number] | null; tents: { id: string; title: string; ids: string[]; href: string | null }[] }>();
  for (const l of facts.lessons.filter((x) => x.kind === "camp-tent")) {
    const c = camps.get(l.module) ?? camps.set(l.module, { id: l.module, title: l.moduleTitle, band: l.rating, tents: [] }).get(l.module)!;
    c.tents.push({ id: l.id, title: l.title, ids: rows.get(`${l.module}/${l.id}`) || [], href: lean.find((x) => x.module === l.module && x.id === l.id)?.href ?? null });
  }
  return [...camps.values()];
}
