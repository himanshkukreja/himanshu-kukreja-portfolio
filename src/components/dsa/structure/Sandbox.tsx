"use client";

/**
 * A structure's interactive sandbox (`::sandbox[id]`, dsa-mastery sandbox.yml): a live linked list the learner builds
 * and changes. Each operation runs on the step engine (src/lib/dsa/viz/list.ts) and plays step by step in the
 * StepPlayer: cursors walk, arrows turn, a one-line narration and a live pointer-hop counter. Next to it: what the same
 * operation would cost on an array, and a log of the session.
 *
 * Options: singly or doubly linked, with or without a tail pointer, auto-play or step by step, predict mode (questions
 * at the key steps of reverse and find-the-middle). Typed values are checked against the sandbox's limits.
 */
import { useMemo, useState } from "react";
import { arrayCostOf, LIST_OP_LABEL, listText, listValues, makeList, runListOp, stillScript as still, type ListModel, type ListOp, type ListOpName } from "@/lib/dsa/viz/list";
import type { Script } from "@/lib/dsa/viz/types";
import type { SandboxSpec } from "@/lib/dsa/viz/registry";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

const NEEDS_VALUE = new Set<ListOpName>(["push_front", "push_back", "insert_after", "delete", "search"]);
const GROWS = new Set<ListOpName>(["push_front", "push_back", "insert_after"]);

type LogRow = { label: string; hops: number; array: string; after: string };

