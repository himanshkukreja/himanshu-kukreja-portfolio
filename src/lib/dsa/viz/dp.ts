/**
 * Dynamic programming as step-engine frames (Academy Part 3, A6): the same question answered three ways. The "dp" view draws the run
 * (DpState: a table filled cell by cell with the cells each new cell reads from highlighted, or a recursion tree with the repeated calls
 * marked and the calls a memo answers).
 *
 *   plain-recursion  climbing stairs as a recursion tree, one call at a time: calls that repeat an earlier call are marked
 *   memoise          the same recursion with a memo: a call whose answer is saved reads it at once and calls nothing else
 *   tabulate         a table filled from the base cases up, in an order that always has the cells a cell reads already filled
 *
 * Problems: stairs (ways to climb n stairs, one or two at a time), coins (the fewest coins that make an amount), grid (the number of
 * routes from the top left to the bottom right moving right or down; `#` is a closed cell) and lcs (the longest common subsequence of two
 * words). Every cell has one plain definition, shown in the first frame. Pure and dependency-free, like every generator here.
 */
import type { DpState, DpTable, DpTree, Frame, Script, VizAsk } from "./types";
import { choicesOf } from "./topo";

export type DpMethod = "plain-recursion" | "memoise" | "tabulate";
export type DpProblem =
  | { kind: "stairs"; n: number }
  | { kind: "coins"; coins: number[]; amount: number }
  | { kind: "grid"; rows: string[] }
  | { kind: "lcs"; a: string; b: string };

export const DP_METHOD_LABEL: Record<DpMethod, string> = {
  "plain-recursion": "Plain recursion",
  memoise: "Recursion with a memo",
  tabulate: "A table, bottom up",
};

const INF = "∞";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const key = (r: number, c: number) => `${r},${c}`;

/* ------------------------------------------------------------------ stairs as a recursion tree */

type Calls = { calls: { label: string; parent: number }[]; val: number[]; end: number[]; repeat: number[]; hit: number[] };

/** The calls ways(n) makes, in the order they are made. With a memo, a call whose answer is saved is a leaf. */
export function stairsCalls(n: number, memo: boolean): Calls {
  const out: Calls = { calls: [], val: [], end: [], repeat: [], hit: [] };
  const saved = new Map<number, number>();
  const seen = new Set<number>();
  const go = (k: number, parent: number): number => {
    const idx = out.calls.length;
    out.calls.push({ label: String(k), parent });
    const again = seen.has(k);
    seen.add(k);
    if (memo && saved.has(k)) {
      out.hit.push(idx);
      out.val[idx] = saved.get(k)!;
      out.end[idx] = idx;
      return out.val[idx];
    }
    if (again) out.repeat.push(idx);
    const v = k <= 1 ? 1 : go(k - 1, idx) + go(k - 2, idx);
    saved.set(k, v);
    out.val[idx] = v;
    out.end[idx] = out.calls.length - 1;
    return v;
  };
  go(n, -1);
  return out;
}

