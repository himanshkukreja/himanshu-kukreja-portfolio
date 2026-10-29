/**
 * Course upgrade announcement (end of October 2026): the release of 29 Oct 2026 for existing learners.
 * Week 11 "Designing AI Systems" first, then the rebuilt and extended weeks (0, 6, 7, 8), the 4 new code
 * labs, side quests 34-36 and "Design it first" on every capstone; checkpoints, shorts and
 * certificates in the "also" list. HTML (table layout, inline styles, 600px,
 * phone-safe) + plain-text twin. Pure function, no I/O: src/lib/campaigns/templates.ts turns it into the
 * "course-upgrade" campaign template.
 *
 * Links are plain (no UTM): the campaign engine adds utm_* and click tracking per send.
 * Screenshots: public/email/course-upgrade/ (captured from the live site on 30 Oct 2026, light theme, 2x,
 * chromium, analytics blocked, first-visit tips dismissed): the Day 3 RAG "whole lesson" explainer, the
 * skill tree rows Week 06-11 (1024 px wide), the RAG lab header and brief (760 px), the side-quest grid
 * with only tiles 34-36 left showing (760 px), and the Design it first panel on the Week 11 capstone.
 *
 * Facts checked on 30 Oct 2026 against the live site and system-design-mastery (66b32e7): the hub reads
 * 12 worlds, 75 core lessons, 11 bosses, 36 side quests, 8 mock interviews; /learn/labs lists 16 labs;
 * every Week 11 lesson has a lecture (preview 8 min, Days 1-5 24 min, capstone 28 min), shorts and a
 * whole-lesson explainer; /learn/revise/week-11 and the Week 11 reading trail are live; the Design it
 * first panel is on all 11 capstones; 353 checkpoints (::::checkpoint) across Weeks 0-11; certificates
 * claimed after launch count the new lessons, issued ones stay as they are (src/lib/certificates/core.ts).
 * SHORTS_TOTAL is the hub's count on 30 Oct: check it before sending.
 */
import { firstName, unsubscribeUrl } from "./learn-revamp";

/** the hub's "N ideas in under two minutes each" on the day it's sent */
export const SHORTS_TOTAL = 556;

export const COURSE_UPGRADE_KEY = "announce:course-upgrade-2026-10";
export const COURSE_UPGRADE_SUBJECT = "Week 11 is live: Designing AI Systems, plus two rebuilt weeks";
export function courseUpgradeSubject(name?: string | null): string {
  const first = firstName(name);
  return first ? `${first}, Week 11 is live: Designing AI Systems` : COURSE_UPGRADE_SUBJECT;
}
export const COURSE_UPGRADE_PREHEADER =
  "LLM serving, vector search, RAG, evals and guardrails, and cost. Plus Weeks 6 and 7 rebuilt, 4 new code labs, and side quests on Amazon Prime Day, FASTag and Slack.";

