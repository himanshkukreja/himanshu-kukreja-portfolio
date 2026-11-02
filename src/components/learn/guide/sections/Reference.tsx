/** After the twelve features: accounts and data, the FAQ and the glossary. */
import Link from "next/link";
import { A, PROSE, Section, Where } from "../ui";
import { POINTS, RUNTIME_DOWNLOAD_LABEL, RUNTIME_STORED_LABEL, TRIAL_COOLDOWN_MIN } from "../facts";
import { COURSE, LECTURE_QUIZ_XP } from "./types";

export default function Reference() {
  return (
    <>
      <Section id="account" kicker="reference · accounts, privacy & data" title="Do you need an account?" lead="No. Every lesson, quick check, trial, boss, game and the daily challenge work without one. An account adds a few things.">
        <ul className="m-0 grid max-w-[72ch] list-none gap-px border border-line bg-line p-0 sm:grid-cols-2">
          {[
            ["Progress on every device", "Lessons, stages, XP, review cards and trial attempts follow you instead of living in one browser."],
            ["Notebook", "Highlights, notes and bookmarks are account-only."],
            ["Leaderboard & leagues", "Only signed-in activity is ranked."],
            ["Nothing lost", "Clearing your browser or switching phones keeps your history."],
            ["Share your progress", "A public page and share links come from your account. Off until you turn it on."],
          ].map(([t, d], i, all) => (
            <li key={t} className={`flex flex-col gap-1 bg-bg p-4 ${i === all.length - 1 && all.length % 2 ? "sm:col-span-2" : ""}`}>
              <span className="text-[15px] font-semibold text-fg">{t}</span>
              <span className="text-[14px] leading-relaxed text-fg-2">{d}</span>
            </li>
          ))}
        </ul>
        <div className={PROSE}>
          <p>
            Sign in with Google or an email code from the arrow button in the header. The first account that signs in on a browser picks up that browser&apos;s guest progress; a second account on the same browser starts from its own.
          </p>
          <p>
            <strong>What&apos;s stored:</strong> page views and reading time, learning events (lessons opened and completed, answers, games), and if you sign in your email, name and progress. No ads, nothing sold, and nothing about you is public unless you turn on a <a href="#share" className="text-signal-text underline underline-offset-4">share page</a>. The{" "}
            <A href="/privacy">privacy page</A> lists every tool and has a switch to turn analytics off in your browser (also &ldquo;opt out&rdquo; in the site footer).
          </p>
        </div>
        <Where>
          sign in from the header; <A href="/dashboard#data">progress → your data</A> to export or reset; <A href="/privacy">privacy &amp; analytics</A> to opt out.
        </Where>
      </Section>

      {/* ------------------------------------------------------------ l) faq */}
      <Section id="faq" kicker="reference · faq" title="Questions people actually ask">
        <div className="flex max-w-[78ch] flex-col border-t border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-line">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[16px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center border border-line-strong font-mono text-fg-3 group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="pb-5 pr-10 text-[15px] leading-relaxed text-fg-2 [&_a]:font-semibold [&_a]:text-signal-text [&_a]:underline [&_a]:underline-offset-4">{a}</div>
            </details>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ glossary */}
      <Section id="glossary" kicker="reference · glossary" title="Words the course uses">
        <dl className="m-0 grid max-w-[78ch] gap-px border border-line bg-line sm:grid-cols-2">
          {GLOSSARY.map(([t, d]) => (
            <div key={t} className="flex flex-col gap-1 bg-bg p-4">
              <dt className="font-mono text-[13px] font-semibold uppercase tracking-label text-fg">{t}</dt>
              <dd className="m-0 text-[14px] leading-relaxed text-fg-2">{d}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={COURSE} className="inline-flex min-h-12 items-center bg-signal px-6 text-[15px] font-semibold text-on-signal hover:brightness-110">
            Start learning →
          </Link>
          <a href="#overview" className="inline-flex min-h-12 items-center border border-line-strong px-5 text-[15px] text-fg hover:bg-surface-2">
            Back to top ↑
          </a>
        </div>
      </Section>
    </>
  );
}

const FAQ: [string, React.ReactNode][] = [
  [
    "Do the videos remember where I stopped?",
    <>
      Yes. Each lecture resumes where you left it, and the <A href="/prep/lectures">playlist</A> shows continue watching, how much of each lecture you have seen and a watched mark at 90%. Signed in, this follows you to
      your other devices.
    </>,
  ],
  [
    "Does the next lecture play by itself?",
    <>
      Yes, in the same track: when a lecture ends, the next lesson&apos;s (or side quest&apos;s, problem&apos;s…) lecture starts after an 8-second countdown. Press <strong>cancel</strong> to stay, or untick <strong>autoplay next</strong> on the
      end screen or under up next to turn it off. See <a href="#lectures-autoplay">up next and autoplay</a>.
    </>,
  ],
  [
    "Can I watch the lectures offline?",
    <>
      Yes. Press <strong>Save offline</strong> under a lecture&apos;s title, or save a whole playlist section from the <Link href="/offline#lectures">offline library</Link>. Each lecture is about 10–20 MB, so save them on wifi.
      Asking the AI about a moment needs a connection.
    </>,
  ],
  [
    "Should I watch the lecture or read the lesson?",
    <>
      Either, or both. The lecture covers the lesson&apos;s core ideas, trade-offs and numbers in 7–25 minutes; the written lesson has every detail, the code and the stages that count toward completion. Many learners watch first,
      then read.
    </>,
  ],
  [
    "Is the certificate accredited?",
    <>
      No. It certifies that you completed an online course: every lesson, trial, boss and a mock interview, checked from your account&apos;s records and verifiable at its own link. It is not an accredited academic qualification, and no
      institution or employer stands behind it. What it does show is real: the numbers on it come from your own work, and anyone can check the ID. See <a href="#certificates">certificates</a>.
    </>,
  ],
  [
    "Why didn't my lesson complete?",
    <>
      A stage only counts after real reading time in it with most of it on screen. Jumping through the contents, scrolling fast, leaving the tab in the background or sitting idle doesn&apos;t count. Look at the stage rail: stages without a ✓
      still need reading. The Finish card at the end tells you how many minutes are left before <strong>Mark complete</strong> unlocks. Optional stages (exercises, appendix, further reading) never block completion.
    </>,
  ],
  ["Do I need an account?", <>No. Everything works as a guest. Sign in to keep progress across devices, use the Notebook and be ranked on the leaderboard. Anything you did as a guest in that browser is merged in when you first sign in.</>],
  [
    "I cleared my browser (or changed phones) and my progress is gone.",
    <>
      As a guest, progress lives only in that browser, so clearing site data removes it. Signed in, it&apos;s in your account: just sign in again. To keep a copy either way, use <Link href="/dashboard#data">Download my data</Link> on the
      progress page.
    </>,
  ],
  [
    "What's the difference between a highlight, a bookmark and a checkpoint?",
    <>A highlight marks a sentence in colour. A bookmark saves a place (a passage or the whole lesson) with a title. Both go to the Notebook. Save checkpoint only remembers where you are in a lesson for resuming and progress.</>,
  ],
  [
    "How are leaderboard points different from XP?",
    <>
      XP is your personal running total (guest or signed in) and sets your level. Points are a weekly score for signed-in learners, counted only from activity the server can check, capped at {POINTS.dayCap} a day, and they decide your
      league. See <a href="#xp-vs-points">XP vs points</a>.
    </>,
  ],
  [
    "Why am I in the Intern league when my level is Senior?",
    <>Leagues and levels share names but aren&apos;t linked. Your level comes from all-time XP; your league moves one step at a time, week by week, from where everyone starts (L1 Intern).</>,
  ],
  [
    "A trial part says Locked. Can I take it?",
    <>Yes. A part opens when you finish the lesson it tests, so you are tested on what you just read, but the part&apos;s page has a <strong>Start anyway</strong> button.</>,
  ],
  ["I failed a trial part. When can I retry?", <>After a {TRIAL_COOLDOWN_MIN}-minute rest, with the options shuffled again. Your misses are already in your review queue, so the standup is a good way to spend those minutes.</>],
  ["What does “due” mean?", <>A review card is due when its next date is today or earlier. The number next to the Arena tab is how many cards are due right now.</>],
  [
    "Why do I see two different streaks?",
    <>The course streak (hub and progress page) counts days with a cleared stage, a finished lesson, a passed trial part or a reviewed card. The daily streak in the Arena only counts days you played the daily challenge.</>,
  ],
  [
    "Can other people see my progress?",
    <>
      Not unless you turn on your public page in <Link href="/dashboard#share">Progress → share</Link>; it&apos;s off by default. You pick the handle, the name shown (full, first name + initial or anonymous) and which of six parts appear.
      Your email, notes, highlights, bookmarks and exact study times are never shown. Switch it off and the link shows a 404 at once.
    </>,
  ],
  [
    "Why does Share ask me to sign in?",
    <>
      Your public page is built from your account, so a share link needs one. Signing in is free and the progress in this browser comes with you. As a guest you can still share the course, and <strong>Challenge a friend</strong> after
      the daily challenge works without an account.
    </>,
  ],
  [
    "Is the mock interview verdict real?",
    <>
      It&apos;s as honest as your self-scores: the rubric and the bands are what interviewers use, but you do the scoring. For an outside view, use <strong>Ask Claude</strong> or <strong>Ask ChatGPT</strong> in the debrief, which sends your
      answers and the rubric for an independent verdict. Red flags (no clarifying questions, blank phases, unanswered curveballs, running long) are detected for you.
    </>,
  ],
  [
    "Do code labs need Python on my computer?",
    <>
      No. Python runs inside the browser on your device, and your code is never sent to a server. The first run downloads it once ({RUNTIME_DOWNLOAD_LABEL}). Save a lab for offline use and Python is stored with it (about {RUNTIME_STORED_LABEL}, once for every lab).
    </>,
  ],
  [
    "Where do I find revision decks, labs and the other tools?",
    <>
      In the <Link href="/prep">Prep</Link> tab: the video lectures, mocks, revision decks, cheat and design sheets, code labs, the numbers playground and the planner. Lessons also end with their revision deck and any code lab that practises
      them. Design of the week is in the Arena; your concept mastery and certificates are under You.
    </>,
  ],
  ["Does replaying the daily challenge count?", <>No, only your first run of the day counts for XP, points and the streak. Replays are practice.</>],
  ["Does re-reading a lesson reset it?", <>Never. Completed stays completed and percentages never go down. Only the Reset on the progress page removes progress.</>],
  ["Does listening count as reading?", <>Yes. While Listen is reading the lesson aloud, the time counts even if you don&apos;t touch the screen.</>],
  [
    "How do I start over?",
    <>
      Progress page → <Link href="/dashboard#data">Your data</Link> → Reset. Choose one lesson, one week, the whole course or everything, and which kinds of data to clear. Download your data first if you might want it back.
    </>,
  ],
];

const GLOSSARY: [string, string][] = [
  ["World", "One week of the course: its lessons, a boss and (where there is one) a trial. Clearing all of it earns the world's badge."],
  ["Lesson", "One reading in a world: the Preview, a Day, a Foundations part, a boss capstone or a side quest."],
  ["Stage", "A part of a lesson (Part I, Part II, Phase 1…). Progress, XP and resuming all work by stage."],
  ["Quick check", "A short multiple-choice block inside a lesson. The first try is the one that pays XP."],
  ["Trial", "A world's multiple-choice test, split into parts. Each part tests one lesson; pass mark 80%."],
  ["Boss", "The world's capstone: a full system design interview with timed phases, fought in interview mode or read."],
  ["Lecture", "A narrated, animated video of a lesson, side quest, problem, LLD article or case file, with chapters, captions and quiz checkpoints."],
  ["Lecture checkpoint", `A question inside a lecture: it waits for your answer, and a right one pays +${LECTURE_QUIZ_XP} XP once.`],
  ["Recorded mock interview", "A mock interview played out by an interviewer and a strong candidate in two voices: the same round, done well, to watch before you sit it."],
  ["Live coach", "In a mock interview, a short AI read after each phase: what landed, what's missing, one thing to try. Can be switched off."],
  ["Mock interview", "A timed interview loop between worlds: an unseen problem from a fictional company, a named interviewer, curveballs, a whiteboard, then a debrief with a levelled rubric and a verdict."],
  ["Verdict", "A mock interview's result band, from Strong no hire to Strong hire, for the level you picked."],
  ["Side quest", "A bonus problem: a real system (UPI, Netflix, Uber…) designed end to end. Open any time."],
  ["XP", "Experience points: your personal total from everything you do. Sets your level."],
  ["Level", "L1 Intern to L6 Principal, from your XP. Shown in the header."],
  ["League", "Your weekly leaderboard division (same names as levels). Top players move up every Monday."],
  ["Streak", "Consecutive days with learning activity (a stage, lesson, trial part or review). The daily challenge has its own streak."],
  ["Daily standup", "The review queue's daily session: today's due cards, graded Again / Hard / Good / Easy."],
  ["Leitner box", "One of five review boxes. Higher boxes come back less often, Box 5 about monthly."],
  ["Due", "A review card whose next date is today or earlier: it's waiting in today's standup."],
  ["Checkpoint", "Your saved place in a lesson (Save checkpoint). Where Continue and Resume take you."],
  ["Public page", "Your optional page at /u/<handle>, showing the parts of your progress you chose. Off until you turn it on."],
  ["Handle", "The name in your public link: lowercase letters, numbers and hyphens, picked in Progress → share."],
  ["Case file", "A story from real production work, outside the course, often ending with an interactive activity."],
  ["Prep", "The tab for getting hired: company pages, the question bank, classic problems, mocks, revision decks, cheat and design sheets, drills and the planner."],
  ["Revision deck", "A lesson boiled down to about five minutes of cards. Cards you mark Again join the daily standup."],
  ["Cheat sheet", "One world's key ideas, numbers, trade-offs and mistakes on a single printable page."],
  ["Code lab", "Implement a component (a rate limiter, an LRU cache…) in Python in the browser, against example and hidden tests."],
  ["Concept map", "Every concept of the course, coloured from Not started to Mastered by your answers, each with a two-minute refresher."],
  ["Term card", "The small card a dotted term in a lesson opens: a one-line definition and where it's taught."],
  ["Design of the week", "One open design problem a week: submit a design, vote on the community's, winners featured."],
  ["Design sheet", "A side quest's whole design on a few printable pages: numbers, architecture, UML flows, data model, state machine, decisions and failure modes."],
  ["Explainer", "An animation that walks through an idea or a whole article step by step; Narrate reads its captions aloud."],
  ["Break-it lab", "An explainer with sliders: change the load or a setting and watch where the system breaks."],
  ["Problem bank", "The classic interview questions (URL shortener, chat, news feed…), each a short walkthrough linking into the lessons."],
  ["Low-level design", "Machine-coding problems (parking lot, LRU cache, Splitwise…): the classes, interfaces and patterns."],
  ["Company page", "A company in the Prep tab: questions candidates reported (with sources), likely ones from its products, and a study path."],
  ["Question bank", "Every company's questions merged into one list, most-reported first, each linked to its lessons."],
  ["War room", "An incident played as its chat channel: you're on call and make the calls; ends with the postmortem and the real incident."],
  ["Peer mock", "A mock interview with another learner: post or join a slot, meet in a free video room, swap roles."],
  ["AI credits", "Your daily allowance for the course's AI features; 1 credit is a tiny slice of the cost, refilled at midnight UTC."],
];
