// judge-lite HTTP gateway.
//
//   POST /judge    HMAC-signed. Compile once, run all tests, return verdicts.
//   GET  /health   HMAC-signed (or public with JUDGE_PUBLIC_HEALTH=1). Queue, latency, verdict mix.
//   GET  /livez    Unauthenticated liveness probe; returns "ok" and nothing else.
//
// The only ingress in production is the Cloudflare Tunnel (cloudflared on the
// VM connects out to Cloudflare); the container port is bound to 127.0.0.1.

import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.ts";
import { loadConfig } from "./config.ts";
import { parseCompareSpec, CompareSpecError } from "./compare.ts";
import { parseSignature, SignatureError } from "./harness/types.ts";
import { NonceCache, verifyRequest } from "./hmac.ts";
import type { ResolvedJob } from "./judge.ts";
import { runJudge } from "./judge.ts";
import { QueueFullError, WorkQueue } from "./queue.ts";
import { IsolateSandbox } from "./sandbox/isolate.ts";
import type { Box, Sandbox } from "./sandbox/types.ts";
import { Stats } from "./stats.ts";
import { CachedTestSets, LocalDirTestSetSource, R2TestSetSource, TestSetNotFound } from "./testsets.ts";
import { normalizeTests, validateJudgeRequest, ValidationError } from "./validate.ts";

export const VERSION = "0.1.0";

interface Worker {
  id: number;
  compile: Box;
  run: Box;
}

export interface App {
  server: Server;
  queue: WorkQueue<Worker>;
  stats: Stats;
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > max) {
      reject(new HttpError(413, "BODY_TOO_LARGE", `body over ${max} bytes`));
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new HttpError(413, "BODY_TOO_LARGE", `body over ${max} bytes`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) return;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  res.end(text);
}

