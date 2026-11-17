/**
 * Internal traffic that analytics ignores: the owner's test accounts and localhost.
 *
 * - Browser (lib/analytics/client.ts, lib/track.ts): on localhost nothing loads or sends; when a test
 *   account signs in, the browser opts out for good (hk.notrack=1) and PostHog stops recording.
 * - Ingest (lib/analytics/ingest.ts): events from a localhost host or a test account are dropped.
 * - Admin readers: rows already stored for those accounts, the browsers they used, or marked dev are
 *   filtered out with `dropInternal()` (server only: excludedIds()).
 * Extra emails: ANALYTICS_EXCLUDE_EMAILS (comma-separated), on top of the two below.
 */
export const EXCLUDED_EMAILS = ["kukreja.him@gmail.com", "himansharora2001@gmail.com"];

/** The dedicated QA account (qa-agent@systemdesignmastery.dev): signs in for staging/E2E checks, must never count as a learner. */
export const QA_USER_ID = "2c699bbd-acd1-4db7-85a5-a951300726b5";
export const QA_EMAIL_PREFIX = "qa-agent@";

/** True for the QA account (by user id or by a qa-agent@ email). Use it to keep QA out of counts, boards and learner emails. */
export function isQaUser(user: { id?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return user.id === QA_USER_ID || (user.email || "").trim().toLowerCase().startsWith(QA_EMAIL_PREFIX);
}

export function isExcludedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (e.startsWith(QA_EMAIL_PREFIX)) return true;
  const extra = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ANALYTICS_EXCLUDE_EMAILS || process.env.ANALYTICS_EXCLUDE_EMAILS || "" : "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return EXCLUDED_EMAILS.includes(e) || extra.includes(e);
}

/** localhost, 127.x, ::1, 0.0.0.0, *.local and *.localhost */
export function isLocalHost(host: string | null | undefined): boolean {
  const h = (host || "").toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1" || h === "0.0.0.0" || /^127\./.test(h);
}
