"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A read-only value with a copy button (the podcast feed URL). */
export default function CopyField({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
      <span className="flex gap-2">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 flex-1 border border-line bg-bg px-3 font-mono text-[13px] text-fg" />
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(value).then(() => setDone(true))}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal hover:brightness-110"
        >
          {done ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {done ? "copied" : "copy"}
        </button>
      </span>
    </label>
  );
}
