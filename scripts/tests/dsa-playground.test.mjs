/**
 * DSA Playground and runnable snippets: program-mode requests and answers (judge-lite stdio), the browser program
 * runner (the real JS harness here, and Pyodide when it is installed), draft storage keys, and snippet → program.
 *   node --test scripts/tests/dsa-playground.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire, register } from "node:module";
import { fileURLToPath } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`),
);
const P = await import("../../src/lib/dsa/playground/program.ts");
const D = await import("../../src/lib/dsa/playground/drafts.ts");
const S = await import("../../src/lib/dsa/playground/snippet.ts");
const { jsLabRun } = await import("../../src/lib/learn/labs/jsHarness.ts");
const { HARNESS_PY } = await import("../../src/lib/learn/labs/harness.ts");

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const { transform } = require("sucrase");

/* ------------------------------------------------------------------ program mode on the server judge */

test("buildProgramJudgeRequest: one stdio test with the input and no expected output, the judge's default limits", () => {
  const r = P.buildProgramJudgeRequest({ language: "java", code: "public class Main {}", stdin: "3\n1 2 3\n", now: 1_700_000_000_000 });
  assert.equal(r.mode, "stdio");
  assert.equal(r.language, "java");
  assert.deepEqual(r.tests, [{ id: "0", input: "3\n1 2 3\n", expected: null }]);
  assert.deepEqual(r.limits, { timeMs: 2000, memoryMb: 256 });
  assert.match(r.submissionId, /^pg_java_[a-z0-9]+$/);
  assert.ok(r.submissionId.length <= 128);
  assert.equal(r.stopOnFirstFailure, true);
});

test("programResultFromJudge: OK, runtime error with its exit code, compile error, time limit", () => {
  const ok = P.programResultFromJudge({ verdict: "OK", tests: [{ id: "0", verdict: "OK", timeMs: 96, memoryKb: 38_912, output: "2\n", stderr: "" }] });
  assert.deepEqual([ok.verdict, ok.exitCode, ok.stdout, ok.timeMs, ok.memoryKb, ok.where], ["OK", 0, "2\n", 96, 38_912, "server"]);
  const re = P.programResultFromJudge({ verdict: "RE", tests: [{ id: "0", verdict: "RE", timeMs: 5, memoryKb: 100, message: "ArithmeticException (exit code 1)", stderr: "Exception in thread \"main\" java.lang.ArithmeticException: / by zero" }] });
  assert.equal(re.verdict, "RE");
  assert.equal(re.exitCode, 1);
  assert.match(re.stderr, /by zero/);
  const three = P.programResultFromJudge({ tests: [{ id: "0", verdict: "RE", message: "exit code 3" }] });
  assert.equal(three.exitCode, 3);
  const ce = P.programResultFromJudge({ verdict: "CE", compile: { ok: false, output: "main.cpp:3: error: expected ';'" }, tests: [{ id: "0", verdict: "SKIPPED" }] });
  assert.equal(ce.verdict, "CE");
  assert.equal(ce.exitCode, null);
  assert.match(ce.stderr, /expected ';'/);
  const tle = P.programResultFromJudge({ verdict: "TLE", limits: { timeMs: 2000 }, tests: [{ id: "0", verdict: "TLE", timeMs: 2000 }] });
  assert.equal(tle.verdict, "TLE");
  assert.match(tle.note, /2 s/);
});

test("checkProgramSize and resultLine", () => {
  assert.equal(P.checkProgramSize("  ", ""), "Write some code first.");
  assert.equal(P.checkProgramSize("x".repeat(64 * 1024 + 1), ""), "Code is limited to 64 KB.");
  assert.equal(P.checkProgramSize("print(1)", "y".repeat(64 * 1024 + 1)), "Input is limited to 64 KB.");
  assert.equal(P.checkProgramSize("print(1)", ""), null);
  assert.equal(P.resultLine({ verdict: "OK", stdout: "", stderr: "", exitCode: 0, timeMs: 14, memoryKb: 9318, where: "browser" }), "exit 0 · 14 ms · 9.1 MB");
  assert.ok(P.sameOutput("2\n", "2"));
  assert.ok(P.sameOutput("a  \nb\n\n", "a\nb"));
  assert.ok(!P.sameOutput("1 2", "1  2"));
});

