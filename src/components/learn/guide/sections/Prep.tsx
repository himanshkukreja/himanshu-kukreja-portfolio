/** 09 Interview prep, in depth: the prep tab, companies, the question bank, sheets, the numbers playground. */
import Shot from "../Shot";
import { A, PROSE, Topic, Where } from "../ui";

export default function PrepDetails() {
  return (
    <>
      <Topic id="prep-tab" lead="The Prep tab is for getting hired: the video lectures, what each company asks, the classic problems, timed mocks, last-night revision, drills and a plan to your interview date. Every card shows where you stand.">
        The prep tab
      </Topic>
      <div className={PROSE}>
        <p>
          The <A href="/prep">Prep</A> page opens with the <strong>video lectures</strong> (the whole playlist, a chip per section and where to start), then <strong>mock interviews</strong>, one card each: start the
          round, or <strong>watch it done well</strong> in its recorded version. The rest is grouped as <strong>who&apos;s hiring</strong> (company pages, the question bank), <strong>classic problems</strong> (the problem bank, low-level
          design), <strong>interview night</strong> (revision decks, cheat sheets, design sheets), <strong>the real loop</strong> (code labs, mock interviews, peer mocks) and <strong>tools</strong> (numbers playground, study planner). The
          row under the title counts what you have revised, the labs you cleared, the mocks you finished and your study plan. All of it works as a guest. Saved for offline use, each card says whether its page is saved on this
          device; the rest show <strong>needs a connection</strong>.
        </p>
      </div>

      <Topic id="practice-companies" lead="What each company builds, what its questions lean on, and the questions candidates actually reported.">
        Companies and the question bank
      </Topic>
      <div className={PROSE}>
        <p>
          Each <A href="/prep/companies">company page</A> says what the company builds, the topics its questions lean on, and two lists. <strong>Reported by candidates</strong>: questions people wrote up after
          interviewing there, each with a link to that write-up. <strong>Likely, from what they build</strong>: our pick of questions that fit its products, clearly labelled as ours. Every question links the lessons that teach it,
          and the page ends with a <strong>study path</strong> through them. No company publishes its questions; we only call a question reported when a write-up we could read says so.
        </p>
        <p>
          The <A href="/prep/questions">question bank</A> merges every company&apos;s questions, most-reported first: filter by type (system design, low-level design, concept), by company or to reported ones only.
          A filled dot next to a company means reported with a source; an outline means likely.
        </p>
        <p>
          The <strong>problem bank</strong> (the classic questions: URL shortener, rate limiter, chat, news feed…) and <strong>low-level design</strong> (machine coding: parking lot, LRU cache, Splitwise…) are listed on the
          Prep page too. Each opens with a <strong>mission</strong>: the brief and the numbers you design for.
        </p>
      </div>

      <Topic id="practice-sheets" lead="A side quest's whole design on a few printable pages.">
        Design sheets
      </Topic>
      <div className={PROSE}>
        <p>
          A <strong>design sheet</strong> is a side quest&apos;s whole design on a few pages: the numbers at a glance, the architecture with real tech icons, the key flows as sequence diagrams, the data model as a class diagram,
          the core entity&apos;s state machine, the decisions (chose, over, because), what breaks and how it&apos;s contained, and the lines to say in the interview. Read the quest once; revise it from the sheet in about ten minutes.
        </p>
        <p>
          <strong>Download PDF</strong> prints it in the light theme with every diagram drawn, no diagram split across pages. Each side quest ends with an <strong>open the sheet</strong> card, and the{" "}
          <A href="/sheets">design sheets</A> page lists them all, with how many diagrams each holds.
        </p>
      </div>
      <Shot id="sheets-index" />

      <Topic id="practice-numbers" lead="Back-of-the-envelope maths, typed the way you'd say it.">
        The numbers playground
      </Topic>
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
      <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
        Revision decks and cheat sheets are explained with <a href="#practice-revise" className="text-signal-text underline underline-offset-4">review</a>, code labs in <a href="#code-labs" className="text-signal-text underline underline-offset-4">their own section</a>, and the study planner with{" "}
        <a href="#practice-plan" className="text-signal-text underline underline-offset-4">getting started</a>.
      </p>
      <Where>
        the <A href="/prep">prep</A> tab (top of every Learn page; bottom dock on phones). The hub&apos;s &ldquo;Beyond the course&rdquo; block and the end of each lesson link to the tools too.
      </Where>
    </>
  );
}
