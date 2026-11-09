/**
 * The graph model and its operations as step-by-step scripts (the "graph" view). Every operation is a pure function:
 * (graph, args) -> { script, graph after }. A graph has n vertices numbered 0 to n - 1 and a list of edges. It is stored two
 * ways at once in the picture: an adjacency list (for each vertex, the vertices it points to) and an adjacency matrix (an n by n
 * grid with a 1, or the weight, where an edge runs from the row to the column). An undirected edge is stored in both directions.
 *
 * The cost counter counts reads and writes of list entries or matrix cells. Plain-word narration, one sentence a step, written
 * for a first-time learner (Academy Part 2).
 */
import type { Frame, Script, GraphState } from "./types";

export type GraphEdge = { a: number; b: number; w: number | null };
export type GraphModel = { n: number; edges: GraphEdge[]; directed: boolean; weighted: boolean };

export type GraphOp = { op: "add_edge"; u: number; v: number; w?: number } | { op: "remove_edge"; u: number; v: number } | { op: "neighbors"; u: number } | { op: "degree"; u: number } | { op: "has_edge"; u: number; v: number };
export type GraphOpName = GraphOp["op"];

export const GRAPH_OPS: GraphOpName[] = ["add_edge", "remove_edge", "neighbors", "degree", "has_edge"];

