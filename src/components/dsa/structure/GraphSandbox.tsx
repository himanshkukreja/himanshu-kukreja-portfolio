"use client";

/**
 * The graph sandbox (`::sandbox[graph]`, dsa-mastery sandbox.yml): a live graph the learner adds edges to and removes them from,
 * then asks for the neighbours or the degree of a vertex, or whether two vertices are joined. The graph has a fixed set of
 * vertices (0 to n - 1, drawn on a ring) and is stored twice in the picture, as an adjacency list and, if asked, as an adjacency
 * matrix. Each operation runs on the step engine (src/lib/dsa/viz/graph.ts) and plays step by step in the StepPlayer; the step
 * counter counts reads and writes of list entries.
 *
 * "Start from these edges" takes pairs such as `0-1, 0-2, 1-3`. Options: undirected or directed, list only or list and matrix,
 * auto-play or step by step, and predict mode.
 */
import { useState } from "react";
import { GRAPH_OP_LABEL, graphText, makeGraph, runGraphOp, stillScript as still, type GraphModel, type GraphOp, type GraphOpName } from "@/lib/dsa/viz/graph";
import type { GraphState, Script } from "@/lib/dsa/viz/types";
import type { SandboxSpec } from "@/lib/dsa/viz/registry";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

type LogRow = { label: string; steps: number; after: string };

