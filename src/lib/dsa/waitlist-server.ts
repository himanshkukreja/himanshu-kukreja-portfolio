import "server-only";
/**
 * Server half of the DSA Mastery waitlist (POST/GET /api/dsa/waitlist): the client IP, the per-IP rate
 * limit, and the one-time confirmation email. Rows live in public.dsa_waitlist and the founding grants in
 * public.course_access_grants (supabase/migrations/20261108_dsa_waitlist_access.sql).
 */
import nodemailer from "nodemailer";
import { RateLimiter } from "@/lib/design-week/core";
import { brevoConfigured, brevoTransport, type MailTransport } from "@/lib/email/transport";
import { smtpReady, transportKind } from "@/lib/announce/send";
import { dsaWaitlistEmail } from "@/lib/email/dsa-waitlist";

/** The visitor's IP: Cloudflare's header first (the Worker), then the proxy chain's first hop. */
export function requestIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xf) return xf;
  return req.headers.get("x-real-ip")?.trim() || null;
}

// Best effort and per isolate (the same approach as design-week's limiter): a burst from one address is
// slowed, and the unique email index is the hard rule. 8 tries per 15 minutes is plenty for a person
// fixing a typo; scripts hit the wall.
const signups = new RateLimiter(8, 15 * 60_000);
const reads = new RateLimiter(60, 10 * 60_000);

/** true = allowed (and counted). Requests with no IP share one bucket. */
export function allowSignup(ip: string | null): boolean {
  return signups.hit(ip || "unknown");
}
export function allowRead(ip: string | null): boolean {
  return reads.hit(ip || "unknown");
}

/**
 * The confirmation email, once per new row. Brevo's HTTPS API when BREVO_API_KEY is set (works on the
 * Cloudflare Worker), else SMTP; outside production the message is only rendered to the console
 * (ANNOUNCE_TRANSPORT, as for campaigns). Never throws: a failed email must not fail the signup.
 */
export async function sendWaitlistConfirmation(email: string, founding: boolean): Promise<boolean> {
  const mail = dsaWaitlistEmail({ email, founding });
  const kind = transportKind();
  let t: MailTransport | null = null;
  try {
    if (kind === "console") {
      t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" }) as unknown as MailTransport;
    } else {
      if (!smtpReady()) return false;
      const port = Number(process.env.SMTP_PORT || 587);
      t = brevoConfigured()
        ? brevoTransport()
        : (nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }) as unknown as MailTransport);
    }
    await Promise.race([
      t.sendMail({
        from: process.env.SMTP_FROM || `Himanshu Kukreja <${process.env.SMTP_USER || "no-reply@himanshukukreja.in"}>`,
        to: email,
        replyTo: mail.replyTo,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: mail.headers,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10_000)),
    ]);
    if (kind === "console") console.log(`[dsa-waitlist:console] confirmation for ${email} rendered, not sent`);
    return kind !== "console";
  } catch (e) {
    console.error("[dsa-waitlist] confirmation email failed:", e instanceof Error ? e.message : e);
    return false;
  } finally {
    try {
      t?.close();
    } catch {
      /* ignore */
    }
  }
}
