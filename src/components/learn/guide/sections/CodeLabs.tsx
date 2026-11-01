/** 05 Code labs, in depth. */
import { A, Kbd, PROSE, Topic, Where } from "../ui";
import { LAB_REVEAL_AFTER_RUNS, LAB_XP, PYTHON_VERSION, RUNTIME_DOWNLOAD_LABEL, RUNTIME_STORED_LABEL } from "../facts";

export default function CodeLabsDetails() {
  return (
    <>
      <Topic id="practice-labs" lead="Some interviews have an “implement this component” round. A code lab is one of those, taken from a lesson.">
        How a lab works
      </Topic>
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
      <div className={PROSE}>
        <p>
          <strong>Offline:</strong> save a lab for offline use and Python is stored with it (about {RUNTIME_STORED_LABEL}, once for every lab), so a saved lab runs its tests with no connection. The AI hints and the code review need one.
        </p>
      </div>
      <Where>
        <A href="/learn/labs">code labs</A> in the prep tab; the <strong>Try it in code</strong> card at the end of a lesson that has one.
      </Where>
    </>
  );
}
