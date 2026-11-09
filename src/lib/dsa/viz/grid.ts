/**
 * Grids for the step engine: the model behind the "grid" view, the BFS/DFS visualizer and the grid lecture scene.
 *
 * A grid is written as rows of characters, the same encoding the content repo uses (visualizer.yml presets, lab
 * tests, lecture scenes):  `.` open   `#` wall   `S` start   `G` goal (optional).
 * Cells are numbered row by row (id = r * cols + c) and named "(r, c)", counting from 0. Neighbours are tried in one
 * fixed order everywhere in the course: up, right, down, left (clockwise from up).
 *
 * The traversal itself is graph-generic (search.ts); this file is only the adapter: geometry + neighbours.
 */
import { searchScript, type SearchAlgo, type SearchGraph, type SearchResult, type SearchState } from "./search";
import type { Script } from "./types";

export type GridModel = { rows: number; cols: number; walls: boolean[]; start: number; goal: number | null };

/** The grid view's state: the geometry and the search on it. */
export type GridState = GridModel & { search: SearchState | null };

export const GRID_DIRS: [number, number, string][] = [
  [-1, 0, "up"],
  [0, 1, "right"],
  [1, 0, "down"],
  [0, -1, "left"],
];

export const cellName = (cols: number, id: number) => `(${Math.floor(id / cols)}, ${id % cols})`;

/** Rows of `.#SG` → a grid model; errors name the first problem (for typed input and content checks). */
export function parseGrid(rows: string[]): { grid: GridModel | null; error: string | null } {
  const R = rows.length;
  if (!R) return { grid: null, error: "The grid has no rows." };
  const C = rows[0].length;
  if (!C) return { grid: null, error: "The grid has no columns." };
  const walls: boolean[] = [];
  let start = -1;
  let goal: number | null = null;
  for (let r = 0; r < R; r++) {
    if (rows[r].length !== C) return { grid: null, error: `Row ${r} has ${rows[r].length} cells; every row needs ${C}.` };
    for (let c = 0; c < C; c++) {
      const ch = rows[r][c];
      const id = r * C + c;
      if (!".#SG".includes(ch)) return { grid: null, error: `Cell (${r}, ${c}) is "${ch}": use . # S or G.` };
      walls.push(ch === "#");
      if (ch === "S") {
        if (start >= 0) return { grid: null, error: "Only one start (S)." };
        start = id;
      }
      if (ch === "G") {
        if (goal !== null) return { grid: null, error: "Only one goal (G)." };
        goal = id;
      }
    }
  }
  if (start < 0) return { grid: null, error: "Put a start (S) somewhere." };
  return { grid: { rows: R, cols: C, walls, start, goal }, error: null };
}

export function gridRows(g: GridModel): string[] {
  const out: string[] = [];
  for (let r = 0; r < g.rows; r++) {
    let s = "";
    for (let c = 0; c < g.cols; c++) {
      const id = r * g.cols + c;
      s += id === g.start ? "S" : id === g.goal ? "G" : g.walls[id] ? "#" : ".";
    }
    out.push(s);
  }
  return out;
}

/** The grid as a graph: open cells, four neighbours in the course's fixed order (up, right, down, left). */
export function gridGraph(g: GridModel): SearchGraph {
  return {
    size: g.rows * g.cols,
    name: (n) => cellName(g.cols, n),
    neighbours: (n) => {
      const r = Math.floor(n / g.cols);
      const c = n % g.cols;
      const out: number[] = [];
      for (const [dr, dc] of GRID_DIRS) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= g.rows || cc >= g.cols) continue;
        const m = rr * g.cols + cc;
        if (!g.walls[m]) out.push(m);
      }
      return out;
    },
  };
}

export function gridSearch(algo: SearchAlgo, g: GridModel, opts: { predict?: boolean; asks?: number; title?: string; useGoal?: boolean } = {}): Script<GridState> & { summary: SearchResult } {
  const goal = opts.useGoal === false ? null : g.goal;
  const title = opts.title || `${algo === "bfs" ? "BFS" : "DFS"} ${goal === null ? "from S" : "from S to G"}`;
  return searchScript<GridState>(algo, gridGraph(g), g.start, goal, (s) => ({ ...g, search: s }), "grid", { ...opts, title });
}

/** The grid alone, before a run (the visualizer's edit view, a lesson's first picture). */
export function stillGrid(g: GridModel, note: string): Script<GridState> {
  return { view: "grid", title: "The grid", costUnit: "cells visited", frames: [{ state: { ...g, search: null }, note, cost: 0 }] };
}

/** Frame index for "the search after `k` cells were visited" (lecture scenes: upto), or the last frame. */
export function frameAtVisited(s: Script<GridState>, k: number | "end"): number {
  if (k === "end") return s.frames.length - 1;
  let at = 0;
  s.frames.forEach((f, i) => {
    if (f.cost <= k) at = i;
  });
  return at;
}

/** Text for screen readers: the grid, the search state and the frontier, in words. */
export function describeGrid(s: GridState): string {
  const walls = s.walls.filter(Boolean).length;
  const head = `Grid of ${s.rows} rows and ${s.cols} columns, ${walls} wall${walls === 1 ? "" : "s"}. Start ${cellName(s.cols, s.start)}${s.goal !== null ? `, goal ${cellName(s.cols, s.goal)}` : ""}.`;
  const se = s.search;
  if (!se) return `${head} Rows: ${gridRows(s).join(" / ")}.`;
  const N = (n: number) => cellName(s.cols, n);
  const what = se.algo === "bfs" ? "distance" : "visit number";
  const lab = Object.entries(se.label)
    .slice(0, 40)
    .map(([k, v]) => `${N(Number(k))} ${v}`)
    .join(", ");
  const fr = se.frontier.map(N).join(", ") || "empty";
  return `${head} ${se.algo === "bfs" ? "BFS" : "DFS"}. ${se.current !== null ? `Current cell ${N(se.current)}. ` : ""}${se.algo === "bfs" ? "Queue, front first" : "Call stack, bottom first"}: ${fr}. Cells by ${what}: ${lab || "none yet"}.${se.path.length ? ` Path: ${se.path.map(N).join(", ")}.` : ""}`;
}

/** Ready-made grids for the visualizer when the content gives none. */
export const DEFAULT_PRESETS: { id: string; title: string; grid: string[] }[] = [
  { id: "open-floor", title: "An open floor", grid: ["S.....", "......", "......", ".....G"] },
  { id: "one-wall", title: "One long wall", grid: ["S.#....", "..#.##.", "..#..#.", "....#G."] },
];
