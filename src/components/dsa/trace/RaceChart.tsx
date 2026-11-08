"use client";

/**
 * The brute-versus-optimal race (generated/races/<id>.json): operation counts measured in CI at growing input sizes.
 * Bars on a log scale (the gap spans orders of magnitude), with live counters when you press "Run the race".
 * Reduced motion shows the final numbers at once.
 */
import { useEffect, useRef, useState } from "react";
import type { Race } from "@/lib/dsa/types";

const nf = (n: number) => Math.round(n).toLocaleString("en");

export default function RaceChart({ race }: { race: Race }) {
  const [t, setT] = useState(1);
  const raf = useRef(0);
  const max = Math.max(...race.series.flatMap((s) => s.counts), 1);
  const logMax = Math.log10(max);

  const run = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(1);
      return;
    }
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 2200);
      setT(k);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    setT(0);
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const last = race.sizes.length - 1;
  const bad = race.series.find((s) => s.tone === "bad");
  const good = race.series.find((s) => s.tone === "good");
  const ratio = bad && good && good.counts[last] ? Math.round(bad.counts[last] / good.counts[last]) : null;

  return (
    <div className="dsa-ui flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[15px] font-semibold text-fg">{race.title}</p>
        <button type="button" onClick={run} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
          Run the race ▸
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {race.sizes.map((n, si) => (
          <div key={n} className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">n = {nf(n)}</span>
            {race.series.map((s) => {
              const v = s.counts[si] * t;
              const w = v <= 1 ? 0 : (Math.log10(v) / logMax) * 100;
              return (
                <div key={s.label} className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center sm:gap-3">
                  <span className="truncate text-[12px] text-fg-2">{s.label}</span>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-4 min-w-[2px] flex-none" style={{ width: `${Math.max(0.5, w * 0.8)}%`, background: s.tone === "bad" ? "var(--c-bad)" : "var(--c-signal)" }} />
                    <span className="font-mono text-[12px] text-fg">{nf(v)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="m-0 text-[13px] text-fg-3">
        {race.unit ? `Counted in ${race.unit}. ` : ""}
        {ratio ? `At n = ${nf(race.sizes[last])}, the first attempt does about ${nf(ratio)} times the work. ` : ""}
        Bars use a log scale. {race.note}
      </p>
    </div>
  );
}
