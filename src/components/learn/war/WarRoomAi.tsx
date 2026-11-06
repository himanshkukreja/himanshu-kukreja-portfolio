"use client";

/**
 * The war room's optional AI, each behind a button so nothing is spent unless the learner asks:
 * - RunReview: after a room ends, "how a senior on-call would rate your run" (/api/learn/ai/war-room/debrief).
 * - AskIncident: questions about the incident, answered from the room (/api/learn/ai/war-room/ask). While the room is
 *   in progress the server only reads the channel so far, and the answer won't give away the open call.
 * - WarAiFinePrint: the one quiet line of small print, which opens on a tap.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import AiText from "@/components/learn/ai/AiText";
import { AI_FREE_LINE } from "@/components/learn/ai/AiFreeNote";
import { AI_PRIVACY } from "@/components/learn/ai/AskLessonPanel";
import { setAiCredits, useAiStatus } from "@/components/learn/ai/useAiStatus";
import { track } from "@/lib/track";
import type { RunGrade } from "@/lib/learn/war/types";

const LABEL = "font-mono text-[11px] uppercase tracking-label";

/** A move the learner typed at a call, and how the room took it. */
export type TypedMove = {
  beat: number;
  you: string;
  who: string;
  reply: string;
  /** the option it played as, or null when it matched none */
  match: number | null;
  verdict?: "helps" | "hurts" | "off-track" | null;
  /** minutes a harmful move added to the night */
  cost?: number;
  hint?: string;
  /** the request failed: shown, never counted or sent to the review */
  failed?: boolean;
};

export function WarAiFinePrint() {
  return (
    <details className="group text-[11.5px] leading-snug text-fg-4">
      <summary className="cursor-pointer list-none py-1.5 font-mono text-[11px] leading-relaxed hover:text-fg-3 [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:py-3">
        optional ai · sent only when you press a button · not used to train AI · <span className="underline decoration-line-strong underline-offset-2 group-open:text-fg-3">privacy</span>
      </summary>
      <p className="m-0 mt-1.5 max-w-[70ch]">
        {AI_PRIVACY} The room itself never needs it: every call can be played by picking an option. {AI_FREE_LINE}
      </p>
    </details>
  );
}

/** Signed out: one quiet line with a sign-in button. AI off or resting: nothing (the room works without it). */
function useAiGate(feature: string): {
  state: "ok" | "signin" | "off" | "loading";
  credits: number | null;
  preview: boolean;
} {
  const s = useAiStatus();
  if (!s) return { state: "loading", credits: null, preview: false };
  if (!s.signedIn) return { state: "signin", credits: null, preview: false };
  return {
    state: s.features[feature] ? "ok" : "off",
    credits: s.creditsLeft,
    preview: s.preview,
  };
}

const GRADE: Record<RunGrade, { label: string; tone: string }> = {
  strong: { label: "Strong", tone: "border-ok bg-ok/10 text-ok-text" },
  solid: {
    label: "Solid",
    tone: "border-signal bg-signal/10 text-signal-text",
  },
  shaky: { label: "Shaky", tone: "border-bad/70 bg-bad/5 text-bad-text" },
  rough: { label: "Rough", tone: "border-bad bg-bad/10 text-bad-text" },
};

type Review = {
  grade: RunGrade;
  verdict: string;
  well: string[];
  change: string;
  revisit: { title: string; code: string; href: string; why: string }[];
};

