/**
 * Starting points for a campaign. The learn-revamp, offline-app and practice-toolkit announcements and
 * the welcome email are generated from their source modules (src/lib/announce/learn-revamp.ts,
 * src/lib/announce/offline-app.ts, src/lib/announce/practice-toolkit.ts, src/lib/email/welcome.ts), so edits to
 * those files flow through and a campaign sends exactly the approved design:
 *
 *   render once with a sentinel name and once without → line diff → name-dependent lines become
 *   `{{#if first_name}}…{{else}}…{{/if}}`, the sentinel becomes `{{first_name}}`, the address and its
 *   unsubscribe link become `{{email}}` / `{{unsubscribe_url}}` (per-recipient token link).
 *
 * The blank newsletter is a block document in the same layout.
 */
import { ANNOUNCE_KEY, announceSubject, learnRevampHtml, learnRevampText, unsubscribeUrl } from "@/lib/announce/learn-revamp";
import { OFFLINE_APP_KEY, OFFLINE_APP_PREHEADER, offlineAppHtml, offlineAppSubject, offlineAppText } from "@/lib/announce/offline-app";
import { PRACTICE_TOOLKIT_KEY, PRACTICE_TOOLKIT_PREHEADER, practiceToolkitHtml, practiceToolkitSubject, practiceToolkitText } from "@/lib/announce/practice-toolkit";
import { WATCH_TRY_KEY, WATCH_TRY_PREHEADER, watchTryHtml, watchTrySubject, watchTryText } from "@/lib/announce/watch-and-try";
import { AI_TUTOR_KEY, AI_TUTOR_PREHEADER, aiTutorHtml, aiTutorSubject, aiTutorText } from "@/lib/announce/ai-tutor";
import { LECTURES_SHORTS_KEY, LECTURES_SHORTS_PREHEADER, lecturesShortsHtml, lecturesShortsSubject, lecturesShortsText } from "@/lib/announce/lectures-shorts";
import { WELCOME_PREHEADER, welcomeHtml, welcomeSubject, welcomeText, welcomeUnsubscribeUrl } from "@/lib/email/welcome";
import { newBlockId, type BlocksDoc, type RawDoc } from "./render";
import type { TemplateInfo } from "./types";

const S_NAME = "Zqxmergefirst";
const S_EMAIL = "zqx.merge.email@example.invalid";

/** Line-level LCS diff of a (named) vs b (anonymous), name-dependent hunks wrapped in a conditional. */
function mergeVariants(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = la.length;
  const m = lb.length;
  const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = la[i] === lb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  let ha: string[] = [];
  let hb: string[] = [];
  const flush = () => {
    if (!ha.length && !hb.length) return;
    out.push(`{{#if first_name}}${ha.join("\n")}{{else}}${hb.join("\n")}{{/if}}`);
    ha = [];
    hb = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && la[i] === lb[j]) {
      flush();
      out.push(la[i]);
      i++;
      j++;
    } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) hb.push(lb[j++]);
    else ha.push(la[i++]);
  }
  flush();
  return out.join("\n");
}

function toTags(s: string, unsub: string): string {
  return s
    .split(unsub)
    .join("{{unsubscribe_url}}")
    .split(encodeURIComponent(S_EMAIL))
    .join("{{email}}")
    .split(S_EMAIL)
    .join("{{email}}")
    .split(S_NAME)
    .join("{{first_name}}");
}

function fromSource(render: (i: { email: string; name: string | null }) => string, unsub: string): string {
  return toTags(mergeVariants(render({ email: S_EMAIL, name: S_NAME }), render({ email: S_EMAIL, name: null })), unsub);
}

function subjectTemplate(fn: (name: string | null) => string) {
  return { subject: fn(S_NAME).split(S_NAME).join("{{first_name}}"), subjectFallback: fn(null) };
}

