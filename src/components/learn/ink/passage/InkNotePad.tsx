"use client";

/**
 * The writing pad of a handwritten note: the notebook ink engine (InkCanvas) on a ruled sheet, with the few tools a
 * margin note needs: pen, highlighter, eraser, the ink palette, undo / redo, and the input mode.
 *
 * Input (the device's setting shared by every ink surface, lib/learn/ink/inputMode.ts): Pen only (an active pen
 * writes, a finger scrolls the pad, two fingers pinch-zoom, a palm resting while the pen writes is ignored; the
 * first pen on a device switches to it), Stylus/finger (a finger or a universal stylus writes, two fingers scroll,
 * palms are rejected by contact size where the browser reports it), or Scroll (nothing writes).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Highlighter, PenLine, Redo2, Undo2 } from "lucide-react";
import InkCanvas, { type InkCanvasHandle, type InkContent, type InkToolId } from "@/components/learn/ink/InkCanvas";
import { INK, INK_LABEL, MARKER, MARKER_LABEL, PEN_SIZES, type InkTheme } from "@/lib/learn/ink/render";
import { inkBytes, INK_NOTE_MAX_BYTES, PAD_PAPER, type InkNoteInk } from "@/lib/learn/ink/passage";
import type { InkColor, Stroke } from "@/lib/learn/ink/types";
import { PEN_FOUND, useInkInput } from "@/lib/learn/ink/inputMode";
import InputModeMenu from "@/components/learn/ink/InputModeMenu";

const COLOR_KEY = "hk.inknote.color";
const PALETTE: InkColor[] = ["ink", "signal", "teal", "red", "grey"];
const NO_ITEMS: InkContent["items"] = [];
const HISTORY = 100;

export type PadTool = Extract<InkToolId, "pen" | "highlighter" | "eraser">;
export type InkNotePadHandle = { undo: () => void; redo: () => void; setTool: (t: PadTool) => void };

type Props = {
  ink: InkNoteInk;
  onChange: (ink: InkNoteInk) => void;
  theme: InkTheme;
  /** a short notice for the panel (pencil found, pad full) */
  onNotice: (text: string) => void;
  label: string;
};

