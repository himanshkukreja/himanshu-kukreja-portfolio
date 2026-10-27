"use client";

/** A war story's "watch the short" card: opens its vertical short in a phone-shaped player, with a way into the feed. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import type { WarShort } from "@/lib/learn/war/load";
import ShortPlayer from "./ShortPlayer";

export default function ShortEntry({ short }: { short: WarShort }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group flex items-center gap-4 border border-line-strong bg-surface p-4 text-left hover:border-signal sm:p-5">
        <span className="grid h-14 w-10 shrink-0 place-items-center border border-line-strong bg-[#0b0b0c] text-signal-text">
          <Smartphone className="h-5 w-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">the short · vertical</span>
          <span className="font-display text-[18px] font-bold leading-tight text-fg group-hover:text-signal-text">Watch it as a {Math.max(1, Math.round(short.seconds / 60))}-minute short</span>
          <span className="text-[13px] leading-snug text-fg-3">Made for your phone, with big captions. Swipe on to the next story in the shorts feed.</span>
        </span>
      </button>
      {open && (
        <div role="dialog" aria-label={`Short: ${short.title}`} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-3" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="flex h-full max-h-[min(92dvh,900px)] flex-col items-center gap-2">
            <div className="flex w-full items-center justify-between gap-3 font-mono text-xs text-[#c9c8c4]">
              <Link href={`/learn/war-stories/shorts?v=${short.slug}`} className="underline decoration-[#3a3a40] underline-offset-4 hover:text-white">
                all shorts →
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-10 w-10 place-items-center text-[#c9c8c4] hover:text-white">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <ShortPlayer short={short} className="min-h-0 w-auto flex-1" />
          </div>
        </div>
      )}
    </>
  );
}