const SITE = "https://www.himanshukukreja.in";
const L = `${SITE}/learn`;
const C_ = `${L}/system-design-mastery`;
const W11 = `${C_}/week-11-designing-ai-systems`;
export const COURSE_UPGRADE_LINKS = {
  course: C_,
  w11Preview: `${W11}/week-11-preview`,
  w11Rag: `${W11}/day-03-rag-systems`,
  w11Capstone: `${W11}/capstone-interview-week-11-ai-support-assistant`,
  w11Revise: `${L}/revise/week-11`,
  reading: `${L}/reading`,
  w0Api: `${C_}/week-00-foundations/foundations-part-7-api-design`,
  w0Db: `${C_}/week-00-foundations/foundations-part-8-databases-in-depth`,
  w6Preview: `${C_}/week-06-designing-notification-platform/week-06-preview`,
  w7Typeahead: `${C_}/week-07-designing-search-system/day-04-advanced-search-features`,
  w7Location: `${C_}/week-07-designing-search-system/day-05-search-operations-scale`,
  w8Counting: `${C_}/week-08-designing-analytics-pipeline/day-06-counting-at-scale`,
  labs: `${L}/labs`,
  labNotify: `${L}/labs/notification-dedupe-retry`,
  labTypeahead: `${L}/labs/typeahead-top-k-trie`,
  labRag: `${L}/labs/rag-context-packer`,
  labCache: `${L}/labs/semantic-answer-cache`,
  sqAmazon: `${C_}/bonus-problems/bonus-34-amazon-prime-day-checkout`,
  sqFastag: `${C_}/bonus-problems/bonus-35-fastag-electronic-tolling`,
  sqSlack: `${C_}/bonus-problems/bonus-36-slack-workspace-messaging`,
  sheets: `${L}/sheets`,
  w1Capstone: `${C_}/week-01-data-at-scale/capstone-interview-week-1-url-shortner-at-scale`,
  shorts: `${L}/shorts`,
};
const K = COURSE_UPGRADE_LINKS;
const IMG_BASE = `${SITE}/email/course-upgrade`;

