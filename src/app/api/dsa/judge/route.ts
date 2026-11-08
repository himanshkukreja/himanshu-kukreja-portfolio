import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getLearner, isMissing } from "@/app/api/learn/_lib/auth";
import { RateLimiter } from "@/lib/design-week/core";
import { DSA_FULL } from "@/lib/dsa/flags";
import { dsaBetaAllowed } from "@/lib/dsa/access";
import { getProblemTests } from "@/lib/dsa/load";
import { callJudge, judgeEnv } from "@/lib/dsa/judge-client";
import type { CaseResult, JudgeOutcome, Verdict } from "@/lib/dsa/harness";

/**
 * POST /api/dsa/judge { problemId, language: "java" | "cpp", code, mode: "run" | "submit" } → JudgeOutcome
 *
 * Java and C++ run on judge-lite (plan §7.3, §14.4): the Worker checks sign-in, access (admins and beta testers before
 * launch, src/lib/dsa/access.ts), a rate limit of 8 a minute and a daily cap of 300 per learner, then sends the code
 * and the tests, HMAC-signed, to JUDGE_URL. "run" sends the visible tests, "submit" visible + hidden; hidden tests
 * never come back with their expected output (the judge withholds them).
 *
 * Until JUDGE_URL and JUDGE_HMAC_SECRET are set this answers 503 { comingSoon: true } with a clear message.
 * The daily cap uses the judge_usage table and dsa_judge_hit() (supabase/migrations/20261109_dsa_platform.sql) when
 * applied, and a per-isolate count otherwise. 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: NO_STORE });

const PER_MINUTE = 8;
const DAILY_CAP = 300;
const MAX_CODE = 64 * 1024;
const minute = new RateLimiter(PER_MINUTE, 60_000);
const localDaily = new Map<string, { day: string; n: number }>();

/** One judge run against today's cap: the table when the migration is applied, else this isolate's count. */
async function underDailyCap(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("dsa_judge_hit", { p_user: userId, p_cap: DAILY_CAP });
    if (!error && typeof data === "number") return data >= 0;
    if (error && !isMissing(error) && !/function .* does not exist|Could not find the function/i.test(error.message || "")) console.warn("[dsa-judge] usage:", error.message);
  } catch {
    /* fall through to the local count */
  }
  const day = new Date().toISOString().slice(0, 10);
  const cur = localDaily.get(userId);
  const n = cur && cur.day === day ? cur.n + 1 : 1;
  localDaily.set(userId, { day, n });
  if (localDaily.size > 10_000) for (const [k, v] of localDaily) if (v.day !== day) localDaily.delete(k);
  return n <= DAILY_CAP;
}

type JudgeTest = { id: string; verdict: string; timeMs: number; hidden: boolean; message?: string; output?: string; stdout?: string; stderr?: string };
type JudgeBody = { verdict?: string; compile?: { ok: boolean; output: string }; tests?: JudgeTest[]; summary?: { passed: number; total: number }; firstFailure?: { id: string; message?: string; input?: string } | null; judgeMs?: number; error?: string; message?: string };

const KNOWN: Verdict[] = ["AC", "WA", "TLE", "RE", "CE", "MLE", "OLE"];

export async function POST(req: Request) {
  if (!DSA_FULL) return fail(404, "Not found");
  const env = judgeEnv();
  if (!env) return fail(503, "Java and C++ judging is coming soon. Python and JavaScript run in your browser today.", { comingSoon: true });

  const me = await getLearner(req);
  if (!me) return fail(401, "Sign in to judge Java and C++ on the server.");
  if (!(await dsaBetaAllowed(me.email))) return fail(403, "Server judging (Java and C++) is open to beta testers before launch.");

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Send JSON.");
  }
  const problemId = String(body.problemId || "");
  const language = body.language === "java" || body.language === "cpp" ? body.language : null;
  const code = typeof body.code === "string" ? body.code : "";
  const mode = body.mode === "submit" ? "submit" : "run";
  if (!language) return fail(400, "language must be java or cpp.");
  if (!code.trim()) return fail(400, "Write some code first.");
  if (new TextEncoder().encode(code).length > MAX_CODE) return fail(413, "Code is limited to 64 KB.");

  if (!minute.hit(me.id)) return fail(429, `Up to ${PER_MINUTE} judge runs a minute. Wait a few seconds and try again.`, { retryAfterSec: 10 });
  if (!(await underDailyCap(me.id))) return fail(429, `You've reached today's ${DAILY_CAP} server runs. Python and JavaScript still run in your browser.`);

  const t = await getProblemTests(problemId);
  if (!t) return fail(404, "Unknown problem.");
  const cases = [...t.visible.map((c) => ({ ...c, hidden: false })), ...(mode === "submit" ? t.hidden.map((c) => ({ ...c, hidden: true })) : [])];
  const tests = cases.map((c, i) => ({ id: String(i), input: c.input, expected: c.output, hidden: c.hidden }));

  let res;
  try {
    res = await callJudge<JudgeBody>(env, {
      submissionId: `dsa_${problemId}_${Date.now().toString(36)}`.slice(0, 128),
      language,
      code,
      mode: "function",
      signature: t.signature,
      tests,
      limits: t.limits,
      compare: t.checker,
      stopOnFirstFailure: mode === "submit",
    });
  } catch (e) {
    console.warn("[dsa-judge] call failed:", (e as Error).message);
    return fail(502, "The judge didn't answer. Please try again in a minute.");
  }
  if (res.status === 503) return fail(503, `The judge is busy. Try again in ${res.retryAfterSec ?? 10} seconds.`, { retryAfterSec: res.retryAfterSec ?? 10 });
  if (res.status !== 200 || typeof res.body !== "object" || !res.body) {
    const b = res.body as JudgeBody | string;
    return fail(res.status >= 400 && res.status < 500 ? 400 : 502, typeof b === "object" && b?.message ? b.message : "The judge couldn't run this submission.");
  }
  const b = res.body;
  const out: CaseResult[] = (b.tests || []).map((x) => {
    const c = cases[Number(x.id)];
    const v = (x.verdict === "OK" ? "AC" : KNOWN.includes(x.verdict as Verdict) ? x.verdict : "RE") as Verdict;
    return { name: c?.name || `test ${x.id}`, hidden: !!c?.hidden, ok: v === "AC", ms: x.timeMs || 0, verdict: x.verdict === "SKIPPED" ? "AC" : v, got: c?.hidden ? undefined : x.output, message: c?.hidden ? (v === "WA" ? undefined : x.message) : x.message || x.stderr || undefined };
  });
  const ran = (b.tests || []).filter((x) => x.verdict !== "SKIPPED");
  const verdict = (b.verdict && KNOWN.includes(b.verdict as Verdict) ? b.verdict : b.verdict === "OK" ? "AC" : "RE") as Verdict;
  const outcome: JudgeOutcome = {
    verdict,
    passed: b.summary?.passed ?? out.filter((c) => c.ok).length,
    total: cases.length,
    cases: out.filter((_, i) => (b.tests || [])[i]?.verdict !== "SKIPPED" || ran.length === 0),
    message: verdict === "CE" ? b.compile?.output || "Compilation failed." : b.firstFailure?.message,
    ms: b.judgeMs || 0,
    judgedBy: "server",
  };
  return NextResponse.json(outcome, { headers: NO_STORE });
}
