/** 02 Lectures and Listen, in depth: the lecture player, the playlist, Listen and the podcast. */
import Shot from "../Shot";
import { A, Kbd, Note, Pair, PROSE, Steps, Sub, Table, Topic, Where } from "../ui";
import { LECTURE_QUIZ_XP, type GuideData } from "./types";

export default function LecturesDetails({ d }: { d: GuideData }) {
  const { lectures } = d;
  return (
    <>
      <Topic lead="Every lesson in Weeks 0–11, every side quest, interview problem, low-level design article and case file has a narrated, animated lecture: the same ideas, drawn as they are explained. Every mock interview has a recorded model round.">
        An animated lecture for everything
      </Topic>
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

      <Topic id="listen" lead="No screen? Every article in the course is narrated in the same natural voice as the lectures.">
        Listen: every article, read aloud
      </Topic>
      <div className={PROSE}>
        <p>
          <strong>Listen</strong> sits in a lesson&apos;s reading tools (bottom right on a computer, the bottom toolbar on a phone), and in side quests, problems and case files. It starts at the paragraph near the top of your
          screen and lights up each paragraph as it reads it; skip a paragraph back or forward and change the speed in the player strip. When an article changed after its narration was recorded, your browser&apos;s own voice reads it
          until the new recording is out.
        </p>
        <p>
          <strong>Listening counts as reading.</strong> While Listen plays, the time counts toward clearing the stage even if you don&apos;t touch the screen, so a lesson can clear on a walk. An explainer&apos;s{" "}
          <strong>Narrate</strong> and Listen never talk over each other: starting one stops the other.
        </p>
      </div>

      <Topic id="podcast" lead="The lectures as audio, for the commute: one episode per lecture, in any podcast app.">
        The podcast
      </Topic>
      <div className={PROSE}>
        <p>
          The <A href="/learn/podcast">podcast page</A> lists every episode by section, with how to follow it: in Apple Podcasts use <strong>Follow a Show by URL</strong>; in Pocket Casts, Overcast, AntennaPod or Podcast Addict,{" "}
          <strong>add by URL</strong>; anything else takes the RSS feed. Copy the feed from the page. Every episode links back to its animated lecture, for when you want to see the diagram.
        </p>
      </div>
    </>
  );
}
