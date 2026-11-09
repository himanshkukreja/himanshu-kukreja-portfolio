"use client";

/**
 * An algorithm lesson's visualizer (`::visualizer[id]`, dsa-mastery visualizer.yml): BFS and DFS on a grid the
 * learner draws. Pick a preset or draw walls and move S and G (tap or keyboard), pick BFS or DFS, then step through the
 * run forward and back on the StepPlayer (auto-play stops at the predict questions). A live cost (cells visited, the
 * frontier's size and its peak) runs with every step, and a small table compares the last BFS and DFS runs on the same
 * grid once each run reaches its end, so "BFS finds the shortest path, DFS finds a path" is something the learner sees on their own input.
 *
 * Keyboard: the grid editor is one tab stop; arrow keys move between cells, Enter or Space applies the tool.
 */
import { useMemo, useRef, useState } from "react";
import { gridRows, gridSearch, parseGrid, stillGrid, type GridModel } from "@/lib/dsa/viz/grid";
import type { SearchResult } from "@/lib/dsa/viz/search";
import type { VisualizerSpec } from "@/lib/dsa/viz/registry";
import type { Script } from "@/lib/dsa/viz/types";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

type Tool = "wall" | "start" | "goal" | "erase";
type Algo = "bfs" | "dfs";
const TOOL_LABEL: Record<Tool, string> = { wall: "Wall", start: "Move S", goal: "Move G", erase: "Erase" };
const ALGO_LABEL: Record<Algo, string> = { bfs: "BFS (queue)", dfs: "DFS (stack)" };

const blank = (rows: number, cols: number): GridModel => ({ rows, cols, walls: Array(rows * cols).fill(false), start: 0, goal: rows * cols - 1 });

