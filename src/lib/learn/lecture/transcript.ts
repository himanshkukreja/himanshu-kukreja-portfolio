/**
 * Transcript search (⌘K "In lectures"): every lecture's narration cut into ~20-40 s windows, each with the
 * second it starts, so a hit opens the lecture at that moment. Shorts are one entry each (they open in the
 * feed, no timestamp). Pure: the index route builds it, the palette reads its shape.
 *
 * Wire format (kept small: arrays, not objects):
 *   l: [id, title, code, href, kind]  kind 0 = lecture with timings, 1 = lecture whose recording is older
 *      than its script (no timestamps, a link to the lecture), 2 = short
 *   m: [lecture index, start second (-1 = none), narration text]
 */
import { flatten, estimatedStarts, type Lecture } from "./types";

export const TRANSCRIPT_TIMED = 0;
export const TRANSCRIPT_UNTIMED = 1;
export const TRANSCRIPT_SHORT = 2;
export type TranscriptKind = typeof TRANSCRIPT_TIMED | typeof TRANSCRIPT_UNTIMED | typeof TRANSCRIPT_SHORT;
export type TranscriptSource = [id: string, title: string, code: string, href: string, kind: TranscriptKind];
export type TranscriptMoment = [lecture: number, at: number, text: string];
export type TranscriptIndex = { v: 1; built: string; l: TranscriptSource[]; m: TranscriptMoment[] };

/** a window closes once it is this long… */
const MIN_S = 20;
/** …and before it would pass this (a single longer step stands alone) */
const MAX_S = 40;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * A lecture's narration in windows: consecutive steps grouped until the window is at least MIN_S long,
 * closed early at a chapter (scene) change once it has MIN_S / 2, and never grown past MAX_S. `timing`: the
 * recording's step starts, "estimate" (no recording: the player's own estimate from the script), or "none"
 * (a recording older than the script: the player won't seek by it, so the windows get at = -1).
 */
export function transcriptWindows(l: Lecture, timing: number[] | "estimate" | "none"): { at: number; text: string }[] {
  const flat = flatten(l);
  if (!flat.length) return [];
  const timed = timing !== "none";
  const t = Array.isArray(timing) && timing.length === flat.length ? timing : estimatedStarts(flat);
  const out: { at: number; text: string }[] = [];
  let from = 0;
  let parts: string[] = [];
  const close = (end: number) => {
    const text = clean(parts.join(" "));
    if (text) out.push({ at: timed ? Math.max(0, Math.floor(t[from])) : -1, text });
    parts = [];
    from = end;
  };
  for (let k = 0; k < flat.length; k++) {
    const len = t[k] - t[from];
    const sceneChange = k > from && flat[k].scene !== flat[k - 1].scene;
    const next = k + 1 < t.length ? t[k + 1] : t[k] + 8;
    if (parts.length && (len >= MIN_S || (sceneChange && len >= MIN_S / 2) || next - t[from] > MAX_S)) close(k);
    parts.push(flat[k].st.say);
  }
  close(flat.length);
  return out;
}

/** A short in one entry: its whole narration. */
export const shortText = (l: Lecture) => clean(l.scenes.flatMap((s) => s.steps.map((st) => st.say)).join(" "));
