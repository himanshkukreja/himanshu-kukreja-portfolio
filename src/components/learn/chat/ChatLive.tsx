"use client";

/**
 * The answer while it is being written, shared by /learn/chat and the Ask panel:
 * - Thinking: shows the moment a message is sent, in the reply's place. The step the server is on (one status line
 *   per tool call: "Searching the course for “cache stampede”…", "Reading “Caching patterns”…") cross-fades in, the
 *   finished steps make a short trail (✓ searched the course · ✓ read 3 lessons), what was looked up shows as small
 *   source chips, and after a few seconds a hint says it's still working, with Stop.
 * - useReveal: the typewriter buffer between the stream and the screen (lib/ai/chat/reveal.ts paces it). It only ever
 *   delays: what was shown never shrinks, and the whole text shows in the end.
 * - useFollow: keeps the newest text in view while the learner is at the bottom; scrolled up, a "new message" pill.
 * Reduced motion: static dots, no shimmer or fades, and the text shows as it arrives (no typewriter).
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ArrowDown, Check, Square } from "lucide-react";
import { paceStep, startPace, visibleText, type Pace } from "@/lib/ai/chat/reveal";
import { trailOf, type ChatSource } from "@/lib/ai/chat/text";
import SourceIcon from "./SourceIcon";
import { useMedia } from "./ui";
import type { LiveAnswer } from "./useCourseChat";

export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");

/* ------------------------------------------------------------------ the reveal */

// per reply id, so the reveal carries on when the streaming view hands over to the finished answer
const paces = new Map<string, Pace>();
const shownOf = new Map<string, string>();

/**
 * The part of `text` to show now. `animate`: this view is writing this answer (else the whole text shows);
 * `final`: the answer is done (what's left shows quickly). `revealing` is true until the whole text is shown.
 */
export function useReveal(id: string, text: string, animate: boolean, final: boolean): { text: string; revealing: boolean } {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const target = useRef(text);
  const done = useRef(final);
  useEffect(() => {
    target.current = text;
    done.current = final;
  });
  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const frame = (now: number) => {
      const p = paces.get(id) ?? startPace(0, now);
      const next = paceStep(p, target.current, now, done.current);
      paces.set(id, next);
      if (next.n !== p.n) tick();
      if (next.n < target.current.length) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [animate, id, text, final]);
  if (!animate) return { text, revealing: false };
  const n = paces.get(id)?.n ?? 0;
  let shown = visibleText(text, n, final);
  // never shorter than what was on screen a moment ago (the target only grows while streaming)
  const before = shownOf.get(id) ?? "";
  if (shown.length < before.length && text.startsWith(before)) shown = before;
  shownOf.set(id, shown);
  return { text: shown, revealing: !final || n < text.length };
}

/* ------------------------------------------------------------------ the thinking state */

/** A label that stays up at least `min` ms before the next one cross-fades in (fast steps don't flicker). */
function useSteppedLabel(target: string, min = 480) {
  const [s, set] = useState({ label: target, prev: "", key: 0, at: 0 });
  useEffect(() => {
    if (target === s.label) {
      // the outgoing label leaves the DOM once it has faded
      if (!s.prev) return;
      const id = window.setTimeout(() => set((x) => (x.key === s.key ? { ...x, prev: "" } : x)), 260);
      return () => window.clearTimeout(id);
    }
    const wait = Math.max(0, s.at + min - Date.now());
    const id = window.setTimeout(() => set((x) => ({ label: target, prev: x.label, key: x.key + 1, at: Date.now() })), wait);
    return () => window.clearTimeout(id);
  }, [target, s, min]);
  return s;
}

