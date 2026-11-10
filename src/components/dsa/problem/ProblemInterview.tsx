"use client";

/**
 * The problem room's Interview tab (owner, 10 Nov 2026): the AI plays an interviewer, because in interviews solving the
 * question is not enough; explaining it through follow-ups is what lands the job. Rules and shapes: src/lib/dsa/interview.ts.
 *
 *   While solving (not accepted, editorial locked)  "Explain your approach", 5 questions, never a spoiler (the server
 *                                                    picks this stage itself from the learner's rows and sends no solution)
 *   After a solve or an unlocked editorial          "Follow-up round", 4 follow-ups grounded in the editorial
 *
 * Answers are typed, dictated (the composer's mic fills the box first) or given as code ("Answer with my code" sends the
 * editor's code). A round ends in a scorecard: Bits (15, 25 when it scores 4 or more, once per problem and stage), the
 * round saved to the account (game flag dsa:iv:<problem>), and each follow-up answered weakly becomes a revise card.
 * Nothing is sent until the learner presses Start or sends an answer. A round in progress is kept on this device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Code2, History, LogIn, Maximize2, MessageSquareQuote, Minimize2, Mic, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useGame } from "@/game/GameProvider";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import ChatComposer from "@/components/learn/chat/ChatComposer";
import ChatMarkdown from "@/components/learn/chat/ChatMarkdown";
import { ChatFinePrint, DSA_PRIVACY, QuotaLine } from "@/components/learn/chat/ChatMeta";
import { useDsaAward } from "@/components/dsa/rewards/useDsaBits";
import type { ChatQuota } from "@/lib/ai/chat/text";
import { addReviewCard } from "@/lib/learn/review";
import {
  addRound,
  DIM_LABEL,
  DIMS,
  lastRoundLine,
  readRecord,
  recordKey,
  STAGE_QUESTIONS,
  STAGE_TITLE,
  ago,
  VERDICT_LABEL,
  VERDICT_LINE,
  weakCards,
  type Feedback,
  type InterviewStage,
  type Question,
  type Round,
  type Scorecard,
  type Turn,
  interviewStage,
} from "@/lib/dsa/interview";
import { awardKeys, BITS_TABLE, eventBits, interviewBits } from "@/lib/dsa/rewards";
import type { DsaLang, ProblemPage } from "@/lib/dsa/types";
import { track } from "@/lib/track";

type Props = {
  p: ProblemPage;
  lang: DsaLang;
  /** the editor's code right now */
  code: () => string;
  /** accepted (a solve on record, or an Accepted submit this visit) */
  accepted: boolean;
  /** the editorial is open for this learner (solved, three failed submits or revealed) */
  unlocked: boolean;
  /** the last submit was Accepted in this visit: the server re-reads the solve */
  justSolved: boolean;
};

type Live = {
  stage: InterviewStage;
  turns: Turn[];
  current: Question | null;
  status: "live" | "done";
  card: Scorecard | null;
  saved: { bits: number; cards: number } | null;
  at: number;
};

const API = "/api/learn/ai/dsa/interview";
const BTN = "inline-flex min-h-9 items-center gap-1.5 px-1.5 font-mono text-[11.5px] text-fg-3 hover:text-fg disabled:opacity-50 [@media(pointer:coarse)]:min-h-11";
const LABEL = "font-mono text-[11px] uppercase tracking-label";

const liveKey = (uid: string, id: string) => `hk.dsaiv.${uid}.${id}`;
function readLive(key: string): Live | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) || "null") as Live | null;
    return v && Array.isArray(v.turns) && (v.stage === "explain" || v.stage === "followup") ? v : null;
  } catch {
    return null;
  }
}
function writeLive(key: string, v: Live | null) {
  try {
    if (v) window.localStorage.setItem(key, JSON.stringify(v));
    else window.localStorage.removeItem(key);
  } catch {
    /* storage blocked: the round just isn't kept across a reload */
  }
}

function Dots({ total, answered }: { total: number; answered: number }) {
  return (
    <ol aria-hidden className="m-0 flex list-none gap-1 p-0">
      {Array.from({ length: total }, (_, i) => (
        <li key={i} className={`h-1.5 w-5 sm:w-7 ${i < answered ? "bg-signal" : i === answered ? "border border-signal bg-signal/20" : "border border-line-strong bg-surface-2"}`} />
      ))}
    </ol>
  );
}

