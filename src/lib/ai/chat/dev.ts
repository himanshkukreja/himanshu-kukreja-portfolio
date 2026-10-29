/**
 * The course chat's local QA seam, `next dev` only. With the smart-search preview header (x-smart-preview: 1)
 * the chat answers without a session; x-chat-dev-user then picks a stand-in learner, so a local run can drive
 * the real quota, progress, memory and feedback paths. The ids are fixed fake UUIDs (…-0000000000NN) that no
 * real account can have, and both checks read NODE_ENV at call time: in a production build it is
 * "production", so neither header does anything there (scripts/chat-check.ts asserts it).
 */

export const DEV_USER_RE = /^00000000-0000-4000-8000-0000000000\d\d$/;

const isDevServer = () => process.env.NODE_ENV === "development";

/** `next dev` and the preview header: the chat answers without signing in (admin-like, no quota). */
export const chatDevPreview = (request: Request): boolean => isDevServer() && request.headers.get("x-smart-preview") === "1";

/** `next dev`, the preview header and a stand-in learner id: that learner, with the normal quota and data paths. */
export function chatDevLearner(request: Request): { id: string; email: null } | null {
  if (!chatDevPreview(request)) return null;
  const id = (request.headers.get("x-chat-dev-user") || "").trim();
  return DEV_USER_RE.test(id) ? { id, email: null } : null;
}
