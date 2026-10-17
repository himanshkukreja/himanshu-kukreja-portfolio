"use client";

/**
 * Send: typed confirmation ("send to N") → queue (server snapshots recipients) → this tab drives
 * the server in bounded ticks (each ≤ 40 s, 25 per round, ~2.5 msg/s) until nothing is queued.
 * Pause / resume / cancel, retry failed, re-queue interrupted, and top-ups that only reach people
 * who aren't in the campaign yet. Survives reloads: the state lives in the database.
 */
import { useRef, useState } from "react";
import { Segmented } from "@/components/admin/content/common";
import { Badge, Card, ConfirmButton, LABEL, fmtNum, useAdminClient, useNow } from "@/components/admin/ui";
import { Field, btnCls, inputCls, primaryBtnCls, type useFlash } from "@/components/admin/content/common";
import type { CampaignCounts, CampaignSummary, NamedPerson, NewsletterInfo, TickResult } from "@/lib/campaigns/types";
import type { TagProblem } from "@/lib/campaigns/tags";
import { CampaignBadge, Note, fmtCountdown, jsonInit, pct, zoned } from "./bits";
import { useAudienceCount } from "./AudiencePicker";
import { NamesBanner } from "./RecipientNames";

type Say = ReturnType<typeof useFlash>["say"];
type Run = { state: "running" | "waiting" | "stopped" | "done" | "error"; sent: number; failed: { email: string; error: string }[]; skipped: number; error?: string; counts?: CampaignCounts; status?: CampaignSummary["status"] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const localTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
};
const pad = (n: number) => String(n).padStart(2, "0");
/** Date → value for <input type="datetime-local"> in the browser's zone. */
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** 09:00 IST on the day `addDays` after today (in IST). */
const istAt = (addDays: number, hh: number, now: number) => {
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const d = new Date(`${today}T${pad(hh)}:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + addDays);
  return d;
};
function quickPicks(now: number) {
  const istDow = new Date(new Date(now).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getDay();
  const toMonday = ((8 - istDow) % 7) || 7;
  return [
    { label: "in 1 hour", at: new Date(Math.ceil((now + 3_600_000) / 300_000) * 300_000) },
    { label: "tomorrow 9:00 IST", at: istAt(1, 9, now) },
    { label: "tomorrow 18:00 IST", at: istAt(1, 18, now) },
    { label: "Monday 9:00 IST", at: istAt(toMonday, 9, now) },
  ];
}

export default function SendPanel({
  campaign,
  info,
  dirty,
  problems,
  onSave,
  onChanged,
  say,
  onNamesSaved,
}: {
  campaign: CampaignSummary | null;
  info: NewsletterInfo | undefined;
  dirty: boolean;
  problems: TagProblem[];
  onSave: () => Promise<string | null>;
  onChanged: () => void;
  say: Say;
  onNamesSaved?: (people: NamedPerson[]) => void;
}) {
  const client = useAdminClient();
  const [typed, setTyped] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const stopRef = useRef(false);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [when, setWhen] = useState("");
  const now = useNow(1000);
  const tz = localTz();
  const whenIso = when ? new Date(when).toISOString() : "";
  const whenOk = !!whenIso && new Date(whenIso).getTime() - now >= 60_000;
  const schedulingReady = info?.setup.schedulingReady !== false;
  const pending = useAudienceCount(campaign?.audience ?? { kind: "learners" }, campaign?.id, campaign?.storySlug);
  const tablesReady = info?.setup.tablesReady !== false;

  const counts = run?.counts ?? campaign?.counts;
  const status = run?.status ?? campaign?.status ?? "draft";
  const n = pending.data?.count.eligible ?? 0;
  const expected = `send to ${n}`;
  const armed = n > 0 && typed.trim().toLowerCase() === expected && !problems.length && !dirty;
  const running = run?.state === "running" || run?.state === "waiting";
  const isTop = status !== "draft" && status !== "scheduled";

  const post = <T,>(body: unknown) => client.json<T>(`/api/admin/newsletter/campaigns/${campaign!.id}/send`, jsonInit("POST", body));

  const loop = async () => {
    stopRef.current = false;
    let acc: Run = { state: "running", sent: 0, failed: [], skipped: 0 };
    setRun(acc);
    let busyStreak = 0;
    try {
      for (let guard = 0; guard < 5000; guard++) {
        const r = await post<TickResult>({ action: "tick" });
        acc = { ...acc, sent: acc.sent + r.sentNow, skipped: acc.skipped + r.skippedNow, failed: [...acc.failed, ...r.failedNow], counts: r.campaign.counts, status: r.campaign.status, error: r.error };
        if (r.error) {
          acc = { ...acc, state: "error" };
          setRun(acc);
          say(`Paused: ${r.error}`, "bad");
          break;
        }
        if (r.done) {
          acc = { ...acc, state: r.campaign.status === "sent" ? "done" : "stopped" };
          setRun(acc);
          if (r.campaign.status === "sent") say(`Done · ${fmtNum(r.campaign.counts.sent)} sent${r.campaign.counts.failed ? `, ${fmtNum(r.campaign.counts.failed)} failed` : ""}`);
          break;
        }
        if (r.busy) {
          busyStreak++;
          acc = { ...acc, state: "waiting" };
          setRun(acc);
          if (busyStreak > 15) {
            acc = { ...acc, state: "stopped", error: "Another tab or the cron is sending this campaign. Watching stopped; the send continues there." };
            setRun(acc);
            break;
          }
          await sleep(4000);
          continue;
        }
        busyStreak = 0;
        acc = { ...acc, state: "running" };
        setRun(acc);
        if (stopRef.current) {
          await post({ action: "pause" });
          acc = { ...acc, state: "stopped", status: "paused" };
          setRun(acc);
          say(`Paused after ${fmtNum(acc.sent)} sent`);
          break;
        }
      }
    } catch (e) {
      acc = { ...acc, state: "error", error: (e as Error).message };
      setRun(acc);
      say(`Send stopped: ${(e as Error).message}`, "bad");
    } finally {
      onChanged();
      pending.refresh();
    }
  };

  const queue = async () => {
    if (!campaign || !armed) return;
    setBusyAction("queue");
    try {
      const r = await post<{ added: number }>({ action: "queue", confirm: expected });
      setTyped("");
      say(`Queued ${fmtNum(r.added)} recipients`);
      void loop();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusyAction(null);
    }
  };

  const schedule = async (action: "schedule" | "reschedule") => {
    if (!campaign || !whenOk) return;
    setBusyAction(action);
    try {
      await post({ action, at: whenIso, confirm: expected });
      setTyped("");
      say(`Scheduled for ${zoned(whenIso, tz).local} (${zoned(whenIso, tz).ist} IST)`);
      onChanged();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusyAction(null);
    }
  };

  const scheduled = async (action: "unschedule" | "send-now") => {
    if (!campaign) return;
    setBusyAction(action);
    try {
      await post({ action });
      if (action === "send-now") {
        say("Started: recipients frozen, sending now");
        void loop();
      } else {
        say("Unscheduled: back to draft");
        onChanged();
      }
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusyAction(null);
    }
  };

  const act = async (action: "resume" | "cancel" | "retry" | "requeue-stuck") => {
    if (!campaign) return;
    setBusyAction(action);
    try {
      if (action === "retry") {
        const r = await post<{ requeued: number }>({ action: "retry", failed: true });
        say(`Re-queued ${fmtNum(r.requeued)} failed`);
        if (r.requeued) void loop();
      } else if (action === "requeue-stuck") {
        const r = await post<{ requeued: number }>({ action: "retry", failed: false, stuck: true });
        say(`Re-queued ${fmtNum(r.requeued)} interrupted`);
        if (r.requeued) void loop();
      } else {
        await post({ action });
        if (action === "resume") void loop();
        else {
          setRun(null);
          say("Campaign cancelled; nothing else will be sent");
          onChanged();
        }
      }
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusyAction(null);
    }
  };

  const done = counts ? counts.sent + counts.failed + counts.skipped : 0;
  const progress = counts && counts.total ? Math.round((done / counts.total) * 100) : 0;

  if (!campaign)
    return (
      <Card label="4 · send" title="Save the campaign to send it">
        <p className="m-0 mb-3 text-sm text-fg-3">Sending works from a saved campaign, so progress and tracking survive reloads.</p>
        <button type="button" className={primaryBtnCls} disabled={!tablesReady} onClick={() => void onSave()}>
          save draft
        </button>
        {!tablesReady && <p className="m-0 mt-2 text-xs text-bad-text">Apply the migration first (see the banner at the top).</p>}
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <Card label={isTop ? "send · progress" : "4 · send for real"} title={campaign.name} action={<CampaignBadge status={status} />}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <dl className="m-0 grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className={LABEL}>from</dt>
            <dd className="m-0 break-words text-fg-2">
              {campaign.sender ? `${campaign.sender.fromName} <${campaign.sender.fromEmail}>` : (info?.senders.find((s) => s.id === campaign.senderId) || info?.senders.find((s) => s.isDefault))?.fromEmail || "—"}
            </dd>
            <dt className={LABEL}>transport</dt>
            <dd className="m-0 text-fg-2">
              {info?.setup.transportMode === "console" ? <Badge tone="muted">console · nothing is emailed</Badge> : <Badge tone="ok">live smtp</Badge>}
            </dd>
            <dt className={LABEL}>pace</dt>
            <dd className="m-0 text-fg-2">
              {info ? `${info.setup.batch.size} per round, one every ${(info.setup.batch.gapMs / 1000).toFixed(1)}s, ≤ ${Math.round(info.setup.batch.budgetMs / 1000)}s per call` : "—"}
            </dd>
            <dt className={LABEL}>audience</dt>
            <dd className="m-0 text-fg-2">
              {campaign.audience.kind === "subscribers_learners" ? "subscribers + learners" : campaign.audience.kind.replace(/_/g, " ")}
              {campaign.audience.kind === "active" ? ` · ${campaign.audience.days}d` : campaign.audience.kind === "completed" ? ` · ≥ ${campaign.audience.min}` : ""} ·{" "}
              {pending.data ? `${fmtNum(n)} ${isTop ? "new" : "eligible"}` : "counting…"}
            </dd>
          </dl>

          {counts && counts.total > 0 && (
            <div className="flex min-w-0 flex-col gap-2" aria-live="polite">
              <div className="flex items-center justify-between gap-2 font-mono text-xs text-fg-3">
                <span>
                  {run?.state === "waiting" ? "waiting · another sender holds the lease" : running ? "sending…" : status}
                </span>
                <span>
                  {fmtNum(done)}/{fmtNum(counts.total)}
                </span>
              </div>
              <div className="h-2 w-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <div className="h-2 bg-signal transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <p className="m-0 text-sm text-fg-2">
                <b className="text-fg">{fmtNum(counts.sent)}</b> sent · <b className={counts.failed ? "text-bad-text" : "text-fg"}>{fmtNum(counts.failed)}</b> failed · {fmtNum(counts.skipped)} skipped · {fmtNum(counts.queued)} queued
                {counts.sent ? ` · ${pct(counts.opened, counts.sent)} opened` : ""}
              </p>
            </div>
          )}
        </div>

        {(campaign.lastError || run?.error) && (
          <Note tone="bad" title="paused by the server" className="mt-4">
            {run?.error || campaign.lastError} · Fix the sender or provider, then resume. Rows that weren&apos;t sent stay queued.
          </Note>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {running && (
            <button type="button" className={btnCls} onClick={() => (stopRef.current = true)}>
              ■ pause after this batch
            </button>
          )}
          {!running && status === "sending" && (
            <button type="button" className={primaryBtnCls} onClick={() => void loop()}>
              ▶ continue sending ({fmtNum(counts?.queued)} queued)
            </button>
          )}
          {!running && status === "paused" && (
            <button type="button" className={primaryBtnCls} disabled={!!busyAction} onClick={() => act("resume")}>
              ▶ resume
            </button>
          )}
          {!running && status !== "draft" && status !== "cancelled" && !!counts?.failed && (
            <button type="button" className={btnCls} disabled={!!busyAction} onClick={() => act("retry")}>
              ↻ retry {fmtNum(counts.failed)} failed
            </button>
          )}
          {!running && !!counts?.stuck && (
            <ConfirmButton onConfirm={() => act("requeue-stuck")} confirmLabel="may duplicate · re-queue" tone="signal">
              re-queue {fmtNum(counts.stuck)} interrupted
            </ConfirmButton>
          )}
          {!running && (status === "sending" || status === "paused") && (
            <ConfirmButton onConfirm={() => act("cancel")} confirmLabel="cancel campaign?">
              cancel
            </ConfirmButton>
          )}
        </div>
      </Card>

      {status === "scheduled" && campaign.scheduledAt && (
        <Card label="scheduled" title={`Goes out ${fmtCountdown(campaign.scheduledAt, now)}`} action={<Badge tone="signal">{fmtCountdown(campaign.scheduledAt, now)}</Badge>}>
          <div className="flex flex-col gap-4">
            <dl className="m-0 grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
              <dt className={LABEL}>your time</dt>
              <dd className="m-0 font-mono text-fg">
                {zoned(campaign.scheduledAt, tz).local} <span className="text-fg-4">· {tz}</span>
              </dd>
              <dt className={LABEL}>IST</dt>
              <dd className="m-0 font-mono text-fg-2">{zoned(campaign.scheduledAt, tz).ist}</dd>
              <dt className={LABEL}>UTC</dt>
              <dd className="m-0 font-mono text-fg-2">{zoned(campaign.scheduledAt, tz).utc}</dd>
              <dt className={LABEL}>audience</dt>
              <dd className="m-0 text-fg-2">≈ {fmtNum(n)} today · the list is frozen when it starts (unsubscribes and repeat-story readers removed then)</dd>
            </dl>
            <Note title="runs without this tab">
              Supabase pg_cron calls the sender every minute while something is due or sending, so you can close the browser. Content is locked while scheduled; unschedule to edit.
            </Note>
            <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-end">
              <Field label="Reschedule (your time)">
                <input className={`${inputCls} font-mono`} type="datetime-local" value={when} min={toLocalInput(new Date(now + 60_000))} onChange={(e) => setWhen(e.target.value)} />
              </Field>
              <button type="button" className={btnCls} disabled={!whenOk || !!busyAction} onClick={() => schedule("reschedule")}>
                {busyAction === "reschedule" ? "saving…" : "reschedule"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <ConfirmButton tone="signal" primary onConfirm={() => scheduled("send-now")} confirmLabel={`send to ≈${fmtNum(n)} now?`}>
                ▶ send now instead
              </ConfirmButton>
              <button type="button" className={btnCls} disabled={!!busyAction} onClick={() => scheduled("unschedule")}>
                unschedule · back to draft
              </button>
              <ConfirmButton onConfirm={() => act("cancel")} confirmLabel="cancel campaign?">
                cancel
              </ConfirmButton>
            </div>
          </div>
        </Card>
      )}

      {status !== "cancelled" && status !== "sent" && <NamesBanner scope={{ spec: campaign.audience, storySlug: campaign.storySlug }} onSaved={onNamesSaved} />}

      {status !== "cancelled" && status !== "scheduled" && !running && (status === "draft" || n > 0) && (
        <Card label={isTop ? "top up" : "confirm"} title={isTop ? `${fmtNum(n)} new people match this audience` : "Typed confirmation"}>
          <div className="flex flex-col gap-3">
            {isTop && <p className="m-0 text-sm text-fg-3">Sends only to people who aren&apos;t in this campaign yet. Everyone already sent stays untouched.</p>}
            {dirty && <Note tone="warn" title="unsaved changes">Save the draft before sending so the queued email matches what you see.</Note>}
            {problems.length > 0 && <Note tone="bad" title="fix the problems in compose first">{problems[0].message}</Note>}
            {info?.setup.transportMode === "live" && <Note tone="warn" title="this is real">Every address gets a real email from {campaign.sender?.fromEmail || "the selected sender"}. Unsubscribes are re-checked before each batch.</Note>}
            {!isTop && (
              <div className="flex flex-col gap-3">
                <Segmented
                  label="When"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { id: "now", label: "send now" },
                    { id: "schedule", label: "schedule" },
                  ]}
                />
                {mode === "schedule" && !schedulingReady && <Note tone="warn" title="scheduling is off">Apply supabase/migrations/20261016_email_scheduling.sql first.</Note>}
                {mode === "schedule" && schedulingReady && (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {quickPicks(now).map((q) => (
                        <button key={q.label} type="button" className={btnCls} onClick={() => setWhen(toLocalInput(q.at))}>
                          {q.label}
                        </button>
                      ))}
                    </div>
                    <Field label={`Date + time · your zone (${tz})`}>
                      <input className={`${inputCls} font-mono`} type="datetime-local" value={when} min={toLocalInput(new Date(now + 60_000))} onChange={(e) => setWhen(e.target.value)} />
                    </Field>
                    {whenIso && (
                      <p className="m-0 font-mono text-xs text-fg-3">
                        {zoned(whenIso, tz).local} yours · {zoned(whenIso, tz).ist} IST · {zoned(whenIso, tz).utc} UTC · {whenOk ? fmtCountdown(whenIso, now) : <span className="text-bad-text">pick a time ≥ 1 minute ahead</span>}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <Field label={`Type “${expected}” to unlock`}>
              <input className={`${inputCls} font-mono`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={expected} autoComplete="off" spellCheck={false} disabled={!n || !tablesReady} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              {dirty && (
                <button type="button" className={btnCls} onClick={() => void onSave()}>
                  save draft
                </button>
              )}
              {mode === "schedule" && !isTop ? (
                <button type="button" className={primaryBtnCls} disabled={!armed || !whenOk || !schedulingReady || !!busyAction} onClick={() => schedule("schedule")}>
                  {busyAction === "schedule" ? "scheduling…" : whenOk ? `schedule · ${zoned(whenIso, tz).local}` : "schedule"}
                </button>
              ) : (
                <button type="button" className={primaryBtnCls} disabled={!armed || !!busyAction} onClick={queue}>
                  {busyAction === "queue" ? "queueing…" : `send to ${fmtNum(n)}`}
                </button>
              )}
              {pending.loading && <span className="font-mono text-xs text-fg-4">counting…</span>}
            </div>
          </div>
        </Card>
      )}

      {run && run.failed.length > 0 && (
        <Card label="failed in this run" pad={false}>
          <ul className="m-0 max-h-48 list-none overflow-y-auto p-3 font-mono text-[11px] text-fg-3">
            {run.failed.map((f, i) => (
              <li key={`${f.email}-${i}`} className="break-words">
                {f.email} · {f.error}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
