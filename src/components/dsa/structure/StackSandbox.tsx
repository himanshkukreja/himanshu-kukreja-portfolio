"use client";

/**
 * The stack sandbox (`::sandbox[stack]`, dsa-mastery sandbox.yml): a live stack the learner pushes onto, pops from and
 * peeks at. Each operation runs on the step engine (src/lib/dsa/viz/stack.ts) and plays step by step in the StepPlayer:
 * a value hovers, drops onto the top, comes off again, with a one-line narration and a live step counter.
 *
 * Options: stored in an array or in a linked list (the same operations, drawn both ways, with the cost on the other one
 * beside it), the call stack (run factorial, or recurse with no base case and hit the overflow), auto-play or step by
 * step, and predict mode (a question at each pop, and at the push that finds a full array). Typed values are checked
 * against the sandbox's limits.
 */
import { useState } from "react";
import {
  makeStack,
  otherBackingCost,
  runStackOp,
  stackText,
  stackValues,
  stillScript as still,
  type StackBacking,
  type StackModel,
  type StackOp,
  type StackOpName,
} from "@/lib/dsa/viz/stack";
import type { Script } from "@/lib/dsa/viz/types";
import type { SandboxSpec } from "@/lib/dsa/viz/registry";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

const LABEL: Record<StackOpName, string> = {
  push: "Push",
  pop: "Pop",
  peek: "Peek",
  search: "Search",
  calls: "Run factorial",
  overflow: "Recurse for ever",
};
const NEEDS_VALUE = new Set<StackOpName>(["push", "search", "calls"]);

type LogRow = { label: string; steps: number; after: string };

