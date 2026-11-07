/**
 * The code-lab test harness for JavaScript and TypeScript. It mirrors the Python harness (harness.ts)
 * and returns the same JSON, so the lab room renders either language with one code path. Runs in the JS
 * worker (js.worker.ts, a Web Worker with no network) and in Node (scripts/labs/check-labs.mjs, inside a
 * worker thread with a time limit). Pure: only type imports, so Node's type stripping loads it as is.
 *
 * One run builds one program: the lab's given code, then the reader's code in a nested scope (it may
 * shadow given names), then each test file in its own block (they may declare the same helpers):
 *
 *   (function (__hk) { "use strict"; const { test, assert, viz, ... } = __hk.api;
 *     <given>
 *     return function () {
 *       <the reader's code>
 *       { <visible tests> }  { <hidden tests> } ...
 *     };
 *   })
 *
 * TypeScript is transpiled first (sucrase: types stripped, line numbers kept), and every part is parsed on
 * its own before it runs, so a syntax error names its own file and line. Stack lines are mapped back from
 * the program to each file. `import` is refused (labs run offline); `export` keywords are dropped.
 *
 * Tests: test("title", () => { ... }) (async functions are awaited). Chaos tests: chaos("title", (sim) => ...).
 * Scale: scale((n) => { setup; return () => { the timed work } }). Assertions: assert(cond, msg),
 * assert.equal(actual, expected, msg) (deep), assert.notEqual, assert.close(a, b, tol, msg), assert.throws(fn, ErrorClass | /re/, msg).
 */
import type { ChaosResult, ChaosStep, ChaosTestResult, HarnessError, HarnessFrame, HarnessResult, HarnessTest, HarnessVizEvent, ScaleResult } from "./harness";

export type JsSrc = { code: string; ts: boolean };
export type JsTransform = (code: string, ts: boolean) => string;
export type JsDeps = { transform: JsTransform; out?: (text: string) => void; now?: () => number };
export type JsLabInput = { code: string; ts: boolean; given: JsSrc | null };

const MAX_MSG = 1500;
const VIZ_PER_TEST = 1500;
const VIZ_TOTAL = 6000;
const TRACE_MAX = 400;
const FILE = "hk-lab.js";

const clip = (s: unknown, n = MAX_MSG) => {
  const t = String(s);
  return t.length <= n ? t : t.slice(0, n) + " ... (truncated)";
};

// ------------------------------------------------------------------------------------------ assert

class AssertionError extends Error {
  generic: boolean;
  constructor(message: string | undefined, generic = false) {
    super(message ?? "");
    this.name = "AssertionError";
    this.generic = generic || !message;
  }
}

function fmt(v: unknown, depth = 0): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean" || v == null || typeof v === "bigint") return String(v);
  if (typeof v === "function") return `[function ${(v as { name?: string }).name || "anonymous"}]`;
  if (depth > 2) return "…";
  if (Array.isArray(v)) return `[${v.slice(0, 20).map((x) => fmt(x, depth + 1)).join(", ")}${v.length > 20 ? ", …" : ""}]`;
  if (v instanceof Map) return `Map(${[...v.entries()].slice(0, 20).map(([k, x]) => `${fmt(k, depth + 1)} => ${fmt(x, depth + 1)}`).join(", ")})`;
  if (v instanceof Set) return `Set(${[...v].slice(0, 20).map((x) => fmt(x, depth + 1)).join(", ")})`;
  try {
    const entries = Object.entries(v as Record<string, unknown>).slice(0, 20);
    const name = (v as object).constructor && (v as object).constructor !== Object ? (v as object).constructor.name + " " : "";
    return `${name}{${entries.map(([k, x]) => `${k}: ${fmt(x, depth + 1)}`).join(", ")}}`;
  } catch {
    return String(v);
  }
}

function deepEqual(a: unknown, b: unknown, seen = new Map<unknown, unknown>()): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k), seen)) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], seen)) return false;
  return true;
}

