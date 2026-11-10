/**
 * Union-find as step-engine frames (Academy Part 3, A4): the disjoint set union with path compression and union by size, run on a
 * stream of links. The "graph" view draws the run (GraphState with a parent for every vertex), so each group is a tree and all the
 * groups form a forest, with a table of parents and group sizes beside it.
 *
 *   find(x)   follow parent pointers up to the root (the vertex that is its own parent), then point every vertex on the walk
 *             straight at the root (path compression).
 *   union     find both roots. Equal roots: the two are already one group, and the link closes a loop. Otherwise the root of the
 *             smaller tree goes under the root of the larger one and the sizes add up (a tie puts the second root under the first).
 *
 * The cost counts parent pointers followed. Frames carry the same code markers as the lesson's template: [1] start, [2] walk up,
 * [3] path compression, [4] both roots found, [5] link the smaller tree under the larger. Pure and dependency-free, like every
 * generator here.
 */
import type { Frame, GraphState, Script, VizAsk } from "./types";
import { choicesOf } from "./topo";

export type DsuEdge = [number, number, number?];
export type DsuGraph = { n: number; edges: DsuEdge[] };
export type DsuResult = { groups: number; merged: number; redundant: number; tallest: number; hops: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function dsuFrames(g: DsuGraph, opts: { predict?: boolean } = {}): { frames: Frame<GraphState>[]; result: DsuResult } {
  const frames: Frame<GraphState>[] = [];
  const parent: number[] = Array.from({ length: g.n }, (_, i) => i);
  const size: number[] = Array(g.n).fill(1);
  let groups = g.n;
  let hops = 0;
  let merged = 0;
  let redundant = 0;
  const snap = (o: Partial<GraphState>): GraphState => ({
    n: g.n,
    edges: parent.flatMap((p, i) => (p === i ? [] : [{ a: i, b: p, w: null }])),
    directed: true,
    current: null,
    mark: [],
    path: [],
    edge: null,
    labels: {},
    out: `${plural(groups, "group")}`,
    show: "graph",
    parent: [...parent],
    size: [...size],
    ...o,
  });
  const vars = () => ({ groups, merged, "loop links": redundant, "pointers followed": hops });
  const walkOf = (x: number): number[] => {
    const path = [x];
    while (parent[path[path.length - 1]] !== path[path.length - 1]) path.push(parent[path[path.length - 1]]);
    return path;
  };
  const height = () => {
    let h = 0;
    for (let i = 0; i < g.n; i++) h = Math.max(h, walkOf(i).length - 1);
    return h;
  };
  frames.push({
    state: snap({ mark: Array.from({ length: g.n }, (_, i) => i) }),
    note: `Every account is its own parent, so every account is a root in a group of one: ${plural(g.n, "group")}.`,
    cost: 0,
    marker: 1,
    vars: vars(),
  });
  let k = 0;
  /** find(x): the walk up, then path compression. Returns the root. */
  const find = (x: number, which: string, ask: boolean): number => {
    const path = walkOf(x);
    const root = path[path.length - 1];
    const steps = path.length - 1;
    hops += steps;
    let a: VizAsk | null = null;
    if (opts.predict && ask && steps >= 1) {
      a = {
        prompt: `Walk up from account ${x}. Which account is its root?`,
        choices: choicesOf(`account ${root}`, [
          ...(parent[x] !== root ? [{ label: `account ${parent[x]}`, why: `Account ${parent[x]} still points to another account, so it is not a root` }] : []),
          ...(x !== root ? [{ label: `account ${x}`, why: `Account ${x} points to ${parent[x]}, so it is not its own parent` }] : []),
        ]),
      };
    }
    frames.push({
      state: snap({ current: x, path, mark: [root] }),
      note: steps
        ? `Find ${which}: walk up from ${path.join(", then ")}. Account ${root} is its own parent, so it is the root. That is ${plural(steps, "step")} up.`
        : `Find ${which}: account ${x} is its own parent, so it is a root.`,
      cost: hops,
      marker: 2,
      vars: vars(),
      ask: a,
    });
    if (path.length > 2) {
      for (const v of path.slice(0, -2)) parent[v] = root;
      frames.push({
        state: snap({ current: x, path, mark: [root], edge: [x, root] }),
        note: `Path compression: every account on the walk now points straight at ${root}. The next find from any of them takes one step.`,
        cost: hops,
        marker: 3,
        vars: vars(),
      });
    }
    return root;
  };
  for (const [a, b] of g.edges) {
    k++;
    const ra = find(a, `account ${a}`, k % 2 === 1);
    const rb = find(b, `account ${b}`, k % 2 === 0);
    if (ra === rb) {
      redundant++;
      frames.push({
        state: snap({ mark: [a, b], out: "already connected" }),
        note: `Link ${a} and ${b}: both have root ${ra}. They are already one group, so nothing is linked. In a graph, this link closes a loop.`,
        cost: hops,
        marker: 4,
        vars: vars(),
        ask: opts.predict
          ? {
              prompt: `Accounts ${a} and ${b} both reach root ${ra}. What does the link do?`,
              choices: choicesOf("Nothing: they are already one group", [
                { label: `Link ${rb} under ${ra}`, why: `They are the same root, ${ra}. A root cannot go under itself` },
                { label: "Lower the group count by 1", why: "The count falls only when two different groups merge" },
              ]),
            }
          : null,
      });
      continue;
    }
    // the smaller tree's root goes under the larger one; a tie puts the second root under the first
    const keep = size[ra] < size[rb] ? rb : ra;
    const move = keep === ra ? rb : ra;
    const tie = size[ra] === size[rb];
    const sizes = `Root ${ra} holds ${plural(size[ra], "account")} and root ${rb} holds ${plural(size[rb], "account")}`;
    const ask: VizAsk | null =
      opts.predict && size[ra] !== size[rb]
        ? {
            prompt: `${sizes}. Which root goes under the other?`,
            choices: choicesOf(`root ${move}`, [{ label: `root ${keep}`, why: `Root ${keep} has the bigger tree. Putting it under the smaller one would make the accounts of the bigger tree deeper` }]),
          }
        : null;
    parent[move] = keep;
    size[keep] += size[move];
    groups--;
    merged++;
    frames.push({
      state: snap({ current: move, edge: [move, keep], mark: [keep] }),
      note: `${sizes}. ${tie ? "The sizes are equal, so the second root goes under the first." : "The smaller tree goes under the larger one."} Root ${move} now points at ${keep}. ${plural(groups, "group")} left.`,
      cost: hops,
      marker: 5,
      vars: vars(),
      ask,
    });
  }
  const tallest = height();
  frames.push({
    state: snap({ mark: Array.from({ length: g.n }, (_, i) => i).filter((i) => parent[i] === i) }),
    note: `All ${plural(g.edges.length, "link")} are read. ${plural(groups, "group")} ${groups === 1 ? "remains" : "remain"}. ${plural(redundant, "link")} joined accounts that were already connected, so ${redundant === 1 ? "it" : "they"} closed a loop. The tallest tree is ${plural(tallest, "step")} high.`,
    cost: hops,
    marker: 5,
    vars: vars(),
  });
  return { frames, result: { groups, merged, redundant, tallest, hops } };
}

/** Union-find as a script on the graph view. */
export function dsuScript(g: DsuGraph, opts: { predict?: boolean; title?: string } = {}): Script<GraphState> & { summary: DsuResult } {
  const r = dsuFrames(g, opts);
  const s = r.result;
  const result = `${plural(s.groups, "group")} left; ${plural(s.redundant, "link")} closed a loop; ${plural(s.hops, "parent pointer")} followed`;
  return { view: "graph", title: opts.title || "Union-find", costUnit: "parent steps", frames: r.frames, result, summary: s };
}
