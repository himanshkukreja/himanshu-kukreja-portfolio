/**
 * /learn/guide: how System Design Mastery works, in plain words, with real screenshots.
 * Numbers come from the code that enforces them (./facts.ts, <ReadingFact/>) and from the live
 * course map, so the guide changes when the product does. Screenshots: `npm run guide:shots`.
 */
import Link from "next/link";
import type { CourseMap } from "@/lib/learn/types";
import Shot, { Marker, Thumb } from "./Shot";
import ReadingFact from "./ReadingFact";
import { GuideTocChips, GuideTocSide, type TocItem } from "./GuideToc";
import { A, Kbd, LABEL, Note, Pair, PROSE, Section, Steps, Sub, Table, Where } from "./ui";
import { BAND_RULES, MIN_WORDS, RED_FLAG_RULES, VERDICT_LABEL } from "@/lib/learn/mock/score";
import {
  ARENA_GAMES,
  BOSS_PASS_PCT,
  BOSS_XP,
  BOX_EVERY,
  CASE_ACTIVITIES,
  CASE_ACTIVITY_PASS_PCT,
  CASE_ACTIVITY_XP,
  DAILY_N,
  DAILY_POINTS_MAX,
  DAILY_SECONDS,
  DAILY_XP_PER_RIGHT,
  DAILY_XP_PERFECT,
  DEBRIEF_XP,
  HANDLE_MAX,
  HANDLE_MIN,
  LEAGUE_RULES,
  LEARN_XP,
  LEITNER_INTERVALS,
  LEVELS,
  PART_INFO,
  PLAY_GAMES,
  POINTS,
  POINTS_TABLE,
  QUIZ_XP,
  REF_DAYS,
  REVIEW_XP_PER_CARD,
  SHARE_ALL_ON,
  SHARE_DEFAULT_NAME,
  STAGE_ACE_XP,
  TRIAL_COOLDOWN_MIN,
  TRIAL_PASS_PCT,
  partsFor,
  quest,
} from "./facts";

const COURSE = "/learn/system-design-mastery";

const TOC: TocItem[] = [
  { id: "overview", label: "How it works" },
  { id: "glance", label: "At a glance" },
  { id: "xp-vs-points", label: "XP vs points" },
  { id: "map", n: "01", label: "The course map" },
  { id: "lesson", n: "02", label: "Reading a lesson" },
  { id: "completion", n: "03", label: "Progress rules" },
  { id: "notebook", n: "04", label: "Notebook" },
  { id: "review", n: "05", label: "Review & standup" },
  { id: "trials", n: "06", label: "Trials & bosses" },
  { id: "mocks", n: "07", label: "Mock interviews" },
  { id: "arena", n: "08", label: "The Arena" },
  { id: "xp", n: "09", label: "XP, levels, badges" },
  { id: "progress", n: "10", label: "Progress page" },
  { id: "share", n: "11", label: "Share your progress" },
  { id: "offline", n: "12", label: "Offline reading" },
  { id: "cases", n: "13", label: "Case files" },
  { id: "account", n: "14", label: "Account & data" },
  { id: "faq", n: "15", label: "FAQ" },
  { id: "glossary", n: "16", label: "Glossary" },
];

const LOOP = [
  { t: "Read a lesson", d: "Each lesson is split into stages. Start anywhere; nothing is locked." },
  { t: "Clear stages", d: "A stage clears after real reading. Quick checks inside test you as you go." },
  { t: "Earn XP", d: `+${LEARN_XP.stage} a stage, +${LEARN_XP.lesson} a lesson, +${QUIZ_XP} per quick check right first time.` },
  { t: "Review", d: "What you miss comes back in the daily standup, right before you forget it." },
  { t: "Beat the boss & trial", d: "End each world with a timed interview and the week's MCQ parts. Every few worlds, a full mock interview loop." },
  { t: "Climb leagues", d: "Signed in, your activity scores weekly points. The top of each league moves up." },
];

