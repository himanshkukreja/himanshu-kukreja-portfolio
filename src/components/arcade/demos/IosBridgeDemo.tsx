"use client";

import { useState } from "react";
import { DEMO_LABEL, type DemoProps } from "../useTicker";

const OS = { win: "Windows", linux: "Linux", mac: "macOS" } as const;
type OsKey = keyof typeof OS;

const APPS: [string, string][] = [
  ["Mail", "✉"],
  ["Maps", "⌖"],
  ["Notes", "≡"],
  ["Camera", "◉"],
  ["Photos", "▣"],
  ["Clock", "◷"],
  ["Safari", "◎"],
  ["Your app", "★"],
];

/** Simulated input-to-frame latency for a WebRTC stream. */
const sampleLatency = () => `${28 + Math.round(Math.random() * 40)} ms`;

const CTRL = "min-h-11 flex-1 border font-mono text-xs";

export default function IosBridgeDemo({ clear }: DemoProps) {
  const [os, setOs] = useState<OsKey>("win");
  const [app, setApp] = useState("");
  const [taps, setTaps] = useState(0);
  const [lat, setLat] = useState("—");
  const [rot, setRot] = useState(false);
  const [rec, setRec] = useState(false);

  const open = (name: string) => {
    const next = taps + 1;
    setApp(name);
    setTaps(next);
    setLat(sampleLatency());
    if (next >= 3) clear(`Streamed and tapped from ${OS[os]}`);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <div className="flex max-w-[300px] flex-[1_1_240px] flex-col gap-2.5">
        <span className={DEMO_LABEL}>YOUR MACHINE</span>
        <div role="group" aria-label="Client OS" className="flex gap-1.5">
          {(Object.keys(OS) as OsKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setOs(k)}
              aria-pressed={os === k}
              className={`min-h-11 flex-1 border font-mono text-xs ${
                os === k ? "border-fg bg-fg text-bg" : "border-line-strong bg-transparent text-fg-2 hover:bg-surface-2"
              }`}
            >
              {OS[k]}
            </button>
          ))}
        </div>
        <div className="border border-line bg-raised p-3 font-mono text-xs leading-[1.8] text-fg-2" aria-live="polite">
          <div>
            <span className="text-signal-text">$</span> ios-bridge connect mac-mini.local
          </div>
          <div>streaming iPhone 16 sim → {OS[os]}</div>
          <div>
            input → frame <span className="font-semibold text-fg">{lat}</span>
          </div>
          <div>taps {Math.min(taps, 3)} / 3</div>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setApp("")} className={`${CTRL} border-line-strong text-fg hover:bg-surface-2`}>
            home
          </button>
          <button
            type="button"
            onClick={() => setRot((r) => !r)}
            aria-pressed={rot}
            className={`${CTRL} border-line-strong text-fg hover:bg-surface-2`}
          >
            rotate
          </button>
          <button
            type="button"
            onClick={() => setRec((r) => !r)}
            aria-pressed={rec}
            className={`${CTRL} ${rec ? "border-bad bg-bad text-black" : "border-line-strong text-fg hover:bg-surface-2"}`}
          >
            <span aria-hidden>● </span>rec
          </button>
        </div>
      </div>

      <div
        aria-label={`Simulated iPhone screen${rot ? ", landscape" : ""}${rec ? ", recording" : ""}`}
        role="group"
        className={`max-w-full shrink-0 overflow-hidden rounded-[30px] border-8 border-[#26262A] bg-[#0E0E10] text-[#F3F2EE] transition-all duration-300 ${
          rot ? "h-[210px] w-[400px]" : "h-[400px] w-[210px]"
        } ${rec ? "shadow-[0_0_0_3px_#E5484D]" : ""}`}
      >
        {!app ? (
          <div className={`grid grid-cols-4 gap-3.5 ${rot ? "px-4 py-5" : "px-4 py-9"}`}>
            {APPS.map(([name, glyph], k) => (
              <button
                key={name}
                type="button"
                onClick={() => open(name)}
                aria-label={`Open ${name}`}
                className="flex flex-col items-center gap-1 rounded-[11px] p-0 text-[#F3F2EE]"
              >
                <span
                  aria-hidden
                  className={`grid h-11 w-11 place-items-center rounded-[11px] text-lg ${
                    k === 7 ? "bg-[#FF6B2B] text-[#120700]" : "bg-[#26262A] text-[#F3F2EE]"
                  }`}
                >
                  {glyph}
                </span>
                <span className="text-[9px]">{name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={`box-border flex h-full flex-col gap-2.5 px-4 ${rot ? "py-4" : "py-9"}`}>
            <span className="text-xl font-bold">{app}</span>
            <span className="h-2.5 shrink-0 bg-[#26262A]" />
            <span className="h-2.5 w-[70%] shrink-0 bg-[#26262A]" />
            <span className={`shrink-0 bg-[#1A1A1D] ${rot ? "h-6" : "h-[90px]"}`} />
            <span className="h-2.5 w-1/2 shrink-0 bg-[#26262A]" />
            <span className="mt-auto font-mono text-[10px] text-[#A3A3A8]">rendered on a Mac, tapped from {OS[os]}</span>
          </div>
        )}
      </div>
    </div>
  );
}
