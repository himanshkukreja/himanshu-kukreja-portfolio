"use client";

/**
 * An algorithm lesson's visualizer for dynamic programming (`::visualizer[id]`, dsa-mastery visualizer.yml with view: dp): pick a small
 * problem (climbing stairs, the fewest coins, routes across a grid, or the longest common subsequence of two words), change its numbers,
 * then step through how it is solved, forward and back, on the StepPlayer. Climbing stairs can be solved three ways: as a plain recursion
 * tree (calls that repeat an earlier call are marked), as the same recursion with a memo (calls that read a saved answer are marked), or
 * with a table filled from the base cases up. The other problems use the table. In a table the cells a new cell reads from are
 * highlighted. Auto-play stops at the predict questions.
 */
import { useState } from "react";
import type { DpPreset, DpVisualizerSpec } from "@/lib/dsa/viz/registry";
import { dpScript, DP_METHOD_LABEL, type DpMethod, type DpProblem } from "@/lib/dsa/viz/dp";
import type { Script } from "@/lib/dsa/viz/types";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

const METHOD_NOTE: Record<DpMethod, string> = {
  "plain-recursion": "Every call makes its two calls, and nothing is saved. Repeated calls are outlined and marked again.",
  memoise: "The same recursion, with each answer saved. A call whose answer is saved reads it and stops, and is marked memo.",
  tabulate: "No recursion. Fill a table from the base cases up, in an order where every cell finds the cells it reads already filled.",
};
const KIND_LABEL: Record<DpProblem["kind"], string> = { stairs: "Climbing stairs", coins: "Fewest coins", grid: "Routes on a grid", lcs: "Longest common subsequence" };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
const copy = (p: DpProblem): DpProblem => JSON.parse(JSON.stringify(p));

