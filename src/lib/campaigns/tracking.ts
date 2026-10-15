/**
 * Public tracking endpoints' logic (open pixel, click redirect). Server-only. Never reveals whether a
 * token exists: every request gets the same pixel / the same redirect. Admin previews and test sends
 * use the "preview" / "test" tokens, which are accepted and never recorded.
 */
import { allowedUrl, isNonTrackingToken, SITE } from "./links";
import { getStore } from "./store";

export const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

/** Extra hosts allowed for click wrapping + redirects (comma-separated EMAIL_CLICK_HOSTS). */
export const extraHosts = () => (process.env.EMAIL_CLICK_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean);

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

export async function recordOpen(token: string, ua: string | null): Promise<void> {
  if (!TOKEN_RE.test(token) || isNonTrackingToken(token)) return;
  try {
    await getStore().track(token, "open", null, ua?.slice(0, 300) || null);
  } catch (e) {
    console.error("[campaigns] open not recorded", (e as Error).message);
  }
}

/** Where a click goes: the requested URL if it's on an allowed host, else the site home (not logged). */
export function clickTarget(u: string | null): { url: string; allowed: boolean } {
  const ok = u ? allowedUrl(u, extraHosts()) : null;
  return ok ? { url: ok.toString(), allowed: true } : { url: SITE, allowed: false };
}

export async function recordClick(token: string, url: string, ua: string | null): Promise<void> {
  if (!TOKEN_RE.test(token) || isNonTrackingToken(token)) return;
  try {
    await getStore().track(token, "click", url.slice(0, 1000), ua?.slice(0, 300) || null);
  } catch (e) {
    console.error("[campaigns] click not recorded", (e as Error).message);
  }
}
