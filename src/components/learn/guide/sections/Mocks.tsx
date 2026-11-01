/** 08 Mock interviews, in depth. */
import Shot from "../Shot";
import { A, Note, Pair, PROSE, Steps, Sub, Table, Topic, Where } from "../ui";
import { BAND_RULES, MIN_WORDS, RED_FLAG_RULES, VERDICT_LABEL } from "@/lib/learn/mock/score";
import { BOSS_PASS_PCT, BOSS_XP, LEARN_XP } from "../facts";
import { COURSE, type GuideData } from "./types";

export default function MocksDetails({ d }: { d: GuideData }) {
  const mocks = d.map?.mocks || [];
  return (
    <>
      <Topic id="mocks-loop" lead="After most worlds the course stops teaching and interviews you: an unseen problem, a fictional company, a named interviewer and one clock.">
        The real loop, between worlds
      </Topic>
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
    </>
  );
}