const InkNotePad = forwardRef<InkNotePadHandle, Props>(function InkNotePad({ ink, onChange, theme, onNotice, label }, ref) {
  const [tool, setTool] = useState<PadTool>("pen");
  const [color, setColor] = useState<InkColor>(() => {
    try {
      const c = window.localStorage.getItem(COLOR_KEY) as InkColor | null;
      return c && PALETTE.includes(c) ? c : "ink";
    } catch {
      return "ink";
    }
  });
  const { mode: inputMode } = useInkInput();
  const past = useRef<Stroke[][]>([]);
  const future = useRef<Stroke[][]>([]);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const inkRef = useRef(ink);
  useEffect(() => {
    inkRef.current = ink;
  }, [ink]);
  const canvas = useRef<InkCanvasHandle>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLOR_KEY, color);
    } catch {
      // ignore
    }
  }, [color]);

  const full = inkBytes(ink) >= INK_NOTE_MAX_BYTES;

  const commit = useCallback(
    (next: InkContent) => {
      const cur = inkRef.current;
      if (next.strokes.length > cur.strokes.length && inkBytes({ strokes: next.strokes }) > INK_NOTE_MAX_BYTES) {
        onNotice("This note is full. Start another note to keep writing.");
        return;
      }
      past.current = [...past.current.slice(-(HISTORY - 1)), cur.strokes];
      future.current = [];
      setHist({ undo: past.current.length, redo: 0 });
      const n = { ...cur, strokes: next.strokes };
      inkRef.current = n;
      onChange(n);
    },
    [onChange, onNotice]
  );

  const step = useCallback(
    (back: boolean) => {
      const from = back ? past : future;
      const to = back ? future : past;
      if (!from.current.length) return;
      const cur = inkRef.current;
      const snap = back ? from.current[from.current.length - 1] : from.current[0];
      from.current = back ? from.current.slice(0, -1) : from.current.slice(1);
      to.current = back ? [cur.strokes, ...to.current].slice(0, HISTORY) : [...to.current, cur.strokes].slice(-HISTORY);
      setHist({ undo: past.current.length, redo: future.current.length });
      const n = { ...cur, strokes: snap };
      inkRef.current = n;
      onChange(n);
    },
    [onChange]
  );
  const undo = useCallback(() => step(true), [step]);
  const redo = useCallback(() => step(false), [step]);
  useImperativeHandle(ref, () => ({ undo, redo, setTool }), [undo, redo]);

  const onAutoPen = useCallback(() => onNotice(PEN_FOUND), [onNotice]);

  const b = (on: boolean) => `grid h-11 w-11 shrink-0 place-items-center ${on ? "bg-fg text-bg" : "text-fg hover:bg-surface-2"} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal`;
  const marker = tool === "highlighter";
  const tools: { id: PadTool; label: string; key: string; icon: React.ReactNode }[] = [
    { id: "pen", label: "Pen", key: "P", icon: <PenLine className="h-[18px] w-[18px]" aria-hidden /> },
    { id: "highlighter", label: "Highlighter", key: "H", icon: <Highlighter className="h-[18px] w-[18px]" aria-hidden /> },
    { id: "eraser", label: "Eraser", key: "E", icon: <Eraser className="h-[18px] w-[18px]" aria-hidden /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="toolbar" aria-label="Pad tools" className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-surface px-1 [scrollbar-width:none]">
        {tools.map((t) => (
          <button key={t.id} type="button" onClick={() => setTool(t.id)} aria-pressed={tool === t.id} aria-label={t.label} aria-keyshortcuts={t.key} title={`${t.label} (${t.key})`} className={b(tool === t.id)}>
            {t.icon}
          </button>
        ))}
        <span aria-hidden className="mx-1 h-7 w-px shrink-0 bg-line" />
        <div role="group" aria-label={marker ? "Highlighter colour" : "Ink colour"} className={`flex shrink-0 items-center ${tool === "eraser" ? "opacity-40" : ""}`}>
          {PALETTE.map((c) => {
            const on = color === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  if (tool === "eraser") setTool("pen");
                }}
                aria-pressed={on}
                aria-label={`${marker ? "Highlighter" : "Ink"} colour: ${marker ? MARKER_LABEL[c] : INK_LABEL[c]}`}
                className="grid h-11 w-9 shrink-0 place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
              >
                <span aria-hidden className={`block h-[20px] w-[20px] ${on ? "outline outline-2 outline-offset-2 outline-signal" : "border border-line-strong"}`} style={{ background: marker ? MARKER[theme][c] : INK[theme][c], opacity: marker ? 0.75 : 1 }} />
              </button>
            );
          })}
        </div>
        <span aria-hidden className="mx-1 h-7 w-px shrink-0 bg-line" />
        <button type="button" onClick={undo} disabled={!hist.undo} aria-label="Undo" aria-keyshortcuts="Control+Z Meta+Z" title="Undo (⌘Z)" className={`${b(false)} disabled:opacity-35`}>
          <Undo2 className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button type="button" onClick={redo} disabled={!hist.redo} aria-label="Redo" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" title="Redo (⇧⌘Z)" className={`${b(false)} disabled:opacity-35`}>
          <Redo2 className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <InputModeMenu surface="pad" compact className="ml-auto" />
      </div>
      <div className="relative min-h-0 flex-1">
        <InkCanvas
          ref={canvas}
          paper={PAD_PAPER}
          strokes={ink.strokes}
          items={NO_ITEMS}
          tool={tool}
          color={color}
          penSize={PEN_SIZES[1]}
          theme={theme}
          inputMode={inputMode}
          surface="pad"
          full={full}
          pad={0}
          onCommit={commit}
          onAutoPen={onAutoPen}
          onFull={() => onNotice("This note is full. Start another note to keep writing.")}
          label={label}
        />
      </div>
    </div>
  );
});

export default InkNotePad;
