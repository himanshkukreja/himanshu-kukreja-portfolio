"use client";

/** Validator output grouped by area, errors first, each one jumping to its line / field. */
import type { Problem, ProblemArea, Validation } from "@/lib/case-files/types";
import { cx } from "./client";

const AREA: Record<ProblemArea, string> = { details: "Details", body: "Story", debrief: "Debrief", activity: "Activity", seo: "SEO" };

export default function ChecksPanel({ v, onJump, diagrams, compact }: { v: Validation | null; onJump: (p: Problem) => void; diagrams?: { total: number; failed: number } | null; compact?: boolean }) {
  if (!v) return <div className="border border-line bg-surface p-4 font-mono text-[12px] text-fg-3">$ validate … running</div>;
  const errors = v.problems.filter((p) => p.level === "error");
  const warnings = v.problems.filter((p) => p.level === "warning");
  return (
    <section aria-label="Checks" className="flex flex-col border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="font-mono text-[12px]">
          {v.ok ? <span className="font-semibold text-ok">✓ ready to publish</span> : <span className="font-semibold text-bad-text">✗ {errors.length} error{errors.length === 1 ? "" : "s"} block publishing</span>}
          <span className="text-fg-3"> · {warnings.length} warning{warnings.length === 1 ? "" : "s"}</span>
        </span>
        <span className="font-mono text-[11px] text-fg-4">
          {v.stats.chapters} chapters · {v.stats.diagrams} diagrams · {v.stats.blocks} blocks · {v.stats.images} images · {v.stats.words.toLocaleString("en-IN")} words
        </span>
      </header>
      {diagrams && diagrams.failed > 0 && (
        <p className="m-0 border-b border-line px-4 py-2 text-[13px] text-bad-text">
          ✗ {diagrams.failed} of {diagrams.total} diagram{diagrams.total === 1 ? "" : "s"} failed to render in the preview.
        </p>
      )}
      {v.problems.length === 0 ? (
        <p className="m-0 px-4 py-3 text-[13.5px] text-fg-2">Every rule passes. Check the preview on a phone and in light mode, then publish.</p>
      ) : (
        <ol className={cx("m-0 flex list-none flex-col p-0", compact && "max-h-[40vh] overflow-y-auto")}>
          {[...errors, ...warnings].map((p, i) => (
            <li key={i} className="border-b border-line last:border-0">
              <button type="button" onClick={() => onJump(p)} className="flex min-h-11 w-full items-start gap-3 px-4 py-2 text-left hover:bg-surface-2">
                <span aria-hidden className={cx("mt-0.5 shrink-0 font-mono text-[11px] font-semibold", p.level === "error" ? "text-bad-text" : "text-signal-text")}>
                  {p.level === "error" ? "ERR" : "WARN"}
                </span>
                <span className="w-16 shrink-0 font-mono text-[11px] text-fg-3">{p.line ? `L${p.line}` : AREA[p.area].toLowerCase()}</span>
                <span className="min-w-0 text-[13.5px] leading-snug text-fg-2">
                  <span className="sr-only">{p.level}: </span>
                  {p.message}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
