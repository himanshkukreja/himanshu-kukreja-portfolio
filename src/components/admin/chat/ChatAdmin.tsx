"use client";

/**
 * /admin/chat: the course chat. Its switch and its two limits (Sonnet messages per learner a day, then the
 * fast-mode ceiling), stored in ai_settings.features["course-chat"] like every feature's; then messages,
 * learners, the Sonnet / fast share, cost, tools and latency per day, declines and failures, what people ask
 * about (the course's own titles), quizzes and saved paths, and the latest conversations with their text
 * (kept 30 days).
 */
import { useState } from "react";
import { adminFetch, adminJson } from "@/lib/admin/fetch";
import { Badge, BarList, Card, Drawer, EmptyState, ErrorState, fmtDate, fmtNum, Kpi, LABEL, PageHead, Table, timeAgo, TrendChart, useAdminData } from "@/components/admin/ui";

type Day = { day: string; messages: number; users: number; sonnet: number; fast: number; cost: number; memoryCost: number; avgTools: number; avgLatency: number; offTopic: number; refused: number; errors: number };
type Conv = { chat: string; user: string | null; email: string | null; messages: number; first: string; last: string; fast: number; cost: number };
type Resp = {
  settings: { masterOn: boolean; enabled: boolean; perDay: number; ceiling: number; model: string; features: Record<string, Record<string, unknown>> };
  days: number;
  daily: Day[];
  totals: { messages: number; users: number; sonnet: number; fast: number; cost: number; memoryCost: number; offTopic: number; refused: number; errors: number; avgTools: number; avgRounds: number; p50: number | null; p95: number | null; quizzes: number; graded: number; paths: number; saved: number; memoryUsers: number | null };
  topics: { topic: string; n: number }[];
  tools: { tool: string; n: number }[];
  conversations: Conv[];
  feedback: { up: number; down: number; wrong: number; worst: { callId: number; at: string; rating: number; wrong: boolean; note: string | null; question: string | null; answer: string | null }[] } | null;
  gaps: { q: string; n: number }[];
};
type Msg = { id: number; created_at: string; model: string; status: string; cost_usd: number | null; latency_ms: number | null; meta: Record<string, unknown> | null; transcript: { input: string; output: string | null } | null };

const usd = (n: number | null | undefined, d = 3) => `$${Number(n ?? 0).toFixed(d)}`;
const INPUT = "min-h-10 w-28 border border-line-strong bg-bg px-3 font-mono text-[13px] text-fg";

function Controls({ s, onSaved }: { s: Resp["settings"]; onSaved: () => void }) {
  const [perDay, setPerDay] = useState(String(s.perDay));
  const [ceiling, setCeiling] = useState(String(s.ceiling));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    try {
      const features = { ...s.features, "course-chat": { ...(s.features["course-chat"] || {}), ...patch } };
      await adminJson("/api/admin/ai", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ features }) });
      setMsg("saved");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      label="the switch and the limits"
      title={!s.masterOn ? "AI is off for learners (master switch in /admin/ai)" : s.enabled ? "The course chat is on" : "The course chat is off"}
      action={
        <button type="button" disabled={busy} onClick={() => save({ enabled: !s.enabled })} className={`min-h-10 px-4 font-mono text-sm font-semibold ${s.enabled ? "border border-bad text-bad" : "bg-signal text-on-signal"}`}>
          {s.enabled ? "Switch chat off" : "Switch chat on"}
        </button>
      }
    >
      <div className="flex flex-wrap items-end gap-5">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>sonnet messages / learner / day</span>
          <input type="number" min={0} max={1000} value={perDay} onChange={(e) => setPerDay(e.target.value)} className={INPUT} />
          <span className="text-[12px] text-fg-4">then fast mode (Haiku 5.5)</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>daily ceiling (all messages)</span>
          <input type="number" min={0} max={5000} value={ceiling} onChange={(e) => setCeiling(e.target.value)} className={INPUT} />
          <span className="text-[12px] text-fg-4">anti-abuse stop for the day</span>
        </label>
        <button type="button" disabled={busy} onClick={() => save({ perDay: Number(perDay), ceiling: Number(ceiling) })} className="min-h-10 border border-line-strong px-4 font-mono text-sm text-fg hover:border-fg-3">
          Save limits
        </button>
        {msg && <span className="font-mono text-xs text-fg-3">{msg}</span>}
      </div>
      <p className="m-0 mt-3 text-[12.5px] text-fg-4">
        The chat has its own quota: its messages don&apos;t use the shared AI credits. The monthly budget still applies: amber mode puts everyone in fast mode, red mode rests the chat (the search page keeps its instant results). A learner&apos;s own key: Sonnet, no limits. Changes apply within 20 seconds.
      </p>
    </Card>
  );
}

