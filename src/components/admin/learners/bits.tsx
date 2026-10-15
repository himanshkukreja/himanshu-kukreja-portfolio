"use client";

/**
 * Small learner-analytics atoms shared by /admin/learners, /admin/learners/[id] and /admin/course:
 * avatar, week-segmented progress bar, 30-day activity strip, position cell, frequency badge.
 */
import type { ReactNode } from "react";
import { Badge, timeAgo } from "@/components/admin/ui";
import type { Frequency, LearnerRow, Position, Segment, WeekSegment } from "@/lib/admin/learners/types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Browser tz for day buckets (server defaults to Asia/Kolkata). */
export function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

export const SEGMENTS: { id: Segment | "all"; label: string; hint: string }[] = [
  { id: "all", label: "all", hint: "Everyone with an account" },
  { id: "active-now", label: "active now", hint: "Learning activity in the last 30 minutes" },
  { id: "at-risk", label: "at-risk", hint: "Active on 2+ days, then silent for 7–60 days with the course unfinished" },
  { id: "week-done", label: "cleared a week", hint: "Completed every lesson + boss of at least one week" },
  { id: "never-started", label: "never started", hint: "Signed up but never opened a lesson" },
  { id: "power", label: "power users", hint: "Active on 4+ of the last 30 days, or 5+ lessons completed" },
];

export const fmtMinutes = (sec: number) => {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
};

/** Compact hours for big numbers: 762 min → "12.7h". */
export const fmtHours = (sec: number) => (sec >= 36_000 ? `${(sec / 3600).toFixed(1)}h` : fmtMinutes(sec));

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="relative grid shrink-0 place-items-center overflow-hidden border border-line-strong bg-surface-2 font-mono text-[11px] font-semibold text-fg-2"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
      )}
    </span>
  );
}

/** One segment per week, width ∝ lessons; solid = completed, light = in-progress share. */
export function WeekBar({ weeks, className, height = 8 }: { weeks: WeekSegment[]; className?: string; height?: number }) {
  const total = weeks.reduce((a, w) => a + w.total, 0) || 1;
  return (
    <div className={cx("flex w-full gap-[2px]", className)} style={{ height }} role="img" aria-label={weeks.map((w) => `W${w.code} ${w.done}/${w.total}`).join(", ")}>
      {weeks.map((w) => {
        const done = w.total ? (w.done / w.total) * 100 : 0;
        const part = w.total ? Math.min(100 - done, (w.partial / w.total) * 100) : 0;
        return (
          <span key={w.key} title={`W${w.code} · ${w.done}/${w.total} done${w.partial ? ` · ${Math.round(w.partial * 100) / 100} in progress` : ""}`} className="relative h-full overflow-hidden bg-line" style={{ flex: `${w.total / total} 1 0` }}>
            <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${done}%` }} />
            <span className="absolute inset-y-0 bg-signal/35" style={{ left: `${done}%`, width: `${part}%` }} />
          </span>
        );
      })}
    </div>
  );
}

/** 30 squares, oldest → newest; filled when the learner did anything that day. */
export function DotStrip({ days, className }: { days: number[]; className?: string }) {
  const max = Math.max(1, ...days);
  return (
    <div className={cx("flex gap-px", className)} role="img" aria-label={`${days.filter(Boolean).length} active days in the last 30`}>
      {days.map((n, i) => (
        <span
          key={i}
          title={`${days.length - 1 - i === 0 ? "today" : `${days.length - 1 - i}d ago`}: ${n} event${n === 1 ? "" : "s"}`}
          className={cx("h-2.5 w-[3px] shrink-0", n ? "" : "bg-line")}
          style={n ? { background: `color-mix(in srgb, var(--c-signal) ${Math.round(45 + (n / max) * 55)}%, transparent)` } : undefined}
        />
      ))}
    </div>
  );
}

export const FREQ_HINT: Record<Frequency, string> = {
  daily: "15+ active days in the last 30",
  "several/wk": "6–14 active days in the last 30",
  weekly: "3–5 active days in the last 30",
  occasional: "1–2 active days in the last 30",
  dormant: "no activity in the last 30 days",
  new: "signed up this week, no activity yet",
};

export function FreqBadge({ f }: { f: Frequency }) {
  const tone = f === "daily" || f === "several/wk" ? "solid" : f === "weekly" ? "signal" : f === "occasional" ? "neutral" : "muted";
  return (
    <Badge tone={tone} title={FREQ_HINT[f]}>
      {f}
    </Badge>
  );
}

const STAGE_SRC: Record<string, string> = { event: "from a stage event", column: "saved stage", estimate: "estimated from scroll %" };

export function PositionCell({ p, compact }: { p: Position | null; compact?: boolean }) {
  if (!p) return <span className="font-mono text-xs text-fg-4">— not started</span>;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-fg-3">
        <span className="text-signal-text">{p.tag}</span>
        {p.status === "completed" ? <span className="text-ok">✓ done</span> : p.pct > 0 ? <span>{p.pct}%</span> : null}
      </div>
      <div className={cx("truncate text-[13px] font-medium text-fg", compact ? "max-w-full" : "max-w-[260px]")} title={p.title}>
        {p.title}
      </div>
      {p.stageLabel && p.status !== "completed" && (
        <div className="truncate font-mono text-[11px] text-fg-3" title={`${p.stageLabel} (${STAGE_SRC[p.stageSource || ""] || ""})`}>
          {p.stageSource === "estimate" ? "~" : "▸ "}
          {p.stageLabel}
        </div>
      )}
    </div>
  );
}

const hoursSince = (iso: string) => (Date.now() - Date.parse(iso)) / 3600_000;

export function LastSeen({ at }: { at: string | null }) {
  if (!at) return <span className="text-fg-4">never</span>;
  const ageH = hoursSince(at);
  return (
    <span title={new Date(at).toLocaleString("en-IN")} className={cx("font-mono text-xs", ageH < 0.5 ? "text-signal-text" : ageH < 24 * 7 ? "text-fg" : "text-fg-3")}>
      {ageH < 0.5 && <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 bg-signal align-middle" />}
      {timeAgo(at)}
    </span>
  );
}

export function SegmentBadges({ r }: { r: Pick<LearnerRow, "segments" | "isAdmin"> }) {
  return (
    <>
      {r.isAdmin && <Badge tone="muted">admin</Badge>}
      {r.segments.includes("active-now") && <Badge tone="solid">live</Badge>}
      {r.segments.includes("at-risk") && (
        <Badge tone="bad" title={SEGMENTS.find((s) => s.id === "at-risk")?.hint}>
          at-risk
        </Badge>
      )}
      {r.segments.includes("power") && <Badge tone="signal">power</Badge>}
    </>
  );
}

/** Label + value pair for dense stat lists. */
export function Stat({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</div>
      <div className="mt-0.5 truncate text-sm text-fg">{children}</div>
    </div>
  );
}
