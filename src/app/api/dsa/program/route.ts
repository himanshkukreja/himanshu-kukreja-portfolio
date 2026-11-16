import { NextResponse } from "next/server";
import { getLearner } from "@/app/api/learn/_lib/auth";
import { DSA_FULL } from "@/lib/dsa/flags";
import { dsaBetaAllowed } from "@/lib/dsa/access";
import { callJudge, judgeEnv } from "@/lib/dsa/judge-client";
import { JUDGE_DAILY_CAP, JUDGE_PER_MINUTE, judgeMinute, underDailyCap } from "@/lib/dsa/judge-limits";
import { buildProgramJudgeRequest, checkProgramSize, programResultFromJudge, type ProgramJudgeBody } from "@/lib/dsa/playground/program";

/**
 * POST /api/dsa/program { language: "java" | "cpp", code, stdin } → ProgramResult (src/lib/dsa/playground/program.ts)
 *
 * The Playground's and the runnable snippets' Java and C++ runs: a whole program with stdin on judge-lite's "stdio" mode
 * (one test, expected null = just run). Same rules as problem runs (/api/dsa/judge): signed in, access (admins and beta
 * testers before launch), 8 a minute and 300 a day per learner (one allowance shared with problem runs,
 * src/lib/dsa/judge-limits.ts), 64 KB of code (and of input), judge-lite's default limits (2 s, 256 MB).
 * Python and JavaScript never come here: they run in the browser.
 *
 * Until JUDGE_URL and JUDGE_HMAC_SECRET are set this answers 503 { comingSoon: true }. 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: NO_STORE });

export async function POST(req: Request) {
  if (!DSA_FULL) return fail(404, "Not found");
  const me = await getLearner(req);
  if (!me) return fail(401, "Sign in to run code.");
  const env = judgeEnv();
  if (!env) return fail(503, "Java and C++ run on our server, which is coming soon. Python and JavaScript run in your browser today.", { comingSoon: true });
  if (!(await dsaBetaAllowed(me.email))) return fail(403, "Running Java and C++ on the server is open to beta testers before launch.");

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Send JSON.");
  }
  const language = body.language === "java" || body.language === "cpp" ? body.language : null;
  const code = typeof body.code === "string" ? body.code : "";
  const stdin = typeof body.stdin === "string" ? body.stdin : "";
  if (!language) return fail(400, "language must be java or cpp.");
  const bad = checkProgramSize(code, stdin);
  if (bad) return fail(bad.includes("limited") ? 413 : 400, bad);

  if (!judgeMinute.hit(me.id)) return fail(429, `Up to ${JUDGE_PER_MINUTE} server runs a minute. Wait a few seconds and try again.`, { retryAfterSec: 10 });
  if (!(await underDailyCap(me.id))) return fail(429, `You've reached today's ${JUDGE_DAILY_CAP} server runs. Python and JavaScript still run in your browser.`);

  let res;
  try {
    res = await callJudge<ProgramJudgeBody & { message?: string }>(env, buildProgramJudgeRequest({ language, code, stdin }), { timeoutMs: 45_000 });
  } catch (e) {
    console.warn("[dsa-program] call failed:", (e as Error).message);
    return fail(502, "The judge didn't answer. Please try again in a minute.");
  }
  if (res.status === 503) return fail(503, `The judge is busy. Try again in ${res.retryAfterSec ?? 10} seconds.`, { retryAfterSec: res.retryAfterSec ?? 10 });
  if (res.status !== 200 || typeof res.body !== "object" || !res.body) {
    const b = res.body as { message?: string } | string;
    return fail(res.status >= 400 && res.status < 500 ? 400 : 502, typeof b === "object" && b?.message ? b.message : "The judge couldn't run this program.");
  }
  return NextResponse.json(programResultFromJudge(res.body), { headers: NO_STORE });
}
