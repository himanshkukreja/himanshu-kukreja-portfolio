"use client";

/**
 * The queue and deque sandbox (`::sandbox[queue]`, dsa-mastery sandbox.yml): a live queue the learner adds to, takes from
 * and peeks at, from either end. Each operation runs on the step engine (src/lib/dsa/viz/queue.ts) and plays step by
 * step in the StepPlayer: a value hovers, is written where the tail points, the tail wraps round the end of the ring.
 *
 * Options: stored in a ring buffer, a singly linked list or a doubly linked list (the same operations drawn each way,
 * with the cost on the other storage beside it), the deque's four end operations, the sliding-window maximum with a
 * monotonic deque (run over the values in the queue), auto-play or step by step, and predict mode. Typed values are
 * checked against the sandbox's limits.
 */
import { useState } from "react";
import {
  backingWord,
  makeQueue,
  otherBackingCost,
  queueText,
  queueValues,
  runQueueOp,
  stillScript as still,
  type QueueBacking,
  type QueueModel,
  type QueueOp,
  type QueueOpName,
  WINDOW_MAX_LEN,
} from "@/lib/dsa/viz/queue";
import type { Script } from "@/lib/dsa/viz/types";
import type { SandboxSpec } from "@/lib/dsa/viz/registry";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

const LABEL: Record<QueueOpName, string> = {
  enqueue: "Enqueue",
  dequeue: "Dequeue",
  peek: "Peek",
  push_front: "Push front",
  push_back: "Push back",
  pop_front: "Pop front",
  pop_back: "Pop back",
  window_max: "Slide a window",
};
const NEEDS_VALUE = new Set<QueueOpName>(["enqueue", "push_front", "push_back", "window_max"]);

type LogRow = { label: string; steps: number; after: string };

