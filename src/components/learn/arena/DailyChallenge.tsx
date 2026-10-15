"use client";

/**
 * Daily challenge runner (/learn/arena/daily): five questions, 20 s each, the same for everyone on an
 * Asia/Kolkata day. One scored run per day (kept in this browser; the server also counts only the first
 * reported run), unlimited unscored practice replays. Score = 100 per correct answer + 5 per second left.
 */
import "./arena.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { DAILY_SECONDS, dailyQuestionScore, dailyShare, type DailySet } from "@/lib/learn/arena/shared";
import Inline from "./Inline";
import { dailyStreakLocal, readArena, useArenaLocal, useBoard, useToday, writeArena, type DailyRun } from "./store";
import { BackLink, BTN, BTN_GHOST, fmtMs, Kicker, LABEL, msToIstMidnight, PageTitle, ResultSquares } from "./ui";

type Answer = { pick: number; ms: number; correct: boolean };
type Phase = { kind: "intro" } | { kind: "run"; practice: boolean; i: number; answers: Answer[]; shownAt: number; locked: boolean } | { kind: "done"; practice: boolean; answers: Answer[] };

const KEYS = "ABCDEF";

function longDate(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function Countdown() {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(msToIstMidnight());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  if (ms === null) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return <span className="font-mono text-xs text-fg-3">next challenge in {h}h {String(m).padStart(2, "0")}m · 00:00 IST</span>;
}

export default function DailyChallenge() {
  const today = useToday();
  const local = useArenaLocal();
  const { user } = useAuth();
  const { openAuthModal: openAuth } = useAuthModal();
  const { award, awardOnce } = useGame();
  const board = useBoard("week");
  const [set, setSet] = useState<DailySet | null>(null);
  const [err, setErr] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const firstOptRef = useRef<HTMLButtonElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/learn/daily")
      .then((r) => (r.ok ? (r.json() as Promise<DailySet>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => {
        if (!off) setSet(s);
      })
      .catch(() => {
        if (!off) setErr(true);
      });
    return () => {
      off = true;
    };
  }, []);

  const played: DailyRun | null = set && local ? local.daily[set.date] || null : null;
  const playedElsewhere = !played && !!board.data?.me?.dailyToday;
  const streak = today && local ? dailyStreakLocal(local.daily, today) : null;
  const streakNow = Math.max(streak?.current || 0, board.data?.me?.dailyStreak || 0);

  /* ---------------- timer */
  const running = phase.kind === "run" && !phase.locked;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [running]);

  const answer = useCallback(
    (pick: number) => {
      if (!set || phase.kind !== "run" || phase.locked) return;
      const q = set.questions[phase.i];
      const ms = Math.min(DAILY_SECONDS * 1000, Math.round(performance.now() - phase.shownAt));
      const a: Answer = { pick, ms, correct: pick === q.answer };
      setPhase({ ...phase, answers: [...phase.answers, a], locked: true });
      window.setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 0);
    },
    [set, phase],
  );

  // time out → counts as a miss
  const left = phase.kind === "run" && !phase.locked && now ? Math.max(0, DAILY_SECONDS * 1000 - (now - phase.shownAt)) : DAILY_SECONDS * 1000;
  useEffect(() => {
    if (phase.kind === "run" && !phase.locked && now && now - phase.shownAt >= DAILY_SECONDS * 1000) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the timer expiring is an external event
      answer(-1);
    }
  }, [now, phase, answer]);

  const start = (practice: boolean) => {
    setCopied(false);
    setNow(0);
    setPhase({ kind: "run", practice, i: 0, answers: [], shownAt: performance.now(), locked: false });
    window.scrollTo({ top: 0 });
    window.setTimeout(() => firstOptRef.current?.focus({ preventScroll: true }), 0);
  };

  const finish = useCallback(
    (practice: boolean, answers: Answer[]) => {
      if (!set) return;
      const results = answers.map((a) => a.correct);
      const correct = results.filter(Boolean).length;
      const score = answers.reduce((s, a) => s + dailyQuestionScore(a.correct, a.ms), 0);
      const ms = answers.reduce((s, a) => s + a.ms, 0);
      const picks = answers.map((a) => a.pick).join(",");
      track("daily_result", { date: set.date, n: set.number, score, correct, total: answers.length, ms, picks, practice });
      if (!practice) {
        const cur = readArena();
        const run: DailyRun = { date: set.date, number: set.number, score, correct, total: answers.length, ms, picks: answers.map((a) => a.pick), results, at: Date.now() };
        const next = { ...cur, daily: { ...cur.daily, [set.date]: run }, local: cur.local + correct * 8 + (correct === answers.length ? 10 : 0) };
        writeArena(next);
        award("arena:daily", "First daily challenge");
        awardOnce(`daily:${set.date}`, correct * 5 + (correct === answers.length ? 10 : 0), `Daily #${set.number} · ${correct}/${answers.length}`);
        if (correct === answers.length) award("arena:perfect", "Daily challenge · 5/5");
        const s = Math.max(dailyStreakLocal(next.daily, set.date).current, (board.data?.me?.dailyStreak || 0) + (board.data?.me?.dailyToday ? 0 : 1));
        if (s >= 3) award("arena:streak3", "Daily streak · 3 days");
        if (s >= 7) award("arena:streak7", "Daily streak · 7 days");
      }
      setPhase({ kind: "done", practice, answers });
      window.scrollTo({ top: 0 });
      window.setTimeout(() => headRef.current?.focus(), 0);
    },
    [set, award, awardOnce, board.data],
  );

  const next = () => {
    if (!set || phase.kind !== "run" || !phase.locked) return;
    if (phase.i + 1 >= set.questions.length) finish(phase.practice, phase.answers);
    else {
      setNow(0);
      setPhase({ ...phase, i: phase.i + 1, shownAt: performance.now(), locked: false });
      window.scrollTo({ top: 0 });
      window.setTimeout(() => firstOptRef.current?.focus({ preventScroll: true }), 0);
    }
  };

  // keyboard: A–D / 1–4 answer, Enter / → next
  useEffect(() => {
    if (phase.kind !== "run" || !set) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const q = set.questions[phase.i];
      if (!phase.locked) {
        const k = e.key.toUpperCase();
        const idx = /^[1-6]$/.test(k) ? Number(k) - 1 : KEYS.indexOf(k);
        if (idx >= 0 && idx < q.options.length) {
          e.preventDefault();
          answer(idx);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, set, answer]);

  const shareText = useMemo(() => {
    if (!set || phase.kind !== "done") return "";
    const results = phase.answers.map((a) => a.correct);
    const score = phase.answers.reduce((s, a) => s + dailyQuestionScore(a.correct, a.ms), 0);
    const ms = phase.answers.reduce((s, a) => s + a.ms, 0);
    const origin = typeof window !== "undefined" ? window.location.host : "himanshukukreja.in";
    return dailyShare(set, results, score, ms, `${origin}/learn/arena/daily`);
  }, [set, phase]);

  const playedShare = useMemo(() => {
    if (!set || !played) return "";
    const origin = typeof window !== "undefined" ? window.location.host : "himanshukukreja.in";
    return dailyShare(set, played.results, played.score, played.ms, `${origin}/learn/arena/daily`);
  }, [set, played]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  /* ---------------- views */

  const header = (
    <section aria-labelledby="daily-h" className="flex flex-col gap-4">
      <BackLink />
      <Kicker>❯ arena · daily {set ? `#${set.number} · ${longDate(set.date).toLowerCase()}` : ""}</Kicker>
      <PageTitle id="daily-h">Daily challenge</PageTitle>
    </section>
  );

  if (err) {
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {header}
        <p className="border border-line bg-surface p-5 text-fg-2">The challenge didn&apos;t load. Check your connection and refresh.</p>
      </main>
    );
  }

  if (phase.kind === "run" && set) {
    const q = set.questions[phase.i];
    const a = phase.locked ? phase.answers[phase.answers.length - 1] : null;
    const secs = Math.ceil(left / 1000);
    const pct = (left / (DAILY_SECONDS * 1000)) * 100;
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pb-28 pt-4 sm:px-6 sm:pt-8">
        <div className="sticky top-[calc(var(--hk-header-h,61px)+env(safe-area-inset-top,0px))] z-20 -mx-4 flex flex-col gap-2.5 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <span className={LABEL}>
            {phase.practice ? "practice · unscored" : `daily #${set.number}`} · question {phase.i + 1}/{set.questions.length}
          </span>
          <span className="flex gap-1" aria-hidden>
            {set.questions.map((_, k) => {
              const done = phase.answers[k];
              return <span key={k} className={`h-2 w-6 ${done ? (done.correct ? "bg-signal" : "bg-fg-4") : k === phase.i ? "border border-signal" : "border border-line-strong"}`} />;
            })}
          </span>
        </div>

        <div
          role="progressbar"
          aria-label="Time left"
          aria-valuemin={0}
          aria-valuemax={DAILY_SECONDS}
          aria-valuenow={phase.locked ? 0 : secs}
          aria-valuetext={phase.locked ? "answered" : `${secs} seconds left`}
          className="relative h-2 w-full bg-surface-2"
        >
          <span className={`absolute inset-y-0 left-0 ${secs <= 5 && !phase.locked ? "bg-bad" : "bg-signal"}`} style={{ width: `${phase.locked ? 0 : pct}%` }} />
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`font-mono text-sm tabular-nums ${secs <= 5 && !phase.locked ? "text-bad-text" : "text-fg-2"}`}>{phase.locked ? (a && a.pick < 0 ? "time's up" : `${(a!.ms / 1000).toFixed(1)}s`) : `${secs}s`}</span>
          <span className="font-mono text-xs text-fg-3">{q.kind === "trial" ? "from a trial" : "from a quick check"}</span>
        </div>
        </div>

        <h2 className="font-display text-[clamp(22px,3.2vw,32px)] font-bold leading-[1.2] tracking-[-0.02em] text-fg"><Inline text={q.prompt} /></h2>

        <ol className="m-0 grid list-none gap-2 p-0" aria-label="Options">
          {q.options.map((o, k) => {
            const isPick = a?.pick === k;
            const isRight = k === q.answer;
            const state = !a ? "idle" : isRight ? "right" : isPick ? "wrong" : "dim";
            return (
              <li key={k}>
                <button
                  ref={k === 0 ? firstOptRef : undefined}
                  type="button"
                  disabled={!!a}
                  onClick={() => answer(k)}
                  className={`flex min-h-[52px] w-full items-start gap-3 border px-3.5 py-3 text-left text-[16px] leading-snug text-fg transition-colors ${
                    state === "idle"
                      ? "border-line bg-surface hover:border-fg-4 hover:bg-surface-2"
                      : state === "right"
                        ? `border-ok bg-ok/10 ${isPick ? "motion-safe:animate-[sd-arena-glow_0.7s_ease-out]" : "border-dashed"}`
                        : state === "wrong"
                          ? "border-bad bg-bad/10 motion-safe:animate-[sd-arena-shake_0.42s_ease-in-out]"
                          : "border-line bg-surface opacity-50"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 shrink-0 place-items-center border font-mono text-xs font-semibold ${
                      state === "right" ? "border-ok bg-ok text-[#000]" : state === "wrong" ? "border-bad bg-bad text-white" : "border-line-strong text-fg-2"
                    }`}
                  >
                    {KEYS[k]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Inline text={o} />
                  </span>
                  {a && (isPick || isRight) && <span className={`self-center font-mono text-[11px] uppercase tracking-label ${isRight ? "text-ok" : "text-bad-text"}`}>{isRight ? (isPick ? "correct" : "answer") : "your pick"}</span>}
                </button>
              </li>
            );
          })}
        </ol>

        <div aria-live="polite" className="min-h-[1px]">
          {a && (
            <div className="flex flex-col gap-3 border border-line bg-surface p-4">
              <p className={`m-0 font-mono text-sm font-semibold ${a.correct ? "text-ok" : "text-bad-text"}`}>
                {a.correct ? `Correct · +${dailyQuestionScore(true, a.ms)}` : a.pick < 0 ? `Time's up · the answer is ${KEYS[q.answer]}` : `Not quite · the answer is ${KEYS[q.answer]}`}
              </p>
              {q.explain && (
                <p className="m-0 text-[15px] leading-relaxed text-fg-2">
                  <Inline text={q.explain} />
                </p>
              )}
              <Link href={q.source.href} className="font-mono text-xs text-signal-text underline underline-offset-4">
                from {q.source.label} →
              </Link>
            </div>
          )}
        </div>

        {a && (
          <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] z-10 lg:bottom-4">
            <button ref={nextRef} type="button" onClick={next} className={`${BTN} w-full sm:w-auto`}>
              {phase.i + 1 >= set.questions.length ? "See results" : "Next question"} →
            </button>
          </div>
        )}
      </main>
    );
  }

  if (phase.kind === "done" && set) {
    const results = phase.answers.map((x) => x.correct);
    const correct = results.filter(Boolean).length;
    const score = phase.answers.reduce((s, x) => s + dailyQuestionScore(x.correct, x.ms), 0);
    const ms = phase.answers.reduce((s, x) => s + x.ms, 0);
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {header}
        <section aria-labelledby="res-h" className="flex flex-col gap-5 border border-signal bg-surface p-5 sm:p-7">
          <span className={LABEL}>{phase.practice ? "practice run · unscored" : "scored run · counts on the leaderboard"}</span>
          <h2 id="res-h" ref={headRef} tabIndex={-1} className="font-display text-[clamp(40px,6vw,64px)] font-extrabold leading-none tracking-[-0.04em] text-fg outline-none">
            {correct}/{results.length} <span className="text-signal-text">· {score}</span>
            <span className="ml-2 align-middle font-mono text-sm font-normal tracking-normal text-fg-3">pts</span>
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <ResultSquares results={results} size={22} />
            <span className="font-mono text-sm text-fg-2">{fmtMs(ms)} total</span>
            {!phase.practice && streakNow > 0 && <span className="font-mono text-sm text-signal-text">streak {streakNow} day{streakNow === 1 ? "" : "s"}</span>}
          </div>
          <SharePanel text={shareText} copied={copied} onCopy={() => copy(shareText)} />
          <div className="flex flex-wrap gap-2">
            <Link href="/learn/arena/leaderboard" className={BTN}>
              Leaderboard →
            </Link>
            <button type="button" onClick={() => start(true)} className={BTN_GHOST}>
              Practice replay
            </button>
            <Link href="/learn/arena" className={BTN_GHOST}>
              Arena
            </Link>
          </div>
          {!user && !phase.practice && (
            <p className="m-0 border-t border-line pt-4 text-[15px] text-fg-2">
              Your score is saved in this browser.{" "}
              <button type="button" onClick={() => openAuth()} className="font-semibold text-signal-text underline underline-offset-4">
                Sign in
              </button>{" "}
              to put it on the weekly leaderboard.
            </p>
          )}
        </section>
        <Review set={set} answers={phase.answers} />
      </main>
    );
  }

  /* intro */
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      {header}
      <p className="max-w-[620px] text-[17px] leading-relaxed text-fg-2">
        Five questions from across the course, {DAILY_SECONDS} seconds each. Same five for everyone today. Faster right answers score more, and your first run is the one that counts.
      </p>

      {!set || !local ? (
        <div className="h-[220px] animate-pulse border border-line bg-surface" aria-label="Loading" />
      ) : played ? (
        <section aria-labelledby="played-h" className="flex flex-col gap-4 border border-line-strong bg-surface p-5 sm:p-7">
          <span className={LABEL}>today · done</span>
          <h2 id="played-h" className="font-display text-[44px] font-extrabold leading-none tracking-[-0.04em] text-fg">
            {played.correct}/{played.total} <span className="text-signal-text">· {played.score}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <ResultSquares results={played.results} size={22} />
            <span className="font-mono text-sm text-fg-2">{fmtMs(played.ms)}</span>
            {streakNow > 0 && <span className="font-mono text-sm text-signal-text">streak {streakNow}</span>}
          </div>
          <SharePanel text={playedShare} copied={copied} onCopy={() => copy(playedShare)} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => start(true)} className={BTN_GHOST}>
              Practice replay · unscored
            </button>
            <Link href="/learn/arena/leaderboard" className={BTN_GHOST}>
              Leaderboard
            </Link>
            <Countdown />
          </div>
        </section>
      ) : (
        <section aria-labelledby="go-h" className="flex flex-col gap-5 border border-signal bg-surface p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="go-h" className="font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] text-fg">
              #{set.number} · {set.questions.length} questions
            </h2>
            {streakNow > 0 && <span className="font-mono text-sm text-signal-text">streak {streakNow} · keep it alive</span>}
          </div>
          <ul className="m-0 grid list-none gap-1.5 p-0 text-[15px] text-fg-2">
            <li>■ 100 per right answer + 5 per second left</li>
            <li>■ answer with a tap, A–D or 1–4</li>
            <li>■ leaderboard: +8 per right answer, +10 for 5/5, up to +10 for speed</li>
          </ul>
          {playedElsewhere && <p className="m-0 font-mono text-xs text-fg-3">You already played today on another device. This run is practice.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => start(playedElsewhere)} className={`${BTN} min-h-12 px-7 text-[15px]`}>
              {playedElsewhere ? "Practice run" : "Start"} →
            </button>
            <Countdown />
          </div>
        </section>
      )}
    </main>
  );
}

