/**
 * The complexity budget (/dsa/complexity): the 10^8 rule as a small model. Pure and client-safe.
 *
 * Everything here is a rule of thumb, stated as one: a judge machine runs roughly 10^8 simple operations (an add, a
 * compare, an array read) a second in C++. Real hardware can do more, but hashing, allocation, cache misses and
 * recursion cost several simple operations each, so 10^8 is the conservative planning number the lessons use.
 * The language factors are deliberately on the slow side: Java and JavaScript (JIT-compiled) usually land within a
 * small factor of C++, and pure-Python loops run about 10–50 times slower.
 * The model works in log10 space so 2^n and n! never overflow.
 */

export type CxLang = "cpp" | "java" | "javascript" | "python";

export const CX_LANGS: { id: CxLang; label: string; rate: number; note: string }[] = [
  { id: "cpp", label: "C++", rate: 1e8, note: "the 10^8 rule itself" },
  { id: "java", label: "Java", rate: 5e7, note: "planned at ~2× slower than C++ (JIT warm-up, boxing in collections)" },
  { id: "javascript", label: "JavaScript", rate: 5e7, note: "planned at ~2× slower than C++ (V8 JIT; Maps and objects cost more)" },
  { id: "python", label: "Python", rate: 5e6, note: "planned at ~20× slower than C++ (pure loops run 10–50× slower; built-ins like sort run in C)" },
];

export const cxLang = (id: CxLang) => CX_LANGS.find((l) => l.id === id) || CX_LANGS[0];

export type CxClassId = "1" | "logn" | "sqrtn" | "n" | "nlogn" | "n2" | "n3" | "2n" | "nfact";

const LOG2 = Math.log10(2);

/** log10(n!) exactly for small n, Stirling beyond (error far below what the verdicts care about). */
function log10Fact(n: number): number {
  if (n < 2) return 0;
  if (n <= 170) {
    let s = 0;
    for (let k = 2; k <= n; k++) s += Math.log10(k);
    return s;
  }
  return (n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n)) / Math.LN10;
}

export type CxClass = { id: CxClassId; label: string; name: string; log10: (n: number) => number; example: string };

/** Growth classes from fastest to slowest. log10 of the (constant-free) operation count at size n. */
export const CX_CLASSES: CxClass[] = [
  { id: "1", label: "O(1)", name: "constant", log10: () => 0, example: "a formula, an array read" },
  { id: "logn", label: "O(log n)", name: "logarithmic", log10: (n) => Math.log10(Math.max(1, Math.log2(Math.max(2, n)))), example: "binary search" },
  { id: "sqrtn", label: "O(√n)", name: "square root", log10: (n) => 0.5 * Math.log10(Math.max(1, n)), example: "trial division up to √n" },
  { id: "n", label: "O(n)", name: "linear", log10: (n) => Math.log10(Math.max(1, n)), example: "one pass: two pointers, sliding window, hashing" },
  { id: "nlogn", label: "O(n log n)", name: "n log n", log10: (n) => Math.log10(Math.max(1, n)) + Math.log10(Math.max(1, Math.log2(Math.max(2, n)))), example: "sort first, then one pass" },
  { id: "n2", label: "O(n²)", name: "quadratic", log10: (n) => 2 * Math.log10(Math.max(1, n)), example: "every pair" },
  { id: "n3", label: "O(n³)", name: "cubic", log10: (n) => 3 * Math.log10(Math.max(1, n)), example: "every triple, three nested loops" },
  { id: "2n", label: "O(2ⁿ)", name: "exponential", log10: (n) => n * LOG2, example: "every subset" },
  { id: "nfact", label: "O(n!)", name: "factorial", log10: (n) => log10Fact(n), example: "every ordering" },
];

export const cxClass = (id: CxClassId) => CX_CLASSES.find((c) => c.id === id)!;

export type CxVerdict = "easy" | "fits" | "risky" | "slow";

export const CX_VERDICT: Record<CxVerdict, { label: string; mark: string }> = {
  easy: { label: "fits easily", mark: "✓" },
  fits: { label: "fits", mark: "✓" },
  risky: { label: "risky", mark: "!" },
  slow: { label: "too slow", mark: "✕" },
};

/** log10 of the operations a language gets through in `seconds`. */
export const budgetLog10 = (lang: CxLang, seconds: number) => Math.log10(cxLang(lang).rate * seconds);

/**
 * ratio = operations / budget. Up to a quarter of the budget fits easily; up to the budget fits; up to 4× over is
 * risky (constant factors and the machine decide, so plan for something faster); beyond that it is too slow.
 */
export function verdictOf(log10Ratio: number): CxVerdict {
  if (log10Ratio <= Math.log10(0.25)) return "easy";
  if (log10Ratio <= 0) return "fits";
  if (log10Ratio <= Math.log10(4)) return "risky";
  return "slow";
}

