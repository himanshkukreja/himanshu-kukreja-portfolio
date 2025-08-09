import nodemailer from "nodemailer";

export function getTransport() {
  const host = process.env.SMTP_HOST as string;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER as string;
  const pass = process.env.SMTP_PASS as string;

  if (!host || !user || !pass) {
    throw new Error("SMTP credentials are not configured");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for others
    auth: { user, pass },
  });
}

function fromAddress() {
  // If SMTP_FROM contains a full name + email, use it directly; otherwise fall back to user
  return process.env.SMTP_FROM || `Himanshu Kukreja <${process.env.SMTP_USER}>`;
}

export async function sendRawEmail(to: string, subject: string, html: string) {
  const transporter = getTransport();
  await transporter.sendMail({ from: fromAddress(), to, subject, html });
}

export async function sendNewsletterEmail(to: string, subject: string, html: string) {
  return sendRawEmail(to, subject, html);
}

export async function sendBulk(emails: string[], subject: string, htmlFor: (email: string) => string) {
  const transporter = getTransport();
  await Promise.all(
    emails.map(async (to) => {
      const html = htmlFor(to);
      await transporter.sendMail({ from: fromAddress(), to, subject, html });
    })
  );
}
