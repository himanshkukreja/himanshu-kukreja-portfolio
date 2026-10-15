/**
 * Admin test send for the welcome email: one "[test]" copy to the signed-in admin only.
 * Uses the announce transport switch (ANNOUNCE_TRANSPORT=smtp|console; console everywhere but
 * production), so a dev server renders the full MIME message to the console and emails nobody.
 */
import nodemailer from "nodemailer";
import { smtpReady, transportKind, type TransportKind } from "@/lib/announce/send";
import { welcomeEmail } from "./welcome";

export async function sendWelcomeTest(to: { email: string; name?: string | null }): Promise<{ kind: TransportKind; messageId?: string; bytes?: number }> {
  const kind = transportKind();
  let t;
  if (kind === "console") {
    t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  } else {
    if (!smtpReady()) throw new Error("SMTP credentials are not configured");
    const port = Number(process.env.SMTP_PORT || 587);
    t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  }
  const mail = welcomeEmail({ email: to.email, name: to.name });
  try {
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || `Himanshu Kukreja <${process.env.SMTP_USER || "no-reply@himanshukukreja.in"}>`,
      to: to.email,
      replyTo: mail.replyTo,
      subject: `[test] ${mail.subject}`,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
    });
    if (kind === "console") {
      const raw = (info as { message?: unknown }).message;
      const bytes = Buffer.isBuffer(raw) ? raw.length : 0;
      console.log(`[welcome:console] test → ${to.email} · ${bytes} bytes MIME · not sent`);
      return { kind, messageId: info.messageId, bytes };
    }
    return { kind, messageId: info.messageId };
  } finally {
    t.close();
  }
}
