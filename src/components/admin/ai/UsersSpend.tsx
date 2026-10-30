"use client";

/**
 * /admin/ai "Who spends what (this cycle)": learners with their calls, cost, credits (the course chat excluded: its
 * own message quota), tokens and today's cost, filtered by feature and learner and sorted on the server
 * (/api/admin/ai/users, 25 a page). Its filters sit in the URL under the "u" prefix (?ufeature, uuser, usort), apart
 * from the call log's. Content jobs never appear here: they run without a learner.
 */
import { useState } from "react";
import { adminJson } from "@/lib/admin/fetch";
import { Card, EmptyState, ErrorState, fmtNum, Table, timeAgo, useAdminData, type Chip } from "@/components/admin/ui";
import { FilterBar, FilterSelect, Pager, usd, usePage, UserPicker, useUrlFilters } from "./filters";

type Row = { user_id: string; email: string | null; calls: number; refused: number; cost: number; credits: number; tokens: number; today: number; last_at: string; blocked: boolean };
type Resp = { rows: Row[]; total: number; page: number; pageSize: number; features: { id: string; label: string; calls: number }[]; users: { id: string; email: string | null; calls: number }[] };

const SORTS = [
  { value: "new", label: "most recent" },
  { value: "cost.desc", label: "cost: highest" },
  { value: "cost.asc", label: "cost: lowest" },
  { value: "credits.desc", label: "credits: most" },
  { value: "credits.asc", label: "credits: fewest" },
  { value: "tokens.desc", label: "tokens: most" },
  { value: "tokens.asc", label: "tokens: fewest" },
];

export default function UsersSpend({ onShowUser, onLimit }: { onShowUser: (id: string) => void; onLimit: (email: string) => void }) {
  const { get, set } = useUrlFilters("u");
  const feature = get("feature");
  const user = get("user");
  const sortRaw = get("sort");
  const sort = SORTS.some((s) => s.value === sortRaw) ? sortRaw : "new";
  const [page, setPage] = usePage(JSON.stringify([feature, user, sort]));
  const qs = new URLSearchParams({ page: String(page), ...(feature ? { feature } : {}), ...(user ? { user } : {}), ...(sort !== "new" ? { sort } : {}) });
  const { data, error, loading, refresh } = useAdminData<Resp>(`/api/admin/ai/users?${qs}`, { refreshMs: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const block = async (r: Row) => {
    setBusy(r.user_id);
    await adminJson("/api/admin/ai/block", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: r.user_id, blocked: !r.blocked }) }).catch(() => null);
    setBusy(null);
    refresh();
  };
  const featureLabel = (id: string) => data?.features.find((f) => f.id === id)?.label || id;
  const emailOf = (id: string) => data?.users.find((u) => u.id === id)?.email || data?.rows.find((r) => r.user_id === id)?.email || null;
  const chips: Chip[] = [
    ...(feature ? [{ key: "feature", label: "feature", value: featureLabel(feature) }] : []),
    ...(user ? [{ key: "user", label: "learner", value: emailOf(user) || `${user.slice(0, 8)}…` }] : []),
    ...(sort !== "new" ? [{ key: "sort", label: "sort", value: SORTS.find((s) => s.value === sort)?.label || sort }] : []),
  ];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));
  return (
    <Card id="spenders" label="users" title={`Who spends what (this cycle)${data ? ` · ${fmtNum(data.total)}` : ""}`} pad={false}>
      <FilterBar chips={chips} onRemove={(k) => set({ [k]: null })} onClear={() => set({ feature: null, user: null, sort: null })}>
        <FilterSelect label="feature" value={feature} onChange={(v) => set({ feature: v || null })} allLabel="all features" options={(data?.features ?? []).map((f) => ({ value: f.id, label: `${f.label} · ${fmtNum(f.calls)}` }))} />
        <UserPicker users={data?.users ?? []} value={user} fallback={user ? emailOf(user) : null} loading={loading} onPick={(id) => set({ user: id || null })} />
        <FilterSelect label="sort" value={sort} onChange={(v) => set({ sort: v === "new" ? null : v })} options={SORTS} />
      </FilterBar>
      {error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : (
        <Table<Row>
          rowKey={(r) => r.user_id}
          rows={data?.rows ?? []}
          loading={loading && !data}
          minWidth={760}
          empty={<EmptyState className="m-4" title={chips.length ? "No learner matches" : "No learner has used AI yet"} />}
          columns={[
            {
              key: "email",
              header: "Learner",
              render: (r) => (
                <button type="button" onClick={() => onShowUser(r.user_id)} className="text-left underline decoration-line-strong underline-offset-2" title="Show their calls in the call log">
                  {r.email || r.user_id.slice(0, 8)}
                </button>
              ),
            },
            { key: "calls", header: "Calls", align: "right", render: (r) => fmtNum(r.calls) },
            { key: "refused", header: "Refused", align: "right", hideOnPhone: true, render: (r) => fmtNum(r.refused) },
            { key: "cost", header: "Cost", align: "right", render: (r) => usd(r.cost, 3) },
            { key: "credits", header: "Credits", align: "right", hideOnPhone: true, render: (r) => <span title="Shared credits used (the course chat is left out: its own message quota)">{fmtNum(r.credits)}</span> },
            { key: "tokens", header: "Tokens", align: "right", hideOnPhone: true, render: (r) => fmtNum(r.tokens) },
            { key: "today", header: "Today", align: "right", render: (r) => usd(r.today, 3) },
            { key: "last", header: "Last", hideOnPhone: true, render: (r) => timeAgo(r.last_at) },
            {
              key: "limit",
              header: "",
              hideOnPhone: true,
              render: (r) =>
                r.email ? (
                  <button type="button" onClick={() => onLimit(r.email!)} className="min-h-8 border border-line-strong px-2 font-mono text-xs text-fg-3 hover:text-fg" title="Set this learner's daily credits">
                    credits…
                  </button>
                ) : null,
            },
            {
              key: "block",
              header: "",
              render: (r) => (
                <button type="button" disabled={busy === r.user_id} onClick={() => block(r)} className={`min-h-8 px-2 font-mono text-xs ${r.blocked ? "bg-bad text-white" : "border border-line-strong text-fg-3 hover:text-bad"}`}>
                  {r.blocked ? "blocked · undo" : "block"}
                </button>
              ),
            },
          ]}
        />
      )}
      <Pager page={page} pages={pages} onPage={setPage} />
    </Card>
  );
}
