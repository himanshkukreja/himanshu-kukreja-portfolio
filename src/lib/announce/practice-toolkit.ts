/**
 * "What's new: practice toolkit" announcement: the Practice tab (revision decks, cheat sheets, code
 * labs, mock interviews, Design of the week, numbers playground, study planner, concept map, reading
 * trail), trials for weeks 3-10, animated explainers, side quests 12-15 and the accuracy pass. HTML
 * (table layout, inline styles, 600px, phone-safe) + plain-text twin. Pure function, no I/O:
 * src/lib/campaigns/templates.ts turns it into the "practice-toolkit" campaign template, so the admin
 * preview, test sends and the real send all render through here.
 *
 * Links are plain (no UTM): the campaign engine adds utm_* and click tracking per send.
 * Screenshots live in public/email/practice-toolkit/ (captured from the live site at 528 CSS px,
 * 2x, dark theme, analytics blocked; rings added in an HTML compose step) and are referenced by
 * absolute URL, so they load only once that folder is deployed.
 *
 * Facts checked against the live site on 18 Oct 2026: /learn/practice, /learn/revise (66 lessons,
 * 604 cards), /learn/labs (8 labs), /learn/mock (4 loops after W02/W05/W08/W10), /learn/design-week
 * (first challenge "Design a URL shortener for 10B links": opens Mon 19 Oct 09:00 IST, submissions
 * close Sat 24 Oct 09:00 IST, voting closes Mon 26 Oct 09:00 IST), /learn/numbers, /learn/plan
 * (.ics + Google Calendar), /learn/mastery (213 concepts), /learn/reading (218 write-ups, 58
 * companies), week 3-10 trials (150 questions, 6 parts), side quests 12-15.
 * Design of the week dates are time-bound: update DOW below if the challenge changes.
 */
import { firstName, unsubscribeUrl } from "./learn-revamp";

export const PRACTICE_TOOLKIT_KEY = "announce:practice-toolkit-2026-10";
export const PRACTICE_TOOLKIT_SUBJECT = "System Design Mastery now has a Practice tab";
export function practiceToolkitSubject(name?: string | null): string {
  const first = firstName(name);
  return first ? `${first}, the course has a Practice tab now` : PRACTICE_TOOLKIT_SUBJECT;
}
export const PRACTICE_TOOLKIT_PREHEADER =
  "Revision decks for all 66 lessons, 8 Python code labs, 4 timed mock interviews, trials for every week, and the first Design of the week opens Monday.";

const SITE = "https://www.himanshukukreja.in";
const L = `${SITE}/learn`;
export const PRACTICE_LINKS = {
  practice: `${L}/practice`,
  hub: `${L}/system-design-mastery`,
  revise: `${L}/revise`,
  cheatsheet: `${L}/cheatsheet/week-00`,
  labs: `${L}/labs`,
  tokenBucket: `${L}/labs/token-bucket`,
  mock: `${L}/mock`,
  designWeek: `${L}/design-week/url-shortener-10b-links`,
  numbers: `${L}/numbers`,
  plan: `${L}/plan`,
  mastery: `${L}/mastery`,
  reading: `${L}/reading`,
  trial: `${L}/system-design-mastery/week-03-messaging-and-async-processing/week-03-mcq-assessment`,
  explainer: `${L}/system-design-mastery/week-02-failure-first-design/day-03-circuit-breakers`,
  blinkit: `${L}/system-design-mastery/bonus-problems/bonus-12-blinkit-quick-commerce`,
  offline: `${L}/offline`,
};
const IMG_BASE = `${SITE}/email/practice-toolkit`;

/** The first Design of the week (as scheduled on the live site). */
const DOW = {
  title: "Design a URL shortener for 10B links",
  opens: "Monday 19 Oct, 09:00 IST",
  submit: "Saturday 24 Oct, 09:00 IST",
  vote: "Monday 26 Oct, 09:00 IST",
};

