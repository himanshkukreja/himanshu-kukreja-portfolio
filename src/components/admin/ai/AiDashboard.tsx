"use client";

/**
 * /admin/ai: the switch and budget, the governor's view of this credit cycle, spend by day, feature,
 * model and user, per-feature switches/models/limits, AI blocks, and the full call log.
 */
import { useEffect, useRef, useState } from "react";
import { adminJson } from "@/lib/admin/fetch";
import { Badge, Card, EmptyState, ErrorState, fmtDate, fmtNum, Kpi, LABEL, PageHead, Table, timeAgo, TrendChart, useAdminData } from "@/components/admin/ui";
import CallLog, { shortModel, usd, useCallLogParams } from "./CallLog";
import { ContentSwitch, useContentJobs } from "./filters";
import UsersSpend from "./UsersSpend";

type FeatureRow = { id: string; label: string; enabled: boolean; model: string; defaultModel: string; perDay: number; live: boolean; maxTokens: number; content?: boolean };
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
  contentBudget: number;
  spentCycle: number;
  spentCycleLive: number;
  spentCycleContent: number;
  spentToday: number;
  todayBudget: number;
  activeUsers: number;
  userDailyUsd: number;
  userDailyCredits: number;
};
type Resp = {
  keyConfigured: boolean;
  settings: Settings;
  budget: Budget;
  dashboard: Dash;
  /** this cycle without the content jobs (the "exclude content jobs" view) */
  live?: { byModel: { model: string; calls: number; cost: number }[]; byStatus: Record<string, number> };
  features: FeatureRow[];
  models: { id: string; price: { input: number; output: number } }[];
};
const MODE_TONE = { green: "ok", amber: "signal", red: "bad", off: "muted" } as const;
const INPUT = "min-h-10 w-full border border-line-strong bg-bg px-3 font-mono text-[13px] text-fg";

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
        {field("liveShare", "live share (%)", "The rest is a hard cap for content jobs (eval, batch)")}
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