function SharePanel({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
  if (!text) return null;
  return (
    <div className="flex flex-col gap-2">
      <pre className="m-0 overflow-x-auto whitespace-pre border border-line bg-bg p-3 font-mono text-[13px] leading-relaxed text-fg">{text}</pre>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCopy} className={BTN_GHOST}>
          {copied ? "Copied" : "Copy result"}
        </button>
        <span aria-live="polite" className="font-mono text-xs text-fg-3">
          {copied ? "paste it anywhere" : ""}
        </span>
      </div>
    </div>
  );
}

function Review({ set, answers }: { set: DailySet; answers: Answer[] }) {
  return (
    <section aria-labelledby="rev-h" className="flex flex-col gap-3">
      <h2 id="rev-h" className="font-display text-[26px] font-bold tracking-[-0.02em] text-fg">
        The five
      </h2>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {set.questions.map((q, i) => {
          const a = answers[i];
          return (
            <li key={q.id} className="flex flex-col gap-1.5 border border-line bg-surface p-4">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
                <span aria-hidden className={`h-2.5 w-2.5 ${a?.correct ? "bg-signal" : "border border-line-strong"}`} />
                {a?.correct ? "right" : a && a.pick < 0 ? "timed out" : "missed"} · {q.source.label}
              </span>
              <span className="text-[15px] font-semibold text-fg">
                <Inline text={q.prompt} />
              </span>
              <span className="text-[14px] text-fg-2">
                <span className="font-mono text-xs text-ok">answer {KEYS[q.answer]}</span> · <Inline text={q.options[q.answer]} />
              </span>
              <Link href={q.source.href} className="self-start font-mono text-xs text-signal-text underline underline-offset-4">
                read the lesson →
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
