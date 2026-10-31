"use client";

/** The notebook page tools: pen / highlighter / eraser / lasso / text, colour, size, undo/redo, zoom, input mode. */
import { Eraser, Highlighter, Lasso, PenLine, Redo2, Type, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";
import { INK, INK_LABEL, MARKER, MARKER_LABEL, PEN_SIZES, type InkTheme } from "@/lib/learn/ink/render";
import type { InkColor } from "@/lib/learn/ink/types";
import type { InkSurface } from "@/lib/learn/ink/inputMode";
import type { InkToolId } from "./InkCanvas";
import InputModeMenu from "./InputModeMenu";

export const COLORS: InkColor[] = ["ink", "signal", "teal", "red", "grey"];

const TOOLS: { id: InkToolId; label: string; key: string; icon: ReactNode }[] = [
  { id: "pen", label: "Pen", key: "P", icon: <PenLine className="h-[18px] w-[18px]" aria-hidden /> },
  { id: "highlighter", label: "Highlighter", key: "H", icon: <Highlighter className="h-[18px] w-[18px]" aria-hidden /> },
  { id: "eraser", label: "Eraser", key: "E", icon: <Eraser className="h-[18px] w-[18px]" aria-hidden /> },
  { id: "lasso", label: "Lasso: select, move, resize", key: "L", icon: <Lasso className="h-[18px] w-[18px]" aria-hidden /> },
  { id: "text", label: "Text box", key: "T", icon: <Type className="h-[18px] w-[18px]" aria-hidden /> },
];

type Props = {
  tool: InkToolId;
  onTool: (t: InkToolId) => void;
  color: InkColor;
  onColor: (c: InkColor) => void;
  sizeIndex: number;
  onSize: (i: number) => void;
  theme: InkTheme;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoom: (k: number) => void;
  onFit: () => void;
  /** the surface (for the input control's hint) */
  surface: InkSurface;
  compact?: boolean;
  /** more controls at the end of the row (the panel's paper picker) */
  extra?: ReactNode;
};

const sep = <span aria-hidden className="mx-1 h-7 w-px shrink-0 bg-line" />;

export default function InkToolbar(p: Props) {
  const b = (on: boolean) => `grid h-10 w-10 shrink-0 place-items-center ${on ? "bg-fg text-bg" : "text-fg hover:bg-surface-2"}`;
  const marker = p.tool === "highlighter";
  const showInk = p.tool === "pen" || p.tool === "highlighter";
  return (
    <div role="toolbar" aria-label="Page tools" className="flex min-w-0 flex-wrap items-center gap-0.5">
      {TOOLS.map((t) => (
        <button key={t.id} type="button" onClick={() => p.onTool(t.id)} aria-pressed={p.tool === t.id} aria-label={t.label} title={`${t.label} (${t.key})`} className={b(p.tool === t.id)}>
          {t.icon}
        </button>
      ))}
      {sep}
      <div role="group" aria-label={marker ? "Highlighter colour" : "Ink colour"} className={`flex shrink-0 items-center ${showInk ? "" : "opacity-40"}`}>
        {COLORS.map((c) => {
          const on = p.color === c;
          const sw = marker ? MARKER[p.theme][c] : INK[p.theme][c];
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                p.onColor(c);
                if (!showInk) p.onTool("pen");
              }}
              aria-pressed={on}
              aria-label={`${marker ? "Highlighter" : "Ink"} colour: ${marker ? MARKER_LABEL[c] : INK_LABEL[c]}`}
              className={`grid h-10 shrink-0 place-items-center ${p.compact ? "w-8" : "w-9"}`}
            >
              <span aria-hidden className={`block h-[22px] w-[22px] ${on ? "outline outline-2 outline-offset-2 outline-signal" : "border border-line-strong"}`} style={{ background: sw, opacity: marker ? 0.75 : 1 }} />
            </button>
          );
        })}
      </div>
      {sep}
      <div role="group" aria-label="Pen size" className={`flex shrink-0 items-center ${p.tool === "pen" ? "" : "opacity-40"}`}>
        {PEN_SIZES.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              p.onSize(i);
              if (p.tool !== "pen") p.onTool("pen");
            }}
            aria-pressed={p.sizeIndex === i}
            aria-label={`Pen size ${["fine", "medium", "bold"][i]}`}
            className={`grid h-10 shrink-0 place-items-center ${p.compact ? "w-8" : "w-9"} ${p.sizeIndex === i ? "bg-surface-2" : ""}`}
          >
            <span aria-hidden className="block rounded-full bg-fg" style={{ width: 3 + i * 3.5, height: 3 + i * 3.5 }} />
          </button>
        ))}
      </div>
      {sep}
      <button type="button" onClick={p.onUndo} disabled={!p.canUndo} aria-label="Undo" title="Undo (⌘Z)" className={`${b(false)} disabled:opacity-35`}>
        <Undo2 className="h-[18px] w-[18px]" aria-hidden />
      </button>
      <button type="button" onClick={p.onRedo} disabled={!p.canRedo} aria-label="Redo" title="Redo (⇧⌘Z)" className={`${b(false)} disabled:opacity-35`}>
        <Redo2 className="h-[18px] w-[18px]" aria-hidden />
      </button>
      {sep}
      {/* in the panel and on narrow screens (an iPad in portrait), pinch or ⌘-scroll zooms; the % button fits the
          width. The row wraps rather than scrolls, so no tool is ever cut off */}
      <button type="button" onClick={() => p.onZoom(1 / 1.25)} aria-label="Zoom out" className={`${b(false)} ${p.compact ? "hidden" : "max-[900px]:hidden"}`}>
        <ZoomOut className="h-[18px] w-[18px]" aria-hidden />
      </button>
      <button type="button" onClick={p.onFit} aria-label={`Zoom ${Math.round(p.zoom * 100)} percent. Fit page width`} title="Fit width" className="h-10 min-w-[52px] shrink-0 px-1 font-mono text-[12px] text-fg-2 hover:bg-surface-2">
        {Math.round(p.zoom * 100)}%
      </button>
      <button type="button" onClick={() => p.onZoom(1.25)} aria-label="Zoom in" className={`${b(false)} ${p.compact ? "hidden" : "max-[900px]:hidden"}`}>
        <ZoomIn className="h-[18px] w-[18px]" aria-hidden />
      </button>
      {sep}
      <InputModeMenu surface={p.surface} compact={p.compact} />
      {p.extra}
    </div>
  );
}
