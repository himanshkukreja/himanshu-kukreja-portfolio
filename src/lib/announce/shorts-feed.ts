/**
 * Shorts announcement (end of October 2026): the Shorts feed on its own, because the "lectures-shorts"
 * email that first mentioned it was never sent. What a short is, the feed on a phone (swipe, category and
 * topic filters), the speed control (keys and touch), the laptop view, and the extras (full lecture at that
 * moment, discussion, save, share, offline). HTML (table layout, inline styles, 600px, phone-safe) +
 * plain-text twin. Pure function, no I/O: src/lib/campaigns/templates.ts turns it into the "shorts"
 * campaign template.
 *
 * Links are plain (no UTM): the campaign engine adds utm_* and click tracking per send.
 * Screenshots: public/email/shorts/ (captured from the live site on 29 Oct 2026, dark theme, 2x, webkit,
 * analytics blocked; phone: the UPI side quest short "Your bank took the money. Then the other bank timed out.", laptop: the Facebook 2021 war story).
 *
 * Facts checked against the live /learn/shorts on 29 Oct 2026: SHORTS_LIVE shorts, by category as in
 * SHORTS_BY_CATEGORY; speed 0.5x-2x in 0.1 steps, ] or > faster, [ or < slower, \ back to 1x, remembered
 * on the device (ShortSpeed); unseen shorts come first, shuffled (ShortsFeed); "full lecture" opens the
 * lecture at that moment; shorts already on the device play with no network; watching needs no account.
 */
import { firstName, unsubscribeUrl } from "./learn-revamp";

export const SHORTS_LIVE = 486;
export const SHORTS_BY_CATEGORY: [number, string][] = [
  [155, "course"],
  [114, "side quests"],
  [80, "real incidents"],
  [51, "interview problems"],
  [44, "low-level design"],
  [22, "case files"],
  [20, "mock interviews"],
];

export const SHORTS_FEED_KEY = "announce:shorts-2026-10";
export const SHORTS_FEED_SUBJECT = `System design in a minute: ${SHORTS_LIVE} shorts to swipe through`;
export function shortsFeedSubject(name?: string | null): string {
  const first = firstName(name);
  return first ? `${first}, system design in a minute: ${SHORTS_LIVE} shorts` : SHORTS_FEED_SUBJECT;
}
export const SHORTS_FEED_PREHEADER = `${SHORTS_LIVE} one-minute shorts: real outages, UPI, caching, interview problems. Swipe like Reels, speed them up, and open the full lecture at that moment.`;

const SITE = "https://www.himanshukukreja.in";
const L = `${SITE}/learn`;
export const SHORTS_FEED_LINKS = {
  shorts: `${L}/shorts`,
  upi: `${L}/shorts?v=shorts--bonus-01-indian-upi-system--deemed-success`,
  incidents: `${L}/shorts?cat=stories`,
  caching: `${L}/shorts?topic=caching`,
  problems: `${L}/shorts?cat=problems`,
  facebook: `${L}/shorts?v=shorts--war-stories--facebook-bgp-six-hours--locked-out`,
  lectures: `${L}/prep/lectures`,
};
const IMG_BASE = `${SITE}/email/shorts`;

