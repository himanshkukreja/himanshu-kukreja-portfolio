/**
 * The feature-video series ("watch how it works"): the welcome trailer, one 2–3 minute video per
 * feature (01–12) and the master full tour. Shown on /learn/guide, as the first-visit welcome card
 * on the course hub, and as a quiet "watch how it works" line on each feature page.
 *
 * Everything is behind NEXT_PUBLIC_GUIDE_VIDEOS=1; with it off, nothing on the site changes.
 * A video only appears once it is in ./published.json, which scripts/guide-videos/publish.mjs
 * writes after uploading it to R2 (guide-videos/<id>/…), so a half-finished series never shows
 * broken players. The manifest's measured duration and script.md chapters win over the ones here.
 *
 * Media base: NEXT_PUBLIC_GUIDE_VIDEO_MEDIA, else NEXT_PUBLIC_LECTURE_MEDIA with /lectures swapped for /guide-videos
 * (media.himanshukukreja.in), else /guide-videos-dev in `next dev` (publish.mjs --local).
 */
import manifest from "./published.json";

export const GUIDE_VIDEOS_ON = process.env.NEXT_PUBLIC_GUIDE_VIDEOS === "1";

export type GuideVideoId =
  | "welcome-trailer"
  | "getting-started"
  | "lectures-listen"
  | "shorts"
  | "side-quests"
  | "code-labs"
  | "arena-review"
  | "design-boss"
  | "mock-interviews"
  | "interview-prep"
  | "notebook"
  | "ai-tutor"
  | "progress-profile"
  | "full-tour";

export type Chapter = { t: number; label: string };

type Entry = {
  id: GuideVideoId;
  /** 0 the trailer, 1–12 the series, 99 the full tour */
  n: number;
  /** short card title */
  title: string;
  /** one line for the card */
  summary: string;
  /** seconds (fallback until published; the manifest's measured value wins) */
  duration: number;
  /** from script.md's YouTube chapters (fallback; the manifest's copy wins) */
  chapters: Chapter[];
  /** the feature page it explains */
  href: string;
  /** "Try it: <hrefLabel>" */
  hrefLabel: string;
  /** its section on /learn/guide (#anchor) */
  guide: string;
};

/** "1:08 A lesson's stages" lines → chapters. */
const ch = (lines: string): Chapter[] =>
  lines
    .trim()
    .split("\n")
    .map((l) => {
      const m = /^\s*(\d+):(\d\d)\s+(.+)$/.exec(l);
      return m ? { t: Number(m[1]) * 60 + Number(m[2]), label: m[3].trim() } : null;
    })
    .filter((c): c is Chapter => !!c);

const HUB = "/learn/system-design-mastery";

