// Output comparators.
//
// Modes (request field `compare`, or the plan's `checker`):
//   exact            stdio: identical text after normalising line endings, trailing
//                    spaces at line ends and trailing blank lines (what most judges
//                    call "exact"). function: identical JSON values.
//   token            stdio: identical whitespace-separated tokens.
//                    function: same as exact (JSON is already whitespace-free).
//   float:<eps>      like token / exact, but numbers match when |a-b| <= eps or
//                    |a-b| <= eps*|expected| (absolute OR relative). Default eps 1e-6.
//   unordered        stdio: the same multiset of non-empty lines.
//                    function: top-level array compared as a multiset.
//   unordered:deep   function only: every array, at every depth, as a multiset.

import type { LJson } from "./json-lossless.ts";
import { canonical, isIntegerLiteral, parseLossless, JsonParseError } from "./json-lossless.ts";

export type CompareSpec =
  | { mode: "exact" }
  | { mode: "token" }
  | { mode: "float"; epsilon: number }
  | { mode: "unordered"; deep: boolean };

export class CompareSpecError extends Error {}

export function parseCompareSpec(raw: unknown): CompareSpec {
  if (raw === undefined || raw === null) return { mode: "exact" };
  if (typeof raw === "object") {
    const o = raw as { mode?: unknown; epsilon?: unknown; deep?: unknown };
    if (o.mode === "float") {
      const eps = o.epsilon === undefined ? 1e-6 : Number(o.epsilon);
      if (!Number.isFinite(eps) || eps < 0 || eps > 1) throw new CompareSpecError("compare.epsilon must be in [0, 1]");
      return { mode: "float", epsilon: eps };
    }
    if (o.mode === "unordered") return { mode: "unordered", deep: o.deep === true };
    if (o.mode === "exact" || o.mode === "token") return { mode: o.mode };
    throw new CompareSpecError(`unsupported compare mode ${JSON.stringify(o.mode)}`);
  }
  if (typeof raw !== "string") throw new CompareSpecError("compare must be a string or object");
  const s = raw.trim();
  if (s === "exact" || s === "token") return { mode: s };
  if (s === "unordered") return { mode: "unordered", deep: false };
  if (s === "unordered:deep") return { mode: "unordered", deep: true };
  if (s === "float") return { mode: "float", epsilon: 1e-6 };
  const m = /^float:(.+)$/.exec(s);
  if (m) return parseCompareSpec({ mode: "float", epsilon: Number(m[1]) });
  if (s === "custom") throw new CompareSpecError("custom checkers are not supported by judge-lite yet");
  throw new CompareSpecError(`unsupported compare mode "${s}"`);
}

export interface CompareResult {
  ok: boolean;
  /** Short human-readable reason for a mismatch (never includes hidden data). */
  reason?: string;
}

// ---------------------------------------------------------------------------
// stdio (plain text)
// ---------------------------------------------------------------------------

export function normalizeText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

function tokens(s: string): string[] {
  const t = s.trim();
  return t === "" ? [] : t.split(/\s+/);
}

const NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function floatEq(expected: number, actual: number, eps: number): boolean {
  if (expected === actual) return true;
  const d = Math.abs(expected - actual);
  return d <= eps || d <= eps * Math.abs(expected);
}

function tokenEq(e: string, a: string, eps: number | null): boolean {
  if (e === a) return true;
  if (eps === null) return false;
  if (!NUM_RE.test(e) || !NUM_RE.test(a)) return false;
  return floatEq(Number(e), Number(a), eps);
}

