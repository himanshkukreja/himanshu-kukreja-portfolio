/**
 * The binary heap model and its operations as step-by-step scripts (the "heap" view). Every operation is a pure function:
 * (heap, args) -> { script, heap after }. A heap is one array holding a complete binary tree level by level: the parent of
 * index i is (i - 1) // 2, and its children are 2i + 1 and 2i + 2. In a min-heap every parent is no larger than its
 * children, so the smallest value sits in cell 0 (a max-heap is the same with the comparisons turned round).
 *
 * The cost counter counts steps: a comparison or a swap. Tie rules are fixed (the same as the lab): a push stops when the
 * parent is equal, and a pop sifts down toward the smaller child, the left one when both are equal.
 * Plain-word narration, one sentence a step, written for a first-time learner (Academy Part 2).
 */
import type { Frame, Script, HeapState } from "./types";

export type HeapKind = "min" | "max";
export type HeapModel = { cells: number[]; kind: HeapKind };

export type HeapOp = { op: "push"; value: number } | { op: "pop" } | { op: "peek" } | { op: "heapify" } | { op: "topk"; value: number };
export type HeapOpName = HeapOp["op"];

export const HEAP_OPS: HeapOpName[] = ["push", "pop", "peek", "heapify", "topk"];

export const HEAP_OP_LABEL: Record<HeapOpName, string> = {
  push: "Push",
  pop: "Pop",
  peek: "Peek",
  heapify: "Heapify the typed values",
  topk: "Top k of the typed values",
};