/** `caseActivities`: live count (repo TSX activities + published CMS ones); falls back to the repo count. */
export default function Guide({ map, caseActivities = CASE_ACTIVITIES }: { map: CourseMap | null; caseActivities?: number }) {
  const s = map?.stats;
  const trialWeeks = map ? map.weeks.filter((w) => w.trial) : [];
  const lessonsPerWorld = map?.weeks[1] ? map.weeks[1].lessons.length : 6;
  const mocks = map?.mocks || [];

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-32 pt-8 sm:px-6 sm:pt-14 lg:pb-24">
      {/* ------------------------------------------------------------ hero */}
      <header id="overview" className="flex scroll-mt-28 flex-col gap-7">
        <div className="flex flex-col gap-4">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · the guide · 2-minute read for the basics</span>
          <h1 className="max-w-[16ch] font-display text-[clamp(42px,7vw,96px)] font-extrabold leading-[0.9] tracking-tightest text-fg">
            How System Design Mastery works<span className="text-signal-text">.</span>
          </h1>
          <p className="max-w-[62ch] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
            A free course{s ? ` of ${s.worlds} worlds, ${s.coreLessons} core lessons, ${s.bosses} interview bosses and ${s.sideQuests} side quests` : ""}, built like a game. Reading never needs an account.
            This page explains every screen, what each number means and where to find things. Here is the whole idea in thirty seconds:
          </p>
        </div>

        <ol aria-label="The core loop" className="m-0 grid list-none grid-cols-1 gap-px border border-line bg-line p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {LOOP.map((step, i) => (
            <li key={step.t} className="flex flex-col gap-2 bg-bg p-4">
              <span className="flex items-center gap-2">
                <Marker n={i + 1} />
                <span className="text-[16px] font-semibold text-fg">{step.t}</span>
                {i < LOOP.length - 1 && <span aria-hidden className="ml-auto font-mono text-fg-4 xl:hidden">↓</span>}
              </span>
              <span className="text-[14px] leading-snug text-fg-2">{step.d}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <Link href={COURSE} className="inline-flex min-h-12 items-center bg-signal px-6 text-[15px] font-semibold text-on-signal hover:brightness-110">
            Open the course →
          </Link>
          <a href="#glance" className="inline-flex min-h-12 items-center border border-line-strong px-5 text-[15px] text-fg hover:bg-surface-2">
            Notebook, progress and Arena in one minute
          </a>
        </div>
      </header>

      <GuideTocChips items={TOC} />

      <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-14">
        <aside className="hidden lg:block">
          <GuideTocSide items={TOC} />
        </aside>

        <div className="flex min-w-0 flex-col gap-16">
          {/* ------------------------------------------------------------ at a glance */}
          <section id="glance" aria-labelledby="glance-h" className="flex scroll-mt-[calc(var(--hk-header-h,61px)+72px)] flex-col gap-5 lg:scroll-mt-[calc(var(--hk-header-h,61px)+24px)]">
            <div className="flex flex-col gap-2">
              <span className={LABEL}>at a glance · the three places people ask about</span>
              <h2 id="glance-h" className="font-display text-[30px] font-extrabold leading-none tracking-[-0.035em] text-fg sm:text-[40px]">
                Notebook, progress, Arena<span className="text-signal-text">.</span>
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  k: "notebook",
                  shot: "notebook",
                  title: "Notebook",
                  what: "Everything you save while reading: highlights, notes and bookmarks, in one searchable place.",
                  can: ["Select any text in a lesson to save it", "See it grouped by lesson, filter by week or colour", "Jump back to the exact stage you saved it from", "Turn a highlight into a review card; export as Markdown"],
                  href: "#notebook",
                  tab: "notebook tab",
                },
                {
                  k: "progress",
                  shot: "progress-top",
                  title: "Track your progress",
                  what: "The stage bar in every lesson, and the Progress tab for the whole course.",
                  can: ["See which stage you're on and minutes left", "Resume exactly where you stopped", "Course map of every lesson, boss and trial", "Streak, activity heatmap, weekly goal, your data", "Share a public page with friends (off until you turn it on)"],
                  href: "#progress",
                  tab: "progress tab",
                },
                {
                  k: "arena",
                  shot: "arena-hub",
                  title: "Arena",
                  what: "Practice that feels like a game: a daily challenge, weekly leagues, quick games and your review queue.",
                  can: [`${DAILY_N} questions × ${DAILY_SECONDS} s every day, same for everyone`, "Weekly leagues and a leaderboard (signed in)", `${ARENA_GAMES.length} quick games + ${PLAY_GAMES.length} Playground boards`, "The daily standup: cards due for review"],
                  href: "#arena",
                  tab: "arena tab",
                },
              ].map((c) => (
                <article key={c.k} className="flex flex-col gap-3.5 border border-line-strong bg-surface p-4 sm:p-5">
                  <span className={LABEL}>{c.tab}</span>
                  <h3 className="font-display text-[26px] font-extrabold leading-none tracking-[-0.03em] text-fg">{c.title}</h3>
                  <Thumb id={c.shot} />
                  <p className="m-0 text-[15px] leading-relaxed text-fg">{c.what}</p>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {c.can.map((x) => (
                      <li key={x} className="flex gap-2 text-[14px] leading-snug text-fg-2">
                        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-signal" />
                        {x}
                      </li>
                    ))}
                  </ul>
                  <a href={c.href} className="mt-auto inline-flex min-h-11 items-center justify-between border-t border-line pt-3 font-mono text-[13px] text-signal-text">
                    how it works <span aria-hidden>→</span>
                  </a>
                </article>
              ))}
            </div>
          </section>

          {/* ------------------------------------------------------------ XP vs points */}
          <section id="xp-vs-points" aria-labelledby="xvp-h" className="flex scroll-mt-[calc(var(--hk-header-h,61px)+72px)] flex-col gap-4 border border-signal bg-surface p-4 sm:p-6 lg:scroll-mt-[calc(var(--hk-header-h,61px)+24px)]">
            <span className={`${LABEL} text-signal-text`}>the one thing to know</span>
            <h2 id="xvp-h" className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-fg sm:text-[32px]">
              XP and leaderboard points are two different scores<span className="text-signal-text">.</span>
            </h2>
            <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
              <div className="flex flex-col gap-2 bg-bg p-4">
                <span className="font-display text-[22px] font-bold text-fg">XP</span>
                <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-fg-2">
                  <li>Your personal score. It only goes up (unless you reset).</li>
                  <li>Earned for almost everything: stages, lessons, quick checks, trials, bosses, reviews, games, even exploring the rest of the site.</li>
                  <li>Decides your <strong className="text-fg">level</strong>, L1 Intern to L6 Principal, shown in the header.</li>
                  <li>Works as a guest (saved in this browser); signed in it follows you.</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2 bg-bg p-4">
                <span className="font-display text-[22px] font-bold text-fg">Leaderboard points</span>
                <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-fg-2">
                  <li>A weekly competition score. The week resets Monday 00:00 IST.</li>
                  <li>Only <strong className="text-fg">signed-in</strong> course activity counts, and only what the server can check.</li>
                  <li>Fixed amounts per action, at most <strong className="text-fg">{POINTS.dayCap} a day</strong> (table in <a href="#arena" className="text-signal-text underline underline-offset-4">the Arena</a>).</li>
                  <li>Decides your rank and your <strong className="text-fg">league</strong>. Leagues reuse the level names but are separate from your XP level.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------ a) map */}
          <Section
            id="map"
            n="01"
            kicker="the course map"
            title="Worlds, lessons, stages, bosses, trials"
            lead="The course hub shows the whole campaign as a skill tree. Every row is a world; every square is something you can open right now."
          >
            <Shot id="hub-hero" priority />
            <div className={PROSE}>
              <p>
                <strong>A world is one week of the course</strong>
                {s ? `: ${s.worlds} of them, from Week 00 Foundations to Week ${String(s.worlds - 1).padStart(2, "0")}` : ""}. A typical world has a Preview and {Math.max(1, lessonsPerWorld - 1)} day lessons, then a{" "}
                <strong>boss</strong> (a timed mock interview, the diamond) and, for {trialWeeks.length ? trialWeeks.map((w) => `Week ${w.code}`).join(", ") : "some weeks"}, a <strong>trial</strong>: the week&apos;s multiple-choice questions split into parts (the T boxes).
                Week 00 is different: six Foundations parts instead of days.
              </p>
              <p>
                <strong>A lesson is split into stages</strong> (Part I, Part II… or Phase 1, 2… in a boss). Stages are how progress is saved: you resume by stage, not by scroll position.
              </p>
            </div>
            <Shot id="hub-tree" wide />
            <div className={PROSE}>
              <p>
                Click a world to see its lessons with real reading times, the boss, the trial parts and the world reward: clear every lesson, the boss and every trial part of a world for{" "}
                <strong>+{LEARN_XP.world} XP</strong> and that world&apos;s badge. On a phone, tap a world to open the same panel as a sheet.
              </p>
              <p>
                <strong>Side quests</strong> ({s?.sideQuests ?? 11} of them) are real systems designed end to end: UPI, WhatsApp, Netflix, Uber and more. They are bonus problems, open any time, worth +{LEARN_XP.sideQuest} XP each. The
                dashed card at the bottom of the hub, <strong>The Plan</strong>, is the 10-week roadmap.
              </p>
            </div>
            <Shot id="hub-side" />
            <Note title="Recommended order">
              <p>
                Go world by world: Preview → Day 1 … Day 5 → each lesson&apos;s trial part right after you finish it → the boss to close the week. New to system design? Start with Week 00 Foundations. Already comfortable? Jump to any world,
                nothing is locked; side quests make good weekend practice once a world or two is done.
              </p>
            </Note>
            <Where>
              the <A href={COURSE}>course</A> tab (top of every Learn page; bottom dock on phones). The Continue card on the hub always points at your next stage.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ b) lesson */}
          <Section id="lesson" n="02" kicker="reading a lesson" title="The lesson screen, piece by piece" lead="Everything around the text is there to tell you where you are and to get out of the way while you read.">
            <Shot id="lesson-top" wide />
            <div className={PROSE}>
              <p>
                <strong>Header and course tabs.</strong> On every Learn page the site header turns into the course header: <em>course · arena · notebook · progress</em>, a search box (<Kbd>⌘K</Kbd>), your level chip and the light/dark
                switch. On phones the same tabs live in the dock at the bottom, with a way back to the rest of the site.
              </p>
              <p>
                <strong>Stage rail.</strong> One card per stage with its minutes. ✓ means read, the orange outline is where you are, dashed is ahead. Optional stages (exercises, appendix, further reading, summary) sit in a separate box: they
                never block completion. <strong>Save checkpoint</strong> bookmarks your place (more in <a href="#completion" className="text-signal-text underline underline-offset-4">progress rules</a>).
              </p>
              <p>
                <strong>Left and right columns.</strong> The course path on the left lists this week&apos;s lessons, the boss and the trial with ticks; &ldquo;On this page&rdquo; on the right is the lesson&apos;s contents. On phones, tap the
                stage strip for the same contents as a sheet.
              </p>
            </div>
            <Shot id="lesson-reading" only="desktop" />
            <div className={PROSE}>
              <p>
                <strong>The chrome hides while you read.</strong> Scroll down and the header slides away; a thin stage bar stays pinned with the stage, minutes left and Save checkpoint. Scroll up a little and everything comes back.
              </p>
              <p>
                <strong>Reading tools</strong> (bottom right on desktop, the bottom toolbar on phones): <strong>Listen</strong> reads the lesson aloud with your browser&apos;s voice; <strong>Focus</strong> hides everything but the
                article and goes full screen where the browser allows it (<Kbd>Esc</Kbd> to leave); <strong>Aa</strong> cycles the text size 17 → 19 → 21 px and remembers it. Phones also get Contents and a shortcut to the Notebook.
              </p>
            </div>
            <Shot id="lesson-focus" only="desktop" />
            <Sub>Inside the text</Sub>
            <Shot id="lesson-quiz" size="medium" />
            <div className={PROSE}>
              <p>
                <strong>Quick checks</strong> are short multiple-choice blocks inside lessons. Pick an answer to see whether you were right and why. A right answer on the <strong>first try</strong> is worth +{QUIZ_XP} XP; get every quick
                check in a stage right first time for +{STAGE_ACE_XP} more; your first fully aced block earns the &ldquo;First blood&rdquo; quest (+{quest("quiz:ace")}). Retry is always allowed but only the first try pays.
              </p>
              <p>
                <strong>Diagrams</strong> are drawn in the site&apos;s colours and follow the light/dark theme; open any of them full screen. Code blocks have Copy and collapse long listings; interview questions have a reveal card where you can
                mark &ldquo;knew it&rdquo; or &ldquo;review again&rdquo;.
              </p>
              <p>
                <strong>Practice this</strong> cards appear at the end of lessons that have a matching game, for example the Latency Ladder after Networking. They open an Arena game or a Playground board.
              </p>
            </div>
            <Pair>
              <Shot id="lesson-diagram" only="desktop" />
              <Shot id="lesson-practice" only="desktop" />
            </Pair>
            <Shot id="lesson-end" size="medium" />
            <Where>
              any lesson from the <A href={COURSE}>course hub</A>. Each lesson ends with the Finish card, what&apos;s up next (across weeks) and the trial part that tests it.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ c) completion */}
          <Section id="completion" n="03" kicker="progress & completion" title="How a lesson counts as done" lead="Progress is earned by actually reading, not by scrolling to the bottom. Here are the rules in plain words.">
            <Steps
              items={[
                {
                  title: "Each stage needs some real reading time",
                  body: (
                    <>
                      About <ReadingFact k="share" /> of the stage&apos;s estimated minutes (never less than <ReadingFact k="minSec" />, never more than <ReadingFact k="maxSec" />), spent with that stage on screen.
                    </>
                  ),
                },
                {
                  title: "…and most of the stage has to pass by your eyes",
                  body: (
                    <>
                      <ReadingFact k="coverage" /> of the stage must have been visible while you were reading. The stage bar fills as both happen.
                    </>
                  ),
                },
                {
                  title: "Only real reading seconds count",
                  body: (
                    <>
                      The tab is visible, you did something in the last <ReadingFact k="idle" /> (scroll, tap, key) or Listen is playing, and you aren&apos;t flicking through faster than a screen a second. Jumps (contents,
                      links, End, PageDown) and the second right after them never count, and neither does time spent below the article.
                    </>
                  ),
                },
                { title: "The lesson completes by itself", body: `When every required stage is read, the lesson is complete: +${LEARN_XP.stage} XP for each stage along the way, +${LEARN_XP.lesson} XP for the lesson.` },
                {
                  title: "Or mark it complete",
                  body: (
                    <>
                      The <strong>Mark complete</strong> button at the end unlocks once you have about <ReadingFact k="completeShare" /> of the lesson&apos;s total reading time in (each stage counts up to its own share). Before that it
                      says &ldquo;Keep reading · ~N min left&rdquo;.
                    </>
                  ),
                },
                { title: "Done stays done", body: "Completed never goes back to incomplete and percentages never go down. Re-reading is always safe." },
              ]}
            />
            <Note title="Save checkpoint = a bookmark of your place" tone="signal">
              <p>
                <strong>Save checkpoint</strong> remembers the stage you are on so the hub&apos;s Continue card and &ldquo;Resume at …&rdquo; take you back there. If you have already spent enough time in that stage, it also clears it
                (it trusts you on the &ldquo;seen&rdquo; part). Otherwise it tells you how many more minutes that stage needs. The reader also moves your resume point on its own as you read.
              </p>
            </Note>
            <Table
              caption="Where progress is saved"
              head={["", "Guest (no account)", "Signed in"]}
              rows={[
                ["Lesson & stage progress, resume point", "This browser only", "Your account, on every device. Anything you read as a guest here is merged in when you first sign in"],
                ["XP, quests, badges", "This browser only", "Your account (merged the same way)"],
                ["Review cards, trial attempts", "This browser only", "Your account, with this browser as a backup if saving fails"],
                ["Highlights, notes, bookmarks", "Need an account", "Your account"],
                ["Weekly goal", "This browser only", "Your account"],
                ["Leaderboard rank", "Local points only (not ranked)", "Ranked every week"],
              ]}
            />
            <Where>
              the stage rail and Finish card in every lesson; the Continue card on the <A href={COURSE}>hub</A>; the <A href="/learn/dashboard">progress</A> tab for everything at once.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ d) notebook */}
          <Section
            id="notebook"
            n="04"
            kicker="highlights, notes & bookmarks"
            title="Select text, keep it in your Notebook"
            lead="Select any sentence in a lesson (long-press on a phone) and a toolbar appears. Everything you save lands in the Notebook, grouped by lesson."
          >
            <Shot id="select-menu" />
            <div className={PROSE}>
              <p>
                <strong>Highlight</strong> it in one of four colours, each with a meaning: <strong>Key idea</strong> (orange), <strong>Definition</strong>, <strong>Numbers</strong> (grey) and <strong>Interview line</strong> (teal).{" "}
                <strong>Note</strong> attaches your own words to the passage. <strong>Bookmark</strong> saves the exact passage with an optional title. These three need a free account, so they follow you everywhere; as a guest the toolbar
                asks you to sign in.
              </p>
              <p>
                <strong>Ask AI</strong> opens Claude or ChatGPT in a new tab with the passage and its context (lesson, stage, the paragraphs around it) already written as a question; <strong>Copy prompt</strong> gives you the same text for
                any other assistant. <strong>Copy link</strong> makes a link that opens the page scrolled to that exact line (on phones, <strong>Link</strong> also offers your phone&apos;s Share sheet). The <strong>#</strong> next to any
                heading copies a link to that section.
              </p>
              <p>
                Keyboard: select text (or <Kbd>Shift</Kbd> + arrows), then <Kbd>H</Kbd> highlight, <Kbd>N</Kbd> note, <Kbd>B</Kbd> bookmark, <Kbd>A</Kbd> Ask AI, <Kbd>L</Kbd> copy link. <Kbd>Shift</Kbd>+<Kbd>F10</Kbd> opens the toolbar.
              </p>
            </div>
            <Shot id="select-ask" only="desktop" size="narrow" />
            <Shot id="notebook" wide caption="Shown signed in with example highlights." />
            <div className={PROSE}>
              <p>
                The <strong>Notebook</strong> has three tabs: Highlights, Notes and Bookmarks. Search across all of them, filter by week or colour, edit or delete (with undo). <strong>Open at …</strong> takes you to the stage you saved
                it from. <strong>+ Review card</strong> turns a highlight into a flashcard with its key phrase blanked out, which joins your daily standup. <strong>Export Markdown</strong> downloads everything.
              </p>
            </div>
            <Note title="Highlight, bookmark or checkpoint?">
              <p>
                <strong>Highlight</strong>: a sentence worth remembering, in colour, in the text and the Notebook. <strong>Bookmark</strong>: a place you want to come back to, with a title and note, in the Notebook (the Bookmark button in a
                lesson&apos;s header saves the whole lesson). <strong>Save checkpoint</strong>: your reading position for progress, not a Notebook item.
              </p>
            </Note>
            <Where>
              the <A href="/learn/notebook">notebook</A> tab; the pencil button in the phone reading toolbar; the Notebook card on the progress page.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ e) review */}
          <Section
            id="review"
            n="05"
            kicker="review queue & daily standup"
            title="The daily standup brings back what you missed"
            lead="A few minutes a day on cards made from your own mistakes. Cards you know come back less and less often; cards you don't come back tomorrow."
          >
            <Shot id="review-boxes" only="desktop" />
            <div className={PROSE}>
              <p>
                <strong>Where cards come from:</strong> every question you get wrong (or skip) in a trial, right answers you <strong>flagged</strong> as a guess, and highlights you turned into cards in the Notebook. You never have to make
                cards by hand.
              </p>
              <p>
                <strong>Boxes (spaced repetition).</strong> Every card sits in one of five boxes. A new card starts in Box 1. When it comes up you try to recall the answer, tap <strong>Show answer</strong>, and grade yourself:
              </p>
            </div>
            <Table
              caption="Grades and boxes"
              head={["Grade", "What happens", "Comes back"]}
              rows={[
                ["Again", "Back to Box 1", "tomorrow"],
                ["Hard", "Stays in its box", "after that box's interval"],
                ["Good", "Up one box", "after the next box's interval"],
                ["Easy", "Up two boxes", "after that box's interval"],
              ]}
            />
            <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
              Intervals: {LEITNER_INTERVALS.map((d, i) => `Box ${i + 1} ${BOX_EVERY[i]}`).join(" · ")}. A card is <strong className="text-fg">due</strong> when its date is today or earlier, so the number on the Arena tab and the hub&apos;s
              standup line is simply how many cards are waiting today. Each graded card is worth +{REVIEW_XP_PER_CARD} XP, and a review session (or a finished stage) keeps your day on the streak.
            </p>
            <Shot id="review-card" size="medium" />
            <Where>
              the <A href="/learn/review">daily standup</A>: from the Arena tab (the orange number is cards due), the Daily standup line on the hub&apos;s Continue card, or the progress page. Keys: <Kbd>Space</Kbd> shows the answer,{" "}
              <Kbd>1</Kbd>–<Kbd>4</Kbd> grade.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ f) trials & bosses */}
          <Section id="trials" n="06" kicker="trials & boss fights" title="Prove it: trials and bosses" lead="Two ways a world tests you. Trials check what you remember; the boss checks whether you can design under interview pressure.">
            <Shot id="trial-hub" />
            <div className={PROSE}>
              <p>
                <strong>Trials</strong> are a week&apos;s multiple-choice questions, split into parts of about 15–30. Each part tests one lesson and opens when you finish that lesson (a &ldquo;Locked&rdquo; part still has{" "}
                <strong>Start anyway</strong>). Questions come one per screen, untimed: choose, then <strong>Lock in</strong> to see the answer and explanation. Your picks autosave, so a closed tab comes back to the same question.
              </p>
              <p>
                <strong>Pass mark: {TRIAL_PASS_PCT}%</strong>, rounded up (12 of 15, 16 of 20, 24 of 30). The first pass of each part is worth <strong>+{LEARN_XP.trial} XP</strong>. Fail and the part rests for {TRIAL_COOLDOWN_MIN} minutes,
                then comes back with a new option order; retakes only raise your best score. Everything you missed and every flagged answer goes to your review queue. <strong>Practice all</strong> puts every question of the week on one
                untimed page with no XP; its answers are kept apart from your attempts.
              </p>
            </div>
            <Shot id="trial-question" only="desktop" />
            <Sub>Boss fights</Sub>
            <Pair>
              <Shot id="boss-entry" only="desktop" size="medium" />
              <div className={PROSE}>
                <p>
                  Each world ends with a <strong>boss</strong>: a full system design interview (a URL shortener at scale, a flash sale, an event-driven order system…). Fight it, or just read the model answer like any lesson.
                </p>
              </div>
            </Pair>
            <Shot id="boss-brief" only="desktop" />
            <div className={PROSE}>
              <p>
                <strong>Interview mode</strong>: each phase has the capstone&apos;s own time budget (the clock runs over budget, it never cuts you off). You write your answer in a scratchpad first; the model answer stays hidden until you reveal
                it. At the end you grade yourself against the capstone&apos;s checklist: <strong>{BOSS_PASS_PCT}% defeats the boss</strong> for <strong>+{BOSS_XP} XP</strong>, once. <strong>Read mode</strong> is untimed with the answer open
                and gives no boss XP. Reading the capstone to the end still completes it as a lesson (+{LEARN_XP.lesson} XP) and marks the boss node done on the tree.
              </p>
            </div>
            <Where>
              the T boxes and the diamond on each world row of the <A href={COURSE}>skill tree</A>; the trial card at the end of each lesson; the &ldquo;Fight the boss&rdquo; card at the top of each capstone.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ g0) mock interviews */}
          <Section
            id="mocks"
            n="07"
            kicker="mock interviews"
            title="Mock interviews: the real loop, between worlds"
            lead="Every few worlds the course stops teaching and interviews you: an unseen problem, a fictional company, a named interviewer and one clock."
          >
            <div className={PROSE}>
              <p>
                {mocks.length ? (
                  <>
                    There {mocks.length === 1 ? "is" : "are"} <strong>{mocks.length} mock interview{mocks.length === 1 ? "" : "s"}</strong>, one after{" "}
                    {mocks.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 ? (i === mocks.length - 1 ? " and " : ", ") : ""}World {m.afterCode} ({m.company})
                      </span>
                    ))}
                    .
                  </>
                ) : (
                  <>Mock interviews sit after Worlds 02, 05, 08 and 10.</>
                )}{" "}
                Each closes an arc of the course and covers <strong>everything taught up to that point</strong>, not just the last week. They appear on the <A href={COURSE}>skill tree</A> as their own rows between worlds (the square
                node with an orange corner), in the &ldquo;After this world&rdquo; card of a world&apos;s panel, and all together at <A href="/learn/mock">/learn/mock</A>.
              </p>
            </div>
            <Table
              caption="Boss fight versus mock interview"
              head={["", "Boss fight", "Mock interview"]}
              rows={[
                ["Problem", "The week's capstone, inside the lesson", "Unseen, mixes every week so far"],
                ["Interviewer", "The capstone's dialogue", "A named persona with a style, at a fictional company (Indian and global)"],
                ["During the round", "Write, reveal, compare, phase by phase", "One clock; follow-ups and curveballs arrive on their own; answers stay hidden"],
                ["Scoring", `Capstone checklist, ${BOSS_PASS_PCT}% to defeat`, "Levelled rubric (Junior → Staff) and a hire / no-hire verdict"],
                ["Reward", `+${BOSS_XP} XP`, `+${LEARN_XP.mock} XP and a badge, +${LEARN_XP.mockOffer} for an offer`],
              ]}
            />
            <Sub>In the room</Sub>
            <Steps
              items={[
                { title: "Lobby", body: "Read the recruiter's note, meet the interviewer, see the phases and their budgets, and pick the level you are interviewing for: Junior, SDE, Senior or Staff." },
                { title: "Join the call", body: "One clock starts. The bar at the top shows the phase clock, the total clock and a strip with every phase's budget. It runs over budget, never out; pausing is allowed but counted." },
                {
                  title: "Work through the phases",
                  body: "Clarify requirements, estimates, API and data model, high-level design, deep dives, trade-offs, wrap-up. Write in the answer box; draw boxes and arrows on the shared whiteboard tab. Everything autosaves in this browser.",
                },
                {
                  title: "The interviewer talks back",
                  body: "Follow-ups arrive at set times in a phase; pressing Done can trigger a reply (the answers to your clarifying questions, for example) before you move on. The interviewer also keeps time and nudges you along.",
                },
                { title: "Curveballs", body: "Mid-round changes like \u201cnow traffic is 10\u00d7\u201d or \u201cthe payment provider is down\u201d. Each gets its own answer box; leaving one unanswered is a red flag." },
                { title: "Hints", body: "Ask for one when you're stuck. The interviewer notes every hint, and four or more count against you." },
              ]}
            />
            <Sub>The debrief and your verdict</Sub>
            <div className={PROSE}>
              <p>
                When the call ends you see what happened (time used, phases over budget, curveballs answered, hints), then each phase: what you wrote, the <strong>model answer</strong> behind a reveal button, and the rubric. Every rubric
                signal is tagged with the lowest level at which interviewers expect it. Score each one <strong>missed, partly or nailed</strong>. Signals at or below your target level are expected; the ones above it are a bonus.
              </p>
            </div>
            <Table caption="Verdict bands" head={["Verdict", "Expected signals scored"]} rows={BAND_RULES.map((b) => [VERDICT_LABEL[b.verdict], b.rule])} />
            <div className={PROSE}>
              <p>
                <strong>Red flags</strong> from how the round went drop the verdict one band each, two at most: {RED_FLAG_RULES.map((r) => r.charAt(0).toLowerCase() + r.slice(1)).join("; ")}. You also see the level your answers read like,
                what a hire looks like at each level for that problem, and the <strong>lessons behind the signals you missed</strong>.
              </p>
              <p>
                <strong>Second opinion:</strong> &ldquo;Ask Claude&rdquo; or &ldquo;Ask ChatGPT&rdquo; opens a new tab with your answers, the curveballs, the rubric and your self-scores prefilled, asking for interviewer-style feedback and
                its own verdict. A round too long for a link goes through your clipboard. Nothing is sent to this site.
              </p>
              <p>
                <strong>Submit scorecard</strong> once every expected signal is scored (and you wrote at least {MIN_WORDS} words in the round): <strong>+{LEARN_XP.mock} XP</strong> and the loop&apos;s badge, plus{" "}
                <strong>+{LEARN_XP.mockOffer} XP</strong> the first time a verdict is Hire or better. Each is paid once; retakes go into your history and can raise your best verdict.
              </p>
            </div>
            <Note title="Where your answers live">
              <p>
                The round itself (notes, whiteboard, clock, self-scores) stays in this browser. The result (finished, offer, best verdict) goes with your XP, so signed in it follows you to other devices.
              </p>
            </Note>
            <Where>
              the mock rows between worlds on the <A href={COURSE}>skill tree</A>; <A href="/learn/mock">all mock interviews</A>; the &ldquo;between worlds&rdquo; row of the <A href="/learn/dashboard#map">progress page&apos;s course map</A>.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ g) arena */}
          <Section id="arena" n="08" kicker="the arena" title="Daily challenge, leagues and games" lead="The fun part of the course, built from the same questions and lessons. Two minutes a day keeps a streak alive.">
            <Shot id="arena-hub" />
            <Sub>Daily challenge</Sub>
            <Pair>
              <Shot id="arena-daily" />
              <div className={PROSE}>
                <p>
                  <strong>{DAILY_N} questions, {DAILY_SECONDS} seconds each</strong>, the same five for everyone that day, drawn from every quick check and trial in the course. It rolls over at <strong>00:00 IST</strong>. Run out of time and
                  it counts as a miss.
                </p>
                <p>
                  Your game score is 100 per right answer plus 5 for every second left. Only the first run of the day counts: replays are practice. The first run pays +{DAILY_XP_PER_RIGHT} XP per right answer and +{DAILY_XP_PERFECT} for 5/5,
                  plus quests (first daily +{quest("arena:daily")}, a perfect 5/5 +{quest("arena:perfect")}, 3-day streak +{quest("arena:streak3")}, 7-day streak +{quest("arena:streak7")}). Share your result as a little grid of squares.
                </p>
              </div>
            </Pair>
            <Sub>Leagues and the leaderboard</Sub>
            <Shot id="leaderboard" only="desktop" example />
            <div className={PROSE}>
              <p>
                Signed-in learners are ranked every week by <strong>leaderboard points</strong>. Everyone starts in the <strong>L1 Intern</strong> league. When the week ends (Monday 00:00 IST), the top{" "}
                {Math.round(LEAGUE_RULES.promoteShare * 100)}% of each league&apos;s active players (at least one, and only with {LEAGUE_RULES.promoteMin}+ points) move up a league; a week with zero points drops you one league. Reaching the top
                10 of the whole board in a week earns the Top 10 quest (+{quest("arena:top10")} XP).
              </p>
            </div>
            <Table
              caption="Leaderboard points"
              head={["Action", "Points", "Rule"]}
              num={[1]}
              rows={[...POINTS_TABLE.map((r) => [r.what, r.pts, r.rule]), ["Daily cap", `${POINTS.dayCap}`, "most points one day can add, whatever you do"]]}
            />
            <p className="m-0 max-w-[70ch] text-[14px] leading-relaxed text-fg-3">
              One daily challenge is worth at most {DAILY_POINTS_MAX} points ({DAILY_N} × {POINTS.dailyCorrect} + {POINTS.dailyPerfect} + {POINTS.dailySpeedMax}). Points are re-checked on the server against the course, duplicates are
              dropped, and guests see an estimate of &ldquo;local points&rdquo; instead of a rank.
            </p>
            <Sub>Quick games</Sub>
            <Shot id="arena-games" only="desktop" />
            <div className={PROSE}>
              <p>
                <strong>Arena games</strong> are 60–90 second rounds: {ARENA_GAMES.map((g) => g.name).join(", ")} (+{quest("arena:latency")} XP each on the first clear). The <strong>Playground</strong> boards ({PLAY_GAMES.map((g) => g.name).join(", ")}
                ) are longer simulations (+{quest("play:cache")} XP each). Every card lists the lessons that teach it, and best scores stay in your browser.
              </p>
            </div>
            <Where>
              the <A href="/learn/arena">arena</A> tab; the <A href="/learn/arena/leaderboard">leaderboard</A> (&ldquo;full board&rdquo;); the <A href="/learn/arena/daily">daily challenge</A>.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ h) xp */}
          <Section id="xp" n="09" kicker="xp, levels, quests & badges" title="What earns XP" lead="XP is your running total. Every amount below comes straight from the code; each one-time reward is paid once, however often you repeat the thing.">
            <Table
              caption="How XP is earned"
              head={["Action", "XP", "How often"]}
              num={[1]}
              rows={[
                ["Read a stage", `+${LEARN_XP.stage}`, "once per stage"],
                ["Finish a lesson", `+${LEARN_XP.lesson}`, "once per lesson"],
                ["Quick check right on the first try", `+${QUIZ_XP}`, "once per question"],
                ["Every quick check in a stage right first try", `+${STAGE_ACE_XP}`, "once per stage"],
                ["Pass a trial part", `+${LEARN_XP.trial}`, "first pass of each part"],
                ["Defeat a boss (interview mode, 70%+)", `+${BOSS_XP}`, "once per boss"],
                ["Finish a mock interview (scored debrief)", `+${LEARN_XP.mock}`, "once per mock, with its badge"],
                ["Hire or better in a mock interview", `+${LEARN_XP.mockOffer}`, "once per mock"],
                ["Clear a world (lessons + boss + trial parts)", `+${LEARN_XP.world}`, "once per world, with its badge"],
                ["Finish a side quest", `+${LEARN_XP.sideQuest}`, `once (${LEARN_XP.lesson} for the lesson + ${LEARN_XP.sideQuest - LEARN_XP.lesson} bonus)`],
                ["Grade a review card", `+${REVIEW_XP_PER_CARD}`, "every card, every day"],
                ["Daily challenge", `+${DAILY_XP_PER_RIGHT} / right`, `first run of the day, +${DAILY_XP_PERFECT} for 5/5`],
                ["Arena game / Playground board", `+${quest("arena:latency")} / +${quest("play:cache")}`, "first clear of each"],
                ["Case file: solve its activity", `+${CASE_ACTIVITY_XP}`, "once per case"],
                ["Case file: right call on its debrief question", `+${DEBRIEF_XP}`, "once per case that has one"],
              ]}
            />
            <Table
              caption="Levels"
              head={["Level", "From", "Unlocks"]}
              num={[1]}
              rows={LEVELS.map((l) => [`${l.code} · ${l.name}`, `${l.min.toLocaleString("en-IN")} XP`, l.unlock])}
            />
            <Shot id="questlog" only="desktop" size="narrow" />
            <div className={PROSE}>
              <p>
                <strong>Quests</strong> are one-time goals with an XP reward: the site&apos;s main quests (open the terminal, survive Tatkal Rush, read a case file to the end…) live in the quest log; course quests (First blood, daily
                streaks, Top 10, each game) are awarded as you play. <strong>Badges</strong> mark bigger milestones: one per cleared world plus site badges like First blood, Daily streak 7, Top 10, Arena regular and Case cracker. Hover a badge
                to see how to earn it.
              </p>
            </div>
            <Where>
              click the level chip (e.g. &ldquo;L4 · Senior&rdquo;) in the header for the quest log and badges; the <A href="/learn/dashboard#mastery">progress page</A> lists every badge and an XP log of recent rewards.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ i) progress */}
          <Section id="progress" n="10" kicker="your progress page" title="Everything you've done, in one place" lead="The Progress tab answers “where am I, how am I doing, what next”. Guests see this browser's data; signed in, your account merged with it.">
            <Shot id="progress-top" wide />
            <div className={PROSE}>
              <p>
                <strong>Overview:</strong> level and XP with what the next level unlocks, course % (lessons, bosses and trial parts done out of all of them), your current streak (days with a cleared stage, a lesson, a trial part or a review),
                reading time, lessons done and a bar per week. On the right: resume where you left off, the next trial part to take and today&apos;s standup.
              </p>
            </div>
            <Shot id="progress-map" only="desktop" />
            <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
              <strong className="text-fg">Course map:</strong> every lesson, boss, trial part and side quest of every week as a grid. Black is completed, an orange corner is in progress, orange trial cells are passed (with your best %), outlined
              ones were tried but below {TRIAL_PASS_PCT}%. Click any cell to open it.
            </p>
            <Shot id="progress-activity" only="desktop" />
            <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
              <strong className="text-fg">Your rhythm:</strong> a 12-week heatmap (darker = more done that day; tap a day for details), minutes per week against your goal, current and longest streak, best day and time, and the XP log.
            </p>
            <Shot id="progress-goals" only="desktop" />
            <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
              <strong className="text-fg">Weekly goal:</strong> pick minutes or lessons per week and, if you like, a finish date. The page projects when you&apos;ll finish at your recent pace and how much a week you need to make your date.{" "}
              <strong className="text-fg">What stuck:</strong> best trial score per part, review cards by box, Notebook counts and every badge.
            </p>
            <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
              <strong className="text-fg">Share my progress:</strong> turn on a public page for friends and choose what it shows. Off until you turn it on; all of it is in{" "}
              <a href="#share" className="text-signal-text underline underline-offset-4">
                the next section
              </a>
              .
            </p>
            <Shot id="progress-data" only="desktop" />
            <div className={PROSE}>
              <p>
                <strong>Your data.</strong> <strong>Download my data</strong> saves one JSON file with everything your account holds (signed in) plus this browser&apos;s copy. Signed in, an <strong>Import</strong> card offers to move
                progress you made as a guest in this browser into your account. <strong>Reset</strong> clears exactly what you choose, in three steps: what to reset, which data, confirm.
              </p>
            </div>
            <Table
              caption="Reset scopes"
              head={["Scope", "What it covers", "Data you can clear"]}
              rows={[
                ["One lesson", "a single lesson, boss or trial", partsFor("lesson").map((k) => PART_INFO[k].label).join(", ")],
                ["One week", "every lesson, boss and trial of a week", partsFor("week").map((k) => PART_INFO[k].label).join(", ")],
                ["Whole course", "all of System Design Mastery", partsFor("course").map((k) => PART_INFO[k].label).join(", ")],
                ["Everything", "the course plus XP, quests and streaks", partsFor("all").map((k) => PART_INFO[k].label).join(", ")],
              ]}
            />
            <ul className="m-0 flex max-w-[72ch] list-none flex-col gap-1.5 p-0 text-[14px] leading-relaxed text-fg-2">
              {Object.values(PART_INFO).map((p) => (
                <li key={p.label}>
                  <strong className="text-fg">{p.label}</strong>: {p.detail}.
                </li>
              ))}
              <li className="text-fg-3">A reset can&apos;t be undone; the page shows exactly what will be removed before you confirm.</li>
            </ul>
            <Where>
              the <A href="/learn/dashboard">progress</A> tab. Sections: overview · map · activity · goals · mastery · share · data (the sticky row under the header jumps between them).
            </Where>
          </Section>

          {/* ------------------------------------------------------------ i2) share */}
          <Section
            id="share"
            n="11"
            kicker="share your progress"
            title="Show your run to friends"
            lead="Your progress is private. Turn on a public page and you get one link, showing only the parts you pick, to send on WhatsApp, LinkedIn or X."
          >
            <Shot id="share-settings" example caption="Shown signed in with an example learner who chose to be anonymous." />
            <div className={PROSE}>
              <p>
                <strong>Turn it on</strong> in the share section of the Progress page (it needs an account). The <strong>Public page</strong> switch is off until you flip it or press <strong>Publish my page</strong>. While it&apos;s off
                nobody can see your progress, and switching it off again makes your link show a 404 straight away.
              </p>
              <p>
                <strong>Handle.</strong> Your page lives at <strong>himanshukukreja.in/u/&lt;handle&gt;</strong>. A handle is {HANDLE_MIN}–{HANDLE_MAX} lowercase letters, numbers or single hyphens. One is suggested from your name, and
                whatever you type is checked as you go: taken, reserved and offensive handles are refused. Changing it later breaks links you already sent.
              </p>
              <p>
                <strong>Name on the page:</strong> your full name, first name + initial or anonymous (just the @handle); new pages start with {SHARE_DEFAULT_NAME}. Your profile photo appears only if you tick it, your account has one and you
                aren&apos;t anonymous. Then pick what visitors see{SHARE_ALL_ON ? " (all six start on)" : ""}. The preview on the right follows every change, and <strong>Save changes</strong> updates a live page at once.
              </p>
            </div>
            <Table
              caption="What visitors can see"
              head={["Switch", "What it shows"]}
              rows={[
                ["Level & course progress", "level, XP, course %, lessons, world map"],
                ["Skill tree", "every world, boss and trial node, read-only"],
                ["Streak", "current and best streak"],
                ["Arena scores", "league, rank, weekly points, best daily, daily streak"],
                ["Badges", "badges you've earned"],
                ["Milestones", "worlds cleared, bosses beaten, recent wins"],
              ]}
            />
            <Note title="Never on your page" tone="signal">
              <p>
                Your email, account id, notes, highlights, bookmarks and exact study times are never shown, whatever you switch on. Public pages are kept out of search engines, and a handle that doesn&apos;t exist looks exactly like one
                that&apos;s switched off (both are a 404), so nobody can check who has a page.
              </p>
            </Note>

            <Sub>The share sheet</Sub>
            <Pair>
              <Shot id="share-sheet" example />
              <div className={PROSE}>
                <p>
                  Every <strong>Share</strong> button opens the same sheet: your link with <strong>Copy link</strong>, <strong>WhatsApp</strong>, <strong>LinkedIn</strong> and <strong>Post</strong> (X) with a message already written,
                  and <strong>copy message + link</strong>. On a phone, <strong>Share…</strong> opens your phone&apos;s own share menu.
                </p>
                <p>
                  <strong>Page still off?</strong> The sheet offers <strong>Turn on &amp; get my link</strong> (it publishes with your saved choices, or the defaults) or <strong>Choose what&apos;s visible</strong>, which brings you to the settings. As a
                  guest it asks you to <strong>sign in to get your share link</strong>, and the progress in this browser comes with you; you can also share the course itself instead.
                </p>
              </div>
            </Pair>
            <Table
              caption="Where the Share buttons are"
              head={["Where", "Button", "The link opens"]}
              rows={[
                ["Progress page, under your level", "share my progress", "your page"],
                ["Progress page, share section", "Share my page", "your page"],
                ["Course hub, next to Skill tree", "Share", "your page"],
                ["Daily challenge result", "Challenge a friend", "today's daily challenge (works without a page or an account)"],
                ["World cleared, level up", "Share it", "that world's or level's achievement page"],
                ["Boss debrief, after a win", "Share the win", "that boss's achievement page"],
                ["End of a lesson, once complete", "Share", "your page"],
                ["Progress page, badges", "share", "your page"],
                ["Leaderboard, your own row", "share icon", "your league rank's achievement page"],
              ]}
            />

            <Sub>Your public page</Sub>
            <Shot id="share-public" example wide />
            <div className={PROSE}>
              <p>
                What a friend sees when they open your link, no account needed: your name or @handle, your level on the L1 Intern → L6 Principal ladder with XP, course %, streak, lessons and worlds done, a world map, a read-only copy of your
                skill tree, your Arena scores, badges and recent milestones. Each part is there only if its switch is on.
              </p>
              <p>
                The page ends with an invitation: <strong>Start the free course</strong> or <strong>Take today&apos;s daily challenge</strong>, plus &ldquo;Can you beat …?&rdquo; next to your scores. When you open your own page signed in,
                a &ldquo;your page&rdquo; bar adds <strong>Edit what&apos;s visible</strong> and <strong>Share</strong>; visitors never see it.
              </p>
            </div>
            <Shot id="share-public-scores" only="desktop" example />
            <Pair>
              <Shot id="share-achievement" only="desktop" example />
              <div className={PROSE}>
                <p>
                  <strong>Achievement pages</strong> (/u/&lt;handle&gt;/a/…) show one win, big: a cleared world, a beaten boss, a level, your streak, your best daily, your league rank this week or a badge. They exist only for what your page
                  shows; otherwise the link opens your page.
                </p>
                <p>
                  <strong>Link previews.</strong> Paste your link into WhatsApp, Slack, LinkedIn or X and it unfolds into a preview card of your page or the achievement.
                </p>
              </div>
            </Pair>
            <Note title="Who came from your link">
              <p>
                When someone arrives through your link and creates an account within {REF_DAYS} days, the sign-up is counted for your link (the first link a browser arrived from is the one that counts). Only the site owner sees these
                numbers, and nothing about the visitor appears on your page.
              </p>
            </Note>
            <Where>
              the share section of the <A href="/learn/dashboard#share">progress page</A> (signed in); the Share buttons above, at the moments worth sharing; your page itself at /u/&lt;handle&gt;.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ j) cases */}
          <Section
            id="offline"
            n="12"
            kicker="offline reading & the app"
            title="Read with no internet"
            lead="Save lessons on your phone or laptop and read them on a flight, on the metro, anywhere. No app store: the website saves them, and it can be installed like an app."
          >
            <Steps
              items={[
                {
                  title: (
                    <>
                      Tap <strong>Save offline</strong>
                    </>
                  ),
                  body: (
                    <>
                      It sits next to the title of every lesson, preview, boss, side quest, trial, mock interview and case file (the cloud icon on a phone). To save more at once, open a world on the course map and press <strong>Save this world offline</strong>, or use{" "}
                      <strong>Save the entire course</strong> in the <strong>Read offline</strong> card on the course map. Sizes are shown before you start; the whole course is large, so do it on wifi.
                    </>
                  ),
                },
                {
                  title: <>Read anywhere</>,
                  body: (
                    <>
                      With no connection, a saved page opens from its usual link, from the course map or from the <A href="/learn/offline">offline library</A> (the cloud icon next to <strong>?</strong> in the course header). A line at the top says{" "}
                      <strong>Offline · saved copy</strong>. Diagrams, code, quick checks, trials, stage clears and XP all work; a page you didn&apos;t save shows a short &ldquo;you&apos;re offline&rdquo; page with a link to your library.
                    </>
                  ),
                },
                {
                  title: <>Land and sync</>,
                  body: (
                    <>
                      Progress made offline stays on the device and, if you&apos;re signed in, goes up to your account when you&apos;re back online, merged so nothing is lost or counted twice. Saved copies refresh themselves in the background when a
                      lesson changes (the library marks them <strong>update available</strong> until then).
                    </>
                  ),
                },
              ]}
            />
            <Table
              caption="What works offline"
              head={["Works offline", "Needs a connection"]}
              rows={[
                ["Reading, diagrams, highlighted code, :::blocks", "Comments and the discussion"],
                ["Quick checks, trials, boss fights, mock interviews", "Ask Claude / ChatGPT (the prompt is copied for later)"],
                ["Stage clears, XP, streak days on this device", "Search, the leaderboard, sign-in, sharing"],
              ]}
            />
            <Sub>Install it as an app</Sub>
            <div className={PROSE}>
              <p>
                <strong>Android, Chrome or Edge on a laptop:</strong> press <strong>Install the app</strong> in the offline library or the Read offline card (or the install icon in the address bar). The course opens from your home screen or
                dock, full screen, with your saved lessons.
              </p>
              <p>
                <strong>iPhone and iPad:</strong> Safari has no install button, so the library shows the steps: <strong>Share</strong> → <strong>Add to Home Screen</strong>. Do this if you rely on saved lessons: Safari can clear a
                website&apos;s data after about a week without a visit, but an app on the home screen keeps it. Lessons saved in Safari don&apos;t carry over into the home-screen app, so save them from the app.
              </p>
            </div>
            <Note title="Space on your device">
              <p>
                The library shows how much is used and how much the browser allows. A lesson takes about 100 KB, the reader app about 3 MB once (shared by everything you save). If the device runs out of space, saving stops with a clear message and
                what is already saved stays; remove things from the library to make room.
              </p>
            </Note>
          </Section>

          <Section id="cases" n="13" kicker="case files" title="Case files: real stories, with a drill at the end" lead="Production incidents, rush hours and build logs told as stories with blueprints. They live outside the course, under Case files.">
            <Shot id="case-index" only="desktop" />
            <div className={PROSE}>
              <p>
                A case file is <strong>closed</strong> when you have read it: the same reading rules as lessons apply to its checkpoint sections, or use &ldquo;Close the case&rdquo; once most of the reading time is in. Reading your first case
                file to the end is a quest (+{quest("read")} XP) and earns the On-call badge. A case can also end with a <strong>debrief question</strong> (the Tatkal case does): make the right call for +{DEBRIEF_XP} XP, one answer per case.
              </p>
              <p>
                {caseActivities} case files end with an <strong>interactive activity</strong>: a simulation or spot-the-bug drill in a few steps. Score {CASE_ACTIVITY_PASS_PCT}% to <strong>solve</strong> it for +{CASE_ACTIVITY_XP} XP; rerun
                it as often as you like to raise your best. Solve all of them for the Case cracker quest (+{quest("cases:all")} XP) and badge.
              </p>
            </div>
            <Shot id="case-activity" only="desktop" size="medium" />
            <Where>
              <A href="/stories">Case files</A> in the site header (outside the course). Your record (closed · solved) is at the top of the index.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ k) account */}
          <Section id="account" n="14" kicker="accounts, privacy & data" title="Do you need an account?" lead="No. Every lesson, quick check, trial, boss, game and the daily challenge work without one. An account adds a few things.">
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
              sign in from the header; <A href="/learn/dashboard#data">progress → your data</A> to export or reset; <A href="/privacy">privacy &amp; analytics</A> to opt out.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ l) faq */}
          <Section id="faq" n="15" kicker="faq" title="Questions people actually ask">
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
          <Section id="glossary" n="16" kicker="glossary" title="Words the course uses">
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
        </div>
      </div>
    </main>
  );
}