function makeAssert() {
  const assert = (cond: unknown, msg?: string) => {
    if (!cond) throw new AssertionError(msg, !msg);
  };
  assert.ok = assert;
  assert.equal = (actual: unknown, expected: unknown, msg?: string) => {
    if (!deepEqual(actual, expected)) throw new AssertionError(msg ?? `expected ${fmt(expected)}, got ${fmt(actual)}`);
  };
  assert.deepEqual = assert.equal;
  assert.notEqual = (actual: unknown, expected: unknown, msg?: string) => {
    if (deepEqual(actual, expected)) throw new AssertionError(msg ?? `expected something other than ${fmt(expected)}`);
  };
  assert.close = (actual: number, expected: number, tol = 1e-9, msg?: string) => {
    if (!(typeof actual === "number" && Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected))))
      throw new AssertionError(msg ?? `expected about ${expected}, got ${fmt(actual)}`);
  };
  assert.throws = (fn: () => unknown, expected?: (new (...a: never[]) => unknown) | RegExp, msg?: string) => {
    try {
      fn();
    } catch (e) {
      if (typeof expected === "function" && !(e instanceof expected)) throw new AssertionError(msg ?? `expected ${expected.name || "an error"}, got ${(e as Error)?.name ?? typeof e}: ${(e as Error)?.message ?? ""}`);
      if (expected instanceof RegExp && !expected.test(String((e as Error)?.message ?? e))) throw new AssertionError(msg ?? `expected an error matching ${expected}, got: ${(e as Error)?.message ?? e}`);
      return e;
    }
    throw new AssertionError(msg ?? "expected an error, but nothing was thrown");
  };
  assert.fail = (msg?: string) => {
    throw new AssertionError(msg ?? "failed");
  };
  return assert;
}

// ------------------------------------------------------------------------------------------ viz

function safe(v: unknown, depth = 0): unknown {
  if (v == null || typeof v === "boolean" || typeof v === "string") return v ?? null;
  if (typeof v === "number") return Number.isFinite(v) ? v : String(v);
  if (typeof v === "bigint") return Number(v);
  if (depth > 4) return String(v).slice(0, 80);
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => safe(x, depth + 1));
  if (v instanceof Set) {
    const xs = [...v];
    try {
      xs.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
    } catch {
      // keep insertion order
    }
    return xs.slice(0, 200).map((x) => safe(x, depth + 1));
  }
  if (v instanceof Map) return Object.fromEntries([...v.entries()].slice(0, 200).map(([k, x]) => [String(k), safe(x, depth + 1)]));
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 200).map(([k, x]) => [k, safe(x, depth + 1)]));
  return String(v).slice(0, 120);
}

class Viz {
  events: Record<string, HarnessVizEvent[]> = {};
  cur: string | null = null;
  total = 0;
  emit(type: string, data?: Record<string, unknown>) {
    if (this.cur == null || this.total >= VIZ_TOTAL) return;
    const list = (this.events[this.cur] ??= []);
    if (list.length >= VIZ_PER_TEST) return;
    list.push({ type: String(type), data: (safe(data && typeof data === "object" ? data : {}) as Record<string, unknown>) ?? {} });
    this.total++;
  }
}

// ------------------------------------------------------------------------------------------ chaos

/** mulberry32: the same numbers as the Python harness's __hk_rng for the same seed. */
export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class SimCrash extends Error {
  constructor(message?: string) {
    super(message ?? "crashed");
    this.name = "SimCrash";
  }
}

type Task = { name: string; gen: Generator<unknown, unknown, unknown>; done: boolean; started: boolean; onCrash: (() => Generator<unknown, unknown, unknown>) | null };

