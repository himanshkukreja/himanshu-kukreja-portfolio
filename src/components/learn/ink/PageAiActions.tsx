"use client";

/**
 * The AI menu on a notebook page, owned by the AI part; the page toolbar mounts it. A toolbar button ("AI") opens a
 * side panel (a bottom sheet on a phone) with the page's study actions, Haiku 5.5 on the learner's shared daily AI
 * credits:
 *   Check against lesson  the typed notes vs the page's lesson (only when the page has a lessonKey); types first
 *   Make review cards     3-8 question/answer cards from the typed notes, kept ones go to the review queue
 * Turning the handwriting into text is not in here: it is a first-class toolbar action with its own Ink / Text toggle
 * (ai/TextControls.tsx, ai/TypedPanel.tsx). All of them share one usePageAi per page, so a conversion running from
 * the toolbar shows here too.
 * Nothing leaves the page until a button is pressed (the small print says so). The panel is non-modal: the learner can
 * keep looking at the page; Esc or the close button returns focus to the toolbar button. Pointer events inside the
 * panel never reach the ink canvas.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers, ListChecks, Sparkles, Type, X } from "lucide-react";
import type { NotebookPage } from "@/lib/learn/ink/types";
import { Dots } from "@/components/learn/chat/ChatLive";
import CheckPanel from "./ai/CheckPanel";
import CardsPanel from "./ai/CardsPanel";
import NotesFinePrint from "./ai/NotesFinePrint";
import type { PageAi, PageAiAction } from "./ai/usePageAi";
import { isLessonKey } from "./global/context";

type Action = Exclude<PageAiAction, "convert">;

export default function PageAiActions(props: { page: NotebookPage; ai: PageAi; onShowText: () => void }) {
  const { page, ai } = props;
  const { status, busy, step, secs, result } = ai;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const error = ai.error && ai.error.action !== "convert" ? ai.error.text : "";

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const typed = ai.typed;
  const outOfCredits = !!status && !status.ownKey && status.creditsLeft !== null && status.creditsLeft <= 0;
  const run = (a: Action) => void ai.run(a);

  const actions: { id: Action; label: string; hint: string; icon: typeof ListChecks; show: boolean }[] = [
    { id: "check", label: "Check against lesson", hint: "what matches, what's off, what's missing", icon: ListChecks, show: isLessonKey(page.lessonKey) },
    { id: "cards", label: "Make review cards", hint: "3–8 cards for your review", icon: Layers, show: true },
  ];

  const body = () => {
    if (!status) return <p className="m-0 font-mono text-[12px] text-fg-4">Checking AI…</p>;
    if (!status.signedIn) return <p className="m-0 text-[14px] text-fg-2">Sign in to use AI on your pages.</p>;
    if (!status.features["notes-convert"])
      return (
        <p className="m-0 text-[14px] leading-relaxed text-fg-2">
          {status.mode === "red" ? "AI is resting for today: the day's share of the budget is used. It's back after midnight UTC." : "AI is switched off right now."} Your pages work as normal.
        </p>
      );
    const disabled = !!busy || !ai.hasContent || outOfCredits;
    return (
      <>
        <div className="flex flex-col gap-2">
          {actions
            .filter((a) => a.show)
            .map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={disabled}
                onClick={() => run(a.id)}
                aria-busy={busy === a.id}
                className="group flex min-h-12 w-full items-center gap-3 border border-line-strong bg-bg px-3 text-left hover:border-signal focus-visible:border-signal disabled:opacity-50 disabled:hover:border-line-strong [touch-action:manipulation] [@media(pointer:coarse)]:min-h-14"
              >
                <a.icon className="h-4 w-4 shrink-0 text-signal-text" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14.5px] font-semibold leading-snug text-fg">{a.label}</span>
                  <span className="text-[12px] leading-snug text-fg-3">{a.hint}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-fg-4">{ai.cost(a.id).replace(/^about /, "~")}</span>
              </button>
            ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!ai.hasContent ? <span className="text-[13px] text-fg-3">Write something on the page first.</span> : <span />}
          {status.ownKey ? (
            <span className="font-mono text-[11px] text-fg-4">answering with your own key</span>
          ) : (
            status.creditsLeft !== null && <span className="font-mono text-[11px] text-fg-4">{status.creditsLeft} credits left today</span>
          )}
        </div>
        {outOfCredits && !error && <p className="m-0 text-[14px] text-fg-2">{ai.blocked}</p>}
        {typed && ai.stale && !busy && (
          <p className="m-0 border-l-2 border-signal py-0.5 pl-3 text-[13.5px] leading-relaxed text-fg-2">Your handwriting changed since the page was typed up: these use the text as it is. Update it from the toolbar first to include the new lines.</p>
        )}
        {!typed && ai.hasContent && <p className="m-0 text-[13px] text-fg-3">Both turn the page into text first (it&apos;s kept on the page).</p>}
      </>
    );
  };

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-modal="false"
      aria-label="AI on this page"
      tabIndex={-1}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="hk-chat-in fixed inset-x-0 bottom-0 z-[80] flex max-h-[85dvh] flex-col border-t border-line-strong bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.25)] outline-none md:inset-x-auto md:bottom-auto md:right-4 md:top-20 md:max-h-[calc(100dvh-6rem)] md:w-[420px] md:border md:shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> ai on this page{status?.preview ? " · admin preview" : ""}
        </span>
        <button type="button" onClick={close} aria-label="Close" className="-mr-2 inline-flex h-10 w-10 items-center justify-center text-fg-3 hover:text-fg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {body()}
        {busy && (
          <div role="status" aria-live="polite" className="flex flex-col gap-1.5 border-l-2 border-signal py-0.5 pl-3">
            <span className="flex items-center gap-2.5">
              <Dots />
              <span className="hk-shimmer text-[13.5px] font-medium leading-snug">{step || "Working…"}</span>
            </span>
            {secs >= 6 && (
              <span className="text-[12.5px] text-fg-3">
                Still working · a full page takes a few seconds… <span className="font-mono text-fg-4">{secs}s</span>
              </span>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="m-0 border-l-2 border-bad py-0.5 pl-3 text-[14px] leading-relaxed text-fg-2">
            {error}
          </p>
        )}
        {result?.kind === "check" && <CheckPanel data={result.data} />}
        {result?.kind === "cards" && <CardsPanel key={result.cards.map((c) => c.q).join("|")} cards={result.cards} pageId={page.id} pageTitle={page.title} lessonKey={isLessonKey(page.lessonKey) ? page.lessonKey : null} />}
        {typed && (
          <button
            type="button"
            onClick={() => {
              props.onShowText();
              setOpen(false);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 self-start font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg"
          >
            <Type className="h-3.5 w-3.5" aria-hidden /> Show the page as text
          </button>
        )}
        <NotesFinePrint />
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="AI on this page"
        title="Check against the lesson, make review cards"
        className={`inline-flex min-h-11 items-center gap-1.5 border px-2.5 font-mono text-[12px] [touch-action:manipulation] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${open ? "border-signal text-fg" : "border-line-strong text-fg-2 hover:border-fg-3 hover:text-fg"}`}
      >
        <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />
        AI
        {busy && busy !== "convert" && <span aria-hidden className="h-1.5 w-1.5 animate-pulse bg-signal" />}
      </button>
      {open && createPortal(panel, document.body)}
    </>
  );
}
