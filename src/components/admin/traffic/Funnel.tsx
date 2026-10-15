"use client";

import { useState } from "react";
import { Card, EmptyState, ErrorState, LABEL, Skeleton, fmtNum, fmtPct, useAdminData } from "@/components/admin/ui";
import type { FunnelRes } from "./types";

type Step = { kind: "page" | "event"; value: string };

export const FUNNEL_PRESETS: { label: string; steps: string }[] = [
  { label: "visit → lesson complete", steps: "page:*,page:/learn*,event:lesson_open,event:stage_done,event:lesson_complete" },
  { label: "home → learn", steps: "page:/,page:/learn*,event:lesson_open" },
  { label: "home → stories", steps: "page:/,page:/stories*" },
  { label: "search → lesson", steps: "event:search,event:lesson_open,event:stage_done" },
  { label: "lesson → trial", steps: "event:lesson_complete,event:trial_result" },
];

const EVENT_NAMES = ["lesson_open", "stage_reach", "stage_done", "lesson_complete", "trial_result", "review_session", "search", "reset", "play", "contrib_snake"];

const parse = (s: string): Step[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf(":");
      return { kind: x.slice(0, i) === "event" ? "event" : "page", value: x.slice(i + 1) } as Step;
    });
const serialise = (steps: Step[]) => steps.filter((s) => s.value.trim()).map((s) => `${s.kind}:${s.value.trim()}`).join(",");

/**
 * Funnel builder: 2–6 ordered steps (`page:/path`, `page:/prefix*`, `page:*` = any page,
 * `event:name`), counted per visitor in order within the range. Steps live in `?steps=`.
 */
export function FunnelCard({ query, steps, onSteps }: { query: string; steps: string; onSteps: (s: string) => void }) {
  const res = useAdminData<FunnelRes>(`/api/admin/traffic/funnel?${query}&steps=${encodeURIComponent(steps)}`);
  const [draft, setDraft] = useState<Step[] | null>(null);
  const editing = draft ?? parse(steps);
  const dirty = draft !== null && serialise(draft) !== steps;
  const edit = (fn: (s: Step[]) => Step[]) => setDraft(fn(editing.map((s) => ({ ...s }))));
  const data = res.data?.steps ?? [];
  const max = Math.max(1, data[0]?.visitors ?? 0);

  return (
    <Card label="funnel" title="Conversion funnel" pad={false}>
      <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2.5 sm:px-4">
        {FUNNEL_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setDraft(null);
              onSteps(p.steps);
            }}
            aria-pressed={p.steps === steps}
            className={`min-h-9 border px-2.5 font-mono text-[11px] ${p.steps === steps ? "border-signal bg-signal/10 text-fg" : "border-line-strong text-fg-3 hover:text-fg"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* builder */}
        <div className="min-w-0">
          <div className={`${LABEL} mb-2`}>steps</div>
          <ol className="flex flex-col gap-1.5">
            {editing.map((s, i) => (
              <li key={i} className="flex min-w-0 items-center gap-1.5">
                <span className="w-5 shrink-0 font-mono text-[11px] text-fg-4">{i + 1}</span>
                <select
                  aria-label={`Step ${i + 1} type`}
                  value={s.kind}
                  onChange={(e) => edit((a) => ((a[i].kind = e.target.value as Step["kind"]), a))}
                  className="min-h-10 shrink-0 border border-line-strong bg-surface px-1.5 font-mono text-xs text-fg"
                >
                  <option value="page">page</option>
                  <option value="event">event</option>
                </select>
                <input
                  aria-label={`Step ${i + 1} value`}
                  value={s.value}
                  list={s.kind === "event" ? "hk-funnel-events" : undefined}
                  placeholder={s.kind === "page" ? "/learn*  or  *" : "lesson_open"}
                  onChange={(e) => edit((a) => ((a[i].value = e.target.value), a))}
                  className="min-h-10 min-w-0 flex-1 border border-line-strong bg-bg px-2 font-mono text-xs text-fg placeholder:text-fg-4"
                />
                <button
                  type="button"
                  aria-label={`Remove step ${i + 1}`}
                  disabled={editing.length <= 2}
                  onClick={() => edit((a) => a.filter((_, j) => j !== i))}
                  className="grid h-10 w-10 shrink-0 place-items-center border border-line-strong text-fg-3 hover:text-fg disabled:opacity-30"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <datalist id="hk-funnel-events">
            {EVENT_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={editing.length >= 6}
              onClick={() => edit((a) => [...a, { kind: "page", value: "" }])}
              className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:text-fg disabled:opacity-30"
            >
              + step
            </button>
            <button
              type="button"
              disabled={!dirty || serialise(editing).split(",").length < 2}
              onClick={() => {
                onSteps(serialise(editing));
                setDraft(null);
              }}
              className="min-h-10 bg-signal px-3 font-mono text-xs font-semibold text-on-signal disabled:opacity-30"
            >
              run funnel
            </button>
            {dirty && (
              <button type="button" onClick={() => setDraft(null)} className="min-h-10 px-2 font-mono text-xs text-fg-3 hover:text-fg">
                reset
              </button>
            )}
          </div>
          <p className="mt-2 font-mono text-[11px] leading-5 text-fg-4">ordered per visitor · `*` suffix = prefix match · `page:*` = any page</p>
        </div>

        {/* result */}
        <div className="min-w-0">
          <div className={`${LABEL} mb-2`}>visitors reaching each step</div>
          {res.error ? (
            <ErrorState error={res.error} onRetry={res.refresh} />
          ) : res.loading && !res.data ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : !data.length ? (
            <EmptyState title="Add at least two steps" />
          ) : (
            <ol className="flex flex-col gap-1.5">
              {data.map((s, i) => (
                <li key={s.step + i} className="relative min-h-11 overflow-hidden border border-line">
                  <span aria-hidden className="absolute inset-y-0 left-0 bg-signal/20" style={{ width: `${Math.max(1, (s.visitors / max) * 100)}%` }} />
                  <div className="relative flex items-center gap-3 px-2.5 py-2">
                    <span className="w-5 shrink-0 font-mono text-[11px] text-fg-4">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={s.step}>
                      {s.step.startsWith("event:") ? <span className="text-signal-text">◆ </span> : null}
                      {s.label === "*" ? "any page" : s.label}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-fg">{fmtNum(s.visitors)}</span>
                    <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-fg-3">{fmtPct(s.pctOfFirst, 0)}</span>
                  </div>
                  {i > 0 && (
                    <div className="relative border-t border-line/60 px-2.5 pb-1.5 pl-10 font-mono text-[10px] text-fg-4">
                      {fmtPct(s.pctOfPrev, 0)} of step {i} · drop {fmtNum(Math.max(0, data[i - 1].visitors - s.visitors))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Card>
  );
}