const FAQ: [string, React.ReactNode][] = [
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
      As a guest, progress lives only in that browser, so clearing site data removes it. Signed in, it&apos;s in your account: just sign in again. To keep a copy either way, use <Link href="/learn/dashboard#data">Download my data</Link> on the
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
      Not unless you turn on your public page in <Link href="/learn/dashboard#share">Progress → share</Link>; it&apos;s off by default. You pick the handle, the name shown (full, first name + initial or anonymous) and which of six parts appear.
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
  ["Does replaying the daily challenge count?", <>No, only your first run of the day counts for XP, points and the streak. Replays are practice.</>],
  ["Does re-reading a lesson reset it?", <>Never. Completed stays completed and percentages never go down. Only the Reset on the progress page removes progress.</>],
  ["Does listening count as reading?", <>Yes. While Listen is reading the lesson aloud, the time counts even if you don&apos;t touch the screen.</>],
  [
    "How do I start over?",
    <>
      Progress page → <Link href="/learn/dashboard#data">Your data</Link> → Reset. Choose one lesson, one week, the whole course or everything, and which kinds of data to clear. Download your data first if you might want it back.
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
  ["Mock interview", "A timed interview loop between worlds: an unseen problem from a fictional company, a named interviewer, curveballs, then a debrief with a levelled rubric and a verdict."],
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
];