export default function Sandbox({ spec }: { spec: SandboxSpec }) {
  const [lo, hi] = spec.limits.value;
  const maxNodes = spec.limits.nodes;
  const [doubly, setDoubly] = useState(false);
  const [tail, setTail] = useState(true);
  const [auto, setAuto] = useState(true);
  const [predict, setPredict] = useState(false);
  const [model, setModel] = useState<ListModel>(() => makeList(spec.start, { doubly: false, tail: true }));
  const [script, setScript] = useState<Script>(() => still(makeList(spec.start), "Your list. Pick an operation below and watch it run, step by step."));
  const [value, setValue] = useState("5");
  const [pos, setPos] = useState(0);
  const [build, setBuild] = useState(spec.start.join(", "));
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const ops = spec.operations;
  const total = log.reduce((a, r) => a + r.hops, 0);

  const num = (s: string): number | null => {
    const n = Number(s.trim());
    return s.trim() !== "" && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };

  const rebuild = (vals: number[], o: { doubly?: boolean; tail?: boolean } = {}) => {
    const m = makeList(vals, { doubly: o.doubly ?? doubly, tail: o.tail ?? tail });
    setModel(m);
    setScript(still(m, vals.length ? `A ${o.doubly ?? doubly ? "doubly" : "singly"} linked list of ${vals.length} node${vals.length === 1 ? "" : "s"}${(o.tail ?? tail) ? ", with a tail pointer" : ", with no tail pointer"}.` : "An empty list: head is null. Insert something."));
    setPos((p) => Math.min(p, Math.max(0, vals.length - 1)));
  };

  const run = (name: ListOpName) => {
    setMsg(null);
    const v = num(value);
    if (NEEDS_VALUE.has(name) && v === null) {
      setMsg(`Type a whole number from ${lo} to ${hi} in the value box first.`);
      return;
    }
    if (GROWS.has(name) && model.ids.length >= maxNodes) {
      setMsg(`The sandbox holds up to ${maxNodes} nodes. Delete one, or start a new list.`);
      return;
    }
    const op: ListOp =
      name === "insert_after" ? { op: name, index: pos, value: v as number } : name === "reverse" || name === "middle" ? { op: name } : { op: name, value: v as number };
    const r = runListOp(model, op, { predict });
    setScript(r.script);
    setModel(r.list);
    const hops = r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    setLog((l) => [{ label: r.script.title, hops, array: arrayCostOf(op, listValues(model)), after: listText(r.list) }, ...l].slice(0, 12));
    track("dsa_sandbox_op", { sandbox: spec.id, op: name, doubly, tail, predict });
  };

  const onBuild = () => {
    const parts = build.split(/[\s,]+/).filter(Boolean);
    const vals = parts.map(num);
    if (vals.some((x) => x === null)) {
      setMsg(`Use whole numbers from ${lo} to ${hi}, separated by commas.`);
      return;
    }
    if (vals.length > maxNodes) {
      setMsg(`Up to ${maxNodes} values fit in the sandbox.`);
      return;
    }
    setMsg(null);
    setLog([]);
    rebuild(vals as number[]);
  };

  const lastRow = log[0];
  const positions = useMemo(() => model.ids.map((id, i) => ({ i, v: model.values[id] })), [model]);

  return (
    <div className="dsa-ui flex flex-col gap-4 p-3 sm:p-5">
      {/* the list and the player */}
      <StepPlayer script={script} autoPlay={auto && script.frames.length > 1} label="Linked list sandbox" stepMs={1250} />

      {/* operations */}
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
            Value
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              aria-describedby="sb-range"
              className="min-h-11 w-24 border border-line-strong bg-surface px-3 font-mono text-[16px] normal-case tracking-normal text-fg focus:border-signal focus:outline-none"
            />
          </label>
          {ops.includes("insert_after") && (
            <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
              After position
              <select
                value={pos}
                onChange={(e) => setPos(Number(e.target.value))}
                disabled={!positions.length}
                className="min-h-11 min-w-[9rem] border border-line-strong bg-surface px-2 font-mono text-[14px] normal-case tracking-normal text-fg focus:border-signal focus:outline-none"
              >
                {positions.map((p) => (
                  <option key={p.i} value={p.i}>
                    {p.i} (value {p.v})
                  </option>
                ))}
              </select>
            </label>
          )}
          <span id="sb-range" className="pb-3 font-mono text-[11px] text-fg-4">
            {lo} to {hi}, up to {maxNodes} nodes
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Operations">
          {ops.map((o) => (
            <button key={o} type="button" onClick={() => run(o)} className="min-h-11 border-2 border-signal px-3 text-left text-[14px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)] sm:text-center">
              {LIST_OP_LABEL[o]}
              {NEEDS_VALUE.has(o) ? ` ${num(value) ?? "?"}` : ""}
            </button>
          ))}
        </div>
        {msg && (
          <p role="alert" className="m-0 text-[14px] text-bad-text">
            {msg}
          </p>
        )}
      </div>

      {/* cost comparison */}
      {lastRow && (
        <div className="grid gap-2 border border-line bg-surface p-3 text-[14px] sm:grid-cols-2" aria-live="polite">
          <p className="m-0 text-fg">
            <span className="block font-mono text-[11px] uppercase tracking-label text-signal-text">Linked list</span>
            {lastRow.label}: <strong>{lastRow.hops}</strong> pointer hop{lastRow.hops === 1 ? "" : "s"}
          </p>
          <p className="m-0 text-fg-2">
            <span className="block font-mono text-[11px] uppercase tracking-label text-fg-3">The same on an array</span>
            {lastRow.array}
          </p>
        </div>
      )}

      {/* options */}
      <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0 text-[14px] text-fg-2">
        <legend className="sr-only">Sandbox options</legend>
        {spec.variants.includes("doubly") && (
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={doubly}
              onChange={(e) => {
                setDoubly(e.target.checked);
                rebuild(listValues(model), { doubly: e.target.checked });
              }}
              className="h-5 w-5 accent-[var(--c-signal)]"
            />
            Doubly linked (prev pointers too)
          </label>
        )}
        <label className="inline-flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={tail}
            onChange={(e) => {
              setTail(e.target.checked);
              rebuild(listValues(model), { tail: e.target.checked });
            }}
            className="h-5 w-5 accent-[var(--c-signal)]"
          />
          Keep a tail pointer
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Play steps automatically
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={predict} onChange={(e) => setPredict(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Ask me to predict (reverse, middle)
        </label>
      </fieldset>

      {/* build your own list */}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onBuild();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
          Start from these values
          <input
            value={build}
            onChange={(e) => setBuild(e.target.value)}
            placeholder="12, 7, 30, 4"
            className="min-h-11 w-full min-w-0 border border-line-strong bg-surface px-3 font-mono text-[15px] normal-case tracking-normal text-fg focus:border-signal focus:outline-none"
          />
        </label>
        <button type="submit" className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
          Build
        </button>
        <button
          type="button"
          onClick={() => {
            const n = 3 + Math.floor(Math.random() * 3);
            const vals = Array.from({ length: n }, () => lo + Math.floor(Math.random() * Math.min(99, hi - lo + 1)));
            setBuild(vals.join(", "));
            setLog([]);
            rebuild(vals);
          }}
          className="min-h-11 border border-line-strong px-3 text-[14px] text-fg"
        >
          Random
        </button>
      </form>

      {log.length > 0 && (
        <details className="border border-line">
          <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-mono text-[12px] text-fg-3">
            This session: {log.length} operation{log.length === 1 ? "" : "s"}, {total} pointer hop{total === 1 ? "" : "s"} in all
          </summary>
          <ol className="m-0 flex list-none flex-col gap-1 px-3 pb-3 font-mono text-[12px] text-fg-2">
            {log.map((r, k) => (
              <li key={k} className="break-words">
                {r.label}: {r.hops} hop{r.hops === 1 ? "" : "s"} → {r.after}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
