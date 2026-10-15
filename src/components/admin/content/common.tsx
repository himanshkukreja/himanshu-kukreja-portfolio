"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

export function SearchInput({ value, onChange, placeholder = "search…", className = "", label = "Search" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; label?: string }) {
  return (
    <label className={`relative flex min-w-0 items-center ${className}`}>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="pointer-events-none absolute left-3 font-mono text-xs text-signal-text">
        /
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-10 w-full min-w-0 border border-line-strong bg-bg pl-7 pr-3 font-mono text-[13px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
      />
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto border border-line-strong">
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={`min-h-10 shrink-0 whitespace-nowrap px-3 font-mono text-xs ${i ? "border-l border-line-strong" : ""} ${o.id === value ? "bg-fg text-bg" : "text-fg-2 hover:bg-surface-2"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-4">{hint}</span>}
    </label>
  );
}

export const inputCls = "min-h-10 w-full min-w-0 border border-line-strong bg-bg px-3 text-sm text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none";
export const btnCls = "inline-flex min-h-10 items-center justify-center gap-2 border border-line-strong px-3 font-mono text-xs text-fg hover:bg-surface-2 disabled:opacity-40";
export const primaryBtnCls = "inline-flex min-h-10 items-center justify-center gap-2 bg-signal px-4 font-mono text-xs font-semibold text-on-signal hover:brightness-110 disabled:opacity-40";

export type Flash = { id: number; text: string; tone: "ok" | "bad" } | null;

/** Small transient status line for content actions. */
export function useFlash() {
  const [flash, setFlash] = useState<Flash>(null);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 4500);
    return () => window.clearTimeout(t);
  }, [flash]);
  const say = useCallback((text: string, tone: "ok" | "bad" = "ok") => setFlash({ id: Date.now(), text, tone }), []);
  return { flash, say, clear: () => setFlash(null) };
}

export function FlashLine({ flash, onDismiss }: { flash: Flash; onDismiss: () => void }) {
  if (!flash) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] left-3 right-3 z-[75] flex animate-hk-in items-center gap-3 py-2 pl-4 pr-2 lg:bottom-6 lg:left-auto lg:right-6 lg:max-w-[440px] ${flash.tone === "bad" ? "bg-bad text-white" : "bg-fg text-bg"}`}
    >
      <span className="font-mono text-xs">{flash.tone === "bad" ? "✗" : "✓"}</span>
      <span className="min-w-0 flex-1 text-sm font-semibold">{flash.text}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid h-10 w-10 shrink-0 place-items-center opacity-70 hover:opacity-100">
        ×
      </button>
    </div>
  );
}

/** Saves a text payload as a file (CSV export). */
export function downloadText(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
