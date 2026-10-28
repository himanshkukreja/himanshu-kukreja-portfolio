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
  DIFFICULTY_LABEL,
  DOW_XP,
  LAB_REVEAL_AFTER_RUNS,
  LAB_XP,
  MASTERY_STATES,
  PYTHON_VERSION,
  REVISE_MIN_PER_LESSON,
  REVISE_WEEK_XP,
  RUNTIME_DOWNLOAD_LABEL,
  RUNTIME_STORED_LABEL,
} from "./facts";
import { CERT_XP, MOCKS_NEEDED as CERT_MOCKS, NAME_MAX as CERT_NAME_MAX, TRIAL_PASS_PCT as CERT_PASS_PCT } from "@/lib/certificates/core";

const COURSE = "/learn/system-design-mastery";

const TOC: TocItem[] = [
  { id: "overview", label: "How it works" },
  { id: "tabs", label: "The five tabs" },
  { id: "glance", label: "At a glance" },
  { id: "xp-vs-points", label: "XP vs points" },
  { id: "map", n: "01", label: "The course map" },
  { id: "lesson", n: "02", label: "Reading a lesson" },
  { id: "lectures", n: "03", label: "Video lectures" },
  { id: "completion", n: "04", label: "Progress rules" },
  { id: "notebook", n: "05", label: "Notebook" },
  { id: "review", n: "06", label: "Review & standup" },
  { id: "trials", n: "07", label: "Trials & bosses" },
  { id: "mocks", n: "08", label: "Mock interviews" },
  { id: "practice", n: "09", label: "Interview prep" },
  { id: "arena", n: "10", label: "The Arena" },
  { id: "xp", n: "11", label: "XP, levels, badges" },
  { id: "progress", n: "12", label: "Progress page" },
  { id: "share", n: "13", label: "Share your progress" },
  { id: "certificates", n: "14", label: "Certificates" },
  { id: "offline", n: "15", label: "Offline reading" },
  { id: "cases", n: "16", label: "Case files" },
  { id: "war-stories", n: "17", label: "War stories" },
  { id: "ai", n: "18", label: "AI in the course" },
  { id: "account", n: "19", label: "Account & data" },
  { id: "faq", n: "20", label: "FAQ" },
  { id: "glossary", n: "21", label: "Glossary" },
];

const LOOP = [
  { t: "Read a lesson", d: "Each lesson is split into stages. Start anywhere; nothing is locked." },
  { t: "Clear stages", d: "A stage clears after real reading. Quick checks inside test you as you go." },
  { t: "Earn XP", d: `+${LEARN_XP.stage} a stage, +${LEARN_XP.lesson} a lesson, +${QUIZ_XP} per quick check right first time.` },
  { t: "Review", d: "What you miss comes back in the daily standup, right before you forget it." },
  { t: "Beat the boss & trial", d: "End each world with a timed interview and the week's MCQ parts. After most worlds, a full mock interview loop." },
  { t: "Climb leagues", d: "Signed in, your activity scores weekly points. The top of each league moves up." },
];

/** `caseActivities`: live count (repo TSX activities + published CMS ones); falls back to the repo count. */
/** The lecture player's checkpoint reward (LecturePlayer's QUIZ_XP). */
const LECTURE_QUIZ_XP = 10;

export type GuideLectures = { total: number; minutes: number; parts: string };