export default function GridVisualizer({ spec }: { spec: VisualizerSpec }) {
  const presets = spec.presets;
  const first = useMemo(() => parseGrid(presets[0]?.grid || []).grid || blank(5, 7), [presets]);
  const [preset, setPreset] = useState(presets[0]?.id || "custom");
  const [grid, setGrid] = useState<GridModel>(first);
  const [algo, setAlgo] = useState<Algo>(spec.algorithms[0] || "bfs");
  const [tool, setTool] = useState<Tool>("wall");
  const [predict, setPredict] = useState(true);
  const [auto, setAuto] = useState(false);
  const [useGoal, setUseGoal] = useState(true);
  const [script, setScript] = useState<Script | null>(null);
  // the run's summary joins the comparison table only when the learner reaches its last step (no spoilers)
  const [pending, setPending] = useState<{ algo: Algo; r: SearchResult & { goal: boolean } } | null>(null);
  const [focus, setFocus] = useState(0);
  const [results, setResults] = useState<Partial<Record<Algo, SearchResult & { goal: boolean }>>>({});
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const [rMin, rMax] = spec.limits.rows;
  const [cMin, cMax] = spec.limits.cols;

  const edit = (g: GridModel, custom = true) => {
    setGrid(g);
    setScript(null);
    setResults({});
    setPending(null);
    if (custom) setPreset("custom");
  };

  const apply = (n: number) => {
    const g = { ...grid, walls: [...grid.walls] };
    if (tool === "wall") {
      if (n === g.start || n === g.goal) return;
      g.walls[n] = !g.walls[n];
    } else if (tool === "erase") g.walls[n] = false;
    else if (tool === "start") {
      if (n === g.goal) return;
      g.walls[n] = false;
      g.start = n;
    } else {
      if (n === g.start) return;
      g.walls[n] = false;
      g.goal = n;
    }
    edit(g);
  };

  const resize = (rows: number, cols: number) => {
    const g = blank(rows, cols);
    for (let r = 0; r < Math.min(rows, grid.rows); r++) for (let c = 0; c < Math.min(cols, grid.cols); c++) g.walls[r * cols + c] = grid.walls[r * grid.cols + c];
    const keep = (n: number | null, fallback: number) => {
      if (n === null) return fallback;
      const r = Math.floor(n / grid.cols);
      const c = n % grid.cols;
      return r < rows && c < cols ? r * cols + c : fallback;
    };
    g.start = keep(grid.start, 0);
    g.goal = keep(grid.goal, rows * cols - 1);
    if (g.goal === g.start) g.goal = rows * cols - 1 === g.start ? 0 : rows * cols - 1;
    g.walls[g.start] = false;
    if (g.goal !== null) g.walls[g.goal] = false;
    setFocus(0);
    edit(g);
  };

  const randomWalls = () => {
    const g = { ...grid, walls: grid.walls.map((_, n) => n !== grid.start && n !== grid.goal && Math.random() < 0.28) };
    edit(g);
  };

  const run = (a: Algo = algo) => {
    setAlgo(a);
    const s = gridSearch(a, grid, { predict, useGoal: useGoal && grid.goal !== null });
    setScript(s);
    setPending({ algo: a, r: { ...s.summary, goal: useGoal && grid.goal !== null } });
    track("dsa_visualizer_run", { visualizer: spec.id, algo: a, predict, preset });
  };

  const onKey = (e: React.KeyboardEvent) => {
    const { rows, cols } = grid;
    let n = focus;
    if (e.key === "ArrowRight") n = Math.min(rows * cols - 1, focus + 1);
    else if (e.key === "ArrowLeft") n = Math.max(0, focus - 1);
    else if (e.key === "ArrowDown") n = focus + cols < rows * cols ? focus + cols : focus;
    else if (e.key === "ArrowUp") n = focus - cols >= 0 ? focus - cols : focus;
    else return;
    e.preventDefault();
    setFocus(n);
    cells.current[n]?.focus();
  };

  const still = useMemo(() => stillGrid(grid, "Draw walls, move S and G, then run BFS or DFS."), [grid]);
  const describe = (n: number) => `Row ${Math.floor(n / grid.cols)}, column ${n % grid.cols}: ${n === grid.start ? "start" : n === grid.goal ? "goal" : grid.walls[n] ? "wall" : "open"}`;
  const editing = !script;

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      {/* what to run on */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-[13px] font-semibold text-fg-2">
          Grid
          <select
            value={preset}
            onChange={(e) => {
              const p = presets.find((x) => x.id === e.target.value);
              setPreset(e.target.value);
              const g = p ? parseGrid(p.grid).grid : null;
              if (g) edit(g, false);
            }}
            className="min-h-11 max-w-full border border-line-strong bg-surface px-2 text-[15px] font-normal text-fg focus:border-signal focus:outline-none"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
            <option value="custom">Your own grid</option>
          </select>
        </label>
        <div role="radiogroup" aria-label="Algorithm" className="flex border border-line-strong">
          {spec.algorithms.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={a === algo} onClick={() => (script ? run(a) : setAlgo(a))} className={`min-h-11 px-3 text-[14px] font-semibold ${a === algo ? "bg-signal text-on-signal" : "text-fg-2 hover:bg-surface-2"}`}>
              {ALGO_LABEL[a]}
            </button>
          ))}
        </div>
      </div>
      {presets.find((p) => p.id === preset)?.note && <p className="m-0 text-[14px] text-fg-2">{presets.find((p) => p.id === preset)?.note}</p>}

      {editing ? (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Drawing tool" className="flex flex-wrap gap-2">
            {(Object.keys(TOOL_LABEL) as Tool[]).filter((t) => t !== "goal" || grid.goal !== null).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={t === tool} onClick={() => setTool(t)} className={`min-h-11 border-2 px-3 text-[14px] font-semibold ${t === tool ? "border-signal bg-[var(--c-dsa-hl)] text-fg" : "border-line-strong text-fg-2"}`}>
                {TOOL_LABEL[t]}
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label={`Grid editor, ${grid.rows} by ${grid.cols}. Arrow keys move between cells; Enter applies the tool: ${TOOL_LABEL[tool]}.`}
            onKeyDown={onKey}
            className="grid w-full touch-manipulation gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, maxWidth: grid.cols * 46 }}
          >
            {grid.walls.map((w, n) => {
              const isS = n === grid.start;
              const isG = n === grid.goal;
              return (
                <button
                  key={n}
                  ref={(el) => {
                    cells.current[n] = el;
                  }}
                  type="button"
                  tabIndex={n === focus ? 0 : -1}
                  aria-label={describe(n)}
                  onFocus={() => setFocus(n)}
                  onClick={() => apply(n)}
                  className={`aspect-square min-w-0 border font-mono text-[13px] font-extrabold sm:text-[15px] ${isS || isG ? "border-signal bg-signal text-on-signal" : w ? "border-fg-3 bg-fg-3 text-bg" : "border-line-strong bg-surface text-fg-3 hover:border-signal"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--c-signal)]`}
                >
                  {isS ? "S" : isG ? "G" : ""}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
              Rows
              <select value={grid.rows} onChange={(e) => resize(Number(e.target.value), grid.cols)} className="min-h-11 border border-line-strong bg-surface px-2 text-[15px] font-normal text-fg">
                {Array.from({ length: rMax - rMin + 1 }, (_, i) => rMin + i).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
              Columns
              <select value={grid.cols} onChange={(e) => resize(grid.rows, Number(e.target.value))} className="min-h-11 border border-line-strong bg-surface px-2 text-[15px] font-normal text-fg">
                {Array.from({ length: cMax - cMin + 1 }, (_, i) => cMin + i).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={randomWalls} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
              Random walls
            </button>
            <button type="button" onClick={() => edit({ ...grid, walls: grid.walls.map(() => false) })} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
              Clear walls
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            {gridRows(grid).join(", ")}
          </p>
        </div>
      ) : (
        <StepPlayer
          script={script}
          autoPlay={auto}
          label={`${ALGO_LABEL[algo]} on your grid`}
          stepMs={900}
          onDone={() => {
            if (pending) setResults((r) => ({ ...r, [pending.algo]: pending.r }));
          }}
        />
      )}

      {/* run */}
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <button type="button" onClick={() => run()} className="min-h-11 bg-signal px-5 text-[15px] font-semibold text-on-signal">
              Run {algo.toUpperCase()} step by step →
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setScript(null)} className="min-h-11 border-2 border-signal px-4 text-[14px] font-semibold text-signal-text">
                ✎ Edit the grid
              </button>
              {spec.algorithms
                .filter((a) => a !== algo)
                .map((a) => (
                  <button key={a} type="button" onClick={() => run(a)} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
                    Now try {a.toUpperCase()} on the same grid
                  </button>
                ))}
            </>
          )}
        </div>
        <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-1 border-0 p-0 text-[14px] text-fg-2">
          <legend className="sr-only">Run options</legend>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={predict} onChange={(e) => setPredict(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
            Ask me to predict
          </label>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
            Play automatically (stops at questions)
          </label>
          {grid.goal !== null && (
            <label className="inline-flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={useGoal} onChange={(e) => setUseGoal(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
              Stop at G (off: fill everything reachable)
            </label>
          )}
        </fieldset>
      </div>

      {editing && <StillPreview script={still} />}

      {(results.bfs || results.dfs) && (
        <div className="overflow-x-auto" aria-live="polite">
          <table className="w-full min-w-[300px] border-collapse text-left text-[14px]">
            <caption className="pb-1 text-left font-mono text-[11px] uppercase tracking-label text-fg-3">On this grid</caption>
            <thead>
              <tr className="font-mono text-[11px] uppercase tracking-label text-fg-3">
                <th scope="col" className="border-b border-line py-1.5 pr-3 font-medium">Run</th>
                <th scope="col" className="border-b border-line py-1.5 pr-3 font-medium">Path</th>
                <th scope="col" className="border-b border-line py-1.5 pr-3 font-medium">Visited</th>
                <th scope="col" className="border-b border-line py-1.5 font-medium">Most waiting</th>
              </tr>
            </thead>
            <tbody>
              {(["bfs", "dfs"] as Algo[])
                .filter((a) => results[a])
                .map((a) => {
                  const r = results[a]!;
                  return (
                    <tr key={a}>
                      <th scope="row" className="border-b border-line py-1.5 pr-3 font-semibold text-fg">{a.toUpperCase()}</th>
                      <td className="border-b border-line py-1.5 pr-3 text-fg-2">{!r.goal ? "–" : r.found ? `${r.steps} steps${a === "bfs" ? " (shortest)" : ""}` : "no path"}</td>
                      <td className="border-b border-line py-1.5 pr-3 font-mono text-fg-2">{r.visited}</td>
                      <td className="border-b border-line py-1.5 font-mono text-fg-2">{r.maxFrontier} in the {a === "bfs" ? "queue" : "stack"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The edit view's text description for screen readers (the editor is buttons; this says what the grid is). */
function StillPreview({ script }: { script: Script }) {
  const f = script.frames[0];
  return <p className="m-0 text-[14px] text-fg-3">{f.note}</p>;
}
