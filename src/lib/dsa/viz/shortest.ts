/**
 * Shortest paths as step-engine frames (Academy Part 3, A2): Dijkstra with a heap, and Bellman-Ford, on a directed
 * weighted graph. The "graph" view draws the run (GraphState with a distance table, the vertices whose distance is final
 * and the waiting heap), so the vertices sit on the same ring the graph lesson draws.
 *
 *   Dijkstra     a min-heap of (distance, vertex). Take the smallest entry: that vertex's distance is final. Relax each
 *                edge that leaves it: a cheaper way to the next vertex lowers its distance and joins the heap. A vertex can
 *                sit in the heap more than once; an entry older than the vertex's distance is stale and skipped. A vertex
 *                is never looked at again once it is final, which is exactly what a negative edge breaks.
 *   Bellman-Ford rounds of relaxing every edge in the listed order, until a round changes nothing (at most n - 1 rounds).
 *                One more changing round means a negative cycle.
 *
 * One frame per step (take, skip, relax an edge, finish a round), a running cost in edges relaxed, and optional
 * predict-then-reveal asks at a few spaced steps. Pure and dependency-free, like every generator here.
 */
import type { Frame, GraphState, Script, VizAsk } from "./types";
import { topoScript } from "./topo";

export type PathAlgo = "dijkstra" | "bellman-ford" | "kahn";
export type PathEdge = [number, number, number];
export type PathGraph = { n: number; edges: PathEdge[] };
export type PathResult = {
  dist: (number | null)[];
  /** the real shortest distances (Bellman-Ford), to compare with Dijkstra's answer */
  truth: (number | null)[];
  correct: boolean;
  relaxed: number;
  negativeCycle: boolean;
  goalDist: number | null;
  path: number[];
};

