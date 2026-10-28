/**
 * "Watch it" announcement (end of October 2026): every part of the course as a narrated, animated
 * lecture (193 lectures, nearly 50 hours), the recorded mock interviews, and the Shorts feed. Also
 * what grew since the last email (side quests 21 → 25, low-level design 8 → 22, war stories 20 → 30,
 * mock interviews 4 → 8) and share links. HTML (table layout, inline styles, 600px, phone-safe) +
 * plain-text twin. Pure function, no I/O: src/lib/campaigns/templates.ts turns it into the
 * "lectures-shorts" campaign template.
 *
 * Links are plain (no UTM): the campaign engine adds utm_* and click tracking per send.
 * Screenshots: public/email/lectures-shorts/ (captured from the live site, dark theme, 2x,
 * analytics blocked), referenced by absolute URL.
 *
 * Facts checked against the live site on 28 Oct 2026: /learn/prep/lectures lists 193 lectures, 49 h
 * 58 min (course 76, side quests 25, interview problems 20, low-level design 22, case files 12, war
 * stories 30, mock interviews 8); mock interviews run 42-52 min (player and lecture list); the first minute of a lecture
 * is open to everyone and the rest needs a free sign-in; a signed-in sharer's link plays in full
 * (LectureShare); player speeds 0.75-2x, 10 XP a checkpoint (LecturePlayer); SHORTS_COUNT shorts
 * live on /learn/shorts.
 */
import { firstName, unsubscribeUrl } from "./learn-revamp";

export const SHORTS_COUNT = 404;

export const LECTURES_SHORTS_KEY = "announce:lectures-shorts-2026-10";
export const LECTURES_SHORTS_SUBJECT = `Every lesson is a video now, plus ${SHORTS_COUNT} one-minute shorts`;
export function lecturesShortsSubject(name?: string | null): string {
  const first = firstName(name);
  return first ? `${first}, every lesson is a video now (plus ${SHORTS_COUNT} shorts)` : LECTURES_SHORTS_SUBJECT;
}
export const LECTURES_SHORTS_PREHEADER =
  "193 narrated lectures, nearly 50 hours: every lesson, side quest, problem, case file and mock interview. And a Shorts feed: one idea in a minute.";

const SITE = "https://www.himanshukukreja.in";
const L = `${SITE}/learn`;
export const LECTURES_SHORTS_LINKS = {
  hub: `${L}/system-design-mastery`,
  lectures: `${L}/prep/lectures`,
  lecture: `${L}/lectures/bonus-22-google-maps`,
  firstLesson: `${L}/lectures/week-00-foundations--foundations-part-1-basic-concepts`,
  mock: `${L}/lectures/mock-interviews--mock-05-paisly-otp-login`,
  shorts: `${L}/shorts`,
  stories: `${L}/war-stories`,
};
const IMG_BASE = `${SITE}/email/lectures-shorts`;

