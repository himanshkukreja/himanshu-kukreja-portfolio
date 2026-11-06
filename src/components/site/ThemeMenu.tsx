"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Palette } from "lucide-react";
import { READ_MODES, resolveMode, updateReading, type ThemeId } from "@/lib/learn/readingModes";
import { usePageTone, useReadingSettings } from "@/components/learn/reading/useReading";

/**
 * The course header's theme button (systemdesignmastery.dev, every page but /admin): a small menu of the six
 * themes as swatches, the current one ticked. One tap switches the whole site; the choice is the same setting
 * as the theme row of the reader's "Aa" panel (src/lib/learn/readingModes.ts), so it is saved in this browser
 * and synced to the account the same way.
 */
export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const settings = useReadingSettings();
  const tone = usePageTone();
  // the server (and hydration) can't know the saved theme: no name in the label until mounted
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const current: ThemeId | null = mounted ? (tone.theme ?? resolveMode(settings.mode, tone.siteDark)) : null;
  const name = READ_MODES.find((m) => m.id === current)?.name;

  const close = (focusBack: boolean) => {
    setOpen(false);
    if (focusBack) button.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const el = menu.current;
    (el?.querySelector<HTMLElement>('[aria-checked="true"]') ?? el?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!el?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as Node;
      if (!el?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      go(at + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      go(at - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(items.length - 1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const pick = (theme: ThemeId) => {
    updateReading({ mode: theme });
    close(true);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={name ? `Theme: ${name}. Change theme` : "Change theme"}
        title="Theme"
        className={`grid h-10 w-10 place-items-center border ${open ? "border-signal text-signal-text" : "border-line-strong text-fg hover:bg-surface-2"}`}
      >
        <Palette className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label="Theme"
          onKeyDown={onKey}
          className="absolute right-0 top-[calc(100%+8px)] z-[60] w-[248px] max-w-[calc(100vw-24px)] animate-hk-in border border-line-strong bg-surface p-1.5 text-left shadow-[0_16px_48px_rgba(0,0,0,0.22)]"
        >
          <div aria-hidden className="px-2 pb-1.5 pt-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
            Theme
          </div>
          {READ_MODES.map((m) => {
            const on = m.id === current;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                tabIndex={-1}
                onClick={() => pick(m.id)}
                className={`flex min-h-11 w-full items-center gap-3 px-2 py-1.5 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal ${on ? "bg-surface-2" : ""}`}
              >
                <span aria-hidden className="relative grid h-8 w-11 shrink-0 place-items-center border border-line-strong" style={{ background: m.bg, color: m.fg }}>
                  <span className="-mt-0.5 font-display text-[14px] font-bold leading-none">Aa</span>
                  <span className="absolute bottom-1 left-1/2 h-[2px] w-5 -translate-x-1/2" style={{ background: m.accent }} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-[13px] font-semibold text-fg">{m.name}</span>
                  <span className="truncate text-[12px] text-fg-3">{m.hint}</span>
                </span>
                <span aria-hidden className={`w-4 shrink-0 text-center font-mono text-[13px] text-signal-text ${on ? "" : "invisible"}`}>
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
