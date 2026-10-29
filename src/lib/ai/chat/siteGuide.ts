/**
 * How the platform works, for the course chat's site_guide tool: one entry per topic of the course guide
 * (/learn/guide, src/components/learn/guide/Guide.tsx) and the pages it describes, each with the real link
 * the chat cites. The text is condensed from the guide itself; when the guide changes, change it here too
 * (scripts/smart-search-check.ts checks every href points at a page that exists).
 * Pure: the route and the eval share it. Ids are stable ("G:<id>"): a conversation's earlier refs resolve again.
 */

export type GuideTopic = { id: string; title: string; href: string; keywords: string; text: string };

export const SITE_GUIDE: GuideTopic[] = [
  {
    id: "overview",
    title: "How the course works",
    href: "/learn/guide#overview",
    keywords: "start begin course structure tabs navigation overview",
    text: "System Design Mastery is free. The Learn header has the tabs course · prep · arena · ask · shorts · stories · you (on phones, the dock at the bottom). Course is the skill tree of weeks (worlds), side quests and concepts; Prep is everything for the interview; Ask is this chat; Arena is the daily challenge, leagues and games; Shorts are one-minute videos; Stories are real incidents and war rooms; You is your progress, notebook, saved paths and certificates. Everything works as a guest; signing in keeps progress on every device.",
  },
  {
    id: "map",
    title: "The course map: worlds, lessons, bosses, trials",
    href: "/learn/guide#map",
    keywords: "course map skill tree world week lesson stage boss capstone trial side quest order where to start",
    text: "A world is one week: a Preview, day lessons, then a boss (a timed mock-interview capstone) and, for most weeks, a trial: the week's multiple-choice questions in parts. Week 00 has eight Foundations parts. Lessons are split into stages; progress is saved by stage. Clear every lesson, the boss and every trial part of a world for its badge and bonus XP. Nothing is locked: new to system design, start at Week 00; side quests (real systems like UPI and WhatsApp) are open any time.",
  },
  {
    id: "lesson",
    title: "Reading a lesson and its tools",
    href: "/learn/guide#lesson",
    keywords: "lesson reader stage rail focus text size listen terms ask ai contents quick check explainer diagram",
    text: "The stage rail shows each stage with its minutes; Save checkpoint bookmarks your place. Reading tools (bottom right on a computer, the bottom toolbar on a phone): Listen reads the lesson aloud, Focus hides everything but the article, Aa cycles the text size, TERMS toggles the term cards. Quick checks are short MCQs inside lessons (first try pays XP). Explainers animate an idea step by step; every lesson ends with a revision card, any code lab, questions learners ask and the reading trail.",
  },
  {
    id: "listen",
    title: "Listen: hear a lesson read aloud",
    href: "/learn/guide#lesson",
    keywords: "listen read aloud audio voice tts podcast hear speed",
    text: "Listen (in the reading tools, and on war stories, case files and mock answers) reads the page aloud. A recorded natural voice plays where one exists, else your browser's voice; a player strip lets you go back or forward a paragraph, pause and change the speed. Time spent listening counts as reading. Lesson narrations are also a podcast feed (/learn/podcast).",
  },
  {
    id: "lectures",
    title: "Video lectures",
    href: "/learn/guide#lectures",
    keywords: "video lecture watch playlist player speed captions resume autoplay ask about this moment checkpoint",
    text: "Lessons, side quests, problems, LLD rounds, case files and mocks have an animated video lecture. Prep → Video lectures lists them in course order. The player has captions, speed 0.75× to 2×, picture-in-picture, full screen (F) and keyboard control; it resumes where you stopped and plays the next lecture in the track after an 8-second countdown. Quiz checkpoints pause it to ask a question; Ask about this moment (A) asks the AI about the paused moment. Watching needs a free account after the first minute.",
  },
  {
    id: "shorts",
    title: "Shorts",
    href: "/learn/shorts",
    keywords: "shorts reels vertical video one minute speed faster slower mute",
    text: "Shorts are one-idea vertical videos, each cut from a lecture. Swipe through them in the shorts tab. Speed: the 1.0× chip beside the mute button, or ] / > faster and [ / < slower by 0.1 (0.5× to 2×), \\ back to 1×; one speed for every short, remembered on the device. Each short links to the full lecture.",
  },
  {
    id: "completion",
    title: "When a lesson counts as done",
    href: "/learn/guide#completion",
    keywords: "complete progress not completing mark complete stage cleared reading time why didn't my lesson complete",
    text: "A stage counts after real reading time in it with most of it on screen; jumping through the contents, scrolling fast, a background tab or idling doesn't count (Listen does). When every required stage is read the lesson completes by itself; Mark complete unlocks at the end once most of the reading time is in. Optional stages never block completion. Done stays done.",
  },
  {
    id: "notebook",
    title: "Notebook: highlights, notes, bookmarks",
    href: "/learn/notebook",
    keywords: "notebook highlight note bookmark export markdown select text",
    text: "Select text in a lesson to highlight it (four colours), attach a note, bookmark it, ask an AI about it or copy a link to that exact line. The Notebook (You tab) has Highlights, Notes and Bookmarks with search and filters, turns a highlight into a review card, and exports Markdown. These need a free account.",
  },
  {
    id: "review",
    title: "Review cards and the daily standup",
    href: "/learn/review",
    keywords: "review cards spaced repetition standup due leitner boxes revise flashcards",
    text: "Questions you miss in a trial, answers you flagged as a guess and highlights you turn into cards join your review queue. The daily standup shows cards due today (the number on the Arena tab); recall, show the answer and grade yourself; cards move through five boxes with growing intervals.",
  },
  {
    id: "trials",
    title: "Trials and boss fights",
    href: "/learn/guide#trials",
    keywords: "trial mcq quiz test pass mark boss capstone interview mode retake",
    text: "Trials are a week's multiple-choice questions in parts of about 15–30, each opening after its lesson. Pass mark is shown on the page; a failed part rests a few minutes and returns in a new order, and misses go to your review queue. Each world ends with a boss: a full system design interview with per-phase time budgets, graded against the capstone's checklist, or read in Read mode.",
  },
  {
    id: "mocks",
    title: "Mock interviews",
    href: "/learn/mock",
    keywords: "mock interview interviewer round lobby whiteboard debrief verdict hire peer mock practice with a person",
    text: "Mock interviews sit between the worlds and cover everything up to that point. Each opens on a lobby (the company, the interviewer, the level you aim for) with a recorded model round to watch first. In the room: phases with budgets, a whiteboard canvas, curveballs, a live coach and an AI interviewer when signed in. The debrief scores the levelled rubric and gives a verdict; Hire or better earns bonus XP. Peer mocks (/learn/mock/peers) pair you with another learner over a free video room.",
  },
  {
    id: "prep",
    title: "Interview prep: companies, problems, LLD, tools",
    href: "/learn/prep",
    keywords: "prep interview company pages question bank problem bank low level design lld machine coding numbers playground study planner revision cheat sheet design sheets labs",
    text: "The Prep tab holds the video lectures, mock interviews, company pages (topics they ask, questions reported by candidates with sources, likely ones labelled as ours), the question bank, the problem bank (URL shortener, rate limiter, chat…), low-level design rounds (parking lot, LRU cache, Splitwise…), revision decks, cheat sheets, design sheets, code labs, the numbers playground and the study planner.",
  },
  {
    id: "revise",
    title: "Revision decks and cheat sheets",
    href: "/learn/revise",
    keywords: "revise revision deck cheat sheet pdf anki interview night five minutes",
    text: "A revision deck boils a lesson down to about five minutes of cards (key ideas, numbers, trade-offs, classic mistakes, what the interviewer asks); mark Got it or Again (Again joins your standup). A cheat sheet is a whole world on one printable page (Download PDF). There is also every cheat sheet as one PDF and an Anki export of all revision cards.",
  },
  {
    id: "sheets",
    title: "Design sheets",
    href: "/learn/sheets",
    keywords: "design sheet side quest architecture diagrams pdf revise quest",
    text: "A design sheet is a side quest's whole design on a few pages: numbers, architecture, key flows, data model, state machine, decisions, failure handling and interview lines, printable as PDF. Every side quest ends with a link to its sheet.",
  },
  {
    id: "labs",
    title: "Code labs",
    href: "/learn/labs",
    keywords: "code lab python implement token bucket lru consistent hashing run tests hints solution",
    text: "A code lab is an implement-this-component interview round taken from a lesson (token bucket, LRU cache, consistent hashing ring, outbox relay and more). Write Python in the browser (it runs on your device), press Run tests, use hints when stuck; the solution unlocks after a few runs. Passing every test clears it for XP.",
  },
  {
    id: "planner",
    title: "Study planner",
    href: "/learn/plan",
    keywords: "study plan planner schedule interview date calendar ics days minutes per day",
    text: "Pick your interview date, the days and minutes you can study and what to include; the planner lays out a day-by-day plan from your real progress, moves it when you fall behind or race ahead, and exports it to your calendar (.ics or Google Calendar).",
  },
  {
    id: "numbers",
    title: "Numbers playground",
    href: "/learn/numbers",
    keywords: "numbers estimation back of the envelope calculator qps storage bandwidth latency numbers",
    text: "Type an estimate the way you would say it (50k QPS × 2 KB × 30 days) and get the answer with every step and unit, plus the latency, throughput and size numbers the course teaches, each linked to its lesson.",
  },
  {
    id: "canvas",
    title: "Design canvas",
    href: "/learn/canvas",
    keywords: "design canvas draw diagram excalidraw whiteboard ai review",
    text: "The design canvas lets you draw a design for a problem, a capstone or your own idea on a whiteboard and get an AI review of it when signed in.",
  },
  {
    id: "arena",
    title: "The Arena: daily challenge, leagues and games",
    href: "/learn/arena",
    keywords: "arena daily challenge leaderboard league points games playground design of the week",
    text: "The daily challenge is five timed questions, the same for everyone, rolling over at midnight IST; only the first run counts. Signed-in learners are ranked weekly by leaderboard points in leagues (top players move up each Monday). Quick games are 60–90 second rounds; Playground boards are longer simulations. Design of the week is one open problem a week with community votes.",
  },
  {
    id: "xp",
    title: "XP, levels, quests and badges",
    href: "/learn/guide#xp",
    keywords: "xp level badge quest points difference rank",
    text: "XP is your running total and sets your level (L1 Intern up to L6 Principal); lessons, stages, trials, bosses, worlds, mocks, labs and games pay it. Quests are one-time goals; badges mark milestones like a cleared world. Leaderboard points are a separate weekly score that decides your league.",
  },
  {
    id: "progress",
    title: "Your progress page",
    href: "/learn/dashboard",
    keywords: "progress dashboard you tab streak goal heatmap watch time reminders data export import reset",
    text: "The progress page (You tab) shows your level, course %, streak, a course map grid, your activity heatmap, video watch time, a weekly goal, what stuck (trial scores, review boxes), streak reminders (push or email, off until you switch them on), and your data: download, import guest progress, or reset.",
  },
  {
    id: "saved",
    title: "Saved learning paths",
    href: "/learn/saved",
    keywords: "saved paths learning path save follow tick checklist",
    text: "Learning paths you save from search or this chat live under You → Saved paths, as checklists you tick off; signed in, they follow you to every device.",
  },
  {
    id: "share",
    title: "Sharing your progress",
    href: "/learn/guide#share",
    keywords: "share public profile page handle link linkedin whatsapp",
    text: "Turn on a public progress page in the share section of the Progress page and choose what it shows; it is off until you turn it on, and your email, notes and exact study times are never shown.",
  },
  {
    id: "certificates",
    title: "Certificates",
    href: "/learn/certificate",
    keywords: "certificate certified course world linkedin pdf verify open badge requirements accredited",
    text: "The course certificate needs every core lesson completed, every capstone read, every trial part passed, every boss beaten in boss mode and a set number of different mock interviews scored Hire or better; each world has its own certificate too. Claim it on the certificate page (You tab), signed in: it checks your account's records, then you can add it to LinkedIn, download a PDF, share a verify link (/cert/<ID>) or an Open Badge. It is not an accredited qualification.",
  },
  {
    id: "offline",
    title: "Reading offline and installing the app",
    href: "/learn/offline",
    keywords: "offline save download no internet app install home screen library storage",
    text: "Save offline sits next to the title of lessons, quests, trials, mocks, case files and lectures (about 10–20 MB a lecture); the Read offline card can save the whole course. The offline library (the cloud icon in the course header) lists what is saved. Offline, saved pages, quick checks and XP all work, and progress syncs when you are back. Install the course as an app from the library (on iPhone: Share → Add to Home Screen).",
  },
  {
    id: "cases",
    title: "Case files",
    href: "/stories",
    keywords: "case file story incident activity debrief monday",
    text: "Case files are long-form stories of one system under pressure, each with an explainer, a lecture and often an interactive activity at the end; a new one comes out every Monday. The built-in AI answers questions about the case you are reading.",
  },
  {
    id: "war-stories",
    title: "War stories and war rooms",
    href: "/learn/war-stories",
    keywords: "war stories outages real incidents war room on call simulation postmortem",
    text: "War stories are short, sourced write-ups of real outages and launches. War rooms drop you into an incident as the on-call engineer: make the calls, see what each costs, then read the blameless postmortem and the real incident it is modelled on.",
  },
  {
    id: "search",
    title: "Search and this chat",
    href: "/learn/search",
    keywords: "search find ask chat tutor cmd k smart search",
    text: "The search box (⌘K) finds lessons, quests, problems, lecture moments and more as you type. The Ask tab (/learn/search) is this chat: it searches the whole course, answers with sources, finds the second in a lecture, builds and saves learning paths, quizzes you on the course's own questions and suggests what to do next from your progress. It is free for signed-in learners within a daily allowance.",
  },
  {
    id: "ai",
    title: "AI in the course and your data",
    href: "/learn/guide#ai",
    keywords: "ai credits own key privacy what is sent anthropic data kept 30 days memory",
    text: "Signed-in learners get a daily AI allowance (the chat has its own daily messages). You can add your own Anthropic key on the Progress page. What you type into an AI feature goes to Anthropic's AI to answer it, is not used to train models, and is kept 30 days to stop abuse. The chat's memory of your learning lives under You → What the tutor remembers, where you can clear it.",
  },
  {
    id: "account",
    title: "Accounts and privacy",
    href: "/learn/guide#account",
    keywords: "account sign in google email guest privacy analytics opt out data",
    text: "Everything works as a guest; sign in with Google or an email code to keep progress on every device, use the Notebook and be ranked. Your guest progress in that browser is merged when you first sign in. The privacy page lists every tool and lets you turn analytics off.",
  },
];

const BY_ID = new Map(SITE_GUIDE.map((t) => [t.id, t]));
export const guideTopic = (id: string) => BY_ID.get(id) ?? null;

const STOP = new Set("the and for how does work works what where when why can are this that with from into about there here does doe".split(" "));
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));

/** The topics best matching a question (keyword and title words count most). */
export function findGuide(q: string, n = 3): GuideTopic[] {
  const qs = new Set(words(q));
  if (!qs.size) return SITE_GUIDE.slice(0, n);
  const score = (t: GuideTopic) => {
    let s = 0;
    const kw = new Set(words(`${t.keywords} ${t.title}`));
    const body = new Set(words(t.text));
    for (const w of qs) s += (kw.has(w) ? 3 : 0) + (body.has(w) ? 1 : 0);
    return s;
  };
  return SITE_GUIDE.map((t) => ({ t, s: score(t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.t);
}