export default function GraphSandbox({ spec }: { spec: SandboxSpec }) {
  const [lo, hi] = spec.limits.value;
  const n = hi - lo + 1;
  const canFlip = spec.variants.includes("undirected") && spec.variants.includes("directed");
  const [auto, setAuto] = useState(true);
  const [predict, setPredict] = useState(false);
  const [directed, setDirected] = useState(false);
  const [matrix, setMatrix] = useState(false);
  const show: GraphState["show"] = matrix ? "all" : "both";
  const [model, setModel] = useState<GraphModel>(() => makeGraph(n, spec.start));
  const [script, setScript] = useState<Script>(() => still(makeGraph(n, spec.start), "Your graph. Add an edge, remove one, or ask about a vertex below, and watch it run step by step. The boxes beside the graph are its adjacency list."));
  const [u, setU] = useState("0");
  const [v, setV] = useState("4");
  const [build, setBuild] = useState(pairsText(spec.start));
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const ops = spec.operations as GraphOpName[];
  const total = log.reduce((a, r) => a + r.steps, 0);

  const num = (s: string): number | null => {
    const x = Number(s.trim());
    return s.trim() !== "" && Number.isInteger(x) && x >= lo && x <= hi ? x : null;
  };

  /** "0-1, 0-2" or "0 1, 0 2" into a flat list of edge ends, or null when it is not pairs of vertices in range */
  const parsePairs = (text: string): number[] | null => {
    const parts = text.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    const flat: number[] = [];
    for (const p of parts) {
      const ends = p.split(/[\s\-–>]+/).filter(Boolean).map(num);
      if (ends.length !== 2 || ends.some((e) => e === null)) {
        setMsg(`Type edges as pairs of whole numbers from ${lo} to ${hi}, such as 0-1, 0-2, 1-3.`);
        return null;
      }
      flat.push(ends[0] as number, ends[1] as number);
    }
    return flat;
  };

  const rebuild = (flat: number[], d: boolean = directed, s: GraphState["show"] = show) => {
    const m = makeGraph(n, flat, { directed: d });
    setModel(m);
    setScript(still(m, flat.length ? `A ${d ? "directed" : "undirected"} graph with ${m.edges.length} edge${m.edges.length === 1 ? "" : "s"}, built from your pairs. Vertices with no edge are isolated: their lists are empty.` : "A graph with no edges yet. Add one.", s));
  };

  const play = (op: GraphOp) => {
    const r = runGraphOp(model, op, { predict, show });
    setScript(r.script);
    setModel(r.graph);
    const steps = r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    setLog((l) => [{ label: r.script.title, steps, after: graphText(r.graph) }, ...l].slice(0, 12));
    track("dsa_sandbox_op", { sandbox: spec.id, op: op.op, predict });
  };

  const run = (opName: GraphOpName) => {
    setMsg(null);
    const a = num(u);
    const b = num(v);
    if (a === null) {
      setMsg(`Type a vertex from ${lo} to ${hi} in the first box.`);
      return;
    }
    if (opName === "neighbors" || opName === "degree") {
      play({ op: opName, u: a });
      return;
    }
    if (b === null) {
      setMsg(`Type a vertex from ${lo} to ${hi} in the second box.`);
      return;
    }
    if (opName === "add_edge") play({ op: "add_edge", u: a, v: b });
    else play({ op: opName, u: a, v: b });
  };

  const onBuild = () => {
    const flat = parsePairs(build);
    if (!flat) return;
    setMsg(null);
    setLog([]);
    rebuild(flat);
  };

  const preset = (flat: number[]) => {
    setBuild(pairsText(flat));
    setMsg(null);
    setLog([]);
    rebuild(flat);
  };

  const flip = (d: boolean) => {
    setDirected(d);
    setMsg(null);
    setLog([]);
    const flat = parsePairs(build);
    rebuild(flat ?? spec.start, d);
  };

  const flipMatrix = (on: boolean) => {
    setMatrix(on);
    setScript(still(model, on ? "The matrix is shown as well: the same edges, stored as a grid with a row and a column for every vertex." : "Back to the graph and its adjacency list.", on ? "all" : "both"));
  };

  const btn = "min-h-11 border-2 border-signal px-3 text-left text-[14px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)] sm:text-center";
  const has = (o: GraphOpName) => ops.includes(o);
  const input = "min-h-11 w-20 border border-line-strong bg-surface px-3 font-mono text-[16px] font-normal text-fg focus:border-signal focus:outline-none";
  const e = model.edges.length;

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <StepPlayer script={script} autoPlay={auto && script.frames.length > 1} label="Graph sandbox" stepMs={1250} />

      <p className="m-0 font-mono text-[12px] text-fg-3" aria-live="polite">
        {n} vertices, {e} edge{e === 1 ? "" : "s"}, {model.directed ? "directed" : "undirected"} · the list holds {model.directed ? e : e * 2} entr{(model.directed ? e : e * 2) === 1 ? "y" : "ies"}, the matrix always {n * n} cells
      </p>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
            Vertex u
            <input value={u} onChange={(x) => setU(x.target.value)} inputMode="numeric" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
            Vertex v
            <input value={v} onChange={(x) => setV(x.target.value)} inputMode="numeric" className={input} />
          </label>
          <span className="pb-3 font-mono text-[12px] text-fg-3">
            vertices {lo} to {hi}
          </span>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Change the edges</span>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Edge changes">
          {(["add_edge", "remove_edge"] as const).filter(has).map((o) => (
            <button key={o} type="button" onClick={() => run(o)} className={btn}>
              {GRAPH_OP_LABEL[o]} {num(u) ?? "?"}{model.directed ? " to " : "-"}{num(v) ?? "?"}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Ask a question</span>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Graph questions">
          {has("neighbors") && (
            <button type="button" onClick={() => run("neighbors")} className={btn}>
              {GRAPH_OP_LABEL.neighbors} {num(u) ?? "?"}
            </button>
          )}
          {has("degree") && (
            <button type="button" onClick={() => run("degree")} className={btn}>
              {GRAPH_OP_LABEL.degree} {num(u) ?? "?"}
            </button>
          )}
          {has("has_edge") && (
            <button type="button" onClick={() => run("has_edge")} className={btn}>
              {GRAPH_OP_LABEL.has_edge} {num(u) ?? "?"}{model.directed ? " to " : "-"}{num(v) ?? "?"}?
            </button>
          )}
        </div>
        {msg && (
          <p role="alert" className="m-0 text-[14px] text-bad-text">
            {msg}
          </p>
        )}
      </div>

      <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0 text-[14px] text-fg-2">
        <legend className="sr-only">Sandbox options</legend>
        {canFlip && (
          <label className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={directed} onChange={(x) => flip(x.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
            Directed edges (one way)
          </label>
        )}
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={matrix} onChange={(x) => flipMatrix(x.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Show the adjacency matrix too
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={auto} onChange={(x) => setAuto(x.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Play steps automatically
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={predict} onChange={(x) => setPredict(x.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Ask me to predict (is there an edge)
        </label>
      </fieldset>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(x) => {
          x.preventDefault();
          onBuild();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-semibold text-fg-2">
          Start from these edges (pairs of vertices)
          <input
            value={build}
            onChange={(x) => setBuild(x.target.value)}
            placeholder="0-1, 0-2, 1-3"
            className="min-h-11 w-full min-w-0 border border-line-strong bg-surface px-3 font-mono text-[15px] font-normal text-fg focus:border-signal focus:outline-none"
          />
        </label>
        <button type="submit" className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
          Build
        </button>
        <button type="button" onClick={() => preset([0, 1, 0, 2, 0, 3, 0, 4, 0, 5])} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Star (one hub)
        </button>
        <button type="button" onClick={() => preset([0, 1, 1, 2, 2, 3, 3, 4, 4, 5])} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Line
        </button>
        <button type="button" onClick={() => preset(Array.from({ length: n }, (_, i) => [i, (i + 1) % n]).flat())} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Ring
        </button>
        <button type="button" onClick={() => preset(Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, j) => [i, i + j + 1]).flat()).flat())} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Everyone to everyone
        </button>
      </form>

      {log.length > 0 && (
        <details className="border border-line">
          <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-mono text-[12px] text-fg-3">
            This session: {log.length} operation{log.length === 1 ? "" : "s"}, {total} read{total === 1 ? "" : "s"} and write{total === 1 ? "" : "s"} in all
          </summary>
          <ol className="m-0 flex list-none flex-col gap-1 px-3 pb-3 font-mono text-[12px] text-fg-2">
            {log.map((r, i) => (
              <li key={i} className="break-words">
                {r.label}: {r.steps} step{r.steps === 1 ? "" : "s"} → {r.after}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function pairsText(flat: number[]): string {
  const out: string[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push(`${flat[i]}-${flat[i + 1]}`);
  return out.join(", ");
}