export type CourseUpgradeInput = { email: string; name?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

/** Screenshot: `w` CSS px in the email; the files are 2x. */
type Shot = { file: string; w: number; h: number; alt: string };
const SHOTS = {
  explainer: { file: "week11-explainer.jpg", w: 528, h: 496, alt: "The explainer at the top of Week 11 Day 3, The whole lesson: RAG systems. Tabs for Tuesday, ingestion, freshness, query path, and permissions and failures. A diagram runs from CMS and Kafka through ingestion into pgvector plus BM25, then retrieval, a reranker, context and the LLM, back to the assistant and the customer. The caption: RAG retrieves passages from a corpus you control, then asks the model to answer from them." },
  map: { file: "course-map.jpg", w: 528, h: 455, alt: "The course skill tree from Week 06 to Week 11: Real-Time Delivery, Designing a Search System, Designing an Analytics Pipeline with a sixth day and a seventh trial part, Multi-tenancy and Security, Production Readiness, and the new Week 11, Designing AI Systems, each with a preview, five days, a boss and trial parts, with mock interview loops in between." },
  lab: { file: "lab-rag.jpg", w: 528, h: 542, alt: "The RAG chunker and context packer code lab, World 11: medium, about 40 minutes, 3 example and 9 hidden tests, 90 XP. It practises Day 3 sections 2.2 Chunking, 6.2 The Budget and 6.3 Packing It. The brief: split policy pages on the strongest boundary first, then pack the best reranked chunks into a token budget and stop padding with weak evidence." },
  quests: { file: "side-quests.jpg", w: 528, h: 250, alt: "The three new side quest tiles: SQ-35 FASTag Electronic Tolling, 152 minutes, advanced; SQ-34 Amazon Prime Day Checkout, 142 minutes, expert; SQ-36 Slack, 152 minutes, expert. Each is worth 120 XP." },
  designFirst: { file: "design-first.jpg", w: 528, h: 487, alt: "The Design it first panel on the Week 11 capstone: Sketch your own design before you read this one. Below it, the problem: design MegaMart Assist, an AI customer-support assistant that answers from help articles with citations, acts on the customer's own orders after they confirm, hands off to a human, works in English and Hindi, and never invents a policy." },
} satisfies Record<string, Shot>;

const b = (s: string) => `<strong style="color:${C.ink};">${s}</strong>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.signalText};text-decoration:underline;">${label}</a>`;

type Link = { href: string; label: string };
type Item = { html: string; text: string };
type Block = { tag: string; title: string; html: string; text: string; items?: Item[]; after?: Item; shot: Shot; links: Link[] };

const BLOCKS: Block[] = [
  {
    tag: "new · world 11",
    title: "Week 11: Designing AI Systems",
    html: `A whole new week on building products ${b("on top of")} a large language model. Not training one: shipping one that answers fast, gets it right, stays safe and fits a budget. One example runs all week, ${b("MegaMart Assist")}, a support assistant that answers in English and Hindi.`,
    text: "A whole new week on building products on top of a large language model. Not training one: shipping one that answers fast, gets it right, stays safe and fits a budget. One example runs all week, MegaMart Assist, a support assistant that answers in English and Hindi.",
    items: [
      { html: `${b("Day 1")} · LLM serving: tokens, latency and cost`, text: "Day 1 · LLM serving: tokens, latency and cost" },
      { html: `${b("Day 2")} · Embeddings and vector search`, text: "Day 2 · Embeddings and vector search" },
      { html: `${b("Day 3")} · RAG systems`, text: "Day 3 · RAG systems" },
      { html: `${b("Day 4")} · Evaluation and guardrails`, text: "Day 4 · Evaluation and guardrails" },
      { html: `${b("Day 5")} · Cost, caching and operations`, text: "Day 5 · Cost, caching and operations" },
      { html: `${b("Boss")} · Design an AI customer-support assistant`, text: "Boss · Design an AI customer-support assistant" },
    ],
    after: {
      html: `Every lesson has a narrated lecture, its own shorts and a whole-lesson explainer like this one. The week ends with a trial, ${a(K.w11Revise, "revision cards")} and a ${a(K.reading, "reading trail")}.`,
      text: `Every lesson has a narrated lecture, its own shorts and a whole-lesson explainer. The week ends with a trial, revision cards (${K.w11Revise}) and a reading trail (${K.reading}).`,
    },
    shot: SHOTS.explainer,
    links: [
      { href: K.w11Preview, label: "Start Week 11" },
      { href: K.w11Rag, label: "jump to Day 3, RAG" },
    ],
  },
  {
    tag: "rebuilt and extended · weeks 0, 6, 7, 8",
    title: "Weeks 6 and 7 rebuilt, Weeks 0 and 8 extended",
    html: "If you've done these weeks before, there's new material waiting.",
    text: "If you've done these weeks before, there's new material waiting.",
    items: [
      {
        html: `${b("Week 0, Foundations")} gets ${a(K.w0Api, "Part 7, API design")} (pagination, versioning, idempotency keys, REST vs gRPC vs GraphQL) and ${a(K.w0Db, "Part 8, databases in depth")} (B-trees and LSM-trees, indexes, isolation levels, MVCC, locking, ID generation).`,
        text: `Week 0, Foundations gets Part 7, API design (pagination, versioning, idempotency keys, REST vs gRPC vs GraphQL): ${K.w0Api}\n  and Part 8, databases in depth (B-trees and LSM-trees, indexes, isolation levels, MVCC, locking, ID generation): ${K.w0Db}`,
      },
      {
        html: `${b("Week 6 is now Real-Time Delivery.")} The delivery pipeline behind every notification, WebSockets and SSE at scale, and presence and chat fan-out.`,
        text: `Week 6 is now Real-Time Delivery. The delivery pipeline behind every notification, WebSockets and SSE at scale, and presence and chat fan-out: ${K.w6Preview}`,
      },
      {
        html: `${b("Week 7")} has two rewritten days: ${a(K.w7Typeahead, "typeahead at scale")} (autocomplete, spelling, facets) and ${a(K.w7Location, "location search")} (geohash, quadtrees, S2 and H3) and search at scale.`,
        text: `Week 7 has two rewritten days: typeahead at scale (autocomplete, spelling, facets): ${K.w7Typeahead}\n  and location search (geohash, quadtrees, S2 and H3) and search at scale: ${K.w7Location}`,
      },
      {
        html: `${b("Week 8")} gets a Day 6, ${a(K.w8Counting, "Counting at Scale")}: Bloom filters, HyperLogLog, Count-Min Sketch and top-k.`,
        text: `Week 8 gets a Day 6, Counting at Scale: Bloom filters, HyperLogLog, Count-Min Sketch and top-k: ${K.w8Counting}`,
      },
    ],
    after: { html: "Each new lesson comes with its lecture and shorts.", text: "Each new lesson comes with its lecture and shorts." },
    shot: SHOTS.map,
    links: [
      { href: K.w6Preview, label: "Open the new Week 6" },
      { href: K.course, label: "see the whole map" },
    ],
  },
  {
    tag: "code labs · 16 now",
    title: "Four new code labs",
    html: `Write Python in the browser and run it against example tests and hidden edge cases. Each lab comes straight from a lesson. The new ones:`,
    text: "Write Python in the browser and run it against example tests and hidden edge cases. Each lab comes straight from a lesson. The new ones:",
    items: [
      { html: `${a(K.labNotify, "Deliver once, retry right")} (Week 6): skip a redelivered push, then back off with jitter until the message expires.`, text: `Deliver once, retry right (Week 6): skip a redelivered push, then back off with jitter until the message expires. ${K.labNotify}` },
      { html: `${a(K.labTypeahead, "Typeahead with a top-k trie")} (Week 7): keep the top suggestions at every node, so a keystroke is one walk.`, text: `Typeahead with a top-k trie (Week 7): keep the top suggestions at every node, so a keystroke is one walk. ${K.labTypeahead}` },
      { html: `${a(K.labRag, "RAG chunker and context packer")} (Week 11): chunk a policy page, then fill a token budget with the best evidence.`, text: `RAG chunker and context packer (Week 11): chunk a policy page, then fill a token budget with the best evidence. ${K.labRag}` },
      { html: `${a(K.labCache, "Scoped semantic answer cache")} (Week 11): reuse the answer to a similar question, but never a personal answer, and never across languages.`, text: `Scoped semantic answer cache (Week 11): reuse the answer to a similar question, but never a personal answer, and never across languages. ${K.labCache}` },
    ],
    shot: SHOTS.lab,
    links: [
      { href: K.labRag, label: "Try the RAG lab" },
      { href: K.labs, label: "all 16 labs" },
    ],
  },
  {
    tag: "side quests · 36 now",
    title: "Three new side quests: Amazon, FASTag, Slack",
    html: "Real systems, designed end to end from published numbers.",
    text: "Real systems, designed end to end from published numbers.",
    items: [
      { html: `${a(K.sqAmazon, b("34 · Amazon Prime Day checkout"))}. A cart that never refuses an item, and an order placed exactly once, however many times the button is pressed.`, text: `34 · Amazon Prime Day checkout. A cart that never refuses an item, and an order placed exactly once, however many times the button is pressed. ${K.sqAmazon}` },
      { html: `${a(K.sqFastag, b("35 · FASTag"))}. About 1.2 crore toll crossings a day through 40 issuer banks, and a barrier that decides in about a second, even when the plaza's link is down.`, text: `35 · FASTag. About 1.2 crore toll crossings a day through 40 issuer banks, and a barrier that decides in about a second, even when the plaza's link is down. ${K.sqFastag}` },
      { html: `${a(K.sqSlack, b("36 · Slack"))}. Channels shared between companies, messages delivered in about half a second, and search that shows only what you're allowed to read.`, text: `36 · Slack. Channels shared between companies, messages delivered in about half a second, and search that shows only what you're allowed to read. ${K.sqSlack}` },
    ],
    after: { html: `Each one has a lecture, shorts and a ${a(K.sheets, "design sheet")}.`, text: `Each one has a lecture, shorts and a design sheet (${K.sheets}).` },
    shot: SHOTS.quests,
    links: [
      { href: K.sqFastag, label: "Start with FASTag" },
      { href: K.sqAmazon, label: "Amazon" },
      { href: K.sqSlack, label: "Slack" },
    ],
  },
  {
    tag: "every capstone · design it first",
    title: "Design it first, then read the answer",
    html: `All 11 capstones now stop you just before the solution. ${b("Sketch your own design")} on the canvas first: the board starts with the requirements on a sticky note. The solution stays folded until you save a design or press skip. Then ${b("Compare with my design")} puts your drawing next to the capstone's architecture.`,
    text: "All 11 capstones now stop you just before the solution. Sketch your own design on the canvas first: the board starts with the requirements on a sticky note. The solution stays folded until you save a design or press skip. Then Compare with my design puts your drawing next to the capstone's architecture.",
    shot: SHOTS.designFirst,
    links: [
      { href: K.w11Capstone, label: "Try it on the Week 11 capstone" },
      { href: K.w1Capstone, label: "start with the URL shortener" },
    ],
  },
];

const ALSO: { title: string; html: string; text: string }[] = [
  {
    title: "Checkpoints in every world.",
    html: "Lessons now stop you halfway with a question: commit to an answer, then reveal it. There are more than 350 across the course, plus worked estimates that walk through the numbers step by step.",
    text: "Lessons now stop you halfway with a question: commit to an answer, then reveal it. There are more than 350 across the course, plus worked estimates that walk through the numbers step by step.",
  },
  {
    title: "More shorts.",
    html: `Every new lesson and side quest has its own. The ${a(K.shorts, "Shorts feed")} has ${SHORTS_TOTAL} now.`,
    text: `Every new lesson and side quest has its own. The Shorts feed has ${SHORTS_TOTAL} now: ${K.shorts}`,
  },
  {
    title: "Certificates.",
    html: "One you already have stays valid as it is. One you claim from now on counts the new lessons too.",
    text: "One you already have stays valid as it is. One you claim from now on counts the new lessons too.",
  },
];

/** the course in numbers */
const COUNTS: [number, string][] = [
  [12, "worlds"],
  [75, "core lessons"],
  [11, "boss capstones"],
  [36, "side quests"],
  [16, "code labs"],
  [8, "mock interviews"],
];

const img = (s: Shot) =>
  `<img src="${IMG_BASE}/${s.file}" width="${s.w}" height="${s.h}" alt="${esc(s.alt)}" style="display:block;width:100%;max-width:${s.w}px;height:auto;border:1px solid ${C.line};margin:0 auto;">`;
const P = `margin:0 0 10px 0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};`;
const TAG = `font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signalText};`;

function blockHtml(x: Block): string {
  const [first, ...rest] = x.links;
  const more = rest.map((l) => ` · or ${a(l.href, esc(l.label))}`).join("");
  const items = x.items?.length
    ? `<ul style="margin:0 0 10px 0;padding:0 0 0 18px;font-family:${F_BODY};font-size:15px;line-height:1.55;color:${C.ink2};">${x.items.map((i) => `<li style="margin:0 0 6px 0;">${i.html}</li>`).join("")}</ul>`
    : "";
  const after = x.after ? `<p style="${P}">${x.after.html}</p>` : "";
  return `
        <tr>
          <td class="pad" style="padding:0 36px 36px 36px;">
            <div style="${TAG}margin:0 0 6px 0;">${esc(x.tag)}</div>
            <h3 style="margin:0 0 10px 0;font-family:${F_DISPLAY};font-weight:800;font-size:21px;line-height:1.2;letter-spacing:-0.01em;color:${C.ink};">${esc(x.title)}</h3>
            <p style="${P}">${x.html}</p>
            ${items}${after}
            <div style="margin:14px 0 12px 0;" align="center">${img(x.shot)}</div>
            <p style="margin:0;font-family:${F_MONO};font-size:13px;line-height:1.6;color:${C.ink3};"><a href="${first.href}" style="color:${C.signalText};text-decoration:underline;font-weight:600;">${esc(first.label)} →</a>${more}</p>
          </td>
        </tr>`;
}

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:${C.signal};color:${C.onSignal};font-family:${F_MONO};font-size:14px;font-weight:600;letter-spacing:0.02em;text-decoration:none;padding:14px 22px;">${esc(label)}</a>`;

const INTRO =
  "The course just grew by a whole week. There's a twelfth world, Week 11, on designing systems built on large language models. Weeks 6 and 7 were rebuilt, Weeks 0 and 8 have new lessons, and there are new code labs and side quests. Here's what's new, biggest first.";

const SIGN_OFF =
  "Start with the Week 11 preview. Its lecture is eight minutes. Then tell me what you'd want next on AI systems: just reply to this email. I read every reply.";

/** the counts strip: "12 worlds · 75 core lessons · …" */
const countsHtml = () =>
  COUNTS.map(
    ([n, label]) =>
      `<td style="padding:10px 12px;border:1px solid #2A2A2E;vertical-align:top;"><div style="font-family:${F_DISPLAY};font-weight:800;font-size:22px;line-height:1;color:#F3F2EE;">${n}</div><div style="margin-top:4px;font-family:${F_MONO};font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:#A3A3A8;">${esc(label)}</div></td>`,
  );

export function courseUpgradeHtml({ email, name }: CourseUpgradeInput): string {
  const hi = firstName(name);
  const unsub = unsubscribeUrl(email);
  const cells = countsHtml();
  // two rows of three so it fits a phone without shrinking the numbers
  const rows = [cells.slice(0, 3), cells.slice(3)].map((r) => `<tr>${r.join("")}</tr>`).join("");
  const also = ALSO.map((t) => `<li style="margin:0 0 8px 0;">${b(esc(t.title))} ${t.html}</li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(COURSE_UPGRADE_SUBJECT)}</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(COURSE_UPGRADE_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <!-- top bar -->
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu</td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">new · week 11</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>
        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · course update</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">Week 11 is live: Designing AI Systems<span style="color:${C.signal};">.</span></h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${esc(INTRO)}</p>
          </td>
        </tr>
        <!-- counts -->
        <tr>
          <td class="pad" style="padding:20px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr><td style="padding:16px 16px 6px 16px;font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};">the course now · free, no sign-up to read</td></tr>
              <tr><td style="padding:0 16px 16px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table></td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad btn" style="padding:22px 36px 32px 36px;">
            ${button(K.w11Preview, "Start Week 11 →")}
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
            ${button(K.course, "Open the course map →")}
          </td>
        </tr>
        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:18px 36px 34px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">${esc(SIGN_OFF)}</p>
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

export function courseUpgradeText({ email, name }: CourseUpgradeInput): string {
  const hi = firstName(name);
  return [
    hi ? `Hi ${hi},` : "Hi there,",
    "",
    INTRO,
    "",
    `The course now (free, no sign-up to read): ${COUNTS.map(([n, l]) => `${n} ${l}`).join(" · ")}.`,
    `Start Week 11: ${K.w11Preview}`,
    "",
    ...BLOCKS.flatMap((x) => [
      x.title.toUpperCase(),
      x.text,
      ...(x.items ?? []).map((i) => `- ${i.text}`),
      ...(x.after ? [x.after.text] : []),
      ...x.links.map((l, i) => `${i ? "Or " + l.label : l.label}: ${l.href}`),
      "",
    ]),
    "ALSO",
    ...ALSO.map((t) => `- ${t.title} ${t.text}`),
    "",
    `Open the course map: ${K.course}`,
    "",
    SIGN_OFF,
    "",
    "Himanshu",
    "himanshukukreja.in",
    "",
    "--",
    `You're getting this course update because you signed up at himanshukukreja.in/learn with ${email}.`,
    `Unsubscribe: ${unsubscribeUrl(email)}`,
  ].join("\n");
}

export function courseUpgradeEmail(input: CourseUpgradeInput) {
  return { subject: courseUpgradeSubject(input.name), html: courseUpgradeHtml(input), text: courseUpgradeText(input) };
}