const INF = "∞";
export const distText = (d: number | null) => (d === null ? INF : String(d));
/** "5 + 2", or "5 - 3" for a negative cost */
const plus = (a: number, w: number) => (w < 0 ? `${a} - ${-w}` : `${a} + ${w}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The real distances by Bellman-Ford (n rounds), and whether a negative cycle can be reached from `src`. */
export function truthOf(g: PathGraph, src: number): { dist: (number | null)[]; cycle: boolean } {
  const d: (number | null)[] = Array(g.n).fill(null);
  d[src] = 0;
  let changed = false;
  for (let r = 0; r < g.n; r++) {
    changed = false;
    for (const [a, b, w] of g.edges) {
      const da = d[a];
      if (da !== null && (d[b] === null || da + w < (d[b] as number))) {
        d[b] = da + w;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { dist: d, cycle: changed };
}

function choicesOf(right: string, wrong: { label: string; why: string }[], salt = ""): VizAsk["choices"] {
  const seen = new Set<string>([right]);
  const out: VizAsk["choices"] = [{ label: right, correct: true }];
  for (const w of wrong) {
    if (seen.has(w.label)) continue;
    seen.add(w.label);
    out.push({ label: w.label, correct: false, why: w.why });
  }
  let h = 11;
  for (const ch of salt + right + wrong.map((w) => w.label).join("|")) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
  const k = h % out.length;
  return [...out.slice(k), ...out.slice(0, k)];
}

type HeapEntry = [number, number];
const cmp = (x: HeapEntry, y: HeapEntry) => x[0] - y[0] || x[1] - y[1];

function stateOf(g: PathGraph, source: number, target: number | null, over: Partial<GraphState>): GraphState {
  return {
    n: g.n,
    edges: g.edges.map(([a, b, w]) => ({ a, b, w })),
    directed: true,
    current: null,
    mark: [],
    path: [],
    edge: null,
    labels: { S: source, ...(target !== null ? { T: target } : {}) },
    out: null,
    show: "graph",
    ...over,
  };
}

/** Which of the `count` candidate steps carry an ask: spread over the run, never the first. */
function askSet(count: number, k: number): Set<number> {
  const s = new Set<number>();
  for (let j = 0; j < k && count > 1; j++) s.add(Math.min(count - 1, 1 + Math.round((j * (count - 1)) / Math.max(1, k))));
  return s;
}

export function dijkstraFrames(g: PathGraph, source: number, target: number | null, opts: { predict?: boolean; asks?: number } = {}): { frames: Frame<GraphState>[]; result: PathResult } {
  const frames: Frame<GraphState>[] = [];
  const dist: (number | null)[] = Array(g.n).fill(null);
  const done = new Set<number>();
  const parent: Record<number, number> = {};
  const heap: HeapEntry[] = [];
  const out: Record<number, [number, number][]> = {};
  for (const [a, b, w] of g.edges) (out[a] ||= []).push([b, w]);
  let relaxed = 0;
  let pops = 0;
  dist[source] = 0;
  heap.push([0, source]);
  const snap = (o: Partial<GraphState>) =>
    stateOf(g, source, target, {
      dist: [...dist],
      done: [...done],
      heap: [...heap].sort(cmp).map(([d, v]) => (done.has(v) || d > (dist[v] as number) ? ([d, v, 1] as [number, number, number]) : ([d, v] as [number, number]))),
      ...o,
    });
  const vars = () => ({ "heap size": heap.length, final: done.size, relaxed });
  frames.push({ state: snap({ current: source, mark: [source] }), note: `Start: vertex ${source} gets distance 0 and joins the heap. Every other vertex is not reached yet (${INF}).`, cost: 0, marker: 1, vars: vars() });

  // plan the asks: the 2nd and 4th take with company in the heap, and the first improvements
  const asks = opts.predict ? askSet(Math.max(2, g.edges.length), opts.asks ?? 4) : new Set<number>();
  let seenImprove = 0;
  let seenTake = 0;
  let found = false;
  while (heap.length) {
    heap.sort(cmp);
    const [d, v] = heap.shift() as HeapEntry;
    const stale = done.has(v) || d > (dist[v] as number);
    if (stale) {
      frames.push({ state: snap({ current: v }), note: `Take (${d}, ${v}) from the heap. Vertex ${v} already has distance ${dist[v]}, so this entry is stale. Skip it.`, cost: relaxed, marker: 3, vars: vars() });
      continue;
    }
    pops++;
    let ask: VizAsk | null = null;
    if (opts.predict && heap.length >= 1 && pops >= 2 && pops % 2 === 0 && asks.size) {
      const live = heap.filter(([dd, vv]) => !done.has(vv) && dd <= (dist[vv] as number));
      const big = [...live].sort(cmp)[live.length - 1];
      if (big && big[1] !== v) {
        ask = {
          prompt: "Which vertex does Dijkstra take from the heap next?",
          choices: choicesOf(`vertex ${v}, distance ${d}`, [
            { label: `vertex ${big[1]}, distance ${big[0]}`, why: `${big[0]} is the biggest waiting distance. A min-heap gives out the smallest: ${d}` },
            ...(live.length > 2 ? [{ label: `the newest entry`, why: "A heap does not care which entry came last. It gives out the smallest distance" }] : []),
          ]),
        };
      }
    }
    done.add(v);
    frames.push({ state: snap({ current: v, mark: [v] }), note: `Take (${d}, ${v}), the smallest entry. Vertex ${v} is now final: its distance is ${d}.`, cost: relaxed, marker: 2, vars: vars(), ask });
    seenTake++;
    if (target !== null && v === target) {
      found = true;
      break;
    }
    for (const [u, w] of out[v] ?? []) {
      relaxed++;
      const nd = d + w;
      const old = dist[u];
      const better = old === null || nd < old;
      const wsign = String(w);
      if (done.has(u)) {
        const note = better
          ? `Edge ${v} to ${u} (${wsign}): ${plus(d, w)} = ${nd} would beat ${u}'s ${old}. But ${u} is already final, and Dijkstra never looks at a final vertex again. It keeps ${old}.`
          : `Edge ${v} to ${u} (${wsign}): ${plus(d, w)} = ${nd}. Vertex ${u} is already final with ${old}: no change.`;
        frames.push({ state: snap({ current: v, edge: [v, u], out: better ? "too late" : null }), note, cost: relaxed, marker: 4, vars: vars() });
      } else if (better) {
        let rask: VizAsk | null = null;
        if (opts.predict && asks.has(seenImprove) && old !== null) {
          rask = {
            prompt: `Relax edge ${v} to ${u}: ${u} has ${old}. What does ${u} have afterwards?`,
            choices: choicesOf(String(nd), [
              { label: String(old), why: `${plus(d, w)} = ${nd} is smaller than ${old}, so the distance is lowered` },
              { label: String(w), why: `${w} is only this edge. The distance counts everything from the start: ${plus(d, w)} = ${nd}` },
            ]),
          };
        } else if (opts.predict && asks.has(seenImprove) && old === null) {
          rask = {
            prompt: `Relax edge ${v} to ${u}. ${u} has not been reached. What is its distance now?`,
            choices: choicesOf(String(nd), [
              { label: String(w), why: `${w} is only this edge. Add the ${d} it took to reach ${v}: ${nd}` },
              { label: String(d), why: `${d} is ${v}'s distance. The way to ${u} also pays the edge's ${wsign}: ${nd}` },
            ]),
          };
        }
        seenImprove++;
        dist[u] = nd;
        parent[u] = v;
        heap.push([nd, u]);
        frames.push({
          state: snap({ current: v, edge: [v, u], mark: [u] }),
          note: `Edge ${v} to ${u} (${wsign}): ${plus(d, w)} = ${nd}${old === null ? ", the first way to reach" : `, better than ${old} for`} vertex ${u}. Its distance becomes ${nd}, and (${nd}, ${u}) joins the heap.`,
          cost: relaxed,
          marker: 5,
          vars: vars(),
          ask: rask,
        });
      } else {
        frames.push({ state: snap({ current: v, edge: [v, u] }), note: `Edge ${v} to ${u} (${wsign}): ${plus(d, w)} = ${nd}, not better than ${u}'s ${old}. No change.`, cost: relaxed, marker: 4, vars: vars() });
      }
    }
  }
  void seenTake;
  const truth = truthOf(g, source);
  const path: number[] = [];
  if (target !== null && found) for (let x: number | undefined = target; x !== undefined; x = parent[x]) path.unshift(x);
  const wrong = truth.cycle ? [] : dist.map((x, i) => (x !== truth.dist[i] ? i : -1)).filter((i) => i >= 0);
  const correct = !truth.cycle && wrong.length === 0;
  const goalDist = target !== null ? dist[target] : null;
  let note: string;
  if (target !== null && found) {
    note = `Vertex ${target} left the heap with ${goalDist}: the cheapest cost from ${source} to ${target} is ${goalDist}, by ${path.join(", ")}.`;
    if (target !== null && truth.dist[target] !== goalDist) note += ` But the real cheapest is ${distText(truth.dist[target])}: a negative edge fooled Dijkstra.`;
  } else if (target !== null && dist[target] === null) {
    note = `The heap is empty and ${target} was never reached: there is no route.`;
  } else {
    note = `The heap is empty. Every reachable vertex has its final distance: ${plural(relaxed, "edge")} relaxed.`;
  }
  if (!correct && target === null) note += ` But ${wrong.length ? `the real cheapest ${wrong.length === 1 ? "distance" : "distances"} to ${wrong.join(", ")} ${wrong.length === 1 ? "is" : "are"} lower` : "a negative cycle makes cheapest costs unlimited"}: a negative edge fooled Dijkstra.`;
  frames.push({
    state: snap({ path, current: found && target !== null ? target : null, mark: !correct ? wrong : [], out: !correct ? "wrong answer" : null }),
    note,
    cost: relaxed,
    marker: 5,
    vars: vars(),
  });
  return { frames, result: { dist, truth: truth.dist, correct, relaxed, negativeCycle: truth.cycle, goalDist, path } };
}

