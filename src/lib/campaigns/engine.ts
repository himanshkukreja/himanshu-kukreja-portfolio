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
import { mergeVarsFor, resolveAudience } from "./audience";
import { renderEmail, type EmailContent } from "./render";
import type { MergeVars } from "./tags";
import { contentProblems } from "./validate";
import { unsubscribeUrlFor } from "./links";
import { checkSender, envSenders, formatFrom, isFatalSendError, isRecipientRejection, makeTransport, transportMode } from "./senders";
import { getStore, TablesMissingError, type DbMessage } from "./store";
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

/** Recipients a queue call would add right now (new people only). */
export async function pendingAudience(c: Campaign) {
  const exclude = await getStore().existingEmails(c.id);
  return resolveAudience(c.audience, { exclude });
}

export async function queueCampaign(id: string, confirm: string, admin: string) {
  const store = getStore();
  const c = await store.getCampaign(id);
  if (!c) throw Object.assign(new Error("Campaign not found"), { status: 404 });
  if (c.status === "cancelled") throw Object.assign(new Error("This campaign was cancelled."), { status: 409 });
  const problems = contentProblems(c);
  if (problems.length) throw Object.assign(new Error(`Fix ${problems.length} problem(s) first: ${problems[0].message}`), { status: 400 });
  const sender = await resolveSender(c.senderId);
  if (sender.check.level === "bad" && transportMode() === "live") throw Object.assign(new Error(`Sender can't send: ${sender.check.message}`), { status: 400 });
  const { recipients } = await pendingAudience(c);
  if (!recipients.length) throw Object.assign(new Error("Nobody new to send to in this audience."), { status: 400 });
  if (confirm.trim().toLowerCase() !== confirmPhrase(recipients.length)) throw Object.assign(new Error(`Type "${confirmPhrase(recipients.length)}" to confirm.`), { status: 400, expected: confirmPhrase(recipients.length) });
  const added = await store.insertMessages(
    c.id,
    recipients.map((r) => ({ ...r, token: newToken() }))
  );
  const now = new Date().toISOString();
  const updated = await store.updateCampaign(c.id, {
    status: "sending",
    sender: { fromName: sender.fromName, fromEmail: sender.fromEmail, replyTo: sender.replyTo, transport: sender.transport },
    senderId: sender.id,
    queuedAt: c.queuedAt || now,
    finishedAt: null,
    lastError: null,
    createdBy: c.createdBy || admin,
  });
  return { added, campaign: await summarize(updated || c) };
}

export async function setStatus(id: string, action: "pause" | "resume" | "cancel") {
  const store = getStore();
  const c = await store.getCampaign(id);
  if (!c) throw Object.assign(new Error("Campaign not found"), { status: 404 });
  let next: Campaign | null = null;
  if (action === "pause") next = await store.updateCampaign(id, { status: "paused" }, ["sending"]);
  if (action === "resume") next = await store.updateCampaign(id, { status: "sending", lastError: null }, ["paused", "sent"]);
  if (action === "cancel") next = await store.updateCampaign(id, { status: "cancelled", finishedAt: new Date().toISOString() }, ["sending", "paused", "draft"]);
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
          await store.updateMessage(m.id, { status: "sent", sentAt: new Date().toISOString(), providerId: info.messageId || null, vars: v, error: null });
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
