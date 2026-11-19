"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Sparkles, X } from "lucide-react";
import { useSignInGate } from "@/components/gate/SignInGate";
import { instantRank, type Progress } from "@/lib/dsa/search/rank";
import { exampleWindow, EXAMPLES, isQuestion } from "@/lib/dsa/search/ask";
import { whyText, type Hit, type SearchIndex } from "@/lib/dsa/search/engine";

/** the title with the matched words picked out (tokens only: no raw colours) */
export function Marked({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (!ranges.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a < at) return;
    if (a > at) out.push(text.slice(at, a));
    out.push(
      <mark key={i} className="bg-transparent font-semibold text-signal-text underline decoration-signal decoration-2 underline-offset-2">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

const LEVEL: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const MAX = 8;

/**
 * The Practice tab's one search box, as a combobox: type and the best problems appear under it at once (title, topic, tag,
 * typo-tolerant, synonyms like dp or ll, filter words like easy or unsolved); Enter on one opens it. With nothing chosen,
 * Enter (or "Ask smart search") sends a sentence to the smart layer, which fills the interpreted chips on the page.
 */
export default function SmartSearchBox({
  value,
  onChange,
  index,
  onFocusIndex,
  progress,
  signedIn,
  authLoading,
  busy,
  message,
  onAsk,
  onClear,
  smartOn,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  /** null until the first focus or keystroke builds it */
  index: SearchIndex | null;
  onFocusIndex: () => void;
  progress: Progress;
  signedIn: boolean;
  authLoading: boolean;
  busy: boolean;
  message: string;
  onAsk: (q: string) => void;
  onClear: () => void;
  /** the page is showing a smart answer for this text */
  smartOn: boolean;
  placeholder: string;
}) {
  const router = useRouter();
  const { ask: askSignIn } = useSignInGate("dsa-practice");
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // the examples under the box: three at a time, one step every 7 s while the box is idle (first paint is the same for everyone)
  const [from, setFrom] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => {
    if (still || value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setFrom((f) => (f + 1) % EXAMPLES.length), 7000);
    return () => clearInterval(t);
  }, [still, value]);
  // on this page the box is the search: ⌘K / Ctrl K and "/" jump into it
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName || "") || (e.target as HTMLElement)?.isContentEditable;
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onFocusIndex();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onFocusIndex]);

  const q = value.trim();
  const hits = useMemo<Hit[]>(() => (index && q ? instantRank(index, q, progress, MAX).hits : []), [index, q, progress]);
  // the extra row: ask the smart layer (signed in), shown for anything long enough to be a question
  const canAsk = signedIn && q.length >= 3;
  const askAt = hits.length; // its option index
  const count = hits.length + (canAsk ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const go = (h: Hit) => {
    setOpen(false);
    router.push(`/dsa/problems/${h.item.id}`);
  };
  const submit = () => {
    setOpen(false);
    if (canAsk) onAsk(q);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (count) setActive((a) => (a + 1) % count);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (count) setActive((a) => (a <= 0 ? count - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && active < hits.length) go(hits[active]);
      else submit();
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (value) {
        onChange("");
        onClear();
      }
    } else if (e.key === "Tab") setOpen(false);
  };

  const showList = open && q.length > 0;
  const live = !q ? "" : busy ? "Asking smart search" : hits.length ? `${hits.length} quick result${hits.length === 1 ? "" : "s"}${canAsk ? ", or ask smart search" : ""}` : "No quick results";

  return (
    <div ref={wrap} role="search" className="relative min-w-0 flex-1 basis-full">
      <div className="relative bg-[linear-gradient(115deg,var(--c-signal),var(--c-line-strong)_45%,var(--c-signal))] p-[1.5px] shadow-[0_0_0_0_transparent] transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--c-signal)_16%,transparent)] hover:shadow-[0_0_0_4px_color-mix(in_srgb,var(--c-signal)_10%,transparent)] rounded-[16px]">
        <div className="relative bg-surface rounded-[14.5px]">
          <label htmlFor={`${uid}-in`} className="sr-only">
            Ask or search: problem names, topics, tags, or a question like “what’s the difference between BFS and DFS?”
          </label>
          <Sparkles className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-signal-text" aria-hidden />
          <input
            ref={input}
            id={`${uid}-in`}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${uid}-o${active}` : undefined}
            value={value}
            onChange={(e) => {
              onFocusIndex();
              onChange(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => {
              onFocusIndex();
              setOpen(true);
            }}
            onKeyDown={onKey}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-14 w-full truncate bg-transparent pl-12 pr-14 text-[16px] text-fg placeholder:text-fg-3 focus-visible:outline-none sm:pr-20 rounded-[14.5px]"
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onChange("");
                onClear();
                input.current?.focus();
              }}
              className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center text-fg-3 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text rounded-[10px]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <kbd aria-hidden className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-fg-3 sm:inline">
              ⌘K
            </kbd>
          )}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>

      {showList ? (
        <div className="absolute left-0 right-0 top-[60px] z-30 overflow-hidden border sm:right-auto sm:w-[560px] sm:max-w-[calc(100vw-3rem)] border-line-strong bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.18)] rounded-[14px]">
          <ul id={listId} role="listbox" aria-label="Quick results" className="m-0 max-h-[min(48vh,420px)] list-none overflow-y-auto p-1">
            {hits.map((h, i) => {
              const why = whyText(h);
              return (
                <li
                  key={h.item.id}
                  id={`${uid}-o${i}`}
                  role="option"
                  aria-selected={active === i}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(h)}
                  className={`flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 px-3 py-2 rounded-[10px] ${active === i ? "bg-surface-2" : ""}`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[15px] leading-snug text-fg">
                      <Marked text={h.item.title} ranges={h.ranges} />
                    </span>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-label text-fg-3">{LEVEL[h.item.level]}</span>
                  </span>
                  {why ? <span className="truncate font-mono text-[12px] text-fg-3">{why}</span> : null}
                </li>
              );
            })}
            {!hits.length ? (
              <li role="presentation" className="px-3 py-3 text-[14px] text-fg-2">
                {index ? "No quick match." : "Searching…"}
                {canAsk ? " Ask smart search to read it as a sentence." : ""}
              </li>
            ) : null}
            {canAsk ? (
              <li
                id={`${uid}-o${askAt}`}
                role="option"
                aria-selected={active === askAt}
                onMouseEnter={() => setActive(askAt)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={submit}
                className={`mt-1 flex min-h-11 cursor-pointer items-center gap-2 border-t border-line px-3 py-2 text-[14px] font-medium text-fg ${active === askAt ? "bg-surface-2" : ""}`}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-signal-text" aria-hidden />
                <span className="min-w-0 truncate">Ask smart search: “{q}”</span>
                <span className="ml-auto hidden shrink-0 font-mono text-[11px] text-fg-3 sm:inline">Enter</span>
              </li>
            ) : null}
          </ul>
          {!signedIn && !authLoading ? (
            <p className="m-0 flex items-center gap-2 border-t border-line px-3 py-2.5 font-mono text-[12px] text-fg-3">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => askSignIn("smart-search")} className="text-left text-signal-text underline underline-offset-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text">
                Sign in for smart search
              </button>
              <span className="hidden sm:inline">· ask in a sentence</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {busy ? (
        <p className="m-0 mt-2 font-mono text-[12px] text-fg-3" aria-hidden>
          Reading your question…
        </p>
      ) : message && !smartOn && !isQuestion(value) ? (
        <p className="m-0 mt-2 font-mono text-[12px] text-fg-3">{message}</p>
      ) : null}

      {!value ? (
        <ul aria-label="Examples to try" onMouseEnter={() => setStill(true)} onMouseLeave={() => setStill(false)} onFocus={() => setStill(true)} onBlur={() => setStill(false)} className="m-0 mt-2.5 flex list-none flex-wrap gap-2 p-0">
          {exampleWindow(from).map((ex) => (
            <li key={ex} className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => {
                  onFocusIndex();
                  onChange(ex);
                  onAsk(ex);
                  setOpen(false);
                }}
                className="inline-flex min-h-10 max-w-full items-center gap-1.5 border border-line-strong bg-surface px-3 py-1.5 text-left text-[13.5px] leading-snug text-fg-2 transition-colors hover:border-signal hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text rounded-full"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-signal-text" aria-hidden />
                <span className="min-w-0">{ex}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
