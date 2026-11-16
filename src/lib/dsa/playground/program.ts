/**
 * Program mode: a whole program with a stdin box, for the DSA Playground and the lessons' runnable snippets.
 *
 * - Python and JavaScript run in the browser on the code-labs workers (src/lib/learn/labs/runner.ts), through their
 *   existing harness entry (__hk_lab_run) and no change to the workers: the program travels inside a one-test file
 *   (pyProgramGroup / jsProgramGroup) that gives it real stdin, keeps stderr apart from stdout, turns sys.exit /
 *   process.exit into an exit code, times the run and (Python) measures peak memory with tracemalloc. The test hands its
 *   numbers back through the harness's `viz` channel (event "program"); stdout streams as the labs' output does.
 * - Java and C++ run on judge-lite in its "stdio" mode (services/judge: one test, expected null = "just run"), signed
 *   in, with the problem judge's limits and caps (/api/dsa/program). buildProgramJudgeRequest and programResultFromJudge
 *   are the request and the answer.
 *
 * Pure and dependency-free (type imports only) so the server, the browser and node --test all load it.
 */
import type { DsaLang } from "../types";

export type ProgramVerdict = "OK" | "RE" | "TLE" | "MLE" | "OLE" | "CE" | "ERR";

export type ProgramResult = {
  verdict: ProgramVerdict;
  stdout: string;
  stderr: string;
  /** null when the program never finished (time limit, compile error, the runner failed) */
  exitCode: number | null;
  timeMs: number | null;
  /** peak memory in KB: Python's traced allocations in the browser, the box's peak on the server; null when unknown */
  memoryKb: number | null;
  where: "browser" | "server";
  /** a line under the output, e.g. "Stopped after 10 s (time limit)" */
  note?: string;
};

export const PROGRAM_LIMITS = {
  maxCodeBytes: 64 * 1024,
  maxStdinBytes: 64 * 1024,
  /** a browser run is stopped (its worker replaced) after this */
  browserTimeoutMs: 10_000,
  /** judge-lite's own defaults for problems (services/judge config.ts) */
  serverTimeMs: 2000,
  serverMemoryMb: 256,
  /** what the browser keeps of a program's stdout (the workers' cap) */
  maxOutputChars: 50_000,
} as const;

export const PROGRAM_GROUP = "program";
/** the viz key the program's numbers come back under (group:test) */
export const PROGRAM_VIZ_KEY = "program:test_program";
const CHECK_GROUP = "check";

export const BROWSER_PROGRAM_LANGS: ReadonlySet<DsaLang> = new Set<DsaLang>(["python", "javascript"]);

export const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** "OK, the code and stdin fit", or why not. */
export function checkProgramSize(code: string, stdin: string): string | null {
  if (!code.trim()) return "Write some code first.";
  if (byteLength(code) > PROGRAM_LIMITS.maxCodeBytes) return "Code is limited to 64 KB.";
  if (byteLength(stdin) > PROGRAM_LIMITS.maxStdinBytes) return "Input is limited to 64 KB.";
  return null;
}

/* ------------------------------------------------------------------ server (judge-lite stdio mode) */

export type ProgramJudgeRequest = {
  submissionId: string;
  language: "java" | "cpp";
  code: string;
  mode: "stdio";
  tests: { id: string; input: string; expected: null }[];
  limits: { timeMs: number; memoryMb: number };
  stopOnFirstFailure: boolean;
};

/** The body /api/dsa/program signs and sends to judge-lite for one program run. */
export function buildProgramJudgeRequest(o: { language: "java" | "cpp"; code: string; stdin: string; now?: number }): ProgramJudgeRequest {
  return {
    submissionId: `pg_${o.language}_${(o.now ?? Date.now()).toString(36)}`,
    language: o.language,
    code: o.code,
    mode: "stdio",
    tests: [{ id: "0", input: o.stdin, expected: null }],
    limits: { timeMs: PROGRAM_LIMITS.serverTimeMs, memoryMb: PROGRAM_LIMITS.serverMemoryMb },
    stopOnFirstFailure: true,
  };
}

