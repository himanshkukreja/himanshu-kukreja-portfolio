/**
 * DSA Mastery's four in-lesson exercise fences (spec: ~/.cache/hk-render/briefs/dsa-exercises-spec.md): ```bug (Find the
 * bug), ```predict (Predict the output), ```order (Put it in order, a Parsons puzzle) and ```breakit (Break it).
 * Pure parser and helpers, shared by the renderer (src/lib/course/detect/exercise.ts), the client components
 * (src/components/dsa/lesson/exercises) and the unit tests (scripts/tests/dsa-exercises.test.mjs).
 *
 * Common block shape (every line starts in column 0):
 *   %% id: bs-off-by-one            required, kebab-case, unique in the lesson
 *   %% title: Find the bug · The loop that never ends
 *   %% after: the-idea              optional (a stage or beat id; the block renders where it sits)
 *   ? The question (one line, inline code in backticks)
 *   @python / @java / @javascript / @cpp     a code section per language, up to the next header or field
 *   hint: ...   fails: ...   trace: ...   answer: ...   input: ...   example: ...   breaks: ...
 *   > explanation (one or more lines)
 *   A trailing "  # comment" on a field line (two spaces first) is ignored, so the spec's annotated examples parse.
 *
 * Per type
 *   bug      each language marks the buggy line with `#!` (python) or `//!` (java, javascript, cpp) followed by the FIXED
 *            line's text (indentation is taken from the buggy line). Exactly one marker per language. `fails:` one input.
 *   predict  choices as `- [ ] text` / `- [x] text` (exactly one [x]), or `answer: text` (exact, whitespace-normalised).
 *   order    the solution's lines in order; a line prefix `~ ` marks a distractor and `{N} ` puts the line in swap
 *            group N (the prefix and ONE space are removed; the rest, indentation included, is the line). Blank lines are
 *            ignored. `sig:` and `check:` lines belong to the content checker and are ignored here.
 *   breakit  `input: nums: int[], k: int`; `example:` (the value itself for one field, a JSON array of the values in
 *            order for several); `breaks:` (a JSON list of such inputs); and the JS pair `@run-wrong` / `@run-right`, each
 *            defining `solve(...)`. The learner's language is displayed; the JS pair is what runs. Strings, lists and
 *            rows have at most 50 elements. Syntax matches the content checker (dsa-mastery tools/lib/check/exercises.mjs).
 */

export const EX_LANGS = ["python", "java", "javascript", "cpp"] as const;
export type ExLang = (typeof EX_LANGS)[number];
export const EX_KINDS = ["bug", "predict", "order", "breakit"] as const;
export type ExKind = (typeof EX_KINDS)[number];

export const EX_LABEL: Record<ExKind, string> = { bug: "Find the bug", predict: "Predict the output", order: "Put it in order", breakit: "Break it" };
/** The labels a title may start with ("Predict · Where do the pointers stop?"). */
const TITLE_LABELS: Record<ExKind, string[]> = { bug: ["find the bug"], predict: ["predict", "predict the output"], order: ["put it in order"], breakit: ["break it"] };
export const isExKind = (s: string | null | undefined): s is ExKind => !!s && (EX_KINDS as readonly string[]).includes(s.toLowerCase());

type Base = { id: string; title: string; after?: string; question: string; explain: string[] };

export type BugLang = { lines: string[]; bugIndex: number; fixed: string };
export type BugEx = Base & { kind: "bug"; code: Partial<Record<ExLang, BugLang>>; hint: string; fails: string };

export type PredictEx = Base & {
  kind: "predict";
  code: Partial<Record<ExLang, string>>;
  mode: "choices" | "exact";
  choices: { text: string; correct: boolean }[];
  answer: string;
  trace?: string;
};

export type OrderLine = { text: string; distractor: boolean; group: number | null };
/** `pre` (optional): fixed lines per language (`@python-pre`, ...) shown greyed and locked above the puzzle; never shuffled, never in the answer. */
export type OrderEx = Base & { kind: "order"; code: Partial<Record<ExLang, OrderLine[]>>; pre?: Partial<Record<ExLang, string[]>> };

