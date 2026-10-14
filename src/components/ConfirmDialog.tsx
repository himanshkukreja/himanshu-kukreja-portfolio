"use client";

import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import { AlertTriangle, X } from "lucide-react";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Portals need document.body, which only exists on the client.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  if (!mounted || !isOpen) return null;

  const dialog = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="relative w-full max-w-md animate-hk-in border border-line-strong bg-surface p-6">
        <button type="button" onClick={onCancel} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center text-fg-3 hover:text-fg">
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="mb-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-bad-text" aria-hidden />
          <h3 id="confirm-title" className="font-display text-2xl font-bold tracking-[-0.02em] text-fg">{title}</h3>
        </div>
        <p className="mb-6 text-[15px] leading-relaxed text-fg-2">{message}</p>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <button type="button" autoFocus onClick={onCancel} className="min-h-11 border border-line-strong px-5 font-medium text-fg hover:bg-surface-2">
            {cancelText}
          </button>
          <button type="button" onClick={onConfirm} className="min-h-11 bg-bad px-5 font-semibold text-black hover:opacity-90">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