type JudgeTest = { id: string; verdict: string; timeMs?: number; memoryKb?: number; message?: string; output?: string; stdout?: string; stderr?: string };
export type ProgramJudgeBody = { verdict?: string; compile?: { ok: boolean; output: string }; tests?: JudgeTest[]; limits?: { timeMs: number } };

/** judge-lite's answer for a stdio run → the Playground's result. */
export function programResultFromJudge(b: ProgramJudgeBody): ProgramResult {
  const base = { where: "server" as const, stdout: "", stderr: "", exitCode: null, timeMs: null, memoryKb: null };
  if (b.verdict === "CE" || (b.compile && !b.compile.ok)) return { ...base, verdict: "CE", stderr: (b.compile?.output || "Compilation failed.").trimEnd(), note: "Compile error" };
  const t = (b.tests || [])[0];
  if (!t) return { ...base, verdict: "ERR", stderr: "The judge returned no result." };
  const time = typeof t.timeMs === "number" ? t.timeMs : null;
  const mem = typeof t.memoryKb === "number" && t.memoryKb > 0 ? t.memoryKb : null;
  const stdout = t.output ?? t.stdout ?? "";
  const stderr = t.stderr ?? "";
  if (t.verdict === "OK" || t.verdict === "AC") return { ...base, verdict: "OK", stdout, stderr, exitCode: 0, timeMs: time, memoryKb: mem };
  const limitS = b.limits?.timeMs ? `${b.limits.timeMs / 1000} s` : "the time limit";
  if (t.verdict === "TLE") return { ...base, verdict: "TLE", stdout, stderr, timeMs: time, memoryKb: mem, note: `Stopped after ${limitS} (time limit)` };
  if (t.verdict === "MLE") return { ...base, verdict: "MLE", stdout, stderr, timeMs: time, memoryKb: mem, note: "Stopped: memory limit exceeded" };
  if (t.verdict === "OLE") return { ...base, verdict: "OLE", stdout, stderr, timeMs: time, memoryKb: mem, note: "Stopped: too much output" };
  // RE: "exit code 3", "ArithmeticException (exit code 1)", "SIGSEGV: …"
  const m = /exit code (\d+)/.exec(t.message || "");
  const exit = m ? Number(m[1]) : 1;
  const msg = t.message && !stderr.includes(t.message) ? `${stderr ? "\n" : ""}${t.message}` : "";
  return { ...base, verdict: "RE", stdout, stderr: `${stderr}${msg}`.trim(), exitCode: exit, timeMs: time, memoryKb: mem };
}

/* ------------------------------------------------------------------ browser (the labs harness) */

/** A JS/Python string literal for any text (JSON's escapes mean the same in both), with `import` spelled so the labs'
 *  import check (jsHarness IMPORT_RE) never sees it inside the literal. */
const lit = (s: string) => JSON.stringify(s).replace(/import/g, "\\u0069mport");