/* ------------------------------------------------------------------ program mode in the browser (the labs harness) */

const runJs = async (code, stdin) => {
  let stdout = "";
  const result = await jsLabRun({ code: "", ts: false, given: null }, P.browserProgramGroups("javascript", code, stdin), { transform: (c, ts) => transform(c, { transforms: ts ? ["typescript"] : [], disableESTransforms: true }).code, out: (t) => (stdout += t) });
  return P.programResultFromHarness({ kind: "done", result, ms: 1 }, stdout);
};

test("JS program: stdin through fs and readline, stdout and stderr apart, sloppy mode, top-level await", async () => {
  const r = await runJs('const d = require("fs").readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);\nconsole.log(d.slice(1).reduce((a, b) => a + b, 0));\nconsole.error("debug line");\nfor (i = 0; i < 2; i++) process.stdout.write("x");\nawait 0;\nconsole.log([1, "a", { k: [2] }]);', "3\n1 2 3\n");
  assert.equal(r.verdict, "OK");
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "6\nxx[ 1, 'a', { k: [ 2 ] } ]\n");
  assert.equal(r.stderr, "debug line");
  assert.equal(r.where, "browser");
  assert.equal(typeof r.timeMs, "number");
  const rl = await runJs('const rl = require("readline").createInterface({ input: process.stdin });\nconst lines = [];\nrl.on("line", (l) => lines.push(l));\nrl.on("close", () => console.log(lines.length, lines.join("|")));', "a\nb\nc\n");
  assert.equal(rl.stdout, "3 a|b|c\n");
});

test("JS program: process.exit code, a thrown error with its line, a syntax error with its line", async () => {
  const ex = await runJs('console.log("before");\nprocess.exit(3);\nconsole.log("after");', "");
  assert.deepEqual([ex.verdict, ex.exitCode, ex.stdout], ["RE", 3, "before\n"]);
  const err = await runJs("const a = 1;\nnull.x;", "");
  assert.equal(err.exitCode, 1);
  assert.match(err.stderr, /^TypeError: .*\n {4}at main\.js line 2$/);
  const syn = await runJs("const a = 1;\nconst b = ;\n", "");
  assert.equal(syn.exitCode, 1);
  assert.match(syn.stderr, /^SyntaxError: .*\n {4}at main\.js line 2$/);
});

test("JS program: `import` inside the program's text doesn't trip the labs' import check", async () => {
  const r = await runJs('const s = "import x from \\"y\\"";\nconsole.log(s.length);', "");
  assert.equal(r.verdict, "OK");
  assert.equal(r.stdout, "17\n");
});

const pyodideDir = path.join(site, "node_modules/pyodide");
test("Python program on Pyodide: stdin, input(), stderr apart, sys.exit, tracebacks, memory", { skip: !fs.existsSync(path.join(pyodideDir, "pyodide.js")) && "pyodide not installed", timeout: 120_000 }, async () => {
  const { loadPyodide } = require(path.join(pyodideDir, "pyodide.js"));
  let stdout = "";
  const py = await loadPyodide({ indexURL: pyodideDir + "/", stdout: (s) => (stdout += s + "\n"), stderr: (s) => (stdout += s + "\n") });
  py.runPython(HARNESS_PY);
  const entry = py.globals.get("__hk_lab_run");
  const run = (code, stdin) => {
    stdout = "";
    const groups = P.browserProgramGroups("python", code, stdin).map((g) => ({ name: g.name, src: g.src }));
    const result = JSON.parse(entry("", "", JSON.stringify(groups)));
    return P.programResultFromHarness({ kind: "done", result, ms: 1 }, stdout);
  };
  const ok = run('import sys\nn = int(input())\nnums = list(map(int, sys.stdin.readline().split()))\nprint(sum(nums[:n]))\nprint("note", file=sys.stderr)\nimport json\nprint(json.dumps({"import": 1}))', "3\n1 2 3\n");
  assert.equal(ok.verdict, "OK");
  assert.equal(ok.stdout, '6\n{"import": 1}\n');
  assert.equal(ok.stderr, "note");
  assert.equal(typeof ok.memoryKb, "number");
  const exit = run('print("a")\nraise SystemExit(4)', "");
  assert.deepEqual([exit.verdict, exit.exitCode, exit.stdout], ["RE", 4, "a\n"]);
  const tb = run("def f(x):\n    return 1 // x\n\nf(0)", "");
  assert.equal(tb.exitCode, 1);
  assert.match(tb.stderr, /Traceback[\s\S]*File "main\.py", line 4[\s\S]*File "main\.py", line 2[\s\S]*ZeroDivisionError/);
  const syn = run("x = (1,\nprint(x", "");
  assert.equal(syn.exitCode, 1);
  assert.match(syn.stderr, /main\.py[\s\S]*SyntaxError/);
  const eof = run("input()", "");
  assert.match(eof.stderr, /EOFError/);
  const main = run('if __name__ == "__main__":\n    print("main")', "");
  assert.equal(main.stdout, "main\n");
  // the run leaves the interpreter as it found it
  assert.equal(py.runPython("import sys; type(sys.stdin).__name__ != 'StringIO'"), true);
});

