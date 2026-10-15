/**
 * Sender identities + transports for campaigns. Server-only (reads SMTP secrets from env).
 *
 * Transports come from env: `smtp` (SMTP_HOST/PORT/USER/PASS/FROM, the one the site already uses) and
 * an optional second set `smtp2` (SMTP2_HOST/PORT/USER/PASS/FROM). Senders are "from" identities on a
 * transport: the env defaults (SMTP_FROM, SMTP2_FROM) plus any added in the admin (email_senders).
 *
 * Safety switch: EMAIL_TRANSPORT (or the older ANNOUNCE_TRANSPORT) = smtp | console. Default is smtp
 * in production and console everywhere else, so a dev server never emails anyone: the console
 * transport builds the full MIME message and logs a one-line summary.
 */
import nodemailer from "nodemailer";
import { EMAIL } from "@/lib/socials";
import type { Sender, SenderCheck, TransportId, TransportInfo, TransportMode } from "./types";

export function transportMode(): TransportMode {
  const v = (process.env.EMAIL_TRANSPORT || process.env.ANNOUNCE_TRANSPORT || "").toLowerCase();
  if (v === "console") return "console";
  if (v === "smtp") return "live";
  return process.env.NODE_ENV === "production" ? "live" : "console";
}

type Env = { host?: string; port?: string; user?: string; pass?: string; from?: string; replyTo?: string; verified?: string };
const envFor = (id: TransportId): Env => {
  const p = id === "smtp" ? "SMTP_" : "SMTP2_";
  const e = process.env;
  return { host: e[`${p}HOST`], port: e[`${p}PORT`], user: e[`${p}USER`], pass: e[`${p}PASS`], from: e[`${p}FROM`], replyTo: e[`${p}REPLY_TO`], verified: e[`${p}VERIFIED_DOMAINS`] };
};

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());
const domainOf = (email: string) => email.split("@")[1]?.toLowerCase().trim() || "";

/** "Himanshu Kukreja<no-reply@x.in>" | "no-reply@x.in" → parts */
export function parseFrom(v: string | undefined | null): { name: string; email: string } | null {
  const s = (v || "").trim();
  if (!s) return null;
  const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(s);
  if (m) return { name: m[1].replace(/^"|"$/g, "").trim(), email: m[2].trim().toLowerCase() };
  return isEmail(s) ? { name: "", email: s.toLowerCase() } : null;
}

function provider(host: string | undefined): { name: string; note: string } {
  const h = (host || "").toLowerCase();
  if (h.includes("brevo") || h.includes("sendinblue")) return { name: "Brevo", note: "Brevo only delivers from senders or domains verified under Senders, Domains & Dedicated IPs." };
  if (h.includes("amazonaws.com")) return { name: "Amazon SES", note: "SES only sends from verified identities (domain or address); in the sandbox it also only sends to verified recipients." };
  if (h.includes("gmail.com") || h.includes("googlemail")) return { name: "Gmail", note: "Gmail rewrites From to the signed-in account unless the address is a verified “Send mail as” alias." };
  if (h.includes("resend")) return { name: "Resend", note: "Resend only sends from domains verified in its dashboard." };
  if (h.includes("postmark")) return { name: "Postmark", note: "Postmark only sends from confirmed sender signatures or verified domains." };
  if (h.includes("sendgrid")) return { name: "SendGrid", note: "SendGrid only sends from verified single senders or authenticated domains." };
  if (h.includes("mailgun")) return { name: "Mailgun", note: "Mailgun only sends from domains added and verified in Mailgun." };
  return { name: host ? host : "SMTP", note: "SMTP providers usually only deliver from verified sender identities; check the provider's sender settings." };
}

