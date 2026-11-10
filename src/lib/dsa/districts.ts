/**
 * The "Interview practice" world (World 2, resources/worlds/product-districts.yml: "Product Districts" is its small
 * subtitle) laid out from the plan. The world file lists 18 districts with no stops; the plan (resources/plan/
 * curriculum.yml) lists each district's streets (problem sets: the module's lessons of kind `street`) and one row per
 * problem, whose `home` is "<district>/<street>". This turns those into the map's stretches: one stretch per street,
 * with the built problems as its stops (links to the problem rooms) and a count of the planned ones.
 *
 * Pure and import-free apart from types, so node --test can run it.
 */
import type { WorldNode, WorldStretch } from "./types";

export type PlanDistrict = { id: string; wave?: string; links?: string[]; streets: { id: string; title: string }[] };
export type PlanProblem = { id: string; home: string; title?: string; status?: string; lesson?: string };
/** The built problems by id (the problem index): a row counts as built only when its problem exists. */
export type BuiltProblems = Map<string, { id: string; title: string; level: "easy" | "medium" | "hard" }>;

export type DistrictShape = { stretches: WorldStretch[]; built: number; planned: number };

const title = (s: string) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** "Opens at launch" / "Opens with wave 3" from a plan wave id (launch, w1, w2 …). */
export function waveLabel(wave: string | undefined): string {
  if (wave === "launch") return "Opens at launch";
  const n = wave?.match(/^w(\d+)$/)?.[1];
  return n ? `Opens with wave ${n}` : "Opens later";
}

/** The plain label of a district for the map ("Arrays & Hashing", without the plan's "(interview level)"). */
export const districtName = (t: string) => t.replace(/\s*\(interview level\)\s*$/i, "");

/**
 * Group the plan's problem rows into each district's streets. `code` is the region's code ("d1"), the prefix of its
 * stop ids. A street the plan lists but has no rows still gets a stretch (no stops: "coming soon"); a row whose street
 * the plan does not list gets a stretch of its own, so nothing is dropped.
 */
export function groupDistricts(districts: PlanDistrict[], rows: PlanProblem[], built: BuiltProblems, code: (district: string) => string): Record<string, DistrictShape> {
  const out: Record<string, DistrictShape> = {};
  for (const d of districts) {
    const stretches: WorldStretch[] = d.streets.map((s) => ({ id: s.id, title: s.title, nodes: [], planned: 0 }));
    const prefix = `${d.id}/`;
    let nBuilt = 0;
    let nPlanned = 0;
    for (const r of rows) {
      if (!r.home.startsWith(prefix)) continue;
      const street = r.home.slice(prefix.length);
      let st = stretches.find((s) => s.id === street);
      if (!st) stretches.push((st = { id: street, title: title(street), nodes: [], planned: 0 }));
      const p = built.get(r.id);
      if (p) {
        const node: WorldNode = { id: `${code(d.id)}.${p.id}`, type: "practice", title: p.title, required: true, href: `/dsa/problems/${p.id}`, ref: p.id, level: p.level, built: true };
        st.nodes.push(node);
        nBuilt++;
      } else {
        st.planned = (st.planned || 0) + 1;
        nPlanned++;
      }
    }
    out[d.id] = { stretches, built: nBuilt, planned: nPlanned };
  }
  return out;
}