test("programResultFromHarness: time limit and a crashed runner", () => {
  const t = P.programResultFromHarness({ kind: "timeout", limitMs: 10_000 }, "partial\n");
  assert.deepEqual([t.verdict, t.exitCode, t.stdout], ["TLE", null, "partial\n"]);
  assert.match(t.note, /10 s/);
  assert.equal(P.programResultFromHarness({ kind: "crash", message: "boom" }, "").verdict, "ERR");
});

/* ------------------------------------------------------------------ drafts */

test("draft storage keys: account flags under pref: (newer wins on merge), device keys per language", () => {
  assert.equal(D.draftFlagKey("python"), "pref:dsa-pg:python");
  assert.equal(D.draftFlagKey("cpp"), "pref:dsa-pg:cpp");
  assert.ok(D.draftFlagKey("java").startsWith("pref:"), "pref: keys merge by updatedAt (saved-paths.ts mergeGameFlags)");
  assert.equal(D.draftLocalKey("javascript"), "dsa.pg.draft.javascript");
  assert.equal(D.previousLocalKey("java"), "dsa.pg.previous.java");
  assert.equal(D.FILE_NAME.java, "Main.java");
  for (const l of ["python", "javascript", "java", "cpp"]) assert.ok(D.STARTERS[l].code.length > 20 && D.STARTERS[l].stdin);
});

test("decodeDraft, newerDraft, fitsAccount", () => {
  assert.deepEqual(D.decodeDraft({ code: "x", stdin: "1", updatedAt: 5 }), { code: "x", stdin: "1", updatedAt: 5 });
  assert.deepEqual(D.decodeDraft(JSON.stringify({ code: "x" })), { code: "x", stdin: "", updatedAt: 0 });
  assert.equal(D.decodeDraft("nope"), null);
  assert.equal(D.decodeDraft({ stdin: "1" }), null);
  const a = { code: "a", stdin: "", updatedAt: 1 };
  const b = { code: "b", stdin: "", updatedAt: 2 };
  assert.equal(D.newerDraft(a, b), b);
  assert.equal(D.newerDraft(b, a), b);
  assert.equal(D.newerDraft(null, a), a);
  assert.ok(D.fitsAccount({ code: "x".repeat(15_000), stdin: "y".repeat(1000) }));
  assert.ok(!D.fitsAccount({ code: "x".repeat(16_001), stdin: "" }));
});

test("decodeIncoming: a fresh, well-formed hand-off from a lesson only", () => {
  const now = 1_000_000_000;
  const good = JSON.stringify({ lang: "java", code: "class A {}", stdin: "", from: { title: "Prefix sums", href: "/dsa/concepts/x" }, at: now - 1000 });
  assert.equal(D.decodeIncoming(good, now).lang, "java");
  assert.equal(D.decodeIncoming(good, now).from.href, "/dsa/concepts/x");
  assert.equal(D.decodeIncoming(JSON.stringify({ lang: "java", code: "x", at: now - 11 * 60_000 }), now), null, "stale");
  assert.equal(D.decodeIncoming(JSON.stringify({ lang: "ruby", code: "x", at: now }), now), null);
  assert.equal(D.decodeIncoming(JSON.stringify({ lang: "python", code: "x", at: now, from: { title: "t", href: "https://evil.example" } }), now).from, undefined);
  assert.equal(D.decodeIncoming("{", now), null);
});

