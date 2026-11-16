"use client";

/**
 * A panel that opens over the problem page's left pane (the tutor, the interview). On phones it covers the page under
 * the site header. Once opened it stays mounted (hidden when closed), so a streaming answer or a round in progress is
 * never lost by closing the drawer. Escape closes it; focus goes to its close button when it opens.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Drawer({ open, label, onClose, children }: { open: boolean; label: string; onClose: () => void; children: ReactNode }) {
  const [used, setUsed] = useState(open);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // mounted on first open, kept after
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsed(true);
    close.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!used) return null;
  return (
    <div
      hidden={!open}
      role="dialog"
      aria-label={label}
      className={`${open ? "flex" : "hidden"} fixed inset-x-0 bottom-0 top-[var(--hk-header-h,61px)] z-[61] flex-col border border-line-strong bg-surface lg:absolute lg:inset-0 lg:z-30 lg:border-0`}
      data-drawer={label}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-fg-3">{label}</span>
        <button ref={close} type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-1.5 px-2 text-[13px] text-fg-2 hover:text-fg [@media(pointer:coarse)]:min-h-11">
          <X className="h-4 w-4" aria-hidden /> Close
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
