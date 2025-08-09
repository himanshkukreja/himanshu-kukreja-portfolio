import type { StoryFrontmatter } from "@/lib/stories";

export type EmailTemplateOptions = {
  recipientEmail?: string;
  subjectTitle?: string;
  headerTitle?: string; // new: separate visible header title from the email subject
  isWelcome?: boolean;
};

export function buildStoriesEmailHtml(stories: StoryFrontmatter[], opts: EmailTemplateOptions = {}): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  const unsubscribeLink = opts.recipientEmail
    ? `${site}/newsletter/unsubscribe?email=${encodeURIComponent(opts.recipientEmail)}`
    : `${site}/newsletter/unsubscribe`;

  const introText = opts.isWelcome
    ? "Welcome to the community! Here are some wonderful stories to kickstart your learning journey in system and backend design."
    : "These are some wonderful stories to help you master system/backend design — perfect for your learning journey!";

  const items = stories
    .map(
      (s) => `
    <tr>
      <td class="story" style="padding:20px 0;border-bottom:1px solid #e5e7eb">
        <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <h3 class="story-title" style="margin:0;font-size:18px;color:#ffffff;font-weight:600;">${escapeHtml(s.title)}</h3>
        </div>
        ${s.excerpt ? `<p class="story-excerpt" style=\"margin:12px 0;font-size:15px;line-height:1.6\">${escapeHtml(s.excerpt)}</p>` : ""}
        <div style="margin-top: 16px;">
          <a class="btn" href="${site}/stories/${s.slug}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">Read Full Story →</a>
        </div>
      </td>
    </tr>
  `
    )
    .join("");

  const subject = escapeHtml(opts.subjectTitle || "Engineering Stories");
  const header = escapeHtml(
    opts.headerTitle || (opts.isWelcome ? "Welcome to Engineering Stories!" : "This Week’s Engineering Stories")
  );
  const nowStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${subject}</title>
    <style>
      /* Mobile tweaks */
      @media only screen and (max-width: 600px) {
        .container { width: 100% !important; padding: 16px !important; }
        .content { padding: 16px !important; }
        .story-title { font-size: 16px !important; }
      }
      :root { color-scheme: light dark; supported-color-schemes: light dark; }

      /* Dark mode support (Apple Mail, some clients) */
      @media (prefers-color-scheme: dark) {
        body { background-color: #0b1020 !important; }
        .outer { background: linear-gradient(135deg, #0b1020 0%, #111827 100%) !important; }
        .container { background-color: #0f172a !important; }
        .content, .content p, .content a { color: #e2e8f0 !important; }
        .muted, .footer a { color: #94a3b8 !important; }
        .divider { border-color: #1f2937 !important; }
        .footer { background-color: #0b1324 !important; border-top-color: #1f2937 !important; }
        .story { border-bottom-color: #1f2937 !important; }
        .card { background: linear-gradient(135deg, #1e3a8a 0%, #4c1d95 100%) !important; }
        .btn { background: linear-gradient(135deg, #6366f1 0%, #7c3aed 100%) !important; color: #ffffff !important; }
        /* Ensure intro box is dark so light text is readable */
        .intro { background: linear-gradient(135deg, #0b1220 0%, #111827 100%) !important; border-left-color: #38bdf8 !important; }
        .intro p { color: #e2e8f0 !important; }
        .story-excerpt { color: #cbd5e1 !important; }
      }

      /* Gmail iOS dark mode selector */
      [data-ogsc] body { background-color: #0b1020 !important; }
      [data-ogsc] .outer { background: linear-gradient(135deg, #0b1020 0%, #111827 100%) !important; }
      [data-ogsc] .container { background-color: #0f172a !important; }
      [data-ogsc] .content, [data-ogsc] .content p, [data-ogsc] .content a { color: #e2e8f0 !important; }
      [data-ogsc] .muted, [data-ogsc] .footer a { color: #94a3b8 !important; }
      [data-ogsc] .divider { border-color: #1f2937 !important; }
      [data-ogsc] .footer { background-color: #0b1324 !important; border-top-color: #1f2937 !important; }
      [data-ogsc] .story { border-bottom-color: #1f2937 !important; }
      [data-ogsc] .card { background: linear-gradient(135deg, #1e3a8a 0%, #4c1d95 100%) !important; }
      [data-ogsc] .btn { background: linear-gradient(135deg, #6366f1 0%, #7c3aed 100%) !important; color: #ffffff !important; }
      /* Gmail iOS: intro box & excerpt */
      [data-ogsc] .intro { background: linear-gradient(135deg, #0b1220 0%, #111827 100%) !important; border-left-color: #38bdf8 !important; }
      [data-ogsc] .intro p { color: #e2e8f0 !important; }
      [data-ogsc] .story-excerpt { color: #cbd5e1 !important; }
    </style>
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background-color: #f8fafc;">
    <!-- Preheader text -->
    <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
      ${opts.isWelcome ? "Welcome aboard!" : "Your latest engineering stories inside."}
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="outer" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="container" style="background:#ffffff;border-radius:16px;box-shadow: 0 10px 25px rgba(0,0,0,0.1);overflow:hidden;max-width:600px;width:100%;">
            
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px 24px; text-align: center;">
                <h1 style="margin:0;font-size:28px;color:#ffffff;font-weight:700;letter-spacing:-0.5px;">
                  ${header}
                </h1>
                <p class="muted" style="margin:8px 0 0;color:#e2e8f0;font-size:14px;opacity:0.9;">
                  ${nowStr}
                </p>
              </td>
            </tr>
            
            <!-- Intro -->
            <tr>
              <td class="content" style="padding: 32px 24px 16px;">
                <div class="intro" style="background: linear-gradient(135deg, #0f172a 0%, #0b1220 100%); border-left: 4px solid #38bdf8; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
                  <p style="margin: 0; color: #e5e7eb; font-size: 16px; line-height: 1.6; font-weight: 600;">
                    ${introText}
                  </p>
                </div>
              </td>
            </tr>
            
            <!-- Stories -->
            <tr>
              <td class="content" style="padding: 0 24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${items}
                </table>
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td class="footer" style="padding: 32px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                <p class="muted" style="margin: 0 0 12px; color: #64748b; font-size: 14px; line-height: 1.5;">
                  You're receiving this because you subscribed to engineering stories from Himanshu Kukreja.
                </p>
                <p style="margin: 0; font-size: 12px;">
                  <a href="${unsubscribeLink}" style="color: #64748b; text-decoration: underline;">Unsubscribe</a>
                  <span style="color: #cbd5e1; margin: 0 8px;">•</span>
                  <a href="${site}" style="color: #64748b; text-decoration: underline;">Visit Website</a>
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
    subjectTitle: "🎉 Welcome to Engineering Stories!",
    headerTitle: "Welcome to Engineering Stories!",
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
          <a href="https://www.linkedin.com/in/kukreja-him" style="color: #60a5fa;">LinkedIn</a> • 
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
