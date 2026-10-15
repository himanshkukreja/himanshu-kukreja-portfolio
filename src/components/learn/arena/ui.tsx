"use client";

/** Small Arena building blocks (Level Up design system: square corners, 1px rules, mono labels). */
import Link from "next/link";
import type { ReactNode } from "react";
import { LEAGUES } from "@/lib/learn/arena/shared";

export const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";
export const BTN = "inline-flex min-h-11 items-center justify-center gap-2 px-5 bg-signal font-mono text-sm font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_GHOST =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-line-strong px-4 font-mono text-[13px] text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

export function Kicker({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs uppercase tracking-label text-signal-text">{children}</span>;
}

export function PageTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h1 id={id} className="font-display text-[clamp(44px,7vw,96px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
      {children}
      <span className="text-signal-text">.</span>
    </h1>
  );
}

export function SectionTitle({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id={id} className="font-display text-[28px] font-bold tracking-[-0.025em] text-fg sm:text-[34px]">
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function TierBadge({ tier, size = "sm" }: { tier: number; size?: "sm" | "md" }) {
  const l = LEAGUES[tier] || LEAGUES[0];
  const top = tier >= 4;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 font-mono font-semibold ${size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[11px]"} ${
        top ? "bg-signal text-on-signal" : tier >= 2 ? "border border-signal text-signal-text" : "border border-line-strong text-fg-2"
      }`}
    >
      {l.code}
      <span className="font-normal">{l.name}</span>
    </span>
  );
}

export function BackLink({ href = "/learn/arena", children = "arena" }: { href?: string; children?: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center gap-1.5 font-mono text-[13px] text-fg-3 hover:text-fg">
      <span aria-hidden>←</span> {children}
    </Link>
  );
}

export function Stat({ value, label, accent = false }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-bg px-4 py-3">
      <span className={`font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] ${accent ? "text-signal-text" : "text-fg"}`}>{value}</span>
      <span className="text-[13px] text-fg-3">{label}</span>
    </div>
  );
}

/** Wordle-style result squares (no emoji): filled = right. */
export function ResultSquares({ results, size = 18 }: { results: boolean[]; size?: number }) {
  return (
    <span role="img" aria-label={`${results.filter(Boolean).length} of ${results.length} right`} className="inline-flex gap-1">
      {results.map((r, i) => (
        <span key={i} aria-hidden className={r ? "bg-signal" : "border border-line-strong"} style={{ width: size, height: size }} />
      ))}
    </span>
  );
}

export function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

/** ms until the next 00:00 Asia/Kolkata */
export function msToIstMidnight(now = Date.now()): number {
  const day = 86_400_000;
  const off = 330 * 60_000;
  return day - ((now + off) % day);
}
