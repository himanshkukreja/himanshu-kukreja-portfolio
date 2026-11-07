"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_READING, FONTS, LEADINGS, READ_MODES, TEXT_SIZES, WIDTHS, resetReading, resolveMode, sameType, themeInfo, updateReading } from "@/lib/learn/readingModes";
import { usePageTone, useReadingSettings } from "./useReading";
import styles from "@/components/learn/lesson/reader.module.css";

type Trigger = {
  ref: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
  "aria-expanded": boolean;
  "aria-haspopup": "dialog";
  "aria-controls"?: string;
};

type Props = {
  /** the button that opens the panel (spread the trigger props onto it) */
  children: (trigger: Trigger) => ReactNode;
  /** the popover opens above the button (bottom docks) or below it (top bars) */
  placement?: "up" | "down";
  /** "auto": a bottom sheet below 1024px, a popover from there up */
  as?: "auto" | "popover" | "sheet";
  className?: string;
};

/**
 * The reading panel behind the reader's "Aa": the site theme (the same setting as the header's theme menu),
 * font, text size, line spacing, page width (src/lib/learn/readingModes.ts). A compact popover on the desktop
 * reading dock, a bottom sheet on the phone / tablet reading bar. Every change applies at once (the page shows through the sheet's light scrim).
 */
type Open = { kind: "sheet" } | { kind: "popover"; placement: "up" | "down"; maxHeight: number };

/** the panel's full height (px): a popover flips to the other side of the button when it wouldn't fit */
const PANEL_H = 600;

export default function ReadingSettings({ children, placement = "up", as = "auto", className = "" }: Props) {
  const [open, setOpen] = useState<Open | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(null), []);
  const onClick = () => {
    if (open) return setOpen(null);
    const kind = as !== "auto" ? as : window.matchMedia("(min-width: 1024px)").matches ? "popover" : "sheet";
    if (kind === "sheet") return setOpen({ kind });
    // the side with room for the whole panel (the preferred one first), else the roomier one, scrolling inside
    const r = ref.current?.getBoundingClientRect();
    const room = { up: (r?.top ?? 0) - 16, down: window.innerHeight - (r?.bottom ?? 0) - 16 };
    const other = placement === "up" ? "down" : "up";
    const side = room[placement] >= PANEL_H || room[placement] >= room[other] ? placement : other;
    setOpen({ kind, placement: side, maxHeight: Math.max(240, room[side] - 8) });
  };
  return (
    <div className={`relative ${className}`}>
      {children({ ref, onClick, "aria-expanded": !!open, "aria-haspopup": "dialog", "aria-controls": open ? id : undefined })}
      {open?.kind === "popover" && <Popover id={id} placement={open.placement} maxHeight={open.maxHeight} trigger={ref} onClose={close} />}
      {open?.kind === "sheet" && <Sheet id={id} trigger={ref} onClose={close} />}
    </div>
  );
}

/** A plain "Aa" button with the panel, for readers without a reading dock (case files, war stories, sheets…). */
export function ReadingButton({ placement = "down", className = "" }: { placement?: "up" | "down"; className?: string }) {
  return (
    <ReadingSettings placement={placement} className={`flex ${className}`}>
      {(t) => (
        <button
          type="button"
          ref={t.ref}
          onClick={t.onClick}
          aria-expanded={t["aria-expanded"]}
          aria-haspopup={t["aria-haspopup"]}
          aria-controls={t["aria-controls"]}
          aria-label="Reading settings: theme, font, text size"
          title="Reading settings"
          className={`grid min-h-11 min-w-11 place-items-center border px-2.5 font-display text-[15px] font-bold ${t["aria-expanded"] ? "border-signal text-signal-text" : "border-line-strong text-fg hover:bg-surface-2"}`}
        >
          Aa
        </button>
      )}
    </ReadingSettings>
  );
}

