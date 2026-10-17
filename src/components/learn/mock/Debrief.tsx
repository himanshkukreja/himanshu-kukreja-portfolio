"use client";

/**
 * Debrief: what happened in the round, the model answer per phase, the levelled rubric with
 * self-scores, the verdict band, what to study next, a second opinion from Claude / ChatGPT,
 * and the reward.
 */
import Link from "next/link";
import { useState } from "react";
import { LEARN_XP } from "@/lib/learn/types";
import { LEVEL_HINT, LEVEL_LABEL, MOCK_LEVELS, mmss, type MockInterview, type MockPhase } from "@/lib/learn/mock/types";
import type { MockRun } from "@/lib/learn/mock/store";
import { firedCurveballs, firstName, totalUsed } from "@/lib/learn/mock/engine";
import { levelIndex, SCORE_LABEL, VERDICT_BLURB, VERDICT_LABEL, VERDICTS, type LoopScore, type RoundFacts, type SignalScore } from "@/lib/learn/mock/score";
import { buildFeedbackPrompt, openFeedback } from "@/lib/learn/mock/feedback";
import { copyText, CLIENT_LABEL, type AskClient } from "@/lib/learn/askAi";
import { CourseHtml, InlineHtml, LABEL, LevelChip, Stat } from "./ui";

