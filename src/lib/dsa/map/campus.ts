/**
 * The campus view of a world (the /dsa roadmap, design "A · Campus map"): one building per region on a footpath,
 * read off computeWorld()'s node states. Pure and import-free apart from types, like progress.ts.
 *
 * A building is
 * - "current"  the region holding the frontier (the first required, built, open stop not done): "you are here";
 * - "cleared"  every required, built stop in it is done (lessons, practice, checkpoints);
 * - "open"     it has built stops but is neither (started out of order, or not reached yet: regions never lock);
 * - "planned"  nothing in it is built yet (outline regions): no counts but its concepts, if the spec names them;
 * - "later"    the world itself opens later.
 * A footpath segment is "walked" when the building it leaves is cleared.
 */
import type { WorldNode, WorldRegion, WorldSpec } from "../types";
import type { NodeState, WorldProgress } from "./progress";

export type BuildingState = "cleared" | "current" | "open" | "planned" | "later";

export type StretchView = {
  id: string;
  title: string;
  index: number;
  nodes: WorldNode[];
  /** required, built stops (lesson, practice, checkpoint) and how many are done */
  steps: number;
  stepsDone: number;
  /** required, built practice and how many are solved */
  practice: number;
  practiceDone: number;
  complete: boolean;
  /** the stop to do next in this stretch: the frontier when it is here, else the first open required stop */
  next: WorldNode | null;
};

export type Building = {
  region: WorldRegion;
  state: BuildingState;
  /** any stop in it done */
  started: boolean;
  stretches: StretchView[];
  /** the stretch to show first: the frontier's, else the first one not complete */
  focus: number;
  /** concepts the spec names for the region (outline regions list them; full regions have their concept stops) */
  concepts: WorldNode[];
};

export type Campus = {
  buildings: Building[];
  cleared: number;
  /** index of the current building, -1 when there is none */
  current: number;
  /** walked[i]: the path from building i to the next stop (the next building, or the final) is walked */
  walked: boolean[];
  /** the learner has done anything in this world */
  started: boolean;
};

const isStep = (n: WorldNode) => n.required && n.built && (n.type === "concept" || n.type === "practice" || n.type === "checkpoint");
const isDone = (states: Record<string, NodeState>, n: WorldNode) => states[n.id] === "done";
const isOpen = (states: Record<string, NodeState>, n: WorldNode) => states[n.id] === "open" || states[n.id] === "current";

function stretchView(st: WorldRegion["stretches"][number], index: number, w: WorldProgress): StretchView {
  const steps = st.nodes.filter(isStep);
  const practice = steps.filter((n) => n.type === "practice");
  const frontier = w.frontier ? st.nodes.find((n) => n.id === w.frontier!.nodeId) : undefined;
  const next = frontier || steps.find((n) => isOpen(w.states, n) && !isDone(w.states, n)) || null;
  const stepsDone = steps.filter((n) => isDone(w.states, n)).length;
  return {
    id: st.id,
    title: st.title,
    index,
    nodes: st.nodes,
    steps: steps.length,
    stepsDone,
    practice: practice.length,
    practiceDone: practice.filter((n) => isDone(w.states, n)).length,
    complete: steps.length > 0 && stepsDone === steps.length,
    next,
  };
}

export function campusOf(spec: WorldSpec, w: WorldProgress): Campus {
  const buildings = spec.regions.map((region): Building => {
    const stretches = region.stretches.map((st, i) => stretchView(st, i, w));
    const nodes = region.stretches.flatMap((s) => s.nodes);
    const built = nodes.some((n) => n.built && n.type !== "gate");
    const steps = stretches.reduce((a, s) => a + s.steps, 0);
    const done = stretches.reduce((a, s) => a + s.stepsDone, 0);
    const started = nodes.some((n) => isDone(w.states, n) && n.type !== "gate");
    let state: BuildingState;
    if (!spec.open) state = "later";
    else if (!built) state = "planned";
    else if (w.frontier?.regionId === region.id) state = "current";
    else if (steps > 0 && done === steps) state = "cleared";
    else state = "open";
    const atFrontier = w.frontier ? stretches.findIndex((s) => s.nodes.some((n) => n.id === w.frontier!.nodeId)) : -1;
    const firstOpen = stretches.findIndex((s) => !s.complete && s.steps > 0);
    return {
      region,
      state,
      started,
      stretches,
      focus: atFrontier >= 0 ? atFrontier : firstOpen >= 0 ? firstOpen : 0,
      concepts: nodes.filter((n) => n.type === "concept"),
    };
  });
  return {
    buildings,
    cleared: buildings.filter((b) => b.state === "cleared").length,
    current: buildings.findIndex((b) => b.state === "current"),
    walked: buildings.map((b) => b.state === "cleared"),
    started: buildings.some((b) => b.started),
  };
}

/** "8:05" from seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
