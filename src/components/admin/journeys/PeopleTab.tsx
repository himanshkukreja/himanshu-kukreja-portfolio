"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, LABEL, Table, fmtNum, timeAgo, useAdminData, useNow, type Column } from "@/components/admin/ui";
import type { NotConfigured, PeopleRes, PersonRow } from "@/lib/analytics/journeys";
import { DaysPicker, Who, cx, personHref, place, useDays, useSetParams, PhErrorState } from "./bits";
import SetupCard from "./SetupCard";

const KINDS = [
  { id: "all", label: "everyone" },
  { id: "identified", label: "signed in" },
  { id: "anonymous", label: "anonymous" },
] as const;

/** People: identified learners + anonymous visitors seen in the window, newest activity first. */
export default function PeopleTab() {
  const params = useSearchParams();
  const setParams = useSetParams();
  const router = useRouter();
  const days = useDays("30d");
  const q = params.get("q") || "";
  const kind = params.get("kind") || "all";
  const [draft, setDraft] = useState(q);
  const now = useNow();

  // debounce the search box into ?q=
  useEffect(() => {
    if (draft === q) return;
    const id = window.setTimeout(() => setParams({ q: draft.trim() || null }), 350);
    return () => window.clearTimeout(id);
  }, [draft, q, setParams]);

  const url = `/api/admin/posthog/people?days=${days}&kind=${kind}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data, error, loading, refresh } = useAdminData<PeopleRes | NotConfigured>(url);
  if (data && data.configured === false) return <SetupCard status={data.status} />;
  const res = data as PeopleRes | undefined;
  const rows = res?.people ?? [];
  const identified = rows.filter((r) => r.identified).length;

  const columns: Column<PersonRow>[] = [
    {
      key: "who",
      header: "person",
      sort: (r) => r.email || r.name || `~${r.distinctId}`,
      render: (r) => (
        <div className="min-w-0 max-w-[260px]">
          <Who who={r.email || r.name || `anon ${r.distinctId.slice(-6)}`} identified={r.identified} href={personHref(r.id)} />
          {r.name && r.email && <div className="truncate pl-3.5 text-[11px] text-fg-3">{r.name}</div>}
        </div>
      ),
    },
    { key: "last", header: "last seen", sort: (r) => r.lastSeen, render: (r) => <span className="font-mono text-xs text-fg">{timeAgo(r.lastSeen, now)}</span> },
    { key: "first", header: "first seen", sort: (r) => r.firstSeen || "", render: (r) => <span className="font-mono text-xs">{timeAgo(r.firstSeen, now)}</span> },
    { key: "sessions", header: "sessions", align: "right", sort: (r) => r.sessions, render: (r) => <span className="font-mono text-xs tabular-nums text-fg">{fmtNum(r.sessions)}</span> },
    { key: "pv", header: "pages", align: "right", sort: (r) => r.pageviews, render: (r) => <span className="font-mono text-xs tabular-nums">{fmtNum(r.pageviews)}</span> },
    {
      key: "where",
      header: "where · device",
      sort: (r) => r.country || "",
      render: (r) => (
        <div className="min-w-0 max-w-[200px]">
          <div className="truncate text-xs">{place(r.city, r.country)}</div>
          <div className="truncate font-mono text-[11px] text-fg-3">{[r.device, r.browser].filter(Boolean).join(" · ").toLowerCase() || "—"}</div>
        </div>
      ),
    },
    {
      key: "top",
      header: "top pages",
      render: (r) => (
        <div className="flex w-[230px] max-w-[230px] flex-col">
          {r.topPages.slice(0, 3).map((p) => (
            <span key={p} className="truncate font-mono text-[11px] text-fg-3">
              {p}
            </span>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-[1_1_240px]">
          <span className="sr-only">Search people</span>
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-fg-4">
            ⌕
          </span>
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="email, name, id, city…"
            className="min-h-10 w-full border border-line-strong bg-surface pl-8 pr-3 font-mono text-[13px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
          />
        </label>
        <div role="radiogroup" aria-label="Who" className="inline-flex border border-line-strong">
          {KINDS.map((k, i) => {
            const on = kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setParams({ kind: k.id === "all" ? null : k.id })}
                className={cx("min-h-10 px-2.5 font-mono text-xs", i > 0 && "border-l border-line-strong", on ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2")}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        <DaysPicker fallback="30d" />
      </div>

      {res && (
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-3">
          <span>
            {fmtNum(rows.length)}
            {rows.length >= 300 ? "+" : ""} people · last {days === 1 ? "24 h" : `${days} days`}
          </span>
          <Badge tone="signal">{identified} signed in</Badge>
          <Badge tone="muted">{rows.length - identified} anonymous</Badge>
        </div>
      )}

      {error ? (
        <PhErrorState error={error} onRetry={refresh} />
      ) : (
        <>
          {/* phones: cards */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {(loading && !res ? Array.from({ length: 5 }, () => null) : rows).map((r, i) =>
              r ? (
                <li key={r.id}>
                  <button type="button" onClick={() => router.push(personHref(r.id))} className="flex w-full flex-col gap-1.5 border border-line bg-surface px-3 py-2.5 text-left active:bg-surface-2">
                    <span className="flex items-center justify-between gap-2">
                      <Who who={r.email || r.name || `anon ${r.distinctId.slice(-6)}`} identified={r.identified} />
                      <span className="shrink-0 font-mono text-[11px] text-fg-3">{timeAgo(r.lastSeen, now)}</span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 font-mono text-[11px] text-fg-3">
                      <span>{r.sessions} sessions</span>
                      <span>{r.pageviews} pages</span>
                      <span>{place(r.city, r.country)}</span>
                    </span>
                    {r.topPages[0] && <span className="truncate font-mono text-[11px] text-fg-4">{r.topPages.slice(0, 2).join("  ·  ")}</span>}
                  </button>
                </li>
              ) : (
                <li key={i} className="h-20 animate-pulse border border-line bg-surface" />
              )
            )}
            {res && !rows.length && <li className="border border-dashed border-line-strong px-4 py-6 text-sm text-fg-3">Nobody matches.</li>}
          </ul>
          <div className="hidden sm:block">
            <Table
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(personHref(r.id))}
              loading={loading && !res}
              minWidth={900}
              dense
              empty={q ? `Nobody matches “${q}”` : "No visitors in this window"}
            />
          </div>
        </>
      )}
      <p className={cx(LABEL, "normal-case tracking-normal text-fg-4")}>orange dot = signed in (identified by Supabase user id) · hollow = anonymous visitor</p>
    </div>
  );
}
