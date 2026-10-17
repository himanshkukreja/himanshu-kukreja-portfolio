/**
 * Campaign sending. Server-only. Designed for short-lived serverless functions:
 *
 *   queue   snapshots the audience into email_messages (one row per recipient, unique per campaign,
 *           random tracking token) and flips the campaign to "sending". Nothing is emailed yet.
 *   tick    one bounded unit of work (≤ BUDGET_MS, ≤ BATCH per round): takes a per-campaign lease so
 *           two tabs / a cron can't double the rate, re-checks unsubscribes + suppressions for the next
 *           rows, claims them (queued → sending, atomic on status), renders + sends each with a gap,
 *           marks sent / failed. The admin page calls tick in a loop while it's open; closing the tab
 *           just leaves rows queued and "continue" picks up where it stopped (also after a reload).
 *   pause / resume / cancel / retry (failed → queued; nobody already sent is ever re-sent).
 *
 * Transport errors that mean the identity or connection is broken (auth, "not verified", quota)
 * pause the campaign and put the row back, instead of failing everyone in the batch.
 */
import crypto from "crypto";
import { EMAIL } from "@/lib/socials";
import { invalidateAudience, mergeVarsFor, resolveAudience } from "./audience";
import { renderEmail, type EmailContent } from "./render";
import type { MergeVars } from "./tags";
import { contentProblems } from "./validate";
import { unsubscribeUrlFor } from "./links";
import { checkSender, envSenders, formatFrom, isFatalSendError, isRecipientRejection, makeTransport, transportMode } from "./senders";
import { getStore, SchedulingMissingError, TablesMissingError, type DbMessage } from "./store";
import { extraHosts } from "./tracking";
import type { Campaign, CampaignSummary, Sender, TickResult, TransportId } from "./types";

export { contentProblems };

