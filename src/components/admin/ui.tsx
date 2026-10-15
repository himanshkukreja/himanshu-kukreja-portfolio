"use client";

/**
 * Admin UI kit ("Level Up" design): square corners, 1px borders, orange signal, mono labels,
 * display font for big numbers, dark + light via the --c-* tokens. Every /admin screen builds on
 * these. Charts are hand-written SVG: orange = primary series, fg-3 = secondary, line = grid.
 *
 * Data: `useAdminData(url)` fetches through the admin client (Bearer token). A 401 tells the
 * admin shell to drop to the "403 · sudo required" screen. In the dev-only preview mode the shell
 * swaps the client for a fixture resolver (see shell/AdminRuntime).
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { adminFetch, adminJson } from "@/lib/admin/fetch";

/* ───────────────────────────── formatting ───────────────────────────── */

export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: digits });

/** 1234 → 1.2k, 1_200_000 → 1.2M */
export const fmtCompact = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return fmtNum(n);
};

/** 0.423 → "42.3%" (fractions) */
export const fmtPct = (f: number | null | undefined, digits = 1) =>
  f == null || Number.isNaN(f) ? "—" : `${(f * 100).toFixed(digits).replace(/\.0+$/, "")}%`;

/** seconds → "2m 05s" / "45s" / "1h 02m" */
export const fmtDuration = (sec: number | null | undefined) => {
  if (sec == null || Number.isNaN(sec)) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

export const timeAgo = (iso: string | number | Date | null | undefined, now = Date.now()) => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
};

export const fmtDate = (iso: string | number | Date | null | undefined, withTime = false) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};

/** Stable "now" for render-time date maths (React purity); re-ticks every `everyMs` if given. */
export function useNow(everyMs?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!everyMs) return;
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Mono label class used across admin. */
export const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

/* ─────────────────────── runtime (client, 401, preview) ─────────────────────── */

export type AdminClient = {
  /** JSON request to an admin API; throws Error & { status } on non-2xx. */
  json: <T>(url: string, init?: RequestInit) => Promise<T>;
  /** Text request (HTML previews, CSV exports); same error contract as `json`. */
  text: (url: string, init?: RequestInit) => Promise<string>;
  /** true in the dev-only preview (fixture data, writes are simulated). */
  preview: boolean;
  /** Called on a 401 so the shell can drop to the 403 screen. */
  onUnauthorized: () => void;
};

/** Text variant of adminJson (Bearer token attached, throws Error & { status } on non-2xx). */
export async function adminText(url: string, init: RequestInit = {}): Promise<string> {
  const res = await adminFetch(url, init);
  const body = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = JSON.parse(body)?.error || msg;
    } catch {
      /* not JSON */
    }
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return body;
}

const defaultClient: AdminClient = { json: adminJson, text: adminText, preview: false, onUnauthorized: () => {} };
export const AdminClientContext = createContext<AdminClient>(defaultClient);
export const useAdminClient = () => useContext(AdminClientContext);

export type AdminError = Error & { status?: number };

type DataState<T> = { key: string; data?: T; error?: AdminError };

/**
 * GET an admin API. `url = null` skips the request. Keeps the last data while refreshing.
 * `refreshMs` polls (e.g. live visitors). Returns { data, error, loading, refresh, mutate }.
 */
