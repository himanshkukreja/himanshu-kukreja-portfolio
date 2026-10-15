"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useGame } from "@/game/GameProvider";
import { addReviewCard } from "@/lib/learn/review";
import { track } from "@/lib/track";
import type { MCQQuestion } from "@/lib/mcq-parser";
import {
  TRIAL_XP,
  balancedOrders,
  cooldownLeft,
  estimateMinutes,
  guestId,
  insertRemoteAttempt,
  mmss,
  newSeed,
  passMark,
  trialXpKey,
  updateRemoteAttempt,
  writeTrialProgress,
  type OptionLabel,
  type PartRecord,
  type RemoteHistory,
  type RunState,
  type TrialPart,
} from "./engine";
import PartsStrip, { Kbd, type PartView } from "./PartsStrip";
import TrialQuestion, { type SaveState } from "./TrialQuestion";
import TrialResults, { type TrialResult } from "./TrialResults";

type Props = {
  ready: boolean;
  part: TrialPart;
  questions: MCQQuestion[];
  partsCount: number;
  courseId: string;
  week: string;
  lessonSlug: string;
  weekLabel: string;
  weekTopic: string;
  hubHref: string;
  hrefFor: (n: number) => string;
  continueHref: string;
  continueLabel: string;
  views: PartView[];
  now: number;
  userId: string | null;
  synced: boolean;
  record?: PartRecord;
  locked: boolean;
  initialRun: RunState | null;
  remoteOpen: RemoteHistory["open"][string] | null;
  onRecord: (n: number, rec: PartRecord) => void;
  onRun: (n: number, run: RunState | null) => void;
  allRecords: Record<string, PartRecord>;
};