function learnRevampTemplate(): TemplateInfo {
  const unsub = unsubscribeUrl(S_EMAIL);
  const doc: RawDoc = { layout: "raw", source: "src/lib/announce/learn-revamp.ts", html: fromSource(learnRevampHtml, unsub), text: fromSource(learnRevampText, unsub) };
  const pre = /<div style="display:none[^>]*>([^<&]*)/.exec(doc.html)?.[1]?.trim() ?? null;
  return {
    id: "learn-revamp",
    name: "Learn revamp announcement",
    description: "The “course, rebuilt” patch notes email for every account. Generated from src/lib/announce/learn-revamp.ts.",
    topic: ANNOUNCE_KEY,
    ...subjectTemplate(announceSubject),
    preheader: pre,
    doc,
  };
}

function offlineAppTemplate(): TemplateInfo {
  const unsub = unsubscribeUrl(S_EMAIL);
  const doc: RawDoc = { layout: "raw", source: "src/lib/announce/offline-app.ts", html: fromSource(offlineAppHtml, unsub), text: fromSource(offlineAppText, unsub) };
  return {
    id: "offline-app",
    name: "Offline course + app",
    description: "Announces the installable app and offline reading, with a 5-step setup guide and screenshots (iPhone, Android, laptop). Generated from src/lib/announce/offline-app.ts.",
    topic: OFFLINE_APP_KEY,
    ...subjectTemplate(offlineAppSubject),
    preheader: OFFLINE_APP_PREHEADER,
    doc,
  };
}

function practiceToolkitTemplate(): TemplateInfo {
  const unsub = unsubscribeUrl(S_EMAIL);
  const doc: RawDoc = { layout: "raw", source: "src/lib/announce/practice-toolkit.ts", html: fromSource(practiceToolkitHtml, unsub), text: fromSource(practiceToolkitText, unsub) };
  return {
    id: "practice-toolkit",
    name: "What's new: practice toolkit, trials, mocks, explainers",
    description:
      "The Practice tab (revision decks, cheat sheets, code labs, mock interviews, Design of the week, numbers, planner, concept map, reading trail), trials for weeks 3-10, explainers and side quests 12-15, with screenshots. Generated from src/lib/announce/practice-toolkit.ts.",
    topic: PRACTICE_TOOLKIT_KEY,
    ...subjectTemplate(practiceToolkitSubject),
    preheader: PRACTICE_TOOLKIT_PREHEADER,
    doc,
  };
}

function watchTryTemplate(): TemplateInfo {
  const unsub = unsubscribeUrl(S_EMAIL);
  const doc: RawDoc = { layout: "raw", source: "src/lib/announce/watch-and-try.ts", html: fromSource(watchTryHtml, unsub), text: fromSource(watchTryText, unsub) };
  return {
    id: "watch-and-try",
    name: "What's new: five tabs, prep by company, war stories, side quests 16-21",
    description:
      "The five tabs; Interview prep (45 company pages, 452 reported questions with sources, the question bank); War stories (20 real stories, 5 war rooms); side quests 16-21 and a design sheet for every quest; 141 narrated explainers and break-it labs; peer mocks; reminders, PDF/Anki. With screenshots. Generated from src/lib/announce/watch-and-try.ts.",
    topic: WATCH_TRY_KEY,
    ...subjectTemplate(watchTrySubject),
    preheader: WATCH_TRY_PREHEADER,
    doc,
  };
}

function aiTutorTemplate(): TemplateInfo {
  const unsub = unsubscribeUrl(S_EMAIL);
  const doc: RawDoc = { layout: "raw", source: "src/lib/announce/ai-tutor.ts", html: fromSource(aiTutorHtml, unsub), text: fromSource(aiTutorText, unsub) };
  return {
    id: "ai-tutor",
    name: "What's new: the AI tutor",
    description:
      "The AI features only (free for signed-in learners for a limited time): ask this lesson, code-lab hints and review, explain it back, the AI mock interviewer and scorecard, war-room moves, plus questions learners ask, design review and privacy. Each with a screenshot of a real answer. Generated from src/lib/announce/ai-tutor.ts.",
    topic: AI_TUTOR_KEY,
    ...subjectTemplate(aiTutorSubject),
    preheader: AI_TUTOR_PREHEADER,
    doc,
  };
}

