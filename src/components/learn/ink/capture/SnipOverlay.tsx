"use client";

/**
 * Snip mode: the page dims, the learner drags a rectangle (pen, finger or mouse), adjusts it (drag inside to move,
 * the eight handles to resize) and confirms. Esc, Cancel or a tap outside the box leaves.
 *
 * Keyboard: the box takes focus; arrow keys move it (Alt: 1 px steps), Shift + arrows resize it (right / down
 * grow, left / up shrink), Enter saves the snip, E explains it (when the AI is on), Esc cancels; Tab goes box → Cancel
 * → Explain → Save. Without a box yet, any arrow key (or Enter) puts one in the middle of the screen. Screen readers
 * hear the box's size as it changes.
 *
 * Two ways out of a drawn box: "Save" (into the notebook) and "Explain" (the AI explains it in a panel beside the
 * snip, which can then save the snip with its explanation). Only Explain sends anything to the AI.
 *
 * Ask: the bar also has an optional one-line question ("Ask about this snip"): with text in it the Explain button
 * reads "Ask" and the AI answers that question about the snip; Enter in the field sends it. Under it, quick chips
 * ("Explain simply", "Why this design?", …) send a ready question in one tap. While the field has focus the keys are
 * its own (E types an "e", Enter asks); the page doesn't scroll and the box doesn't move when the keyboard opens.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Scissors, Sparkles } from "lucide-react";
import type { Box } from "./events";
import { pinScrollWhileTyping, useVisibleArea } from "./viewport";

/** One-tap questions under the field: the chip's label, and the question the AI gets (shown as "You asked: …"). */
export const SNIP_CHIPS: { label: string; q: string }[] = [
  { label: "Explain simply", q: "Explain this simply, like I'm new to the topic." },
  { label: "Why this design?", q: "Why is it designed this way? What problem does each part solve, and what's the trade-off?" },
  { label: "Give an example", q: "Give me a concrete example of this in action." },
  { label: "Interview answer", q: "How would I explain this in a system design interview? Give me a short answer I could say out loud." },
];
const QUESTION_MAX = 500;

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CURSOR: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const MIN = 16;

type Drag = { mode: "new" | "move" | Handle; x0: number; y0: number; start: Box | null; moved: boolean; id: number };

function clampBox(b: Box): Box {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const w = Math.max(MIN, Math.min(b.w, W));
  const h = Math.max(MIN, Math.min(b.h, H));
  return { x: Math.max(0, Math.min(b.x, W - w)), y: Math.max(0, Math.min(b.y, H - h)), w, h };
}

function fromPoints(x0: number, y0: number, x1: number, y1: number): Box {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const ax = Math.max(0, Math.min(x0, x1));
  const ay = Math.max(0, Math.min(y0, y1));
  const bx = Math.min(W, Math.max(x0, x1));
  const by = Math.min(H, Math.max(y0, y1));
  return { x: ax, y: ay, w: Math.max(1, bx - ax), h: Math.max(1, by - ay) };
}

function resize(b: Box, h: Handle, dx: number, dy: number): Box {
  let { x, y, w, h: hh } = b;
  if (h.includes("w")) {
    const nx = Math.min(x + dx, x + w - MIN);
    w += x - nx;
    x = nx;
  }
  if (h.includes("e")) w = Math.max(MIN, w + dx);
  if (h.includes("n")) {
    const ny = Math.min(y + dy, y + hh - MIN);
    hh += y - ny;
    y = ny;
  }
  if (h.includes("s")) hh = Math.max(MIN, hh + dy);
  // keep inside the screen without moving the opposite edge
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    hh += y;
    y = 0;
  }
  w = Math.min(w, window.innerWidth - x);
  hh = Math.min(hh, window.innerHeight - y);
  return { x, y, w, h: hh };
}

function defaultBox(): Box {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const w = Math.round(Math.min(W * 0.6, 640));
  const h = Math.round(Math.min(H * 0.4, 360));
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
}

const r = (b: Box) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });

type Props = {
  initial?: Box;
  keyboard?: boolean;
  /** working: "save" while the snip is saved, "explain" while it is read for the AI */
  busy: false | "save" | "explain";
  onConfirm: (box: Box) => void;
  /** "Explain this" (the AI is on for this learner), with the learner's question when they asked one; absent: Save only */
  onExplain?: (box: Box, question?: string) => void;
  onCancel: () => void;
  /** the overlay root (the host lets hit-testing through it while it looks up the passage under the box) */
  rootRef?: React.RefObject<HTMLDivElement | null>;
};

