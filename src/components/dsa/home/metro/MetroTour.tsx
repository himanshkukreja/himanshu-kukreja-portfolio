"use client";

/**
 * The first-visit guided tour: four coach marks that point at the real elements of the map (found by data-tour). Skip, Back,
 * Next and Done; Escape skips; focus stays inside the card while it is open and returns where it was; shown once (the caller
 * remembers it) and reopened any time from "How this map works". A step whose element is not on screen (the phone strip has
 * no lines legend on top, say) is left out.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BTN_PRIMARY } from "../../ui/kit";
import "./metro.css";

type Step = { key: string; title: string; body: string };
const STEPS: Step[] = [
  { key: "lines", title: "Lines are parts", body: "Each coloured line is one part of the course." },
  { key: "station", title: "Stations are topics", body: "Stations are topics. Tap one to see its lessons." },
  { key: "route", title: "Your route", body: "Your route is the bright line. Just follow Next stop." },
  { key: "toggle", title: "A list instead", body: "Prefer a list? Switch here." },
];

const target = (key: string): HTMLElement | null => {
  const el = document.querySelector<HTMLElement>(`[data-tour="${key}"]`);
  return el && el.getClientRects().length ? el : null;
};

export default function MetroTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the page's elements (an external system) when the tour opens
    setSteps(STEPS.filter((s) => target(s.key)));
    setI(0);
    return () => back.current?.focus?.();
  }, [open]);

  const step = steps[i];
  const measure = useCallback(() => {
    const el = step ? target(step.key) : null;
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = target(step.key);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: "center", behavior: "auto" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measures the target's box after layout
    measure();
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  // focus lands on the primary button of each step
  useEffect(() => {
    if (open && step) card.current?.querySelector<HTMLElement>("[data-primary]")?.focus();
  }, [open, step]);

  if (!open || !step) return null;
  const last = i === steps.length - 1;
  const pad = 8;
  const W = Math.min(340, window.innerWidth - 24);
  const spot = box ? { top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 } : null;
  let top = 80;
  let left = Math.max(12, (window.innerWidth - W) / 2);
  if (spot) {
    const below = spot.top + spot.height + 14;
    const fitsBelow = below + 190 < window.innerHeight;
    top = fitsBelow ? below : Math.max(12, spot.top - 14 - 180);
    left = Math.min(Math.max(12, spot.left + spot.width / 2 - W / 2), window.innerWidth - W - 12);
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      const nodes = Array.from(card.current?.querySelectorAll<HTMLElement>("button") ?? []);
      if (!nodes.length) return;
      const a = document.activeElement;
      if (e.shiftKey && a === nodes[0]) {
        e.preventDefault();
        nodes[nodes.length - 1].focus();
      } else if (!e.shiftKey && a === nodes[nodes.length - 1]) {
        e.preventDefault();
        nodes[0].focus();
      } else if (!card.current?.contains(a)) {
        e.preventDefault();
        nodes[0].focus();
      }
    } else if (e.key === "ArrowRight" && !last) setI(i + 1);
    else if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90]" onKeyDown={onKey}>
      <div aria-hidden className="absolute inset-0" />
      {spot ? <div aria-hidden className="metro-spot pointer-events-none fixed rounded-2xl" style={spot} /> : <div aria-hidden className="absolute inset-0 bg-fg/50" />}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metro-tour-h"
        aria-describedby="metro-tour-b"
        className="fixed flex flex-col gap-2.5 rounded-2xl border border-line-strong bg-surface p-4 text-fg shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
        style={{ top, left, width: W }}
      >
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">
          How this map works · {i + 1} of {steps.length}
        </p>
        <h2 id="metro-tour-h" className="m-0 font-display text-[19px] font-extrabold tracking-[-0.01em]">
          {step.title}
        </h2>
        <p id="metro-tour-b" className="m-0 text-[14.5px] leading-snug text-fg-2">
          {step.body}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-[10px] px-2 text-[13.5px] font-medium text-fg-3 underline underline-offset-4 hover:text-fg">
            Skip
          </button>
          <span className="flex-1" />
          {i > 0 ? (
            <button type="button" onClick={() => setI(i - 1)} className="min-h-10 rounded-[10px] border border-line-strong px-3.5 text-[13.5px] font-medium text-fg hover:bg-surface-2">
              Back
            </button>
          ) : null}
          <button type="button" data-primary onClick={() => (last ? onClose() : setI(i + 1))} className={`${BTN_PRIMARY} min-h-10 rounded-[10px] px-4 text-[13.5px]`}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
