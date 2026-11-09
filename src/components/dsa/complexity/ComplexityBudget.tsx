"use client";

/**
 * /dsa/complexity: the complexity budget. Pick a size and a time limit, see which growth classes fit (the 10^8 rule
 * with per-language factors, src/lib/dsa/complexity.ts), the reverse ("aim for O(n log n)"), the constraint signals,
 * and a short drill. Everything runs in the browser; links point only at lessons that are built.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import DsaCrumbs from "@/components/dsa/DsaCrumbs";
import {
  aimFor,
  budgetLog10,
  budgetRows,
  CX_CLASSES,
  CX_LANGS,
  CX_SIGNALS,
  CX_VERDICT,
  cxClass,
  cxLang,
  drillQuestion,
  fmtLog,
  fmtN,
  fmtSeconds,
  maxN,
  N_STOPS,
  type CxLang,
  type CxQuestion,
  type CxVerdict,
} from "@/lib/dsa/complexity";

const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";
const SEG = (on: boolean) => `min-h-10 border px-3 font-mono text-[13px] ${on ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg hover:bg-surface-2"}`;

const VERDICT_TONE: Record<CxVerdict, { text: string; bar: string }> = {
  easy: { text: "text-ok-text", bar: "bg-ok" },
  fits: { text: "text-ok-text", bar: "bg-ok" },
  risky: { text: "text-amber", bar: "bg-amber" },
  slow: { text: "text-bad-text", bar: "bg-bad" },
};

/** Bars run on a log scale from 1 to 10^14 operations; anything bigger is clipped with an arrow. */
const BAR_MAX = 14;