export const BATCH = 25;
export const GAP_MS = 400;
export const BUDGET_MS = 40_000;
const LEASE_MS = 75_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Public base for pixel / click / unsubscribe links. */
export function trackingBase(): string {
  const explicit = process.env.EMAIL_TRACKING_BASE;
  if (explicit) return explicit.replace(/\/$/, "");
  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (process.env.NODE_ENV === "production" && /^https:\/\//.test(site)) return site.replace(/\/$/, "");
  return "https://www.himanshukukreja.in";
}

export const newToken = () => crypto.randomBytes(18).toString("base64url");

/* ───────────────────────────── senders ───────────────────────────── */

export async function listSenders(): Promise<{ senders: Sender[]; dbError: string | null }> {
  const env = envSenders();
  let db: Sender[] = [];
  let dbError: string | null = null;
  try {
    db = (await getStore().listSenders()).map((s) => ({ ...s, source: "db" as const, check: checkSender(s) }));
  } catch (e) {
    dbError = e instanceof TablesMissingError ? "tables-missing" : (e as Error).message;
  }
  const dbDefault = db.find((s) => s.isDefault);
  const senders: Sender[] = [...env.map((s) => ({ ...s, isDefault: !dbDefault && s.id === "env:smtp" })), ...db];
  return { senders, dbError };
}

export async function resolveSender(id: string | null | undefined): Promise<Sender> {
  const { senders } = await listSenders();
  const s = (id && senders.find((x) => x.id === id)) || senders.find((x) => x.isDefault) || senders[0];
  if (!s) throw new Error("No sender configured (set SMTP_FROM).");
  return s;
}

/* ───────────────────────────── rendering per recipient ───────────────────────────── */

export function renderFor(c: EmailContent & { name: string; trackOpens: boolean; trackClicks: boolean }, vars: MergeVars, token: string) {
  const base = trackingBase();
  const v = { ...vars, unsubscribe_url: unsubscribeUrlFor(base, token) };
  const utm = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "campaign";
  return { ...renderEmail(c, v, { base, token, trackOpens: c.trackOpens, trackClicks: c.trackClicks, utmCampaign: utm, extraHosts: extraHosts() }), unsub: v.unsubscribe_url };
}

function mailFor(sender: { fromName: string; fromEmail: string; replyTo: string | null }, to: string, r: { subject: string; html: string; text: string; unsub: string }, campaignId: string, subjectPrefix = "") {
  return {
    from: formatFrom(sender.fromName, sender.fromEmail),
    to,
    replyTo: sender.replyTo || undefined,
    subject: `${subjectPrefix}${r.subject}`,
    html: r.html,
    text: r.text,
    headers: {
      "List-Unsubscribe": `<${r.unsub}>, <mailto:${sender.replyTo || EMAIL}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Campaign": campaignId,
    },
  };
}

/* ───────────────────────────── test send ───────────────────────────── */

export async function sendTest(input: { content: EmailContent & { name?: string; trackOpens?: boolean; trackClicks?: boolean }; senderId: string | null; to: string; asEmail?: string | null }) {
  const sender = await resolveSender(input.senderId);
  if (sender.check.level === "bad" && transportMode() === "live") throw new Error(`Sender can't send: ${sender.check.message}`);
  const as = (input.asEmail || input.to).toLowerCase().trim();
  const vars = (await mergeVarsFor([{ email: as }])).get(as)!;
  const r = renderFor({ name: input.content.name || "test", trackOpens: input.content.trackOpens ?? true, trackClicks: input.content.trackClicks ?? true, ...input.content }, vars, "test");
  const { mode, t } = makeTransport(sender.transport);
  try {
    const info = await t.sendMail(mailFor(sender, input.to, r, "test", "[test] "));
    const raw = (info as { message?: unknown }).message;
    const bytes = Buffer.isBuffer(raw) ? raw.length : 0;
    if (mode === "console") console.log(`[campaigns:console] test → ${input.to} (as ${as}) · from ${sender.fromEmail} · "${r.subject}" · ${bytes} bytes MIME · not sent`);
    return { mode, to: input.to, as, from: formatFrom(sender.fromName, sender.fromEmail), subject: `[test] ${r.subject}`, messageId: info.messageId, bytes };
  } finally {
    t.close();
  }
}

/* ───────────────────────────── campaigns ───────────────────────────── */

export async function summarize(c: Campaign): Promise<CampaignSummary> {
  const { doc: _doc, ...rest } = c;
  void _doc;
  return { ...rest, counts: await getStore().counts(c.id) };
}

export const confirmPhrase = (n: number) => `send to ${n}`;

/** Recipients a queue call would add right now: new people only, and (case files) not anyone who already got the story. */
export async function pendingAudience(c: Campaign) {
  const store = getStore();
  const [exclude, storyExclude] = await Promise.all([store.existingEmails(c.id).catch(() => new Set<string>()), c.storySlug ? storySendSet(c.storySlug) : Promise.resolve(undefined)]);
  return resolveAudience(c.audience, { exclude, storyExclude });
}

/** Everyone who already got this story (campaign sends + the old newsletter). */
export async function storySendSet(slug: string): Promise<Set<string>> {
  try {
    return (await getStore().storySends(slug)).get(slug) ?? new Set<string>();
  } catch {
    return new Set<string>();
  }
}

const err = (message: string, status: number, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { status, ...extra });

/** Shared checks before a campaign may go out (now or later). */
async function preflight(c: Campaign | null, confirm: string) {
  if (!c) throw err("Campaign not found", 404);
  if (c.status === "cancelled") throw err("This campaign was cancelled.", 409);
  const problems = contentProblems(c);
  if (problems.length) throw err(`Fix ${problems.length} problem(s) first: ${problems[0].message}`, 400);
  const sender = await resolveSender(c.senderId);
  if (sender.check.level === "bad" && transportMode() === "live") throw err(`Sender can't send: ${sender.check.message}`, 400);
  const { recipients } = await pendingAudience(c);
  if (!recipients.length) throw err("Nobody new to send to in this audience.", 400);
  if (confirm.trim().toLowerCase() !== confirmPhrase(recipients.length)) throw err(`Type "${confirmPhrase(recipients.length)}" to confirm.`, 400, { expected: confirmPhrase(recipients.length) });
  return { sender, recipients };
}

const senderSnapshot = (s: Sender) => ({ fromName: s.fromName, fromEmail: s.fromEmail, replyTo: s.replyTo, transport: s.transport });

/** Freeze the recipient list into email_messages (unique per campaign) and flip to "sending". */
async function freezeAndStart(c: Campaign, recipients: { email: string; name: string | null; userId: string | null }[], sender: Sender, admin: string | null, onlyIf?: Campaign["status"][]) {
  const store = getStore();
  const added = recipients.length ? await store.insertMessages(c.id, recipients.map((r) => ({ ...r, token: newToken() }))) : 0;
  const now = new Date().toISOString();
  const updated = await store.updateCampaign(
    c.id,
    {
      status: "sending",
      sender: senderSnapshot(sender),
      senderId: sender.id,
      queuedAt: c.queuedAt || now,
      finishedAt: null,
      lastError: null,
      createdBy: c.createdBy || admin,
    },
    onlyIf
  );
  return { added, campaign: updated };
}

export async function queueCampaign(id: string, confirm: string, admin: string) {
  const c = await getStore().getCampaign(id);
  const { sender, recipients } = await preflight(c, confirm);
  if (c!.status === "scheduled") throw err("This campaign is scheduled. Use “send now” or unschedule it first.", 409);
  const { added, campaign } = await freezeAndStart(c!, recipients, sender, admin);
  return { added, campaign: await summarize(campaign || c!) };
}

/* ───────────────────────────── scheduling ───────────────────────────── */

const MIN_LEAD_MS = 60_000;
const MAX_LEAD_MS = 90 * 86_400_000;

function parseWhen(at: string): Date {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) throw err("That date isn't valid.", 400);
  const lead = d.getTime() - Date.now();
  if (lead < MIN_LEAD_MS) throw err("Pick a time at least a minute from now (or use “send now”).", 400);
  if (lead > MAX_LEAD_MS) throw err("Schedules can be at most 90 days ahead.", 400);
  return d;
}

/** draft → scheduled. The typed confirmation uses today's count; the list is frozen at send time. */
export async function scheduleCampaign(id: string, confirm: string, at: string, admin: string) {
  const store = getStore();
  if (!(await store.schedulingReady())) throw new SchedulingMissingError();
  const c = await store.getCampaign(id);
  if (c && c.status !== "draft") throw err(`Only drafts can be scheduled (this one is ${c.status}).`, 409);
  const { sender } = await preflight(c, confirm);
  const when = parseWhen(at);
  const next = await store.updateCampaign(id, { status: "scheduled", scheduledAt: when.toISOString(), sender: senderSnapshot(sender), senderId: sender.id, lastError: null, createdBy: c!.createdBy || admin }, ["draft"]);
  if (!next) throw err("The campaign changed meanwhile; reload.", 409);
  return summarize(next);
}

export async function rescheduleCampaign(id: string, at: string) {
  const when = parseWhen(at);
  const next = await getStore().updateCampaign(id, { scheduledAt: when.toISOString() }, ["scheduled"]);
  if (!next) throw err("Only scheduled campaigns can be rescheduled.", 409);
  return summarize(next);
}

/** scheduled → draft (editable again). */
export async function unscheduleCampaign(id: string) {
  const next = await getStore().updateCampaign(id, { status: "draft", scheduledAt: null }, ["scheduled"]);
  if (!next) throw err("This campaign isn't scheduled any more (it may have started).", 409);
  return summarize(next);
}

/**
 * scheduled (and due, or `force`) → sending. Takes the campaign lease so the cron and an admin
 * clicking "send now" can't both freeze the list; re-resolves the audience (unsubscribes, bounces,
 * people who already got the story) at this moment and freezes it.
 */
export async function promoteScheduled(id: string, opts: { force?: boolean } = {}): Promise<{ promoted: boolean; added: number; reason?: string }> {
  const store = getStore();
  if (!(await store.acquireLease(id, 75_000))) return { promoted: false, added: 0, reason: "busy" };
  try {
    const c = await store.getCampaign(id);
    if (!c || c.status !== "scheduled") return { promoted: false, added: 0, reason: "not scheduled" };
    if (!opts.force && c.scheduledAt && new Date(c.scheduledAt).getTime() > Date.now() + 5_000) return { promoted: false, added: 0, reason: "not due" };
    invalidateAudience();
    const problems = contentProblems(c);
    const sender = c.sender ? { ...(await resolveSender(c.senderId)), ...c.sender } : await resolveSender(c.senderId);
    if (problems.length) {
      await store.updateCampaign(id, { status: "paused", lastError: `Scheduled send blocked: ${problems[0].message}` }, ["scheduled"]);
      return { promoted: false, added: 0, reason: "problems" };
    }
    const { recipients } = await pendingAudience(c);
    if (!recipients.length) {
      await store.updateCampaign(id, { status: "sent", finishedAt: new Date().toISOString(), lastError: "Nobody left to send to at the scheduled time." }, ["scheduled"]);
      return { promoted: true, added: 0, reason: "empty" };
    }
    const { added } = await freezeAndStart(c, recipients, sender as Sender, null, ["scheduled"]);
    return { promoted: true, added };
  } finally {
    await store.releaseLease(id);
  }
}

/**
 * One cron run (Supabase pg_cron → pg_net → /api/cron/email-campaigns, every minute):
 * promote due scheduled campaigns, then send for every campaign in "sending" within the budget.
 * The per-campaign lease means an open admin tab and the cron never send the same campaign at once.
 */
export async function runCron(budgetMs = 45_000) {
  const store = getStore();
  const started = Date.now();
  const all = await store.listCampaigns();
  const promoted: { id: string; added: number; reason?: string }[] = [];
  for (const c of all.filter((x) => x.status === "scheduled" && x.scheduledAt && new Date(x.scheduledAt).getTime() <= Date.now() + 5_000)) {
    try {
      const r = await promoteScheduled(c.id);
      promoted.push({ id: c.id, added: r.added, reason: r.reason });
    } catch (e) {
      promoted.push({ id: c.id, added: 0, reason: (e as Error).message });
    }
  }
  const ticks: { id: string; sent: number; failed: number; busy: boolean; status: string }[] = [];
  const sending = (await store.listCampaigns()).filter((x) => x.status === "sending");
  for (const c of sending) {
    const left = budgetMs - (Date.now() - started);
    if (left < 8_000) break;
    const r = await tick(c.id, Math.min(BUDGET_MS, left - 5_000));
    ticks.push({ id: c.id, sent: r.sentNow, failed: r.failedNow.length, busy: !!r.busy, status: r.campaign.status });
  }
  return { promoted, ticks, ms: Date.now() - started };
}

export async function setStatus(id: string, action: "pause" | "resume" | "cancel") {
  const store = getStore();
  const c = await store.getCampaign(id);
  if (!c) throw Object.assign(new Error("Campaign not found"), { status: 404 });
  let next: Campaign | null = null;
  if (action === "pause") next = await store.updateCampaign(id, { status: "paused" }, ["sending"]);
  if (action === "resume") next = await store.updateCampaign(id, { status: "sending", lastError: null }, ["paused", "sent"]);
  if (action === "cancel") next = await store.updateCampaign(id, { status: "cancelled", finishedAt: new Date().toISOString() }, ["sending", "paused", "draft", "scheduled"]);
  if (!next) throw Object.assign(new Error(`Can't ${action} a ${c.status} campaign.`), { status: 409 });
  if (action === "cancel") {
    const queued = await store.peekQueued(id, 100_000);
    await store.skip(
      queued.map((m) => m.id),
      "cancelled"
    );
  }
  return summarize(next);
}

export async function retryCampaign(id: string, opts: { failed: boolean; stuck: boolean }) {
  const store = getStore();
  const c = await store.getCampaign(id);
  if (!c) throw Object.assign(new Error("Campaign not found"), { status: 404 });
  if (c.status === "cancelled" || c.status === "draft") throw Object.assign(new Error(`Can't retry a ${c.status} campaign.`), { status: 409 });
  const n = await store.requeue(id, opts);
  const next = n ? await store.updateCampaign(id, { status: "sending", finishedAt: null, lastError: null }) : c;
  return { requeued: n, campaign: await summarize(next || c) };
}

/** One bounded unit of sending work. Safe to call from several places at once (lease). */
export async function tick(id: string, budgetMs = BUDGET_MS): Promise<TickResult> {
  const store = getStore();
  const started = Date.now();
  const mode = transportMode();
  const c0 = await store.getCampaign(id);
  if (!c0) throw Object.assign(new Error("Campaign not found"), { status: 404 });
  const result = async (c: Campaign, extra: Partial<TickResult> = {}): Promise<TickResult> => {
    const s = await summarize(c);
    return { campaign: s, sentNow: 0, failedNow: [], skippedNow: 0, done: s.status !== "sending", transport: mode, ...extra };
  };
  if (c0.status !== "sending") return result(c0);
  if (!(await store.acquireLease(id, LEASE_MS))) return result(c0, { busy: true });

  let sentNow = 0;
  let skippedNow = 0;
  const failedNow: { email: string; error: string }[] = [];
  let fatal: string | null = null;
  const sender = c0.sender || (await resolveSender(c0.senderId));
  let transport: ReturnType<typeof makeTransport> | null = null;
  try {
    if (!c0.startedAt) await store.updateCampaign(id, { startedAt: new Date().toISOString() });
    transport = makeTransport(sender.transport as TransportId);
    outer: while (Date.now() - started < budgetMs) {
      const next = await store.peekQueued(id, BATCH);
      if (!next.length) break;
      // unsubscribes / bounces since the snapshot: skip, never send
      const blocked = await store.blocked(next.map((m) => m.email));
      const skipIds = next.filter((m) => blocked.has(m.email)).map((m) => m.id);
      if (skipIds.length) {
        for (const reason of ["unsubscribed", "suppressed"] as const) {
          const ids = next.filter((m) => blocked.get(m.email) === reason).map((m) => m.id);
          await store.skip(ids, reason);
        }
        skippedNow += skipIds.length;
      }
      const claimed = await store.claim(next.filter((m) => !blocked.has(m.email)).map((m) => m.id));
      if (!claimed.length) continue;
      // names are re-read for this batch: overrides saved after queuing apply to everyone not yet sent
      const vars = await mergeVarsFor(claimed);
      for (let i = 0; i < claimed.length; i++) {
        const m: DbMessage = claimed[i];
        if (Date.now() - started > budgetMs) {
          await store.release(claimed.slice(i).map((x) => x.id));
          break outer;
        }
        const v = vars.get(m.email)!;
        try {
          const r = renderFor(c0, v, m.token);
          const info = await transport.t.sendMail(mailFor(sender, m.email, r, c0.id));
          if (transport.mode === "console") console.log(`[campaigns:console] ${c0.id.slice(0, 8)} → ${m.email} · "${r.subject}" · not sent`);
          // name: the one actually used (an override saved after queuing replaces the queued snapshot in the report)
          await store.updateMessage(m.id, { status: "sent", sentAt: new Date().toISOString(), providerId: info.messageId || null, vars: v, error: null, name: v.name || null });
          sentNow++;
        } catch (e) {
          const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
          if (isFatalSendError(e)) {
            fatal = msg;
            await store.release(claimed.slice(i).map((x) => x.id));
            break outer;
          }
          await store.updateMessage(m.id, { status: "failed", error: msg, vars: v });
          if (isRecipientRejection(e)) await store.suppress(m.email, "bounce", msg);
          failedNow.push({ email: m.email, error: msg });
        }
        if (i < claimed.length - 1) await sleep(transport.mode === "console" ? 0 : GAP_MS);
      }
      // admin paused / cancelled from another tab?
      const now = await store.getCampaign(id);
      if (!now || now.status !== "sending") break;
    }
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e);
  } finally {
    transport?.t.close();
  }

  let c = (await store.getCampaign(id)) || c0;
  if (fatal) c = (await store.updateCampaign(id, { status: "paused", lastError: fatal }, ["sending"])) || c;
  else if (c.status === "sending") {
    const counts = await store.counts(id);
    if (counts.queued === 0 && counts.sending - counts.stuck <= 0) c = (await store.updateCampaign(id, { status: "sent", finishedAt: new Date().toISOString() }, ["sending"])) || c;
  }
  await store.releaseLease(id);
  return result(c, { sentNow, failedNow, skippedNow, error: fatal || undefined });
}
