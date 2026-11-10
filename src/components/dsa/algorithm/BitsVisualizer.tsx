"use client";

/**
 * An algorithm lesson's visualizer for bits (`::visualizer[id]`, dsa-mastery visualizer.yml with view: bits): pick a small problem (AND,
 * OR or XOR of two numbers, clearing the lowest 1 bit again and again, or a mask of 8 named permissions), change its numbers, then step
 * through it forwards and back on the StepPlayer. The operator problem combines the 8 columns one at a time; the clearing problem draws x,
 * x - 1 and x & (x - 1) until x is 0; the permissions problem grants, revokes, toggles and tests one bit at a time. Auto-play stops at the
 * predict questions.
 */
import { useState } from "react";
import type { BitsPreset, BitsVisualizerSpec } from "@/lib/dsa/viz/registry";
import { bitsScript, BITS_METHOD_LABEL, FLAG_NAMES, methodOf, type BitsOp, type BitsProblem } from "@/lib/dsa/viz/bits";
import type { Script } from "@/lib/dsa/viz/types";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

const METHOD_NOTE: Record<ReturnType<typeof methodOf>, string> = {
  bitwise: "Combine two numbers one column at a time, from bit 7 on the left to bit 0 on the right. A column never looks at its neighbours.",
  "clear-lowest": "Subtract 1, then AND with the old number. The lowest 1 bit is cleared and nothing else changes. Repeat until the number is 0.",
  flags: "A mask holds 8 permissions, one in each bit. Grant is OR, revoke is AND with the flipped bit, toggle is XOR and test is AND.",
};
const KIND_LABEL: Record<BitsProblem["kind"], string> = { op: "Bitwise operator", "clear-lowest": "Clearing the lowest bit", flags: "Permissions mask" };
const OPS: BitsOp[] = ["and", "or", "xor"];
const OP_LABEL: Record<BitsOp, string> = { and: "AND (&)", or: "OR (|)", xor: "XOR (^)" };
const STEP_LABEL = { grant: "Grant", revoke: "Revoke", toggle: "Toggle", test: "Test" };

const copy = (p: BitsProblem): BitsProblem => JSON.parse(JSON.stringify(p));
const clamp = (raw: string, lo: number, hi: number) => {
  const n = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

export default function BitsVisualizer({ spec }: { spec: BitsVisualizerSpec }) {
  const presets = spec.presets;
  const first = presets[0];
  const [lo, hi] = spec.limits.value;
  const [preset, setPreset] = useState(first?.id || "custom");
  const [problem, setProblem] = useState<BitsProblem>(first ? copy(first.problem) : { kind: "op", op: "and", a: 12, b: 10 });
  const [predict, setPredict] = useState(true);
  const [auto, setAuto] = useState(false);
  const [script, setScript] = useState<Script | null>(null);

  const method = methodOf(problem);
  const load = (p: BitsPreset) => {
    setPreset(p.id);
    setProblem(copy(p.problem));
    setScript(null);
  };
  const edit = (next: BitsProblem) => {
    setProblem(next);
    setPreset("custom");
    setScript(null);
  };

  const run = () => {
    setScript(bitsScript(problem, { predict, title: BITS_METHOD_LABEL[method] }));
    track("dsa_visualizer_run", { visualizer: spec.id, algo: method, predict, preset });
  };

  const note = presets.find((p) => p.id === preset)?.note;
  const editing = !script;
  const sel = "min-h-11 border border-line-strong bg-surface px-2 text-[15px] font-normal text-fg focus:border-signal focus:outline-none";
  const num = "min-h-11 w-24 max-w-full border border-line-strong bg-surface px-2 font-mono text-[15px] text-fg focus:border-signal focus:outline-none";
  const valid = problem.kind === "clear-lowest" ? problem.x >= 1 : true;

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
      </div>
      {note && <p className="m-0 text-[14px] text-fg-2">{note}</p>}
      <p className="m-0 text-[14px] text-fg-3">{METHOD_NOTE[method]}</p>

      {editing ? (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold text-fg-2">{KIND_LABEL[problem.kind]}: change the numbers.</legend>
          {problem.kind === "op" && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-fg-2">
              <label className="flex items-center gap-2">
                x ({lo} to {hi})
                <input type="text" inputMode="numeric" value={problem.a} onChange={(e) => edit({ ...problem, a: clamp(e.target.value, lo, hi) })} aria-label="x" className={num} />
              </label>
              <label className="flex items-center gap-2">
                Operator
                <select value={problem.op} onChange={(e) => edit({ ...problem, op: e.target.value as BitsOp })} aria-label="Operator" className={sel}>
                  {OPS.map((o) => (
                    <option key={o} value={o}>
                      {OP_LABEL[o]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                y ({lo} to {hi})
                <input type="text" inputMode="numeric" value={problem.b} onChange={(e) => edit({ ...problem, b: clamp(e.target.value, lo, hi) })} aria-label="y" className={num} />
              </label>
            </div>
          )}
          {problem.kind === "clear-lowest" && (
            <label className="flex flex-wrap items-center gap-2 text-[14px] text-fg-2">
              x (1 to {hi})
              <input type="text" inputMode="numeric" value={problem.x} onChange={(e) => edit({ kind: "clear-lowest", x: clamp(e.target.value, 1, hi) })} aria-label="x" className={num} />
            </label>
          )}
          {problem.kind === "flags" && (
            <div className="flex flex-col gap-2 text-[14px] text-fg-2">
              <label className="flex flex-wrap items-center gap-2">
                Starting mask ({lo} to {hi})
                <input type="text" inputMode="numeric" value={problem.start} onChange={(e) => edit({ ...problem, start: clamp(e.target.value, lo, hi) })} aria-label="Starting mask" className={num} />
              </label>
              <p className="m-0 text-[13px] text-fg-3">
                Steps: {problem.steps.map((s) => `${STEP_LABEL[s.do]} ${FLAG_NAMES[s.flag]}`).join(", then ")}.
              </p>
            </div>
          )}
        </fieldset>
      ) : (
        <StepPlayer script={script} autoPlay={auto} label={`${BITS_METHOD_LABEL[method]}: ${KIND_LABEL[problem.kind]}`} stepMs={1000} />
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <button type="button" disabled={!valid} onClick={run} className="min-h-11 bg-signal px-5 text-[15px] font-semibold text-on-signal disabled:opacity-40">
              Run {BITS_METHOD_LABEL[method].toLowerCase()} step by step →
            </button>
          ) : (
            <button type="button" onClick={() => setScript(null)} className="min-h-11 border-2 border-signal px-4 text-[14px] font-semibold text-signal-text">
              ✎ Change the numbers
            </button>
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