/** "How a senior on-call would rate your run": the picks and typed moves of a finished run, reviewed on request. */
export function RunReview({ slug, picks, typed }: { slug: string; picks: { beat: number; options: number[] }[]; typed: TypedMove[] }) {
  const gate = useAiGate("war-room-debrief");
  const { openAuthModal } = useAuthModal();
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await aiFetch("/api/learn/ai/war-room/debrief", {
        method: "POST",
        body: JSON.stringify({
          slug,
          picks,
          typed: typed
            .filter((t) => !t.failed)
            .map((t) => ({
              beat: t.beat,
              text: t.you,
              match: t.match,
              verdict: t.verdict ?? null,
              cost: t.cost ?? 0,
            })),
        }),
      });
      const b = (await r.json().catch(() => ({}))) as Partial<Review> & {
        error?: string;
        creditsLeft?: number | null;
      };
      setAiCredits(b.creditsLeft);
      if (!r.ok || !b.grade) setError(b.error || "The review didn't come through. Try again.");
      else {
        setReview(b as Review);
        track("war_room_review", { slug, grade: b.grade });
      }
    } catch {
      setError("You seem to be offline.");
    }
    setBusy(false);
  };

  if (gate.state === "loading" || gate.state === "off") return null;
  return (
    <div className="flex flex-col gap-3 border border-line-strong bg-surface p-4 sm:p-6" aria-live="polite">
      <span className={`${LABEL} flex items-center gap-2 text-fg-3`}>
        <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden /> optional · ai review of your run
      </span>
      {!review ? (
        <>
          <p className="m-0 text-[17px] font-semibold leading-snug text-fg">How would a senior on-call rate this run?</p>
          <p className="m-0 max-w-[62ch] text-[14px] leading-relaxed text-fg-2">
            Your picks and the moves you typed, read against this room&apos;s calls and postmortem: a verdict, what you did well, the one habit to change and what to revisit.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {gate.state === "signin" ? (
              <button type="button" onClick={openAuthModal} className="min-h-11 border border-signal px-4 text-[15px] font-semibold text-fg hover:bg-surface-2">
                Sign in free to get a review
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void run()}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 text-[15px] font-semibold text-on-signal disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {busy ? "Reading your run…" : "Rate my run"}
              </button>
            )}
            {gate.state === "ok" && gate.credits !== null && <span className="font-mono text-[11px] text-fg-4">about 1 credit · {gate.credits} left today</span>}
          </div>
          {error && <p className="m-0 border border-bad/50 px-3 py-2 text-[14px] text-fg-2">{error}</p>}
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`border px-2.5 py-1 font-mono text-[12px] font-semibold uppercase tracking-label ${GRADE[review.grade].tone}`}>{GRADE[review.grade].label}</span>
            <span className="text-[13px] text-fg-3">how a senior on-call would rate your run</span>
          </div>
          <p className="m-0 max-w-[62ch] text-[17px] font-medium leading-snug text-fg">{review.verdict}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {review.well.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className={`${LABEL} text-ok-text`}>what you did well</span>
                <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[14.5px] leading-relaxed text-fg-2">
                  {review.well.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {review.change && (
              <div className="flex flex-col gap-1.5 border-l-2 border-signal pl-3">
                <span className={`${LABEL} text-signal-text`}>the one habit to change</span>
                <p className="m-0 text-[14.5px] leading-relaxed text-fg-2">{review.change}</p>
              </div>
            )}
          </div>
          {review.revisit.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className={`${LABEL} text-fg-3`}>revisit</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {review.revisit.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border border-line px-3 py-2.5 hover:border-fg-3">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[15px] font-semibold text-fg">{l.title}</span>
                        {l.why && <span className="text-[13.5px] leading-snug text-fg-2">{l.why}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-fg-3">{l.code} →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <WarAiFinePrint />
    </div>
  );
}

type Turn = {
  q: string;
  text?: string;
  sources?: { label: string; href?: string }[];
  error?: string;
  pending?: boolean;
};

/** "Ask about this incident": a small, closed-by-default box under the room. `at` = beats seen, `over` = room finished. */
export function AskIncident({ slug, at, over, lessonTitle }: { slug: string; at: number; over: boolean; lessonTitle?: string }) {
  const gate = useAiGate("war-room-ask");
  const { openAuthModal } = useAuthModal();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = turns.some((t) => t.pending);

  const ask = async (question: string) => {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setQ("");
    setTurns((ts) => [...ts, { q: text, pending: true }].slice(-6));
    let turn: Turn;
    try {
      const r = await aiFetch("/api/learn/ai/war-room/ask", {
        method: "POST",
        body: JSON.stringify({ slug, at, over, question: text }),
      });
      const b = (await r.json().catch(() => ({}))) as {
        text?: string;
        sources?: Turn["sources"];
        error?: string;
        creditsLeft?: number | null;
      };
      setAiCredits(b.creditsLeft);
      turn = r.ok && b.text ? { q: text, text: b.text, sources: b.sources || [] } : { q: text, error: b.error || "Something went wrong. Try again." };
      if (r.ok) track("war_room_ask", { slug, over });
    } catch {
      turn = { q: text, error: "You seem to be offline." };
    }
    setTurns((ts) => ts.map((t) => (t.pending && t.q === text ? turn : t)));
  };

  if (gate.state === "loading" || gate.state === "off") return null;
  const starters = over
    ? ["Why was the first call the right one?", "How close is this to the real incident?", "What would have prevented this?"]
    : ["What has happened so far?", "What does the last log line tell me?"];
  return (
    <section aria-label="Ask about this incident" className="flex flex-col border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="war-ask-body"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
        }}
        className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
      >
        <span className="flex items-center gap-2 text-[15px] font-semibold text-fg">
          <Sparkles className="h-4 w-4 shrink-0 text-signal-text" aria-hidden /> Ask about this incident
        </span>
        <span className="shrink-0 font-mono text-[11px] text-fg-3">
          optional ai <span aria-hidden>{open ? "▴" : "▾"}</span>
        </span>
      </button>
      {open && (
        <div id="war-ask-body" className="flex flex-col gap-3 border-t border-line px-4 pb-3 pt-3">
          <p className="m-0 text-[13.5px] leading-relaxed text-fg-3">
            {over
              ? `Answers come from this room: the channel, the postmortem, the real incident${lessonTitle ? ` and the lesson (${lessonTitle})` : ""}.`
              : `Answers come from the channel so far${lessonTitle ? " and the lesson behind this room" : ""}. It won't give away the call in front of you or what happens next.`}
          </p>
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-2">
              <p className="m-0 self-end border border-line-strong bg-surface-2 px-3 py-2 text-[14px] text-fg">{t.q}</p>
              {t.pending ? (
                <p className="m-0 flex items-center gap-2 font-mono text-xs text-fg-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> reading the room…
                </p>
              ) : t.error ? (
                <p className="m-0 border border-bad/50 px-3 py-2 text-[14px] text-fg-2">{t.error}</p>
              ) : (
                <div className="flex flex-col gap-2" aria-live="polite">
                  <AiText text={t.text || ""} className="!text-[14.5px]" />
                  {t.sources && t.sources.length > 0 && (
                    <p className="m-0 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-fg-3">
                      <span>sources:</span>
                      {t.sources.map((s) =>
                        s.href ? (
                          s.href.startsWith("#") || s.href.startsWith("/") ? (
                            <Link key={s.label} href={s.href} className="border border-line px-1.5 py-0.5 text-fg-2 hover:border-fg-3 hover:text-fg">
                              {s.label}
                            </Link>
                          ) : (
                            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="border border-line px-1.5 py-0.5 text-fg-2 hover:border-fg-3 hover:text-fg">
                              {s.label} ↗
                            </a>
                          )
                        ) : (
                          <span key={s.label} className="border border-line px-1.5 py-0.5">
                            {s.label}
                          </span>
                        ),
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          {gate.state === "signin" ? (
            <button type="button" onClick={openAuthModal} className="min-h-11 self-start border border-signal px-4 text-[15px] font-semibold text-fg hover:bg-surface-2">
              Sign in free to ask
            </button>
          ) : (
            <>
              {turns.length === 0 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Example questions">
                  {starters.map((s) => (
                    <button key={s} type="button" onClick={() => void ask(s)} disabled={busy} className="min-h-9 border border-line-strong px-2.5 text-left text-[13px] text-fg-2 hover:text-fg">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(q);
                }}
              >
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value.slice(0, 500))}
                  placeholder={over ? "e.g. why did the rollback take so long?" : "e.g. what does this chart mean?"}
                  aria-label="Your question about this incident"
                  className="min-h-11 min-w-0 flex-1 border border-line-strong bg-bg px-3 text-[15px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
                />
                <button type="submit" disabled={busy || q.trim().length < 3} className="min-h-11 bg-signal px-4 font-mono text-xs font-semibold text-on-signal disabled:opacity-50">
                  {busy ? "…" : "Ask"}
                </button>
              </form>
              {gate.credits !== null && <p className="m-0 font-mono text-[11px] text-fg-4">about 1 credit a question · {gate.credits} left today</p>}
            </>
          )}
          <WarAiFinePrint />
        </div>
      )}
    </section>
  );
}
