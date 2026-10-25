"use client";

/**
 * /admin/ai: the switch and budget, the governor's view of this credit cycle, spend by day, feature,
 * model and user, per-feature switches/models/limits, AI blocks, and the full call log.
 */
import { useState } from "react";
import { adminJson } from "@/lib/admin/fetch";
import { Badge, Card, Drawer, EmptyState, ErrorState, fmtDate, fmtNum, Kpi, LABEL, PageHead, Table, timeAgo, TrendChart, useAdminData } from "@/components/admin/ui";

type FeatureRow = { id: string; label: string; enabled: boolean; model: string; defaultModel: string; perDay: number; live: boolean; maxTokens: number };
type Dash = {
  byFeature: { feature: string; calls: number; refused: number; cost: number; credits: number; input: number; output: number; cache_read: number; latency: number | null }[];
  byModel: { model: string; calls: number; cost: number; input: number; output: number }[];
  byStatus: Record<string, number>;
  daily: { day: string; live: number; content: number; calls: number }[];
  users: { user_id: string; email: string | null; calls: number; refused: number; cost: number; credits: number; today: number; last_at: string; blocked: boolean }[];
};
type Settings = {
  enabled: boolean;
  cycleDay: number;
  monthlyBudgetUsd: number;
  liveShare: number;
  userDailyMaxUsd: number;
  userDailyMinUsd: number;
  endsOn: string | null;
  features: Record<string, { enabled?: boolean; model?: string; perDay?: number }>;
  note: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};
type Budget = {
  mode: "green" | "amber" | "red" | "off";
  reason: string;
  cycle: { start: string; end: string; daysLeft: number };
  monthlyBudget: number;
  liveBudget: number;
  spentCycle: number;
  spentCycleLive: number;
  spentToday: number;
  todayBudget: number;
  activeUsers: number;
  userDailyUsd: number;
  userDailyCredits: number;
};
type Resp = { keyConfigured: boolean; settings: Settings; budget: Budget; dashboard: Dash; features: FeatureRow[]; models: { id: string; price: { input: number; output: number } }[] };
type Call = { id: number; created_at: string; user_id: string | null; email: string | null; feature: string; model: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cost_usd: number; credits: number; latency_ms: number | null; status: string; error: string | null; request_id: string | null };

const usd = (n: number | null | undefined, d = 2) => `$${Number(n ?? 0).toFixed(d)}`;
const MODE_TONE = { green: "ok", amber: "signal", red: "bad", off: "muted" } as const;
const INPUT = "min-h-10 w-full border border-line-strong bg-bg px-3 font-mono text-[13px] text-fg";
const shortModel = (m: string) => m.replace("claude-", "").replace(/-\d{8}$/, "");

