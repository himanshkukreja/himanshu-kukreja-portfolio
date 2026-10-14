"use client";

import { useState } from "react";
import { PRIMARY_BTN, type DemoProps } from "../useTicker";

const NODES: [string, string, string][] = [
  ["YOUR DESK", "Pixel 8 · USB", "Plug the phone into the office machine."],
  ["TUNNEL", "bridgelink agent", "Secure tunnel through NativeBridge."],
  ["ANYWHERE", "remote laptop", "adb sees the phone as if it were local."],
];

const LOG = [
  "$ bridgelink up --device usb",
  "✓ Pixel 8 detected · tunnel open · share code BL-7Q2X",
  "$ adb connect bl-7q2x.bridgelink:5555   # on the remote laptop  → connected",
];

const BTNS = ["plug in the phone", "open the tunnel", "connect from home", "cleared ✓"];

export default function BridgeLinkDemo({ clear }: DemoProps) {
  const [step, setStep] = useState(0);

  const next = () => {
    const n = step + 1;
    setStep(n);
    if (n === 3) clear("Remote phone connected");
  };

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] items-stretch gap-2.5">
        {NODES.map(([where, title, body], k) => {
          const up = step > k;
          return (
            <div
              key={where}
              className={`flex min-h-[150px] flex-col gap-2 p-4 ${up ? "border border-signal bg-surface" : "border border-dashed border-line-strong"}`}
            >
              <span className="font-mono text-[11px] tracking-label text-fg-3">{where}</span>
              <span className="text-base font-semibold">{title}</span>
              <span className="text-[13px] leading-[1.45] text-fg-2">{body}</span>
              <span className={`mt-auto font-mono text-xs ${up ? "text-ok" : "text-fg-4"}`}>{up ? "ONLINE" : "WAITING"}</span>
            </div>
          );
        })}
      </div>
      <div
        className="min-h-[90px] overflow-x-auto border border-line bg-raised p-3 font-mono text-[13px] leading-[1.8] text-fg-2"
        aria-live="polite"
      >
        {LOG.slice(0, step).map((l) => (
          <div key={l} className="whitespace-pre-wrap">
            {l}
          </div>
        ))}
      </div>
      <button type="button" onClick={next} disabled={step >= 3} className={PRIMARY_BTN}>
        {BTNS[Math.min(step, 3)]}
      </button>
    </>
  );
}
