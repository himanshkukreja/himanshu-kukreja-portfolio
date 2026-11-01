/** 10 Notebook, in depth: handwritten pages and their AI, written papers, then highlights, notes and bookmarks. */
import Shot from "../Shot";
import { A, Kbd, Note, PROSE, Table, Topic, Where } from "../ui";

export default function NotebookDetails() {
  return (
    <>
      <Topic id="notebook-pages" lead="Write by hand beside the lesson, on a tablet with a stylus, a laptop or a phone. Pages save to your account.">
        Handwritten pages
      </Topic>
      <div className={PROSE}>
        <p>
          The pen button (<Kbd>N</Kbd> on a keyboard) opens the notebook beside whatever you&apos;re reading: a lesson, a side quest, a lecture. On a laptop or a tablet held sideways it docks at the side; on a tablet held upright the lesson
          stays on top and your page sits below, with a handle to resize the split. The panel keeps your recent pages one tap away, and the <A href="/learn/notebook">notebook</A> lists every page, newest first.
        </p>
        <p>
          <strong>Writing:</strong> pen, highlighter, eraser and lasso, with real pressure on an active pen. Scribble over strokes to erase them, hold the pen still for a quick menu (erase, recolour, thicker, thinner, turn into text),
          tap with two fingers to undo. Pages come <strong>ruled, grid, Cornell or interview paper</strong>.
        </p>
      </div>
      <Table
        caption="Input modes"
        head={["Mode", "For", "How it behaves"]}
        rows={[
          ["Pen only", "Apple Pencil, S Pen and other active pens", "Only the pen draws; your hand and fingers scroll and zoom, so you can rest your palm on the screen"],
          ["Stylus / finger", "Passive “universal” styluses and fingers", "One contact draws, two fingers scroll and zoom; a large contact (a palm) is ignored"],
          ["Scroll", "Reading", "Nothing draws; touch only scrolls"],
        ]}
      />

      <Topic id="notebook-ai" lead="Clip and snip from the lesson, ask about what you snipped, and let the AI type up and check your notes.">
        Clip, snip, turn into text, check
      </Topic>
      <div className={PROSE}>
        <p>
          <strong>Clip:</strong> select a line in the lesson and tap <strong>Clip</strong>; it lands on your page with a link back to the exact spot. <strong>Snip:</strong> for a diagram, code or a table, tap <strong>Snip</strong> and drag
          a box; it pastes as a picture, and you can ask about it (&ldquo;why does locking hurt at high traffic?&rdquo;). The answer comes from the lesson you&apos;re on and saves to your page. Lecture pages snip a paused frame
          the same way.
        </p>
        <p>
          <strong>Turn into text</strong> reads your handwriting and writes it out as clean, searchable notes; flip between the ink and the text any time. <strong>Check against lesson</strong> compares your notes with the lesson and
          flags what&apos;s wrong or missing, quoting the section that says otherwise. <strong>Make review cards</strong> turns the notes into cards; untick any you don&apos;t want and the rest join your{" "}
          <a href="#review" className="text-signal-text underline underline-offset-4">daily standup</a>. Fixed a slip by hand? <strong>Update the text</strong> rereads the page.
        </p>
        <p>
          <strong>Annotate</strong> lets you write on the lesson itself: circle, underline, scribble in the margin. Your marks stay on the words, even when the text size or the screen width changes. Or select a passage and write a{" "}
          <strong>handwritten note</strong> that stays pinned to it.
        </p>
      </div>

      <Topic id="papers" lead="Test yourself like an exam: answer by hand, marked point by point.">
        Written papers
      </Topic>
      <div className={PROSE}>
        <p>
          Every week of the course and every side quest has a <A href="/learn/papers">written paper</A>: questions built from its checkpoints, drills and design prompts. Sit it untimed (practice) or against the clock (exam) and
          answer each question by hand on a sheet. The AI marks every point of the question&apos;s marking scheme and shows the evidence it found on your sheet; then read the model answer and send what you missed to review. A
          paper&apos;s card also sits next to the week&apos;s trial.
        </p>
      </div>

      <Topic id="highlights" lead="Select any sentence in a lesson (long-press on a phone) and a toolbar appears. Everything you save lands in the Notebook, grouped by lesson.">
        Highlights, notes and bookmarks
      </Topic>
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
    </>
  );
}