function useElapsed(since: number | undefined, on: boolean) {
  const [now, setNow] = useState(() => since ?? 0);
  useEffect(() => {
    if (!on || !since) return;
    const t = () => setNow(Date.now());
    const first = window.setTimeout(t, 0);
    const id = window.setInterval(t, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [on, since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

/** Three small squares in the signal colour (static with reduced motion). */
export function Dots() {
  return (
    <span aria-hidden className="hk-dots inline-flex shrink-0 items-center gap-[3px]">
      <span className="h-[5px] w-[5px] bg-signal" />
      <span className="h-[5px] w-[5px] bg-signal" />
      <span className="h-[5px] w-[5px] bg-signal" />
    </span>
  );
}

/** The finished steps of an answer, as one quiet line. */
export function Trail({ items, className = "" }: { items: string[]; className?: string }) {
  if (!items.length) return null;
  return (
    <p className={`m-0 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[11px] leading-snug text-fg-4 ${className}`}>
      <span className="sr-only">What the tutor did: </span>
      {items.map((t) => (
        <span key={t} className="inline-flex items-center gap-1">
          <Check className="h-3 w-3 text-ok" aria-hidden />
          {t}
        </span>
      ))}
    </p>
  );
}

const hintFor = (tool: string) =>
  tool === "build_path" || tool === "make_study_plan"
    ? "plans take a few seconds"
    : tool === "review_my_design"
      ? "design reviews take a little longer"
      : tool === "scorecard"
        ? "a whole interview takes a moment to score"
        : tool === "write"
          ? "longer answers arrive in one go"
          : "this one takes a few seconds";

/**
 * The thinking state. `compact`: one line under text already shown (a tool round after some of the answer).
 * Marked data-chat-transient: it is replaced by the answer by design (the QA shrink check leaves it out).
 */
export function Thinking({ live, label, sources, onStop, compact = false }: { live: LiveAnswer | null; label: string; sources: Record<string, ChatSource>; onStop?: () => void; compact?: boolean }) {
  const steps = live?.steps ?? [];
  const current = steps[steps.length - 1];
  const now = useSteppedLabel(current?.label || label || "Thinking…");
  const secs = useElapsed(live?.since, !!live);
  const done = trailOf(steps.slice(0, -1));
  const found = (live?.refs ?? []).map((r) => sources[r]).filter(Boolean);
  const line = (
    <span className="flex min-w-0 items-center gap-2.5">
      <Dots />
      <span className="grid min-w-0 flex-1 text-[13.5px] font-medium leading-snug">
        {now.prev && now.key > 0 && (
          <span key={`o${now.key}`} aria-hidden className="hk-step-out pointer-events-none truncate text-fg-3 [grid-area:1/1]">
            {now.prev}
          </span>
        )}
        <span key={`i${now.key}`} className={`hk-shimmer truncate [grid-area:1/1] ${now.key > 0 ? "hk-step-in" : ""}`}>
          {now.label}
        </span>
      </span>
    </span>
  );
  if (compact)
    return (
      <div data-chat-transient role="status" className="flex flex-col gap-1">
        {line}
      </div>
    );
  return (
    <div data-chat-transient className="hk-chat-in flex flex-col gap-2.5 border-l-2 border-signal py-0.5 pl-3">
      <div role="status" aria-live="polite">
        {line}
      </div>
      <Trail items={done} />
      {found.length > 0 && (
        <ul aria-label="Looked up so far" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {found.slice(0, 4).map((s) => (
            <li key={s.id} className="hk-chat-in inline-flex max-w-[min(260px,100%)] items-center gap-1.5 border border-line bg-surface px-2 py-1 font-mono text-[11px] text-fg-3">
              <SourceIcon kind={s.kind} className="h-3 w-3 shrink-0 text-signal-text" />
              <span className="truncate">{s.title}</span>
            </li>
          ))}
          {found.length > 4 && <li className="inline-flex items-center px-1 font-mono text-[11px] text-fg-4">+{found.length - 4} more</li>}
        </ul>
      )}
      {secs >= 6 && (
        <p className="hk-chat-in m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-3">
          <span>
            Still working · {hintFor(current?.tool ?? "")}… <span className="font-mono text-fg-4">{secs}s</span>
          </span>
          {onStop && (
            <button type="button" onClick={onStop} className="inline-flex min-h-8 items-center gap-1.5 border border-line-strong px-2 font-mono text-[11.5px] text-fg-2 hover:border-fg-3 hover:text-fg [@media(pointer:coarse)]:min-h-11">
              <Square className="h-2.5 w-2.5 fill-current" aria-hidden /> Stop
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ following the newest text */

const NEAR = 72;

/**
 * Keeps the end of the conversation in view while it grows, as long as the learner is at the bottom. When they
 * scroll up (a wheel, a touch, a key), it stops following and `unseen` turns on as new text arrives below; the
 * pill calls `toBottom`. `scroller`: the element that scrolls (`page`: the page scrolls instead). `content`: what grows.
 */
export function useFollow(scroller: React.RefObject<HTMLElement | null>, content: React.RefObject<HTMLElement | null>, page = false, key?: unknown) {
  const stuck = useRef(true);
  const intent = useRef(0);
  const [unseen, setUnseen] = useState(false);
  const reduced = useReducedMotion();
  const metrics = useCallback(() => {
    const el = page ? null : scroller.current;
    if (el) return { top: el.scrollTop, height: el.scrollHeight, view: el.clientHeight };
    const d = document.documentElement;
    return { top: window.scrollY, height: d.scrollHeight, view: window.innerHeight };
  }, [page, scroller]);
  const toBottom = useCallback(
    (smooth = true) => {
      stuck.current = true;
      intent.current = 0;
      setUnseen(false);
      const el = page ? null : scroller.current;
      const { height } = metrics();
      const behavior: ScrollBehavior = smooth && !reduced ? "smooth" : "auto";
      if (el) el.scrollTo({ top: height, behavior });
      else window.scrollTo({ top: height, behavior });
    },
    [metrics, page, reduced, scroller],
  );
  useEffect(() => {
    const target: HTMLElement | Window = (page ? null : scroller.current) ?? window;
    const user = () => (intent.current = Date.now());
    // a press on the scroll bar itself (not on a button in the thread)
    const press = (e: Event) => e.target === ((page ? null : scroller.current) ?? document.documentElement) && user();
    const onKey = (e: Event) => {
      if (["ArrowUp", "PageUp", "Home", " "].includes((e as KeyboardEvent).key)) user();
    };
    const onScroll = () => {
      const { top, height, view } = metrics();
      const near = height - (top + view) <= NEAR;
      if (near) {
        stuck.current = true;
        setUnseen(false);
      } else if (Date.now() - intent.current < 600) stuck.current = false;
    };
    target.addEventListener("wheel", user, { passive: true });
    target.addEventListener("touchmove", user, { passive: true });
    target.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("keydown", onKey);
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("wheel", user);
      target.removeEventListener("touchmove", user);
      target.removeEventListener("pointerdown", press);
      window.removeEventListener("keydown", onKey);
      target.removeEventListener("scroll", onScroll);
    };
  }, [metrics, page, scroller, key]);
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last = el.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      const grew = h - last;
      last = h;
      if (grew <= 0) return;
      if (stuck.current) {
        // small growth (the reveal, a line at a time) follows at once; a big block (a card) glides
        const s = page ? null : scroller.current;
        const { height } = metrics();
        const behavior: ScrollBehavior = grew > 160 && !reduced ? "smooth" : "auto";
        if (s) s.scrollTo({ top: height, behavior });
        else window.scrollTo({ top: height, behavior });
      } else setUnseen(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [content, metrics, page, reduced, scroller, key]);
  return { unseen, toBottom };
}

/** "↓ new message": new text arrived below while the learner was reading further up. */
export function NewMessagePill({ onClick, className = "", style }: { onClick: () => void; className?: string; style?: React.CSSProperties }) {
  // positioned by the wrapper (className, style), so the rise-in animation's transform doesn't undo a centring translate
  return (
    <div className={className} style={style}>
      <button
        type="button"
        onClick={onClick}
        className="hk-chat-in inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap border border-line-strong bg-surface px-3.5 font-mono text-[12px] text-fg shadow-[0_6px_24px_rgba(0,0,0,0.35)] hover:border-signal [@media(pointer:coarse)]:min-h-11"
      >
        <ArrowDown className="h-3.5 w-3.5 text-signal-text" aria-hidden />
        new message
      </button>
    </div>
  );
}