function Controls({ s, onSaved }: { s: Settings; onSaved: () => void }) {
  const [f, setF] = useState({
    cycleDay: String(s.cycleDay),
    monthlyBudgetUsd: String(s.monthlyBudgetUsd),
    liveShare: String(Math.round(s.liveShare * 100)),
    userDailyMaxUsd: String(s.userDailyMaxUsd),
    userDailyMinUsd: String(s.userDailyMinUsd),
    endsOn: s.endsOn ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    try {
      await adminJson("/api/admin/ai", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      setMsg("saved");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = (k: keyof typeof f, label: string, hint: string, type = "number") => (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={INPUT} />
      <span className="text-[12px] text-fg-4">{hint}</span>
    </label>
  );
  return (
    <Card
      label="the switch and the budget"
      title={s.enabled ? "AI is on for learners" : "AI is off for learners"}
      action={
        <button
          type="button"
          disabled={busy}
          onClick={() => save({ enabled: !s.enabled })}
          className={`min-h-10 px-4 font-mono text-sm font-semibold ${s.enabled ? "border border-bad text-bad" : "bg-signal text-on-signal"}`}
        >
          {s.enabled ? "Switch AI off" : "Switch AI on"}
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {field("monthlyBudgetUsd", "monthly budget (usd)", "Hard stop for the credit cycle")}
        {field("liveShare", "live share (%)", "The rest is kept for batch content jobs")}
        {field("cycleDay", "cycle starts on day", "The day your credits renew (1–28)")}
        {field("userDailyMaxUsd", "per-user daily max (usd)", "Ceiling on one learner's day")}
        {field("userDailyMinUsd", "per-user daily min (usd)", "Floor, even at huge scale")}
        {field("endsOn", "credits end on", "AI switches off after this date", "date")}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            save({
              cycleDay: Number(f.cycleDay),
              monthlyBudgetUsd: Number(f.monthlyBudgetUsd),
              liveShare: Number(f.liveShare) / 100,
              userDailyMaxUsd: Number(f.userDailyMaxUsd),
              userDailyMinUsd: Number(f.userDailyMinUsd),
              endsOn: f.endsOn || null,
            })
          }
          className="min-h-10 border border-line-strong px-4 font-mono text-sm text-fg hover:border-fg-3"
        >
          Save budget
        </button>
        {msg && <span className="font-mono text-xs text-fg-3">{msg}</span>}
        {s.updatedAt && (
          <span className="font-mono text-xs text-fg-4">
            last change {timeAgo(s.updatedAt)}
            {s.updatedBy ? ` by ${s.updatedBy}` : ""}
          </span>
        )}
      </div>
    </Card>
  );
}

function FeatureTable({ rows, dash, models, settings, onSaved }: { rows: FeatureRow[]; dash: Dash; models: Resp["models"]; settings: Settings; onSaved: () => void }) {
  const stat = (id: string) => dash.byFeature.find((x) => x.feature === id);
  const save = async (id: string, patch: { enabled?: boolean; model?: string; perDay?: number }) => {
    const features = { ...settings.features, [id]: { ...(settings.features[id] || {}), ...patch } };
    await adminJson("/api/admin/ai", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ features }) });
    onSaved();
  };
  return (
    <Card label="features" title="Switch, model and daily limit per feature" pad={false}>
      <Table<FeatureRow>
        rowKey={(r) => r.id}
        rows={rows}
        minWidth={860}
        columns={[
          { key: "label", header: "Feature", render: (r) => <span className="flex flex-col"><span className="text-fg">{r.label}</span><span className="font-mono text-[11px] text-fg-4">{r.id}{r.live ? "" : " · content job"}</span></span> },
          {
            key: "on",
            header: "On",
            render: (r) => (
              <button type="button" onClick={() => save(r.id, { enabled: !r.enabled })} className={`min-h-8 px-2.5 font-mono text-xs ${r.enabled ? "bg-signal text-on-signal" : "border border-line-strong text-fg-3"}`}>
                {r.enabled ? "on" : "off"}
              </button>
            ),
          },
          {
            key: "model",
            header: "Model",
            render: (r) => (
              <select value={r.model} onChange={(e) => save(r.id, { model: e.target.value })} className="min-h-8 border border-line-strong bg-bg px-2 font-mono text-xs text-fg">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {shortModel(m.id)} · ${m.price.input}/${m.price.output}
                  </option>
                ))}
              </select>
            ),
          },
          {
            key: "perDay",
            header: "Per user / day",
            render: (r) =>
              r.live ? (
                <input
                  type="number"
                  defaultValue={r.perDay}
                  onBlur={(e) => Number(e.target.value) !== r.perDay && save(r.id, { perDay: Number(e.target.value) })}
                  className="min-h-8 w-20 border border-line-strong bg-bg px-2 font-mono text-xs text-fg"
                />
              ) : (
                <span className="text-fg-4">—</span>
              ),
          },
          { key: "calls", header: "Calls", align: "right", sort: (r) => stat(r.id)?.calls ?? 0, render: (r) => fmtNum(stat(r.id)?.calls ?? 0) },
          { key: "refused", header: "Refused", align: "right", hideOnPhone: true, render: (r) => fmtNum(stat(r.id)?.refused ?? 0) },
          { key: "cost", header: "Cost", align: "right", sort: (r) => stat(r.id)?.cost ?? 0, render: (r) => usd(stat(r.id)?.cost, 3) },
          { key: "avg", header: "Avg / call", align: "right", hideOnPhone: true, render: (r) => { const x = stat(r.id); return x?.calls ? usd(x.cost / x.calls, 4) : "—"; } },
          { key: "lat", header: "Latency", align: "right", hideOnPhone: true, render: (r) => (stat(r.id)?.latency ? `${fmtNum((stat(r.id)!.latency ?? 0) / 1000, 1)} s` : "—") },
        ]}
      />
    </Card>
  );
}

function TranscriptDrawer({ call, onClose }: { call: Call | null; onClose: () => void }) {
  const { data, loading } = useAdminData<{ transcript: { input: string; output: string | null; created_at: string } | null }>(call ? `/api/admin/ai/transcript?id=${call.id}` : null);
  return (
    <Drawer open={!!call} onClose={onClose} label={call ? `${call.feature} · ${shortModel(call.model)} · ${usd(call.cost_usd, 4)}` : ""} title={call ? call.email || "system" : ""}>
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
          <span className="font-mono text-[11px] text-fg-4">Kept 30 days for abuse checks, then deleted automatically.</span>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-fg-3">No conversation text for this call: it was refused, it&apos;s a content job or evaluation, or it&apos;s older than 30 days.</p>
      )}
    </Drawer>
  );
}

