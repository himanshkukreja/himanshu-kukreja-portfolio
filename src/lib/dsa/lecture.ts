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
import type { Lecture, LectureCode, LectureRace, LectureScene, LectureTrace, LectureTraceFrame } from "../learn/lecture/types";

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
  src: { lessonMd: string | null; traces: Record<string, RawTrace | null>; races: Record<string, RawRace | null>; cast: Record<string, { name: string; role: string }> },
): Lecture {
  const templates = src.lessonMd ? parseTemplates(src.lessonMd) : {};
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
