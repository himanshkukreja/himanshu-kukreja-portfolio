"use client";

/**
 * The tree sandbox (`::sandbox[tree]`, dsa-mastery sandbox.yml): a live binary search tree the learner searches, inserts
 * into and deletes from, and walks in the four orders. Each operation runs on the step engine
 * (src/lib/dsa/viz/tree.ts) and plays step by step in the StepPlayer: a value hovers above the root, the path lights up
 * node by node, a link is changed.
 *
 * The "Start from these values" box inserts the values one at a time, in the order typed, so the order decides the shape
 * (sorted values make a chain). After each search, insert or delete, the same operation is costed on a tree of the same
 * values built to be as short as possible, so the price of a bad shape is on the screen. Options: auto-play or step by
 * step, and predict mode. Typed values are checked against the sandbox's limits.
 */
import { useState } from "react";
import {
  balancedCost,
  balancedOrder,
  makeTree,
  runTreeOp,
  stillScript as still,
  treeHeight,
  treeSize,
  treeText,
  treeValues,
  TREE_OP_LABEL,
  type TreeModel,
  type TreeOp,
  type TreeOpName,
} from "@/lib/dsa/viz/tree";
import type { Script } from "@/lib/dsa/viz/types";
import type { SandboxSpec } from "@/lib/dsa/viz/registry";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

const NEEDS_VALUE = new Set<TreeOpName>(["insert", "search", "delete"]);

type LogRow = { label: string; steps: number; after: string };