class Net {
  sim: Sim;
  nodes: string[];
  handlers = new Map<string, (src: string, msg: unknown) => unknown>();
  inflight: [string, string, unknown][] = [];
  cut: Set<string> | null = null;
  constructor(sim: Sim, nodes: string[]) {
    this.sim = sim;
    this.nodes = [...nodes];
  }
  on(node: string, handler: (src: string, msg: unknown) => unknown) {
    this.handlers.set(node, handler);
  }
  send(src: string, dst: string, msg: unknown) {
    this.inflight.push([src, dst, msg]);
    this.sim._t(src, "send", `${src} -> ${dst}: ${label(msg)}`);
  }
  connected(a: string, b: string) {
    return this.cut == null || this.cut.has(a) === this.cut.has(b);
  }
  _deliverOne() {
    const sim = this.sim;
    const i = sim.enabled("interleave") ? Math.floor(sim._rand() * this.inflight.length) : 0;
    const [src, dst, msg] = this.inflight.splice(i, 1)[0];
    const what = `${src} -> ${dst}: ${label(msg)}`;
    if (!this.connected(src, dst)) {
      sim._t("net", "drop", what + " (partitioned)");
      return;
    }
    if (sim.fault("duplicate", 0.3)) {
      this.inflight.push([src, dst, msg]);
      sim._t("net", "duplicate", what + " (will arrive twice)");
    }
    sim._t("net", "deliver", what);
    this.handlers.get(dst)?.(src, msg);
  }
}

const label = (v: unknown) => (typeof v === "string" ? v : (() => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
})());

