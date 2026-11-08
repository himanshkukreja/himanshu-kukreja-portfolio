import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getLearner, isMissing } from "@/app/api/learn/_lib/auth";
import { RateLimiter } from "@/lib/design-week/core";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getProblemTests } from "@/lib/dsa/load";

/**
 * POST /api/dsa/submit { problemId, language, verdict, passed, total, judgedBy, ms, code } → { stored }
 *
 * Records a Submit in dsa_submissions (plan §7.3 step 3, `judged_by: browser` for Python and JavaScript). Signed-in
 * learners only; guests' solves live in their browser. Browser verdicts are not trusted for points: verified=false until
 * the judge re-runs the first AC (a later step). The code itself isn't stored, only a normalised hash (plan §8.3).
 * Until supabase/migrations/20261109_dsa_platform.sql is applied the table is missing and this answers { stored: false }:
 * progress still saves through learning_progress and the game keys. 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const limiter = new RateLimiter(30, 60_000);
const VERDICTS = new Set(["AC", "WA", "TLE", "RE", "CE", "MLE", "OLE", "ERR"]);
const LANGS = new Set(["python", "javascript", "java", "cpp"]);
let tableMissing = false;

export async function POST(req: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = await getLearner(req);
  if (!me) return NextResponse.json({ stored: false, reason: "guest" }, { headers: NO_STORE });
  if (!limiter.hit(me.id)) return NextResponse.json({ stored: false, reason: "rate" }, { status: 429, headers: NO_STORE });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const problemId = String(b.problemId || "");
  const language = String(b.language || "");
  const verdict = String(b.verdict || "");
  if (!LANGS.has(language) || !VERDICTS.has(verdict)) return NextResponse.json({ error: "Bad submission" }, { status: 400, headers: NO_STORE });
  const t = await getProblemTests(problemId).catch(() => null);
  if (!t) return NextResponse.json({ error: "Unknown problem" }, { status: 404, headers: NO_STORE });
  if (tableMissing) return NextResponse.json({ stored: false, reason: "table" }, { headers: NO_STORE });
  const code = typeof b.code === "string" ? b.code.slice(0, 65536) : "";
  const norm = code.replace(/\/\/[^\n]*|#[^\n]*/g, "").replace(/\s+/g, "");
  const { error } = await supabase.from("dsa_submissions").insert({
    user_id: me.id,
    problem_id: problemId,
    language,
    verdict,
    passed: Math.max(0, Math.min(10_000, Number(b.passed) || 0)),
    total: Math.max(0, Math.min(10_000, Number(b.total) || 0)),
    judged_by: b.judgedBy === "server" ? "server" : "browser",
    verified: false,
    time_ms: Math.max(0, Math.min(600_000, Math.round(Number(b.ms) || 0))),
    code_hash: norm ? createHash("sha256").update(norm).digest("hex").slice(0, 32) : null,
    tests_version: t.version,
  });
  if (error) {
    if (isMissing(error)) tableMissing = true;
    else console.warn("[dsa-submit]", error.message);
    return NextResponse.json({ stored: false }, { headers: NO_STORE });
  }
  return NextResponse.json({ stored: true }, { headers: NO_STORE });
}
