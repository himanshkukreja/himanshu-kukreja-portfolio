"use client";

import { Fragment, useRef, useState } from "react";
import { PRIMARY_BTN, type DemoProps, useTicker } from "../useTicker";

const NODES: [string, string][] = [
  ["BROWSER", "anyone"],
  ["EDGE", "your VPS"],
  ["AGENT", "waygate"],
  ["LOCAL", "localhost:3000"],
];

export default function WaygateDemo({ clear }: DemoProps) {
  const [on, setOn] = useState(false);
  const [reqs, setReqs] = useState(0);
  const reqsRef = useRef(0);
  const { start, stop } = useTicker();

  const toggle = () => {
    stop();
    if (on) {
      setOn(false);
      return;
    }
    setOn(true);
    start(() => {
      const r = reqsRef.current + 1 + Math.round(Math.random() * 3);
      reqsRef.current = r;
      setReqs(r);
      if (r >= 20) clear("localhost is on the internet");
    }, 400);
  };

  return (
    <>
      <div className="flex flex-wrap items-center" aria-label="Request path" role="group">
        {NODES.map(([kind, name], k) => (
          <Fragment key={kind}>
            {k > 0 && (
              <div aria-hidden className={`relative h-0.5 min-w-6 flex-[1_1_30px] ${on ? "bg-signal" : "bg-line"}`}>
                {on && (
                  <span
                    className="absolute -top-[3px] h-2 w-2 animate-hk-flow bg-fg"
                    style={{ animationDuration: `${0.7 + k * 0.15}s` }}
                  />
                )}
              </div>
            )}
            <div className={`flex min-w-[110px] flex-col gap-[3px] px-3.5 py-3 ${on ? "border border-signal bg-surface" : "border border-line-strong"}`}>
              <span className="font-mono text-[10px] tracking-label text-fg-3">{kind}</span>
              <span className="font-mono text-[13px] font-semibold">{name}</span>
            </div>
          </Fragment>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={toggle} aria-pressed={on} className={PRIMARY_BTN}>
          {on ? "waygate down" : "waygate up --port 3000"}
        </button>
        <span role="status" className={`break-all font-mono text-sm ${on ? "font-semibold text-signal-text" : "text-fg-4"}`}>
          {on ? "https://demo.your-domain.dev → localhost:3000" : "tunnel closed"}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-px border border-line bg-line">
        <div className="flex flex-col gap-0.5 bg-raised p-3">
          <span className="font-mono text-xl font-semibold tabular-nums">{reqs}</span>
          <span className="text-xs text-fg-3">requests proxied</span>
        </div>
        <div className="flex flex-col gap-0.5 bg-raised p-3">
          <span className="font-mono text-xl font-semibold">your infra</span>
          <span className="text-xs text-fg-3">no third-party relay</span>
        </div>
        <div className="flex flex-col gap-0.5 bg-raised p-3">
          <span className="font-mono text-xl font-semibold">Go</span>
          <span className="text-xs text-fg-3">single binary agent</span>
        </div>
      </div>
    </>
  );
}
