/**
 * "What's new" announcement (late October 2026): the five tabs (course · prep · arena · stories ·
 * you); Interview prep with company pages (questions candidates reported, with sources) and the
 * question bank; War stories (sourced real stories, war-room incident simulations); six new side
 * quests and a design sheet for every quest; narrated whole-article explainers and break-it labs;
 * peer mocks; reminders, PDF and Anki exports. HTML (table layout, inline styles, 600px, phone-safe) +
 * plain-text twin. Pure function, no I/O: src/lib/campaigns/templates.ts turns it into the
 * "watch-and-try" campaign template.
 *
 * Links are plain (no UTM): the campaign engine adds utm_* and click tracking per send.
 * Screenshots: public/email/whats-new-oct-3/ (captured from the live site at 528 CSS px, 2x, dark
 * theme, analytics blocked), referenced by absolute URL.
 *
 * Facts checked against the content on 25 Oct 2026: 45 company pages, 581 questions, 452 reported
 * with a source (scripts/check-prep.mjs); 20 real stories, 5 war rooms; 21 side quests, 21 design
 * sheets, 141 diagrams (scripts/check-sheets.mjs); 141 whole-article explainers (76 lessons, 21 side
 * quests, 16 case files, 20 problems, 8 low-level design), 10 break-it labs; problem bank 20, LLD 8.
 */
import { firstName, unsubscribeUrl } from "./learn-revamp";

export const WATCH_TRY_KEY = "announce:watch-and-try-2026-10";
export const WATCH_TRY_SUBJECT = "Prep by company, war stories and six new side quests";
export function watchTrySubject(name?: string | null): string {
  const first = firstName(name);
  return first ? `${first}, prep by company, war stories and six new side quests` : WATCH_TRY_SUBJECT;
}
export const WATCH_TRY_PREHEADER =
  "45 company pages with the questions candidates reported, war rooms where you're on call, six new side quests with design sheets, and five tabs that make it all easy to find.";

const SITE = "https://www.himanshukukreja.in";
const L = `${SITE}/learn`;
const C_ = `${L}/system-design-mastery`;
export const WATCH_TRY_LINKS = {
  hub: C_,
  prep: `${L}/prep`,
  companies: `${L}/prep/companies`,
  razorpay: `${L}/prep/companies/razorpay`,
  questions: `${L}/prep/questions`,
  stories: `${L}/war-stories`,
  warRoom: `${L}/war-stories/war-room/one-regex-takes-down-the-edge`,
  discord: `${L}/war-stories/discord-trillions-of-messages`,
  sheets: `${L}/sheets`,
  bookmyshow: `${C_}/bonus-problems/bonus-16-bookmyshow-seat-booking`,
  bookmyshowSheet: `${L}/sheets/bonus-16-bookmyshow-seat-booking`,
  explainer: `${C_}/week-04-caching/day-03-thundering-herd`,
  lab: `${C_}/week-04-caching/day-03-thundering-herd`,
  peers: `${L}/mock/peers`,
  dashboard: `${L}/dashboard`,
  arena: `${L}/arena`,
  concepts: `${L}/concepts`,
  pdf: `${L}/cheatsheet/all`,
  revise: `${L}/revise`,
  caseFiles: `${SITE}/stories`,
};
const IMG_BASE = `${SITE}/email/whats-new-oct-3`;

