/**
 * Delivery for announcements: one transport per batch, sequential sends with a fixed gap (rate limit),
 * a newsletter_logs row per recipient ("sending" → "sent" | "error"), List-Unsubscribe headers.
 *
 * Transport: ANNOUNCE_TRANSPORT=smtp | console. Default is smtp in production and console everywhere
 * else, so a dev server never emails real people. The console transport renders the full MIME message
 * and logs a one-line summary; nothing leaves the machine.
 */
import nodemailer from "nodemailer";
import { supabase } from "@/lib/supabase";
import { ANNOUNCE_KEY, learnRevampEmail, unsubscribeUrl } from "./learn-revamp";
import type { Recipient } from "./audience";

export type TransportKind = "smtp" | "console";

export function transportKind(): TransportKind {
  const v = (process.env.ANNOUNCE_TRANSPORT || "").toLowerCase();
  if (v === "smtp" || v === "console") return v;
  return process.env.NODE_ENV === "production" ? "smtp" : "console";
}

export function smtpReady(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function fromAddress() {
  return process.env.SMTP_FROM || `Himanshu Kukreja <${process.env.SMTP_USER || "no-reply@himanshukukreja.in"}>`;
}

function makeTransport(kind: TransportKind) {
  if (kind === "console") return nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  if (!smtpReady()) throw new Error("SMTP credentials are not configured");
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: true, // one connection reused across the batch
    maxConnections: 1,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

/** Gap between two messages in a batch. ~2.5 msgs/s keeps well under common SMTP provider limits. */
export const SEND_GAP_MS = 400;
export const MAX_BATCH = 25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function message(to: Recipient, subjectPrefix = "") {
  const mail = learnRevampEmail({ email: to.email, name: to.name });
  const unsub = unsubscribeUrl(to.email);
  return {
    from: fromAddress(),
    to: to.email,
    subject: `${subjectPrefix}${mail.subject}`,
    html: mail.html,
    text: mail.text,
    headers: { "List-Unsubscribe": `<${unsub}>`, "X-Campaign": ANNOUNCE_KEY },
  };
}

export type SendResult = { email: string; ok: boolean; error?: string };

/**
 * Single message outside the campaign (test send). SMTP sends are logged as type "announce-test";
 * console sends write nothing (dev servers share the production database).
 */
export async function sendTest(to: Recipient): Promise<{ kind: TransportKind; messageId?: string; bytes?: number }> {
  const kind = transportKind();
  const t = makeTransport(kind);
  try {
    const info = await t.sendMail(message(to, "[test] "));
    if (kind === "console") {
      const bytes = Buffer.isBuffer((info as { message?: unknown }).message) ? ((info as { message: Buffer }).message.length) : 0;
      console.log(`[announce:console] test → ${to.email} · ${bytes} bytes MIME · not sent`);
      return { kind, messageId: info.messageId, bytes };
    }
    await supabase.from("newsletter_logs").insert({ email: to.email, status: "sent", type: "announce-test", detail: "Test send (smtp)", story_slugs: [ANNOUNCE_KEY] });
    return { kind, messageId: info.messageId };
  } finally {
    t.close();
  }
}

/**
 * Sends one batch. With SMTP each recipient is claimed with a "sending" log row first, so a parallel
 * batch or a retry after a timeout can never email the same person twice (audience.ts skips sent +
 * sending). The console transport writes no rows at all.
 */
export async function sendBatch(campaignId: number | null, batch: Recipient[]): Promise<{ kind: TransportKind; results: SendResult[] }> {
  const kind = transportKind();
  const t = makeTransport(kind);
  const results: SendResult[] = [];
  try {
    for (let i = 0; i < batch.length; i++) {
      const to = batch[i];
      if (kind === "console") {
        try {
          await t.sendMail(message(to));
          console.log(`[announce:console] → ${to.email} · not sent`);
          results.push({ email: to.email, ok: true });
        } catch (e) {
          results.push({ email: to.email, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        continue;
      }
      const { data: claim, error: claimErr } = await supabase
        .from("newsletter_logs")
        .insert({ email: to.email, status: "sending", type: "announce", detail: "learn revamp", campaign_id: campaignId, story_slugs: [ANNOUNCE_KEY] })
        .select("id")
        .single();
      if (claimErr || !claim) {
        results.push({ email: to.email, ok: false, error: `log write failed: ${claimErr?.message || "no row"}` });
        continue;
      }
      try {
        await t.sendMail(message(to));
        await supabase.from("newsletter_logs").update({ status: "sent" }).eq("id", claim.id);
        results.push({ email: to.email, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.from("newsletter_logs").update({ status: "error", detail: `learn revamp failed: ${msg.slice(0, 300)}` }).eq("id", claim.id);
        results.push({ email: to.email, ok: false, error: msg });
      }
      if (i < batch.length - 1) await sleep(SEND_GAP_MS);
    }
  } finally {
    t.close();
  }
  return { kind, results };
}

/** Emails that failed in this campaign (skipped by later batches unless the admin retries them). */
export async function failedIn(campaignId: number): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await supabase.from("newsletter_logs").select("email").eq("campaign_id", campaignId).eq("status", "error");
  for (const r of data || []) out.add(String(r.email).toLowerCase());
  return out;
}
