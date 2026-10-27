/**
 * Side-quest lectures (resources/lectures/<quest slug>.json, format in that folder's README): scenes
 * that build up and animate as the narrator speaks. v2 adds list, compare, quiz, chart, timeline and
 * phone scenes, and per-step packets (`flow`), camera (`focus`), reveals and pauses.
 */
export type Tone = "bad" | "good" | "hot" | "neutral";
export type LectureStep = {
  say: string;
  /** mock interview videos: who says this line (the lecture's `cast`) */
  who?: "interviewer" | "candidate";
  caption?: string;
  highlight?: string[];
  upto?: number;
  reveal?: number;
  pause?: number;
  flow?: string[];
  focus?: string[];
  screen?: number;
  /** leans on an earlier lesson: "↩ Recall · label", and in the course player a link to its lecture */
  ref?: { lecture: string; label: string };
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
export type CastMember = { name: string; title?: string; voice: string };

export type Lecture = {
  v?: number;
  /** the lecture's id: a side quest's slug, or "<week>--<lesson slug>" for a course lesson (also
   * "problem-bank--<slug>", "low-level-design--<slug>" and "case-files--<story slug>") */
  quest: string;
  /** course lessons, interview problems, LLD and case files: which page this teaches */
  lesson?: { week: string; slug: string; kind: "preview" | "lesson" | "capstone" | "problem" | "lld" | "case" | "interview" | "story" };
  /** mock interview videos: the two people on the call, each with a Kokoro voice */
  cast?: { interviewer: CastMember; candidate: CastMember };
  /** a vertical short (resources/shorts/shorts--<long id>.json, rendered 1080x1920): the lecture it comes
   *  from, its written article, and the label shown on top ("W04 · Caching", "Side quest 21", …) */
  short?: { of: string; article: string; label: string };
  title: string;
  summary: string;
  scenes: LectureScene[];
};

/** The playlist section's anchor: "W04 · Caching" → "w04-caching", "Side quests" → "side-quests". */
export const lectureGroupAnchor = (group: string) => group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Short code for a playlist section: "W04", "SQ", "PB", "LLD", "CF". */
export const lectureGroupCode = (group: string) =>
  /^W\d+/.test(group) ? group.match(/^W\d+/)![0] : group === "Side quests" ? "SQ" : group === "Interview problems" ? "PB" : group === "Low-level design" ? "LLD" : group === "Case files" ? "CF" : group === "War stories" ? "WS" : group.slice(0, 3).toUpperCase();

/** A course lesson's lecture id (side quests use their slug). */
export const lessonLectureId = (week: string, slug: string) => `${week}--${slug}`;

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