/** The Python test file that runs one program (see the module comment). */
export function pyProgramGroup(code: string, stdin: string): string {
  return `import sys as _pg_sys
import io as _pg_io
import time as _pg_time
import linecache as _pg_lc
import traceback as _pg_tb
try:
    import tracemalloc as _pg_tm
except Exception:
    _pg_tm = None

_PG_SRC = ${lit(code)}
_PG_STDIN = ${lit(stdin)}


def _pg_report(e, err):
    if isinstance(e, SyntaxError):
        err.write("".join(_pg_tb.format_exception_only(type(e), e)))
        return
    frames = [f for f in _pg_tb.extract_tb(e.__traceback__) if f.filename == "main.py"]
    if frames:
        err.write("Traceback (most recent call last):\\n")
        err.write("".join(_pg_tb.format_list(frames)))
    if isinstance(e, RecursionError):
        err.write("RecursionError: maximum recursion depth exceeded (infinite recursion?)\\n")
    else:
        err.write("".join(_pg_tb.format_exception_only(type(e), e)))


def test_program():
    err = _pg_io.StringIO()
    old = (_pg_sys.stdin, _pg_sys.stderr, _pg_sys.argv)
    _pg_sys.stdin = _pg_io.StringIO(_PG_STDIN)
    _pg_sys.stderr = err
    _pg_sys.argv = ["main.py"]
    _pg_lc.cache["main.py"] = (len(_PG_SRC), None, [l + "\\n" for l in _PG_SRC.splitlines()], "main.py")
    g = {"__name__": "__main__", "__file__": "main.py", "__builtins__": __builtins__}
    code = 0
    peak = 0
    traced = False
    if _pg_tm is not None:
        try:
            _pg_tm.start()
            traced = True
        except Exception:
            traced = False
    t0 = _pg_time.perf_counter()
    try:
        exec(compile(_PG_SRC, "main.py", "exec"), g)
    except SystemExit as e:
        c = e.code
        if c is None:
            code = 0
        elif isinstance(c, int):
            code = c
        else:
            err.write(str(c) + "\\n")
            code = 1
    except BaseException as e:
        code = 1
        _pg_report(e, err)
    ms = (_pg_time.perf_counter() - t0) * 1000
    if traced:
        try:
            peak = _pg_tm.get_traced_memory()[1]
            _pg_tm.stop()
        except Exception:
            peak = 0
    try:
        _pg_sys.stdout.flush()
    except Exception:
        pass
    _pg_sys.stdin, _pg_sys.stderr, _pg_sys.argv = old
    viz.emit("program", exit=code, ms=round(ms, 2), memKb=(round(peak / 1024) if traced else None), stderr=err.getvalue()[:65536])
`;
}

/** The JS syntax check: the program inside `if (false) { … }`, so the harness's parser names the line of a syntax error
 *  (V8's Function constructor doesn't) without running anything. Line n of the program is line n + 1 here. */
export function jsCheckGroup(code: string): string {
  return `if (false) {\n${code}\n}`;
}

/**
 * The JavaScript test file that runs one program, Node-style: sloppy mode (the Function constructor), top-level await,
 * console.log/info/debug to stdout and console.error/warn to stderr, require("fs").readFileSync(0) / "/dev/stdin",
 * require("readline") (line and close events, async iteration, question), process.stdin data/end events,
 * process.stdout.write, process.exit, and the readline() / prompt() globals some judges offer.
 */