class Sim {
  seed: number;
  _rand: () => number;
  scenarios: string[];
  trace: ChaosStep[] = [];
  step = 0;
  crashes = 0;
  maxCrashes = 1;
  _tasks: Task[] = [];
  _net: Net | null = null;
  _cur: string | null = null;
  constructor(seed: number, scenarios: string[]) {
    this.seed = seed;
    this._rand = mulberry32(seed);
    this.scenarios = [...scenarios];
  }
  rand() {
    return this._rand();
  }
  randint(a: number, b: number) {
    return a + Math.floor(this._rand() * (b - a + 1));
  }
  choice<T>(xs: Iterable<T>): T {
    const arr = [...xs];
    return arr[Math.floor(this._rand() * arr.length)];
  }
  shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this._rand() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  }
  enabled(s: string) {
    return this.scenarios.includes(s);
  }
  fault(kind: string, p: number) {
    return this.scenarios.includes(kind) && this._rand() < p;
  }
  _t(actor: string, kind: ChaosStep["kind"], text: unknown = "") {
    if (this.trace.length < TRACE_MAX) this.trace.push({ step: this.step, actor: String(actor), kind, label: clip(text, 200) });
  }
  log(msg: unknown) {
    this._t(this._cur ?? "test", "note", label(msg));
  }
  spawn(name: string, fn: (() => Generator<unknown, unknown, unknown>) | Generator<unknown, unknown, unknown>, onCrash?: () => Generator<unknown, unknown, unknown>) {
    const gen = typeof fn === "function" ? fn() : fn;
    if (!gen || typeof (gen as Generator).next !== "function") throw new TypeError("sim.spawn needs a generator function (function* () { ... yield ... }): each yield is a point where another task may run");
    this._tasks.push({ name: String(name), gen, done: false, started: false, onCrash: onCrash ?? null });
    this._t(name, "spawn", "");
  }
  network(nodes: string[]) {
    this._net = new Net(this, nodes);
    return this._net;
  }
  *call<T>(what: string, fn: () => T): Generator<string, T, unknown> {
    const actor = this._cur ?? "test";
    let r = fn();
    this._t(actor, "call", what);
    if (this.fault("retry", 0.25)) {
      this._t(actor, "retry", `${what}: reply lost, the caller retries`);
      yield `${what} (retry)`;
      r = fn();
      this._t(actor, "call", `${what} (retry)`);
    }
    return r;
  }
  *deliver<T>(what: string, fn: () => T): Generator<string, T, unknown> {
    const actor = this._cur ?? "test";
    let r = fn();
    this._t(actor, "deliver", what);
    if (this.fault("duplicate", 0.3)) {
      yield `${what} (duplicate on the way)`;
      r = fn();
      this._t(actor, "duplicate", `${what} delivered again`);
    }
    return r;
  }
  run(maxSteps = 5000) {
    const net = this._net;
    let plan: [number, number, Set<string>] | null = null;
    if (net && net.nodes.length >= 2 && this.enabled("partition")) {
      const start = this.randint(1, 12);
      const length = this.randint(3, 12);
      const order = this.shuffle([...net.nodes]);
      const k = this.randint(1, order.length - 1);
      plan = [start, start + length, new Set(order.slice(0, k))];
    }
    for (;;) {
      const live = this._tasks.filter((t) => !t.done);
      const options: (Task | "net")[] = [...live, ...(net && net.inflight.length ? (["net"] as const) : [])];
      if (!options.length) break;
      if (this.step >= maxSteps) throw new AssertionError(`the simulation didn't finish in ${maxSteps} steps (a task waiting forever?)`);
      this.step++;
      if (plan && net) {
        if (this.step === plan[0]) {
          net.cut = plan[2];
          const rest = net.nodes.filter((n) => !plan![2].has(n));
          this._t("net", "partition", `${[...plan[2]].map(String).sort().join(", ")} | ${rest.join(", ")}`);
        } else if (this.step === plan[1] && net.cut) {
          net.cut = null;
          this._t("net", "heal", "partition healed");
        }
      }
      const pick = this.enabled("interleave") ? options[Math.floor(this._rand() * options.length)] : options[0];
      if (pick === "net") {
        net!._deliverOne();
        continue;
      }
      if (pick.started && this.crashes < this.maxCrashes && this.fault("crash", 0.06)) {
        pick.done = true;
        this.crashes++;
        this._t(pick.name, "crash", "crashed");
        try {
          pick.gen.return(undefined);
        } catch {
          // a finally that throws: the task is gone either way
        }
        if (pick.onCrash) this.spawn(pick.name + "'", pick.onCrash);
        continue;
      }
      this._cur = pick.name;
      try {
        const r = pick.gen.next();
        if (r.done) {
          pick.done = true;
          this._t(pick.name, "done", "");
        } else {
          pick.started = true;
          this._t(pick.name, "step", r.value == null ? "" : label(r.value));
        }
      } finally {
        this._cur = null;
      }
    }
    if (net) net.cut = null;
    return this;
  }
}

// ------------------------------------------------------------------------------------------ program

type Part = { file: string; src: string; start: number; lines: number };
type Built = {
  ok: boolean;
  setup: HarnessError | null;
  loadErrors: { group: string; error: HarnessError }[];
  run: ((api: Record<string, unknown>) => Promise<void>) | null;
  parts: Part[];
};

