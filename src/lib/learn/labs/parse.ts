/**
 * Lab file (resources/labs/<id>.md) → LabSource. Pure: no Next or "@/" imports, so the Node checker
 * (scripts/labs/check-labs.mjs, run with type stripping) parses labs with this same code.
 *
 * Format v2 (full spec with examples: resources/labs/README.md). A v1 file is a v2 file with only
 * Python fences, so every v1 lab parses exactly as before.
 *
 *   ---
 *   id, title, topic, week, order, difficulty, minutes, xp?, timeout?, summary, lessons: [{ref, anchor, label}]
 *   type?: lab | project | incident         interview?: { minutes }       paths?: [ids]
 *   viz?: { view: timeline | ring | state | list, ... }
 *   chaos?: { scenarios: [...], runs }      scale?: { sizes: [...], target: "O(n)", budget }
 *   ---
 *   ## Brief            markdown (an incident lab may use ## Incident report instead)
 *   ## Given            ```python / ```js / ```ts   read-only support code, one fence per language family
 *   ## Starter          one fence per language the reader can pick (## Broken code in an incident lab)
 *   ## Hints            ### one heading per hint
 *   ## Solution         one fence per language + optional markdown notes
 *   ## Tests            visible tests (Python: def test_*; JS/TS: test("title", () => {...}))
 *   ## Hidden tests     run on every Run, listed only after it
 *   ## Repro tests      incident labs: tests that reproduce the outage
 *   ## War story        incident labs: the real incident it comes from
 *   ## Chaos tests      def chaos_*(sim) / chaos("title", (sim) => {...})
 *   ## Scale            def scale(n) / scale((n) => ...) : set up n items, return the function to time
 *   ## Follow-ups       ### one per interviewer follow-up: prompt, optional test fences, #### Strong answer
 *   ## Stage 1 · Title  projects: ### Brief, ### Starter (appended on unlock), ### Tests, ### Hidden tests, ### Hints, ### Solution
 */
import { createHash } from "crypto";
import matter from "gray-matter";
import type {
  ChaosScenario,
  ChaosSpec,
  Complexity,
  FamilyCode,
  FollowUpSource,
  LabDifficulty,
  LabFamily,
  LabHint,
  LabLang,
  LabLessonRef,
  LabSource,
  LabSrc,
  LabType,
  LangCode,
  ScaleSpec,
  StageSource,
  VizSeries,
  VizSpec,
  VizTone,
} from "./types";

// values repeated from ./types (type-only import: the Node checker loads this file with type stripping alone)
const LAB_LANGS: LabLang[] = ["python", "javascript", "typescript"];
const familyOf = (l: LabLang): LabFamily => (l === "python" ? "py" : "js");
const LAB_TYPES: LabType[] = ["lab", "project", "incident"];
const VIZ_VIEWS: VizSpec["view"][] = ["timeline", "ring", "state", "list"];
const CHAOS_SCENARIOS: ChaosScenario[] = ["interleave", "crash", "retry", "duplicate", "partition"];
const COMPLEXITIES: Complexity[] = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)"];

const DEFAULT_XP: Record<LabDifficulty, number> = { easy: 60, medium: 90, hard: 120 };
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TONES: VizTone[] = ["signal", "ok", "bad", "link", "muted", "fg"];

export class LabParseError extends Error {
  file: string;
  problems: string[];
  constructor(file: string, problems: string[]) {
    super(`${file}: ${problems.join("; ")}`);
    this.file = file;
    this.problems = problems;
  }
}

/** "#{level} Heading" sections, ignoring headings inside code fences (and deeper headings). */
function sections(body: string, level: number): { title: string; text: string }[] {
  const out: { title: string; lines: string[] }[] = [];
  const head = new RegExp(`^#{${level}}\\s+(.+?)\\s*#*\\s*$`);
  const deeper = "#".repeat(level + 1);
  let fence: string | null = null;
  let cur: { title: string; lines: string[] } | null = null;
  const pre: string[] = [];
  for (const line of body.split("\n")) {
    const f = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null;
    }
    const m = !fence && !f ? line.match(head) : null;
    if (m && !line.startsWith(deeper)) {
      cur = { title: m[1].trim(), lines: [] };
      out.push(cur);
      continue;
    }
    (cur ? cur.lines : pre).push(line);
  }
  const res = out.map((s) => ({ title: s.title, text: s.lines.join("\n").trim() }));
  if (pre.join("").trim()) res.unshift({ title: "", text: pre.join("\n").trim() });
  return res;
}

