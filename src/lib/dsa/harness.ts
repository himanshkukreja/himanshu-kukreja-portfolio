/**
 * DSA Mastery's browser judge for Python and JavaScript, on the code-labs workers (src/lib/learn/labs: Pyodide and
 * the JS worker, harness entry __hk_lab_run). A problem's tests become one generated test file per run, in the labs'
 * own test format, with function-mode drivers that follow the judge's harness conventions exactly
 * (services/judge/src/harness on the judge branch: types.ts fnNameFor, python.ts, javascript.ts):
 *
 * - names: Python uses the signature's snake_case name, Java/C++/JS camelCase; a LeetCode-style `class Solution`
 *   with that method is accepted too (Python also accepts the camelCase name, as the judge does);
 * - inputs: the argument list in signature order, built from each test's `input` object by param name;
 * - values: JSON; int/long as integers, double as floats, bool, string, char (one character), T[] nested,
 *   ListNode as a JSON list, TreeNode in LeetCode level order with nulls (ListNode/TreeNode are predefined);
 * - checkers: exact (identical JSON values), unordered (top-level array as a multiset), float:<eps> (absolute or
 *   relative tolerance).
 *
 * Pure and dependency-free, so the server can reuse the name rules (the /api/dsa/judge route) and tests can import it.
 */
import type { DsaLang, DsaSignature, DsaTestCase } from "./types";

/* ------------------------------------------------------------------ names (= judge harness types.ts) */

export function camelCase(fn: string): string {
  return fn.replace(/_+([a-zA-Z0-9])/g, (_m, c: string) => c.toUpperCase());
}

