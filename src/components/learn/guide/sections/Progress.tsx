/** 12 Progress and profile, in depth: the progress page, XP and levels, sharing, certificates, offline. */
import Shot from "../Shot";
import { A, Note, Pair, PROSE, Steps, Sub, Table, Topic, Where } from "../ui";
import {
  BOSS_XP,
  DAILY_XP_PERFECT,
  DAILY_XP_PER_RIGHT,
  DEBRIEF_XP,
  DIFFICULTY_LABEL,
  DOW_XP,
  HANDLE_MAX,
  HANDLE_MIN,
  LAB_XP,
  LEARN_XP,
  LEVELS,
  MASTERY_STATES,
  PART_INFO,
  QUIZ_XP,
  REF_DAYS,
  REVIEW_XP_PER_CARD,
  REVISE_WEEK_XP,
  SHARE_ALL_ON,
  SHARE_DEFAULT_NAME,
  STAGE_ACE_XP,
  TRIAL_PASS_PCT,
  CASE_ACTIVITY_XP,
  partsFor,
  quest,
} from "../facts";
import { CERT_XP, MOCKS_NEEDED as CERT_MOCKS, NAME_MAX as CERT_NAME_MAX, TRIAL_PASS_PCT as CERT_PASS_PCT } from "@/lib/certificates/core";
import { LECTURE_QUIZ_XP, type GuideData } from "./types";

export default function ProgressDetails({ d }: { d: GuideData }) {
  const s = d.map?.stats;
  return (
    <>
      <Topic id="progress-page" lead="The You tab starts on Progress, which answers “where am I, how am I doing, what next”; the row under the header switches to your notebook, saved paths, the tutor's memory, concept mastery and certificates. Guests see this browser's data; signed in, your account merged with it.">
        Everything you&apos;ve done, in one place
      </Topic>
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

      <Topic id="xp" lead="XP is your running total. Every amount below comes straight from the code; each one-time reward is paid once, however often you repeat the thing.">
        What earns XP: levels, quests and badges
      </Topic>
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

      <Topic id="share" lead="Your progress is private. Turn on a public page and you get one link, showing only the parts you pick, to send on WhatsApp, LinkedIn or X.">
        Share your progress
      </Topic>
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

      <Topic id="certificates" lead="A certificate of completion for the whole course and one for each world, each with an ID, a QR code and a public page anyone can use to check it.">
        Certificates
      </Topic>
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
          when its scorecard (you score yourself against the levelled rubric) comes out at Hire or Strong hire; the course certificate needs {CERT_MOCKS} different ones. When the course grows (a new world, or new lessons in a world), a
          certificate already issued stays valid as it is, with the numbers it was earned on; a claim made after that needs the new lessons too.
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

      <Topic id="offline" lead="Save lessons on your phone or laptop and read them on a flight, on the metro, anywhere. No app store: the website saves them, and it can be installed like an app.">
        Read with no internet
      </Topic>
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
    </>
  );
}