export type WatchTryInput = { email: string; name?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

/** Screenshot: 528 CSS px wide (the card's content width), 1056 px files. */
type Shot = { file: string; w: number; h: number; alt: string };
const SHOTS = {
  warRoom: { file: "war-room.jpg", w: 496, h: 760, alt: "A war room: the page at 19:15, every region failing, request and CPU charts, the on-call engineer's ack, and the first call: what do you look at first?" },
  company: { file: "company-razorpay.jpg", w: 528, h: 760, alt: "The Razorpay page in Interview prep: what Razorpay builds, the rounds as candidates describe them, and questions reported by candidates with their sources and the lessons that teach them." },
  questions: { file: "question-bank.jpg", w: 528, h: 700, alt: "The question bank: every company's questions merged, most-reported first, with filters for type, company and reported only." },
  stories: { file: "war-stories.jpg", w: 528, h: 760, alt: "War stories: the story of the day and the war rooms, fictional companies modelled on real public postmortems." },
  sheet: { file: "design-sheet.jpg", w: 496, h: 900, alt: "The BookMyShow design sheet's architecture: customers, the CDN, the waiting room, the API gateway, the booking saga, the hold service, payment gateways, the seat store and the seat change stream." },
  lab: { file: "lab-thundering-herd.jpg", w: 528, h: 720, alt: "Break it: the thundering herd lab. One hot key at 5,000 requests a second expires: peak database load 5,100/s, 5.1× its capacity. Sliders for keys expiring together, traffic and TTL jitter." },
  peers: { file: "peer-mocks.jpg", w: 528, h: 620, alt: "Peer mock interviews: pick a time and a mock interview; when another learner pairs up you both get an email with a free video room, and the interviewer runs it from the mock's page." },
} satisfies Record<string, Shot>;

const b = (s: string) => `<strong style="color:${C.ink};">${s}</strong>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.signalText};text-decoration:underline;">${label}</a>`;

type Link = { href: string; label: string };
type Block = { tag: string; title: string; html: string; text: string; shot: Shot; links: Link[] };

const BLOCKS: Block[] = [
  {
    tag: "prep · companies",
    title: "Prepping for a company? Start on its page",
    html: `${b("45 companies")}, from Flipkart, Razorpay and Swiggy to Google, Amazon and Goldman Sachs. Each page has what the company builds, the rounds as candidates describe them, and the questions candidates ${b("reported")} after interviewing there: 452 in all, every one linked to the write-up it came from. Questions that only fit the company's products are labelled as our pick. Every question links the lessons that teach it.`,
    text: "45 companies, from Flipkart, Razorpay and Swiggy to Google, Amazon and Goldman Sachs. Each page has what the company builds, the rounds as candidates describe them, and the questions candidates reported after interviewing there: 452 in all, every one linked to the write-up it came from. Questions that only fit the company's products are labelled as our pick. Every question links the lessons that teach it.",
    shot: SHOTS.company,
    links: [
      { href: WATCH_TRY_LINKS.companies, label: "Find your company" },
      { href: WATCH_TRY_LINKS.razorpay, label: "see Razorpay's page" },
    ],
  },
  {
    tag: "prep · question bank",
    title: "Every question, most-asked first",
    html: `The ${b("question bank")} merges all the company pages into ${b("353 questions")}, the most-reported first (the URL shortener was reported at 16 companies): filter by system design, low-level design or concept, by company, or to reported questions only. Next to it on the Prep tab: the 20 classic problems, the 8 machine-coding rounds, timed mocks, revision decks and cheat sheets.`,
    text: "The question bank merges all the company pages into 353 questions, the most-reported first (the URL shortener was reported at 16 companies): filter by system design, low-level design or concept, by company, or to reported questions only. Next to it on the Prep tab: the 20 classic problems, the 8 machine-coding rounds, timed mocks, revision decks and cheat sheets.",
    shot: SHOTS.questions,
    links: [
      { href: WATCH_TRY_LINKS.questions, label: "Open the question bank" },
      { href: WATCH_TRY_LINKS.prep, label: "the whole Prep tab" },
    ],
  },
  {
    tag: "stories · real ones",
    title: "True stories, two minutes each",
    html: `${b("20 real stories")} from real systems at their limits, written for anyone: Discord moving trillions of messages in nine days, Pokémon GO hitting 50 times its traffic estimate, CoWIN's first registration day, a lightning strike that cost Google a tiny bit of data. Each lists its sources, and a new story of the day comes up every morning.`,
    text: "20 real stories from real systems at their limits, written for anyone: Discord moving trillions of messages in nine days, Pokemon GO hitting 50 times its traffic estimate, CoWIN's first registration day, a lightning strike that cost Google a tiny bit of data. Each lists its sources, and a new story of the day comes up every morning.",
    shot: SHOTS.stories,
    links: [
      { href: WATCH_TRY_LINKS.stories, label: "Read today's story" },
      { href: WATCH_TRY_LINKS.discord, label: "start with Discord" },
    ],
  },
  {
    tag: "course · side quests 16–21",
    title: "Six new side quests, and a sheet for every quest",
    html: `${b("BookMyShow, Swiggy, Razorpay, YouTube, Google Docs and Instagram")} joined the side quests, so there are 21. And every quest now has a ${b("design sheet")}: the numbers, the architecture with real tech icons, sequence, class and state diagrams, the decisions and what breaks, on a few pages you can download as a PDF and revise in ten minutes.`,
    text: "BookMyShow, Swiggy, Razorpay, YouTube, Google Docs and Instagram joined the side quests, so there are 21. And every quest now has a design sheet: the numbers, the architecture with real tech icons, sequence, class and state diagrams, the decisions and what breaks, on a few pages you can download as a PDF and revise in ten minutes.",
    shot: SHOTS.sheet,
    links: [
      { href: WATCH_TRY_LINKS.bookmyshow, label: "Design BookMyShow" },
      { href: WATCH_TRY_LINKS.sheets, label: "all 21 design sheets" },
    ],
  },
  {
    tag: "course · watch it, break it",
    title: "Every article explains itself, out loud",
    html: `${b("141 animated walkthroughs")}, one at the top of every lesson, side quest, case file and problem: press ${b("Narrate")} and it reads each step aloud like a short video. Ten lessons also have a ${b("lab with sliders")}: make one hot key expire at 5,000 requests a second and the database takes 5.1× its capacity; switch on single flight and it drops to about 101.`,
    text: "141 animated walkthroughs, one at the top of every lesson, side quest, case file and problem: press Narrate and it reads each step aloud like a short video. Ten lessons also have a lab with sliders: make one hot key expire at 5,000 requests a second and the database takes 5.1x its capacity; switch on single flight and it drops to about 101.",
    shot: SHOTS.lab,
    links: [{ href: WATCH_TRY_LINKS.lab, label: "Watch it, then break it" }],
  },
  {
    tag: "prep · peer mocks",
    title: "Practise with a real person",
    html: `Post a time and one of the course's mock interviews, or pair up with someone who has. You both get an email with ${b("a free video room")}, and the interviewer runs it from the mock's page with its curveballs and levelled rubric. Then you swap. Your name and email go to your partner only.`,
    text: "Post a time and one of the course's mock interviews, or pair up with someone who has. You both get an email with a free video room, and the interviewer runs it from the mock's page with its curveballs and levelled rubric. Then you swap. Your name and email go to your partner only.",
    shot: SHOTS.peers,
    links: [{ href: WATCH_TRY_LINKS.peers, label: "Post or join a slot" }],
  },
];

const OVERVIEW = [
  { tag: "course · learn it", title: "Lessons, side quests, design sheets", body: "Six new side quests (21 now), a design sheet for each, and a narrated walkthrough in every article." },
  { tag: "prep · get hired", title: "Companies, the question bank, mocks", body: "45 company pages with 452 questions candidates reported, each with its source, plus problems, mocks and revision." },
  { tag: "arena · play", title: "Daily challenge, leagues, games", body: "Now with design of the week, the weekly community challenge." },
  { tag: "stories · see it for real", title: "Real stories and war rooms", body: "20 true stories with sources, and 5 incidents where you're the one on call." },
  { tag: "you · your stuff", title: "Progress, notebook, mastery, certificates", body: "Everything that's yours, under one tab." },
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
    title: "Concepts A–Z.",
    html: `${a(WATCH_TRY_LINKS.concepts, "213 concepts")}, each with its own page: a one-line definition, a two-minute refresher and where the course teaches it.`,
    text: `213 concepts, each with its own page: a one-line definition, a two-minute refresher and where the course teaches it (${WATCH_TRY_LINKS.concepts}).`,
  },
  {
    title: "Checked numbers.",
    html: "Every real-world figure in the side quests and case files was checked against its source and dated.",
    text: "Every real-world figure in the side quests and case files was checked against its source and dated.",
  },
  {
    title: "A new case file every Monday.",
    html: `Starting with how Hotstar served 25 million people watching one match. ${a(WATCH_TRY_LINKS.caseFiles, "All case files")}.`,
    text: `Starting with how Hotstar served 25 million people watching one match: ${WATCH_TRY_LINKS.caseFiles}`,
  },
];

