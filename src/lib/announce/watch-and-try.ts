/**
 * "What's new: watch it, try it" announcement (late October 2026): whole-article animated
 * explainers with narration in every lesson, side quest and case file; "break it" slider labs; the
 * interview problem bank; the low-level design track (Splitwise via Chukta); company prep tracks;
 * concepts A–Z; peer mock interviews; streak reminders; PDF and Anki exports. HTML (table layout,
 * inline styles, 600px, phone-safe) + plain-text twin. Pure function, no I/O:
 * src/lib/campaigns/templates.ts turns it into the "watch-and-try" campaign template.
 *
 * Links are plain (no UTM): the campaign engine adds utm_* and click tracking per send.
 * Screenshots: public/email/whats-new-oct-2/ (captured from the live site at 528 CSS px, 2x, dark
 * theme, analytics blocked), referenced by absolute URL.
 *
 * Facts checked against the live site on 25 Oct 2026: 107 whole-article explainers (76 lessons,
 * 15 side quests, 16 case files), 10 break-it labs, /learn/system-design-mastery problem bank (20)
 * and low-level design (8), /learn/tracks (6 companies), /learn/concepts (213), /learn/mock/peers,
 * reminders on /learn/dashboard, /learn/cheatsheet/all and /learn/revise/anki.txt.
 */
import { firstName, unsubscribeUrl } from "./learn-revamp";

export const WATCH_TRY_KEY = "announce:watch-and-try-2026-10";
export const WATCH_TRY_SUBJECT = "Every lesson now explains itself, out loud";
export function watchTrySubject(name?: string | null): string {
  const first = firstName(name);
  return first ? `${first}, every lesson now explains itself` : WATCH_TRY_SUBJECT;
}
export const WATCH_TRY_PREHEADER =
  "A narrated animated walkthrough in every lesson, sliders you drag to break a system, 20 classic interview problems, a low-level design track and peer mock interviews.";

const SITE = "https://www.himanshukukreja.in";
const L = `${SITE}/learn`;
const C_ = `${L}/system-design-mastery`;
export const WATCH_TRY_LINKS = {
  hub: C_,
  explainer: `${C_}/week-04-caching/day-03-thundering-herd`,
  lab: `${C_}/week-04-caching/day-03-thundering-herd`,
  labTtl: `${C_}/week-04-caching/day-01-caching-patterns`,
  problems: `${C_}#problems-h`,
  problemChat: `${C_}/problem-bank/problem-08-chat-system`,
  lld: `${C_}#lld-h`,
  splitwise: `${C_}/low-level-design/lld-06-splitwise`,
  tracks: `${L}/tracks`,
  razorpay: `${L}/tracks/razorpay`,
  concepts: `${L}/concepts`,
  peers: `${L}/mock/peers`,
  dashboard: `${L}/dashboard`,
  pdf: `${L}/cheatsheet/all`,
  revise: `${L}/revise`,
  stories: `${SITE}/stories`,
};
const IMG_BASE = `${SITE}/email/whats-new-oct-2`;

