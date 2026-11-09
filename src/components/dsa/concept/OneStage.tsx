"use client";

/**
 * The simple view's lesson: one stage at a time (the beginner pass, owner 9 Nov 2026). The lesson HTML stays one
 * server-rendered page; a small generated stylesheet hides every stage but the one in view (the short intro shows with
 * the first), so highlights, Listen, the progress engine and the widgets keep working on the same DOM. Hidden stages
 * have no height, so reading time only counts for the stage on screen.
 *
 * - Below the lesson: "← back" / "Step n of 6" / "Next: <stage> →"; the practice problems show after the last stage.
 * - Every jump in the reader (the stage bar, the contents, search hits, a #link) announces its target first
 *   (layout.ts announceJump): the stage holding it opens before the scroll measures anything.
 * - Listen moves through the lesson on its own: when the word it reads sits in a hidden stage, that stage opens.
 * - Edge cases (the Stretch beat) start folded behind "Show edge cases": worth it before interviews, fine to skip on a
 *   first read.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import { REVEAL_EVENT, scrollToId } from "@/components/learn/lesson/layout";
import type { DsaStage } from "@/lib/dsa/types";
import { BEAT_6S } from "@/lib/dsa/words";

const FOLDED = "stretch";
const safe = (id: string) => id.replace(/[^a-z0-9_-]/gi, "");

export default function OneStage({ rootRef, stages, end }: { rootRef: React.RefObject<HTMLElement | null>; stages: DsaStage[]; end: React.ReactNode }) {
  const p = useLessonProgress();
  const steps = useMemo(() => stages.filter((s) => s.id !== "intro"), [stages]);
  const [active, setActive] = useState(steps[0]?.id || "");
  const [folded, setFolded] = useState(true);
  const moved = useRef(false);

  const stageOf = useCallback(
    (el: Element | null): string | null => {
      const sec = el?.closest<HTMLElement>('section[data-sd="stage"]');
      if (!sec || !rootRef.current?.contains(sec)) return null;
      const id = sec.dataset.stageId || sec.id;
      return id === "intro" ? steps[0]?.id || null : id;
    },
    [rootRef, steps],
  );

  // open the stage a jump is headed for, before the jump measures the page
  useEffect(() => {
    const onReveal = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; el?: Element }>).detail || {};
      const el = d.el || (d.id ? document.getElementById(d.id) : null);
      const id = stageOf(el);
      if (!id) return;
      moved.current = true;
      const deep = !!el && !el.matches('section[data-sd="stage"]') && !el.closest("header");
      flushSync(() => {
        setActive(id);
        if (id === FOLDED && deep) setFolded(false);
      });
    };
    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(REVEAL_EVENT, onReveal);
  }, [stageOf]);

  // a #link on arrival
  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.slice(1));
    const id = h ? stageOf(document.getElementById(h)) : null;
    if (!id) return;
    moved.current = true;
    // the hash is only readable in the browser
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(id);
    if (id === FOLDED && h !== FOLDED) setFolded(false);
    requestAnimationFrame(() => scrollToId(h, "instant"));
  }, [stageOf]);

  // coming back: the stage they were reading
  useEffect(() => {
    if (!p.ready || moved.current) return;
    moved.current = true;
    const back = p.lastStage && steps.some((s) => s.id === p.lastStage) ? p.lastStage : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (back) setActive(back);
  }, [p.ready, p.lastStage, steps]);

  // Listen reads on through the lesson: open the stage of the line it reads
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        const t = r.target as HTMLElement;
        if (!t.classList?.contains("reading-highlight")) continue;
        const id = stageOf(t);
        if (!id) continue;
        setActive((cur) => {
          if (cur === id) return cur;
          requestAnimationFrame(() => t.scrollIntoView({ behavior: "smooth", block: "center" }));
          return id;
        });
        if (id === FOLDED) setFolded(false);
      }
    });
    mo.observe(root, { attributes: true, attributeFilter: ["class"], subtree: true });
    return () => mo.disconnect();
  }, [rootRef, stageOf]);

  const at = Math.max(0, steps.findIndex((s) => s.id === active));
  const cur = steps[at];
  const prev = steps[at - 1];
  const next = steps[at + 1];
  const go = (id: string) => {
    moved.current = true;
    flushSync(() => setActive(id));
    scrollToId(id);
  };

  const keep = `:not([data-stage-id="${safe(active)}"])${at === 0 ? ':not([data-stage-id="intro"])' : ""}`;
  const css =
    `[data-dsa-one] section[data-sd="stage"]${keep}{display:none!important}` +
    (folded && active === FOLDED ? `[data-dsa-one] section[data-sd="stage"][data-stage-id="${FOLDED}"]>:not(header){display:none!important}` : "");

  return (
    <>
      <style>{css}</style>
      {folded && active === FOLDED ? (
        <div className="mt-2 flex flex-col gap-3 border border-dashed border-line-strong bg-surface-2 p-4 sm:p-5">
          <p className="m-0 text-[15px] leading-relaxed text-fg">
            The tricky inputs, the common mistakes and a few interview variations. Worth reading before interviews; fine to skip on a first read.
          </p>
          <button
            type="button"
            onClick={() => setFolded(false)}
            className="inline-flex min-h-11 items-center self-start border-2 border-signal px-4 text-[15px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)]"
          >
            Show edge cases
          </button>
        </div>
      ) : null}
      <nav aria-label="Lesson steps" className="mt-10 flex flex-col gap-3 border-t border-line pt-6">
        <span className="font-mono text-[12px] text-fg-3" aria-live="polite">
          Step {at + 1} of {steps.length} · {cur?.label}
          {cur && BEAT_6S[cur.id] ? <span className="text-fg-4"> ({BEAT_6S[cur.id]})</span> : null}
        </span>
        <div className="flex flex-wrap items-center gap-2.5">
          {prev ? (
            <button type="button" onClick={() => go(prev.id)} className="inline-flex min-h-12 items-center gap-2 border border-line-strong px-4 text-[15px] text-fg hover:border-fg">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span className="sr-only">Back to </span>
              {prev.label}
            </button>
          ) : null}
          {next ? (
            <button type="button" onClick={() => go(next.id)} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 bg-signal px-5 text-[16px] font-semibold text-on-signal hover:opacity-90 sm:flex-none">
              Next: {next.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </nav>
      {next ? null : end}
    </>
  );
}
