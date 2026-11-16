import "server-only";
import matter from "gray-matter";
import { readDsa } from "./content";
import { getConceptIndex, getProblemIndex, getStepLabels, getWorld } from "./load";
import { buildProblemData, type ProblemData } from "./problem-rows";
import { companyList, coreList, districtList, type PracticeLists } from "./lists";
import { districtName } from "./districts";

/**
 * What /dsa/practice needs from the content repo, worked out once per revalidation (the page is ISR): the problem rows
 * with their facets, and the curated lists that need the plan (Core 150 gap-fillers) or the world file (the 18 interview
 * districts with their streets). The rest of the lists (daily, saved) are per learner and load in the browser.
 */
export async function getPracticeData(): Promise<{ data: ProblemData; lists: PracticeLists }> {
  const [problems, concepts, labels, world, plan] = await Promise.all([
    getProblemIndex().catch(() => []),
    getConceptIndex().catch(() => []),
    getStepLabels().catch(() => ({})),
    getWorld("product-districts").catch(() => null),
    readDsa("resources/plan/curriculum.yml").catch(() => null),
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
    "company-types": companyList(data.rows, data.companies),
  };
  return { data, lists };
}
