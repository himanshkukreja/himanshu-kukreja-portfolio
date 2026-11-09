/**
 * Algorithm step-throughs on the same engine (the "array" view): how algorithms are taught visually. Each algorithm
 * is a generator that records a frame at each step of its template (marker = the template's [n] step marker), with
 * the running cost in comparisons, swaps or shifts, a variable table and, optionally, predict-then-reveal asks.
 *
 *   binarySearch, insertionSort  hand-written generators (the pattern every future algorithm follows: sorting,
 *                                BFS/DFS on a "graph" view, heap operations on a "heap" view, and so on)
 *   fromTrace                    any trace the content repo already generates (dsa-mastery generated/traces/*.json,
 *                                the concept pages' trace player) plays here unchanged
 *
 * A new algorithm = one generator here (or a traces/*.py in the content repo) + the view it draws on.
 */
import type { ArrayState, Frame, Script, VizAsk } from "./types";
import type { Trace } from "../types";

const arr = (values: ArrayState["values"], o: Partial<ArrayState> = {}): ArrayState => ({ values: [...values], pointers: {}, mark: [], moved: [], dim: [], range: null, ...o });

export function binarySearch(values: number[], target: number, opts: { predict?: boolean } = {}): Script<ArrayState> {
  const a = [...values].sort((x, y) => x - y);
  const f: Frame<ArrayState>[] = [];
  let lo = 0;
  let hi = a.length - 1;
  let cost = 0;
  const dim = (l: number, h: number) => a.map((_, i) => i).filter((i) => i < l || i > h);
  f.push({ state: arr(a, { pointers: { lo, hi }, range: [lo, hi] }), note: `The array is sorted. Search for ${target} between lo and hi.`, cost, marker: 1, vars: { lo, hi, mid: null } });
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    cost++;
    const ask: VizAsk | null = opts.predict
      ? {
          prompt: `a[mid] is ${a[mid]}. Which half is left?`,
          choices: [
            { label: "the left half", correct: target < a[mid], why: target < a[mid] ? undefined : `${target} is larger than ${a[mid]}` },
            { label: "the right half", correct: target > a[mid], why: target > a[mid] ? undefined : `${target} is smaller than ${a[mid]}` },
            { label: "found it", correct: target === a[mid], why: target === a[mid] ? undefined : `${a[mid]} is not ${target}` },
          ],
        }
      : null;
    f.push({ state: arr(a, { pointers: { lo, mid, hi }, range: [lo, hi], mark: [mid], dim: dim(lo, hi) }), note: `mid = (${lo} + ${hi}) / 2 = ${mid}. Compare a[mid] = ${a[mid]} with ${target}.`, cost, marker: 2, vars: { lo, hi, mid }, ask });
    if (a[mid] === target) {
      f.push({ state: arr(a, { pointers: { mid }, mark: [mid], dim: a.map((_, i) => i).filter((i) => i !== mid) }), note: `Found ${target} at index ${mid} after ${cost} comparison${cost === 1 ? "" : "s"}.`, cost, marker: 3, vars: { lo, hi, mid } });
      return { view: "array", title: `Binary search for ${target}`, costUnit: "comparisons", frames: f, result: `found at index ${mid}` };
    }
    if (a[mid] < target) lo = mid + 1;
    else hi = mid - 1;
    f.push({ state: arr(a, { pointers: lo <= hi ? { lo, hi } : {}, range: lo <= hi ? [lo, hi] : null, dim: dim(lo, hi) }), note: a[mid] < target ? `${a[mid]} is too small: everything up to mid is ruled out, lo = ${lo}.` : `${a[mid]} is too large: everything from mid on is ruled out, hi = ${hi}.`, cost, marker: 4, vars: { lo, hi, mid } });
  }
  f.push({ state: arr(a, { dim: a.map((_, i) => i) }), note: `lo passed hi: ${target} is not in the array. ${cost} comparisons for ${a.length} values.`, cost, marker: 5, vars: { lo, hi } });
  return { view: "array", title: `Binary search for ${target}`, costUnit: "comparisons", frames: f, result: "not found" };
}

export function insertionSort(values: number[]): Script<ArrayState> {
  const a: number[] = [...values];
  const f: Frame<ArrayState>[] = [];
  let cost = 0;
  f.push({ state: arr(a, { range: [0, 0] }), note: "The first value alone is a sorted run. Grow the run one value at a time.", cost, marker: 1 });
  for (let i = 1; i < a.length; i++) {
    const x = a[i];
    let j = i - 1;
    f.push({ state: arr(a, { pointers: { i }, mark: [i], range: [0, i - 1] }), note: `Take ${x} and slide it left into the sorted run.`, cost, marker: 2, vars: { i, x } });
    while (j >= 0 && a[j] > x) {
      a[j + 1] = a[j];
      cost++;
      f.push({ state: arr(a.map((v, k) => (k === j ? null : v)), { pointers: { j }, moved: [j + 1], range: [0, i] }), note: `${a[j]} is larger than ${x}: shift it right.`, cost, marker: 3, vars: { i, j, x } });
      j--;
    }
    a[j + 1] = x;
    f.push({ state: arr(a, { mark: [j + 1], range: [0, i] }), note: `Drop ${x} at index ${j + 1}. The run 0 to ${i} is sorted.`, cost, marker: 4, vars: { i, x } });
  }
  return { view: "array", title: "Insertion sort", costUnit: "shifts", frames: f, result: `sorted with ${cost} shifts` };
}

/** A generated trace (the concept pages' trace player format) as a step script on the array view. */
export function fromTrace(t: Trace): Script<ArrayState> {
  const values = (Object.values(t.input).find((x) => Array.isArray(x)) as (number | string)[] | undefined) || [];
  const frames: Frame<ArrayState>[] = t.frames.map((fr, k) => ({
    state: arr(values, {
      pointers: fr.view.pointers || {},
      range: fr.view.window ?? null,
      mark: [fr.view.joining, fr.view.leaving].filter((x): x is number => typeof x === "number"),
    }),
    note: fr.note,
    cost: k,
    marker: fr.marker,
    vars: fr.state,
    ask: fr.ask
      ? { prompt: fr.ask.prompt, choices: fr.ask.choices.map((c) => ({ label: Array.isArray(c.value) ? `[${c.value.join(", ")}]` : String(c.value), correct: c.correct, why: c.why })) }
      : null,
  }));
  return { view: "array", title: t.title, costUnit: "steps", frames, result: t.result === undefined ? undefined : String(t.result) };
}
