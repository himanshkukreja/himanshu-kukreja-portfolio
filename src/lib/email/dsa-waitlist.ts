/**
 * DSA Mastery waitlist confirmation: sent once when an email first joins the list (POST /api/dsa/waitlist).
 * Same pattern as the welcome email (src/lib/email/welcome.ts): a pure function, table layout, inline styles,
 * 600px, phone-safe, light only, plus a plain-text twin. DSA Mastery's teal replaces the orange accent.
 *
 * Every claim matches the coming-soon page (src/components/dsa/soon) and the plan: launch aimed at early 2027,
 * the founding offer (both courses free for life for the account on this email, AI at fair-use daily credits).
 */
import { EMAIL } from "@/lib/socials";
import { COURSE_ORIGIN } from "@/lib/site/hosts";
import { COURSE_BRAND_CELL, courseBrand } from "@/lib/email/brand";

export const DSA_WAITLIST_SUBJECT = "You're on the DSA Mastery waitlist";
const PREHEADER = "Thanks for joining. Here is what happens next, and what your founding membership includes.";

const UTM = "utm_source=email&utm_medium=transactional&utm_campaign=dsa-waitlist";
const link = (path: string) => `${COURSE_ORIGIN}${path}${path.includes("?") ? "&" : "?"}${UTM}`;
const LINKS = { dsa: link("/dsa"), sdm: link("/") };