export default function StackSandbox({ spec }: { spec: SandboxSpec }) {
  const [lo, hi] = spec.limits.value;
  const maxItems = spec.limits.nodes;
  const [backing, setBacking] = useState<StackBacking>("array");
  const [auto, setAuto] = useState(true);
  const [predict, setPredict] = useState(false);
  const [model, setModel] = useState<StackModel>(() => makeStack(spec.start, { backing: "array", capacity: spec.capacity }));
  const [script, setScript] = useState<Script>(() => still(makeStack(spec.start, { backing: "array", capacity: spec.capacity }), "Your stack. Push, pop or peek below and watch it run, step by step."));
  const [value, setValue] = useState("5");
  const [build, setBuild] = useState(spec.start.join(", "));
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [last, setLast] = useState<{ label: string; mine: number; other: number; otherName: string; why: string; mineName: string } | null>(null);
  const ops = spec.operations as StackOpName[];
  const total = log.reduce((a, r) => a + r.steps, 0);

  const num = (s: string): number | null => {
    const n = Number(s.trim());
    return s.trim() !== "" && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };

  const rebuild = (vals: number[], b: StackBacking = backing) => {
    const m = makeStack(vals, { backing: b, capacity: spec.capacity });
    setModel(m);
    setLast(null);
    setScript(
      still(
        m,
        vals.length
          ? `A stack of ${vals.length} item${vals.length === 1 ? "" : "s"}, stored in ${b === "array" ? `an array with room for ${m.capacity}` : "a linked list"}. The top is ${vals[vals.length - 1]}.`
          : `An empty stack, stored in ${b === "array" ? `an array with room for ${m.capacity}` : "a linked list"}. Push something.`,
      ),
    );
  };

  const run = (name: StackOpName) => {
    setMsg(null);
    const v = num(value);
    if (NEEDS_VALUE.has(name) && v === null) {
      setMsg(`Type a whole number from ${lo} to ${hi} in the value box first.`);
      return;
    }
    if (name === "calls" && (v as number) > 6) {
      setMsg("Run factorial with a number from 1 to 6: each call is one frame, and the stage holds six.");
      return;
    }
    if (name === "calls" && (v as number) < 1) {
      setMsg("Run factorial with a number from 1 to 6.");
      return;
    }
    if (name === "push" && model.ids.length >= maxItems) {
      setMsg(`The sandbox holds up to ${maxItems} items. Pop one, or start a new stack.`);
      return;
    }
    const op: StackOp = name === "push" || name === "search" || name === "calls" ? { op: name, value: v as number } : { op: name };
    const r = runStackOp(model, op, { predict });
    setScript(r.script);
    setModel(r.stack);
    const steps = r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    const isCall = name === "calls" || name === "overflow";
    setLast(isCall ? null : { label: r.script.title, ...otherBackingCost(model, op), mineName: backing === "array" ? "array" : "linked list" });
    setLog((l) => [{ label: r.script.title, steps: isCall ? 0 : steps, after: isCall ? "the call stack is separate from your stack" : stackText(r.stack) }, ...l].slice(0, 12));
    track("dsa_sandbox_op", { sandbox: spec.id, op: name, backing, predict });
  };

  const onBuild = () => {
    const vals = build.split(/[\s,]+/).filter(Boolean).map(num);
    if (vals.some((x) => x === null)) {
      setMsg(`Use whole numbers from ${lo} to ${hi}, separated by commas. The last one is the top.`);
      return;
    }
    if (vals.length > maxItems) {
      setMsg(`Up to ${maxItems} values fit in the sandbox.`);
      return;
    }
    setMsg(null);
    setLog([]);
    rebuild(vals as number[]);
  };

  const btn = "min-h-11 border-2 border-signal px-3 text-left text-[14px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)] sm:text-center";

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <StepPlayer script={script} autoPlay={auto && script.frames.length > 1} label="Stack sandbox" stepMs={1250} />

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
            Value
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              aria-describedby="sk-range"
              className="min-h-11 w-24 border border-line-strong bg-surface px-3 font-mono text-[16px] font-normal text-fg focus:border-signal focus:outline-none"
            />
          </label>
          <span id="sk-range" className="pb-3 font-mono text-[12px] text-fg-3">
            {lo} to {hi}, up to {maxItems} items
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Stack operations">
          {ops
            .filter((o) => o !== "calls" && o !== "overflow")
            .map((o) => (
              <button key={o} type="button" onClick={() => run(o)} className={btn}>
                {LABEL[o]}
                {NEEDS_VALUE.has(o) ? ` ${num(value) ?? "?"}` : ""}
              </button>
            ))}
        </div>
        {(ops.includes("calls") || ops.includes("overflow")) && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">The call stack (recursion)</span>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Call stack demos">
              {ops.includes("calls") && (
                <button type="button" onClick={() => run("calls")} className={btn}>
                  Run factorial({num(value) ?? "?"})
                </button>
              )}
              {ops.includes("overflow") && (
                <button type="button" onClick={() => run("overflow")} className={btn}>
                  {LABEL.overflow}
                </button>
              )}
            </div>
          </div>
        )}
        {msg && (
          <p role="alert" className="m-0 text-[14px] text-bad-text">
            {msg}
          </p>
        )}
      </div>

      {last && (
        <div className="grid gap-2 border border-line bg-surface p-3 text-[14px] sm:grid-cols-2" aria-live="polite">
          <p className="m-0 text-fg">
            <span className="block font-mono text-[12px] uppercase tracking-label text-signal-text">Stored in {last.mineName === "array" ? "an array" : "a linked list"}</span>
            {last.label}: <strong>{last.mine}</strong> step{last.mine === 1 ? "" : "s"}
          </p>
          <p className="m-0 text-fg-2">
            <span className="block font-mono text-[12px] uppercase tracking-label text-fg-3">The same in {last.otherName === "array" ? "an array" : "a linked list"}</span>
            {last.other} step{last.other === 1 ? "" : "s"}
          </p>
          {last.why && <p className="m-0 text-fg-2 sm:col-span-2">{last.why}</p>}
        </div>
      )}

      <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0 text-[14px] text-fg-2">
        <legend className="sr-only">Sandbox options</legend>
        <div role="radiogroup" aria-label="How the stack is stored" className="flex flex-wrap gap-x-4">
          {(["array", "list"] as const).map((b) => (
            <label key={b} className="inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="sk-backing"
                checked={backing === b}
                onChange={() => {
                  setBacking(b);
                  rebuild(stackValues(model), b);
                }}
                className="h-5 w-5 accent-[var(--c-signal)]"
              />
              {b === "array" ? "Stored in an array" : "Stored in a linked list"}
            </label>
          ))}
        </div>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Play steps automatically
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={predict} onChange={(e) => setPredict(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Ask me to predict (pop, a full array)
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
          Start from these values (the last is the top)
          <input
            value={build}
            onChange={(e) => setBuild(e.target.value)}
            placeholder="12, 7, 30"
            className="min-h-11 w-full min-w-0 border border-line-strong bg-surface px-3 font-mono text-[15px] font-normal text-fg focus:border-signal focus:outline-none"
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