export function bellmanFordFrames(g: PathGraph, source: number, target: number | null, opts: { predict?: boolean; asks?: number } = {}): { frames: Frame<GraphState>[]; result: PathResult } {
  const frames: Frame<GraphState>[] = [];
  const dist: (number | null)[] = Array(g.n).fill(null);
  dist[source] = 0;
  let relaxed = 0;
  const snap = (o: Partial<GraphState>) => stateOf(g, source, target, { dist: [...dist], done: [], ...o });
  frames.push({ state: snap({ current: source, mark: [source] }), note: `Start: vertex ${source} has distance 0 and every other vertex is not reached (${INF}). Each round relaxes every edge once, in the listed order.`, cost: 0, marker: 1, vars: { round: 0, relaxed } });
  let cycle = false;
  let ask = 0;
  const askAt = opts.predict ? askSet(g.edges.length, opts.asks ?? 3) : new Set<number>();
  let seen = 0;
  for (let round = 1; round <= g.n; round++) {
    let lowered = 0;
    for (const [a, b, w] of g.edges) {
      relaxed++;
      const da = dist[a];
      const old = dist[b];
      if (da === null) {
        frames.push({ state: snap({ edge: [a, b], out: `round ${round}` }), note: `Round ${round}, edge ${a} to ${b} (${w}): vertex ${a} is not reached yet, so there is nothing to add. No change.`, cost: relaxed, marker: 3, vars: { round, relaxed } });
        continue;
      }
      const nd = da + w;
      if (old === null || nd < old) {
        let qa: VizAsk | null = null;
        if (opts.predict && askAt.has(seen) && ask < (opts.asks ?? 3) && round <= 2) {
          ask++;
          qa = {
            prompt: `Round ${round}, edge ${a} to ${b} (${w}). Vertex ${a} has ${da}. What does ${b} have afterwards?`,
            choices: choicesOf(String(nd), [
              ...(old !== null ? [{ label: String(old), why: `${plus(da, w)} = ${nd} is smaller than ${old}, so ${b} is lowered` }] : []),
              { label: String(w), why: `${w} is only this edge. Add ${a}'s ${da}: ${nd}` },
            ]),
          };
        }
        seen++;
        dist[b] = nd;
        lowered++;
        frames.push({ state: snap({ current: a, edge: [a, b], mark: [b], out: `round ${round}` }), note: `Round ${round}, edge ${a} to ${b} (${w}): ${plus(da, w)} = ${nd}${old === null ? ", the first way to reach" : `, better than ${old} for`} vertex ${b}. Its distance becomes ${nd}.`, cost: relaxed, marker: 3, vars: { round, relaxed }, ask: qa });
      } else {
        seen++;
        frames.push({ state: snap({ current: a, edge: [a, b], out: `round ${round}` }), note: `Round ${round}, edge ${a} to ${b} (${w}): ${plus(da, w)} = ${nd}, not better than ${b}'s ${old}. No change.`, cost: relaxed, marker: 3, vars: { round, relaxed } });
      }
    }
    if (!lowered) {
      frames.push({ state: snap({ out: `round ${round}` }), note: `Round ${round} lowered nothing, so every distance is final. Bellman-Ford stops.`, cost: relaxed, marker: 4, vars: { round, relaxed } });
      break;
    }
    if (round === g.n) {
      cycle = true;
      frames.push({ state: snap({ out: "negative cycle" }), note: `Round ${round} still lowered a distance, but a cheapest path never needs more than ${g.n - 1} edges. So a negative cycle exists: going round it makes the cost smaller every time.`, cost: relaxed, marker: 4, vars: { round, relaxed } });
    } else {
      frames.push({ state: snap({ out: `round ${round} done` }), note: `Round ${round} is over: ${plural(lowered, "distance")} lowered. Another round.`, cost: relaxed, marker: 2, vars: { round, relaxed } });
    }
  }
  const truth = truthOf(g, source);
  return { frames, result: { dist, truth: truth.dist, correct: !cycle, relaxed, negativeCycle: cycle, goalDist: target !== null ? dist[target] : null, path: [] } };
}

/** Dijkstra or Bellman-Ford as a script on the graph view. */
export function pathScript(algo: PathAlgo, g: PathGraph, source: number, target: number | null, opts: { predict?: boolean; asks?: number; title?: string } = {}): Script<GraphState> & { summary: PathResult } {
  if (algo === "kahn") return topoScript(g, opts) as unknown as Script<GraphState> & { summary: PathResult };
  const r = algo === "dijkstra" ? dijkstraFrames(g, source, target, opts) : bellmanFordFrames(g, source, target, opts);
  const s = r.result;
  const result = s.negativeCycle
    ? "a negative cycle: no cheapest cost exists"
    : algo === "dijkstra" && !s.correct
      ? `Dijkstra's answer is wrong here; ${plural(s.relaxed, "edge")} relaxed`
      : `distances ${s.dist.map(distText).join(", ")}; ${plural(s.relaxed, "edge")} relaxed`;
  return { view: "graph", title: opts.title || (algo === "dijkstra" ? "Dijkstra" : "Bellman-Ford"), costUnit: "edges relaxed", frames: r.frames, result, summary: s };
}
