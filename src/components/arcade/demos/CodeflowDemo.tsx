"use client";

import { useRef, useState } from "react";
import { PRIMARY_BTN, type DemoProps, useTicker } from "../useTicker";

const LINES: [string, string][] = [
  ["scanning 214 files…", "text-fg-3"],
  ["routes      18  (app router)", "text-fg-2"],
  ["client components   42 · server 61", "text-fg-2"],
  ["data fetches        27 · 3 without error handling", "text-bad-text"],
  ["side effects        useEffect ×56 · 4 missing deps", "text-bad-text"],
  ["✓ report written → codeflow-report.md", "text-ok"],
];

export default function CodeflowDemo({ clear }: DemoProps) {
  const [cf, setCf] = useState(-1);
  const cfRef = useRef(-1);
  const { start, stop } = useTicker();

  const busy = cf >= 0 && cf < LINES.length;

  const run = () => {
    cfRef.current = 0;
    setCf(0);
    start(() => {
      const n = cfRef.current + 1;
      cfRef.current = n;
      setCf(n);
      if (n >= LINES.length) {
        stop();
        clear("Report written");
      }
    }, 450);
  };

  return (
    <>
      <div className="min-h-[300px] grow overflow-x-auto border border-line bg-raised p-4 font-mono text-[13px] leading-[1.8] text-fg-2">
        <div className="text-fg-4">{"// sample output"}</div>
        <div>
          <span className="text-signal-text">$</span> npx codeflow-analyzer ./my-next-app
        </div>
        <div aria-live="polite">
          {LINES.slice(0, Math.max(0, cf)).map(([text, color]) => (
            <div key={text} className={`whitespace-pre ${color}`}>
              {text}
            </div>
          ))}
        </div>
        <span aria-hidden className="inline-block h-[15px] w-2 animate-hk-blink bg-fg align-[-2px]" />
      </div>
      <button type="button" onClick={run} disabled={busy} className={PRIMARY_BTN}>
        {cf >= LINES.length ? "run again" : busy ? "analyzing…" : "npx codeflow-analyzer"}
      </button>
    </>
  );
}