export type InputType = "int" | "int[]" | "int[][]" | "string" | "string[]" | "bool";
export type InputField = { name: string; type: InputType };
export type BreakEx = Base & {
  kind: "breakit";
  inputs: InputField[];
  /** the example, one text per field (pre-fills the fields) */
  example: string[];
  code: Partial<Record<ExLang, string>>;
  runWrong: string;
  runRight: string;
  /** known breaking inputs, each one value per field */
  breaks: unknown[][];
  hint: string;
};

export type Exercise = BugEx | PredictEx | OrderEx | BreakEx;
export type ParseResult = { ok: true; ex: Exercise } | { ok: false; errors: string[] };

/* ------------------------------------------------------------------ shared scanning */

const SECTION = /^@(python|java|javascript|cpp|python-pre|java-pre|javascript-pre|cpp-pre|run-wrong|run-right)\s*$/;
// a line that ends the current code section
const FIELD = /^(?:%%\s*\w+\s*:|\?\s|hint:|fails:|trace:|answer:|input:|example:|breaks:|sig:|check:|>|[-*]\s+\[[ xX]\]\s)/;

type Scan = { meta: Record<string, string>; question: string; sections: Record<string, string[]>; choices: { text: string; correct: boolean }[]; explain: string[]; fields: Record<string, string> };

function stripNote(v: string): string {
  return v.replace(/\s{2,}#\s.*$/, "").trim();
}

function scan(value: string): Scan {
  const out: Scan = { meta: {}, question: "", sections: {}, choices: [], explain: [], fields: {} };
  let cur: string | null = null;
  for (const raw of value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    const sec = raw.match(SECTION);
    if (sec) {
      cur = sec[1];
      out.sections[cur] = [];
      continue;
    }
    if (FIELD.test(raw)) {
      cur = null;
      let m: RegExpMatchArray | null;
      if ((m = raw.match(/^%%\s*(\w+)\s*:\s*(.*)$/))) out.meta[m[1].toLowerCase()] = stripNote(m[2]);
      else if ((m = raw.match(/^\?\s+(.*)$/))) out.question = m[1].trim();
      else if ((m = raw.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/))) out.choices.push({ text: stripNote(m[2]), correct: m[1] !== " " });
      else if ((m = raw.match(/^>\s?(.*)$/))) out.explain.push(m[1].trim());
      else if ((m = raw.match(/^(hint|fails|trace|answer|input|example|breaks|sig|check):\s*(.*)$/))) out.fields[m[1]] = stripNote(m[2]);
      continue;
    }
    if (cur) out.sections[cur].push(raw);
  }
  return out;
}

const trimBlock = (lines: string[]): string[] => {
  const a = [...lines];
  while (a.length && !a[0].trim()) a.shift();
  while (a.length && !a[a.length - 1].trim()) a.pop();
  return a.map((l) => l.replace(/\s+$/, ""));
};

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function head(s: Scan, errors: string[]): { id: string; title: string; after?: string } {
  const id = s.meta.id || "";
  if (!id) errors.push("missing `%% id:`");
  else if (!KEBAB.test(id)) errors.push(`id "${id}" is not kebab-case`);
  return { id, title: s.meta.title || "", after: s.meta.after || undefined };
}

/** "Find the bug · The loop that never ends" → "The loop that never ends" (the card's eyebrow already names the type). */
export function exerciseTitle(kind: ExKind, title: string): string {
  const t = title.trim();
  const m = t.match(/^([^·:|—–-]+?)\s*[·:|—–-]\s*(.+)$/);
  if (m && TITLE_LABELS[kind].includes(m[1].trim().toLowerCase())) return m[2].trim();
  return TITLE_LABELS[kind].includes(t.toLowerCase()) ? "" : t;
}

/* ------------------------------------------------------------------ the four parsers */

const langSections = (s: Scan) => EX_LANGS.filter((l) => s.sections[l]?.some((x) => x.trim()));

