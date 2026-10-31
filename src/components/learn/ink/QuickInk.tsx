"use client";

/**
 * The quick-gesture UI shared by every ink surface (lib/learn/ink/gestures.ts):
 *   PressMenu     after a long-press over ink: Erase, recolour swatches, Thicker / Thinner, Lasso more, Turn into text
 *   QuickPalette  after a long-press on empty paper: pen / highlighter / eraser, colours, nib sizes
 *   InkToastHost  "Erased · Undo", "Undone" (one per page)
 *   ModeSwitch    in both menus: Pen only · Stylus/finger · Scroll (the device's setting, lib/learn/ink/inputMode.ts)
 *   ToolSwitch    the floating one-tap pen ↔ eraser button near the writing hand
 * Menus render into <body>, fixed beside the press point (above it, clear of the hand), clamped to the screen; they
 * close on a tap elsewhere or Esc. Everything carries data-ink-ui / data-annot-ui so no surface writes under it.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Eraser, Highlighter, Lasso, Minus, PenLine, Plus, Trash2, Type, X } from "lucide-react";
import { INK, INK_LABEL, MARKER, MARKER_LABEL, type InkTheme } from "@/lib/learn/ink/render";
import { dismissInkToast, inkToast, useInkToast } from "@/lib/learn/ink/gestures";
import { INPUT_MODES, setInkInputMode, useInkInput } from "@/lib/learn/ink/inputMode";
import type { InkColor } from "@/lib/learn/ink/types";

export type QuickTool = "pen" | "highlighter" | "eraser";

const UI = { "data-ink-ui": "", "data-annot-ui": "" } as const;

/** fixed at (x, y): above the point by default, below when there's no room, inside the screen */
function useFloat(x: number, y: number, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = y - h - 28;
    if (top < 8) top = Math.min(vh - h - 8, y + 36);
    setPos({ left: Math.max(8, Math.min(vw - w - 8, x - w / 2)), top: Math.max(8, top) });
  }, [x, y]);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    };
    // the press that opened it is still down: listen from the next one
    const t = window.setTimeout(() => window.addEventListener("pointerdown", onDown, true), 0);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  const style: React.CSSProperties = { position: "fixed", zIndex: 9990, left: pos?.left ?? -9999, top: pos?.top ?? -9999 };
  return { ref, style };
}

/** where to say a way back is, after switching to Scroll from a menu (surfaces differ: see scrollHint) */
export const SCROLL_HINT = "Scroll mode · long-press to switch back";

