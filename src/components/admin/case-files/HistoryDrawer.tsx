"use client";

/** Revision history: every save / publish / unpublish / archive / restore, with one-click restore into the working copy. */
import { Badge, Drawer, ErrorState, Skeleton, fmtDate, timeAgo, useAdminData } from "@/components/admin/ui";
import { BTN, cx } from "./client";
import { useState } from "react";

type Rev = { id: string; version: number; action: string; createdBy: string | null; createdAt: string; title: string; words: number; live: boolean };

const ACTION_LABEL: Record<string, string> = {
  create: "created",
  save: "saved",
  autosave: "autosaved",
  publish: "published",
  unpublish: "unpublished",
  archive: "archived",
  restore: "restored from archive",
  import: "imported from repo",
  revert: "restored a revision",
  duplicate: "duplicated",
};

export default function HistoryDrawer({
  id,
  open,
  onClose,
  onRestore,
  currentVersion,
  readOnly,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  onRestore: (revisionId: string) => Promise<void>;
  currentVersion: number;
  readOnly?: boolean;
}) {
  const { data, error, loading, refresh } = useAdminData<{ revisions: Rev[] }>(open ? `/api/admin/case-files/${id}/revisions?v=${currentVersion}` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  return (
    <Drawer open={open} onClose={onClose} label="Case file" title="Revision history" width={480}>
      <p className="mb-3 text-[13px] text-fg-3">Restoring copies that version into the working copy as a new save. The public page only changes when you publish.</p>
      {error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {(data?.revisions || []).map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 border-b border-line py-2.5 last:border-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[12px] text-signal-text">v{r.version}</span>
                  <span className={cx("text-[13.5px]", r.action === "publish" ? "font-semibold text-fg" : "text-fg-2")}>{ACTION_LABEL[r.action] || r.action}</span>
                  {r.action === "publish" && <Badge tone="ok">live</Badge>}
                  {r.version === currentVersion && <Badge tone="muted">current</Badge>}
                </div>
                <div className="truncate text-[12.5px] text-fg-3" title={r.title}>
                  {r.title || "Untitled"} · {r.words.toLocaleString("en-IN")} words
                </div>
                <div className="font-mono text-[11px] text-fg-4" title={fmtDate(r.createdAt, true)}>
                  {timeAgo(r.createdAt)}
                  {r.createdBy ? ` · ${r.createdBy.split("@")[0]}` : ""}
                </div>
              </div>
              {!readOnly &&
                (armed === r.id ? (
                  <span className="inline-flex shrink-0">
                    <button
                      type="button"
                      autoFocus
                      disabled={!!busy}
                      className="min-h-9 bg-signal px-2.5 font-mono text-[11px] font-semibold text-on-signal"
                      onClick={async () => {
                        setBusy(r.id);
                        try {
                          await onRestore(r.id);
                          setArmed(null);
                          refresh();
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {busy === r.id ? "…" : "restore"}
                    </button>
                    <button type="button" className="min-h-9 border border-l-0 border-line-strong px-2 font-mono text-[11px] text-fg-3" onClick={() => setArmed(null)}>
                      cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" className={cx(BTN, "min-h-9 shrink-0")} disabled={!!busy} onClick={() => setArmed(r.id)}>
                    restore
                  </button>
                ))}
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}
