// The judging pipeline for one submission: compile once in a compile box,
// then run every test in a fresh run box (re-initialised per test, so nothing
// a program writes can leak into the next test), compare, and build verdicts.

import { constants } from "node:fs";
import { copyFile, mkdir, open, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./config.ts";
import type { CompareSpec } from "./compare.ts";
import { compareJson, compareText } from "./compare.ts";
import type { ParsedSignature } from "./harness/types.ts";
import { RESULT_FILE } from "./harness/cpp.ts";
import type { Language, LangSpec, Mode } from "./languages.ts";
import { LANGUAGES } from "./languages.ts";
import type { Box, RunMeta } from "./sandbox/types.ts";
import type { TestCase } from "./validate.ts";

export type Verdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "OLE" | "OK" | "SKIPPED";

export interface ResolvedJob {
  submissionId: string | null;
  language: Language;
  std: string;
  code: string;
  mode: Mode;
  signature: ParsedSignature | null;
  tests: TestCase[];
  timeMs: number;
  memoryMb: number;
  compare: CompareSpec;
  stopOnFirstFailure: boolean;
}

export interface TestResult {
  id: string;
  verdict: Verdict;
  timeMs: number;
  memoryKb: number;
  hidden: boolean;
  /** Short reason (e.g. "SIGFPE: arithmetic error (division by zero?)"). */
  message?: string;
  /** Visible tests only (all fields truncated). */
  input?: string;
  expected?: string;
  output?: string;
  stdout?: string;
  stderr?: string;
}

export interface JudgeResult {
  submissionId: string | null;
  verdict: Verdict;
  language: Language;
  compile: { ok: boolean; output: string; timeMs: number; memoryKb: number };
  tests: TestResult[];
  summary: { passed: number; total: number; run: number; maxTimeMs: number; maxMemoryKb: number };
  /** First non-AC test, with its input truncated even when hidden (plan 7.3). */
  firstFailure: { id: string; verdict: Verdict; hidden: boolean; input: string; message?: string } | null;
  limits: { timeMs: number; memoryMb: number; cpuLimitMs: number; boxMemoryMb: number };
  judgeMs: number;
}

const PREVIEW = 4096;
const COMPILE_OUTPUT = 8192;
const HIDDEN_INPUT_PREVIEW = 256;

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}\n... [${s.length - n} more characters]`;
}

const SIGNALS: Record<number, string> = {
  4: "SIGILL: illegal instruction",
  6: "SIGABRT: aborted (assertion failure or uncaught exception?)",
  7: "SIGBUS: bus error",
  8: "SIGFPE: arithmetic error (division by zero?)",
  9: "SIGKILL: killed",
  11: "SIGSEGV: segmentation fault (out-of-bounds access, null pointer or stack overflow?)",
  25: "SIGXFSZ: output file too large",
};

/** Read at most `max` bytes; refuse symlinks and non-regular files. Returns null when missing. */
async function readCapped(path: string, max: number): Promise<{ text: string; size: number } | null> {
  let fh;
  try {
    fh = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ELOOP") return null;
    throw e;
  }
  try {
    const st = await fh.stat();
    if (!st.isFile()) return null;
    const len = Math.min(st.size, max);
    const buf = Buffer.alloc(len);
    const { bytesRead } = await fh.read(buf, 0, len, 0);
    return { text: buf.subarray(0, bytesRead).toString("utf8"), size: st.size };
  } finally {
    await fh.close();
  }
}

async function copyTree(src: string, dst: string, skip: Set<string>, depth = 0): Promise<void> {
  if (depth > 8) return;
  for (const ent of await readdir(src, { withFileTypes: true })) {
    if (depth === 0 && skip.has(ent.name)) continue;
    const s = join(src, ent.name);
    const d = join(dst, ent.name);
    if (ent.isDirectory()) {
      await mkdir(d, { recursive: true });
      await copyTree(s, d, skip, depth + 1);
    } else if (ent.isFile()) {
      await copyFile(s, d);
    }
  }
}

function classify(
  meta: RunMeta,
  lang: LangSpec,
  stderr: string,
  stdoutSize: number,
  boxMemoryKb: number,
  outputBytes: number,
): { verdict: Verdict; message?: string } | null {
  if (meta.status === "TO") {
    return { verdict: "TLE", message: meta.message || "time limit exceeded" };
  }
  if (meta.oomKilled || lang.isOutOfMemory(stderr) || (meta.exitSignal === 9 && meta.memoryKb >= boxMemoryKb * 0.95)) {
    return { verdict: "MLE", message: "memory limit exceeded" };
  }
  if (meta.exitSignal === 25 || stdoutSize > outputBytes) {
    return { verdict: "OLE", message: `output limit exceeded (${outputBytes} bytes)` };
  }
  if (meta.status === "SG") {
    return { verdict: "RE", message: SIGNALS[meta.exitSignal ?? 0] ?? `killed by signal ${meta.exitSignal}` };
  }
  if (meta.status === "RE") {
    if (/StackOverflowError|RecursionError|Maximum call stack size exceeded/.test(stderr)) {
      return { verdict: "RE", message: "stack overflow (recursion too deep?)" };
    }
    const exc = /Exception in thread "main" ([\w.$]+)|^(\w+(?:Error|Exception))\b/m.exec(stderr);
    const name = exc ? (exc[1] ?? exc[2]) : null;
    return { verdict: "RE", message: name ? `${name} (exit code ${meta.exitCode})` : `exit code ${meta.exitCode}` };
  }
  return null;
}

export async function runJudge(job: ResolvedJob, boxes: { compile: Box; run: Box }, cfg: Config): Promise<JudgeResult> {
  const started = Date.now();
  const lang = LANGUAGES[job.language];
  const L = cfg.limits;
  const boxMemoryMb = lang.runMemoryMb(job.memoryMb);
  const boxMemoryKb = boxMemoryMb * 1024;
  const cpuLimitMs = Math.round(job.timeMs * lang.timeFactor + lang.timeExtraMs);
  const prepared = lang.prepare(job.mode, job.code, job.signature, { std: job.std, memoryMb: job.memoryMb });

  const result: JudgeResult = {
    submissionId: job.submissionId,
    verdict: "AC",
    language: job.language,
    compile: { ok: true, output: "", timeMs: 0, memoryKb: 0 },
    tests: [],
    summary: { passed: 0, total: job.tests.length, run: 0, maxTimeMs: 0, maxMemoryKb: 0 },
    firstFailure: null,
    limits: { timeMs: job.timeMs, memoryMb: job.memoryMb, cpuLimitMs, boxMemoryMb },
    judgeMs: 0,
  };

  const { compile: cbox, run: rbox } = boxes;
  try {
    // ---- compile ---------------------------------------------------------
    await cbox.init();
    for (const [name, content] of Object.entries(prepared.files)) {
      await writeFile(join(cbox.dir, name), content);
    }
    if (prepared.compile) {
      const meta = await cbox.run({
        cmd: prepared.compile,
        stdout: "__compile.txt",
        stderrToStdout: true,
        timeSec: L.compileTimeSec,
        wallSec: L.compileWallSec,
        memoryKb: L.compileMemoryMb * 1024,
        processes: L.processes,
        fileSizeKb: L.compileFileSizeKb,
        env: lang.compileEnv,
        dirs: lang.compileDirs,
      });
      const out = (await readCapped(join(cbox.dir, "__compile.txt"), 64 * 1024))?.text ?? "";
      result.compile.output = truncate(out.trim(), COMPILE_OUTPUT);
      result.compile.timeMs = meta.timeMs;
      result.compile.memoryKb = meta.memoryKb;
      if (meta.status !== "OK") {
        result.compile.ok = false;
        if (meta.status === "TO") result.compile.output = `compilation timed out\n${result.compile.output}`.trim();
        else if (meta.oomKilled) result.compile.output = `compiler ran out of memory\n${result.compile.output}`.trim();
        result.verdict = "CE";
        result.tests = job.tests.map((t) => ({ id: t.id, verdict: "SKIPPED", timeMs: 0, memoryKb: 0, hidden: t.hidden }));
        return result;
      }
    }

    // ---- run each test in a fresh box ----------------------------------
    const skip = new Set(["__compile.txt", ...(job.language === "cpp" ? ["main.cpp"] : [])]);
    let stop = false;
    for (const t of job.tests) {
      if (stop) {
        result.tests.push({ id: t.id, verdict: "SKIPPED", timeMs: 0, memoryKb: 0, hidden: t.hidden });
        continue;
      }
      await rbox.init();
      await copyTree(cbox.dir, rbox.dir, skip);
      await writeFile(join(rbox.dir, "__input.txt"), t.input);
      const meta = await rbox.run({
        cmd: prepared.run,
        stdin: "__input.txt",
        stdout: "__stdout.txt",
        stderr: "__stderr.txt",
        timeSec: cpuLimitMs / 1000,
        wallSec: Math.max(3, (cpuLimitMs / 1000) * 2 + 1),
        memoryKb: boxMemoryKb,
        processes: L.processes,
        fileSizeKb: L.fileSizeKb,
        stackKb: boxMemoryKb,
        env: lang.runEnv,
        dirs: lang.runDirs,
      });
      const stdout = (await readCapped(join(rbox.dir, "__stdout.txt"), L.outputBytes)) ?? { text: "", size: 0 };
      const stderr = (await readCapped(join(rbox.dir, "__stderr.txt"), 64 * 1024)) ?? { text: "", size: 0 };

      const tr: TestResult = { id: t.id, verdict: "AC", timeMs: meta.timeMs, memoryKb: meta.memoryKb, hidden: t.hidden };
      let output = "";
      const failure = classify(meta, lang, stderr.text, stdout.size, boxMemoryKb, L.outputBytes);
      if (failure) {
        tr.verdict = failure.verdict;
        tr.message = failure.message;
      } else {
        let actual: string;
        if (job.mode === "function") {
          const res = await readCapped(join(rbox.dir, RESULT_FILE), L.outputBytes);
          if (!res) {
            tr.verdict = "RE";
            tr.message = "the program exited without returning a value";
            actual = "";
          } else if (res.size > L.outputBytes) {
            tr.verdict = "OLE";
            tr.message = `returned value is larger than ${L.outputBytes} bytes`;
            actual = "";
          } else {
            actual = res.text;
          }
        } else {
          actual = stdout.text;
        }
        output = actual;
        if (tr.verdict === "AC") {
          if (t.expected === null) {
            tr.verdict = "OK";
          } else {
            const cmp = job.mode === "function" ? compareJson(t.expected, actual, job.compare) : compareText(t.expected, actual, job.compare);
            if (!cmp.ok) {
              tr.verdict = "WA";
              tr.message = cmp.reason;
            }
          }
        }
      }

      if (!t.hidden) {
        tr.input = truncate(t.input, PREVIEW);
        if (t.expected !== null) tr.expected = truncate(t.expected, PREVIEW);
        tr.output = truncate(output, PREVIEW);
        if (job.mode === "function" && stdout.text) tr.stdout = truncate(stdout.text, PREVIEW);
        if (stderr.text) tr.stderr = truncate(stderr.text, PREVIEW);
      }

      result.tests.push(tr);
      result.summary.run++;
      result.summary.maxTimeMs = Math.max(result.summary.maxTimeMs, tr.timeMs);
      result.summary.maxMemoryKb = Math.max(result.summary.maxMemoryKb, tr.memoryKb);
      if (tr.verdict === "AC" || tr.verdict === "OK") {
        result.summary.passed++;
      } else {
        if (!result.firstFailure) {
          result.verdict = tr.verdict;
          result.firstFailure = {
            id: t.id,
            verdict: tr.verdict,
            hidden: t.hidden,
            input: truncate(t.input, HIDDEN_INPUT_PREVIEW),
            message: tr.message,
          };
        }
        if (job.stopOnFirstFailure) stop = true;
      }
    }
    if (!result.firstFailure && result.tests.every((t) => t.verdict === "OK")) result.verdict = "OK";
    return result;
  } finally {
    result.judgeMs = Date.now() - started;
    await Promise.allSettled([cbox.cleanup(), rbox.cleanup()]);
  }
}