function Verdict({ v }: { v: CxVerdict }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[12px] font-semibold ${VERDICT_TONE[v].text}`}>
      <span aria-hidden>{CX_VERDICT[v].mark}</span>
      {CX_VERDICT[v].label}
    </span>
  );
}

const BEST_KEY = "hk.dsa.cx.best";

export default function ComplexityBudget({ built }: { built: Record<string, string> }) {
  const [idx, setIdx] = useState(N_STOPS.indexOf(200_000));
  const [seconds, setSeconds] = useState(1);
  const [lang, setLang] = useState<CxLang>("cpp");
  const n = N_STOPS[idx];
  const rows = useMemo(() => budgetRows(n, lang, seconds), [n, lang, seconds]);
  const aim = aimFor(n, lang, seconds);
  const budget = budgetLog10(lang, seconds);
  const L = cxLang(lang);

  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <header className="flex flex-col gap-3">
          <DsaCrumbs items={[{ href: "/dsa", label: "World map" }, { label: "Complexity budget" }]} />
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">tools · the 10⁸ rule</span>
          <h1 className="m-0 font-display text-[clamp(34px,6vw,60px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
            Will it run in time<span className="text-signal-text">?</span>
          </h1>
          <p className="m-0 max-w-[720px] text-[16px] leading-relaxed text-fg-2">
            Read the constraints before you write a line. A judge gets through roughly 10⁸ simple operations a second in C++, so the input size tells you which complexity you can afford. These are rules of thumb for planning, not guarantees.
          </p>
        </header>

        {/* the calculator */}
        <section aria-labelledby="cx-calc-h" className="flex flex-col gap-5 border border-line-strong bg-surface p-4 sm:p-6">
          <h2 id="cx-calc-h" className="sr-only">
            Budget calculator
          </h2>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="cx-n" className={LABEL}>
                input size n
              </label>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-[40px] font-extrabold leading-none tracking-[-0.03em] text-fg">{fmtN(n)}</span>
                <span className="font-mono text-[12px] text-fg-3">{n.toLocaleString("en-US")}</span>
              </div>
              <input
                id="cx-n"
                type="range"
                min={0}
                max={N_STOPS.length - 1}
                step={1}
                value={idx}
                onChange={(e) => setIdx(Number(e.target.value))}
                aria-valuetext={`n = ${n.toLocaleString("en-US")}`}
                className="h-10 w-full accent-[var(--c-signal)]"
              />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common sizes">
                {[20, 500, 5000, 100_000, 200_000, 1_000_000, 1_000_000_000].map((v) => (
                  <button key={v} type="button" onClick={() => setIdx(N_STOPS.indexOf(v))} aria-pressed={n === v} className={`min-h-9 border px-2.5 font-mono text-[12px] ${n === v ? "border-signal text-signal-text" : "border-line text-fg-3 hover:text-fg"}`}>
                    {fmtN(v)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className={LABEL} id="cx-lang-l">
                  language
                </span>
                <div role="radiogroup" aria-labelledby="cx-lang-l" className="flex flex-wrap gap-1.5">
                  {CX_LANGS.map((l) => (
                    <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} onClick={() => setLang(l.id)} className={SEG(lang === l.id)}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className={LABEL} id="cx-t-l">
                  time limit
                </span>
                <div role="radiogroup" aria-labelledby="cx-t-l" className="flex flex-wrap gap-1.5">
                  {[1, 2, 3].map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={seconds === s} onClick={() => setSeconds(s)} className={SEG(seconds === s)}>
                      {s} s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="m-0 border-l-2 border-signal pl-4 text-[17px] leading-snug text-fg" aria-live="polite">
            At n = {fmtN(n)} in {L.label} with {seconds} s, aim for <strong className="font-semibold text-signal-text">{aim.label}</strong> or faster.{" "}
            <span className="text-fg-2">
              Budget: about {fmtLog(budget).replace("≈ ", "")} simple operations ({L.note}).
            </span>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
              <caption className="sr-only">Operations, time and verdict for each growth class at this size</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={`${LABEL} py-2 pr-3 font-normal`}>
                    class
                  </th>
                  <th scope="col" className={`${LABEL} py-2 pr-3 font-normal`}>
                    operations
                  </th>
                  <th scope="col" className={`${LABEL} w-[34%] py-2 pr-3 font-normal`}>
                    <span className="sr-only">size on a log scale, against the budget</span>
                  </th>
                  <th scope="col" className={`${LABEL} py-2 pr-3 font-normal`}>
                    time
                  </th>
                  <th scope="col" className={`${LABEL} py-2 font-normal`}>
                    verdict
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const w = Math.max(1.5, Math.min(100, (Math.max(0, r.log10Ops) / BAR_MAX) * 100));
                  const clipped = r.log10Ops > BAR_MAX;
                  const mark = Math.min(100, (budget / BAR_MAX) * 100);
                  const isAim = r.cls.id === aim.id;
                  return (
                    <tr key={r.cls.id} className={`border-b border-line last:border-b-0 ${isAim ? "bg-signal/10" : ""}`}>
                      <th scope="row" className="whitespace-nowrap py-2.5 pr-3 font-mono text-[14px] font-semibold text-fg">
                        {r.cls.label}
                        {isAim && <span className="ml-2 font-normal text-signal-text">← aim</span>}
                      </th>
                      <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-[13px] text-fg-2">{fmtLog(r.log10Ops)}</td>
                      <td className="py-2.5 pr-3" aria-hidden>
                        <div className="relative h-2.5 bg-surface-2">
                          <div className={`h-2.5 rounded-r-[4px] ${VERDICT_TONE[r.verdict].bar}`} style={{ width: `${w}%`, opacity: 0.85 }} />
                          {clipped && <span className="absolute -right-1 -top-[5px] font-mono text-[12px] leading-none text-bad-text">›</span>}
                          <span className="absolute -bottom-1 -top-1 w-[2px] bg-fg" style={{ left: `${mark}%` }} title="budget" />
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-[12px] text-fg-3">{r.verdict === "slow" || r.log10Seconds > -3 ? fmtSeconds(r.log10Seconds) : "instant"}</td>
                      <td className="py-2.5">
                        <Verdict v={r.verdict} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="m-0 font-mono text-[12px] leading-relaxed text-fg-3">
            Bars: operations on a log scale; the upright line is the budget. Fits easily: under a quarter of it · fits: under the budget · risky: up to 4× over, so constant factors decide · too slow: beyond that.
          </p>
        </section>

        {/* the reverse: largest n per class */}
        <section aria-labelledby="cx-max-h" className="flex flex-col gap-3">
          <h2 id="cx-max-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.025em] text-fg sm:text-[30px]">
            The largest n each class handles
          </h2>
          <p className="m-0 text-[15px] text-fg-2">
            In {L.label} with {seconds} s, roughly:
          </p>
          <ul className="m-0 grid list-none grid-cols-2 gap-px border border-line bg-line p-0 sm:grid-cols-3 lg:grid-cols-6">
            {CX_CLASSES.slice(3).map((c) => (
              <li key={c.id} className="flex flex-col gap-1 bg-surface px-3 py-3">
                <span className="font-mono text-[12px] text-fg-3">{c.label}</span>
                <span className="font-display text-[22px] font-bold leading-none text-fg">n ≈ {fmtN(maxN(c, lang, seconds))}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* signals */}
        <section aria-labelledby="cx-sig-h" className="flex flex-col gap-3">
          <h2 id="cx-sig-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.025em] text-fg sm:text-[30px]">
            Reading the constraints
          </h2>
          <p className="m-0 max-w-[720px] text-[15px] leading-relaxed text-fg-2">The classic signals, for C++ at about one second. In Python, expect each bound to drop by roughly a factor of 10 or more for the polynomial rows.</p>
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[620px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th scope="col" className={`${LABEL} px-3 py-2 font-normal`}>
                    constraint
                  </th>
                  <th scope="col" className={`${LABEL} px-3 py-2 font-normal`}>
                    aim for
                  </th>
                  <th scope="col" className={`${LABEL} px-3 py-2 font-normal`}>
                    what that usually means
                  </th>
                </tr>
              </thead>
              <tbody>
                {CX_SIGNALS.map((s) => {
                  const links = s.concepts.filter((id) => built[id]);
                  return (
                    <tr key={s.bound} className="border-b border-line bg-surface last:border-b-0">
                      <th scope="row" className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] font-semibold text-fg">
                        {s.bound}
                      </th>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-signal-text">{s.aim}</td>
                      <td className="px-3 py-2.5 text-fg-2">
                        {s.typical}
                        {links.length > 0 && (
                          <span className="ml-1">
                            ·{" "}
                            {links.map((id, i) => (
                              <span key={id}>
                                {i > 0 && ", "}
                                <Link href={`/dsa/concepts/${id}`} className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                                  {built[id]}
                                </Link>
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="cx-caveat-h" className="flex flex-col gap-3">
          <h2 id="cx-caveat-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.025em] text-fg sm:text-[30px]">
            Where the rule bends
          </h2>
          <ul className="m-0 grid max-w-[820px] list-none gap-2 p-0 text-[15px] leading-relaxed text-fg-2">
            <li>■ 10⁸ counts simple steps: an add, a compare, an array read. A hash-map lookup, an allocation or a cache miss costs several of them.</li>
            <li>■ Big-O drops constants. Two passes over the data is still O(n), but twice the work; O(n log n) at n = 10⁶ is about 2 × 10⁷ steps.</li>
            <li>■ Python: pure loops run about 10–50× slower than C++. Built-ins such as sort, sum, set and Counter run in C and are much faster, so lean on them. The default recursion limit is 1,000 calls.</li>
            <li>■ Java and JavaScript compile to machine code at run time and usually land within a small factor of C++; boxed integers in Java collections and objects used as maps in JavaScript add cost.</li>
            <li>■ Totals overflow before time does: with n = 10⁵ values up to 10⁹, a sum reaches 10¹⁴. Use 64-bit integers (long, long long); JavaScript numbers are exact only up to 2⁵³ ≈ 9 × 10¹⁵.</li>
            <li>■ Each problem page states its own time limit. When the verdict here says risky, look for the next class down.</li>
          </ul>
        </section>

        <Drill />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ the drill */

const ROUND = 5;

function seedRand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRound(seed: number): CxQuestion[] {
  const rand = seedRand(seed);
  const out: CxQuestion[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < ROUND && i < 50; i++) {
    const q = drillQuestion(rand);
    const k = JSON.stringify([q.kind, q.n, q.lang, q.seconds, q.kind === "pass" ? q.cls : ""]);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  return out;
}

function prompt(q: CxQuestion) {
  const where = `${cxLang(q.lang).label}, ${q.seconds} s`;
  return q.kind === "aim" ? `n ≤ ${fmtN(q.n)} · ${where}. What is the slowest complexity that still fits?` : `Your solution is ${cxClass(q.cls).label}. n = ${fmtN(q.n)} · ${where}. Will it pass?`;
}

function Drill() {
  // the first round is fixed so the server and the browser render the same page; "new round" reseeds
  const [seed, setSeed] = useState(7);
  const qs = useMemo(() => makeRound(seed), [seed]);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<(string | null)[]>([]);
  // the best score is read from this browser only when a round ends (no effect on mount: the page renders the same everywhere)
  const [best, setBest] = useState<number | null>(null);

  const q = qs[i];
  const picked = picks[i] ?? null;
  const score = picks.filter((p, k) => p !== null && qs[k] && p === qs[k].answer).length;
  const finished = picks.filter((p) => p !== null).length === qs.length;

  const choose = (opt: string) => {
    if (picked !== null) return;
    const next = picks.slice();
    next[i] = opt;
    setPicks(next);
    if (next.filter((p) => p !== null).length === qs.length) {
      const s = next.filter((p, k) => p === qs[k].answer).length;
      let prev = 0;
      try {
        prev = Number(localStorage.getItem(BEST_KEY)) || 0;
        if (s > prev) localStorage.setItem(BEST_KEY, String(s));
      } catch {
        /* storage blocked: this round's score only */
      }
      setBest(Math.max(s, prev));
    }
  };
  const again = () => {
    setSeed((s) => s + 1 + Math.floor(Math.random() * 1000));
    setI(0);
    setPicks([]);
  };

  const label = (opt: string) => (q.kind === "aim" ? cxClass(opt as never).label : opt === "pass" ? "Passes" : "Too slow");

  return (
    <section aria-labelledby="cx-drill-h" className="flex flex-col gap-4 border border-line-strong bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
            drill · {ROUND} questions{best !== null ? ` · best ${best}/${ROUND}` : ""}
          </span>
          <h2 id="cx-drill-h" className="m-0 font-display text-[26px] font-bold leading-tight tracking-[-0.025em] text-fg sm:text-[30px]">
            Without the calculator
          </h2>
        </div>
        <span className="font-mono text-[13px] text-fg-3" aria-live="polite">
          {finished ? `${score}/${qs.length}` : `question ${i + 1} of ${qs.length} · ${score} right`}
        </span>
      </div>
      {q && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[17px] font-semibold leading-snug text-fg">{prompt(q)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {q.options.map((opt) => {
              const isAns = opt === q.answer;
              const chosen = picked === opt;
              const tone = picked === null ? "border-line-strong text-fg hover:border-signal" : isAns ? "border-ok bg-ok/10 text-fg" : chosen ? "border-bad bg-bad/10 text-fg" : "border-line text-fg-3";
              return (
                <button key={opt} type="button" disabled={picked !== null} onClick={() => choose(opt)} className={`min-h-12 border px-3 font-mono text-[14px] ${tone}`}>
                  {label(opt)}
                  {picked !== null && isAns && <span className="sr-only"> (correct answer)</span>}
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <p className="m-0 text-[14.5px] leading-relaxed text-fg-2" aria-live="polite">
              <strong className={picked === q.answer ? "text-ok-text" : "text-bad-text"}>{picked === q.answer ? "Right." : "Not quite."}</strong> {q.why}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {picked !== null && i < qs.length - 1 && (
              <button type="button" onClick={() => setI(i + 1)} className="inline-flex min-h-11 items-center bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal">
                Next →
              </button>
            )}
            {finished && (
              <button type="button" onClick={again} className="inline-flex min-h-11 items-center bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal">
                New round →
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