type Props = {
  mock: MockInterview;
  run: MockRun;
  score: LoopScore;
  facts: RoundFacts;
  totalWords: number;
  minWords: number;
  alreadyDone: boolean;
  setScore: (sid: string, v: SignalScore | null) => void;
  setRevealed: (pid: string | "all", on: boolean) => void;
  onClaim: () => void;
  onRetry: () => void;
  onBackToRoom?: () => void;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function Debrief(props: Props) {
  const { mock, run, score, facts } = props;
  const who = firstName(mock.interviewer.name);
  const total = totalUsed(mock, run);
  const over = mock.phases.filter((p) => (run.used[p.id] || 0) > p.minutes * 60).length;
  const cbFired = Object.keys(facts.curveballs).length;
  const cbAnswered = Object.values(facts.curveballs).filter((w) => w >= 5).length;
  const allOpen = mock.phases.every((p) => run.revealed[p.id]);
  const closing = (mock.closing || "Thanks for your time.").split(/(?<=[.!?])\s/)[0];

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-9 px-4 pb-32 pt-8 sm:px-6 sm:pt-12 lg:pb-24">
      <header className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">
          Debrief · {mock.company.name} · {LEVEL_LABEL[run.level]} loop{run.attempt > 1 ? ` · attempt ${run.attempt}` : ""}
        </span>
        <h1 className="m-0 font-display text-[clamp(34px,5.2vw,72px)] font-extrabold leading-[0.95] tracking-[-0.05em] text-fg">
          {who}: “{closing.replace(/[.!?]$/, "")}
          <span className="text-signal-text">.</span>” Now, the honest part.
        </h1>
        <p className="m-0 max-w-[780px] text-[17px] leading-relaxed text-fg-2">
          Open each phase&apos;s model answer, compare it with what you wrote, and score every signal: <strong className="text-fg">missed</strong>, <strong className="text-fg">partly</strong> or{" "}
          <strong className="text-fg">nailed</strong>. Score what you actually wrote or would clearly have said, not what you meant. Signals marked as bonus are above your target level.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => props.setRevealed("all", !allOpen)} className="min-h-11 border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3">
            {allOpen ? "Hide all model answers" : "Reveal all model answers"}
          </button>
          {props.onBackToRoom && (
            <button type="button" onClick={props.onBackToRoom} className="min-h-11 border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3">
              ← Back to the call
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px self-start border border-line bg-line sm:flex sm:flex-wrap">
        <Stat value={mmss(total)} suffix={` / ${mock.minutes}:00`} label="time used" accent={total > mock.minutes * 60} />
        <Stat value={String(over)} suffix={` / ${mock.phases.length}`} label="phases over budget" />
        <Stat value={String(cbAnswered)} suffix={` / ${cbFired}`} label="curveballs answered" />
        <Stat value={String(facts.hints)} label="hints used" />
        <Stat value={String(facts.pauses)} label="pauses" />
        <Stat value={String(props.totalWords)} label="words written" />
      </div>

      {score.flags.length > 0 && (
        <section aria-labelledby="flags-h" className="flex max-w-[860px] flex-col gap-3 border border-bad/60 bg-surface p-4 sm:p-5">
          <h2 id="flags-h" className="m-0 font-mono text-[12px] uppercase tracking-label text-bad-text">
            What {who} noticed · {score.flags.length} red flag{score.flags.length === 1 ? "" : "s"}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {score.flags.map((f) => (
              <li key={f.id} className="flex flex-col gap-0.5 text-[15px] leading-relaxed text-fg-2 sm:flex-row sm:gap-2">
                <strong className="font-semibold text-fg">{f.label}.</strong>
                <span>{f.why}</span>
              </li>
            ))}
          </ul>
          <span className="text-[13px] text-fg-3">Each red flag drops the verdict one band (two at most), like a real hiring committee would.</span>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {mock.phases.map((p) => (
            <PhaseReview key={p.id} {...props} phase={p} />
          ))}
        </div>
        <Scorecard {...props} />
      </div>

      <StudyNext score={score} />
      <AskForFeedback {...props} />
      <LevelGuide mock={mock} level={run.level} />

      <section className="flex flex-wrap items-center justify-between gap-4 border border-line px-5 py-4">
        <span className="flex flex-col gap-1">
          <span className={LABEL}>another round?</span>
          <span className="text-[15px] text-fg-2">Same problem, fresh notes. Try a higher level, or come back after the lessons above.</span>
        </span>
        <span className="flex flex-wrap gap-2">
          <button type="button" onClick={props.onRetry} className="min-h-12 bg-fg px-5 text-[15px] font-semibold text-bg">
            Book another round
          </button>
          <Link href="/learn/mock" className="inline-flex min-h-12 items-center border border-line-strong px-4 text-[15px] text-fg hover:border-fg-3">
            All mock interviews
          </Link>
        </span>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------

function ScoreButtons({ value, onPick, disabled, label }: { value: SignalScore | undefined; onPick: (v: SignalScore | null) => void; disabled: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={`Score: ${label}`} className="grid shrink-0 grid-cols-3 gap-px border border-line-strong bg-line-strong">
      {([0, 1, 2] as SignalScore[]).map((v) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onPick(on ? null : v)}
            className={`min-h-10 min-w-[64px] px-2 font-mono text-[11px] uppercase tracking-label disabled:cursor-default ${
              on ? (v === 2 ? "bg-fg text-bg" : v === 1 ? "bg-signal text-on-signal" : "bg-bad text-white") : "bg-bg text-fg-3 hover:text-fg"
            }`}
          >
            {SCORE_LABEL[v]}
          </button>
        );
      })}
    </div>
  );
}

function PhaseReview({ run, score, phase, setScore, setRevealed }: Props & { phase: MockPhase }) {
  const used = run.used[phase.id] || 0;
  const note = run.notes[phase.id] || "";
  const open = !!run.revealed[phase.id];
  const tally = score.perPhase.find((x) => x.phase.id === phase.id);
  const li = levelIndex(run.level);
  const curve = firedCurveballs(phase, run);
  const missed = phase.curveballs.filter((c) => run.fired[c.id] === undefined);
  return (
    <section aria-labelledby={`rv-${phase.id}`} className="flex flex-col gap-4 border border-line-strong bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`rv-${phase.id}`} className="m-0 font-display text-[26px] font-bold leading-tight tracking-[-0.025em] text-fg sm:text-[30px]">
          <span className="font-mono text-[15px] font-semibold text-signal-text">P{phase.n}</span> {phase.title}
        </h2>
        <span className={`font-mono text-xs ${used > phase.minutes * 60 ? "text-signal-text" : "text-fg-3"}`}>
          {mmss(used)} of {phase.minutes}:00{tally && tally.expected.scored > 0 ? ` · ${pct(tally.expected.pct)} expected` : ""}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className={LABEL}>you wrote</span>
        {note.trim() ? (
          <pre className="m-0 max-h-[320px] overflow-auto whitespace-pre-wrap break-words border border-line bg-raised p-3.5 font-mono text-[13.5px] leading-relaxed text-fg-2">{note}</pre>
        ) : (
          <p className="m-0 border border-dashed border-line-strong px-3.5 py-3 text-sm text-fg-3">Nothing written in this phase.</p>
        )}
      </div>

      {curve.map((c) => (
        <div key={c.id} className="flex flex-col gap-2 border-l-2 border-signal pl-3.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-label text-signal-text">Curveball{c.title ? ` · ${c.title}` : ""}</span>
          <InlineHtml html={c.html} className="text-[14px] leading-relaxed text-fg-3" />
          {(run.answers[c.id] || "").trim() ? (
            <pre className="m-0 whitespace-pre-wrap break-words bg-raised p-3 font-sans text-[14.5px] leading-relaxed text-fg-2">{run.answers[c.id]}</pre>
          ) : (
            <p className="m-0 text-sm text-bad-text">Not answered.</p>
          )}
        </div>
      ))}
      {missed.length > 0 && (
        <p className="m-0 text-[13px] text-fg-3">
          You moved on before {missed.length === 1 ? "a curveball" : `${missed.length} curveballs`} arrived ({missed.map((c) => c.title || "curveball").join(", ")}). The model answer covers {missed.length === 1 ? "it" : "them"} anyway.
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => setRevealed(phase.id, !open)}
          aria-expanded={open}
          className={`flex min-h-12 items-center justify-between gap-3 px-4 text-left text-[15px] font-semibold ${open ? "border border-line-strong text-fg" : "bg-signal text-on-signal hover:opacity-90"}`}
        >
          <span>{open ? "Hide the model answer" : "Reveal the model answer"}</span>
          <span aria-hidden className="font-mono text-sm">
            {open ? "▴" : "▾"}
          </span>
        </button>
        {open && (
          <div className="border border-line bg-bg px-3.5 py-4 sm:px-5">
            <CourseHtml html={phase.answerHtml} size={16} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className={LABEL}>rubric · what interviewers look for</span>
        <ol className="m-0 flex list-none flex-col p-0">
          {phase.rubric.map((s) => {
            const bonus = levelIndex(s.level) > li;
            return (
              <li key={s.id} className="flex flex-col gap-2.5 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex items-start gap-2.5">
                    <LevelChip level={s.level} bonus={bonus} />
                    <InlineHtml html={s.html} className={`text-[15px] leading-snug ${bonus ? "text-fg-3" : "text-fg"}`} />
                  </span>
                  {s.study.length > 0 && (
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {s.study.map((r) => (
                        <Link key={r.href} href={r.href} className="font-mono text-[11px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                          {r.code} · {r.title}
                        </Link>
                      ))}
                    </span>
                  )}
                </div>
                <ScoreButtons value={run.scores[s.id]} onPick={(v) => setScore(s.id, v)} disabled={run.claimed} label={s.text} />
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Scorecard({ mock, run, score, totalWords, minWords, alreadyDone, onClaim }: Props) {
  const left = score.expected.n - score.expected.scored;
  const dropped = score.raw !== score.verdict;
  const vi = VERDICTS.indexOf(score.verdict);
  const canClaim = score.complete && !run.claimed && totalWords >= minWords;
  return (
    <aside aria-label="Scorecard" className="flex min-w-0 flex-col gap-5 border border-signal bg-surface p-5 sm:p-6 lg:sticky lg:top-[calc(var(--hk-header-h,61px)+20px)]">
      <span className="font-mono text-xs uppercase tracking-label text-signal-text">Scorecard · {LEVEL_LABEL[run.level]} ({LEVEL_HINT[run.level]})</span>
      {score.complete ? (
        <div className="flex flex-col gap-2">
          <span className="font-display text-[44px] font-extrabold leading-none tracking-[-0.04em] text-fg">
            {VERDICT_LABEL[score.verdict]}
            <span className="text-signal-text">.</span>
          </span>
          <div aria-hidden className="flex gap-[3px]">
            {VERDICTS.map((v, i) => (
              <span key={v} className={`h-2 flex-1 ${i === vi ? "bg-signal" : i < vi ? "bg-fg" : "bg-surface-2"}`} />
            ))}
          </div>
          <p className="m-0 text-[15px] leading-relaxed text-fg-2">{VERDICT_BLURB[score.verdict]}</p>
          {dropped && (
            <p className="m-0 text-[13px] text-fg-3">
              {VERDICT_LABEL[score.raw]} on the rubric alone; red flags took it down to {VERDICT_LABEL[score.verdict].toLowerCase()}.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="font-display text-[30px] font-extrabold leading-tight tracking-[-0.03em] text-fg">
            {left} signal{left === 1 ? "" : "s"} to score
          </span>
          <div className="h-1.5 bg-surface-2" aria-hidden>
            <div className="h-1.5 bg-signal" style={{ width: `${score.expected.n ? (score.expected.scored / score.expected.n) * 100 : 0}%` }} />
          </div>
          <p className="m-0 text-sm text-fg-3">The verdict appears when every expected signal ({score.expected.n} at {LEVEL_LABEL[run.level]} level or below) has a score. Bonus signals are optional.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-px border border-line bg-line">
        <Stat value={pct(score.expected.pct)} label={`expected (${score.expected.scored}/${score.expected.n})`} accent />
        <Stat value={score.above.n ? pct(score.above.pct) : "—"} label={score.above.n ? `bonus (${score.above.scored}/${score.above.n})` : "no bonus at Staff"} />
      </div>
      <div className="flex items-baseline justify-between gap-3 border border-line px-3.5 py-3">
        <span className="text-sm text-fg-2">Your answers read like</span>
        <span className="font-mono text-[13px] font-semibold text-fg">{score.calibrated ? LEVEL_LABEL[score.calibrated] : "below the junior bar"}</span>
      </div>

      <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="By phase">
        {score.perPhase.map(({ phase, expected }) => (
          <li key={phase.id} className="flex items-center gap-2.5">
            <span className="w-7 shrink-0 font-mono text-[11px] text-fg-3">P{phase.n}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">{phase.title}</span>
            <span className="h-1.5 w-20 shrink-0 bg-surface-2" aria-hidden>
              <span className="block h-1.5 bg-fg" style={{ width: `${expected.pct * 100}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right font-mono text-[11px] text-fg-3">{expected.scored ? pct(expected.pct) : "—"}</span>
          </li>
        ))}
      </ol>

      {run.claimed ? (
        <div className="flex flex-col gap-2 border border-line-strong bg-bg px-4 py-4">
          <span className="font-mono text-[11px] uppercase tracking-label text-ok">Scorecard submitted ✓</span>
          <span className="text-[15px] text-fg-2">
            +{LEARN_XP.mock} XP{score.offer ? ` · +${LEARN_XP.mockOffer} offer bonus` : ""} · badge <strong className="font-semibold text-fg">{mock.badge}</strong>
            {alreadyDone && run.history.length > 1 ? " (each reward is paid once; this round is in your history)" : ""}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onClaim} disabled={!canClaim} className="min-h-[52px] bg-signal px-5 text-base font-semibold text-on-signal hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            Submit scorecard · +{LEARN_XP.mock} XP
          </button>
          <span className="text-[13px] leading-snug text-fg-3">
            {totalWords < minWords
              ? `Write at least ${minWords} words in the round to earn XP (you have ${totalWords}).`
              : !score.complete
                ? "Score every expected signal first."
                : score.offer
                  ? `A ${VERDICT_LABEL[score.verdict].toLowerCase()} also earns the +${LEARN_XP.mockOffer} XP offer bonus.`
                  : `Hire or better earns +${LEARN_XP.mockOffer} XP more. You can book another round any time.`}
          </span>
        </div>
      )}
    </aside>
  );
}

function StudyNext({ score }: { score: LoopScore }) {
  if (!score.study.length) return null;
  return (
    <section aria-labelledby="study-h" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>what to study next</span>
        <h2 id="study-h" className="m-0 font-display text-[28px] font-bold tracking-[-0.025em] text-fg sm:text-[34px]">
          Lessons behind the signals you missed
        </h2>
      </div>
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-2 p-0">
        {score.study.map((r, i) => (
          <li key={r.href}>
            <Link href={r.href} className="flex h-full flex-col gap-1.5 border border-line bg-bg p-4 hover:border-fg-4">
              <span className="flex justify-between font-mono text-[11px] tracking-label text-fg-3">
                <span>{r.code}</span>
                <span>{i === 0 ? "start here" : ""}</span>
              </span>
              <span className="text-[17px] font-semibold leading-snug text-fg">{r.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AskForFeedback({ mock, run, score }: Props) {
  const [note, setNote] = useState<string | null>(null);
  const url = () => `${window.location.origin}${mock.href}`;
  const ask = (client: AskClient) => {
    const mode = openFeedback(client, buildFeedbackPrompt(mock, run, score.complete ? score : null, url()), mock.company.name);
    setNote(mode === "clipboard" ? `Your round was too long for a link, so the full prompt is on your clipboard: paste it into ${CLIENT_LABEL[client]} after its first reply.` : `Opened ${CLIENT_LABEL[client]} with your round prefilled.`);
  };
  const copy = async () => {
    const ok = await copyText(buildFeedbackPrompt(mock, run, score.complete ? score : null, url()));
    setNote(ok ? "Prompt copied. Paste it into any assistant." : "Couldn't copy here. Try one of the buttons.");
  };
  return (
    <section aria-labelledby="ai-h" className="flex flex-col gap-4 border border-line-strong bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>second opinion</span>
        <h2 id="ai-h" className="m-0 font-display text-[28px] font-bold tracking-[-0.025em] text-fg">
          Get feedback from Claude or ChatGPT
        </h2>
        <p className="m-0 max-w-[720px] text-[15px] leading-relaxed text-fg-2">
          Opens a new tab with your answers, the curveballs, the rubric and your self-scores prefilled, asking for interviewer-style feedback, a check of your numbers and its own verdict. Nothing is sent to this site.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => ask("claude")} className="min-h-12 bg-fg px-5 text-[15px] font-semibold text-bg">
          Ask Claude ↗
        </button>
        <button type="button" onClick={() => ask("chatgpt")} className="min-h-12 border border-fg px-5 text-[15px] font-semibold text-fg">
          Ask ChatGPT ↗
        </button>
        <button type="button" onClick={copy} className="min-h-12 border border-line-strong px-4 text-[15px] text-fg hover:border-fg-3">
          Copy the prompt
        </button>
      </div>
      {note && (
        <p role="status" className="m-0 text-sm text-fg-3">
          {note}
        </p>
      )}
    </section>
  );
}

function LevelGuide({ mock, level }: { mock: MockInterview; level: MockInterview["level"] }) {
  const rows = MOCK_LEVELS.filter((l) => mock.levels[l]);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="lv-h" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>calibration</span>
        <h2 id="lv-h" className="m-0 font-display text-[28px] font-bold tracking-[-0.025em] text-fg sm:text-[34px]">
          What a hire looks like at each level
        </h2>
      </div>
      <ol className="m-0 grid list-none gap-px border border-line bg-line p-0 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((l) => (
          <li key={l} className={`flex flex-col gap-2 p-4 ${l === level ? "bg-surface shadow-[inset_0_3px_0_var(--c-signal)]" : "bg-bg"}`}>
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
              {LEVEL_LABEL[l]} · {LEVEL_HINT[l]}
              {l === level ? " · you" : ""}
            </span>
            <span className="text-[15px] leading-relaxed text-fg-2">{mock.levels[l]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