export function useAdminData<T>(url: string | null, opts: { refreshMs?: number } = {}) {
  const client = useAdminClient();
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<DataState<T>>({ key: "" });
  const key = url ? `${url}#${nonce}` : "";
  const { refreshMs } = opts;

  useEffect(() => {
    if (!url) return;
    let off = false;
    client
      .json<T>(url)
      .then((data) => {
        if (!off) setState({ key, data });
      })
      .catch((e: AdminError) => {
        if (off) return;
        if (e?.status === 401) client.onUnauthorized();
        setState((s) => ({ key, data: s.data, error: e instanceof Error ? e : new Error(String(e)) }));
      });
    return () => {
      off = true;
    };
  }, [url, key, client]);

  useEffect(() => {
    if (!url || !refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setNonce((n) => n + 1);
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [url, refreshMs]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const mutate = useCallback((fn: (d: T | undefined) => T | undefined) => setState((s) => ({ ...s, data: fn(s.data) })), []);
  const settled = state.key === key;
  // Keep data from the same URL while a refresh is in flight; drop it when the URL changes.
  const sameUrl = state.key.slice(0, state.key.lastIndexOf("#")) === url;
  return {
    data: sameUrl ? state.data : undefined,
    error: settled ? state.error : undefined,
    loading: !!url && !settled,
    refresh,
    mutate,
  };
}

/* ───────────────────────────── range ───────────────────────────── */

export const RANGES = ["24h", "7d", "30d", "90d", "12m"] as const;
export type Range = (typeof RANGES)[number];
const isRange = (v: string | null): v is Range => !!v && (RANGES as readonly string[]).includes(v);

/** Current `?range=` (default 7d). */
export function useRange(fallback: Range = "7d"): Range {
  const v = useSearchParams().get("range");
  return isRange(v) ? v : fallback;
}

/** Segmented 24h/7d/30d/90d/12m control, synced to `?range=` (replace, no scroll). */
export function RangePicker({
  options = RANGES,
  fallback = "7d",
  onChange,
  className,
}: {
  options?: readonly Range[];
  fallback?: Range;
  onChange?: (r: Range) => void;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = useRange(fallback);
  const pick = (r: Range) => {
    const next = new URLSearchParams(params.toString());
    next.set("range", r);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    onChange?.(r);
  };
  return (
    <div role="radiogroup" aria-label="Date range" className={cx("inline-flex border border-line-strong", className)}>
      {options.map((r, i) => {
        const on = r === value;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => pick(r)}
            className={cx(
              "min-h-10 min-w-11 px-2.5 font-mono text-xs",
              i > 0 && "border-l border-line-strong",
              on ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2 hover:text-fg"
            )}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── layout atoms ───────────────────────────── */

export function Card({
  title,
  label,
  action,
  children,
  className,
  bodyClassName,
  pad = true,
  id,
}: {
  /** Display heading (sentence). */
  title?: ReactNode;
  /** Mono eyebrow label above/instead of the title. */
  label?: ReactNode;
  /** Right side of the header (links, toggles). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  pad?: boolean;
  id?: string;
}) {
  const head = title || label || action;
  return (
    <section id={id} className={cx("min-w-0 border border-line bg-surface", className)}>
      {head && (
        <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {label && <div className={LABEL}>{label}</div>}
            {title && <h2 className="truncate text-[15px] font-semibold text-fg">{title}</h2>}
          </div>
          {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cx(pad && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return (
    <span aria-hidden className={cx("relative block overflow-hidden bg-surface-2", className)}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-fg/5 to-transparent" />
    </span>
  );
}

export function EmptyState({ title = "Nothing here yet", hint, action, className }: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-start gap-2 border border-dashed border-line-strong px-4 py-6", className)}>
      <span className="font-mono text-xs text-fg-3">$ ls → 0 results</span>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {hint && <p className="max-w-prose text-sm text-fg-3">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = "Couldn't load this",
  className,
}: {
  error?: AdminError | string | null;
  onRetry?: () => void;
  title?: ReactNode;
  className?: string;
}) {
  const msg = typeof error === "string" ? error : error?.message || "Unknown error";
  const status = typeof error === "object" && error ? error.status : undefined;
  return (
    <div role="alert" className={cx("flex flex-col items-start gap-2 border border-bad/50 bg-bad/5 px-4 py-4", className)}>
      <span className="font-mono text-xs text-bad-text">
        ERR{status ? ` ${status}` : ""} · {status === 404 ? "endpoint not live yet" : "request failed"}
      </span>
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="break-words font-mono text-xs text-fg-3">{msg}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:bg-surface-2">
          ↻ retry
        </button>
      )}
    </div>
  );
}

export type BadgeTone = "neutral" | "signal" | "ok" | "bad" | "muted" | "solid";
export function Badge({ tone = "neutral", children, className, title }: { tone?: BadgeTone; children: ReactNode; className?: string; title?: string }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "border border-line-strong text-fg-2",
    muted: "border border-dashed border-line-strong text-fg-4",
    signal: "border border-signal text-signal-text",
    solid: "bg-signal text-on-signal",
    ok: "border border-ok/60 text-ok",
    bad: "border border-bad/60 text-bad-text",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-0.5 font-mono text-[11px] leading-4", tones[tone], className)}>
      {children}
    </span>
  );
}

/* ───────────────────────────── KPI + sparkline ───────────────────────────── */

export function Sparkline({
  values,
  width = 96,
  height = 28,
  className,
  color = "var(--c-signal)",
  area = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  color?: string;
  area?: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  if (!values || values.length < 2) return <span className={className} style={{ width, height, display: "inline-block" }} />;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 2) + 1, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      {area && (
        <>
          <defs>
            <linearGradient id={`sg${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.22" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d}L${last[0]},${height}L${pts[0][0]},${height}Z`} fill={`url(#sg${gid})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <rect x={last[0] - 2} y={last[1] - 2} width="4" height="4" fill={color} />
    </svg>
  );
}

/** Relative change; null when there is no meaningful previous value. */
export const deltaOf = (cur?: number | null, prev?: number | null) =>
  cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0 ? null : (cur - prev) / Math.abs(prev);

export function Kpi({
  label,
  value,
  current,
  previous,
  delta,
  invert = false,
  spark,
  hint,
  loading,
  href,
  className,
}: {
  label: ReactNode;
  /** Formatted headline value. */
  value: ReactNode;
  /** Numeric current/previous to compute the delta (or pass `delta` as a fraction). */
  current?: number | null;
  previous?: number | null;
  delta?: number | null;
  /** Lower is better (bounce rate): a drop is coloured green. */
  invert?: boolean;
  spark?: number[];
  hint?: ReactNode;
  loading?: boolean;
  href?: string;
  className?: string;
}) {
  const d = delta !== undefined ? delta : deltaOf(current, previous);
  const good = d == null ? null : invert ? d < 0 : d > 0;
  const body = (
    <>
      <div className={LABEL}>{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-24" />
      ) : (
        <div className="mt-1.5 truncate font-display text-[32px] font-extrabold leading-none tracking-tightest text-fg sm:text-[36px]">{value}</div>
      )}
      {(loading || d != null || hint || (spark && spark.length > 1)) && (
      <div className="mt-2 flex min-h-7 items-end justify-between gap-2">
        <div className="min-w-0 font-mono text-[11px] leading-4">
          {!loading && d != null && Math.abs(d) >= 0.0005 ? (
            <span className={good ? "text-ok" : "text-bad-text"} title="vs previous period">
              {d > 0 ? "▲" : "▼"} {fmtPct(Math.abs(d), Math.abs(d) < 0.1 ? 1 : 0)}
              <span className="hidden text-fg-4 sm:inline"> vs prev</span>
            </span>
          ) : !loading && d != null ? (
            <span className="text-fg-4">= flat vs prev</span>
          ) : (
            <span className="text-fg-4">{hint ?? " "}</span>
          )}
          {d != null && hint && <div className="truncate text-fg-4">{hint}</div>}
        </div>
        {spark && spark.length > 1 && !loading && <Sparkline values={spark} width={72} height={24} className="shrink-0" />}
      </div>
      )}
    </>
  );
  const cls = cx("block min-w-0 border border-line bg-surface px-4 py-3.5", href && "hover:border-line-strong", className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ───────────────────────────── BarList ───────────────────────────── */

export type BarItem = {
  key?: string;
  label: ReactNode;
  value: number;
  hint?: ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
};

export function BarList({
  items,
  format = fmtNum,
  limit,
  total,
  empty = "No data for this range",
  valueLabel,
  loading,
}: {
  items: BarItem[];
  format?: (n: number) => string;
  limit?: number;
  /** Denominator for the share %; defaults to the sum of values. */
  total?: number;
  empty?: ReactNode;
  valueLabel?: ReactNode;
  loading?: boolean;
}) {
  if (loading)
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  if (!items.length) return <EmptyState title={empty} />;
  const shown = limit ? items.slice(0, limit) : items;
  const max = Math.max(...items.map((i) => i.value), 1);
  const sum = total ?? items.reduce((a, i) => a + i.value, 0);
  return (
    <div className="flex flex-col">
      {valueLabel && (
        <div className={cx(LABEL, "mb-1.5 flex justify-end")}>
          <span>{valueLabel}</span>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {shown.map((it, i) => {
          const w = Math.max(1.5, (it.value / max) * 100);
          const share = sum > 0 ? it.value / sum : 0;
          const inner = (
            <>
              <span
                aria-hidden
                className={cx("absolute inset-y-0 left-0", it.active ? "bg-signal/30" : "bg-signal/15 group-hover:bg-signal/25")}
                style={{ width: `${w}%` }}
              />
              <span className="relative min-w-0 flex-1 truncate text-left text-[13px] text-fg">
                {it.label}
                {it.hint && <span className="ml-2 font-mono text-[11px] text-fg-4">{it.hint}</span>}
              </span>
              <span className="relative shrink-0 font-mono text-xs tabular-nums text-fg">{format(it.value)}</span>
              <span className="relative w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-fg-3">{fmtPct(share, share < 0.1 ? 1 : 0)}</span>
            </>
          );
          const cls = cx(
            "group relative flex min-h-9 w-full items-center gap-3 overflow-hidden px-2.5",
            it.active && "outline outline-1 outline-signal",
            (it.href || it.onClick) && "cursor-pointer"
          );
          return (
            <li key={it.key ?? i}>
              {it.href ? (
                <Link href={it.href} className={cls}>
                  {inner}
                </Link>
              ) : it.onClick ? (
                <button type="button" onClick={it.onClick} aria-pressed={it.active} className={cls}>
                  {inner}
                </button>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      {limit && items.length > limit && <p className="mt-2 font-mono text-[11px] text-fg-4">+{items.length - limit} more</p>}
    </div>
  );
}

/* ───────────────────────────── Table ───────────────────────────── */

export type Column<R> = {
  key: string;
  header: ReactNode;
  render?: (row: R, index: number) => ReactNode;
  /** Value used for sorting (click the header). */
  sort?: (row: R) => number | string | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  /** Hide below the sm breakpoint. */
  hideOnPhone?: boolean;
};

export function Table<R>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading,
  minWidth = 560,
  initialSort,
  className,
  dense,
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, index: number) => string;
  onRowClick?: (row: R) => void;
  empty?: ReactNode;
  loading?: boolean;
  /** Table min width; the box scrolls horizontally on phones instead of the page. */
  minWidth?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  className?: string;
  dense?: boolean;
}) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  if (!loading && !rows.length) return typeof empty === "string" || !empty ? <EmptyState title={empty || "No rows"} /> : <>{empty}</>;
  const pad = dense ? "px-3 py-2" : "px-3 py-2.5";
  const align = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  return (
    // `relative` so absolutely positioned descendants (sr-only labels) are clipped by this box
    // instead of widening the page on phones.
    <div className={cx("relative max-w-full overflow-x-auto border border-line", className)}>
      <table className="w-full border-collapse text-[13px]" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-line bg-surface-2/60">
            {columns.map((c) => {
              const on = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cx(pad, align(c.align), "whitespace-nowrap font-mono text-[11px] font-normal uppercase tracking-label text-fg-3", c.hideOnPhone && "hidden sm:table-cell", c.className)}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => setSort({ key: c.key, dir: on && sort!.dir === "desc" ? "asc" : "desc" })}
                      className={cx("inline-flex items-center gap-1 uppercase hover:text-fg", on && "text-fg")}
                    >
                      {c.header}
                      <span aria-hidden className={on ? "text-signal-text" : "text-fg-4"}>
                        {on ? (sort!.dir === "desc" ? "↓" : "↑") : "↕"}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className={cx(pad, c.hideOnPhone && "hidden sm:table-cell")}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map((r, i) => (
                <tr
                  key={rowKey(r, i)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cx("border-b border-line last:border-0", onRowClick && "cursor-pointer hover:bg-surface-2")}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cx(pad, align(c.align), "align-middle text-fg-2", c.hideOnPhone && "hidden sm:table-cell", c.className)}>
                      {c.render ? c.render(r, i) : String((r as Record<string, unknown>)[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────────── Tabs + chips ───────────────────────────── */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  label = "Sections",
}: {
  tabs: { id: T; label: ReactNode; count?: number | null }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cx("relative flex max-w-full overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cx(
              "-mb-px flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 font-mono text-[13px]",
              on ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"
            )}
          >
            {t.label}
            {t.count != null && <span className={cx("px-1 text-[11px]", on ? "bg-signal text-on-signal" : "bg-surface-2 text-fg-3")}>{fmtCompact(t.count)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export type Chip = { key: string; label: ReactNode; value: ReactNode };
export function FilterChips({ chips, onRemove, onClear, className }: { chips: Chip[]; onRemove: (key: string) => void; onClear?: () => void; className?: string }) {
  if (!chips.length) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-1.5", className)}>
      <span className={LABEL}>filter</span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onRemove(c.key)}
          aria-label={`Remove filter ${typeof c.label === "string" ? c.label : c.key}`}
          className="inline-flex min-h-9 items-center gap-2 border border-signal bg-signal/10 px-2.5 font-mono text-xs text-fg hover:bg-signal/20"
        >
          <span className="text-fg-3">{c.label}:</span>
          <span className="max-w-[180px] truncate">{c.value}</span>
          <span aria-hidden className="text-signal-text">×</span>
        </button>
      ))}
      {onClear && chips.length > 1 && (
        <button type="button" onClick={onClear} className="min-h-9 px-2 font-mono text-xs text-fg-3 underline-offset-4 hover:text-fg hover:underline">
          clear all
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── ConfirmButton ───────────────────────────── */

/**
 * Two-step destructive action: first press arms it ("confirm delete?" + cancel), second press
 * runs `onConfirm`. Disarms after `timeoutMs` or on cancel. Never uses window.confirm.
 */
export function ConfirmButton({
  children,
  confirmLabel = "confirm",
  onConfirm,
  tone = "bad",
  disabled,
  className,
  timeoutMs = 5000,
  size = "md",
  primary = false,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  confirmLabel?: ReactNode;
  onConfirm: () => void | Promise<unknown>;
  tone?: "bad" | "signal";
  disabled?: boolean;
  className?: string;
  timeoutMs?: number;
  size?: "sm" | "md";
  /** Filled orange idle state for the main action of a screen (e.g. send). */
  primary?: boolean;
  "aria-label"?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), timeoutMs);
    return () => window.clearTimeout(id);
  }, [armed, timeoutMs]);
  const h = size === "sm" ? "min-h-9 px-2.5" : "min-h-10 px-3";
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };
  if (!armed)
    return (
      <button
        type="button"
        disabled={disabled || busy}
        aria-label={ariaLabel}
        onClick={() => setArmed(true)}
        className={cx(h, "border font-mono text-xs disabled:opacity-40", primary ? "border-signal bg-signal font-semibold text-on-signal hover:brightness-110" : tone === "bad" ? "border-line-strong text-fg-2 hover:border-bad hover:text-bad-text" : "border-line-strong text-fg-2 hover:border-signal hover:text-signal-text", className)}
      >
        {children}
      </button>
    );
  return (
    <span className={cx("inline-flex animate-hk-in", className)} role="group" aria-label="Confirm action">
      <button
        type="button"
        autoFocus
        disabled={busy}
        onClick={run}
        className={cx(h, "font-mono text-xs font-semibold disabled:opacity-60", tone === "bad" ? "bg-bad text-white" : "bg-signal text-on-signal")}
      >
        {busy ? "…" : confirmLabel}
      </button>
      <button type="button" disabled={busy} onClick={() => setArmed(false)} className={cx(h, "border border-l-0 border-line-strong font-mono text-xs text-fg-3 hover:text-fg")}>
        cancel
      </button>
    </span>
  );
}

/* ───────────────────────────── Drawer ───────────────────────────── */

/** Side sheet on desktop (right), bottom sheet on phones. Esc / backdrop closes. */
export function Drawer({
  open,
  onClose,
  title,
  label,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  label?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{ ["--dw" as string]: `${width}px` }}
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-hk-in flex-col border-t border-line-strong bg-surface outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(var(--dw),100vw)] sm:border-l sm:border-t-0"
      >
        <div className="mx-auto mt-2 h-1 w-10 bg-line-strong sm:hidden" aria-hidden />
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {label && <div className={LABEL}>{label}</div>}
            {title && <h2 className="break-words font-display text-xl font-extrabold tracking-tight text-fg">{title}</h2>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close panel" className="grid h-10 w-10 shrink-0 place-items-center border border-line-strong text-fg hover:bg-surface-2">
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && <footer className="border-t border-line px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">{footer}</footer>}
      </div>
    </div>
  );
}

/* ───────────────────────────── TrendChart ───────────────────────────── */

export type Series = {
  key: string;
  label: string;
  /** CSS colour; defaults: 1st = signal, 2nd = fg-3, 3rd = fg-4 (dashed). */
  color?: string;
  dashed?: boolean;
  format?: (n: number) => string;
};

const SERIES_DEFAULTS = [
  { color: "var(--c-signal)", dashed: false },
  { color: "var(--c-fg-3)", dashed: false },
  { color: "var(--c-fg-4)", dashed: true },
  { color: "var(--c-line-strong)", dashed: true },
];

/** Round axis: step from {1, 2, 2.5, 5} × 10^k (integers only), ~4 intervals, top = ceil(max / step) × step. */
function niceScale(v: number) {
  if (!(v > 0)) return { max: 1, ticks: [0, 1] };
  const raw = v / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p);
  const max = Math.ceil(v / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(t);
  return { max, ticks };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Multi-series line chart with hover crosshair + tooltip and a "show table" toggle.
 * `data` rows: `{ t: ISO string | number, [series.key]: number }`.
 */
export function TrendChart({
  data,
  series,
  height = 220,
  formatX,
  formatY = fmtCompact,
  loading,
  empty = "No data for this range",
  ariaLabel = "Trend chart",
}: {
  data: ({ t: string | number } & Record<string, number | string | null | undefined>)[];
  series: Series[];
  height?: number;
  /** Axis/tooltip label for a point's `t`. */
  formatX?: (t: string | number, i: number) => string;
  formatY?: (n: number) => string;
  loading?: boolean;
  empty?: ReactNode;
  ariaLabel?: string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const fx = useCallback(
    (t: string | number, i: number) => {
      if (formatX) return formatX(t, i);
      const d = new Date(t);
      return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    },
    [formatX]
  );
  const ss = series.map((s, i) => ({ ...SERIES_DEFAULTS[Math.min(i, SERIES_DEFAULTS.length - 1)], ...s }));
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const innerW = Math.max(10, width - padL - padR);
  const innerH = height - padT - padB;
  const { max, ticks } = niceScale(Math.max(0, ...data.flatMap((r) => ss.map((s) => num(r[s.key])))));
  const x = (i: number) => padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const xTickEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 80))));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = data.length <= 1 ? 0 : Math.round((px / r.width) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {ss.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fg-2">
          <svg width="16" height="8" aria-hidden>
            <line x1="0" x2="16" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "3 3" : undefined} />
          </svg>
          {s.label}
        </span>
      ))}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {series.length > 1 ? legend : <span />}
        <button type="button" onClick={() => setTable((t) => !t)} aria-pressed={table} className="min-h-9 px-2 font-mono text-[11px] text-fg-3 hover:text-fg">
          {table ? "show chart" : "show table"}
        </button>
      </div>
      {loading ? (
        <Skeleton className="w-full" />
      ) : !data.length ? (
        <EmptyState title={empty} />
      ) : table ? (
        <Table
          dense
          minWidth={280}
          className="max-h-[320px] overflow-y-auto"
          rows={data.map((r, i) => ({ r, i }))}
          rowKey={(row) => String(row.i)}
          columns={[
            { key: "t", header: "period", render: (row) => <span className="font-mono text-xs">{fx(row.r.t, row.i)}</span> },
            ...ss.map((s) => ({
              key: s.key,
              header: s.label,
              align: "right" as const,
              render: (row: { r: (typeof data)[number] }) => <span className="font-mono text-xs tabular-nums">{(s.format || fmtNum)(num(row.r[s.key]))}</span>,
            })),
          ]}
        />
      ) : null}
      <div ref={box} className={cx("relative w-full", (loading || !data.length || table) && "hidden")} style={{ height }}>
        {width > 0 && data.length > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--c-line)" strokeWidth="1" strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-4 font-mono text-[10px]">
                  {formatY(t)}
                </text>
              </g>
            ))}
            {data.map((r, i) =>
              i % xTickEvery === 0 || i === data.length - 1 ? (
                <text
                  key={i}
                  x={x(i)}
                  y={height - 8}
                  textAnchor={i === 0 && data.length > 1 ? "start" : i === data.length - 1 && data.length > 1 ? "end" : "middle"}
                  className="fill-fg-4 font-mono text-[10px]"
                >
                  {i % xTickEvery === 0 && i !== data.length - 1 && data.length - 1 - i < xTickEvery * 0.6 ? "" : fx(r.t, i)}
                </text>
              ) : null
            )}
            {[...ss].reverse().map((s, ri) => {
              const isPrimary = ri === ss.length - 1;
              const d = data.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(num(r[s.key])).toFixed(1)}`).join("");
              return (
                <g key={s.key}>
                  {isPrimary && <path d={`${d}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={s.color} opacity="0.08" />}
                  <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}
            {hover != null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--c-fg-3)" strokeWidth="1" />
                {ss.map((s) => (
                  <rect key={s.key} x={x(hover) - 4} y={y(num(data[hover][s.key])) - 4} width="8" height="8" fill={s.color} stroke="var(--c-surface)" strokeWidth="2" />
                ))}
              </g>
            )}
            <rect
              x={padL}
              y={padT}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
              style={{ touchAction: "pan-y" }}
            />
          </svg>
        )}
        {hover != null && data[hover] && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[140px] border border-line-strong bg-surface px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
            style={x(hover) > width / 2 ? { right: width - x(hover) + 12 } : { left: x(hover) + 12 }}
          >
            <div className="font-mono text-[11px] text-fg-3">{fx(data[hover].t, hover)}</div>
            {ss.map((s) => (
              <div key={s.key} className="mt-1 flex items-center justify-between gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 text-fg-2">
                  <span className="inline-block h-2 w-2" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-mono tabular-nums text-fg">{(s.format || fmtNum)(num(data[hover][s.key]))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Heatmap ───────────────────────────── */

/**
 * Retention-style grid. `rows[i].cells[j]` is a value in [0, 1] (shown as %) or null (no data).
 * `rows[i].size` is printed after the label (cohort size). Sequential single-hue (signal) ramp.
 */
export function Heatmap({
  columns,
  rows,
  format = (v: number) => fmtPct(v, 0),
  cellTitle,
  minWidth = 520,
}: {
  columns: ReactNode[];
  rows: { label: ReactNode; size?: number; cells: (number | null)[] }[];
  format?: (v: number) => string;
  cellTitle?: (rowIndex: number, colIndex: number, v: number | null) => string;
  minWidth?: number;
}) {
  if (!rows.length) return <EmptyState title="No cohorts in this range" />;
  return (
    <div className="relative max-w-full overflow-x-auto border border-line">
      <table className="w-full border-collapse font-mono text-[11px]" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 bg-surface px-3 py-2 text-left font-normal uppercase tracking-label text-fg-3">cohort</th>
            {columns.map((c, i) => (
              <th key={i} className="px-1 py-2 text-center font-normal text-fg-3">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              <th scope="row" className="sticky left-0 whitespace-nowrap bg-surface px-3 py-1 text-left font-normal text-fg-2">
                {r.label}
                {r.size != null && <span className="ml-2 text-fg-4">{fmtNum(r.size)}</span>}
              </th>
              {columns.map((_, ci) => {
                const v = r.cells[ci];
                const has = v != null && Number.isFinite(v);
                const pct = has ? Math.max(0, Math.min(1, v as number)) : 0;
                return (
                  <td key={ci} className="p-[1px]">
                    <div
                      title={cellTitle ? cellTitle(ri, ci, has ? (v as number) : null) : undefined}
                      className={cx("grid h-8 min-w-10 place-items-center tabular-nums", !has && "text-fg-4", has && pct > 0.55 ? "text-on-signal" : "text-fg")}
                      style={{ background: has ? `color-mix(in srgb, var(--c-signal) ${Math.round(6 + pct * 88)}%, var(--c-surface))` : "transparent" }}
                    >
                      {has ? format(v as number) : "·"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────────── misc ───────────────────────────── */

/** Page title row for an admin screen: mono path eyebrow, display title, right-side controls. */
export function PageHead({ path, title, sub, actions }: { path: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="font-mono text-xs text-fg-3">
          <span className="text-signal-text">$</span> {path}
        </div>
        <h1 className="mt-1 font-display text-[30px] font-extrabold leading-[1.05] tracking-tightest text-fg sm:text-[40px]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-prose text-sm text-fg-3">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Small pulsing live dot. */
export function LiveDot({ on = true }: { on?: boolean }) {
  return <span aria-hidden className={cx("inline-block h-2 w-2", on ? "animate-hk-pulse bg-signal" : "bg-fg-4")} />;
}
