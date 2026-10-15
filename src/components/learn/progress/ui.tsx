/** Small presentational pieces shared by the progress page sections (Level Up style). */
import type { ReactNode } from "react";

export function SectionHead({ id, n, kicker, title, right }: { id: string; n: string; kicker: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          <span className="text-signal-text">{n}</span> · {kicker}
        </span>
        <h2 id={id} className="font-display text-[28px] font-extrabold leading-[1] tracking-[-0.035em] text-fg sm:text-[36px]">
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[11px] uppercase tracking-label text-fg-3 ${className}`}>{children}</span>;
}

export function Stat({ value, unit, label, sub, accent = false }: { value: ReactNode; unit?: ReactNode; label: string; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-bg p-4 sm:p-5">
      <Label>{label}</Label>
      <span className={`font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] sm:text-[38px] ${accent ? "text-signal-text" : "text-fg"}`}>
        {value}
        {unit && <span className="ml-0.5 font-mono text-[13px] font-normal tracking-normal text-fg-3">{unit}</span>}
      </span>
      {sub && <span className="text-[12px] leading-snug text-fg-3">{sub}</span>}
    </div>
  );
}

export function Bar({ pct, className = "h-1.5", label }: { pct: number; className?: string; label?: string }) {
  return (
    <span role={label ? "progressbar" : undefined} aria-label={label} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined} aria-valuenow={label ? pct : undefined} className={`block bg-surface-2 ${className}`}>
      <span className={`block bg-signal ${className}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}
