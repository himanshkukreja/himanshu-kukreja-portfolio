/**
 * Topological sort as step-engine frames (Academy Part 3, A3): Kahn's algorithm on a directed graph. The "graph" view draws the
 * run (GraphState with an in-degree table, the ready queue and the order built so far), so the vertices sit on the same ring the
 * graph lesson draws.
 *
 *   Kahn   count how many edges point into each vertex (its in-degree). Every vertex with in-degree 0 has nothing to wait for:
 *          it joins the ready queue. Take the front vertex, add it to the order, and remove its outgoing edges: each neighbour's
 *          in-degree drops by one, and a neighbour that reaches 0 joins the queue. If the queue empties before every vertex is in
 *          the order, the vertices left over wait on each other: a cycle.
 *
 * One frame per step, a running cost in edges removed, and optional predict-then-reveal asks. Pure and dependency-free.
 */
import type { Frame, GraphState, Script, VizAsk } from "./types";

export type TopoEdge = [number, number, number?];
export type TopoGraph = { n: number; edges: TopoEdge[] };
export type TopoResult = { order: number[]; cycle: boolean; stuck: number[]; removed: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function choicesOf(right: string, wrong: { label: string; why: string }[]): VizAsk["choices"] {
  const seen = new Set<string>([right]);
  const out: VizAsk["choices"] = [{ label: right, correct: true }];
  for (const w of wrong) {
    if (seen.has(w.label)) continue;
    seen.add(w.label);
    out.push({ label: w.label, correct: false, why: w.why });
  }
  let h = 7;
  for (const ch of right + wrong.map((w) => w.label).join("|")) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
  const k = h % out.length;
  return [...out.slice(k), ...out.slice(0, k)];
}

export function kahnFrames(g: TopoGraph, opts: { predict?: boolean } = {}): { frames: Frame<GraphState>[]; result: TopoResult } {
  const frames: Frame<GraphState>[] = [];
  const indeg: number[] = Array(g.n).fill(0);
  const out: number[][] = Array.from({ length: g.n }, () => []);
  for (const [a, b] of g.edges) {
    out[a].push(b);
    indeg[b]++;
  }
  const queue: number[] = [];
  const order: number[] = [];
  let removed = 0;
  const snap = (o: Partial<GraphState>): GraphState => ({
    n: g.n,
    edges: g.edges.map(([a, b]) => ({ a, b, w: null })),
    directed: true,
    current: null,
    mark: [],
    path: [],
    edge: null,
    labels: {},
    out: null,
    show: "graph",
    indeg: [...indeg],
    ready: [...queue],
    topo: [...order],
    ...o,
  });
  const vars = () => ({ "queue size": queue.length, "in the order": order.length, removed });
  frames.push({ state: snap({}), note: `Count the edges pointing into each vertex. That count is its in-degree: how many things it still waits for.`, cost: 0, marker: 1, vars: vars() });
  for (let v = 0; v < g.n; v++) if (indeg[v] === 0) queue.push(v);
  frames.push({
    state: snap({ mark: [...queue] }),
    note: queue.length ? `${queue.length === 1 ? `Vertex ${queue[0]} has` : `Vertices ${queue.join(", ")} have`} in-degree 0: nothing to wait for. ${queue.length === 1 ? "It joins" : "They join"} the ready queue.` : "No vertex has in-degree 0. Every vertex waits for another, so the queue starts empty.",
    cost: 0,
    marker: 2,
    vars: vars(),
  });
  let takes = 0;
  while (queue.length) {
    const v = queue.shift() as number;
    takes++;
    let ask: VizAsk | null = null;
    if (opts.predict && takes >= 1 && takes % 2 === 1 && queue.length >= 1) {
      const last = queue[queue.length - 1];
      ask = {
        prompt: "Which vertex does Kahn's algorithm take from the queue next?",
        choices: choicesOf(`vertex ${v}`, [
          { label: `vertex ${last}`, why: `${last} joined the queue after ${v}. A queue gives out the oldest one first` },
          ...(indeg.some((d, i) => d > 0 && i !== v && !queue.includes(i)) ? [{ label: "a vertex that still has in-degree above 0", why: "A vertex only joins the queue when its in-degree reaches 0" }] : []),
        ]),
      };
    }
    order.push(v);
    frames.push({ state: snap({ current: v, mark: [v], path: [...order] }), note: `Take vertex ${v} from the front of the queue and put it next in the order. Everything it waited for is already there.`, cost: removed, marker: 3, vars: vars(), ask });
    for (const u of out[v]) {
      removed++;
      indeg[u]--;
      let rask: VizAsk | null = null;
      if (opts.predict && removed % 3 === 2) {
        const before = indeg[u] + 1;
        rask = {
          prompt: `Remove edge ${v} to ${u}. Vertex ${u} had in-degree ${before}. What does it have now?`,
          choices: choicesOf(String(indeg[u]), [
            { label: String(before), why: `Removing an edge that points at ${u} lowers its in-degree by 1` },
            { label: "0", why: indeg[u] === 0 ? "" : `${u} still waits for ${indeg[u]} more` },
          ]),
        };
        rask.choices = rask.choices.filter((c) => c.correct || c.why);
      }
      if (indeg[u] === 0) {
        queue.push(u);
        frames.push({ state: snap({ current: v, edge: [v, u], mark: [u], path: [...order] }), note: `Remove edge ${v} to ${u}. Vertex ${u} now has in-degree 0, so it joins the back of the queue.`, cost: removed, marker: 4, vars: vars(), ask: rask });
      } else {
        frames.push({ state: snap({ current: v, edge: [v, u], path: [...order] }), note: `Remove edge ${v} to ${u}. Vertex ${u} still waits for ${plural(indeg[u], "thing")}: its in-degree is ${indeg[u]}.`, cost: removed, marker: 4, vars: vars(), ask: rask });
      }
    }
  }
  const cycle = order.length < g.n;
  const stuck = cycle ? Array.from({ length: g.n }, (_, i) => i).filter((i) => !order.includes(i)) : [];
  frames.push({
    state: snap({ path: [...order], mark: stuck, out: cycle ? "cycle" : "valid order", ...(cycle ? { stuck } : {}) }),
    note: cycle
      ? `The queue is empty but only ${order.length} of ${g.n} vertices are in the order. Vertices ${stuck.join(", ")} each wait for another one of them: that is a cycle, so no order exists.`
      : `The queue is empty and all ${g.n} vertices are in the order: ${order.join(", ")}. Every edge points forward in it.`,
    cost: removed,
    marker: 5,
    vars: vars(),
  });
  return { frames, result: { order, cycle, stuck, removed } };
}

/** Kahn's algorithm as a script on the graph view. */
export function topoScript(g: TopoGraph, opts: { predict?: boolean; title?: string } = {}): Script<GraphState> & { summary: TopoResult } {
  const r = kahnFrames(g, opts);
  const result = r.result.cycle ? `a cycle: only ${r.result.order.length} of ${g.n} vertices could be placed` : `order ${r.result.order.join(", ")}; ${plural(r.result.removed, "edge")} removed`;
  return { view: "graph", title: opts.title || "Kahn's algorithm", costUnit: "edges removed", frames: r.frames, result, summary: r.result };
}