function lecturesShortsTemplate(): TemplateInfo {
  const unsub = unsubscribeUrl(S_EMAIL);
  const doc: RawDoc = { layout: "raw", source: "src/lib/announce/lectures-shorts.ts", html: fromSource(lecturesShortsHtml, unsub), text: fromSource(lecturesShortsText, unsub) };
  return {
    id: "lectures-shorts",
    name: "What's new: lectures for everything, mock interview videos, Shorts",
    description:
      "193 narrated lectures (~50 h) for every lesson, side quest, problem, LLD lesson and case file; 8 recorded mock interviews; the Shorts feed; plus share links, side quests 22-25, LLD 9-22 and 30 war stories. With screenshots. Generated from src/lib/announce/lectures-shorts.ts.",
    topic: LECTURES_SHORTS_KEY,
    ...subjectTemplate(lecturesShortsSubject),
    preheader: LECTURES_SHORTS_PREHEADER,
    doc,
  };
}

function welcomeTemplate(): TemplateInfo {
  const unsub = welcomeUnsubscribeUrl(S_EMAIL);
  const doc: RawDoc = { layout: "raw", source: "src/lib/email/welcome.ts", html: fromSource(welcomeHtml, unsub), text: fromSource(welcomeText, unsub) };
  return {
    id: "welcome",
    name: "Welcome email",
    description: "The new-account welcome (light theme). Use it for people who signed up before it existed. Generated from src/lib/email/welcome.ts.",
    topic: "welcome",
    ...subjectTemplate(welcomeSubject),
    preheader: WELCOME_PREHEADER,
    doc,
  };
}

export function blankDoc(): BlocksDoc {
  return {
    layout: "blocks",
    topLabel: "newsletter",
    footer: "You're getting this because you have an account or subscribed at himanshukukreja.in with {{email}}.",
    blocks: [
      { id: newBlockId(), type: "hero", eyebrow: "❯ system design mastery", title: "A headline that earns the open." },
      { id: newBlockId(), type: "text", md: "Hi {{first_name|there}},\n\nWrite the update here. **Bold**, *italic*, [links](https://www.himanshukukreja.in/learn) and lists work.\n\n- You're on a **{{streak}}-day** streak\n- {{lessons_completed}} lessons done so far" },
      { id: newBlockId(), type: "button", label: "Pick up where you left off →", url: "{{resume_url}}" },
      { id: newBlockId(), type: "text", md: "Reply to this email if anything looks off. I read every reply.\n\nHimanshu" },
    ],
  };
}

function blankTemplate(): TemplateInfo {
  return {
    id: "blank",
    name: "Blank newsletter",
    description: "Editable blocks (markdown text, buttons, features, a dark callout, images, raw HTML) in the site's email layout.",
    topic: "newsletter",
    subject: "{{first_name}}, a quick update from System Design Mastery",
    subjectFallback: "A quick update from System Design Mastery",
    preheader: "What's new this week, in two minutes.",
    doc: blankDoc(),
  };
}

/**
 * "Case file update": the card + a placeholder document; the composer swaps in the generated email
 * for the story picked in its dropdown (GET /api/admin/newsletter/stories, src/lib/campaigns/story.ts).
 */
function storyTemplate(): TemplateInfo {
  return {
    id: "story",
    name: "Case file update",
    description: "Pick a story from a dropdown: cover, case id, hook, what you'll learn, the end-of-case challenge and a tracked “Read the case file” button.",
    topic: "story",
    subject: "{{first_name}}, new case file",
    subjectFallback: "New case file",
    preheader: null,
    doc: { ...blankDoc(), topLabel: "case files", blocks: [] },
  };
}

export function listTemplates(): TemplateInfo[] {
  const out: TemplateInfo[] = [];
  for (const make of [storyTemplate, lecturesShortsTemplate, aiTutorTemplate, watchTryTemplate, practiceToolkitTemplate, offlineAppTemplate, learnRevampTemplate, welcomeTemplate, blankTemplate]) {
    try {
      out.push(make());
    } catch (e) {
      console.error("[campaigns] template failed", e);
    }
  }
  return out;
}

export function getTemplate(id: string): TemplateInfo | null {
  return listTemplates().find((t) => t.id === id) ?? null;
}