/** Focus on open, Esc and outside clicks close, focus back on the button after. The sheet also traps Tab and holds the page still. */
function usePanel(panel: RefObject<HTMLDivElement | null>, trigger: RefObject<HTMLButtonElement | null>, onClose: () => void, modal: boolean) {
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const back = trigger.current;
    (el.querySelector<HTMLElement>('input[name$="-mode"]:checked') ?? el.querySelector<HTMLElement>("button, input"))?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    if (modal) document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // first: focus mode and a fullscreen diagram listen for Esc too
        e.stopPropagation();
        onClose();
      } else if (modal && e.key === "Tab") {
        const f = Array.from(el.querySelectorAll<HTMLElement>("button:not([disabled]), input:checked"));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!modal && !el.contains(t) && !back?.contains(t)) onClose();
    };
    // the popover isn't modal: Tab past its last control closes it
    const onFocus = (e: FocusEvent) => {
      const t = e.target as Node;
      if (!modal && !el.contains(t) && !back?.contains(t)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("focusin", onFocus);
      if (modal) document.body.style.overflow = prevOverflow;
      const a = document.activeElement;
      if (!a || a === document.body || el.contains(a)) back?.focus({ preventScroll: true });
    };
  }, [panel, trigger, onClose, modal]);
}

function Popover({ id, placement, maxHeight, trigger, onClose }: { id: string; placement: "up" | "down"; maxHeight: number; trigger: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePanel(ref, trigger, onClose, false);
  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label="Reading settings"
      style={{ maxHeight }}
      className={`absolute right-0 z-[61] w-[352px] max-w-[calc(100vw-24px)] animate-hk-in overflow-y-auto border border-line-strong bg-surface text-left shadow-[0_16px_48px_rgba(0,0,0,0.28)] ${
        placement === "up" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
      }`}
    >
      <PanelBody onClose={onClose} />
    </div>
  );
}

function Sheet({ id, trigger, onClose }: { id: string; trigger: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePanel(ref, trigger, onClose, true);
  // portalled: the reading bar slides with a transform, which would pin a fixed child to the bar
  return createPortal(
    <div className="fixed inset-0 z-[70] text-left">
      <button type="button" aria-label="Close reading settings" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full bg-black/25" />
      <div
        ref={ref}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Reading settings"
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[88vh] w-full max-w-[560px] flex-col border-t border-line-strong bg-surface pb-[env(safe-area-inset-bottom,0px)] sm:border-x ${styles.sheetIn}`}
      >
        <span aria-hidden className="mt-2 h-1 w-10 shrink-0 self-center bg-line-strong" />
        <div className={`min-h-0 overflow-y-auto ${styles.sheet}`}>
          <PanelBody onClose={onClose} />
        </div>
      </div>
    </div>,
    document.body
  );
}

/** A native radio (arrow keys, screen readers) under a styled face: the face follows it with peer-checked. */
function Choice({ name, checked, onChange, className = "", label, children }: { name: string; checked: boolean; onChange: () => void; className?: string; label?: string; children: ReactNode }) {
  return (
    <label className={`relative block cursor-pointer ${className}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} aria-label={label} className="peer sr-only" />
      {children}
    </label>
  );
}

/** focus ring for a face whose radio is focused (the radio itself is visually hidden) */
const RING = "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal";

function Group({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div aria-hidden className="mb-2 flex items-baseline justify-between gap-3 font-mono text-[11px] uppercase tracking-label">
        <span className="text-fg-3">{label}</span>
        <span className="text-fg">{value}</span>
      </div>
      {children}
    </fieldset>
  );
}

