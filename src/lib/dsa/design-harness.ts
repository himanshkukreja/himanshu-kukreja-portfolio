/**
 * Design mode for the browser judge: a class and a sequence of operations (LeetCode's design problems), for the
 * structure lessons' build-it-yourself labs (dsa-mastery resources/structures/<module>/<lesson>/lab/). The same
 * conventions as the content checker (tools/lib/check/design.mjs), so a lab that passes there passes here:
 *
 * - the class name is the same in every language; operation names are the spec's snake_case names, called as
 *   snake_case in Python and camelCase in JavaScript (and Java/C++ on the server judge, once it has design mode);
 * - each case makes a fresh instance and calls the operations in order; `void` methods give null;
 * - a case passes when every return value equals the expected one (JSON equality).
 *
 * The test files run on the code-labs workers (Pyodide and the JS worker), one test per case, like the problem
 * room's function-mode drivers (harness.ts). A failure carries the step it failed at and every value returned so
 * far, so the learner sees exactly where their list went wrong: "after push_back(1), push_back(2), reverse(),
 * to_list() returned [1, 2], expected [2, 1]".
 */
import { camelCase, type Verdict } from "./harness";

export type LabMethod = { name: string; params: { name: string; type: string }[]; returns: string; does: string; cost?: string };
export type LabSpec = { id: string; title: string; class: string; summary: string; methods: LabMethod[]; limits: { timeMs: number } };
export type LabCase = { name: string; ops: string[]; args: unknown[][]; output: unknown[]; note?: string };

export type LabCaseResult = {
  name: string;
  hidden: boolean;
  ok: boolean;
  ms: number;
  verdict: Verdict;
  /** the operation index that went wrong (WA or a crash inside an operation) */
  failAt?: number;
  /** what the learner's class returned, operation by operation, up to the failure */
  got?: unknown[];
  message?: string;
  note?: string;
};

export type LabOutcome = { verdict: Verdict; passed: number; total: number; cases: LabCaseResult[]; message?: string; ms: number };

const MARK = "__DSA__";
const lit = (v: unknown) => JSON.stringify(JSON.stringify(v));

/** The method name a language calls. */
export const labMethodName = (lang: string, name: string) => (lang === "python" ? name : camelCase(name));

/** "push_back(1)", "to_list()" in the learner's language's names. */
export const opText = (lang: string, op: string, args: unknown[]) => `${labMethodName(lang, op)}(${args.map((a) => JSON.stringify(a)).join(", ")})`;

export function labPythonTests(lab: LabSpec, cases: (LabCase & { hidden: boolean })[]): string {
  const lines = [
    "import json as _dsa_json",
    `_DSA_CLASS = ${JSON.stringify(lab.class)}`,
    `_DSA_CASES = _dsa_json.loads(${lit(cases.map((c) => ({ ops: c.ops, args: c.args, expected: c.output })))})`,
    "",
    "def _dsa_lab(i):",
    "    c = _DSA_CASES[i]",
    "    cls = globals().get(_DSA_CLASS)",
    "    if not isinstance(cls, type):",
    `        raise NameError("${MARK}NAME:define a class named " + _DSA_CLASS)`,
    "    obj = cls()",
    "    got = []",
    '    for k, (op, a) in enumerate(zip(c["ops"], c["args"])):',
    "        m = getattr(obj, op, None)",
    "        if not callable(m):",
    `            raise AttributeError("${MARK}NAME:your class has no method " + op)`,
    "        try:",
    "            r = m(*a)",
    "        except Exception as e:",
    '            viz.emit("dsa", got=_dsa_json.dumps(got), at=k)',
    "            raise",
    "        try:",
    "            _dsa_json.dumps(r)",
    "        except (TypeError, ValueError):",
    "            r = repr(r)",
    "        got.append(r)",
    '        if _dsa_json.dumps(r, sort_keys=True) != _dsa_json.dumps(c["expected"][k], sort_keys=True):',
    '            viz.emit("dsa", got=_dsa_json.dumps(got), at=k)',
    `            raise AssertionError("${MARK}WA:" + str(k))`,
    '    viz.emit("dsa", got=_dsa_json.dumps(got), at=-1)',
    "",
  ];
  cases.forEach((c, i) => lines.push(`def test_c${i}():`, `    ${JSON.stringify(`${c.hidden ? "hidden · " : ""}${c.name}`)}`, `    _dsa_lab(${i})`, ""));
  return lines.join("\n");
}

export function labJavascriptTests(lab: LabSpec, cases: (LabCase & { hidden: boolean })[]): string {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(lab.class)) throw new Error("bad class name");
  return `const __labCases = JSON.parse(${lit(cases.map((c) => ({ ops: c.ops.map(camelCase), args: c.args, expected: c.output })))});
const __labRun = (i) => {
  const c = __labCases[i];
  if (typeof ${lab.class} !== "function") throw new Error("${MARK}NAME:define a class named ${lab.class}");
  const obj = new ${lab.class}();
  const got = [];
  for (let k = 0; k < c.ops.length; k++) {
    if (typeof obj[c.ops[k]] !== "function") throw new Error("${MARK}NAME:your class has no method " + c.ops[k]);
    let r;
    try { r = obj[c.ops[k]](...c.args[k]); } catch (e) { viz.emit("dsa", { got: JSON.stringify(got), at: k }); throw e; }
    if (r === undefined) r = null;
    got.push(r);
    if (JSON.stringify(r) !== JSON.stringify(c.expected[k])) { viz.emit("dsa", { got: JSON.stringify(got), at: k }); assert(false, "${MARK}WA:" + k); }
  }
  viz.emit("dsa", { got: JSON.stringify(got), at: -1 });
};
${cases.map((c, i) => `test(${JSON.stringify(`${c.hidden ? "hidden · " : ""}${c.name}`)}, () => __labRun(${i}));`).join("\n")}
`;
}

