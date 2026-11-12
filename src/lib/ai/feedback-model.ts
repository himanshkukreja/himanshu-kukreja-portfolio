/**
 * Feedback on AI answers (AI quality layer, owner-approved 12 Nov 2026): a thumbs up or down on one answer and, on a
 * down, an optional reason chip. What is stored (table chat_feedback, one row per answer and learner): the verdict, the
 * reason, the feature, the model, the prompt version hash (ai_calls.meta.pv) and the answer id (the ai_calls row).
 * Never the learner's words: there is no free-text note any more (the chat's old note box is gone; an old client's note
 * is ignored). The answer's text stays where it already is (ai_transcripts, the AI's output, 30/90 days); the admin's
 * "recent downs" shows an excerpt of the AI's answer only, never the learner's message.
 * Pure (no imports): the API route, the page widgets, the admin view and the tests share it.
 */

export const FEEDBACK_REASONS = {
  wrong: "Wrong",
  not_grounded: "Not grounded",
  too_long: "Too long",
  gave_away: "Gave away the answer",
  didnt_know_me: "Didn't know me",
} as const;
export type FeedbackReason = keyof typeof FEEDBACK_REASONS;
export const REASON_IDS = Object.keys(FEEDBACK_REASONS) as FeedbackReason[];
export const isReason = (x: unknown): x is FeedbackReason => typeof x === "string" && x in FEEDBACK_REASONS;

/** The answers a learner can rate: each one's ai_calls feature. */
export const FEEDBACK_FEATURES = ["course-chat", "dsa-chat", "dsa-tutor", "lesson-qa", "snip-explain", "lab-hint", "lab-review", "explain-back", "mock-scorecard", "lld-mock-scorecard"] as const;
export type FeedbackFeature = (typeof FEEDBACK_FEATURES)[number];
export const isFeedbackFeature = (x: unknown): x is FeedbackFeature => typeof x === "string" && (FEEDBACK_FEATURES as readonly string[]).includes(x);

/** What one rating is: -1, 0 (taken back) or 1, and a reason only on a down. */
export type FeedbackInput = { callId: number; rating: -1 | 0 | 1; reason: FeedbackReason | null };

/**
 * The request body, checked. The chat's old shape ({ rating, wrong, note }) still works: "wrong" becomes the reason
 * "wrong" and the note is dropped.
 */
export function readFeedback(body: unknown): FeedbackInput | string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const callId = Number(b.callId);
  if (!Number.isInteger(callId) || callId <= 0) return "Unknown answer";
  let rating: -1 | 0 | 1 = b.rating === 1 || b.rating === -1 ? b.rating : 0;
  let reason: FeedbackReason | null = isReason(b.reason) ? b.reason : b.wrong === true ? "wrong" : null;
  // "this was wrong" on its own (the old flag button) is a down
  if (reason && rating === 0) rating = -1;
  if (rating !== -1) reason = null;
  return { callId, rating, reason };
}

/** Before the chat_feedback migration of 12 Nov 2026 adds the reason column, the reason rides in the old note column as
 *  this code (never learner text); the admin reads either. */
export const REASON_NOTE = (r: FeedbackReason) => `reason:${r}`;
export function reasonOf(row: { reason?: string | null; note?: string | null; wrong?: boolean | null }): FeedbackReason | null {
  if (isReason(row.reason)) return row.reason;
  const m = /^reason:([a-z_]+)$/.exec(row.note ?? "");
  if (m && isReason(m[1])) return m[1];
  return row.wrong ? "wrong" : null;
}
