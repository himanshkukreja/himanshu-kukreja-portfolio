"use client";

/**
 * Announce: the one-off "System Design Mastery, rebuilt" email to learn users.
 * Counts (learners with learn activity vs all accounts), sandboxed preview (HTML + plain text),
 * "send test to me", and the real send: typed confirmation, then batches the server rate-limits and
 * logs per recipient (newsletter_logs, type "announce"). Stop any time; re-running skips anyone reached.
 */
import { useRef, useState } from "react";
import { Badge, Card, Drawer, ErrorState, Kpi, LABEL, fmtNum, useAdminClient, useAdminData } from "../ui";
import { Field, Segmented, btnCls, inputCls, primaryBtnCls, type useFlash } from "./common";

type Say = ReturnType<typeof useFlash>["say"];
type Audience = "learners" | "all";

type Info = {
  key: string;
  subject: string;
  admin: string;
  transport: "smtp" | "console";
  smtpReady: boolean;
  batch: { size: number; gapMs: number };
  counts: { learners: number; all: number };
  totals: { authUsers: number; withEmail: number; learnActive: number; unsubscribed: number; alreadySent: number };
  samples: { learners: string[]; all: string[] };
};

type BatchReply = {
  transport: "smtp" | "console";
  campaignId: number | null;
  cursor?: number;
  total: number;
  sent: number;
  failed: { email: string; error?: string }[];
  remaining: number;
};

type Run = {
  audience: Audience;
  total: number;
  sent: number;
  failed: { email: string; error?: string }[];
  remaining: number;
  state: "running" | "stopped" | "done" | "error";
  error?: string;
  campaignId: number | null;
  transport: "smtp" | "console";
};

