/**
 * A problem's graphical explainer ("Watch it work", top of the Solutions tab): five beats of step-engine frames, built
 * in the content repo (resources/problems/<id>/explainer/explainer.py → generated/explainers/<id>.json) and proved there:
 * its input is one of the problem's examples and its result is that example's output and the reference solution's.
 *
 *   picture  the example drawn as the story      slow  the obvious way, its cost counter climbing
 *   idea     the one insight                      walk  the solution step by step, each frame on its code step [n]
 *   recap    a card: the pattern, the cost, the takeaway
 *
 * Pure types and helpers (no React); the player is components/dsa/problem/explainer/ExplainerPlayer.tsx.
 */
import type { DsaLang } from "./types";
import type { ViewId } from "./viz/types";

export type ExplainerBeatId = "picture" | "slow" | "idea" | "walk";

export type ExplainerFrame = {
  /** the caption: one plain sentence */
  note: string;
  /** the narration when it is worded for the ear (defaults to the note) */
  say?: string;
  state: unknown;
  /** the running cost within the beat, in the explainer's unit */
  cost: number;
  /** walk frames: the code step marker ([1], [2], …) the frame follows */
  marker?: number;
  vars?: Record<string, unknown>;
  /** a frame drawn on another view than the explainer's */
  view?: ViewId;
  /** seconds on screen without narration */
  hold?: number;
};

/** unit: the beat's own cost unit when it counts something else (the slow beat's "calls"); otherwise the explainer's */
export type ExplainerBeat = { id: ExplainerBeatId; title: string; frames: ExplainerFrame[]; unit?: string };

export type ExplainerRecap = { pattern: string; time: string; space: string; takeaway: string; also: string[]; say?: string };

/** The narration track: one file, each frame's start (seconds), the recap's start, the length. */
export type ExplainerAudio = { url: string; marks: number[]; recap: number; dur: number };

/** The narration lines in play order (each frame's `say` or note, then the recap): what scripts/explainers/voice.mjs voices. */
export function explainerTexts(e: Pick<Explainer, "beats" | "recap">): string[] {
  const frames = e.beats.flatMap((b) => b.frames.map((f) => f.say || f.note));
  return [...frames, e.recap.say || `${e.recap.pattern}. ${e.recap.takeaway}`];
}

export type Explainer = {
  problem: string;
  title: string | null;
  view: ViewId;
  costUnit: string;
  example: number;
  input: Record<string, unknown>;
  beats: ExplainerBeat[];
  recap: ExplainerRecap;
  result: unknown;
  /** the reference solutions by language (the walk lights the lines of the current step) */
  code?: Partial<Record<DsaLang, string>>;
};

export const BEAT_LABEL: Record<ExplainerBeatId | "recap", string> = { picture: "The picture", slow: "The slow way", idea: "The idea", walk: "Step by step", recap: "Recap" };

/** Every frame in play order, with its beat. */
export function flatFrames(e: Explainer): { beat: ExplainerBeat; frame: ExplainerFrame; inBeat: number }[] {
  return e.beats.flatMap((beat) => beat.frames.map((frame, inBeat) => ({ beat, frame, inBeat })));
}

/** Seconds a frame stays up with no narration: reading time for its caption, 2 to 6 s. */
export function holdFor(f: { note: string; hold?: number }): number {
  if (f.hold) return f.hold;
  const words = f.note.trim().split(/\s+/).length;
  return Math.min(6, Math.max(2, 0.9 + words * 0.32));
}

/**
 * The lines (0-based) of a solution that belong to step [n]: from its marker comment to the line before the next marker
 * comment (or the end of the enclosing block, when the next line out-dents past the marker's indent).
 */
export function linesOfStep(code: string, n: number): number[] {
  const lines = code.split("\n");
  const markerAt = (l: string) => {
    const m = l.match(/(?:#|\/\/)\s*\[(\d+)\]/);
    return m ? Number(m[1]) : null;
  };
  const start = lines.findIndex((l) => markerAt(l) === n);
  if (start < 0) return [];
  const indent = (l: string) => l.length - l.trimStart().length;
  const base = indent(lines[start]);
  const out = [start];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (markerAt(l) !== null) break;
    if (indent(l) < base) break;
    if (/^\s*[})\]]+;?\s*$/.test(l) && indent(l) <= base) break;
    out.push(i);
  }
  return out;
}
