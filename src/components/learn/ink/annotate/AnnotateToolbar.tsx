"use client";

/**
 * The ink toolbar of annotate mode: pen, highlighter, eraser, colour (the notebook's ink palette, no purple), pen
 * size, undo / redo, the input mode (Pen only · Stylus/finger · Scroll, shared with every ink surface), show my
 * marks, send to notebook, the detached-marks tray, done.
 *
 * It takes the reading tools' place while annotating, so it covers no more of the lesson than they do: below 1024 px
 * (phones, iPad portrait) it is the bottom bar, in the reading bar's spot above the site dock; from 1024 px (iPad
 * landscape, laptops) it sits where the reading dock is, bottom right. Colour and size open small popovers upward.
 * 44 px targets; a toolbar of buttons in tab order; Esc = done, ⌘Z / ⇧⌘Z, P / H / E (AnnotateHost).
 */
import { useEffect, useRef, useState } from "react";
import { Check, Eraser, Eye, EyeOff, Highlighter, NotebookPen, PenLine, Redo2, Undo2, Unlink } from "lucide-react";
import { INK, INK_LABEL, MARKER, MARKER_LABEL, type InkTheme } from "@/lib/learn/ink/render";
import { Q } from "@/lib/learn/ink/geometry";
import type { InkColor } from "@/lib/learn/ink/types";
import type { AnnotMark } from "@/lib/learn/ink/annotate";
import type { AnnotTool } from "./engine";
import type { AnnotSaveState } from "./useAnnotations";
import { ANNOT_COLORS, ANNOT_PEN_SIZES } from "./mode";
import InputModeMenu from "../InputModeMenu";

type Props = {
  tool: AnnotTool;
  onTool: (t: AnnotTool) => void;
  color: InkColor;
  onColor: (c: InkColor) => void;
  sizeIndex: number;
  onSize: (i: number) => void;
  theme: InkTheme;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  show: boolean;
  onShow: (v: boolean) => void;
  onSend: () => void;
  sending: string | null;
  detached: AnnotMark[];
  onDeleteDetached: (ids: Set<string>) => void;
  onDone: () => void;
  saveState: AnnotSaveState;
  where: "account" | "device";
  note: string | null;
  signedIn: boolean;
  onSignIn: () => void;
  hint: string | null;
};

const TOOLS: { id: AnnotTool; label: string; key: string; icon: React.ReactNode }[] = [
  { id: "pen", label: "Pen", key: "P", icon: <PenLine className="h-[18px] w-[18px]" aria-hidden /> },
  { id: "highlighter", label: "Highlighter", key: "H", icon: <Highlighter className="h-[18px] w-[18px]" aria-hidden /> },
  { id: "eraser", label: "Eraser: removes whole strokes", key: "E", icon: <Eraser className="h-[18px] w-[18px]" aria-hidden /> },
];
const SIZE_NAMES = ["fine", "medium", "bold"];

const sep = <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-line" />;

function saveLabel(p: Props): string {
  if (!p.signedIn) return "On this device only";
  if (p.where === "device") return "Kept on this device";
  if (p.saveState === "saving" || p.saveState === "pending") return "Saving…";
  if (p.saveState === "offline") return "Offline · kept on this device";
  if (p.saveState === "error") return "Not saved yet · retrying";
  if (p.saveState === "full") return "Lesson full";
  return "Saved";
}

type Pop = "color" | "size" | "tray" | null;

