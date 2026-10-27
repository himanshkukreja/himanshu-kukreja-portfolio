import "server-only";
/**
 * Public share links for video lectures. Playing a lecture needs a signed-in learner (the first
 * minute is free); a link a learner shares carries `s=<token>` and plays in full for anyone.
 * token = <8 chars of the sharer's id>.<HMAC(lecture, sharer)>, keyed off a server secret, so it can't be
 * made up by editing the URL and it says who shared it. No table: verification recomputes it.
 */
import crypto from "crypto";

const KEY = () => crypto.createHash("sha256").update(`lecture-share-v1:${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""}`).digest();
const sig = (lecture: string, who: string) => crypto.createHmac("sha256", KEY()).update(`${lecture}:${who}`).digest("base64url").slice(0, 16);

export const SLUG_RE = /^[A-Za-z0-9-]{1,160}$/;

export function shareToken(lecture: string, userId: string): string {
  const who = userId.replace(/-/g, "").slice(0, 8);
  return `${who}.${sig(lecture, who)}`;
}

export function verifyShare(lecture: string, token: string): { ok: boolean; by: string | null } {
  const m = /^([a-f0-9]{8})\.([A-Za-z0-9_-]{16})$/.exec(token || "");
  if (!m || !SLUG_RE.test(lecture)) return { ok: false, by: null };
  const want = sig(lecture, m[1]);
  const ok = crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m[2]));
  return { ok, by: ok ? m[1] : null };
}
