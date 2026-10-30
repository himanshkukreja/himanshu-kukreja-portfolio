"use client";

/**
 * An AI call log (ai_calls rows), used on every admin surface that lists calls: /admin/ai (every call), /admin/chat
 * (the chat's messages, titles and memory updates: scope "chat") and a learner's page (their calls: `learner`).
 * Filtered by feature, learner (by email; not on a learner's page) and status, sorted by time, cost, credits or
 * tokens, and, on /admin/ai, with content jobs left out unless asked for: all in the database
 * (/api/admin/ai/calls, 50 a page), with the choices from /api/admin/ai/calls/facets (what's in the window). The
 * filters live in the URL so a filtered view can be shared or reloaded (the shared bar: ./filters.tsx).
 *
 * Course-chat, chat-memory and chat-title calls don't spend the learner's credits (the chat's own quota, quota.ts):
 * their rows show the cost in USD and, in the credits column, what they count as ("message", "title", "memory").
 */
import { useState } from "react";
import { Badge, Card, Drawer, EmptyState, ErrorState, fmtDate, fmtNum, LABEL, RangePicker, Table, timeAgo, useAdminData, useRange, type Chip, type Column } from "@/components/admin/ui";
import { ContentSwitch, FilterBar, FilterSelect, Pager, usd, usePage, UserPicker, useContentJobs, useUrlFilters } from "./filters";

export { usd };
export type Call = { id: number; created_at: string; user_id: string | null; email: string | null; feature: string; model: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cost_usd: number; credits: number; latency_ms: number | null; status: string; error: string | null; request_id: string | null; byok?: boolean };
type Facets = { features: { id: string; label: string; calls: number }[]; users: { id: string; email: string | null; calls: number }[]; usersPartial: boolean; contentHidden: { calls: number; cost: number } | null };

export const shortModel = (m: string) => m.replace("claude-", "").replace(/-\d{8}$/, "");

/** The course chat's calls: its own quota, never the learner's credits (lib/ai/chat/quota.ts CHAT_FEATURES). */
const CHAT_KIND: Record<string, string> = { "course-chat": "message", "chat-title": "title", "chat-memory": "memory" };
const STATUSES = ["ok", "off_topic", "over_quota", "rate_limited", "blocked", "disabled", "too_long", "error", "noop"];
export const CALL_SORTS = [
  { value: "new", label: "newest first" },
  { value: "cost.desc", label: "cost: highest" },
  { value: "cost.asc", label: "cost: lowest" },
  { value: "credits.desc", label: "credits: most" },
  { value: "credits.asc", label: "credits: fewest" },
  { value: "in.desc", label: "input tokens: most" },
  { value: "in.asc", label: "input tokens: fewest" },
  { value: "out.desc", label: "output tokens: most" },
  { value: "out.asc", label: "output tokens: fewest" },
];

/** /admin/ai's call-log filters (the dashboard's learner links set them). */
export const useCallLogParams = () => useUrlFilters();

function TranscriptDrawer({ call, onClose }: { call: Call | null; onClose: () => void }) {
  const { data, loading } = useAdminData<{ transcript: { input: string; output: string | null; created_at: string } | null }>(call ? `/api/admin/ai/transcript?id=${call.id}` : null);
  return (
    <Drawer open={!!call} onClose={onClose} label={call ? `${call.feature} · ${shortModel(call.model)} · ${usd(call.cost_usd, 4)}` : ""} title={call ? call.email || "no learner" : ""}>
      {loading && !data ? (
        <p className="m-0 font-mono text-xs text-fg-3">loading…</p>
      ) : data?.transcript ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className={LABEL}>sent</span>
            <pre className="m-0 whitespace-pre-wrap border border-line bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-fg-2">{data.transcript.input}</pre>
          </div>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>answer</span>
            <pre className="m-0 whitespace-pre-wrap border border-line bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-fg-2">{data.transcript.output}</pre>
          </div>
          <span className="font-mono text-[11px] text-fg-4">Kept 30 days for abuse checks (course chat: 90 days), then deleted automatically.</span>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-fg-3">No conversation text for this call: it was refused, it&apos;s a content job or evaluation, or it&apos;s older than its retention.</p>
      )}
    </Drawer>
  );
}

