"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Palette } from "lucide-react";
import { EDITOR_PICKS, resolveEditorPalette, type EditorPick } from "@/lib/editor/themes";
import { useEditorTheme } from "./useEditorTheme";
import { usePageTone } from "@/components/learn/reading/useReading";

/**
 * The editor's theme button for a toolbar: a small menu (Match site theme, then the manual themes), the current
 * pick ticked. Arrow keys / Home / End move, Enter or Space picks, Escape closes back to the button.
 */
export default function EditorThemeMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const { pick, setPick } = useEditorTheme();
  const { theme, siteDark } = usePageTone();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const shown: EditorPick = mounted ? pick : "site";
  const name = EDITOR_PICKS.find((p) => p.id === shown)?.name;

  const close = (focusBack: boolean) => {
    setOpen(false);
    if (focusBack) button.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const el = menu.current;
    (el?.querySelector<HTMLElement>('[aria-checked="true"]') ?? el?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus({ preventScroll: true });
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!el?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    const keys: Record<string, () => void> = {
      Escape: () => close(true),
      ArrowDown: () => go(at + 1),
      ArrowUp: () => go(at - 1),
      Home: () => go(0),
      End: () => go(items.length - 1),
    };
    if (e.key === "Tab") return setOpen(false);
    if (keys[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      keys[e.key]();
    }
  };

  return (
    <div className={`relative shrink-0 ${className}`}>
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
        aria-label={name ? `Editor theme: ${name}. Change editor theme` : "Change editor theme"}
        title="Editor theme"
        data-hk-editor-theme=""
        className={`inline-flex min-h-10 items-center gap-1.5 border px-2.5 font-mono text-[12px] ${open ? "border-signal text-signal-text" : "border-line-strong text-fg-2 hover:bg-surface-2 hover:text-fg"}`}
      >
        <Palette className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">theme</span>
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label="Editor theme"
          onKeyDown={onKey}
          className="absolute right-0 top-[calc(100%+6px)] z-[60] max-h-[min(70dvh,420px)] w-[248px] max-w-[calc(100vw-24px)] overflow-y-auto border border-line-strong bg-surface p-1.5 text-left shadow-[0_16px_48px_rgba(0,0,0,0.22)]"
        >
          {EDITOR_PICKS.map((m) => {
            const on = m.id === shown;
            const p = resolveEditorPalette(m.id, theme, siteDark);
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                tabIndex={-1}
                onClick={() => {
                  setPick(m.id);
                  close(true);
                }}
                className={`flex min-h-11 w-full items-center gap-3 px-2 py-1.5 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal ${on ? "bg-surface-2" : ""}`}
              >
                <span aria-hidden className="grid h-8 w-11 shrink-0 place-items-center border border-line-strong font-mono text-[12px] font-bold leading-none" style={{ background: p.bg, color: p.fg }}>
                  <span>
                    <span style={{ color: p.kw }}>fn</span>
                    <span style={{ color: p.str }}>{" •"}</span>
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-[13px] font-semibold text-fg">{m.name}</span>
                  <span className="text-[12px] leading-snug text-fg-3">{m.hint}</span>
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
