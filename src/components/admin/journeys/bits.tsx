"use client";

/** Shared atoms for /admin/journeys (Level Up admin kit on top of ../ui). */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { ErrorState, LABEL, RangePicker, useRange, type AdminError, type Range } from "@/components/admin/ui";
import type { TimelineKind } from "@/lib/analytics/journeys";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  const A = 0x1f1e6;
  const up = code.toUpperCase();
  return String.fromCodePoint(A + up.charCodeAt(0) - 65, A + up.charCodeAt(1) - 65);
}

export const place = (city: string | null | undefined, country: string | null | undefined) =>
  [countryFlag(country), [city, country].filter(Boolean).join(", ")].filter(Boolean).join(" ") || "unknown place";

/** 0:42 / 12:05 / 1:02:09 */
export function clock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
};

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export const dayLabel = (iso: string, now: number) => {
  const d = new Date(iso);
  const today = new Date(now);
  const y = new Date(now - 86400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "today";
  if (same(d, y)) return "yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" }).toLowerCase();
};

/** Days window from the shared ?range= picker (24h / 7d / 30d / 90d). */
export const RANGE_DAYS: Partial<Record<Range, number>> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };
export function useDays(fallback: Range = "30d") {
  const r = useRange(fallback);
  return RANGE_DAYS[r] ?? 30;
}
export function DaysPicker({ fallback = "30d" }: { fallback?: Range }) {
  return <RangePicker options={["24h", "7d", "30d", "90d"]} fallback={fallback} />;
}

/** Update a few query params in place (replace, no scroll). */
export function useSetParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params]
  );
}

/* ───────────────────────────── event kinds ───────────────────────────── */

export const KIND_META: Record<TimelineKind, { glyph: string; tone: "signal" | "bad" | "ok" | "muted"; name: string }> = {
  pageview: { glyph: "→", tone: "muted", name: "page" },
  click: { glyph: "⌖", tone: "muted", name: "click" },
  form: { glyph: "✎", tone: "muted", name: "form" },
  rage: { glyph: "‼", tone: "bad", name: "frustration" },
  read: { glyph: "▤", tone: "ok", name: "reading" },
  quiz: { glyph: "?", tone: "ok", name: "quiz" },
  lesson: { glyph: "★", tone: "signal", name: "learning" },
  ai: { glyph: "✦", tone: "signal", name: "ask ai" },
  share: { glyph: "↗", tone: "signal", name: "share" },
  signin: { glyph: "⎆", tone: "signal", name: "sign in" },
  search: { glyph: "⌕", tone: "muted", name: "search" },
  play: { glyph: "◆", tone: "muted", name: "play" },
  error: { glyph: "!", tone: "bad", name: "error" },
  event: { glyph: "·", tone: "muted", name: "event" },
};

export function KindMark({ kind, className }: { kind: TimelineKind; className?: string }) {
  const m = KIND_META[kind] ?? KIND_META.event;
  const tone =
    m.tone === "signal"
      ? "border-signal bg-signal text-on-signal"
      : m.tone === "bad"
        ? "border-bad bg-bad/15 text-bad-text"
        : m.tone === "ok"
          ? "border-ok/70 bg-surface text-ok"
          : "border-line-strong bg-surface text-fg-3";
  return (
    <span aria-hidden title={m.name} className={cx("grid h-6 w-6 shrink-0 place-items-center border font-mono text-[12px] leading-none", tone, className)}>
      {m.glyph}
    </span>
  );
}

/* ───────────────────────────── small atoms ───────────────────────────── */

export function Who({ who, identified, href, className }: { who: string; identified: boolean; href?: string; className?: string }) {
  const body = (
    <>
      <span aria-hidden className={cx("h-2 w-2 shrink-0", identified ? "bg-signal" : "border border-fg-4")} />
      <span className="min-w-0 truncate">{who}</span>
    </>
  );
  const cls = cx("inline-flex min-w-0 max-w-full items-center gap-1.5 font-mono text-xs", identified ? "text-fg" : "text-fg-2", className);
  return href ? (
    <Link href={href} className={cx(cls, "hover:text-signal-text hover:underline hover:underline-offset-4")}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={LABEL}>{label}</div>
      <div className="mt-0.5 truncate text-sm text-fg">{children}</div>
    </div>
  );
}

export const personHref = (id: string) => `/admin/journeys/person/${encodeURIComponent(id)}`;

export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx("inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:border-signal hover:text-signal-text", className)}
    >
      {children} <span aria-hidden>↗</span>
    </a>
  );
}

/** ErrorState that explains a missing personal-API-key scope (424) instead of a generic failure. */
export function PhErrorState({ error, onRetry, title, className, scope }: { error?: AdminError | string | null; onRetry?: () => void; title?: ReactNode; className?: string; scope?: string | null }) {
  const status = typeof error === "object" && error ? error.status : undefined;
  const msg = typeof error === "string" ? error : error?.message || "";
  const sc = scope || (status === 424 ? (msg.match(/“([a-z_]+:(?:read|write))”/) || [])[1] : null);
  if (!sc) return <ErrorState error={error} onRetry={onRetry} title={title} className={className} />;
  return (
    <div role="alert" className={cx("flex flex-col items-start gap-2 border border-dashed border-signal bg-signal/5 px-4 py-4", className)}>
      <span className="font-mono text-xs text-signal-text">scope missing · {sc}</span>
      <p className="text-sm font-semibold text-fg">This part needs one more permission on the PostHog key</p>
      <p className="max-w-prose text-[13px] text-fg-3">
        PostHog → Account settings → Personal API keys → edit the key used for POSTHOG_PERSONAL_API_KEY → add <b className="font-mono text-fg">{sc}</b>. No
        redeploy needed; retry after saving.
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:bg-surface-2">
          ↻ retry
        </button>
      )}
    </div>
  );
}
