// Verdict mapping and request handling with a fake sandbox (no isolate needed).
// Real sandboxed runs are covered by test/integration.sh.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Box, RunMeta, RunSpec, Sandbox } from "../src/sandbox/types.ts";
import { runJudge } from "../src/judge.ts";
import type { ResolvedJob } from "../src/judge.ts";
import { loadConfig } from "../src/config.ts";
import { parseSignature } from "../src/harness/types.ts";
import { parseCompareSpec } from "../src/compare.ts";
import { normalizeTests, validateJudgeRequest, ValidationError } from "../src/validate.ts";
import { createApp } from "../src/server.ts";
import { CachedTestSets, LocalDirTestSetSource } from "../src/testsets.ts";
import { signJudgeRequest } from "../client/judge-client.ts";

const SECRET = "k".repeat(48);
const cfg = loadConfig({ JUDGE_HMAC_SECRET: SECRET, JUDGE_WORKERS: "2" });

/** Box whose "programs" are JS functions writing files into a temp dir. */
type Behaviour = (spec: RunSpec, dir: string) => Partial<RunMeta>;
class FakeBox implements Box {
  readonly id: number;
  dir = "";
  private readonly behave: (id: number) => Behaviour;
  constructor(id: number, behave: (id: number) => Behaviour) {
    this.id = id;
    this.behave = behave;
  }
  async init() {
    this.dir = mkdtempSync(join(tmpdir(), `fakebox-${this.id}-`));
  }
  async cleanup() {
    if (this.dir) rmSync(this.dir, { recursive: true, force: true });
  }
  async run(spec: RunSpec): Promise<RunMeta> {
    const m = this.behave(this.id)(spec, this.dir);
    return { status: "OK", exitCode: 0, exitSignal: null, timeMs: 5, wallMs: 6, memoryKb: 1000, oomKilled: false, killed: false, message: "", ...m };
  }
}

function fakeSandbox(run: Behaviour, compile: Behaviour = () => ({})): Sandbox {
  return {
    name: "fake",
    box: (id) => new FakeBox(id, (i) => (i % 2 === 0 ? compile : run)),
    selfCheck: async () => {},
  };
}

const SIG = parseSignature({ fn: "two_sum", params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }], returns: "int[]" });

function job(over: Partial<ResolvedJob> = {}): ResolvedJob {
  return {
    submissionId: "t1",
    language: "cpp",
    std: "c++17",
    code: "class Solution {};",
    mode: "function",
    signature: SIG,
    tests: normalizeTests(
      [
        { input: [[2, 7, 11], 9], expected: [0, 1] },
        { input: [[3, 3], 6], expected: [0, 1], hidden: true },
        { input: [[1, 2], 3], expected: [0, 1], hidden: true },
      ],
      "function",
      SIG,
    ),
    timeMs: 1000,
    memoryMb: 256,
    compare: parseCompareSpec("exact"),
    stopOnFirstFailure: false,
    ...over,
  };
}

async function judgeWith(run: Behaviour, over: Partial<ResolvedJob> = {}, compile?: Behaviour) {
  const sb = fakeSandbox(run, compile);
  return runJudge(job(over), { compile: sb.box(0), run: sb.box(1) }, cfg);
}

const returns = (v: string): Behaviour => (_s, dir) => {
  writeFileSync(join(dir, "__result.json"), v);
  return {};
};

test("AC when every test returns the expected value", async () => {
  const r = await judgeWith(returns("[0,1]"));
  assert.equal(r.verdict, "AC");
  assert.equal(r.summary.passed, 3);
  assert.equal(r.firstFailure, null);
  assert.equal(r.tests[0].output, "[0,1]", "visible test shows output");
  assert.equal(r.tests[1].output, undefined, "hidden test hides output");
  assert.equal(r.tests[1].input, undefined);
});

test("WA reports the first failing hidden input, truncated, but not its expected output", async () => {
  let n = 0;
  const r = await judgeWith((_s, dir) => {
    writeFileSync(join(dir, "__result.json"), n++ === 1 ? "[1,0]" : "[0,1]");
    return {};
  });
  assert.equal(r.verdict, "WA");
  assert.deepEqual(r.tests.map((t) => t.verdict), ["AC", "WA", "AC"]);
  assert.equal(r.firstFailure?.id, "2");
  assert.equal(r.firstFailure?.hidden, true);
  assert.equal(r.firstFailure?.input, "[[3,3],6]");
  assert.equal(r.tests[1].expected, undefined);
});

