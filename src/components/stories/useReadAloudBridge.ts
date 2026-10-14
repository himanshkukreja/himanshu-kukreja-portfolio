"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export type ReadAloudState = "unsupported" | "idle" | "playing" | "paused";

// ReadAloud (shared with /learn) has no controlled API, so the reader's toolbar button
// drives its own floating controls by their titles and mirrors their state.
const SEL = {
  start: 'button[title="Start Reading"]',
  pause: 'button[title="Pause"]',
  resume: 'button[title="Resume"]',
  restore: 'button[title="Show Read Aloud"]',
};

function readState(root: HTMLElement | null): ReadAloudState {
  if (!root || !root.querySelector("button")) return "unsupported";
  if (root.querySelector(SEL.pause)) return "playing";
  if (root.querySelector(SEL.resume)) return "paused";
  return "idle";
}

export function useReadAloudBridge(dockRef: RefObject<HTMLDivElement | null>) {
  const [state, setState] = useState<ReadAloudState>("unsupported");

  useEffect(() => {
    const root = dockRef.current;
    if (!root) return;
    const sync = () => setState(readState(root));
    const mo = new MutationObserver(sync);
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["title"] });
    const id = window.requestAnimationFrame(sync);
    return () => {
      mo.disconnect();
      window.cancelAnimationFrame(id);
    };
  }, [dockRef]);

  const toggle = useCallback(() => {
    const root = dockRef.current;
    if (!root) return;
    const click = (sel: string) => {
      const b = root.querySelector<HTMLButtonElement>(sel);
      if (b) b.click();
      return !!b;
    };
    if (click(SEL.pause) || click(SEL.resume) || click(SEL.start)) return;
    // Minimised: restore the controls, then start once they have rendered.
    if (click(SEL.restore)) window.setTimeout(() => click(SEL.start), 50);
  }, [dockRef]);

  return { state, toggle };
}
