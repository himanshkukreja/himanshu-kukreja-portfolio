import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey, saveTranscript } from "@/lib/ai/client";
import { FEATURES } from "@/lib/ai/features";
import { runLoop } from "@/lib/ai/chat/loop";
import { admitChat, afterMessage, chatLimits, chatToday, logChatCall, quotaFor } from "@/lib/ai/chat/quota";
import { DSA_FULL } from "@/lib/dsa/flags";
import { DSA_LANG_LABEL, DSA_LANGS, type DsaLang } from "@/lib/dsa/types";
import { getProblemShard } from "@/lib/dsa/ai/search";
import { forgetUnlocks, unlocksFor } from "@/lib/dsa/ai/unlock";
import { interviewMessage, interviewSystem, type WireTurn } from "@/lib/dsa/ai/interview-prompts";
import { interviewStage, parseScorecard, parseTurn, STAGE_QUESTIONS, type InterviewStage } from "@/lib/dsa/interview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CODE = 8_000;
const MAX_ANSWER = 2_000;
const DEADLINE_MS = 50_000;
const str = (x: unknown, n: number) => (typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ").slice(0, n) : "");

/**
 * GET /api/learn/ai/dsa/interview → { quota } (signed in): the same daily messages as the problem tutor (feature
 * "dsa-tutor": an interview call is one tutor message, `meta.mode` says "interview").
 *
 * POST /api/learn/ai/dsa/interview { problemId, lang, action: "start" | "answer" | "score", stage, step, turns, question,
 * answer, code, justSolved } → JSON { stage, turn | scorecard, quota }. The round is stateless: the page sends the answered
 * turns each time. The STAGE is chosen here from the learner's own rows (unlock.ts), never from the page: a locked
 * editorial always means the "explain your approach" drill, whose prompt gets neither the editorial nor the reference
 * solution, and whose replies have fenced code removed. A page asking for another stage gets 409 with the right one.
 */
export async function GET(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const [{ perDay }, t] = await Promise.all([chatLimits("dsa-tutor"), chatToday(me.id, "dsa-tutor")]);
  return NextResponse.json({ quota: quotaFor(perDay, t.total, !!ownKey(request)) }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  const problemId = String(body.problemId || "");
  if (!ID.test(problemId)) return NextResponse.json({ error: "Unknown problem" }, { status: 400, headers: noStore });
  const action = body.action === "answer" || body.action === "score" ? body.action : "start";
  const asked: InterviewStage = body.stage === "followup" ? "followup" : "explain";
  const lang: DsaLang = DSA_LANGS.includes(body.lang as DsaLang) ? (body.lang as DsaLang) : "python";
  const code = str(body.code, MAX_CODE + 1);
  if (code.length > MAX_CODE) return NextResponse.json({ error: `Your code is too long for the interviewer (the limit is ${MAX_CODE.toLocaleString()} characters).` }, { status: 413, headers: noStore });
  const answer = str(body.answer, MAX_ANSWER);
  const question = str(body.question, 700);
  const total = STAGE_QUESTIONS[asked];
  const step = Math.max(1, Math.min(total, Math.floor(Number(body.step) || 1)));
  const turns: WireTurn[] = (Array.isArray(body.turns) ? body.turns : []).slice(0, total).map((t) => {
    const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const fb = (o.feedback && typeof o.feedback === "object" ? o.feedback : {}) as Record<string, unknown>;
    return { q: str(o.q, 700), a: str(o.a, MAX_ANSWER), withCode: o.withCode === true, score: Math.max(1, Math.min(5, Math.round(Number(o.score) || 1))), missing: str(fb.missing, 300) };
  });
  if (action === "answer" && (!question || (!answer.trim() && !code.trim()))) return NextResponse.json({ error: "Nothing to answer" }, { status: 400, headers: noStore });
  if (action === "score" && !turns.length) return NextResponse.json({ error: "Nothing to score yet" }, { status: 400, headers: noStore });

  const shard = await getProblemShard(problemId).catch(() => null);
  if (!shard) return NextResponse.json({ error: "Unknown problem" }, { status: 404, headers: noStore });
  // the stage comes from the learner's own rows; a fresh read right after an accepted submit
  if (body.justSolved === true) forgetUnlocks(me.id);
  const unlocks = await unlocksFor(me.id);
  const stage = interviewStage({ accepted: unlocks.solved.has(problemId), unlocked: unlocks.unlocked.has(problemId) });
  if (stage !== asked) return NextResponse.json({ error: stage === "followup" ? "This problem's solution is open now, so the round is the follow-up round." : "The follow-up round opens after you solve the problem or open its editorial.", stage }, { status: 409, headers: noStore });

  const admin = await isAdminEmail(me.email);
  const userKey = ownKey(request);
  const feature = "dsa-tutor" as const;
  const admit = await admitChat({ userId: me.id, admin, userKey, feature });
  if (!admit.ok) {
    await logChatCall({ user_id: me.id, feature, model: FEATURES[feature].model, status: admit.status, error: admit.message, meta: { course: "dsa", mode: "interview" }, byok: !!userKey });
    return NextResponse.json({ error: admit.message, quota: admit.quota }, { status: admit.status === "disabled" ? 403 : 429, headers: noStore });
  }
  if (!admit.apiKey) return NextResponse.json({ error: "AI is not configured" }, { status: 403, headers: noStore });

  const sig = shard.signature ? `${shard.signature.fn}(${shard.signature.params.map((p) => `${p.name}: ${p.type}`).join(", ")}) -> ${shard.signature.returns}` : shard.title;
  const system = interviewSystem(stage, {
    title: shard.title,
    level: shard.level,
    conceptTitle: shard.conceptTitle,
    signature: sig,
    statement: shard.statement,
    target: shard.complexity ? `${shard.complexity.time} time, ${shard.complexity.space} extra space` : null,
    patterns: shard.patterns,
    classic: shard.classic,
    editorial: stage === "followup" ? shard.editorial : null,
    solution: stage === "followup" ? (shard.solutions[lang] ?? null) : null,
  });
  const content = interviewMessage({ action, stage, step, total, turns, question, answer, code: code.split("\n").map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join("\n"), lang: DSA_LANG_LABEL[lang] });
  const thinks = action !== "start" && /haiku-5-5/.test(admit.model);
  const t0 = Date.now();
  let last = { text: "", error: null as string | null, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, costUsd: 0, requestId: null as string | null, stop: "" };
  let turn: ReturnType<typeof parseTurn> = null;
  let card: ReturnType<typeof parseScorecard> = null;
  // one retry when the reply isn't the JSON asked for
  for (let attempt = 0; attempt < 2 && !turn && !card; attempt++) {
    const loop = await runLoop({
      apiKey: admit.apiKey,
      model: admit.model,
      system: system.map((b) => ({ type: "text" as const, text: b.text, ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}) })),
      tools: [],
      messages: [{ role: "user", content }],
      maxTokens: 1500 + (thinks ? 2000 : 0),
      thinking: thinks ? { type: "adaptive" } : /haiku/.test(admit.model) ? { type: "disabled" } : /sonnet-5/.test(admit.model) ? { type: "between_tools" } : null,
      ...(thinks ? { effort: "low" as const } : {}),
      maxToolRounds: 0,
      deadline: t0 + DEADLINE_MS,
      signal: request.signal,
      runTool: async () => "",
    });
    last = {
      text: loop.text,
      error: loop.error,
      usage: {
        input_tokens: last.usage.input_tokens + loop.usage.input_tokens,
        output_tokens: last.usage.output_tokens + loop.usage.output_tokens,
        cache_read_input_tokens: last.usage.cache_read_input_tokens + loop.usage.cache_read_input_tokens,
        cache_creation_input_tokens: last.usage.cache_creation_input_tokens + loop.usage.cache_creation_input_tokens,
      },
      costUsd: last.costUsd + loop.costUsd,
      requestId: loop.requestId,
      stop: loop.stop,
    };
    if (loop.error) break;
    if (action === "score") card = parseScorecard(loop.text, turns);
    else {
      turn = parseTurn(loop.text, action, stage);
      // a question must follow unless this was the last answer
      if (turn && action === "start" && !turn.next) turn = null;
      if (turn && action === "answer" && step < total && !turn.next) turn = null;
    }
  }
  const ok = !last.error && !!(turn || card);
  const callId = await logChatCall({
    user_id: me.id,
    feature,
    model: admit.model,
    status: ok ? "ok" : "error",
    error: ok ? null : (last.error || "unreadable reply").slice(0, 300),
    input_tokens: last.usage.input_tokens,
    output_tokens: last.usage.output_tokens,
    cache_read_tokens: last.usage.cache_read_input_tokens,
    cache_write_tokens: last.usage.cache_creation_input_tokens,
    cost_usd: last.costUsd,
    credits: 0,
    latency_ms: Date.now() - t0,
    request_id: last.requestId,
    byok: admit.byok,
    meta: { course: "dsa", mode: "interview", problem: problemId, stage, action, step, lang, unlocked: stage === "followup", codeChars: code.length },
  });
  if (!ok) return NextResponse.json({ error: last.error === "timeout" ? "The interviewer took too long. Try again." : "The interviewer didn't answer this time. Try again in a moment.", quota: admit.quota }, { status: 502, headers: noStore });
  await saveTranscript(callId, me.id, feature, `[interview ${stage} · ${action} · ${problemId}] ${answer}\n\n${code.slice(0, 2000)}`, last.text);
  return NextResponse.json({ stage, ...(turn ? { turn } : {}), ...(card ? { scorecard: card } : {}), quota: afterMessage(admit.quota) }, { headers: noStore });
}
