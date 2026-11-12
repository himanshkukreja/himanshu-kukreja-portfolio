/**
 * What the page knows about the learner on this device, sent with every DSA tutor message (useCourseChat) so the tutors
 * adapt (lib/learner/dsa-profile.ts readClientSignals checks it on the server): the language picked for lessons and the
 * problem room (dsa.lang), "Show everything" (dsa.view) and the welcome's experience answer (dsa.welcome). Client-only,
 * every read guarded (storage can be blocked).
 */
export type DsaClientSignalsWire = { lang?: string; full?: boolean; exp?: string };

export function dsaClientSignals(): DsaClientSignalsWire {
  const get = (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const out: DsaClientSignalsWire = {};
  const lang = get("dsa.lang");
  if (lang) out.lang = lang;
  if (get("dsa.view") === "full") out.full = true;
  try {
    const w = JSON.parse(get("dsa.welcome") || "null") as { exp?: unknown } | null;
    if (w && typeof w.exp === "string") out.exp = w.exp;
  } catch {
    /* not JSON */
  }
  return out;
}