export function compareText(expected: string, actual: string, spec: CompareSpec): CompareResult {
  switch (spec.mode) {
    case "exact": {
      const ok = normalizeText(expected) === normalizeText(actual);
      if (ok) return { ok };
      const el = normalizeText(expected).split("\n");
      const al = normalizeText(actual).split("\n");
      for (let i = 0; i < Math.max(el.length, al.length); i++) {
        if (el[i] !== al[i]) return { ok: false, reason: `line ${i + 1} differs` };
      }
      return { ok: false, reason: "output differs" };
    }
    case "token":
    case "float": {
      const et = tokens(expected);
      const at = tokens(actual);
      const eps = spec.mode === "float" ? spec.epsilon : null;
      for (let i = 0; i < Math.min(et.length, at.length); i++) {
        if (!tokenEq(et[i], at[i], eps)) return { ok: false, reason: `token ${i + 1} differs` };
      }
      if (et.length !== at.length) return { ok: false, reason: `expected ${et.length} tokens, got ${at.length}` };
      return { ok: true };
    }
    case "unordered": {
      const lines = (s: string) =>
        normalizeText(s)
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l !== "")
          .sort();
      const e = lines(expected);
      const a = lines(actual);
      if (e.length !== a.length) return { ok: false, reason: `expected ${e.length} lines, got ${a.length}` };
      return e.every((l, i) => l === a[i]) ? { ok: true } : { ok: false, reason: "lines differ (order ignored)" };
    }
  }
}

// ---------------------------------------------------------------------------
// function mode (JSON values)
// ---------------------------------------------------------------------------

function numEq(e: string, a: string, eps: number | null): boolean {
  if (isIntegerLiteral(e) && isIntegerLiteral(a)) return BigInt(e) === BigInt(a);
  const x = Number(e);
  const y = Number(a);
  if (eps === null) return x === y;
  return floatEq(x, y, eps);
}

function sortedArray(v: LJson[], deep: boolean): LJson[] {
  const items = deep ? v.map((x) => normalizeUnordered(x, true)) : v;
  return [...items].sort((p, q) => {
    const a = canonical(p);
    const b = canonical(q);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function normalizeUnordered(v: LJson, deep: boolean): LJson {
  if (v.t !== "arr") return v;
  return { t: "arr", v: sortedArray(v.v, deep) };
}

function jsonEq(e: LJson, a: LJson, eps: number | null): boolean {
  if (e.t === "num" && a.t === "num") return numEq(e.raw, a.raw, eps);
  if (e.t !== a.t) return false;
  switch (e.t) {
    case "str":
      return e.v === (a as { v: string }).v;
    case "bool":
      return e.v === (a as { v: boolean }).v;
    case "null":
      return true;
    case "arr": {
      const av = (a as { v: LJson[] }).v;
      return e.v.length === av.length && e.v.every((x, i) => jsonEq(x, av[i], eps));
    }
    case "obj": {
      const am = (a as { v: Map<string, LJson> }).v;
      if (e.v.size !== am.size) return false;
      for (const [k, x] of e.v) {
        const y = am.get(k);
        if (!y || !jsonEq(x, y, eps)) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

export function compareJson(expectedText: string, actualText: string, spec: CompareSpec): CompareResult {
  let e: LJson;
  let a: LJson;
  try {
    e = parseLossless(expectedText);
  } catch (err) {
    throw new CompareSpecError(`expected value is not valid JSON: ${(err as Error).message}`);
  }
  try {
    a = parseLossless(actualText);
  } catch (err) {
    if (err instanceof JsonParseError) return { ok: false, reason: "returned value could not be read" };
    throw err;
  }
  if (spec.mode === "unordered") {
    if (e.t !== "arr" || a.t !== "arr") return jsonEq(e, a, null) ? { ok: true } : { ok: false, reason: "wrong answer" };
    const ok = jsonEq(normalizeUnordered(e, spec.deep), normalizeUnordered(a, spec.deep), null);
    return ok ? { ok } : { ok: false, reason: "wrong answer (order ignored)" };
  }
  const eps = spec.mode === "float" ? spec.epsilon : null;
  return jsonEq(e, a, eps) ? { ok: true } : { ok: false, reason: "wrong answer" };
}