test("stopOnFirstFailure skips the remaining tests", async () => {
  const r = await judgeWith(() => ({ status: "TO", killed: true, message: "Time limit exceeded" }), { stopOnFirstFailure: true });
  assert.equal(r.verdict, "TLE");
  assert.deepEqual(r.tests.map((t) => t.verdict), ["TLE", "SKIPPED", "SKIPPED"]);
  assert.equal(r.summary.run, 1);
});

test("MLE from the cgroup OOM killer, and from runtime messages", async () => {
  assert.equal((await judgeWith(() => ({ status: "SG", exitSignal: 9, oomKilled: true }))).verdict, "MLE");
  const javaOom: Behaviour = (_s, dir) => {
    writeFileSync(join(dir, "__stderr.txt"), 'Exception in thread "main" java.lang.OutOfMemoryError: Java heap space');
    return { status: "RE", exitCode: 1 };
  };
  assert.equal((await judgeWith(javaOom, { language: "java" })).verdict, "MLE");
  const badAlloc: Behaviour = (_s, dir) => {
    writeFileSync(join(dir, "__stderr.txt"), "terminate called after throwing an instance of 'std::bad_alloc'");
    return { status: "SG", exitSignal: 6 };
  };
  assert.equal((await judgeWith(badAlloc)).verdict, "MLE");
});

test("RE with a readable reason", async () => {
  const fpe = await judgeWith(() => ({ status: "SG", exitSignal: 8 }));
  assert.equal(fpe.verdict, "RE");
  assert.match(fpe.tests[0].message!, /SIGFPE/);
  const aioobe: Behaviour = (_s, dir) => {
    writeFileSync(join(dir, "__stderr.txt"), 'Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 5');
    return { status: "RE", exitCode: 1 };
  };
  const r = await judgeWith(aioobe, { language: "java" });
  assert.match(r.tests[0].message!, /ArrayIndexOutOfBoundsException/);
  const noResult = await judgeWith(() => ({}));
  assert.equal(noResult.verdict, "RE");
});

test("OLE when stdout is over the output limit or the program hits SIGXFSZ", async () => {
  const big: Behaviour = (_s, dir) => {
    writeFileSync(join(dir, "__stdout.txt"), Buffer.alloc(cfg.limits.outputBytes + 10, 65));
    writeFileSync(join(dir, "__result.json"), "[0,1]");
    return {};
  };
  assert.equal((await judgeWith(big)).verdict, "OLE");
  assert.equal((await judgeWith(() => ({ status: "SG", exitSignal: 25 }))).verdict, "OLE");
});

test("CE stops before running and returns trimmed compiler output", async () => {
  const r = await judgeWith(returns("[0,1]"), {}, (_s, dir) => {
    writeFileSync(join(dir, "__compile.txt"), "solution.cpp:1:7: error: expected ';'\n".repeat(1000));
    return { status: "RE", exitCode: 1 };
  });
  assert.equal(r.verdict, "CE");
  assert.equal(r.compile.ok, false);
  assert.ok(r.compile.output.length < 8400);
  assert.match(r.compile.output, /more characters/);
  assert.ok(r.tests.every((t) => t.verdict === "SKIPPED"));
});

test("stdio mode compares stdout; no expected means OK (custom input)", async () => {
  const echo: Behaviour = (_s, dir) => {
    writeFileSync(join(dir, "__stdout.txt"), "3 \n");
    return {};
  };
  const tests = normalizeTests([{ input: "1 2\n", expected: "3" }], "stdio", null);
  assert.equal((await judgeWith(echo, { mode: "stdio", signature: null, tests })).verdict, "AC");
  const custom = normalizeTests([{ input: "1 2\n" }], "stdio", null);
  const r = await judgeWith(echo, { mode: "stdio", signature: null, tests: custom });
  assert.equal(r.verdict, "OK");
  assert.equal(r.tests[0].output, "3 \n");
});

test("Java run limits: -Xmx inside the run command, box memory twice the heap", async () => {
  let seen: RunSpec | null = null;
  await judgeWith((s, dir) => {
    seen = s;
    writeFileSync(join(dir, "__result.json"), "[0,1]");
    return {};
  }, { language: "java" });
  const s = seen as unknown as RunSpec;
  assert.ok(s.cmd.includes("-Xmx256m"));
  assert.equal(s.memoryKb, 512 * 1024);
  assert.equal(s.processes, 64);
  assert.equal(s.fileSizeKb, 16 * 1024);
});