export default function SnipOverlay({ initial, keyboard, busy, onConfirm, onExplain, onCancel, rootRef }: Props) {
  const [box, setBox] = useState<Box | null>(() => (initial ? clampBox(initial) : keyboard ? defaultBox() : null));
  const [said, setSaid] = useState("");
  const [coarse, setCoarse] = useState(false);
  const [question, setQuestion] = useState("");
  const [typing, setTyping] = useState(false);
  const [pin] = useState(() => pinScrollWhileTyping(setTyping));
  useEffect(() => () => pin.dispose(), [pin]);
  const visibleBottom = useVisibleArea(typing)?.bottom ?? null;
  const typingRef = useRef(false);
  useEffect(() => {
    typingRef.current = typing;
  }, [typing]);
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = rootRef ?? ownRef;
  const boxRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const restore = useRef<HTMLElement | null>(null);
  const latest = useRef({ box, busy, onConfirm, onExplain, onCancel, question });
  useEffect(() => {
    latest.current = { box, busy, onConfirm, onExplain, onCancel, question };
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once the overlay is on screen
    setCoarse(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);

  // focus in on open, back where it was on close
  useLayoutEffect(() => {
    restore.current = document.activeElement as HTMLElement | null;
    (boxRef.current ?? ref.current)?.focus({ preventScroll: true });
    return () => restore.current?.focus?.({ preventScroll: true });
  }, [ref]);

  // announce the box (debounced) for screen readers
  useEffect(() => {
    if (!box) return;
    const t = window.setTimeout(() => {
      const b = r(box);
      setSaid(`Snip area ${b.w} by ${b.h} pixels, ${b.x} from the left, ${b.y} from the top.`);
    }, 350);
    return () => window.clearTimeout(t);
  }, [box]);

  // Esc first, before the page's own Esc handlers (a short's player, the selection toolbar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // in the question field with a question: Esc clears it first
      if (document.activeElement === inputRef.current && latest.current.question) {
        setQuestion("");
        return;
      }
      if (!latest.current.busy) latest.current.onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // the screen turned (iPad): keep the box on it. Not while the learner types: that resize is the on-screen keyboard
  // (older Android shrinks the viewport for it), and the box stays where it was drawn
  useEffect(() => {
    const onResize = () => {
      if (typingRef.current) return;
      setBox((b) => (b ? clampBox(b) : b));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const confirm = useCallback(() => {
    const { box: b, busy: working } = latest.current;
    if (!b || working || b.w < MIN || b.h < MIN) return;
    latest.current.onConfirm(r(b));
  }, []);
  /** Explain, or Ask when the field has a question (a chip passes its own) */
  const explain = useCallback((ask?: string) => {
    const { box: b, busy: working, onExplain: go, question: typed } = latest.current;
    if (!go || !b || working || b.w < MIN || b.h < MIN) return;
    const q = (ask ?? typed).replace(/\s+/g, " ").trim().slice(0, QUESTION_MAX);
    // the keyboard closes before the snip is taken
    inputRef.current?.blur();
    go(r(b), q || undefined);
  }, []);

  /* ---------------- pointer: draw / move / resize */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (busy || (e.pointerType === "mouse" && e.button !== 0)) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-snip-bar]")) return;
    const handle = t.closest<HTMLElement>("[data-handle]")?.dataset.handle as Handle | undefined;
    const inBox = !!t.closest("[data-snip-box]");
    drag.current = { mode: handle ?? (inBox ? "move" : "new"), x0: e.clientX, y0: e.clientY, start: box, moved: false, id: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not a live pointer (synthetic): moves still reach the overlay, which covers the screen */
    }
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    if (d.mode === "new") setBox(fromPoints(d.x0, d.y0, e.clientX, e.clientY));
    else if (d.mode === "move" && d.start) setBox(clampBox({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }));
    else if (d.start) setBox(resize(d.start, d.mode as Handle, dx, dy));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    // a tap outside the box (or with no box) leaves snip mode
    if (d.mode === "new" && !d.moved) {
      onCancel();
      return;
    }
    setBox((b) => {
      if (!b) return b;
      if (b.w < MIN || b.h < MIN) return d.start; // a stray flick: keep what was there
      return b;
    });
    // the drawn box takes focus, so the arrow keys / Enter carry on from here
    window.requestAnimationFrame(() => boxRef.current?.focus({ preventScroll: true }));
  };

  /* ---------------- keyboard */
  const onBoxKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirm();
      return;
    }
    if (e.key.toLowerCase() === "e" && !e.metaKey && !e.ctrlKey && !e.altKey && onExplain) {
      e.preventDefault();
      explain();
      return;
    }
    if (!e.key.startsWith("Arrow") || busy) return;
    e.preventDefault();
    const step = e.altKey ? 1 : e.metaKey || e.ctrlKey ? 50 : 10;
    setBox((b) => {
      const cur = b ?? defaultBox();
      if (e.shiftKey) {
        const dw = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        const dh = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        return clampBox({ ...cur, w: Math.max(MIN, Math.min(cur.w + dw, window.innerWidth - cur.x)), h: Math.max(MIN, Math.min(cur.h + dh, window.innerHeight - cur.y)) });
      }
      const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
      const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
      return clampBox({ ...cur, x: cur.x + dx, y: cur.y + dy });
    });
  };
  const onRootKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (box && e.key === "Enter" && e.target === e.currentTarget) {
      e.preventDefault();
      confirm();
      return;
    }
    // the question field's keys are its own (it handles Enter itself)
    if (e.target instanceof HTMLInputElement && e.key !== "Tab") return;
    if (box && onExplain && e.key.toLowerCase() === "e" && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      explain();
      return;
    }
    if (!box && (e.key.startsWith("Arrow") || e.key === "Enter")) {
      e.preventDefault();
      setBox(defaultBox());
      window.setTimeout(() => boxRef.current?.focus({ preventScroll: true }), 0);
      return;
    }
    if (e.key !== "Tab") return;
    // keep focus inside the overlay
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-snip-box], [data-snip-bar] button:not([disabled]), [data-snip-bar] input:not([disabled])"));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length];
    e.preventDefault();
    next.focus({ preventScroll: true });
  };

  /* ---------------- layout of the action bar: under the box, else above, else inside it */
  // its real height once it is on screen (the chips wrap on a narrow bar); the first frame uses an estimate
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const read = () => setBarH(Math.round(el.getBoundingClientRect().height));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!box]); // eslint-disable-line react-hooks/exhaustive-deps -- the bar mounts with the box
  const BAR_H = barH || (onExplain ? 236 : 52);
  let bar: React.CSSProperties | undefined;
  if (box) {
    const W = typeof window === "undefined" ? 1024 : window.innerWidth;
    const H = typeof window === "undefined" ? 768 : window.innerHeight;
    const barW = Math.min(W - 16, onExplain ? 460 : 320);
    const left = Math.max(8, Math.min(box.x + box.w - barW, W - barW - 8));
    let top = box.y + box.h + 10 + BAR_H < H - 8 ? box.y + box.h + 10 : box.y - BAR_H - 10 > 8 ? box.y - BAR_H - 10 : Math.max(8, box.y + box.h - BAR_H - 8);
    // typing: the keyboard covers the bottom of the screen, so the bar rises above it (the box stays put)
    if (visibleBottom != null && top + BAR_H > visibleBottom - 8) top = Math.max(8, visibleBottom - BAR_H - 8);
    bar = { left, top, width: barW };
  }
  const hs = coarse ? 44 : 24;
  const b = box ? r(box) : null;

  const ui = (
    <div
      ref={ref}
      data-hk-snip-ui=""
      data-sd-chrome=""
      role="dialog"
      aria-modal="true"
      aria-label="Snip part of the page"
      aria-describedby="hk-snip-help"
      tabIndex={-1}
      onKeyDown={onRootKey}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      className={`fixed inset-0 z-[10001] cursor-crosshair touch-none select-none outline-none motion-safe:animate-hk-in ${box ? "" : "bg-black/55"}`}
      style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <p id="hk-snip-help" className="sr-only">
        Drag over the part of the page to snip. Arrow keys move the box, Shift with arrow keys resizes it, Enter snips, Escape cancels.
      </p>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>

      {!box && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--hk-header-h,64px)+16px)] flex justify-center px-4">
          <div className="flex items-center gap-3 border border-line-strong bg-surface-2 px-4 py-3 text-fg shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
            <Scissors className="h-4 w-4 text-signal-text" aria-hidden />
            <span className="text-sm font-semibold">Drag over the part you want to snip</span>
            <span className="hidden font-mono text-[11px] text-fg-3 [@media(pointer:fine)]:inline">esc to cancel</span>
            <span className="font-mono text-[11px] text-fg-3 [@media(pointer:fine)]:hidden">tap to cancel</span>
          </div>
        </div>
      )}

      {b && (
        <div
          ref={boxRef}
          data-snip-box=""
          tabIndex={0}
          role="application"
          aria-roledescription="snip area"
          aria-label={`Snip area, ${b.w} by ${b.h} pixels. Arrow keys move it, Shift with arrow keys resizes it, Enter snips.`}
          onKeyDown={onBoxKey}
          className="absolute cursor-move outline-none focus-visible:[outline:2px_dashed_var(--c-fg)] focus-visible:[outline-offset:4px]"
          style={{
            left: b.x,
            top: b.y,
            width: b.w,
            height: b.h,
            boxShadow: "0 0 0 200vmax rgba(0,0,0,0.55)",
            border: "2px solid var(--c-signal, #ff5a1f)",
          }}
        >
          {HANDLES.map((h) => {
            const x = h.includes("w") ? 0 : h.includes("e") ? 100 : 50;
            const y = h.includes("n") ? 0 : h.includes("s") ? 100 : 50;
            return (
              <span
                key={h}
                data-handle={h}
                aria-hidden="true"
                className="absolute grid place-items-center"
                style={{ left: `${x}%`, top: `${y}%`, width: hs, height: hs, marginLeft: -hs / 2, marginTop: -hs / 2, cursor: CURSOR[h] }}
              >
                <span className="pointer-events-none block h-3 w-3 border-2 border-[var(--c-signal,#ff5a1f)] bg-bg" />
              </span>
            );
          })}
        </div>
      )}

      {b && bar && (
        <div
          ref={barRef}
          data-snip-bar=""
          className="absolute flex flex-col border border-line-strong bg-surface-2 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          style={bar}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onExplain && (
            <div className="flex flex-col gap-1 border-b border-line p-1">
              <div className="flex items-stretch gap-1">
                <label htmlFor="hk-snip-q" className="sr-only">
                  Ask about this snip (optional)
                </label>
                <input
                  ref={inputRef}
                  id="hk-snip-q"
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value.slice(0, QUESTION_MAX))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    explain();
                  }}
                  onFocus={pin.onFocus}
                  onBlur={pin.onBlur}
                  disabled={!!busy}
                  maxLength={QUESTION_MAX}
                  placeholder="Ask about this snip (optional)"
                  enterKeyHint={question.trim() ? "send" : "go"}
                  autoComplete="off"
                  spellCheck
                  data-hk-snip-question=""
                  // 16 px: iOS zooms the page into a smaller field on focus
                  className="min-h-[44px] min-w-0 flex-1 select-text border border-line-strong bg-bg px-3 text-[16px] leading-tight text-fg outline-none placeholder:text-fg-4 focus:border-signal disabled:opacity-60"
                  style={{ WebkitUserSelect: "text", userSelect: "text" }}
                />
                <button
                  type="button"
                  onClick={() => explain()}
                  disabled={!!busy}
                  aria-busy={busy === "explain" || undefined}
                  aria-keyshortcuts={typing ? "Enter" : "E"}
                  title={question.trim() ? `Ask the AI about this snip (${typing ? "Enter" : "E"})` : "Explain this with AI (E)"}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-2 border border-signal px-3 text-[13px] font-semibold text-signal-text hover:bg-signal hover:text-on-signal disabled:opacity-70"
                >
                  {question.trim() ? <MessageSquare className="h-3.5 w-3.5" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                  {busy === "explain" ? (
                    "Reading…"
                  ) : question.trim() ? (
                    "Ask"
                  ) : (
                    <span>
                      Explain<span className="hidden min-[480px]:inline"> this</span>
                    </span>
                  )}
                  {!busy && <span className="hidden font-mono text-[10px] font-normal opacity-80 [@media(pointer:fine)]:inline">{typing ? "↵" : "E"}</span>}
                </button>
              </div>
              <div role="group" aria-label="Quick questions" className="grid grid-cols-2 gap-1">
                {SNIP_CHIPS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => explain(c.q)}
                    disabled={!!busy}
                    title={c.q}
                    data-snip-chip=""
                    className="min-h-[44px] truncate border border-line px-2.5 text-left text-[13px] font-medium text-fg-2 hover:border-signal hover:text-fg disabled:opacity-60"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div role="toolbar" aria-label="Snip" className="flex items-center gap-1 p-1">
            <span aria-hidden="true" className="hidden min-w-0 flex-1 truncate px-2 font-mono text-[11px] text-fg-3 min-[400px]:block">
              {b.w} × {b.h}
            </span>
            <button type="button" onClick={onCancel} disabled={!!busy} className="min-h-[44px] px-3 text-[13px] font-semibold text-fg hover:bg-surface disabled:opacity-50 max-[399px]:mr-auto">
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={confirm}
              disabled={!!busy}
              aria-busy={busy === "save" || undefined}
              aria-keyshortcuts="Enter"
              title={onExplain ? "Save the snip to your notebook (Enter)" : undefined}
              className="inline-flex min-h-[44px] items-center gap-2 bg-signal px-4 text-[13px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-80"
            >
              <Scissors className="h-3.5 w-3.5" aria-hidden />
              {busy === "save" ? (
                "Snipping…"
              ) : onExplain ? (
                <span>
                  Save<span className="hidden min-[360px]:inline"> to notebook</span>
                </span>
              ) : (
                "Snip"
              )}
              {!busy && !typing && <span className="hidden font-mono text-[10px] font-normal opacity-80 [@media(pointer:fine)]:inline">↵</span>}
            </button>
          </div>
          {onExplain && (
            <p className="m-0 truncate border-t border-line px-3 py-1.5 font-mono text-[10.5px] leading-tight text-fg-4">
              Explain or Ask sends the snip to the AI · ~1 credit
            </p>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(ui, document.body);
}
