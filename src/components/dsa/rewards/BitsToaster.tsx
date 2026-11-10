"use client";

/**
 * DSA Mastery's award toasts: "+35 Bits · Two Sum · solved", top right under the header, teal. Quick (2.6 s; a new
 * belt stays 5 s as a filled teal card). Several awards in one moment (a solve, the daily, a badge) stack, three at
 * most. Motion is a short slide and a pop on the number, both off with prefers-reduced-motion (globals.css).
 */
import { useEffect, useState } from "react";
import { onBits, type BitsToast } from "./award";
import { BeltSwatch } from "./BeltSwatch";
import { celebrate } from "@/lib/dsa/celebrate";

export default function BitsToaster() {
  const [toasts, setToasts] = useState<BitsToast[]>([]);
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