export type CxRow = { cls: CxClass; log10Ops: number; log10Seconds: number; verdict: CxVerdict };

export function budgetRows(n: number, lang: CxLang, seconds: number): CxRow[] {
  const b = budgetLog10(lang, seconds);
  const rate = Math.log10(cxLang(lang).rate);
  return CX_CLASSES.map((cls) => {
    const ops = cls.log10(n);
    return { cls, log10Ops: ops, log10Seconds: ops - rate, verdict: verdictOf(ops - b) };
  });
}

/** The slowest class that still fits (ratio ≤ 1): what to aim for. */
export function aimFor(n: number, lang: CxLang, seconds: number): CxClass {
  const rows = budgetRows(n, lang, seconds).filter((r) => r.verdict === "easy" || r.verdict === "fits");
  return rows.length ? rows[rows.length - 1].cls : CX_CLASSES[0];
}

/** The largest n (≤ 10^18) a class handles inside the budget, or Infinity when size never matters at this scale. */
export function maxN(cls: CxClass, lang: CxLang, seconds: number): number {
  const b = budgetLog10(lang, seconds);
  if (cls.log10(1e18) <= b) return Infinity;
  let lo = 1;
  let hi = 1e18;
  if (cls.log10(lo) > b) return 0;
  // bisection in log space
  for (let i = 0; i < 200 && hi / lo > 1.0001; i++) {
    const mid = Math.sqrt(lo * hi);
    if (cls.log10(mid) <= b) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo);
}

/* ------------------------------------------------------------------ formatting */

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
export const sup = (k: number | string) =>
  String(k)
    .split("")
    .map((c) => SUP[c] ?? c)
    .join("");

/** A count from its log10: "4,096", "≈ 3.5 × 10⁶", "≈ 10¹⁵⁶⁵". */
export function fmtLog(log10: number): string {
  if (!Number.isFinite(log10)) return "∞";
  if (log10 < 4) return Math.round(10 ** log10).toLocaleString("en-US");
  const e = Math.floor(log10);
  if (e >= 100) return `≈ 10${sup(e)}`;
  const m = 10 ** (log10 - e);
  const mm = Math.round(m * 10) / 10;
  if (mm >= 10) return `≈ 10${sup(e + 1)}`;
  return mm === 1 ? `≈ 10${sup(e)}` : `≈ ${mm} × 10${sup(e)}`;
}

/** n as people write it in constraints: 500, 5,000, 2 × 10⁵, 10⁹. */
export function fmtN(n: number): string {
  if (!Number.isFinite(n)) return "any n";
  if (n >= 1000) {
    const p = 10 ** (Math.floor(Math.log10(n)) - 1);
    n = Math.round(n / p) * p; // two significant figures: 9,999 → 10⁴
  }
  if (n < 10_000) return Math.round(n).toLocaleString("en-US");
  const e = Math.floor(Math.log10(n));
  const m = n / 10 ** e;
  const mm = m >= 9.95 ? 1 : Math.round(m * 10) / 10;
  const ee = m >= 9.95 ? e + 1 : e;
  return mm === 1 ? `10${sup(ee)}` : `${mm} × 10${sup(ee)}`;
}

/** Seconds from log10: "40 ns", "0.3 ms", "2.5 s", "4 days", "longer than the universe". */
export function fmtSeconds(log10: number): string {
  if (log10 > 17.6) return "longer than the universe has existed";
  const s = 10 ** log10;
  if (s < 1e-6) return "under a microsecond";
  if (s < 1e-3) return `${Math.round(s * 1e6)} µs`;
  if (s < 1) return `${Math.round(s * 1e3)} ms`;
  if (s < 120) return `${s < 10 ? Math.round(s * 10) / 10 : Math.round(s)} s`;
  if (s < 7200) return `${Math.round(s / 60)} min`;
  if (s < 172_800) return `${Math.round(s / 3600)} hours`;
  if (s < 63_072_000) return `${Math.round(s / 86_400)} days`;
  return `${fmtN(s / 31_557_600)} years`;
}

/** The size stops the slider walks: 1, 2, 5 per decade from 10 to 10^9, plus 2 × 10^5 (the most common constraint). */
export const N_STOPS: number[] = (() => {
  const out: number[] = [];
  for (let e = 1; e <= 9; e++) for (const m of [1, 2, 5]) if (!(e === 9 && m > 1)) out.push(m * 10 ** e);
  return out.sort((a, b) => a - b);
})();

/* ------------------------------------------------------------------ the constraint signals (C++, about 1 second) */

export type CxSignal = { bound: string; aim: string; typical: string; concepts: string[] };

/**
 * Reading constraints at a glance, in C++ at about one second (the classic table). Each row is the size where the
 * class still fits with room to spare; Python and the other languages shift these down (the calculator shows by how much).
 */