export default function QueueSandbox({ spec }: { spec: SandboxSpec }) {
  const [lo, hi] = spec.limits.value;
  const maxItems = spec.limits.nodes;
  const [backing, setBacking] = useState<QueueBacking>("ring");
  const [auto, setAuto] = useState(true);
  const [predict, setPredict] = useState(false);
  const mk = (vals: number[], b: QueueBacking = "ring") => makeQueue(vals, { backing: b, capacity: spec.capacity });
  const [model, setModel] = useState<QueueModel>(() => mk(spec.start));
  const [script, setScript] = useState<Script>(() => still(mk(spec.start), "Your queue. Enqueue, dequeue or peek below and watch it run, step by step."));
  const [value, setValue] = useState("5");
  const [build, setBuild] = useState(spec.start.join(", "));
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [last, setLast] = useState<{ label: string; mine: number; other: number; otherName: string; why: string; mineName: string } | null>(null);
  const ops = spec.operations as QueueOpName[];
  const total = log.reduce((a, r) => a + r.steps, 0);

  const num = (s: string): number | null => {
    const n = Number(s.trim());
    return s.trim() !== "" && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };

  const rebuild = (vals: number[], b: QueueBacking = backing) => {
    const m = mk(vals, b);
    setModel(m);
    setLast(null);
    const where = b === "ring" ? `a ring buffer with room for ${m.capacity}` : `a ${backingWord(b)}`;
    setScript(
      still(
        m,
        vals.length
          ? `A queue of ${vals.length} item${vals.length === 1 ? "" : "s"}, stored in ${where}. The front is ${vals[0]} and the back is ${vals[vals.length - 1]}.`
          : `An empty queue, stored in ${where}. Enqueue something.`,
      ),
    );
  };

  const run = (name: QueueOpName) => {
    setMsg(null);
    const v = num(value);
    if (NEEDS_VALUE.has(name) && v === null) {
      setMsg(`Type a whole number from ${lo} to ${hi} in the value box first.`);
      return;
    }
    if (name === "window_max") {
      if ((v as number) < 1 || (v as number) > model.ids.length) {
        setMsg(model.ids.length ? `Pick a window size from 1 to ${model.ids.length} (the number of values in your queue).` : "Your queue is empty. Build or enqueue some values first.");
        return;
      }
      if (model.ids.length > WINDOW_MAX_LEN) {
        setMsg(`The window demo draws up to ${WINDOW_MAX_LEN} values.`);
        return;
      }
    }
    if ((name === "enqueue" || name === "push_back" || name === "push_front") && model.ids.length >= maxItems) {
      setMsg(`The sandbox holds up to ${maxItems} items. Remove one, or start a new queue.`);
      return;
    }
    const op: QueueOp = NEEDS_VALUE.has(name) ? ({ op: name, value: v as number } as QueueOp) : ({ op: name } as QueueOp);
    const r = runQueueOp(model, op, { predict });
    setScript(r.script);
    setModel(r.queue);
    const steps = r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    const isWin = name === "window_max";
    setLast(isWin ? null : { label: r.script.title, ...otherBackingCost(model, op), mineName: backingWord(backing) });
    setLog((l) => [{ label: r.script.title, steps: isWin ? 0 : steps, after: isWin ? "your queue is unchanged" : queueText(r.queue) }, ...l].slice(0, 12));
    track("dsa_sandbox_op", { sandbox: spec.id, op: name, backing, predict });
  };

  const onBuild = () => {
    const vals = build.split(/[\s,]+/).filter(Boolean).map(num);
    if (vals.some((x) => x === null)) {
      setMsg(`Use whole numbers from ${lo} to ${hi}, separated by commas. The first is the front.`);
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
  const has = (o: QueueOpName) => ops.includes(o);
  const withValue = (o: QueueOpName) => `${LABEL[o]}${NEEDS_VALUE.has(o) ? ` ${num(value) ?? "?"}` : ""}`;

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <StepPlayer script={script} autoPlay={auto && script.frames.length > 1} label="Queue sandbox" stepMs={1250} />

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
            Value
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              aria-describedby="qs-range"
              className="min-h-11 w-24 border border-line-strong bg-surface px-3 font-mono text-[16px] font-normal text-fg focus:border-signal focus:outline-none"
            />
          </label>
          <span id="qs-range" className="pb-3 font-mono text-[12px] text-fg-3">
            {lo} to {hi}, up to {maxItems} items
          </span>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">The queue: join at the back, leave from the front</span>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Queue operations">
          {(["enqueue", "dequeue", "peek"] as const).filter(has).map((o) => (
            <button key={o} type="button" onClick={() => run(o)} className={btn}>
              {withValue(o)}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">The deque: both ends</span>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Deque operations">
          {(["push_front", "push_back", "pop_front", "pop_back"] as const).filter(has).map((o) => (
            <button key={o} type="button" onClick={() => run(o)} className={btn}>
              {withValue(o)}
            </button>
          ))}
        </div>
        {has("window_max") && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">The monotonic deque (a sliding window over your values)</span>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Sliding window demo">
              <button type="button" onClick={() => run("window_max")} className={btn}>
                Maximum of every window of {num(value) ?? "?"}
              </button>
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
            <span className="block font-mono text-[12px] uppercase tracking-label text-signal-text">Stored in a {last.mineName}</span>
            {last.label}: <strong>{last.mine}</strong> step{last.mine === 1 ? "" : "s"}
          </p>
          <p className="m-0 text-fg-2">
            <span className="block font-mono text-[12px] uppercase tracking-label text-fg-3">The same in a {last.otherName}</span>
            {last.other} step{last.other === 1 ? "" : "s"}
          </p>
          {last.why && <p className="m-0 text-fg-2 sm:col-span-2">{last.why}</p>}
        </div>
      )}

      <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0 text-[14px] text-fg-2">
        <legend className="sr-only">Sandbox options</legend>
        <div role="radiogroup" aria-label="How the queue is stored" className="flex flex-wrap gap-x-4">
          {(["ring", "list", "doubly"] as const).map((b) => (
            <label key={b} className="inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="qs-backing"
                checked={backing === b}
                onChange={() => {
                  setBacking(b);
                  rebuild(queueValues(model), b);
                }}
                className="h-5 w-5 accent-[var(--c-signal)]"
              />
              {b === "ring" ? "Stored in a ring buffer" : b === "list" ? "Stored in a linked list" : "Stored in a doubly linked list"}
            </label>
          ))}
        </div>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Play steps automatically
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={predict} onChange={(e) => setPredict(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Ask me to predict (dequeue, a full ring)
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
          Start from these values (the first is the front)
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
