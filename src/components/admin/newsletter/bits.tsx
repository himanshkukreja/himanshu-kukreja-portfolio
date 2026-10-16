"use client";

/** Small atoms shared by the /admin/newsletter screens. */
import { useEffect, useState, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/admin/ui";
import type { CampaignStatus, DisplayStatus, NewsletterInfo, SenderCheck } from "@/lib/campaigns/types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");

const CAMPAIGN_TONE: Record<CampaignStatus, BadgeTone> = { draft: "muted", scheduled: "signal", sending: "solid", paused: "neutral", sent: "ok", cancelled: "bad" };
export function CampaignBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={CAMPAIGN_TONE[status]}>{status}</Badge>;
}

const MSG_TONE: Record<DisplayStatus, BadgeTone> = { queued: "muted", sending: "neutral", sent: "neutral", failed: "bad", skipped: "muted", opened: "signal", clicked: "solid" };
export function MessageBadge({ status }: { status: DisplayStatus }) {
  return <Badge tone={MSG_TONE[status]}>{status}</Badge>;
}

export function CheckBadge({ check }: { check: SenderCheck }) {
  return (
    <Badge tone={check.level === "ok" ? "ok" : check.level === "bad" ? "bad" : "signal"} title={check.message}>
      {check.level === "ok" ? "✓ verified" : check.level === "bad" ? "✗ can't send" : "! unverified"}
    </Badge>
  );
}

/** "in 2d 4h" / "in 14m 05s" / "due now" */
export function fmtCountdown(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "due now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `in ${d}d ${h}h`;
  if (h) return `in ${h}h ${String(m).padStart(2, "0")}m`;
  return `in ${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/** One instant in the admin's zone, IST and UTC. */
export function zoned(iso: string, tz: string) {
  const d = new Date(iso);
  const f = (timeZone: string) => d.toLocaleString("en-IN", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  return { local: f(tz), ist: f("Asia/Kolkata"), utc: f("UTC") };
}

/** Value that settles `ms` after the last change (live audience counts). */
export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function Note({ tone = "neutral", title, children, className }: { tone?: "neutral" | "warn" | "bad"; title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "border px-3 py-2.5 text-sm",
        tone === "bad" ? "border-bad/50 bg-bad/5 text-fg-2" : tone === "warn" ? "border-dashed border-signal bg-signal/[0.06] text-fg-2" : "border-line bg-surface-2/50 text-fg-2",
        className
      )}
    >
      {title && <div className={cx("mb-0.5 font-mono text-[11px] uppercase tracking-label", tone === "bad" ? "text-bad-text" : tone === "warn" ? "text-signal-text" : "text-fg-3")}>{title}</div>}
      {children}
    </div>
  );
}

/** Banners for "migration not applied" and "console transport". */
export function SetupBanners({ setup }: { setup: NewsletterInfo["setup"] | undefined }) {
  if (!setup) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      {!setup.tablesReady && (
        <Note tone="bad" title="apply migration · campaigns can't be saved yet">
          The campaign tables don&apos;t exist yet ({setup.missing.join(", ")}). Apply <code className="font-mono text-xs">supabase/migrations/20261016_email_campaigns.sql</code> in the
          Supabase SQL editor. Until then you can still compose, preview and send tests; saving, sending and tracking need the tables.
        </Note>
      )}
      {setup.tablesReady && !setup.schedulingReady && (
        <Note tone="warn" title="apply migration · scheduling + story tracking are off">
          Apply <code className="font-mono text-xs">supabase/migrations/20261016_email_scheduling.sql</code> to enable scheduled sends (Supabase cron) and “already got this story” tracking. Sending now works
          without it.
        </Note>
      )}
      {setup.transportMode === "console" && (
        <Note tone="warn" title="console transport · nothing is emailed">
          This server renders every message (tests and campaigns) to its console instead of sending it. Production uses SMTP; set <code className="font-mono text-xs">EMAIL_TRANSPORT=console</code>{" "}
          there to dry-run.
        </Note>
      )}
    </div>
  );
}

export function Toggle({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex min-h-10 items-center gap-3 text-left disabled:opacity-50">
      <span aria-hidden className={cx("relative h-5 w-9 shrink-0 border", on ? "border-signal bg-signal" : "border-line-strong bg-surface-2")}>
        <span className={cx("absolute top-0.5 h-3.5 w-3.5 transition-[left]", on ? "left-[18px] bg-on-signal" : "left-0.5 bg-fg-3")} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {hint && <span className="block font-mono text-[11px] text-fg-3">{hint}</span>}
      </span>
    </button>
  );
}

export const textareaCls =
  "w-full min-w-0 resize-y border border-line-strong bg-bg px-3 py-2 text-sm leading-relaxed text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none";
export const codeAreaCls = `${textareaCls} font-mono text-[12px] leading-snug`;