export const GUIDE_VIDEO_CATALOG: readonly Entry[] = [
  {
    id: "welcome-trailer",
    n: 0,
    title: "Welcome to System Design Mastery",
    summary: "Learn system design by doing, not watching: the whole course in two minutes.",
    duration: 123,
    chapters: ch(`
0:00 Learn by doing
0:11 Who it's for
0:25 The tour
1:47 Why it's different
1:54 Start free`),
    href: HUB,
    hrefLabel: "the course",
    guide: "overview",
  },
  {
    id: "getting-started",
    n: 1,
    title: "Getting started",
    summary: "The skill tree, a lesson's stages, XP and levels, and a day-by-day plan to your interview date.",
    duration: 157,
    chapters: ch(`
0:00 Getting started
0:10 The course hub
0:26 The skill tree: worlds, bosses, trials
0:51 A lesson's stages
1:08 Checkpoints, quick checks and XP
1:37 Checkpoints, levels and Continue
1:53 The study planner
2:25 Pick a world`),
    href: HUB,
    hrefLabel: "the course map",
    guide: "getting-started",
  },
  {
    id: "lectures-listen",
    n: 2,
    title: "Lectures and Listen",
    summary: "Every lesson as an animated lecture you can pause and ask about, plus narrated articles and the podcast.",
    duration: 134,
    chapters: ch(`
0:00 Lectures and Listen
0:10 An animated lecture for every lesson
0:40 Captions and speed
0:48 Ask about this moment
1:09 Quiz checkpoints and up next
1:36 Listen: every article, narrated
1:54 The podcast
2:03 Watch it. Ask it. Hear it.`),
    href: "/learn/prep/lectures",
    hrefLabel: "the lectures",
    guide: "lectures",
  },
  {
    id: "shorts",
    n: 3,
    title: "Shorts",
    summary: "One idea in under two minutes. Swipe, then jump into the full lecture at that idea.",
    duration: 121,
    chapters: ch(`
0:00 Shorts
0:11 Open Shorts
0:24 Sound, the rail, swipe
1:03 Topics, and the full lecture
1:30 Save it, read it, revise with it
1:44 On a laptop
1:50 Swipe. Learn. Go deeper.`),
    href: "/learn/shorts",
    hrefLabel: "Shorts",
    guide: "shorts",
  },
  {
    id: "side-quests",
    n: 4,
    title: "Side quests and war rooms",
    summary: "Real systems designed end to end, true war stories, and a live outage you work as the on-call engineer.",
    duration: 122,
    chapters: ch(`
0:00 Side quests and war rooms
0:11 Side quests: real systems end to end
0:28 Case files and war stories
0:47 A war room: you're on call
1:35 The debrief and the real incident
1:50 Your call`),
    href: "/learn/war-stories",
    hrefLabel: "war stories and war rooms",
    guide: "side-quests",
  },
  {
    id: "code-labs",
    n: 5,
    title: "Code labs",
    summary: "Write real Python in the browser, run real tests, and get AI hints that never hand you the answer.",
    duration: 135,
    chapters: ch(`
0:00 Write, run, get a hint
0:10 Sixteen labs, one per big idea
0:26 The brief and the tests
0:36 Python in the browser
0:48 Write get() and run
1:00 Nine of twelve
1:12 AI hints, never the answer
1:33 His fix: 12 of 12
1:44 An AI code review
1:56 On an iPad too
2:03 Write it, break it, fix it`),
    href: "/learn/labs",
    hrefLabel: "code labs",
    guide: "code-labs",
  },
  {
    id: "arena-review",
    n: 6,
    title: "Arena and review",
    summary: "The daily challenge, leagues and quick games, then spaced review that brings back what you missed.",
    duration: 140,
    chapters: ch(`
0:00 Play, miss, review
0:13 The Arena and the league
0:25 The daily challenge
0:57 Latency Ladder
1:16 Quick checks in every lesson
1:28 Revise mode, the night before
1:40 The Daily standup
2:08 Play, miss, review, remember`),
    href: "/learn/arena",
    hrefLabel: "the Arena",
    guide: "arena",
  },
  {
    id: "design-boss",
    n: 7,
    title: "Design canvas and boss fights",
    summary: "Draw your design, get a staff-engineer review from the AI, fix it, then fight the world's boss.",
    duration: 129,
    chapters: ch(`
0:00 Draw, get reviewed, fight the boss
0:11 Draw it on the canvas
0:32 A staff engineer's review
0:54 Fix it, review again
1:13 The boss fight
1:36 Trials
1:49 Design of the week
1:57 Draw, get reviewed, fix, fight`),
    href: "/learn/canvas",
    hrefLabel: "the design canvas",
    guide: "design-boss",
  },
  {
    id: "mock-interviews",
    n: 8,
    title: "Mock interviews",
    summary: "A timed interview with a named interviewer and curveballs, then a levelled debrief and a verdict.",
    duration: 134,
    chapters: ch(`
0:00 An interviewer who pushes back
0:11 Eight timed mock interviews
0:35 Clarify, with an AI interviewer
0:59 Estimates, and pushback
1:16 The deep dive and a curveball
1:37 The AI scorecard
2:02 Practise, get pushed, get graded`),
    href: "/learn/mock",
    hrefLabel: "mock interviews",
    guide: "mocks",
  },
  {
    id: "interview-prep",
    n: 9,
    title: "Interview prep",
    summary: "Company pages, the question and problem banks, cheat sheets and revision decks for the last stretch.",
    duration: 123,
    chapters: ch(`
0:00 What does Flipkart ask?
0:11 The prep tab
0:24 A page for every company
0:53 The question bank
1:04 Design sheets
1:18 The numbers playground
1:36 Cheat sheets
1:41 Concepts A to Z
1:50 Know the company, the questions, the numbers`),
    href: "/learn/prep",
    hrefLabel: "interview prep",
    guide: "prep",
  },
  {
    id: "notebook",
    n: 10,
    title: "Notebook",
    summary: "Handwritten notes beside every lesson that turn into text and check themselves against it.",
    duration: 150,
    chapters: ch(`
0:00 Notes that check themselves
0:10 The problem: two windows
0:20 The notebook beside every lesson
0:37 Clip, snip and ask
0:58 Lectures and the laptop split
1:08 Turn into text
1:16 Check against lesson
1:27 Review cards and revising by hand
1:41 Annotate the lesson, notes on a passage
1:56 Written papers, marked by AI; any stylus
2:18 Read, write, check, revise`),
    href: "/learn/notebook",
    hrefLabel: "the notebook",
    guide: "notebook",
  },
  {
    id: "ai-tutor",
    n: 11,
    title: "AI tutor",
    summary: "Ask any lesson, snip a diagram and ask about it, and get answers that quote the course.",
    duration: 117,
    chapters: ch(`
0:00 Plans, answers, grades, remembers
0:11 A plan from your progress
0:31 Answers with sources
0:47 Honest when the course doesn't cover it
1:05 Quiz, graded against the course
1:24 It remembers you
1:45 Plan, ask, get graded, pick up where you left off`),
    href: "/learn/chat",
    hrefLabel: "Ask",
    guide: "ai-tutor",
  },
  {
    id: "progress-profile",
    n: 12,
    title: "Progress and profile",
    summary: "Your streak, XP and level, concept mastery, certificates and a progress page you can share.",
    duration: 126,
    chapters: ch(`
0:00 Progress and profile
0:10 Your progress page
0:27 The course map and your rhythm
0:57 Your avatar
1:04 Share my progress
1:19 Certificates
1:36 Search and saved paths
1:50 Offline
1:55 Track it. Share it. Prove it.`),
    href: "/learn/dashboard",
    hrefLabel: "your progress",
    guide: "progress",
  },
  {
    id: "full-tour",
    n: 99,
    title: "The full tour",
    summary: "Every feature, end to end, in one video with chapters.",
    duration: 720,
    chapters: [],
    href: "/learn/guide",
    hrefLabel: "the guide",
    guide: "overview",
  },
];

