/**
 * AI announcement (late October 2026): the AI features, free for every signed-in learner for a
 * limited time (no end date given). One block per feature, each with a screenshot of a real answer.
 * The non-AI changes go out separately in watch-and-try.ts. HTML (table layout, inline styles, 600px,
 * phone-safe) + plain-text twin. Pure function, no I/O: src/lib/campaigns/templates.ts turns it
 * into the "ai-tutor" campaign template.
 *
 * Links are plain (no UTM): the campaign engine adds utm_* and click tracking per send.
 * Screenshots: public/email/ai-tutor/. Each was captured from the real UI on 25 Oct 2026 with a
 * real model answer (Sonnet 5.5 through /api/learn/ai/*, logged in ai_calls), dark theme, 2x.
 *
 * Facts checked on 25 Oct 2026: 8 code labs, 3 hint levels; 213 concept pages; 4 mock interviews;
 * 5 war rooms; 999 "questions learners ask" on 125 pages; ask modes (just answer, explain simply,
 * give an example, say it in an interview, in Hinglish); privacy text as in AI_PRIVACY.
 */
import { firstName, unsubscribeUrl } from "./learn-revamp";

export const AI_TUTOR_KEY = "announce:ai-tutor-2026-10";
export const AI_TUTOR_SUBJECT = "Your system design course has an AI tutor now (free for now)";
export function aiTutorSubject(name?: string | null): string {
  const first = firstName(name);
  return first ? `${first}, your system design course has an AI tutor now` : AI_TUTOR_SUBJECT;
}
export const AI_TUTOR_PREHEADER = "Ask any lesson, get hints in code labs, practise with an AI interviewer and get graded. Free for every signed-in learner, for a limited time.";

const SITE = "https://www.himanshukukreja.in";
const L = `${SITE}/learn`;
const C_ = `${L}/system-design-mastery`;
export const AI_TUTOR_LINKS = {
  hub: C_,
  lesson: `${C_}/week-04-caching/day-03-thundering-herd`,
  labs: `${L}/labs`,
  lab: `${L}/labs/token-bucket`,
  concepts: `${L}/concepts`,
  concept: `${L}/concepts/idempotency`,
  mock: `${L}/mock/mock-01-billbolt-autopay`,
  mocks: `${L}/mock`,
  warRoom: `${L}/war-stories/war-room/one-regex-takes-down-the-edge`,
  designWeek: `${L}/design-week`,
  ai: `${L}/dashboard#ai`,
};
const IMG_BASE = `${SITE}/email/ai-tutor`;