function parseBug(s: Scan): ParseResult {
  const errors: string[] = [];
  const base = head(s, errors);
  const code: BugEx["code"] = {};
  for (const l of langSections(s)) {
    const marker = l === "python" ? /^(.*?)\s*#!\s?(.*)$/ : /^(.*?)\s*\/\/!\s?(.*)$/;
    const lines = trimBlock(s.sections[l]);
    const at: number[] = [];
    lines.forEach((x, i) => marker.test(x) && at.push(i));
    if (at.length !== 1) {
      errors.push(`${l}: needs exactly one ${l === "python" ? "#!" : "//!"} marker (found ${at.length})`);
      continue;
    }
    const m = lines[at[0]].match(marker)!;
    const buggy = m[1].replace(/\s+$/, "");
    const indent = buggy.match(/^\s*/)![0];
    const fixed = indent + m[2].trim();
    if (!m[2].trim()) errors.push(`${l}: the marker has no fixed line after it`);
    else if (fixed.trim() === buggy.trim()) errors.push(`${l}: the fixed line equals the buggy line`);
    const shown = lines.map((x, i) => (i === at[0] ? buggy : x));
    code[l] = { lines: shown, bugIndex: at[0], fixed };
  }
  if (!Object.keys(code).length) errors.push("no language section with a marked line");
  if (!s.question) errors.push("missing `? question`");
  if (!s.fields.fails) errors.push("missing `fails:`");
  if (!s.explain.length) errors.push("missing `>` explanation");
  if (errors.length) return { ok: false, errors };
  return { ok: true, ex: { kind: "bug", ...base, question: s.question, explain: s.explain, code, hint: s.fields.hint || "", fails: s.fields.fails } };
}

function parsePredict(s: Scan): ParseResult {
  const errors: string[] = [];
  const base = head(s, errors);
  const code: PredictEx["code"] = {};
  for (const l of langSections(s)) code[l] = trimBlock(s.sections[l]).join("\n");
  if (!Object.keys(code).length) errors.push("no language section");
  if (!s.question) errors.push("missing `? question`");
  const exact = s.fields.answer !== undefined && s.fields.answer !== "";
  if (exact && s.choices.length) errors.push("use `answer:` or choices, not both");
  if (!exact) {
    if (s.choices.length < 2 || s.choices.length > 6) errors.push("choices: need 2 to 6 options");
    if (s.choices.filter((c) => c.correct).length !== 1) errors.push("choices: exactly one option must be [x]");
  }
  if (!s.explain.length) errors.push("missing `>` explanation");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    ex: { kind: "predict", ...base, question: s.question, explain: s.explain, code, mode: exact ? "exact" : "choices", choices: exact ? [] : s.choices, answer: exact ? s.fields.answer : s.choices.find((c) => c.correct)!.text, trace: s.fields.trace || undefined },
  };
}

const ORDER_PREFIX = /^(~|\{(\d+)\})(?: |$)/;

export function parseOrderLines(raw: string[]): OrderLine[] {
  const out: OrderLine[] = [];
  for (const r of raw) {
    if (!r.trim()) continue;
    let text = r.replace(/\s+$/, "");
    let distractor = false;
    let group: number | null = null;
    const m = text.match(ORDER_PREFIX);
    if (m) {
      if (m[1] === "~") distractor = true;
      else group = Number(m[2]);
      text = text.slice(m[0].length);
    }
    if (text.trim()) out.push({ text, distractor, group });
  }
  return out;
}

function parseOrder(s: Scan): ParseResult {
  const errors: string[] = [];
  const base = head(s, errors);
  const code: OrderEx["code"] = {};
  for (const l of langSections(s)) {
    const lines = parseOrderLines(s.sections[l]);
    const n = lines.filter((x) => !x.distractor).length;
    if (n < 2) errors.push(`${l}: needs at least 2 solution lines`);
    const groups = new Map<number, number>();
    lines.forEach((x) => x.group !== null && groups.set(x.group, (groups.get(x.group) || 0) + 1));
    for (const [g, c] of groups) if (c < 2) errors.push(`${l}: group {${g}} has a single line`);
    if (lines.some((x) => x.distractor && x.group !== null)) errors.push(`${l}: a distractor cannot be in a group`);
    code[l] = lines;
  }
  const pre: NonNullable<OrderEx["pre"]> = {};
  for (const l of EX_LANGS) {
    const p = trimBlock(s.sections[`${l}-pre`] ?? []);
    if (!p.length) continue;
    if (!code[l]) errors.push(`${l}-pre: no ${l} section`);
    else pre[l] = p;
  }
  if (!Object.keys(code).length) errors.push("no language section");
  if (!s.question) errors.push("missing `? question`");
  if (!s.explain.length) errors.push("missing `>` explanation");
  if (errors.length) return { ok: false, errors };
  return { ok: true, ex: { kind: "order", ...base, question: s.question, explain: s.explain, code, ...(Object.keys(pre).length ? { pre } : {}) } };
}