type Screen = "gate" | "q" | "res";

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export default function TrialRun(props: Props) {
  const { part, questions, courseId, week, lessonSlug, userId, record, now } = props;
  const { awardOnce } = useGame();
  const N = questions.length;
  const pm = passMark(N);

  const [screen, setScreen] = useState<Screen>("gate");
  const [run, setRunState] = useState<RunState | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [result, setResult] = useState<TrialResult | null>(null);
  const runRef = useRef<RunState | null>(null);
  const queuedRef = useRef<Set<string>>(new Set());
  const saveTimer = useRef<number | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Resume what was left: the local run (full state) or, failing that, an unfinished remote attempt.
  const resumable: RunState | null = useMemo(() => {
    if (props.initialRun && props.initialRun.seed) {
      return props.remoteOpen && props.remoteOpen.seed === props.initialRun.seed
        ? { ...props.initialRun, remoteId: props.initialRun.remoteId || props.remoteOpen.id }
        : props.initialRun;
    }
    if (props.remoteOpen) {
      const picks = props.remoteOpen.answers;
      const firstOpen = questions.findIndex((q) => !picks[q.number]);
      return {
        part: part.n,
        attempt: (record?.attempts ?? 0) + 1,
        seed: props.remoteOpen.seed,
        picks,
        flags: {},
        i: firstOpen < 0 ? Math.max(0, N - 1) : firstOpen,
        combo: 0,
        bestCombo: 0,
        startedAt: props.remoteOpen.startedAt,
        remoteId: props.remoteOpen.id,
      };
    }
    return null;
  }, [props.initialRun, props.remoteOpen, questions, part.n, record?.attempts, N]);

  const orders = useMemo(() => (run ? balancedOrders(questions, run.seed) : new Map<number, OptionLabel[]>()), [questions, run]);

  const setRun = useCallback(
    (next: RunState | null) => {
      runRef.current = next;
      setRunState(next);
      props.onRun(part.n, next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.onRun, part.n]
  );

  const scrollTop = () => {
    const el = topRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  // ------------------------------------------------------------ persistence

  const pushRemote = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const r = runRef.current;
    if (!userId || !r?.remoteId) {
      setSave("local");
      return;
    }
    setSave("saving");
    saveTimer.current = window.setTimeout(async () => {
      const cur = runRef.current;
      if (!cur?.remoteId) return;
      const ok = await updateRemoteAttempt(cur.remoteId, { answers: cur.picks });
      setSave(ok ? "saved" : "local");
    }, 500);
  }, [userId]);

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    []
  );

  const queueCard = useCallback(
    (q: MCQQuestion, source: "trial_miss" | "trial_flag", picked?: OptionLabel) => {
      const ref = `${source}:${q.number}`;
      if (queuedRef.current.has(ref)) return;
      queuedRef.current.add(ref);
      const answer = q.options.find((o) => o.label === q.correctAnswer)?.text ?? "";
      const pickedText = picked ? q.options.find((o) => o.label === picked)?.text : undefined;
      void addReviewCard({
        source,
        sourceRef: `${week}:q${q.number}`,
        courseId,
        week,
        lessonSlug: part.lesson?.slug ?? lessonSlug,
        front: q.text,
        back: answer,
        detail: {
          picked: pickedText,
          why: q.explanation,
          context: `${props.weekLabel} · Trial part ${part.n} · Q${q.number}`,
        },
      }).catch(() => undefined);
    },
    [week, courseId, part.lesson?.slug, part.n, lessonSlug, props.weekLabel]
  );

  // ------------------------------------------------------------ actions

  const start = useCallback(async () => {
    const attempt = (record?.attempts ?? 0) + 1;
    const who = userId ? `u:${userId}` : `g:${guestId()}`;
    const seed = newSeed(who, courseId, week, part.n, attempt);
    const fresh: RunState = { part: part.n, attempt, seed, picks: {}, flags: {}, i: 0, combo: 0, bestCombo: 0, startedAt: Date.now(), remoteId: null };
    queuedRef.current = new Set();
    setRun(fresh);
    setSel(null);
    setSave("idle");
    setResult(null);
    setScreen("q");
    scrollTop();
    if (userId) {
      const id = await insertRemoteAttempt(userId, courseId, week, part.n, seed, N);
      if (id && runRef.current && runRef.current.seed === seed) setRun({ ...runRef.current, remoteId: id });
    }
  }, [record?.attempts, userId, courseId, week, part.n, N, setRun]);

  const resume = useCallback(() => {
    if (!resumable) return;
    setRun(resumable);
    setSel(null);
    setSave(Object.keys(resumable.picks).length ? (userId && resumable.remoteId ? "saved" : "local") : "idle");
    setScreen("q");
    scrollTop();
  }, [resumable, setRun, userId]);

  const finish = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    const marks = questions.map((q) => (r.picks[q.number] && r.picks[q.number] === q.correctAnswer ? 1 : 0)) as (0 | 1)[];
    const score = marks.reduce<number>((a, b) => a + b, 0);
    const passed = score >= pm;
    const award = passed ? awardOnce(trialXpKey(week, part.n), TRIAL_XP, `Trial cleared · ${props.weekLabel} part ${part.n}`) : 0;
    track("trial_result", { week, part: part.n, score, total: N, passed });

    // Misses (wrong or skipped) and flagged-but-right questions go to the review queue
    let queued = 0;
    questions.forEach((q, k) => {
      const picked = r.picks[q.number];
      if (!marks[k]) {
        queueCard(q, "trial_miss", picked);
        queued++;
      } else if (r.flags[q.number]) {
        queueCard(q, "trial_flag", picked);
        queued++;
      }
    });

    const prev = record;
    const rec: PartRecord = {
      best: Math.max(prev?.best ?? 0, score),
      total: N,
      attempts: (prev?.attempts ?? 0) + 1,
      passed: !!prev?.passed || passed,
      last: { score, total: N, passed, at: Date.now(), marks, answers: r.picks },
    };
    props.onRecord(part.n, rec);

    if (r.remoteId) void updateRemoteAttempt(r.remoteId, { answers: r.picks, score, passed, finished: true });
    if (userId) {
      const passedParts = props.views.filter((v) => (v.part.n === part.n ? rec.passed : v.state === "pass")).length;
      void writeTrialProgress(userId, courseId, week, lessonSlug, passedParts, props.partsCount);
    }

    setResult({
      attempt: r.attempt,
      picks: r.picks,
      flags: r.flags,
      score,
      passed,
      award,
      alreadyCleared: !!prev?.passed,
      bestCombo: r.bestCombo,
      queued,
      seconds: Math.round((Date.now() - r.startedAt) / 1000),
      best: rec.best,
    });
    setRun(null);
    setSel(null);
    setScreen("res");
    scrollTop();
  }, [questions, pm, awardOnce, week, part.n, props, record, N, userId, courseId, lessonSlug, queueCard, setRun]);

  // ------------------------------------------------------------ question screen

  const i = run ? Math.min(run.i, N - 1) : 0;
  const q = questions[i];
  const order = useMemo(() => (q ? orders.get(q.number) ?? q.options.map((o) => o.label) : []), [q, orders]);
  const pick = run && q ? run.picks[q.number] : undefined;
  const revealed = pick !== undefined;

  const choose = useCallback((k: number) => {
    setSel(k);
  }, []);

  const lockIn = useCallback(() => {
    const r = runRef.current;
    if (!r || !q || sel === null || r.picks[q.number]) return;
    const orig = order[sel];
    if (!orig) return;
    const ok = orig === q.correctAnswer;
    const combo = ok ? r.combo + 1 : 0;
    setRun({ ...r, picks: { ...r.picks, [q.number]: orig }, combo, bestCombo: Math.max(r.bestCombo, combo) });
    if (!ok) queueCard(q, "trial_miss", orig);
    pushRemote();
  }, [q, sel, order, setRun, queueCard, pushRemote]);

  const goNext = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    if (r.i + 1 >= N) {
      finish();
      return;
    }
    setRun({ ...r, i: r.i + 1 });
    setSel(null);
  }, [N, finish, setRun]);

  const skip = useCallback(() => {
    const r = runRef.current;
    if (!r || !q || r.picks[q.number]) return;
    // A skip breaks the combo, like a miss
    if (r.i + 1 >= N) {
      setRun({ ...r, combo: 0 });
      finish();
      return;
    }
    setRun({ ...r, i: r.i + 1, combo: 0 });
    setSel(null);
  }, [q, N, finish, setRun]);

  const jumpTo = useCallback(
    (k: number) => {
      const r = runRef.current;
      if (!r) return;
      setRun({ ...r, i: Math.max(0, Math.min(N - 1, k)) });
      setSel(null);
    },
    [N, setRun]
  );

  const toggleFlag = useCallback(() => {
    const r = runRef.current;
    if (!r || !q) return;
    const flags = { ...r.flags };
    if (flags[q.number]) delete flags[q.number];
    else flags[q.number] = true;
    setRun({ ...r, flags });
  }, [q, setRun]);

  const cd = cooldownLeft(record, now);
  const canStart = props.ready && cd === 0;

  // Gate: ↵ starts (or resumes)
  useEffect(() => {
    if (screen !== "gate") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "BUTTON" || tag === "A") return;
      if (resumable) {
        e.preventDefault();
        resume();
      } else if (canStart && !props.locked) {
        e.preventDefault();
        void start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, resumable, resume, canStart, start, props.locked]);

  const questionsReady = N > 0;

  return (
    <div ref={topRef} className="flex flex-col gap-8">
      <nav aria-label="Breadcrumb" className={`${screen === "q" ? "hidden sm:flex" : "flex"} flex-wrap items-center gap-2 font-mono text-[13px] text-fg-3`}>
        <Link href={props.hubHref} className="py-1.5 text-fg-3 no-underline hover:text-fg">
          {props.weekLabel.toLowerCase()} · trials
        </Link>
        <span className="text-line-strong">/</span>
        <span aria-current="page" className="text-fg">
          part {part.n} · {part.title.toLowerCase()}
        </span>
      </nav>

      {!questionsReady ? (
        <p className="text-fg-2">This part has no questions yet.</p>
      ) : screen === "q" && run && q ? (
        <TrialQuestion
          part={part}
          weekLabel={props.weekLabel}
          hubHref={props.hubHref}
          questions={questions}
          run={run}
          index={i}
          order={order}
          sel={sel}
          save={save}
          signedIn={!!userId}
          onChoose={choose}
          onLockIn={lockIn}
          onNext={goNext}
          onSkip={skip}
          onFlag={toggleFlag}
          onEnd={finish}
          onJump={jumpTo}
          revealed={revealed}
          pick={pick}
          isTyping={isTyping}
        />
      ) : screen === "res" && result ? (
        <TrialResults
          part={part}
          questions={questions}
          result={result}
          weekLabel={props.weekLabel}
          views={props.views}
          hrefFor={props.hrefFor}
          now={now}
          cooldown={cd}
          onRetry={() => void start()}
          continueHref={props.continueHref}
          continueLabel={props.continueLabel}
          signedIn={!!userId}
        />
      ) : (
        <Gate
          {...props}
          N={N}
          pm={pm}
          cd={cd}
          canStart={canStart}
          resumable={resumable}
          onStart={() => void start()}
          onResume={resume}
          questions={questions}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------------------------

function Gate(
  props: Props & {
    N: number;
    pm: number;
    cd: number;
    canStart: boolean;
    resumable: RunState | null;
    onStart: () => void;
    onResume: () => void;
  }
) {
  const { part, N, pm, cd, record, locked, resumable, weekLabel, weekTopic } = props;
  const lesson = part.lesson;
  const lessonHref = lesson ? `/learn/${props.courseId}/${props.week}/${lesson.slug}` : null;
  const attemptN = (record?.attempts ?? 0) + 1;
  const passed = !!record?.passed;
  const last = record?.last;
  const marks: (0 | 1)[] = last
    ? last.marks.length
      ? last.marks
      : last.answers
      ? props.questions.map((q) => (last.answers?.[q.number] === q.correctAnswer ? 1 : 0))
      : []
    : [];
  const lastMisses = marks.filter((m) => !m).length;
  const answeredInRun = resumable ? Object.keys(resumable.picks).length : 0;

  const source = lesson ? (part.boss ? `drawn from the capstone, ${lesson.title}` : `drawn from ${lesson.label}`) : "from this week's lessons";

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap items-start gap-10">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-[22px]">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">
            Trial {part.n} of {props.partsCount} · {weekLabel} · {weekTopic}
          </span>
          <h1 className="m-0 font-display text-[clamp(44px,7vw,104px)] font-extrabold leading-[0.86] tracking-tightest text-fg">
            {part.title}
            <span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[640px] text-[19px] leading-relaxed text-fg-2">
            Questions {part.first}–{part.last}, {source}. Pass it to clear Part {part.n} of this week&apos;s trial and send anything you miss to your review queue.
          </p>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-px border border-line bg-line">
            <GateStat value={String(N)} label="questions" />
            <GateStat value="80%" label={`pass mark · ${pm} of ${N}`} />
            <GateStat
              value={
                <>
                  ~{estimateMinutes(N)}
                  <span className="text-base text-fg-3"> min</span>
                </>
              }
              label="no clock, go at your pace"
            />
            <GateStat value={passed ? "✓" : `+${TRIAL_XP}`} label={passed ? "cleared · XP already earned" : "XP on first pass"} accent={!passed} ok={passed} />
          </div>

          <ul className="m-0 flex list-none flex-col border-t border-line p-0">
            {[
              <>
                One question per screen. Choose, then <strong className="text-fg">lock in</strong>. The answer and its explanation appear only after you commit.
              </>,
              <>Options are shuffled for you, in a new order every attempt.</>,
              <>Every answer autosaves. Close the tab and you come back to the same question.</>,
              <>
                Your score is correct out of {N}, not out of answered. A skipped question counts as a miss.
              </>,
              <>Wrong answers become cards in your review queue, so the trial keeps teaching after it ends.</>,
            ].map((rule, k) => (
              <li key={k} className="flex gap-3.5 border-b border-line py-3.5 text-base leading-normal text-fg-2">
                <span className="w-6 shrink-0 font-mono text-signal-text">0{k + 1}</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            {resumable ? (
              <button
                type="button"
                onClick={props.onResume}
                className="inline-flex min-h-[56px] w-full items-center justify-center gap-3 bg-signal px-6 text-[17px] font-semibold sm:w-auto sm:justify-start text-on-signal hover:opacity-90"
              >
                Resume attempt {resumable.attempt} · Q{Math.min(resumable.i + 1, N)} of {N} <span aria-hidden="true">▶</span>
              </button>
            ) : locked && lessonHref ? (
              <>
                <Link
                  href={lessonHref}
                  className="inline-flex min-h-[56px] w-full items-center justify-center gap-3 bg-signal px-6 text-[17px] font-semibold sm:w-auto sm:justify-start text-on-signal no-underline hover:opacity-90"
                >
                  Read {part.boss ? "the capstone" : lesson?.label} first <span aria-hidden="true">→</span>
                </Link>
                <button
                  type="button"
                  onClick={props.onStart}
                  disabled={!props.canStart}
                  className="inline-flex min-h-[56px] w-full items-center justify-center border border-line-strong px-[18px] text-[15px] sm:w-auto text-fg hover:border-fg-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start anyway
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={props.onStart}
                  disabled={!props.canStart}
                  className="inline-flex min-h-[56px] w-full items-center justify-center gap-3 bg-signal px-6 text-[17px] font-semibold sm:w-auto sm:justify-start text-on-signal hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-3"
                >
                  {cd > 0 ? `Retry opens in ${mmss(cd)}` : `Start attempt ${attemptN}`} <span aria-hidden="true">▶</span>
                </button>
                {lessonHref && (
                  <Link
                    href={lessonHref}
                    className="inline-flex min-h-[56px] items-center border border-line-strong px-[18px] text-[15px] text-fg no-underline hover:border-fg-3"
                  >
                    Reread {part.boss ? "the capstone" : lesson?.label} first
                  </Link>
                )}
              </>
            )}
            <span className="hidden font-mono text-xs text-fg-3 sm:inline">
              press <Kbd>↵</Kbd> to {resumable ? "resume" : "start"}
            </span>
          </div>
          {resumable && (
            <span className="text-[13px] text-fg-3">
              {answeredInRun} of {N} answered so far. Your picks and flags were saved{props.userId && resumable.remoteId ? " to your account" : " on this device"}.
            </span>
          )}
        </div>

        <aside aria-label="Trial status" className="flex max-w-[440px] flex-[1_1_340px] flex-col gap-4">
          <div className="flex flex-col gap-2.5 border border-line-strong bg-surface p-5">
            <div className="flex items-center gap-2.5">
              {passed ? (
                <span className="bg-ok px-2 py-1 font-mono text-[11px] font-semibold tracking-label text-[#04140B]">CLEARED</span>
              ) : locked ? (
                <span className="border border-dashed border-line-strong px-2 py-1 font-mono text-[11px] font-semibold tracking-label text-fg-3">LOCKED</span>
              ) : (
                <span className="bg-signal px-2 py-1 font-mono text-[11px] font-semibold tracking-label text-on-signal">{lesson ? "UNLOCKED" : "OPEN"}</span>
              )}
            </div>
            <span className="text-[15px] leading-relaxed text-fg-2">
              {passed ? (
                <>
                  You passed this part with a best of {record?.best}/{N}. Retakes only raise your best score; the XP was awarded once.
                </>
              ) : locked && lesson && lessonHref ? (
                <>
                  Opens when you mark{" "}
                  <Link href={lessonHref} className="text-signal-text">
                    {part.boss ? "the capstone" : `${lesson.label} · ${lesson.title}`}
                  </Link>{" "}
                  complete. Each trial opens when its lesson is done, so you are tested on what you just read.
                </>
              ) : lesson && lessonHref ? (
                <>
                  {part.boss ? "This part covers the whole week; it pairs with " : "This part tests "}
                  <Link href={lessonHref} className="text-signal-text">
                    {part.boss ? lesson.title : `${lesson.label} · ${lesson.title}`}
                  </Link>
                  . Each trial opens when its lesson is done, so you are tested on what you just read.
                </>
              ) : (
                <>Questions {part.first}–{part.last} from this week&apos;s lessons.</>
              )}
            </span>
          </div>

          <div className="flex flex-col gap-1 border border-line bg-surface p-5">
            <span className="pb-2 font-mono text-xs uppercase tracking-label text-fg-3">Your record</span>
            <RecordRow label="Best score" value={record?.attempts || record?.best ? `${record.best}/${N} · ${Math.round((record.best / N) * 100)}%` : "—"} />
            <RecordRow label="Attempts" value={record?.attempts ? `${record.attempts} ${record.attempts === 1 ? "attempt" : "attempts"}` : "none yet"} />
            <RecordRow
              label="Last attempt"
              value={last ? `${last.score}/${last.total} · ${last.passed ? "passed" : "failed"}` : "—"}
              cls={last ? (last.passed ? "text-ok" : "text-bad-text") : undefined}
            />
            <RecordRow label="Retry cooldown" value={cd > 0 ? mmss(cd) : "ready ✓"} cls={cd > 0 ? "text-signal-text" : "text-ok"} />
            <span className="pt-2.5 text-[13px] leading-normal text-fg-3">
              After a fail the trial rests for 10 minutes, then comes back with a new option order. Passing locks in your XP; retries only raise your best score.
            </span>
            {!props.userId && (
              <span className="pt-2 text-[13px] leading-normal text-fg-3">Saved in this browser. Sign in to keep your attempts across devices.</span>
            )}
          </div>

          {last && marks.length > 0 && (
            <div className="flex flex-col gap-3 border border-line bg-surface p-5">
              <span className="font-mono text-xs uppercase tracking-label text-fg-3">
                Last attempt · {last.score} of {last.total}
              </span>
              <div role="img" aria-label={`Last attempt: ${last.score} correct, ${lastMisses} missed`} className="flex flex-wrap gap-1">
                {marks.map((m, k) => (
                  <span key={k} className={`h-3.5 w-3.5 ${m ? "bg-ok" : "bg-bad"}`} />
                ))}
              </div>
              {lastMisses > 0 && <span className="text-[13px] leading-normal text-fg-3">The {lastMisses} you missed are in your review queue.</span>}
            </div>
          )}
        </aside>
      </section>

      <section aria-labelledby="parts-h" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="parts-h" className="m-0 font-display text-[32px] font-bold tracking-[-0.025em] text-fg">
            {weekLabel} trials
          </h2>
          <span className="text-sm text-fg-3">
            {props.views.reduce((a, v) => a + v.part.count, 0)} questions in {props.partsCount} parts · each part counts toward the week
          </span>
        </div>
        <PartsStrip views={props.views} hrefFor={props.hrefFor} now={props.now} highlight={part.n} />
      </section>
    </div>
  );
}

function GateStat({ value, label, accent, ok }: { value: React.ReactNode; label: string; accent?: boolean; ok?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-bg px-[18px] py-4">
      <span className={`font-mono text-[28px] font-semibold ${accent ? "text-signal-text" : ok ? "text-ok" : "text-fg"}`}>{value}</span>
      <span className="text-[13px] text-fg-3">{label}</span>
    </div>
  );
}

function RecordRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-2 text-sm">
      <span className="text-fg-3">{label}</span>
      <span className={`font-mono ${cls || "text-fg"}`}>{value}</span>
    </div>
  );
}
