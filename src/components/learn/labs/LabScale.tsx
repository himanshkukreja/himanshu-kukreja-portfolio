"use client";

/**
 * Scale test: the reader's code at each of the lab's sizes (1k / 10k / 100k…), timed in the worker with a
 * fresh setup per repetition, plotted on log-log axes against the lab's target complexity, and judged by
 * src/lib/learn/labs/scale.ts (conservative about noisy browser timings).
 */
import { Gauge, Loader2 } from "lucide-react";
import type { ScaleResult } from "@/lib/learn/labs/harness";
import type { RunOutcome } from "@/lib/learn/labs/runner";
import { COMPLEXITY_FN, COMPLEXITY_LABEL, fmtMs, fmtN, judgeScale } from "@/lib/learn/labs/scale";
import type { ScaleSpec } from "@/lib/learn/labs/types";
import { useWidth } from "./LabViz";

export type ScaleRunState = { outcome: RunOutcome<ScaleResult>; at: number };

export default function LabScale({ spec, run, running, onRun }: { spec: ScaleSpec; run: ScaleRunState | null; running: boolean; onRun: () => void }) {
  const result = run?.outcome.kind === "done" ? run.outcome.result : null;
  const verdict = result && !result.setup ? judgeScale(result.scale, spec) : null;
  const T = COMPLEXITY_LABEL[spec.target];
  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4" data-hk-scale="">
      <p className="m-0 text-sm leading-relaxed text-fg-2">
        Times your code at n = {spec.sizes.map(fmtN).join(" / ")}
        {spec.label ? ` (${spec.label})` : ""} and compares the growth with the target, <span className="font-mono text-fg">{T}</span>. Each size runs several times with a fresh setup; sizes that would take over {spec.budgetSec} s are projected instead of run.
      </p>
      <button type="button" disabled={running} onClick={onRun} className="inline-flex min-h-11 items-center gap-2 self-start bg-signal px-4 text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-60">
        {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Gauge className="h-4 w-4" aria-hidden />}
        {running ? "Timing…" : "Run the scale test"}
      </button>
      {run?.outcome.kind === "timeout" && <p className="m-0 text-sm text-bad-text">Stopped after {Math.round(run.outcome.limitMs / 1000)} s: even the smallest size was too slow (or never finished).</p>}
      {run?.outcome.kind === "crash" && <p className="m-0 text-sm text-bad-text">{run.outcome.message}</p>}
      {result?.setup && <p className="m-0 text-sm text-bad-text">Your code didn&apos;t load: {result.setup.kind}: {result.setup.message}</p>}
      {result && !result.setup && verdict && (
        <>
          <div className={`flex flex-col gap-1 border-l-4 px-3 py-2 ${verdict.status === "slow" || verdict.status === "error" ? "border-bad bg-[color-mix(in_srgb,var(--c-bad)_8%,transparent)]" : "border-ok bg-[color-mix(in_srgb,var(--c-ok)_8%,transparent)]"}`}>
            <span className={`font-semibold ${verdict.status === "slow" || verdict.status === "error" ? "text-bad-text" : "text-ok-text"}`}>{verdict.headline}</span>
            <span className="text-[13px] leading-relaxed text-fg-2">{verdict.detail}</span>
          </div>
          <Chart spec={spec} result={result} />
          <table className="w-full border-collapse font-mono text-[12px]">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="border-b border-line py-1.5 pr-2 font-normal">n</th>
                <th className="border-b border-line py-1.5 pr-2 font-normal">time</th>
                <th className="border-b border-line py-1.5 pr-2 font-normal">runs</th>
                <th className="border-b border-line py-1.5 font-normal">vs previous</th>
              </tr>
            </thead>
            <tbody>
              {result.scale.points.map((p, k) => {
                const prev = result.scale.points[k - 1];
                return (
                  <tr key={p.n} className="text-fg-2">
                    <td className="border-b border-line py-1.5 pr-2 text-fg">{fmtN(p.n)}</td>
                    <td className="border-b border-line py-1.5 pr-2">{fmtMs(p.ms)}</td>
                    <td className="border-b border-line py-1.5 pr-2">{p.reps}</td>
                    <td className="border-b border-line py-1.5">{prev ? `×${(p.ms / Math.max(prev.ms, 1e-6)).toFixed(1)} (${T}: ×${(COMPLEXITY_FN[spec.target](p.n) / COMPLEXITY_FN[spec.target](prev.n)).toFixed(1)})` : "–"}</td>
                  </tr>
                );
              })}
              {result.scale.skipped.map((s) => (
                <tr key={s.n} className="text-fg-3">
                  <td className="border-b border-line py-1.5 pr-2">{fmtN(s.n)}</td>
                  <td className="border-b border-line py-1.5 pr-2 text-bad-text">~{fmtMs(s.projectedMs)}</td>
                  <td className="border-b border-line py-1.5 pr-2">skipped</td>
                  <td className="border-b border-line py-1.5">projected</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {result?.scale.error && <p className="m-0 text-sm text-bad-text">{result.scale.error.kind}: {result.scale.error.message}</p>}
    </div>
  );
}

function Chart({ spec, result }: { spec: ScaleSpec; result: ScaleResult }) {
  const [box, W] = useWidth<HTMLDivElement>(600);
  const pts = result.scale.points.map((p) => ({ n: p.n, ms: Math.max(p.ms, 0.01), projected: false }));
  const proj = result.scale.skipped.map((s) => ({ n: s.n, ms: Math.max(s.projectedMs, 0.01), projected: true }));
  const all = [...pts, ...proj];
  if (!all.length) return null;
  const H = W < 480 ? 210 : 240;
  const pad = { l: 56, r: 22, t: 12, b: 30 };
  const ns = spec.sizes;
  const lx0 = Math.log10(ns[0]) - 0.15;
  const lx1 = Math.log10(ns[ns.length - 1]) + 0.15;
  // the target curve, anchored at the first measured point
  const f = COMPLEXITY_FN[spec.target];
  const anchor = pts[0] ?? all[0];
  const target = ns.map((n) => ({ n, ms: Math.max(0.01, (anchor.ms * f(n)) / f(anchor.n)) }));
  const ys = [...all.map((p) => p.ms), ...target.map((p) => p.ms)];
  const ly0 = Math.floor(Math.log10(Math.min(...ys)));
  const ly1 = Math.ceil(Math.log10(Math.max(...ys)));
  const X = (n: number) => pad.l + ((Math.log10(n) - lx0) / (lx1 - lx0)) * (W - pad.l - pad.r);
  const Y = (ms: number) => pad.t + (1 - (Math.log10(ms) - ly0) / Math.max(1, ly1 - ly0)) * (H - pad.t - pad.b);
  const decades = Array.from({ length: ly1 - ly0 + 1 }, (_, k) => 10 ** (ly0 + k));
  const line = (p: { n: number; ms: number }[]) => p.map((q) => `${X(q.n)},${Y(q.ms)}`).join(" ");
  return (
    <div ref={box} className="flex min-w-0 flex-col gap-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Time against n on log-log axes: your code and the ${COMPLEXITY_LABEL[spec.target]} target`}>
        {decades.map((d) => (
          <g key={d}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(d)} y2={Y(d)} stroke="var(--c-line)" />
            <text x={pad.l - 6} y={Y(d) + 4} textAnchor="end" fontSize={11} fill="var(--c-fg-3)" fontFamily="var(--font-geist-mono), monospace">
              {fmtMs(d)}
            </text>
          </g>
        ))}
        {ns.map((n) => (
          <text key={n} x={X(n)} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--c-fg-3)" fontFamily="var(--font-geist-mono), monospace">
            n={fmtN(n)}
          </text>
        ))}
        <polyline points={line(target)} fill="none" stroke="var(--c-fg-3)" strokeWidth={2} strokeDasharray="6 5" />
        {pts.length > 1 && <polyline points={line(pts)} fill="none" stroke="var(--c-signal)" strokeWidth={2.5} />}
        {proj.length > 0 && pts.length > 0 && <polyline points={line([pts[pts.length - 1], ...proj])} fill="none" stroke="var(--c-bad)" strokeWidth={2} strokeDasharray="3 4" />}
        {pts.map((p) => (
          <circle key={p.n} cx={X(p.n)} cy={Y(p.ms)} r={4.5} fill="var(--c-signal)">
            <title>{`n = ${fmtN(p.n)}: ${fmtMs(p.ms)}`}</title>
          </circle>
        ))}
        {proj.map((p) => (
          <circle key={p.n} cx={X(p.n)} cy={Y(p.ms)} r={4.5} fill="var(--c-bg)" stroke="var(--c-bad)" strokeWidth={2}>
            <title>{`n = ${fmtN(p.n)}: about ${fmtMs(p.ms)} (projected, skipped)`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-fg-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 bg-signal" /> your code
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-fg-3" /> {COMPLEXITY_LABEL[spec.target]} (target)
        </span>
        {proj.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block w-4 border-t-2 border-dotted border-bad" /> projected
          </span>
        )}
        <span className="text-fg-4">log-log axes: a straighter, steeper line grows faster</span>
      </div>
    </div>
  );
}
