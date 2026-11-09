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

/** A DSA lesson page (/dsa/concepts|structures|algorithms/<id>): it has its own reading dock (Ask AI, Notebook, Listen, Snip), so the
 *  site-wide floating Ask and Notebook buttons stand aside there, as on course lessons. */
export const isDsaReaderPath = (p: string) => /^\/dsa\/(?:concepts|structures|algorithms)\/[^/]+\/?$/.test(p.split(/[?#]/)[0]);

/** Any DSA Mastery page (/dsa and everything under it, clean course paths): the header, dock and every shared
 *  component there wear DSA Mastery's brand and teal (SiteHeader sets data-course="dsa" on <html>, globals.css). */
export const isDsaPath = (p: string) => /^\/dsa(?:\/|$)/.test(p.split(/[?#]/)[0]);

/** A DSA problem room (/dsa/problems/<id>): its editor fills the screen height, so the floating Notebook pen would sit
 *  over Run / Submit; the room has its own Notebook button in the editor toolbar instead. */
export const isDsaProblemRoom = (p: string) => /^\/dsa\/problems\/[^/]+\/?$/.test(p.split(/[?#]/)[0]);
