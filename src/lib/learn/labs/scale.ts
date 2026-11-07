/**
 * Scale tests: is the reader's code growing faster than the lab's target complexity? Pure (type imports
 * only), so the lab room and the checker (scripts/labs/check-labs.mjs) judge a run the same way.
 *
 * Browser timing is noisy (timer clamping to 0.1-1 ms, GC pauses, JIT warm-up, a busy tab), so the
 * verdict is deliberately conservative:
 * - the harness times each size several times with a fresh setup (setup untimed) and keeps the median,
 *   or the mean when a run is under 2 ms (quantised timers average out);
 * - only points above MIN_MS count, and only the growth between the two largest measured sizes decides
 *   (where the asymptote shows and constant costs no longer dominate);
 * - the code is flagged when that growth beats the target's by a clear margin: an exponent at least
 *   TOLERANCE above the target's AND a time ratio at least RATIO_MARGIN times the target's ratio. O(n) vs
 *   O(n log n) is never told apart (too close to measure); O(n) vs O(n^2) always is;
 * - sizes the harness skipped because they would blow the time budget count as evidence: the projection
 *   comes from the growth already measured.
 */
import type { Complexity, ScaleSpec } from "./types";
import type { ScaleRun } from "./harness";

export const MIN_MS = 0.3;
export const TOLERANCE = 0.45;
export const RATIO_MARGIN = 2.5;

const lg = (n: number) => Math.log2(Math.max(2, n));
export const COMPLEXITY_FN: Record<Complexity, (n: number) => number> = {
  "O(1)": () => 1,
  "O(log n)": (n) => lg(n),
  "O(n)": (n) => n,
  "O(n log n)": (n) => n * lg(n),
  "O(n^2)": (n) => n * n,
};
export const COMPLEXITY_LABEL: Record<Complexity, string> = { "O(1)": "O(1)", "O(log n)": "O(log n)", "O(n)": "O(n)", "O(n log n)": "O(n log n)", "O(n^2)": "O(n²)" };

/** The exponent k such that f(n2)/f(n1) = (n2/n1)^k: a complexity's local slope on a log-log chart. */
export function localExponent(c: Complexity, n1: number, n2: number) {
  const f = COMPLEXITY_FN[c];
  return Math.log(f(n2) / f(n1)) / Math.log(n2 / n1);
}

export type ScaleVerdict = {
  status: "ok" | "slow" | "unclear" | "error";
  /** measured growth exponent between the two largest measured sizes */
  exponent: number | null;
  targetExponent: number | null;
  /** the listed complexity whose slope is closest to the measured one */
  looksLike: Complexity | null;
  headline: string;
  detail: string;
};

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : ms >= 10 ? `${Math.round(ms)} ms` : `${ms.toFixed(ms >= 1 ? 1 : 2)} ms`);
export const fmtN = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}k` : String(n));
export { fmtMs };

function nearest(exp: number, n1: number, n2: number): Complexity {
  const all: Complexity[] = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)"];
  let best = all[0];
  for (const c of all) if (Math.abs(localExponent(c, n1, n2) - exp) < Math.abs(localExponent(best, n1, n2) - exp)) best = c;
  // anything past quadratic reads as "worse than O(n²)" in the copy; the class is still O(n^2)
  return best;
}

export function judgeScale(run: ScaleRun | null, spec: Pick<ScaleSpec, "target" | "budgetSec">): ScaleVerdict {
  const target = spec.target;
  const T = COMPLEXITY_LABEL[target];
  if (!run || run.error) return { status: "error", exponent: null, targetExponent: null, looksLike: null, headline: "The scale run failed", detail: run?.error?.message ?? "No timings came back." };
  const pts = run.points.filter((p) => p.ms >= MIN_MS);
  const skipped = run.skipped;
  if (pts.length < 2 && !skipped.length) {
    return {
      status: "unclear",
      exponent: null,
      targetExponent: null,
      looksLike: null,
      headline: "Too fast to measure",
      detail: `Even the largest size finished in under ${MIN_MS} ms, below what a browser timer can resolve. No sign of growth beyond ${T}.`,
    };
  }
  if (pts.length < 2 && skipped.length) {
    const last = run.points[run.points.length - 1];
    return {
      status: "slow",
      exponent: null,
      targetExponent: null,
      looksLike: null,
      headline: `Too slow to finish n = ${fmtN(skipped[0].n)}`,
      detail: `n = ${fmtN(last?.n ?? 0)} already took ${fmtMs(last?.ms ?? 0)}; n = ${fmtN(skipped[0].n)} would take about ${fmtMs(skipped[0].projectedMs)}, over the ${spec.budgetSec} s budget.`,
    };
  }
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const exp = Math.log(b.ms / a.ms) / Math.log(b.n / a.n);
  const texp = localExponent(target, a.n, b.n);
  const ratio = b.ms / a.ms;
  const tratio = COMPLEXITY_FN[target](b.n) / COMPLEXITY_FN[target](a.n);
  const looks = nearest(exp, a.n, b.n);
  const worse = exp - texp >= TOLERANCE && ratio >= tratio * RATIO_MARGIN;
  const L = exp > localExponent("O(n^2)", a.n, b.n) + TOLERANCE ? "worse than O(n²)" : COMPLEXITY_LABEL[looks];
  if (worse) {
    return {
      status: "slow",
      exponent: exp,
      targetExponent: texp,
      looksLike: looks,
      headline: `Grows like ${L}, the target is ${T}`,
      detail: `From n = ${fmtN(a.n)} to ${fmtN(b.n)} (×${Math.round(b.n / a.n)}) the time went from ${fmtMs(a.ms)} to ${fmtMs(b.ms)} (×${ratio.toFixed(1)}); ${T} would be about ×${tratio.toFixed(1)}.${
        skipped.length ? ` n = ${fmtN(skipped[0].n)} was skipped: about ${fmtMs(skipped[0].projectedMs)}.` : ""
      }`,
    };
  }
  if (skipped.length) {
    return {
      status: "slow",
      exponent: exp,
      targetExponent: texp,
      looksLike: looks,
      headline: `Growth looks fine, but n = ${fmtN(skipped[0].n)} would take ${fmtMs(skipped[0].projectedMs)}`,
      detail: `The curve follows ${T}, but the constant factor is large: the biggest size was skipped to stay inside the ${spec.budgetSec} s budget.`,
    };
  }
  return {
    status: "ok",
    exponent: exp,
    targetExponent: texp,
    looksLike: looks,
    headline: `Scales like ${T} or better`,
    detail: `From n = ${fmtN(a.n)} to ${fmtN(b.n)} the time grew ×${ratio.toFixed(1)}; ${T} allows about ×${tratio.toFixed(1)}. Timings in a browser vary by ±30%, so only clearly faster growth is flagged.`,
  };
}
