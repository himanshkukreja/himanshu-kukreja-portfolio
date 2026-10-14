"use client";

import Link from "next/link";
import { cooldownLeft, mmss, passMark, type PartRecord, type TrialPart } from "./engine";

export type PartState = "pass" | "fail" | "cur" | "open" | "lock";

export type PartView = {
  part: TrialPart;
  state: PartState;
  record?: PartRecord;
  locked: boolean;
};

/** Small mono key cap, e.g. ↵ or 1. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{children}</span>;
}

export function partCode(p: TrialPart) {
  return `P${p.n} · Q${p.first}–${p.last}`;
}

/** The week's parts as a strip of cards: passed / failed / current / open / locked. */
export default function PartsStrip({ views, hrefFor, now, highlight }: { views: PartView[]; hrefFor: (n: number) => string; now: number; highlight?: number }) {
  return (
    <ol className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-2.5 p-0">
      {views.map(({ part, state, record, locked }) => {
        const n = part.count;
        const best = record?.best ?? 0;
        const pm = passMark(n);
        const pct = n ? Math.round((best / n) * 100) : 0;
        const cd = cooldownLeft(record, now);
        const isCur = state === "cur" || highlight === part.n;
        let stateText = "";
        let stateCls = "text-fg-3";
        let note = "";
        let bar = "bg-fg-4";
        let box = "border border-line-strong bg-surface";
        let name = "text-fg";
        if (state === "pass") {
          stateText = `✓ ${best}/${n}`;
          stateCls = "text-ok";
          bar = "bg-ok";
          note = `Passed · best ${pct}%`;
        } else if (state === "fail") {
          stateText = `✕ ${record?.last?.score ?? best}/${n}`;
          stateCls = "text-bad-text";
          bar = "bg-bad";
          box = "border border-bad bg-surface";
          note = cd > 0 ? `Retry in ${mmss(cd)} · new shuffle` : `Best ${best}/${n} · needs ${pm}`;
        } else if (state === "lock") {
          stateText = "LOCKED";
          box = "border border-dashed border-line-strong bg-transparent";
          name = "text-fg-3";
          note = part.boss ? "Unlocks with the boss" : part.lesson ? `Unlocks with ${part.lesson.label}` : "Locked";
        } else {
          stateText = isCur ? "READY" : "OPEN";
          stateCls = isCur ? "text-signal-text" : "text-fg-3";
          note = best > 0 ? `Best so far ${best}/${n} · needs ${pm}` : `${n} questions · needs ${pm}`;
        }
        if (isCur && state !== "lock") {
          box = state === "fail" ? "border-2 border-bad bg-surface" : "border-2 border-signal bg-surface animate-hk-pulse";
          if (state !== "fail" && state !== "pass") name = "text-signal-text";
        }
        return (
          <li key={part.n} className="flex">
            <Link
              href={hrefFor(part.n)}
              aria-current={highlight === part.n ? "page" : undefined}
              aria-label={`Part ${part.n}: ${part.title}. ${locked ? "Locked" : stateText}. ${note}`}
              className={`flex min-h-[132px] w-full flex-col gap-2.5 p-4 text-fg no-underline transition-colors hover:border-fg-3 ${box}`}
            >
              <span className="flex justify-between gap-2 font-mono text-[11px] tracking-label">
                <span className="text-fg-3">{partCode(part)}</span>
                <span className={stateCls}>{stateText}</span>
              </span>
              <span className={`text-base font-semibold leading-snug ${name}`}>{part.title}</span>
              <span className="mt-auto block h-1 bg-surface-2" aria-hidden="true">
                <span className={`block h-1 ${bar}`} style={{ width: `${state === "lock" ? 0 : pct}%` }} />
              </span>
              <span className="text-[13px] text-fg-3">{note}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
