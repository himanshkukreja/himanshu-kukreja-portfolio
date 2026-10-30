"use client";

/** "Clipped to <page> · open" (and the snip / error versions): the site's toast, with a way into the notebook. */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { openNotebookPanel } from "./api";
import type { CaptureToastDetail } from "./events";

const DURATION = 5000;

export default function CaptureToast({ toast, onClose }: { toast: CaptureToastDetail; onClose: () => void }) {
  const [held, setHeld] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (held) return;
    const t = window.setTimeout(() => closeRef.current(), toast.kind === "error" ? DURATION + 2000 : DURATION);
    return () => window.clearTimeout(t);
  }, [held, toast]);

  const saved = toast.kind === "clip" || toast.kind === "snip";
  const tone = toast.kind === "error" ? "border-bad text-bad-text" : saved ? "border-signal text-signal-text" : "border-line-strong text-fg-3";
  const tag = toast.kind === "error" ? "ERR" : saved ? "OK" : "INFO";

  return (
    <div
      role="status"
      aria-live="polite"
      data-hk-capture-toast=""
      data-sd-chrome=""
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      style={{ top: "calc(var(--hk-header-h, 64px) + 12px)" }}
      className={`fixed right-4 z-[10000] flex max-w-[calc(100vw-32px)] items-center gap-3 border bg-bg py-2 pl-4 pr-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] motion-safe:animate-hk-in ${tone}`}
    >
      <span className="font-mono text-xs font-semibold tracking-label">{tag}</span>
      {toast.kind === "clip" || toast.kind === "snip" ? (
        <p className="m-0 min-w-0 text-sm text-fg">
          {toast.kind === "clip" ? "Clipped to " : "Snipped to "}
          <strong className="font-semibold">{toast.pageTitle}</strong>
          {toast.note ? <span className="text-fg-3"> ({toast.note})</span> : null}
          <span aria-hidden="true" className="text-fg-3">
            {" · "}
          </span>
          <button
            type="button"
            onClick={() => {
              openNotebookPanel({ pageId: toast.pageId });
              onClose();
            }}
            className="inline min-h-[32px] font-mono text-[13px] font-semibold text-signal-text underline decoration-signal underline-offset-4 hover:text-fg"
            aria-label={`Open ${toast.pageTitle} in the notebook`}
          >
            open
          </button>
        </p>
      ) : (
        <p className="m-0 text-sm text-fg">{"message" in toast ? toast.message : ""}</p>
      )}
      <button type="button" onClick={onClose} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center text-fg-3 hover:text-fg">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
