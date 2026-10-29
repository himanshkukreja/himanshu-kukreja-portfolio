/**
 * Course chat announcement (end of October 2026): the Ask tab, /learn/chat, a tutor that searches the whole
 * course and works with the learner's own progress. One block per thing it does, each with a screenshot of a
 * real answer, then "things to try" links that open the chat and ask (?q=…&ask=1), the extras, the daily
 * allowance and privacy. HTML (table layout, inline styles, 600px, phone-safe) + plain-text twin. Pure
 * function, no I/O: src/lib/campaigns/templates.ts turns it into the "course-chat" campaign template.
 *
 * Links are plain (no UTM): the campaign engine adds utm_* and click tracking per send.
 * Screenshots: public/email/course-chat/. Captured from the real /learn/chat UI on a scratch build of the
 * site with real model answers (Sonnet 5.5 through /api/learn/chat) for a demo learner (its progress, due
 * reviews and memory are fixtures), dark theme, 2x, cropped to the conversation.
 *
 * Facts checked on 29 Oct 2026 (src/lib/ai/chat/*): it searches lessons, sections, lectures and their
 * moments, side quests, war stories, case files, interview problems, low-level design, concepts, labs, FAQs,
 * company pages and revision cards before answering; quizzes use the course's own questions (check_answer);
 * study plans save and download as .ics; review_my_design reads the design canvas; start_mock; memory can be
 * seen and cleared; history is saved to the account for 90 days after the last message; CHAT_PER_DAY must match /admin/chat
 * (perDay) on the day it's sent; privacy text as on /learn/chat.
 */
import { firstName, unsubscribeUrl } from "./learn-revamp";

/** full answers a day before fast mode: check /admin/chat before sending */
export const CHAT_PER_DAY = 30;

export const COURSE_CHAT_KEY = "announce:course-chat-2026-10";
export const COURSE_CHAT_SUBJECT = "Ask the course anything: it answers with sources, quizzes you and plans your prep";
export function courseChatSubject(name?: string | null): string {
  const first = firstName(name);
  return first ? `${first}, you can ask the whole course anything now` : COURSE_CHAT_SUBJECT;
}
export const COURSE_CHAT_PREHEADER =
  "One chat that has read every lesson, lecture, side quest and war story. It finds the exact second in a lecture, quizzes you, plans your interview prep and reviews your design.";

const SITE = "https://www.himanshukukreja.in";
const L = `${SITE}/learn`;
const CHAT = `${L}/chat`;
const ask = (q: string) => `${CHAT}?q=${encodeURIComponent(q)}&ask=1`;
export const COURSE_CHAT_LINKS = {
  chat: CHAT,
  canvas: `${L}/canvas`,
  mocks: `${L}/mock`,
};

/** "things to try": each opens the chat and asks it */
const TRY: string[] = [
  "Explain consistent hashing like I'm new to it",
  "Find the lecture moment where thundering herd is explained",
  "Quiz me on caching",
  "I have a system design interview in 2 weeks. Make me a plan.",
  "What should I learn next?",
  "Interview me on designing a payments system",
];

const IMG_BASE = `${SITE}/email/course-chat`;

