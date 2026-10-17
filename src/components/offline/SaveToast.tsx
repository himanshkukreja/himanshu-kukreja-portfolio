"use client";

/** Progress of the save queue (one article, a world, the whole course), and how it ended. */
import Link from "next/link";
import { useEffect } from "react";
import { cancelSave, dismissJob, useSaveJob } from "@/lib/offline/jobs";
import { fmtBytes } from "./format";

export default function SaveToast() {
  const job = useSaveJob();

  // a finished run fades after a while; a stopped one waits to be read
  useEffect(() => {
    if (!job || job.status !== "done") return;
    const t = window.setTimeout(dismissJob, job.failed ? 12_000 : 6000);
    return () => window.clearTimeout(t);
  }, [job]);

  if (!job) return null;
  const total = job.urls.length;
  const pct = total ? Math.round((job.done / total) * 100) : 0;
  const ok = job.done - job.failed;

  return (
    <div
      role="status"
      aria-live="polite"
      data-reader-ui
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] z-[80] animate-hk-in border border-line-strong bg-surface p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] lg:bottom-6 lg:left-auto lg:right-6 lg:w-[380px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
            {job.status === "running" ? "Saving for offline" : job.status === "done" ? "Saved for offline" : "Saving stopped"}
          </span>
          <span className="truncate text-sm font-semibold text-fg">{job.label}</span>
        </div>
        {job.status === "running" ? (
          <button type="button" onClick={cancelSave} className="min-h-9 shrink-0 border border-line-strong px-2.5 font-mono text-[11px] text-fg-3 hover:text-fg">
            stop
          </button>
        ) : (
          <button type="button" onClick={dismissJob} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center border border-line-strong text-fg-3 hover:text-fg">
            ×
          </button>
        )}
      </div>
      <div className="mt-3 h-1.5 bg-surface-2" aria-hidden>
        <div className="h-1.5 bg-signal transition-[width] duration-300" style={{ width: `${job.status === "done" ? 100 : pct}%` }} />
      </div>
      <p className="m-0 mt-2 font-mono text-xs text-fg-3">
        {job.status === "running"
          ? `${job.done} of ${total} · ${fmtBytes(job.bytes)}`
          : `${ok} of ${total} saved · ${fmtBytes(job.bytes)}${job.failed ? ` · ${job.failed} failed` : ""}`}
      </p>
      {job.error && <p className="m-0 mt-2 text-sm leading-snug text-fg">{job.error}</p>}
      {job.status !== "running" && (
        <Link href="/learn/offline" onClick={dismissJob} className="mt-2 inline-flex min-h-9 items-center font-mono text-xs text-signal-text underline decoration-line-strong underline-offset-4">
          open the offline library →
        </Link>
      )}
    </div>
  );
}
