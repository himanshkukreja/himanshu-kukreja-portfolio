"use client";

/**
 * The chat's input: a growing text box and one action, Ask (send to the tutor). Typing feeds the instant
 * matches (the page shows them as you type, no button needed); Enter asks, Shift+Enter is a new line. When the
 * learner can't ask (signed out), the page decides what Ask does (it shows the instant matches and a sign-in line).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import VoiceInput from "./VoiceInput";

export type ComposerHandle = { focus: () => void };

type Props = {
  value: string;
  onChange: (v: string) => void;
  onAsk: () => void;
  onStop?: () => void;
  busy: boolean;
  canAsk: boolean;
  placeholder?: string;
  hint?: React.ReactNode;
  id?: string;
  autoFocus?: boolean;
  compact?: boolean;
  /** the box gained or lost focus (the page shows instant matches while it has it) */
  onFocusChange?: (focused: boolean) => void;
};

const ChatComposer = forwardRef<ComposerHandle, Props>(function ChatComposer({ value, onChange, onAsk, onStop, busy, canAsk, placeholder, hint, id = "chat-input", autoFocus, compact, onFocusChange }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  // speech: the transcript of this listening session goes after whatever was typed before it started
  const before = useRef<string | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }), []);
  // grow with the text, up to about six lines
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 140 : 180)}px`;
  }, [value, compact]);
  const submit = () => {
    if (!value.trim()) return ta.current?.focus();
    onAsk();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-end gap-2 border border-line-strong bg-surface p-1.5 focus-within:border-fg-3 focus-within:shadow-[inset_0_-2px_0_var(--c-signal)]">
        <label htmlFor={id} className="sr-only">
          Ask the course, or search it
        </label>
        <textarea
          id={id}
          ref={ta}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy) submit();
            }
          }}
          rows={1}
          autoFocus={autoFocus}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          enterKeyHint={canAsk ? "send" : "search"}
          placeholder={placeholder ?? "Ask the course anything…"}
          className={`min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2.5 text-fg outline-none placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:text-fg-4 focus:outline-none focus-visible:outline-none focus-visible:shadow-none ${compact ? "text-[16px] lg:text-[15px]" : "text-[16px] sm:text-[17px]"}`}
        />
        <VoiceInput
          disabled={busy}
          onTranscript={(t, final) => {
            if (before.current === null) before.current = value ? `${value.trimEnd()} ` : "";
            onChange(`${before.current}${t}`.slice(0, 2000));
            if (final) {
              before.current = null;
              ta.current?.focus();
            }
          }}
        />
        {busy && onStop ? (
          <button type="button" onClick={onStop} aria-label="Stop the answer" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-fg hover:border-fg-3">
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
          </button>
        ) : (
          <button type="submit" disabled={busy || !value.trim()} aria-label="Ask" className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 bg-signal px-3.5 font-semibold text-on-signal disabled:opacity-50">
            <ArrowUp className="h-4 w-4" aria-hidden />
            <span className={compact ? "sr-only" : "hidden sm:inline"}>Ask</span>
          </button>
        )}
      </div>
      {hint && <div className="px-0.5 text-[12px] leading-snug text-fg-4">{hint}</div>}
    </form>
  );
});

export default ChatComposer;
