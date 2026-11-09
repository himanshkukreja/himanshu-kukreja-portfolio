/**
 * BFS and DFS as step-engine frames, on any graph: the traversal logic the grid view draws today and a graph view
 * (nodes and edges) will draw later. Nothing here knows about rows and columns: a graph is an adapter that names
 * its nodes and lists each node's neighbours in a fixed order (src/lib/dsa/viz/grid.ts is the grid adapter).
 *
 *   BFS  a queue. Take the front node, give each unvisited neighbour distance + 1 and add it at the back. Nodes are
 *        marked visited when they JOIN the queue (never when they leave it), so no node is queued twice. With a goal,
 *        the search stops when the goal leaves the queue, and the path is read back through each node's parent.
 *   DFS  the recursive version, drawn with its call stack: enter a node (numbered in visit order), go into the first
 *        unvisited neighbour, and when none is left, return to the node below on the stack (backtrack). With a goal,
 *        the search stops on entering it, and the path is the stack itself: a path, not the shortest one.
 *
 * Two frames per node (take / add for BFS, enter / backtrack for DFS), a running cost in nodes visited, the frontier's
 * size and its peak in the variable table, and optional predict-then-reveal asks at a few spaced steps.
 */
import type { Frame, Script, VizAsk } from "./types";

export type SearchAlgo = "bfs" | "dfs";

/** A graph as the search sees it. Node ids are 0..size-1; neighbours come in the order the search tries them. */
export type SearchGraph = {
  size: number;
  neighbours: (n: number) => number[];
  /** "(2, 3)" for a grid cell, "B" for a graph node */
  name: (n: number) => string;
};

/** The search's own state, the same for every view that draws a search (grid today, graph later). */
export type SearchState = {
  algo: SearchAlgo;
  /** BFS: the queue, front first. DFS: the call stack, bottom first (the last item is the node being visited). */
  frontier: number[];
  /** "frontier": discovered and waiting (BFS) or on the stack (DFS); "done": fully handled */
  status: Record<number, "frontier" | "done">;
  /** BFS: each discovered node's distance from the start. DFS: each visited node's visit number (1, 2, 3 …). */
  label: Record<number, number>;
  /** the node being handled this step */
  current: number | null;
  /** nodes that joined the frontier this step (drawn with a ring) */
  fresh: number[];
  /** neighbours looked at and skipped this step, because they were already visited */
  seen: number[];
  /** the node just left behind (DFS backtrack) */
  left: number | null;
  /** the path from the start to the goal, once found (BFS: the shortest; DFS: the one it walked) */
  path: number[];
  visited: number;
  maxFrontier: number;
  start: number;
  goal: number | null;
};

