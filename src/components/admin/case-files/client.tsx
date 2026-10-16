"use client";

/** Shared client bits for /admin/case-files: preview-aware API client, uploads, small atoms. */
import { useMemo, type ReactNode } from "react";
import { adminFetch } from "@/lib/admin/fetch";
import { supabaseClient } from "@/lib/supabase-client";
import { AdminClientContext, Badge, useAdminClient, type AdminClient, type BadgeTone } from "@/components/admin/ui";
import { PREVIEW_HEADER, type CaseFileStatus } from "@/lib/case-files/types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

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
 * In the dev-only `?preview=1` mode the shell has no session: requests to /api/admin/case-files
 * carry the preview header, which the dev JSON store (CASE_FILES_STORE=file) accepts.
 */
export function CaseFilesClient({ children }: { children: ReactNode }) {
  const base = useAdminClient();
  const value = useMemo<AdminClient>(
    () => (base.preview ? { ...base, json: <T,>(url: string, init?: RequestInit) => base.json<T>(url, withPreview(init)), text: (url: string, init?: RequestInit) => base.text(url, withPreview(init)) } : base),
    [base]
  );
  return <AdminClientContext.Provider value={value}>{children}</AdminClientContext.Provider>;
}

type UploadTarget = { mode: "signed"; bucket: string; path: string; token: string; publicUrl: string } | { mode: "local"; uploadUrl: string; publicUrl: string };

/** Upload one image for a case file: the API checks type/size and hands back a one-time target. */
export async function uploadCaseImage(client: AdminClient, file: File, slug: string, kind: "cover" | "motion" | "image"): Promise<string> {
  const target = await client.json<UploadTarget>("/api/admin/case-files/upload", jsonInit("POST", { slug, kind, name: file.name, type: file.type, size: file.size }));
  if (target.mode === "local") {
    const init: RequestInit = { method: "PUT", headers: { "Content-Type": file.type }, body: file };
    const res = await adminFetch(target.uploadUrl, client.preview ? withPreview(init) : init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `Upload failed (HTTP ${res.status})`);
    return target.publicUrl;
  }
  const { error } = await supabaseClient.storage.from(target.bucket).uploadToSignedUrl(target.path, target.token, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message || "Upload failed");
  return target.publicUrl;
}

const STATUS_TONE: Record<CaseFileStatus | "repo", BadgeTone> = { draft: "muted", published: "ok", archived: "neutral", repo: "neutral" };
export function StatusBadge({ status }: { status: CaseFileStatus | "repo" }) {
  return <Badge tone={STATUS_TONE[status]}>{status === "repo" ? "repo file" : status}</Badge>;
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

export const INPUT =
  "min-h-10 w-full border border-line-strong bg-bg px-3 py-2 text-[14px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";
export const BTN = "inline-flex min-h-10 items-center justify-center gap-1.5 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40";
export const BTN_PRIMARY = "inline-flex min-h-10 items-center justify-center gap-1.5 border border-signal bg-signal px-3.5 font-mono text-xs font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";

export function Counter({ n, min, max, soft }: { n: number; min?: number; max: number; soft?: [number, number] }) {
  const bad = n > max || (min != null && n > 0 && n < min);
  const warn = !bad && soft && n > 0 && (n < soft[0] || n > soft[1]);
  return <span className={cx("font-mono text-[11px]", bad ? "text-bad-text" : warn ? "text-signal-text" : "text-fg-4")}>{n}/{max}</span>;
}

export function FieldLabel({ htmlFor, children, hint, right }: { htmlFor?: string; children: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-end justify-between gap-3">
      <label htmlFor={htmlFor} className="font-mono text-[11px] uppercase tracking-label text-fg-3">
        {children}
        {hint && <span className="ml-2 normal-case tracking-normal text-fg-4">{hint}</span>}
      </label>
      {right}
    </div>
  );
}
