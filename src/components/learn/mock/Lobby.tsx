"use client";

/** Lobby: the recruiter's note, who you'll meet, the format, the level you're interviewing for. */
import Link from "next/link";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import { useState } from "react";
import { LEARN_XP } from "@/lib/learn/types";
import { LEVEL_HINT, LEVEL_LABEL, MOCK_LEVELS, type MockInterview, type MockLevel } from "@/lib/learn/mock/types";
import type { MockFlag, MockRun } from "@/lib/learn/mock/store";
import { VERDICT_LABEL } from "@/lib/learn/mock/score";
import { firstName } from "@/lib/learn/mock/engine";
import { Avatar, CourseHtml, LABEL } from "./ui";
import JoinBriefing, { briefingSkipped } from "./JoinBriefing";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";

export default function Lobby({
  mock,
  run,
  best,
  offer,
  onStart,
  onResume,
  lecture = null,
}: {
  mock: MockInterview;
  run: MockRun;
  best: MockFlag | null;
  offer: boolean;
  onStart: (level: MockLevel, opts?: { coach?: boolean }) => void;
  onResume: () => void;
  /** the recorded model interview for this mock, when there is one */
  lecture?: { href: string; minutes: number; checkpoints: number; chapters: number } | null;
}) {
  const [level, setLevel] = useState<MockLevel>(run.level || mock.level);
  // starting over clears the round in progress: ask once
  const [confirmNew, setConfirmNew] = useState(false);
  // every start goes through the briefing (what happens next), unless the learner turned it off
  const [brief, setBrief] = useState(false);
  const ai = useAiStatus();
  const coachAvailable = !!ai?.signedIn && !!ai?.features["mock-coach"];
  const begin = () => (briefingSkipped() ? onStart(level, { coach: coachAvailable && run.coachOn !== false }) : setBrief(true));
  const curveballs = mock.phases.reduce((a, p) => a + p.curveballs.length, 0);
  const signals = mock.phases.reduce((a, p) => a + p.rubric.length, 0);
  const num = String(mock.n).padStart(2, "0");
  const live = run.live && !run.claimed;

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-32 pt-8 sm:px-6 sm:pt-12 lg:pb-24">
      <JoinBriefing
        mock={mock}
        level={level}
        open={brief}
        coachAvailable={coachAvailable}
        signedIn={!!ai?.signedIn}
        coachDefault={run.coachOn !== false}
        onCancel={() => setBrief(false)}
        onJoin={(opts) => {
          setBrief(false);
          onStart(level, opts);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-fg-3">
          <Link href="/learn/system-design-mastery" className="hover:text-fg">
            course
          </Link>
          <span aria-hidden>/</span>
          <Link href="/learn/mock" className="hover:text-fg">
            mock interviews
          </Link>
          <span aria-hidden>/</span>
          <span className="text-fg-2">M{mock.n}</span>
        </nav>
        <SaveOfflineButton title={`Mock interview ${num} · ${mock.company.name}`} kind="mock" url={mock.href} />
      </div>

      <header className="flex flex-col gap-5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">
          Mock interview {num} · after world {mock.afterCode} · covers {mock.coversLabel}
        </span>
        <h1 className="font-display text-[clamp(40px,6.4vw,96px)] font-extrabold leading-[0.9] tracking-tightest text-fg">
          {mock.company.name}
          <span className="text-signal-text">.</span>
          <span className="block text-[0.5em] font-bold leading-[1.05] tracking-[-0.035em] text-fg-2">{mock.title}</span>
        </h1>
        <p className="max-w-[720px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          A real interview loop, timed: an unseen problem from a fictional company that mixes everything from {mock.coversLabel}. The interviewer talks while you work, throws curveballs, and keeps time. The model answer, the rubric and
          your verdict wait for the debrief.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* recruiter note */}
        <section aria-labelledby="note-h" className="flex min-w-0 flex-col border border-line-strong bg-surface">
          <div className="flex flex-col gap-1 border-b border-line px-5 py-3.5 font-mono text-[12px] text-fg-3 sm:px-6">
            <span>
              <span className="text-fg-2">from</span> recruiting@{mock.company.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example
            </span>
            <span id="note-h" className="text-fg">
              <span className="text-fg-2">subject</span> Your system design round · {mock.role}
            </span>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <CourseHtml html={mock.briefHtml} size={16} />
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="who-h" className="flex flex-col gap-4 border border-line bg-surface p-5 sm:p-6">
            <span id="who-h" className={LABEL}>
              your interviewer
            </span>
            <div className="flex items-center gap-4">
              <Avatar name={mock.interviewer.name} size="lg" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-2xl font-bold leading-tight tracking-[-0.02em] text-fg">{mock.interviewer.name}</span>
                <span className="text-sm text-fg-2">{mock.interviewer.title}</span>
              </div>
            </div>
            {mock.interviewer.style && <p className="m-0 border-l-2 border-signal pl-3 text-[15px] leading-relaxed text-fg-2">{mock.interviewer.style}</p>}
          </section>
          <section aria-labelledby="co-h" className="flex flex-col gap-2 border border-line bg-surface p-5 sm:p-6">
            <span id="co-h" className={LABEL}>
              the company · fictional
            </span>
            <span className="text-lg font-semibold text-fg">{mock.company.tagline || mock.company.name}</span>
            {mock.company.location && <span className="font-mono text-xs text-fg-3">{mock.company.location}</span>}
            {mock.company.about && <p className="m-0 text-[15px] leading-relaxed text-fg-2">{mock.company.about}</p>}
            <span className="mt-1 text-sm text-fg-2">
              <span className="text-fg-3">Role · </span>
              {mock.role}
            </span>
          </section>
        </div>
      </div>

      {lecture && (
        <Link href={lecture.href} className="group flex items-center gap-4 border border-line-strong bg-[#0b0b0c] p-4 hover:border-signal sm:gap-5 sm:p-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-signal text-on-signal shadow-[0_0_28px_rgba(255,107,43,0.45)] transition-transform group-hover:scale-105">
            <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-[2px]" fill="currentColor" aria-hidden>
              <path d="M7 4l13 8-13 8z" />
            </svg>
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">watch it first · a model interview</span>
            <span className="font-display text-[19px] font-extrabold leading-tight tracking-[-0.02em] text-fg sm:text-[21px]">See this exact round done well: a {lecture.minutes}-minute recorded interview</span>
            <span className="text-[13px] leading-snug text-fg-3">Two voices, start to finish: how it opens, the clarifying questions, the estimates, the design, the curveballs, the wrap-up. Then try it yourself below.</span>
          </span>
        </Link>
      )}

      {/* format */}
      <section aria-labelledby="fmt-h" className="flex flex-col gap-4 border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="fmt-h" className="m-0 font-display text-[28px] font-bold tracking-[-0.025em] text-fg">
            The round · {mock.minutes} minutes, {mock.phases.length} phases
          </h2>
          <span className="text-sm text-fg-3">
            {curveballs} curveball{curveballs === 1 ? "" : "s"} · {signals} rubric signals
          </span>
        </div>
        <div aria-hidden className="flex gap-[3px]">
          {mock.phases.map((p) => (
            <span key={p.id} className="grid h-[34px] min-w-0 place-items-center border border-line-strong font-mono text-[11px] font-semibold text-fg-2 first:border-signal first:bg-signal first:text-on-signal" style={{ flex: `${p.minutes} 1 0px` }}>
              {p.n}
            </span>
          ))}
        </div>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-x-8 p-0">
          {mock.phases.map((p) => (
            <li key={p.id} className="flex items-baseline gap-3.5 border-b border-line py-[11px]">
              <span className="w-[26px] shrink-0 font-mono text-xs text-signal-text">P{p.n}</span>
              <span className="flex-grow text-[15px] text-fg-2">{p.title}</span>
              <span className="whitespace-nowrap font-mono text-xs text-fg-3">
                {p.minutes} min{p.curveballs.length ? " · curveball" : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <fieldset className="m-0 flex flex-col gap-3.5 border-0 p-0">
            <legend className="pb-3 font-display text-[28px] font-bold tracking-[-0.025em] text-fg">Which level are you interviewing for?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MOCK_LEVELS.map((l) => (
                <label key={l} className={`flex min-h-[72px] cursor-pointer flex-col justify-center gap-1 px-3.5 py-3 ${level === l ? "border-2 border-signal bg-surface" : "border border-line-strong hover:border-fg-3"}`}>
                  <span className="flex items-center gap-2.5">
                    <input type="radio" name="mock-level" checked={level === l} onChange={() => setLevel(l)} className="m-0 h-4 w-4 accent-[#FF6B2B]" />
                    <span className="font-display text-xl font-bold text-fg">{LEVEL_LABEL[l]}</span>
                  </span>
                  <span className="font-mono text-[11px] text-fg-3">{LEVEL_HINT[l]}</span>
                </label>
              ))}
            </div>
            <p className="m-0 text-sm leading-relaxed text-fg-3">
              The rubric marks each signal with the level that is expected to show it. Your verdict is judged against the level you pick; signals above it count as a bonus. The suggested level for this loop is{" "}
              <strong className="text-fg-2">{LEVEL_LABEL[mock.level]}</strong>.
            </p>
          </fieldset>
          <div className="flex flex-col gap-3 border border-line px-5 py-5">
            <span className={LABEL}>how the round works</span>
            <ol className="m-0 flex flex-col gap-2 pl-[22px] text-[15px] leading-normal text-fg-2">
              <li>One clock, like a real call. Each phase has a budget; {firstName(mock.interviewer.name)} tells you when to move on but never cuts you off.</li>
              <li>Prompts and follow-ups arrive while you work. Curveballs change the problem mid-round and need their own answer.</li>
              <li>Write your answer per phase; a whiteboard tab is there for boxes and arrows. Everything autosaves in this browser.</li>
              <li>Hints exist, but the interviewer notes every one. Pausing is allowed; real calls don&apos;t pause.</li>
              <li>Debrief: reveal the model answer phase by phase, score yourself on the rubric, get a hire / no-hire verdict, then ask Claude or ChatGPT for a second opinion.</li>
            </ol>
          </div>
        </div>

        <aside aria-label="Reward and start" className="flex min-w-0 flex-col gap-[18px] border border-signal bg-surface p-6">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Reward</span>
          <div className="flex items-center gap-5">
            <div aria-hidden className="grid h-16 w-16 shrink-0 place-items-center border-2 border-fg">
              <span className="grid h-10 w-10 place-items-center bg-signal font-mono text-sm font-semibold text-on-signal">{best ? "✓" : `M${mock.n}`}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[26px] font-semibold text-fg">
                +{LEARN_XP.mock} XP <span className="text-base text-fg-3">+{LEARN_XP.mockOffer} for an offer</span>
              </span>
              <span className="text-[15px] text-fg-2">
                Badge · <strong className="font-semibold text-fg">{mock.badge}</strong>
              </span>
            </div>
          </div>
          <span className="text-sm leading-normal text-fg-3">
            +{LEARN_XP.mock} XP and the badge for finishing the loop with a scored debrief; +{LEARN_XP.mockOffer} more the first time your verdict is Hire or better. Each is paid once.
          </span>
          {best && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 border border-line px-3.5 py-3">
              <span className="text-sm text-fg-2">Your best</span>
              <span className="font-mono text-[13px] text-fg">
                {VERDICT_LABEL[best.best.verdict]} · {LEVEL_LABEL[best.best.level]} · {best.best.pct}%{offer ? " · offer ✓" : ""}
              </span>
            </div>
          )}
          <div className="flex-grow" />
          {live ? (
            <>
              <button type="button" onClick={onResume} className="flex min-h-[56px] items-center justify-between gap-3 bg-signal px-5 text-[17px] font-semibold text-on-signal hover:opacity-90">
                <span>{run.screen === "debrief" || run.endedAt ? "Back to the debrief" : "Rejoin the call"}</span>
                <span aria-hidden className="font-mono text-sm">
                  ❯
                </span>
              </button>
              {confirmNew ? (
                <div className="flex flex-col gap-2.5 border border-bad px-4 py-3">
                  <span className="text-sm text-fg">Start over at {LEVEL_LABEL[level]}? The round in progress (answers, whiteboard, clock) is cleared.</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={begin} className="min-h-11 bg-bad px-4 text-sm font-semibold text-white">
                      Start over
                    </button>
                    <button type="button" onClick={() => setConfirmNew(false)} className="min-h-11 border border-line-strong px-4 text-sm text-fg hover:border-fg-3">
                      Keep my round
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmNew(true)} className="min-h-[48px] border border-line-strong px-4 text-sm text-fg hover:border-fg-3">
                  Start over (attempt {run.attempt + 1}) at {LEVEL_LABEL[level]}
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={begin} className="flex min-h-[56px] items-center justify-between gap-3 bg-signal px-5 text-[17px] font-semibold text-on-signal hover:opacity-90">
              <span>Join the call ❯</span>
              <span className="font-mono text-sm">
                {mock.minutes}:00 · {LEVEL_LABEL[level]}
              </span>
            </button>
          )}
          <span className="text-[13px] text-fg-3">The clock starts when you join. Your answers stay on this device.</span>
          {run.history.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              <span className={LABEL}>past rounds</span>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-[12px] text-fg-2">
                {run.history.slice(0, 5).map((h) => (
                  <li key={h.at} className="flex justify-between gap-3">
                    <span>{new Date(h.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                    <span>
                      {LEVEL_LABEL[h.level]} · {VERDICT_LABEL[h.verdict]} · {h.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