type HTest = { group: string; name: string; title: string; ok: boolean; ms: number; error?: { kind: string; message: string; line?: number | null } };
type HResult = { setup: { kind: string; message: string; line?: number | null } | null; tests: HTest[]; ms: number; viz?: Record<string, { type: string; data: Record<string, unknown> }[]> };

/** The labs harness's result → a lab verdict, with the failing step of each case. */
export function labOutcome(
  run: { kind: "done"; result: unknown; ms: number } | { kind: "timeout"; limitMs: number } | { kind: "crash"; message: string },
  cases: (LabCase & { hidden: boolean })[],
  limitMs: number,
): LabOutcome {
  const total = cases.length;
  if (run.kind === "timeout") return { verdict: "TLE", passed: 0, total, cases: [], message: `The run took longer than ${Math.round(run.limitMs / 1000)} seconds. Is a loop never reaching null? (A cycle in your list makes a walk go on for ever.)`, ms: run.limitMs };
  if (run.kind === "crash") return { verdict: "ERR", passed: 0, total, cases: [], message: run.message, ms: 0 };
  const r = run.result as HResult;
  if (r.setup) {
    const syntax = /SyntaxError|IndentationError|TabError/.test(r.setup.kind);
    return { verdict: syntax ? "CE" : "RE", passed: 0, total, cases: [], message: `${r.setup.kind}: ${r.setup.message}${r.setup.line ? ` (line ${r.setup.line})` : ""}`, ms: r.ms };
  }
  const load = r.tests.find((t) => t.name === "(load)");
  if (load) return { verdict: "ERR", passed: 0, total, cases: [], message: `${load.error?.kind || "Error"}: ${load.error?.message || "the tests failed to load"}`, ms: r.ms };
  const out: LabCaseResult[] = r.tests.map((t, i) => {
    const c = cases[i];
    const ev = (r.viz?.[`${t.group}:${t.name}`] || []).find((e) => e.type === "dsa")?.data as { got?: string; at?: number } | undefined;
    let got: unknown[] | undefined;
    try {
      got = ev?.got ? (JSON.parse(ev.got) as unknown[]) : undefined;
    } catch {
      got = undefined;
    }
    const at = typeof ev?.at === "number" && ev.at >= 0 ? ev.at : undefined;
    const msg = t.error?.message || "";
    let verdict: Verdict = "AC";
    let message: string | undefined;
    if (!t.ok) {
      if (msg.includes(`${MARK}WA:`)) verdict = "WA";
      else if (msg.includes(`${MARK}NAME:`)) {
        verdict = "CE";
        message = msg.slice(msg.indexOf(`${MARK}NAME:`) + MARK.length + 5);
      } else {
        verdict = "RE";
        message = `${t.error?.kind || "Error"}: ${msg}`;
      }
    } else if (t.ms > limitMs) {
      verdict = "TLE";
      message = `took ${Math.round(t.ms)} ms (limit ${limitMs} ms in the browser)`;
    }
    return { name: c?.name || t.title, hidden: !!c?.hidden, ok: verdict === "AC", ms: t.ms, verdict, failAt: verdict === "AC" ? undefined : at, got, message, note: c?.note };
  });
  const firstBad = out.find((x) => !x.ok);
  return { verdict: firstBad ? firstBad.verdict : out.length === total ? "AC" : "ERR", passed: out.filter((x) => x.ok).length, total, cases: out, message: firstBad?.verdict === "CE" ? firstBad.message : undefined, ms: r.ms };
}

/**
 * One plain sentence on what went wrong in a failed case, for the result panel:
 * "After push_back(1), push_back(2), reverse(): to_list() returned [1, 2], but it should return [2, 1]."
 */
export function labFailureText(lang: string, c: LabCase, res: LabCaseResult): string {
  if (res.verdict === "CE") return res.message || "The class or a method is missing.";
  const k = res.failAt;
  if (k === undefined) return res.message || "This case did not finish.";
  const before = c.ops.slice(0, k).map((op, j) => opText(lang, op, c.args[j]));
  const lead = before.length ? `After ${before.join(", ")}: ` : "As the first call: ";
  const call = opText(lang, c.ops[k], c.args[k]);
  if (res.verdict === "RE") return `${lead}${call} crashed. ${res.message || ""}`.trim();
  const got = res.got?.[k];
  const want = c.output[k];
  return `${lead}${call} returned ${JSON.stringify(got ?? null)}, but it should return ${JSON.stringify(want)}.`;
}