export default function AnnotateToolbar(p: Props) {
  const [pop, setPop] = useState<Pop>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const toggle = (which: Pop) => setPop((cur) => (cur === which ? null : which));

  // a popover closes on a tap outside the toolbar or on Esc (Esc reaches "done" only when none is open)
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPop(null);
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [pop]);

  const b = (on: boolean) => `grid h-11 w-11 shrink-0 place-items-center ${on ? "bg-fg text-bg" : "text-fg hover:bg-surface-2"}`;
  const marker = p.tool === "highlighter";
  const inkTool = p.tool !== "eraser";
  const swatch = (c: InkColor) => (marker ? MARKER[p.theme][c] : INK[p.theme][c]);
  const status = p.sending ?? saveLabel(p);

  const popover = pop && (
    <div className="absolute bottom-full right-0 mb-2 max-w-[calc(100vw-16px)] border border-line-strong bg-surface shadow-[0_8px_28px_rgba(0,0,0,0.22)]">
      {pop === "color" && (
        <div role="group" aria-label={marker ? "Highlighter colour" : "Ink colour"} className="flex p-1">
          {ANNOT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                p.onColor(c);
                if (!inkTool) p.onTool("pen");
                setPop(null);
              }}
              aria-pressed={p.color === c}
              aria-label={`${marker ? "Highlighter" : "Ink"} colour: ${marker ? MARKER_LABEL[c] : INK_LABEL[c]}`}
              className="grid h-11 w-11 place-items-center hover:bg-surface-2"
            >
              <span aria-hidden className={`block h-6 w-6 rounded-full ${p.color === c ? "outline outline-2 outline-offset-2 outline-signal" : "border border-line-strong"}`} style={{ background: swatch(c), opacity: marker ? 0.8 : 1 }} />
            </button>
          ))}
        </div>
      )}
      {pop === "size" && (
        <div role="group" aria-label="Pen size" className="flex p-1">
          {ANNOT_PEN_SIZES.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                p.onSize(i);
                if (p.tool !== "pen") p.onTool("pen");
                setPop(null);
              }}
              aria-pressed={p.sizeIndex === i}
              aria-label={`Pen size ${SIZE_NAMES[i]}`}
              className={`grid h-11 w-11 place-items-center hover:bg-surface-2 ${p.sizeIndex === i ? "bg-surface-2" : ""}`}
            >
              <span aria-hidden className="block rounded-full bg-fg" style={{ width: 3 + i * 3.5, height: 3 + i * 3.5 }} />
            </button>
          ))}
        </div>
      )}
      {pop === "tray" && <DetachedTray marks={p.detached} theme={p.theme} onDelete={p.onDeleteDetached} onClose={() => setPop(null)} />}
    </div>
  );

  const tools = (
    <div role="toolbar" aria-label="Annotate tools" className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
      {TOOLS.map((t) => (
        <button key={t.id} type="button" onClick={() => p.onTool(t.id)} aria-pressed={p.tool === t.id} aria-label={t.label} title={`${t.label} (${t.key})`} className={b(p.tool === t.id)}>
          {t.icon}
        </button>
      ))}
      {sep}
      <button
        type="button"
        onClick={() => toggle("color")}
        aria-expanded={pop === "color"}
        aria-label={`${marker ? "Highlighter" : "Ink"} colour: ${marker ? MARKER_LABEL[p.color] : INK_LABEL[p.color]}. Change`}
        title="Colour"
        className={`${b(false)} ${inkTool ? "" : "opacity-50"}`}
      >
        <span aria-hidden className="block h-[22px] w-[22px] rounded-full border border-line-strong" style={{ background: swatch(p.color), opacity: marker ? 0.8 : 1 }} />
      </button>
      <button type="button" onClick={() => toggle("size")} aria-expanded={pop === "size"} aria-label={`Pen size ${SIZE_NAMES[p.sizeIndex]}. Change`} title="Pen size" className={`${b(false)} ${p.tool === "pen" ? "" : "opacity-50"}`}>
        <span aria-hidden className="block rounded-full bg-fg" style={{ width: 3 + p.sizeIndex * 3.5, height: 3 + p.sizeIndex * 3.5 }} />
      </button>
      {sep}
      <button type="button" onClick={p.onUndo} disabled={!p.canUndo} aria-label="Undo" title="Undo (⌘Z)" className={`${b(false)} disabled:opacity-35`}>
        <Undo2 className="h-[18px] w-[18px]" aria-hidden />
      </button>
      <button type="button" onClick={p.onRedo} disabled={!p.canRedo} aria-label="Redo" title="Redo (⇧⌘Z)" className={`${b(false)} disabled:opacity-35`}>
        <Redo2 className="h-[18px] w-[18px]" aria-hidden />
      </button>
      {sep}
      <InputModeMenu surface="annotate" up />
      {sep}
      <button type="button" onClick={() => p.onShow(!p.show)} aria-pressed={!p.show} aria-label={p.show ? "Hide my marks" : "Show my marks"} title={p.show ? "Hide my marks" : "Show my marks"} className={b(!p.show)}>
        {p.show ? <Eye className="h-[18px] w-[18px]" aria-hidden /> : <EyeOff className="h-[18px] w-[18px]" aria-hidden />}
      </button>
      <button type="button" onClick={p.onSend} disabled={!!p.sending} aria-label="Send the marked passages to your notebook" title="Send to notebook" className={`${b(false)} disabled:opacity-50`}>
        <NotebookPen className="h-[18px] w-[18px]" aria-hidden />
      </button>
      {p.detached.length > 0 && (
        <button
          type="button"
          onClick={() => toggle("tray")}
          aria-expanded={pop === "tray"}
          aria-label={`${p.detached.length} detached ${p.detached.length === 1 ? "mark" : "marks"}: the text they were on changed`}
          title="Marks whose text changed"
          className="flex h-11 shrink-0 items-center gap-1 px-2 font-mono text-[12px] text-fg hover:bg-surface-2"
        >
          <Unlink className="h-[16px] w-[16px]" aria-hidden />
          {p.detached.length}
        </button>
      )}
    </div>
  );

  const done = (
    <button type="button" onClick={p.onDone} aria-label="Done annotating" title="Done (Esc)" className="flex h-11 shrink-0 items-center gap-1.5 bg-signal px-3 text-[13px] font-semibold text-on-signal hover:brightness-110">
      <Check className="h-[16px] w-[16px]" aria-hidden />
      Done
    </button>
  );

  const statusLine = (
    <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 font-mono text-[11px] leading-tight text-fg-3" aria-live="polite">
      <span className="text-fg-2">{status}</span>
      {p.hint && <span className="hidden min-[700px]:inline">· {p.hint}</span>}
      {!p.signedIn && (
        <button type="button" onClick={p.onSignIn} className="min-h-6 text-signal-text underline underline-offset-2 hover:text-signal">
          Sign in to keep your marks
        </button>
      )}
      {p.signedIn && p.note && <span className="text-fg-2">{p.note}</span>}
    </p>
  );

  return (
    <div ref={boxRef} data-annot-ui>
      {/* the floating Ask AI pill sits where this toolbar's status line goes: out of the way while annotating */}
      <style>{`[data-ask-fab]{visibility:hidden!important}`}</style>
      {/* phones and tablets in portrait: the reading bar's place */}
      <div className="hk-safe-x fixed inset-x-0 z-[41] flex flex-col gap-1 border-t border-line bg-bg px-2.5 pt-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] lg:hidden" style={{ bottom: "var(--site-dock, 0px)" }}>
        {statusLine}
        <div className="relative flex items-center gap-1">
          <div className="min-w-0 flex-1">{tools}</div>
          {done}
          {popover}
        </div>
      </div>
      {/* wide screens: the reading dock's place */}
      <div className="fixed bottom-6 right-6 z-[41] hidden flex-col items-end gap-1.5 lg:flex">
        <div className="max-w-[min(560px,calc(100vw-48px))] border border-line bg-bg/90 px-2 py-1 backdrop-blur">{statusLine}</div>
        <div className="relative flex items-center gap-1 border border-line-strong bg-surface p-1 shadow-[0_8px_28px_rgba(0,0,0,0.22)]">
          {tools}
          {done}
          {popover}
        </div>
      </div>
    </div>
  );
}

