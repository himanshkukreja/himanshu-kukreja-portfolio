/**
 * The twelve features of the guide, in the order of the video series (src/lib/learn/guide/videos.ts).
 * Each one's "How to use it" follows its video's flow (the scripts in the series' script.md files), in
 * the real UI's words; numbers come from the code (./facts). The in-depth part is ./sections/*.
 */
import type { Feature } from "./FeatureSection";
import { Kbd } from "./ui";
import { BOSS_PASS_PCT, BOSS_XP, DAILY_N, DAILY_SECONDS, LAB_REVEAL_AFTER_RUNS, LAB_XP, LEARN_XP, QUIZ_XP, REVIEW_XP_PER_CARD, TRIAL_PASS_PCT } from "./facts";
import { CERT_XP, MOCKS_NEEDED as CERT_MOCKS } from "@/lib/certificates/core";
import { COURSE, INLINE, LECTURE_QUIZ_XP, type GuideData } from "./sections/types";
import GettingStartedDetails from "./sections/GettingStarted";
import LecturesDetails from "./sections/Lectures";
import SideQuestsDetails from "./sections/SideQuests";
import CodeLabsDetails from "./sections/CodeLabs";
import ArenaDetails from "./sections/Arena";
import DesignBossDetails from "./sections/DesignBoss";
import MocksDetails from "./sections/Mocks";
import PrepDetails from "./sections/Prep";
import NotebookDetails from "./sections/Notebook";
import AiTutorDetails from "./sections/AiTutor";
import ProgressDetails from "./sections/Progress";

const credits = <a href="#ai" className={INLINE}>AI credits</a>;