function ConversationDrawer({ c, onClose }: { c: Conv | null; onClose: () => void }) {
  const { data, loading } = useAdminData<{ messages: Msg[] }>(c ? `/api/admin/ai/chat?chat=${c.chat}` : null);
  return (
    <Drawer open={!!c} onClose={onClose} label={c ? `${c.messages} messages · ${usd(c.cost, 4)}` : ""} title={c ? c.email || "learner" : ""}>
      {loading && !data ? (
        <p className="m-0 font-mono text-xs text-fg-3">loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {(data?.messages ?? []).map((m) => (
            <div key={m.id} className="flex flex-col gap-1.5 border-b border-line pb-3">
              <span className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-4">
                {fmtDate(m.created_at, true)} · {m.model.replace("claude-", "")} · {usd(m.cost_usd, 4)} · {m.latency_ms ? `${(m.latency_ms / 1000).toFixed(1)} s` : "–"} · tools {String(m.meta?.toolNames || "none")}
                <Badge tone={m.status === "ok" ? "ok" : m.status === "error" ? "bad" : "signal"}>{m.status}</Badge>
              </span>
              {m.transcript ? (
                <>
                  <pre className="m-0 whitespace-pre-wrap border border-line bg-surface-2 p-2.5 font-mono text-[12px] leading-relaxed text-fg">{m.transcript.input}</pre>
                  <pre className="m-0 whitespace-pre-wrap p-2.5 font-mono text-[12px] leading-relaxed text-fg-2">{m.transcript.output}</pre>
                </>
              ) : (
                <span className="text-[13px] text-fg-4">No text kept for this message (refused, failed, or older than 90 days).</span>
              )}
            </div>
          ))}
          <span className="font-mono text-[11px] text-fg-4">Chat conversation text is kept 90 days (abuse checks and improving the tutor), then deleted automatically; the counts and ratings stay.</span>
        </div>
      )}
    </Drawer>
  );
}

