"use client";

/**
 * DSA Mastery's award toasts: "+35 Bits · Two Sum · solved", top right under the header, teal. Quick (2.6 s; a new
 * belt stays 5 s as a filled teal card). Several awards in one moment (a solve, the daily, a badge) stack, three at
 * most. Motion is a short slide and a pop on the number, both off with prefers-reduced-motion (globals.css).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { onBits, onTool, type BitsToast, type ToolToast } from "./award";
import { TOOL_ICON_PATH } from "@/lib/dsa/metro/toolbox";
import { BeltSwatch } from "./BeltSwatch";
import { celebrate } from "@/lib/dsa/celebrate";

export default function BitsToaster() {
  const [toasts, setToasts] = useState<BitsToast[]>([]);
  const [tools, setTools] = useState<ToolToast[]>([]);
  // a newly earned tool (a finished station): its card stays a little longer than a Bits toast and links to the toolbox
  useEffect(
    () =>
      onTool((t) => {
        setTools((list) => [...list.slice(-1), t]);
        void celebrate("belt", null);
        window.setTimeout(() => setTools((list) => list.filter((x) => x.id !== t.id)), 6500);
      }),
    [],
  );
  useEffect(
    () =>
      onBits((t) => {
        setToasts((list) => [...list.slice(-2), t]);
        // a new belt: its card, plus a bigger confetti burst (reduced motion: nothing moves)
        if (t.belt) void celebrate("belt", null);
        window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.belt ? 5000 : 2600);
      }),
    [],
  );
  return (
    <div aria-live="polite" className="dsa-theme pointer-events-none fixed right-3 z-[60] flex max-w-[calc(100vw-24px)] flex-col items-end gap-2 sm:right-4" style={{ top: "calc(var(--hk-header-h, 64px) + 12px)" }}>
      {tools.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex animate-hk-in items-center gap-3 border border-signal bg-bg px-4 py-3 text-fg shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-signal text-on-signal" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={TOOL_ICON_PATH[t.icon]} />
            </svg>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-label text-signal-text">
              <Check className="h-3 w-3" aria-hidden /> New tool earned
            </span>
            <span className="truncate font-display text-[17px] font-extrabold leading-tight tracking-[-0.02em]">{t.name}</span>
            <span className="text-[13px] leading-snug text-fg-2">
              {t.station} station done.{" "}
              <Link href="/dsa/progress#toolbox" className="text-signal-text underline decoration-line-strong underline-offset-4">
                Open your toolbox
              </Link>
            </span>
          </span>
        </div>
      ))}
      {toasts.map((t) =>
        t.belt ? (
          <div key={t.id} role="status" className="flex animate-hk-in items-center gap-3 bg-signal px-4 py-3 text-on-signal shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
            <BeltSwatch belt={t.belt} size={30} />
            <span className="flex min-w-0 flex-col">
              <span className="font-display text-[17px] font-extrabold leading-tight tracking-[-0.02em]">{t.belt.name} belt</span>
              <span className="text-[13px] leading-snug">
                +{t.bits} Bits · {t.label}
              </span>
            </span>
          </div>
        ) : (
          <div key={t.id} role="status" className="flex animate-hk-in items-center gap-3 border border-signal bg-bg px-4 py-2.5 text-fg shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <span className="dsa-bits-pop font-mono text-base font-semibold text-signal-text">+{t.bits}</span>
            <span className="flex min-w-0 flex-col">
              <span className="font-mono text-[10.5px] uppercase tracking-label text-fg-3">{t.bits === 1 ? "Bit" : "Bits"}</span>
              <span className="truncate text-sm">{t.label}</span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}
