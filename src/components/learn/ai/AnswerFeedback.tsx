"use client";
/**
 * 👍 / 👎 on one AI answer, and on a 👎 an optional reason chip (wrong, not grounded, too long, gave away the answer,
 * didn't know me). Used under every rateable AI answer: the course chat and the DSA chat and tutor (ChatThread, with the
 * rating kept in the conversation), and on its own under Ask this lesson, the lecture Ask, snip explain, lab hints and
 * reviews, explain-back and the mock scorecards (it posts the rating itself). POST /api/learn/ai/feedback with the
 * answer's call id: the verdict and the reason only, never the learner's words (lib/ai/feedback-model.ts).
 * Hidden for the session once the server says feedback is off (503: the table isn't there).
 */
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { aiFetch } from "./aiFetch";
import { track } from "@/lib/track";
import { FEEDBACK_REASONS, REASON_IDS, type FeedbackReason } from "@/lib/ai/feedback-model";

export type AnswerRating = { rating: -1 | 0 | 1; reason: FeedbackReason | null; sent?: boolean };

let off = false;

/** Post one rating; false when it didn't save (feedback off: hidden from then on). */
export async function postRating(callId: number, r: Omit<AnswerRating, "sent">, headers?: HeadersInit): Promise<boolean> {
  const res = await aiFetch("/api/learn/ai/feedback", { method: "POST", body: JSON.stringify({ callId, rating: r.rating, reason: r.reason }), headers }).catch(() => null);
  if (res?.status === 503) off = true;
  return !!res?.ok;
}

export default function AnswerFeedback({
  callId,
  feature,
  value,
  onRate,
  className = "",
}: {
  callId: number | null | undefined;
  /** the analytics label (which feature's answer) */
  feature: string;
  /** controlled: the rating kept by the caller (the chat's conversation) */
  value?: AnswerRating;
  /** controlled: the caller posts and stores it */
  onRate?: (callId: number, r: Omit<AnswerRating, "sent">) => void;
  className?: string;
}) {
  const [own, setOwn] = useState<AnswerRating | undefined>(undefined);
  const [hidden, setHidden] = useState(off);
  const [picking, setPicking] = useState(false);
  if (!callId || hidden) return null;
  const r = value ?? own;
  const rate = (next: Omit<AnswerRating, "sent">) => {
    track("ai_feedback", { feature, rating: next.rating, reason: next.reason ?? "" });
    if (onRate) return onRate(callId, next);
    setOwn({ ...next, sent: false });
    void postRating(callId, next).then((ok) => {
      if (off) setHidden(true);
      else setOwn((cur) => (cur && cur.rating === next.rating && cur.reason === next.reason ? { ...cur, sent: ok } : cur));
    });
  };
  const btn = (on: boolean) =>
    `grid h-8 w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 place-items-center border ${on ? "border-signal text-signal-text" : "border-transparent text-fg-4 hover:text-fg"}`;
  const down = r?.rating === -1;
  return (
    <span className={`inline-flex flex-wrap items-center gap-0.5 ${className}`}>
      <button type="button" aria-label="Helpful" aria-pressed={r?.rating === 1} onClick={() => (setPicking(false), rate({ rating: r?.rating === 1 ? 0 : 1, reason: null }))} className={btn(r?.rating === 1)}>
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Not helpful"
        aria-pressed={down}
        aria-expanded={down && picking}
        onClick={() => {
          if (down) {
            setPicking(false);
            rate({ rating: 0, reason: null });
          } else {
            setPicking(true);
            rate({ rating: -1, reason: null });
          }
        }}
        className={btn(down)}
      >
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {down && picking && (
        <span role="group" aria-label="What went wrong? (optional)" className="flex w-full flex-wrap items-center gap-1 pt-1">
          {REASON_IDS.map((id) => {
            const on = r?.reason === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => rate({ rating: -1, reason: on ? null : id })}
                className={`min-h-8 [@media(pointer:coarse)]:min-h-10 border px-2 font-mono text-[11px] ${on ? "border-signal text-signal-text" : "border-line-strong text-fg-3 hover:text-fg"}`}
              >
                {FEEDBACK_REASONS[id].toLowerCase()}
              </button>
            );
          })}
        </span>
      )}
      {r?.sent && !(down && picking && !r.reason) && <span className="font-mono text-[10.5px] text-fg-4">thanks</span>}
    </span>
  );
}