export type WatchTryInput = { email: string; name?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

/** Screenshot: 528 CSS px wide (the card's content width), 1056 px files. */
type Shot = { file: string; w: number; h: number; alt: string };
const SHOTS = {
  explainer: { file: "explainer-overview.jpg", w: 528, h: 544, alt: "The whole-lesson explainer for Thundering Herd: tabs The herd, Protections, Choose + edges; the five things that trigger a herd; Play and Narrate buttons and the caption." },
  lab: { file: "lab-thundering-herd.jpg", w: 528, h: 720, alt: "Break it: the thundering herd lab. One hot key at 5,000 requests a second expires: peak database load 5,100/s, 5.1× its capacity. Sliders for keys expiring together, traffic and TTL jitter." },
  problems: { file: "problem-bank.jpg", w: 496, h: 640, alt: "The interview problem bank on the course map: Design a URL Shortener, a Rate Limiter, a Distributed Key-Value Store, a Unique ID Generator, a Web Crawler, a Notification System, a News Feed and a Chat System." },
  lld: { file: "lld-splitwise.jpg", w: 528, h: 580, alt: "The whole-design explainer for the bill-splitting (Splitwise) problem: members, the split service and strategy, money in integer paise, and a ₹100 split three ways that must still add up." },
  track: { file: "company-track.jpg", w: 528, h: 700, alt: "The Razorpay prep track: what Razorpay builds, the focus (idempotency, webhooks, sagas, consistency, audit) and the first stops: Idempotency in Practice, Webhook Delivery System, Timeout Hell, Distributed Transactions." },
  peers: { file: "peer-mocks.jpg", w: 528, h: 620, alt: "Peer mock interviews: pick a time and a mock interview; when another learner pairs up you both get an email with a free video room, and the interviewer runs it from the mock's page." },
  concept: { file: "concept-page.jpg", w: 528, h: 640, alt: "The concept page for Idempotency: a one-line definition, the two-minute refresher and where the course teaches it." },
} satisfies Record<string, Shot>;

const b = (s: string) => `<strong style="color:${C.ink};">${s}</strong>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.signalText};text-decoration:underline;">${label}</a>`;

type Link = { href: string; label: string };
type Block = { tag: string; title: string; html: string; text: string; shot: Shot; links: Link[] };

const BLOCKS: Block[] = [
  {
    tag: "practice · break it",
    title: "Drag a slider, watch it break",
    html: `Ten lessons now have a ${b("lab with sliders")}: change a cache TTL, the traffic, the retries or the replica lag and watch the numbers react. Make one hot key expire at 5,000 requests a second and the database takes 5.1× its capacity; switch on single flight and it drops to about 101. Each lab starts from the lesson's own example.`,
    text: "Ten lessons now have a lab with sliders: change a cache TTL, the traffic, the retries or the replica lag and watch the numbers react. Make one hot key expire at 5,000 requests a second and the database takes 5.1x its capacity; switch on single flight and it drops to about 101. Each lab starts from the lesson's own example.",
    shot: SHOTS.lab,
    links: [
      { href: WATCH_TRY_LINKS.lab, label: "Break the thundering herd" },
      { href: WATCH_TRY_LINKS.labTtl, label: "the cache TTL lab" },
    ],
  },
  {
    tag: "new · interview problem bank",
    title: "The 20 questions everyone gets asked",
    html: `URL shortener, rate limiter, key-value store, chat, news feed, typeahead, payments and 13 more, each a ${b("15-minute walkthrough")}: requirements, the estimate, the API, the design, the two deep dives interviewers push on, and a quiz. Every one links into the full lessons and has its own animated walkthrough.`,
    text: "URL shortener, rate limiter, key-value store, chat, news feed, typeahead, payments and 13 more, each a 15-minute walkthrough: requirements, the estimate, the API, the design, the two deep dives interviewers push on, and a quiz. Every one links into the full lessons and has its own animated walkthrough.",
    shot: SHOTS.problems,
    links: [
      { href: WATCH_TRY_LINKS.problems, label: "Open the problem bank" },
      { href: WATCH_TRY_LINKS.problemChat, label: "start with Design a Chat System" },
    ],
  },
  {
    tag: "new · low-level design",
    title: "A machine-coding track",
    html: `Many product companies in India run a machine-coding round: classes, interfaces and working code in 90 minutes. ${b("Eight problems")} now cover it, from a parking lot and an LRU cache to an elevator, a ticket booking system and a vending machine, each with a class diagram, the patterns and why, the concurrency traps and runnable Python. The bill-splitting one is built around ${a("https://getchukta.in", "Chukta")}, the app I'm building.`,
    text: "Many product companies in India run a machine-coding round: classes, interfaces and working code in 90 minutes. Eight problems now cover it, from a parking lot and an LRU cache to an elevator, a ticket booking system and a vending machine, each with a class diagram, the patterns and why, the concurrency traps and runnable Python. The bill-splitting one is built around Chukta (getchukta.in), the app I'm building.",
    shot: SHOTS.lld,
    links: [
      { href: WATCH_TRY_LINKS.splitwise, label: "Design a bill-splitting app" },
      { href: WATCH_TRY_LINKS.lld, label: "all eight" },
    ],
  },
  {
    tag: "new · company prep tracks",
    title: "Prepping for a specific company?",
    html: `Six ordered paths through the course for ${b("Flipkart, Razorpay, Swiggy, Zerodha, PhonePe and Amazon India")}, built around what each company builds: payments and webhooks for Razorpay, dispatch and maps for Swiggy, the 9:15 market open for Zerodha. They're the topics those systems force you to know, not leaked questions.`,
    text: "Six ordered paths through the course for Flipkart, Razorpay, Swiggy, Zerodha, PhonePe and Amazon India, built around what each company builds: payments and webhooks for Razorpay, dispatch and maps for Swiggy, the 9:15 market open for Zerodha. They're the topics those systems force you to know, not leaked questions.",
    shot: SHOTS.track,
    links: [
      { href: WATCH_TRY_LINKS.tracks, label: "Pick your company" },
      { href: WATCH_TRY_LINKS.razorpay, label: "the Razorpay track" },
    ],
  },
  {
    tag: "new · peer mock interviews",
    title: "Practise with a real person",
    html: `Post a time and one of the course's mock interviews, or pair up with someone who has. You both get an email with ${b("a free video room")}, and the interviewer runs it from the mock's page with its curveballs and levelled rubric. Then you swap. Your name and email go to your partner only.`,
    text: "Post a time and one of the course's mock interviews, or pair up with someone who has. You both get an email with a free video room, and the interviewer runs it from the mock's page with its curveballs and levelled rubric. Then you swap. Your name and email go to your partner only.",
    shot: SHOTS.peers,
    links: [{ href: WATCH_TRY_LINKS.peers, label: "Post or join a slot" }],
  },
  {
    tag: "new · concepts a–z",
    title: "Every concept on one page",
    html: `${b("213 concepts")}, from consistent hashing to fencing tokens, each with a one-line definition, a two-minute refresher, where the course teaches it and what it's related to. Handy for the "wait, what was that again?" moments.`,
    text: "213 concepts, from consistent hashing to fencing tokens, each with a one-line definition, a two-minute refresher, where the course teaches it and what it's related to. Handy for the \"wait, what was that again?\" moments.",
    shot: SHOTS.concept,
    links: [{ href: WATCH_TRY_LINKS.concepts, label: "Browse the concepts" }],
  },
];

const OVERVIEW = [
  { tag: "lessons", title: "Every article explains itself", body: "A narrated, animated walkthrough of the whole article in every lesson, side quest and case file: 107 of them." },
  { tag: "practice", title: "Labs you can break", body: "Ten slider labs: drag the traffic, the TTL or the retries and watch the system bend." },
  { tag: "new", title: "Problem bank and machine coding", body: "20 classic interview problems and an 8-problem low-level design track." },
  { tag: "community", title: "Peer mocks and company tracks", body: "Practise live with another learner, or follow a prep path for the company you're targeting." },
];

const ALSO = [
  {
    title: "Streak reminders.",
    html: `Switch them on in ${a(WATCH_TRY_LINKS.dashboard, "Progress")}: one nudge at 7:30 PM on a day you haven't studied yet, by push or email. Never more than one a day.`,
    text: `Switch them on in Progress (${WATCH_TRY_LINKS.dashboard}): one nudge at 7:30 PM on a day you haven't studied yet, by push or email. Never more than one a day.`,
  },
  {
    title: "Take it with you.",
    html: `${a(WATCH_TRY_LINKS.pdf, "Every cheat sheet as one PDF")} for the night before an interview, and every revision card as an Anki deck from ${a(WATCH_TRY_LINKS.revise, "Revise")}.`,
    text: `Every cheat sheet as one PDF for the night before an interview (${WATCH_TRY_LINKS.pdf}), and every revision card as an Anki deck from Revise (${WATCH_TRY_LINKS.revise}).`,
  },
  {
    title: "Checked numbers.",
    html: "Every real-world figure in the side quests and case files was checked against its source and dated, and the architecture diagrams in every week now use real technology icons.",
    text: "Every real-world figure in the side quests and case files was checked against its source and dated, and the architecture diagrams in every week now use real technology icons.",
  },
  {
    title: "A new case file every Monday.",
    html: `Starting with how Hotstar served 25 million people watching one match. ${a(WATCH_TRY_LINKS.stories, "All case files")}.`,
    text: `Starting with how Hotstar served 25 million people watching one match: ${WATCH_TRY_LINKS.stories}`,
  },
];

const START = [
  { lead: "Got two minutes?", html: `Press ${b("Narrate")} on the ${a(WATCH_TRY_LINKS.explainer, "thundering herd walkthrough")}.`, text: `Press Narrate on the thundering herd walkthrough: ${WATCH_TRY_LINKS.explainer}` },
  { lead: "Interview soon?", html: `Do one problem a day from the ${a(WATCH_TRY_LINKS.problems, "problem bank")}.`, text: `Do one problem a day from the problem bank: ${WATCH_TRY_LINKS.problems}` },
  { lead: "Machine-coding round?", html: `Start with the ${a(WATCH_TRY_LINKS.splitwise, "bill-splitting design")}.`, text: `Start with the bill-splitting design: ${WATCH_TRY_LINKS.splitwise}` },
  { lead: "Want feedback?", html: `Book a ${a(WATCH_TRY_LINKS.peers, "peer mock interview")} this week.`, text: `Book a peer mock interview this week: ${WATCH_TRY_LINKS.peers}` },
];

const img = (s: Shot, w = s.w) =>
  `<img src="${IMG_BASE}/${s.file}" width="${w}" height="${Math.round((s.h * w) / s.w)}" alt="${esc(s.alt)}" style="display:block;width:100%;max-width:${w}px;height:auto;border:1px solid ${C.line};">`;
const P = (extra = "") => `margin:0 0 10px 0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};${extra}`;
const TAG = `font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signalText};`;

function blockHtml(x: Block): string {
  const [first, ...rest] = x.links;
  const more = rest.map((l) => ` · or ${a(l.href, esc(l.label))}`).join("");
  return `
        <tr>
          <td class="pad" style="padding:0 36px 34px 36px;">
            <div style="${TAG}margin:0 0 6px 0;">${esc(x.tag)}</div>
            <h3 style="margin:0 0 10px 0;font-family:${F_DISPLAY};font-weight:800;font-size:21px;line-height:1.2;letter-spacing:-0.01em;color:${C.ink};">${esc(x.title)}</h3>
            <p style="${P()}">${x.html}</p>
            <div style="margin:14px 0 12px 0;">${img(x.shot)}</div>
            <p style="margin:0;font-family:${F_MONO};font-size:13px;line-height:1.6;color:${C.ink3};"><a href="${first.href}" style="color:${C.signalText};text-decoration:underline;font-weight:600;">${esc(first.label)} →</a>${more}</p>
          </td>
        </tr>`;
}

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:${C.signal};color:${C.onSignal};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;text-decoration:none;padding:14px 22px;">${esc(label)}</a>`;

export function watchTryHtml({ email, name }: WatchTryInput): string {
  const hi = firstName(name);
  const unsub = unsubscribeUrl(email);
  const overview = OVERVIEW.map(
    (f) => `
              <tr>
                <td style="padding:0 0 16px 0;">
                  <div style="${TAG}margin:0 0 4px 0;">${esc(f.tag)}</div>
                  <div style="font-family:${F_DISPLAY};font-weight:800;font-size:18px;line-height:1.25;letter-spacing:-0.01em;color:${C.ink};margin:0 0 4px 0;">${esc(f.title)}</div>
                  <div style="font-family:${F_BODY};font-size:15px;line-height:1.55;color:${C.ink2};">${esc(f.body)}</div>
                </td>
              </tr>`
  ).join("");
  const also = ALSO.map((t) => `<li style="margin:0 0 8px 0;">${b(esc(t.title))} ${t.html}</li>`).join("");
  const start = START.map(
    (s, i) => `
              <tr>
                <td width="28" valign="top" style="width:28px;padding:0 0 12px 0;"><div style="width:22px;height:22px;line-height:22px;text-align:center;background:${C.signal};font-family:${F_MONO};font-size:12px;font-weight:600;color:${C.onSignal};">${i + 1}</div></td>
                <td valign="top" style="padding:1px 0 12px 8px;font-family:${F_BODY};font-size:15px;line-height:1.55;color:${C.ink2};">${b(esc(s.lead))} ${s.html}</td>
              </tr>`
  ).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(WATCH_TRY_SUBJECT)}</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(WATCH_TRY_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <!-- top bar -->
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu</td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">new · watch it, try it</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>
        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · what's new</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">Watch it. Then break it<span style="color:${C.signal};">.</span></h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">Reading about a thundering herd is one thing; watching one take a database down, and then causing one yourself, is how it sticks. So this round is about seeing and doing: every article now has an animated walkthrough you can play with narration, and the trickiest lessons have labs you can break. Plus 28 new problems to practise on.</p>
          </td>
        </tr>
        <!-- overview -->
        <tr>
          <td class="pad" style="padding:24px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${overview}
            </table>
          </td>
        </tr>
        <!-- CTA -->
        <tr>
          <td class="pad btn" style="padding:8px 36px 30px 36px;">
            ${button(WATCH_TRY_LINKS.explainer, "Watch a lesson explain itself →")}
          </td>
        </tr>
        <!-- featured: whole-article explainers -->
        <tr>
          <td class="pad" style="padding:0 36px 34px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr>
                <td style="padding:20px 22px 0 22px;">
                  <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};margin:0 0 8px 0;">every lesson · every side quest · every case file</div>
                  <div style="font-family:${F_DISPLAY};font-weight:800;font-size:22px;line-height:1.2;letter-spacing:-0.01em;color:#F3F2EE;margin:0 0 14px 0;">The whole article in two minutes, out loud</div>
                  ${img(SHOTS.explainer, 484)}
                </td>
              </tr>
              <tr>
                <td style="padding:16px 22px 20px 22px;font-family:${F_BODY};font-size:14px;line-height:1.6;color:#C9C8C2;">
                  <p style="margin:0 0 10px 0;">At the top of every article there's now an animated walkthrough of the whole thing, in chapters: the problem, how the fix works, where it breaks. 107 of them, one per lesson, side quest and case file.</p>
                  <p style="margin:0 0 10px 0;">Press <strong style="color:#F3F2EE;">Narrate</strong> and it reads each step aloud and moves on by itself, like a short video. It works offline too, so you can watch on a flight.</p>
                  <p style="margin:0;font-family:${F_MONO};font-size:13px;"><a href="${WATCH_TRY_LINKS.explainer}" style="color:${C.signal};text-decoration:underline;font-weight:600;">Play the thundering herd walkthrough →</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- blocks -->
        <tr>
          <td class="pad" style="padding:0 36px 0 36px;">
            <div style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;margin:0 0 26px 0;">&nbsp;</div>
            <div style="${TAG}margin:0 0 6px 0;">the details</div>
            <h2 style="margin:0 0 26px 0;font-family:${F_DISPLAY};font-weight:800;font-size:26px;line-height:1.15;letter-spacing:-0.02em;color:${C.ink};">What's new, one by one</h2>
          </td>
        </tr>
        ${BLOCKS.map(blockHtml).join("")}
        <!-- also -->
        <tr>
          <td class="pad" style="padding:0 36px 30px 36px;">
            <div style="${TAG}margin:0 0 10px 0;">also</div>
            <ul style="margin:0;padding:0 0 0 18px;font-family:${F_BODY};font-size:15px;line-height:1.55;color:${C.ink2};">${also}</ul>
          </td>
        </tr>
        <!-- where to start -->
        <tr>
          <td class="pad" style="padding:0 36px 8px 36px;">
            <div style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;margin:0 0 26px 0;">&nbsp;</div>
            <h2 style="margin:0 0 16px 0;font-family:${F_DISPLAY};font-weight:800;font-size:26px;line-height:1.15;letter-spacing:-0.02em;color:${C.ink};">Where to start</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${start}
            </table>
          </td>
        </tr>
        <!-- CTA again -->
        <tr>
          <td class="pad btn" style="padding:10px 36px 12px 36px;">
            ${button(WATCH_TRY_LINKS.hub, "Open the course →")}
          </td>
        </tr>
        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:18px 36px 34px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">Pick one thing and try it this week. If something breaks or a number looks wrong, just reply to this email. I read every reply.</p>
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

export function watchTryText({ email, name }: WatchTryInput): string {
  const hi = firstName(name);
  const lines = [
    hi ? `Hi ${hi},` : "Hi there,",
    "",
    "Reading about a thundering herd is one thing; watching one take a database down, and then causing one yourself, is how it sticks. So this round is about seeing and doing: every article now has an animated walkthrough you can play with narration, and the trickiest lessons have labs you can break. Plus 28 new problems to practise on.",
    "",
    ...OVERVIEW.map((f) => `- ${f.title}: ${f.body}`),
    "",
    "THE WHOLE ARTICLE IN TWO MINUTES, OUT LOUD",
    "At the top of every article there's now an animated walkthrough of the whole thing, in chapters: the problem, how the fix works, where it breaks. 107 of them, one per lesson, side quest and case file.",
    "Press Narrate and it reads each step aloud and moves on by itself, like a short video. It works offline too, so you can watch on a flight.",
    `Play the thundering herd walkthrough: ${WATCH_TRY_LINKS.explainer}`,
    "",
    "WHAT'S NEW, ONE BY ONE",
    "",
    ...BLOCKS.flatMap((x) => [x.title.toUpperCase(), x.text, ...x.links.map((l, i) => `${i ? "Or " + l.label : l.label}: ${l.href}`), ""]),
    "ALSO",
    ...ALSO.map((t) => `- ${t.title} ${t.text}`),
    "",
    "WHERE TO START",
    ...START.map((s, i) => `${i + 1}. ${s.lead} ${s.text}`),
    "",
    `The course: ${WATCH_TRY_LINKS.hub}`,
    "",
    "Pick one thing and try it this week. If something breaks or a number looks wrong, just reply to this email. I read every reply.",
    "",
    "Himanshu",
    "himanshukukreja.in",
    "",
    "--",
    `You're getting this course update because you signed up at himanshukukreja.in/learn with ${email}.`,
    `Unsubscribe: ${unsubscribeUrl(email)}`,
  ];
  return lines.join("\n");
}

export function watchTryEmail(input: WatchTryInput) {
  return { subject: watchTrySubject(input.name), html: watchTryHtml(input), text: watchTryText(input) };
}
