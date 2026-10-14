"use client";

import Link from "next/link";

export type MiniToastState = {
  id: number;
  text: string;
  tone?: "plain" | "xp";
  xp?: number;
  action?: { label: string; onClick: () => void };
  link?: { label: string; href: string };
} | null;

/** Small status toast (top right on desktop, above the dock on phones). */
export default function MiniToast({ toast, onDismiss }: { toast: MiniToastState; onDismiss: () => void }) {
  if (!toast) return null;
  const xp = toast.tone === "xp";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] left-3 right-3 z-[75] flex animate-hk-in items-center gap-3 py-2 pl-4 pr-2 sm:bottom-auto sm:left-auto sm:right-6 sm:top-[calc(var(--hk-header-h,61px)+var(--learn-nav-h,48px)+16px)] sm:max-w-[440px] ${
        xp ? "bg-signal text-on-signal" : "bg-fg text-bg"
      }`}
    >
      {xp && toast.xp ? <span className="font-mono font-semibold">+{toast.xp} XP</span> : null}
      <span className="min-w-0 flex-1 text-sm font-semibold">{toast.text}</span>
      {toast.action && (
        <button type="button" onClick={toast.action.onClick} className={`min-h-10 px-3.5 text-sm font-semibold ${xp ? "bg-on-signal text-signal" : "bg-bg text-fg"}`}>
          {toast.action.label}
        </button>
      )}
      {toast.link && (
        <Link href={toast.link.href} className="inline-flex min-h-10 items-center bg-signal px-3.5 text-sm font-semibold text-on-signal">
          {toast.link.label}
        </Link>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid h-10 w-10 shrink-0 place-items-center text-base opacity-70 hover:opacity-100">
        ×
      </button>
    </div>
  );
}
