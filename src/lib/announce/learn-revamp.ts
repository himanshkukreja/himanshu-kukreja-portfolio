/**
 * "System Design Mastery, rebuilt" announcement: HTML (table layout, inline styles, 600px, phone-safe)
 * + plain-text twin. Pure function, no I/O: the admin preview, the test send and the real send all
 * render through here so what you preview is exactly what goes out.
 *
 * Copy is checked against the shipped features (lesson stages/StageRail, CourseEnhancer quick checks,
 * Arena daily/leagues/games, review queue, themed course blocks, /learn/dashboard, case-file activities).
 */

export const ANNOUNCE_KEY = "announce:learn-revamp-2026-10";
/** Short, personal, curiosity first; the specifics live in the preheader. */
export const ANNOUNCE_SUBJECT = "I rebuilt System Design Mastery (and it's a game now)";
export function announceSubject(name?: string | null): string {
  const first = (name || "").trim().split(/\s+/)[0];
  return first ? `${first}, your system design course just levelled up` : ANNOUNCE_SUBJECT;
}
const PREHEADER = "1,000+ quick checks, a daily 5-question challenge and weekly leagues. Pick up right where you left off.";

const SITE = "https://www.himanshukukreja.in";
const UTM = "utm_source=email&utm_medium=email&utm_campaign=learn-revamp-2026";
const withUtm = (path: string) => `${SITE}${path}${path.includes("?") ? "&" : "?"}${UTM}`;

export const LINKS = {
  learn: withUtm("/learn"),
  daily: withUtm("/learn/arena/daily"),
  arena: withUtm("/learn/arena"),
  progress: withUtm("/learn/dashboard"),
  stories: withUtm("/stories"),
};

export function unsubscribeUrl(email: string) {
  return `${SITE}/newsletter/unsubscribe?email=${encodeURIComponent(email.toLowerCase().trim())}`;
}

type Feature = { tag: string; title: string; body: string };