export const CX_SIGNALS: CxSignal[] = [
  { bound: "n ≤ 10", aim: "O(n!)", typical: "try every ordering (permutations, backtracking)", concepts: ["subsets-and-permutations"] },
  { bound: "n ≤ 20", aim: "O(2ⁿ · n)", typical: "try every subset, bitmasks", concepts: ["subsets-and-permutations"] },
  { bound: "n ≤ 400", aim: "O(n³)", typical: "three nested loops, DP over ranges", concepts: [] },
  { bound: "n ≤ 5,000", aim: "O(n²)", typical: "every pair, DP over pairs of positions", concepts: [] },
  { bound: "n ≤ 10⁶", aim: "O(n log n)", typical: "sort first, binary search inside a loop, a heap", concepts: ["merge-sort-and-inversions", "first-true-template"] },
  { bound: "n ≤ 10⁷ or so", aim: "O(n)", typical: "one pass: two pointers, sliding window, hashing, prefix sums", concepts: ["opposite-ends", "fixed-and-variable-windows", "seen-set-and-complement", "prefix-sums"] },
  { bound: "n up to 10⁹ or 10¹⁸", aim: "O(log n), O(√n) or O(1)", typical: "binary search on the value, maths; you can't even read n items", concepts: ["search-on-the-answer"] },
];

/* ------------------------------------------------------------------ the drill */

export type CxQuestion =
  | { kind: "aim"; n: number; lang: CxLang; seconds: number; options: CxClassId[]; answer: CxClassId; why: string }
  | { kind: "pass"; n: number; lang: CxLang; seconds: number; cls: CxClassId; options: ["pass", "slow"]; answer: "pass" | "slow"; why: string };

const DRILL_N = [10, 18, 20, 100, 300, 500, 2000, 5000, 10_000, 100_000, 200_000, 500_000, 1_000_000, 10_000_000, 1_000_000_000];

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function langLabel(l: CxLang) {
  return cxLang(l).label;
}

/** One unambiguous question: the answer clears its budget by 2× or more, and the next class is clearly over. */
export function drillQuestion(rand: () => number): CxQuestion {
  for (let tries = 0; tries < 200; tries++) {
    const lang = pick<CxLang>(["cpp", "cpp", "java", "javascript", "python", "python"], rand);
    const seconds = pick([1, 1, 2], rand);
    const n = pick(DRILL_N, rand);
    const b = budgetLog10(lang, seconds);
    if (rand() < 0.55) {
      const rows = budgetRows(n, lang, seconds);
      const idx = rows.findLastIndex((r) => r.log10Ops - b <= 0);
      if (idx < 3 || idx >= rows.length - 1) continue; // O(1)/log/√n answers are dull; n! fitting is out of range
      const ans = rows[idx];
      const next = rows[idx + 1];
      if (ans.log10Ops - b > Math.log10(0.5) || next.log10Ops - b < Math.log10(4)) continue;
      const answer = ans.cls.id;
      const pool = rows.map((r) => r.cls.id).filter((id) => id !== answer && id !== "1" && id !== "logn" && id !== "sqrtn");
      const others: CxClassId[] = [];
      while (others.length < 3 && pool.length) others.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
      const options = [answer, ...others].sort((a, b2) => CX_CLASSES.findIndex((c) => c.id === a) - CX_CLASSES.findIndex((c) => c.id === b2));
      const why = `${ans.cls.label} at n = ${fmtN(n)} is ${fmtLog(ans.log10Ops)} operations; ${next.cls.label} would be ${fmtLog(next.log10Ops)}. ${langLabel(lang)} gets through ${fmtLog(b)} in ${seconds} s.`;
      return { kind: "aim", n, lang, seconds, options, answer, why };
    }
    const cls = pick(CX_CLASSES.slice(3), rand);
    const ops = cls.log10(n);
    const r = ops - b;
    if (r > Math.log10(0.3) && r < 1) continue; // only clear passes (≤ 30 % of budget) and clear fails (≥ 10×)
    if (r > 40) continue;
    const answer = r <= 0 ? "pass" : "slow";
    const why = `${cls.label} at n = ${fmtN(n)} is ${fmtLog(ops)} operations against a budget of ${fmtLog(b)} for ${langLabel(lang)} in ${seconds} s${answer === "slow" ? ` (${fmtSeconds(ops - Math.log10(cxLang(lang).rate))} at that rate)` : ""}.`;
    return { kind: "pass", n, lang, seconds, cls: cls.id, options: ["pass", "slow"], answer, why };
  }
  return { kind: "pass", n: 100_000, lang: "cpp", seconds: 1, cls: "n2", options: ["pass", "slow"], answer: "slow", why: "O(n²) at n = 10⁵ is 10¹⁰ operations against about 10⁸ in 1 s." };
}