export function jsProgramGroup(code: string, stdin: string): string {
  return `test("program", async () => {
  const SRC = ${lit(code)};
  const INPUT = ${lit(stdin)};
  const errs = [];
  let pending = "";
  const show = (v, d, seen) => {
    if (typeof v === "string") return d ? "'" + v.replace(/'/g, "\\\\'") + "'" : v;
    if (typeof v === "number") return Object.is(v, -0) ? "-0" : String(v);
    if (typeof v === "bigint") return v + "n";
    if (v === undefined || v === null || typeof v === "boolean" || typeof v === "symbol") return String(v);
    if (typeof v === "function") return "[Function: " + (v.name || "(anonymous)") + "]";
    if (v instanceof Error) return v.stack || String(v);
    seen = seen || new Set();
    if (seen.has(v)) return "[Circular]";
    if (d > 3) return Array.isArray(v) ? "[Array]" : "[Object]";
    seen.add(v);
    try {
      const more = (n) => (n > 100 ? ", ... " + (n - 100) + " more item" + (n - 100 === 1 ? "" : "s") : "");
      if (Array.isArray(v)) return v.length ? "[ " + v.slice(0, 100).map((x) => show(x, d + 1, seen)).join(", ") + more(v.length) + " ]" : "[]";
      if (v instanceof Map) return "Map(" + v.size + ") {" + (v.size ? " " + [...v].slice(0, 100).map(([k, x]) => show(k, d + 1, seen) + " => " + show(x, d + 1, seen)).join(", ") + more(v.size) + " " : "") + "}";
      if (v instanceof Set) return "Set(" + v.size + ") {" + (v.size ? " " + [...v].slice(0, 100).map((x) => show(x, d + 1, seen)).join(", ") + more(v.size) + " " : "") + "}";
      if (ArrayBuffer.isView(v)) return v.constructor.name + "(" + v.length + ") [ " + Array.from(v).slice(0, 100).join(", ") + more(v.length) + " ]";
      const keys = Object.keys(v);
      const name = v.constructor && v.constructor !== Object ? v.constructor.name + " " : "";
      return keys.length ? name + "{ " + keys.slice(0, 100).map((k) => (/^[A-Za-z_$][\\w$]*$/.test(k) ? k : "'" + k + "'") + ": " + show(v[k], d + 1, seen)).join(", ") + more(keys.length) + " }" : name + "{}";
    } finally {
      seen.delete(v);
    }
  };
  const fmt = (a) => a.map((x) => show(x, 0)).join(" ");
  const out = (s) => {
    const t = pending + s;
    const i = t.lastIndexOf("\\n");
    if (i < 0) {
      pending = t;
      return;
    }
    console.log(t.slice(0, i));
    pending = t.slice(i + 1);
  };
  const err = (s) => errs.push(s);
  const cons = {
    log: (...a) => out(fmt(a) + "\\n"),
    info: (...a) => out(fmt(a) + "\\n"),
    debug: (...a) => out(fmt(a) + "\\n"),
    table: (...a) => out(fmt(a) + "\\n"),
    dir: (...a) => out(fmt(a) + "\\n"),
    error: (...a) => err(fmt(a) + "\\n"),
    warn: (...a) => err(fmt(a) + "\\n"),
    trace: (...a) => err(fmt(a) + "\\n"),
    assert: (c, ...a) => { if (!c) err("Assertion failed" + (a.length ? ": " + fmt(a) : "") + "\\n"); },
    time: () => {},
    timeEnd: () => {},
  };
  const lines = INPUT.split("\\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  let at = 0;
  const nextLine = () => (at < lines.length ? lines[at++] : undefined);
  class ProgramExit extends Error {
    constructor(code) {
      super("process.exit(" + code + ")");
      this.code = code;
    }
  }
  const listeners = [];
  const emitter = () => {
    const h = {};
    const e = {
      on(ev, f) { (h[ev] = h[ev] || []).push(f); if (!listeners.includes(e)) listeners.push(e); return e; },
      once(ev, f) { return e.on(ev, f); },
      addListener(ev, f) { return e.on(ev, f); },
      off() { return e; },
      removeListener() { return e; },
      removeAllListeners() { return e; },
      async fire(ev, ...a) { for (const f of h[ev] || []) await f(...a); },
      has(ev) { return !!(h[ev] && h[ev].length); },
    };
    return e;
  };
  const stdinStream = Object.assign(emitter(), {
    fd: 0,
    isTTY: false,
    setEncoding() { return stdinStream; },
    resume() { return stdinStream; },
    pause() { return stdinStream; },
    read() { const rest = lines.slice(at).join("\\n"); at = lines.length; return rest || null; },
    kind: "stdin",
  });
  const process = {
    argv: ["node", "main.js"],
    env: {},
    platform: "browser",
    exitCode: undefined,
    exit(c) { throw new ProgramExit(c === undefined ? (process.exitCode || 0) : c); },
    stdout: { write: (s) => { out(String(s)); return true; }, isTTY: false },
    stderr: { write: (s) => { err(String(s)); return true; }, isTTY: false },
    stdin: stdinStream,
    nextTick: (f, ...a) => { Promise.resolve().then(() => f(...a)); },
    hrtime: Object.assign((p) => { const t = performance.now(); const s = Math.floor(t / 1000); const n = Math.round((t % 1000) * 1e6); return p ? [s - p[0], n - p[1]] : [s, n]; }, { bigint: () => BigInt(Math.round(performance.now() * 1e6)) }),
    memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0 }),
    on() { return process; },
  };
  const fs = {
    readFileSync(p, enc) {
      if (p === 0 || p === "/dev/stdin" || p === "/proc/self/fd/0") { at = lines.length; return INPUT; }
      throw new Error("ENOENT: no such file or directory, open '" + p + "' (programs here can read only stdin)");
    },
  };
  const readlineModule = {
    createInterface() {
      const rl = Object.assign(emitter(), {
        kind: "rl",
        closed: false,
        close() { rl.closed = true; },
        setPrompt() {},
        prompt() {},
        question(q, cb) { out(String(q)); const l = nextLine(); Promise.resolve().then(() => cb(l === undefined ? "" : l)); },
        [Symbol.asyncIterator]: async function* () { let l; while ((l = nextLine()) !== undefined) yield l; },
      });
      return rl;
    },
  };
  const require = (m) => {
    const n = String(m).replace(/^node:/, "");
    if (n === "fs") return fs;
    if (n === "readline") return readlineModule;
    if (n === "process") return process;
    if (n === "util") return { inspect: (v) => show(v, 0), format: (...a) => fmt(a) };
    throw new Error("require(" + JSON.stringify(m) + ") isn't available: programs here run in your browser with no packages (fs for stdin and readline work).");
  };
  const readline = () => nextLine();
  const prompt = (q) => { if (q) out(String(q)); const l = nextLine(); return l === undefined ? null : l; };
  const where = (e) => {
    const m = /main\\.js:(\\d+):(\\d+)/.exec(String((e && e.stack) || ""));
    return m ? Number(m[1]) - 2 : null;
  };
  let exit = 0;
  const t0 = performance.now();
  try {
    const AsyncFunction = (async function () {}).constructor;
    const fn = new AsyncFunction("require", "process", "readline", "prompt", "console", "module", "exports", SRC + "\\n//# sourceURL=main.js");
    const mod = { exports: {} };
    await fn(require, process, readline, prompt, cons, mod, mod.exports);
    for (const e of listeners.slice()) {
      if (e.kind === "stdin") {
        if (e.has("data")) { const rest = lines.slice(at).join("\\n") + (INPUT.endsWith("\\n") ? "\\n" : ""); at = lines.length; if (rest) await e.fire("data", rest); }
        if (e.has("readable")) await e.fire("readable");
        await e.fire("end");
        await e.fire("close");
      } else {
        let l;
        while (!e.closed && (l = nextLine()) !== undefined) await e.fire("line", l);
        await e.fire("close");
      }
    }
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    if (typeof process.exitCode === "number") exit = process.exitCode;
  } catch (e) {
    if (e instanceof ProgramExit) exit = Number(e.code) || 0;
    else {
      exit = 1;
      const name = (e && e.name) || "Error";
      const msg = e && e.message !== undefined ? e.message : String(e);
      const line = where(e);
      err(name + ": " + msg + (line ? "\\n    at main.js line " + line : "") + "\\n");
    }
  }
  const ms = performance.now() - t0;
  if (pending) {
    console.log(pending);
    pending = "";
  }
  viz.emit("program", { exit, ms: Math.round(ms * 100) / 100, memKb: null, stderr: errs.join("").slice(0, 65536) });
});
`;
}

