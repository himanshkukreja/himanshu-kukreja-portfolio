/**
 * Mail over HTTPS (Brevo's transactional API) instead of SMTP, when BREVO_API_KEY is set: works on
 * any host, including Cloudflare Workers, which can't run nodemailer's SMTP client. Same shape as the
 * nodemailer transports it replaces (sendMail → { messageId }, close), so callers don't change.
 * Without the key every caller keeps its SMTP transport (SMTP_*), so this switch is reversible.
 * Senders must be verified in Brevo (the SMTP relay has the same rule).
 */
export type MailOptions = {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};
export type MailInfo = { messageId: string; message?: unknown };
export type MailTransport = { sendMail(o: MailOptions): Promise<MailInfo>; close(): void };

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export const brevoConfigured = () => !!process.env.BREVO_API_KEY;

/** "Name <a@b.c>" | "\"Name\" <a@b.c>" | "a@b.c" → Brevo's { email, name? } */
function addr(s: string): { email: string; name?: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  if (!m) return { email: s.trim() };
  const name = m[1].trim();
  return name ? { email: m[2].trim(), name } : { email: m[2].trim() };
}

export function brevoTransport(apiKey = process.env.BREVO_API_KEY || ""): MailTransport {
  return {
    async sendMail(o) {
      const to = (Array.isArray(o.to) ? o.to : o.to.split(",")).map((s) => addr(s)).filter((a) => a.email);
      const body = {
        sender: addr(o.from),
        to,
        subject: o.subject,
        ...(o.html ? { htmlContent: o.html } : {}),
        ...(o.text ? { textContent: o.text } : {}),
        ...(o.replyTo ? { replyTo: addr(o.replyTo) } : {}),
        ...(o.headers && Object.keys(o.headers).length ? { headers: o.headers } : {}),
      };
      const res = await fetch(BREVO_URL, {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        // codes the campaign engine already understands: auth / rate limit / outage pause the batch,
        // anything else fails just this message
        const code = res.status === 401 || res.status === 403 ? "EAUTH" : res.status === 429 || res.status >= 500 ? "ECONNECTION" : "EMESSAGE";
        throw Object.assign(new Error(`Brevo ${res.status}: ${detail}`), { code, responseCode: res.status });
      }
      const j = (await res.json().catch(() => ({}))) as { messageId?: string };
      return { messageId: j.messageId || "" };
    },
    close() {},
  };
}
