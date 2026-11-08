/**
 * World progress (plan §4.4): one pure function, `computeWorld(spec, signals)`, used by the map in the browser
 * (and later the profile and the coach). Isomorphic and import-free apart from types.
 *
 * Rules (§4.2, adapted to a partly built world):
 * - Every region is open: the Academy's entry is open and a per-region placement check lets learners skip ahead,
 *   so regions are recommended in order, not locked.
 * - Inside a region, the first stretch is open; each later stretch opens when the previous gate opens.
 * - A concept is always readable; it is "done" once its lesson is complete.
 * - A practice step is open when its stretch is open, and done on an accepted solve.
 * - A checkpoint appears once `opensAt` (70%) of its stretch's required, built practice is done; it is done when its
 *   quiz is passed and every built checkpoint problem is solved. Its gate opens with it.
 * - The boss unlocks when every checkpoint of the region is passed.
 * - Nodes whose content isn't written yet are "soon" and never block progress; the frontier is the first
 *   required, built, open node that isn't done.
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
  if (n.type === "checkpoint") return s.checkpoints.has(n.id) && (n.problems || []).every((p) => !p.built || s.solved.has(p.id));
  return false;
}

function regionStates(region: WorldRegion, s: ProgressSignals, states: Record<string, NodeState>): RegionProgress {
  let open = true;
  let done = 0;
  let total = 0;
  let gates = 0;
  let gatesOpen = 0;
  let checkpointsPassed = 0;
  let checkpoints = 0;
  for (const st of region.stretches) {
    const practice = st.nodes.filter((n) => n.type === "practice" && n.required && n.built);
    const practiceDone = practice.filter((n) => nodeDone(n, s)).length;
    const ratio = practice.length ? practiceDone / practice.length : 1;
    let gateOpen = false;
    for (const n of st.nodes) {
      if (n.type === "gate") {
        const cp = st.nodes.find((x) => x.id === n.openedBy) || st.nodes.find((x) => x.type === "checkpoint");
        gateOpen = !!cp && nodeDone(cp, s);
        gates++;
        if (gateOpen) gatesOpen++;
        states[n.id] = gateOpen ? "done" : "locked";
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
        else states[n.id] = open && ratio >= (n.opensAt ?? 0.7) ? "open" : "locked";
        continue;
      }
      if (isDone) states[n.id] = "done";
      else if (!n.built) states[n.id] = "soon";
      else if (n.type === "concept") states[n.id] = "open"; // learning stays free: always readable
      else states[n.id] = open ? "open" : "locked";
    }
    // the next stretch opens with this one's gate (a stretch without a gate never blocks)
    if (st.nodes.some((n) => n.type === "gate")) open = open && gateOpen;
  }
  for (const n of region.side) states[n.id] = n.built ? "open" : "soon";
  const bossOpen = checkpoints > 0 && checkpointsPassed === checkpoints;
  if (region.boss) states[region.boss.id] = !region.boss.built ? (bossOpen ? "soon" : "locked") : bossOpen ? "open" : "locked";
  return { id: region.id, done, total, pct: total ? Math.round((done / total) * 100) : 0, gatesOpen, gates, bossOpen };
}

export function computeWorld(spec: WorldSpec, s: ProgressSignals): WorldProgress {
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
  outer: for (const r of spec.regions) {
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
  if (frontier) states[frontier.nodeId] = "current";
  if (spec.final) states[spec.final.id] = "locked";
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
