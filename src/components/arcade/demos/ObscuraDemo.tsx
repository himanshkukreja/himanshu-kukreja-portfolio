"use client";

import { useRef, useState } from "react";
import { DEMO_LABEL, PRIMARY_BTN, type DemoProps, useTicker } from "../useTicker";

const SEGMENTS = 8;

export default function ObscuraDemo({ clear }: DemoProps) {
  const [ob, setOb] = useState(-1);
  const [denied, setDenied] = useState(false);
  const obRef = useRef(-1);
  const { start, stop } = useTicker();

  const done = ob >= SEGMENTS;
  const busy = ob >= 0 && !done;

  const encrypt = () => {
    obRef.current = 0;
    setOb(0);
    setDenied(false);
    start(() => {
      const n = obRef.current + 1;
      obRef.current = n;
      setOb(n);
      if (n >= SEGMENTS) stop();
    }, 300);
  };

  const steal = () => {
    setDenied(true);
    if (obRef.current >= SEGMENTS) clear("403 earned · video stayed private");
  };

  return (
    <div className="flex flex-wrap gap-4">
      <style>{`@keyframes arcade-scan{0%{background-position:0 0}100%{background-position:0 6px}}`}</style>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5">
        <span className={DEMO_LABEL}>lecture-07.mp4 → HLS</span>
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: SEGMENTS }, (_, k) => {
            const enc = ob >= k + 1;
            const now = ob === k;
            return (
              <span
                key={k}
                className={`grid min-h-10 place-items-center font-mono text-[11px] ${
                  enc
                    ? "bg-signal text-on-signal"
                    : now
                      ? "border border-signal text-signal-text"
                      : "border border-line-strong text-fg-3"
                }`}
              >
                {`seg_00${k}${enc ? " ·enc" : ""}`}
              </span>
            );
          })}
        </div>
        <button type="button" onClick={encrypt} disabled={busy} className={PRIMARY_BTN}>
          {done ? "encrypted ✓" : busy ? "segmenting…" : "upload + encrypt"}
        </button>
      </div>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5">
        <div
          className="grid aspect-video place-items-center border border-line bg-surface"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, rgba(128,128,128,0.06) 0 1px, transparent 1px 3px)",
            animation: "arcade-scan 0.4s linear infinite",
          }}
        >
          <span className="font-mono text-xs text-fg-2" aria-live="polite">
            {done ? "▶ streaming encrypted HLS · 1080p" : busy ? "transcoding with ffmpeg…" : "no video yet"}
          </span>
        </div>
        <button
          type="button"
          onClick={steal}
          className="min-h-11 border border-bad bg-transparent px-3.5 font-mono text-[13px] text-bad-text hover:bg-surface-2"
        >
          try: download the original
        </button>
        {denied && (
          <span role="alert" className="font-mono text-[13px] text-bad-text">
            403 Forbidden · originals never leave storage. Nice try.
          </span>
        )}
      </div>
    </div>
  );
}
