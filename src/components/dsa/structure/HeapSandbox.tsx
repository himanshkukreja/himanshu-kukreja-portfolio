"use client";

/**
 * The heap sandbox (`::sandbox[heap]`, dsa-mastery sandbox.yml): a live binary heap the learner pushes into, pops from and peeks
 * at, then builds from a list with heapify, or runs a stream through as a heap of size k. Each operation runs on the step engine
 * (src/lib/dsa/viz/heap.ts) and plays step by step in the StepPlayer: the heap is drawn as a tree and as the array that holds
 * it, an item climbs or sinks one swap at a time, and the step counter counts comparisons and swaps.
 *
 * "Start from these values" pushes the values one at a time, in the order typed. Heapify and top k use the typed values as they
 * are: heapify lays them out in that order and fixes the array in place, and top k treats them as the stream. Options: min-heap
 * or max-heap, auto-play or step by step, and predict mode.
 */
import { useState } from "react";
import { heapSize, heapText, heapHeight, HEAP_OP_LABEL, makeHeap, rawHeap, runHeapOp, stillScript as still, type HeapKind, type HeapModel, type HeapOp, type HeapOpName } from "@/lib/dsa/viz/heap";
import type { Script } from "@/lib/dsa/viz/types";
import type { SandboxSpec } from "@/lib/dsa/viz/registry";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

type LogRow = { label: string; steps: number; after: string };