test("validate: code size limit, language aliases, test forms", () => {
  const base = { language: "cpp20", code: "x", mode: "function", signature: { fn: "f", params: [{ name: "a", type: "int" }], returns: "int" }, tests: [{ input: [1], expected: 1 }] };
  const r = validateJudgeRequest(base, cfg);
  assert.equal(r.language, "cpp");
  assert.equal(r.std, "c++20");
  assert.equal(r.stopOnFirstFailure, true);
  assert.throws(
    () => validateJudgeRequest({ ...base, code: "x".repeat(64 * 1024 + 1) }, cfg),
    (e) => e instanceof ValidationError && e.status === 413 && e.code === "CODE_TOO_LARGE",
  );
  assert.throws(() => validateJudgeRequest({ ...base, language: "rust" }, cfg), /language/);
  assert.throws(() => validateJudgeRequest({ ...base, compare: "custom" }, cfg), /not supported/);
  const clamped = validateJudgeRequest({ ...base, limits: { timeMs: 999999, memoryMb: 99999 } }, cfg);
  assert.equal(clamped.timeMs, 10_000);
  assert.equal(clamped.memoryMb, 512);

  const sig = parseSignature({ fn: "f", params: [{ name: "a", type: "long" }, { name: "b", type: "int[]" }], returns: "long" });
  const t = normalizeTests(
    [
      { input: { b: [1], a: 5 }, expected: 1 },
      { inputText: "9223372036854775807\n[1,2]", expectedText: "9223372036854775807" },
    ],
    "function",
    sig,
  );
  assert.equal(t[0].input, "[5,[1]]", "object input is reordered by param name");
  assert.equal(t[1].input, "[9223372036854775807,[1,2]]", "inputText keeps 64-bit integers exact");
  assert.equal(t[1].expected, "9223372036854775807");
  assert.throws(() => normalizeTests([{ input: [1] }], "function", sig), /needs 2 arguments/);
});

async function call(app: ReturnType<typeof createApp>, method: string, path: string, body: unknown, sign = true) {
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const port = (app.server.address() as { port: number }).port;
  const text = method === "GET" ? "" : JSON.stringify(body);
  const headers: Record<string, string> = sign ? await signJudgeRequest({ secret: SECRET, method, path, body: text }) : {};
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: method === "GET" ? undefined : text });
    return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => app.server.close(() => r()));
  }
}

test("HTTP: signed /judge works end to end; unsigned is 401; /health reports stats", async () => {
  const testSets = new CachedTestSets(new LocalDirTestSetSource("/nonexistent"));
  const app = createApp(cfg, fakeSandbox(returns("[0,1]")), testSets);
  const body = { language: "cpp", code: "class Solution{};", mode: "function", signature: { fn: "two_sum", params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }], returns: "int[]" }, tests: [{ input: [[2, 7], 9], expected: [0, 1] }] };
  const ok = await call(app, "POST", "/judge", body);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.verdict, "AC");
  const unsigned = await call(app, "POST", "/judge", body, false);
  assert.equal(unsigned.status, 401);
  const health = await call(app, "GET", "/health", null);
  assert.equal(health.status, 200);
  assert.equal(health.json.queue.depth, 0);
  assert.equal(health.json.verdicts.AC, 1);
  assert.equal(typeof health.json.latency.total.p50Ms, "number");
  const tooBig = await call(app, "POST", "/judge", { ...body, code: "x".repeat(70_000) });
  assert.equal(tooBig.status, 413);
});

test("HTTP: 503 with Retry-After when the queue wait would exceed 30 s", async () => {
  const testSets = new CachedTestSets(new LocalDirTestSetSource("/nonexistent"));
  const app = createApp({ ...cfg, maxQueueWaitMs: 0 }, fakeSandbox(returns("[0,1]")), testSets);
  // Occupy both workers so the next request has to wait.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const blockers = [app.queue.submit(() => gate), app.queue.submit(() => gate)];
  const body = { language: "cpp", code: "int main(){}", mode: "stdio", tests: [{ input: "", expected: "" }] };
  const r = await call(app, "POST", "/judge", body);
  assert.equal(r.status, 503);
  assert.ok(Number(r.headers.get("retry-after")) >= 1);
  assert.equal(r.json.error, "BUSY");
  release();
  await Promise.all(blockers);
});