export default function TreeSandbox({ spec }: { spec: SandboxSpec }) {
  const [lo, hi] = spec.limits.value;
  const maxItems = spec.limits.nodes;
  const [auto, setAuto] = useState(true);
  const [predict, setPredict] = useState(false);
  const [model, setModel] = useState<TreeModel>(() => makeTree(spec.start));
  const [script, setScript] = useState<Script>(() => still(makeTree(spec.start), "Your search tree. Search, insert, delete or start a walk below and watch it run, step by step."));
  const [value, setValue] = useState("45");
  const [build, setBuild] = useState(spec.start.join(", "));
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [last, setLast] = useState<{ label: string; mine: number; balanced: number; height: number; balancedHeight: number } | null>(null);
  const ops = spec.operations as TreeOpName[];
  const total = log.reduce((a, r) => a + r.steps, 0);
  const size = treeSize(model);
  const height = treeHeight(model);
  const balancedHeight = treeHeight(makeTree(balancedOrder(treeValues(model))));

  const num = (s: string): number | null => {
    const n = Number(s.trim());
    return s.trim() !== "" && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };

  const rebuild = (vals: number[]) => {
    const m = makeTree(vals);
    setModel(m);
    setLast(null);
    const h = treeHeight(m);
    setScript(
      still(
        m,
        vals.length
          ? `A search tree of ${treeSize(m)} value${treeSize(m) === 1 ? "" : "s"}, built by inserting ${vals.join(", ")} in that order. It has ${h} level${h === 1 ? "" : "s"}. The root is ${vals[0]}.`
          : "An empty tree. Insert something.",
      ),
    );
  };

  const run = (name: TreeOpName) => {
    setMsg(null);
    const v = num(value);
    if (NEEDS_VALUE.has(name) && v === null) {
      setMsg(`Type a whole number from ${lo} to ${hi} in the value box first.`);
      return;
    }
    if (name === "insert" && size >= maxItems && treeValues(model).indexOf(v as number) < 0) {
      setMsg(`The sandbox holds up to ${maxItems} values. Delete one, or start a new tree.`);
      return;
    }
    const op: TreeOp = NEEDS_VALUE.has(name) ? ({ op: name, value: v as number } as TreeOp) : ({ op: name } as TreeOp);
    const r = runTreeOp(model, op, { predict });
    setScript(r.script);
    setModel(r.tree);
    const steps = r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    const cmp = balancedCost(model, op);
    setLast(cmp ? { label: r.script.title, ...cmp } : null);
    setLog((l) => [{ label: r.script.title, steps, after: treeText(r.tree) }, ...l].slice(0, 12));
    track("dsa_sandbox_op", { sandbox: spec.id, op: name, predict });
  };

  const onBuild = () => {
    const vals = build.split(/[\s,]+/).filter(Boolean).map(num);
    if (vals.some((x) => x === null)) {
      setMsg(`Use whole numbers from ${lo} to ${hi}, separated by commas. They are inserted in the order typed.`);
      return;
    }
    const distinct = Array.from(new Set(vals as number[]));
    if (distinct.length > maxItems) {
      setMsg(`Up to ${maxItems} different values fit in the sandbox.`);
      return;
    }
    setMsg(null);
    setLog([]);
    rebuild(distinct);
  };

  const preset = (vals: number[]) => {
    setBuild(vals.join(", "));
    setMsg(null);
    setLog([]);
    rebuild(vals);
  };

  const btn = "min-h-11 border-2 border-signal px-3 text-left text-[14px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)] sm:text-center";
  const has = (o: TreeOpName) => ops.includes(o);
  const withValue = (o: TreeOpName) => `${TREE_OP_LABEL[o]}${NEEDS_VALUE.has(o) ? ` ${num(value) ?? "?"}` : ""}`;

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <StepPlayer script={script} autoPlay={auto && script.frames.length > 1} label="Tree sandbox" stepMs={1250} />

      <p className="m-0 font-mono text-[12px] text-fg-3" aria-live="polite">
        {size === 0 ? "Empty tree" : `${size} value${size === 1 ? "" : "s"}, ${height} level${height === 1 ? "" : "s"} tall`}
        {size > 1 && ` · a perfectly balanced tree of these values would be ${balancedHeight} level${balancedHeight === 1 ? "" : "s"} tall`}
      </p>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
            Value
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              aria-describedby="ts-range"
              className="min-h-11 w-24 border border-line-strong bg-surface px-3 font-mono text-[16px] font-normal text-fg focus:border-signal focus:outline-none"
            />
          </label>
          <span id="ts-range" className="pb-3 font-mono text-[12px] text-fg-3">
            {lo} to {hi}, up to {maxItems} values
          </span>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Search, insert, delete: one path from the root</span>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Tree operations">
          {(["search", "insert", "delete"] as const).filter(has).map((o) => (
            <button key={o} type="button" onClick={() => run(o)} className={btn}>
              {withValue(o)}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Walk every node</span>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Tree walks">
          {(["preorder", "inorder", "postorder", "levelorder"] as const).filter(has).map((o) => (
            <button key={o} type="button" onClick={() => run(o)} className={btn}>
              {TREE_OP_LABEL[o]}
            </button>
          ))}
        </div>
        {msg && (
          <p role="alert" className="m-0 text-[14px] text-bad-text">
            {msg}
          </p>
        )}
      </div>

      {last && (
        <div className="grid gap-2 border border-line bg-surface p-3 text-[14px] sm:grid-cols-2" aria-live="polite">
          <p className="m-0 text-fg">
            <span className="block font-mono text-[12px] uppercase tracking-label text-signal-text">Your tree ({last.height} level{last.height === 1 ? "" : "s"})</span>
            {last.label}: <strong>{last.mine}</strong> step{last.mine === 1 ? "" : "s"}
          </p>
          <p className="m-0 text-fg-2">
            <span className="block font-mono text-[12px] uppercase tracking-label text-fg-3">Same values, balanced ({last.balancedHeight} level{last.balancedHeight === 1 ? "" : "s"})</span>
            {last.balanced} step{last.balanced === 1 ? "" : "s"}
          </p>
          {last.mine > last.balanced && <p className="m-0 text-fg-2 sm:col-span-2">Your tree is taller than it needs to be, so the path is longer. The order the values went in decides the shape.</p>}
        </div>
      )}

      <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0 text-[14px] text-fg-2">
        <legend className="sr-only">Sandbox options</legend>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Play steps automatically
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={predict} onChange={(e) => setPredict(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Ask me to predict (insert, delete, in-order)
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
          Start from these values (inserted one by one, in this order)
          <input
            value={build}
            onChange={(e) => setBuild(e.target.value)}
            placeholder="40, 25, 60, 10, 30"
            className="min-h-11 w-full min-w-0 border border-line-strong bg-surface px-3 font-mono text-[15px] font-normal text-fg focus:border-signal focus:outline-none"
          />
        </label>
        <button type="submit" className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
          Build
        </button>
        <button type="button" onClick={() => preset([10, 20, 30, 40, 50, 60])} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Sorted (a chain)
        </button>
        <button type="button" onClick={() => preset([40, 20, 60, 10, 30, 50, 70])} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Balanced
        </button>
        <button
          type="button"
          onClick={() => {
            const n = 5 + Math.floor(Math.random() * 3);
            const vals = Array.from(new Set(Array.from({ length: n }, () => lo + Math.floor(Math.random() * Math.min(99, hi - lo + 1)))));
            preset(vals);
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
            {log.map((r, k) => (
              <li key={k} className="break-words">
                {r.label}: {r.steps} step{r.steps === 1 ? "" : "s"} → {r.after}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