export const GRAPH_OP_LABEL: Record<GraphOpName, string> = {
  add_edge: "Add edge",
  remove_edge: "Remove edge",
  neighbors: "Neighbours of",
  degree: "Degree of",
  has_edge: "Is there an edge",
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** A graph from a flat list of edge ends: u1, v1, u2, v2, ... (or u, v, weight triples when weighted). Repeats and self-loops are skipped. */
export function makeGraph(n: number, flat: number[], opts: { directed?: boolean; weighted?: boolean } = {}): GraphModel {
  const directed = !!opts.directed;
  const weighted = !!opts.weighted;
  const m: GraphModel = { n: Math.max(1, n), edges: [], directed, weighted };
  const step = weighted ? 3 : 2;
  for (let i = 0; i + 1 < flat.length; i += step) {
    const u = flat[i];
    const v = flat[i + 1];
    if (u === v || u < 0 || v < 0 || u >= m.n || v >= m.n || hasEdgeIn(m, u, v)) continue;
    m.edges.push({ a: u, b: v, w: weighted ? flat[i + 2] ?? 1 : null });
  }
  return m;
}

/** How many vertices a flat edge list needs. */
export const verticesFor = (flat: number[], weighted = false): number => {
  let hi = 0;
  const step = weighted ? 3 : 2;
  for (let i = 0; i + 1 < flat.length; i += step) hi = Math.max(hi, flat[i], flat[i + 1]);
  return hi + 1;
};

const hasEdgeIn = (m: GraphModel, u: number, v: number) => m.edges.some((e) => (e.a === u && e.b === v) || (!m.directed && e.a === v && e.b === u));
const edgeOf = (m: GraphModel, u: number, v: number) => m.edges.find((e) => (e.a === u && e.b === v) || (!m.directed && e.a === v && e.b === u));

/** The adjacency list: for each vertex the neighbours in the order their edges were added, with the weights. */
export function adjacency(m: Pick<GraphModel, "n" | "edges" | "directed">): { to: number; w: number | null }[][] {
  const rows: { to: number; w: number | null }[][] = Array.from({ length: m.n }, () => []);
  for (const e of m.edges) {
    rows[e.a].push({ to: e.b, w: e.w });
    if (!m.directed) rows[e.b].push({ to: e.a, w: e.w });
  }
  return rows;
}

export const graphText = (m: GraphModel) => `${m.directed ? "directed" : "undirected"}${m.weighted ? ", weighted" : ""} graph: ${plural(m.n, "vertex")}, ${plural(m.edges.length, "edge")}`;

export function snap(m: Pick<GraphModel, "n" | "edges" | "directed">, over: Partial<GraphState> = {}): GraphState {
  return { n: m.n, edges: m.edges.map((e) => ({ ...e })), directed: m.directed, current: null, mark: [], path: [], edge: null, labels: {}, out: null, show: "both", ...over };
}

const script = (title: string, frames: Frame<GraphState>[], result?: string): Script<GraphState> => ({ view: "graph", title, costUnit: "reads", frames, result });

export function stillScript(m: GraphModel, note: string, show: GraphState["show"] = "both"): Script<GraphState> {
  return { view: "graph", title: "Your graph", costUnit: "reads", frames: [{ state: snap(m, { show }), note, cost: 0 }], result: graphText(m) };
}

type Result = { script: Script<GraphState>; graph: GraphModel };
type Opts = { predict?: boolean; show?: GraphState["show"] };

export function addEdge(m0: GraphModel, u: number, v: number, w: number | undefined, opts: Opts = {}): Result {
  const show = opts.show ?? "both";
  const f: Frame<GraphState>[] = [];
  const name = m0.directed ? `${u} to ${v}` : `${u} and ${v}`;
  if (u === v) {
    f.push({ state: snap(m0, { current: u, show }), note: `An edge from ${u} to itself is a loop. This graph skips loops, so nothing changes.`, cost: 0 });
    return { script: script(`Add edge ${name}`, f, "a loop: skipped"), graph: m0 };
  }
  if (hasEdgeIn(m0, u, v)) {
    f.push({ state: snap(m0, { edge: [u, v], mark: [u, v], show }), note: `The edge ${name} is already there, so adding it again changes nothing.`, cost: 1, });
    return { script: script(`Add edge ${name}`, f, "already there"), graph: m0 };
  }
  const m: GraphModel = { ...m0, edges: [...m0.edges, { a: u, b: v, w: m0.weighted ? w ?? 1 : null }] };
  const writes = m.directed ? 1 : 2;
  f.push({ state: snap(m0, { mark: [u, v], show }), note: `Add the edge ${name}${m0.weighted ? ` with weight ${w ?? 1}` : ""}. First, nothing joins ${u} and ${v}.`, cost: 0 });
  f.push({
    state: snap(m, { edge: [u, v], mark: [u, v], show, out: plural(writes, "write") }),
    note: m.directed
      ? `Put ${v} at the end of the list of ${u}, and set one cell of the matrix: row ${u}, column ${v}. A directed edge is stored once.`
      : `Put ${v} in the list of ${u}, and ${u} in the list of ${v}. In the matrix, set two cells: (${u}, ${v}) and (${v}, ${u}). An undirected edge is stored both ways.`,
    cost: writes,
  });
  return { script: script(`Add edge ${name}`, f, `added ${name}`), graph: m };
}

export function removeEdge(m0: GraphModel, u: number, v: number): Result {
  const f: Frame<GraphState>[] = [];
  const name = m0.directed ? `${u} to ${v}` : `${u} and ${v}`;
  const e = edgeOf(m0, u, v);
  if (!e) {
    f.push({ state: snap(m0, { mark: [u, v], out: "no such edge" }), note: `There is no edge ${name}, so there is nothing to remove.`, cost: 1 });
    return { script: script(`Remove edge ${name}`, f, "no such edge"), graph: m0 };
  }
  const row = adjacency(m0)[u].findIndex((x) => x.to === v) + 1;
  f.push({ state: snap(m0, { edge: [u, v], mark: [u, v] }), note: `Find ${v} in the list of ${u}: ${plural(row, "read")}. The matrix needs just one read, of cell (${u}, ${v}).`, cost: row });
  const m: GraphModel = { ...m0, edges: m0.edges.filter((x) => x !== e) };
  f.push({ state: snap(m, { mark: [u, v], out: "edge removed" }), note: m0.directed ? `Take ${v} out of the list of ${u}, and clear one matrix cell.` : `Take ${v} out of the list of ${u} and ${u} out of the list of ${v}, and clear both matrix cells.`, cost: row + (m0.directed ? 1 : 2) });
  return { script: script(`Remove edge ${name}`, f, `removed ${name}`), graph: m };
}

export function neighbors(m: GraphModel, u: number, opts: Opts = {}): Result {
  const show = opts.show ?? "both";
  const row = adjacency(m)[u];
  const f: Frame<GraphState>[] = [];
  const word = m.directed ? "out-neighbours" : "neighbours";
  f.push({ state: snap(m, { current: u, show }), note: `Find the ${word} of ${u}: open the list of ${u}. With a list this is one lookup. With a matrix you would read the whole row of ${m.n} cells.`, cost: 1 });
  const seen: number[] = [];
  row.forEach((x, i) => {
    seen.push(x.to);
    f.push({ state: snap(m, { current: u, mark: [...seen], edge: [u, x.to], show }), note: `Read entry ${i + 1}: ${x.to}.`, cost: 1 + i + 1 });
  });
  f.push({ state: snap(m, { current: u, mark: seen, show, out: seen.length ? seen.join(" ") : "none" }), note: row.length ? `${u} has ${plural(row.length, "neighbour")}: ${seen.join(", ")}. The cost is the size of that one list, not of the whole graph.` : `${u} has no ${word}: its list is empty.`, cost: 1 + row.length });
  return { script: script(`${word[0].toUpperCase()}${word.slice(1)} of ${u}`, f, row.length ? `${word}: ${seen.join(", ")}` : `no ${word}`), graph: m };
}

export function degree(m: GraphModel, u: number, opts: Opts = {}): Result {
  const show = opts.show ?? "both";
  const row = adjacency(m)[u];
  const f: Frame<GraphState>[] = [];
  const outs = row.map((x) => x.to);
  f.push({
    state: snap(m, { current: u, mark: outs, show }),
    note: m.directed ? `In a directed graph a vertex has two degrees. The out-degree of ${u} is the length of its list: ${outs.length}.` : `The degree of ${u} is the number of edges that touch it: the length of its list, ${outs.length}.`,
    cost: 1,
  });
  if (m.directed) {
    const ins = m.edges.filter((e) => e.b === u).map((e) => e.a);
    f.push({ state: snap(m, { current: u, mark: ins, show, out: `out ${outs.length}, in ${ins.length}` }), note: `The in-degree counts edges that arrive at ${u}: ${ins.length}. A list does not store those with ${u}, so you scan every list (${plural(m.edges.length, "read")}) or keep a second list of arrivals.`, cost: 1 + m.edges.length });
    return { script: script(`Degree of ${u}`, f, `out ${outs.length}, in ${ins.length}`), graph: m };
  }
  f.push({ state: snap(m, { current: u, mark: outs, show, out: `degree ${outs.length}` }), note: `Degree ${outs.length}. Adding up the degrees of all vertices gives twice the number of edges, because each edge touches two vertices.`, cost: 1 });
  return { script: script(`Degree of ${u}`, f, `degree ${outs.length}`), graph: m };
}

export function hasEdge(m: GraphModel, u: number, v: number, opts: Opts = {}): Result {
  const show = opts.show ?? "both";
  const row = adjacency(m)[u];
  const at = row.findIndex((x) => x.to === v);
  const f: Frame<GraphState>[] = [];
  const name = m.directed ? `${u} to ${v}` : `${u} and ${v}`;
  const found = at >= 0;
  const reads = found ? at + 1 : row.length;
  f.push({
    state: snap(m, { current: u, show }),
    note: `Is there an edge ${name}? With a list, scan the list of ${u} for ${v}.`,
    cost: 0,
    ask: opts.predict
      ? { prompt: `Is there an edge ${name}?`, choices: [{ label: "Yes", correct: found, why: found ? `${v} is in the list of ${u}.` : `${v} is not in the list of ${u}.` }, { label: "No", correct: !found, why: found ? `${v} is in the list of ${u}.` : `${v} is not in the list of ${u}.` }] }
      : null,
  });
  const seen: number[] = [];
  for (let i = 0; i < (found ? at + 1 : row.length); i++) {
    seen.push(row[i].to);
    f.push({ state: snap(m, { current: u, mark: [...seen], edge: row[i].to === v ? [u, v] : null, show }), note: row[i].to === v ? `Read entry ${i + 1}: ${row[i].to}. Found ${v}.` : `Read entry ${i + 1}: ${row[i].to}, not ${v}.`, cost: i + 1 });
  }
  f.push({
    state: snap(m, { current: u, mark: found ? [u, v] : seen, edge: found ? [u, v] : null, show, out: found ? "yes" : "no" }),
    note: found ? `Yes: ${plural(reads, "read")} in the list. A matrix answers with one read of cell (${u}, ${v}).` : `No: the whole list of ${u} (${plural(reads, "read")}) does not hold ${v}. A matrix would answer with one read of cell (${u}, ${v}).`,
    cost: reads,
  });
  return { script: script(`Is there an edge ${name}?`, f, found ? "yes" : "no"), graph: m };
}

/** The list-and-matrix picture (a demo with view: memory): the same edges stored both ways, and what each costs in memory. */
export function graphMemoryPicture(m: GraphModel): Script<GraphState> {
  const e = m.edges.length;
  const entries = e * (m.directed ? 1 : 2);
  const f: Frame<GraphState>[] = [];
  f.push({ state: snap(m, { show: "graph" }), note: `A graph of ${plural(m.n, "vertex")} and ${plural(e, "edge")}. The circles are vertices and the lines are edges.`, cost: 0 });
  f.push({ state: snap(m, { show: "both" }), note: `An adjacency list keeps, for each vertex, the list of vertices it is joined to. Here it holds ${plural(entries, "entry")} in all.`, cost: 0 });
  f.push({ state: snap(m, { show: "all" }), note: `An adjacency matrix is a grid with a row and a column for each vertex. A 1 in row ${m.edges[0]?.a ?? 0}, column ${m.edges[0]?.b ?? 1} means an edge. It always holds ${m.n * m.n} cells.`, cost: 0, });
  f.push({ state: snap(m, { show: "all", out: `${entries} vs ${m.n * m.n}` }), note: `The list grows with the edges, ${entries} entries. The matrix grows with the square of the vertices, ${m.n * m.n} cells, even when most are empty.`, cost: 0 });
  return { view: "graph", title: "A graph as a list and as a matrix", costUnit: "reads", frames: f, result: `${entries} list entries or ${m.n * m.n} matrix cells` };
}

export function runGraphOp(m: GraphModel, op: GraphOp, opts: Opts = {}): Result {
  switch (op.op) {
    case "add_edge":
      return addEdge(m, op.u, op.v, op.w, opts);
    case "remove_edge":
      return removeEdge(m, op.u, op.v);
    case "neighbors":
      return neighbors(m, op.u, opts);
    case "degree":
      return degree(m, op.u, opts);
    case "has_edge":
      return hasEdge(m, op.u, op.v, opts);
  }
}
