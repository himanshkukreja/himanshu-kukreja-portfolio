/**
 * The sign-in gate's switch and its before-paint script (owner, 16 Nov 2026: everything stays free; a guest reads
 * the first part of each content page, watches the first 75 s of a lecture, and signs in for the rest, the AI tutor,
 * progress sync, notes, mock interviews and running code).
 *
 *   NEXT_PUBLIC_SIGNIN_GATE=off   turns it all off (also "0", "false", "no"); unset or anything else: on.
 *   Set in .github/workflows/cloudflare-deploy.yml for production and staging; inlined at build, so a change ships
 *   with the next deploy. Off: pages render whole, no card, no script, no paywall markup; lectures, problems,
 *   labs and Listen behave as before the gate.
 *
 * No flash either way: pages are cached (ISR), so the server can't know who's reading. GATE_JS runs in <head>
 * before first paint and puts class "hk-guest" on <html> unless this browser holds a stored session
 * (supabase-js keeps it in localStorage as sb-<project>-auth-token, src/lib/supabase-client.ts); CSS clamps
 * gated text only under html.hk-guest (globals.css "Sign-in gate"). After hydration <GateSync /> keeps the class
 * in step with the real auth state (a stale session is found out, a sign-in from the card unlocks in place).
 *
 * Edge-safe and import-free: server components, the browser and node tests all read it.
 */
const raw = (process.env.NEXT_PUBLIC_SIGNIN_GATE || "").trim().toLowerCase();

export const GATE_ON = !(raw === "off" || raw === "0" || raw === "false" || raw === "no");

/** on <html> while the reader is (believed to be) signed out */
export const GUEST_CLASS = "hk-guest";

/** how long a signed-out visitor may watch a lecture before it pauses for sign-in */
export const LECTURE_FREE_S = 75;

/** before first paint: guest unless a stored session exists (any sb-*-auth-token with an access token) */
export const GATE_JS = `(function(){var r=document.documentElement;try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){var v=localStorage.getItem(k);if(v&&v.indexOf("access_token")>-1)return}}}catch(e){}r.classList.add("${GUEST_CLASS}")})();`;

/** "dsa" on DSA Mastery pages, else "sdm" (for the gate's analytics) */
export function gateCourse(path: string): "dsa" | "sdm" {
  return /^\/(?:learn\/)?dsa(?:\/|$)/.test(path) ? "dsa" : "sdm";
}