/* ------------------------------------------------------------------ snippets */

const TEMPLATE = {
  python: "def count_runs(amounts, target):\n    seen = {0: 1}\n    total = 0\n    count = 0\n    for amount in amounts:\n        total += amount\n        count += seen.get(total - target, 0)\n        seen[total] = seen.get(total, 0) + 1\n    return count",
  java: "public long countRuns(int[] amounts, int target) {\n    java.util.HashMap<Long, Integer> seen = new java.util.HashMap<>();\n    seen.put(0L, 1);\n    long total = 0;\n    long count = 0;\n    for (int amount : amounts) {\n        total += amount;\n        count += seen.getOrDefault(total - target, 0);\n        seen.put(total, seen.getOrDefault(total, 0) + 1);\n    }\n    return count;\n}",
  cpp: "long long countRuns(vector<int>& amounts, int target) {\n    unordered_map<long long, int> seen;\n    seen[0] = 1;\n    long long total = 0, count = 0;\n    for (int amount : amounts) {\n        total += amount;\n        count += seen[total - target];\n        seen[total] += 1;\n    }\n    return count;\n}",
  javascript: "function countRuns(amounts, target) {\n  const seen = new Map([[0, 1]]);\n  let total = 0;\n  let count = 0;\n  for (const amount of amounts) {\n    total += amount;\n    count += seen.get(total - target) ?? 0;\n    seen.set(total, (seen.get(total) ?? 0) + 1);\n  }\n  return count;\n}",
};
const TRACES = [
  { template: "other", input: { amounts: [9], target: 9 } },
  { template: "count-template", input: { amounts: [3, -3, 3, -3], target: 0 } },
];

test("snippetLang", () => {
  assert.equal(S.snippetLang("py"), "python");
  assert.equal(S.snippetLang("C++"), "cpp");
  assert.equal(S.snippetLang("js"), "javascript");
  assert.equal(S.snippetLang("java"), "java");
  assert.equal(S.snippetLang("sql"), null);
  assert.equal(S.snippetLang(""), null);
});

test("findFunction: the entry function and its parameters in each language", () => {
  assert.deepEqual(S.findFunction("python", TEMPLATE.python).params.map((p) => p.name), ["amounts", "target"]);
  const j = S.findFunction("java", TEMPLATE.java);
  assert.deepEqual([j.name, j.returns, j.params.map((p) => `${p.type} ${p.name}`)], ["countRuns", "long", ["int[] amounts", "int target"]]);
  const c = S.findFunction("cpp", TEMPLATE.cpp);
  assert.deepEqual([c.name, c.params.map((p) => p.type)], ["countRuns", ["vector<int>&", "int"]]);
  assert.equal(S.findFunction("javascript", TEMPLATE.javascript).name, "countRuns");
  // a helper and the function that calls it: the caller is the entry point
  assert.equal(S.findFunction("python", "def helper(x):\n    return x * 2\n\ndef solve(nums):\n    return [helper(v) for v in nums]").name, "solve");
  assert.equal(S.findFunction("javascript", "const twice = (x) => x * 2;\nfunction solve(nums) {\n  return nums.map(twice);\n}").name, "solve");
});

test("isFullProgram: programs run as they are; definitions and fragments don't count", () => {
  assert.ok(S.isFullProgram("python", "def f():\n    return 1\n\nprint(f())"));
  assert.ok(!S.isFullProgram("python", "MOD = 10**9 + 7\n\ndef f(x):\n    return x % MOD"));
  assert.ok(S.isFullProgram("javascript", "function f() { return 1; }\nconsole.log(f());"));
  assert.ok(!S.isFullProgram("javascript", "const f = (x) => x + 1;\nfunction g(a) {\n  return f(a);\n}"));
  assert.ok(S.isFullProgram("java", "public class Main { public static void main(String[] a) {} }"));
  assert.ok(S.isFullProgram("cpp", "int main() { return 0; }"));
});

