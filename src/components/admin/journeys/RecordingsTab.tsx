"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { FilterChips, Skeleton, useAdminData, type Chip } from "@/components/admin/ui";
import type { NotConfigured, RecordingsRes } from "@/lib/analytics/journeys";
import { DaysPicker, useDays, useSetParams, PhErrorState } from "./bits";
import RecordingList from "./RecordingList";
import SetupCard from "./SetupCard";

/** Recordings: newest session replays, filterable by person (?person=) and page (?path=). */
export default function RecordingsTab() {
  const params = useSearchParams();
  const setParams = useSetParams();
  const days = useDays("7d");
  const person = params.get("person");
  const path = params.get("path");
  const [pathDraft, setPathDraft] = useState(path || "");
  const [page, setPage] = useState(0);

  const qs = new URLSearchParams({ days: String(days), offset: String(page * 50) });
  if (person) qs.set("person", person);
  if (path) qs.set("path", path);
  const { data, error, loading, refresh } = useAdminData<RecordingsRes | NotConfigured>(`/api/admin/posthog/recordings?${qs}`);
  if (data && data.configured === false) return <SetupCard status={data.status} />;
  const res = data as RecordingsRes | undefined;

  const chips: Chip[] = [];
  if (person) chips.push({ key: "person", label: "person", value: person.slice(-8) });
  if (path) chips.push({ key: "path", label: "page", value: path });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-0 flex-[1_1_260px]"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            const v = pathDraft.trim();
            setParams({ path: v ? (v.startsWith("/") ? v : `/${v}`) : null });
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Filter by page path</span>
            <input
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              placeholder="visited page, e.g. /learn"
              className="min-h-10 w-full border border-line-strong bg-surface px-3 font-mono text-[13px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
            />
          </label>
          <button type="submit" className="min-h-10 border border-l-0 border-line-strong px-3 font-mono text-xs text-fg-2 hover:bg-surface-2">
            filter
          </button>
        </form>
        <DaysPicker fallback="7d" />
      </div>
      <FilterChips
        chips={chips}
        onRemove={(k) => {
          setPage(0);
          if (k === "path") setPathDraft("");
          setParams({ [k]: null });
        }}
        onClear={() => {
          setPage(0);
          setPathDraft("");
          setParams({ person: null, path: null });
        }}
      />
      {error ? (
        <PhErrorState error={error} onRetry={refresh} />
      ) : loading && !res ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[74px] w-full" />
          ))}
        </div>
      ) : res ? (
        <>
          <RecordingList recordings={res.recordings} empty={path ? `No recordings that visited ${path}` : "No recordings in this window"} />
          {(page > 0 || res.hasNext) && (
            <div className="flex items-center justify-between gap-2">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:bg-surface-2 disabled:opacity-40">
                ← newer
              </button>
              <span className="font-mono text-[11px] text-fg-4">page {page + 1}</span>
              <button type="button" disabled={!res.hasNext} onClick={() => setPage((p) => p + 1)} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:bg-surface-2 disabled:opacity-40">
                older →
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
