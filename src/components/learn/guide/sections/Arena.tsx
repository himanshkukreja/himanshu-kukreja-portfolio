/** 06 Arena and review, in depth: daily challenge, leagues and points, games, the daily standup, revision decks. */
import Shot from "../Shot";
import { A, Kbd, LABEL, Pair, PROSE, Table, Topic, Where } from "../ui";
import {
  ARENA_GAMES,
  BOX_EVERY,
  DAILY_N,
  DAILY_POINTS_MAX,
  DAILY_SECONDS,
  DAILY_XP_PER_RIGHT,
  DAILY_XP_PERFECT,
  LEAGUE_RULES,
  LEITNER_INTERVALS,
  PLAY_GAMES,
  POINTS,
  POINTS_TABLE,
  REVIEW_XP_PER_CARD,
  REVISE_MIN_PER_LESSON,
  REVISE_WEEK_XP,
  quest,
} from "../facts";

export default function ArenaDetails() {
  return (
    <>
      <Topic id="arena-daily" lead="Two minutes a day keeps a streak alive.">
        The daily challenge
      </Topic>
      <Pair>
        <Shot id="arena-daily" />
        <div className={PROSE}>
          <p>
            <strong>{DAILY_N} questions, {DAILY_SECONDS} seconds each</strong>, the same five for everyone that day, drawn from every quick check and trial in the course. It rolls over at <strong>00:00 IST</strong>. Run out of time and
            it counts as a miss.
          </p>
          <p>
            Your game score is 100 per right answer plus 5 for every second left. Only the first run of the day counts: replays are practice. The first run pays +{DAILY_XP_PER_RIGHT} XP per right answer and +{DAILY_XP_PERFECT} for 5/5,
            plus quests (first daily +{quest("arena:daily")}, a perfect 5/5 +{quest("arena:perfect")}, 3-day streak +{quest("arena:streak3")}, 7-day streak +{quest("arena:streak7")}). Share your result as a little grid of squares.
          </p>
        </div>
      </Pair>

      <Topic id="arena-leagues" lead="Signed in, your activity scores weekly points; the top of each league moves up.">
        Leagues and the leaderboard
      </Topic>
      <div id="xp-vs-points" className="flex max-w-[980px] scroll-mt-[calc(var(--hk-header-h,61px)+64px)] flex-col gap-4 border border-signal bg-surface p-4 sm:p-6 lg:scroll-mt-[calc(var(--hk-header-h,61px)+24px)]">
        <span className={`${LABEL} text-signal-text`}>the one thing to know</span>
        <h4 className="m-0 font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-fg sm:text-[28px]">
          XP and leaderboard points are two different scores<span className="text-signal-text">.</span>
        </h4>
        <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
          <div className="flex flex-col gap-2 bg-bg p-4">
            <span className="font-display text-[22px] font-bold text-fg">XP</span>
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-fg-2">
              <li>Your personal score. It only goes up (unless you reset).</li>
              <li>Earned for almost everything: stages, lessons, quick checks, trials, bosses, reviews, games, even exploring the rest of the site.</li>
              <li>Decides your <strong className="text-fg">level</strong>, L1 Intern to L6 Principal, shown in the header.</li>
              <li>Works as a guest (saved in this browser); signed in it follows you.</li>
            </ul>
          </div>
          <div className="flex flex-col gap-2 bg-bg p-4">
            <span className="font-display text-[22px] font-bold text-fg">Leaderboard points</span>
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-fg-2">
              <li>A weekly competition score. The week resets Monday 00:00 IST.</li>
              <li>Only <strong className="text-fg">signed-in</strong> course activity counts, and only what the server can check.</li>
              <li>Fixed amounts per action, at most <strong className="text-fg">{POINTS.dayCap} a day</strong> (the table below).</li>
              <li>Decides your rank and your <strong className="text-fg">league</strong>. Leagues reuse the level names but are separate from your XP level.</li>
            </ul>
          </div>
        </div>
      </div>
      <Shot id="leaderboard" only="desktop" example />
      <div className={PROSE}>
        <p>
          Signed-in learners are ranked every week by <strong>leaderboard points</strong>. Everyone starts in the <strong>L1 Intern</strong> league. When the week ends (Monday 00:00 IST), the top{" "}
          {Math.round(LEAGUE_RULES.promoteShare * 100)}% of each league&apos;s active players (at least one, and only with {LEAGUE_RULES.promoteMin}+ points) move up a league; a week with zero points drops you one league. Reaching the top
          10 of the whole board in a week earns the Top 10 quest (+{quest("arena:top10")} XP).
        </p>
      </div>
      <Table
        caption="Leaderboard points"
        head={["Action", "Points", "Rule"]}
        num={[1]}
        rows={[...POINTS_TABLE.map((r) => [r.what, r.pts, r.rule]), ["Daily cap", `${POINTS.dayCap}`, "most points one day can add, whatever you do"]]}
      />
      <p className="m-0 max-w-[70ch] text-[14px] leading-relaxed text-fg-3">
        One daily challenge is worth at most {DAILY_POINTS_MAX} points ({DAILY_N} × {POINTS.dailyCorrect} + {POINTS.dailyPerfect} + {POINTS.dailySpeedMax}). Points are re-checked on the server against the course, duplicates are
        dropped, and guests see an estimate of &ldquo;local points&rdquo; instead of a rank.
      </p>

      <Topic id="arena-games" lead="60–90 second rounds and longer simulations, each tied to the lessons that teach it.">
        Quick games
      </Topic>
      <Shot id="arena-games" only="desktop" />
      <div className={PROSE}>
        <p>
          <strong>Arena games</strong> are 60–90 second rounds: {ARENA_GAMES.map((g) => g.name).join(", ")} (+{quest("arena:latency")} XP each on the first clear). The <strong>Playground</strong> boards ({PLAY_GAMES.map((g) => g.name).join(", ")}
          ) are longer simulations (+{quest("play:cache")} XP each). Every card lists the lessons that teach it, and best scores stay in your browser.
        </p>
      </div>
      <Where>
        the <A href="/arena">arena</A> tab; the <A href="/arena/leaderboard">leaderboard</A> (&ldquo;full board&rdquo;); the <A href="/arena/daily">daily challenge</A>.
      </Where>

      <Topic id="review" lead="A few minutes a day on cards made from your own mistakes. Cards you know come back less and less often; cards you don't come back tomorrow.">
        The daily standup brings back what you missed
      </Topic>
      <Shot id="review-boxes" only="desktop" />
      <div className={PROSE}>
        <p>
          <strong>Where cards come from:</strong> every question you get wrong (or skip) in a trial, right answers you <strong>flagged</strong> as a guess, and highlights you turned into cards in the Notebook. You never have to make
          cards by hand.
        </p>
        <p>
          <strong>Boxes (spaced repetition).</strong> Every card sits in one of five boxes. A new card starts in Box 1. When it comes up you try to recall the answer, tap <strong>Show answer</strong>, and grade yourself:
        </p>
      </div>
      <Table
        caption="Grades and boxes"
        head={["Grade", "What happens", "Comes back"]}
        rows={[
          ["Again", "Back to Box 1", "tomorrow"],
          ["Hard", "Stays in its box", "after that box's interval"],
          ["Good", "Up one box", "after the next box's interval"],
          ["Easy", "Up two boxes", "after that box's interval"],
        ]}
      />
      <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-fg-2">
        Intervals: {LEITNER_INTERVALS.map((d, i) => `Box ${i + 1} ${BOX_EVERY[i]}`).join(" · ")}. A card is <strong className="text-fg">due</strong> when its date is today or earlier, so the number on the Arena tab and the hub&apos;s
        standup line is simply how many cards are waiting today. Each graded card is worth +{REVIEW_XP_PER_CARD} XP, and a review session (or a finished stage) keeps your day on the streak.
      </p>
      <Shot id="review-card" size="medium" />
      <Where>
        the <A href="/review">daily standup</A>: from the Arena tab (the orange number is cards due), the Daily standup line on the hub&apos;s Continue card, or the progress page. Keys: <Kbd>Space</Kbd> shows the answer,{" "}
        <Kbd>1</Kbd>–<Kbd>4</Kbd> grade.
      </Where>

      <Topic id="practice-revise" lead="The night before: a lesson in about five minutes of cards, or a whole world on one page.">
        Revision decks and cheat sheets
      </Topic>
      <Shot id="revise-deck" size="medium" />
      <div className={PROSE}>
        <p>
          A <strong>revision deck</strong> boils a lesson down to about {REVISE_MIN_PER_LESSON} minutes of cards: <strong>key ideas</strong>, <strong>numbers to remember</strong>, a <strong>trade-off</strong> table, the{" "}
          <strong>classic mistakes</strong> and <strong>if the interviewer asks</strong> (the answer stays hidden until you show it). Open one lesson&apos;s deck or <strong>Revise this world</strong> for all of them in a row. The
          clock at the top counts down {REVISE_MIN_PER_LESSON} minutes a lesson; it keeps going past zero, it never stops you.
        </p>
        <p>
          Swipe, use the arrows or the buttons. Mark each card <strong>Got it</strong> or <strong>Again</strong>: cards marked Again join your <a href="#review" className="text-signal-text underline underline-offset-4">daily standup</a>.
          Finish every lesson deck of a world (in one go or one at a time) for <strong>+{REVISE_WEEK_XP} XP</strong>, once per world. Keys: <Kbd>←</Kbd> <Kbd>→</Kbd> flip, <Kbd>Space</Kbd> next or show the answer,{" "}
          <Kbd>G</Kbd> got it, <Kbd>A</Kbd> again, <Kbd>S</Kbd> shuffle, <Kbd>Esc</Kbd> exit.
        </p>
        <p>
          A <strong>cheat sheet</strong> is the same material for a whole world on one page. It sizes itself to print on a single A4 or Letter sheet; <strong>Download PDF</strong> opens your browser&apos;s print dialog (choose
          &ldquo;Save as PDF&rdquo;), and Share sends the link. Day lessons, Foundations parts and bosses end with a <strong>Revise … in 5 min</strong> card and a link to their world&apos;s sheet.
        </p>
        <p>
          <strong>Everything at once:</strong> <A href="/cheatsheet/all">every cheat sheet as one PDF</A>, one world per page, and an <A href="/revise/anki.txt">Anki export</A> of all the revision cards (in Anki, File → Import: one deck,
          tagged by world and lesson) to keep revising in your own spaced-repetition app.
        </p>
      </div>
    </>
  );
}