export type LecturesShortsInput = { email: string; name?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

/** Screenshot: `w` CSS px in the email; the files are 2x. */
type Shot = { file: string; w: number; h: number; alt: string };
const SHOTS = {
  lecture: { file: "lecture.jpg", w: 528, h: 349, alt: "The Google Maps lecture playing: a phone shows three routes to the airport with their times, beside the line Routes, times and a red road, with captions and the player's controls: pause, back and forward 10 seconds, ask about this, captions, music, speed, share and picture in picture." },
  mock: { file: "mock.jpg", w: 528, h: 349, alt: "The Paisly mock interview playing: the interviewer, Nandini Hegde, and the candidate, Siddharth Rane, are named at the top; the slide reads Design Paisly's sign-in: OTP, device binding, sessions, and her line is captioned with her name." },
  shorts: { file: "shorts.jpg", w: 260, h: 563, alt: "The Shorts feed on a phone: a full-screen vertical short with word-by-word captions, the category filters along the top, and buttons for upvote, discussion, save, share and sound down the side, above the short's title and its full lecture link." },
} satisfies Record<string, Shot>;

const b = (s: string) => `<strong style="color:${C.ink};">${s}</strong>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.signalText};text-decoration:underline;">${label}</a>`;

type Link = { href: string; label: string };
type Block = { tag: string; title: string; html: string; text: string; shot: Shot; links: Link[] };

const BLOCKS: Block[] = [
  {
    tag: "lectures · 193 videos · ~50 hours",
    title: "Every lesson is a lecture now",
    html: `All ${b("76 course lessons")}, ${b("25 side quests")}, ${b("20 interview problems")}, ${b("22 low-level design")} lessons and ${b("12 case files")} come as narrated, animated lectures. Each one walks through the idea, where the obvious design breaks, the real one, and what to say in the interview. It stops for quick checkpoints (10 XP each), and you can ${b("ask the AI about any moment")}. Captions, chapters, 0.75–2× speed, picture-in-picture, and you can save a lecture to watch offline.`,
    text: "All 76 course lessons, 25 side quests, 20 interview problems, 22 low-level design lessons and 12 case files come as narrated, animated lectures. Each one walks through the idea, where the obvious design breaks, the real one, and what to say in the interview. It stops for quick checkpoints (10 XP each), and you can ask the AI about any moment. Captions, chapters, 0.75-2x speed, picture-in-picture, and you can save a lecture to watch offline.",
    shot: SHOTS.lecture,
    links: [
      { href: LECTURES_SHORTS_LINKS.lecture, label: "Watch the Google Maps lecture" },
      { href: LECTURES_SHORTS_LINKS.lectures, label: "all 193 lectures" },
    ],
  },
  {
    tag: "mock interviews · recorded",
    title: "Sit in on 8 full mock interviews",
    html: `Watch a whole round, ${b("40 to 50 minutes")} each: the interviewer asks, the candidate clarifies, designs, gets pushed on the weak spots and answers. Two voices, captioned by name.`,
    text: "Watch a whole round, 40 to 50 minutes each: the interviewer asks, the candidate clarifies, designs, gets pushed on the weak spots and answers. Two voices, captioned by name.",
    shot: SHOTS.mock,
    links: [{ href: LECTURES_SHORTS_LINKS.mock, label: "Watch the Paisly OTP login interview" }],
  },
  {
    tag: `shorts · ${SHORTS_COUNT} of them`,
    title: "One idea in a minute",
    html: `The new ${b("shorts")} tab is a full-screen feed of ${b(`${SHORTS_COUNT} one-minute shorts`)}, cut from the lectures: the hook, the twist, the fix. Swipe through on the bus, upvote, ask a question under one, or ${b("save it to your notebook")}. Every short links to its full lecture, and the next few are kept on your phone, so they play even without a network.`,
    text: `The new shorts tab is a full-screen feed of ${SHORTS_COUNT} one-minute shorts, cut from the lectures: the hook, the twist, the fix. Swipe through on the bus, upvote, ask a question under one, or save it to your notebook. Every short links to its full lecture, and the next few are kept on your phone, so they play even without a network.`,
    shot: SHOTS.shorts,
    links: [{ href: LECTURES_SHORTS_LINKS.shorts, label: "Open the shorts" }],
  },
];

const ALSO = [
  {
    title: "Free, with one step.",
    html: "The first minute of every lecture is open to everyone. Sign in (it's free) to watch the rest.",
    text: "The first minute of every lecture is open to everyone. Sign in (it's free) to watch the rest.",
  },
  {
    title: "Share a lecture.",
    html: "Signed in, the share button gives you a link that plays in full for anyone, no sign-in needed, and can start at the moment you're on.",
    text: "Signed in, the share button gives you a link that plays in full for anyone, no sign-in needed, and can start at the moment you're on.",
  },
  {
    title: "More of everything.",
    html: `Since the last email: 4 new side quests (Google Maps, Zoom, Airbnb and Dream11, 25 in all), the low-level design track grew from 8 lessons to 22, and there are ${a(LECTURES_SHORTS_LINKS.stories, "30 war stories")}, each with a 2-3 minute video.`,
    text: `Since the last email: 4 new side quests (Google Maps, Zoom, Airbnb and Dream11, 25 in all), the low-level design track grew from 8 lessons to 22, and there are 30 war stories, each with a 2-3 minute video: ${LECTURES_SHORTS_LINKS.stories}`,
  },
];

const img = (s: Shot) =>
  `<img src="${IMG_BASE}/${s.file}" width="${s.w}" height="${s.h}" alt="${esc(s.alt)}" style="display:block;width:100%;max-width:${s.w}px;height:auto;border:1px solid ${C.line};margin:0 auto;">`;
const P = `margin:0 0 10px 0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};`;
const TAG = `font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signalText};`;

function blockHtml(x: Block): string {
  const [first, ...rest] = x.links;
  const more = rest.map((l) => ` · or ${a(l.href, esc(l.label))}`).join("");
  return `
        <tr>
          <td class="pad" style="padding:0 36px 36px 36px;">
            <div style="${TAG}margin:0 0 6px 0;">${esc(x.tag)}</div>
            <h3 style="margin:0 0 10px 0;font-family:${F_DISPLAY};font-weight:800;font-size:21px;line-height:1.2;letter-spacing:-0.01em;color:${C.ink};">${esc(x.title)}</h3>
            <p style="${P}">${x.html}</p>
            <div style="margin:14px 0 12px 0;" align="center">${img(x.shot)}</div>
            <p style="margin:0;font-family:${F_MONO};font-size:13px;line-height:1.6;color:${C.ink3};"><a href="${first.href}" style="color:${C.signalText};text-decoration:underline;font-weight:600;">${esc(first.label)} →</a>${more}</p>
          </td>
        </tr>`;
}

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:${C.signal};color:${C.onSignal};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;text-decoration:none;padding:14px 22px;">${esc(label)}</a>`;

const INTRO =
  "You can watch the whole course now. Every lesson, side quest, problem and case file has its own narrated lecture, there are 8 full mock interviews to sit in on, and a new Shorts feed for the days you only have a minute.";

const STATS: [string, string][] = [
  ["193", "lectures"],
  ["~50 h", "to watch"],
  [String(SHORTS_COUNT), "shorts"],
];

export function lecturesShortsHtml({ email, name }: LecturesShortsInput): string {
  const hi = firstName(name);
  const unsub = unsubscribeUrl(email);
  const also = ALSO.map((t) => `<li style="margin:0 0 8px 0;">${b(esc(t.title))} ${t.html}</li>`).join("");
  const stats = STATS.map(
    ([n, l]) =>
      `<td width="33%" align="center" style="padding:16px 6px;"><div style="font-family:${F_DISPLAY};font-weight:800;font-size:30px;line-height:1;color:#F3F2EE;">${esc(n)}</div><div style="margin-top:6px;font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};">${esc(l)}</div></td>`,
  ).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(LECTURES_SHORTS_SUBJECT)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Geist:wght@400;600&family=Geist+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${C.signalText}; }
  img { -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:620px) {
    .wrap { padding:0 !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:34px !important; }
    .btn a { display:block !important; text-align:center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(LECTURES_SHORTS_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <!-- top bar -->
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu</td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">new · lectures + shorts</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>
        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · watch it</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">Press play on the whole course<span style="color:${C.signal};">.</span></h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${esc(INTRO)}</p>
          </td>
        </tr>
        <!-- numbers -->
        <tr>
          <td class="pad" style="padding:18px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};"><tr>${stats}</tr></table>
          </td>
        </tr>
        <tr>
          <td class="pad btn" style="padding:22px 36px 32px 36px;">
            ${button(LECTURES_SHORTS_LINKS.firstLesson, "Start with lecture one →")}
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:0 36px 0 36px;">
            <div style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;margin:0 0 30px 0;">&nbsp;</div>
          </td>
        </tr>
        ${BLOCKS.map(blockHtml).join("")}
        <!-- also -->
        <tr>
          <td class="pad" style="padding:0 36px 26px 36px;">
            <div style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;margin:0 0 24px 0;">&nbsp;</div>
            <div style="${TAG}margin:0 0 10px 0;">also</div>
            <ul style="margin:0;padding:0 0 0 18px;font-family:${F_BODY};font-size:15px;line-height:1.55;color:${C.ink2};">${also}</ul>
          </td>
        </tr>
        <tr>
          <td class="pad btn" style="padding:4px 36px 12px 36px;">
            ${button(LECTURES_SHORTS_LINKS.lectures, "Browse all 193 lectures →")}
          </td>
        </tr>
        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:18px 36px 34px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">Watch one this week. If a lecture gets something wrong or moves too fast, reply and tell me where. I read every reply.</p>
            <p style="margin:16px 0 0 0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink};">Himanshu</p>
            <p style="margin:2px 0 0 0;font-family:${F_MONO};font-size:12px;color:${C.ink3};"><a href="${SITE}" style="color:${C.ink3};text-decoration:none;">himanshukukreja.in</a></p>
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td class="pad" style="padding:18px 36px 22px 36px;border-top:1px solid ${C.line};background:${C.paper};">
            <p style="margin:0;font-family:${F_BODY};font-size:12px;line-height:1.6;color:${C.ink3};">You're getting this course update because you signed up at himanshukukreja.in/learn with ${esc(email)}. <a href="${unsub}" style="color:${C.ink3};text-decoration:underline;">Unsubscribe</a> and you won't get course or newsletter emails again.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function lecturesShortsText({ email, name }: LecturesShortsInput): string {
  const hi = firstName(name);
  return [
    hi ? `Hi ${hi},` : "Hi there,",
    "",
    INTRO,
    "",
    STATS.map(([n, l]) => `${n} ${l}`).join(" · "),
    `Start with lecture one: ${LECTURES_SHORTS_LINKS.firstLesson}`,
    "",
    ...BLOCKS.flatMap((x) => [x.title.toUpperCase(), x.text, ...x.links.map((l, i) => `${i ? "Or " + l.label : l.label}: ${l.href}`), ""]),
    "ALSO",
    ...ALSO.map((t) => `- ${t.title} ${t.text}`),
    "",
    `All 193 lectures: ${LECTURES_SHORTS_LINKS.lectures}`,
    "",
    "Watch one this week. If a lecture gets something wrong or moves too fast, reply and tell me where. I read every reply.",
    "",
    "Himanshu",
    "himanshukukreja.in",
    "",
    "--",
    `You're getting this course update because you signed up at himanshukukreja.in/learn with ${email}.`,
    `Unsubscribe: ${unsubscribeUrl(email)}`,
  ].join("\n");
}

export function lecturesShortsEmail(input: LecturesShortsInput) {
  return { subject: lecturesShortsSubject(input.name), html: lecturesShortsHtml(input), text: lecturesShortsText(input) };
}