/** Split on commas that are not inside brackets or quotes. */
export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let q: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      cur += ch;
      if (ch === "\\") cur += s[++i] ?? "";
      else if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === "[" || ch === "{" || ch === "(") depth++;
    else if (ch === "]" || ch === "}" || ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

const INPUT_TYPES: readonly string[] = ["int", "int[]", "int[][]", "string", "string[]", "bool"];

export function parseSchema(text: string): InputField[] | null {
  const fields: InputField[] = [];
  for (const part of splitTopLevel(text)) {
    const m = part.match(/^([A-Za-z_]\w*)\s*:\s*(int\[\]\[\]|int\[\]|int|string\[\]|string|bool)$/);
    if (!m) return null;
    fields.push({ name: m[1], type: m[2] as InputType });
  }
  return fields.length ? fields : null;
}

/** Loose JSON: single quotes, Python True/False/None, bare words in string lists, trailing commas. */
function looseJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* try the loose forms */
  }
  const fixed = t
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null")
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, g: string) => JSON.stringify(g.replace(/\\'/g, "'")))
    .replace(/,\s*([\]}])/g, "$1");
  return JSON.parse(fixed);
}

export const INPUT_LIMITS = { items: 50, value: 1_000_000, text: 50 } as const;

export type ParsedValue = { ok: true; value: unknown } | { ok: false; error: string };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Turn what a learner typed into a field's value, with the size limits (list length ≤ 50, |values| ≤ 10^6). */
export function parseValue(type: InputType, text: string): ParsedValue {
  const t = text.trim();
  const bad = (error: string): ParsedValue => ({ ok: false, error });
  const intOk = (v: unknown) => (!isInt(v) ? "needs whole numbers" : Math.abs(v) > INPUT_LIMITS.value ? `numbers must be within ±${INPUT_LIMITS.value.toLocaleString("en")}` : "");
  try {
    switch (type) {
      case "int": {
        if (!/^[-+]?\d+$/.test(t)) return bad("needs a whole number");
        const v = Number(t);
        const e = intOk(v);
        return e ? bad(e) : { ok: true, value: v };
      }
      case "bool": {
        if (/^(true|false)$/i.test(t)) return { ok: true, value: t.toLowerCase() === "true" };
        return bad("needs true or false");
      }
      case "string": {
        let s = t;
        if (/^(["'])[\s\S]*\1$/.test(t) && t.length >= 2) s = t.slice(1, -1);
        else s = text;
        return s.length > INPUT_LIMITS.text ? bad(`at most ${INPUT_LIMITS.text} characters`) : { ok: true, value: s };
      }
      case "int[]": {
        const v = looseJson(/^\[/.test(t) ? t : `[${t}]`);
        if (!Array.isArray(v)) return bad("needs a list like [1, 2, 3]");
        if (v.length > INPUT_LIMITS.items) return bad(`at most ${INPUT_LIMITS.items} items`);
        for (const x of v) {
          const e = intOk(x);
          if (e) return bad(e);
        }
        return { ok: true, value: v };
      }
      case "int[][]": {
        const v = looseJson(t);
        if (!Array.isArray(v) || v.some((r) => !Array.isArray(r))) return bad("needs a list of lists like [[1, 2], [3]]");
        if (v.length > INPUT_LIMITS.items || v.some((r: unknown[]) => r.length > INPUT_LIMITS.items)) return bad(`at most ${INPUT_LIMITS.items} rows and ${INPUT_LIMITS.items} items per row`);
        for (const r of v as unknown[][]) for (const x of r) if (intOk(x)) return bad(intOk(x));
        return { ok: true, value: v };
      }
      case "string[]": {
        const v = /^\[/.test(t) ? looseJson(t) : t ? splitTopLevel(t).map((x) => x.replace(/^(["'])([\s\S]*)\1$/, "$2")) : [];
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return bad('needs a list like ["ab", "c"]');
        if (v.length > INPUT_LIMITS.items) return bad(`at most ${INPUT_LIMITS.items} items`);
        if (v.some((x: string) => x.length > INPUT_LIMITS.text)) return bad(`each item at most ${INPUT_LIMITS.text} characters`);
        return { ok: true, value: v };
      }
    }
  } catch {
    return bad("could not read that: check the brackets and commas");
  }
}

/** A value's text for a field (the inverse of parseValue, for pre-filling from `breaks:`). */
const fmt = (v: unknown): string => (Array.isArray(v) ? `[${v.map(fmt).join(", ")}]` : JSON.stringify(v));
export const valueText = (type: InputType, v: unknown): string => (type === "string" ? String(v) : typeof v === "boolean" || typeof v === "number" ? String(v) : fmt(v));

function parseBreakit(s: Scan): ParseResult {
  const errors: string[] = [];
  const base = head(s, errors);
  const inputs = parseSchema(s.fields.input || "");
  if (!inputs) errors.push("`input:` needs fields like `nums: int[], k: int` (types: int, int[], int[][], string, string[], bool)");
  const code: BreakEx["code"] = {};
  for (const l of langSections(s)) code[l] = trimBlock(s.sections[l]).join("\n");
  if (!Object.keys(code).length) errors.push("no language section");
  const runWrong = trimBlock(s.sections["run-wrong"] || []).join("\n");
  const runRight = trimBlock(s.sections["run-right"] || []).join("\n");
  if (!/\bsolve\b/.test(runWrong)) errors.push("@run-wrong must define solve");
  if (!/\bsolve\b/.test(runRight)) errors.push("@run-right must define solve");
  if (!s.question) errors.push("missing `? question`");
  if (!s.explain.length) errors.push("missing `>` explanation");
  let example: string[] = [];
  let breaks: unknown[][] = [];
  if (inputs) {
    const exText = s.fields.example || "";
    if (inputs.length === 1) {
      // the value itself; a quoted string shows without its quotes
      let shown = exText;
      if (inputs[0].type === "string") {
        try {
          const v = looseJson(exText);
          if (typeof v === "string") shown = v;
        } catch {
          /* raw text */
        }
      }
      example = [shown];
    } else {
      // several fields: a JSON array of the values in schema order
      try {
        const arr = looseJson(exText);
        if (!Array.isArray(arr)) throw new Error("not an array");
        example = arr.map((v, i) => (inputs[i] ? valueText(inputs[i].type, v) : ""));
      } catch {
        example = [];
      }
    }
    if (example.length !== inputs.length) errors.push(`example: needs ${inputs.length} value(s) (a JSON array in schema order)`);
    else
      inputs.forEach((f, i) => {
        const r = parseValue(f.type, example[i]);
        if (!r.ok) errors.push(`example ${f.name}: ${r.error}`);
      });
    try {
      const list = looseJson(s.fields.breaks || "[]");
      if (!Array.isArray(list)) throw new Error("not a list");
      breaks = list.map((b) => (inputs.length === 1 ? [b] : (b as unknown[])));
      breaks.forEach((args, i) => {
        if (!Array.isArray(args) || args.length !== inputs.length) errors.push(`breaks[${i}]: needs ${inputs.length} value(s)`);
        else
          inputs.forEach((f, k) => {
            const r = parseValue(f.type, valueText(f.type, args[k]));
            if (!r.ok) errors.push(`breaks[${i}] ${f.name}: ${r.error}`);
          });
      });
    } catch {
      errors.push("`breaks:` must be a JSON list of inputs");
    }
  }
  if (errors.length || !inputs) return { ok: false, errors };
  return { ok: true, ex: { kind: "breakit", ...base, question: s.question, explain: s.explain, inputs, example, code, runWrong, runRight, breaks, hint: s.fields.hint || "" } };
}

/** Parse one exercise fence (the text between the ``` lines). Never throws. */
export function parseExercise(kind: ExKind, value: string): ParseResult {
  try {
    const s = scan(value);
    switch (kind) {
      case "bug":
        return parseBug(s);
      case "predict":
        return parsePredict(s);
      case "order":
        return parseOrder(s);
      case "breakit":
        return parseBreakit(s);
    }
  } catch (e) {
    return { ok: false, errors: [`could not read the block: ${(e as Error).message}`] };
  }
}

/* ------------------------------------------------------------------ checks (client and tests) */

/** Predict, exact mode: trimmed, whitespace collapsed, case kept. */
export const normalizeAnswer = (s: string) => s.replace(/\r/g, "").split("\n").map((l) => l.trim().replace(/\s+/g, " ")).filter((l, i, a) => l || (i > 0 && i < a.length - 1)).join("\n").trim();
export const answerMatches = (given: string, answer: string) => normalizeAnswer(given) === normalizeAnswer(answer);

/** Language to show: the learner's, else the first one the block has. */
export function pickLang<T>(code: Partial<Record<ExLang, T>>, lang: ExLang): ExLang {
  return code[lang] !== undefined ? lang : (EX_LANGS.find((l) => code[l] !== undefined) as ExLang);
}

/** Order: the lines a correct program has, in order. */
export const solutionOf = (lines: OrderLine[]) => lines.filter((l) => !l.distractor);

/**
 * Order: how a learner's program compares with the solution. `placed` are the lines in the program (indices into `lines`),
 * `tray` those set aside as not needed. Position i is right when its text equals the solution's i-th line, or when both are
 * tagged with the same swap group. `firstWrong` is the first program position that is wrong (null when none), `missing`
 * means the program is too short (a needed line sits in the tray) and `extra` that it is too long (it holds a distractor).
 */
export function checkOrder(lines: OrderLine[], placed: number[], tray: number[]): { ok: boolean; firstWrong: number | null; missing: boolean; extra: boolean; right: number } {
  const sol = solutionOf(lines);
  const wrongAt = placed.findIndex((li, i) => {
    const want = sol[i];
    const got = lines[li];
    if (!want) return true;
    return !(got.text === want.text || (got.group !== null && got.group === want.group));
  });
  const missing = placed.length < sol.length;
  const extra = placed.length > sol.length;
  const trayBad = tray.some((li) => !lines[li].distractor);
  const firstWrong = wrongAt >= 0 ? wrongAt : missing || trayBad ? placed.length : null;
  const right = placed.filter((li, i) => i < sol.length && (lines[li].text === sol[i].text || (lines[li].group !== null && lines[li].group === sol[i].group))).length;
  return { ok: firstWrong === null && !missing && !extra && !trayBad, firstWrong, missing, extra, right };
}

/** A seeded shuffle that is never the solution order (same puzzle on every visit). */
export function shuffleIndices(n: number, seed: number, avoid?: number[]): number[] {
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const same = (x: number[], y?: number[]) => !!y && x.length === y.length && x.every((v, i) => v === y[i]);
  if (n > 1 && same(a, avoid ?? Array.from({ length: n }, (_, i) => i))) a.push(a.shift() as number);
  return a;
}

/** Hash of a string into a small seed. */
export const seedOf = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/* ------------------------------------------------------------------ break it: running the JS twins */

export type RunOutcome = { status: "ok"; text: string } | { status: "error"; text: string } | { status: "timeout"; text: string };

/** Printable text of a result: JSON, `undefined` spelled out. */
export function showResult(v: unknown): string {
  if (v === undefined) return "undefined";
  if (typeof v === "number" && !Number.isFinite(v)) return String(v);
  try {
    const t = JSON.stringify(v);
    return t.length > 400 ? `${t.slice(0, 400)}…` : t;
  } catch {
    return String(v);
  }
}

/** Run `solve` from a code string on `args` (deep-copied). Used inside the worker; pure otherwise. */
export function evalSolve(code: string, args: unknown[]): RunOutcome {
  try {
    const solve = new Function(`${code}\n;return typeof solve === "function" ? solve : undefined;`)() as ((...a: unknown[]) => unknown) | undefined;
    if (!solve) return { status: "error", text: "solve is not defined" };
    const r = solve(...(JSON.parse(JSON.stringify(args)) as unknown[]));
    return { status: "ok", text: showResult(r) };
  } catch (e) {
    return { status: "error", text: `${(e as Error)?.name || "Error"}: ${(e as Error)?.message || String(e)}`.slice(0, 200) };
  }
}

/** A win: the two outputs differ, or the wrong version crashed or timed out while the right one answered. */
export function isWin(wrong: RunOutcome, right: RunOutcome): boolean {
  if (right.status !== "ok") return false;
  if (wrong.status !== "ok") return true;
  return wrong.text !== right.text;
}
