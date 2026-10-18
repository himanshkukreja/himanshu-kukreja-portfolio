"use client";

/** Shared bits for /admin/design-week: preview-aware client, IST date inputs, badges. */
import { useMemo, type ReactNode } from "react";
import { AdminClientContext, Badge, useAdminClient, type AdminClient, type BadgeTone } from "@/components/admin/ui";
import type { Phase, SubmissionStatus } from "@/lib/design-week/core";
import { PHASE_LABEL } from "@/lib/design-week/core";

export const PREVIEW_HEADER = "x-hk-admin-preview";

export const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

function withPreview(init: RequestInit | undefined): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set(PREVIEW_HEADER, "1");
  return { ...init, headers };
}

/**
 * In the dev-only `?preview=1` mode the shell has no session: requests to /api/admin/design-week
 * carry the preview header, which the dev fixture store (DOW_FIXTURES=1) accepts.
 */
export function DesignWeekClient({ children }: { children: ReactNode }) {
  const base = useAdminClient();
  const value = useMemo<AdminClient>(
    () => (base.preview ? { ...base, json: <T,>(url: string, init?: RequestInit) => base.json<T>(url, withPreview(init)), text: (url: string, init?: RequestInit) => base.text(url, withPreview(init)) } : base),
    [base]
  );
  return <AdminClientContext.Provider value={value}>{children}</AdminClientContext.Provider>;
}

const PHASE_TONE: Record<Phase, BadgeTone> = { draft: "muted", upcoming: "neutral", open: "solid", voting: "solid", judging: "signal", closed: "ok" };
export function PhasePill({ phase }: { phase: Phase }) {
  return <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase].toLowerCase()}</Badge>;
}

const SUB_TONE: Record<SubmissionStatus, BadgeTone> = { draft: "muted", submitted: "ok", hidden: "signal", removed: "bad" };
export function SubStatus({ status }: { status: SubmissionStatus }) {
  return <Badge tone={SUB_TONE[status]}>{status}</Badge>;
}

const IST = 330 * 60_000;
/** ISO → "YYYY-MM-DDTHH:mm" in IST (for <input type="datetime-local">). */
export const toIstInput = (iso: string) => (iso ? new Date(Date.parse(iso) + IST).toISOString().slice(0, 16) : "");
/** "YYYY-MM-DDTHH:mm" in IST → ISO. */
export const fromIstInput = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - IST).toISOString();
};
export const fmtIst = (iso: string | null | undefined) =>
  iso ? `${new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} IST` : "—";

export const INPUT = "min-h-10 w-full border border-line-strong bg-bg px-3 text-sm text-fg outline-none focus:border-signal";
export const BTN = "inline-flex min-h-10 items-center justify-center gap-2 border border-line-strong px-3 font-mono text-[13px] text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_PRIMARY = "inline-flex min-h-10 items-center justify-center gap-2 bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
