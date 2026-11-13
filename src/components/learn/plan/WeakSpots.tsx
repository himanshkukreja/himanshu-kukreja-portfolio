"use client";

/**
 * "Drill your weak spots": the topics missed twice or more in 14 days (GET /api/learn/planning), each with a "Drill it"
 * button that opens the 3-question drill in place (DrillPanel). Shown on /memory and the dashboard; nothing when there
 * are no open struggles, the learner is a guest, or the drill feature is off.
 */
import { useState } from "react";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { usePlanning } from "./usePlanning";
import DrillPanel from "./DrillPanel";

export default function WeakSpots({ className = "" }: { className?: string }) {
  const p = usePlanning();
  const ai = useAiStatus();
  const [open, setOpen] = useState<string | null>(null);
  if (!p.signedIn || !p.ready || !ai?.signedIn || !ai.features["weak-drill"] || !p.struggles.length) return null;
  const cur = p.struggles.find((s) => s.key === open);
  return (
    <section aria-label="Weak spots" className={`flex flex-col gap-2 ${className}`}>
      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">weak spots · missed twice lately</span>
      {cur ? (
        <DrillPanel topicKey={cur.key} label={cur.label} href={cur.href} onClose={() => setOpen(null)} />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {p.struggles.slice(0, 4).map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[14px] text-fg-2 last:border-b-0">
              <span className="min-w-0">{s.label}</span>
              <button type="button" onClick={() => setOpen(s.key)} className="min-h-8 shrink-0 font-semibold text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                Drill it
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