function CallLog({ feature, onFeature, user, onUser }: { feature: string; onFeature: (f: string) => void; user: string; onUser: (u: string) => void }) {
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(feature ? { feature } : {}), ...(status ? { status } : {}), ...(user ? { user } : {}), ...(email ? { email } : {}) });
  const { data, error, loading, refresh } = useAdminData<{ rows: Call[]; total: number; page: number }>(`/api/admin/ai/calls?${qs}`, { refreshMs: 30_000 });
  const [open, setOpen] = useState<Call | null>(null);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));
  return (
    <Card
      label="every call"
      title={`Call log${data ? ` · ${fmtNum(data.total)}` : ""}`}
      pad={false}
      action={
        <div className="flex flex-wrap gap-2">
          <input placeholder="email" value={email} onChange={(e) => (setEmail(e.target.value), setPage(1))} className="min-h-8 w-40 border border-line-strong bg-bg px-2 font-mono text-xs text-fg" />
          <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="min-h-8 border border-line-strong bg-bg px-2 font-mono text-xs text-fg">
            <option value="">all statuses</option>
            {["ok", "off_topic", "over_quota", "rate_limited", "blocked", "disabled", "too_long", "error"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          {(feature || user) && (
            <button type="button" onClick={() => (onFeature(""), onUser(""))} className="min-h-8 border border-line-strong px-2 font-mono text-xs text-fg-2">
              clear {feature ? `feature: ${feature}` : ""} {user ? "user" : ""} ×
            </button>
          )}
        </div>
      }
    >
      {error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : (
        <Table<Call>
          rowKey={(r) => String(r.id)}
          rows={data?.rows ?? []}
          loading={loading && !data}
          onRowClick={(r) => setOpen(r)}
          dense
          minWidth={980}
          empty={<EmptyState title="No AI calls yet" hint="Every call, allowed or refused, shows up here." />}
          columns={[
            { key: "t", header: "When", render: (r) => <span title={fmtDate(r.created_at, true)}>{timeAgo(r.created_at)}</span> },
            { key: "u", header: "User", render: (r) => (r.user_id ? <button type="button" onClick={() => onUser(r.user_id!)} className="text-left underline decoration-line-strong underline-offset-2">{r.email || r.user_id.slice(0, 8)}</button> : <span className="text-fg-4">system</span>) },
            { key: "f", header: "Feature", render: (r) => <button type="button" onClick={() => onFeature(r.feature)} className="font-mono text-xs underline decoration-line-strong underline-offset-2">{r.feature}</button> },
            { key: "m", header: "Model", render: (r) => <span className="font-mono text-xs">{shortModel(r.model)}</span> },
            { key: "s", header: "Status", render: (r) => <Badge tone={r.status === "ok" ? "ok" : r.status === "error" ? "bad" : "signal"} title={r.error || undefined}>{r.status}</Badge> },
            { key: "tok", header: "Tokens in / out / cached", align: "right", render: (r) => <span className="font-mono text-xs">{fmtNum(r.input_tokens)} / {fmtNum(r.output_tokens)} / {fmtNum(r.cache_read_tokens)}</span> },
            { key: "c", header: "Cost", align: "right", render: (r) => usd(r.cost_usd, 4) },
            { key: "cr", header: "Credits", align: "right", render: (r) => fmtNum(r.credits) },
            { key: "l", header: "Latency", align: "right", hideOnPhone: true, render: (r) => (r.latency_ms ? `${fmtNum(r.latency_ms / 1000, 1)} s` : "—") },
          ]}
        />
      )}
      <TranscriptDrawer call={open} onClose={() => setOpen(null)} />
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 font-mono text-xs text-fg-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-40">← newer</button>
          <span>page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="disabled:opacity-40">older →</button>
        </div>
      )}
    </Card>
  );
}