export default function CallLog({
  scope,
  learner,
  days,
  prefix = "",
  label = "every call",
  title = "Call log",
  id = "calls",
}: {
  /** "chat": the course chat's calls only (/admin/chat) */
  scope?: "chat";
  /** one learner's calls (their admin page): no learner filter or column */
  learner?: string;
  /** the page's own window in days (/admin/chat); without it the log has its own 24h…12m picker (`?range=`) */
  days?: number;
  /** URL key prefix, when a page has more than one filtered table */
  prefix?: string;
  label?: string;
  title?: string;
  id?: string;
}) {
  const { get, set } = useUrlFilters(prefix);
  const range = useRange("30d");
  const content = useContentJobs();
  // the chat's and a learner's calls are never content jobs (those run without a learner): no switch there
  const hasContent = !scope && !learner;
  const sortRaw = get("sort");
  const sort = CALL_SORTS.some((s) => s.value === sortRaw) ? sortRaw : "new";
  const feature = get("feature");
  const user = learner ? "" : get("user");
  const status = get("status");
  const include = hasContent && content.included;

  const common: Record<string, string> = {
    ...(days ? { days: String(days) } : { range }),
    ...(scope ? { scope } : {}),
    ...(learner ? { learner } : {}),
    ...(include ? { content: "1" } : {}),
  };
  const filterKey = JSON.stringify([common, sort, feature, user, status]);
  const [page, setPage] = usePage(filterKey);
  const qs = new URLSearchParams({ ...common, page: String(page), ...(sort !== "new" ? { sort } : {}), ...(feature ? { feature } : {}), ...(status ? { status } : {}), ...(user ? { user } : {}) });
  const { data, error, loading, refresh } = useAdminData<{ rows: Call[]; total: number; page: number }>(`/api/admin/ai/calls?${qs}`, { refreshMs: 30_000 });
  const facets = useAdminData<Facets>(`/api/admin/ai/calls/facets?${new URLSearchParams({ ...common, ...(feature ? { feature } : {}) })}`);
  const [open, setOpen] = useState<Call | null>(null);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  const listed = facets.data?.features ?? [];
  // a feature from the URL that has no calls in this window still shows as picked
  const features = feature && !listed.some((f) => f.id === feature) ? [...listed, { id: feature, label: feature, calls: 0 }] : listed;
  const featureLabel = (fid: string) => features.find((f) => f.id === fid)?.label || fid;
  const userEmail = (uid: string) => facets.data?.users.find((u) => u.id === uid)?.email || data?.rows.find((r) => r.user_id === uid)?.email || null;
  const chatPicked = !!CHAT_KIND[feature];
  // a chat feature has no credits to sort by
  const pickFeature = (f: string) => set({ feature: f || null, ...(CHAT_KIND[f] && sort.startsWith("credits") ? { sort: null } : {}) });

  const chips: Chip[] = [
    ...(feature ? [{ key: "feature", label: "feature", value: featureLabel(feature) }] : []),
    ...(user ? [{ key: "user", label: "learner", value: userEmail(user) || `${user.slice(0, 8)}…` }] : []),
    ...(status ? [{ key: "status", label: "status", value: status }] : []),
    ...(sort !== "new" ? [{ key: "sort", label: "sort", value: CALL_SORTS.find((s) => s.value === sort)?.label || sort }] : []),
  ];

  const columns: Column<Call>[] = [
    { key: "t", header: "When", render: (r) => <span title={fmtDate(r.created_at, true)}>{timeAgo(r.created_at)}</span> },
    ...(learner
      ? []
      : [
          {
            key: "u",
            header: "Learner",
            render: (r: Call) =>
              r.user_id ? (
                <button type="button" onClick={(e) => (e.stopPropagation(), set({ user: r.user_id }))} className="text-left underline decoration-line-strong underline-offset-2">
                  {r.email || r.user_id.slice(0, 8)}
                </button>
              ) : (
                <span className="text-fg-4">no learner</span>
              ),
          },
        ]),
    {
      key: "f",
      header: "Feature",
      render: (r) => (
        <button type="button" onClick={(e) => (e.stopPropagation(), pickFeature(r.feature))} className="font-mono text-xs underline decoration-line-strong underline-offset-2">
          {r.feature}
        </button>
      ),
    },
    { key: "m", header: "Model", render: (r) => <span className="font-mono text-xs">{shortModel(r.model)}{r.byok ? " · own key" : ""}</span> },
    { key: "s", header: "Status", render: (r) => <Badge tone={r.status === "ok" ? "ok" : r.status === "error" ? "bad" : "signal"} title={r.error || undefined}>{r.status}</Badge> },
    { key: "tok", header: "Tokens in / out / cached", align: "right", render: (r) => <span className="font-mono text-xs">{fmtNum(r.input_tokens)} / {fmtNum(r.output_tokens)} / {fmtNum(r.cache_read_tokens)}</span> },
    { key: "c", header: "Cost", align: "right", render: (r) => usd(r.cost_usd, 4) },
    {
      key: "cr",
      header: "Credits",
      align: "right",
      render: (r) =>
        CHAT_KIND[r.feature] ? (
          <span className="font-mono text-[11px] text-fg-4" title="Course chat: counted in the chat's own message quota, not the learner's credits. The cost is still metered against the monthly budget.">
            chat {CHAT_KIND[r.feature]}
          </span>
        ) : (
          fmtNum(r.credits)
        ),
    },
    { key: "l", header: "Latency", align: "right", hideOnPhone: true, render: (r) => (r.latency_ms ? `${fmtNum(r.latency_ms / 1000, 1)} s` : "—") },
  ];

  return (
    <Card id={id} label={label} title={`${title}${data ? ` · ${fmtNum(data.total)}` : ""}`} pad={false} action={days ? undefined : <RangePicker fallback="30d" />}>
      <FilterBar
        chips={chips}
        onRemove={(k) => set({ [k]: null })}
        onClear={() => set({ feature: null, user: null, status: null, sort: null })}
        notes={
          <>
            {hasContent && <ContentSwitch hidden={facets.data?.contentHidden} />}
            {sort.startsWith("credits") && <p className="m-0 font-mono text-[11px] text-fg-4">Credits sort leaves out course-chat, chat-title and chat-memory calls: the chat has its own message quota and doesn&apos;t spend credits.</p>}
            {facets.error && <p className="m-0 font-mono text-[11px] text-bad-text">Couldn&apos;t load the filter choices: {facets.error.message}</p>}
          </>
        }
      >
        <FilterSelect label="feature" value={feature} onChange={pickFeature} allLabel={`all features${facets.data ? ` (${features.length})` : ""}`} options={features.map((f) => ({ value: f.id, label: `${f.label} · ${fmtNum(f.calls)}` }))} />
        {!learner && <UserPicker users={facets.data?.users ?? []} value={user} fallback={user ? userEmail(user) : null} loading={facets.loading} partial={facets.data?.usersPartial} onPick={(uid) => set({ user: uid || null })} />}
        <FilterSelect label="status" value={status} onChange={(v) => set({ status: v || null })} allLabel="all statuses" options={STATUSES.map((x) => ({ value: x, label: x }))} />
        <FilterSelect label="sort" value={sort} onChange={(v) => set({ sort: v === "new" ? null : v })} options={CALL_SORTS.map((s) => ({ ...s, disabled: chatPicked && s.value.startsWith("credits") }))} />
      </FilterBar>
      {error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : (
        <Table<Call>
          rowKey={(r) => String(r.id)}
          rows={data?.rows ?? []}
          loading={loading && !data}
          onRowClick={(r) => setOpen(r)}
          dense
          minWidth={learner ? 860 : 980}
          empty={<EmptyState className="m-4" title="No AI calls match" hint={chips.length ? "Try a longer window or clear a filter." : "Every call, allowed or refused, shows up here."} />}
          columns={columns}
        />
      )}
      <TranscriptDrawer call={open} onClose={() => setOpen(null)} />
      <Pager page={page} pages={pages} onPage={setPage} />
    </Card>
  );
}
