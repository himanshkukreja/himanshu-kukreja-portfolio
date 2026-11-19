"use client";

/**
 * The first-problem walkthrough (the beginner pass, owner 9 Nov 2026): the first time anyone opens a problem room,
 * three short steps point at the editor (your function), the examples (the tests) and Run / Submit. Dismissible at
 * every step (Skip, Escape); shown once per device (localStorage `dsa.guide.problem`).
 *
 * A ring is drawn over the target (fixed, pointer-events none) and the card sits beside it on desktop, at the bottom
 * of the screen on phones. The card is a non-modal dialog: focus moves to its button on every step and back to the
 * page when it closes. Both sit under the site header (z-50), so its menus (account, search) open over the tour.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/track";

const KEY = "dsa.guide.problem";

export type GuideTarget = () => HTMLElement | null;

function seen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "done";
  } catch {
    return true;
  }
}
const noop = () => () => {};

export default function FirstProblemGuide({ fn, toolbar, examples, run, avoid, onStep }: { fn: string; toolbar: GuideTarget; examples: GuideTarget; run: GuideTarget; /** the editor: the card never sits over it */ avoid?: GuideTarget; /** the page brings the step's pane into view (phones show one pane at a time) */ onStep?: (step: number) => void }) {
  const done = useSyncExternalStore(noop, seen, () => true);
  const [closed, setClosed] = useState(false);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<{ ring: DOMRect; card: { left: number; top: number } | null } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const open = !done && !closed;

  const steps = [
    { title: "Pick your language", body: `Choose Python, JavaScript, Java or C++; your code is kept for each. Write inside ${fn}: it receives the inputs from the problem and returns the answer.` },
    { title: "These are the examples", body: "Each example is a small test: this input should give this output. Try the first one by hand before you code." },
    { title: "Run, then Submit", body: "Run checks your code on the examples. Submit also runs hidden tests; when it says Accepted, the problem is solved." },
  ];
  const s = steps[step];
  // the targets are read when placing (the page's elements can be replaced): kept current without re-running effects
  const targets = useRef<GuideTarget[]>([toolbar, examples, run]);
  const avoidRef = useRef(avoid);
  const onStepRef = useRef(onStep);
  useEffect(() => {
    targets.current = [toolbar, examples, run];
    avoidRef.current = avoid;
    onStepRef.current = onStep;
  });

  const finish = useCallback(
    (how: "done" | "skip") => {
      try {
        window.localStorage.setItem(KEY, "done");
      } catch {
        /* storage blocked: closed for this page */
      }
      setClosed(true);
      track("dsa_problem_guide", { how, step: step + 1 });
    },
    [step],
  );

  const place = useCallback(() => {
    const el = targets.current[step]?.();
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    const desk = window.matchMedia("(min-width: 1024px)").matches;
    if (!desk) return setBox({ ring: r, card: null });
    const w = 320;
    const h = card.current?.offsetHeight || 170;
    const bad = avoidRef.current?.()?.getBoundingClientRect() ?? null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hits = (l: number, t: number) => !!bad && l < bad.right && l + w > bad.left && t < bad.bottom && t + h > bad.top;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
    // below, above, left of, then right of the target: the first spot that fits the screen and stays off the editor
    const spots = [
      { left: clamp(r.left, 12, vw - w - 12), top: r.bottom + 12 },
      { left: clamp(r.left, 12, vw - w - 12), top: r.top - h - 12 },
      { left: r.left - w - 12, top: clamp(r.top, 12, vh - h - 12) },
      { left: r.right + 12, top: clamp(r.top, 12, vh - h - 12) },
    ];
    const fits = (c: { left: number; top: number }) => c.left >= 12 && c.left + w <= vw - 12 && c.top >= 12 && c.top + h <= vh - 12 && !hits(c.left, c.top);
    const pick = spots.find(fits) ?? spots[0];
    const left = clamp(pick.left, 12, vw - w - 12);
    const top = clamp(pick.top, 12, vh - h - 12);
    setBox({ ring: r, card: { left, top } });
  }, [step]);

  useEffect(() => {
    if (!open) return;
    onStepRef.current?.(step);
    // after the page has shown the step's pane (phones show one at a time)
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = targets.current[step]?.();
        if (el && window.matchMedia("(min-width: 1024px)").matches) el.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior });
        else if (el) {
          // phones: the target just under the header, so the card at the bottom of the screen doesn't cover it
          const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hk-header-h")) || 61;
          window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - head - 12), behavior: "instant" as ScrollBehavior });
        }
        place();
      }),
    );
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish("skip");
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, step, place, finish]);

  useLayoutEffect(() => {
    if (open) btn.current?.focus({ preventScroll: true });
  }, [open, step]);

  if (!open) return null;
  const last = step === steps.length - 1;
  return (
    <>
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[45] border-2 border-signal shadow-[0_0_0_4px_var(--c-dsa-hl)]"
          style={{ left: box.ring.left - 4, top: box.ring.top - 4, width: box.ring.width + 8, height: box.ring.height + 8 }}
        />
      ) : null}
      <div
        ref={card}
        role="dialog"
        aria-labelledby="dsa-guide-h"
        aria-describedby="dsa-guide-b"
        className={`fixed z-[46] flex flex-col gap-2.5 border border-line-strong bg-surface p-4 shadow-lg ${box?.card ? "w-[320px]" : "bottom-[calc(76px+env(safe-area-inset-bottom))] left-3 right-3"}`}
        style={box?.card ? { left: box.card.left, top: box.card.top } : undefined}
      >
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">Your first problem · {step + 1} of 3</span>
        <h2 id="dsa-guide-h" className="m-0 font-display text-[19px] font-bold leading-tight text-fg">
          {s.title}
        </h2>
        <p id="dsa-guide-b" className="m-0 text-[14.5px] leading-snug text-fg-2">
          {s.body}
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <button type="button" onClick={() => finish("skip")} className="min-h-10 font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            Skip tour
          </button>
          <button
            ref={btn}
            type="button"
            onClick={() => (last ? finish("done") : setStep(step + 1))}
            className="inline-flex min-h-10 items-center bg-signal px-4 text-[14px] font-semibold text-on-signal hover:opacity-90"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
