"use client";

/**
 * /learn/papers/<key>: a written paper. Start screen (practice or exam, the rules, marks and time) → the answering
 * view (full screen: the question beside the answer sheet in landscape, above it in portrait; a question navigator;
 * the clock in exam mode) → grading → results.
 *
 * Practice: untimed; "Check this answer" grades the answer on screen (and again after changes). Exam: timed from the
 * start, the clock keeps running if you leave (like the boss and the trial, a closed tab resumes where it was), the
 * answers lock when time is up and the whole paper is graded at the end.
 *
 * Storage: see lib/learn/papers/types.ts. The attempt in progress lives in the game flag `paper:<key>` (so it resumes on
 * any device), each answer sheet is a notebook page, and the grader's words stay on this device.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Clock, X } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAiStatus, setAiCredits } from "@/components/learn/ai/useAiStatus";
import { useInkUser } from "@/lib/learn/ink/usePageAutosave";
import { createPage } from "@/lib/learn/ink/client";
import type { NotebookPage, Paper } from "@/lib/learn/ink/types";
import { track } from "@/lib/track";
import type { QuestionGrade } from "@/lib/learn/papers/grade";
import { gradeAnswer, inkErrorText, loadSheets, newAttemptId, paperNotebook, readDetails, sheetTitle, writeDetail } from "@/lib/learn/papers/client";
import {
  attemptResult,
  betterBest,
  PAPER_XP,
  paperDoneKey,
  paperFlagKey,
  paperLessonKey,
  readRecord,
  resultLine,
  type AttemptSummary,
  type OpenAttempt,
  type PaperMode,
  type PaperRecord,
  type PaperView,
  type QuestionMarks,
} from "@/lib/learn/papers/types";
import AnswerSheet, { type AnswerSheetHandle } from "./AnswerSheet";
import PaperResults, { QuestionResult } from "./PaperResults";
import { ScoreBadge } from "./PapersIndex";
import "./papers.css";

type Screen = "start" | "answer" | "grading" | "results";
type GradeJob = { n: number; state: "wait" | "run" | "done" | "fail" | "blank"; text?: string };

const MONO = "font-mono text-[11px] uppercase tracking-label";
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const marksOf = (g: QuestionGrade): QuestionMarks => ({ s: g.score, m: g.max, p: g.points.map((p) => p.awarded), g: g.blank ? "none" : g.model, c: g.credits });

export default function PaperApp({ paper }: { paper: PaperView }) {
  const { flags, setFlag, awardOnce, hydrated } = useGame();
  const { userId, loading: userLoading } = useInkUser();
  const { openAuthModal } = useAuthModal();
  const ai = useAiStatus();
  const fk = paperFlagKey(paper.key);
  const flagRec = readRecord(flags[fk]);
  // the record as last written here (handlers read it without waiting for a render); a newer copy from another device wins
  const recRef = useRef<PaperRecord>(flagRec);
  if (flagRec.updatedAt > recRef.current.updatedAt) recRef.current = flagRec;
  const rec = flagRec.updatedAt >= recRef.current.updatedAt ? flagRec : recRef.current;

  const save = useCallback(
    (fn: (r: PaperRecord) => PaperRecord) => {
      const next = { ...fn(recRef.current), updatedAt: Date.now() };
      recRef.current = next;
      setFlag(fk, next);
    },
    [fk, setFlag]
  );

  const [screen, setScreen] = useState<Screen>("start");
  const [now, setNow] = useState(() => Date.now());
  const [jobs, setJobs] = useState<GradeJob[]>([]);
  const [gradeErr, setGradeErr] = useState<string | null>(null);
  const [checking, setChecking] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<null | "finish" | "leave" | "restart">(null);
  const [details, setDetails] = useState<Record<number, QuestionGrade>>({});
  const [saveState, setSaveState] = useState("saved");
  const [xpGained, setXpGained] = useState(0);
  const [qOpen, setQOpen] = useState(true);
  const sheet = useRef<AnswerSheetHandle>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const finishing = useRef(false);

  const open = rec.open;
  const Q = paper.questions.length;
  const i = open ? Math.min(Math.max(0, open.i), Q - 1) : 0;
  const q = paper.questions[i];
  const deadline = open?.deadline ?? null;
  const left = deadline ? deadline - now : null;
  const timeUp = left !== null && left <= 0;

  // details (the grader's words) for the attempt on screen
  const attemptId = screen === "results" ? rec.last?.id : open?.id;
  useEffect(() => {
    setDetails(attemptId ? readDetails(attemptId) : {});
  }, [attemptId]);

  // ------------------------------------------------------------------ the clock and the full-screen view

  useEffect(() => {
    if (screen !== "answer" || !deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [screen, deadline]);

  useEffect(() => {
    if (screen !== "answer") return;
    const html = document.documentElement;
    html.classList.add("hk-ink-full");
    return () => html.classList.remove("hk-ink-full");
  }, [screen]);

  // leaving mid-exam: the clock keeps running, so the browser asks first
  useEffect(() => {
    if (screen !== "answer" || open?.mode !== "exam") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [screen, open?.mode]);

  const scrollTop = () => window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 30);

  // ------------------------------------------------------------------ attempt

  const setOpen = useCallback((fn: (o: OpenAttempt) => OpenAttempt) => save((r) => (r.open ? { ...r, open: fn(r.open) } : r)), [save]);

  const start = (mode: PaperMode) => {
    const at = Date.now();
    const o: OpenAttempt = { id: newAttemptId(), mode, startedAt: at, deadline: mode === "exam" ? at + paper.minutes * 60_000 : null, i: 0, pages: {}, marks: {}, version: paper.version };
    save((r) => ({ ...r, open: o }));
    setNow(at);
    setGradeErr(null);
    setXpGained(0);
    setScreen("answer");
    track("paper_start", { paper: paper.key, mode });
  };

  const resume = () => {
    setNow(Date.now());
    setGradeErr(null);
    setScreen("answer");
  };

  const goQ = async (k: number) => {
    if (!open || k < 0 || k >= Q || k === i) return;
    await sheet.current?.flush().catch(() => undefined);
    setOpen((o) => ({ ...o, i: k }));
  };

  const makeSheet = useCallback(
    async (n: number, s: number): Promise<NotebookPage> => {
      const o = recRef.current.open;
      if (!o) throw new Error("no attempt");
      const nb = await paperNotebook();
      return createPage(nb.id, { paper: paper.questions[n - 1]?.kind === "diagram" ? "grid" : "ruled", title: sheetTitle(paper.title, n, o.id, s), lessonKey: paperLessonKey(paper.key, n) });
    },
    [paper]
  );

  // ------------------------------------------------------------------ grading

  /** Grade one answer of the open attempt (or of the last attempt's pending ones). */
  const gradeOne = useCallback(
    async (n: number, attempt: string, pages: string[]): Promise<{ ok: true; grade: QuestionGrade } | { ok: false; error: string; retryable: boolean; status: string | null }> => {
      const qq = paper.questions[n - 1];
      const sheets = pages.length ? await loadSheets(pages) : [];
      const r = await gradeAnswer(
        paper.key,
        n,
        qq.marks,
        qq.scheme.map((p) => p.marks),
        sheets
      );
      if (!r.ok) return { ok: false, error: r.error, retryable: r.retryable, status: r.status };
      if (r.creditsLeft !== null) setAiCredits(r.creditsLeft);
      writeDetail(attempt, r.grade);
      return { ok: true, grade: r.grade };
    },
    [paper]
  );

  /** Practice: check the answer on screen. */
  const checkNow = async () => {
    if (!open || checking !== null) return;
    const n = q.n;
    setChecking(n);
    setGradeErr(null);
    try {
      await sheet.current?.flush();
      const pages = recRef.current.open?.pages[n] || [];
      const r = await gradeOne(n, open.id, pages);
      if (!r.ok) setGradeErr(r.error);
      else {
        setDetails((d) => ({ ...d, [n]: r.grade }));
        setOpen((o) => ({ ...o, marks: { ...o.marks, [n]: marksOf(r.grade) } }));
        track("paper_check", { paper: paper.key, q: n, score: r.grade.score, max: r.grade.max, model: r.grade.model });
      }
    } catch (e) {
      setGradeErr(inkErrorText(e, "Couldn't save your answer before grading. Try again."));
    } finally {
      setChecking(null);
    }
  };

  /** Grade a list of answers one by one (rate limits: wait and retry), returning the marks and what is still pending. */
  const gradeAll = useCallback(
    async (todo: { n: number; pages: string[] }[], attempt: string) => {
      const marks: Record<number, QuestionMarks> = {};
      const pending: number[] = [];
      let stop: string | null = null;
      setJobs(todo.map((t) => ({ n: t.n, state: "wait" })));
      const mark = (n: number, j: Partial<GradeJob>) => setJobs((js) => js.map((x) => (x.n === n ? { ...x, ...j } : x)));
      for (const t of todo) {
        if (stop) {
          pending.push(t.n);
          mark(t.n, { state: "fail", text: "not graded" });
          continue;
        }
        mark(t.n, { state: "run" });
        let r = await gradeOne(t.n, attempt, t.pages);
        for (let tries = 0; !r.ok && r.retryable && tries < 4; tries++) {
          mark(t.n, { state: "run", text: r.status === "rate_limited" ? "waiting a moment (grading limit)…" : "trying again…" });
          await sleep(r.status === "rate_limited" ? 20_000 : 4000);
          r = await gradeOne(t.n, attempt, t.pages);
        }
        if (r.ok) {
          marks[t.n] = marksOf(r.grade);
          setDetails((d) => ({ ...d, [t.n]: r.grade }));
          mark(t.n, { state: r.grade.blank ? "blank" : "done", text: `${r.grade.score}/${r.grade.max}` });
        } else {
          pending.push(t.n);
          stop = r.error;
          mark(t.n, { state: "fail", text: r.error });
        }
      }
      return { marks, pending, stop };
    },
    [gradeOne]
  );

  const summarize = (o: Pick<OpenAttempt, "id" | "mode" | "startedAt" | "pages" | "version">, marks: Record<number, QuestionMarks>, pending: number[]): AttemptSummary => {
    const all: Record<number, QuestionMarks> = {};
    for (const qq of paper.questions) {
      if (marks[qq.n]) all[qq.n] = marks[qq.n];
      else if (!pending.includes(qq.n)) all[qq.n] = { s: 0, m: qq.marks, p: qq.scheme.map(() => 0), g: "none", c: 0 };
    }
    const score = Object.values(all).reduce((a, m) => a + m.s, 0);
    return { id: o.id, mode: o.mode, startedAt: o.startedAt, finishedAt: Date.now(), score, max: paper.marks, pending, pages: o.pages, marks: all, version: o.version, credits: Object.values(all).reduce((a, m) => a + (m.c || 0), 0) };
  };

  const record = (last: AttemptSummary, first: boolean) => {
    save((r) => {
      // only a whole paper (an exam, or practice with every question answered) can be a best; a partial practice run is kept as the last result
      return { ...r, attempts: r.attempts + (first ? 1 : 0), last, open: null, best: betterBest(r.best, last) ? { score: last.score, max: last.max, at: last.finishedAt, attempt: last.id } : r.best };
    });
    const res = attemptResult(last);
    if (res.full && res.band !== "not-yet" && !last.pending.length) setXpGained(awardOnce(paperDoneKey(paper.key), PAPER_XP, `Written paper passed · ${paper.code}`));
  };

  /** Finish: save the sheet, grade every answer not graded yet, record the result. */
  const finish = useCallback(async () => {
    const o = recRef.current.open;
    if (!o || finishing.current) return;
    finishing.current = true;
    setConfirm(null);
    try {
      await sheet.current?.flush().catch(() => undefined);
      const cur = recRef.current.open || o;
      setScreen("grading");
      scrollTop();
      const todo = paper.questions.filter((qq) => (cur.pages[qq.n] || []).length && !cur.marks[qq.n]).map((qq) => ({ n: qq.n, pages: cur.pages[qq.n] }));
      const { marks, pending, stop } = await gradeAll(todo, cur.id);
      if (stop) setGradeErr(stop);
      const last = summarize(cur, { ...cur.marks, ...marks }, pending);
      record(last, true);
      track("paper_result", { paper: paper.key, mode: cur.mode, score: last.score, total: last.max, pending: pending.length });
      setScreen("results");
      scrollTop();
    } finally {
      finishing.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the record through recRef
  }, [paper, gradeAll]);

  // time's up in exam mode: the answers lock and the paper is graded
  useEffect(() => {
    if (screen === "answer" && timeUp && open?.mode === "exam") void finish();
  }, [screen, timeUp, open?.mode, finish]);

  const [gradingPending, setGradingPending] = useState(false);
  const gradePending = async () => {
    const last = recRef.current.last;
    if (!last || !last.pending.length) return;
    setGradingPending(true);
    setGradeErr(null);
    const todo = last.pending.map((n) => ({ n, pages: last.pages[n] || [] }));
    const { marks, pending, stop } = await gradeAll(todo, last.id);
    if (stop) setGradeErr(stop);
    const next = summarize(last, { ...last.marks, ...marks }, pending);
    record({ ...next, startedAt: last.startedAt, finishedAt: last.finishedAt }, false);
    setGradingPending(false);
  };

  const abandon = () => {
    save((r) => ({ ...r, open: null }));
    setConfirm(null);
    setScreen("start");
  };

  // ------------------------------------------------------------------ render

  const answered = (n: number) => (open?.pages[n] || []).length > 0;
  const unanswered = paper.questions.filter((qq) => !answered(qq.n)).length;
  const signedIn = !!userId;
  const aiOk = !!ai?.features["paper-grade"];

  if (screen === "answer" && open) {
    const exam = open.mode === "exam";
    const m = open.marks[q.n];
    const low = left !== null && left < 5 * 60_000;
    return (
      <div className="fixed inset-0 z-[70] flex flex-col bg-bg pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] pt-[env(safe-area-inset-top,0px)]">
        {/* top bar: leave, the paper, the questions, the clock, finish */}
        <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-2 py-1.5 sm:px-3">
          <button
            type="button"
            onClick={() => (exam ? setConfirm("leave") : void sheet.current?.flush().finally(() => setScreen("start")))}
            aria-label={exam ? "Leave the exam (the clock keeps running)" : "Leave practice (your answers are saved)"}
            className="grid h-11 w-11 shrink-0 place-items-center text-fg hover:bg-surface-2"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <span className="flex min-w-0 flex-[1_1_160px] flex-col leading-tight">
            <span className={`${MONO} truncate text-signal-text`}>
              {paper.code} · {exam ? "exam" : "practice"}
            </span>
            <span className="truncate text-[14px] font-semibold text-fg">{paper.ownerTitle}</span>
          </span>
          <nav aria-label="Questions" className="order-last flex w-full min-w-0 items-center gap-1 overflow-x-auto pb-0.5 min-[1100px]:order-none min-[1100px]:w-auto">
            {paper.questions.map((qq, k) => {
              const on = k === i;
              const g = open.marks[qq.n];
              return (
                <button
                  key={qq.n}
                  type="button"
                  onClick={() => void goQ(k)}
                  aria-current={on ? "step" : undefined}
                  aria-label={`Question ${qq.n}, ${qq.marks} marks${answered(qq.n) ? ", answered" : ""}${g ? `, graded ${g.s} of ${g.m}` : ""}`}
                  className={`flex h-11 min-w-11 shrink-0 flex-col items-center justify-center px-1.5 font-mono text-[12px] leading-none ${
                    on ? "bg-fg text-bg" : answered(qq.n) ? "border border-fg-3 text-fg" : "border border-dashed border-line-strong text-fg-3"
                  }`}
                >
                  <span className="font-semibold">Q{qq.n}</span>
                  <span className={`mt-0.5 text-[10px] ${on ? "text-bg/80" : g ? (g.s >= g.m / 2 ? "text-ok" : "text-bad-text") : "text-fg-4"}`}>{g ? `${g.s}/${g.m}` : `${qq.marks}m`}</span>
                </button>
              );
            })}
          </nav>
          {left !== null && (
            <span role="timer" aria-live="off" aria-label={`Time left ${mmss(left)}`} className={`flex h-11 shrink-0 items-center gap-1.5 px-2.5 font-mono text-[17px] tabular-nums ${low ? "bg-bad/15 text-bad-text" : "text-fg"}`}>
              <Clock className="h-4 w-4" aria-hidden />
              {mmss(left)}
            </span>
          )}
          <span className="hidden shrink-0 font-mono text-[11px] text-fg-4 sm:inline" aria-live="polite">
            {saveState === "saving" ? "saving…" : saveState === "pending" ? "editing…" : saveState === "offline" || saveState === "error" ? "kept on this device" : saveState === "draft" ? "" : "saved"}
          </span>
          <button type="button" onClick={() => setConfirm("finish")} className="min-h-11 shrink-0 bg-signal px-3.5 text-[14px] font-semibold text-on-signal hover:brightness-110">
            {exam ? "Finish paper" : "Finish"}
          </button>
        </header>
        {low && left! > 0 && <div className="shrink-0 bg-bad/10 px-3 py-1 text-center font-mono text-[12px] text-bad-text">Under 5 minutes left. Your answers lock and are graded when time is up.</div>}

        {/* the question above the sheet in portrait, beside it in landscape */}
        <div className="flex min-h-0 flex-1 flex-col min-[900px]:landscape:flex-row">
          <section
            aria-labelledby="paper-q"
            className={`flex min-h-0 shrink-0 flex-col border-b border-line bg-surface min-[900px]:landscape:w-[min(38%,480px)] min-[900px]:landscape:border-b-0 min-[900px]:landscape:border-r ${qOpen ? "max-h-[30vh] sm:max-h-[38vh] min-[900px]:landscape:max-h-none" : ""}`}
          >
            <div className="flex items-center justify-between gap-2 px-3 pt-2 sm:px-4">
              <h2 id="paper-q" className={`${MONO} m-0 text-signal-text`}>
                Question {q.n} of {Q} · {q.marks} marks · {q.kind}
              </h2>
              <button type="button" onClick={() => setQOpen((v) => !v)} aria-expanded={qOpen} className="min-h-11 px-2 font-mono text-[12px] text-fg-3 hover:text-fg min-[900px]:landscape:hidden">
                {qOpen ? "hide" : "show"}
              </button>
            </div>
              <div className={`min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4 ${qOpen ? "" : "hidden min-[900px]:landscape:block"}`}>
                <div className="paper-md pt-1 text-[16px] text-fg" dangerouslySetInnerHTML={{ __html: q.promptHtml }} />
                {!exam && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3">
                    {m ? (
                      <QuestionResult q={q} m={m} g={details[q.n]} compact />
                    ) : (
                      <p className="m-0 text-[13px] leading-snug text-fg-3">Write your answer on the sheet, then check it: each point of the marking scheme is marked, with what earned it.</p>
                    )}
                    {gradeErr && (
                      <p role="alert" className="m-0 text-[13px] text-bad-text">
                        {gradeErr}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void checkNow()}
                      disabled={checking !== null || !answered(q.n) || !aiOk}
                      className="min-h-12 bg-fg px-4 text-[15px] font-semibold text-bg disabled:opacity-40"
                    >
                      {checking === q.n ? "Checking your answer…" : m ? "Check again" : "Check this answer"}
                    </button>
                    {!aiOk && ai && <span className="text-[12px] text-fg-3">AI grading isn&apos;t available right now{ai.creditsLeft === 0 ? ": today's credits are used" : ""}. Your answers are saved.</span>}
                    {aiOk && ai?.creditsLeft !== null && ai?.creditsLeft !== undefined && <span className="text-[12px] text-fg-4">{ai.creditsLeft} credits left today · about 1 a check, up to ~20 when a stronger model double-checks</span>}
                  </div>
                )}
              </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-2 py-1.5 min-[900px]:landscape:px-3">
              <button type="button" onClick={() => void goQ(i - 1)} disabled={i === 0} className="flex min-h-11 items-center gap-1.5 px-2 text-[14px] text-fg disabled:opacity-30">
                <ArrowLeft className="h-4 w-4" aria-hidden /> {i > 0 ? `Q${i}` : "Back"}
              </button>
              <span className="font-mono text-[11px] text-fg-4">{unanswered ? `${unanswered} unanswered` : "all answered"}</span>
              {i < Q - 1 ? (
                <button type="button" onClick={() => void goQ(i + 1)} className="flex min-h-11 items-center gap-1.5 px-2 text-[14px] font-semibold text-fg">
                  Q{i + 2} <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                <button type="button" onClick={() => setConfirm("finish")} className="flex min-h-11 items-center gap-1.5 px-2 text-[14px] font-semibold text-signal-text">
                  Finish <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </section>
          <div className="relative min-h-0 flex-1">
            <AnswerSheet
              key={`${open.id}:${q.n}`}
              ref={sheet}
              ids={open.pages[q.n] || []}
              onIds={(ids) => setOpen((o) => ({ ...o, pages: { ...o.pages, [q.n]: ids } }))}
              make={(s) => makeSheet(q.n, s)}
              readOnly={timeUp}
              defaultPaper={(q.kind === "diagram" ? "grid" : "ruled") as Paper}
              label={`Answer to question ${q.n}`}
              onSave={setSaveState}
            />
          </div>
        </div>

        {confirm && (
          <div role="dialog" aria-modal="true" aria-labelledby="paper-confirm" className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4">
            <div className="flex w-full max-w-[440px] flex-col gap-4 border border-line-strong bg-bg p-5">
              <h2 id="paper-confirm" className="m-0 font-display text-[22px] font-bold text-fg">
                {confirm === "finish" ? (exam ? "Hand in the paper?" : "Finish practice?") : "Leave the exam?"}
              </h2>
              <p className="m-0 text-[15px] leading-relaxed text-fg-2">
                {confirm === "finish"
                  ? `${unanswered ? (exam ? `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered and score 0. ` : `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered: practice scores only the ones you answered. `) : ""}${exam || paper.questions.some((qq) => answered(qq.n) && !open.marks[qq.n]) ? "Every answer not graded yet is graded now, on your AI credits." : "Your result is saved."}`
                  : `The clock keeps running while you're away (${left !== null ? mmss(left) : ""} left). Your answers are saved; come back to this page to carry on.`}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" autoFocus onClick={() => setConfirm(null)} className="min-h-11 border border-line-strong px-4 text-[14px] text-fg">
                  {confirm === "finish" ? "Keep writing" : "Stay"}
                </button>
                {confirm === "finish" ? (
                  <button type="button" onClick={() => void finish()} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
                    {exam ? "Hand it in" : "Finish and see results"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirm(null);
                      void sheet.current?.flush().finally(() => setScreen("start"));
                    }}
                    className="min-h-11 bg-fg px-4 text-[14px] font-semibold text-bg"
                  >
                    Leave
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main ref={topRef} className="mx-auto flex max-w-[980px] flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
          <Link href="/learn/papers" className="hover:text-fg">
            Written papers
          </Link>
          <span aria-hidden>/</span>
          <Link href={paper.ownerHref} className="text-signal-text hover:text-fg">
            {paper.label}
          </Link>
        </nav>
        <h1 className="m-0 font-display text-[clamp(34px,6vw,60px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">{paper.title}</h1>
        <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[13px] text-fg-2">
          <span>{Q} questions</span>
          <span>{paper.marks} marks</span>
          <span>{paper.minutes} minutes</span>
          <span className="text-fg-3">
            {Object.entries(paper.kinds)
              .map(([k, n]) => `${n} ${k}`)
              .join(" · ")}
          </span>
        </p>
        {hydrated && (rec.best || rec.last) && <ScoreBadge rec={{ ...rec, open: null }} />}
      </header>

      {screen === "grading" && (
        <section aria-labelledby="grading-h" aria-live="polite" className="flex flex-col gap-4 border border-line-strong bg-surface p-5 sm:p-6">
          <h2 id="grading-h" className="m-0 font-display text-[26px] font-bold text-fg">
            Grading your answers…
          </h2>
          <p className="m-0 text-[14px] text-fg-3">Each answer is read and marked point by point. Drawn and borderline answers are double-checked by a stronger model, so they take a little longer.</p>
          <ol className="m-0 flex list-none flex-col gap-0 border border-line p-0">
            {jobs.map((j) => (
              <li key={j.n} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
                <span className="text-[15px] text-fg">Question {j.n}</span>
                <span className={`font-mono text-[13px] ${j.state === "done" ? "text-ok" : j.state === "fail" ? "text-bad-text" : "text-fg-3"}`}>
                  {j.state === "wait" ? "waiting" : j.state === "run" ? j.text || "reading…" : j.state === "blank" ? "blank · 0" : j.text}
                </span>
              </li>
            ))}
            {!jobs.length && <li className="px-3 py-2.5 text-[14px] text-fg-3">Everything was graded already.</li>}
          </ol>
        </section>
      )}

      {screen === "results" && rec.last ? (
        <>
          {gradeErr && (
            <p role="alert" className="m-0 border border-bad px-4 py-3 text-[14px] text-bad-text">
              {gradeErr}
            </p>
          )}
          <PaperResults paper={paper} last={rec.last} details={details} best={rec.best} xp={xpGained} onRetry={() => setScreen("start")} onGradePending={() => void gradePending()} grading={gradingPending} />
        </>
      ) : screen === "start" ? (
        <StartScreen
          paper={paper}
          rec={rec}
          hydrated={hydrated}
          signedIn={signedIn}
          userLoading={userLoading}
          aiOk={aiOk}
          creditsLeft={ai?.creditsLeft ?? null}
          now={now}
          onStart={(mode) => (rec.open ? setConfirm("restart") : start(mode))}
          onResume={resume}
          onResults={() => setScreen("results")}
          onSignIn={openAuthModal}
          onAbandon={abandon}
          confirmRestart={confirm === "restart"}
          onCancelRestart={() => setConfirm(null)}
        />
      ) : null}
    </main>
  );
}

function StartScreen(p: {
  paper: PaperView;
  rec: PaperRecord;
  hydrated: boolean;
  signedIn: boolean;
  userLoading: boolean;
  aiOk: boolean;
  creditsLeft: number | null;
  now: number;
  onStart: (m: PaperMode) => void;
  onResume: () => void;
  onResults: () => void;
  onSignIn: () => void;
  onAbandon: () => void;
  confirmRestart: boolean;
  onCancelRestart: () => void;
}) {
  const { paper, rec } = p;
  const open = rec.open;
  const [pick, setPick] = useState<PaperMode>("practice");
  const [tick, setTick] = useState(p.now);
  useEffect(() => {
    if (!open?.deadline) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open?.deadline]);
  const openLeft = open?.deadline ? open.deadline - tick : null;
  const answeredN = open ? Object.values(open.pages).filter((x) => x.length).length : 0;
  const card = (mode: PaperMode, title: string, lines: string[]) => (
    <label className={`flex min-h-11 cursor-pointer flex-col gap-2 border p-4 sm:p-5 ${pick === mode ? "border-signal bg-surface shadow-[0_0_0_3px_rgba(255,107,43,0.14)]" : "border-line-strong hover:border-fg-4"}`}>
      <span className="flex items-center gap-2.5">
        <input type="radio" name="paper-mode" value={mode} checked={pick === mode} onChange={() => setPick(mode)} className="h-5 w-5 accent-[var(--c-signal)]" />
        <span className="font-display text-[22px] font-bold text-fg">{title}</span>
      </span>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-snug text-fg-2">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </label>
  );
  return (
    <div className="flex flex-col gap-6">
      {p.hydrated && open && (
        <section aria-label="Attempt in progress" className="flex flex-wrap items-center justify-between gap-3 border border-signal bg-surface px-4 py-4 sm:px-5">
          <span className="flex min-w-0 flex-col gap-1">
            <span className={`${MONO} text-signal-text`}>{open.mode === "exam" ? "exam in progress" : "practice in progress"}</span>
            <span className="text-[15px] text-fg">
              {answeredN} of {paper.questions.length} answered
              {openLeft !== null ? (openLeft > 0 ? ` · ${mmss(openLeft)} left on the clock` : " · time is up: hand it in to see your marks") : ""}
            </span>
          </span>
          <span className="flex flex-wrap gap-2">
            <button type="button" onClick={p.onResume} className="min-h-12 bg-signal px-5 text-[15px] font-semibold text-on-signal">
              {openLeft !== null && openLeft <= 0 ? "Hand it in" : "Resume"}
            </button>
          </span>
        </section>
      )}
      {p.confirmRestart && open && (
        <div role="alert" className="flex flex-col gap-3 border border-bad px-4 py-4">
          <span className="text-[15px] text-fg">Start again? The attempt in progress is dropped (its sheets stay in your notebook).</span>
          <span className="flex flex-wrap gap-2">
            <button type="button" onClick={p.onAbandon} className="min-h-11 bg-fg px-4 text-[14px] font-semibold text-bg">
              Drop it
            </button>
            <button type="button" onClick={p.onCancelRestart} className="min-h-11 border border-line-strong px-4 text-[14px] text-fg">
              Keep it
            </button>
          </span>
        </div>
      )}

      <section aria-labelledby="mode-h" className="flex flex-col gap-3">
        <h2 id="mode-h" className={`${MONO} m-0 text-fg-3`}>
          How do you want to sit it?
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {card("practice", "Practice", ["No clock.", "Check each answer as you go and see what earned marks.", "Change it and check again (each check uses credits)."])}
          {card("exam", "Exam", [`${paper.minutes} minutes from the moment you start.`, "The clock keeps running if you leave.", "Answers lock when time is up; the whole paper is graded at the end."])}
        </div>
      </section>

      <section aria-labelledby="rules-h" className="flex flex-col gap-2 border border-line bg-surface px-4 py-4 sm:px-5">
        <h2 id="rules-h" className={`${MONO} m-0 text-fg-3`}>
          The rules
        </h2>
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-snug text-fg-2">
          <li>Answer by hand on the sheet: handwriting, numbers and diagrams. A pencil works best; a finger or a mouse works too. Typed text boxes count as well.</li>
          <li>One question at a time, up to 3 sheets an answer. Show your working: estimates earn marks for the steps.</li>
          <li>Marks come only from the marking scheme and only for what is on your sheet. Pass at 50%, distinction at 75%{p.hydrated && !rec.attempts ? `, +${PAPER_XP} XP the first time you pass` : ""}.</li>
          <li>Your sheets are saved as pages in your notebook (&ldquo;Written papers&rdquo;).</li>
          <li>Grading uses your AI credits: about 1 an answer; drawn or borderline answers are double-checked by a stronger model (Sonnet 5.5), which costs more (up to ~20).{p.creditsLeft !== null ? ` You have ${p.creditsLeft} left today.` : ""}</li>
        </ul>
      </section>

      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Questions">
        {paper.questions.map((q) => (
          <li key={q.n} className="border border-line px-2.5 py-1.5 font-mono text-[12px] text-fg-2">
            Q{q.n} · {q.kind} · {q.marks}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        {p.userLoading ? (
          <span className="font-mono text-[12px] text-fg-3">checking your sign-in…</span>
        ) : !p.signedIn ? (
          <>
            <button type="button" onClick={p.onSignIn} className="min-h-[52px] bg-signal px-6 text-[16px] font-semibold text-on-signal">
              Sign in to sit the paper
            </button>
            <span className="text-[14px] text-fg-3">Your answers are notebook pages, kept in your account.</span>
          </>
        ) : (
          <>
            <button type="button" onClick={() => p.onStart(pick)} className="min-h-[52px] bg-signal px-6 text-[16px] font-semibold text-on-signal hover:brightness-110">
              {pick === "exam" ? `Start the exam · ${paper.minutes} min` : "Start practice"}
            </button>
            {!p.aiOk && <span className="text-[13px] text-fg-3">AI grading is resting right now: you can write your answers and grade them later.</span>}
          </>
        )}
        {p.hydrated && rec.last && (
          <button type="button" onClick={p.onResults} className="min-h-[52px] border border-line-strong px-5 text-[15px] text-fg hover:bg-surface-2">
            Last result · {resultLine(attemptResult(rec.last))}
          </button>
        )}
      </div>
    </div>
  );
}

