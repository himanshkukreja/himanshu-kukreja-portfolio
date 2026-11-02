/** 07 Design canvas, boss fights, trials and design of the week, in depth. */
import Shot from "../Shot";
import { A, Pair, PROSE, Sub, Topic, Where } from "../ui";
import { BOSS_PASS_PCT, BOSS_XP, DOW_XP, LEARN_XP, TRIAL_COOLDOWN_MIN, TRIAL_PASS_PCT } from "../facts";
import { COURSE } from "./types";

export default function DesignBossDetails() {
  return (
    <>
      <Topic id="canvas" lead="Sketch the architecture the way you would on an interview whiteboard, then ask for a review.">
        The design canvas
      </Topic>
      <div className={PROSE}>
        <p>
          On the <A href="/canvas">design canvas</A>, pick a classic interview problem, a week&apos;s capstone or your own idea. The board is the same one the mock interviews use: building blocks with icons drop in with a click,{" "}
          <strong>Tech logos</strong> adds any technology by name, and an arrow drawn from one block to another stays attached when you move them. Write a few lines of notes under it, the way you&apos;d say the design out loud.
        </p>
        <p>
          <strong>Review my design</strong> reads the drawing (the blocks, the arrows and their labels) and your notes against the problem&apos;s brief, the way a staff engineer would: a verdict, the gaps that would sink it worst first,
          the fix for each, and the questions you&apos;d be asked next. Fix the worst gap, then review again. Your designs save to your account as you draw, so the canvas needs you to sign in.
        </p>
      </div>

      <Topic id="trials" lead="Two ways a world tests you. Trials check what you remember; the boss checks whether you can design under interview pressure.">
        Trials and boss fights
      </Topic>
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

      <Topic id="practice-dow" lead="One open system design problem a week, voted on by the community.">
        Design of the week
      </Topic>
      <div className={PROSE}>
        <p>
          One open system design problem a week. Read the brief and its constraints, write your design in markdown with Mermaid diagrams (it autosaves and stays private while you write), then vote on the community&apos;s designs once the
          gallery opens. Winners are featured on the page, on the course hub and on their profile. Submitting is worth <strong>+{DOW_XP.submit} XP</strong>, a featured design <strong>+{DOW_XP.featured}</strong> and the winner{" "}
          <strong>+{DOW_XP.win}</strong>. Reading is open to everyone; submitting and voting need an account and a connection. Until the first challenge opens, the page says &ldquo;coming soon&rdquo;.
        </p>
      </div>
      <Where>
        <A href="/design-week">design of the week</A>, from the arena tab.
      </Where>
    </>
  );
}
