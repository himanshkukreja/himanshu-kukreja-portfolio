"use client";

/**
 * The conversation: the learner's messages, the tutor's answers (citations as chips, then the sources as
 * cards), practice questions as cards with an answer box, learning paths as a step list with Save, and the
 * answer that is streaming in now. Every link is an index entry's own href, sent by the server.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { buildIcsForPath } from "./planIcs";
import SpeakButton from "./SpeakButton";
import { ArrowRight, Bookmark, CalendarPlus, Check, CircleHelp, Clock, Flag, Loader2, Mic, Route, Share2, ThumbsDown, ThumbsUp, X, Zap } from "lucide-react";
import { KIND_LABEL } from "@/lib/search/smart/types";
import { atClock } from "@/lib/search/smart/engine";
import { citedRefs, streamingText, type ChatSource } from "@/lib/ai/chat/text";
import ChatMarkdown from "./ChatMarkdown";
import SourceIcon from "./SourceIcon";
import type { ChatMsg, ChatStatus, Conversation, Rating } from "./useCourseChat";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const tagOf = (s: ChatSource) => (s.kind === "guide" ? "Site help" : KIND_LABEL[s.kind].tag);

function SourceCard({ s, n }: { s: ChatSource; n: number }) {
  return (
    <li className="min-w-0">
      <Link href={s.href} className="group flex min-w-0 items-start gap-2.5 border border-line bg-bg px-3 py-2.5 hover:border-fg-3">
        <span className="mt-0.5 grid h-5 min-w-5 shrink-0 place-items-center border border-line-strong font-mono text-[10.5px] font-semibold text-signal-text">{n}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-label text-fg-3">
            <SourceIcon kind={s.kind} className="h-3 w-3 text-signal-text" />
            {tagOf(s)}
            {s.kind === "moment" && s.at >= 0 && (
              <span className="inline-flex items-center gap-1 text-fg-2">
                <Clock className="h-3 w-3" aria-hidden />
                {atClock(s.at)}
              </span>
            )}
          </span>
          <span className="truncate text-[14px] font-semibold leading-snug text-fg group-hover:underline">{s.title}</span>
          {s.sub && <span className="truncate font-mono text-[11px] text-fg-4">{s.sub}</span>}
        </span>
      </Link>
    </li>
  );
}

function QuizCard({ conv, qref, onAnswer, busy }: { conv: Conversation; qref: string; onAnswer: (qref: string, answer: string) => void; busy: boolean }) {
  const q = conv.quizzes[qref];
  const [text, setText] = useState("");
  if (!q) return null;
  const answered = !!q.result || conv.messages.some((m) => m.answerTo === qref);
  const r = q.result;
  const from = q.from ? conv.sources[q.from] : null;
  return (
    <section aria-label={`Practice question ${qref}`} className="flex flex-col gap-3 border border-line-strong border-l-[3px] border-l-signal bg-surface p-4">
      <span className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        {q.kind === "mcq" ? "multiple choice" : q.kind === "drill" ? "interviewer follow-up" : "checkpoint"}
        <span className="normal-case tracking-normal text-fg-3">· {q.label}</span>
      </span>
      <div className="whitespace-pre-line text-[15.5px] leading-relaxed text-fg">{q.question.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1")}</div>
      {q.options ? (
        <div role="group" aria-label="Options" className="flex flex-col gap-1.5">
          {q.options.map((o, i) => {
            const L = LETTERS[i];
            const picked = r?.answer === L;
            const right = r?.correctLetter === L;
            return (
              <button
                key={L}
                type="button"
                disabled={answered || busy}
                onClick={() => onAnswer(qref, L)}
                className={`flex min-h-11 items-start gap-2.5 border px-3 py-2 text-left text-[14.5px] leading-snug ${
                  r ? (right ? "border-ok bg-ok/10 text-fg" : picked ? "border-bad bg-bad/10 text-fg" : "border-line text-fg-3") : "border-line-strong text-fg-2 hover:border-signal hover:text-fg disabled:opacity-60"
                }`}
              >
                <span className="font-mono text-[12px] font-bold text-signal-text">{L}</span>
                <span className="min-w-0 flex-1">{o.replace(/`([^`]+)`/g, "$1")}</span>
                {r && right && <Check className="h-4 w-4 shrink-0 text-ok" aria-label="correct answer" />}
                {r && picked && !right && <X className="h-4 w-4 shrink-0 text-bad" aria-label="your answer" />}
              </button>
            );
          })}
        </div>
      ) : answered ? (
        <p className="m-0 font-mono text-[12px] text-fg-3">answered · the tutor grades it against the course&apos;s own answer</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAnswer(qref, text.trim());
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor={`ans-${qref}`} className="sr-only">
            Your answer
          </label>
          <textarea
            id={`ans-${qref}`}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1500))}
            rows={3}
            placeholder="Your answer, in your own words"
            className="min-h-[84px] resize-y border border-line-strong bg-bg px-3 py-2 text-[15px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
          />
          <button type="submit" disabled={!text.trim() || busy} className="min-h-11 self-start bg-signal px-4 font-semibold text-on-signal disabled:opacity-50">
            Check my answer
          </button>
        </form>
      )}
      {from && (
        <Link href={from.href} className="self-start font-mono text-[11px] text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg">
          from {from.title}
        </Link>
      )}
    </section>
  );
}

function PathCardView({ conv, pref, onSave }: { conv: Conversation; pref: string; onSave: (pref: string) => void }) {
  const p = conv.paths[pref];
  if (!p) return null;
  const saved = p.saved === "saved" || p.saved === "updated";
  return (
    <section aria-label={`Learning path: ${p.title}`} className="flex flex-col gap-3 border border-line-strong bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
            <Route className="h-3.5 w-3.5" aria-hidden /> learning path · {p.steps.length} steps
          </span>
          <span className="font-display text-[19px] font-bold leading-tight text-fg">{p.title}</span>
          {p.note && <span className="border-l-2 border-signal pl-2 text-[13.5px] text-fg-2">{p.note}</span>}
        </span>
        {saved ? (
          <Link href="/learn/saved" className="inline-flex min-h-10 items-center gap-1.5 border border-ok px-3 font-mono text-[12px] text-fg">
            <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> {p.saved === "updated" ? "Updated" : "Saved"} · open
          </Link>
        ) : (
          <button type="button" onClick={() => onSave(pref)} className="inline-flex min-h-10 items-center gap-1.5 bg-signal px-3 font-mono text-[12px] font-semibold text-on-signal">
            <Bookmark className="h-3.5 w-3.5" aria-hidden /> Save path
          </button>
        )}
      </div>
      {p.plan && p.steps.some((x) => x.date) && (
        <button
          type="button"
          onClick={() => {
            const ics = buildIcsForPath(p, conv.sources);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
            a.download = `${p.title.replace(/[^\w-]+/g, "-").slice(0, 40) || "study-plan"}.ics`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          className="inline-flex min-h-10 items-center gap-1.5 self-start border border-line-strong px-3 font-mono text-[12px] text-fg-2 hover:text-fg"
        >
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Download calendar (.ics)
        </button>
      )}
      {p.saved === "full" && <p className="m-0 text-[13px] text-fg-3">You have the most saved paths there can be. Remove one under You → Saved paths, then save again.</p>}
      {p.saved === "failed" && <p className="m-0 text-[13px] text-fg-3">Couldn&apos;t save it just now. Try again in a moment.</p>}
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {p.steps.map((s, i) => {
          const src = conv.sources[s.ref];
          if (!src) return null;
          return (
            <li key={s.ref}>
              <Link href={src.href} className="group flex gap-3 border border-line bg-bg p-3 hover:border-fg-3">
                <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center bg-signal font-mono text-[13px] font-bold text-on-signal">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-label text-fg-3">
                    <SourceIcon kind={src.kind} className="h-3 w-3 text-signal-text" />
                    {tagOf(src)}
                    {src.kind === "moment" && src.at >= 0 && <span className="text-fg-2">{atClock(src.at)}</span>}
                  </span>
                  {s.date && <span className="font-mono text-[11px] text-signal-text">{new Date(`${s.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>}
                  <span className="text-[15px] font-semibold leading-snug text-fg">{src.title}</span>
                  {s.why && <span className="text-[13.5px] leading-snug text-fg-2">{s.why}</span>}
                </span>
                <ArrowRight className="mt-1 hidden h-4 w-4 shrink-0 text-fg-3 group-hover:text-fg sm:block" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export type ThreadActions = { feedback: boolean; share: boolean; onRate?: (callId: number, r: Omit<Rating, "sent">) => void };

function Assistant({ m, conv, onAnswer, onSave, busy, actions }: { m: ChatMsg; conv: Conversation; onAnswer: (q: string, a: string) => void; onSave: (p: string) => void; busy: boolean; actions: ThreadActions }) {
  const order = m.cites ?? citedRefs(m.text);
  const cited = order.map((r) => conv.sources[r]).filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      {m.mode === "interviewer" && <span className="font-mono text-[10.5px] uppercase tracking-label text-signal-text">interviewer{conv.mock ? ` · ${conv.mock.interviewer.split(",")[0]}` : ""}</span>}
      {m.text && m.mode === "scorecard" ? (
        <section aria-label="Interview scorecard" className="flex flex-col gap-2 border border-line-strong border-l-[3px] border-l-signal bg-surface p-4">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">scorecard</span>
          <ChatMarkdown text={m.text} sources={conv.sources} order={order} />
        </section>
      ) : (
        m.text && <ChatMarkdown text={m.text} sources={conv.sources} order={order} />
      )}
      {m.error && (
        <p role="status" className="m-0 border border-dashed border-line-strong px-3 py-2 text-[14px] text-fg-2">
          {m.error}
        </p>
      )}
      {(m.quizzes ?? []).map((q) => (
        <QuizCard key={q} conv={conv} qref={q} onAnswer={onAnswer} busy={busy} />
      ))}
      {(m.paths ?? []).map((p) => (
        <PathCardView key={p} conv={conv} pref={p} onSave={onSave} />
      ))}
      {cited.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-label text-fg-4">sources</span>
          <ul className="m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2">
            {cited.slice(0, 6).map((s, i) => (
              <SourceCard key={s.id} s={s} n={i + 1} />
            ))}
          </ul>
        </div>
      )}
      {m.text && !m.error && (
        <div className="flex flex-wrap items-center gap-1">
          <SpeakButton text={m.text} />
          {actions.feedback && m.callId ? <Feedback callId={m.callId} r={conv.ratings?.[m.callId]} onRate={actions.onRate} /> : null}
          {actions.share && m.mode !== "interviewer" && m.mode !== "scorecard" && <ShareAnswer m={m} conv={conv} />}
          {m.fast && (
            <span className="ml-1 inline-flex items-center gap-1 font-mono text-[10.5px] text-fg-4" title="After today's first messages, the chat answers with a faster model">
              <Zap className="h-3 w-3" aria-hidden /> fast mode
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** 👍 / 👎, and "this was wrong" with an optional note. */
function Feedback({ callId, r, onRate }: { callId: number; r?: Rating; onRate?: (callId: number, r: Omit<Rating, "sent">) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(r?.note ?? "");
  if (!onRate) return null;
  const btn = (on: boolean) => `grid h-8 w-8 place-items-center border ${on ? "border-signal text-signal-text" : "border-transparent text-fg-4 hover:text-fg"}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      <button type="button" aria-label="Helpful" aria-pressed={r?.rating === 1} onClick={() => onRate(callId, { rating: r?.rating === 1 ? 0 : 1, wrong: false, note: "" })} className={btn(r?.rating === 1)}>
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" aria-label="Not helpful" aria-pressed={r?.rating === -1} onClick={() => (onRate(callId, { rating: -1, wrong: !!r?.wrong, note: r?.note ?? "" }), setOpen(true))} className={btn(r?.rating === -1)}>
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" aria-label="This was wrong" aria-pressed={!!r?.wrong} title="This was wrong" onClick={() => (onRate(callId, { rating: r?.rating === 1 ? 0 : (r?.rating ?? 0), wrong: true, note: r?.note ?? "" }), setOpen(true))} className={btn(!!r?.wrong)}>
        <Flag className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onRate(callId, { rating: r?.rating ?? -1, wrong: !!r?.wrong, note: note.trim().slice(0, 500) });
            setOpen(false);
          }}
          className="flex w-full items-center gap-1.5 pt-1"
        >
          <label htmlFor={`fb-${callId}`} className="sr-only">
            What was wrong? (optional)
          </label>
          <input id={`fb-${callId}`} value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="What was wrong? (optional)" className="min-h-9 min-w-0 flex-1 border border-line-strong bg-bg px-2.5 text-[13px] text-fg placeholder:text-fg-4" />
          <button type="submit" className="min-h-9 border border-line-strong px-2.5 font-mono text-[11.5px] text-fg-2 hover:text-fg">
            send
          </button>
        </form>
      )}
      {r?.sent && !open && <span className="font-mono text-[10.5px] text-fg-4">thanks</span>}
    </span>
  );
}

/** Share an answer as a public page (POST /api/learn/share/answer; hidden for the session once it says it's off). */
let shareOff = false;
function ShareAnswer({ m, conv }: { m: ChatMsg; conv: Conversation }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "off">(shareOff ? "off" : "idle");
  if (state === "off") return null;
  const share = async () => {
    setState("busy");
    const i = conv.messages.indexOf(m);
    const question = [...conv.messages.slice(0, i)].reverse().find((x) => x.role === "user")?.text ?? "";
    const refs = m.cites ?? citedRefs(m.text);
    const cites = refs.map((r) => conv.sources[r]).filter(Boolean).map((s) => ({ id: s.id, kind: s.kind, title: s.title, sub: s.sub, href: s.href, at: s.at }));
    // the answer as text runs and citation numbers (an index into cites)
    const answerParts: (string | number)[] = [];
    for (const part of m.text.split(/(\[\[[^\]]+\]\])/)) {
      const g = /^\[\[([^\]]+)\]\]$/.exec(part);
      if (!g) {
        if (part) answerParts.push(part);
        continue;
      }
      for (const r of g[1].split(",").map((x) => x.trim().toLowerCase())) if (refs.includes(r)) answerParts.push(refs.indexOf(r));
    }
    const res = await aiFetch("/api/learn/share/answer", { method: "POST", body: JSON.stringify({ question, answerParts, cites }) }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { url?: string }) : {};
    if (!res || !res.ok || !body.url) {
      if (!res || [403, 404, 405, 501, 503].includes(res.status)) shareOff = true;
      setState(shareOff ? "off" : "idle");
      return;
    }
    try {
      if (navigator.share) await navigator.share({ url: body.url, title: question.slice(0, 80) });
      else await navigator.clipboard.writeText(body.url);
    } catch {
      /* dismissed */
    }
    setState("copied");
  };
  return (
    <button type="button" onClick={share} disabled={state === "busy"} aria-label="Share this answer" className="inline-flex h-8 items-center gap-1 px-1.5 font-mono text-[11px] text-fg-4 hover:text-fg">
      <Share2 className="h-3.5 w-3.5" aria-hidden />
      {state === "copied" ? "link copied" : "share"}
    </button>
  );
}

export default function ChatThread({
  conv,
  status,
  draft,
  onAnswer,
  onSave,
  actions = { feedback: false, share: true },
  mock,
}: {
  conv: Conversation;
  status: ChatStatus;
  draft: string;
  onAnswer: (qref: string, answer: string) => void;
  onSave: (pref: string) => void;
  actions?: ThreadActions;
  mock?: { onNext: () => void; onEnd: () => void; onLeave: () => void };
}) {
  const busy = status.kind !== "idle";
  const last = conv.messages[conv.messages.length - 1];
  return (
    <ol className="m-0 flex list-none flex-col gap-6 p-0" aria-label="Conversation">
      {conv.messages.map((m) => {
        const pending = busy && m === last && m.role === "assistant" && !m.text && !m.error;
        return (
          <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex flex-col"}>
            {m.role === "user" ? (
              <div className="max-w-[88%] whitespace-pre-wrap border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[15px] leading-relaxed text-fg">
                {m.answerTo && <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-label text-fg-3">my answer</span>}
                {m.mockPhase && <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-label text-fg-3">to the interviewer</span>}
                {m.text}
              </div>
            ) : pending ? (
              <div className="flex flex-col gap-3" aria-live="polite" aria-busy={status.kind === "streaming" ? "true" : "false"}>
                {(m.quizzes ?? []).map((q) => (
                  <QuizCard key={q} conv={conv} qref={q} onAnswer={onAnswer} busy />
                ))}
                {(m.paths ?? []).map((p) => (
                  <PathCardView key={p} conv={conv} pref={p} onSave={onSave} />
                ))}
                {draft ? (
                  <ChatMarkdown text={streamingText(draft, (r) => !!conv.sources[r])} sources={conv.sources} order={citedRefs(draft)} />
                ) : (
                  <p className="m-0 flex items-center gap-2 font-mono text-[12.5px] text-fg-3">
                    <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
                    {status.kind === "working" ? status.label : "writing…"}
                  </p>
                )}
              </div>
            ) : (
              <Assistant m={m} conv={conv} onAnswer={onAnswer} onSave={onSave} busy={busy} actions={actions} />
            )}
          </li>
        );
      })}
      {conv.mock && mock && (
        <li>
          <MockBar conv={conv} busy={busy} {...mock} />
        </li>
      )}
    </ol>
  );
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** The mock interview's phase, its clock against the phase budget, and next / end / leave. */
function MockBar({ conv, busy, onNext, onEnd, onLeave }: { conv: Conversation; busy: boolean; onNext: () => void; onEnd: () => void; onLeave: () => void }) {
  const m = conv.mock!;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (m.status !== "live") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [m.status]);
  const p = m.phases[m.phase];
  const used = Math.max(0, (now - m.phaseAt) / 1000);
  const over = p && used > p.minutes * 60;
  if (m.status === "scored")
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2 font-mono text-[12px] text-fg-3">
        <span>
          <Mic className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
          {m.title}: scored. Practise the gaps, then try it again.
        </span>
        <button type="button" onClick={onLeave} className="min-h-9 border border-line-strong px-2.5 text-fg-2 hover:text-fg">
          back to the tutor
        </button>
      </div>
    );
  return (
    <section aria-label="Mock interview" className="flex flex-col gap-2 border border-signal bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Mic className="h-3.5 w-3.5" aria-hidden /> mock · {m.company}
        </span>
        <span className={`font-mono text-[12px] ${over ? "text-bad-text" : "text-fg-2"}`} aria-label={`Phase time ${mmss(used)} of ${p?.minutes ?? 0} minutes`}>
          {mmss(used)} / {p?.minutes ?? 0}:00
        </span>
      </div>
      <span className="text-[14px] text-fg">
        Phase {m.phase + 1} of {m.phases.length}: <strong className="font-semibold">{p?.title}</strong>
        <span className="text-fg-3"> · answer in the box below, like you would say it</span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {m.phase < m.phases.length - 1 && (
          <button type="button" disabled={busy} onClick={onNext} className="min-h-9 border border-line-strong px-2.5 font-mono text-[12px] text-fg hover:border-fg-3 disabled:opacity-50">
            next phase →
          </button>
        )}
        <button type="button" disabled={busy} onClick={onEnd} className="min-h-9 bg-signal px-2.5 font-mono text-[12px] font-semibold text-on-signal disabled:opacity-50">
          end and score me
        </button>
        <button type="button" disabled={busy} onClick={onLeave} className="min-h-9 px-2.5 font-mono text-[12px] text-fg-3 hover:text-fg">
          leave the interview
        </button>
      </span>
    </section>
  );
}
