/**
 * DSA Mastery lectures (dsa-mastery resources/modules/<module>/<concept>/lecture.json): the SDM lecture format v2 plus
 * five scene kinds, quote, array, trace, race and code, that point into the content repo (a cast id, a trace id, a race
 * id, a lesson template id). resolveDsaLecture inlines what they point at, so the lecture player and the MP4 renderer
 * get one self-contained Lecture and fetch nothing else.
 *
 * Pure and import-free (type imports only), so two callers share it byte for byte:
 *   the site     src/lib/dsa/load.ts getConceptLecture (cached with the rest of the DSA content)
 *   rendering    scripts/lecture/dsa-resolve.mjs (Node strips the types), whose output export.mjs records
 * Both must build the same object: the recorded media is keyed by a hash of the resolved JSON (lectureHash).
 */
import type { Lecture, LectureCode, LectureRace, LectureScene, LectureStep, LectureTrace, LectureTraceFrame } from "../learn/lecture/types";

export type RawTrace = {
  title?: string;
  template?: string | null;
  input?: Record<string, unknown>;
  vars?: string[];
  frames?: { marker?: number; note?: string; state?: Record<string, unknown>; view?: LectureTraceFrame["view"]; ask?: { var?: string } | null }[];
};
export type RawRace = { title?: string; unit?: string; sizes?: number[]; series?: { label: string; counts: number[]; tone: string }[]; note?: string };
export type RawDsaLecture = Omit<Lecture, "lesson" | "dsa"> & { lesson?: { course?: string; module?: string; concept?: string; kind?: string } };

export type DsaTemplate = { label: string; code: Record<string, string> };

/** `:::tabs[Label]{id="x"}` blocks in a lesson: each fence's code by language (js → javascript, py → python, c++ → cpp). */
export function parseTemplates(md: string): Record<string, DsaTemplate> {
  const out: Record<string, DsaTemplate> = {};
  const re = /^:{3,}tabs\[([^\]\n]*)\]\{[^}\n]*id="([^"]+)"[^}\n]*\}\s*\n([\s\S]*?)^:{3,}\s*$/gm;
  for (const m of md.matchAll(re)) {
    const code: Record<string, string> = {};
    for (const f of m[3].matchAll(/^```(\w+)\s*\n([\s\S]*?)^```\s*$/gm)) {
      const lang = f[1].toLowerCase();
      const key = lang === "js" ? "javascript" : lang === "py" ? "python" : lang === "c++" ? "cpp" : lang;
      code[key] = f[2].replace(/\s+$/, "");
    }
    out[m[2]] = { label: m[1].trim(), code };
  }
  return out;
}

