"use client";

/**
 * Handwriting → text, as a first-class part of the page toolbar (not behind the AI menu):
 *   PageTextControls   before a page is typed up: a "Turn into text" button; after: an Ink / Text toggle, plus an
 *                      update button when the handwriting changed since. The cost shows on hover, keyboard focus or
 *                      a long press (a tap converts).
 *   ConvertNudge       the idle "Turn into text?" chip PageEditor shows after the learner writes and pauses. It only
 *                      suggests: nothing goes to the AI until it is tapped.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PenLine, RotateCw, ScanText, Type, X } from "lucide-react";
import { Dots } from "@/components/learn/chat/ChatLive";
import type { PageAi } from "./usePageAi";

export type PageMode = "ink" | "text";

/** A long press (touch or pen) shows the tip instead of pressing the button; the click that follows is swallowed. */
function useLongPress(onLong: () => void, ms = 450) {
  const timer = useRef(0);
  const fired = useRef(false);
  const clear = () => window.clearTimeout(timer.current);
  useEffect(() => clear, []);
  return {
    /** true once: the click after a long press */
    swallow: () => {
      const f = fired.current;
      fired.current = false;
      return f;
    },
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse") return;
        fired.current = false;
        clear();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          onLong();
        }, ms);
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      // no callout or text selection on a long press (iPad)
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}

/** The tip under a toolbar control: hover (a real pointer), keyboard focus, or `open` (a long press). */
function Tip({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <span
      id={id}
      role="tooltip"
      className={`pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-max max-w-[260px] border border-line-strong bg-fg px-2.5 py-1.5 text-left font-mono text-[11.5px] leading-snug text-bg shadow-lg ${open ? "block" : "hidden [@media(hover:hover)]:group-hover:block group-has-[:focus-visible]:block"}`}
    >
      {children}
    </span>
  );
}

function useTip() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), 2400);
    return () => window.clearTimeout(t);
  }, [open]);
  const lp = useLongPress(() => setOpen(true));
  return { open, lp };
}

/** "about 1 credit · 46 left today", or why it can't run. */
function costLine(ai: PageAi): string {
  if (ai.blocked) return ai.blocked;
  if (!ai.hasContent) return "Write something on the page first.";
  const left = !ai.status?.ownKey && ai.status?.creditsLeft != null ? ` · ${ai.status.creditsLeft} left today` : "";
  return `Uses ${ai.cost("convert")}${left}`;
}

export function PageTextControls({ ai, mode, onMode, onConvert }: { ai: PageAi; mode: PageMode; onMode: (m: PageMode) => void; onConvert: () => void }) {
  const tipId = useId();
  const tip = useTip();
  const upTip = useTip();
  const converting = ai.busy === "convert";
  const off = !!ai.busy || !ai.hasContent || !!ai.blocked;
  const press = (lp: ReturnType<typeof useTip>["lp"]) => {
    if (lp.swallow() || off) return;
    onConvert();
  };

  if (!ai.typed)
    return (
      <span className="group relative inline-flex shrink-0">
        <button
          type="button"
          onClick={() => press(tip.lp)}
          {...tip.lp.handlers}
          aria-disabled={off || undefined}
          aria-busy={converting || undefined}
          aria-describedby={tipId}
          data-ink-convert
          className={`inline-flex min-h-11 select-none items-center gap-2 px-3 text-[14px] font-semibold [-webkit-touch-callout:none] [touch-action:manipulation] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
            converting ? "border border-signal bg-bg text-fg" : off ? "border border-line-strong bg-bg text-fg-3" : "bg-signal text-on-signal hover:brightness-110"
          }`}
        >
          {converting ? <Dots /> : <ScanText className="h-[18px] w-[18px]" aria-hidden />}
          <span>{converting ? (ai.secs >= 6 ? `Reading… ${ai.secs}s` : "Reading…") : "Turn into text"}</span>
        </button>
        <Tip id={tipId} open={tip.open}>
          {converting ? ai.step || "Reading your handwriting…" : costLine(ai)}
        </Tip>
      </span>
    );

  const seg = (on: boolean) =>
    `inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2.5 text-[13.5px] font-semibold [touch-action:manipulation] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-signal ${
      on ? "bg-fg text-bg" : "bg-bg text-fg-2 hover:text-fg"
    }`;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span role="group" aria-label="Show this page as" className="flex border border-line-strong">
        <button type="button" aria-pressed={mode === "ink"} onClick={() => onMode("ink")} className={seg(mode === "ink")}>
          <PenLine className="h-4 w-4" aria-hidden /> Ink
        </button>
        <button
          type="button"
          aria-pressed={mode === "text"}
          onClick={() => onMode("text")}
          aria-label={ai.stale ? "Text (out of date: the handwriting changed)" : undefined}
          className={`${seg(mode === "text")} relative border-l border-line-strong`}
        >
          <Type className="h-4 w-4" aria-hidden /> Text
          {ai.stale && <span aria-hidden className="absolute right-1 top-1 h-2 w-2 bg-signal" />}
        </button>
      </span>
      {(ai.stale || converting) && (
        <span className="group relative inline-flex">
          <button
            type="button"
            onClick={() => press(upTip.lp)}
            {...upTip.lp.handlers}
            aria-disabled={off || undefined}
            aria-busy={converting || undefined}
            aria-label={converting ? "Updating the text" : "Update the text: the handwriting changed"}
            aria-describedby={`${tipId}-u`}
            className={`grid min-h-11 min-w-11 select-none place-items-center border [-webkit-touch-callout:none] [touch-action:manipulation] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${off && !converting ? "border-line-strong text-fg-3" : "border-signal text-signal-text hover:bg-surface-2"}`}
          >
            {converting ? <Dots /> : <RotateCw className="h-[18px] w-[18px]" aria-hidden />}
          </button>
          <Tip id={`${tipId}-u`} open={upTip.open}>
            {converting ? ai.step || "Reading your handwriting…" : `Handwriting changed · update the text. ${costLine(ai)}`}
          </Tip>
        </span>
      )}
    </span>
  );
}

/** The idle suggestion, floated over the page under the toolbar. Pointer events never reach the canvas. */
export function ConvertNudge({ update, ownKey, onConvert, onDismiss }: { update: boolean; ownKey: boolean; onConvert: () => void; onDismiss: () => void }) {
  return (
    <div
      data-ink-ui
      data-ink-nudge
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute right-2 top-2 z-20 flex max-w-[calc(100%-1rem)] animate-hk-in items-stretch border border-line-strong bg-surface shadow-[0_8px_28px_rgba(0,0,0,0.18)] sm:right-3 sm:top-3"
    >
      <button type="button" onClick={onConvert} className="flex min-h-11 min-w-0 items-center gap-2 py-1 pl-3 pr-3 text-left text-[14px] font-semibold text-fg [touch-action:manipulation] hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-signal">
        <ScanText className="h-[18px] w-[18px] shrink-0 text-signal-text" aria-hidden />
        <span className="min-w-0">{update ? "Update the text?" : "Turn into text?"}</span>
        <span className="shrink-0 font-mono text-[11px] font-normal text-fg-4">{ownKey ? "own key" : "~1 credit"}</span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss: don't suggest this again on this page"
        title="Not now"
        className="grid w-11 shrink-0 place-items-center border-l border-line text-fg-3 [touch-action:manipulation] hover:bg-surface-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-signal"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
