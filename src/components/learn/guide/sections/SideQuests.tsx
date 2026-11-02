/** 04 Side quests, case files, war stories and war rooms, in depth. */
import Shot from "../Shot";
import { A, PROSE, Sub, Topic, Where } from "../ui";
import { CASE_ACTIVITY_PASS_PCT, CASE_ACTIVITY_XP, DEBRIEF_XP, LEARN_XP, quest } from "../facts";
import { COURSE, INLINE, type GuideData } from "./types";

export default function SideQuestsDetails({ d }: { d: GuideData }) {
  const s = d.map?.stats;
  const caseActivities = d.caseActivities;
  return (
    <>
      <Topic id="side-quest-list" lead="Real systems designed end to end. Bonus problems, open any time.">
        Side quests
      </Topic>
      <div className={PROSE}>
        <p>
          <strong>Side quests</strong> ({s?.sideQuests ?? 36} of them) are real systems designed end to end: UPI, WhatsApp, Netflix, Uber and more. They sit under the worlds on the <A href={COURSE}>course hub</A>, open any time,
          worth +{LEARN_XP.sideQuest} XP each, and each has a video lecture. The <strong>design sheets →</strong> link next to their title opens{" "}
          <a href="#practice-sheets" className={INLINE}>
            every side quest&apos;s design sheet
          </a>
          , for revising one later in about ten minutes. They make good weekend practice once a world or two is done.
        </p>
      </div>

      <Topic id="cases" lead="Production incidents, rush hours and build logs told as stories with blueprints. They live outside the course, under Case files.">
        Case files: real stories, with a drill at the end
      </Topic>
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
          Every case file opens with an explainer that plays the whole story (with Narrate), and a new case file comes out every <strong>Monday</strong>. Follow the <A href="/case-files/feed.xml">RSS feed</A> to hear about each one.
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
        <A href="/case-files">Case files</A> in the site header (outside the course). Your record (closed · solved) is at the top of the index.
      </Where>

      <Topic id="war-stories" lead="Two halves. True stories of real systems at their limits, in two minutes each. And war rooms, where an incident plays out in its chat channel and you make the calls.">
        War stories and war rooms
      </Topic>
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
        the <A href="/war-stories">stories</A> tab (top of every Learn page; bottom dock on phones), and the &ldquo;Beyond the course&rdquo; block on the course hub.
      </Where>
    </>
  );
}