function treeFrames(n: number, memo: boolean, opts: { predict?: boolean }): Frame<DpState>[] {
  const t = stairsCalls(n, memo);
  const total = t.calls.length;
  const frames: Frame<DpState>[] = [];
  const snap = (shown: number, out: string | null, hot: number[] = []): DpState => {
    const vals: Record<number, string> = {};
    for (let i = 0; i < shown; i++) if (t.end[i] < shown) vals[i] = String(t.val[i]);
    const tree: DpTree = { calls: t.calls, shown, vals, hot, repeat: t.repeat.filter((i) => i < shown), hit: t.hit.filter((i) => i < shown) };
    return { table: null, tree, out };
  };
  const fresh = (upto: number) => t.calls.slice(0, upto).filter((_, i) => !t.hit.includes(i)).length;
  frames.push({
    state: snap(0, null),
    note: memo
      ? `ways(k) is the number of ways to climb k stairs, one or two at a time. ways(0) = 1 and ways(1) = 1 are the base cases, and ways(k) = ways(k-1) + ways(k-2). This time every answer is saved in a memo, and a call whose answer is saved reads it and stops.`
      : `ways(k) is the number of ways to climb k stairs, one or two at a time. ways(0) = 1 and ways(1) = 1 are the base cases, and ways(k) = ways(k-1) + ways(k-2). Each call makes two more calls, and nothing is saved.`,
    cost: 0,
    vars: { calls: 0 },
  });
  let askedRepeat = false;
  t.calls.forEach((c, i) => {
    const k = Number(c.label);
    const isHit = t.hit.includes(i);
    const isRep = t.repeat.includes(i);
    const base = !isHit && k <= 1;
    let note: string;
    if (isHit) note = `Call ways(${k}). Its answer, ${t.val[i]}, is already in the memo, so the call returns it at once and makes no more calls.`;
    else if (isRep) note = `Call ways(${k}). The same call was made before, and nothing was saved, so all its work is done again.`;
    else if (base) note = `Call ways(${k}). A base case: it returns ${t.val[i]} at once.`;
    else note = `Call ways(${k}). It makes two calls: ways(${k - 1}) and ways(${k - 2}).`;
    let ask: VizAsk | null = null;
    if (opts.predict && !askedRepeat && (isHit || isRep)) {
      askedRepeat = true;
      ask = memo
        ? {
            prompt: `ways(${k}) was worked out earlier and saved in the memo. What does this call do?`,
            choices: choicesOf("It returns the saved answer and stops", [
              { label: "It works the answer out again", why: `The memo exists so that ways(${k}) is not worked out twice` },
              { label: "It makes two more calls", why: "A saved answer ends the call: nothing below it is needed" },
            ]),
          }
        : {
            prompt: `ways(${k}) was called earlier in this tree. This plain recursion saves nothing. What does this call do?`,
            choices: choicesOf("It works the answer out again from scratch", [
              { label: "It reads the earlier answer", why: "Plain recursion keeps no memory of earlier calls" },
              { label: "It is skipped", why: "Every call is made, even one that repeats" },
            ]),
          };
    }
    frames.push({
      state: snap(i + 1, null, [i]),
      note,
      cost: i + 1,
      vars: memo ? { calls: i + 1, "worked out": fresh(i + 1), "read from the memo": t.hit.filter((h) => h <= i).length } : { calls: i + 1, "repeated calls": t.repeat.filter((h) => h <= i).length },
      ask,
    });
  });
  const answer = t.val[0];
  frames.push({
    state: snap(total, `ways(${n}) = ${answer}`),
    note: memo
      ? `Done: ways(${n}) = ${answer}. The tree has ${plural(total, "call")}: ${fresh(total)} were worked out once, and ${t.hit.length} read the memo. Only ${n + 1} different answers exist, and each was worked out one time.`
      : `Done: ways(${n}) = ${answer}. The tree has ${plural(total, "call")}, and ${t.repeat.length} of them repeat an earlier call. Only ${n + 1} different answers exist, so most of the work was done again.`,
    cost: total,
    vars: memo ? { calls: total, "worked out": fresh(total), "read from the memo": t.hit.length } : { calls: total, "repeated calls": t.repeat.length },
  });
  return frames;
}

/* ------------------------------------------------------------------ tables */

function greedyCoins(coins: number[], amount: number): number | null {
  let left = amount;
  let used = 0;
  for (const c of [...coins].sort((a, b) => b - a)) {
    used += Math.floor(left / c);
    left %= c;
  }
  return left === 0 ? used : null;
}

type Cell = [number, number];