export default function Guide({ map, caseActivities = CASE_ACTIVITIES, lectures = null }: { map: CourseMap | null; caseActivities?: number; lectures?: GuideLectures | null }) {
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
          {/* ------------------------------------------------------------ the five tabs */}
          <section id="tabs" aria-labelledby="tabs-h" className="flex scroll-mt-[calc(var(--hk-header-h,61px)+72px)] flex-col gap-5 lg:scroll-mt-[calc(var(--hk-header-h,61px)+24px)]">
            <div className="flex flex-col gap-2">
              <span className={LABEL}>the five tabs · where everything lives, and why</span>
              <h2 id="tabs-h" className="font-display text-[30px] font-extrabold leading-none tracking-[-0.035em] text-fg sm:text-[40px]">
                One question per tab<span className="text-signal-text">.</span>
              </h2>
              <p className="m-0 max-w-[70ch] text-[16px] leading-relaxed text-fg-2">
                The tabs at the top of every Learn page (the dock at the bottom on a phone) each answer one question. If you&apos;re wondering where something is, ask which question it answers.
              </p>
            </div>
            <Table
              caption="The five tabs"
              head={["Tab", "The question", "What's in it"]}
              rows={[
                [<A key="c" href={COURSE}>course</A>, "Learn it", "The worlds and their lessons, bosses and trials, side quests and their design sheets, concepts A–Z, the reading trail."],
                [<A key="p" href="/learn/prep">prep</A>, "Get hired", "The video lectures, mock interviews (solo or with a peer, each with a recorded model round), company pages and the question bank, the problem bank and low-level design, revision decks, cheat and design sheets, code labs, the numbers playground, the study planner."],
                [<A key="a" href="/learn/arena">arena</A>, "Play", "The daily challenge, weekly leagues, quick games, your review queue (daily standup) and design of the week."],
                [<A key="s" href="/learn/war-stories">stories</A>, "See it for real", "True stories of real systems at their limits, and war rooms: incidents you play as the on-call engineer."],
                [<A key="y" href="/learn/dashboard">you</A>, "My stuff", "Progress, the notebook (highlights, notes, bookmarks), concept mastery and certificates."],
              ]}
            />
          </section>

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
                <strong>Side quests</strong> ({s?.sideQuests ?? 33} of them) are real systems designed end to end: UPI, WhatsApp, Netflix, Uber and more. They are bonus problems, open any time, worth +{LEARN_XP.sideQuest} XP each, and each has a video lecture. The <strong>design sheets →</strong> link next to their title opens{" "}
                <a href="#practice-sheets" className="text-signal-text underline underline-offset-4">
                  every side quest&apos;s design sheet
                </a>
                , for revising it later.
              </p>
              <p>
                The classic interview problems and low-level design live in the <a href="#practice-companies" className="text-signal-text underline underline-offset-4">Prep tab</a>, next to the company pages. Under the side quests,{" "}
                <strong>Beyond the course</strong> points to Prep, the Arena and War stories, plus <A href="/learn/concepts">concepts A–Z</A> (every concept with its own page: definition, key points, the lessons that teach it, related
                concepts), the reading trail and the design sheets. Below that, <strong>Read offline</strong> saves the whole course or opens the{" "}
                <a href="#offline" className="text-signal-text underline underline-offset-4">offline library</a>, and the dashed card at the bottom, <strong>The Plan</strong>, is the 10-week roadmap.
              </p>
            </div>
            <Shot id="hub-side" />
            <Note title="Recommended order">
              <p>
                Go world by world: Preview → Day 1 … Day 5 → each lesson&apos;s trial part right after you finish it → the boss to close the week. New to system design? Start with Week 00 Foundations. Already comfortable? Jump to any world,
                nothing is locked; side quests make good weekend practice once a world or two is done.
              </p>
            </Note>
            <Sub id="practice-reading">Reading trail</Sub>
            <div className={PROSE}>
              <p>
                At the end of a lesson, <strong>Go deeper · reading trail</strong> shows two or three real write-ups (company engineering blogs, papers, talks, postmortems), each in three lines: what it is, the key idea and why it&apos;s
                here. <strong>Mark read</strong> keeps track (signed in, it follows you). The <A href="/learn/reading">reading trail</A> page lists them all by world, with search and company and type filters. The cards work offline in a saved
                copy; only the links out need a connection.
              </p>
            </div>

            <Where>
              the <A href={COURSE}>course</A> tab (top of every Learn page; bottom dock on phones). The Continue card on the hub always points at your next stage.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ b) lesson */}
          <Section id="lesson" n="02" kicker="reading a lesson" title="The lesson screen, piece by piece" lead="Everything around the text is there to tell you where you are and to get out of the way while you read.">
            <Shot id="lesson-top" wide />
            <div className={PROSE}>
              <p>
                <strong>Header and course tabs.</strong> On every Learn page the site header turns into the course header: <em>course · prep · arena · stories · you</em> (what each holds is in <a href="#tabs" className="text-signal-text underline underline-offset-4">the five tabs</a>), a search box (<Kbd>⌘K</Kbd>: lessons, side quests, problems,
                low-level design and case files), your level chip and the light/dark switch. On phones the same tabs live in the dock at the bottom, with a way back to the rest of the site.
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
                article and goes full screen where the browser allows it (<Kbd>Esc</Kbd> to leave); <strong>Aa</strong> cycles the text size 17 → 19 → 21 px and remembers it; <strong>TERMS</strong> turns the term cards on or off (more in{" "}
                <a href="#practice-concepts" className="text-signal-text underline underline-offset-4">
                  the concept map
                </a>
                ). Phones also get Contents (with the same term-card switch) and a shortcut to the Notebook. The orange <strong>Ask AI</strong> button above them opens the built-in AI for this lesson (more in{" "}
                <a href="#ai" className="text-signal-text underline underline-offset-4">
                  AI in the course
                </a>
                ).
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
                <strong>Step-through diagrams</strong> have a <strong>&#9654; Steps</strong> button: it lights one hop at a time in orange, with a caption, and you move with &#9664; &#9654; or the arrow keys (also full screen).{" "}
                <strong>Explainers</strong> are animations that walk you through an idea step by step. Every lesson and side quest opens with one that walks the <strong>whole article</strong> (its tabs are the article&apos;s parts), and
                smaller ones show a single idea, like a hash ring gaining a node or a circuit breaker tripping. They play when you scroll to them; pause, step, switch tabs or change the speed. With reduced motion turned on in your system
                they don&apos;t auto-play: you step through them yourself. Both work offline in saved lessons.
              </p>
              <p>
                <strong>&#128266; Narrate</strong> plays an explainer with its captions read aloud by your browser&apos;s voice, moving through the steps and tabs by itself, like a short video. Only one explainer talks at a time, and
                starting one stops <strong>Listen</strong>. <strong>Break it</strong> labs add sliders under the animation (traffic, cache TTL, replicas, timeouts…): push a number until the system falls over and watch where it breaks.
              </p>
              <p>
                <strong>Diagram icons.</strong> Boxes that stand for a real technology carry its logo (Kafka, PostgreSQL, Redis…) and generic parts get a simple icon (a user, a phone, a queue, a load balancer). The label stays under every
                icon, and monochrome icons take the theme&apos;s colours in light and dark.
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
              any lesson from the <A href={COURSE}>course hub</A>. Each lesson ends with the Finish card, a five-minute revision card, any code lab that practises it, questions learners ask (answered from the lesson,
              free), the reading trail, then what&apos;s up next (across weeks) and the trial part that tests it.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ b2) video lectures */}
          <Section
            id="lectures"
            n="03"
            kicker="video lectures"
            title="Watch it: an animated lecture for everything"
            lead="Every lesson in Weeks 0–10, every side quest, interview problem, low-level design article and case file has a narrated, animated lecture: the same ideas, drawn as they are explained. Every mock interview has a recorded model round."
          >
            <div className={PROSE}>
              <p>
                {lectures ? (
                  <>
                    There are <strong>{lectures.total} lectures</strong> ({lectures.parts}), about {Math.round(lectures.minutes / 60)} hours in all.
                  </>
                ) : (
                  <>Every piece of content has one.</>
                )}{" "}
                Diagrams build up while the narration explains them, requests travel through them, and the numbers, timelines and phone screens appear as they are mentioned. The lectures link back to the earlier lessons they build on
                (the <strong>↩ recall</strong> chips), and when one ends the next one in the same track starts by itself.
              </p>
              <p>
                <strong>Watching is free with an account.</strong> Signed out, a lecture plays its first minute, then asks you to sign in. <strong>Share</strong> in the player gives you a link that can start at the
                moment you are on; anyone who opens a link you shared watches all of it, no account needed. The <strong>👍</strong> next to Save offline upvotes a lecture (one vote each, signed in), and the
                header and the playlist show how many people have watched it.
              </p>
            </div>
            <Shot id="lecture-player" wide />
            <Sub>Where to find them</Sub>
            <Steps
              items={[
                { title: "On the page you are reading", body: "A “watch it first” card at the top of a lesson, side quest, problem, LLD article or case file opens its lecture. A mock interview's lobby has one for its recorded round." },
                {
                  title: "The playlist",
                  body: (
                    <>
                      <A href="/learn/prep/lectures">Prep → Video lectures</A> lists every lecture in course order, then the recorded mock interviews, the side quests, interview problems, low-level design and case files. On a
                      computer the sidebar lists every section with how many you have watched; on a phone the tracks are buttons, with a <strong>jump to</strong> menu for the sections.
                    </>
                  ),
                },
                { title: "Back to the text", body: "The button under the lecture's title opens the lesson, side quest, problem, LLD article, case file or mock interview it teaches." },
              ]}
            />
            <Sub>The player</Sub>
            <Table
              caption="Controls (keyboard in brackets)"
              head={["Control", "What it does"]}
              rows={[
                ["Chapters", "Jump to any part from the list beside the video (below it on phones). The seek bar has one segment per chapter; hover it to preview that moment"],
                ["Captions (C)", "On or off; the voice is matched word for word"],
                ["Music (M)", "The quiet background music on or off, when the recording has some"],
                ["Speed (< >)", "0.75× to 2×"],
                ["Picture-in-picture", "Keep watching in a small window while you read or code (desktop browsers that support it)"],
                ["Full screen (F)", "The controls hide after a few seconds"],
                ["Play (space or K), step (← →), 10 s (J L)", "Keyboard control without leaving the page"],
                ["Save offline", "Under the title: the lecture with its recorded audio, captions and poster, to watch with no internet"],
              ]}
            />
            <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
              Your captions, music, speed and autoplay choices are remembered in this browser. Opened again, a lecture offers <strong className="text-fg">resume from</strong> the point where you stopped.
            </p>
            <Sub id="lectures-autoplay">Up next and autoplay</Sub>
            <Pair>
              <Shot id="lecture-end" only="desktop" />
              <div className={PROSE}>
                <p>
                  When a lecture ends, the end screen shows what comes next in the same track (the next lesson, the next side quest, the next problem) and plays it after an <strong>8-second countdown</strong>. <strong>Play now</strong>{" "}
                  skips the wait, <strong>cancel</strong> stays on this lecture (then <strong>watch again</strong> starts it over).
                </p>
                <p>
                  The <strong>autoplay next</strong> switch on the end screen and under <strong>up next</strong> in the chapter list turns it off, and the choice is remembered. The last lecture of a track has no up next.
                </p>
              </div>
            </Pair>
            <Sub>Checkpoints, questions and answers</Sub>
            <div className={PROSE}>
              <p>
                <strong>Quiz checkpoints</strong> pause the lecture and ask about what was just shown; a right answer earns <strong>+{LECTURE_QUIZ_XP} XP</strong> (once per question), and the chapter list marks each one ✓ or ✕.
              </p>
              <p>
                <strong>✦ Ask about this moment</strong> (<Kbd>A</Kbd>) pauses the lecture and opens a panel over the right of the stage (a sheet on phones). Under each chapter, <strong>learners often ask here</strong> has the common
                questions already answered, free to read. Signed in, you can ask your own or tap a quick question (explain it simpler, a real example, why not the naive way, what an interviewer would ask, in Hinglish). The AI answers
                with the paused moment in front of it, can light up part of the diagram and can offer a chip that jumps to another chapter. Closing the panel resumes the lecture if it was playing.
              </p>
            </div>
            <Shot id="lecture-ask" only="desktop" caption="Shown signed in." />
            <Sub id="lectures-progress">Progress and difficulty</Sub>
            <Shot id="lectures-playlist" />
            <div className={PROSE}>
              <p>
                The playlist shows how much you have watched overall and in each section, <strong>continue watching</strong> for lectures you started (or what comes next), and a <strong>✓ watched</strong> mark once you reach 90% of a
                lecture. A lecture resumes where you stopped; signed in, that follows you to other devices. The <a href="#progress" className="text-signal-text underline underline-offset-4">Progress page</a> adds your watch time.
                Every lecture carries a difficulty tag:
              </p>
            </div>
            <Table
              caption="Difficulty tags"
              head={["Tag", "Means"]}
              rows={[
                ["Beginner", "Week 0, the foundations"],
                ["Intermediate", "Weeks 1–4, problems or articles marked medium, case files, and mock interviews set at Junior or SDE level"],
                ["Advanced", "Weeks 5–10, the first capstones, problems or articles marked hard, and Senior-level mock interviews"],
                ["Expert", "The later capstones, problems or articles marked expert, and Staff-level mock interviews"],
              ]}
            />
            <Note title="Recorded mock interviews">
              <p>
                Every mock interview also comes as a recorded round: a 40–50 minute call between the interviewer and a strong candidate, in two voices, from the greeting and the clarifying questions to the curveballs and the wrap-up.
                The mock&apos;s lobby shows it as &ldquo;watch it first&rdquo; and the Prep page as &ldquo;watch it done well&rdquo;; watch it, then sit the same round yourself.
              </p>
            </Note>
            <Where>
              <A href="/learn/prep/lectures">the playlist</A>; the &ldquo;watch it first&rdquo; card at the top of any lesson; a mock interview&apos;s lobby; <A href="/learn/dashboard#videos">progress → videos</A> for your watch time.
            </Where>
          </Section>
          {/* ------------------------------------------------------------ c) completion */}
          <Section id="completion" n="04" kicker="progress & completion" title="How a lesson counts as done" lead="Progress is earned by actually reading, not by scrolling to the bottom. Here are the rules in plain words.">
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
                ["Lecture progress: resume point, watched, watch time", "This browser only", "Your account, on every device"],
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
            n="05"
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
            n="06"
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
          <Section id="trials" n="07" kicker="trials & boss fights" title="Prove it: trials and bosses" lead="Two ways a world tests you. Trials check what you remember; the boss checks whether you can design under interview pressure.">
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
            n="08"
            kicker="mock interviews"
            title="Mock interviews: the real loop, between worlds"
            lead="After most worlds the course stops teaching and interviews you: an unseen problem, a fictional company, a named interviewer and one clock."
          >
            <div className={PROSE}>
              <p>
                {mocks.length ? (
                  <>
                    There {mocks.length === 1 ? "is" : "are"} <strong>{mocks.length} mock interview{mocks.length === 1 ? "" : "s"}</strong>, numbered in course order, one after{" "}
                    {mocks.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 ? (i === mocks.length - 1 ? " and " : ", ") : ""}World {m.afterCode} ({m.company})
                      </span>
                    ))}
                    .
                  </>
                ) : (
                  <>Mock interviews sit between the worlds, numbered in course order.</>
                )}{" "}
                Each covers <strong>everything taught up to that point</strong>, not just the last week. They appear on the <A href={COURSE}>skill tree</A> as their own rows between worlds (the square node with an orange corner), in the
                &ldquo;After this world&rdquo; card of a world&apos;s panel, on the Prep page and all together at <A href="/learn/mock">/learn/mock</A>.
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
            <Sub id="mocks-lobby">The lobby</Sub>
            <Shot id="mock-lobby" only="desktop" />
            <div className={PROSE}>
              <p>
                Each mock opens on its lobby: the recruiter&apos;s note, the interviewer and their style, the fictional company, and on a wide screen a <strong>cover</strong> that sketches the problem like a whiteboard. Below that,{" "}
                <strong>watch it first</strong> plays the same round recorded: a model interview in two voices (see{" "}
                <a href="#lectures" className="text-signal-text underline underline-offset-4">
                  video lectures
                </a>
                ). Then the phases and their budgets, and the level you are interviewing for: Junior, SDE, Senior or Staff.
              </p>
            </div>
            <Sub id="mocks-room">In the room</Sub>
            <Pair>
              <Shot id="mock-briefing" only="desktop" />
              <div className={PROSE}>
                <p>
                  <strong>Join the call</strong> opens a short briefing first: the clock and the phase budgets, how the interviewer talks while you work, the ways to answer, the voice call, the live coach and what the debrief gives you.
                  Tick <strong>don&apos;t show this again</strong> to skip it next time. The clock starts with <strong>I&apos;m ready</strong>.
                </p>
              </div>
            </Pair>
            <Shot id="mock-room" example caption="Shown signed in; the live coach's note is an example." />
            <Steps
              items={[
                { title: "One clock", body: "The bar at the top shows the phase clock, the total clock and a strip with every phase's budget (tap an earlier phase to go back to it). It runs over budget, never out; pausing is allowed but counted. End asks once more before it ends the call." },
                {
                  title: "Work through the phases",
                  body: "Clarify requirements, estimates, API and data model, high-level design, deep dives, trade-offs, wrap-up. Write in the answer box, or press Dictate to speak and let your browser type it (Chrome, Edge, Safari; nothing goes through this site). Everything autosaves in this browser.",
                },
                {
                  title: "The interviewer talks back",
                  body: "Follow-ups arrive at set times in a phase; pressing Done can trigger a reply (the answers to your clarifying questions, for example) before you move on. The interviewer also keeps time and nudges you along.",
                },
                { title: "Curveballs", body: "Mid-round changes like “now traffic is 10×” or “the SMS provider stops delivering”. Each gets its own answer box; leaving one unanswered is a red flag." },
                { title: "Hints", body: "Ask for one when you're stuck. The interviewer notes every hint, and four or more count against you." },
                {
                  title: "Talk to the AI interviewer",
                  body: "Signed in, the “live with” box answers what you said in character, pushes on the gaps and throws the curveballs. Type, send your notes for the phase, or start a voice call: you speak, the interviewer answers out loud, then listens again.",
                },
                {
                  title: "The live coach",
                  body: "Signed in, after each phase a short AI read sits at the top of the next one: what landed, the gaps as nudges (never the answer) and one thing to try. A real interviewer wouldn't do this, so switch it off in the briefing or on the card for a pure mock.",
                },
                { title: "Leave or restart", body: "The ⋯ menu on the call bar leaves for the lobby (the clock pauses, your answers wait) or restarts the round from phase 1 after asking you to confirm." },
              ]}
            />
            <Sub id="mocks-board">The whiteboard</Sub>
            <Shot id="mock-board" only="desktop" />
            <div className={PROSE}>
              <p>
                The <strong>Whiteboard</strong> tab is a real diagram canvas. Building blocks with icons (client, users, CDN, load balancer, API gateway and service, worker, database, cache, queue, stream, object storage, search index,
                scheduler, monitoring) drop in with a click, in a free spot. <strong>Tech logos</strong> adds any technology by name (Redis, Kafka, PostgreSQL…), and <strong>+ Custom block</strong> makes your own: a name, a shape, a colour
                and an icon, kept in <strong>my blocks</strong> for next time. Draw an arrow from one block to another and it stays attached when you move them. <strong>Full screen</strong> gives it the whole window; the menu exports a
                PNG. Notes under the board are shared across phases.
              </p>
            </div>
            <Sub id="mocks-debrief">The debrief and your verdict</Sub>
            <Shot id="mock-debrief" only="desktop" example caption="Shown signed in, mid-way through scoring an example round." />
            <div className={PROSE}>
              <p>
                When the call ends you see what happened (time used, phases over budget, curveballs answered, hints, pauses, words written), any red flags, <strong>your whiteboard</strong> as a picture with its blocks and arrows written
                out, then each phase: what you wrote, what the live coach said, the <strong>model answer</strong> behind a reveal button, and the rubric. Every rubric signal is tagged with the lowest level at which interviewers expect it,
                with links to the lessons that teach it. Score each one <strong>missed, partly or nailed</strong>. Signals at or below your target level are expected; the ones above it are a bonus. Until you reveal a model answer,{" "}
                <strong>← Back to the call</strong> returns to the round.
              </p>
            </div>
            <Shot id="mock-rubric" only="desktop" size="medium" />
            <Table caption="Verdict bands" head={["Verdict", "Expected signals scored"]} rows={BAND_RULES.map((b) => [VERDICT_LABEL[b.verdict], b.rule])} />
            <div className={PROSE}>
              <p>
                <strong>Red flags</strong> from how the round went drop the verdict one band each, two at most: {RED_FLAG_RULES.map((r) => r.charAt(0).toLowerCase() + r.slice(1)).join("; ")}. You also see the level your answers read like,
                what a hire looks like at each level for that problem, and the <strong>lessons behind the signals you missed</strong>.
              </p>
              <p>
                <strong>Second opinions:</strong> signed in, the <strong>AI scorecard</strong> grades every phase against its rubric, quoting your words; it sits beside your own scores and doesn&apos;t change XP. &ldquo;Ask Claude&rdquo; or
                &ldquo;Ask ChatGPT&rdquo; opens a new tab with your answers, the curveballs, the rubric and your self-scores prefilled, asking for interviewer-style feedback and its own verdict. A round too long for a link goes through
                your clipboard.
              </p>
              <p>
                <strong>Submit scorecard</strong> once every expected signal is scored (and you wrote at least {MIN_WORDS} words in the round): <strong>+{LEARN_XP.mock} XP</strong> and the loop&apos;s badge, plus{" "}
                <strong>+{LEARN_XP.mockOffer} XP</strong> the first time a verdict is Hire or better. Each is paid once; retakes go into your history and can raise your best verdict.
              </p>
            </div>
            <div className={PROSE}>
              <p>
                <strong>Practise with a real person:</strong> on <A href="/learn/mock/peers">peer mock interviews</A>, post a time slot and pick one of the course&apos;s mocks and a role (candidate, interviewer or either). When another
                learner pairs up, you both get an email with a free video room; the interviewer runs the round from the mock&apos;s page (phases, curveballs, the rubric), then you swap. Only your first name and email go to your partner;
                times show in your own time zone. Posting and pairing need an account.
              </p>
            </div>
            <Note title="Where your answers live">
              <p>
                The round itself (notes, whiteboard, clock, self-scores) stays in this browser. The result (finished, offer, best verdict) goes with your XP, so signed in it follows you to other devices. What you send to the AI
                interviewer, the coach or the AI scorecard goes to Anthropic&apos;s AI to answer it (more in <a href="#ai" className="text-signal-text underline underline-offset-4">AI in the course</a>).
              </p>
            </Note>
            <Where>
              the mock rows between worlds on the <A href={COURSE}>skill tree</A>; <A href="/learn/mock">all mock interviews</A>; the mock interviews group on the <A href="/learn/prep">Prep page</A>; the &ldquo;between worlds&rdquo; row
              of the <A href="/learn/dashboard#map">progress page&apos;s course map</A>.
            </Where>
          </Section>
          {/* ------------------------------------------------------------ g1) practice toolkit */}
          <Section
            id="practice"
            n="09"
            kicker="the prep tab"
            title="Interview prep: everything for the interview itself"
            lead="The Prep tab is for getting hired: the video lectures, what each company asks, the classic problems, timed mocks, last-night revision, drills and a plan to your interview date. Every card shows where you stand."
          >
            <Shot id="practice-hub" wide example />
            <div className={PROSE}>
              <p>
                The <A href="/learn/prep">Prep</A> page opens with the <strong>video lectures</strong> (the whole playlist, a chip per section and where to start), then <strong>mock interviews</strong>, one card each: start the
                round, or <strong>watch it done well</strong> in its recorded version. The rest is grouped as <strong>who&apos;s hiring</strong> (company pages, the question bank), <strong>classic problems</strong> (the problem bank, low-level
                design), <strong>interview night</strong> (revision decks, cheat sheets, design sheets), <strong>the real loop</strong> (code labs, mock interviews, peer mocks) and <strong>tools</strong> (numbers playground, study planner). The
                row under the title counts what you have revised, the labs you cleared, the mocks you finished and your study plan. All of it works as a guest. Saved for offline use, each card says whether its page is saved on this
                device; the rest show <strong>needs a connection</strong>.
              </p>
            </div>

            <Sub id="practice-companies">Companies and the question bank</Sub>
            <div className={PROSE}>
              <p>
                Each <A href="/learn/prep/companies">company page</A> says what the company builds, the topics its questions lean on, and two lists. <strong>Reported by candidates</strong>: questions people wrote up after
                interviewing there, each with a link to that write-up. <strong>Likely, from what they build</strong>: our pick of questions that fit its products, clearly labelled as ours. Every question links the lessons that teach it,
                and the page ends with a <strong>study path</strong> through them. No company publishes its questions; we only call a question reported when a write-up we could read says so.
              </p>
              <p>
                The <A href="/learn/prep/questions">question bank</A> merges every company&apos;s questions, most-reported first: filter by type (system design, low-level design, concept), by company or to reported ones only.
                A filled dot next to a company means reported with a source; an outline means likely.
              </p>
              <p>
                The <strong>problem bank</strong> (the classic questions: URL shortener, rate limiter, chat, news feed…) and <strong>low-level design</strong> (machine coding: parking lot, LRU cache, Splitwise…) are listed on the
                Prep page too. Each opens with a <strong>mission</strong>: the brief and the numbers you design for.
              </p>
            </div>

            <Sub id="practice-revise">Revision decks and cheat sheets</Sub>
            <Shot id="revise-deck" size="medium" />
            <div className={PROSE}>
              <p>
                A <strong>revision deck</strong> boils a lesson down to about {REVISE_MIN_PER_LESSON} minutes of cards: <strong>key ideas</strong>, <strong>numbers to remember</strong>, a <strong>trade-off</strong> table, the{" "}
                <strong>classic mistakes</strong> and <strong>if the interviewer asks</strong> (the answer stays hidden until you show it). Open one lesson&apos;s deck or <strong>Revise this world</strong> for all of them in a row. The
                clock at the top counts down {REVISE_MIN_PER_LESSON} minutes a lesson; it keeps going past zero, it never stops you.
              </p>
              <p>
                Swipe, use the arrows or the buttons. Mark each card <strong>Got it</strong> or <strong>Again</strong>: cards marked Again join your <a href="#review" className="text-signal-text underline underline-offset-4">daily standup</a>.
                Finish every lesson deck of a world (in one go or one at a time) for <strong>+{REVISE_WEEK_XP} XP</strong>, once per world. Keys: <Kbd>←</Kbd> <Kbd>→</Kbd> flip, <Kbd>Space</Kbd> next or show the answer,{" "}
                <Kbd>G</Kbd> got it, <Kbd>A</Kbd> again, <Kbd>S</Kbd> shuffle, <Kbd>Esc</Kbd> exit.
              </p>
              <p>
                A <strong>cheat sheet</strong> is the same material for a whole world on one page. It sizes itself to print on a single A4 or Letter sheet; <strong>Download PDF</strong> opens your browser&apos;s print dialog (choose
                &ldquo;Save as PDF&rdquo;), and Share sends the link. Day lessons, Foundations parts and bosses end with a <strong>Revise … in 5 min</strong> card and a link to their world&apos;s sheet.
              </p>
              <p>
                <strong>Everything at once:</strong> <A href="/learn/cheatsheet/all">every cheat sheet as one PDF</A>, one world per page, and an <A href="/learn/revise/anki.txt">Anki export</A> of all the revision cards (in Anki, File → Import: one deck,
                tagged by world and lesson) to keep revising in your own spaced-repetition app.
              </p>
            </div>

            <Sub id="practice-sheets">Design sheets</Sub>
            <div className={PROSE}>
              <p>
                A <strong>design sheet</strong> is a side quest&apos;s whole design on a few pages: the numbers at a glance, the architecture with real tech icons, the key flows as sequence diagrams, the data model as a class diagram,
                the core entity&apos;s state machine, the decisions (chose, over, because), what breaks and how it&apos;s contained, and the lines to say in the interview. Read the quest once; revise it from the sheet in about ten minutes.
              </p>
              <p>
                <strong>Download PDF</strong> prints it in the light theme with every diagram drawn, no diagram split across pages. Each side quest ends with an <strong>open the sheet</strong> card, and the{" "}
                <A href="/learn/sheets">design sheets</A> page lists them all, with how many diagrams each holds.
              </p>
            </div>
            <Shot id="sheets-index" />

            <Sub id="practice-labs">Code labs</Sub>
            <Shot id="lab-room" only="desktop" />
            <div className={PROSE}>
              <p>
                Some interviews have an &ldquo;implement this component&rdquo; round. A <strong>code lab</strong> is one of those, taken from a lesson: a token bucket, an LRU cache, a consistent hashing ring, an outbox relay and more. Read the
                brief, write Python {PYTHON_VERSION} in the editor and press <strong>Run tests</strong> (<Kbd>⌘</Kbd>/<Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>). Python runs on your device, in the browser: no install and no server. The first run
                downloads it once ({RUNTIME_DOWNLOAD_LABEL}).
              </p>
              <p>
                Each lab has example tests you can read and <strong>hidden tests</strong> for the edge cases, shown after a run (they ship with the page, so they are practice, not an exam). Hints are there when you&apos;re stuck; the solution
                unlocks after {LAB_REVEAL_AFTER_RUNS} runs, or earlier if you insist. Pass every test to <strong>clear</strong> the lab: +{LAB_XP.easy}, +{LAB_XP.medium} or +{LAB_XP.hard} XP by difficulty, once, even after peeking. Your
                code autosaves in this browser. Lessons with a lab end with a <strong>Try it in code</strong> card.
              </p>
            </div>

            <Sub id="practice-numbers">Numbers playground</Sub>
            <Shot id="numbers-calc" />
            <div className={PROSE}>
              <p>
                Type an estimate the way you would say it in an interview, like <em>50k QPS × 2 KB × 30 days</em>, and get the answer with the working: each step, the units, an &ldquo;interview shortcut&rdquo; version and the
                bandwidth or storage it implies. Write one step per line and name results (<em>peak = 3 × avg</em>); presets cover the classic questions, and <strong>copy link</strong> shares your sums.
              </p>
              <p>
                Below it are the latency, throughput and size numbers the course teaches, each linked to its lesson (<strong>work it out</strong> sends one to the calculator), and a drill: Week 00&apos;s trial has an estimation part. Data units
                are decimal, as in the lessons: 1 KB = 1,000 bytes.
              </p>
            </div>

            <Sub id="practice-plan">Study planner</Sub>
            <div className={PROSE}>
              <p>
                Pick your <strong>interview date</strong>, the days you can study and the minutes per day, and choose what to include (core lessons, bosses, trials, mock interviews, side quests), how many revision days to keep at the end
                and whether to leave a catch-up day each week. You get a day-by-day plan from your real progress. Fall behind or race ahead and the plan moves; the page says by how much and offers to keep the adjusted plan.
              </p>
              <p>
                <strong>Download .ics</strong> puts every session in Apple Calendar or Outlook (re-download after a change and the sessions move); <strong>Add to Google Calendar</strong> explains the import and has a link for each day. The plan&apos;s settings
                are saved with your XP, so signed in it follows you. The progress page shows today&apos;s session next to your weekly goal.
              </p>
            </div>


            <Where>
              the <A href="/learn/prep">prep</A> tab (top of every Learn page; bottom dock on phones). The hub&apos;s &ldquo;Beyond the course&rdquo; block and the end of each lesson link to the tools too.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ g) arena */}
          <Section id="arena" n="10" kicker="the arena" title="Daily challenge, leagues and games" lead="The fun part of the course, built from the same questions and lessons. Two minutes a day keeps a streak alive.">
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
            <Sub id="practice-dow">Design of the week</Sub>
            <div className={PROSE}>
              <p>
                One open system design problem a week. Read the brief and its constraints, write your design in markdown with Mermaid diagrams (it autosaves and stays private while you write), then vote on the community&apos;s designs once the
                gallery opens. Winners are featured on the page, on the course hub and on their profile. Submitting is worth <strong>+{DOW_XP.submit} XP</strong>, a featured design <strong>+{DOW_XP.featured}</strong> and the winner{" "}
                <strong>+{DOW_XP.win}</strong>. Reading is open to everyone; submitting and voting need an account and a connection. Until the first challenge opens, the page says &ldquo;coming soon&rdquo;.
              </p>
            </div>

            <Where>
              the <A href="/learn/arena">arena</A> tab; the <A href="/learn/arena/leaderboard">leaderboard</A> (&ldquo;full board&rdquo;); the <A href="/learn/arena/daily">daily challenge</A>.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ h) xp */}
          <Section id="xp" n="11" kicker="xp, levels, quests & badges" title="What earns XP" lead="XP is your running total. Every amount below comes straight from the code; each one-time reward is paid once, however often you repeat the thing.">
            <Table
              caption="How XP is earned"
              head={["Action", "XP", "How often"]}
              num={[1]}
              rows={[
                ["Read a stage", `+${LEARN_XP.stage}`, "once per stage"],
                ["Finish a lesson", `+${LEARN_XP.lesson}`, "once per lesson"],
                ["Quick check right on the first try", `+${QUIZ_XP}`, "once per question"],
                ["Lecture checkpoint answered right", `+${LECTURE_QUIZ_XP}`, "once per question"],
                ["Every quick check in a stage right first try", `+${STAGE_ACE_XP}`, "once per stage"],
                ["Pass a trial part", `+${LEARN_XP.trial}`, "first pass of each part"],
                ["Defeat a boss (interview mode, 70%+)", `+${BOSS_XP}`, "once per boss"],
                ["Finish a mock interview (scored debrief)", `+${LEARN_XP.mock}`, "once per mock, with its badge"],
                ["Hire or better in a mock interview", `+${LEARN_XP.mockOffer}`, "once per mock"],
                ["Clear a world (lessons + boss + trial parts)", `+${LEARN_XP.world}`, "once per world, with its badge"],
                ["Finish a side quest", `+${LEARN_XP.sideQuest}`, `once (${LEARN_XP.lesson} for the lesson + ${LEARN_XP.sideQuest - LEARN_XP.lesson} bonus)`],
                ["Revise a whole world (every lesson deck finished)", `+${REVISE_WEEK_XP}`, "once per world"],
                ["Clear a code lab (every test passes)", `+${LAB_XP.easy} / +${LAB_XP.medium} / +${LAB_XP.hard}`, `once per lab (${DIFFICULTY_LABEL.easy} / ${DIFFICULTY_LABEL.medium} / ${DIFFICULTY_LABEL.hard})`],
                ["Design of the week: submit / featured / winner", `+${DOW_XP.submit} / +${DOW_XP.featured} / +${DOW_XP.win}`, "once per challenge each"],
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
          <Section id="progress" n="12" kicker="the you tab · progress" title="Everything you've done, in one place" lead="The You tab starts on Progress, which answers “where am I, how am I doing, what next”; the row under the header switches to your notebook, concept mastery and certificates. Guests see this browser's data; signed in, your account merged with it.">
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
            <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
              <strong className="text-fg">Streak reminders</strong> (signed in, off until you switch them on): a push notification on this device and/or an email at 7:30 PM, only on a day you haven&apos;t learned yet while a streak is
              running. Never more than one a day; every email has an unsubscribe link, and you can switch either off here any time.
            </p>
            <Shot id="progress-videos" only="desktop" />
            <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
              <strong className="text-fg">Videos:</strong> your watch time (minutes actually spent playing, so skipping ahead doesn&apos;t count), lectures finished (90% or more) out of all of them, the ones in progress and how many you
              opened this week. Below, <strong className="text-fg">continue watching</strong> with a bar for each and the lectures you finished recently. Signed in, it follows you to every device.
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
            <Sub id="practice-concepts">Concept map and term cards</Sub>
            <Shot id="mastery-map" only="desktop" example />
            <div className={PROSE}>
              <p>
                The <strong>concept map</strong> lists every concept the course teaches, grouped by world and coloured by how well you know it, from your quick checks, trial answers and review cards (nothing extra to do):{" "}
                {MASTERY_STATES.map((st, i) => (
                  <span key={st.id}>
                    {i > 0 ? (i === MASTERY_STATES.length - 1 ? " and " : ", ") : ""}
                    <strong>{st.label.toLowerCase()}</strong>
                  </span>
                ))}
                . Tap a concept for a <strong>two-minute refresher</strong>: the definition, the key points, your evidence, the lesson that teaches it and a way to practise it.
              </p>
              <p>
                <strong>Term cards:</strong> in lessons, course terms have a dotted underline. Hover (or tap) one for its one-line definition, where it&apos;s taught and related terms. Don&apos;t want them? <strong>TERMS</strong> in the reading
                dock, the switch in the phone Contents sheet or the one on the concept map turns them off for this browser.
              </p>
            </div>

            <Where>
              the <A href="/learn/dashboard">progress</A> tab. Sections: overview · map · activity · videos · goals · mastery · share · data (the sticky row under the header jumps between them).
            </Where>
          </Section>

          {/* ------------------------------------------------------------ i2) share */}
          <Section
            id="share"
            n="13"
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

          {/* ------------------------------------------------------------ i3) certificates */}
          <Section
            id="certificates"
            n="14"
            kicker="certificates"
            title="Earn a certificate, prove it with a link"
            lead="A certificate of completion for the whole course and one for each world, each with an ID, a QR code and a public page anyone can use to check it."
          >
            <Table
              caption="What each certificate needs"
              head={["Certificate", "Requirements (all of them)"]}
              rows={[
                [
                  "System Design Mastery · Certificate of Completion",
                  <>
                    every core lesson completed{s ? ` (${s.coreLessons})` : ""}; every capstone interview read{s ? ` (${s.bosses})` : ""}; every trial part passed at {CERT_PASS_PCT}%+{s ? ` (${s.trialParts})` : ""}; every interview boss
                    beaten in boss mode{s ? ` (${s.bosses})` : ""}; {CERT_MOCKS} different mock interviews scored Hire or better
                  </>,
                ],
                ["World NN · <title>", <>every lesson of that world; its trial parts at {CERT_PASS_PCT}%+; its boss (World 00 has no boss)</>],
              ]}
            />
            <div className={PROSE}>
              <p>
                <strong>Where:</strong> the <A href="/learn/certificate">certificate page</A> (from the Progress page or the row of links under the You tab). It shows a checklist with what&apos;s done, what&apos;s left and a link to finish each item. It needs an
                account and a connection: your progress is checked on the server, from your account&apos;s records, when you claim. Progress made as a guest lives in that browser, so sign in and import it from the Progress page first.
              </p>
              <p>
                <strong>What counts.</strong> Lessons count once they&apos;re completed in your account. Trial parts count from your saved attempts: the answers are marked again on the server against the answer key, so a part counts only if
                those answers really reach {CERT_PASS_PCT}%. If an older pass doesn&apos;t (the questions changed since), the checklist says so: retake that part. Capstones count once you&apos;ve completed reading them. Bosses count when you win them in boss mode. A mock interview counts
                when its scorecard (you score yourself against the levelled rubric) comes out at Hire or Strong hire; the course certificate needs {CERT_MOCKS} different ones.
              </p>
              <p>
                <strong>Claiming.</strong> Press <strong>Claim my certificate</strong>, check the name (2–{CERT_NAME_MAX} characters, letters, spaces, apostrophes, hyphens and periods; it&apos;s signed into the certificate and can&apos;t be
                changed later) and choose whether it gets a public page (off unless you tick it; you can switch it on or off later, and withdraw a certificate at any time). Claiming again never makes a second one. The course certificate pays +{CERT_XP.course} XP and the <strong>Certified</strong> badge, a world certificate
                +{CERT_XP.world} XP.
              </p>
              <p>
                <strong>Then:</strong> <strong>Add to LinkedIn profile</strong> opens LinkedIn with the certificate&apos;s name, issuer, date, ID and link filled in; <strong>Download PDF</strong> opens a one-page A4 landscape version, public page or not
                (choose “Save as PDF”); <strong>Share link</strong> opens the share sheet; <strong>Download Open Badge</strong> gives a signed Open Badges 3.0 credential for badge wallets (with the public page on, there&apos;s also a badge URL for Badgr and Canvas Credentials). The course certificate is paper-style with a QR code; world certificates are drawn as blueprints.
              </p>
            </div>
            <Note title="Checking a certificate" tone="signal">
              <p>
                Every certificate has an ID like <strong>SDM-7F3K-92QX</strong> (course) or <strong>W02-4QX8</strong> (world), using 2–9 and A–Z without I or O. Its page at himanshukukreja.in/cert/&lt;ID&gt; says whether it&apos;s valid,
                shows the name, the date, the numbers and how it was earned, and links to the holder&apos;s public progress page only if that page is on. Each record is signed when it&apos;s issued, and the page checks the signature. A
                hidden or unknown ID is a 404. A revoked certificate says so, with the date; the reason is never shown.
              </p>
            </Note>
            <Where>
              <A href="/learn/certificate">Certificates</A> in the You tab; the entry card on the <A href="/learn/dashboard#certificate">progress page</A>.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ j) cases */}
          <Section
            id="offline"
            n="15"
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
                      It sits next to the title of every lesson, preview, boss, side quest, trial, mock interview, case file and video lecture, and on cheat sheets, code labs, the numbers playground, the study planner and the Prep page (the cloud icon on a phone). Revision decks are saved with their world. To save more at once, open a world on the course map and press <strong>Save this world offline</strong>, or use{" "}
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
                ["Saved video lectures: narration, captions, music, chapters, checkpoints", "Ask AI about a lecture moment, and every other AI feature"],
                ["Quick checks, trials, boss fights, mock interviews", "Ask Claude / ChatGPT (the prompt is copied for later)"],
                ["Stage clears, XP, streak days on this device", "Search, the leaderboard, sign-in, sharing"],
                ["Revision decks, cheat sheets, code labs, numbers playground, study planner, reading-trail summaries", "Design of the week (submitting, voting, the gallery); the articles the reading trail links to"],
              ]}
            />
            <Sub id="offline-library">The offline library</Sub>
            <Shot id="offline-library" />
            <div className={PROSE}>
              <p>
                The <A href="/learn/offline">offline library</A> lists everything saved on this device, by type: the course (by world), video lectures (by playlist section), side quests, interview problems, low-level design, mock
                interviews, case files, war stories, revision and cheat sheets, code labs and tools. <strong>Everything saved</strong> shows it all with a search; pick a type to see what is saved out of what could be, switch between{" "}
                <strong>on device</strong> and <strong>all</strong>, and save or remove a whole type or section at once. Each row has its size and when it was saved, and <strong>update</strong> when a newer version is online.
              </p>
              <p>
                <strong>Storage on this device</strong> splits the space into videos, articles and app files, and shows how much the browser lets the site use. If the browser might clear it when space runs low, <strong>ask to keep it</strong>{" "}
                asks it not to. Next to it, the app card says whether you are online and offers to install the course as an app.
              </p>
            </div>
            <Sub id="offline-videos">Video lectures offline</Sub>
            <div className={PROSE}>
              <p>
                <strong>Save offline</strong> under a lecture&apos;s title stores the page with its recorded narration, captions, music and poster, about 10–20 MB a lecture; the button shows the size before you save. A saved lesson&apos;s
                Save offline panel offers its lecture too, and the library&apos;s <strong>Video lectures</strong> type saves a whole playlist section (anything over 300 MB asks first). Saving the entire course leaves the lectures out, because
                together they are gigabytes. A saved lecture plays, shows its captions and asks its checkpoints with no connection; its progress syncs when you are back online.
              </p>
            </div>
            <Sub>Install it as an app</Sub>
            <div className={PROSE}>
              <p>
                <strong>Android, Chrome or Edge on a laptop:</strong> press <strong>Install the app</strong> in the offline library or the Read offline card (or the install icon in the address bar). The course opens from your home screen or
                dock, full screen, with your saved lessons. With no browser bar around it, the app shows its own <strong>back</strong> arrow in the header (and in the reading toolbar on a phone). On a laptop the course header doubles as the window&apos;s title bar (drag it by any empty spot); the small arrow next to the window buttons brings the usual title bar back.
              </p>
              <p>
                <strong>iPhone and iPad:</strong> Safari has no install button, so the library shows the steps: <strong>Share</strong> → <strong>Add to Home Screen</strong>. Do this if you rely on saved lessons: Safari can clear a
                website&apos;s data after about a week without a visit, but an app on the home screen keeps it. Lessons saved in Safari don&apos;t carry over into the home-screen app, so save them from the app. After a save on an iPhone, the save message reminds you of this.
              </p>
            </div>
            <Note title="Space on your device">
              <p>
                The library shows how much is used and how much the browser allows. A lesson takes about 100 KB, a video lecture about 10–20 MB, the reader app about 3 MB once (shared by everything you save). If the device runs out of space, saving stops with a clear message and
                what is already saved stays; remove things from the library to make room.
              </p>
            </Note>
          </Section>

          <Section id="cases" n="16" kicker="case files" title="Case files: real stories, with a drill at the end" lead="Production incidents, rush hours and build logs told as stories with blueprints. They live outside the course, under Case files.">
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
              <p>
                Every case file opens with an explainer that plays the whole story (with Narrate), and a new case file comes out every <strong>Monday</strong>. Follow the <A href="/stories/feed.xml">RSS feed</A> to hear about each one.
              </p>
            </div>
            <Shot id="case-activity" only="desktop" size="medium" />
            <div className={PROSE}>
              <p>
                Every case file also has a <strong>lecture</strong>: the story told on screen, with the timeline, what users saw and the mechanism drawn out. The &ldquo;watch it first&rdquo; card sits under the cover.
              </p>
            </div>
            <Sub id="cases-ask">Ask AI about a case file</Sub>
            <Shot id="case-ask" only="desktop" />
            <Shot id="case-ask-panel" only="desktop" caption="Shown signed in." />
            <div className={PROSE}>
              <p>
                The built-in AI answers from the case file you are reading. Open it three ways: <strong>Ask AI</strong> in the header next to Save offline, the <strong>Ask AI about this case</strong> button that stays in the corner while
                you read, or select any passage and press <strong>Ask here</strong> in the toolbar, which quotes that passage in the question. Pick a style (just answer, explain simply, give an example, say it in an interview, in Hinglish)
                and ask. On a computer the panel docks on the right and the page makes room for it; on a phone it opens as a sheet. Asking needs an account; credits work as described in{" "}
                <a href="#ai" className="text-signal-text underline underline-offset-4">
                  AI in the course
                </a>
                .
              </p>
              <p>
                The same selection toolbar also has <strong>Ask Claude</strong> and <strong>Ask ChatGPT</strong> (a new tab with the passage and the case as context), <strong>Copy prompt</strong> and <strong>Copy link</strong>, which reopens
                the case file at that passage.
              </p>
            </div>
            <Where>
              <A href="/stories">Case files</A> in the site header (outside the course). Your record (closed · solved) is at the top of the index.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ war stories */}
          <Section
            id="war-stories"
            n="17"
            kicker="the stories tab"
            title="War stories: real ones, and your turn on call"
            lead="Two halves. True stories of real systems at their limits, in two minutes each. And war rooms, where an incident plays out in its chat channel and you make the calls."
          >
            <div className={PROSE}>
              <p>
                <strong>Real stories</strong> are short and plain: what happened, the numbers, and why it matters, written for anyone (you don&apos;t need the course to follow them). Every one lists its <strong>sources</strong>,
                the company&apos;s own engineering blog or postmortem first; if we couldn&apos;t check a story, it isn&apos;t there, even a famous one. The page picks a <strong>story of the day</strong> (the same for everyone, changing at
                midnight IST); filter the rest by theme: scale surprise, outage, live migration, money, people, strange but true. Stories you finish are ticked in this browser.
              </p>
              <p>
                <strong>War rooms</strong> drop you into an incident as the <strong>on-call engineer</strong>. The channel fills up as the night goes on: the page, charts, logs, and messages from the incident commander, the experts and,
                later, the CTO. At four to six points you make the call. A wrong move costs minutes and users, and someone tells you why; then you choose again. Escalation runs the way it does in real teams: on-call acks, an incident
                commander takes charge, experts are pulled in, leadership is kept informed and makes the business calls.
              </p>
              <p>
                At the end you get your run (wrong calls, minutes lost, users hurt), the blameless <strong>postmortem</strong>, and <strong>the real incident</strong> it is modelled on, with a link to the real postmortem. The company and
                people are fictional; the failure chain follows the real report. Clearing a war room is worth <strong>+60 XP</strong> once; replay it as often as you like, your best run is kept in this browser. Use <strong>fast</strong>{" "}
                or <strong>skip to the next call</strong> if you read quicker than the messages arrive.
              </p>
            </div>
            <Where>
              the <A href="/learn/war-stories">stories</A> tab (top of every Learn page; bottom dock on phones), and the &ldquo;Beyond the course&rdquo; block on the course hub.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ ai */}
          <Section
            id="ai"
            n="18"
            kicker="ai in the course"
            title="AI that knows this course"
            lead="AI features are free for every signed-in learner, for a limited time. They answer from the course itself, and each one is built to teach, not to hand you answers."
          >
            <Table
              caption="The AI features"
              head={["Feature", "Where", "What it does"]}
              rows={[
                ["Ask this lesson", "Select text → Ask here, or Ask AI in the reading toolbar", "Answers from the lesson's own sections and names the one it used. Modes: explain simply, an example, say it in an interview, Hinglish."],
                ["Ask this case file", "Ask AI in a case file's header, the corner button, or select text → Ask here", "The same panel, answering from the case file you are reading."],
                ["Ask about this moment", "The lecture player: \u2726 ask, or A", "Answers about the paused moment of a lecture; can light part of the diagram or jump to another chapter. Pre-answered questions per chapter are free."],
                ["Questions learners ask", "End of every lesson, and in the Ask panel", "Common questions answered from the lesson, free to read (no credits)."],
                ["Code-lab tutor", "Under the test results in a code lab", "Hints after a failing run, from a nudge to the exact fix in words, never the solution. After a pass: a code review."],
                ["Explain it back", "Concept pages", "Explain a concept in your own words; get a strict verdict (solid, partial, misconception) and the one thing to fix."],
                ["AI interviewer", "Inside a mock interview: the \u201clive with\u201d box", "The named interviewer answers what you said, pushes on the gaps and throws the mock's curveballs. Type, or start a voice call and talk."],
                ["Live coach", "A mock interview, after each phase", "A short read on the phase you just finished: what landed, the gaps as nudges, one thing to try. Switch it off for a pure mock."],
                ["AI scorecard", "Mock interview debrief", "Every phase graded against its rubric, quoting your words. It sits beside your own scores and doesn't change XP."],
                ["Design review", "Design of the week editor", "A private review of your draft: strengths, the risks that would sink it, worst first, and the next questions."],
                ["Free-text moves", "War rooms", "Type what you'd actually do; the channel answers in character, and a move that matches an option plays out like it."],
              ]}
            />
            <div className={PROSE}>
              <p>
                <strong>AI credits.</strong> Each signed-in learner gets a daily allowance (shown in the AI panels and on the Progress page), refilled at midnight UTC. A lesson question uses about 10–20 credits, a mock interview turn about 10.
                When many people use AI on the same day the allowance shrinks a little so it lasts for everyone; if it runs out for the day, the Ask Claude / ChatGPT links and the free questions still work.
              </p>
              <p>
                <strong>Use your own key.</strong> On the Progress page you can add your own Anthropic API key. It stays in your browser, is sent only with AI requests and is never stored on our side; your Anthropic account is billed and the daily limit doesn&apos;t apply.
              </p>
              <p>
                <strong>What&apos;s sent.</strong> What you type into an AI feature (a question, your code, your answers) goes to Anthropic&apos;s AI to answer it. It isn&apos;t used to train models. We keep the conversation text for 30 days to stop abuse, then it&apos;s deleted. AI needs an account.
              </p>
            </div>
            <Where>
              the AI panels inside lessons, video lectures, case files, code labs, concept pages, mock interviews, Design of the week and war rooms; your credits and your own key on the <A href="/learn/dashboard">Progress</A> page.
            </Where>
          </Section>

          {/* ------------------------------------------------------------ k) account */}
          <Section id="account" n="19" kicker="accounts, privacy & data" title="Do you need an account?" lead="No. Every lesson, quick check, trial, boss, game and the daily challenge work without one. An account adds a few things.">
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
          <Section id="faq" n="20" kicker="faq" title="Questions people actually ask">
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
          <Section id="glossary" n="21" kicker="glossary" title="Words the course uses">
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
    "Do the videos remember where I stopped?",
    <>
      Yes. Each lecture resumes where you left it, and the <A href="/learn/prep/lectures">playlist</A> shows continue watching, how much of each lecture you have seen and a watched mark at 90%. Signed in, this follows you to
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
      Yes. Press <strong>Save offline</strong> under a lecture&apos;s title, or save a whole playlist section from the <Link href="/learn/offline#lectures">offline library</Link>. Each lecture is about 10–20 MB, so save them on wifi.
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
  [
    "Do code labs need Python on my computer?",
    <>
      No. Python runs inside the browser on your device, and your code is never sent to a server. The first run downloads it once ({RUNTIME_DOWNLOAD_LABEL}). Save a lab for offline use and Python is stored with it (about {RUNTIME_STORED_LABEL}, once for every lab).
    </>,
  ],
  [
    "Where do I find revision decks, labs and the other tools?",
    <>
      In the <Link href="/learn/prep">Prep</Link> tab: the video lectures, mocks, revision decks, cheat and design sheets, code labs, the numbers playground and the planner. Lessons also end with their revision deck and any code lab that practises
      them. Design of the week is in the Arena; your concept mastery and certificates are under You.
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
