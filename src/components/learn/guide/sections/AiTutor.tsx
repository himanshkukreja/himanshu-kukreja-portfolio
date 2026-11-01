/** 11 AI tutor, in depth: the course chat, then every AI feature, credits, your own key and what's sent. */
import { A, PROSE, Table, Topic, Where } from "../ui";

export default function AiTutorDetails() {
  return (
    <>
      <Topic id="ai-chat" lead="The ask tab is a tutor that has read the whole course and knows your progress.">
        The course chat
      </Topic>
      <div className={PROSE}>
        <p>
          Open it from the <strong>ask</strong> tab, or the orange <strong>Ask</strong> button on any course page (there it knows the page you&apos;re on). Type, or tap a quick action: <strong>Quiz me</strong>,{" "}
          <strong>Start a mock</strong>, <strong>Make a plan</strong>, <strong>What next?</strong> Before it answers it can look things up: your progress, the course&apos;s lessons and lectures, the week plans. You see each step
          as it happens.
        </p>
        <p>
          <strong>Sources.</strong> Answers are written from the course: each claim carries a number, and the sources (the lecture, the lesson section, the questions learners ask) sit beside the answer on a computer and under it on
          a phone; tap one to open it at that spot. When the course doesn&apos;t cover something, the tutor says so first, then gives a general answer marked as general.
        </p>
        <p>
          <strong>Plans and paths.</strong> Ask for a plan and it reads your progress and the course&apos;s own week plans, then lays the plan out as a learning path; <strong>Save path</strong> keeps it under{" "}
          <A href="/learn/saved">Saved paths</A> as a checklist that ticks itself off as you read.
        </p>
        <p>
          <strong>Quizzes.</strong> &ldquo;Quiz me&rdquo; picks a checkpoint from what you&apos;ve been reading; answer in your own words and it grades you against the course&apos;s reference answer: what you got, what you missed.
        </p>
        <p>
          <strong>Memory.</strong> When a chat ends, a small model writes a few short notes: your goals, what you studied, what you found hard. The next chat starts from them. Read them, switch memory off or clear it on the{" "}
          <A href="/learn/memory">memory page</A> (you → memory). Past chats are in the history list.
        </p>
      </div>

      <Topic id="ai" lead="AI features are free for every signed-in learner, for a limited time. They answer from the course itself, and each one is built to teach, not to hand you answers.">
        Every AI feature in the course
      </Topic>
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
          ["Design canvas review", "Review my design on the design canvas", "Reads your drawing (blocks, arrows, labels) and notes against the brief: a verdict, the gaps worst first with a fix each, and the next questions."],
          ["Turn into text, check, cards", "A notebook page", "Types up your handwriting, checks the notes against the lesson (quoting the section when you slip) and turns them into review cards."],
          ["Snip and ask", "Snip in a lesson or on a paused lecture", "Explains the part of the page you snipped (a diagram, code, a table) from the lesson it came from; ask your own question about it."],
          ["Paper marking", "Written papers", "Marks a handwritten answer point by point against the question's marking scheme, with the evidence from your sheet."],
          ["Search answers", "Search (\u2318K), in plain English", "A short answer with its sources from the course, and a learning path you can save."],
          ["The course chat", "The ask tab and the Ask button", "The tutor: plans from your progress, answers with sources, quizzes graded against the course, a memory you control."],
        ]}
      />
      <div className={PROSE}>
        <p>
          <strong>AI credits.</strong> Each signed-in learner gets a daily allowance (shown in the AI panels and on the Progress page), refilled at midnight UTC. A lesson question uses about 10–20 credits, a mock interview turn about 10.
          The course chat (the Ask tab and the Ask button) doesn&apos;t use credits: it has its own daily messages, shown under the chat box.
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
        the ask tab; the AI panels inside lessons, video lectures, case files, code labs, concept pages, the notebook, written papers, the design canvas, mock interviews, Design of the week and war rooms; your credits and your own key on the <A href="/learn/dashboard">Progress</A> page.
      </Where>
    </>
  );
}
