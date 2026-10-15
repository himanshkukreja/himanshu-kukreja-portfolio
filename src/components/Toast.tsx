"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type ToastProps = {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
};

const TAG = { success: "OK", error: "ERR", info: "INFO" } as const;

export default function Toast({ message, type = "success", onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const tone = type === "error" ? "border-bad text-bad-text" : type === "success" ? "border-signal text-signal-text" : "border-line-strong text-fg-3";

  return (
    <div role="status" aria-live="polite" style={{ top: "calc(var(--hk-header-h, 64px) + 12px)" }} className={`fixed right-4 z-[10000] flex max-w-[calc(100vw-32px)] animate-hk-in items-center gap-3 border bg-bg px-4 py-3 ${tone}`}>
      <span className="font-mono text-xs font-semibold tracking-label">{TAG[type]}</span>
      <p className="text-sm text-fg">{message}</p>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="ml-1 grid h-8 w-8 place-items-center text-fg-3 hover:text-fg">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