const MARKER = /(?:#|\/\/)\s*\[(\d+)\]/;
const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * The lines each step marker covers: from its `# [n]` comment down to the next marker, stopping early where the code
 * steps out of the marker's block (a line indented less than the comment, e.g. `return best` or a closing brace).
 * Index n - 1 holds marker n's 0-based line numbers.
 */
export function markerLines(source: string): number[][] {
  const lines = source.split("\n");
  const at: { n: number; line: number }[] = [];
  lines.forEach((l, i) => {
    const m = l.match(MARKER);
    if (m) at.push({ n: Number(m[1]), line: i });
  });
  const out: number[][] = [];
  at.forEach((m, k) => {
    const end = k + 1 < at.length ? at[k + 1].line : lines.length;
    const ind = indentOf(lines[m.line]);
    const cover = [m.line];
    for (let i = m.line + 1; i < end; i++) {
      if (!lines[i].trim()) continue;
      if (indentOf(lines[i]) < ind) break;
      cover.push(i);
    }
    out[m.n - 1] = cover;
  });
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
  return out;
}

function codeOf(tpl: DsaTemplate | undefined, lang: string): LectureCode | undefined {
  const source = tpl?.code[lang];
  if (!tpl || !source) return undefined;
  return { label: tpl.label, source, lines: markerLines(source) };
}

/** The trace and race ids a lecture's scenes point at (what to read before resolving). */
export function lectureRefs(raw: RawDsaLecture): { traces: string[]; races: string[] } {
  const traces = new Set<string>();
  const races = new Set<string>();
  for (const s of raw.scenes || []) {
    if (s.kind === "trace" && s.trace) traces.add(s.trace);
    if (s.kind === "race" && s.race) races.add(s.race);
  }
  return { traces: [...traces], races: [...races] };
}

function traceOf(t: RawTrace, templates: Record<string, DsaTemplate>): LectureTrace {
  const values = Object.values(t.input || {}).find((v): v is unknown[] => Array.isArray(v)) || [];
  const frames: LectureTraceFrame[] = (t.frames || []).map((f) => ({
    marker: f.marker ?? 0,
    note: f.note || "",
    state: f.state || {},
    view: {
      window: f.view?.window ?? null,
      pointers: f.view?.pointers || {},
      leaving: f.view?.leaving ?? null,
      joining: f.view?.joining ?? null,
      map: f.view?.map ?? null,
      need: f.view?.need ?? null,
    },
    ask: f.ask?.var ?? null,
  }));
  const code = t.template ? codeOf(templates[t.template], "python") : undefined;
  return { title: t.title || "", values, vars: t.vars || [], frames, ...(code ? { code, lang: "python" } : {}) };
}

const raceOf = (r: RawRace): LectureRace => ({ title: r.title || "", unit: r.unit || "", sizes: r.sizes || [], series: r.series || [], note: r.note || "" });

/**
 * The self-contained lecture: `lesson` becomes `dsa: { module, concept }`, and each DSA scene carries its data
 * (quote → person, trace → traceData, race → raceData, code → code). A reference that can't be found is left
 * unresolved; scripts/lecture/check.mjs reports it, and the stage draws what it has.
 */
export function resolveDsaLecture(
  raw: RawDsaLecture,
  src: {
    lessonMd: string | null;
    traces: Record<string, RawTrace | null>;
    races: Record<string, RawRace | null>;
    cast: Record<string, { name: string; role: string }>;
    /** extra code templates by id (a problem's solution video: "solution", the reference solutions by language) */
    templates?: Record<string, DsaTemplate>;
  },
): Lecture {
  const templates = { ...(src.lessonMd ? parseTemplates(src.lessonMd) : {}), ...(src.templates || {}) };
  const scenes: LectureScene[] = (raw.scenes || []).map((s) => {
    if (s.kind === "quote" && s.who && src.cast[s.who]) return { ...s, person: { name: src.cast[s.who].name, role: src.cast[s.who].role } };
    if (s.kind === "trace" && s.trace && src.traces[s.trace]) return { ...s, traceData: traceOf(src.traces[s.trace]!, templates) };
    if (s.kind === "race" && s.race && src.races[s.race]) return { ...s, raceData: raceOf(src.races[s.race]!) };
    if (s.kind === "code" && s.template) {
      const code = codeOf(templates[s.template], s.lang || "python");
      if (code) return { ...s, code };
    }
    return s;
  });
  const { lesson, ...rest } = raw;
  return { ...rest, dsa: { module: lesson?.module || "", concept: lesson?.concept || "" }, scenes };
}

/** "dsa--<module>--<concept>" (a concept lecture's quest, and its shorts' `short.of`) → its module and concept. */
export function dsaQuestParts(quest: string): { module: string; concept: string } | null {
  const m = quest.match(/^dsa--([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  return m ? { module: m[1], concept: m[2] } : null;
}

/** "shorts--dsa--<module>--<concept>--<slug>" (a DSA short's quest) → where its script lives. */
export function dsaShortParts(id: string): { module: string; concept: string; slug: string } | null {
  const m = id.match(/^shorts--dsa--([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  return m ? { module: m[1], concept: m[2], slug: m[3] } : null;
}

/**
 * A DSA short (resources/modules/<module>/<concept>/shorts/<slug>.json, 9:16): resolved exactly like its concept's
 * lecture (quote, race, trace and code data inlined), with `dsa` naming the concept from `short.of`, so the short's
 * stage turns teal and the renderer records it from /dsa/shorts/<quest>. Shared with scripts/lecture/dsa-resolve.mjs.
 */
export function resolveDsaShort(
  raw: RawDsaLecture,
  src: { lessonMd: string | null; traces: Record<string, RawTrace | null>; races: Record<string, RawRace | null>; cast: Record<string, { name: string; role: string }> },
): Lecture {
  const of = dsaQuestParts(raw.short?.of || "");
  return resolveDsaLecture({ ...raw, lesson: { course: "dsa", module: of?.module || "", concept: of?.concept || "", kind: "short" } }, src);
}


/* ------------------------------------------------------------------ in-article clips and solution videos */

/** The trace and race ids a lesson's inline clip scenes point at (what to read before resolving them). */
export function clipRefs(raw: RawClips): { traces: string[]; races: string[] } {
  const scenes = (raw.clips || []).flatMap((c) => (typeof c.scene === "string" ? [] : [c.scene]));
  return lectureRefs({ scenes } as unknown as RawDsaLecture);
}

/** A clip's media id: lectures/dsa--clips--<lesson>--<clip>/ on the media host. */
export const clipQuest = (lesson: string, id: string) => `dsa--clips--${lesson}--${id}`;
/** A problem's solution video's media id: lectures/dsa--solution--<problem>/. */
export const solutionQuest = (problem: string) => `dsa--solution--${problem}`;

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
/** "dsa--clips--<lesson>--<clip>" → its lesson and clip id. */
export function clipQuestParts(quest: string): { lesson: string; id: string } | null {
  const m = quest.match(new RegExp(`^dsa--clips--(${SLUG})--(${SLUG})$`));
  return m ? { lesson: m[1], id: m[2] } : null;
}
/** "dsa--solution--<problem>" → the problem id. */
export function solutionQuestParts(quest: string): { problem: string } | null {
  const m = quest.match(new RegExp(`^dsa--solution--(${SLUG})$`));
  return m ? { problem: m[1] } : null;
}

/** One step of a clip: `from` copies that step of the borrowed lecture scene, and any other field overrides it. */
export type RawClipStep = Partial<LectureStep> & { from?: number };
/**
 * A lesson's in-article clip (dsa-mastery <lesson dir>/clips.json, placed in lesson.md with `::clip[id]`): one scene,
 * either borrowed from the lesson's lecture (`scene: "<scene id>"`, with `set` overriding scene fields) or written
 * inline (`scene: { kind, heading, values, grid, … }`), and its steps (default: the borrowed scene's own). The
 * caption sits under the clip; the steps' `say` is the narration a learner hears on tap.
 */
export type RawClip = {
  id: string;
  caption: string;
  /** where the clip sits in the lesson (one of its beats): for the checker and for review */
  beat?: string;
  /** what the clip shows: the analogy, an operation, a mistake */
  role?: "analogy" | "operation" | "step" | "mistake";
  scene: string | (Omit<LectureScene, "id" | "steps"> & { id?: string });
  set?: Partial<Omit<LectureScene, "id" | "steps">>;
  steps?: RawClipStep[];
};
export type RawClips = { clips?: RawClip[] };

/**
 * A clip as a self-contained one-scene Lecture (the stage draws it, export.mjs records it at 1280x720 with no music).
 * `lecture` is the lesson's lecture, already resolved, so a borrowed trace or code scene carries its data. Returns null
 * when the borrowed scene is missing. Shared with scripts/lecture/dsa-resolve.mjs: the media hash depends on it.
 */
export function resolveDsaClip(
  clip: RawClip,
  lecture: Lecture | null,
  lesson: { module: string; concept: string; title: string },
  /** what an inline scene points at (its lesson's templates, traces, races, the cast), as for a lecture */
  src?: { lessonMd: string | null; traces: Record<string, RawTrace | null>; races: Record<string, RawRace | null>; cast: Record<string, { name: string; role: string }> },
): Lecture | null {
  let base: LectureScene;
  if (typeof clip.scene === "string") {
    const found = lecture?.scenes.find((s) => s.id === clip.scene);
    if (!found) return null;
    base = found;
  } else {
    const inline = { id: clip.scene.id || clip.id, steps: [], ...clip.scene } as LectureScene;
    // an inline scene gets its trace, race, code and person data inlined like a lecture's scene, and the heading as its title
    const [resolved] = src ? resolveDsaLecture({ v: 2, quest: "", title: "", summary: "", scenes: [inline] } as unknown as RawDsaLecture, src).scenes : [inline];
    base = { ...resolved, title: resolved.title || (resolved as { heading?: string }).heading || clip.caption } as LectureScene;
  }
  const { beat: _beat, steps: srcSteps, ...rest } = base as LectureScene & { beat?: string };
  void _beat;
  const picks: RawClipStep[] = clip.steps && clip.steps.length ? clip.steps : srcSteps.map((_, k) => ({ from: k }));
  const steps: LectureStep[] = picks.map((st) => {
    const { from, ...over } = st;
    const src = from !== undefined ? srcSteps[from] : undefined;
    return { ...(src || {}), ...over, say: over.say ?? src?.say ?? "" } as LectureStep;
  });
  const scene: LectureScene = { ...rest, ...(clip.set || {}), id: clip.id, steps } as LectureScene;
  return {
    v: 2,
    quest: clipQuest(lesson.concept, clip.id),
    title: clip.caption,
    summary: `${lesson.title}: ${clip.caption}`,
    dsa: { module: lesson.module, concept: lesson.concept },
    clip: { lesson: lesson.concept, id: clip.id, caption: clip.caption },
    scenes: [scene],
  };
}

/**
 * A problem's solution video (dsa-mastery resources/problems/<id>/solution.json, lecture format v2): the problem in one
 * picture, the first attempt, the key insight, a dry run, the code line by line (code scenes with `template:
 * "solution"` show the reference solution in `lang`, lit by its [n] step markers), complexity, edge cases and the
 * classic twin. Resolved like a concept lecture; `solution.problem` names the problem.
 */
export function resolveDsaSolution(
  raw: RawDsaLecture,
  src: {
    problem: { id: string; module: string; concept: string };
    solutions: Record<string, string>;
    traces: Record<string, RawTrace | null>;
    races: Record<string, RawRace | null>;
    cast: Record<string, { name: string; role: string }>;
  },
): Lecture {
  const { problem, solutions, ...rest } = src;
  const lec = resolveDsaLecture(
    { ...raw, quest: solutionQuest(problem.id), lesson: { course: "dsa", module: problem.module, concept: problem.concept, kind: "solution" } },
    // trailing blank lines trimmed, like a lesson's :::tabs code (parseTemplates)
    { ...rest, lessonMd: null, templates: { solution: { label: "Solution", code: Object.fromEntries(Object.entries(solutions).map(([l, c]) => [l, c.replace(/\s+$/, "")])) } } },
  );
  return { ...lec, solution: { problem: problem.id } };
}