export function transportInfo(id: TransportId): TransportInfo {
  const env = envFor(id);
  const configured = !!(env.host && env.user && env.pass);
  const p = provider(env.host);
  const listed = (env.verified || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const fromDomain = domainOf(parseFrom(env.from)?.email || "");
  const verifiedDomains = listed.length ? listed : fromDomain ? [fromDomain] : [];
  return {
    id,
    label: id === "smtp" ? "SMTP (SMTP_*)" : "Second SMTP (SMTP2_*)",
    configured,
    host: env.host || null,
    provider: p.name,
    verifiedDomains,
    verifiedSource: listed.length ? "env" : fromDomain ? "assumed" : "none",
    note: p.note,
  };
}

export const allTransports = (): TransportInfo[] => [transportInfo("smtp"), transportInfo("smtp2")];

export function checkSender(s: { fromEmail: string; transport: TransportId; replyTo?: string | null }): SenderCheck {
  const t = transportInfo(s.transport);
  const email = s.fromEmail.trim().toLowerCase();
  if (!isEmail(email)) return { level: "bad", message: "Not a valid from address." };
  if (s.replyTo && !isEmail(s.replyTo)) return { level: "bad", message: "Reply-to isn't a valid address." };
  if (!t.configured) return { level: "bad", message: `${s.transport === "smtp" ? "SMTP_HOST / SMTP_USER / SMTP_PASS" : "SMTP2_HOST / SMTP2_USER / SMTP2_PASS"} aren't set on this deployment.` };
  const d = domainOf(email);
  if (t.provider === "Gmail") {
    const user = (envFor(s.transport).user || "").toLowerCase();
    if (user && user !== email) return { level: "warn", message: `Gmail will rewrite From to ${user} unless ${email} is a verified “Send mail as” alias.` };
  }
  if (t.verifiedDomains.includes(d))
    return {
      level: t.verifiedSource === "env" ? "ok" : "warn",
      message:
        t.verifiedSource === "env"
          ? `${d} is listed as verified for ${t.provider}.`
          : `${d} matches the domain this transport already sends from (SMTP_FROM). Set ${s.transport === "smtp" ? "SMTP_VERIFIED_DOMAINS" : "SMTP2_VERIFIED_DOMAINS"} to confirm.`,
    };
  return { level: "warn", message: `${d} isn't a known verified domain for ${t.provider}. ${t.note}` };
}

/** Senders defined by env (always present, read-only in the UI). */
export function envSenders(): Omit<Sender, "isDefault">[] {
  const out: Omit<Sender, "isDefault">[] = [];
  for (const id of ["smtp", "smtp2"] as TransportId[]) {
    const env = envFor(id);
    const from = parseFrom(env.from) || (id === "smtp" && env.user && isEmail(env.user) ? { name: "Himanshu Kukreja", email: env.user.toLowerCase() } : null);
    if (!from && id === "smtp2") continue;
    const f = from || { name: "Himanshu Kukreja", email: "no-reply@himanshukukreja.in" };
    const replyTo = env.replyTo && isEmail(env.replyTo) ? env.replyTo.toLowerCase() : EMAIL;
    out.push({
      id: `env:${id}`,
      label: id === "smtp" ? "Default (SMTP_FROM)" : "Second transport (SMTP2_FROM)",
      fromName: f.name || "Himanshu Kukreja",
      fromEmail: f.email,
      replyTo,
      transport: id,
      source: "env",
      check: checkSender({ fromEmail: f.email, transport: id, replyTo }),
    });
  }
  return out;
}

export const formatFrom = (name: string, email: string) => (name ? `"${name.replace(/"/g, "'")}" <${email}>` : email);

/** A nodemailer transport for one batch. Console mode never opens a network connection. */
export function makeTransport(id: TransportId) {
  if (transportMode() === "console") return { mode: "console" as const, t: nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" }) };
  const env = envFor(id);
  if (!env.host || !env.user || !env.pass) throw Object.assign(new Error(`${id.toUpperCase()} credentials are not configured on this deployment`), { fatal: true });
  const port = Number(env.port || 587);
  return {
    mode: "live" as const,
    t: nodemailer.createTransport({
      host: env.host,
      port,
      secure: port === 465,
      auth: { user: env.user, pass: env.pass },
      pool: true,
      maxConnections: 1,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    }),
  };
}

/** Errors that mean "this transport / identity can't send right now" (pause, don't fail everyone). */
export function isFatalSendError(e: unknown): boolean {
  const err = e as { code?: string; responseCode?: number; message?: string; fatal?: boolean };
  if (err?.fatal) return true;
  const code = err?.code || "";
  if (["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED", "ETLS"].includes(code)) return true;
  const msg = (err?.message || "").toLowerCase();
  if (err?.responseCode === 535 || err?.responseCode === 530 || err?.responseCode === 421) return true;
  return /not verified|unverified|sender.*(not|isn't).*(allowed|authori|valid)|authentication|daily (sending )?(limit|quota)|rate limit|too many/i.test(msg);
}

/** Hard bounces at submission: the recipient address itself is rejected. */
export function isRecipientRejection(e: unknown): boolean {
  const err = e as { responseCode?: number; message?: string };
  const rc = err?.responseCode || 0;
  return [550, 551, 553].includes(rc) && /(mailbox|recipient|user|address|no such)/i.test(err?.message || "") && !/sender|from/i.test(err?.message || "");
}
