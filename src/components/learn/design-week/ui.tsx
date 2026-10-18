"use client";

/** Small Design of the week atoms (Level Up: square corners, 1px rules, mono labels, signal orange). */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Author, Phase } from "@/lib/design-week/core";
import { PHASE_LABEL } from "@/lib/design-week/core";
import type { SubmissionCard } from "@/lib/design-week/views";

export { BTN, BTN_GHOST, Kicker, LABEL, PageTitle, SectionTitle } from "@/components/learn/arena/ui";

export const BASE = "/learn/design-week";

export const fmtIst = (iso: string, withDay = true) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}), hour: "2-digit", minute: "2-digit", hour12: false })} IST`;
};

export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

export function PhaseBadge({ phase, className = "" }: { phase: Phase; className?: string }) {
  const live = phase === "open" || phase === "voting";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-label ${
        live ? "bg-signal text-on-signal" : phase === "closed" ? "border border-line-strong text-fg-2" : "border border-signal text-signal-text"
      } ${className}`}
    >
      {live && <span aria-hidden className="h-1.5 w-1.5 animate-pulse bg-on-signal" />}
      {PHASE_LABEL[phase]}
    </span>
  );
}

/** Live countdown to `at` ("2d 04h 11m"); the server render shows the absolute time. */
export function Countdown({ at, label, className = "" }: { at: string; label: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  const ms = now === null ? null : Date.parse(at) - now;
  let text = fmtIst(at);
  if (ms !== null && ms > 0) {
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    text = d > 0 ? `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m` : `${h}h ${String(m).padStart(2, "0")}m`;
  }
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 ${className}`}>
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
      <time dateTime={at} title={fmtIst(at)} className="font-mono text-sm font-semibold tabular-nums text-fg">
        {text}
      </time>
    </span>
  );
}

export function AuthorChip({ author, size = "sm" }: { author: Author; size?: "sm" | "md" }) {
  const box = size === "md" ? "h-10 w-10 text-sm" : "h-7 w-7 text-[11px]";
  const face = author.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={author.avatar} alt="" className={`${box} shrink-0 border border-line-strong object-cover`} referrerPolicy="no-referrer" />
  ) : (
    <span aria-hidden className={`${box} grid shrink-0 place-items-center border border-line-strong font-mono ${author.anonymous ? "text-fg-4" : "text-fg-2"}`}>
      {author.anonymous ? "?" : author.initials}
    </span>
  );
  const label = author.anonymous ? "Anonymous learner" : author.name || `@${author.handle}`;
  const inner = (
    <span className="flex min-w-0 items-center gap-2.5">
      {face}
      <span className="min-w-0">
        <span className={`block truncate ${size === "md" ? "text-[15px]" : "text-[13px]"} font-semibold ${author.anonymous ? "text-fg-3" : "text-fg"}`}>{label}</span>
        {!author.anonymous && author.name && <span className="block truncate font-mono text-[11px] text-fg-3">@{author.handle}</span>}
      </span>
    </span>
  );
  if (author.anonymous || !author.handle) return inner;
  return (
    <Link href={`/u/${author.handle}`} className="min-w-0 hover:[&_span]:text-signal-text">
      {inner}
    </Link>
  );
}

export function Place({ place }: { place: number | null }) {
  if (!place) return null;
  return place === 1 ? (
    <span className="inline-flex items-center gap-1 bg-signal px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-label text-on-signal">★ design of the week</span>
  ) : (
    <span className="inline-flex items-center border border-signal px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-label text-signal-text">featured</span>
  );
}

export function SubmissionTile({ s, action, highlight = false }: { s: SubmissionCard; action?: ReactNode; highlight?: boolean }) {
  return (
    <li className={`flex min-w-0 flex-col gap-3 border p-4 sm:p-5 ${highlight || s.place === 1 ? "border-signal bg-surface" : "border-line bg-surface"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Place place={s.place} />
        <span className="ml-auto font-mono text-[11px] uppercase tracking-label text-fg-3">
          {s.diagrams ? `${s.diagrams} diagram${s.diagrams === 1 ? "" : "s"} · ` : ""}
          {s.words.toLocaleString("en-US")} words
        </span>
      </div>
      <Link href={s.href} className="group flex min-w-0 flex-col gap-1.5">
        <span className="font-display text-[21px] font-bold leading-[1.1] tracking-[-0.02em] text-fg group-hover:text-signal-text sm:text-[23px]">{s.title}</span>
        <span className="line-clamp-3 text-[14px] leading-snug text-fg-2">{s.excerpt}</span>
      </Link>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <AuthorChip author={s.author} />
        <span className="flex items-center gap-2">
          {s.votes !== null && (
            <span className="font-mono text-sm font-semibold tabular-nums text-fg">
              {s.votes} <span className="font-normal text-fg-3">vote{s.votes === 1 ? "" : "s"}</span>
            </span>
          )}
          {action}
        </span>
      </div>
    </li>
  );
}

export function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "signal" | "bad" }) {
  const cls = tone === "signal" ? "border-signal bg-signal/10" : tone === "bad" ? "border-bad bg-bad/10" : "border-line-strong";
  return <div className={`border border-dashed ${cls} px-4 py-3 text-[14px] leading-relaxed text-fg-2`}>{children}</div>;
}