const START = [
  { lead: "Got ten minutes?", html: `Take the page in the ${a(WATCH_TRY_LINKS.warRoom, "first war room")}.`, text: `Take the page in the first war room: ${WATCH_TRY_LINKS.warRoom}` },
  { lead: "Interviewing somewhere?", html: `Open ${a(WATCH_TRY_LINKS.companies, "that company's page")} and work down its reported questions.`, text: `Open that company's page and work down its reported questions: ${WATCH_TRY_LINKS.companies}` },
  { lead: "Revising a design?", html: `Download a ${a(WATCH_TRY_LINKS.sheets, "design sheet")} and go through it in ten minutes.`, text: `Download a design sheet and go through it in ten minutes: ${WATCH_TRY_LINKS.sheets}` },
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
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">new · five tabs</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>
        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · what's new</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">Learn it. Get hired. See it for real<span style="color:${C.signal};">.</span></h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">The course grew a lot this month, so it now has five tabs, each answering one question: course (learn it), prep (get hired), arena (play), stories (see it for real) and you (your progress and notes). The two new ones are the big news: a page for each company you might interview at, and war stories, including war rooms where you are the one on call.</p>
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
            ${button(WATCH_TRY_LINKS.companies, "Find your company →")}
          </td>
        </tr>
        <!-- featured: the war room -->
        <tr>
          <td class="pad" style="padding:0 36px 34px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr>
                <td style="padding:20px 22px 0 22px;">
                  <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};margin:0 0 8px 0;">new · stories · war room</div>
                  <div style="font-family:${F_DISPLAY};font-weight:800;font-size:22px;line-height:1.2;letter-spacing:-0.01em;color:#F3F2EE;margin:0 0 14px 0;">It's 19:15 and every website behind you is down</div>
                  ${img(SHOTS.warRoom, 484)}
                </td>
              </tr>
              <tr>
                <td style="padding:16px 22px 20px 22px;font-family:${F_BODY};font-size:14px;line-height:1.6;color:#C9C8C2;">
                  <p style="margin:0 0 10px 0;">A war room drops you into an incident as the on-call engineer. The channel fills up: the page, the graphs, the logs, the incident commander, the experts, and later the CTO asking what to tell customers. You make the calls; a wrong one costs minutes and users, and someone tells you why.</p>
                  <p style="margin:0 0 10px 0;">Five of them, each modelled on a real public postmortem (Cloudflare 2019, GitLab 2017, AWS S3 2017, Roblox 2021 and the April 2025 UPI outage) and named only at the end, after your postmortem.</p>
                  <p style="margin:0;font-family:${F_MONO};font-size:13px;"><a href="${WATCH_TRY_LINKS.warRoom}" style="color:${C.signal};text-decoration:underline;font-weight:600;">Take the page →</a></p>
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
    "The course grew a lot this month, so it now has five tabs, each answering one question: course (learn it), prep (get hired), arena (play), stories (see it for real) and you (your progress and notes). The two new ones are the big news: a page for each company you might interview at, and war stories, including war rooms where you are the one on call.",
    "",
    ...OVERVIEW.map((f) => `- ${f.tag.toUpperCase()}: ${f.title}. ${f.body}`),
    "",
    "IT'S 19:15 AND EVERY WEBSITE BEHIND YOU IS DOWN",
    "A war room drops you into an incident as the on-call engineer. The channel fills up: the page, the graphs, the logs, the incident commander, the experts, and later the CTO asking what to tell customers. You make the calls; a wrong one costs minutes and users, and someone tells you why.",
    "Five of them, each modelled on a real public postmortem (Cloudflare 2019, GitLab 2017, AWS S3 2017, Roblox 2021 and the April 2025 UPI outage) and named only at the end, after your postmortem.",
    `Take the page: ${WATCH_TRY_LINKS.warRoom}`,
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