export default function ChatAdmin() {
  const [days, setDays] = useState(14);
  const { data, error, loading, refresh } = useAdminData<Resp>(`/api/admin/ai/chat?days=${days}`, { refreshMs: 60_000 });
  const [open, setOpen] = useState<Conv | null>(null);
  const exportCases = async () => {
    const r = await adminFetch("/api/admin/ai/chat?export=feedback");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chat-feedback-cases-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  const t = data?.totals;
  const share = t && t.messages ? Math.round((100 * t.fast) / t.messages) : 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHead
        path="sudo ~/admin/chat"
        title="Course chat"
        sub="The tutor on /learn/chat and in the Ask panel: who uses it, what it costs, what it's asked."
        actions={
          <span className="flex gap-1">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} className={`min-h-9 px-2.5 font-mono text-xs ${days === d ? "bg-fg text-bg" : "border border-line-strong text-fg-3"}`}>
                {d}d
              </button>
            ))}
          </span>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi loading={loading && !data} label={`messages · ${days} days`} value={t ? fmtNum(t.messages) : "–"} hint={t ? `${fmtNum(t.users)} learners` : ""} />
        <Kpi loading={loading && !data} label="sonnet / fast mode" value={t ? `${100 - share}% / ${share}%` : "–"} hint={t ? `${fmtNum(t.sonnet)} Sonnet · ${fmtNum(t.fast)} Haiku 5.5` : ""} />
        <Kpi loading={loading && !data} label="cost" value={t ? usd(t.cost + t.memoryCost, 2) : "–"} hint={t && t.messages ? `${usd(t.cost / t.messages, 4)} a message · memory ${usd(t.memoryCost, 3)}` : ""} />
        <Kpi loading={loading && !data} label="latency p50 / p95" value={t && t.p50 ? `${(t.p50 / 1000).toFixed(1)} / ${((t.p95 ?? 0) / 1000).toFixed(1)} s` : "–"} hint={t ? `${t.avgTools.toFixed(1)} tools · ${t.avgRounds.toFixed(1)} rounds a message` : ""} />
        <Kpi loading={loading && !data} label="off-topic declined" value={t ? fmtNum(t.offTopic) : "–"} />
        <Kpi loading={loading && !data} label="refused / failed" value={t ? `${fmtNum(t.refused)} / ${fmtNum(t.errors)}` : "–"} hint="quota, rate, switch · errors and timeouts" />
        <Kpi loading={loading && !data} label="quizzes · graded" value={t ? `${fmtNum(t.quizzes)} · ${fmtNum(t.graded)}` : "–"} />
        <Kpi loading={loading && !data} label="paths built · saved" value={t ? `${fmtNum(t.paths)} · ${fmtNum(t.saved)}` : "–"} hint={t?.memoryUsers == null ? "memory: migration not applied" : `${fmtNum(t.memoryUsers)} learners with memory`} />
      </div>

      {data && <Controls key={JSON.stringify(data.settings)} s={data.settings} onSaved={refresh} />}

      <Card label="messages per day" title="Sonnet and fast mode">
        <TrendChart
          loading={loading && !data}
          data={(data?.daily ?? []).map((d) => ({ t: d.day, sonnet: d.sonnet, fast: d.fast, users: d.users }))}
          series={[
            { key: "sonnet", label: "Sonnet" },
            { key: "fast", label: "fast mode" },
            { key: "users", label: "learners", dashed: true },
          ]}
          empty="No chat messages yet"
        />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card label="cost per day" title="Messages and memory (USD)">
          <TrendChart
            loading={loading && !data}
            data={(data?.daily ?? []).map((d) => ({ t: d.day, cost: d.cost, memory: d.memoryCost }))}
            series={[
              { key: "cost", label: "messages", format: (n) => usd(n, 3) },
              { key: "memory", label: "memory", format: (n) => usd(n, 3) },
            ]}
            formatY={(n) => usd(n, 2)}
            empty="No spend yet"
          />
        </Card>
        <Card label="speed and tools" title="Average latency (s) and tools per message">
          <TrendChart
            loading={loading && !data}
            data={(data?.daily ?? []).map((d) => ({ t: d.day, latency: Math.round(d.avgLatency / 100) / 10, tools: Math.round(d.avgTools * 10) / 10 }))}
            series={[
              { key: "latency", label: "latency (s)" },
              { key: "tools", label: "tools" },
            ]}
            empty="No messages yet"
          />
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card label="what people ask about" title="Top topics (the course's own titles)">
          {data?.topics.length ? <BarList items={data.topics.map((x) => ({ key: x.topic, label: x.topic, value: x.n }))} /> : <EmptyState title="No topics yet" />}
        </Card>
        <Card label="tools" title="Messages that used each tool">
          {data?.tools.length ? <BarList items={data.tools.map((x) => ({ key: x.tool, label: <span className="font-mono text-xs">{x.tool}</span>, value: x.n }))} /> : <EmptyState title="No tool use yet" />}
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          label="answer feedback"
          title={data?.feedback ? `${fmtNum(data.feedback.up)} 👍 · ${fmtNum(data.feedback.down)} 👎 · ${fmtNum(data.feedback.wrong)} marked wrong` : "Feedback is off until the chat migration is applied"}
          action={data?.feedback ? <button type="button" onClick={exportCases} className="min-h-9 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:text-fg">export 👎 as eval cases</button> : undefined}
        >
          {data?.feedback && (data.feedback.up + data.feedback.down > 0) && (
            <p className="m-0 mb-3 font-mono text-[12px] text-fg-3">{Math.round((100 * data.feedback.up) / (data.feedback.up + data.feedback.down))}% of rated answers were thumbs up.</p>
          )}
          {data?.feedback?.worst.length ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {data.feedback.worst.map((w) => (
                <li key={w.callId} className="flex flex-col gap-1 border-b border-line pb-3">
                  <span className="font-mono text-[11px] text-fg-4">
                    {fmtDate(w.at, true)} · {w.wrong ? "marked wrong" : "👎"}
                    {w.note ? <span className="text-fg-2"> · “{w.note}”</span> : null}
                  </span>
                  {w.question && <span className="text-[13.5px] text-fg">Q: {w.question}</span>}
                  {w.answer && <span className="line-clamp-3 text-[13px] text-fg-3">A: {w.answer}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No thumbs-down answers yet" />
          )}
        </Card>
        <Card label="content gaps" title="Searches that found no lesson">
          {data?.gaps.length ? <BarList items={data.gaps.map((g) => ({ key: g.q, label: g.q, value: g.n }))} /> : <EmptyState title="No gaps yet" hint="The tutor's searches that only found passing mentions show here." />}
        </Card>
      </div>
      <Card label="conversations" title="The latest conversations" pad={false}>
        <Table<Conv>
          rowKey={(r) => r.chat}
          rows={data?.conversations ?? []}
          loading={loading && !data}
          onRowClick={(r) => setOpen(r)}
          minWidth={640}
          empty={<EmptyState title="No conversations yet" />}
          columns={[
            { key: "u", header: "Learner", render: (r) => r.email || (r.user ? r.user.slice(0, 8) : "dev preview") },
            { key: "n", header: "Messages", align: "right", render: (r) => fmtNum(r.messages) },
            { key: "f", header: "Fast", align: "right", hideOnPhone: true, render: (r) => fmtNum(r.fast) },
            { key: "c", header: "Cost", align: "right", render: (r) => usd(r.cost, 4) },
            { key: "l", header: "Last", render: (r) => <span title={fmtDate(r.last, true)}>{timeAgo(r.last)}</span> },
          ]}
        />
      </Card>
      <ConversationDrawer c={open} onClose={() => setOpen(null)} />
    </div>
  );
}