/** Marks whose block can't be found any more (the lesson's text changed): kept, shown here, deletable. */
function DetachedTray({ marks, theme, onDelete, onClose }: { marks: AnnotMark[]; theme: InkTheme; onDelete: (ids: Set<string>) => void; onClose: () => void }) {
  const groups = new Map<string, AnnotMark[]>();
  for (const m of marks) {
    const k = `${m.b.s}|${m.b.h}|${m.b.o}`;
    const g = groups.get(k);
    if (g) g.push(m);
    else groups.set(k, [m]);
  }
  return (
    <section aria-label="Detached marks" className="w-[min(420px,calc(100vw-16px))]">
      <header className="flex items-center justify-between border-b border-line px-3 py-1">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">Detached · the text they were on changed</p>
        <button type="button" onClick={onClose} className="min-h-11 px-2 text-[13px] text-fg hover:text-signal">
          Close
        </button>
      </header>
      <ul className="m-0 max-h-[45vh] list-none overflow-y-auto p-0">
        {[...groups.values()].map((g) => (
          <li key={g[0].id} className="flex items-center gap-3 border-b border-line px-3 py-2">
            <MarkPreview marks={g} theme={theme} />
            <p className="m-0 min-w-0 flex-1 text-[13px] leading-snug text-fg-2">
              <span className="block truncate text-fg">{g[0].b.p ? `“${g[0].b.p}…”` : g[0].b.t}</span>
              {g.length} {g.length === 1 ? "mark" : "marks"}
            </p>
            <button type="button" onClick={() => onDelete(new Set(g.map((m) => m.id)))} className="min-h-11 shrink-0 px-2 text-[13px] font-semibold text-bad-text hover:underline">
              Delete
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end px-3 py-1">
        <button type="button" onClick={() => onDelete(new Set(marks.map((m) => m.id)))} className="min-h-11 px-2 text-[13px] text-bad-text hover:underline">
          Delete all detached
        </button>
      </div>
    </section>
  );
}

/** A small drawing of detached marks (their points as lines, fitted to the box). */
function MarkPreview({ marks, theme }: { marks: AnnotMark[]; theme: InkTheme }) {
  const lines = marks.map((m) => {
    const sc = m.m === "g" ? 1 / Q : 1 / 1000;
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < m.pts.length; i += 3) pts.push([m.pts[i] * sc * (m.m === "t" ? 3 : 1), m.pts[i + 1] * sc]);
    return { m, pts };
  });
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const l of lines)
    for (const [x, y] of l.pts) {
      x1 = Math.min(x1, x);
      y1 = Math.min(y1, y);
      x2 = Math.max(x2, x);
      y2 = Math.max(y2, y);
    }
  const k = Math.min(88 / Math.max(1e-3, x2 - x1), 36 / Math.max(1e-3, y2 - y1));
  return (
    <svg aria-hidden width="96" height="44" viewBox="0 0 96 44" className="shrink-0 border border-line bg-bg">
      {lines.map(({ m, pts }) => (
        <polyline
          key={m.id}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={m.tool === "highlighter" ? 6 : 1.6}
          stroke={m.tool === "highlighter" ? MARKER[theme][m.color] : INK[theme][m.color]}
          strokeOpacity={m.tool === "highlighter" ? 0.5 : 1}
          points={pts.map(([x, y]) => `${(4 + (x - x1) * k).toFixed(1)},${(4 + (y - y1) * k).toFixed(1)}`).join(" ")}
        />
      ))}
    </svg>
  );
}
