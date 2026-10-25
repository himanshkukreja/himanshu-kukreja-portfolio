/**
 * Side-quest lectures (resources/lectures/<quest slug>.json, format in that folder's README): scenes
 * that build up and animate as the narrator speaks. v2 adds list, compare, quiz, chart, timeline and
 * phone scenes, and per-step packets (`flow`), camera (`focus`), reveals and pauses.
 */
export type Tone = "bad" | "good" | "hot" | "neutral";
export type LectureStep = {
  say: string;
  caption?: string;
  highlight?: string[];
  upto?: number;
  reveal?: number;
  pause?: number;
  flow?: string[];
  focus?: string[];
  screen?: number;
};
export type SceneKind = "title" | "numbers" | "flowchart" | "sequence" | "state" | "list" | "compare" | "quiz" | "chart" | "timeline" | "phone";
export type LectureScene = {
  id: string;
  title: string;
  kind: SceneKind;
  heading?: string;
  numbers?: { value: string; label: string }[];
  diagram?: string;
  points?: string[] | { label: string; value: number; tone?: Tone }[];
  left?: { title: string; points: string[]; tone?: Tone };
  right?: { title: string; points: string[]; tone?: Tone };
  question?: string;
  options?: string[];
  answer?: number;
  explain?: string;
  type?: "bar" | "line";
  unit?: string;
  events?: { at: string; text: string; tone?: Tone }[];
  app?: string;
  screens?: { title: string; rows: { text: string; meta?: string; tone?: Tone }[]; toast?: string }[];
  steps: LectureStep[];
};
export type Lecture = { v?: number; quest: string; title: string; summary: string; scenes: LectureScene[] };

/** One step of the whole lecture, in order. */
export type FlatStep = { n: number; scene: number; step: number; s: LectureScene; st: LectureStep };
export const flatten = (l: Lecture): FlatStep[] => {
  let n = 0;
  return l.scenes.flatMap((s, scene) => s.steps.map((st, step) => ({ n: n++, scene, step, s, st })));
};

/** Recorded narration for a lecture: where each step starts in the audio (seconds). */
export type LectureMedia = {
  /** hash of the lecture JSON the audio was made from; a mismatch means the audio is stale */
  source: string;
  audio: string;
  /** soft background music, looped under the narration */
  music?: string;
  video?: string;
  poster?: string;
  captions?: string;
  duration: number;
  starts: number[];
};

export function stepSource(scene: LectureScene, step: LectureStep): string | null {
  const src = scene.diagram?.trim();
  if (!src) return null;
  if (scene.kind === "sequence") {
    if (!step.upto) return src;
    const lines = src.split("\n");
    const out: string[] = [];
    let shown = 0;
    let open = 0;
    // blocks opened after the cut are dropped whole: their "end" goes too
    let skipped = 0;
    for (const line of lines) {
      const t = line.trim();
      const isMsg = /(-{1,2}>>|-{1,2}x|-{1,2}\)|-{1,2}>)/.test(t) || /^Note\s/i.test(t);
      const opens = /^(alt|opt|loop|par|critical|break|rect)\b/i.test(t);
      const isEnd = /^end$/i.test(t);
      if (isMsg) {
        if (shown >= step.upto) continue;
        shown++;
      } else if (opens) {
        if (shown >= step.upto) {
          skipped++;
          continue;
        }
        open++;
      } else if (isEnd) {
        if (skipped > 0) {
          skipped--;
          continue;
        }
        if (open > 0) open--; // else it closes a participant box
      } else if (/^(else|and)\b/i.test(t) && shown >= step.upto) continue;
      out.push(line);
    }
    for (; open > 0; open--) out.push("  end");
    return out.join("\n");
  }
  const ids = (step.highlight || []).filter((x) => /^[A-Za-z0-9_]+$/.test(x));
  if (!ids.length) return src;
  return `${src}\n  classDef lit fill:#3a1a08,stroke:#FF6B2B,stroke-width:3px,color:#ffffff\n  class ${ids.join(",")} lit`;
}