/** The groups one browser run sends (the program's own code goes in a test file, not as the "solution"). */
export function browserProgramGroups(lang: "python" | "javascript", code: string, stdin: string): { name: string; src: string; ts: boolean }[] {
  if (lang === "python") return [{ name: PROGRAM_GROUP, src: pyProgramGroup(code, stdin), ts: false }];
  return [
    { name: CHECK_GROUP, src: jsCheckGroup(code), ts: false },
    { name: PROGRAM_GROUP, src: jsProgramGroup(code, stdin), ts: false },
  ];
}

type HarnessLike = {
  setup: { kind: string; message: string; line?: number | null } | null;
  tests: { group: string; name: string; ok: boolean; error?: { kind: string; message: string; line?: number | null } }[];
  viz?: Record<string, { type: string; data: Record<string, unknown> }[]>;
};
export type BrowserOutcome = { kind: "done"; result: HarnessLike; ms: number } | { kind: "timeout"; limitMs: number } | { kind: "crash"; message: string };

/** A browser run's outcome (runner.runTests) and its streamed stdout → the Playground's result. */
export function programResultFromHarness(o: BrowserOutcome, stdout: string): ProgramResult {
  const base = { where: "browser" as const, stdout, stderr: "", exitCode: null, timeMs: null, memoryKb: null };
  if (o.kind === "timeout") return { ...base, verdict: "TLE", note: `Stopped after ${Math.round(o.limitMs / 1000)} s (time limit)` };
  if (o.kind === "crash") return { ...base, verdict: "ERR", stderr: o.message };
  const r = o.result;
  const ev = r.viz?.[PROGRAM_VIZ_KEY]?.find((e) => e.type === "program");
  if (!ev) {
    const bad = r.setup ?? r.tests.find((t) => t.group === PROGRAM_GROUP && t.error)?.error ?? null;
    return { ...base, verdict: "ERR", stderr: bad ? `${bad.kind}: ${bad.message}` : "The run didn't finish." };
  }
  const d = ev.data;
  const exit = typeof d.exit === "number" ? d.exit : 1;
  let stderr = typeof d.stderr === "string" ? d.stderr : "";
  // a JS syntax error: the check file knows the line (its line n + 1 is the program's line n)
  const chk = r.tests.find((t) => t.group === CHECK_GROUP && t.error);
  if (chk?.error && /^SyntaxError\b/.test(stderr)) {
    const line = typeof chk.error.line === "number" ? chk.error.line - 1 : null;
    stderr = `SyntaxError: ${chk.error.message}${line && line > 0 ? `\n    at main.js line ${line}` : ""}\n`;
  } else if (chk?.error && chk.error.kind === "ImportError") {
    stderr = `${stderr}${stderr ? "\n" : ""}import isn't available here: use require("fs") or require("readline") for input.\n`;
  }
  return {
    ...base,
    verdict: exit === 0 ? "OK" : "RE",
    stderr: stderr.replace(/\s+$/, ""),
    exitCode: exit,
    timeMs: typeof d.ms === "number" ? d.ms : null,
    memoryKb: typeof d.memKb === "number" ? d.memKb : null,
  };
}

/* ------------------------------------------------------------------ comparing two runs */

/** Two outputs are "the same" when they differ only in trailing spaces and blank lines at the end. */
export function sameOutput(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");
  return norm(a) === norm(b);
}

/** "exit 0 · 14 ms · 9.1 MB" */
export function resultLine(r: ProgramResult): string {
  const parts: string[] = [];
  if (r.verdict === "CE") parts.push("compile error");
  else if (r.exitCode !== null) parts.push(`exit ${r.exitCode}`);
  else if (r.verdict === "TLE") parts.push("time limit");
  else if (r.verdict === "MLE") parts.push("memory limit");
  else if (r.verdict === "OLE") parts.push("output limit");
  else parts.push("didn't finish");
  if (r.timeMs !== null) parts.push(r.timeMs < 10 ? `${r.timeMs.toFixed(1)} ms` : `${Math.round(r.timeMs).toLocaleString("en")} ms`);
  if (r.memoryKb !== null) parts.push(r.memoryKb >= 1024 ? `${(r.memoryKb / 1024).toFixed(1)} MB` : `${r.memoryKb} KB`);
  return parts.join(" · ");
}