/** A fence's language: unlabelled fences are Python (v1 files); other languages are markdown. */
function fenceLang(info: string): LabLang | null {
  const w = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!w || w === "python" || w === "py") return "python";
  if (w === "js" || w === "javascript" || w === "mjs") return "javascript";
  if (w === "ts" || w === "typescript") return "typescript";
  return null;
}

type Fence = { lang: LabLang; code: string; start: number; end: number };

/** Every code fence of a section in a lab language, and the markdown left when they're removed. */
function fences(text: string): { list: Fence[]; rest: (taken: Fence[]) => string } {
  const list: Fence[] = [];
  const re = /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const lang = fenceLang(m[3]);
    if (lang) list.push({ lang, code: m[4].replace(/\s+$/, "") + "\n", start: m.index + m[1].length, end: m.index + m[0].length });
  }
  const rest = (taken: Fence[]) => {
    let out = "";
    let at = 0;
    for (const f of [...taken].sort((a, b) => a.start - b.start)) {
      out += text.slice(at, f.start);
      at = f.end;
    }
    return (out + text.slice(at)).replace(/\n{3,}/g, "\n\n").trim();
  };
  return { list, rest };
}

const countPy = (src: string) => (src.match(/^def test_\w+\s*\(/gm) || []).length;
const countJs = (src: string) => (src.match(/^\s*test\s*\(\s*["'`]/gm) || []).length;
export const countTests = (s: LabSrc | null | undefined, fam: LabFamily) => (s ? (fam === "py" ? countPy(s.code) : countJs(s.code)) : 0);
const countChaos = (s: LabSrc | null, fam: LabFamily) => (s ? (fam === "py" ? (s.code.match(/^def chaos_\w+\s*\(/gm) || []).length : (s.code.match(/^\s*chaos\s*\(\s*["'`]/gm) || []).length) : 0);
const hasScaleFn = (s: LabSrc | null, fam: LabFamily) => !!s && (fam === "py" ? /^def scale\s*\(/m.test(s.code) : /^\s*scale\s*\(/m.test(s.code));

export function parseLab(md: string, file: string): LabSource {
  const problems: string[] = [];
  const { data, content } = matter(md);
  const fm = data as Record<string, unknown>;
  const str = (k: string) => (typeof fm[k] === "string" ? (fm[k] as string).trim() : "");
  const num = (k: string, d: number) => (typeof fm[k] === "number" && Number.isFinite(fm[k]) ? (fm[k] as number) : d);

  const id = str("id") || file.replace(/^.*\//, "").replace(/\.md$/, "");
  if (!ID_RE.test(id)) problems.push(`id "${id}" must be kebab-case`);
  const title = str("title");
  if (!title) problems.push("title is required");
  const difficulty = (str("difficulty") || "medium") as LabDifficulty;
  if (!(difficulty in DEFAULT_XP)) problems.push(`difficulty must be easy, medium or hard (got "${difficulty}")`);
  const week = num("week", -1);
  if (week < 0) problems.push("week (a course week number) is required");

  const lessons: LabLessonRef[] = [];
  if (Array.isArray(fm.lessons)) {
    for (const l of fm.lessons as unknown[]) {
      if (typeof l === "string") lessons.push({ ref: l.trim() });
      else if (l && typeof l === "object" && typeof (l as LabLessonRef).ref === "string") {
        const o = l as LabLessonRef;
        lessons.push({ ref: o.ref.trim(), ...(o.anchor ? { anchor: String(o.anchor).replace(/^#/, "") } : {}), ...(o.label ? { label: String(o.label) } : {}) });
      } else problems.push("lessons: each entry needs a ref (e.g. W01-D3)");
    }
  }
  if (!lessons.length) problems.push("lessons: link at least one lesson");

  const secs = sections(content, 2);
  const get = (...names: string[]) => secs.find((s) => names.includes(s.title.toLowerCase()))?.text ?? null;

  // ------------------------------------------------------------------ stages decide what's required
  const stageSecs = secs
    .map((s) => ({ s, m: s.title.match(/^stage\s+(\d+)\s*[:·.\-–—]?\s*(.*)$/i) }))
    .filter((x) => !!x.m)
    .map((x) => ({ n: Number(x.m![1]), title: x.m![2].trim() || `Stage ${x.m![1]}`, text: x.s.text }));
  stageSecs.forEach((st, i) => {
    if (st.n !== i + 1) problems.push(`stages must be numbered 1, 2, 3… in order (found "Stage ${st.n}" at position ${i + 1})`);
  });
  const staged = stageSecs.length > 0;
  if (staged && stageSecs.length < 2) problems.push("a staged lab needs at least 2 stages");

  const typeRaw = (str("type") || (staged ? "project" : "lab")) as LabType;
  if (!LAB_TYPES.includes(typeRaw)) problems.push(`type must be lab, project or incident (got "${typeRaw}")`);
  const type: LabType = LAB_TYPES.includes(typeRaw) ? typeRaw : "lab";
  if (type === "project" && !staged) problems.push('type "project" needs ## Stage 1, ## Stage 2… sections');
  if (type === "incident" && staged) problems.push("an incident lab can't have stages");

  // ------------------------------------------------------------------ markdown
  const incidentReport = get("incident report") ?? "";
  const brief = get("brief") ?? "";
  if (type === "incident" && !incidentReport) problems.push('an incident lab needs an "## Incident report" section');
  if (type !== "incident" && !brief) problems.push('missing "## Brief" section');
  const story = get("war story") ?? "";
  if (type === "incident" && !story) problems.push('an incident lab needs a "## War story" section (the real incident it comes from)');

  // ------------------------------------------------------------------ per-language code
  /** one fence per language from a section, plus the markdown around them */
  const perLang = (name: string, label: string, text: string | null) => {
    const out: Partial<Record<LabLang, string>> = {};
    if (text == null) return { code: out, rest: "" };
    const { list, rest } = fences(text);
    const taken: Fence[] = [];
    for (const f of list) {
      if (out[f.lang] != null) continue; // later fences of the same language stay in the notes
      out[f.lang] = f.code;
      taken.push(f);
    }
    if (!taken.length && text.trim() && name !== "solution") problems.push(`"## ${label}" needs a \`\`\`python, \`\`\`js or \`\`\`ts fence`);
    return { code: out, rest: rest(taken) };
  };
  /** one fence per family (Python, or one JS/TS fence shared by JavaScript and TypeScript readers) */
  const perFamily = (label: string, text: string | null): Partial<Record<LabFamily, LabSrc>> => {
    const out: Partial<Record<LabFamily, LabSrc>> = {};
    if (text == null) return out;
    const { list } = fences(text);
    for (const f of list) {
      const fam = familyOf(f.lang);
      if (out[fam]) {
        problems.push(`"${label}" has two ${fam === "py" ? "Python" : "JavaScript/TypeScript"} fences: tests and support code take one per family (a \`\`\`ts fence serves JavaScript readers too)`);
        continue;
      }
      out[fam] = { code: f.code, ts: f.lang === "typescript" };
    }
    if (!list.length && text.trim()) problems.push(`"${label}" needs a \`\`\`python, \`\`\`js or \`\`\`ts fence`);
    return out;
  };

  const starterText = get("starter", "broken code");
  if (starterText == null) problems.push(type === "incident" ? 'missing "## Broken code" section' : 'missing "## Starter" section');
  const starter = perLang("starter", type === "incident" ? "Broken code" : "Starter", starterText).code;
  const solText = get("solution");
  if (solText == null) problems.push('missing "## Solution" section');
  const sol = perLang("solution", "Solution", solText);

  const languages = LAB_LANGS.filter((l) => starter[l] != null);
  if (!languages.length && starterText != null) problems.push("the starter has no ```python, ```js or ```ts fence");
  for (const l of languages) if (sol.code[l] == null) problems.push(`the solution has no ${l} fence (the starter has one)`);
  for (const l of LAB_LANGS) if (sol.code[l] != null && starter[l] == null) problems.push(`the solution has a ${l} fence but the starter doesn't`);

  const given = perFamily("## Given", get("given"));
  const visible = perFamily("## Tests", get("tests"));
  const hidden = perFamily("## Hidden tests", get("hidden tests"));
  const repro = perFamily("## Repro tests", get("repro tests"));
  const chaosCode = perFamily("## Chaos tests", get("chaos tests"));
  const scaleCode = perFamily("## Scale", get("scale"));

  const families = [...new Set(languages.map(familyOf))];
  for (const fam of families) {
    const famName = fam === "py" ? "Python" : "JavaScript/TypeScript";
    if (!staged && type !== "incident" && !visible[fam]) problems.push(`"## Tests" has no ${famName} fence (the starter has ${famName})`);
    if (type === "incident" && !repro[fam]) problems.push(`"## Repro tests" has no ${famName} fence: an incident lab must reproduce the outage in every language`);
    for (const [label, src] of [
      ["## Tests", visible[fam]],
      ["## Hidden tests", hidden[fam]],
      ["## Repro tests", repro[fam]],
    ] as const)
      if (src && !countTests(src, fam)) problems.push(`${label} (${famName}) has no ${fam === "py" ? "def test_*()" : 'test("…", () => …)'}`);
    if (chaosCode[fam] && !countChaos(chaosCode[fam]!, fam)) problems.push(`## Chaos tests (${famName}) has no ${fam === "py" ? "def chaos_*(sim)" : 'chaos("…", (sim) => …)'}`);
    if (scaleCode[fam] && !hasScaleFn(scaleCode[fam]!, fam)) problems.push(`## Scale (${famName}) has no ${fam === "py" ? "def scale(n)" : "scale((n) => …)"}`);
  }
  if (staged && (get("tests") != null || get("hidden tests") != null)) problems.push("a staged lab keeps its tests in its stages (### Tests), not in ## Tests");
  if (type !== "incident" && get("repro tests") != null) problems.push('"## Repro tests" is for incident labs (type: incident)');

  const family: Partial<Record<LabFamily, FamilyCode>> = {};
  for (const fam of families)
    family[fam] = { given: given[fam] ?? null, visible: visible[fam] ?? null, hidden: hidden[fam] ?? null, repro: repro[fam] ?? null, chaos: chaosCode[fam] ?? null, scale: scaleCode[fam] ?? null };
  const code: Partial<Record<LabLang, LangCode>> = {};
  for (const l of languages) code[l] = { starter: starter[l]!, solution: sol.code[l] ?? "" };

  // ------------------------------------------------------------------ hints
  const hintsOf = (text: string | null, level: number): LabHint[] =>
    sections(text ?? "", level)
      .filter((h) => h.text)
      .map((h, i) => ({ title: h.title || `Hint ${i + 1}`, md: h.text }));
  const hints = hintsOf(get("hints"), 3);

  // ------------------------------------------------------------------ stages
  const stages: StageSource[] = stageSecs.map((st, i) => {
    const sub = sections(st.text, 3);
    const sget = (n: string) => sub.find((s) => s.title.toLowerCase() === n)?.text ?? null;
    const where = `Stage ${st.n}`;
    const sBrief = sget("brief") ?? (sub[0]?.title === "" ? sub[0].text : "");
    if (!sBrief) problems.push(`${where} needs a ### Brief`);
    const deltaText = sget("starter");
    const deltas: Partial<Record<LabLang, string>> = {};
    if (deltaText != null) {
      if (i === 0) problems.push("Stage 1's starter is the lab's ## Starter: leave ### Starter out of Stage 1");
      for (const f of fences(deltaText).list) deltas[f.lang] ??= f.code;
    }
    const solTextS = sget("solution");
    const sSol: Partial<Record<LabLang, string>> = {};
    if (solTextS != null) for (const f of fences(solTextS).list) sSol[f.lang] ??= f.code;
    const last = i === stageSecs.length - 1;
    const sVis = perFamily(`${where} ### Tests`, sget("tests"));
    const sHid = perFamily(`${where} ### Hidden tests`, sget("hidden tests"));
    const lang: StageSource["lang"] = {};
    for (const l of languages) {
      const s = sSol[l] ?? (last ? sol.code[l] : undefined);
      if (!s) problems.push(`${where} has no ${l} ### Solution (every stage but the last needs one; the last defaults to ## Solution)`);
      lang[l] = { delta: deltas[l] ?? "", solution: s ?? "" };
    }
    const fam: StageSource["family"] = {};
    for (const f of families) {
      if (!sVis[f]) problems.push(`${where} ### Tests has no ${f === "py" ? "Python" : "JavaScript/TypeScript"} fence`);
      else if (!countTests(sVis[f], f)) problems.push(`${where} ### Tests has no tests`);
      fam[f] = { visible: sVis[f] ?? null, hidden: sHid[f] ?? null };
    }
    return { title: st.title, brief: sBrief, hints: hintsOf(sget("hints"), 4), lang, family: fam };
  });

  // ------------------------------------------------------------------ follow-ups
  const followUps: FollowUpSource[] = sections(get("follow-ups", "follow ups", "followups") ?? "", 3)
    .filter((s) => s.title)
    .map((s) => {
      const sub = sections(s.text, 4);
      const answer = sub.find((x) => /^(strong answer|what a strong answer covers|answer)$/i.test(x.title))?.text ?? "";
      const fuSol: FollowUpSource["solution"] = {};
      for (const f of fences(sub.find((x) => /^solution$/i.test(x.title))?.text ?? "").list) fuSol[f.lang] ??= f.code;
      const body = sub.find((x) => x.title === "")?.text ?? (sub.length ? "" : s.text);
      const { list, rest } = fences(body);
      const tests: FollowUpSource["tests"] = {};
      const taken: Fence[] = [];
      for (const f of list) {
        const k = familyOf(f.lang);
        if (tests[k]) continue;
        tests[k] = { code: f.code, ts: f.lang === "typescript" };
        taken.push(f);
      }
      for (const [k, src] of Object.entries(tests) as [LabFamily, LabSrc][]) if (!countTests(src, k)) problems.push(`follow-up "${s.title}": its ${k === "py" ? "Python" : "JS/TS"} fence has no tests`);
      const prompt = rest(taken);
      if (!prompt) problems.push(`follow-up "${s.title}" needs a prompt (the question the interviewer asks)`);
      for (const l of Object.keys(fuSol) as LabLang[]) if (!tests[familyOf(l)]) problems.push(`follow-up "${s.title}" has a ${l} #### Solution but no ${familyOf(l) === "py" ? "Python" : "JS/TS"} tests`);
      return { title: s.title, prompt, answer, tests, solution: fuSol };
    });
  if (followUps.length > 3) problems.push(`at most 3 follow-ups (found ${followUps.length})`);

  // ------------------------------------------------------------------ viz / chaos / scale specs
  const viz = parseViz(fm.viz, problems);
  const chaos = parseChaos(fm.chaos, problems);
  const scale = parseScale(fm.scale, problems);
  for (const fam of families) {
    if (chaos && !chaosCode[fam]) problems.push(`front matter has chaos: but "## Chaos tests" has no ${fam === "py" ? "Python" : "JS/TS"} fence`);
    if (scale && !scaleCode[fam]) problems.push(`front matter has scale: but "## Scale" has no ${fam === "py" ? "Python" : "JS/TS"} fence`);
  }
  if (!chaos && Object.keys(chaosCode).length) problems.push("## Chaos tests needs chaos: { scenarios: [...] } in the front matter");
  if (!scale && Object.keys(scaleCode).length) problems.push("## Scale needs scale: { sizes: [...], target: ... } in the front matter");

  const paths = Array.isArray(fm.paths) ? (fm.paths as unknown[]).filter((p): p is string => typeof p === "string" && ID_RE.test(p)) : [];
  const iv = fm.interview && typeof fm.interview === "object" ? (fm.interview as Record<string, unknown>) : {};
  const minutes = Math.max(5, Math.round(num("minutes", 30)));

  if (problems.length) throw new LabParseError(file, problems);

  const py = family.py;
  return {
    id,
    title,
    topic: str("topic") || title,
    type,
    week,
    order: num("order", 100),
    difficulty,
    minutes,
    interviewMinutes: typeof iv.minutes === "number" && iv.minutes > 0 ? Math.round(iv.minutes) : minutes,
    xp: Math.max(10, Math.round(num("xp", DEFAULT_XP[difficulty]))),
    timeoutSec: Math.min(30, Math.max(2, num("timeout", 8))),
    summary: str("summary"),
    lessons,
    paths,
    brief,
    hints,
    solutionNotes: sol.rest,
    languages,
    code,
    family,
    stages,
    followUps,
    incident: type === "incident" ? { report: incidentReport, story } : null,
    viz,
    chaos,
    scale,
    given: py?.given?.code ?? "",
    starter: code.python?.starter ?? "",
    solution: code.python?.solution ?? "",
    visible: py?.visible?.code ?? "",
    hidden: py?.hidden?.code ?? "",
    version: createHash("sha1").update(md).digest("hex").slice(0, 10),
  };
}

// ------------------------------------------------------------------------------------ specs

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const sval = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);

function parseViz(v: unknown, problems: string[]): VizSpec | null {
  if (v == null) return null;
  if (!isObj(v)) {
    problems.push("viz: must be a mapping with a view");
    return null;
  }
  const view = sval(v.view, "");
  if (!VIZ_VIEWS.includes(view as VizSpec["view"])) {
    problems.push(`viz.view must be one of ${VIZ_VIEWS.join(", ")} (got "${view}")`);
    return null;
  }
  const base = { ...(typeof v.title === "string" ? { title: v.title } : {}), ...(typeof v.test === "string" ? { test: v.test } : {}) };
  const tone = (t: unknown): VizTone | undefined => (typeof t === "string" && TONES.includes(t as VizTone) ? (t as VizTone) : undefined);
  if (view === "timeline") {
    const series: VizSeries[] = [];
    if (!Array.isArray(v.series) || !v.series.length) problems.push("viz (timeline) needs series: [{ label, event, where?, value?, tone? }]");
    for (const s of Array.isArray(v.series) ? v.series : []) {
      if (!isObj(s) || typeof s.event !== "string" || typeof s.label !== "string") {
        problems.push("viz.series entries need a label and an event");
        continue;
      }
      if (s.tone != null && !tone(s.tone)) problems.push(`viz.series "${s.label}": tone must be one of ${TONES.join(", ")}`);
      series.push({
        label: s.label,
        event: s.event,
        ...(isObj(s.where) ? { where: s.where as VizSeries["where"] } : {}),
        ...(typeof s.value === "string" ? { value: s.value } : {}),
        ...(tone(s.tone) ? { tone: tone(s.tone) } : {}),
      });
    }
    const bucket = typeof v.bucket === "number" && v.bucket > 0 ? v.bucket : 1;
    const style = v.style === "lines" || v.style === "bars" ? v.style : series.some((s) => s.value) ? "lines" : "bars";
    return { view, ...base, x: sval(v.x, "t"), bucket, style, series, ...(typeof v.x_label === "string" ? { xLabel: v.x_label } : {}), ...(typeof v.y_label === "string" ? { yLabel: v.y_label } : {}) };
  }
  if (view === "ring") {
    const ev = isObj(v.events) ? v.events : {};
    return { view, ...base, space: typeof v.space === "number" && v.space > 0 ? v.space : 2 ** 32, events: { node: sval(ev.node, "node"), remove: sval(ev.remove, "node_removed"), key: sval(ev.key, "key") } };
  }
  if (view === "state") {
    const states = (Array.isArray(v.states) ? v.states : [])
      .map((s) => (typeof s === "string" ? { id: s } : isObj(s) && typeof s.id === "string" ? { id: s.id, ...(typeof s.label === "string" ? { label: s.label } : {}), ...(tone(s.tone) ? { tone: tone(s.tone) } : {}) } : null))
      .filter((s): s is { id: string; label?: string; tone?: VizTone } => !!s);
    if (!states.length) problems.push("viz (state) needs states: [closed, open, …] (or { id, label, tone })");
    return { view, ...base, event: sval(v.event, "state"), ...(typeof v.note === "string" ? { note: v.note } : {}), states };
  }
  const kind = v.kind === "queue" || v.kind === "map" ? v.kind : "list";
  return { view: "list", ...base, event: sval(v.event, "list"), kind, ...(typeof v.head === "string" ? { head: v.head } : {}), ...(typeof v.tail === "string" ? { tail: v.tail } : {}) };
}

function parseChaos(v: unknown, problems: string[]): ChaosSpec | null {
  if (v == null) return null;
  if (!isObj(v)) {
    problems.push("chaos: must be a mapping with scenarios");
    return null;
  }
  const scenarios = (Array.isArray(v.scenarios) ? v.scenarios : []).filter((s): s is ChaosScenario => {
    const ok = typeof s === "string" && CHAOS_SCENARIOS.includes(s as ChaosScenario);
    if (!ok) problems.push(`chaos.scenarios: unknown scenario "${String(s)}" (use ${CHAOS_SCENARIOS.join(", ")})`);
    return ok;
  });
  if (!scenarios.length) problems.push("chaos.scenarios needs at least one scenario");
  const runs = typeof v.runs === "number" ? Math.min(500, Math.max(1, Math.round(v.runs))) : 40;
  return { scenarios, runs };
}

const COMPLEXITY_ALIASES: Record<string, Complexity> = { "o(n²)": "O(n^2)", "o(n*n)": "O(n^2)", "o(logn)": "O(log n)", "o(nlogn)": "O(n log n)", "o(n*log n)": "O(n log n)" };

function parseScale(v: unknown, problems: string[]): ScaleSpec | null {
  if (v == null) return null;
  if (!isObj(v)) {
    problems.push("scale: must be a mapping with sizes and target");
    return null;
  }
  const sizes = (Array.isArray(v.sizes) ? v.sizes : [1000, 10000, 100000]).filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0);
  if (sizes.length < 2) problems.push("scale.sizes needs at least 2 sizes (e.g. [1000, 10000, 100000])");
  if (sizes.some((n, i) => i && n <= sizes[i - 1])) problems.push("scale.sizes must increase");
  const raw = sval(v.target, "");
  const target = (COMPLEXITIES.find((c) => c.toLowerCase() === raw.toLowerCase()) ?? COMPLEXITY_ALIASES[raw.toLowerCase().replace(/\s+/g, "")] ?? COMPLEXITY_ALIASES[raw.toLowerCase()]) as Complexity | undefined;
  if (!target) problems.push(`scale.target must be one of ${COMPLEXITIES.join(", ")} (got "${raw}")`);
  const budgetSec = typeof v.budget === "number" && v.budget > 0 ? Math.min(20, v.budget) : 3;
  return { sizes, target: target ?? "O(n)", budgetSec, ...(typeof v.label === "string" ? { label: v.label } : {}) };
}

/** Test counts of one language family (all stages for a project). */
export function labTestCounts(l: Pick<LabSource, "family" | "stages" | "languages">, fam?: LabFamily) {
  const f = fam ?? (l.languages.includes("python") ? "py" : "js");
  const c = l.family[f];
  if (l.stages.length)
    return l.stages.reduce((a, s) => ({ visible: a.visible + countTests(s.family[f]?.visible, f), hidden: a.hidden + countTests(s.family[f]?.hidden, f) }), { visible: 0, hidden: 0 });
  return { visible: countTests(c?.visible, f) + countTests(c?.repro, f), hidden: countTests(c?.hidden, f) };
}