const jsonInit = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function AnnounceTab({ say }: { say: Say }) {
  const client = useAdminClient();
  const info = useAdminData<Info>("/api/admin/announce");
  const [audience, setAudience] = useState<Audience>("learners");
  const [previewName, setPreviewName] = useState("");
  const [preview, setPreview] = useState<{ html: string; text: string } | null>(null);
  const [view, setView] = useState<"html" | "text">("html");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [testing, setTesting] = useState(false);
  const [typed, setTyped] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const stopRef = useRef(false);

  const d = info.data;
  const n = d ? d.counts[audience] : 0;
  const expected = `send to ${n}`;
  const armed = !!d && n > 0 && typed.trim().toLowerCase() === expected;
  const running = run?.state === "running";

  const openPreview = async () => {
    setLoadingPreview(true);
    try {
      const q = previewName.trim() ? `&name=${encodeURIComponent(previewName.trim())}` : "";
      const [html, text] = await Promise.all([client.text(`/api/admin/announce/preview?format=html${q}`), client.text(`/api/admin/announce/preview?format=text${q}`)]);
      setPreview({ html, text });
    } catch (e) {
      say(`Preview failed: ${(e as Error).message}`, "bad");
    } finally {
      setLoadingPreview(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await client.json<{ to: string; transport: string }>("/api/admin/announce/test", jsonInit({ name: previewName.trim() || undefined }));
      say(r.transport === "console" ? `Test rendered to the server console (not sent) for ${r.to}` : `Test sent to ${r.to}`);
    } catch (e) {
      say(`Test failed: ${(e as Error).message}`, "bad");
    } finally {
      setTesting(false);
    }
  };

  const start = async () => {
    if (!armed || !d) return;
    stopRef.current = false;
    const confirm = expected;
    let state: Run = { audience, total: n, sent: 0, failed: [], remaining: n, state: "running", campaignId: null, transport: d.transport };
    setRun(state);
    let cursor = 0;
    try {
      for (let guard = 0; guard < 2000; guard++) {
        const body = state.campaignId ? { campaignId: state.campaignId, confirm } : d.transport === "console" ? { audience, confirm, cursor } : { audience, confirm };
        const r = await client.json<BatchReply>("/api/admin/announce/send", jsonInit(body));
        cursor = r.cursor ?? cursor;
        state = {
          ...state,
          total: r.total,
          sent: state.sent + r.sent,
          failed: [...state.failed, ...r.failed],
          remaining: r.remaining,
          campaignId: r.campaignId ?? state.campaignId,
          transport: r.transport,
        };
        if (r.remaining <= 0) {
          state = { ...state, state: "done" };
          setRun(state);
          break;
        }
        if (stopRef.current) {
          state = { ...state, state: "stopped" };
          setRun(state);
          break;
        }
        setRun(state);
      }
      say(state.state === "done" ? `Done: ${fmtNum(state.sent)} sent, ${fmtNum(state.failed.length)} failed` : `Stopped after ${fmtNum(state.sent)} sent`, state.failed.length ? "bad" : "ok");
    } catch (e) {
      state = { ...state, state: "error", error: (e as Error).message };
      setRun(state);
      say(`Send stopped: ${(e as Error).message}`, "bad");
    } finally {
      setTyped("");
      info.refresh();
    }
  };

  if (info.error && !d) return <ErrorState error={info.error} onRetry={info.refresh} title="Couldn't load the audience" />;
  const loading = info.loading && !d;
  const pct = run && run.total ? Math.round(((run.total - run.remaining) / run.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Learners · learn activity" value={fmtNum(d?.counts.learners)} loading={loading} hint="eligible now" />
        <Kpi label="All accounts" value={fmtNum(d?.counts.all)} loading={loading} hint={d ? `${fmtNum(d.totals.withEmail)} with an email` : undefined} />
        <Kpi label="Unsubscribed" value={fmtNum(d?.totals.unsubscribed)} loading={loading} hint="excluded" />
        <Kpi label="Already reached" value={fmtNum(d?.totals.alreadySent)} loading={loading} hint="this announcement" />
      </div>

      <Card
        label="announce · learn revamp"
        title={d?.subject || "System Design Mastery, rebuilt"}
        action={
          d && (
            <span className="flex items-center gap-2">
              {d.transport === "console" ? <Badge tone="muted">console transport · nothing is emailed</Badge> : d.smtpReady ? <Badge tone="ok">smtp · live</Badge> : <Badge tone="bad">smtp not configured</Badge>}
            </span>
          )
        }
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <span className={LABEL}>1 · audience</span>
            <Segmented
              label="Audience"
              value={audience}
              onChange={(v) => {
                setAudience(v);
                setTyped("");
              }}
              options={[
                { id: "learners", label: `learners ${d ? fmtNum(d.counts.learners) : "…"}` },
                { id: "all", label: `all accounts ${d ? fmtNum(d.counts.all) : "…"}` },
              ]}
            />
            <p className="m-0 text-sm text-fg-3">
              {audience === "learners"
                ? "Accounts with an email and any learn activity: lesson progress, streaks, quick checks or trials, notes, bookmarks, arena results or a signed-in /learn visit."
                : "Every account with an email, including people who signed up and never opened a lesson."}{" "}
              Unsubscribed addresses and anyone already reached are left out.
            </p>
            {d && d.samples[audience].length > 0 && (
              <p className="m-0 break-words font-mono text-xs text-fg-4">
                {d.samples[audience].join(", ")}
                {d.counts[audience] > d.samples[audience].length ? ` + ${fmtNum(d.counts[audience] - d.samples[audience].length)} more` : ""}
              </p>
            )}

            <span className={`${LABEL} mt-2`}>2 · check it</span>
            <Field label="Preview as name (optional)" hint="Recipients see their first name from their profile; without one the email says “Hi there,”.">
              <input className={inputCls} value={previewName} onChange={(e) => setPreviewName(e.target.value)} placeholder="Priya Sharma" maxLength={80} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openPreview} disabled={loadingPreview} className={btnCls}>
                {loadingPreview ? "rendering…" : "◱ preview email"}
              </button>
              <button type="button" onClick={sendTest} disabled={testing || !d} className={btnCls}>
                {testing ? "sending…" : `✉ send test to ${d?.admin || "me"}`}
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 border border-line bg-surface-2/40 p-3 sm:p-4">
            <span className={`${LABEL} text-bad-text`}>3 · send for real</span>
            <p className="m-0 text-sm text-fg-2">
              Goes out in batches of {d?.batch.size ?? 25}, one email every {((d?.batch.gapMs ?? 400) / 1000).toFixed(1)}s. Each recipient is logged (content → logs). You can stop between batches;
              running it again only reaches people who haven&apos;t had it.
            </p>
            <Field label={`Type “${expected}” to unlock`}>
              <input
                className={`${inputCls} font-mono`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={expected}
                autoComplete="off"
                spellCheck={false}
                disabled={running || !d || n === 0}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={start} disabled={!armed || running} className={primaryBtnCls}>
                {running ? "sending…" : `send to ${fmtNum(n)} ${audience === "learners" ? "learners" : "accounts"}`}
              </button>
              {running && (
                <button type="button" onClick={() => (stopRef.current = true)} className={btnCls}>
                  ■ stop after this batch
                </button>
              )}
              {d?.transport === "smtp" && !d.smtpReady && <span className="text-xs text-bad-text">SMTP env vars are missing on this deployment.</span>}
            </div>

            {run && (
              <div className="flex flex-col gap-2 border-t border-line pt-3" aria-live="polite">
                <div className="flex items-center justify-between gap-2 font-mono text-xs text-fg-3">
                  <span>
                    {run.state} · {run.transport}
                    {run.campaignId ? ` · campaign #${run.campaignId}` : ""}
                  </span>
                  <span>
                    {fmtNum(run.total - run.remaining)}/{fmtNum(run.total)}
                  </span>
                </div>
                <div className="h-2 w-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className="h-2 bg-signal transition-[width]" style={{ width: `${pct}%` }} />
                </div>
                <p className="m-0 text-sm text-fg-2">
                  <b className="text-fg">{fmtNum(run.sent)}</b> sent · <b className={run.failed.length ? "text-bad-text" : "text-fg"}>{fmtNum(run.failed.length)}</b> failed · {fmtNum(run.remaining)} left
                </p>
                {run.error && <p className="m-0 text-sm text-bad-text">{run.error}</p>}
                {run.failed.length > 0 && (
                  <ul className="m-0 max-h-40 list-none overflow-y-auto border border-line p-2 font-mono text-[11px] text-fg-3">
                    {run.failed.map((f, i) => (
                      <li key={`${f.email}-${i}`} className="break-words">
                        {f.email} · {f.error || "failed"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Drawer open={!!preview} onClose={() => setPreview(null)} label={`preview · ${d?.admin || "you"}`} title={d?.subject || "Preview"} width={720}>
        {preview && (
          <div className="flex flex-col gap-3">
            <Segmented
              label="Preview format"
              value={view}
              onChange={setView}
              options={[
                { id: "html", label: "html" },
                { id: "text", label: "plain text" },
              ]}
            />
            {view === "html" ? (
              // sandbox with no permissions: no scripts, no same-origin, no top navigation
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[70dvh] w-full border border-line bg-white sm:h-[calc(100dvh-190px)]" />
            ) : (
              <pre className="m-0 max-h-[70dvh] overflow-auto whitespace-pre-wrap break-words border border-line bg-bg p-3 font-mono text-xs leading-relaxed text-fg-2">{preview.text}</pre>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
