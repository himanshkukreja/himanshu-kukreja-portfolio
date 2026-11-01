/** 01 Getting started, in depth: the tabs, the course map, the lesson screen, progress rules, the study planner. */
import Shot from "../Shot";
import ReadingFact from "../ReadingFact";
import { A, Kbd, Note, Pair, PROSE, Steps, Sub, Table, Topic, Where } from "../ui";
import { LEARN_XP, QUIZ_XP, STAGE_ACE_XP, quest } from "../facts";
import { COURSE, type GuideData } from "./types";

export default function GettingStartedDetails({ d }: { d: GuideData }) {
  const { map } = d;
  const s = map?.stats;
  const trialWeeks = map ? map.weeks.filter((w) => w.trial) : [];
  const lessonsPerWorld = map?.weeks[1] ? map.weeks[1].lessons.length : 6;
  return (
    <>
      <Topic id="tabs" lead="The tabs at the top of every Learn page (the dock at the bottom on a phone) each answer one question. If you're wondering where something is, ask which question it answers.">
        Seven tabs, one question each
      </Topic>
      <Table
        caption="The tabs"
        head={["Tab", "The question", "What's in it"]}
        rows={[
          [<A key="c" href={COURSE}>course</A>, "Learn it", "The worlds and their lessons, bosses and trials, side quests and their design sheets, concepts A–Z, the reading trail."],
          [<A key="p" href="/learn/prep">prep</A>, "Get hired", "The video lectures, mock interviews (solo or with a peer, each with a recorded model round), company pages and the question bank, the problem bank and low-level design, revision decks, cheat and design sheets, code labs, the design canvas, the numbers playground, the study planner."],
          [<A key="a" href="/learn/arena">arena</A>, "Play", "The daily challenge, weekly leagues, quick games, your review queue (daily standup) and design of the week."],
          [<A key="k" href="/learn/chat">ask</A>, "Ask anything", "The AI tutor: questions about any lesson, answered from the course with sources, study plans, quizzes and a memory you control."],
          [<A key="h" href="/learn/shorts">shorts</A>, "Two minutes free", "Vertical videos, one idea each, cut from the lessons, side quests, incidents and interview problems."],
          [<A key="s" href="/learn/war-stories">stories</A>, "See it for real", "True stories of real systems at their limits, and war rooms: incidents you play as the on-call engineer."],
          [<A key="y" href="/learn/dashboard">you</A>, "My stuff", "Progress, the notebook (handwritten pages, highlights, notes, bookmarks), saved paths, the tutor's memory, concept mastery and certificates."],
        ]}
      />

      <Topic id="map" lead="The course hub shows the whole campaign as a skill tree. Every row is a world; every square is something you can open right now.">
        The course map: worlds, lessons, stages, bosses, trials
      </Topic>
      <div className={PROSE}>
        <p>
          <strong>A world is one week of the course</strong>
          {s ? `: ${s.worlds} of them, from Week 00 Foundations to Week ${String(s.worlds - 1).padStart(2, "0")}` : ""}. A typical world has a Preview and {Math.max(1, lessonsPerWorld - 1)} day lessons, then a{" "}
          <strong>boss</strong> (a timed mock interview, the diamond) and, for {trialWeeks.length ? trialWeeks.map((w) => `Week ${w.code}`).join(", ") : "some weeks"}, a <strong>trial</strong>: the week&apos;s multiple-choice questions split into parts (the T boxes).
          Week 00 is different: eight Foundations parts instead of days.
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
          <strong>Side quests</strong> ({s?.sideQuests ?? 36} of them) are real systems designed end to end: UPI, WhatsApp, Netflix, Uber and more. They are bonus problems, open any time, worth +{LEARN_XP.sideQuest} XP each, and each has a video lecture. The <strong>design sheets →</strong> link next to their title opens{" "}
          <a href="#practice-sheets" className="text-signal-text underline underline-offset-4">
            every side quest&apos;s design sheet
          </a>
          , for revising it later.
        </p>
        <p>
          The classic interview problems and low-level design live in the <a href="#practice-companies" className="text-signal-text underline underline-offset-4">Prep tab</a>, next to the company pages. Under the side quests,{" "}
          <strong>Beyond the course</strong> points to Prep, the Arena and War stories, plus <A href="/learn/concepts">concepts A–Z</A> (every concept with its own page: definition, key points, the lessons that teach it, related
          concepts), the reading trail and the design sheets. Below that, <strong>Read offline</strong> saves the whole course or opens the{" "}
          <a href="#offline" className="text-signal-text underline underline-offset-4">offline library</a>, and the dashed card at the bottom, <strong>The Plan</strong>, is the 11-week roadmap.
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

      <Topic id="lesson" lead="Everything around the text is there to tell you where you are and to get out of the way while you read.">
        Reading a lesson, piece by piece
      </Topic>
      <Shot id="lesson-top" wide />
      <div className={PROSE}>
        <p>
          <strong>Header and course tabs.</strong> On every Learn page the site header turns into the course header: <em>course · prep · arena · ask · shorts · stories · you</em> (what each holds is in <a href="#tabs" className="text-signal-text underline underline-offset-4">the tabs</a>), a search box (<Kbd>⌘K</Kbd>: lessons, side quests, problems,
          low-level design and case files, or a question in plain English), your level chip and the light/dark switch. On phones the same tabs live in the dock at the bottom, with a way back to the rest of the site.
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
          <strong>Reading tools</strong> (bottom right on desktop, the bottom toolbar on phones): <strong>Listen</strong> reads the lesson aloud in a recorded natural voice (more in <a href="#listen" className="text-signal-text underline underline-offset-4">Listen</a>); <strong>Focus</strong> hides everything but the
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

      <Topic id="completion" lead="Progress is earned by actually reading, not by scrolling to the bottom. Here are the rules in plain words.">
        How a lesson counts as done
      </Topic>
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

      <Topic id="practice-plan" lead="Pick your interview date and how much time you have; get a day-by-day plan built from your real progress.">
        The study planner
      </Topic>
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
        <A href="/learn/plan">the study planner</A>, from the prep tab; today&apos;s session also shows on the <A href="/learn/dashboard">progress page</A>.
      </Where>
    </>
  );
}
