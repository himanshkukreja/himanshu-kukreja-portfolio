"use client";

/** "Share" button for progress moments; opens the share sheet. */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Share2 } from "lucide-react";
import ShareSheet, { type ShareTarget } from "./ShareSheet";
import { useShare } from "./useShare";

type Variant = "ghost" | "solid" | "link" | "icon";

const LOOK: Record<Variant, string> = {
  ghost: "inline-flex min-h-11 items-center justify-center gap-2 border border-line-strong px-4 font-mono text-[13px] text-fg hover:bg-surface-2",
  solid: "inline-flex min-h-11 items-center justify-center gap-2 bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110",
  link: "inline-flex min-h-10 items-center gap-1.5 font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal",
  icon: "grid h-10 w-10 shrink-0 place-items-center border border-line-strong text-fg-2 hover:bg-surface-2 hover:text-fg",
};

export default function ShareButton({ label = "Share", variant = "ghost", className = "", ...target }: ShareTarget & { label?: string; variant?: Variant; className?: string }) {
  const [open, setOpen] = useState(false);
  const share = useShare();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // drop the cached public page so a just-earned achievement is on the page the link opens
          if (share.state?.settings?.enabled) void share.refresh(true);
        }}
        aria-label={variant === "icon" ? label : undefined}
        title={variant === "icon" ? label : undefined}
        data-share={target.kind}
        className={`${LOOK[variant]} ${className}`}
      >
        <Share2 className="h-4 w-4" aria-hidden />
        {variant !== "icon" && label}
      </button>
      {/* portal: moments (world cleared, level up) are transformed dialogs, which would trap a fixed overlay */}
      {open && createPortal(<ShareSheet target={target} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
