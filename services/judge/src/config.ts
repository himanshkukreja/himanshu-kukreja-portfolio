// Gateway configuration from environment variables. Defaults match the plan's
// limits (section 14.4) and the 2 vCPU / 2 GB Lightsail VM.

import { availableParallelism } from "node:os";
import { loadSecrets } from "./hmac.ts";

export interface Config {
  port: number;
  host: string;
  secrets: Map<string, string>;
  maxSkewSec: number;
  workers: number;
  maxQueueWaitMs: number;
  maxQueueDepth: number;
  maxBodyBytes: number;
  maxCodeBytes: number;
  maxTests: number;
  workDir: string;
  publicHealth: boolean;
  testSetDir: string | null;
  limits: {
    defaultTimeMs: number;
    maxTimeMs: number;
    defaultMemoryMb: number;
    maxMemoryMb: number;
    processes: number;
    fileSizeKb: number;
    outputBytes: number;
    compileTimeSec: number;
    compileWallSec: number;
    compileMemoryMb: number;
    compileFileSizeKb: number;
  };
}

function int(env: Record<string, string | undefined>, name: string, dflt: number): number {
  const v = env[name];
  if (v === undefined || v === "") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const secrets = loadSecrets(env);
  if (secrets.size === 0) {
    throw new Error("set JUDGE_HMAC_SECRET (or JUDGE_HMAC_SECRETS=keyId:secret,...); refusing to start without auth");
  }
  return {
    port: int(env, "JUDGE_PORT", 8080),
    host: env.JUDGE_HOST || "0.0.0.0",
    secrets,
    maxSkewSec: int(env, "JUDGE_MAX_SKEW_SEC", 60),
    workers: int(env, "JUDGE_WORKERS", availableParallelism()),
    maxQueueWaitMs: int(env, "JUDGE_MAX_QUEUE_WAIT_MS", 30_000),
    maxQueueDepth: int(env, "JUDGE_MAX_QUEUE_DEPTH", 500),
    maxBodyBytes: int(env, "JUDGE_MAX_BODY_BYTES", 8 * 1024 * 1024),
    maxCodeBytes: int(env, "JUDGE_MAX_CODE_BYTES", 64 * 1024),
    maxTests: int(env, "JUDGE_MAX_TESTS", 200),
    workDir: env.JUDGE_WORK_DIR || "/run/judge",
    publicHealth: env.JUDGE_PUBLIC_HEALTH === "1",
    testSetDir: env.JUDGE_TESTSET_DIR || null,
    limits: {
      defaultTimeMs: int(env, "JUDGE_DEFAULT_TIME_MS", 2000),
      maxTimeMs: int(env, "JUDGE_MAX_TIME_MS", 10_000),
      defaultMemoryMb: int(env, "JUDGE_DEFAULT_MEMORY_MB", 256),
      maxMemoryMb: int(env, "JUDGE_MAX_MEMORY_MB", 512),
      processes: int(env, "JUDGE_PROCESSES", 64),
      fileSizeKb: int(env, "JUDGE_FSIZE_KB", 16 * 1024),
      outputBytes: int(env, "JUDGE_OUTPUT_BYTES", 1024 * 1024),
      compileTimeSec: int(env, "JUDGE_COMPILE_TIME_SEC", 15),
      compileWallSec: int(env, "JUDGE_COMPILE_WALL_SEC", 30),
      compileMemoryMb: int(env, "JUDGE_COMPILE_MEMORY_MB", 768),
      compileFileSizeKb: int(env, "JUDGE_COMPILE_FSIZE_KB", 64 * 1024),
    },
  };
}