function tableFrames(p: DpProblem, opts: { predict?: boolean }): { frames: Frame<DpState>[]; result: string } {
  const frames: Frame<DpState>[] = [];
  let cols: string[] = [];
  let rows: string[] | null = null;
  let cells: (string | null)[][] = [];
  let base: Cell[] = [];
  const blocked: Cell[] = [];
  let filled = 0;
  const snap = (now: Cell | null, reads: Cell[], out: string | null = null): DpState => {
    const table: DpTable = { cols, rows, cells: cells.map((r) => [...r]), base, blocked, now, reads };
    return { table, tree: null, out };
  };
  const asks = { n: 0 };
  const askFor = (name: string, value: string | number, hint: string): VizAsk | null => {
    if (!opts.predict || asks.n >= 4 || typeof value !== "number") return null;
    asks.n++;
    const wrong = [value + 1, value > 0 ? value - 1 : value + 2].map((w) => ({ label: String(w), why: `${hint} Check the cells it reads.` }));
    return { prompt: `What goes in ${name}?`, choices: choicesOf(String(value), wrong) };
  };
  let result = "";

  if (p.kind === "stairs") {
    const n = p.n;
    cols = Array.from({ length: n + 1 }, (_, i) => String(i));
    cells = [Array(n + 1).fill(null)];
    base = [[0, 0], [0, 1]];
    const w: number[] = [1, 1];
    frames.push({ state: snap(null, []), note: `ways[k] is the number of ways to climb k stairs, one or two at a time. The base cases are ways[0] = 1 and ways[1] = 1. Each cell adds the two cells before it, so fill from left to right.`, cost: 0, vars: { "cells filled": 0 } });
    cells[0][0] = "1";
    cells[0][1] = "1";
    filled = 2;
    frames.push({ state: snap(null, []), note: `The base cases go in first: ways[0] = 1 (one way to stay on the ground) and ways[1] = 1.`, cost: filled, vars: { "cells filled": filled } });
    for (let k = 2; k <= n; k++) {
      w[k] = w[k - 1] + w[k - 2];
      const reads: Cell[] = [[0, k - 1], [0, k - 2]];
      const ask = askFor(`ways[${k}]`, w[k], `ways[${k}] = ways[${k - 1}] + ways[${k - 2}].`);
      cells[0][k] = String(w[k]);
      filled++;
      frames.push({ state: snap([0, k], reads), note: `ways[${k}] = ways[${k - 1}] + ways[${k - 2}] = ${w[k - 1]} + ${w[k - 2]} = ${w[k]}.`, cost: filled, vars: { "cells filled": filled }, ask });
    }
    result = `ways[${n}] = ${w[n]}`;
    frames.push({ state: snap(null, [], result), note: `Done: ${result}. The table has ${n + 1} cells, and each one was filled once from the two before it.`, cost: filled, vars: { "cells filled": filled } });
  } else if (p.kind === "coins") {
    const { coins, amount } = p;
    cols = Array.from({ length: amount + 1 }, (_, i) => String(i));
    cells = [Array(amount + 1).fill(null)];
    base = [[0, 0]];
    const best: (number | null)[] = [0];
    frames.push({ state: snap(null, []), note: `fewest[a] is the fewest coins that make exactly a. The base case is fewest[0] = 0. For each amount, try every coin that fits: fewest[a] = 1 + the smallest fewest[a - coin]. Each cell reads cells to its left, so fill from left to right.`, cost: 0, vars: { "cells filled": 0 } });
    cells[0][0] = "0";
    filled = 1;
    frames.push({ state: snap(null, []), note: `The base case goes in first: zero coins make the amount 0.`, cost: filled, vars: { "cells filled": filled } });
    for (let a = 1; a <= amount; a++) {
      const tries: string[] = [];
      const reads: Cell[] = [];
      let m: number | null = null;
      for (const c of coins) {
        if (c > a) continue;
        const prev = best[a - c];
        reads.push([0, a - c]);
        if (prev === null) tries.push(`coin ${c}: ${a - c} cannot be made`);
        else {
          tries.push(`coin ${c}: ${prev} + 1 = ${prev + 1}`);
          if (m === null || prev + 1 < m) m = prev + 1;
        }
      }
      best[a] = m;
      const ask = askFor(`fewest[${a}]`, m ?? INF, `Try each coin that fits and keep the smallest.`);
      cells[0][a] = m === null ? INF : String(m);
      filled++;
      const note = tries.length ? `Amount ${a}. ${tries.join("; ")}. ${m === null ? `No coin leads to an amount that can be made, so ${a} cannot be made.` : `The smallest is ${m}.`}` : `Amount ${a}: every coin is bigger than ${a}, so ${a} cannot be made.`;
      frames.push({ state: snap([0, a], reads), note, cost: filled, vars: { "cells filled": filled }, ask });
    }
    const final = best[amount];
    const g = greedyCoins(coins, amount);
    result = final === null ? `${amount} cannot be made` : `fewest[${amount}] = ${final}`;
    const cmp = final === null ? "" : g === null ? ` Biggest coin first gets stuck on ${amount}, so it gives no answer at all.` : g === final ? ` Biggest coin first also uses ${g}.` : ` Biggest coin first would use ${g}, so it is not the best here.`;
    frames.push({ state: snap(null, [], result), note: `Done: ${final === null ? `${amount} cannot be made with these coins.` : `${amount} needs ${plural(final, "coin")} at the fewest.`}${cmp}`, cost: filled, vars: { "cells filled": filled } });
  } else if (p.kind === "grid") {
    const R = p.rows.length;
    const C = p.rows[0].length;
    rows = Array.from({ length: R }, (_, i) => String(i + 1));
    cols = Array.from({ length: C }, (_, i) => String(i + 1));
    cells = Array.from({ length: R }, () => Array(C).fill(null));
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (p.rows[r][c] === "#") blocked.push([r, c]);
    const closed = new Set(blocked.map(([r, c]) => key(r, c)));
    base = [[0, 0]];
    const w: number[][] = Array.from({ length: R }, () => Array(C).fill(0));
    frames.push({ state: snap(null, []), note: `routes[r][c] is the number of routes from the top left cell to this cell, moving only right or down. A closed cell has 0. Every other cell adds the cell above it and the cell to its left, so fill row by row, left to right.`, cost: 0, vars: { "cells filled": 0 } });
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const where = `row ${r + 1}, column ${c + 1}`;
        let note: string;
        const reads: Cell[] = [];
        if (closed.has(key(r, c))) {
          w[r][c] = 0;
          note = `${where} is closed, so no route can end here: 0.`;
        } else if (r === 0 && c === 0) {
          w[r][c] = 1;
          note = `${where} is the start: 1 route (stand still). This is the base case.`;
        } else {
          const up = r > 0 ? w[r - 1][c] : 0;
          const left = c > 0 ? w[r][c - 1] : 0;
          if (r > 0) reads.push([r - 1, c]);
          if (c > 0) reads.push([r, c - 1]);
          w[r][c] = up + left;
          note = r === 0 ? `${where}: only the cell on the left can lead here, ${left}.` : c === 0 ? `${where}: only the cell above can lead here, ${up}.` : `${where}: from above ${up} + from the left ${left} = ${w[r][c]}.`;
        }
        const ask = r > 0 && c > 0 && !closed.has(key(r, c)) ? askFor(`row ${r + 1}, column ${c + 1}`, w[r][c], `It adds the cell above and the cell to the left.`) : null;
        cells[r][c] = String(w[r][c]);
        filled++;
        frames.push({ state: snap([r, c], reads), note, cost: filled, vars: { "cells filled": filled }, ask });
      }
    }
    result = `${w[R - 1][C - 1]} ${w[R - 1][C - 1] === 1 ? "route" : "routes"}`;
    frames.push({ state: snap(null, [], result), note: `Done: ${result} reach the bottom right cell. The table has ${R * C} cells, and each was filled once from two neighbours.`, cost: filled, vars: { "cells filled": filled } });
  } else {
    const { a, b } = p;
    const R = a.length + 1;
    const C = b.length + 1;
    rows = ["", ...a.split("")];
    cols = ["", ...b.split("")];
    cells = Array.from({ length: R }, () => Array(C).fill(null));
    base = [];
    const w: number[][] = Array.from({ length: R }, () => Array(C).fill(0));
    for (let i = 0; i < R; i++) {
      cells[i][0] = "0";
      base.push([i, 0]);
    }
    for (let j = 1; j < C; j++) {
      cells[0][j] = "0";
      base.push([0, j]);
    }
    filled = R + C - 1;
    frames.push({ state: snap(null, []), note: `common[i][j] is the length of the longest common subsequence of the first i letters of "${a}" and the first j letters of "${b}". The base cases are the empty row and column: with no letters on one side the answer is 0. Fill row by row, left to right.`, cost: filled, vars: { "cells filled": filled } });
    for (let i = 1; i < R; i++) {
      for (let j = 1; j < C; j++) {
        let reads: Cell[];
        let note: string;
        if (a[i - 1] === b[j - 1]) {
          w[i][j] = w[i - 1][j - 1] + 1;
          reads = [[i - 1, j - 1]];
          note = `Letters ${a[i - 1]} and ${b[j - 1]} match: 1 + the diagonal cell ${w[i - 1][j - 1]} = ${w[i][j]}.`;
        } else {
          w[i][j] = Math.max(w[i - 1][j], w[i][j - 1]);
          reads = [[i - 1, j], [i, j - 1]];
          note = `Letters ${a[i - 1]} and ${b[j - 1]} differ: the larger of the cell above (${w[i - 1][j]}) and the cell to the left (${w[i][j - 1]}) is ${w[i][j]}.`;
        }
        const ask = askFor(`the cell for "${a.slice(0, i)}" and "${b.slice(0, j)}"`, w[i][j], a[i - 1] === b[j - 1] ? "A match adds 1 to the diagonal cell." : "No match: take the larger of above and left.");
        cells[i][j] = String(w[i][j]);
        filled++;
        frames.push({ state: snap([i, j], reads), note, cost: filled, vars: { "cells filled": filled }, ask });
      }
    }
    result = `length ${w[R - 1][C - 1]}`;
    frames.push({ state: snap(null, [], result), note: `Done: the longest common subsequence of "${a}" and "${b}" has length ${w[R - 1][C - 1]}. The table has ${(R - 1) * (C - 1)} cells to fill, each from at most three neighbours.`, cost: filled, vars: { "cells filled": filled } });
  }
  return { frames, result };
}

/** A problem solved by one method, as a script on the dp view. */
export function dpScript(p: DpProblem, method: DpMethod, opts: { predict?: boolean; title?: string } = {}): Script<DpState> {
  if (p.kind === "stairs" && method !== "tabulate") {
    const frames = treeFrames(p.n, method === "memoise", opts);
    return { view: "dp", title: opts.title || DP_METHOD_LABEL[method], costUnit: "calls", frames, result: frames[frames.length - 1].state.out ?? undefined };
  }
  const r = tableFrames(p, opts);
  return { view: "dp", title: opts.title || DP_METHOD_LABEL.tabulate, costUnit: "cells filled", frames: r.frames, result: r.result };
}