/** a belongs above b */
const above = (kind: HeapKind, a: number, b: number) => (kind === "min" ? a < b : a > b);
const parentOf = (i: number) => (i - 1) >> 1;
const word = (kind: HeapKind) => (kind === "min" ? "smaller" : "larger");
const top = (kind: HeapKind) => (kind === "min" ? "smallest" : "largest");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** A heap built by pushing the values one at a time (the sandbox's "start from these values"). */
export function makeHeap(values: number[], kind: HeapKind = "min"): HeapModel {
  const cells: number[] = [];
  for (const v of values) {
    cells.push(v);
    let i = cells.length - 1;
    while (i > 0 && above(kind, cells[i], cells[parentOf(i)])) {
      [cells[i], cells[parentOf(i)]] = [cells[parentOf(i)], cells[i]];
      i = parentOf(i);
    }
  }
  return { cells, kind };
}

/** The values laid out exactly as given, in no particular order (the input of heapify). */
export const rawHeap = (values: number[], kind: HeapKind = "min"): HeapModel => ({ cells: values.slice(), kind });

export const heapSize = (m: HeapModel) => m.cells.length;
export const heapHeight = (m: HeapModel) => (m.cells.length ? Math.floor(Math.log2(m.cells.length)) + 1 : 0);
export const isHeap = (m: HeapModel) => m.cells.every((v, i) => i === 0 || !above(m.kind, v, m.cells[parentOf(i)]));
export const heapText = (m: HeapModel) => (m.cells.length ? `${plural(m.cells.length, "value")}, ${heapHeight(m)} level${heapHeight(m) === 1 ? "" : "s"}; array: ${m.cells.join(", ")}` : "empty heap");

function snap(cells: number[], kind: HeapKind, over: Partial<HeapState> = {}): HeapState {
  return { values: cells.map(String), compare: null, swap: null, current: null, mark: [], path: [], labels: {}, out: null, indexes: true, show: "both", kind, ...over };
}

const script = (title: string, frames: Frame<HeapState>[], result?: string): Script<HeapState> => ({ view: "heap", title, costUnit: "steps", frames, result });

export function stillScript(m: HeapModel, note: string): Script<HeapState> {
  return { view: "heap", title: "Your heap", costUnit: "steps", frames: [{ state: snap(m.cells, m.kind), note, cost: 0 }], result: heapText(m) };
}

type Result = { script: Script<HeapState>; heap: HeapModel };

/** Sift the item at i up, recording a frame for each comparison and swap. Returns the swaps made. */
function siftUp(cells: number[], i: number, kind: HeapKind, frames: Frame<HeapState>[], cost: { n: number }): number {
  const v = cells[i];
  let swaps = 0;
  while (i > 0) {
    const p = parentOf(i);
    cost.n += 1;
    frames.push({ state: snap(cells, kind, { compare: [i, p], current: i }), note: `Compare ${v} with its parent ${cells[p]}.`, cost: cost.n });
    if (!above(kind, cells[i], cells[p])) {
      frames.push({ state: snap(cells, kind, { current: i, mark: [i] }), note: `${v} is not ${word(kind)} than ${cells[p]}, so it stays. The order rule holds.`, cost: cost.n });
      return swaps;
    }
    [cells[i], cells[p]] = [cells[p], cells[i]];
    cost.n += 1;
    swaps++;
    frames.push({ state: snap(cells, kind, { swap: [p, i], current: p }), note: `${v} is ${word(kind)} than its parent, so they swap. ${v} climbs one level.`, cost: cost.n });
    i = p;
  }
  frames.push({ state: snap(cells, kind, { current: 0, mark: [0] }), note: `${v} has reached the top, so it cannot climb any more.`, cost: cost.n });
  return swaps;
}

/** Sift the item at i down (to the smaller child for a min-heap), recording frames. `quiet` records only swaps. */
function siftDown(cells: number[], i: number, size: number, kind: HeapKind, frames: Frame<HeapState>[], cost: { n: number }, quiet = false): number {
  const v = cells[i];
  let swaps = 0;
  for (;;) {
    const l = 2 * i + 1;
    if (l >= size) {
      if (!quiet || swaps === 0) frames.push({ state: snap(cells.slice(0, size), kind, { current: i, mark: [i] }), note: swaps ? `${v} has no children left, so it stops.` : `${v} has no children, so it stays.`, cost: cost.n });
      return swaps;
    }
    let c = l;
    const r = l + 1;
    if (r < size) {
      cost.n += 1;
      if (above(kind, cells[r], cells[l])) c = r;
      if (!quiet) frames.push({ state: snap(cells.slice(0, size), kind, { compare: [l, r], current: i }), note: `Compare the two children, ${cells[l]} and ${cells[r]}. ${cells[c]} is the ${word(kind)} one.`, cost: cost.n });
    }
    cost.n += 1;
    if (!above(kind, cells[c], cells[i])) {
      if (!quiet || swaps === 0) frames.push({ state: snap(cells.slice(0, size), kind, { compare: [i, c], current: i }), note: `${v} is not ${kind === "min" ? "larger" : "smaller"} than its ${word(kind)} child ${cells[c]}, so it stops. The order rule holds.`, cost: cost.n });
      return swaps;
    }
    [cells[i], cells[c]] = [cells[c], cells[i]];
    cost.n += 1;
    swaps++;
    frames.push({ state: snap(cells.slice(0, size), kind, { swap: [i, c], current: c }), note: `${v} swaps with its ${word(kind)} child ${cells[i]}. ${v} sinks one level.`, cost: cost.n });
    i = c;
  }
}

export function push(m0: HeapModel, value: number, opts: { predict?: boolean } = {}): Result {
  const kind = m0.kind;
  const cells = [...m0.cells, value];
  const i = cells.length - 1;
  const frames: Frame<HeapState>[] = [];
  const cost = { n: 0 };
  // the swaps this push will need: found by running it on a copy first, so the question can be asked up front
  const probe = cells.slice();
  let k = i;
  let will = 0;
  while (k > 0 && above(kind, probe[k], probe[parentOf(k)])) {
    [probe[k], probe[parentOf(k)]] = [probe[parentOf(k)], probe[k]];
    k = parentOf(k);
    will++;
  }
  const levels = Math.floor(Math.log2(cells.length));
  const choices = Array.from({ length: Math.min(levels, 4) + 1 }, (_, n) => n);
  frames.push({
    state: snap(cells, kind, { current: i, mark: [i] }),
    note: `Add ${value} in the first free cell, at the end of the array. That keeps the tree complete, but ${value} may be in the wrong place.`,
    cost: 0,
    ask:
      opts.predict && cells.length > 1
        ? {
            prompt: `${value} goes in the last cell. How many times will it swap with its parent?`,
            choices: choices.map((n) => ({ label: plural(n, "swap"), correct: n === will, why: `It swaps ${plural(will, "time")}: it climbs while it is ${word(kind)} than its parent.` })),
          }
        : null,
  });
  const swaps = siftUp(cells, i, kind, frames, cost);
  frames.push({ state: snap(cells, kind, { mark: [cells.indexOf(value)], out: swaps ? `${value} climbed ${swaps}` : `${value} stays` }), note: `Done: ${plural(swaps, "swap")} and ${plural(cost.n, "step")}. A push follows one path up, so it costs at most the height of the tree.`, cost: cost.n });
  return { script: script(`Push ${value}`, frames, `pushed ${value}: ${plural(swaps, "swap")}`), heap: { cells, kind } };
}

export function pop(m0: HeapModel, opts: { predict?: boolean } = {}): Result {
  const kind = m0.kind;
  if (!m0.cells.length) return { script: stillScript(m0, "The heap is empty, so there is nothing to pop. A pop on an empty heap returns -1 in the lab."), heap: m0 };
  const cells = m0.cells.slice();
  const topV = cells[0];
  const frames: Frame<HeapState>[] = [];
  const cost = { n: 0 };
  frames.push({ state: snap(cells, kind, { mark: [0], out: `returns ${topV}` }), note: `Pop returns the top, ${topV}, the ${top(kind)} value. The top cell cannot stay empty.`, cost: 0 });
  if (cells.length === 1) {
    frames.push({ state: snap([], kind, { out: `returns ${topV}` }), note: `That was the only value, so the heap is now empty.`, cost: 1 });
    return { script: script("Pop", frames, `popped ${topV}`), heap: { cells: [], kind } };
  }
  const last = cells.pop() as number;
  cells[0] = last;
  cost.n = 1;
  const afterMove = cells.slice();
  frames.push({
    state: snap(afterMove, kind, { current: 0 }),
    note: `Move the last item, ${last}, to the top and shorten the array. The tree is complete again, but ${last} is probably in the wrong place.`,
    cost: 1,
    ask:
      opts.predict && cells.length > 2
        ? (() => {
            const l = 1;
            const r = 2;
            const pick = above(kind, cells[r], cells[l]) ? r : l;
            const willMove = above(kind, cells[pick], cells[0]);
            const labelFor = (i: number) => `${cells[i]} (cell ${i})`;
            return {
              prompt: `${last} sits at the top. Which cell does it swap with first?`,
              choices: [
                { label: labelFor(l), correct: willMove && pick === l, why: "It swaps with the " + word(kind) + " of its two children." },
                { label: labelFor(r), correct: willMove && pick === r, why: "It swaps with the " + word(kind) + " of its two children." },
                { label: "Neither: it stays", correct: !willMove, why: `It is already ${kind === "min" ? "no larger" : "no smaller"} than both children.` },
              ],
            };
          })()
        : null,
  });
  const swaps = siftDown(cells, 0, cells.length, kind, frames, cost);
  frames.push({ state: snap(cells, kind, { mark: [0], out: `top is ${cells[0]}` }), note: `Done: the new top is ${cells[0]}, after ${plural(swaps, "swap")} and ${plural(cost.n, "step")}. A pop follows one path down, so it costs at most the height of the tree.`, cost: cost.n });
  return { script: script("Pop", frames, `popped ${topV}`), heap: { cells, kind } };
}

export function peek(m: HeapModel): Result {
  if (!m.cells.length) return { script: stillScript(m, "The heap is empty, so there is nothing to peek at. A peek on an empty heap returns -1 in the lab."), heap: m };
  const f: Frame<HeapState>[] = [{ state: snap(m.cells, m.kind, { mark: [0], out: `top is ${m.cells[0]}` }), note: `Peek reads cell 0: ${m.cells[0]}. The order rule puts the ${top(m.kind)} value on top, so one read answers it, however big the heap is.`, cost: 1 }];
  return { script: script("Peek", f, `top is ${m.cells[0]}`), heap: m };
}

/** Heapify: the values as laid out are not a heap yet; sift down from the last parent back to cell 0. */
export function heapify(m0: HeapModel): Result {
  const kind = m0.kind;
  const cells = m0.cells.slice();
  const n = cells.length;
  const frames: Frame<HeapState>[] = [];
  const cost = { n: 0 };
  frames.push({
    state: snap(cells, kind, { out: isHeap(m0) ? "already a heap" : "not a heap yet" }),
    note: n < 2 ? "With fewer than two values there is nothing to fix." : `These ${n} values are laid out as a tree in the order given. Heapify fixes it in place, working from the middle of the array back to cell 0.`,
    cost: 0,
  });
  if (n >= 2) {
    const start = (n >> 1) - 1;
    frames.push({ state: snap(cells, kind, { current: start, mark: Array.from({ length: n - start - 1 }, (_, j) => start + 1 + j) }), note: `Every cell from ${start + 1} to ${n - 1} is a leaf, and a leaf is already a heap of one. Start at cell ${start}, the last cell with a child.`, cost: 0 });
    for (let i = start; i >= 0; i--) {
      const was = cells[i];
      const before = frames.length;
      const swaps = siftDown(cells, i, n, kind, frames, cost, true);
      if (!swaps && frames.length === before) frames.push({ state: snap(cells, kind, { current: i }), note: `${was} is already in place.`, cost: cost.n });
    }
  }
  frames.push({ state: snap(cells, kind, { mark: [0], out: "heap built" }), note: `The array is a heap, built in place in ${plural(cost.n, "step")}. Most values sat near the bottom and moved only a step or two, so building costs O(n), cheaper than n pushes.`, cost: cost.n });
  return { script: script("Heapify", frames, `built a heap in ${plural(cost.n, "step")}`), heap: { cells, kind } };
}

/** The k largest of a stream: a min-heap of size k. The stream is run from an empty heap. */
export function topk(stream: number[], k0: number): Result {
  const kind: HeapKind = "min";
  const k = Math.max(1, Math.min(k0, Math.max(stream.length, 1)));
  const cells: number[] = [];
  const frames: Frame<HeapState>[] = [];
  const cost = { n: 0 };
  frames.push({ state: snap(cells, kind, { out: `keep ${k}` }), note: `Keep the ${k} largest of ${stream.length} values. Use a min-heap of size ${k}: its top is the weakest of the best, so it is the one to throw away.`, cost: 0 });
  for (const v of stream) {
    cells.push(v);
    const tmp: Frame<HeapState>[] = [];
    siftUp(cells, cells.length - 1, kind, tmp, cost);
    frames.push({ state: snap(cells, kind, { mark: [cells.indexOf(v)] }), note: `${v} arrives. Push it, and it climbs to its place.`, cost: cost.n });
    if (cells.length > k) {
      const gone = cells[0];
      const last = cells.pop() as number;
      cells[0] = last;
      cost.n += 1;
      if (cells.length > 1) siftDown(cells, 0, cells.length, kind, [], cost, true);
      frames.push({ state: snap(cells, kind, { mark: [0], out: `dropped ${gone}` }), note: `The heap holds more than ${k}, so pop the smallest, ${gone}. It cannot be one of the ${k} largest.`, cost: cost.n });
    }
  }
  const full = cells.length === k;
  frames.push({ state: snap(cells, kind, { mark: [0], out: full ? `kth largest: ${cells[0]}` : "fewer than k" }), note: full ? `The heap holds the ${k} largest values, and its top, ${cells[0]}, is the ${k === 1 ? "largest" : `${k}th largest`}. The heap never grew past ${k + 1} items: ${plural(cost.n, "step")} in all.` : `The stream has fewer than ${k} values, so the heap holds all of them.`, cost: cost.n });
  return { script: script(`Top ${k}`, frames, full ? `${k}th largest: ${cells[0]}` : "fewer than k"), heap: { cells, kind } };
}

/** The array picture (a demo with view: memory): the tree written into an array, and the index arithmetic. */
export function heapMemoryPicture(values: number[]): Script<HeapState> {
  const cells = makeHeap(values.length ? values.slice(0, 9) : [10, 20, 15, 30, 40, 25, 18], "min").cells;
  const n = cells.length;
  const f: Frame<HeapState>[] = [];
  f.push({ state: snap(cells, "min", { mark: [0] }), note: "A heap is a complete tree, so it fits in a plain array. Cell 0 is the root. Its children are cells 1 and 2, and each level follows the last, from the left.", cost: 0 });
  const c = Math.min(4, n - 1);
  if (c > 0) {
    const p = parentOf(c);
    f.push({ state: snap(cells, "min", { current: c, path: [p, c], labels: { parent: p } }), note: `Take the item in cell ${c}. Its parent is at (${c} - 1) // 2 = ${p}. No pointer is stored: the index gives the link.`, cost: 0 });
    const l = 2 * p + 1;
    const r = 2 * p + 2;
    f.push({
      state: snap(cells, "min", { current: p, mark: [l, r].filter((x) => x < n), labels: { left: l < n ? l : null, right: r < n ? r : null } }),
      note: `The children of cell ${p} are at 2 * ${p} + 1 = ${l} and 2 * ${p} + 2 = ${r}. A heap of ${n} items needs ${n} cells and no memory for links.`,
      cost: 0,
    });
  }
  f.push({ state: snap(cells, "min", { mark: [0], out: `top is ${cells[0]}` }), note: `The smallest value is always in cell 0, so a peek reads one cell. Every other cell only promises to be no smaller than its parent.`, cost: 1 });
  return { view: "heap", title: "A heap in an array", costUnit: "reads", frames: f, result: "a tree in an array: the index arithmetic is the link" };
}

export function runHeapOp(m: HeapModel, op: HeapOp, opts: { predict?: boolean } = {}): Result {
  switch (op.op) {
    case "push":
      return push(m, op.value, opts);
    case "pop":
      return pop(m, opts);
    case "peek":
      return peek(m);
    case "heapify":
      return heapify(m);
    case "topk":
      return topk(m.cells, op.value);
  }
}
