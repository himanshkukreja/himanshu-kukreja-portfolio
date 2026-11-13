import { NextResponse, after } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { weakDrillSystem } from "@/lib/ai/prompts";
import { supabase } from "@/lib/supabase";
import { recapSource, topicText } from "@/lib/learner/planning";
import { drillOutcome, drillTurn, DRILL_SCHEMA, DRILL_SIZE, headingsOf, readDrill, WARMUP_SIZE } from "@/lib/learner/drill-model";
import { recordOutcome } from "@/lib/learner/events";
import { firstJson } from "@/lib/ai/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };
const KEY = /^(?:sdm|dsa|lesson):[\w./-]{1,120}$/;
const PROBLEM = /^[a-z0-9][a-z0-9-]{0,80}$/;

/**
 * POST /api/learn/ai/drill   (signed-in learners; FEATURES "weak-drill", Haiku 5.5, strict JSON)
 *   { action: "drill", key }       3 quick questions on a topic the learner missed twice lately (one of /api/learn/planning's
 *                                  struggles; the server checks it against their outcome log) → { drill, label, href, creditsLeft }
 *   { action: "warmup", problem }  one warm-up question ("Try a smaller version") for a DSA problem they failed 3+ times without
 *                                  a solve (checked against dsa_submissions) → { drill, label, href, creditsLeft }
 *   { action: "done", key, correct, total, course }   one chat_quiz outcome (counts only) for a finished drill → { ok }
 * Both questions and the answer key go to the browser, which grades instantly: no learner answer comes back here.
 * The transcript kept 30 days holds the topic key and the generated questions (course text), never anything the learner typed.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (b.action === "done") {
    const key = typeof b.key === "string" && KEY.test(b.key) ? b.key : "";
    const total = Number(b.total);
    const correct = Number(b.correct);
    if (!key || !Number.isInteger(total) || total < 1 || total > DRILL_SIZE || !Number.isInteger(correct) || correct < 0 || correct > total) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
    const course = key.startsWith("dsa:") ? "dsa" : "sdm";
    await recordOutcome(request, me.id, drillOutcome(key, correct, total, course)).catch(() => false);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  const mode = b.action === "warmup" ? "warmup" : b.action === "drill" ? "drill" : null;
  if (!mode) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });

  let src: Awaited<ReturnType<typeof topicText>> = null;
  let key = "";
  let extra = "";
  if (mode === "drill") {
    key = typeof b.key === "string" && KEY.test(b.key) ? b.key : "";
    src = key ? await recapSource(me.id, key).catch(() => null) : null;
    if (!src) return NextResponse.json({ error: "That topic isn't one you've missed lately." }, { status: 404, headers: noStore });
  } else {
    const id = typeof b.problem === "string" && PROBLEM.test(b.problem) ? b.problem : "";
    const [{ data }, { getProblemIndex }] = await Promise.all([supabase.from("dsa_submissions").select("verdict").eq("user_id", me.id).eq("problem_id", id).limit(500), import("@/lib/dsa/load")]);
    const subs = (data ?? []) as { verdict: string }[];
    const fails = subs.filter((s) => s.verdict !== "AC" && s.verdict !== "CE").length;
    const p = id ? (await getProblemIndex().catch(() => [])).find((x) => x.id === id) : null;
    if (!p || fails < 3 || subs.some((s) => s.verdict === "AC")) return NextResponse.json({ error: "A smaller version is offered after three failed submits." }, { status: 404, headers: noStore });
    key = `dsa:${p.concept}`;
    extra = `the idea behind the problem "${p.title}"; do not solve or hint at that problem`;
    src = await topicText(key).catch(() => null);
    if (!src) return NextResponse.json({ error: "No lesson text for that pattern yet." }, { status: 404, headers: noStore });
  }

  const ai = await callClaude({
    feature: "weak-drill",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: weakDrillSystem(mode),
    messages: [{ role: "user", content: drillTurn(src, mode, extra) }],
    outputSchema: DRILL_SCHEMA as unknown as Record<string, unknown>,
    timeoutMs: 25_000,
    meta: { topic: key.split(":")[0], mode },
  });
  if (!ai.ok) return NextResponse.json({ error: ai.message, creditsLeft: ai.creditsLeft, href: src.href }, { status: ai.status === "error" ? 502 : 429, headers: noStore });
  const drill = readDrill(firstJson(ai.text), headingsOf(src.text), mode === "warmup" ? WARMUP_SIZE : DRILL_SIZE);
  if (!drill) return NextResponse.json({ error: "The questions didn't come out right. Try again.", creditsLeft: ai.creditsLeft, href: src.href }, { status: 502, headers: noStore });
  after(() => saveTranscript(ai.callId, me.id, "weak-drill", `drill:${key}`, ai.text));
  return NextResponse.json({ drill, key, label: src.label, href: src.href, creditsLeft: ai.creditsLeft }, { headers: noStore });
}