test("programFromSnippet: the lesson's own example (its trace for this template) and a print, in all four languages", () => {
  for (const lang of ["python", "javascript", "java", "cpp"]) {
    const fn = S.findFunction(lang, TEMPLATE[lang]);
    const ex = S.exampleFromTraces(fn, TRACES, "count-template");
    assert.deepEqual(ex, { amounts: [3, -3, 3, -3], target: 0 }, lang);
    const p = S.programFromSnippet(lang, TEMPLATE[lang], ex);
    assert.ok(p.wrapped && p.runnable, lang);
    assert.ok(p.code.startsWith(lang === "java" ? "import java.util.*;" : lang === "cpp" ? "#include <bits/stdc++.h>" : TEMPLATE[lang].slice(0, 10)), lang);
    assert.equal(S.exampleLabel(p.example), "amounts = [3, -3, 3, -3], target = 0");
  }
  assert.match(S.programFromSnippet("python", TEMPLATE.python, { amounts: [1], target: 1 }).code, /amounts = \[1\]\ntarget = 1\nprint\(count_runs\(amounts, target\)\)\n$/);
  assert.match(S.programFromSnippet("javascript", TEMPLATE.javascript, null).code, /console\.log\(countRuns\(amounts, target\)\);\n$/);
  const java = S.programFromSnippet("java", TEMPLATE.java, { amounts: [3, -3], target: 0 }).code;
  assert.match(java, /class Solution \{\n {4}public long countRuns/);
  assert.match(java, /int\[\] amounts = \{3, -3\};\n {8}int target = 0;\n {8}System\.out\.println\(new Solution\(\)\.countRuns\(amounts, target\)\);/);
  const cpp = S.programFromSnippet("cpp", TEMPLATE.cpp, { amounts: [3, -3], target: 0 }).code;
  assert.match(cpp, /vector<int> amounts = \{3, -3\};\n {4}int target = 0;\n {4}hkPrint\(countRuns\(amounts, target\)\);/);
});

test("programFromSnippet: the JS wrapper really prints the answer", async () => {
  const p = S.programFromSnippet("javascript", TEMPLATE.javascript, { amounts: [3, -3, 3, -3], target: 0 });
  const r = await runJs(p.code, "");
  assert.equal(r.stdout, "4\n");
});

test("programFromSnippet: arrays print, in-place functions print their input, unknown types get no call", () => {
  const arr = S.programFromSnippet("java", "public int[] twice(int[] nums) {\n    return nums;\n}", null);
  assert.match(arr.code, /Arrays\.toString\(new Solution\(\)\.twice\(nums\)\)/);
  const inPlace = S.programFromSnippet("python", "def reverse(nums):\n    nums.reverse()", null);
  assert.match(inPlace.code, /reverse\(nums\)\nprint\(nums\)\n$/);
  const node = S.programFromSnippet("java", "public int depth(TreeNode root) {\n    return root == null ? 0 : 1;\n}", null);
  assert.ok(node.wrapped && !node.runnable);
  assert.match(node.code, /Call depth\(\.\.\.\) here/);
  const pyNode = S.programFromSnippet("python", "def length(head):\n    n = 0\n    while head:\n        n += 1\n        head = head.next\n    return n", null);
  assert.ok(!pyNode.runnable);
});

test("programFromSnippet: a program runs as it is; a fragment isn't runnable", () => {
  const prog = S.programFromSnippet("python", "x = int(input())\nprint(x * 2)", null);
  assert.deepEqual([prog.wrapped, prog.runnable], [false, true]);
  const frag = S.programFromSnippet("python", "if total < target:\n    left += 1", null);
  assert.equal(frag.runnable, false);
  const jsFrag = S.programFromSnippet("javascript", "while (lo < hi) {\n  mid = (lo + hi) >> 1;\n}", null);
  assert.equal(jsFrag.runnable, false);
});

test("defaults by name and use when the lesson has no example", () => {
  const p = S.programFromSnippet("python", "def bfs_hops(n, links, start):\n    graph = [[] for _ in range(n)]\n    for a, b in links:\n        graph[a].append(b)\n    return len(graph[start])", null);
  assert.match(p.code, /links = \[\[0, 1\], \[1, 2\]\]/);
  const s = S.programFromSnippet("javascript", "function shout(word) {\n  return word.toUpperCase();\n}", null);
  assert.match(s.code, /const word = "banana";/);
});
