"use client";

/**
 * An algorithm lesson's visualizer for maps (`::visualizer[id]`, dsa-mastery visualizer.yml with view: graph):
 * Dijkstra's algorithm and Bellman-Ford on a directed map the learner can change, Kahn's algorithm on a dependency graph, and
 * union-find on a stream of links. Pick a preset, change any road's cost
 * (a negative cost is allowed, to see Dijkstra fail), choose the start and an optional target, then step through the
 * run forward and back on the StepPlayer. The graph view shows the vertices on a ring, the distance table beside it,
 * which vertices are final, and Dijkstra's waiting heap; auto-play stops at the predict questions.
 */
import { useMemo, useState } from "react";
import type { PathPreset, PathVisualizerSpec } from "@/lib/dsa/viz/registry";
import { pathScript, type PathAlgo, type PathEdge } from "@/lib/dsa/viz/shortest";
import type { Script } from "@/lib/dsa/viz/types";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

const ALGO_LABEL: Record<PathAlgo, string> = { dijkstra: "Dijkstra (heap)", "bellman-ford": "Bellman-Ford (rounds)", kahn: "Kahn (in-degrees and a queue)", dsu: "Union-find (parents, size and compression)" };
const ALGO_SHORT: Record<PathAlgo, string> = { dijkstra: "Dijkstra", "bellman-ford": "Bellman-Ford", kahn: "Kahn", dsu: "Union-find" };

export default function GraphVisualizer({ spec }: { spec: PathVisualizerSpec }) {
  const presets = spec.presets;
  const first = presets[0];
  const [preset, setPreset] = useState(first?.id || "custom");
  const [n, setN] = useState(first?.n ?? 5);
  const [edges, setEdges] = useState<PathEdge[]>(first?.edges ?? []);
  const [source, setSource] = useState(first?.source ?? 0);
  const [target, setTarget] = useState<number | null>(first?.target ?? null);
  const [algo, setAlgo] = useState<PathAlgo>(spec.algorithms[0] || "dijkstra");
  const [predict, setPredict] = useState(true);
  const [auto, setAuto] = useState(false);
  const [script, setScript] = useState<Script | null>(null);
  const [wMin, wMax] = spec.limits.weights;

  const load = (p: PathPreset) => {
    setPreset(p.id);
    setN(p.n);
    setEdges(p.edges.map((e) => [...e] as PathEdge));
    setSource(p.source);
    setTarget(p.target ?? null);
    setScript(null);
  };
  const setWeight = (k: number, raw: string) => {
    const v = Math.max(wMin, Math.min(wMax, Math.round(Number(raw))));
    if (!Number.isFinite(v)) return;
    setEdges((es) => es.map((e, i) => (i === k ? ([e[0], e[1], v] as PathEdge) : e)));
    setPreset("custom");
    setScript(null);
  };

  const run = (a: PathAlgo = algo) => {
    setAlgo(a);
    setScript(pathScript(a, { n, edges }, source, target, { predict, title: ALGO_LABEL[a] }));
    track("dsa_visualizer_run", { visualizer: spec.id, algo: a, predict, preset });
  };

  const verts = useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);
  const note = presets.find((p) => p.id === preset)?.note;
  const editing = !script;
  /** Kahn and union-find read a plain list of links: no start, no target and no road costs */
  const plain = algo === "kahn" || algo === "dsu";
  const sel = "min-h-11 border border-line-strong bg-surface px-2 text-[15px] font-normal text-fg focus:border-signal focus:outline-none";

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-[13px] font-semibold text-fg-2">
          Map
          <select
            value={preset}
            onChange={(e) => {
              const p = presets.find((x) => x.id === e.target.value);
              if (p) load(p);
            }}
            className={`${sel} max-w-full`}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
            {preset === "custom" && <option value="custom">Your own costs</option>}
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
      {note && <p className="m-0 text-[14px] text-fg-2">{note}</p>}

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {!plain && <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
              Start
              <select value={source} onChange={(e) => (setSource(Number(e.target.value)), setScript(null))} className={sel}>
                {verts.map((v) => (
                  <option key={v} value={v}>
                    Vertex {v}
                  </option>
                ))}
              </select>
            </label>}
            {!plain && <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
              Target (optional)
              <select value={target ?? ""} onChange={(e) => (setTarget(e.target.value === "" ? null : Number(e.target.value)), setScript(null))} className={sel}>
                <option value="">None: find every distance</option>
                {verts.map((v) => (
                  <option key={v} value={v}>
                    Vertex {v}
                  </option>
                ))}
              </select>
            </label>}
          </div>
          {plain ? (
            <p className="m-0 text-[14px] text-fg-2">
              {algo === "dsu" ? "Each pair is a link between two accounts, read in the listed order. Pick a map, then run it." : "Each arrow means: the first one must come before the second. Pick a map, then run it."}
            </p>
          ) : (
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1 text-[13px] font-semibold text-fg-2">Road costs (one way). Try a negative cost.</legend>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1 p-0 sm:grid-cols-3">
              {edges.map((e, k) => (
                <li key={k} className="flex items-center justify-between gap-2 text-[14px] text-fg-2">
                  <span className="font-mono">
                    {e[0]} → {e[1]}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={wMin}
                    max={wMax}
                    value={e[2]}
                    onChange={(ev) => setWeight(k, ev.target.value)}
                    aria-label={`Cost of the road from ${e[0]} to ${e[1]}`}
                    className="min-h-11 w-20 border border-line-strong bg-surface px-2 text-right font-mono text-[15px] text-fg focus:border-signal focus:outline-none"
                  />
                </li>
              ))}
            </ul>
          </fieldset>
          )}
        </div>
      ) : (
        <StepPlayer script={script} autoPlay={auto} label={`${ALGO_LABEL[algo]} on your map`} stepMs={1000} />
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <button type="button" onClick={() => run()} className="min-h-11 bg-signal px-5 text-[15px] font-semibold text-on-signal">
              Run {ALGO_SHORT[algo]} step by step →
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setScript(null)} className="min-h-11 border-2 border-signal px-4 text-[14px] font-semibold text-signal-text">
                ✎ Change the map
              </button>
              {spec.algorithms
                .filter((a) => a !== algo)
                .map((a) => (
                  <button key={a} type="button" onClick={() => run(a)} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
                    Now try {ALGO_SHORT[a]} on the same map
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
        </fieldset>
      </div>
    </div>
  );
}