// Light tokens (globals.css :root) with DSA Mastery's teal.
const C = {
  paper: "#F5F4F0",
  card: "#FFFFFF",
  surface2: "#EEEDE8",
  ink: "#0B0B0B",
  ink2: "#2E2E33",
  ink3: "#55555B",
  line: "#DDDBD4",
  lineStrong: "#C9C7BF",
  dsa: "#14B8A6",
  dsaText: "#0B6E64",
  onDsa: "#021A16",
};
const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";
const LABEL_CSS = `font-family:${F_MONO};font-size:11px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const NEXT: string[] = [
  "We are building and testing DSA Mastery now, aiming to launch in early 2027. You will get one email when it opens.",
  "Every concept follows the 6S Loop: a real product scenario, a first attempt you measure, the insight, the pattern, its variations, and your own explanation.",
  "Practise in Python, Java, C++ or JavaScript, with an AI tutor that gives hints and reviews your approach without handing you the answer.",
];

export type DsaWaitlistInput = { email: string; founding: boolean };

export function dsaWaitlistHtml({ email, founding }: DsaWaitlistInput): string {
  const items = NEXT.map(
    (t, i) => `
              <tr>
                <td valign="top" width="32" style="width:32px;padding:${i ? "14px" : "0"} 0 0 0;font-family:${F_MONO};font-size:13px;font-weight:600;color:${C.dsaText};">${String(i + 1).padStart(2, "0")}</td>
                <td valign="top" style="padding:${i ? "14px" : "0"} 0 0 0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">${esc(t)}</td>
              </tr>`
  ).join("");
  const offer = founding
    ? `
        <tr>
          <td class="pad" style="padding:28px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.surface2}" style="background:${C.surface2};border:1px solid ${C.line};border-top:3px solid ${C.dsa};">
              <tr>
                <td style="padding:20px 22px 22px 22px;">
                  <div style="${LABEL_CSS}color:${C.dsaText};margin:0 0 8px 0;">Founding member</div>
                  <div style="font-family:${F_DISPLAY};font-weight:800;font-size:21px;line-height:1.25;letter-spacing:-0.01em;color:${C.ink};margin:0 0 6px 0;">Both courses stay free for you, for life.</div>
                  <div style="font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">You joined during the free period, so System Design Mastery and DSA Mastery stay free for the account on this email, with AI features on fair-use daily credits. Sign in at systemdesignmastery.dev with ${esc(email)} to keep it on your account.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(DSA_WAITLIST_SUBJECT)}</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  a { color:${C.dsaText}; }
  @media only screen and (max-width:620px) {
    .wrap { padding:0 !important; }
    .card { border-left:0 !important; border-right:0 !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:32px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};color:${C.ink};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.paper};">${esc(PREHEADER)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:32px 12px;">
      <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <tr>
          <td class="pad" style="padding:20px 36px;border-bottom:1px solid ${C.line};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="${COURSE_BRAND_CELL}"><a href="${LINKS.sdm}" style="text-decoration:none;">${courseBrand({ ink: C.ink, dot: C.dsaText })}</a></td>
              <td align="right" style="${LABEL_CSS}color:${C.ink3};white-space:nowrap;">dsa mastery</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:40px 36px 0 36px;">
            <div style="${LABEL_CSS}color:${C.ink3};margin:0 0 14px 0;"><span style="color:${C.dsaText};">&#9679;</span>&nbsp; coming soon · waitlist</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:38px;line-height:1.05;letter-spacing:-0.035em;color:${C.ink};">You're on the list.<br><span style="color:${C.dsaText};">DSA Mastery is on its way.</span></h1>
            <p style="margin:22px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.65;color:${C.ink2};">Hi, I'm Himanshu. Thanks for joining the waitlist for DSA Mastery, a course that teaches data structures and algorithms through real product engineering, on the same site and account as System Design Mastery.</p>
          </td>
        </tr>${offer}
        <tr>
          <td class="pad" style="padding:32px 36px 0 36px;">
            <div style="${LABEL_CSS}color:${C.ink};margin:0 0 16px 0;">What happens next</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:30px 36px 0 36px;">
            <a href="${LINKS.sdm}" style="display:inline-block;background:${C.dsa};color:${C.onDsa};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;line-height:20px;text-decoration:none;padding:14px 22px;border:1px solid ${C.dsa};">Start System Design Mastery now &rarr;</a>
            <div style="font-family:${F_BODY};font-size:13px;line-height:1.5;color:${C.ink3};margin:10px 0 0 0;">Free to read, with no sign-up needed. <a href="${LINKS.dsa}" style="color:${C.ink3};text-decoration:underline;">See what DSA Mastery will include</a>.</div>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:32px 36px 32px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.65;color:${C.ink2};">If there is a topic or language you want covered, reply to this email. I read every reply.</p>
            <p style="margin:14px 0 0 0;font-family:${F_DISPLAY};font-weight:800;font-size:19px;line-height:1.2;letter-spacing:-0.01em;color:${C.ink};">Himanshu Kukreja</p>
          </td>
        </tr>
        <tr>
          <td class="pad" bgcolor="${C.paper}" style="padding:20px 36px 24px 36px;border-top:1px solid ${C.line};background:${C.paper};">
            <p style="margin:0;font-family:${F_BODY};font-size:12px;line-height:1.65;color:${C.ink3};">You're getting this once because <span style="color:${C.ink2};">${esc(email)}</span> joined the DSA Mastery waitlist at systemdesignmastery.dev/dsa. If that wasn't you, reply and we will remove it.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function dsaWaitlistText({ email, founding }: DsaWaitlistInput): string {
  return [
    "You're on the list. DSA Mastery is on its way.",
    "",
    "Hi, I'm Himanshu. Thanks for joining the waitlist for DSA Mastery, a course that teaches data structures and algorithms through real product engineering, on the same site and account as System Design Mastery.",
    "",
    ...(founding
      ? [
          "FOUNDING MEMBER",
          `You joined during the free period, so System Design Mastery and DSA Mastery stay free for the account on this email, for life, with AI features on fair-use daily credits. Sign in at systemdesignmastery.dev with ${email} to keep it on your account.`,
          "",
        ]
      : []),
    "WHAT HAPPENS NEXT",
    ...NEXT.map((t, i) => `${String(i + 1).padStart(2, "0")}. ${t}`),
    "",
    `Start System Design Mastery now: ${LINKS.sdm}`,
    `See what DSA Mastery will include: ${LINKS.dsa}`,
    "",
    "If there is a topic or language you want covered, reply to this email. I read every reply.",
    "",
    "Himanshu Kukreja",
    "",
    "--",
    `You're getting this once because ${email} joined the DSA Mastery waitlist at systemdesignmastery.dev/dsa. If that wasn't you, reply and we will remove it.`,
  ].join("\n");
}

/** Everything a transport needs; replies reach Himanshu's inbox. */
export function dsaWaitlistEmail(input: DsaWaitlistInput) {
  return {
    subject: DSA_WAITLIST_SUBJECT,
    html: dsaWaitlistHtml(input),
    text: dsaWaitlistText(input),
    replyTo: EMAIL,
    headers: { "X-Campaign": "dsa-waitlist" } as Record<string, string>,
  };
}