export type ShortsFeedInput = { email: string; name?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

/** Screenshot: `w` CSS px in the email; the files are 2x. */
type Shot = { file: string; w: number; h: number; alt: string };
const SHOTS = {
  feed: { file: "feed.jpg", w: 260, h: 563, alt: "A short on a phone, full screen: side quest 1, UPI. Alice pays Bob 500 rupees, the debit lands, then the credit to Bob's bank times out. Category filters along the top, and upvote, discussion, save, share, sound, speed and full-screen buttons down the side, above the title and a full lecture button." },
  speed: { file: "speed.jpg", w: 340, h: 332, alt: "The speed control on a short: a minus, 1.2x and plus stepper beside the speed button, and 1.2x flashed over the video." },
  laptop: { file: "laptop.jpg", w: 528, h: 417, alt: "The shorts feed on a laptop: category and topic filters (reliability, scaling, incidents, consistency, databases, caching and more) above a centred vertical short, a war story: 4 October 2021, routine maintenance, then every link down. Beside it the title, One command took Facebook off the internet, and locked its engineers out, with full lecture, read it, upvote, discuss, share and save." },
} satisfies Record<string, Shot>;

const b = (s: string) => `<strong style="color:${C.ink};">${s}</strong>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.signalText};text-decoration:underline;">${label}</a>`;
const kbd = (k: string) => `<span style="font-family:${F_MONO};font-size:13px;border:1px solid ${C.line};padding:1px 6px;color:${C.ink};">${k}</span>`;

type Link = { href: string; label: string };
type Block = { tag: string; title: string; html: string; text: string; shot: Shot; links: Link[] };

const BLOCKS: Block[] = [
  {
    tag: "phone · swipe up",
    title: "Swipe through them like Reels",
    html: `Open ${b("Shorts")} on your phone and it goes full screen. Swipe up for the next one. Pick a category along the top (course, side quests, real incidents, interview problems and more), or a topic like caching or databases. A few seconds in, the buttons fade away and only the short is left. Tap to bring them back. Shorts you haven't seen come first, so it's a fresh feed every time.`,
    text: "Open Shorts on your phone and it goes full screen. Swipe up for the next one. Pick a category along the top (course, side quests, real incidents, interview problems and more), or a topic like caching or databases. A few seconds in, the buttons fade away and only the short is left. Tap to bring them back. Shorts you haven't seen come first, so it's a fresh feed every time.",
    shot: SHOTS.feed,
    links: [
      { href: SHORTS_FEED_LINKS.upi, label: "Watch the UPI timeout short" },
      { href: SHORTS_FEED_LINKS.incidents, label: "real outages only" },
    ],
  },
  {
    tag: "speed · 0.5× to 2×",
    title: "Your speed, one step at a time",
    html: `Tap the ${b("1.0×")} button and step it up or down by 0.1: 0.9×, 1.1×, 1.3×, anywhere from 0.5× to 2×. On a laptop it's one key: ${kbd("]")} faster, ${kbd("[")} slower, ${kbd("\\")} back to normal. The voice keeps its pitch, and every short after it plays at your speed until you change it.`,
    text: "Tap the 1.0× button and step it up or down by 0.1: 0.9×, 1.1×, 1.3×, anywhere from 0.5× to 2×. On a laptop it's one key: ] faster, [ slower, \\ back to normal. The voice keeps its pitch, and every short after it plays at your speed until you change it.",
    shot: SHOTS.speed,
    links: [{ href: SHORTS_FEED_LINKS.shorts, label: "Try it on any short" }],
  },
  {
    tag: "laptop · and the full lecture",
    title: "One idea in a minute, then the whole story",
    html: `Each short is one idea from a lecture: the hook, the twist, the fix. When one makes you curious, press ${b("full lecture")} and it opens ${b("at that exact moment")}, or ${b("read it")} for the written lesson. On a laptop the short sits in the middle with everything beside it; scroll for the next one.`,
    text: "Each short is one idea from a lecture: the hook, the twist, the fix. When one makes you curious, press full lecture and it opens at that exact moment, or read it for the written lesson. On a laptop the short sits in the middle with everything beside it; scroll for the next one.",
    shot: SHOTS.laptop,
    links: [
      { href: SHORTS_FEED_LINKS.facebook, label: "Watch the Facebook outage short" },
      { href: SHORTS_FEED_LINKS.caching, label: "caching shorts" },
      { href: SHORTS_FEED_LINKS.problems, label: "interview problem shorts" },
    ],
  },
];

const ALSO = [
  {
    title: "Ask under a short.",
    html: "Every short has its own discussion. It opens beside the short, so it keeps playing while you read.",
    text: "Every short has its own discussion. It opens beside the short, so it keeps playing while you read.",
  },
  {
    title: "Save it for later.",
    html: "Signed in, Save puts a short in your notebook, next to your notes and highlights.",
    text: "Signed in, Save puts a short in your notebook, next to your notes and highlights.",
  },
  {
    title: "Share one.",
    html: "Share sends a link that opens straight at that short. No account needed to watch.",
    text: "Share sends a link that opens straight at that short. No account needed to watch.",
  },
  {
    title: "On the metro, with no signal.",
    html: "Shorts already on your phone still play without a network.",
    text: "Shorts already on your phone still play without a network.",
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

const INTRO = `Some days you don't have 40 minutes for a lecture. You have one minute in a queue. So the course now has ${SHORTS_LIVE} shorts: one idea each, animated and narrated, cut from the lectures. Why a UPI payment can leave your money in limbo, how one bad config took a whole site down, why a cache can make things worse.`;

/** the counts strip: "155 course · 114 side quests · …" */
const countsHtml = () =>
  SHORTS_BY_CATEGORY.map(
    ([n, label]) =>
      `<td style="padding:10px 12px;border:1px solid #2A2A2E;vertical-align:top;"><div style="font-family:${F_DISPLAY};font-weight:800;font-size:22px;line-height:1;color:#F3F2EE;">${n}</div><div style="margin-top:4px;font-family:${F_MONO};font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:#A3A3A8;">${esc(label)}</div></td>`,
  );

export function shortsFeedHtml({ email, name }: ShortsFeedInput): string {
  const hi = firstName(name);
  const unsub = unsubscribeUrl(email);
  const cells = countsHtml();
  // two rows (4 + 3) so it fits a phone without shrinking the numbers
  const rows = [cells.slice(0, 4), cells.slice(4)].map((r) => `<tr>${r.join("")}</tr>`).join("");
  const also = ALSO.map((t) => `<li style="margin:0 0 8px 0;">${b(esc(t.title))} ${t.html}</li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(SHORTS_FEED_SUBJECT)}</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(SHORTS_FEED_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <!-- top bar -->
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu</td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">new · shorts</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>
        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · shorts</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">System design, one minute at a time<span style="color:${C.signal};">.</span></h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${esc(INTRO)}</p>
          </td>
        </tr>
        <!-- counts -->
        <tr>
          <td class="pad" style="padding:20px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr><td style="padding:16px 16px 6px 16px;font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};">${SHORTS_LIVE} shorts · free to watch, no sign-in</td></tr>
              <tr><td style="padding:0 16px 16px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table></td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad btn" style="padding:22px 36px 32px 36px;">
            ${button(SHORTS_FEED_LINKS.shorts, "Open the shorts →")}
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
            ${button(SHORTS_FEED_LINKS.shorts, "Watch one now →")}
          </td>
        </tr>
        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:18px 36px 34px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">Watch three on your next break and tell me which one stuck. Just reply to this email. I read every reply, and it decides which shorts I make next.</p>
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

export function shortsFeedText({ email, name }: ShortsFeedInput): string {
  const hi = firstName(name);
  return [
    hi ? `Hi ${hi},` : "Hi there,",
    "",
    INTRO,
    "",
    `${SHORTS_LIVE} shorts, free to watch, no sign-in: ${SHORTS_BY_CATEGORY.map(([n, l]) => `${n} ${l}`).join(" · ")}.`,
    `Open the shorts: ${SHORTS_FEED_LINKS.shorts}`,
    "",
    ...BLOCKS.flatMap((x) => [x.title.toUpperCase(), x.text, ...x.links.map((l, i) => `${i ? "Or " + l.label : l.label}: ${l.href}`), ""]),
    "ALSO",
    ...ALSO.map((t) => `- ${t.title} ${t.text}`),
    "",
    `Watch one now: ${SHORTS_FEED_LINKS.shorts}`,
    "",
    "Watch three on your next break and tell me which one stuck. Just reply to this email. I read every reply, and it decides which shorts I make next.",
    "",
    "Himanshu",
    "himanshukukreja.in",
    "",
    "--",
    `You're getting this course update because you signed up at himanshukukreja.in/learn with ${email}.`,
    `Unsubscribe: ${unsubscribeUrl(email)}`,
  ].join("\n");
}

export function shortsFeedEmail(input: ShortsFeedInput) {
  return { subject: shortsFeedSubject(input.name), html: shortsFeedHtml(input), text: shortsFeedText(input) };
}