function FeatureTable({ rows: all, dash, models, settings, onSaved }: { rows: FeatureRow[]; dash: Dash; models: Resp["models"]; settings: Settings; onSaved: () => void }) {
  // content jobs (eval, batch) are left out with the page's "exclude content jobs" switch
  const { included, setIncluded } = useContentJobs();
  const isContent = (r: FeatureRow) => r.content ?? !r.live;
  const rows = included ? all : all.filter((r) => !isContent(r));
  const hiddenN = all.length - rows.length;
  const stat = (id: string) => dash.byFeature.find((x) => x.feature === id);
  const save = async (id: string, patch: { enabled?: boolean; model?: string; perDay?: number }) => {
    const features = { ...settings.features, [id]: { ...(settings.features[id] || {}), ...patch } };
    await adminJson("/api/admin/ai", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ features }) });
    onSaved();
  };
  return (
    <Card
      label="features"
      title="Switch, model and daily limit per feature"
      pad={false}
      action={
        hiddenN > 0 ? (
          <button type="button" onClick={() => setIncluded(true)} className="min-h-9 font-mono text-[11px] text-fg-4 underline decoration-line-strong underline-offset-2 hover:text-fg">
            {hiddenN} content-job features hidden · show
          </button>
        ) : undefined
      }
    >
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

type LimitRow = { userId: string; email: string | null; dailyCredits: number; note: string | null; updatedAt: string; updatedBy: string | null };

/**
 * Per-learner daily credits: give one account more (or fewer) credits a day than the shared
 * allowance. The monthly budget still applies to everyone. 1 credit = $0.001.
 */
function UserLimits({ prefill, onChanged }: { prefill: { email: string; key: number } | null; onChanged: () => void }) {
  const { data, error, loading, refresh } = useAdminData<{ shared: { credits: number; ceiling: number }; limits: LimitRow[] }>("/api/admin/ai/limits");
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState("1000");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!prefill) return;
    const t = window.setTimeout(() => {
      setEmail(prefill.email);
      emailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      emailRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [prefill]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminJson("/api/admin/ai/limits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), dailyCredits: Number(credits), note }) });
      setMsg({ ok: true, text: `${email.trim()} now gets ${fmtNum(Number(credits))} credits a day.` });
      setEmail("");
      setNote("");
      refresh();
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't save." });
    }
    setBusy(false);
  };
  const remove = async (r: LimitRow) => {
    await adminJson(`/api/admin/ai/limits?userId=${encodeURIComponent(r.userId)}`, { method: "DELETE" });
    refresh();
    onChanged();
  };
  const input = "min-h-10 border border-line-strong bg-bg px-2.5 text-sm text-fg placeholder:text-fg-4";
  return (
    <Card label="per-learner credits" title="Give a learner their own daily credits" pad={false}>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <p className="m-0 text-sm text-fg-3">
          Everyone else gets the shared allowance{data ? <> (today {fmtNum(data.shared.credits)} credits, ceiling {fmtNum(data.shared.ceiling)})</> : null}. A custom number replaces it for that account, higher or lower; 0 stops their AI
          for the day. The monthly budget and its slow-down modes still apply. 1 credit = $0.001; changes apply within 30 seconds.
        </p>
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[220px] flex-[2] flex-col gap-1">
            <span className={LABEL}>learner email</span>
            <input ref={emailRef} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={input} />
          </label>
          <label className="flex w-[140px] flex-col gap-1">
            <span className={LABEL}>credits / day</span>
            <input type="number" min={0} max={1000000} step={50} required value={credits} onChange={(e) => setCredits(e.target.value)} className={`${input} font-mono`} />
          </label>
          <label className="flex min-w-[180px] flex-[1] flex-col gap-1">
            <span className={LABEL}>note (optional)</span>
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="beta tester, mentor…" className={input} />
          </label>
          <button type="submit" disabled={busy || !email.trim()} className="min-h-10 bg-signal px-4 font-mono text-xs font-semibold text-on-signal disabled:opacity-50">
            {busy ? "saving…" : "set limit"}
          </button>
        </form>
        {msg && <p className={`m-0 font-mono text-xs ${msg.ok ? "text-ok" : "text-bad-text"}`}>{msg.text}</p>}
      </div>
      {error ? (
        <ErrorState error={error} title="Couldn't load the limits" />
      ) : (
        <Table<LimitRow>
          rowKey={(r) => r.userId}
          rows={data?.limits ?? []}
          loading={loading && !data}
          minWidth={620}
          initialSort={{ key: "email", dir: "asc" }}
          empty={<EmptyState title="No custom limits" hint="Every learner gets the shared daily allowance." />}
          columns={[
            { key: "email", header: "Learner", sort: (r) => r.email || r.userId, render: (r) => r.email || r.userId.slice(0, 8) },
            { key: "credits", header: "Credits / day", align: "right", sort: (r) => r.dailyCredits, render: (r) => <span className="font-mono">{fmtNum(r.dailyCredits)}</span> },
            { key: "note", header: "Note", hideOnPhone: true, render: (r) => <span className="text-fg-3">{r.note || "–"}</span> },
            { key: "updated", header: "Set", hideOnPhone: true, sort: (r) => r.updatedAt, render: (r) => <span className="text-fg-3" title={r.updatedBy || ""}>{timeAgo(r.updatedAt)}</span> },
            {
              key: "actions",
              header: "",
              render: (r) => (
                <span className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(r.email || "");
                      setCredits(String(r.dailyCredits));
                      setNote(r.note || "");
                      emailRef.current?.focus();
                    }}
                    className="min-h-8 border border-line-strong px-2 font-mono text-xs text-fg-3 hover:text-fg"
                  >
                    edit
                  </button>
                  <button type="button" onClick={() => remove(r)} className="min-h-8 border border-line-strong px-2 font-mono text-xs text-fg-3 hover:text-bad">
                    reset
                  </button>
                </span>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}

export default function AiDashboard() {
  const { data, error, loading, refresh } = useAdminData<Resp>("/api/admin/ai", { refreshMs: 30_000 });
  const [limitFor, setLimitFor] = useState<{ email: string; key: number } | null>(null);
  // the learner links below filter the call log (its filters live in the URL) and scroll to it
  const log = useCallLogParams();
  const content = useContentJobs();
  const showUser = (id: string) => {
    log.set({ user: id });
    document.getElementById("calls")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  const b = data?.budget;
  const d = data?.dashboard;
  // the page-wide "exclude content jobs" switch (?content=1 shows them): the card, calls, chart, features, models
  const learnersOnly = !content.included;
  const liveStatus = learnersOnly ? data?.live?.byStatus : d?.byStatus;
  const contentLeft = b ? Math.max(0, b.contentBudget - b.spentCycleContent) : 0;
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

      <ContentSwitch hidden={b ? { cost: b.spentCycleContent } : null} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          loading={loading && !data}
          label={learnersOnly ? "spent this cycle · learners" : "spent this cycle · total"}
          value={b ? (learnersOnly ? `${usd(b.spentCycleLive)} / ${usd(b.liveBudget, 0)}` : `${usd(b.spentCycle)} / ${usd(b.monthlyBudget, 0)}`) : "–"}
          hint={
            b ? (
              <span className="flex flex-col gap-0.5">
                <span>
                  Learners {usd(b.spentCycleLive)} · content jobs {usd(b.spentCycleContent)} · total {usd(b.spentCycle)}
                </span>
                <span>
                  {fmtDate(b.cycle.start)} → {fmtDate(b.cycle.end)} · {b.cycle.daysLeft} days left
                </span>
              </span>
            ) : (
              ""
            )
          }
        />
        <Kpi
          loading={loading && !data}
          label="content jobs budget"
          value={b ? `${usd(b.spentCycleContent)} / ${usd(b.contentBudget)}` : "–"}
          hint={b ? `hard cap: ${Math.round((1 - (data?.settings.liveShare ?? 0)) * 100)}% of the month · ${contentLeft > 0 ? `${usd(contentLeft)} left` : "used: eval and batch jobs are refused"} · learners' budget ${usd(b.liveBudget, 0)}` : ""}
        />
        <Kpi loading={loading && !data} label="today (live)" value={b ? `${usd(b.spentToday, 3)} / ${usd(b.todayBudget, 2)}` : "–"} hint="today's share = what's left ÷ days left" />
        <Kpi loading={loading && !data} label="ai users · last 7 days" value={b ? fmtNum(b.activeUsers) : "–"} />
        <Kpi loading={loading && !data} label="each user's daily allowance" value={b ? `${fmtNum(b.userDailyCredits)} credits` : "–"} hint={b ? `${usd(b.userDailyUsd, 3)} · 1 credit = $0.001 · the course chat has its own messages` : ""} />
        <Kpi
          loading={loading && !data}
          label={learnersOnly ? "learner calls this cycle" : "calls this cycle"}
          value={liveStatus ? fmtNum(liveStatus.ok ?? 0) : "–"}
          hint={liveStatus ? Object.entries(liveStatus).filter(([k]) => k !== "ok").map(([k, v]) => `${k} ${v}`).join(" · ") || "nothing refused" : ""}
        />
      </div>

      {data && <Controls key={data.settings.updatedAt ?? "s"} s={data.settings} onSaved={refresh} />}

      <Card label="spend per day" title={learnersOnly ? "Learner usage (USD)" : "Live features and content jobs (USD)"}>
        <TrendChart
          loading={loading && !data}
          data={(d?.daily ?? []).map((x) => ({ t: x.day, live: Number(x.live), ...(learnersOnly ? {} : { content: Number(x.content) }) }))}
          series={[
            { key: "live", label: "live", format: (n) => usd(n, 3) },
            ...(learnersOnly ? [] : [{ key: "content", label: "content jobs", format: (n: number) => usd(n, 3) }]),
          ]}
          formatY={(n) => usd(n, 2)}
          empty="No spend yet this cycle"
        />
      </Card>

      {data && d && <FeatureTable rows={data.features} dash={d} models={data.models} settings={data.settings} onSaved={refresh} />}

      <UserLimits prefill={limitFor} onChanged={refresh} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <UsersSpend onShowUser={showUser} onLimit={(email) => setLimitFor({ email, key: Date.now() })} />
        <Card label="models" title={learnersOnly ? "Learner spend by model" : "Spend by model"} pad={false}>
          <Table<{ model: string; calls: number; cost: number }>
            rowKey={(r) => r.model}
            rows={(learnersOnly ? data?.live?.byModel : d?.byModel) ?? []}
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

      <CallLog />
      <p className="m-0 text-[12px] text-fg-4">
        Costs are computed from each call&apos;s token usage and the price table in src/lib/ai/prices.ts. The Anthropic console bill is the source of truth: compare them after the first week.
      </p>
    </div>
  );
}
