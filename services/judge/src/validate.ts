// Request validation for POST /judge (hand-written; no schema dependency).

import type { Config } from "./config.ts";
import type { CompareSpec } from "./compare.ts";
import { parseCompareSpec, CompareSpecError } from "./compare.ts";
import type { ParsedSignature, Signature } from "./harness/types.ts";
import { parseSignature, SignatureError } from "./harness/types.ts";
import type { Language, Mode } from "./languages.ts";
import { LANGUAGE_ALIASES } from "./languages.ts";

/** A test case after normalisation: stdin text and expected text. */
export interface TestCase {
  id: string;
  /** stdio: raw stdin. function: JSON array of arguments. */
  input: string;
  /** stdio: expected stdout. function: expected JSON value. null = just run (custom input). */
  expected: string | null;
  hidden: boolean;
}

/** Raw test case as sent by the Worker or stored in an R2 test set. */
export interface RawTestCase {
  id?: string | number;
  input?: unknown;
  inputText?: string;
  expected?: unknown;
  expectedText?: string;
  hidden?: boolean;
}

export interface TestSetRef {
  problemId: string;
  /** Content hash / version of the test set (cache key; plan: /api/dsa/tests/<id>?v=<hash>). */
  version: string;
  /** Which files to load, default ["visible", "hidden"]. */
  sets?: string[];
}

export interface JudgeRequest {
  submissionId: string | null;
  language: Language;
  std: string;
  code: string;
  mode: Mode;
  signature: ParsedSignature | null;
  rawSignature: Signature | null;
  tests: RawTestCase[] | null;
  testSet: TestSetRef | null;
  timeMs: number;
  memoryMb: number;
  compare: CompareSpec;
  stopOnFirstFailure: boolean;
}

export class ValidationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export function validateJudgeRequest(body: unknown, cfg: Config): JudgeRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("BAD_REQUEST", "body must be a JSON object");
  const b = body as Record<string, unknown>;

  const langRaw = String(b.language ?? "").toLowerCase();
  const alias = LANGUAGE_ALIASES[langRaw];
  if (!alias) throw new ValidationError("BAD_LANGUAGE", `language must be one of cpp, java, python, javascript`);
  let std = alias.std ?? "c++17";
  if (b.std !== undefined) {
    if (b.std !== "c++17" && b.std !== "c++20") throw new ValidationError("BAD_STD", "std must be c++17 or c++20");
    std = b.std;
  }

  if (typeof b.code !== "string" || b.code.trim() === "") throw new ValidationError("BAD_CODE", "code must be a non-empty string");
  const codeBytes = Buffer.byteLength(b.code, "utf8");
  if (codeBytes > cfg.maxCodeBytes) {
    throw new ValidationError("CODE_TOO_LARGE", `code is ${codeBytes} bytes; the limit is ${cfg.maxCodeBytes}`, 413);
  }
  if (b.code.includes("\u0000")) throw new ValidationError("BAD_CODE", "code contains a NUL byte");

  const modeRaw = b.mode ?? "function";
  if (modeRaw !== "function" && modeRaw !== "stdio" && modeRaw !== "stdin") {
    throw new ValidationError("BAD_MODE", 'mode must be "function" or "stdio"');
  }
  const mode: Mode = modeRaw === "function" ? "function" : "stdio";

  let signature: ParsedSignature | null = null;
  let rawSignature: Signature | null = null;
  if (b.signature !== undefined) {
    try {
      rawSignature = b.signature as Signature;
      signature = parseSignature(rawSignature);
    } catch (e) {
      if (e instanceof SignatureError) throw new ValidationError("BAD_SIGNATURE", e.message);
      throw e;
    }
  }

  let tests: RawTestCase[] | null = null;
  let testSet: TestSetRef | null = null;
  if (b.tests !== undefined) {
    if (!Array.isArray(b.tests) || b.tests.length === 0) throw new ValidationError("BAD_TESTS", "tests must be a non-empty array");
    if (b.tests.length > cfg.maxTests) throw new ValidationError("TOO_MANY_TESTS", `at most ${cfg.maxTests} tests`);
    tests = b.tests as RawTestCase[];
  } else if (b.testSet !== undefined || b.problemId !== undefined) {
    const ref = (b.testSet ?? { problemId: b.problemId, version: b.testVersion }) as Record<string, unknown>;
    if (typeof ref.problemId !== "string" || !ID_RE.test(ref.problemId)) throw new ValidationError("BAD_TESTSET", "testSet.problemId is invalid");
    if (typeof ref.version !== "string" || !ID_RE.test(ref.version)) throw new ValidationError("BAD_TESTSET", "testSet.version is invalid");
    const sets = ref.sets === undefined ? undefined : (ref.sets as unknown[]);
    if (sets && (!Array.isArray(sets) || !sets.every((s) => typeof s === "string" && /^[a-z0-9_-]{1,32}$/.test(s)))) {
      throw new ValidationError("BAD_TESTSET", "testSet.sets must be names like visible, hidden");
    }
    testSet = { problemId: ref.problemId, version: ref.version, sets: sets as string[] | undefined };
  } else {
    throw new ValidationError("BAD_TESTS", "send tests[] or testSet {problemId, version}");
  }
  if (mode === "function" && !signature && !testSet) {
    throw new ValidationError("BAD_SIGNATURE", "function mode needs a signature");
  }

  const limits = (b.limits ?? {}) as Record<string, unknown>;
  const timeMs = clamp(Number(limits.timeMs ?? cfg.limits.defaultTimeMs) || cfg.limits.defaultTimeMs, 100, cfg.limits.maxTimeMs);
  const memoryMb = clamp(Number(limits.memoryMb ?? cfg.limits.defaultMemoryMb) || cfg.limits.defaultMemoryMb, 32, cfg.limits.maxMemoryMb);

  let compare: CompareSpec;
  try {
    compare = parseCompareSpec(b.compare ?? b.checker);
  } catch (e) {
    if (e instanceof CompareSpecError) throw new ValidationError("BAD_COMPARE", e.message);
    throw e;
  }

  const sid = b.submissionId;
  if (sid !== undefined && (typeof sid !== "string" || !ID_RE.test(sid))) throw new ValidationError("BAD_REQUEST", "submissionId is invalid");

  return {
    submissionId: (sid as string | undefined) ?? null,
    language: alias.language,
    std,
    code: b.code,
    mode,
    signature,
    rawSignature,
    tests,
    testSet,
    timeMs: Math.round(timeMs),
    memoryMb: Math.round(memoryMb),
    compare,
    stopOnFirstFailure: b.stopOnFirstFailure === undefined ? true : b.stopOnFirstFailure === true,
  };
}