/** the input mode, one tap each (44 px targets, plain words) */
function ModeSwitch({ scrollHint }: { scrollHint: string }) {
  const { mode } = useInkInput();
  return (
    <div role="radiogroup" aria-label="Input on this device" className="flex border-t border-line">
      {INPUT_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          title={m.help}
          onClick={() => {
            if (mode === m.id) return;
            setInkInputMode(m.id);
            if (m.id === "scroll") inkToast(scrollHint);
          }}
          className={`min-h-11 flex-1 whitespace-nowrap border-l border-line px-2.5 text-[13px] font-semibold first:border-l-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal ${mode === m.id ? "bg-fg text-bg" : "text-fg hover:bg-surface-2"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

const btn = "flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 px-2.5 text-[13px] font-semibold text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal";
const swatchBtn = "grid h-11 w-10 shrink-0 place-items-center hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal";

type PressMenuProps = {
  x: number;
  y: number;
  count: number;
  theme: InkTheme;
  colors: InkColor[];
  /** the selection is highlighter only (marker swatches) */
  marker: boolean;
  onErase: () => void;
  onColor: (c: InkColor) => void;
  onSize: (k: number) => void;
  onLasso?: () => void;
  onText?: () => void;
  onClose: () => void;
  /** the toast after switching to Scroll from this menu */
  scrollHint?: string;
};

export function PressMenu(p: PressMenuProps) {
  const { ref, style } = useFloat(p.x, p.y, p.onClose);
  return createPortal(
    <div ref={ref} {...UI} role="menu" aria-label={`${p.count} selected`} data-ink-press="sel" style={style} className="flex max-w-[calc(100vw-16px)] flex-col border border-line-strong bg-surface shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-center">
        <button type="button" role="menuitem" onClick={p.onErase} className={`${btn} text-bad-text`}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Erase
        </button>
        <span aria-hidden className="h-7 w-px bg-line" />
        <button type="button" role="menuitem" onClick={() => p.onSize(1.3)} aria-label="Thicker" title="Thicker" className={btn}>
          <Plus className="h-4 w-4" aria-hidden />
          Thicker
        </button>
        <button type="button" role="menuitem" onClick={() => p.onSize(1 / 1.3)} aria-label="Thinner" title="Thinner" className={btn}>
          <Minus className="h-4 w-4" aria-hidden />
          Thinner
        </button>
        {p.onLasso && (
          <button type="button" role="menuitem" onClick={p.onLasso} title="Lasso more: keep this selected and add to it" className={btn}>
            <Lasso className="h-4 w-4" aria-hidden />
            Lasso more
          </button>
        )}
        {p.onText && (
          <button type="button" role="menuitem" onClick={p.onText} title="Turn this page's handwriting into text" className={btn}>
            <Type className="h-4 w-4" aria-hidden />
            Turn into text
          </button>
        )}
      </div>
      <div role="group" aria-label="Recolour" className="flex items-center border-t border-line px-1">
        <span className="px-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-3">{p.count} selected · colour</span>
        {p.colors.map((c) => (
          <button key={c} type="button" role="menuitem" onClick={() => p.onColor(c)} aria-label={`Recolour: ${p.marker ? MARKER_LABEL[c] : INK_LABEL[c]}`} className={swatchBtn}>
            <span aria-hidden className="block h-5 w-5 rounded-full border border-line-strong" style={{ background: p.marker ? MARKER[p.theme][c] : INK[p.theme][c], opacity: p.marker ? 0.8 : 1 }} />
          </button>
        ))}
      </div>
      <ModeSwitch scrollHint={p.scrollHint ?? SCROLL_HINT} />
    </div>,
    document.body
  );
}

type PaletteProps = {
  x: number;
  y: number;
  theme: InkTheme;
  tool: string;
  onTool: (t: QuickTool) => void;
  colors: InkColor[];
  color: InkColor;
  onColor: (c: InkColor) => void;
  /** nib widths to show (omit on a surface with one nib) */
  sizes?: readonly number[];
  sizeIndex?: number;
  onSize?: (i: number) => void;
  onClose: () => void;
  scrollHint?: string;
};

const TOOL_ICON: Record<QuickTool, React.ReactNode> = {
  pen: <PenLine className="h-[18px] w-[18px]" aria-hidden />,
  highlighter: <Highlighter className="h-[18px] w-[18px]" aria-hidden />,
  eraser: <Eraser className="h-[18px] w-[18px]" aria-hidden />,
};

export function QuickPalette(p: PaletteProps) {
  const { ref, style } = useFloat(p.x, p.y, p.onClose);
  const marker = p.tool === "highlighter";
  return createPortal(
    <div ref={ref} {...UI} role="menu" aria-label="Quick palette" data-ink-press="palette" style={style} className="flex max-w-[calc(100vw-16px)] flex-col border border-line-strong bg-surface shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-center">
      {(["pen", "highlighter", "eraser"] as QuickTool[]).map((t) => (
        <button key={t} type="button" role="menuitemradio" aria-checked={p.tool === t} onClick={() => p.onTool(t)} aria-label={t[0].toUpperCase() + t.slice(1)} title={t[0].toUpperCase() + t.slice(1)} className={`grid h-11 w-11 shrink-0 place-items-center ${p.tool === t ? "bg-fg text-bg" : "text-fg hover:bg-surface-2"}`}>
          {TOOL_ICON[t]}
        </button>
      ))}
      <span aria-hidden className="mx-0.5 h-7 w-px bg-line" />
      {p.colors.map((c) => (
        <button key={c} type="button" role="menuitemradio" aria-checked={p.color === c} onClick={() => p.onColor(c)} aria-label={`${marker ? "Highlighter" : "Ink"} colour: ${marker ? MARKER_LABEL[c] : INK_LABEL[c]}`} className={swatchBtn}>
          <span aria-hidden className={`block h-5 w-5 rounded-full ${p.color === c ? "outline outline-2 outline-offset-2 outline-signal" : "border border-line-strong"}`} style={{ background: marker ? MARKER[p.theme][c] : INK[p.theme][c], opacity: marker ? 0.8 : 1 }} />
        </button>
      ))}
      {p.sizes && p.onSize && (
        <>
          <span aria-hidden className="mx-0.5 h-7 w-px bg-line" />
          {p.sizes.map((s, i) => (
            <button key={s} type="button" role="menuitemradio" aria-checked={p.sizeIndex === i} onClick={() => p.onSize!(i)} aria-label={`Pen size ${["fine", "medium", "bold"][i] ?? i + 1}`} className={`grid h-11 w-10 shrink-0 place-items-center ${p.sizeIndex === i ? "bg-surface-2" : "hover:bg-surface-2"}`}>
              <span aria-hidden className="block rounded-full bg-fg" style={{ width: 3 + i * 3.5, height: 3 + i * 3.5 }} />
            </button>
          ))}
        </>
      )}
      </div>
      <ModeSwitch scrollHint={p.scrollHint ?? SCROLL_HINT} />
    </div>,
    document.body
  );
}

// ------------------------------------------------------------------ one per page

let seq = 0;
const owners: Record<string, number[]> = {};
const ownerListeners = new Set<() => void>();
/** true for the first mounted instance of `name` (a page can hold two ink surfaces) */
function useSingleton(name: string): boolean {
  const [me] = useState(() => ++seq);
  useEffect(() => {
    owners[name] = [...(owners[name] || []), me];
    ownerListeners.forEach((l) => l());
    return () => {
      owners[name] = (owners[name] || []).filter((o) => o !== me);
      ownerListeners.forEach((l) => l());
    };
  }, [me, name]);
  const first = useSyncExternalStore(
    (cb) => {
      ownerListeners.add(cb);
      return () => ownerListeners.delete(cb);
    },
    () => (owners[name] || [])[0] ?? 0,
    () => 0
  );
  return first === me;
}

export function InkToastHost() {
  const t = useInkToast();
  const mine = useSingleton("toast");
  if (!t || !mine) return null;
  return createPortal(
    // touches pass through (a finger of the next tap or stroke lands on the page), except on its buttons
    <div role="status" data-ink-toast style={{ position: "fixed", zIndex: 9990, left: "50%", transform: "translateX(-50%)", bottom: "calc(var(--site-dock, 0px) + 104px)" }} className="pointer-events-none flex items-center gap-2 bg-fg py-1.5 pl-4 pr-1.5 text-bg shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
      <span className="text-[13px] font-semibold">{t.text}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            t.action!.run();
            dismissInkToast();
          }}
          {...UI}
          className="pointer-events-auto min-h-9 bg-bg px-3 text-[13px] font-semibold text-fg"
        >
          {t.action.label}
        </button>
      )}
      <button type="button" {...UI} onClick={dismissInkToast} aria-label="Dismiss" className="pointer-events-auto grid h-9 w-9 place-items-center opacity-70 hover:opacity-100">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>,
    document.body
  );
}

/** The floating one-tap pen ↔ eraser switch (the caller positions it). */
export function ToolSwitch({ tool, onFlip, style, className = "" }: { tool: string; onFlip: () => void; style?: React.CSSProperties; className?: string }) {
  const erasing = tool === "eraser";
  return (
    <button
      type="button"
      {...UI}
      data-ink-switch
      onClick={onFlip}
      aria-label={erasing ? "Eraser on: switch to the pen" : "Switch to the eraser"}
      title={erasing ? "Back to the pen" : "Eraser"}
      style={style}
      className={`pointer-events-auto grid h-12 w-12 place-items-center rounded-full border shadow-[0_6px_20px_rgba(0,0,0,0.22)] ${erasing ? "border-signal bg-signal text-on-signal" : "border-line-strong bg-surface text-fg"} ${className}`}
    >
      {erasing ? TOOL_ICON.eraser : tool === "highlighter" ? TOOL_ICON.highlighter : TOOL_ICON.pen}
    </button>
  );
}