function Bubble({ who, topic, children }: { who: "sam" | "you"; topic?: string; children: React.ReactNode }) {
  const sam = who === "sam";
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${sam ? "items-start" : "items-end"}`}>
      <span className={`${LABEL} ${sam ? "text-signal-text" : "text-fg-3"}`}>{sam ? `Sam, interviewer${topic ? ` · ${topic}` : ""}` : "You"}</span>
      <div className={`max-w-full min-w-0 break-words border px-3 py-2.5 text-[14.5px] leading-relaxed ${sam ? "border-line-strong bg-surface text-fg" : "border-signal/50 bg-surface-2 text-fg"}`}>{children}</div>
    </div>
  );
}

function FeedbackCard({ f, score }: { f: Feedback; score: number }) {
  const rows: [string, string, string][] = [
    ["What was strong", f.strong, "text-ok-text"],
    ["What was missing", f.missing, "text-fg-2"],
    ["A better answer", f.better, "text-signal-text"],
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2 border border-line bg-bg px-3 py-2.5">
      <span className={`${LABEL} flex items-center gap-2 text-fg-3`}>
        Feedback <span className="border border-line-strong px-1.5 py-px text-fg">{score}/5</span>
      </span>
      {rows.map(([h, t, c]) =>
        t ? (
          <div key={h} className="flex min-w-0 flex-col gap-0.5">
            <span className={`font-mono text-[11px] ${c}`}>{h}</span>
            <div className="break-words text-[14px] leading-relaxed text-fg-2">
              <ChatMarkdown text={t} />
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}

function ScorecardView({ card, stage, saved }: { card: Scorecard; stage: InterviewStage; saved: Live["saved"] }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 border-2 border-signal bg-surface p-4" data-interview-scorecard>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-display text-[44px] font-extrabold leading-none tracking-[-0.03em] text-fg">
          {card.overall.toFixed(1)}
          <span className="text-[20px] font-bold text-fg-3"> / 5</span>
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={`${LABEL} text-fg-3`}>{STAGE_TITLE[stage]} · verdict</span>
          <span className="font-display text-[22px] font-bold text-fg">{VERDICT_LABEL[card.verdict]}</span>
        </div>
      </div>
      <p className="m-0 text-[14px] leading-relaxed text-fg-2">
        {VERDICT_LINE[card.verdict]} {card.summary}
      </p>
      <dl className="m-0 flex flex-col gap-2">
        {DIMS.map((d) => (
          <div key={d} className="flex flex-col gap-1">
            <dt className="flex items-baseline justify-between gap-3 text-[13.5px] text-fg-2">
              <span>{DIM_LABEL[d]}</span>
              <span className="font-mono tabular-nums text-fg">{card.scores[d]}/5</span>
            </dt>
            <dd aria-hidden className="m-0 h-1.5 bg-surface-2">
              <div className="h-1.5 bg-signal" style={{ width: `${card.scores[d] * 20}%` }} />
            </dd>
          </div>
        ))}
      </dl>
      {card.practise.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={`${LABEL} text-fg-3`}>What to practise next</span>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-relaxed text-fg-2">
            {card.practise.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {saved && (saved.bits > 0 || saved.cards > 0) && (
        <p className="m-0 font-mono text-[12px] text-signal-text">
          {saved.bits > 0 ? `+${saved.bits} Bits` : ""}
          {saved.bits > 0 && saved.cards > 0 ? " · " : ""}
          {saved.cards > 0 ? `${saved.cards} follow-up${saved.cards === 1 ? "" : "s"} added to Revise` : ""}
        </p>
      )}
    </div>
  );
}

function RoundRow({ r }: { r: Round }) {
  return (
    <li className="border border-line bg-surface">
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden">
          <span className="font-mono text-[13px] font-semibold tabular-nums text-fg">{r.overall.toFixed(1)}</span>
          <span className="text-[13.5px] text-fg-2">{VERDICT_LABEL[r.verdict]}</span>
          <span className="font-mono text-[11.5px] text-fg-3">
            {STAGE_TITLE[r.stage]} · {ago(r.at)}
          </span>
          <ChevronDown className="ml-auto h-4 w-4 text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="flex flex-col gap-2 border-t border-line px-3 py-2.5 text-[13.5px] text-fg-2">
          {r.summary && <p className="m-0 leading-relaxed">{r.summary}</p>}
          <ul className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-0.5 p-0 min-[420px]:grid-cols-2">
            {DIMS.map((d) => (
              <li key={d} className="flex justify-between gap-2">
                <span>{DIM_LABEL[d]}</span>
                <span className="font-mono tabular-nums text-fg">{r.scores[d]}/5</span>
              </li>
            ))}
          </ul>
          {r.practise.length > 0 && <p className="m-0 text-fg-3">Practise: {r.practise.join(" · ")}</p>}
        </div>
      </details>
    </li>
  );
}

export default function ProblemInterview({ p, lang, code, accepted, unlocked, justSolved }: Props) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const ai = useAiStatus();
  const { flags, done, setFlag } = useGame();
  const { grant } = useDsaAward();
  const canChat = !!user && !!ai?.features["dsa-tutor"];
  const uid = user?.id ?? null;

  // the server's stage when it differs from ours (a 409), good only while accepted / unlocked stay as they were
  const gate = `${accepted}:${unlocked}`;
  const [fix, setFix] = useState<{ gate: string; stage: InterviewStage } | null>(null);
  const stage = fix && fix.gate === gate ? fix.stage : interviewStage({ accepted, unlocked });
  // a round in progress is kept on this device: read once per learner and problem, then held in state
  const lk = uid ? liveKey(uid, p.id) : null;
  const stored = useMemo(() => (lk ? readLive(lk) : null), [lk]);
  const [held, setHeld] = useState<{ k: string; v: Live | null } | null>(null);
  const live = held && held.k === lk ? held.v : stored;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "start" | "answer" | "score">(null);
  const [error, setError] = useState("");
  const [quota, setQuota] = useState<ChatQuota | null>(null);
  const [wide, setWide] = useState(false);
  const [showRounds, setShowRounds] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const flagsRef = useRef(flags);
  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  const keep = useCallback(
    (v: Live | null) => {
      if (!lk) return;
      setHeld({ k: lk, v });
      writeLive(lk, v);
    },
    [lk],
  );

  useEffect(() => {
    if (!canChat) return;
    let off = false;
    aiFetch(API)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => !off && b?.quota && setQuota(b.quota))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [canChat]);

  useEffect(() => {
    if (!wide) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setWide(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide]);

  useEffect(() => {
    const el = scroller.current;
    if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
  }, [live?.turns.length, live?.current?.q, live?.status, busy]);

  const record = readRecord(flags[recordKey(p.id)]);
  const rounds = record?.rounds ?? [];
  const earned = eventBits(done, awardKeys.interview(stage, p.id)) >= 0;

  /** One call to the interviewer. Returns the JSON, or sets the error. */
  const call = async (action: "start" | "answer" | "score", extra: Record<string, unknown> = {}) => {
    setError("");
    try {
      const res = await aiFetch(API, { method: "POST", body: JSON.stringify({ problemId: p.id, lang, action, stage, justSolved, ...extra }) });
      const b = (await res.json().catch(() => ({}))) as { error?: string; stage?: InterviewStage; quota?: ChatQuota | null; turn?: { feedback: Feedback | null; score: number | null; next: Question | null }; scorecard?: Scorecard };
      if (b.quota) setQuota(b.quota);
      if (!res.ok) {
        if (res.status === 409 && b.stage) setFix({ gate, stage: b.stage });
        setError(b.error || "The interviewer didn't answer this time. Try again in a moment.");
        return null;
      }
      return b;
    } catch {
      setError("The interviewer didn't answer this time. Check your connection and try again.");
      return null;
    }
  };

  const start = async () => {
    if (!canChat || busy) return;
    setBusy("start");
    track("dsa_interview", { problem: p.id, stage, action: "start" });
    const b = await call("start");
    setBusy(null);
    if (b?.turn?.next) keep({ stage, turns: [], current: b.turn.next, status: "live", card: null, saved: null, at: Date.now() });
  };

  const answer = async (withCode: boolean) => {
    if (!live?.current || busy) return;
    const a = text.trim();
    if (!withCode && !a) return;
    const src = withCode ? code() : "";
    if (withCode && !src.trim()) return setError("The editor is empty: change your code first, then answer with it.");
    const cur = live.current;
    setBusy("answer");
    track("dsa_interview", { problem: p.id, stage: live.stage, action: withCode ? "answer_code" : "answer", step: live.turns.length + 1 });
    const b = await call("answer", {
      step: live.turns.length + 1,
      question: cur.q,
      answer: a,
      code: src,
      turns: live.turns.map((t) => ({ q: t.q, a: t.a, withCode: t.withCode, score: t.score, feedback: t.feedback })),
    });
    setBusy(null);
    if (!b?.turn?.feedback || b.turn.score === null) return;
    setText("");
    const turn: Turn = { q: cur.q, topic: cur.topic, a: a || "(my code)", withCode, score: b.turn.score, feedback: b.turn.feedback };
    keep({ ...live, turns: [...live.turns, turn], current: b.turn.next });
  };

  /** End the round: the scorecard, then Bits, the saved round and the revise cards (once). */
  const finish = async () => {
    if (!live || busy) return;
    if (!live.turns.length) return keep(null);
    setBusy("score");
    track("dsa_interview", { problem: p.id, stage: live.stage, action: "score", answered: live.turns.length });
    const b = await call("score", { step: live.turns.length, turns: live.turns.map((t) => ({ q: t.q, a: t.a, withCode: t.withCode, score: t.score, feedback: t.feedback })) });
    setBusy(null);
    const card = b?.scorecard;
    if (!card) return;
    const at = Date.now();
    const round: Round = { at, stage: live.stage, answered: live.turns.length, scores: card.scores, overall: card.overall, verdict: card.verdict, summary: card.summary, practise: card.practise };
    setFlag(recordKey(p.id), addRound(flagsRef.current[recordKey(p.id)], round, p.concept, at));
    const bits = grant(awardKeys.interview(live.stage, p.id), interviewBits(card.overall), "Interview round", { upgrade: true });
    const cards = weakCards({ stage: live.stage, problem: p.id, title: p.title, concept: p.concept, module: p.module }, live.turns);
    let added = 0;
    for (const c of cards) {
      const r = await addReviewCard(c);
      if (r.ok && !r.duplicate) added++;
    }
    keep({ ...live, status: "done", card, saved: { bits, cards: added }, at });
  };

  const answered = live?.turns.length ?? 0;
  const total = live ? STAGE_QUESTIONS[live.stage] : STAGE_QUESTIONS[stage];

  if (!user)
    return (
      <div className="flex flex-col gap-3 border border-line bg-surface p-5">
        <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden /> interview
        </p>
        <p className="m-0 text-[15px] leading-relaxed text-fg">
          In a real interview, solving the problem is not enough: you explain it and handle follow-ups. Practise that here with an AI interviewer, and get a scorecard.
        </p>
        <button type="button" onClick={openAuthModal} className="inline-flex min-h-11 items-center gap-2 self-start bg-signal px-4 text-[15px] font-semibold text-on-signal">
          <LogIn className="h-4 w-4" aria-hidden /> Sign in free to practise
        </button>
      </div>
    );

  const roundsList =
    rounds.length > 0 ? (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => setShowRounds((v) => !v)} aria-expanded={showRounds} className={`${BTN} self-start`}>
          <History className="h-3.5 w-3.5" aria-hidden /> earlier rounds ({rounds.length})
        </button>
        {showRounds && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {[...rounds].reverse().map((r) => (
              <RoundRow key={r.at} r={r} />
            ))}
          </ul>
        )}
      </div>
    ) : null;

  return (
    <>
      {wide && <div aria-hidden className="fixed inset-0 z-[60] bg-black/40" onClick={() => setWide(false)} />}
      <div
        className={
          wide
            ? "fixed inset-x-0 bottom-0 top-[var(--hk-header-h,61px)] z-[61] flex flex-col border border-line-strong bg-surface shadow-2xl sm:inset-x-[max(16px,calc(50vw-500px))] sm:bottom-4 sm:top-[calc(var(--hk-header-h,61px)+16px)]"
            : "flex h-[min(80dvh,760px)] min-h-[480px] flex-col border border-line-strong bg-surface lg:h-[calc(100dvh-var(--hk-header-h,61px)-150px)] lg:min-h-[560px]"
        }
        role={wide ? "dialog" : undefined}
        aria-modal={wide || undefined}
        aria-label={wide ? "Interview" : undefined}
        data-dsa-interview
      >
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-signal-text">
            <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden /> interview
            {ai?.preview && <span className="border border-line-strong px-1 text-fg-3">admin preview</span>}
          </span>
          {canChat && <QuotaLine quota={quota} />}
          <button type="button" onClick={() => setWide((w) => !w)} aria-pressed={wide} className={`${BTN} ml-auto`}>
            {wide ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
            {wide ? "close" : "expand"}
          </button>
          {live?.status === "live" && (
            <button type="button" onClick={() => void finish()} disabled={!!busy} className={BTN}>
              {answered ? "end round" : "cancel round"}
            </button>
          )}
          {live?.status === "done" && (
            <button type="button" onClick={() => keep(null)} className={BTN}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> new round
            </button>
          )}
        </div>

        {live && live.status === "live" && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
            <span className="font-mono text-[12px] font-semibold text-fg">
              {STAGE_TITLE[live.stage]} · Question {Math.min(answered + 1, total)} of {total}
            </span>
            <Dots total={total} answered={answered} />
          </div>
        )}

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-4 px-3 py-4 sm:px-4">
            {!canChat ? (
              <p className="m-0 text-[14px] text-fg-3">{ai ? "The interviewer is resting right now. Run, Submit and the hint ladder still work." : "Checking the interviewer…"}</p>
            ) : !live ? (
              <div className="flex flex-col gap-3.5">
                <h2 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">{STAGE_TITLE[stage]}</h2>
                {stage === "explain" ? (
                  <>
                    <p className="m-0 text-[14.5px] leading-relaxed text-fg-2">
                      A real interviewer asks what you will do before you code. Sam asks {STAGE_QUESTIONS.explain} questions, one at a time: restate the problem and ask about the input, your approach, its time and space cost, the edge cases you will handle, and why it works.
                    </p>
                    <p className="m-0 text-[14px] leading-relaxed text-fg-3">Sam reacts and probes, but never gives the solution away. Solve the problem, then come back for a round of follow-ups.</p>
                  </>
                ) : (
                  <>
                    <p className="m-0 text-[14.5px] leading-relaxed text-fg-2">
                      Solving it is half the job. Sam asks {STAGE_QUESTIONS.followup} follow-ups that real interviewers ask about this problem: a changed constraint, an optimisation, a proof, an edge case or trade-off, and a variation.
                    </p>
                    <p className="m-0 text-[14px] leading-relaxed text-fg-3">Some ask you to change your code: edit it in the editor, then press &quot;Answer with my code&quot;.</p>
                  </>
                )}
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13.5px] text-fg-2">
                  <li className="flex items-start gap-2">
                    <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-text" aria-hidden /> Type your answers, or tap the mic and speak: you see the text before you send it.
                  </li>
                  <li className="flex items-start gap-2">
                    <Code2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-text" aria-hidden /> Each answer gets short feedback, then the next question. At the end: a scorecard.
                  </li>
                </ul>
                <p className="m-0 text-[13px] text-fg-3">
                  Finish a round for {BITS_TABLE.interviewRound} Bits, {BITS_TABLE.interviewRound + BITS_TABLE.interviewStrong} if you score 4 or more (once per problem for this round).{earned ? " You have earned it here already." : ""}
                </p>
                {rounds.length > 0 && <p className="m-0 font-mono text-[12.5px] text-signal-text">{lastRoundLine(rounds)}</p>}
                {error && (
                  <p role="alert" className="m-0 text-[13.5px] text-bad-text">
                    {error}
                  </p>
                )}
                <button type="button" onClick={() => void start()} disabled={!!busy} className="inline-flex min-h-11 items-center gap-2 self-start bg-signal px-5 font-mono text-[13.5px] font-semibold text-on-signal disabled:opacity-60">
                  {busy === "start" ? "Sam is joining…" : "Start"}
                </button>
                {roundsList}
              </div>
            ) : (
              <>
                {live.turns.map((t, i) => (
                  <div key={i} className="flex flex-col gap-2.5">
                    <Bubble who="sam" topic={t.topic}>
                      <ChatMarkdown text={t.q} />
                    </Bubble>
                    <Bubble who="you">
                      <span className="whitespace-pre-wrap">{t.a}</span>
                      {t.withCode && <span className="mt-1 block font-mono text-[11px] text-fg-3">with the code from my editor</span>}
                    </Bubble>
                    <FeedbackCard f={t.feedback} score={t.score} />
                  </div>
                ))}
                {live.status === "live" && live.current && (
                  <Bubble who="sam" topic={live.current.topic}>
                    <ChatMarkdown text={live.current.q} />
                    {live.current.wantsCode && <span className="mt-1.5 block font-mono text-[11.5px] text-signal-text">Change your code in the editor, then press &quot;Answer with my code&quot;.</span>}
                  </Bubble>
                )}
                {live.status === "live" && !live.current && !busy && (
                  <div className="flex flex-col items-start gap-2 border border-line bg-bg px-3 py-3">
                    <span className="text-[14px] text-fg-2">That was the last question. Ready for your scorecard?</span>
                    <button type="button" onClick={() => void finish()} className="inline-flex min-h-11 items-center bg-signal px-4 font-mono text-[13.5px] font-semibold text-on-signal">
                      See my scorecard
                    </button>
                  </div>
                )}
                {busy && (
                  <p role="status" aria-live="polite" className="m-0 animate-pulse font-mono text-[12.5px] text-fg-3">
                    {busy === "score" ? "Sam is writing your scorecard…" : "Sam is reading your answer…"}
                  </p>
                )}
                {error && (
                  <p role="alert" className="m-0 text-[13.5px] text-bad-text">
                    {error}
                  </p>
                )}
                {live.status === "done" && live.card && (
                  <>
                    <ScorecardView card={live.card} stage={live.stage} saved={live.saved} />
                    <button type="button" onClick={() => keep(null)} className="inline-flex min-h-11 items-center gap-2 self-start bg-signal px-4 font-mono text-[13.5px] font-semibold text-on-signal">
                      <RotateCcw className="h-4 w-4" aria-hidden /> New round
                    </button>
                    {roundsList}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {canChat && live?.status === "live" && live.current && (
          <div className="flex shrink-0 flex-col gap-1.5 border-t border-line px-3 pb-2 pt-2.5">
            <ChatComposer
              id={`dsa-interview-${p.id}`}
              value={text}
              onChange={setText}
              onAsk={() => void answer(false)}
              busy={!!busy}
              canAsk
              compact
              placeholder={live.current.wantsCode ? "Add a note about your change (optional)…" : "Type your answer, or tap the mic and speak it…"}
              tools={
                live.stage === "followup" ? (
                  <button
                    type="button"
                    onClick={() => void answer(true)}
                    disabled={!!busy}
                    title="Sends the code in the editor with your answer"
                    className={`inline-flex min-h-10 items-center gap-1.5 self-start border px-2.5 font-mono text-[12px] disabled:opacity-40 [@media(pointer:coarse)]:min-h-11 ${live.current.wantsCode ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:border-signal hover:text-fg"}`}
                  >
                    <Code2 className="h-3.5 w-3.5" aria-hidden /> Answer with my code
                  </button>
                ) : undefined
              }
            />
            <ChatFinePrint memory={null} privacy={DSA_PRIVACY} />
          </div>
        )}
        {canChat && (!live || live.status === "done" || !live.current) && (
          <div className="shrink-0 border-t border-line px-3 pb-2 pt-1.5">
            <ChatFinePrint memory={null} privacy={DSA_PRIVACY} />
          </div>
        )}
      </div>
    </>
  );
}
