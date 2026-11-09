/**
 * World progress (plan §4.4): one pure function, `computeWorld(spec, signals)`, used by the map in the browser
 * (and later the profile and the coach). Isomorphic and import-free apart from types.
 *
 * Rules (owner, 9 Nov 2026: nothing is locked; worlds, stretches, checkpoints and bosses are all open from day one):
 * - Every world and every region is open; the map recommends an order, it never blocks.
 * - A concept is always readable; it is "done" once its lesson is complete.
 * - A practice step is always open, and done on an accepted solve.
 * - A checkpoint is always open; it is done when its quiz is passed and every built checkpoint problem is solved. A
 *   structure or algorithm lesson's checkpoint is its quiz plus its build-it lab (`lab`): done when both are passed.
 *   The stretch's gate is just its end marker: "done" with the checkpoint, never a barrier.
 * - Bosses and the world final are open once written ("soon" before that).
 * - Nodes whose content isn't written yet are "soon"; the frontier (where "Continue" goes) is the first required,
 *   built, open node that isn't done.
 */
import type { WorldNode, WorldRegion, WorldSpec } from "../types";

export type NodeState = "done" | "current" | "open" | "locked" | "soon";

export type ProgressSignals = {
  /** concept ids whose lesson is complete */
  concepts: ReadonlySet<string>;
  /** problem ids with an accepted solve */
  solved: ReadonlySet<string>;
  /** checkpoint node ids whose quiz is passed */
  checkpoints: ReadonlySet<string>;
  /** build-it lab ids passed in full (game key dsa:lab:<lab id>) */
  labs: ReadonlySet<string>;
};

export type RegionProgress = { id: string; done: number; total: number; pct: number; gatesOpen: number; gates: number; bossOpen: boolean };

export type WorldProgress = {
  states: Record<string, NodeState>;
  regions: Record<string, RegionProgress>;
  /** where the learner stands: the first required, built, open node not done (null when none is left) */
  frontier: { nodeId: string; regionId: string } | null;
  done: number;
  total: number;
};

function nodeDone(n: WorldNode, s: ProgressSignals): boolean {
  if (n.type === "concept") return !!n.ref && s.concepts.has(n.ref);
  if (n.type === "practice") return !!n.ref && s.solved.has(n.ref);
  if (n.type === "checkpoint") return s.checkpoints.has(n.id) && (n.problems || []).every((p) => !p.built || s.solved.has(p.id)) && (!n.lab || s.labs.has(n.lab.id));
  return false;
}

function regionStates(region: WorldRegion, s: ProgressSignals, states: Record<string, NodeState>): RegionProgress {
  let done = 0;
  let total = 0;
  let gates = 0;
  let gatesOpen = 0;
  let checkpointsPassed = 0;
  let checkpoints = 0;
  for (const st of region.stretches) {
    let gateOpen = false;
    for (const n of st.nodes) {
      if (n.type === "gate") {
        const cp = st.nodes.find((x) => x.id === n.openedBy) || st.nodes.find((x) => x.type === "checkpoint");
        gateOpen = !!cp && nodeDone(cp, s);
        gates++;
        if (gateOpen) gatesOpen++;
        // nothing is locked (owner, 9 Nov 2026): a gate marks the end of a stretch, done once its checkpoint is passed
        states[n.id] = gateOpen ? "done" : "open";
        continue;
      }
      if (n.required) total++;
      const isDone = nodeDone(n, s);
      if (isDone && n.required) done++;
      if (n.type === "checkpoint") {
        checkpoints++;
        if (isDone) checkpointsPassed++;
        if (isDone) states[n.id] = "done";
        else if (!n.built) states[n.id] = "soon";
        else states[n.id] = "open"; // always open: no "solve 70% first"
        continue;
      }
      if (isDone) states[n.id] = "done";
      else if (!n.built) states[n.id] = "soon";
      else if (n.type === "concept") states[n.id] = "open"; // learning stays free: always readable
      else states[n.id] = "open";
    }
  }
  for (const n of region.side) states[n.id] = n.built ? "open" : "soon";
  const bossOpen = checkpoints > 0 && checkpointsPassed === checkpoints;
  if (region.boss) states[region.boss.id] = region.boss.built ? "open" : "soon";
  return { id: region.id, done, total, pct: total ? Math.round((done / total) * 100) : 0, gatesOpen, gates, bossOpen };
}

/**
 * The region the onboarding recommends starting at, resolved against what is written: the wanted region, or the first
 * one after it (campus order) with a required, built, open stop. Null when none. Only a recommendation: nothing before it
 * is locked, and the frontier skips back to earlier stops once everything from here on is done.
 */
export function resolveStartRegion(spec: WorldSpec, wanted: string | null | undefined): string | null {
  if (!wanted) return null;
  const at = spec.regions.findIndex((r) => r.id === wanted);
  if (at < 0) return null;
  const has = (r: WorldRegion) => r.stretches.some((st) => st.nodes.some((n) => n.required && n.built && n.type !== "gate"));
  return spec.regions.slice(at).find(has)?.id ?? null;
}

export function computeWorld(spec: WorldSpec, s: ProgressSignals, opts?: { startRegion?: string | null }): WorldProgress {
  const states: Record<string, NodeState> = {};
  const regions: Record<string, RegionProgress> = {};
  let done = 0;
  let total = 0;
  for (const r of spec.regions) {
    const p = regionStates(r, s, states);
    regions[r.id] = p;
    done += p.done;
    total += p.total;
  }
  let frontier: WorldProgress["frontier"] = null;
  // the onboarding's recommended start: look from that region on first, then from the top (nothing is locked)
  const from = opts?.startRegion ? Math.max(0, spec.regions.findIndex((r) => r.id === opts.startRegion)) : 0;
  for (const range of from > 0 ? [spec.regions.slice(from), spec.regions] : [spec.regions]) {
    outer: for (const r of range) {
      for (const st of r.stretches) {
        for (const n of st.nodes) {
          if (!n.required || !n.built || n.type === "gate") continue;
          if (states[n.id] === "open") {
            frontier = { nodeId: n.id, regionId: r.id };
            break outer;
          }
        }
      }
    }
    if (frontier) break;
  }
  if (frontier) states[frontier.nodeId] = "current";
  if (spec.final) states[spec.final.id] = spec.final.built ? "open" : "soon";
  return { states, regions, frontier, done, total };
}

/** Screen-reader words for a state (the map never shows state by colour alone). */
export const STATE_LABEL: Record<NodeState, string> = {
  done: "completed",
  current: "current: start here",
  open: "open",
  locked: "locked",
  soon: "coming soon",
};