export type SearchResult = { found: boolean; steps: number | null; visited: number; maxFrontier: number; reachable: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Spread `k` asks over `n` steps, never on the first. */
function askAt(n: number, k: number): Set<number> {
  const out = new Set<number>();
  if (n < 2) return out;
  for (let j = 0; j < k; j++) out.add(Math.min(n - 1, 1 + Math.round((j * (n - 1)) / Math.max(1, k))));
  return out;
}

function choicesOf(right: string, wrong: { label: string; why: string }[], salt = ""): VizAsk["choices"] {
  const seen = new Set<string>([right]);
  const out: VizAsk["choices"] = [{ label: right, correct: true }];
  for (const w of wrong) {
    if (seen.has(w.label)) continue;
    seen.add(w.label);
    out.push({ label: w.label, correct: false, why: w.why });
  }
  // a stable shuffle (the same run always asks the same way), so the right answer is not always in one place
  let h = 7;
  for (const ch of salt + right + wrong.map((w) => w.label).join("|")) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
  const k = h % out.length;
  return [...out.slice(k), ...out.slice(0, k)];
}

/**
 * BFS from `start`. Frames: the start joins the queue; then, for each node, "take" (it leaves the front) and "add"
 * (its unvisited neighbours join the back with distance + 1); then, with a goal, the path.
 */
export function bfsFrames(g: SearchGraph, start: number, goal: number | null, opts: { predict?: boolean; asks?: number } = {}): { frames: Frame<SearchState>[]; result: SearchResult } {
  const frames: Frame<SearchState>[] = [];
  const status: SearchState["status"] = { [start]: "frontier" };
  const dist: Record<number, number> = { [start]: 0 };
  const parent: Record<number, number> = {};
  const queue: number[] = [start];
  let visited = 0;
  let maxFrontier = 1;
  const N = g.name;
  const snap = (o: Partial<SearchState>): SearchState => ({
    algo: "bfs",
    frontier: [...queue],
    status: { ...status },
    label: { ...dist },
    current: null,
    fresh: [],
    seen: [],
    left: null,
    path: [],
    visited,
    maxFrontier,
    start,
    goal,
    ...o,
  });
  const vars = () => ({ queue: queue.length, "max queue": maxFrontier, visited });
  frames.push({ state: snap({ fresh: [start] }), note: `Start: ${N(start)} gets distance 0 and joins the queue. It is marked visited now, as it joins.`, cost: 0, marker: 1, vars: vars() });

  // how many nodes BFS will take out, to spread the asks
  const total = (() => {
    const s = new Set([start]);
    const q = [start];
    for (let h = 0; h < q.length; h++) {
      if (q[h] === goal) return h + 1;
      for (const m of g.neighbours(q[h])) {
        if (s.has(m)) continue;
        s.add(m);
        q.push(m);
      }
    }
    return q.length;
  })();
  const asks = opts.predict ? askAt(total, opts.asks ?? 4) : new Set<number>();
  let found = false;
  let k = 0;
  while (queue.length) {
    const n = queue.shift() as number;
    const d = dist[n];
    visited++;
    const askHere = asks.has(k);
    // the take frame: which node leaves the queue?
    let ask: VizAsk | null = null;
    if (askHere && k % 2 === 1 && queue.length >= 1) {
      const newest = queue[queue.length - 1];
      ask = {
        prompt: `Which cell does BFS take out of the queue next?`,
        choices: choicesOf(N(n), [
          { label: N(newest), why: `${N(newest)} joined the queue last. A queue serves the oldest first: the front, ${N(n)}` },
          ...(queue[0] !== newest ? [{ label: N(queue[0]), why: `${N(queue[0])} is second in line. ${N(n)} is at the front` }] : []),
        ]),
      };
    }
    status[n] = "done";
    frames.push({ state: snap({ current: n }), note: `Take ${N(n)} from the front of the queue: distance ${d}.${n === goal ? "" : " Look at its neighbours."}`, cost: visited, marker: 2, vars: vars(), ask });
    if (n === goal) {
      found = true;
      break;
    }
    const fresh: number[] = [];
    const seen: number[] = [];
    for (const m of g.neighbours(n)) {
      if (status[m]) {
        seen.push(m);
        continue;
      }
      status[m] = "frontier";
      dist[m] = d + 1;
      parent[m] = n;
      queue.push(m);
      fresh.push(m);
    }
    maxFrontier = Math.max(maxFrontier, queue.length);
    let addAsk: VizAsk | null = null;
    if (askHere && !ask && fresh.length) {
      addAsk =
        k % 4 === 0
          ? {
              prompt: `${N(n)} is at distance ${d}. What distance do its new neighbours get?`,
              choices: choicesOf(String(d + 1), [
                { label: String(d), why: `that is ${N(n)}'s own distance. One more step away is ${d + 1}` },
                { label: String(d + 2), why: `each neighbour is one step from ${N(n)}, so ${d} + 1 = ${d + 1}` },
                ...(d > 0 ? [{ label: "1", why: "1 is only for the start's neighbours. Distance counts steps from the start" }] : []),
              ]),
            }
          : {
              prompt: `How many cells join the queue from ${N(n)}?`,
              choices: choicesOf(String(fresh.length), [0, 1, 2, 3, 4]
                .filter((x) => x !== fresh.length && x <= fresh.length + seen.length + 1)
                .slice(0, 3)
                .map((x) => ({ label: String(x), why: seen.length ? `only unvisited open neighbours join. ${plural(seen.length, "neighbour")} ${seen.length === 1 ? "is" : "are"} already visited` : `count the open neighbours that are not visited yet: ${fresh.length}` }))),
            };
    }
    const joined = fresh.map(N).join(", ");
    const note = fresh.length
      ? `${joined} ${fresh.length === 1 ? "joins" : "join"} the back of the queue with distance ${d + 1}.${seen.length ? ` ${seen.map(N).join(", ")} ${seen.length === 1 ? "is" : "are"} already visited: skipped.` : ""}`
      : seen.length
        ? `No new cells: ${seen.map(N).join(", ")} ${seen.length === 1 ? "is" : "are"} already visited.`
        : "No open neighbours here.";
    frames.push({ state: snap({ current: n, fresh, seen }), note, cost: visited, marker: 3, vars: vars(), ask: addAsk });
    k++;
  }
  const reachable = Object.keys(status).length;
  const path: number[] = [];
  if (goal !== null && found) {
    for (let x: number | undefined = goal; x !== undefined; x = parent[x]) path.unshift(x);
    const steps = path.length - 1;
    const finalAsk: VizAsk | null = opts.predict
      ? {
          prompt: `How many steps is the shortest path from ${N(start)} to ${N(goal)}?`,
          choices: choicesOf(String(steps), [
            { label: String(steps + 1), why: `count moves, not cells: ${path.length} cells make ${steps} moves` },
            { label: String(visited), why: `${visited} is how many cells BFS visited. The goal's distance is ${steps}` },
          ]),
        }
      : null;
    frames.push({ state: snap({ path, current: goal }), note: `${N(goal)} left the queue at distance ${steps}: the shortest path is ${plural(steps, "step")}. Follow each cell's parent back to the start to draw it.`, cost: visited, marker: 4, vars: vars(), ask: finalAsk });
  } else {
    frames.push({
      state: snap({}),
      note: goal === null ? `The queue is empty: every reachable cell has its distance. ${plural(visited, "cell")} visited.` : `The queue is empty and ${N(goal)} was never reached: no path. ${plural(visited, "cell")} visited.`,
      cost: visited,
      marker: 4,
      vars: vars(),
    });
  }
  return { frames, result: { found, steps: found ? path.length - 1 : null, visited, maxFrontier, reachable } };
}

/**
 * DFS from `start`, recursive, drawn with its call stack. Frames: "enter" a node (it gets the next visit number and
 * goes on the stack), and "backtrack" (no unvisited neighbour is left: it comes off the stack, back to the node below).
 */
export function dfsFrames(g: SearchGraph, start: number, goal: number | null, opts: { predict?: boolean; asks?: number } = {}): { frames: Frame<SearchState>[]; result: SearchResult } {
  const frames: Frame<SearchState>[] = [];
  const status: SearchState["status"] = {};
  const order: Record<number, number> = {};
  const stack: number[] = [];
  const next: Record<number, number> = {}; // how many neighbours each node on the stack has tried
  let visited = 0;
  let maxFrontier = 0;
  const N = g.name;
  const snap = (o: Partial<SearchState>): SearchState => ({
    algo: "dfs",
    frontier: [...stack],
    status: { ...status },
    label: { ...order },
    current: stack.length ? stack[stack.length - 1] : null,
    fresh: [],
    seen: [],
    left: null,
    path: [],
    visited,
    maxFrontier,
    start,
    goal,
    ...o,
  });
  const vars = () => ({ stack: stack.length, "max stack": maxFrontier, visited });

  // the number of steps (enters + backtracks) the run will take, to spread the asks
  const totalSteps = (() => {
    const s = new Set<number>();
    let steps = 0;
    let stop = false;
    const go = (n: number) => {
      if (stop) return;
      s.add(n);
      steps++;
      if (n === goal) return void (stop = true);
      for (const m of g.neighbours(n)) if (!s.has(m)) go(m);
      if (!stop) steps++;
    };
    go(start);
    return steps;
  })();
  const asks = opts.predict ? askAt(totalSteps, opts.asks ?? 4) : new Set<number>();
  let step = 0;
  let found = false;

  const enter = (n: number, from: number | null) => {
    stack.push(n);
    next[n] = 0;
    visited++;
    order[n] = visited;
    status[n] = "frontier";
    maxFrontier = Math.max(maxFrontier, stack.length);
    let ask: VizAsk | null = null;
    if (asks.has(step) && from !== null) {
      const others = g.neighbours(from).filter((m) => m !== n);
      ask = {
        prompt: `DFS is at ${N(from)}. Which cell does it go into next?`,
        choices: choicesOf(N(n), [
          ...others.filter((m) => status[m]).slice(0, 1).map((m) => ({ label: N(m), why: `${N(m)} is already visited. DFS only goes into unvisited cells` })),
          ...others.filter((m) => !status[m]).slice(0, 1).map((m) => ({ label: N(m), why: `DFS tries neighbours in a fixed order (up, right, down, left) and goes into the first unvisited one: ${N(n)}` })),
        ]),
      };
      if (ask.choices.length < 2) ask = null;
    }
    frames.push({
      state: snap({ fresh: [n] }),
      note: from === null ? `Start: visit ${N(n)} (number 1) and put it on the call stack. Mark it visited on entry.` : `Go deeper: ${N(n)} is the first unvisited neighbour of ${N(from)}. Visit it (number ${visited}) and push it on the stack.`,
      cost: visited,
      marker: from === null ? 1 : 2,
      vars: vars(),
      ask,
    });
    step++;
  };

  enter(start, null);
  if (start === goal) found = true;
  while (stack.length && !found) {
    const n = stack[stack.length - 1];
    const nb = g.neighbours(n);
    let went = false;
    while (next[n] < nb.length) {
      const m = nb[next[n]++];
      if (!status[m]) {
        enter(m, n);
        went = true;
        if (m === goal) found = true;
        break;
      }
    }
    if (found || went) continue;
    // stuck: backtrack
    stack.pop();
    status[n] = "done";
    const below = stack.length ? stack[stack.length - 1] : null;
    let ask: VizAsk | null = null;
    if (asks.has(step) && below !== null) {
      const unvisited = Array.from({ length: g.size }, (_, i) => i).filter((i) => !status[i] && g.neighbours(i).length >= 0);
      const jump = unvisited.find((i) => g.neighbours(i).some((m) => status[m] === "done"));
      ask = {
        prompt: `Every neighbour of ${N(n)} is a wall or visited. Where does DFS go now?`,
        choices: choicesOf(`back to ${N(below)}`, [
          ...(jump !== undefined ? [{ label: `jump to ${N(jump)}`, why: `DFS never jumps. It returns to the cell that called it, ${N(below)}, and tries that cell's next neighbour` }] : []),
          { label: "it stops: no path", why: `the stack is not empty yet. ${N(below)} may still have unvisited neighbours` },
        ]),
      };
    }
    frames.push({
      state: snap({ current: below, left: n }),
      note: below === null ? `${N(n)} has no unvisited neighbour, and the stack is now empty: DFS is done.` : `${N(n)} has no unvisited neighbour left: backtrack. It comes off the stack, and DFS is back at ${N(below)}.`,
      cost: visited,
      marker: 3,
      vars: vars(),
      ask,
    });
    step++;
  }
  const reachable = Object.keys(status).length;
  if (found && goal !== null) {
    const path = [...stack];
    frames.push({
      state: snap({ path, current: goal }),
      note: `Reached ${N(goal)}. The call stack is the path DFS walked: ${plural(path.length - 1, "step")}. It is a path, but DFS does not promise the shortest one.`,
      cost: visited,
      marker: 4,
      vars: vars(),
    });
    return { frames, result: { found: true, steps: path.length - 1, visited, maxFrontier, reachable } };
  }
  if (goal !== null) frames.push({ state: snap({}), note: `The stack is empty and ${N(goal)} was never reached: no path. ${plural(visited, "cell")} visited.`, cost: visited, marker: 4, vars: vars() });
  return { frames, result: { found: false, steps: null, visited, maxFrontier, reachable } };
}

/** BFS or DFS as a script on a view that draws `S` (the search state wrapped in its geometry). */
export function searchScript<S>(
  algo: SearchAlgo,
  g: SearchGraph,
  start: number,
  goal: number | null,
  wrap: (s: SearchState) => S,
  view: Script["view"],
  opts: { predict?: boolean; asks?: number; title?: string } = {},
): Script<S> & { summary: SearchResult } {
  const r = algo === "bfs" ? bfsFrames(g, start, goal, opts) : dfsFrames(g, start, goal, opts);
  const frames = r.frames.map((f) => ({ ...f, state: wrap(f.state) }));
  const unit = "cells visited";
  const res = r.result;
  const result =
    goal === null
      ? `${plural(res.visited, "cell")} reached; the ${algo === "bfs" ? "queue" : "stack"} held at most ${res.maxFrontier}`
      : res.found
        ? `${algo === "bfs" ? "shortest path" : "a path"}: ${plural(res.steps ?? 0, "step")}; ${res.visited} visited; max ${algo === "bfs" ? "queue" : "stack"} ${res.maxFrontier}`
        : `no path; ${res.visited} visited`;
  return { view, title: opts.title || (algo === "bfs" ? "BFS" : "DFS"), costUnit: unit, frames, result, summary: res };
}