export type AiTutorInput = { email: string; name?: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const F_DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_BODY = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";
const F_MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const C = { paper: "#F5F4F0", card: "#FFFFFF", ink: "#0B0B0B", ink2: "#2E2E33", ink3: "#55555B", line: "#DDDBD4", signal: "#FF6B2B", signalText: "#C2410C", onSignal: "#120700", black: "#000000" };

/** Screenshot: `w` CSS px in the email; the files are 2x. */
type Shot = { file: string; w: number; h: number; alt: string };
const SHOTS = {
  ask: { file: "ask.jpg", w: 350, h: 517, alt: "Ask this lesson, beside the Thundering Herd lesson. Question: why add jitter to the TTL, isn't single flight enough? The answer explains that single flight merges requests for the same key but can't stop many keys expiring together, citing the lesson's sections 8.3, 2.2 and 3.3." },
  lab: { file: "lab-hints.jpg", w: 528, h: 371, alt: "The AI tutor in the token bucket code lab. Hint 1, a nudge: what happens to a bucket that sits idle for an hour? Hint 2, the exact spot: the refill line never applies the capacity cap." },
  explain: { file: "explain-back.jpg", w: 528, h: 446, alt: "Explain it back on the Idempotency page. The learner's explanation gets the verdict Partly there, with what they got, what's missing (why retries happen and why POST needs a key) and the fix." },
  interviewer: { file: "interviewer.jpg", w: 528, h: 612, alt: "Live with Ananya, the AI interviewer in the Billbolt mock interview. She answers the candidate's clarifying questions with the numbers, then pushes: when a call to BillHub times out, what exactly don't we know, and what do we show the user?" },
  scorecard: { file: "scorecard.jpg", w: 528, h: 310, alt: "The AI scorecard after a mock interview: phase 1, Clarify requirements, graded Junior, with what the candidate showed (quoted), what they missed at each level, and what to practise next." },
  warRoom: { file: "war-room.jpg", w: 528, h: 318, alt: "A war room decision: everything broke at the same minute, what do you look at first? The learner types their own move, grab a CPU profile, and the incident commander replies in character: something shared changed at that minute, find out what." },
} satisfies Record<string, Shot>;

const b = (s: string) => `<strong style="color:${C.ink};">${s}</strong>`;
const a = (href: string, label: string) => `<a href="${href}" style="color:${C.signalText};text-decoration:underline;">${label}</a>`;

type Link = { href: string; label: string };
type Block = { tag: string; title: string; html: string; text: string; shot: Shot; links: Link[] };

const BLOCKS: Block[] = [
  {
    tag: "every lesson · ask this lesson",
    title: "Ask the lesson you're reading",
    html: `Press the orange ${b("Ask AI")} button, or select any sentence and press ${b("Ask here")}. The answer comes from the lesson itself and names the section it used, so you can jump back and check. Want it simpler, with an example, the way you'd say it in an interview, or in Hinglish? One tap.`,
    text: "Press the orange Ask AI button, or select any sentence and press Ask here. The answer comes from the lesson itself and names the section it used, so you can jump back and check. Want it simpler, with an example, the way you'd say it in an interview, or in Hinglish? One tap.",
    shot: SHOTS.ask,
    links: [{ href: AI_TUTOR_LINKS.lesson, label: "Ask the Thundering Herd lesson" }],
  },
  {
    tag: "code labs · hints",
    title: "Stuck on a failing test? Get a hint, not the answer",
    html: `In the ${b("8 code labs")}, the tutor reads your code and the failing tests and gives you three levels of hint: ${b("a nudge")}, then ${b("the exact spot")}, then ${b("the fix, in words")}. It never writes the solution for you. Once every test passes, ask for a ${b("code review")}.`,
    text: "In the 8 code labs, the tutor reads your code and the failing tests and gives you three levels of hint: a nudge, then the exact spot, then the fix, in words. It never writes the solution for you. Once every test passes, ask for a code review.",
    shot: SHOTS.lab,
    links: [
      { href: AI_TUTOR_LINKS.lab, label: "Try the token bucket lab" },
      { href: AI_TUTOR_LINKS.labs, label: "all 8 labs" },
    ],
  },
  {
    tag: "concepts · explain it back",
    title: "Explain it in your own words, get an honest verdict",
    html: `On each of the ${b("213 concept pages")}, explain the idea as you would to an interviewer. You get a straight verdict (solid, partly there or a misconception), what you got right, what's missing, and the one thing to fix.`,
    text: "On each of the 213 concept pages, explain the idea as you would to an interviewer. You get a straight verdict (solid, partly there or a misconception), what you got right, what's missing, and the one thing to fix.",
    shot: SHOTS.explain,
    links: [{ href: AI_TUTOR_LINKS.concept, label: "Explain idempotency" }],
  },
  {
    tag: "mock interviews · ai interviewer",
    title: "An interviewer who answers what you actually said",
    html: `In the mock interviews you can now ${b("talk to the interviewer")}. Ask your clarifying questions and get the real numbers; say something vague and she pushes on it, like a real staff engineer would.`,
    text: "In the mock interviews you can now talk to the interviewer. Ask your clarifying questions and get the real numbers; say something vague and she pushes on it, like a real staff engineer would.",
    shot: SHOTS.interviewer,
    links: [{ href: AI_TUTOR_LINKS.mock, label: "Start the Billbolt interview" }],
  },
  {
    tag: "mock interviews · ai scorecard",
    title: "Then a strict scorecard, phase by phase",
    html: `At the end, the ${b("AI scorecard")} grades every phase against its rubric, quotes what you wrote and said, lists what you missed at each level and tells you what to practise next, with the lesson to read. It sits beside your own scores and never changes your XP.`,
    text: "At the end, the AI scorecard grades every phase against its rubric, quotes what you wrote and said, lists what you missed at each level and tells you what to practise next, with the lesson to read. It sits beside your own scores and never changes your XP.",
    shot: SHOTS.scorecard,
    links: [{ href: AI_TUTOR_LINKS.mocks, label: "See all mock interviews" }],
  },
  {
    tag: "war rooms · your own move",
    title: "In a war room, do what you'd actually do",
    html: `When you're on call in a ${b("war room")}, you don't have to pick from the list. ${b("Type your own move")} and the people in the incident channel reply in character, and tell you whether it's what they'd do.`,
    text: "When you're on call in a war room, you don't have to pick from the list. Type your own move and the people in the incident channel reply in character, and tell you whether it's what they'd do.",
    shot: SHOTS.warRoom,
    links: [{ href: AI_TUTOR_LINKS.warRoom, label: "Take the page" }],
  },
];

const ALSO = [
  {
    title: "Questions learners ask.",
    html: `999 common questions, answered at the end of every lesson and side quest, each pointing to its section. They're free to read, signed in or not.`,
    text: "999 common questions, answered at the end of every lesson and side quest, each pointing to its section. They're free to read, signed in or not.",
  },
  {
    title: "Design review.",
    html: `During a ${a(AI_TUTOR_LINKS.designWeek, "design of the week")} challenge, get a staff-engineer review of your draft before you submit it.`,
    text: `During a design of the week challenge, get a staff-engineer review of your draft before you submit it: ${AI_TUTOR_LINKS.designWeek}`,
  },
  {
    title: "Your privacy.",
    html: "What you send goes to Anthropic's AI to answer it. It isn't used to train models, and we keep it for 30 days to stop abuse.",
    text: "What you send goes to Anthropic's AI to answer it. It isn't used to train models, and we keep it for 30 days to stop abuse.",
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
  "The course has an AI tutor now. It's built to teach, not to hand you answers: it answers from the lessons, gives hints instead of solutions, and grades you honestly. Here's everything it can do, each with a real answer it gave.";

export function aiTutorHtml({ email, name }: AiTutorInput): string {
  const hi = firstName(name);
  const unsub = unsubscribeUrl(email);
  const index = BLOCKS.map((x) => `<li style="margin:0 0 4px 0;">${esc(x.title)}</li>`).join("");
  const also = ALSO.map((t) => `<li style="margin:0 0 8px 0;">${b(esc(t.title))} ${t.html}</li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(AI_TUTOR_SUBJECT)}</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(AI_TUTOR_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
  <tr>
    <td class="wrap" align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.line};">
        <!-- top bar -->
        <tr>
          <td class="pad" style="background:${C.black};padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${F_MONO};font-size:15px;font-weight:600;color:#F3F2EE;"><span style="color:${C.signal};">~</span>/himanshu</td>
              <td align="right" style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#A3A3A8;">new · ai tutor</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.signal};">&nbsp;</td></tr>
        <!-- hero -->
        <tr>
          <td class="pad" style="padding:36px 36px 8px 36px;">
            <div style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.ink3};margin:0 0 12px 0;">❯ system design mastery · ai tutor</div>
            <h1 class="h1" style="margin:0;font-family:${F_DISPLAY};font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.03em;color:${C.ink};">The course can answer back now<span style="color:${C.signal};">.</span></h1>
            <p style="margin:18px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${hi ? `Hi ${esc(hi)},` : "Hi there,"}</p>
            <p style="margin:10px 0 0 0;font-family:${F_BODY};font-size:16px;line-height:1.6;color:${C.ink2};">${esc(INTRO)}</p>
          </td>
        </tr>
        <!-- free note -->
        <tr>
          <td class="pad" style="padding:18px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.black};">
              <tr>
                <td style="padding:16px 20px;font-family:${F_BODY};font-size:15px;line-height:1.55;color:#E7E6E1;">
                  <span style="font-family:${F_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.signal};">free · limited time</span><br>
                  AI features are free for every signed-in learner, for a limited time. Each day you get a fresh allowance of AI credits.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- index -->
        <tr>
          <td class="pad" style="padding:24px 36px 6px 36px;">
            <div style="${TAG}margin:0 0 10px 0;">in this email</div>
            <ol style="margin:0;padding:0 0 0 20px;font-family:${F_BODY};font-size:15px;line-height:1.55;color:${C.ink2};">${index}</ol>
          </td>
        </tr>
        <tr>
          <td class="pad btn" style="padding:18px 36px 32px 36px;">
            ${button(AI_TUTOR_LINKS.lesson, "Ask a lesson something →")}
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
            ${button(AI_TUTOR_LINKS.hub, "Open the course →")}
          </td>
        </tr>
        <!-- sign-off -->
        <tr>
          <td class="pad" style="padding:18px 36px 34px 36px;">
            <p style="margin:0;font-family:${F_BODY};font-size:15px;line-height:1.6;color:${C.ink2};">Try one this week. If an answer looks wrong, reply to this email with what you asked. I read every reply, and it's how the tutor gets better.</p>
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

export function aiTutorText({ email, name }: AiTutorInput): string {
  const hi = firstName(name);
  return [
    hi ? `Hi ${hi},` : "Hi there,",
    "",
    INTRO,
    "",
    "AI features are free for every signed-in learner, for a limited time. Each day you get a fresh allowance of AI credits.",
    "",
    ...BLOCKS.flatMap((x) => [x.title.toUpperCase(), x.text, ...x.links.map((l, i) => `${i ? "Or " + l.label : l.label}: ${l.href}`), ""]),
    "ALSO",
    ...ALSO.map((t) => `- ${t.title} ${t.text}`),
    "",
    `The course: ${AI_TUTOR_LINKS.hub}`,
    "",
    "Try one this week. If an answer looks wrong, reply to this email with what you asked. I read every reply, and it's how the tutor gets better.",
    "",
    "Himanshu",
    "himanshukukreja.in",
    "",
    "--",
    `You're getting this course update because you signed up at himanshukukreja.in/learn with ${email}.`,
    `Unsubscribe: ${unsubscribeUrl(email)}`,
  ].join("\n");
}

export function aiTutorEmail(input: AiTutorInput) {
  return { subject: aiTutorSubject(input.name), html: aiTutorHtml(input), text: aiTutorText(input) };
}