export type CourseChatInput = { email: string; name?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

/** Screenshot: `w` CSS px in the email; the files are 2x. */
type Shot = { file: string; w: number; h: number; alt: string };
const SHOTS = {
  answer: { file: "answer.jpg", w: 528, h: 867, alt: "The question: explain consistent hashing like I'm new to it. The answer: a clock-face picture, the problem with hash mod N, the ring fix in three steps, and virtual nodes (noting the learner found them tricky last time), with numbered citations. Below it five sources (two lesson sections, the concept page, the code lab, a deep dive) and three suggested next questions." },
  moment: { file: "moment.jpg", w: 528, h: 535, alt: "The question: find the lecture moment where thundering herd is explained. The answer points to the Week 4 lecture at 13:08 and a second moment at 15:32, with source cards for each moment, the full 20-minute lecture and the lesson, and three suggested next questions." },
  quiz: { file: "quiz.jpg", w: 528, h: 571, alt: "Quiz me on caching: a multiple choice question from the course about a CDN serving a stale app.js. The learner picks C, a content hash in the filename, and the tutor grades it right and explains why, compared with a short TTL." },
  plan: { file: "plan.jpg", w: 528, h: 620, alt: "A learning path: Flipkart SDE-2 system design interview in 2 weeks, with Save path and Download calendar buttons, and dated steps: Invalidation Strategies, Thundering Herd, Partitioning Deep-Dive, the consistent hashing lab, Replication Trade-offs, Hot Keys and Skew." },
  review: { file: "review.jpg", w: 528, h: 607, alt: "Review my design: a verdict on the learner's URL shortener drawing, three strengths, and three gaps worst first (no cache on the read path, random codes collide, a single Postgres), each pointing to the lesson that covers it, then the next step." },
} satisfies Record<string, Shot>;

const b = (s: string) => `<strong style="color:${C.ink};">${s}</strong>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.signalText};text-decoration:underline;">${label}</a>`;

type Link = { href: string; label: string };
type Block = { tag: string; title: string; html: string; text: string; shot: Shot; links: Link[] };

const BLOCKS: Block[] = [
  {
    tag: "ask · the whole course",
    title: "Ask anything. It answers from the course, with sources.",
    html: `Before it answers, it searches ${b("every lesson, lecture, side quest, war story, interview problem and FAQ")} in the course. Then it answers in plain words and numbers its sources, so you can open each one and check. Follow up as you would with a person: it keeps the whole conversation in mind.`,
    text: "Before it answers, it searches every lesson, lecture, side quest, war story, interview problem and FAQ in the course. Then it answers in plain words and numbers its sources, so you can open each one and check. Follow up as you would with a person: it keeps the whole conversation in mind.",
    shot: SHOTS.answer,
    links: [{ href: ask(TRY[0]), label: "Ask it about consistent hashing" }],
  },
  {
    tag: "lectures · the exact second",
    title: "It finds the exact second in a lecture",
    html: `Remember a lecture explaining something, but not where? Ask. It gives you ${b("the moment, down to the second")}, and the link opens the lecture right there.`,
    text: "Remember a lecture explaining something, but not where? Ask. It gives you the moment, down to the second, and the link opens the lecture right there.",
    shot: SHOTS.moment,
    links: [{ href: ask(TRY[1]), label: "Find the thundering herd moment" }],
  },
  {
    tag: "practice · quiz me",
    title: "Say “quiz me” and it tests you",
    html: `It asks ${b("the course's own questions")}, multiple choice, a lesson's “your turn” question or an interviewer's follow-up, on whatever topic you name. Answer in your own words. It grades you against the course's answer and tells you exactly what you missed.`,
    text: "It asks the course's own questions, multiple choice, a lesson's “your turn” question or an interviewer's follow-up, on whatever topic you name. Answer in your own words. It grades you against the course's answer and tells you exactly what you missed.",
    shot: SHOTS.quiz,
    links: [{ href: ask(TRY[2]), label: "Quiz me on caching" }],
  },
  {
    tag: "interview prep · a plan",
    title: "Tell it your interview date. Get a plan.",
    html: `Say which company and how long you have. It builds a ${b("day-by-day plan")} from what you've already done: lessons, lectures, mock interviews and the company's prep page. ${b("Save")} it to your account or add it to your ${b("calendar")}.`,
    text: "Say which company and how long you have. It builds a day-by-day plan from what you've already done: lessons, lectures, mock interviews and the company's prep page. Save it to your account or add it to your calendar.",
    shot: SHOTS.plan,
    links: [{ href: ask(TRY[3]), label: "Make me a 2-week plan" }],
  },
  {
    tag: "design · review",
    title: "Draw a design, then ask it to review",
    html: `Sketch your system on the ${a(COURSE_CHAT_LINKS.canvas, "design canvas")} and type ${b("“review my design”")}. It reads your boxes and arrows and tells you what an interviewer would push on, with numbers, and which lesson covers each gap.`,
    text: `Sketch your system on the design canvas (${COURSE_CHAT_LINKS.canvas}) and type "review my design". It reads your boxes and arrows and tells you what an interviewer would push on, with numbers, and which lesson covers each gap.`,
    shot: SHOTS.review,
    links: [{ href: COURSE_CHAT_LINKS.canvas, label: "Open the design canvas" }],
  },
];

const ALSO = [
  {
    title: "It suggests what to ask next.",
    html: "Under each answer, two or three follow-up questions about that answer. Tap one to keep going.",
    text: "Under each answer, two or three follow-up questions about that answer. Tap one to keep going.",
  },
  {
    title: "It knows where you are.",
    html: "It sees your progress and what's due for review, so “what should I learn next?” gets a real answer. It also remembers what you found tricky between chats. You can see or clear that any time.",
    text: "It sees your progress and what's due for review, so “what should I learn next?” gets a real answer. It also remembers what you found tricky between chats. You can see or clear that any time.",
  },
  {
    title: "Mock interviews.",
    html: `Say “interview me on payments” and it runs a timed mock interview right in the chat, phase by phase, with a scorecard at the end. Or browse ${a(COURSE_CHAT_LINKS.mocks, "all mock interviews")}.`,
    text: `Say "interview me on payments" and it runs a timed mock interview right in the chat, phase by phase, with a scorecard at the end. All mock interviews: ${COURSE_CHAT_LINKS.mocks}`,
  },
  {
    title: "Talk, listen, share.",
    html: "Speak your question instead of typing it, press Listen to hear an answer, or share one with a link.",
    text: "Speak your question instead of typing it, press Listen to hear an answer, or share one with a link.",
  },
  {
    title: "Your chats.",
    html: "Your chats are saved to your account for 90 days after your last message, so you can pick one up from History on any device.",
    text: "Your chats are saved to your account for 90 days after your last message, so you can pick one up from History on any device.",
  },
  {
    title: "Your privacy.",
    html: "What you send goes to Anthropic's AI to answer it, and isn't used to train models. Conversations are kept 90 days to stop abuse and improve the tutor, then deleted.",
    text: "What you send goes to Anthropic's AI to answer it, and isn't used to train models. Conversations are kept 90 days to stop abuse and improve the tutor, then deleted.",
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
  "The course has a chat now. It isn't a general chatbot: it has read every lesson, lecture, side quest and war story here, it knows where you are in the course, and it can do things, not just talk. Here's what it does, each with a real answer it gave.";

const ALLOWANCE = `Free for every signed-in learner, for a limited time. You get ${CHAT_PER_DAY} full answers a day; after that it keeps going in fast mode. Chat doesn't use your other AI credits.`;

/** the "things to try" list: each line opens the chat and asks */
const tryHtml = () =>
  TRY.map(
    (q) =>
      `<tr><td style="padding:0 0 8px 0;"><a href="${ask(q)}" style="display:block;border:1px solid #2A2A2E;padding:11px 14px;font-family:${F_BODY};font-size:15px;line-height:1.4;color:#F3F2EE;text-decoration:none;"><span style="color:${C.signal};font-family:${F_MONO};">❯</span>&nbsp; ${esc(q)}</a></td></tr>`,
  ).join("");

export function courseChatHtml({ email, name }: CourseChatInput): string {
  const hi = firstName(name);
  const unsub = unsubscribeUrl(email);
  const also = ALSO.map((t) => `<li style="margin:0 0 8px 0;">${b(esc(t.title))} ${t.html}</li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(COURSE_CHAT_SUBJECT)}</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(COURSE_CHAT_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <!-- top bar -->
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu</td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">new · course chat</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>
        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · ask</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">Ask the whole course anything<span style="color:${C.signal};">.</span></h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${esc(INTRO)}</p>
          </td>
        </tr>
        <!-- things to try -->
        <tr>
          <td class="pad" style="padding:20px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr><td style="padding:16px 16px 10px 16px;font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};">tap one to ask it</td></tr>
              <tr><td style="padding:0 16px 8px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${tryHtml()}</table></td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad btn" style="padding:22px 36px 32px 36px;">
            ${button(COURSE_CHAT_LINKS.chat, "Open the chat →")}
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:0 36px 0 36px;">
            <div style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;margin:0 0 30px 0;">&nbsp;</div>
          </td>
        </tr>
        ${BLOCKS.map(blockHtml).join("")}
        <!-- allowance -->
        <tr>
          <td class="pad" style="padding:0 36px 26px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr>
                <td style="padding:16px 20px;font-family:${F_BODY};font-size:15px;line-height:1.55;color:#E7E6E1;">
                  <span style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};">free · limited time</span><br>
                  ${esc(ALLOWANCE)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- also -->
        <tr>
          <td class="pad" style="padding:0 36px 26px 36px;">
            <div style="${TAG}margin:0 0 10px 0;">also</div>
            <ul style="margin:0;padding:0 0 0 18px;font-family:${F_BODY};font-size:15px;line-height:1.55;color:${C.ink2};">${also}</ul>
          </td>
        </tr>
        <tr>
          <td class="pad btn" style="padding:4px 36px 12px 36px;">
            ${button(COURSE_CHAT_LINKS.chat, "Ask your first question →")}
          </td>
        </tr>
        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:18px 36px 34px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">Ask it the question you'd be embarrassed to ask in an interview. If an answer looks wrong, press the flag under it or reply to this email with what you asked. I read every reply.</p>
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

export function courseChatText({ email, name }: CourseChatInput): string {
  const hi = firstName(name);
  return [
    hi ? `Hi ${hi},` : "Hi there,",
    "",
    INTRO,
    "",
    "TAP ONE TO ASK IT",
    ...TRY.map((q) => `- ${q}: ${ask(q)}`),
    "",
    `Open the chat: ${COURSE_CHAT_LINKS.chat}`,
    "",
    ...BLOCKS.flatMap((x) => [x.title.toUpperCase(), x.text, ...x.links.map((l, i) => `${i ? "Or " + l.label : l.label}: ${l.href}`), ""]),
    ALLOWANCE,
    "",
    "ALSO",
    ...ALSO.map((t) => `- ${t.title} ${t.text}`),
    "",
    `Ask your first question: ${COURSE_CHAT_LINKS.chat}`,
    "",
    "Ask it the question you'd be embarrassed to ask in an interview. If an answer looks wrong, press the flag under it or reply to this email with what you asked. I read every reply.",
    "",
    "Himanshu",
    "himanshukukreja.in",
    "",
    "--",
    `You're getting this course update because you signed up at himanshukukreja.in/learn with ${email}.`,
    `Unsubscribe: ${unsubscribeUrl(email)}`,
  ].join("\n");
}

export function courseChatEmail(input: CourseChatInput) {
  return { subject: courseChatSubject(input.name), html: courseChatHtml(input), text: courseChatText(input) };
}