const FEATURES: Feature[] = [
  {
    tag: "01 · reader",
    title: "A new lesson reader",
    body: "Every lesson is split into stages with a progress rail, so you always know where you are and land back where you stopped. Focus mode, read-aloud, highlights and notes are built in.",
  },
  {
    tag: "02 · quick checks",
    title: "1,000+ quick checks",
    body: "Short questions sit inside the lessons and check that an idea landed before you move on. Missed trial questions and cards you flag come back later in a spaced-repetition review queue.",
  },
  {
    tag: "03 · arena",
    title: "The Arena: daily challenge, leagues, games",
    body: "Five questions a day, the same for everyone, reset at midnight IST. Weekly leagues with promotion, plus 60–90 second games like Latency Ladder, Hash Ring and Incident Commander.",
  },
  {
    tag: "04 · diagrams",
    title: "Real diagrams",
    body: "The old ASCII box drawings are now themed diagrams and course blocks that read cleanly on a phone, in light or dark mode.",
  },
  {
    tag: "05 · progress",
    title: "A progress page that means something",
    body: "Course map, streaks, a weekly goal and trial scores in one place, with controls to export, import or reset your own data.",
  },
  {
    tag: "06 · case files",
    title: "Playable case files",
    body: "Each engineering case file now comes with a small playable activity built from its story, so you get to try the idea yourself.",
  },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Priya Sharma" → "Priya"; empty or email-looking names → null. */
export function firstName(full?: string | null): string | null {
  const t = (full || "").trim();
  if (!t || t.includes("@")) return null;
  const f = t.split(/\s+/)[0];
  return f.length > 1 && f.length <= 40 ? f : null;
}

export type AnnounceInput = { email: string; name?: string | null };

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

export function learnRevampHtml({ email, name }: AnnounceInput): string {
  const hi = firstName(name);
  const unsub = unsubscribeUrl(email);
  const features = FEATURES.map(
    (f) => `
          <tr>
            <td style="padding:0 0 22px 0;">
              <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signalText};margin:0 0 6px 0;">${esc(f.tag)}</div>
              <div style="font-family:${F_DISPLAY};font-weight:800;font-size:19px;line-height:1.25;letter-spacing:-0.01em;color:${C.ink};margin:0 0 6px 0;">${esc(f.title)}</div>
              <div style="font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">${esc(f.body)}</div>
            </td>
          </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(ANNOUNCE_SUBJECT)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Geist:wght@400;600&family=Geist+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${C.signalText}; }
  @media only screen and (max-width:620px) {
    .wrap { padding:0 !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:34px !important; }
    .btn a { display:block !important; text-align:center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <!-- top bar -->
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu<span style="display:inline-block;width:8px;height:15px;background:${C.signal};margin-left:4px;vertical-align:-2px;">&nbsp;</span></td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">patch notes · learn v2</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>

        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · free course</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">The course, rebuilt.</h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">You have an account on System Design Mastery, so you get to hear it first: I rebuilt the whole learning experience. Same free lessons, a much better way to work through them, and a few ways to make it a daily habit.</p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td class="pad btn" style="padding:24px 36px 8px 36px;">
            <a href="${LINKS.learn}" style="display:inline-block;background:${C.signal};color:${C.onSignal};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;text-decoration:none;padding:14px 22px;border:1px solid ${C.signal};">Open the course →</a>
          </td>
        </tr>

        <!-- features -->
        <tr>
          <td class="pad" style="padding:28px 36px 6px 36px;">
            <div style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;margin:0 0 26px 0;">&nbsp;</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${features}
            </table>
          </td>
        </tr>

        <!-- daily challenge strip -->
        <tr>
          <td class="pad" style="padding:0 36px 30px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr>
                <td style="padding:20px 22px;">
                  <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};margin:0 0 6px 0;">today's daily challenge</div>
                  <div style="font-family:${F_DISPLAY};font-weight:800;font-size:20px;line-height:1.3;color:#F3F2EE;margin:0 0 12px 0;">Five questions. Two minutes. Everyone gets the same five.</div>
                  <a href="${LINKS.daily}" style="font-family:${F_MONO};font-size:13px;font-weight:600;color:${C.signal};text-decoration:none;">Play today's challenge →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:0 36px 34px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">Lessons you already finished are still marked done when you sign in with the same account. If something looks broken or confusing, just reply to this email. I read every reply.</p>
            <p style="margin:16px 0 0 0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink};">Himanshu</p>
            <p style="margin:2px 0 0 0;font-family:${F_MONO};font-size:12px;color:${C.ink3};"><a href="${SITE}" style="color:${C.ink3};text-decoration:none;">himanshukukreja.in</a></p>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td class="pad" style="padding:18px 36px 22px 36px;border-top:1px solid ${C.line};background:${C.paper};">
            <p style="margin:0;font-family:${F_BODY};font-size:12px;line-height:1.6;color:${C.ink3};">You're getting this one-off update because you signed up at himanshukukreja.in/learn with ${esc(email)}. <a href="${unsub}" style="color:${C.ink3};text-decoration:underline;">Unsubscribe</a> and you won't get course or newsletter emails again.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function learnRevampText({ email, name }: AnnounceInput): string {
  const hi = firstName(name);
  const lines = [
    hi ? `Hi ${hi},` : "Hi there,",
    "",
    "You have an account on System Design Mastery, so you get to hear it first: I rebuilt the whole learning experience. Same free lessons, a much better way to work through them, and a few ways to make it a daily habit.",
    "",
    `Open the course: ${LINKS.learn}`,
    "",
    ...FEATURES.flatMap((f) => [`${f.title.toUpperCase()}`, f.body, ""]),
    "TODAY'S DAILY CHALLENGE",
    `Five questions. Two minutes. Everyone gets the same five: ${LINKS.daily}`,
    "",
    "Lessons you already finished are still marked done when you sign in with the same account. If something looks broken or confusing, just reply to this email. I read every reply.",
    "",
    "Himanshu",
    "himanshukukreja.in",
    "",
    "--",
    `You're getting this one-off update because you signed up at himanshukukreja.in/learn with ${email}.`,
    `Unsubscribe: ${unsubscribeUrl(email)}`,
  ];
  return lines.join("\n");
}

export function learnRevampEmail(input: AnnounceInput) {
  return { subject: announceSubject(input.name), html: learnRevampHtml(input), text: learnRevampText(input) };
}
