"use client";

/**
 * The ink input control on every ink surface's toolbar (notebook pages, the passage pad, written papers, annotate):
 * a button naming the device's mode that opens a small menu, Pen only · Stylus/finger · Scroll, each with a line of
 * help and the universal-stylus tip. It also carries the one-tap hint "Your stylus looks like a finger…" when the
 * surface reported finger drags in Pen only (lib/learn/ink/inputMode.ts).
 *
 * Shown on touch devices, once a pen was seen, or when the mode isn't the default; a desktop with only a mouse never
 * needs it. The menu and the hint render into <body> (fixed, beside the button, z 9990: over every panel the ink
 * surfaces live in, the passage pad's is z 95 and the written paper's z 70, under dialogs and toasts at 9999+): the
 * toolbars scroll sideways and would clip them. Both carry data-ink-ui / data-annot-ui so no ink surface writes under them.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Hand, Pencil, Pointer, X } from "lucide-react";
import { INPUT_MODES, MODE_LABEL, STYLUS_TIP, dismissInkHint, setInkInputMode, useInkInput, type InkInputMode, type InkSurface } from "@/lib/learn/ink/inputMode";

/** the button's label in a compact toolbar (the pad, the answer sheet): the menu names each mode in full */
const SHORT: Record<InkInputMode, string> = { pen: "Pen only", touch: "Stylus", scroll: "Scroll" };

const ICON: Record<InkInputMode, React.ReactNode> = {
  pen: <Pencil className="h-[15px] w-[15px]" aria-hidden />,
  touch: <Pointer className="h-[15px] w-[15px]" aria-hidden />,
  scroll: <Hand className="h-[15px] w-[15px]" aria-hidden />,
};

type Props = {
  surface: InkSurface;
  /** open upward (a toolbar at the bottom of the screen) */
  up?: boolean;
  /** a shorter button (the pad, the answer sheet) */
  compact?: boolean;
  className?: string;
};

type Pos = { left: number; width: number; top?: number; bottom?: number };

function place(btn: HTMLElement | null, up: boolean, want: number): Pos | null {
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  // a copy hidden by the layout (the annotate toolbar has one per breakpoint): no menu, no hint from it
  if (!r.width && !r.height) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(want, vw - 16);
  const left = Math.max(8, Math.min(vw - width - 8, r.right - width));
  const below = vh - r.bottom;
  if (up || (below < 260 && r.top > below)) return { left, width, bottom: vh - r.top + 6 };
  return { left, width, top: r.bottom + 6 };
}

function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    // read after mount so the server markup matches
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a device fact
    setTouch((navigator.maxTouchPoints || 0) > 0 || !!window.matchMedia?.("(any-pointer: coarse)").matches);
  }, []);
  return touch;
}

export default function InputModeMenu({ surface, up = false, compact = false, className = "" }: Props) {
  const { mode, penSeen, hint } = useInkInput();
  const touch = useTouchDevice();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const showHint = hint === surface && !open;
  const visible = touch || penSeen || mode !== "touch";

  const reposition = useCallback(() => setPos(place(btn.current, up, open ? 340 : 320)), [up, open]);
  useLayoutEffect(() => {
    if (!open && !showHint) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, showHint, reposition]);

  // the menu closes on a tap outside it or on Esc; focus starts on the current mode
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[aria-checked='true']")?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (!visible) return null;

  const pick = (m: InkInputMode) => {
    setInkInputMode(m);
    setOpen(false);
    btn.current?.focus();
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role='menuitemradio']") || []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };
  const fixed = (p: Pos): React.CSSProperties => ({ position: "fixed", left: p.left, width: p.width, top: p.top, bottom: p.bottom, zIndex: 9990 });

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Input: ${MODE_LABEL[mode]}. Change how ink is written on this device`}
        title={`Input: ${MODE_LABEL[mode]}. ${STYLUS_TIP}`}
        data-ink-ui
        data-annot-ui
        className={`flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] ${compact ? "h-9 px-2" : "h-10 px-2.5"} ${
          mode === "pen" ? "bg-signal text-on-signal" : mode === "scroll" ? "bg-fg text-bg" : "border border-line-strong text-fg-2 hover:text-fg"
        } ${showHint ? "outline outline-2 outline-offset-2 outline-signal" : ""} ${className}`}
      >
        {ICON[mode]}
        <span className="whitespace-nowrap">{compact ? SHORT[mode] : MODE_LABEL[mode]}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={menu} role="menu" aria-label="How ink is written on this device" data-ink-ui data-annot-ui onKeyDown={onMenuKey} style={fixed(pos)} className="border border-line-strong bg-surface shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
            <p className="m-0 border-b border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">Input on this device</p>
            {INPUT_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={mode === m.id}
                onClick={() => pick(m.id)}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal ${mode === m.id ? "bg-surface-2" : ""}`}
              >
                <span aria-hidden className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center ${mode === m.id ? "bg-signal text-on-signal" : "border border-line-strong text-fg-2"}`}>
                  {ICON[m.id]}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-fg">{m.label}</span>
                  <span className="block text-[12.5px] leading-snug text-fg-2">{m.help}</span>
                </span>
              </button>
            ))}
            <p className="m-0 border-t border-line px-3 py-2 text-[12.5px] leading-snug text-fg-2">{STYLUS_TIP}</p>
          </div>,
          document.body
        )}
      {showHint &&
        pos &&
        createPortal(
          <div role="status" data-ink-ui data-annot-ui style={fixed(pos)} className="flex items-start gap-2 bg-fg py-2 pl-3 pr-1 text-bg shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
            <p className="m-0 min-w-0 flex-1 text-[13px] leading-snug">
              <span className="font-semibold">Your stylus looks like a finger to the browser.</span> Some tablets and in-app browsers report every stylus that way. Switch to Stylus/finger?
            </p>
            <button type="button" onClick={() => setInkInputMode("touch")} className="min-h-9 shrink-0 bg-signal px-3 text-[13px] font-semibold text-on-signal">
              Switch
            </button>
            <button type="button" onClick={dismissInkHint} aria-label="Keep Pen only" title="Keep Pen only" className="grid h-9 w-9 shrink-0 place-items-center opacity-75 hover:opacity-100">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