export default function DpVisualizer({ spec }: { spec: DpVisualizerSpec }) {
  const presets = spec.presets;
  const first = presets[0];
  const L = spec.limits;
  const [preset, setPreset] = useState(first?.id || "custom");
  const [problem, setProblem] = useState<DpProblem>(first ? copy(first.problem) : { kind: "stairs", n: 5 });
  const [coinText, setCoinText] = useState(first && first.problem.kind === "coins" ? first.problem.coins.join(", ") : "1, 3, 4");
  const [method, setMethod] = useState<DpMethod>(spec.algorithms[0] || "tabulate");
  const [predict, setPredict] = useState(true);
  const [auto, setAuto] = useState(false);
  const [script, setScript] = useState<Script | null>(null);

  const treeOk = problem.kind === "stairs" && problem.n >= L.treeStairs[0] && problem.n <= L.treeStairs[1];
  const allowed = (m: DpMethod) => m === "tabulate" || treeOk;
  const usable = allowed(method) ? method : "tabulate";

  const load = (p: DpPreset) => {
    setPreset(p.id);
    setProblem(copy(p.problem));
    if (p.problem.kind === "coins") setCoinText(p.problem.coins.join(", "));
    setScript(null);
  };
  const edit = (next: DpProblem) => {
    setProblem(next);
    setPreset("custom");
    setScript(null);
  };
  const parseCoins = (text: string): number[] => {
    const seen = new Set<number>();
    for (const part of text.split(/[ ,]+/)) {
      const v = Math.round(Number(part));
      if (part && Number.isFinite(v) && v >= L.coinValue[0] && v <= L.coinValue[1]) seen.add(v);
    }
    return [...seen].sort((a, b) => a - b).slice(0, L.coins);
  };
  const valid = problem.kind !== "coins" || problem.coins.length >= 1;

  const run = (m: DpMethod = usable) => {
    setMethod(m);
    setScript(dpScript(problem, m, { predict, title: DP_METHOD_LABEL[m] }));
    track("dsa_visualizer_run", { visualizer: spec.id, algo: m, predict, preset });
  };

  const note = presets.find((p) => p.id === preset)?.note;
  const editing = !script;
  const sel = "min-h-11 border border-line-strong bg-surface px-2 text-[15px] font-normal text-fg focus:border-signal focus:outline-none";
  const num = "min-h-11 w-20 border border-line-strong bg-surface px-2 text-right font-mono text-[15px] text-fg focus:border-signal focus:outline-none";
  const txt = "min-h-11 w-40 border border-line-strong bg-surface px-2 font-mono text-[15px] text-fg focus:border-signal focus:outline-none";

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-[13px] font-semibold text-fg-2">
          Problem
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
            {preset === "custom" && <option value="custom">Your own numbers</option>}
          </select>
        </label>
        <div role="radiogroup" aria-label="Method" className="flex flex-wrap border border-line-strong">
          {spec.algorithms.map((a) => {
            const ok = allowed(a);
            return (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={a === usable}
                disabled={!ok}
                title={ok ? undefined : "Only climbing stairs up to " + L.treeStairs[1] + " stairs is drawn as a tree"}
                onClick={() => (script ? run(a) : setMethod(a))}
                className={`min-h-11 px-3 text-[14px] font-semibold ${a === usable ? "bg-signal text-on-signal" : "text-fg-2 hover:bg-surface-2"} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {DP_METHOD_LABEL[a]}
              </button>
            );
          })}
        </div>
      </div>
      {note && <p className="m-0 text-[14px] text-fg-2">{note}</p>}
      <p className="m-0 text-[14px] text-fg-3">{METHOD_NOTE[usable]}</p>

      {editing ? (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold text-fg-2">{KIND_LABEL[problem.kind]}: change any number.</legend>
          {problem.kind === "stairs" && (
            <label className="flex items-center gap-3 text-[14px] text-fg-2">
              Number of stairs ({L.stairs[0]} to {L.stairs[1]}; the tree views need {L.treeStairs[0]} to {L.treeStairs[1]})
              <input type="number" inputMode="numeric" min={L.stairs[0]} max={L.stairs[1]} value={problem.n} onChange={(e) => edit({ kind: "stairs", n: clamp(Number(e.target.value), L.stairs[0], L.stairs[1]) })} aria-label="Number of stairs" className={num} />
            </label>
          )}
          {problem.kind === "coins" && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-fg-2">
              <label className="flex items-center gap-2">
                Coin values (up to {L.coins}, each {L.coinValue[0]} to {L.coinValue[1]})
                <input
                  type="text"
                  value={coinText}
                  onChange={(e) => {
                    setCoinText(e.target.value);
                    edit({ kind: "coins", coins: parseCoins(e.target.value), amount: problem.amount });
                  }}
                  aria-label="Coin values, separated by commas"
                  className={txt}
                />
              </label>
              <label className="flex items-center gap-2">
                Amount ({L.amount[0]} to {L.amount[1]})
                <input type="number" inputMode="numeric" min={L.amount[0]} max={L.amount[1]} value={problem.amount} onChange={(e) => edit({ kind: "coins", coins: problem.coins, amount: clamp(Number(e.target.value), L.amount[0], L.amount[1]) })} aria-label="Amount" className={num} />
              </label>
            </div>
          )}
          {problem.kind === "grid" && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-fg-2">
              <label className="flex items-center gap-2">
                Rows ({L.grid[0]} to {L.grid[1]})
                <input type="number" inputMode="numeric" min={L.grid[0]} max={L.grid[1]} value={problem.rows.length} onChange={(e) => edit({ kind: "grid", rows: Array.from({ length: clamp(Number(e.target.value), L.grid[0], L.grid[1]) }, () => ".".repeat(problem.rows[0].length)) })} aria-label="Rows" className={num} />
              </label>
              <label className="flex items-center gap-2">
                Columns ({L.grid[0]} to {L.grid[1]})
                <input type="number" inputMode="numeric" min={L.grid[0]} max={L.grid[1]} value={problem.rows[0].length} onChange={(e) => edit({ kind: "grid", rows: problem.rows.map(() => ".".repeat(clamp(Number(e.target.value), L.grid[0], L.grid[1]))) })} aria-label="Columns" className={num} />
              </label>
              <span className="text-fg-3">A new size opens every road. Closed roads come with the presets.</span>
            </div>
          )}
          {problem.kind === "lcs" && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-fg-2">
              {(["a", "b"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  {k === "a" ? "First word" : "Second word"} ({L.word[0]} to {L.word[1]} letters)
                  <input
                    type="text"
                    value={problem[k]}
                    maxLength={L.word[1]}
                    onChange={(e) => edit({ ...problem, [k]: e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, L.word[1]) })}
                    aria-label={k === "a" ? "First word" : "Second word"}
                    className={txt}
                  />
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ) : (
        <StepPlayer script={script} autoPlay={auto} label={`${DP_METHOD_LABEL[usable]}: ${KIND_LABEL[problem.kind]}`} stepMs={1000} />
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <button type="button" disabled={!valid || (problem.kind === "lcs" && (problem.a.length < L.word[0] || problem.b.length < L.word[0]))} onClick={() => run()} className="min-h-11 bg-signal px-5 text-[15px] font-semibold text-on-signal disabled:opacity-40">
              Run {DP_METHOD_LABEL[usable].toLowerCase()} step by step →
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setScript(null)} className="min-h-11 border-2 border-signal px-4 text-[14px] font-semibold text-signal-text">
                ✎ Change the numbers
              </button>
              {spec.algorithms
                .filter((a) => a !== usable && allowed(a))
                .map((a) => (
                  <button key={a} type="button" onClick={() => run(a)} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
                    Now try {DP_METHOD_LABEL[a].toLowerCase()} on the same problem
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