type Published = { v: string; duration?: number; chapters?: Chapter[]; files?: string[] };
const PUBLISHED = (manifest as { videos?: Record<string, Published> }).videos || {};

export function guideMediaBase(): string {
  const own = process.env.NEXT_PUBLIC_GUIDE_VIDEO_MEDIA;
  if (own) return own.replace(/\/$/, "");
  const lecture = process.env.NEXT_PUBLIC_LECTURE_MEDIA;
  // the lecture base is <bucket>/lectures; the guide videos live beside it at <bucket>/guide-videos
  if (lecture) return `${lecture.replace(/\/$/, "").replace(/\/lectures$/, "")}/guide-videos`;
  return process.env.NODE_ENV === "development" ? "/guide-videos-dev" : "";
}

export type GuideVideo = Omit<Entry, "duration" | "chapters"> & {
  duration: number;
  chapters: Chapter[];
  /** 1080p H.264 */
  src: string;
  /** 1280×720 frame for the player */
  poster: string;
  /** 640×360 copy for cards */
  thumb: string;
  captions: string | null;
  /** a ~10 s muted loop (the trailer only) */
  preview: string | null;
  vertical: string | null;
};

function resolve(e: Entry): GuideVideo | null {
  const p = PUBLISHED[e.id];
  const base = guideMediaBase();
  if (!p || !base) return null;
  const has = (f: string) => !p.files || p.files.includes(f);
  const url = (f: string) => `${base}/${e.id}/${f}?v=${p.v}`;
  return {
    ...e,
    duration: p.duration || e.duration,
    chapters: p.chapters?.length ? p.chapters : e.chapters,
    src: url("video-1080p.mp4"),
    poster: url("poster.jpg"),
    thumb: has("thumb.jpg") ? url("thumb.jpg") : url("poster.jpg"),
    captions: has("captions.vtt") ? url("captions.vtt") : null,
    preview: p.files?.includes("preview.mp4") ? url("preview.mp4") : null,
    vertical: p.files?.includes("video-9x16.mp4") ? url("video-9x16.mp4") : null,
  };
}

/** Every published video in series order (trailer, 01–12, full tour); empty when the flag is off. */
export const GUIDE_VIDEOS: readonly GuideVideo[] = GUIDE_VIDEOS_ON ? GUIDE_VIDEO_CATALOG.map(resolve).filter((v): v is GuideVideo => !!v) : [];

export const guideVideo = (id: GuideVideoId | string): GuideVideo | null => GUIDE_VIDEOS.find((v) => v.id === id) || null;
/** The twelve feature videos that are published. */
export const FEATURE_VIDEOS = GUIDE_VIDEOS.filter((v) => v.n >= 1 && v.n <= 12);
export const SERIES_SIZE = GUIDE_VIDEO_CATALOG.filter((v) => v.n >= 1 && v.n <= 12).length;

/** The guide section that explains a video's feature (works with the flag off: the guide is always written). */
export function guideHref(id: GuideVideoId): string {
  const e = GUIDE_VIDEO_CATALOG.find((v) => v.id === id);
  return `/learn/guide#${e?.guide || "overview"}`;
}

/** 157 → "2:37" */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 157 → "3-min" (for "Watch the 2-min intro") */
export const fmtMinutes = (sec: number) => `${Math.max(1, Math.round(sec / 60))}-min`;

/** The chapter whose label starts with `label` (case-insensitive), for links that open a video at a part. */
export function chapterAt(v: GuideVideo, label?: string): number {
  if (!label) return 0;
  const want = label.toLowerCase();
  return v.chapters.find((c) => c.label.toLowerCase().startsWith(want))?.t ?? 0;
}

// ------------------------------------------------------------------------------ opening the player

export const OPEN_EVENT = "hk:guide-video";
export type OpenDetail = { id: string; at?: number; from: string };

/** Open the shared player modal (mounted once in the learn layout by <GuideVideoHost/>). */
export function openGuideVideo(id: string, from: string, at?: number) {
  window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail: { id, from, at } }));
}