/**
 * Normalise raw tests into stdin/expected text.
 *   function mode:  input = [arg0, arg1, ...] or {paramName: value}; or inputText = one JSON value per line
 *                   (LeetCode style; keeps 64-bit integers exact). expected = JSON value, or expectedText = JSON text.
 *   stdio mode:     input / expected are plain strings.
 */
export function normalizeTests(raw: RawTestCase[], mode: Mode, sig: ParsedSignature | null): TestCase[] {
  return raw.map((t, i) => {
    if (!t || typeof t !== "object") throw new ValidationError("BAD_TESTS", `tests[${i}] must be an object`);
    const id = t.id === undefined ? String(i + 1) : String(t.id).slice(0, 64);
    const hidden = t.hidden === true;
    if (mode === "stdio") {
      const input = t.inputText ?? t.input ?? "";
      if (typeof input !== "string") throw new ValidationError("BAD_TESTS", `tests[${i}].input must be a string in stdio mode`);
      const exp = t.expectedText ?? t.expected;
      if (exp !== undefined && exp !== null && typeof exp !== "string") {
        throw new ValidationError("BAD_TESTS", `tests[${i}].expected must be a string in stdio mode`);
      }
      return { id, input, expected: (exp as string | undefined) ?? null, hidden };
    }
    const params = sig!.params;
    let input: string;
    if (typeof t.inputText === "string") {
      const lines = t.inputText.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length !== params.length) {
        throw new ValidationError("BAD_TESTS", `tests[${i}].inputText needs ${params.length} lines (one JSON value per param)`);
      }
      input = `[${lines.join(",")}]`;
    } else if (Array.isArray(t.input)) {
      if (t.input.length !== params.length) throw new ValidationError("BAD_TESTS", `tests[${i}].input needs ${params.length} arguments`);
      input = JSON.stringify(t.input);
    } else if (t.input && typeof t.input === "object") {
      const o = t.input as Record<string, unknown>;
      input = JSON.stringify(
        params.map((p) => {
          if (!(p.name in o)) throw new ValidationError("BAD_TESTS", `tests[${i}].input is missing "${p.name}"`);
          return o[p.name];
        }),
      );
    } else {
      throw new ValidationError("BAD_TESTS", `tests[${i}].input must be an argument array or object (or inputText)`);
    }
    let expected: string | null = null;
    if (typeof t.expectedText === "string") expected = t.expectedText;
    else if (t.expected !== undefined) expected = JSON.stringify(t.expected);
    return { id, input, expected, hidden };
  });
}
