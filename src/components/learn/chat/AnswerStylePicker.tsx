"use client";

/**
 * The answer-style switch beside the chat's box: one small button showing the style ("style Tutor") that opens the
 * site's own list of styles, each with its one-line hint, the current one ticked. Keyboard: Enter / Space / arrows
 * open it, arrows move, Enter picks, Escape or a click outside closes. It opens upward when there's no room below
 * (the composer sits at the bottom of the screen). The pick is remembered (useAnswerStyle).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { ANSWER_STYLES, type AnswerStyle } from "@/lib/ai/answerStyle";
import { useAnswerStyle } from "./useAnswerStyle";

export default function AnswerStylePicker({ from = "chat", className = "" }: { from?: string; className?: string }) {
  const [style, setStyle] = useAnswerStyle();
  const cur = ANSWER_STYLES.find((s) => s.id === style) ?? ANSWER_STYLES[0];
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(true);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const show = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    // about 5 rows of two lines: open upward unless there's clearly more room below
    if (r) setUp(window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom);
    setActive(Math.max(0, ANSWER_STYLES.findIndex((s) => s.id === style)));
    setOpen(true);
  }, [style]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  const pick = (s: AnswerStyle) => {
    setStyle(s, from);
    close();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  const onListKey = (e: React.KeyboardEvent) => {
    const n = ANSWER_STYLES.length;
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % n);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + n) % n);
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Enter" || e.key === " ") pick(ANSWER_STYLES[active].id);
    else if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") close(false);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={root} className={`relative inline-flex shrink-0 ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`Answer style: ${cur.label}`}
        title={`Answer style: ${cur.hint}. Remembered for your next questions.`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
        className={`inline-flex min-h-8 items-center gap-1.5 border px-2 font-mono text-[11.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal [@media(pointer:coarse)]:min-h-10 ${
          open ? "border-signal bg-surface-2 text-fg-2" : style === "tutor" ? "border-line-strong text-fg-3 hover:border-fg-3" : "border-signal text-fg-2 hover:bg-surface-2"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-signal-text" aria-hidden />
        <span aria-hidden>style</span>
        <span aria-hidden className="font-semibold text-fg">
          {cur.label}
        </span>
        <ChevronDown className={`h-3 w-3 text-fg-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label="Answer style"
          aria-activedescendant={`${id}-${ANSWER_STYLES[active].id}`}
          onKeyDown={onListKey}
          className={`absolute left-0 z-40 w-[min(290px,calc(100vw-32px))] border border-line-strong bg-surface p-1 shadow-[0_12px_32px_rgba(0,0,0,0.28)] outline-none ${up ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
        >
          <li aria-hidden className="px-2.5 pb-1.5 pt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-4">
            how the tutor answers
          </li>
          {ANSWER_STYLES.map((s, i) => {
            const selected = s.id === style;
            return (
              <li
                key={s.id}
                id={`${id}-${s.id}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(s.id)}
                className={`flex cursor-pointer items-start gap-2.5 border-l-2 px-2.5 py-2 ${i === active ? "bg-surface-2" : ""} ${selected ? "border-signal" : "border-transparent"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13.5px] leading-tight ${selected ? "font-semibold text-fg" : "text-fg-2"}`}>{s.label}</span>
                  <span className="mt-0.5 block font-mono text-[11px] leading-snug text-fg-4">{s.hint}</span>
                </span>
                {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-text" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
