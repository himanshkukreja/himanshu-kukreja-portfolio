/**
 * DSA Mastery release flag (plan §15.1), inlined at build like GUIDE_VIDEOS_ON (src/lib/learn/guide/videos.ts).
 *
 *   NEXT_PUBLIC_DSA_MODE=soon   (default; production until launch) /dsa is the coming-soon page, every other
 *                               /dsa/* path goes to /dsa (src/middleware.ts) and the DSA APIs answer 404,
 *                               except /api/dsa/waitlist.
 *   NEXT_PUBLIC_DSA_MODE=full   (staging) the hub, world map, concept pages, problems and their APIs.
 *
 * "beta" and "on" (the plan's names) mean full too, so a later rename of the staging value can't switch DSA off.
 * Edge-safe and import-free: the middleware, server components and the browser all read it.
 */
export type DsaMode = "soon" | "full";

const raw = (process.env.NEXT_PUBLIC_DSA_MODE || "").trim().toLowerCase();

export const DSA_MODE: DsaMode = raw === "full" || raw === "beta" || raw === "on" ? "full" : "soon";

/** Everything is on (staging). False in production until launch day. */
export const DSA_FULL = DSA_MODE === "full";

/** /dsa/... paths that stay public in "soon" mode (the coming-soon page itself and its share images). */
export function dsaPathAllowedSoon(clean: string): boolean {
  return clean === "/dsa" || clean === "/dsa/" || /^\/dsa\/(?:opengraph-image|twitter-image)(?:[-.\w]*)?$/.test(clean);
}

/** A DSA concept page (/dsa/concepts/<id>): it has its own reading dock (Ask AI, Notebook, Listen, Snip), so the
 *  site-wide floating Ask and Notebook buttons stand aside there, as on course lessons. */
export const isDsaReaderPath = (p: string) => /^\/dsa\/concepts\/[^/]+\/?$/.test(p.split(/[?#]/)[0]);