const IMPORT_RE = /^\s*import\s[^;\n]*?(?:from\s*["'][^"']+["']|["'][^"']+["'])|\bimport\s*\(|\bimportScripts\s*\(/m;

/** Strip `export` (lines keep their place), refuse `import`, transpile TS, and syntax-check one part. */
function prepare(src: string, ts: boolean, file: string, transform: JsTransform): { code: string } | { error: HarnessError } {
  const m = src.match(IMPORT_RE);
  if (m) {
    const line = src.slice(0, m.index).split("\n").length + (m[0].startsWith("\n") ? 1 : 0);
    return { error: { kind: "ImportError", message: "import is disabled in code labs: lab code runs offline, and everything a lab needs is already defined (see the Given code).", line, file, frames: [] } };
  }
  const noExport = src.replace(/^(\s*)export\s+(default\s+)?(?=(?:async\s+)?(?:class|function|const|let|var|abstract|interface|type|enum)\b)/gm, "$1").replace(/^(\s*)export\s*\{[^}]*\}\s*;?\s*$/gm, "$1");
  try {
    return { code: transform(noExport, ts) };
  } catch (e) {
    const err = e as { message?: string; loc?: { line?: number; column?: number }; lineNumber?: number };
    const msg = String(err?.message ?? e).replace(/\s*\(\d+:\d+\)\s*$/, "");
    const lm = String(err?.message ?? "").match(/\((\d+):(\d+)\)\s*$/);
    const line = err?.loc?.line ?? (lm ? Number(lm[1]) : null) ?? err?.lineNumber ?? null;
    return { error: { kind: "SyntaxError", message: clip(msg), line, file, frames: [] } };
  }
}

function build(input: JsLabInput, groups: { name: string; src: string; ts: boolean }[], fileOf: (g: string) => string, transform: JsTransform): Built {
  const userFile = input.ts ? "solution.ts" : "solution.js";
  const givenFile = input.given?.ts ? "given.ts" : "given.js";
  const loadErrors: Built["loadErrors"] = [];
  let given = "";
  if (input.given?.code.trim()) {
    const g = prepare(input.given.code, input.given.ts, givenFile, transform);
    if ("error" in g) return { ok: false, setup: { ...g.error, where: "given" }, loadErrors, run: null, parts: [] };
    given = g.code;
  }
  const u = prepare(input.code, input.ts, userFile, transform);
  if ("error" in u) return { ok: false, setup: { ...u.error, where: "solution" }, loadErrors, run: null, parts: [] };

  const lines: string[] = ['(function (__hk) { "use strict"; const { test, assert, viz, chaos, scale, console, __source__, SimCrash, AssertionError } = __hk.api;'];
  const parts: Part[] = [];
  const add = (file: string, src: string) => {
    const body = src.replace(/\s+$/, "").split("\n");
    parts.push({ file, src, start: lines.length + 1, lines: body.length });
    lines.push(...body);
  };
  lines.push('__hk.phase = "given";');
  if (given) add(givenFile, given);
  lines.push('return async function () { __hk.phase = "solution";');
  add(userFile, u.code);
  for (const g of groups) {
    const p = prepare(g.src, g.ts, fileOf(g.name), transform);
    if ("error" in p) {
      loadErrors.push({ group: g.name, error: p.error });
      continue;
    }
    lines.push(`__hk.phase = "tests"; __hk.group = ${JSON.stringify(g.name)}; {`);
    add(fileOf(g.name), p.code);
    lines.push("}");
  }
  lines.push("};", "})");
  const program = lines.join("\n") + `\n//# sourceURL=${FILE}`;
  let outer: (hk: unknown) => () => Promise<void>;
  try {
    outer = (0, eval)(program);
  } catch (e) {
    // every part parsed alone, so this is a clash between parts (e.g. a name declared twice in one scope)
    return { ok: false, setup: { kind: (e as Error)?.name || "SyntaxError", message: clip((e as Error)?.message ?? e), where: "solution", frames: [] }, loadErrors, run: null, parts };
  }
  return {
    ok: true,
    setup: null,
    loadErrors,
    parts,
    run: async (api) => {
      const hk = { api, phase: "given", group: "" };
      (api as { __hkState: unknown }).__hkState = hk;
      const inner = outer(hk);
      await inner();
    },
  };
}

/** Program line → (file, line) for stack frames. */
function locate(parts: Part[], line: number): { file: string; line: number; code: string } | null {
  for (const p of parts)
    if (line >= p.start && line < p.start + p.lines) {
      const l = line - p.start + 1;
      return { file: p.file, line: l, code: (p.src.split("\n")[l - 1] ?? "").trim() };
    }
  return null;
}

function framesOf(e: unknown, parts: Part[]): (HarnessFrame & { file: string })[] {
  const stack = String((e as Error)?.stack ?? "");
  const out: HarnessFrame[] = [];
  for (const raw of stack.split("\n")) {
    const m = raw.match(/hk-lab\.js:(\d+):(\d+)/);
    if (!m) continue;
    const loc = locate(parts, Number(m[1]));
    if (!loc) continue;
    const fnm = raw.match(/^\s*at\s+(?:async\s+)?(.+?)\s+\(/) ?? raw.match(/^\s*([^@\s]*)@/);
    const fn = (fnm?.[1] || "<module>").replace(/^Object\./, "").replace(/^new /, "");
    out.push({ file: loc.file, line: loc.line, fn: fn || "<anonymous>", code: loc.code });
  }
  return out;
}

function errorOf(e: unknown, parts: Part[], testFile: string | null): HarnessError {
  const frames = framesOf(e, parts);
  const mine = frames.filter((f) => !f.file.startsWith("given."));
  const inTest = testFile ? frames.find((f) => f.file === testFile) : undefined;
  const isAssert = e instanceof AssertionError || (e as Error)?.name === "AssertionError";
  let message: string;
  if (e instanceof Error) {
    message = e.message;
    if (e instanceof RangeError && /call stack/i.test(e.message)) message = "maximum call stack size exceeded (infinite recursion?)";
  } else message = typeof e === "string" ? e : `a non-Error value was thrown: ${fmt(e)}`;
  if (isAssert && (e as AssertionError).generic) message = "assert failed: " + (inTest?.code ?? "");
  return {
    kind: isAssert ? "AssertionError" : (e as Error)?.name || "Error",
    message: clip(message),
    line: inTest?.line ?? null,
    code: inTest?.code ?? null,
    frames: mine.filter((f) => f.file.startsWith("solution.")).slice(0, 8),
  };
}

function titleName(title: string, used: Set<string>) {
  const base = "test_" + (title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "unnamed");
  let n = base;
  for (let i = 2; used.has(n); i++) n = `${base}_${i}`;
  used.add(n);
  return n;
}

type Registered = { group: string; title: string; name: string; fn: (...a: unknown[]) => unknown };

function makeApi(deps: JsDeps, source: string) {
  const tests: Registered[] = [];
  const chaosTests: Registered[] = [];
  const scales: ((n: number) => () => unknown)[] = [];
  const used = new Set<string>();
  const viz = new Viz();
  const write = (...args: unknown[]) => deps.out?.(args.map((a) => (typeof a === "string" ? a : fmt(a))).join(" ") + "\n");
  const consoleApi = { log: write, info: write, warn: write, error: write, debug: write, table: write };
  const api: Record<string, unknown> = {
    assert: makeAssert(),
    AssertionError,
    SimCrash,
    viz: { emit: (type: string, data?: Record<string, unknown>) => viz.emit(type, data) },
    console: consoleApi,
    __source__: source,
    test: (title: string, fn: () => unknown) => {
      const st = api.__hkState as { group: string } | undefined;
      if (typeof fn !== "function") throw new TypeError(`test("${title}") needs a function`);
      tests.push({ group: st?.group ?? "visible", title: String(title), name: titleName(String(title), used), fn });
    },
    chaos: (title: string, fn: (sim: Sim) => unknown) => {
      chaosTests.push({ group: "chaos", title: String(title), name: titleName(String(title), used).replace(/^test_/, "chaos_"), fn: fn as Registered["fn"] });
    },
    scale: (fn: (n: number) => () => unknown) => {
      scales.push(fn);
    },
  };
  return { api, tests, chaosTests, scales, viz };
}

const now = (deps: JsDeps) => (deps.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now())))();
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Run the tests: the same result as the Python harness's __hk_lab_run. */
export async function jsLabRun(input: JsLabInput, groups: { name: string; src: string; ts: boolean }[], deps: JsDeps): Promise<HarnessResult> {
  const started = now(deps);
  const ext = input.ts ? "ts" : "js";
  const fileOf = (g: string) => `${g}_tests.${ext}`;
  const b = build(input, groups, fileOf, deps.transform);
  const out: HarnessResult = { setup: null, tests: [], ms: 0, viz: {} };
  if (!b.ok || !b.run) {
    out.setup = b.setup;
    out.ms = round(now(deps) - started, 1);
    return out;
  }
  const { api, tests, viz } = makeApi(deps, input.code);
  try {
    await b.run(api);
  } catch (e) {
    const st = api.__hkState as { phase: string; group: string } | undefined;
    if (st?.phase === "tests") {
      out.tests.push({ group: st.group, name: "(load)", title: `${st.group} tests failed to load`, ok: false, ms: 0, error: errorOf(e, b.parts, fileOf(st.group)) });
    } else {
      out.setup = { ...errorOf(e, b.parts, null), where: st?.phase === "given" ? "given" : "solution" };
      const f = framesOf(e, b.parts)[0];
      if (f) {
        out.setup.line = f.line;
        out.setup.file = f.file;
      }
      out.ms = round(now(deps) - started, 1);
      return out;
    }
  }
  for (const le of b.loadErrors) out.tests.push({ group: le.group, name: "(load)", title: `${le.group} tests failed to load`, ok: false, ms: 0, error: le.error });
  for (const t of tests) {
    const rec: HarnessTest = { group: t.group, name: t.name, title: t.title, ok: false, ms: 0 };
    viz.cur = `${t.group}:${t.name}`;
    const t0 = now(deps);
    try {
      const r = t.fn();
      if (r && typeof (r as Promise<unknown>).then === "function") await r;
      rec.ok = true;
    } catch (e) {
      rec.error = errorOf(e, b.parts, fileOf(t.group));
    }
    rec.ms = round(now(deps) - t0, 2);
    viz.cur = null;
    out.tests.push(rec);
  }
  out.viz = viz.events;
  out.ms = round(now(deps) - started, 1);
  return out;
}