export type PracticeToolkitInput = { email: string; name?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

/** Screenshot: 528 CSS px wide (the card's content width), 1056 px files. */
type Shot = { file: string; w: number; h: number; alt: string };
const SHOTS = {
  revise: { file: "revision-deck.jpg", w: 528, h: 600, alt: "A revision card for Week 1, Day 1 (Partitioning Deep-Dive): Key idea, Partitioning is how you scale writes. Again and Got it buttons below, with Again highlighted." },
  lab: { file: "code-lab.jpg", w: 528, h: 659, alt: "The Token bucket rate limiter code lab: Easy, about 25 minutes, 4 example + 9 hidden tests, +60 XP, and the Python editor with the TokenBucketLimiter class." },
  mock: { file: "mock-interview.jpg", w: 528, h: 734, alt: "Mock interview 01, Billbolt (bill payments and AutoPay): the interviewer Ananya Rao, and the round, 45 minutes in 7 phases with 3 curveballs and 43 rubric signals." },
  trial: { file: "trials.jpg", w: 528, h: 442, alt: "The Week 3 trials page: 150 questions in 6 parts of about 25, 80% pass mark per part, +100 XP per first pass." },
  explainer: { file: "explainer-circuit-breaker.jpg", w: 528, h: 478, alt: "The animated circuit breaker explainer in a lesson, step 4 of 7: the breaker is OPEN and calls fail fast in about 10 ms while the bank API recovers." },
  blinkit: { file: "side-quest-blinkit.jpg", w: 528, h: 573, alt: "Side quest 12, Blinkit Quick Commerce: the mission brief Design 10-minute grocery delivery, a quest log of 7 stages and 8 checkpoints, and Start the quest." },
  numbers: { file: "numbers-playground.jpg", w: 528, h: 521, alt: "The numbers playground: typing 50k QPS × 2 KB × 30 days gives 259.2 TB, with the bandwidth (100 MB/s = 800 Mbps) and the lesson it comes from." },
  reading: { file: "reading-trail.jpg", w: 528, h: 524, alt: "The reading trail: 218 write-ups from 58 companies, and a card for Design Docs at Google with what it is, the key idea, why it's here and the lesson it belongs to." },
  designWeek: { file: "design-of-the-week.jpg", w: 528, h: 246, alt: "Design of the week: Opens soon, Mon 19 Oct 09:00 IST to Mon 26 Oct 09:00 IST. Design a URL shortener for 10B links." },
} satisfies Record<string, Shot>;

const b = (s: string) => `<strong style="color:${C.ink};">${s}</strong>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.signalText};text-decoration:underline;">${label}</a>`;

type Link = { href: string; label: string };
type Block = { tag: string; title: string; html: string; text: string; shot: Shot; links: Link[] };

const BLOCKS: Block[] = [
  {
    tag: "practice · interview night",
    title: "Revise a whole world in 30 minutes",
    html: `Every lesson now has a deck of five-minute swipeable cards: the key ideas, the numbers to remember, a trade-off table, the classic mistakes and what to say when asked. That's ${b("604 cards across all 66 lessons")}. Mark a card ${b("Again")} and it comes back in your Daily standup review. Each world also has a ${b("one-page cheat sheet")} you can print or save as a PDF.`,
    text: "Every lesson now has a deck of five-minute swipeable cards: the key ideas, the numbers to remember, a trade-off table, the classic mistakes and what to say when asked. That's 604 cards across all 66 lessons. Mark a card Again and it comes back in your Daily standup review. Each world also has a one-page cheat sheet you can print or save as a PDF.",
    shot: SHOTS.revise,
    links: [
      { href: PRACTICE_LINKS.revise, label: "Open the revision decks" },
      { href: PRACTICE_LINKS.cheatsheet, label: "a cheat sheet" },
    ],
  },
  {
    tag: "practice · code labs",
    title: "Build the component, not just the box",
    html: `More interviews now have an “implement this” round, so there are ${b("8 Python labs")} taken straight from the lessons: token bucket, sliding window counter, consistent hashing ring, idempotency-key store, circuit breaker, retry with backoff and jitter, transactional outbox relay and an LRU cache. You write the code in the browser (nothing to install) and run it against example and hidden tests. Save a lab offline and it runs with no internet.`,
    text: "More interviews now have an \"implement this\" round, so there are 8 Python labs taken straight from the lessons: token bucket, sliding window counter, consistent hashing ring, idempotency-key store, circuit breaker, retry with backoff and jitter, transactional outbox relay and an LRU cache. You write the code in the browser (nothing to install) and run it against example and hidden tests. Save a lab offline and it runs with no internet.",
    shot: SHOTS.lab,
    links: [{ href: PRACTICE_LINKS.labs, label: "See all 8 code labs" }],
  },
  {
    tag: "practice · mock interviews",
    title: "Four timed mock interviews",
    html: `One sits after worlds 2, 5, 8 and 10. Each is an unseen problem from a fictional company and a named interviewer who keeps time and throws ${b("three curveballs")}. The debrief gives you the model answer, a levelled rubric and a ${b("hire / no-hire verdict")}.`,
    text: "One sits after worlds 2, 5, 8 and 10. Each is an unseen problem from a fictional company and a named interviewer who keeps time and throws three curveballs. The debrief gives you the model answer, a levelled rubric and a hire / no-hire verdict.",
    shot: SHOTS.mock,
    links: [{ href: PRACTICE_LINKS.mock, label: "Pick a mock interview" }],
  },
  {
    tag: "trials · every week",
    title: "Trials for weeks 3 to 10",
    html: `Every world now ends with a trial. Weeks 3 to 10 each have ${b("150 questions in six parts")}, one per lesson plus the boss. Pass a part with 80% to clear it, and anything you miss goes to your review queue.`,
    text: "Every world now ends with a trial. Weeks 3 to 10 each have 150 questions in six parts, one per lesson plus the boss. Pass a part with 80% to clear it, and anything you miss goes to your review queue.",
    shot: SHOTS.trial,
    links: [{ href: PRACTICE_LINKS.trial, label: "See the Week 3 trial" }],
  },
  {
    tag: "lessons · explainers",
    title: "Watch the idea happen",
    html: `Every core lesson now has an ${b("animated explainer")}: a circuit breaker tripping, a hash ring gaining a node, a cache stampede. They play when you scroll to them, and you can pause, step through or change the speed. Key diagrams have a ${b("▶ Steps")} button that lights up one hop at a time, and architecture diagrams now show icons for the real technologies.`,
    text: "Every core lesson now has an animated explainer: a circuit breaker tripping, a hash ring gaining a node, a cache stampede. They play when you scroll to them, and you can pause, step through or change the speed. Key diagrams have a \"Steps\" button that lights up one hop at a time, and architecture diagrams now show icons for the real technologies.",
    shot: SHOTS.explainer,
    links: [{ href: PRACTICE_LINKS.explainer, label: "Try the circuit breaker explainer" }],
  },
  {
    tag: "side quests · 4 new",
    title: "Blinkit, Zerodha Kite, ChatGPT and Figma",
    html: `Four new real systems to design: groceries from a dark store to the door in about ten minutes, a trading platform that survives the 9:15 market open, serving an LLM to hundreds of millions of people, and real-time multiplayer editing. And every side quest is now a ${b("mission")}: a mission brief, “your turn” checkpoints along the way and a final challenge at the end.`,
    text: "Four new real systems to design: groceries from a dark store to the door in about ten minutes, a trading platform that survives the 9:15 market open, serving an LLM to hundreds of millions of people, and real-time multiplayer editing. And every side quest is now a mission: a mission brief, \"your turn\" checkpoints along the way and a final challenge at the end.",
    shot: SHOTS.blinkit,
    links: [{ href: PRACTICE_LINKS.blinkit, label: "Start the Blinkit quest" }],
  },
  {
    tag: "tools · numbers + planner",
    title: "Get the numbers and the schedule right",
    html: `The ${b("numbers playground")} takes an estimate the way you'd say it in an interview (“50k QPS × 2 KB × 30 days”) and gives the worked answer, next to the latency and size tables the course teaches. The ${b("study planner")} builds a day-by-day plan to your interview date with revision days at the end, adjusts when you fall behind, and adds it to Google Calendar or any calendar app.`,
    text: "The numbers playground takes an estimate the way you'd say it in an interview (\"50k QPS × 2 KB × 30 days\") and gives the worked answer, next to the latency and size tables the course teaches. The study planner builds a day-by-day plan to your interview date with revision days at the end, adjusts when you fall behind, and adds it to Google Calendar or any calendar app.",
    shot: SHOTS.numbers,
    links: [
      { href: PRACTICE_LINKS.numbers, label: "Open the numbers playground" },
      { href: PRACTICE_LINKS.plan, label: "plan to your interview" },
    ],
  },
  {
    tag: "tools · concepts + reading",
    title: "See what you know, then read the originals",
    html: `The ${b("concept map")} colours 213 concepts by your quick checks, trials and review cards, with a two-minute refresher for the shaky ones, and dotted terms in lessons now open a one-line definition. The ${b("reading trail")} links 218 engineering posts, papers and postmortems from 58 companies (Uber, Netflix, Razorpay, Zerodha, PhonePe, Dream11, Google, Amazon and more) to the lessons they belong to, each with three lines on why it's worth your time.`,
    text: "The concept map colours 213 concepts by your quick checks, trials and review cards, with a two-minute refresher for the shaky ones, and dotted terms in lessons now open a one-line definition. The reading trail links 218 engineering posts, papers and postmortems from 58 companies (Uber, Netflix, Razorpay, Zerodha, PhonePe, Dream11, Google, Amazon and more) to the lessons they belong to, each with three lines on why it's worth your time.",
    shot: SHOTS.reading,
    links: [
      { href: PRACTICE_LINKS.reading, label: "Browse the reading trail" },
      { href: PRACTICE_LINKS.mastery, label: "your concept map" },
    ],
  },
];

const OVERVIEW = [
  { tag: "practice", title: "A new Practice tab", body: "Revision decks, cheat sheets, code labs, mock interviews, Design of the week, a numbers playground, a study planner, a concept map and a reading trail, on one page." },
  { tag: "trials", title: "Trials for every week", body: "Weeks 3 to 10 now have trials too: 150 questions each, in six parts." },
  { tag: "lessons", title: "Lessons that move", body: "An animated explainer in every core lesson, step-through diagrams, and icons in the architecture diagrams." },
  { tag: "side quests", title: "Four new side quests", body: "Blinkit, Zerodha Kite, ChatGPT and Figma. Every side quest is now a mission." },
];

const ALSO = [
  {
    title: "Another accuracy pass.",
    html: "Dozens more fixes across weeks 0 to 10: numbers in Week 0, inconsistencies in Weeks 7 to 10, and trial options that gave the answer away.",
    text: "Dozens more fixes across weeks 0 to 10: numbers in Week 0, inconsistencies in Weeks 7 to 10, and trial options that gave the answer away.",
  },
  {
    title: "Works offline.",
    html: `The practice tools save offline like the lessons do. Everything you've saved is in your ${a(PRACTICE_LINKS.offline, "offline library")}.`,
    text: `The practice tools save offline like the lessons do. Everything you've saved is in your offline library: ${PRACTICE_LINKS.offline}`,
  },
];

const START = [
  { lead: "In the middle of the course?", html: `Take the ${a(PRACTICE_LINKS.hub, "trial for the week you're on")}.`, text: `Take the trial for the week you're on: ${PRACTICE_LINKS.hub}` },
  { lead: "Got 25 minutes?", html: `Do the ${a(PRACTICE_LINKS.tokenBucket, "token bucket lab")}. It's the easiest one.`, text: `Do the token bucket lab. It's the easiest one: ${PRACTICE_LINKS.tokenBucket}` },
  { lead: "Want a story?", html: `Play the ${a(PRACTICE_LINKS.blinkit, "Blinkit side quest")}.`, text: `Play the Blinkit side quest: ${PRACTICE_LINKS.blinkit}` },
  { lead: "Interview coming up?", html: `Make a ${a(PRACTICE_LINKS.plan, "study plan")} and revise with the decks the night before.`, text: `Make a study plan and revise with the decks the night before: ${PRACTICE_LINKS.plan}` },
];

const img = (s: Shot, w = s.w) =>
  `<img src="${IMG_BASE}/${s.file}" width="${w}" height="${Math.round((s.h * w) / s.w)}" alt="${esc(s.alt)}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;outline:none;text-decoration:none;">`;

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
  `<a href="${href}" style="display:inline-block;background:${C.signal};color:${C.onSignal};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;text-decoration:none;padding:14px 22px;border:1px solid ${C.signal};">${label}</a>`;

export function practiceToolkitHtml({ email, name }: PracticeToolkitInput): string {
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
<title>${esc(PRACTICE_TOOLKIT_SUBJECT)}</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(PRACTICE_TOOLKIT_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <!-- top bar -->
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu<span style="display:inline-block;width:8px;height:15px;background:${C.signal};margin-left:4px;vertical-align:-2px;">&nbsp;</span></td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">new · practice toolkit</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>

        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · free course</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">Read it. Now practise it.</h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">The lessons teach system design. An interview checks whether you can use it with a clock running. For the last few weeks I've been building the part in between, and it's all live now. Here's what's new, and where I'd start.</p>
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
            ${button(PRACTICE_LINKS.practice, "Open Practice →")}
          </td>
        </tr>

        <!-- design of the week -->
        <tr>
          <td class="pad" style="padding:0 36px 34px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr>
                <td style="padding:20px 22px 0 22px;">
                  <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};margin:0 0 8px 0;">design of the week · starts monday</div>
                  <div style="font-family:${F_DISPLAY};font-weight:800;font-size:22px;line-height:1.2;letter-spacing:-0.01em;color:#F3F2EE;margin:0 0 14px 0;">The first challenge opens ${esc(DOW.opens)}</div>
                  ${img(SHOTS.designWeek, 484)}
                </td>
              </tr>
              <tr>
                <td style="padding:16px 22px 20px 22px;font-family:${F_BODY};font-size:14px;line-height:1.6;color:#C9C8C2;">
                  <p style="margin:0 0 10px 0;">Every Monday there's one open system design problem. The first: ${esc(DOW.title.replace(/^Design a /, "a "))}, with redirects in single-digit milliseconds and one viral campaign link that turns into a hot key.</p>
                  <p style="margin:0 0 10px 0;">Write your design in markdown with Mermaid diagrams until <strong style="color:#F3F2EE;">${esc(DOW.submit)}</strong>, then vote for up to three designs until <strong style="color:#F3F2EE;">${esc(DOW.vote)}</strong>. The best ones are featured on the course hub and on the author's profile, with a badge and XP.</p>
                  <p style="margin:0;font-family:${F_MONO};font-size:13px;"><a href="${PRACTICE_LINKS.designWeek}" style="color:${C.signal};text-decoration:underline;font-weight:600;">Read the brief now →</a></p>
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
            ${button(PRACTICE_LINKS.practice, "Open Practice →")}
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:0 36px 30px 36px;">
            <p style="margin:0;font-family:${F_MONO};font-size:13px;line-height:1.6;color:${C.ink3};">or go back to ${a(PRACTICE_LINKS.hub, "the course map")}</p>
          </td>
        </tr>

        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:0 36px 34px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">That's a lot at once, so pick one thing and try it this week. If something breaks or a number looks wrong, just reply to this email. I read every reply.</p>
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

export function practiceToolkitText({ email, name }: PracticeToolkitInput): string {
  const hi = firstName(name);
  const lines = [
    hi ? `Hi ${hi},` : "Hi there,",
    "",
    "The lessons teach system design. An interview checks whether you can use it with a clock running. For the last few weeks I've been building the part in between, and it's all live now. Here's what's new, and where I'd start.",
    "",
    ...OVERVIEW.map((f) => `- ${f.title}: ${f.body}`),
    "",
    `Open Practice: ${PRACTICE_LINKS.practice}`,
    "",
    "DESIGN OF THE WEEK STARTS MONDAY",
    `The first challenge opens ${DOW.opens}: ${DOW.title}, with redirects in single-digit milliseconds and one viral campaign link that turns into a hot key.`,
    `Write your design in markdown with Mermaid diagrams until ${DOW.submit}, then vote for up to three designs until ${DOW.vote}. The best ones are featured on the course hub and on the author's profile, with a badge and XP.`,
    `Read the brief now: ${PRACTICE_LINKS.designWeek}`,
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
    `Open Practice: ${PRACTICE_LINKS.practice}`,
    `The course map: ${PRACTICE_LINKS.hub}`,
    "",
    "That's a lot at once, so pick one thing and try it this week. If something breaks or a number looks wrong, just reply to this email. I read every reply.",
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

export function practiceToolkitEmail(input: PracticeToolkitInput) {
  return { subject: practiceToolkitSubject(input.name), html: practiceToolkitHtml(input), text: practiceToolkitText(input) };
}