export function guideFeatures(d: GuideData): Feature[] {
  const s = d.map?.stats;
  return [
    {
      id: "getting-started",
      aliases: ["basics"],
      video: "getting-started",
      n: "01",
      short: "Getting started",
      title: "Getting started",
      line: "The map of worlds, how a lesson's stages clear, XP and levels, and a day-by-day plan to your interview date.",
      shot: "hub-hero",
      steps: [
        <>
          Open the <strong>course</strong> tab. No sign-up to read and nothing is locked: the <strong>Start here</strong> card (later <strong>Continue</strong>) always points at your next step.
        </>,
        <>
          Read the <strong>skill tree</strong>: each row is a world, one week of the course. A Preview and five day lessons, then the <strong>boss</strong> (the diamond, a timed interview) and the <strong>T</strong> boxes, the
          week&apos;s trial in parts. Mock interviews sit between worlds.
        </>,
        <>
          Click a world for its lessons with real reading times, and its reward: clear it all for <strong>+{LEARN_XP.world} XP</strong> and a badge.
        </>,
        <>
          Open a lesson. The stage rail shows every stage with its minutes. Spend real time reading a stage and it clears: <strong>+{LEARN_XP.stage} XP</strong>. You resume by stage, not by scroll position.
        </>,
        <>
          Think through the checkpoints, and answer the quick checks in the text: right on the first try is <strong>+{QUIZ_XP} XP</strong>; a slip shows why. Retry any time; only the first try pays.
        </>,
        <>
          Stopping for today? Press <strong>Save checkpoint</strong>. Back on the hub, <strong>Continue</strong> takes you straight to that stage, and your level (Intern to Principal) sits in the header.
        </>,
        <>
          Interview coming up? Open the <strong>study planner</strong> from the prep tab: your date, your days, your hours. It tells you honestly whether the course fits, then <strong>Make my plan</strong> builds a day-by-day
          schedule with a calendar file.
        </>,
      ],
      tips: [
        <>New to system design? Start with Week 00, Foundations. Already comfortable? Jump to any world; side quests make good weekend practice.</>,
        <>Scrolling to the bottom doesn&apos;t clear a stage; reading does. Listening with Listen counts as reading.</>,
        <>As a guest, progress lives in this browser. Sign in (free) and it follows you to every device; what you did as a guest comes with you.</>,
        <>Fall behind the plan and it re-plans from what you&apos;ve actually finished.</>,
      ],
      try: { href: COURSE, label: "the course map" },
      details: <GettingStartedDetails d={d} />,
    },
    {
      id: "lectures",
      video: "lectures-listen",
      n: "02",
      short: "Lectures and Listen",
      title: "Lectures and Listen",
      line: "Every lesson as an animated lecture you can pause and ask about, every article narrated, and the whole course as a podcast.",
      shot: "lecture-player",
      steps: [
        <>
          At the top of a lesson, press the <strong>Watch it first</strong> card. Or browse every lecture in course order in <strong>prep → Video lectures</strong>.
        </>,
        <>Jump to the part you need from the <strong>chapters</strong> beside the video (below it on a phone). The diagram builds while the narration explains it.</>,
        <>
          Captions on or off with <Kbd>C</Kbd>; speed from 0.75× to 2×.
        </>,
        <>
          Lost at a moment? Pause and tap <strong>✦ Ask about this moment</strong> (<Kbd>A</Kbd>). Read what learners often ask right there, answered already, or ask your own question.
        </>,
        <>
          When the lecture stops at a <strong>quiz checkpoint</strong>, answer it: a right answer is <strong>+{LECTURE_QUIZ_XP} XP</strong>, and the chapter list keeps score.
        </>,
        <>When it ends, the next lecture in the track starts by itself after a short countdown (or press cancel).</>,
        <>
          No screen? Press <strong>Listen</strong> in a lesson. The article is read in the same natural voice and the paragraph being read lights up. On the move, add the <strong>podcast</strong> to any podcast app.
        </>,
      ],
      tips: [
        <>
          <strong>Save offline</strong> under a lecture&apos;s title keeps it with its audio and captions (about 10–20 MB) for a flight or a metro ride.
        </>,
        <>Watching is free with an account; signed out, a lecture plays its first minute. A lecture someone shared with you plays in full.</>,
        <>Listening counts as reading time, so your stages still clear while your eyes are elsewhere.</>,
        <>Many learners watch first, then read: the written lesson has every detail, the code and the stages that count.</>,
      ],
      ai: (
        <p className="m-0">
          <strong>Ask about this moment</strong> sends your question with the paused moment in front of the AI, so the answer comes from this lecture, not the open web; it can light up part of the diagram or jump you to another
          chapter. The questions learners often ask are answered already and free to read; your own use {credits}.
        </p>
      ),
      try: { href: "/learn/prep/lectures", label: "the lectures" },
      details: <LecturesDetails d={d} />,
    },
    {
      id: "shorts",
      video: "shorts",
      n: "03",
      short: "Shorts",
      title: "Shorts",
      line: "System design two minutes at a time. Swipe for the next idea; when one hooks you, the full lecture opens at that exact moment.",
      steps: [
        <>
          Open the <strong>shorts</strong> tab (in the dock at the bottom on a phone). Each short is one idea, cut from a lesson, a side quest, a real incident or an interview problem.
        </>,
        <>It starts muted with big captions. Tap for sound.</>,
        <>
          Not this one? <strong>Swipe up</strong> for the next. Shorts you haven&apos;t seen yet always come first.
        </>,
        <>
          The rail on the side has upvote, discussion, save, share, sound, speed and full screen. It fades after a few seconds, leaving just the video; tap to bring it back.
        </>,
        <>
          Narrow it down: pick a category or a topic (like caching), or <strong>Top</strong> for what learners liked most.
        </>,
        <>
          Hooked? <strong>Full lecture</strong> opens the animated lecture at exactly that idea, not at the start. <strong>Read it</strong> opens the written lesson.
        </>,
        <>
          <strong>Save</strong> a short to your library to watch again.
        </>,
      ],
      tips: [
        <>Every lesson ends with its own shorts. Tap one and the feed plays just that lesson&apos;s ideas: a two-minute revision.</>,
        <>Open the discussion and the short shrinks to the top and keeps playing while you write.</>,
        <>On a laptop the feed sits in one column, with the details and actions beside it.</>,
      ],
      try: { href: "/learn/shorts", label: "Shorts" },
    },
    {
      id: "side-quests",
      video: "side-quests",
      n: "04",
      short: "Side quests and war rooms",
      title: "Side quests and war rooms",
      line: "Real systems designed end to end, true stories with their sources, and live outages you work as the on-call engineer.",
      shot: "case-index",
      steps: [
        <>
          <strong>Side quests:</strong> on the course hub, under the worlds, open any of the {s?.sideQuests ?? 36}: UPI, WhatsApp, Netflix, Uber… Each is a full design with its own lecture, worth <strong>+{LEARN_XP.sideQuest} XP</strong>.
        </>,
        <>
          <strong>Case files:</strong> real production stories told with blueprints (Case files, in the site header). Some end with a drill.
        </>,
        <>
          <strong>War stories</strong> (the stories tab): true stories of real systems at their limits, two minutes each, with their sources. Start with the story of the day.
        </>,
        <>
          Open a <strong>war room</strong> and take the page. The incident plays out in its chat channel: the pager, charts, logs, people. You&apos;re on call.
        </>,
        <>At each call, pick your move. A wrong call costs minutes and users, and someone tells you why; then you choose again. Check the logs before you act.</>,
        <>Or type your own move in your own words. It&apos;s matched to the closest call and the channel carries on.</>,
        <>
          Finish for the debrief: your run, the blameless postmortem and the real incident it&apos;s modelled on. Clearing a war room is <strong>+60 XP</strong>.
        </>,
      ],
      tips: [
        <>Read faster than the messages arrive? Use fast, or skip to the next call.</>,
        <>
          Every side quest has a <a href="#practice-sheets" className={INLINE}>design sheet</a>: the whole design on a few pages, for revising it in ten minutes.
        </>,
        <>The company and people in a war room are fictional; the failure chain follows the real postmortem, linked at the end.</>,
      ],
      ai: (
        <p className="m-0">
          In a war room you can <strong>type your move</strong> instead of picking one. The AI reads it against that moment&apos;s calls, plays the channel&apos;s reply in character, and a move that matches a call plays out like that
          call. Typed moves use {credits}; picking from the options is free.
        </p>
      ),
      try: { href: "/learn/war-stories", label: "war stories and war rooms" },
      details: <SideQuestsDetails d={d} />,
    },
    {
      id: "code-labs",
      video: "code-labs",
      n: "05",
      short: "Code labs",
      title: "Code labs",
      line: "Write real Python in the browser, run real tests, and get hints that point at the bug without handing you the answer.",
      shot: "lab-room",
      steps: [
        <>
          Open <strong>prep → Code labs</strong>, one lab for each big idea (a rate limiter, consistent hashing, an LRU cache…), or press <strong>Try it in code</strong> at the end of a lesson.
        </>,
        <>Read the brief: the lessons it practises, the example tests you can read, and the hidden tests waiting for the edge cases.</>,
        <>Write your code in the editor. Python runs right in the page: no install, no server, nothing to set up.</>,
        <>
          Press <strong>Run tests</strong> (<Kbd>⌘</Kbd>/<Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>). Failing tests show what was expected and what you returned.
        </>,
        <>Stuck? Ask the AI tutor under the results. A nudge first, then the exact spot, then the fix in words. Never the code.</>,
        <>
          Fix it yourself and run again. Every test passing clears the lab: <strong>+{LAB_XP.easy}, +{LAB_XP.medium} or +{LAB_XP.hard} XP</strong> by difficulty, once.
        </>,
        <>
          Then ask for a <strong>code review</strong>: the edge cases traced, polish points, and what an interviewer would ask next.
        </>,
      ],
      tips: [
        <>Your code autosaves in this browser, so you can stop and come back.</>,
        <>
          Rather not use AI? Written hints come one at a time, and the worked solution unlocks after {LAB_REVEAL_AFTER_RUNS} runs.
        </>,
        <>The first run downloads Python once; save a lab offline and it runs with no connection.</>,
      ],
      ai: (
        <p className="m-0">
          The tutor reads <strong>your code and the failing tests</strong>, then hints in three levels, from a nudge to the exact fix in words, so you still write it yourself. After a pass, the code review traces the edge cases.
          Both use {credits}; the written hints and the solution are free.
        </p>
      ),
      try: { href: "/learn/labs", label: "code labs" },
      details: <CodeLabsDetails />,
    },
    {
      id: "arena",
      video: "arena-review",
      n: "06",
      short: "Arena and review",
      title: "Arena and review",
      line: "A daily challenge, weekly leagues and quick games, then spaced review that brings back what you missed right before you'd forget it.",
      shot: "arena-hub",
      steps: [
        <>
          Open the <strong>arena</strong> tab: today&apos;s challenge, your league this week and the games.
        </>,
        <>
          Play the <strong>daily challenge</strong>: {DAILY_N} questions, {DAILY_SECONDS} seconds each, the same {DAILY_N} for everyone today. Faster right answers score more; a miss shows the answer and why.
        </>,
        <>
          Try a quick game, like <strong>Latency Ladder</strong>: order operations from fastest to slowest in 90 seconds.
        </>,
        <>The night before an interview, open a lesson&apos;s revision deck (prep → Revision decks): swipe the cards and tap <strong>Again</strong> on any you&apos;re unsure of.</>,
        <>
          Every day, open the <strong>Daily standup</strong> (the orange number on the arena tab is how many cards are due): trial questions you missed, answers you flagged and your Again cards.
        </>,
        <>
          Recall the answer first, then <strong>Show answer</strong>, and be honest: <strong>Again</strong>, <strong>Hard</strong>, <strong>Good</strong> or <strong>Easy</strong>. Good brings a card back later, Again tomorrow.
        </>,
      ],
      tips: [
        <>
          Keys in the standup: <Kbd>Space</Kbd> shows the answer, <Kbd>1</Kbd>–<Kbd>4</Kbd> grade.
        </>,
        <>Only your first daily run of the day counts; replays are practice.</>,
        <>
          XP (your level) and leaderboard points (your league) are <a href="#xp-vs-points" className={INLINE}>two different scores</a>. Only signed-in activity is ranked.
        </>,
        <>Each graded card is +{REVIEW_XP_PER_CARD} XP, and a review session keeps your streak alive.</>,
      ],
      try: { href: "/learn/arena", label: "the Arena" },
      details: <ArenaDetails />,
    },
    {
      id: "design-boss",
      aliases: ["design"],
      video: "design-boss",
      n: "07",
      short: "Design canvas and bosses",
      title: "Design canvas and boss fights",
      line: "Draw your design, get a staff engineer's review, fix it, then fight the week's boss: the capstone as a timed interview.",
      shot: "boss-brief",
      steps: [
        <>
          Open the <strong>design canvas</strong> (prep → Design canvas) and pick a classic interview problem, a week&apos;s capstone or your own idea.
        </>,
        <>Drag in the blocks (users, a load balancer, a service, a cache, a database…), then draw arrows block to block.</>,
        <>
          Add a line of notes, the way you&apos;d say it out loud, and press <strong>Review my design</strong>.
        </>,
        <>Read the verdict and the gaps, worst first, each with a fix. Fix the worst ones and review again.</>,
        <>
          At the end of a world, fight its <strong>boss</strong>: the capstone as a timed interview, phase by phase. Write your answer in the scratchpad first, then reveal the model answer.
        </>,
        <>
          Score yourself against the capstone&apos;s checklist: {BOSS_PASS_PCT}% defeats the boss, <strong>+{BOSS_XP} XP</strong>.
        </>,
        <>
          Take the week&apos;s <strong>trial</strong> parts: {TRIAL_PASS_PCT}% passes a part (+{LEARN_XP.trial} XP), and every miss becomes a review card.
        </>,
        <>
          Every Monday, try <strong>Design of the week</strong>: write a design in markdown with Mermaid diagrams, then vote on everyone else&apos;s.
        </>,
      ],
      tips: [
        <>Review early with a rough sketch: fixing the worst gap first is how the interview goes too.</>,
        <>Not ready for the boss? Read it in read mode, untimed with the answer open. It still completes the capstone as a lesson.</>,
        <>A trial part that says Locked still has Start anyway.</>,
      ],
      ai: (
        <p className="m-0">
          <strong>Review my design</strong> reads what you drew (the blocks, the arrows, their labels) and your notes against the problem&apos;s brief, the way a staff engineer would. It reviews and points; it never redraws your
          design. Each review uses {credits}. Bosses and trials are scored by you and the answer key, with no AI.
        </p>
      ),
      try: { href: "/learn/canvas", label: "the design canvas" },
      details: <DesignBossDetails />,
    },
    {
      id: "mocks",
      video: "mock-interviews",
      n: "08",
      short: "Mock interviews",
      title: "Mock interviews",
      line: "A timed interview with a named interviewer who pushes back, curveballs mid-round, then a levelled debrief and a verdict.",
      shot: "mock-room",
      steps: [
        <>
          Open a mock from the row between worlds on the skill tree, the prep tab, or <strong>all mock interviews</strong>. The lobby shows the company, the problem, your interviewer and the level you&apos;re going for.
        </>,
        <>
          Press <strong>Join the call</strong>, read the short briefing, then <strong>I&apos;m ready</strong>. One clock runs; each phase has a budget.
        </>,
        <>Phase by phase (clarify, estimate, API and data model, design, deep dive…): write in the answer box or press Dictate, and draw on the Whiteboard tab.</>,
        <>Ask the interviewer: type, or start a voice call. They answer in character from the problem&apos;s own facts, and push back on weak spots.</>,
        <>Between phases, read the live coach: what landed, what&apos;s missing, one thing to try.</>,
        <>A curveball arrives mid-round (&ldquo;the shard just died&rdquo;): answer it before you move on.</>,
        <>
          End the call. In the debrief, reveal the model answer for each phase and score every rubric signal <strong>missed</strong>, <strong>partly</strong> or <strong>nailed</strong> for your verdict.
        </>,
        <>
          Ask for the <strong>AI scorecard</strong>: a strict second opinion that grades each phase by level, quotes what you wrote and names the lessons to redo.
        </>,
      ],
      tips: [
        <>
          Watch the recorded round first (<strong>watch it first</strong> in the lobby): the same interview, done well, in two voices.
        </>,
        <>Want a pure mock? Switch the live coach off in the briefing.</>,
        <>
          Practise with a real person on peer mocks: post a slot, pair up, swap roles. Finishing a mock is +{LEARN_XP.mock} XP, Hire or better +{LEARN_XP.mockOffer}.
        </>,
      ],
      ai: (
        <p className="m-0">
          Signed in, the <strong>interviewer</strong> answers in character from the problem&apos;s facts and throws its curveballs, the <strong>live coach</strong> reads each phase you finish, and the <strong>AI scorecard</strong> grades
          the round against the levelled rubric, quoting your words. It sits beside your own scores and never changes XP. These use {credits} (an interviewer turn is about 10).
        </p>
      ),
      try: { href: "/learn/mock", label: "mock interviews" },
      details: <MocksDetails d={d} />,
    },
    {
      id: "prep",
      aliases: ["practice"],
      video: "interview-prep",
      n: "09",
      short: "Interview prep",
      title: "Interview prep",
      line: "What each company asks with sources, the question bank, design sheets, worked estimates and cheat sheets for the last stretch.",
      shot: "practice-hub",
      steps: [
        <>
          Open the <strong>prep</strong> tab: the lectures in order, the design canvas, mocks, revision and the company pages.
        </>,
        <>
          Open <strong>Companies</strong> and pick yours: what it builds, what its questions lean on, and the rounds as candidates describe them, each with a source.
        </>,
        <>
          Read its questions. <strong>Reported</strong> ones link the write-up they came from and the lessons that teach them; anything else is marked <strong>likely</strong>, from what the company builds.
        </>,
        <>
          The <strong>question bank</strong> merges every company, most reported first. Filter by type, by company or to reported only.
        </>,
        <>
          For the big designs, open a <strong>design sheet</strong>: the numbers, the architecture with real tech and the key flows on a few pages, ready as a PDF.
        </>,
        <>
          In the <strong>numbers playground</strong>, type an estimate the way you&apos;d say it out loud (&ldquo;50M users × 30 views, 10× at peak&rdquo;) and get every step worked out.
        </>,
        <>
          The night before: a whole week on one printable <strong>cheat sheet</strong>, and <strong>concepts A–Z</strong> for one-line refreshers with the lesson behind each.
        </>,
      ],
      tips: [
        <>Everything in prep works as a guest, no sign-up.</>,
        <>
          The <a href="#practice-plan" className={INLINE}>study planner</a> turns your interview date into a day-by-day plan.
        </>,
        <>Saved for offline use, each prep card says whether its page is on this device.</>,
      ],
      try: { href: "/learn/prep", label: "interview prep" },
      details: <PrepDetails />,
    },
    {
      id: "notebook",
      video: "notebook",
      n: "10",
      short: "Notebook",
      title: "Notebook",
      line: "Handwritten notes beside every lesson that turn into text and check themselves against it, plus your highlights, notes and bookmarks.",
      shot: "notebook",
      steps: [
        <>
          In a lesson, tap the <strong>pen button</strong> or press <Kbd>N</Kbd>. The notebook opens beside the lesson; on a tablet held upright, below it.
        </>,
        <>Write: pen, highlighter, eraser and lasso. Scribble over a mistake to erase it.</>,
        <>
          Found a line worth keeping? Select it and tap <strong>Clip</strong>. For a diagram, code or a table, tap <strong>Snip</strong>, drag a box, and ask about it.
        </>,
        <>
          Tap <strong>Turn into text</strong>: your handwriting becomes clean, searchable notes. Flip between ink and text any time.
        </>,
        <>
          Tap <strong>Check against lesson</strong>. It flags what doesn&apos;t match and quotes the section that says otherwise.
        </>,
        <>
          <strong>Make review cards</strong>, untick any you don&apos;t want, and the rest join your daily standup.
        </>,
        <>
          Rather write on the lesson itself? Turn on <strong>Annotate</strong>; or select a passage and pin a handwritten note to it.
        </>,
        <>
          Ready to test yourself? Sit a <strong>written paper</strong>: answer by hand, get every point marked, then read the model answer.
        </>,
      ],
      tips: [
        <>Apple Pencil, S Pen, a passive “universal” stylus (use the Stylus/finger mode) or just a finger. Paper comes ruled, grid, Cornell or interview style.</>,
        <>
          On a laptop the notebook docks at the side with your recent pages one click away. Selecting text still gives you <strong>Highlight</strong>, <strong>Note</strong> and <strong>Bookmark</strong>.
        </>,
        <>Your marks with Annotate stay on the words, even when you change the text size.</>,
        <>The notebook needs a free account, so your pages follow you to every device.</>,
      ],
      ai: (
        <p className="m-0">
          <strong>Turn into text</strong> reads your handwriting; <strong>Check against lesson</strong> compares your notes with this lesson, not the whole internet, and quotes the section; <strong>Snip</strong> answers from the
          lesson you snipped; written papers are marked point by point against their marking scheme. Each uses {credits}.
        </p>
      ),
      try: { href: "/learn/notebook", label: "the notebook" },
      details: <NotebookDetails />,
    },
    {
      id: "ai-tutor",
      aliases: ["ask"],
      video: "ai-tutor",
      n: "11",
      short: "AI tutor",
      title: "AI tutor",
      line: "A tutor that has read the whole course: plans from your progress, answers with sources, quizzes it grades, and a memory you control.",
      steps: [
        <>
          Open the <strong>ask</strong> tab, or press the orange <strong>Ask</strong> button on any course page (it knows the page you&apos;re on).
        </>,
        <>Ask for a plan (&ldquo;I have an interview in three weeks, two hours a day&rdquo;). It checks your progress and the course&apos;s week plans, then lays out a learning path you can save.</>,
        <>Ask a real question. The answer comes from the course: every claim numbered, the sources (lecture, lesson section, FAQ) beside it.</>,
        <>Ask about something the course doesn&apos;t teach: it says so first, then gives a general answer, clearly marked.</>,
        <>
          Say <strong>Quiz me</strong>. It picks a checkpoint from what you&apos;ve read; answer in your own words and it grades you against the course&apos;s reference answer.
        </>,
        <>Come back the next day: &ldquo;What should I work on today?&rdquo; picks up from your plan and the gaps your quiz showed.</>,
      ],
      tips: [
        <>Quick actions under the box: Quiz me, Start a mock, Make a plan, What next?</>,
        <>Three follow-up questions sit under every answer.</>,
        <>
          The tutor&apos;s memory is short notes you can read, switch off or clear on the memory page (you → memory).
        </>,
      ],
      ai: (
        <p className="m-0">
          The tutor answers from the course&apos;s own lessons, lectures and questions, and shows its sources so you can check. The chat doesn&apos;t use credits: it has its own daily messages, shown under the chat box. What you type
          goes to Anthropic&apos;s AI to answer it and isn&apos;t used for training.
        </p>
      ),
      try: { href: "/learn/chat", label: "Ask" },
      details: <AiTutorDetails />,
    },
    {
      id: "progress",
      video: "progress-profile",
      n: "12",
      short: "Progress and profile",
      title: "Progress and profile",
      line: "Your level, streak, course map and watch time on one page, a public page you control, and certificates anyone can check.",
      shot: "progress-top",
      steps: [
        <>
          Open the <strong>you</strong> tab. Progress shows your level and XP, course %, streak and real reading time, and <strong>Resume</strong> at the exact stage you left.
        </>,
        <>Scroll for the course map (black is done; orange trial cells carry your best scores), your 12-week rhythm, lecture watch time and your weekly goal with a projected finish date.</>,
        <>Tap your avatar to change it: a cartoon avatar or your own photo.</>,
        <>
          Want friends to see it? <strong>Share my progress</strong> is off until you turn it on. Choose what shows, then <strong>Publish</strong> for one link. Never your email or notes.
        </>,
        <>
          Cleared a world? Open <strong>Certificates</strong> and claim it: check the name, choose a public page, and it&apos;s issued, signed with a verification link (+{CERT_XP.world} XP).
        </>,
        <>
          Press <Kbd>⌘K</Kbd> and ask search in plain English: an answer with sources and a learning path. <strong>Save path</strong> keeps it under Saved paths as a checklist.
        </>,
        <>
          Going somewhere with no signal? The <strong>offline library</strong> saves lessons, lectures, labs and sheets to read with no internet.
        </>,
      ],
      tips: [
        <>Lecture watch time counts minutes actually played; skipping ahead doesn&apos;t count.</>,
        <>Turn your public page off and the link shows a 404 at once.</>,
        <>
          The course certificate needs every lesson, trial part and boss, plus {CERT_MOCKS} mock interviews at Hire or better (+{CERT_XP.course} XP). World certificates come along the way.
        </>,
        <>
          <strong>Download my data</strong> saves everything in one file; <strong>Reset</strong> clears exactly what you choose.
        </>,
      ],
      ai: (
        <p className="m-0">
          <strong>Search</strong> answers a question in plain English from the course, with its sources, and lays out a learning path built from the course&apos;s lessons. It uses {credits}; your daily allowance is shown on the
          Progress page, where you can also add your own API key.
        </p>
      ),
      try: { href: "/learn/dashboard", label: "your progress" },
      details: <ProgressDetails d={d} />,
    },
  ];
}
