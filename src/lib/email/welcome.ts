/**
 * Welcome email, sent once per new account (POST /api/send-welcome-email, user_profiles.welcome_email_sent).
 * HTML (table layout, inline styles, 600px, phone-safe, light theme only) + plain-text twin.
 * Pure function, no I/O: the route, the admin preview and the admin test send all render through here,
 * so what the owner previews is exactly what a new learner gets.
 *
 * Every claim is checked against what ships: course map (src/lib/learn/course.ts: 11 worlds, 66 core
 * lessons, 10 bosses, 21 side quests), quick checks (src/app/learn/page.tsx "1,000+"), Arena daily
 * (DAILY_N = 5, DAILY_SECONDS = 20, Asia/Kolkata day), leagues/leaderboard, games (60-90 s), progress
 * page (/learn/dashboard: course map, streaks, weekly goal), review (/learn/review), notebook
 * (/learn/notebook: highlights, notes, bookmarks), Ask Claude / ChatGPT (src/lib/learn/askAi.ts),
 * case files with end-of-case activities (/stories), the practice toolkit (/learn/practice: revision
 * decks, cheat sheets, Python code labs, mock interviews).
 */
import { EMAIL, SOCIALS } from "@/lib/socials";

/** Personal and action-first: the first lesson is the thing to click. */
export const WELCOME_SUBJECT = "You're in. Your first system design lesson is ready";
export function welcomeSubject(name?: string | null): string {
  const first = (name || "").trim().split(/\s+/)[0];
  return first ? `You're in, ${first}. Your first lesson is ready` : WELCOME_SUBJECT;
}
export const WELCOME_PREHEADER = "66 free lessons, 1,000+ quick checks and a daily challenge. Your progress follows you to any device.";

const SITE = "https://www.himanshukukreja.in";
const UTM = "utm_source=email&utm_medium=welcome&utm_campaign=welcome";
const withUtm = (path: string) => `${SITE}${path}${path.includes("?") ? "&" : "?"}${UTM}`;

const FIRST_LESSON = "/learn/system-design-mastery/week-00-foundations/foundations-part-1-basic-concepts";

export const WELCOME_LINKS = {
  firstLesson: withUtm(FIRST_LESSON),
  learn: withUtm("/learn"),
  daily: withUtm("/learn/arena/daily"),
  leaderboard: withUtm("/learn/arena/leaderboard"),
  progress: withUtm("/learn/dashboard"),
  practice: withUtm("/learn/prep"),
  stories: withUtm("/stories"),
  site: withUtm("/"),
};

export function welcomeUnsubscribeUrl(email: string) {
  return `${SITE}/newsletter/unsubscribe?email=${encodeURIComponent(email.toLowerCase().trim())}`;
}

/** "Priya Sharma" → "Priya"; empty or email-looking names → null. */
export function welcomeFirstName(full?: string | null): string | null {
  const t = (full || "").trim();
  if (!t || t.includes("@")) return null;
  const f = t.split(/\s+/)[0];
  return f.length > 1 && f.length <= 40 ? f : null;
}

const STATS: { n: string; label: string }[] = [
  { n: "11", label: "worlds" },
  { n: "66", label: "core lessons" },
  { n: "10", label: "interview bosses" },
  { n: "1,000+", label: "quick checks" },
];

type Feature = { glyph: string; tag: string; title: string; body: string; link?: { label: string; href: string } };

const FEATURES: Feature[] = [
  {
    glyph: "&#10003;", // ✓
    tag: "learn",
    title: "Quick checks inside every lesson",
    body: "Short questions sit right in the lessons, so you know an idea landed before you move on. Each world ends with an interview boss and a trial.",
  },
  {
    glyph: "&#9650;", // ▲
    tag: "arena",
    title: "A daily challenge, weekly leagues and quick games",
    body: "Five questions a day, the same five for everyone. Climb the weekly league leaderboard, or play a 90-second game like Latency Ladder or Hash Ring.",
    link: { label: "See the leaderboard", href: WELCOME_LINKS.leaderboard },
  },
  {
    glyph: "&#8594;", // →
    tag: "progress",
    title: "Pick up exactly where you stopped",
    body: "Your place in every lesson is saved as you read, and it resumes on any device you sign in on. The progress page shows your course map, streak and weekly goal.",
    link: { label: "Open your progress page", href: WELCOME_LINKS.progress },
  },
  {
    glyph: "&#8801;", // ≡
    tag: "practice",
    title: "Interview prep, beyond the lessons",
    body: "Five-minute revision decks, one-page cheat sheets, Python code labs and timed mock interviews, all in one practice toolkit.",
    link: { label: "Open the practice toolkit", href: WELCOME_LINKS.practice },
  },
  {
    glyph: "&para;", // ¶
    tag: "review + notebook",
    title: "A review queue and a notebook",
    body: "Questions you miss come back in a five-minute spaced-repetition review. Your highlights, notes and bookmarks collect in one notebook, grouped by lesson.",
  },
  {
    glyph: "?",
    tag: "ask",
    title: "Ask about any line",
    body: "Select any text to ask Claude or ChatGPT about it, with the lesson's context already in the prompt. Or copy a link to that exact line and send it to a friend.",
  },
  {
    glyph: "#",
    tag: "case files",
    title: "Engineering case files",
    body: "Real production incidents and builds, told as stories with themed diagrams. Each one ends with a hands-on challenge, so you get to try the idea yourself.",
    link: { label: "Browse the case files", href: WELCOME_LINKS.stories },
  },
];

