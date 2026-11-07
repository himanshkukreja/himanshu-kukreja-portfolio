"use client";

/**
 * Chaos tests: the lab's `## Chaos tests` run against the reader's code under a seeded, deterministic
 * scheduler (interleavings, crashes, lost replies, duplicate deliveries, partitions; harness.ts and
 * jsHarness.ts share it bit for bit). A failing seed shows its interleaving step by step and replays
 * exactly: same seed, same steps, same failure.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Shuffle } from "lucide-react";
import type { ChaosResult, ChaosStep, ChaosTestResult } from "@/lib/learn/labs/harness";
import type { RunOutcome } from "@/lib/learn/labs/runner";
import { CHAOS_LABEL, type ChaosSpec } from "@/lib/learn/labs/types";

export type ChaosRun = { outcome: RunOutcome<ChaosResult>; replay: { seed: number; test: string } | null; at: number };

const KIND_LABEL: Partial<Record<ChaosStep["kind"], string>> = {
  crash: "crash",
  retry: "reply lost",
  duplicate: "duplicate",
  drop: "dropped",
  partition: "partition",
  heal: "heal",
  send: "send",
  deliver: "deliver",
  call: "call",
  note: "note",
  spawn: "start",
  done: "done",
};
const FAULT = new Set<ChaosStep["kind"]>(["crash", "retry", "duplicate", "drop", "partition"]);

export default function LabChaos({
  spec,
  run,
  running,
  onRun,
  file,
  onLine,
}: {
  spec: ChaosSpec;
  run: ChaosRun | null;
  running: boolean;
  onRun: (opts: { seed?: number; test?: string }) => void;
  file: string;
  onLine: (line: number) => void;
}) {
  const [seedText, setSeedText] = useState("");
  const result = run?.outcome.kind === "done" ? run.outcome.result : null;
  const failing = result?.chaos.find((c) => !c.ok && c.trace);
  const shown = failing ?? (run?.replay ? result?.chaos[0] : undefined);
  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4" data-hk-chaos="">
      <p className="m-0 text-sm leading-relaxed text-fg-2">
        Runs the lab&apos;s chaos tests {spec.runs} times, each with a different seed that decides the order of every step and which faults hit: {spec.scenarios.map((s) => CHAOS_LABEL[s]).join(", ")}. The same seed always gives the same run.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={running} onClick={() => onRun({})} className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-60">
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Shuffle className="h-4 w-4" aria-hidden />}
          {running ? "Running chaos…" : `Run chaos · ${spec.runs} seeds`}
        </button>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const seed = Number(seedText);
            if (Number.isInteger(seed) && seed >= 0) onRun({ seed });
          }}
        >
          <label className="font-mono text-[11px] text-fg-3" htmlFor="hk-chaos-seed">
            seed
          </label>
          <input id="hk-chaos-seed" inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))} className="h-10 w-24 border border-line bg-bg px-2 font-mono text-sm text-fg" placeholder="e.g. 7" />
          <button type="submit" disabled={running || !seedText} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:border-fg-3 disabled:opacity-50">
            run one
          </button>
        </form>
      </div>

      {run?.outcome.kind === "timeout" && <p className="m-0 text-sm text-bad-text">Stopped after {Math.round(run.outcome.limitMs / 1000)} s: a task may be looping forever (a while loop that waits for something that never happens).</p>}
      {run?.outcome.kind === "crash" && <p className="m-0 text-sm text-bad-text">{run.outcome.message}</p>}
      {result?.setup && <p className="m-0 text-sm text-bad-text">Your code didn&apos;t load: {result.setup.kind}: {result.setup.message}</p>}

      {result && !result.setup && (
        <ul className="m-0 flex list-none flex-col border border-line p-0">
          {result.chaos.map((c) => (
            <li key={c.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 last:border-b-0">
              <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center font-mono text-[12px] ${c.ok ? "bg-ok text-on-ok" : "bg-bad text-on-bad"}`}>
                {c.ok ? "✓" : "✗"}
              </span>
              <span className="min-w-0 flex-1 text-sm text-fg">{c.title}</span>
              <span className="font-mono text-[11px] text-fg-3">
                {c.ok ? (run?.replay ? `seed ${c.seed} passes` : `${c.runs} seeds pass`) : `fails on seed ${c.seed} (run ${c.runs} of ${run?.replay ? 1 : spec.runs})`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {shown && <Trace key={`${run?.at}-${shown.name}`} t={shown} replayed={!!run?.replay} running={running} onReplay={() => onRun({ seed: shown.seed!, test: shown.name })} file={file} onLine={onLine} />}
    </div>
  );
}

function Trace({ t, replayed, running, onReplay, file, onLine }: { t: ChaosTestResult; replayed: boolean; running: boolean; onReplay: () => void; file: string; onLine: (line: number) => void }) {
  const steps = useMemo(() => (t.trace ?? []).filter((s) => s.kind !== "spawn"), [t.trace]);
  const [i, setI] = useState(steps.length);
  const actors = useMemo(() => [...new Set(steps.map((s) => s.actor))], [steps]);
  const cur = steps[i - 1];
  const mine = (t.error?.frames ?? []).filter((f) => f.file.startsWith("solution."));
  return (
    <div className="flex min-w-0 flex-col gap-2.5 border border-line-strong bg-raised p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
          {replayed ? "replay" : "failing run"} · seed {t.seed} · {t.steps ?? steps.length} steps
        </span>
        <button type="button" disabled={running} onClick={onReplay} className="ml-auto inline-flex min-h-9 items-center gap-1.5 border border-line-strong px-3 font-mono text-xs text-fg hover:border-fg-3 disabled:opacity-50">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Replay seed {t.seed}
        </button>
      </div>
      {t.error && (
        <pre className="m-0 whitespace-pre-wrap break-words bg-surface p-2.5 font-mono text-[12.5px] leading-relaxed text-fg">
          <span className="text-bad-text">{t.error.kind}</span>
          {t.error.message ? `: ${t.error.message}` : ""}
        </pre>
      )}
      {mine.map((f, k) => (
        <button key={k} type="button" onClick={() => onLine(f.line)} className="self-start text-left font-mono text-[11.5px] text-fg-2 hover:text-fg">
          <span className="text-signal-text underline decoration-line-strong underline-offset-4">
            {file} line {f.line}
          </span>{" "}
          in {f.fn}
        </button>
      ))}
      {t.ok && replayed && <p className="m-0 text-sm text-fg-2">This seed passes with your current code.</p>}
      {steps.length > 0 && (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button type="button" aria-label="Previous step" onClick={() => setI((x) => Math.max(1, x - 1))} className="grid h-9 w-9 place-items-center border border-line text-fg-2 hover:text-fg">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Next step" onClick={() => setI((x) => Math.min(steps.length, x + 1))} className="grid h-9 w-9 place-items-center border border-line text-fg-2 hover:text-fg">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <input type="range" min={1} max={steps.length} value={Math.max(1, i)} onChange={(e) => setI(Number(e.target.value))} aria-label="Step" className="min-w-[80px] flex-1 accent-[var(--c-signal)]" />
            <span className="font-mono text-[11px] text-fg-3" aria-live="polite">
              {i}/{steps.length}
              {cur ? ` · ${cur.actor}: ${cur.label || KIND_LABEL[cur.kind]}` : ""}
            </span>
          </div>
          <ol className="m-0 flex max-h-[300px] min-w-0 list-none flex-col overflow-y-auto overflow-x-hidden border border-line bg-surface p-0 font-mono text-[12px]" aria-label="Steps of this run">
            {steps.map((s, k) => {
              const col = Math.max(0, actors.indexOf(s.actor));
              const on = k === i - 1;
              const future = k >= i;
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => setI(k + 1)}
                    className={`flex w-full min-w-0 items-start gap-2 border-b border-line px-2 py-1.5 text-left last:border-b-0 ${on ? "bg-[color-mix(in_srgb,var(--c-signal)_14%,transparent)]" : ""} ${future ? "opacity-45" : ""}`}
                  >
                    <span className="w-8 shrink-0 text-right text-fg-4">{s.step}</span>
                    <span className="w-[5.5rem] shrink-0 truncate" style={{ color: ACTOR_COLORS[col % ACTOR_COLORS.length] }} title={s.actor}>
                      {s.actor}
                    </span>
                    <span className={`shrink-0 ${FAULT.has(s.kind) ? "font-semibold text-bad-text" : "text-fg-3"}`}>{KIND_LABEL[s.kind] ?? s.kind}</span>
                    <span className="min-w-0 flex-1 break-words text-fg-2">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {!replayed && <p className="m-0 text-[12px] leading-snug text-fg-3">Step through it like a debugger: the last step is where the test failed. Change your code and press Replay: the same seed makes exactly the same choices, so you can tell whether your fix closed this interleaving.</p>}
        </>
      )}
    </div>
  );
}

const ACTOR_COLORS = ["var(--c-code-num)", "var(--c-signal-text)", "var(--c-code-fn)", "var(--c-code-var)", "var(--c-code-tag)", "var(--c-fg-2)"];