function Segmented<T extends string>({ name, options, value, onPick }: { name: string; options: { id: T; name: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="grid grid-cols-3 border border-line-strong">
      {options.map((o, k) => (
        <Choice key={o.id} name={name} checked={value === o.id} onChange={() => onPick(o.id)} className={k ? "border-l border-line-strong" : ""}>
          <span className={`grid h-10 place-items-center font-mono text-[12px] text-fg-2 hover:bg-surface-2 peer-checked:bg-signal peer-checked:font-semibold peer-checked:text-on-signal ${RING}`}>{o.name}</span>
        </Choice>
      ))}
    </div>
  );
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const s = useReadingSettings();
  const { siteDark } = usePageTone();
  // the theme in force ("site", never picked, stands for Light or Night until the host saves it)
  const theme = resolveMode(s.mode, siteDark);
  const name = useId();
  const i = Math.max(0, (TEXT_SIZES as readonly number[]).indexOf(s.size));
  // Reset is for the type settings: the theme is the whole site's
  const isDefault = sameType(s, DEFAULT_READING);
  const step = (d: number) => updateReading({ size: TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, i + d))] });
  const sizeBtn = "grid h-11 w-12 shrink-0 place-items-center text-fg hover:bg-surface-2 disabled:text-fg-4 disabled:hover:bg-transparent";
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 border-b border-line py-1.5 pl-4 pr-1.5">
        <span className="flex-1 font-mono text-[12px] font-semibold uppercase tracking-label text-fg">Reading</span>
        <button
          type="button"
          onClick={resetReading}
          disabled={isDefault}
          className="min-h-9 px-2.5 font-mono text-[11px] uppercase tracking-label text-fg-3 hover:text-signal-text disabled:opacity-50 disabled:hover:text-fg-3"
        >
          Reset
        </button>
        <button type="button" onClick={onClose} aria-label="Close reading settings" className="grid h-9 w-9 place-items-center text-lg leading-none text-fg-3 hover:bg-surface-2 hover:text-fg">
          ×
        </button>
      </div>

      <div className="flex flex-col gap-3.5 px-4 pb-4 pt-3">
        <Group label="Theme" value={themeInfo(theme).name}>
          {/* eight themes: two rows of four */}
          <div className="grid grid-cols-4 gap-1.5">
            {READ_MODES.map((m) => (
              <Choice key={m.id} name={`${name}-mode`} checked={theme === m.id} onChange={() => updateReading({ mode: m.id })} label={m.name}>
                <span className={`flex flex-col border border-line-strong peer-checked:border-signal peer-checked:outline peer-checked:outline-1 peer-checked:-outline-offset-2 peer-checked:outline-signal ${RING}`}>
                  <span aria-hidden className="relative grid h-10 place-items-center" style={{ background: m.bg, color: m.fg }}>
                    <span className="-mt-0.5 font-display text-[17px] font-bold leading-none">Aa</span>
                    <span className="absolute bottom-1.5 left-1/2 h-[2px] w-6 -translate-x-1/2" style={{ background: m.accent }} />
                  </span>
                  <span aria-hidden className="flex items-center justify-between border-t border-line px-1.5 py-1 font-mono text-[11px] text-fg-2">
                    {m.name}
                    {theme === m.id && <span className="text-signal-text">✓</span>}
                  </span>
                </span>
              </Choice>
            ))}
          </div>
        </Group>

        <Group label="Font" value={FONTS.find((f) => f.id === s.font)?.name ?? ""}>
          <div className="grid grid-cols-2 gap-1.5">
            {FONTS.map((f) => (
              <Choice key={f.id} name={`${name}-font`} checked={s.font === f.id} onChange={() => updateReading({ font: f.id })} label={f.name}>
                <span className={`flex h-11 items-center justify-center gap-2.5 border border-line-strong text-fg hover:bg-surface-2 peer-checked:border-signal peer-checked:outline peer-checked:outline-1 peer-checked:-outline-offset-2 peer-checked:outline-signal ${RING}`}>
                  <span aria-hidden className={`text-[20px] leading-none ${f.id === "serif" ? "font-serif" : "font-sans font-medium"}`}>
                    Aa
                  </span>
                  <span aria-hidden className="font-mono text-[12px] text-fg-2">
                    {f.name}
                  </span>
                </span>
              </Choice>
            ))}
          </div>
        </Group>

        <Group label="Size" value={`${s.size} px`}>
          <div className="flex items-stretch border border-line-strong">
            <button type="button" onClick={() => step(-1)} disabled={i === 0} aria-label={`Smaller text (now ${s.size} pixels)`} className={`${sizeBtn} border-r border-line-strong`}>
              <span aria-hidden className="text-[13px] font-semibold">
                A−
              </span>
            </button>
            <span aria-hidden className="flex flex-1 items-center justify-center gap-3">
              {TEXT_SIZES.map((n, k) => (
                <span key={n} className={`block ${k === i ? "bg-signal" : "bg-line-strong"}`} style={{ width: 6 + k * 3, height: 6 + k * 3 }} />
              ))}
            </span>
            <button type="button" onClick={() => step(1)} disabled={i === TEXT_SIZES.length - 1} aria-label={`Larger text (now ${s.size} pixels)`} className={`${sizeBtn} border-l border-line-strong`}>
              <span aria-hidden className="text-[17px] font-semibold">
                A+
              </span>
            </button>
          </div>
        </Group>

        <Group label="Spacing" value={LEADINGS.find((l) => l.id === s.leading)?.name ?? ""}>
          <Segmented name={`${name}-leading`} options={LEADINGS} value={s.leading} onPick={(leading) => updateReading({ leading })} />
        </Group>

        <Group label="Width" value={WIDTHS.find((w) => w.id === s.width)?.name ?? ""}>
          <Segmented name={`${name}-width`} options={WIDTHS} value={s.width} onPick={(width) => updateReading({ width })} />
        </Group>
      </div>
    </div>
  );
}