/** Chaos tests over many seeds (or one seed to replay): the same result as __hk_lab_chaos. */
export async function jsLabChaos(input: JsLabInput, chaosSrc: JsSrc, opts: { scenarios: string[]; runs: number; seed?: number | null; test?: string | null }, deps: JsDeps): Promise<ChaosResult> {
  const started = now(deps);
  const file = `chaos_tests.${input.ts ? "ts" : "js"}`;
  const b = build(input, [{ name: "chaos", src: chaosSrc.code, ts: chaosSrc.ts }], () => file, deps.transform);
  const out: ChaosResult = { setup: null, chaos: [], ms: 0 };
  if (!b.ok || !b.run) {
    out.setup = b.setup;
    return out;
  }
  const { api, chaosTests } = makeApi(deps, input.code);
  try {
    await b.run(api);
  } catch (e) {
    const st = api.__hkState as { phase: string } | undefined;
    if (st?.phase !== "tests") {
      out.setup = { ...errorOf(e, b.parts, null), where: st?.phase === "given" ? "given" : "solution" };
      return out;
    }
    out.chaos.push({ name: "(load)", title: "chaos tests failed to load", ok: false, runs: 0, ms: 0, error: errorOf(e, b.parts, file) });
    return out;
  }
  if (b.loadErrors.length) {
    out.chaos.push({ name: "(load)", title: "chaos tests failed to load", ok: false, runs: 0, ms: 0, error: b.loadErrors[0].error });
    return out;
  }
  for (const t of chaosTests) {
    if (opts.test && t.name !== opts.test) continue;
    const rec: ChaosTestResult = { name: t.name, title: t.title, ok: true, runs: 0, ms: 0 };
    const t0 = now(deps);
    const seeds = opts.seed != null ? [Number(opts.seed)] : Array.from({ length: opts.runs || 40 }, (_, i) => i + 1);
    for (const s of seeds) {
      const sim = new Sim(s, opts.scenarios?.length ? opts.scenarios : ["interleave"]);
      rec.runs++;
      try {
        const r = t.fn(sim);
        if (r && typeof (r as Promise<unknown>).then === "function") await r;
      } catch (e) {
        rec.ok = false;
        rec.seed = s;
        rec.error = errorOf(e, b.parts, file);
        rec.trace = sim.trace;
        rec.steps = sim.step;
        break;
      }
      if (opts.seed != null) {
        rec.seed = s;
        rec.trace = sim.trace;
        rec.steps = sim.step;
      }
    }
    rec.ms = round(now(deps) - t0, 1);
    out.chaos.push(rec);
  }
  out.ms = round(now(deps) - started, 1);
  return out;
}