export default function HeapSandbox({ spec }: { spec: SandboxSpec }) {
  const [lo, hi] = spec.limits.value;
  const maxItems = spec.limits.nodes;
  const canFlip = spec.variants.includes("min") && spec.variants.includes("max");
  const [auto, setAuto] = useState(true);
  const [predict, setPredict] = useState(false);
  const [kind, setKind] = useState<HeapKind>("min");
  const [model, setModel] = useState<HeapModel>(() => makeHeap(spec.start));
  const [script, setScript] = useState<Script>(() => still(makeHeap(spec.start), "Your min-heap. Push, pop or peek below and watch it run, step by step. The array under the tree is how it is stored."));
  const [value, setValue] = useState("5");
  const [k, setK] = useState("3");
  const [build, setBuild] = useState(spec.start.join(", "));
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const ops = spec.operations as HeapOpName[];
  const total = log.reduce((a, r) => a + r.steps, 0);
  const size = heapSize(model);
  const height = heapHeight(model);
  const name = kind === "min" ? "min-heap" : "max-heap";

  const num = (s: string): number | null => {
    const n = Number(s.trim());
    return s.trim() !== "" && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };
  const typed = (): number[] | null => {
    const vals = build.split(/[\s,]+/).filter(Boolean).map(num);
    if (vals.length === 0 || vals.some((x) => x === null)) {
      setMsg(`Type whole numbers from ${lo} to ${hi}, separated by commas, in the box at the bottom first.`);
      return null;
    }
    if (vals.length > maxItems) {
      setMsg(`Up to ${maxItems} values fit in the sandbox.`);
      return null;
    }
    return vals as number[];
  };

  const rebuild = (vals: number[], kd: HeapKind = kind) => {
    const m = makeHeap(vals, kd);
    setModel(m);
    setScript(still(m, vals.length ? `A ${kd}-heap of ${vals.length} value${vals.length === 1 ? "" : "s"}, built by pushing ${vals.join(", ")} in that order. The ${kd === "min" ? "smallest" : "largest"} is on top.` : "An empty heap. Push something."));
  };

  const play = (op: HeapOp, from: HeapModel) => {
    const r = runHeapOp(from, op, { predict });
    setScript(r.script);
    setModel(r.heap);
    const steps = r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    setLog((l) => [{ label: r.script.title, steps, after: heapText(r.heap) }, ...l].slice(0, 12));
    track("dsa_sandbox_op", { sandbox: spec.id, op: op.op, predict });
  };

  const run = (opName: HeapOpName) => {
    setMsg(null);
    if (opName === "push") {
      const v = num(value);
      if (v === null) {
        setMsg(`Type a whole number from ${lo} to ${hi} in the value box first.`);
        return;
      }
      if (size >= maxItems) {
        setMsg(`The sandbox holds up to ${maxItems} values. Pop one, or start a new heap.`);
        return;
      }
      play({ op: "push", value: v }, model);
    } else if (opName === "pop" || opName === "peek") {
      play({ op: opName }, model);
    } else if (opName === "heapify") {
      const vals = typed();
      if (!vals) return;
      play({ op: "heapify" }, rawHeap(vals, kind));
    } else {
      const vals = typed();
      const kv = num(k);
      if (!vals) return;
      if (kv === null || kv < 1 || kv > Math.max(vals.length, 1)) {
        setMsg(`Type k as a whole number from 1 to ${vals.length} (the number of typed values).`);
        return;
      }
      play({ op: "topk", value: kv }, rawHeap(vals, "min"));
    }
  };

  const onBuild = () => {
    const vals = typed();
    if (!vals) return;
    setMsg(null);
    setLog([]);
    rebuild(vals);
  };

  const preset = (vals: number[]) => {
    setBuild(vals.join(", "));
    setMsg(null);
    setLog([]);
    rebuild(vals);
  };

  const flip = (kd: HeapKind) => {
    setKind(kd);
    setMsg(null);
    setLog([]);
    const vals = build.split(/[\s,]+/).filter(Boolean).map(num);
    rebuild(vals.every((x) => x !== null) ? (vals as number[]) : spec.start, kd);
  };

  const btn = "min-h-11 border-2 border-signal px-3 text-left text-[14px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)] sm:text-center";
  const has = (o: HeapOpName) => ops.includes(o);

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <StepPlayer script={script} autoPlay={auto && script.frames.length > 1} label="Heap sandbox" stepMs={1250} />

      <p className="m-0 font-mono text-[12px] text-fg-3" aria-live="polite">
        {size === 0 ? `Empty ${name}` : `${size} value${size === 1 ? "" : "s"}, ${height} level${height === 1 ? "" : "s"} tall`}
        {size > 0 && ` · ${kind === "min" ? "smallest" : "largest"} on top: ${model.cells[0]} · a push or a pop follows one path of at most ${height} step${height === 1 ? "" : "s"} up or down`}
      </p>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
            Value
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              aria-describedby="hs-range"
              className="min-h-11 w-24 border border-line-strong bg-surface px-3 font-mono text-[16px] font-normal text-fg focus:border-signal focus:outline-none"
            />
          </label>
          <span id="hs-range" className="pb-3 font-mono text-[12px] text-fg-3">
            {lo} to {hi}, up to {maxItems} values
          </span>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Push, pop, peek: one path, or one read</span>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Heap operations">
          {(["push", "pop", "peek"] as const).filter(has).map((o) => (
            <button key={o} type="button" onClick={() => run(o)} className={btn}>
              {o === "push" ? `Push ${num(value) ?? "?"}` : HEAP_OP_LABEL[o]}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Use the typed values (box at the bottom)</span>
        <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Heap builds">
          {has("heapify") && (
            <button type="button" onClick={() => run("heapify")} className={btn}>
              {HEAP_OP_LABEL.heapify}
            </button>
          )}
          {has("topk") && (
            <>
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
                k
                <input
                  value={k}
                  onChange={(e) => setK(e.target.value)}
                  inputMode="numeric"
                  className="min-h-11 w-16 border border-line-strong bg-surface px-3 font-mono text-[16px] font-normal text-fg focus:border-signal focus:outline-none"
                />
              </label>
              <button type="button" onClick={() => run("topk")} className={btn}>
                Top {num(k) ?? "k"} of the typed values
              </button>
            </>
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
            <input type="checkbox" checked={kind === "max"} onChange={(e) => flip(e.target.checked ? "max" : "min")} className="h-5 w-5 accent-[var(--c-signal)]" />
            Max-heap (largest on top)
          </label>
        )}
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Play steps automatically
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={predict} onChange={(e) => setPredict(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Ask me to predict (push, pop)
        </label>
      </fieldset>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onBuild();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-semibold text-fg-2">
          Start from these values (pushed one by one, in this order)
          <input
            value={build}
            onChange={(e) => setBuild(e.target.value)}
            placeholder="10, 20, 15, 30, 40"
            className="min-h-11 w-full min-w-0 border border-line-strong bg-surface px-3 font-mono text-[15px] font-normal text-fg focus:border-signal focus:outline-none"
          />
        </label>
        <button type="submit" className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
          Build
        </button>
        <button type="button" onClick={() => preset([9, 8, 7, 6, 5, 4])} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Descending (every push climbs)
        </button>
        <button type="button" onClick={() => preset([1, 2, 3, 4, 5, 6, 7])} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Ascending (no swaps)
        </button>
        <button
          type="button"
          onClick={() => {
            const n = 6 + Math.floor(Math.random() * 3);
            preset(Array.from({ length: n }, () => lo + Math.floor(Math.random() * Math.min(99, hi - lo + 1))));
          }}
          className="min-h-11 border border-line-strong px-3 text-[14px] text-fg"
        >
          Random
        </button>
      </form>

      {log.length > 0 && (
        <details className="border border-line">
          <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-mono text-[12px] text-fg-3">
            This session: {log.length} operation{log.length === 1 ? "" : "s"}, {total} step{total === 1 ? "" : "s"} in all
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