const FOOTER_SOCIALS = SOCIALS.filter((s) => s.id === "github" || s.id === "linkedin" || s.id === "x");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type WelcomeInput = { email: string; name?: string | null };

// Light "Level Up" tokens (src/app/globals.css :root). The email is light-only on purpose.
const C = {
  paper: "#F5F4F0",
  card: "#FFFFFF",
  surface2: "#EEEDE8",
  raised: "#FAFAF7",
  ink: "#0B0B0B",
  ink2: "#2E2E33",
  ink3: "#55555B",
  line: "#DDDBD4",
  lineStrong: "#C9C7BF",
  signal: "#FF6B2B",
  signalText: "#C2410C",
  onSignal: "#120700",
};
const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

const LABEL_CSS = `font-family:${F_MONO};font-size:11px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;`;

export function welcomeHtml({ email, name }: WelcomeInput): string {
  const hi = welcomeFirstName(name);
  const unsub = welcomeUnsubscribeUrl(email);

  // no whitespace between cells: on phones they become 50% inline-blocks (2 × 2) and a text node would wrap them
  const statCell = (s: { n: string; label: string }, i: number) => `<td class="${["stat", "stat stat-r", "stat stat-row2", "stat stat-r stat-row2"][i]}" width="25%" valign="top" style="width:25%;padding:16px 14px 14px 14px;${i ? `border-left:1px solid ${C.line};` : ""}">
                      <div style="font-family:${F_DISPLAY};font-weight:800;font-size:30px;line-height:1;letter-spacing:-0.03em;color:${C.ink};white-space:nowrap;">${s.n}</div>
                      <div style="${LABEL_CSS}color:${C.ink3};margin:8px 0 0 0;">${esc(s.label)}</div>
</td>`;

  const features = FEATURES.map(
    (f, i) => `
              <tr>
                <td valign="top" width="44" style="width:44px;padding:${i ? "20px" : "0"} 0 20px 0;${i < FEATURES.length - 1 ? `border-bottom:1px solid ${C.line};` : ""}">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td align="center" valign="middle" width="32" height="32" style="width:32px;height:32px;border:1px solid ${C.lineStrong};background:${C.raised};font-family:${F_MONO};font-size:15px;font-weight:600;line-height:32px;color:${C.signalText};text-align:center;">${f.glyph}</td>
                  </tr></table>
                </td>
                <td valign="top" style="padding:${i ? "20px" : "0"} 0 20px 0;${i < FEATURES.length - 1 ? `border-bottom:1px solid ${C.line};` : ""}">
                  <div style="${LABEL_CSS}color:${C.signalText};margin:0 0 4px 0;">${String(i + 1).padStart(2, "0")} · ${esc(f.tag)}</div>
                  <div style="font-family:${F_DISPLAY};font-weight:800;font-size:18px;line-height:1.25;letter-spacing:-0.01em;color:${C.ink};margin:0 0 6px 0;">${esc(f.title)}</div>
                  <div style="font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">${esc(f.body)}</div>${
                    f.link
                      ? `
                  <div style="margin:8px 0 0 0;"><a href="${f.link.href}" style="font-family:${F_MONO};font-size:13px;font-weight:600;color:${C.signalText};text-decoration:none;">${esc(f.link.label)} &rarr;</a></div>`
                      : ""
                  }
                </td>
              </tr>`
  ).join("");

  const socials = [
    `<a href="${WELCOME_LINKS.site}" style="color:${C.ink2};text-decoration:none;">himanshukukreja.in</a>`,
    ...FOOTER_SOCIALS.map((s) => `<a href="${s.href}" style="color:${C.ink2};text-decoration:none;">${s.id === "x" ? "X" : s.id === "github" ? "GitHub" : "LinkedIn"}</a>`),
  ].join(`<span style="color:${C.lineStrong};">&nbsp;&nbsp;/&nbsp;&nbsp;</span>`);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(WELCOME_SUBJECT)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Geist:wght@400;600&family=Geist+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  a { color:${C.signalText}; }
  @media only screen and (max-width:620px) {
    .wrap { padding:0 !important; }
    .card { border-left:0 !important; border-right:0 !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:34px !important; }
    .hide-sm { display:none !important; }
    .stat { display:inline-block !important; width:50% !important; box-sizing:border-box !important; border-left:0 !important; }
    .stat-r { border-left:1px solid ${C.line} !important; }
    .stat-row2 { border-top:1px solid ${C.line} !important; }
    .btn-cell { display:block !important; width:100% !important; }
    .btn a { display:block !important; text-align:center !important; }
    .btn-alt { display:block !important; padding:14px 0 0 0 !important; text-align:center !important; }
    .btn-note { text-align:center !important; }
  }
</style>
<!--[if mso]><style>.stat div, td, a, p, div { font-family:Arial,sans-serif !important; }</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.paper};color:${C.ink};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.paper};">${esc(WELCOME_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:32px 12px;">
      <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">

        <!-- brand bar -->
        <tr>
          <td class="pad" style="padding:20px 36px;border-bottom:1px solid ${C.line};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:${C.ink};white-space:nowrap;"><a href="${WELCOME_LINKS.site}" style="color:${C.ink};text-decoration:none;"><span style="color:${C.signalText};">~</span>/himanshu</a><span style="display:inline-block;width:8px;height:14px;background:${C.signal};margin-left:3px;vertical-align:-1px;line-height:14px;font-size:0;">&nbsp;</span></td>
              <td align="right" style="${LABEL_CSS}color:${C.ink3};white-space:nowrap;">new account</td>
            </tr></table>
          </td>
        </tr>

        <!-- hero -->
        <tr>
          <td class="pad" style="padding:40px 36px 0 36px;">
            <div style="${LABEL_CSS}color:${C.ink3};margin:0 0 14px 0;"><span style="color:${C.signalText};">&#9679;</span>&nbsp; system design mastery · free course</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.035em;color:${C.ink};">You're in${hi ? `, ${esc(hi)}` : ""}.<br><span style="color:${C.signalText};">Here's what you can do now.</span></h1>
            <p style="margin:22px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.65;color:${C.ink2};">${hi ? `Hi ${esc(hi)}, I'm Himanshu.` : "Hi, I'm Himanshu."} Thanks for signing up. I wrote System Design Mastery as the course I wish I'd had when I moved from shipping features to designing the systems behind them: free, practical, and built from real production work.</p>
            <p style="margin:12px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.65;color:${C.ink2};">Reading is open to everyone. Your account turns it into something you can work through: your progress, streak and notes now follow you to any device.</p>
          </td>
        </tr>

        <!-- stats -->
        <tr>
          <td class="pad" style="padding:28px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};background:${C.raised};">
              <tr>${STATS.map(statCell).join("")}</tr>
            </table>
            <div style="${LABEL_CSS}color:${C.ink3};margin:10px 0 0 0;"><span style="white-space:nowrap;">+ 21 side quests</span> &nbsp;·&nbsp; <span style="white-space:nowrap;">themed diagrams</span> &nbsp;·&nbsp; <span style="white-space:nowrap;">no paywall</span></div>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td class="pad" style="padding:28px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td class="btn btn-cell" valign="middle" style="white-space:nowrap;">
                <a href="${WELCOME_LINKS.firstLesson}" style="display:inline-block;background:${C.signal};color:${C.onSignal};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;line-height:20px;text-decoration:none;padding:14px 22px;border:1px solid ${C.signal};">Start lesson 1 &rarr;</a>
              </td>
              <td class="btn-alt" valign="middle" width="100%" style="padding:0 0 0 18px;font-family:${F_MONO};font-size:13px;line-height:20px;">
                <a href="${WELCOME_LINKS.learn}" style="color:${C.ink2};text-decoration:underline;text-decoration-color:${C.lineStrong};text-underline-offset:3px;">or see the course map</a>
              </td>
            </tr></table>
            <div class="btn-note" style="font-family:${F_BODY};font-size:13px;line-height:1.5;color:${C.ink3};margin:10px 0 0 0;">World 00, Part 1: System Design Fundamentals.</div>
          </td>
        </tr>

        <!-- features -->
        <tr>
          <td class="pad" style="padding:40px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="${LABEL_CSS}color:${C.ink};white-space:nowrap;padding:0 12px 0 0;">What your account unlocks</td>
              <td width="100%" style="border-bottom:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</td>
            </tr></table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">${features}
            </table>
          </td>
        </tr>

        <!-- daily challenge -->
        <tr>
          <td class="pad" style="padding:12px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.surface2}" style="background:${C.surface2};border:1px solid ${C.line};border-top:3px solid ${C.signal};">
              <tr>
                <td style="padding:20px 22px 22px 22px;">
                  <div style="${LABEL_CSS}color:${C.signalText};margin:0 0 8px 0;">Today's daily challenge</div>
                  <div style="font-family:${F_DISPLAY};font-weight:800;font-size:21px;line-height:1.25;letter-spacing:-0.01em;color:${C.ink};margin:0 0 6px 0;">Five questions. Twenty seconds each.</div>
                  <div style="font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};margin:0 0 14px 0;">Everyone gets the same five, and a new set drops at midnight IST. A good two-minute warm-up before your first lesson.</div>
                  <a href="${WELCOME_LINKS.daily}" style="font-family:${F_MONO};font-size:13px;font-weight:600;color:${C.signalText};text-decoration:none;">Play today's challenge &rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:36px 36px 36px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.65;color:${C.ink2};">If something is confusing or broken, or there's a topic you want covered, just reply to this email. I read every reply.</p>
            <p style="margin:14px 0 0 0;font-family:${F_BODY};font-size:15px;line-height:1.65;color:${C.ink2};">Happy building,</p>
            <p style="margin:6px 0 0 0;font-family:${F_DISPLAY};font-weight:800;font-size:20px;line-height:1.2;letter-spacing:-0.01em;color:${C.ink};">Himanshu Kukreja</p>
            <p style="margin:8px 0 0 0;font-family:${F_MONO};font-size:12px;line-height:1.8;color:${C.ink2};">${socials}</p>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td class="pad" bgcolor="${C.paper}" style="padding:20px 36px 24px 36px;border-top:1px solid ${C.line};background:${C.paper};">
            <p style="margin:0;font-family:${F_BODY};font-size:12px;line-height:1.65;color:${C.ink3};">You're getting this once because you created an account at himanshukukreja.in with <span style="color:${C.ink2};">${esc(email)}</span>. There's no drip sequence; occasional course updates may follow, and you can <a href="${unsub}" style="color:${C.ink3};text-decoration:underline;">unsubscribe</a> from them any time. Export or reset your learning data from your <a href="${WELCOME_LINKS.progress}" style="color:${C.ink3};text-decoration:underline;">progress page</a>.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function welcomeText({ email, name }: WelcomeInput): string {
  const hi = welcomeFirstName(name);
  const lines = [
    `You're in${hi ? `, ${hi}` : ""}. Here's what you can do now.`,
    "",
    `${hi ? `Hi ${hi}, I'm Himanshu.` : "Hi, I'm Himanshu."} Thanks for signing up. I wrote System Design Mastery as the course I wish I'd had when I moved from shipping features to designing the systems behind them: free, practical, and built from real production work.`,
    "",
    "Reading is open to everyone. Your account turns it into something you can work through: your progress, streak and notes now follow you to any device.",
    "",
    STATS.map((s) => `${s.n} ${s.label}`).join(" · ") + " · + 21 side quests",
    "",
    `Start lesson 1 (World 00, Part 1: System Design Fundamentals):`,
    WELCOME_LINKS.firstLesson,
    `Or see the course map: ${WELCOME_LINKS.learn}`,
    "",
    "WHAT YOUR ACCOUNT UNLOCKS",
    "",
    ...FEATURES.flatMap((f, i) => [`${String(i + 1).padStart(2, "0")}. ${f.title}`, f.body, ...(f.link ? [`${f.link.label}: ${f.link.href}`] : []), ""]),
    "TODAY'S DAILY CHALLENGE",
    "Five questions, twenty seconds each. Everyone gets the same five, and a new set drops at midnight IST.",
    `Play: ${WELCOME_LINKS.daily}`,
    "",
    "If something is confusing or broken, or there's a topic you want covered, just reply to this email. I read every reply.",
    "",
    "Happy building,",
    "Himanshu Kukreja",
    `himanshukukreja.in · ${FOOTER_SOCIALS.map((s) => s.href).join(" · ")}`,
    "",
    "--",
    `You're getting this once because you created an account at himanshukukreja.in with ${email}. There's no drip sequence; occasional course updates may follow.`,
    `Unsubscribe: ${welcomeUnsubscribeUrl(email)}`,
    `Export or reset your learning data: ${WELCOME_LINKS.progress}`,
  ];
  return lines.join("\n");
}

/** Everything a transport needs. `replyTo` makes "just reply" reach Himanshu's inbox. */
export function welcomeEmail(input: WelcomeInput) {
  const unsub = welcomeUnsubscribeUrl(input.email);
  return {
    subject: welcomeSubject(input.name),
    preheader: WELCOME_PREHEADER,
    html: welcomeHtml(input),
    text: welcomeText(input),
    replyTo: EMAIL,
    headers: { "List-Unsubscribe": `<${unsub}>`, "X-Campaign": "welcome" } as Record<string, string>,
  };
}