/** Time the reader's code at each size: the same result as __hk_lab_scale. */
export async function jsLabScale(input: JsLabInput, scaleSrc: JsSrc, opts: { sizes: number[]; budgetMs: number }, deps: JsDeps): Promise<ScaleResult> {
  const started = now(deps);
  const file = `scale.${input.ts ? "ts" : "js"}`;
  const b = build(input, [{ name: "scale", src: scaleSrc.code, ts: scaleSrc.ts }], () => file, deps.transform);
  const out: ScaleResult = { setup: null, scale: { points: [], skipped: [], error: null }, ms: 0 };
  if (!b.ok || !b.run) {
    out.setup = b.setup;
    return out;
  }
  const { api, scales } = makeApi(deps, input.code);
  const res = out.scale;
  try {
    await b.run(api);
    if (b.loadErrors.length) throw Object.assign(new Error(b.loadErrors[0].error.message), { name: b.loadErrors[0].error.kind });
    const make = scales[0];
    if (!make) throw new Error("the lab's ## Scale code never called scale((n) => ...)");
    const budget = opts.budgetMs || 3000;
    const sizes = opts.sizes;
    await make(sizes[0])(); // warm-up: JIT, first-call costs
    const points = res.points;
    for (let i = 0; i < sizes.length; i++) {
      const n = sizes[i];
      if (points.length) {
        const p = points[points.length - 1];
        let e = 1;
        if (points.length >= 2 && points[points.length - 2].ms > 0.05 && p.ms > 0.05) e = Math.max(1, Math.log(p.ms / points[points.length - 2].ms) / Math.log(p.n / points[points.length - 2].n));
        const projected = Math.max(p.ms, 0.05) * (n / p.n) ** e;
        if (projected > budget) {
          for (const m of sizes.slice(i)) res.skipped.push({ n: m, projectedMs: round(Math.max(p.ms, 0.05) * (m / p.n) ** e, 1) });
          break;
        }
      }
      const samples: number[] = [];
      const wall0 = now(deps);
      for (;;) {
        const fn = make(n);
        const t0 = now(deps);
        const r = fn();
        if (r && typeof (r as Promise<unknown>).then === "function") await r;
        samples.push(now(deps) - t0);
        const total = samples.reduce((a, x) => a + x, 0);
        if (samples[samples.length - 1] > budget || samples.length >= 25 || now(deps) - wall0 > 2500 || (samples.length >= 3 && total >= 80)) break;
      }
      const ordered = [...samples].sort((x, y) => x - y);
      const med = ordered[Math.floor(ordered.length / 2)];
      const est = med >= 2 ? med : samples.reduce((a, x) => a + x, 0) / samples.length;
      points.push({ n, ms: round(est, 4), reps: samples.length, min: round(ordered[0], 4) });
      if (samples[samples.length - 1] > budget) {
        for (const m of sizes.slice(i + 1)) res.skipped.push({ n: m, projectedMs: round(est * (m / n) ** 2, 1) });
        break;
      }
    }
  } catch (e) {
    res.error = errorOf(e, b.parts, file);
  }
  out.ms = round(now(deps) - started, 1);
  return out;
}
