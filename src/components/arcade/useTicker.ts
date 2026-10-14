"use client";

import { useCallback, useEffect, useRef } from "react";

/** One interval per demo; replaced on start, cleared on stop and on unmount. */
export function useTicker() {
  const ref = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (ref.current !== null) {
      window.clearInterval(ref.current);
      ref.current = null;
    }
  }, []);
  const start = useCallback(
    (fn: () => void, ms: number) => {
      stop();
      ref.current = window.setInterval(fn, ms);
    },
    [stop]
  );
  useEffect(() => stop, [stop]);
  return { start, stop };
}

export type DemoProps = {
  /** Mark the cartridge cleared (awards the arcade quest once). */
  clear: (label: string) => void;
};

export const PRIMARY_BTN =
  "min-h-12 self-start px-5 bg-signal text-on-signal font-mono text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45";
export const DEMO_LABEL = "font-mono text-[11px] tracking-label text-fg-3";
