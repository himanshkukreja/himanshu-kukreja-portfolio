"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, X } from "lucide-react";
import { emptyState, evaluate, GROUPS, toggle, type FilterState, type GroupId, type Status } from "@/lib/dsa/problem-filters";
import type { ProblemData } from "@/lib/dsa/problem-rows";
import { buildSheet, COLUMNS, defaultColumns, describeFilters, GROUP_BYS, type ColumnId, type Format, type GroupBy } from "@/lib/dsa/sheet-export";
import { holdAttention } from "@/lib/learn/guide/attention";
import { track } from "@/lib/track";
import type { GroupDef } from "./problem-options";

/**
 * "Export sheet": a modal (bottom sheet on phones) that exports the problems as .xlsx or .csv. The count of what will be
 * exported is always on screen and updates with every change. Rows come from src/lib/dsa/sheet-export.ts; the file
 * writer (and exceljs) is imported when Export is clicked.
 */

const plural = (n: number) => `${n} ${n === 1 ? "problem" : "problems"}`;

type Props = {
  data: ProblemData;
  defs: GroupDef[];
  /** the page's filters: the dialog starts from them */
  initial: FilterState;
  statusOf: (id: string) => Status;
  solvedAt: (id: string) => number | null;
  onClose: () => void;
};

export default function ExportSheetDialog({ data, defs, initial, statusOf, solvedAt, onClose }: Props) {
  const [scope, setScope] = useState<"filters" | "all">("filters");
  const [st, setSt] = useState<FilterState>(initial);
  const [cols, setCols] = useState<Set<ColumnId>>(() => new Set(defaultColumns()));
  const [groupBy, setGroupBy] = useState<GroupBy>("course");
  const [format, setFormat] = useState<Format>("xlsx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => holdAttention(), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && box.current) {
        const f = [...box.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), summary, a[href]")].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    box.current?.querySelector<HTMLElement>("input[type=radio]")?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const matching = useMemo(() => evaluate(data.rows, st, statusOf), [data.rows, st, statusOf]);
  const base = useMemo(() => evaluate(data.rows, emptyState(), () => "todo").counts, [data.rows]);
  const rows = scope === "all" ? data.rows : matching.results;
  const count = rows.length;
  const stepLabel = (m: string) => data.steps.find((s) => s.id === m)?.label || m;
  const titleOf = (g: GroupId) => defs.find((d) => d.id === g)?.title || g;
  const labelOf = (g: GroupId, v: string) => (g === "video" ? "Has a solution video" : defs.find((d) => d.id === g)?.options.find((o) => o.id === v)?.label || v);
  const picked = GROUPS.reduce((n, g) => n + st.sel[g].length, 0) + (st.q.trim() ? 1 : 0);

  const edit = (g: GroupId, v: string) => {
    setScope("filters");
    setSt((s) => toggle(s, g, v));
  };

  const run = async () => {
    if (!count || busy) return;
    setBusy(true);
    setError("");
    try {
      const origin = window.location.origin;
      const date = new Date();
      const sheet = buildSheet(rows, { columns: cols, groupBy }, { origin, stepLabel, statusOf, solvedAt });
      const filters = scope === "all" ? "" : describeFilters(st, titleOf, labelOf);
      const { downloadSheet } = await import("@/lib/dsa/sheet-file");
      await downloadSheet(sheet, format, { filters, scopeLabel: scope === "all" ? "All problems" : "Matching the chosen filters", pageUrl: `${origin}/dsa/problems`, date });
      track("dsa_sheet_export", { count: sheet.count, format, scope, group: groupBy, columns: sheet.columns.length, filters: filters.slice(0, 200) });
      onClose();
    } catch {
      setError("The file could not be made. Please try again.");
      setBusy(false);
    }
  };

  const radio = "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal";
  const pill = (on: boolean) => `inline-flex min-h-10 cursor-pointer items-center gap-2 border px-3 font-mono text-[12px] ${on ? "border-signal bg-[var(--c-dsa-hl)] text-fg" : "border-line-strong text-fg-2 hover:bg-surface-2"} ${radio}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="xs-title" className="dsa-theme relative flex max-h-[92dvh] w-full max-w-[720px] flex-col border-t-2 border-signal bg-bg sm:max-h-[88dvh] sm:border-2">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 sm:px-5">
          <h2 id="xs-title" className="m-0 font-display text-[18px] font-bold tracking-[-0.01em] text-fg">
            Export problem sheet
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 font-mono text-[12px] font-semibold uppercase tracking-label text-fg">Which problems</legend>
            <label className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 text-[14px] ${scope === "filters" ? "border-signal bg-[var(--c-dsa-hl)]" : "border-line-strong"} ${radio}`}>
              <input type="radio" name="xs-scope" checked={scope === "filters"} onChange={() => setScope("filters")} className="h-4 w-4 accent-[var(--c-signal)]" />
              <span className="flex-1 text-fg">Matching your filters ({matching.total})</span>
            </label>
            <label className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 text-[14px] ${scope === "all" ? "border-signal bg-[var(--c-dsa-hl)]" : "border-line-strong"} ${radio}`}>
              <input type="radio" name="xs-scope" checked={scope === "all"} onChange={() => setScope("all")} className="h-4 w-4 accent-[var(--c-signal)]" />
              <span className="flex-1 text-fg">All problems ({data.rows.length})</span>
            </label>
            {scope === "filters" ? (
              <div className="mt-1 flex flex-col">
                {st.q.trim() ? (
                  <button type="button" onClick={() => setSt({ ...st, q: "" })} aria-label={`Remove search “${st.q.trim()}”`} className="mb-1 inline-flex min-h-10 items-center gap-2 self-start border border-signal px-3 font-mono text-[12px] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
                    Search: “{st.q.trim()}”
                    <X className="h-3.5 w-3.5 text-fg-3" aria-hidden />
                  </button>
                ) : null}
                {defs.map((d) => {
                  const options = d.options.filter((o) => d.id === "status" || d.id === "level" || d.id === "kind" || d.id === "time" || (base[d.id].get(o.id) || 0) > 0 || st.sel[d.id].includes(o.id));
                  if (!options.length) return null;
                  const n = st.sel[d.id].length;
                  return (
                    <details key={d.id} open={n > 0 || d.id === "level" || undefined} className="group border-b border-line">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-mono text-[12px] font-semibold uppercase tracking-label text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal [&::-webkit-details-marker]:hidden">
                        <span>
                          {d.title}
                          {n ? <span className="ml-2 bg-signal px-1.5 py-0.5 text-[11px] text-on-signal">{n}</span> : null}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      <div className="flex flex-wrap gap-2 pb-3">
                        {options.map((o) => {
                          const on = st.sel[d.id].includes(o.id);
                          const c = matching.counts[d.id].get(o.id) || 0;
                          return (
                            <label key={o.id} className={`${pill(on)} ${c === 0 && !on ? "opacity-50" : ""}`}>
                              <input type="checkbox" checked={on} onChange={() => edit(d.id, o.id)} className="sr-only" />
                              {o.label}
                              <span className="tabular-nums text-fg-3" aria-label={`${c} problems`}>
                                {c}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
                {picked ? (
                  <button type="button" onClick={() => setSt(emptyState())} className="min-h-10 self-start font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 font-mono text-[12px] font-semibold uppercase tracking-label text-fg">Columns</legend>
            <div className="flex flex-wrap gap-2">
              {COLUMNS.map((c) => {
                const on = cols.has(c.id);
                return (
                  <label key={c.id} className={pill(on)}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setCols((s) => {
                          const n = new Set(s);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      className="sr-only"
                    />
                    {c.label}
                  </label>
                );
              })}
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-fg-3">
              The video and editorial links open the problem on the platform and unlock after a solve or a reveal, the same rule as on the site. Nothing is spoiled in the file. Status comes from your account, or this device when you are signed out.
            </p>
          </fieldset>

          <div className="grid gap-6 sm:grid-cols-2">
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 font-mono text-[12px] font-semibold uppercase tracking-label text-fg">Group and sort</legend>
              <div className="flex flex-wrap gap-2">
                {GROUP_BYS.map((g) => (
                  <label key={g.id} className={pill(groupBy === g.id)}>
                    <input type="radio" name="xs-group" checked={groupBy === g.id} onChange={() => setGroupBy(g.id)} className="sr-only" />
                    {g.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 font-mono text-[12px] font-semibold uppercase tracking-label text-fg">Format</legend>
              <div className="flex flex-wrap gap-2">
                {(["xlsx", "csv"] as Format[]).map((f) => (
                  <label key={f} className={pill(format === f)}>
                    <input type="radio" name="xs-format" checked={format === f} onChange={() => setFormat(f)} className="sr-only" />
                    {f === "xlsx" ? "Excel (.xlsx)" : "CSV"}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line bg-bg px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p role="status" aria-live="polite" className="m-0 font-display text-[16px] font-bold text-fg">
              You&apos;re exporting {plural(count)}
            </p>
            {error ? <p role="alert" className="m-0 text-[13px] text-bad-text">{error}</p> : null}
          </div>
          <button
            type="button"
            onClick={run}
            disabled={!count || busy}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-signal px-5 font-mono text-[13px] font-semibold text-on-signal disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            <Download className="h-4 w-4" aria-hidden />
            {busy ? "Making your file…" : `Export ${plural(count)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
