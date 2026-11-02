import { COURSE_ORIGIN } from "@/lib/site/hosts";
import type { StoryFrontmatter } from "@/lib/stories";
import { absoluteCoverUrl } from "@/lib/utils";
import { COURSE_BRAND_CELL, courseBrand } from "@/lib/email/brand";

export type EmailTemplateOptions = {
  recipientEmail?: string;
  subjectTitle?: string;
  headerTitle?: string; // new: separate visible header title from the email subject
  isWelcome?: boolean;
};

/** Course email palette (light, like the site's default theme; explicit colours so dark-mode clients don't invert it badly). */
const EC = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };
const EF_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const EF_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const EF_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

/**
 * Case-file update emails (newsletter send, admin preview, the welcome mail for new subscribers): the course's
 * brand bar (diagram mark + "System Design Mastery."), then each case file as cover, title, excerpt and a
 * signal-orange button.
 */
export function buildStoriesEmailHtml(stories: StoryFrontmatter[], opts: EmailTemplateOptions = {}): string {
  const site = COURSE_ORIGIN; // case files + unsubscribe live on the course host
  const unsubscribeLink = opts.recipientEmail
    ? `${site}/newsletter/unsubscribe?email=${encodeURIComponent(opts.recipientEmail)}`
    : `${site}/newsletter/unsubscribe`;

  const introText = opts.isWelcome
    ? "Welcome aboard. Here are the latest case files: real systems, real outages, and the design decisions behind them."
    : "New case files from System Design Mastery: real systems, real outages, and the design decisions behind them.";

  const items = stories
    .map((s) => {
      const cover = absoluteCoverUrl(s.cover); // emails need absolute URLs (local /covers/ files included)
      const coverImg = cover
        ? `<img src="${cover}" width="528" style="display:block;width:100%;max-width:528px;height:auto;border:1px solid ${EC.line};margin:0 0 14px 0;" alt="${escapeHtml(s.title)} cover" />`
        : "";
      return `
        <tr>
          <td style="padding:24px 0;border-bottom:1px solid ${EC.line};">
            ${coverImg}
            <div style="font-family:${EF_DISPLAY};font-weight:800;font-size:21px;line-height:1.25;letter-spacing:-0.01em;color:${EC.ink};margin:0 0 8px 0;">${escapeHtml(s.title)}</div>
            ${s.excerpt ? `<p style="margin:0 0 16px 0;font-family:${EF_BODY};font-size:15px;line-height:1.6;color:${EC.ink2};">${escapeHtml(s.excerpt)}</p>` : ""}
            <a href="${site}/case-files/${s.slug}" style="display:inline-block;background:${EC.signal};color:${EC.onSignal};font-family:${EF_MONO};font-size:14px;font-weight:600;text-decoration:none;padding:12px 18px;border:1px solid ${EC.signal};">Read the case file →</a>
          </td>
        </tr>
      `;
    })
    .join("");

  const subject = escapeHtml(opts.subjectTitle || "Case files · System Design Mastery");
  const header = escapeHtml(opts.headerTitle || (opts.isWelcome ? "Welcome to the case files" : "New case files"));
  const nowStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${subject}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .wrap { padding: 16px 8px !important; }
      .pad { padding-left: 20px !important; padding-right: 20px !important; }
      .h1 { font-size: 30px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${EC.paper};">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
    ${opts.isWelcome ? "Welcome aboard: the latest case files inside." : "New case files inside."}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EC.paper};">
    <tr>
      <td class="wrap" align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${EC.card};border:1px solid ${EC.line};">
          <tr>
            <td class="pad" style="background:${EC.black};padding:18px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="${COURSE_BRAND_CELL}"><a href="${site}" style="text-decoration:none;">${courseBrand()}</a></td>
                <td align="right" style="font-family:${EF_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">case files</td>
              </tr></table>
            </td>
          </tr>
          <tr><td style="height:4px;line-height:4px;font-size:0;background:${EC.signal};">&nbsp;</td></tr>
          <tr>
            <td class="pad" style="padding:32px 36px 8px 36px;">
              <div style="font-family:${EF_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${EC.ink3};margin:0 0 12px 0;">${nowStr}</div>
              <h1 class="h1" style="margin:0 0 16px 0;font-family:${EF_DISPLAY};font-weight:800;font-size:36px;line-height:1.06;letter-spacing:-0.03em;color:${EC.ink};">${header}<span style="color:${EC.signal};">.</span></h1>
              <div style="padding:2px 0 2px 14px;border-left:3px solid ${EC.signal};font-family:${EF_BODY};font-size:16px;line-height:1.6;color:${EC.ink2};">${introText}</div>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${items}
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:24px 36px 28px 36px;border-top:1px solid ${EC.line};">
              <p style="margin:0 0 10px 0;font-family:${EF_BODY};font-size:13px;line-height:1.5;color:${EC.ink3};">You're receiving this because you subscribed to case files from System Design Mastery by Himanshu Kukreja.</p>
              <p style="margin:0;font-family:${EF_MONO};font-size:12px;">
                <a href="${unsubscribeLink}" style="color:${EC.ink3};text-decoration:underline;">Unsubscribe</a>
                <span style="color:${EC.line};margin:0 8px;">·</span>
                <a href="${site}" style="color:${EC.ink3};text-decoration:underline;">systemdesignmastery.dev</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Backward-compatible alias
export function buildNewsletterHtml(stories: StoryFrontmatter[]): string {
  return buildStoriesEmailHtml(stories);
}

export function buildWelcomeEmailHtml(stories: StoryFrontmatter[], opts: EmailTemplateOptions = {}): string {
  return buildStoriesEmailHtml(stories, {
    ...opts,
    subjectTitle: "Welcome to the case files · System Design Mastery",
    headerTitle: "Welcome to the case files",
    isWelcome: true,
  });
}

// Contact email templates
export function buildContactNotificationHtml(name: string, email: string, message: string, queryId: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Query</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; background: #0b1020; color: #e4e4e7; }
    .container { max-width: 600px; margin: 0 auto; padding: 32px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .title { font-size: 24px; font-weight: 700; margin: 0; color: #fbbf24; }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin-bottom: 20px; }
    .field { margin-bottom: 16px; }
    .label { font-size: 12px; font-weight: 600; color: #9ca3af; margin-bottom: 4px; display: block; }
    .value { font-size: 14px; color: #e4e4e7; word-wrap: break-word; }
    .message-box { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2); border-radius: 12px; padding: 16px; }
    .footer { text-align: center; font-size: 12px; color: #6b7280; margin-top: 32px; }
    .query-id { font-family: 'Courier New', monospace; font-size: 11px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="title">🔔 New Contact Query</h1>
    </div>
    
    <div class="card">
      <div class="field">
        <span class="label">FROM</span>
        <div class="value"><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt;</div>
      </div>
      
      <div class="field">
        <span class="label">MESSAGE</span>
        <div class="message-box">
          ${escapeHtml(message).replace(/\n/g, '<br>')}
        </div>
      </div>
      
      <div class="field">
        <span class="label">QUERY ID</span>
        <div class="query-id">${queryId}</div>
      </div>
    </div>
    
    <div class="footer">
      <p>This is an automated notification from your portfolio contact form.</p>
      <p>Reply directly to this email to respond to ${escapeHtml(name)}.</p>
    </div>
  </div>
</body>
</html>`;
}

export function buildContactReplyHtml(name: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank you for reaching out</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; background: #0b1020; color: #e4e4e7; }
    .container { max-width: 600px; margin: 0 auto; padding: 32px 20px; }
    .header { text-align: center; margin-bottom: 32px; }
    .title { font-size: 24px; font-weight: 700; margin: 0; color: #34d399; }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin-bottom: 20px; }
    .content { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .signature { margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
    .signature-name { font-weight: 600; color: #fbbf24; }
    .footer { text-align: center; font-size: 12px; color: #6b7280; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="title">✨ Thank you for reaching out!</h1>
    </div>
    
    <div class="card">
      <div class="content">
        <p>Hi ${escapeHtml(name)},</p>
        
        <p>Thank you for getting in touch! I've received your message and really appreciate you taking the time to reach out.</p>
        
        <p>I'll review your message carefully and get back to you as soon as possible - typically within 24-48 hours. If your inquiry is urgent, please feel free to connect with me directly on LinkedIn.</p>
        
        <p>Looking forward to our conversation!</p>
      </div>
      
      <div class="signature">
        <div class="signature-name">Himanshu Kukreja</div>
        <div style="font-size: 14px; color: #9ca3af; margin-top: 4px;">
          Engineering Leader & Full-Stack Developer<br>
          <a href="https://www.linkedin.com/in/himanshukukreja/" style="color: #60a5fa;">LinkedIn</a> • 
          <a href="https://himanshukukreja.in" style="color: #60a5fa;">Portfolio</a>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>This is an automated response. Please don't reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