export default function AiDashboard() {
  const { data, error, loading, refresh } = useAdminData<Resp>("/api/admin/ai", { refreshMs: 30_000 });
  const [feature, setFeature] = useState("");
  const [user, setUser] = useState("");
  const block = async (userId: string, blocked: boolean) => {
    await adminJson("/api/admin/ai/block", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, blocked }) });
    refresh();
  };

  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  const b = data?.budget;
  const d = data?.dashboard;
  return (
    <div className="flex flex-col gap-6">
      <PageHead
        path="sudo ~/admin/ai"
        title="AI"
        sub="Every AI call, what it cost and who made it. The switch, the budget and the limits."
        actions={
          b && (
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={MODE_TONE[b.mode]}>{b.mode}</Badge>
              <span className="font-mono text-xs text-fg-3">{b.reason}</span>
              {!data?.keyConfigured && <Badge tone="bad">no API key</Badge>}
            </span>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi loading={loading && !data} label="spent this cycle" value={b ? `${usd(b.spentCycle)} / ${usd(b.monthlyBudget, 0)}` : "–"} hint={b ? `${fmtDate(b.cycle.start)} → ${fmtDate(b.cycle.end)} · ${b.cycle.daysLeft} days left` : ""} />
        <Kpi loading={loading && !data} label="live features" value={b ? `${usd(b.spentCycleLive)} / ${usd(b.liveBudget, 0)}` : "–"} hint={b ? `content jobs: ${usd(b.spentCycle - b.spentCycleLive)}` : ""} />
        <Kpi loading={loading && !data} label="today (live)" value={b ? `${usd(b.spentToday, 3)} / ${usd(b.todayBudget, 2)}` : "–"} hint="today's share = what's left ÷ days left" />
        <Kpi loading={loading && !data} label="ai users · last 7 days" value={b ? fmtNum(b.activeUsers) : "–"} />
        <Kpi loading={loading && !data} label="each user's daily allowance" value={b ? `${fmtNum(b.userDailyCredits)} credits` : "–"} hint={b ? `${usd(b.userDailyUsd, 3)} · 1 credit = $0.001` : ""} />
        <Kpi loading={loading && !data} label="calls this cycle" value={d ? fmtNum(d.byStatus.ok ?? 0) : "–"} hint={d ? Object.entries(d.byStatus).filter(([k]) => k !== "ok").map(([k, v]) => `${k} ${v}`).join(" · ") || "nothing refused" : ""} />
      </div>

      {data && <Controls key={data.settings.updatedAt ?? "s"} s={data.settings} onSaved={refresh} />}

      <Card label="spend per day" title="Live features and content jobs (USD)">
        <TrendChart
          loading={loading && !data}
          data={(d?.daily ?? []).map((x) => ({ t: x.day, live: Number(x.live), content: Number(x.content) }))}
          series={[
            { key: "live", label: "live", format: (n) => usd(n, 3) },
            { key: "content", label: "content jobs", format: (n) => usd(n, 3) },
          ]}
          formatY={(n) => usd(n, 2)}
          empty="No spend yet this cycle"
        />
      </Card>

      {data && d && <FeatureTable rows={data.features} dash={d} models={data.models} settings={data.settings} onSaved={refresh} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card label="users" title="Who spends what (this cycle)" pad={false}>
          <Table<Dash["users"][number]>
            rowKey={(r) => r.user_id}
            rows={d?.users ?? []}
            loading={loading && !data}
            minWidth={720}
            initialSort={{ key: "cost", dir: "desc" }}
            empty={<EmptyState title="No learner has used AI yet" />}
            columns={[
              { key: "email", header: "Learner", render: (r) => <button type="button" onClick={() => setUser(r.user_id)} className="text-left underline decoration-line-strong underline-offset-2">{r.email || r.user_id.slice(0, 8)}</button> },
              { key: "calls", header: "Calls", align: "right", sort: (r) => r.calls, render: (r) => fmtNum(r.calls) },
              { key: "refused", header: "Refused", align: "right", hideOnPhone: true, sort: (r) => r.refused, render: (r) => fmtNum(r.refused) },
              { key: "cost", header: "Cost", align: "right", sort: (r) => Number(r.cost), render: (r) => usd(r.cost, 3) },
              { key: "today", header: "Today", align: "right", sort: (r) => Number(r.today), render: (r) => usd(r.today, 3) },
              { key: "last", header: "Last", hideOnPhone: true, sort: (r) => r.last_at, render: (r) => timeAgo(r.last_at) },
              {
                key: "block",
                header: "",
                render: (r) => (
                  <button type="button" onClick={() => block(r.user_id, !r.blocked)} className={`min-h-8 px-2 font-mono text-xs ${r.blocked ? "bg-bad text-white" : "border border-line-strong text-fg-3 hover:text-bad"}`}>
                    {r.blocked ? "blocked · undo" : "block"}
                  </button>
                ),
              },
            ]}
          />
        </Card>
        <Card label="models" title="Spend by model" pad={false}>
          <Table<Dash["byModel"][number]>
            rowKey={(r) => r.model}
            rows={d?.byModel ?? []}
            loading={loading && !data}
            minWidth={320}
            empty={<EmptyState title="No calls yet" />}
            columns={[
              { key: "m", header: "Model", render: (r) => <span className="font-mono text-xs">{shortModel(r.model)}</span> },
              { key: "calls", header: "Calls", align: "right", render: (r) => fmtNum(r.calls) },
              { key: "cost", header: "Cost", align: "right", render: (r) => usd(r.cost, 3) },
            ]}
          />
        </Card>
      </div>

      <CallLog feature={feature} onFeature={setFeature} user={user} onUser={setUser} />
      <p className="m-0 text-[12px] text-fg-4">
        Costs are computed from each call&apos;s token usage and the price table in src/lib/ai/prices.ts. The Anthropic console bill is the source of truth: compare them after the first week.
      </p>
    </div>
  );
}