export function snakeCase(fn: string): string {
  return fn.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** The name the learner must use in each language (the judge's fnNameFor). */
export function fnNameFor(language: DsaLang | string, fn: string): string {
  return language === "python" ? snakeCase(fn) : camelCase(fn);
}

/* ------------------------------------------------------------------ types */

type TypeDesc = string | ["array", TypeDesc];

/** The judge's compact runtime type descriptor: "int", ["array", "int"], "TreeNode"… */
export function typeDescriptor(t: string): TypeDesc {
  const s = t.replace(/\s+/g, "");
  if (s.endsWith("[]")) return ["array", typeDescriptor(s.slice(0, -2))];
  return s === "boolean" ? "bool" : s;
}

const PY_TYPE: Record<string, string> = { int: "int", long: "int", double: "float", bool: "bool", string: "str", char: "str", ListNode: "Optional[ListNode]", TreeNode: "Optional[TreeNode]" };
const JAVA_TYPE: Record<string, string> = { int: "int", long: "long", double: "double", bool: "boolean", string: "String", char: "char", ListNode: "ListNode", TreeNode: "TreeNode" };
const CPP_TYPE: Record<string, string> = { int: "int", long: "long long", double: "double", bool: "bool", string: "string", char: "char", ListNode: "ListNode*", TreeNode: "TreeNode*" };
const JAVA_BOX: Record<string, string> = { int: "Integer", long: "Long", double: "Double", bool: "Boolean", char: "Character" };

function pyType(t: string): string {
  const s = t.replace(/\s+/g, "");
  if (s.endsWith("[]")) return `List[${pyType(s.slice(0, -2))}]`;
  return PY_TYPE[s] || "object";
}
function javaType(t: string, inner = false): string {
  const s = t.replace(/\s+/g, "");
  if (s.endsWith("[]")) return `${javaType(s.slice(0, -2), inner)}[]`;
  return (inner && JAVA_BOX[s]) || JAVA_TYPE[s] || "Object";
}
function cppType(t: string, param = false): string {
  const s = t.replace(/\s+/g, "");
  if (s.endsWith("[]")) {
    const v = `vector<${cppType(s.slice(0, -2))}>`;
    return param ? `${v}&` : v;
  }
  return CPP_TYPE[s] || "auto";
}
const jsDoc: Record<string, string> = { int: "number", long: "number", double: "number", bool: "boolean", string: "string", char: "string", ListNode: "ListNode", TreeNode: "TreeNode" };
function jsType(t: string): string {
  const s = t.replace(/\s+/g, "");
  if (s.endsWith("[]")) return `${jsType(s.slice(0, -2))}[]`;
  return jsDoc[s] || "*";
}

/* ------------------------------------------------------------------ starter code */

export function starterCode(lang: DsaLang, sig: DsaSignature): string {
  const params = sig.params;
  if (lang === "python") {
    const name = snakeCase(sig.fn);
    return `def ${name}(${params.map((p) => `${p.name}: ${pyType(p.type)}`).join(", ")}) -> ${pyType(sig.returns)}:\n    # Write your solution here.\n    pass\n`;
  }
  const name = camelCase(sig.fn);
  const camelParams = params.map((p) => ({ name: camelCase(p.name), type: p.type }));
  if (lang === "javascript") {
    const doc = ["/**", ...camelParams.map((p) => ` * @param {${jsType(p.type)}} ${p.name}`), ` * @return {${jsType(sig.returns)}}`, " */"].join("\n");
    return `${doc}\nfunction ${name}(${camelParams.map((p) => p.name).join(", ")}) {\n  // Write your solution here.\n}\n`;
  }
  if (lang === "java") {
    return `class Solution {\n    public ${javaType(sig.returns)} ${name}(${camelParams.map((p) => `${javaType(p.type)} ${p.name}`).join(", ")}) {\n        // Write your solution here.\n        ${defaultReturn("java", sig.returns)}\n    }\n}\n`;
  }
  return `#include <bits/stdc++.h>\nusing namespace std;\n\n${cppType(sig.returns)} ${name}(${camelParams
    .map((p) => (p.type.endsWith("[]") ? `const ${cppType(p.type, true)} ${p.name}` : `${cppType(p.type)} ${p.name}`))
    .join(", ")}) {\n    // Write your solution here.\n    ${defaultReturn("cpp", sig.returns)}\n}\n`;
}

function defaultReturn(lang: "java" | "cpp", t: string): string {
  const s = t.replace(/\s+/g, "");
  if (s.endsWith("[]")) return lang === "java" ? `return new ${javaType(s.slice(0, -2))}[0];` : "return {};";
  if (s === "bool") return "return false;";
  if (s === "string") return 'return "";';
  if (s === "ListNode" || s === "TreeNode") return lang === "java" ? "return null;" : "return nullptr;";
  if (s === "char") return lang === "java" ? "return ' ';" : "return ' ';";
  return "return 0;";
}

/* ------------------------------------------------------------------ the test file */

export type WireCase = { name: string; args: unknown[]; expected: unknown; hidden: boolean };

/** Test cases in the judge's encoding: the argument list in signature order. */
export function wireCases(sig: DsaSignature, cases: DsaTestCase[], hidden: boolean): WireCase[] {
  return cases.map((c) => ({ name: c.name, args: sig.params.map((p) => c.input[p.name]), expected: c.output, hidden }));
}

/** "exact" | "unordered" | "float:<eps>" → the driver's compare spec */
function compareSpec(checker: string): { mode: "exact" | "unordered" | "float"; eps: number } {
  const c = (checker || "exact").trim();
  if (c === "unordered" || c === "unordered:deep") return { mode: "unordered", eps: 0 };
  const m = c.match(/^float(?::(.+))?$/);
  if (m) return { mode: "float", eps: Number(m[1] ?? 1e-6) || 1e-6 };
  return { mode: "exact", eps: 0 };
}

/** JSON text as a string literal valid in both JavaScript and Python. */
const lit = (v: unknown) => JSON.stringify(JSON.stringify(v));

const MARK = "__DSA__";

export const GIVEN_PY = `from typing import *
import math, collections, heapq, bisect, itertools, functools
from collections import deque, defaultdict, Counter


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
`;

export const GIVEN_JS = `function ListNode(val, next) { this.val = val === undefined ? 0 : val; this.next = next === undefined ? null : next; }
function TreeNode(val, left, right) { this.val = val === undefined ? 0 : val; this.left = left === undefined ? null : left; this.right = right === undefined ? null : right; }
`;

/** Python test file: one `def test_cN()` per case, titled with the case name. */
export function pythonTests(sig: DsaSignature, cases: WireCase[], checker: string): string {
  const meta = { snake: snakeCase(sig.fn), camel: camelCase(sig.fn), params: sig.params.map((p) => typeDescriptor(p.type)), returns: typeDescriptor(sig.returns), cmp: compareSpec(checker) };
  const lines = [
    "import json as _dsa_json",
    `_DSA = _dsa_json.loads(${lit(meta)})`,
    `_DSA_CASES = _dsa_json.loads(${lit(cases)})`,
    "",
    "def _dsa_target():",
    "    g = globals()",
    '    S = g.get("Solution")',
    "    if isinstance(S, type):",
    '        inst = S()',
    '        t = getattr(inst, _DSA["snake"], None) or getattr(inst, _DSA["camel"], None)',
    "        if callable(t):",
    "            return t",
    '    t = g.get(_DSA["snake"]) or g.get(_DSA["camel"])',
    "    if not callable(t):",
    `        raise NameError("${MARK}NAME:define a function named " + _DSA["snake"] + " (or class Solution with that method)")`,
    "    return t",
    "",
    "def _dsa_to(t, v):",
    "    if isinstance(t, list):",
    "        return None if v is None else [_dsa_to(t[1], x) for x in v]",
    '    if t == "ListNode":',
    "        d = c = ListNode(0)",
    "        for x in (v or []):",
    "            c.next = ListNode(x)",
    "            c = c.next",
    "        return d.next",
    '    if t == "TreeNode":',
    "        if not v or v[0] is None:",
    "            return None",
    "        root = TreeNode(v[0]); q = deque([root]); k = 1",
    "        while q and k < len(v):",
    "            n = q.popleft()",
    "            if k < len(v):",
    "                if v[k] is not None:",
    "                    n.left = TreeNode(v[k]); q.append(n.left)",
    "                k += 1",
    "            if k < len(v):",
    "                if v[k] is not None:",
    "                    n.right = TreeNode(v[k]); q.append(n.right)",
    "                k += 1",
    "        return root",
    '    if t == "double":',
    "        return float(v)",
    "    return v",
    "",
    "def _dsa_from(t, v):",
    "    if isinstance(t, list):",
    "        return None if v is None else [_dsa_from(t[1], x) for x in v]",
    '    if t == "ListNode":',
    "        out = []",
    "        while v is not None and len(out) < 10000000:",
    "            out.append(v.val); v = v.next",
    "        return out",
    '    if t == "TreeNode":',
    "        order = []; q = deque([v] if v is not None else [])",
    "        while q:",
    "            n = q.popleft(); order.append(n)",
    "            if n is not None:",
    "                q.append(n.left); q.append(n.right)",
    "        while order and order[-1] is None:",
    "            order.pop()",
    "        return [None if n is None else n.val for n in order]",
    '    if t == "double":',
    '        f = float(v)',
    '        return None if f != f or f in (float("inf"), float("-inf")) else f',
    '    if t in ("int", "long"):',
    "        if isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and v != int(v)):",
    "            return v",
    "        return int(v)",
    '    if t == "bool":',
    "        return v if isinstance(v, bool) else v",
    "    return v",
    "",
    "def _dsa_eq(a, b):",
    '    cmp = _DSA["cmp"]',
    '    if cmp["mode"] == "float":',
    "        def feq(x, y):",
    "            if isinstance(x, list) and isinstance(y, list):",
    "                return len(x) == len(y) and all(feq(p, q) for p, q in zip(x, y))",
    "            if isinstance(x, (int, float)) and isinstance(y, (int, float)) and not isinstance(x, bool) and not isinstance(y, bool):",
    '                d = abs(x - y); return d <= cmp["eps"] or d <= cmp["eps"] * abs(y)',
    "            return x == y and type(x) == type(y)",
    "        return feq(a, b)",
    '    if cmp["mode"] == "unordered" and isinstance(a, list) and isinstance(b, list):',
    '        k = lambda x: _dsa_json.dumps(x, sort_keys=True)',
    "        return sorted(map(k, a)) == sorted(map(k, b))",
    '    return _dsa_json.dumps(a, sort_keys=True) == _dsa_json.dumps(b, sort_keys=True)',
    "",
    "def _dsa_check(i):",
    "    c = _DSA_CASES[i]",
    '    args = [_dsa_to(t, v) for t, v in zip(_DSA["params"], c["args"])]',
    "    res = _dsa_target()(*args)",
    '    out = _dsa_from(_DSA["returns"], res)',
    "    try:",
    '        got = _dsa_json.dumps(out)',
    "    except (TypeError, ValueError):",
    '        got = repr(out)',
    '    if not c["hidden"]:',
    '        viz.emit("dsa", got=got[:2000])',
    '    if not _dsa_eq(out, c["expected"]):',
    `        raise AssertionError("${MARK}WA:" + ("" if c["hidden"] else got[:400]))`,
    "",
  ];
  cases.forEach((c, i) => {
    lines.push(`def test_c${i}():`, `    ${JSON.stringify(`${c.hidden ? "hidden · " : ""}${c.name}`)}`, `    _dsa_check(${i})`, "");
  });
  return lines.join("\n");
}

/** JavaScript test file, in the JS labs harness's format: test("title", () => …). */
export function javascriptTests(sig: DsaSignature, cases: WireCase[], checker: string): string {
  const fn = camelCase(sig.fn);
  if (!/^[A-Za-z_$][\w$]*$/.test(fn)) throw new Error("bad function name");
  const meta = { fn, params: sig.params.map((p) => typeDescriptor(p.type)), returns: typeDescriptor(sig.returns), cmp: compareSpec(checker) };
  return `const __dsa = JSON.parse(${lit(meta)});
const __dsaCases = JSON.parse(${lit(cases)});
const __dsaTarget = () => {
  if (typeof Solution === "function") { const s = new Solution(); if (typeof s[__dsa.fn] === "function") return s[__dsa.fn].bind(s); }
  if (typeof ${fn} === "function") return ${fn};
  throw new Error("${MARK}NAME:define a function named " + __dsa.fn + " (or class Solution with that method)");
};
const __dsaTo = (t, v) => {
  if (Array.isArray(t)) return v == null ? null : v.map((x) => __dsaTo(t[1], x));
  if (t === "ListNode") { const d = new ListNode(0); let c = d; for (const x of v || []) { c.next = new ListNode(x); c = c.next; } return d.next; }
  if (t === "TreeNode") {
    if (!v || !v.length || v[0] == null) return null;
    const root = new TreeNode(v[0]); const q = [root]; let h = 0, k = 1;
    while (h < q.length && k < v.length) {
      const n = q[h++];
      if (k < v.length) { if (v[k] != null) { n.left = new TreeNode(v[k]); q.push(n.left); } k++; }
      if (k < v.length) { if (v[k] != null) { n.right = new TreeNode(v[k]); q.push(n.right); } k++; }
    }
    return root;
  }
  return v;
};
const __dsaFrom = (t, v) => {
  if (Array.isArray(t)) return v == null ? null : Array.from(v, (x) => __dsaFrom(t[1], x));
  if (t === "ListNode") { const o = []; while (v != null && o.length < 1e7) { o.push(v.val); v = v.next; } return o; }
  if (t === "TreeNode") {
    const order = []; const q = v == null ? [] : [v]; let h = 0;
    while (h < q.length) { const n = q[h++]; order.push(n); if (n != null) { q.push(n.left ?? null); q.push(n.right ?? null); } }
    while (order.length && order[order.length - 1] == null) order.pop();
    return order.map((n) => (n == null ? null : n.val));
  }
  if (t === "int" || t === "long") return typeof v === "bigint" ? Number(v) : typeof v === "number" && Number.isInteger(v) ? v : v;
  if (t === "double") { const f = Number(v); return Number.isFinite(f) ? f : null; }
  return v;
};
const __dsaKey = (x) => JSON.stringify(x);
const __dsaEq = (a, b) => {
  const cmp = __dsa.cmp;
  if (cmp.mode === "float") {
    const feq = (x, y) => Array.isArray(x) && Array.isArray(y) ? x.length === y.length && x.every((p, i) => feq(p, y[i])) : typeof x === "number" && typeof y === "number" ? Math.abs(x - y) <= cmp.eps || Math.abs(x - y) <= cmp.eps * Math.abs(y) : x === y;
    return feq(a, b);
  }
  if (cmp.mode === "unordered" && Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a.map(__dsaKey).sort()) === JSON.stringify(b.map(__dsaKey).sort());
  return JSON.stringify(a) === JSON.stringify(b);
};
const __dsaCheck = (i) => {
  const c = __dsaCases[i];
  const args = __dsa.params.map((t, k) => __dsaTo(t, c.args[k]));
  const out = __dsaFrom(__dsa.returns, __dsaTarget()(...args));
  const got = out === undefined ? "undefined" : JSON.stringify(out);
  if (!c.hidden) viz.emit("dsa", { got: String(got).slice(0, 2000) });
  assert(__dsaEq(out === undefined ? null : out, c.expected) && out !== undefined, "${MARK}WA:" + (c.hidden ? "" : String(got).slice(0, 400)));
};
${cases.map((c, i) => `test(${JSON.stringify(`${c.hidden ? "hidden · " : ""}${c.name}`)}, () => __dsaCheck(${i}));`).join("\n")}
`;
}

/* ------------------------------------------------------------------ verdicts */

export type Verdict = "AC" | "WA" | "TLE" | "RE" | "CE" | "MLE" | "OLE" | "ERR";

export const VERDICT_LABEL: Record<Verdict, string> = {
  AC: "Accepted",
  WA: "Wrong answer",
  TLE: "Time limit exceeded",
  RE: "Runtime error",
  CE: "Compile error",
  MLE: "Memory limit exceeded",
  OLE: "Output limit exceeded",
  ERR: "Could not run",
};

export type CaseResult = { name: string; hidden: boolean; ok: boolean; ms: number; verdict: Verdict; got?: string; message?: string; line?: number | null };

export type JudgeOutcome = {
  verdict: Verdict;
  passed: number;
  total: number;
  cases: CaseResult[];
  /** compile or setup error text (CE), or the runner's message */
  message?: string;
  ms: number;
  judgedBy: "browser" | "server";
};

type HTest = { group: string; name: string; title: string; ok: boolean; ms: number; error?: { kind: string; message: string; line?: number | null; code?: string | null } };
type HResult = { setup: { kind: string; message: string; line?: number | null } | null; tests: HTest[]; ms: number; viz?: Record<string, { type: string; data: Record<string, unknown> }[]> };

/** The labs harness's result (or a timeout / crash) → a judge-style verdict. `limitMs` is the per-test budget. */
export function outcomeFrom(
  run: { kind: "done"; result: unknown; ms: number } | { kind: "timeout"; limitMs: number } | { kind: "crash"; message: string },
  cases: WireCase[],
  limitMs: number,
): JudgeOutcome {
  const total = cases.length;
  if (run.kind === "timeout") return { verdict: "TLE", passed: 0, total, cases: [], message: `The run took longer than ${Math.round(run.limitMs / 1000)} seconds. Is there an infinite loop?`, ms: run.limitMs, judgedBy: "browser" };
  if (run.kind === "crash") return { verdict: "ERR", passed: 0, total, cases: [], message: run.message, ms: 0, judgedBy: "browser" };
  const r = run.result as HResult;
  if (r.setup) {
    const syntax = /SyntaxError|IndentationError|TabError/.test(r.setup.kind);
    return { verdict: syntax ? "CE" : "RE", passed: 0, total, cases: [], message: `${r.setup.kind}: ${r.setup.message}${r.setup.line ? ` (line ${r.setup.line})` : ""}`, ms: r.ms, judgedBy: "browser" };
  }
  const load = r.tests.find((t) => t.name === "(load)");
  if (load) return { verdict: "ERR", passed: 0, total, cases: [], message: `${load.error?.kind || "Error"}: ${load.error?.message || "the tests failed to load"}`, ms: r.ms, judgedBy: "browser" };
  const out: CaseResult[] = r.tests.map((t, i) => {
      const c = cases[i];
      const got = (r.viz?.[`${t.group}:${t.name}`] || []).find((e) => e.type === "dsa")?.data.got as string | undefined;
      const msg = t.error?.message || "";
      let verdict: Verdict = "AC";
      let message: string | undefined;
      if (!t.ok) {
        if (msg.includes(`${MARK}WA:`)) verdict = "WA";
        else if (msg.includes(`${MARK}NAME:`)) {
          verdict = "CE";
          message = msg.slice(msg.indexOf(`${MARK}NAME:`) + MARK.length + 5);
        } else if (/MemoryError|RangeError: (Array buffer|Invalid array length)/.test(`${t.error?.kind}: ${msg}`)) {
          verdict = "MLE";
          message = `${t.error?.kind}: ${msg}`;
        } else {
          verdict = "RE";
          message = `${t.error?.kind || "Error"}: ${msg}`;
        }
      } else if (t.ms > limitMs) {
        verdict = "TLE";
        message = `took ${Math.round(t.ms)} ms (limit ${limitMs} ms in the browser)`;
      }
      return { name: c?.name || t.title, hidden: !!c?.hidden, ok: verdict === "AC", ms: t.ms, verdict, got: c?.hidden ? undefined : got, message: c?.hidden && verdict === "WA" ? undefined : message, line: t.error?.line ?? null };
    });
  const firstBad = out.find((c) => !c.ok);
  return { verdict: firstBad ? firstBad.verdict : out.length === total ? "AC" : "ERR", passed: out.filter((c) => c.ok).length, total, cases: out, message: firstBad?.verdict === "CE" ? firstBad.message : undefined, ms: r.ms, judgedBy: "browser" };
}