function log(entry: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`);
}

export function createApp(cfg: Config, sandbox: Sandbox, testSets: CachedTestSets): App {
  const workers: Worker[] = [];
  for (let i = 0; i < cfg.workers; i++) {
    workers.push({ id: i, compile: sandbox.box(2 * i), run: sandbox.box(2 * i + 1) });
  }
  const queue = new WorkQueue(workers, { maxWaitMs: cfg.maxQueueWaitMs, maxDepth: cfg.maxQueueDepth });
  const stats = new Stats();
  const nonces = new NonceCache(cfg.maxSkewSec * 2 * 1000);

  function authenticate(req: IncomingMessage, path: string, body: Buffer): string {
    const v = verifyRequest(req.headers, req.method ?? "GET", path, body, { secrets: cfg.secrets, maxSkewSec: cfg.maxSkewSec, nonces });
    if (!v.ok) throw new HttpError(401, "UNAUTHORIZED", v.reason);
    return v.keyId;
  }

  async function handleJudge(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const received = Date.now();
    const raw = await readBody(req, cfg.maxBodyBytes);
    const keyId = authenticate(req, path, raw);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new HttpError(400, "BAD_JSON", "body is not valid JSON");
    }
    const r = validateJudgeRequest(body, cfg);

    // Resolve tests (inline, or a stored test set whose metadata fills gaps).
    let rawTests = r.tests;
    let signature = r.signature;
    let mode = r.mode;
    let compare = r.compare;
    let timeMs = r.timeMs;
    let memoryMb = r.memoryMb;
    if (!rawTests && r.testSet) {
      let set;
      try {
        set = await testSets.load(r.testSet);
      } catch (e) {
        if (e instanceof TestSetNotFound) throw new HttpError(404, "TESTSET_NOT_FOUND", e.message);
        throw new HttpError(502, "TESTSET_UNAVAILABLE", (e as Error).message);
      }
      rawTests = set.tests;
      if (body.mode === undefined && set.mode) mode = set.mode === "function" ? "function" : "stdio";
      try {
        if (!signature && set.signature) signature = parseSignature(set.signature);
        if (body.compare === undefined && body.checker === undefined && set.compare !== undefined) compare = parseCompareSpec(set.compare);
      } catch (e) {
        if (e instanceof SignatureError || e instanceof CompareSpecError) throw new HttpError(500, "BAD_TESTSET", e.message);
        throw e;
      }
      const lim = (body.limits ?? {}) as Record<string, unknown>;
      if (lim.timeMs === undefined && set.limits?.timeMs) timeMs = Math.min(cfg.limits.maxTimeMs, Math.max(100, set.limits.timeMs));
      if (lim.memoryMb === undefined && set.limits?.memoryMb) memoryMb = Math.min(cfg.limits.maxMemoryMb, Math.max(32, set.limits.memoryMb));
      if (rawTests.length === 0 || rawTests.length > cfg.maxTests) throw new HttpError(500, "BAD_TESTSET", "test set has no tests or too many");
    }
    if (mode === "function" && !signature) throw new HttpError(400, "BAD_SIGNATURE", "function mode needs a signature");
    const tests = normalizeTests(rawTests!, mode, signature);

    const job: ResolvedJob = {
      submissionId: r.submissionId,
      language: r.language,
      std: r.std,
      code: r.code,
      mode,
      signature,
      tests,
      timeMs,
      memoryMb,
      compare,
      stopOnFirstFailure: r.stopOnFirstFailure,
    };

    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) abort.abort();
    });
    let startedAt = 0;
    const result = await queue.submit(async (w) => {
      startedAt = Date.now();
      return runJudge(job, { compile: w.compile, run: w.run }, cfg);
    }, abort.signal);
    const done = Date.now();
    const queueMs = startedAt - received;
    stats.record({ verdict: result.verdict, language: job.language, totalMs: done - received, judgeMs: result.judgeMs, queueMs });
    log({
      ev: "judge",
      key: keyId,
      sid: job.submissionId,
      lang: job.language,
      mode: job.mode,
      verdict: result.verdict,
      tests: `${result.summary.passed}/${result.summary.total}`,
      judgeMs: result.judgeMs,
      queueMs,
    });
    send(res, 200, { ...result, queueMs, totalMs: done - received });
  }

  async function handleHealth(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    if (!cfg.publicHealth) authenticate(req, path, await readBody(req, 1024));
    const q = queue.stats();
    send(res, 200, {
      ok: true,
      service: "judge-lite",
      version: VERSION,
      sandbox: sandbox.name,
      uptimeSec: Math.round((Date.now() - stats.startedAt) / 1000),
      queue: { depth: q.depth, busy: q.busy, workers: q.workers, estimatedWaitMs: q.estimatedWaitMs, avgJobMs: q.avgJobMs, rejected: q.rejected, completed: q.completed },
      latency: stats.snapshot(),
      verdicts: stats.verdicts,
      languages: stats.byLanguage,
      errors: stats.errors,
      testSetSource: testSets.sourceName,
    });
  }

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://judge.local");
    const path = url.pathname;
    try {
      if (path === "/livez" && (req.method === "GET" || req.method === "HEAD")) return send(res, 200, "ok");
      if (path === "/judge") {
        if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "use POST");
        return await handleJudge(req, res, path);
      }
      if (path === "/health") {
        if (req.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "use GET");
        return await handleHealth(req, res, path);
      }
      throw new HttpError(404, "NOT_FOUND", "not found");
    } catch (e) {
      if (e instanceof QueueFullError) {
        return send(res, 503, { error: "BUSY", message: `${e.message}; retry in ${e.retryAfterSec}s`, retryAfterSec: e.retryAfterSec }, { "retry-after": String(e.retryAfterSec) });
      }
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
      if (e instanceof ValidationError) return send(res, e.status, { error: e.code, message: e.message });
      if ((e as Error).message === "client went away") return;
      stats.errors++;
      log({ ev: "error", path, message: (e as Error).message, stack: (e as Error).stack?.split("\n").slice(0, 4).join(" | ") });
      return send(res, 500, { error: "INTERNAL", message: "internal judge error" });
    }
  });
  server.requestTimeout = 180_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 65_000;
  return { server, queue, stats };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const sandbox = new IsolateSandbox(cfg.workDir);
  await sandbox.selfCheck();
  const source = cfg.testSetDir ? new LocalDirTestSetSource(cfg.testSetDir) : new R2TestSetSource();
  const app = createApp(cfg, sandbox, new CachedTestSets(source));
  app.server.listen(cfg.port, cfg.host, () => {
    log({ ev: "start", version: VERSION, port: cfg.port, workers: cfg.workers, sandbox: sandbox.name, keys: [...cfg.secrets.keys()] });
  });
  const shutdown = (sig: string) => {
    log({ ev: "stop", sig });
    app.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 30_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    log({ ev: "fatal", message: (e as Error).message });
    process.exit(1);
  });
}
