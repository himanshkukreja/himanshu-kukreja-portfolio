import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey } from "@/lib/ai/client";
import { readRequest } from "@/lib/ai/chat/core";
import { chatLimits, chatToday, quotaFor } from "@/lib/ai/chat/quota";
import { DSA_FULL } from "@/lib/dsa/flags";
import { DSA_LANGS, type DsaLang } from "@/lib/dsa/types";
import { getProblemShard } from "@/lib/dsa/ai/search";
import { forgetUnlocks, unlocksFor } from "@/lib/dsa/ai/unlock";
import { TUTOR_MODES, type TutorMode } from "@/lib/dsa/ai/modes";
import { streamDsa } from "@/lib/dsa/ai/run";
import { prepareTutor, readResult } from "@/lib/dsa/ai/turn";
import { loadMemory } from "@/lib/ai/chat/server";
import { learnerBrief } from "@/lib/learner/brief";
import { readClientSignals } from "@/lib/learner/dsa-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CODE = 12_000;
/**
 * GET /api/learn/ai/dsa/tutor → { quota } (signed in): the problem tutor's daily messages.
 *
 * POST /api/learn/ai/dsa/tutor (ChatRequest + { dsa: { problemId, mode, code, lang, result, hintsOpen } }) → server-sent
 * events (ChatEvent): the problem room's tutor (feature "dsa-tutor", its own daily messages). The problem's statement,
 * signature, target complexity and the hint ladder up to the learner's next rung go in the system prompt; the editorial and
 * the reference solution only when this learner unlocked it (read from their own rows, lib/dsa/ai/unlock.ts). While it is
 * locked, code blocks in the answer are capped (lib/dsa/ai/text.ts capCode) on top of the prompt's no-spoiler rule.
 * The learner's turn also carries the learner brief (lib/learner/brief.ts) and their failed submits on this problem; every
 * few messages the shared memory takes the session in (lib/dsa/ai/memory.ts). Every mode but "explain" thinks first
 * (Haiku 5.5, low effort). 404 in "soon" mode.
 */
export async function GET(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const [{ perDay }, t, m] = await Promise.all([chatLimits("dsa-tutor"), chatToday(me.id, "dsa-tutor"), loadMemory(me.id)]);
  return NextResponse.json({ quota: quotaFor(perDay, t.total, !!ownKey(request)), memory: { available: m.available, paused: m.paused, has: m.available && m.memory.updatedAt > 0 }, feedback: false }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = readRequest(body);
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400, headers: noStore });
  const req = parsed;
  const d = (body?.dsa && typeof body.dsa === "object" ? body.dsa : {}) as Record<string, unknown>;
  const problemId = String(d.problemId || "");
  if (!ID.test(problemId)) return NextResponse.json({ error: "Unknown problem" }, { status: 400, headers: noStore });
  const mode: TutorMode = TUTOR_MODES.includes(d.mode as TutorMode) ? (d.mode as TutorMode) : "ask";
  const lang: DsaLang = DSA_LANGS.includes(d.lang as DsaLang) ? (d.lang as DsaLang) : "python";
  const code = typeof d.code === "string" ? d.code : "";
  if (code.length > MAX_CODE) return NextResponse.json({ error: `Your code is too long for the tutor (${code.length.toLocaleString()} characters, the limit is ${MAX_CODE.toLocaleString()}).` }, { status: 413, headers: noStore });
  const result = readResult(d.result);
  const hintsOpen = Math.max(0, Math.min(10, Math.floor(Number(d.hintsOpen) || 0)));
  const shard = await getProblemShard(problemId).catch(() => null);
  if (!shard) return NextResponse.json({ error: "Unknown problem" }, { status: 404, headers: noStore });
  const admin = await isAdminEmail(me.email);
  // a submit changes the record the brief and the unlock rule read (failed submits, a solve): read it fresh
  if (result?.mode === "submit") forgetUnlocks(me.id);
  const signals = readClientSignals(body?.learner);
  // the editor's language is the one they code in right now
  const client = { lang, full: !!signals?.full, exp: signals?.exp ?? null };
  const brief = learnerBrief(me.id, { course: "dsa", feature: "dsa-tutor", ref: { problemId }, client }).catch(() => null);
  const VERDICT = result ? `${result.mode} ${result.verdict} ${result.passed}/${result.total}` : "no run yet";

  return streamDsa({
    request,
    me,
    admin,
    userKey: ownKey(request),
    feature: "dsa-tutor",
    req,
    lookup: { tool: "get_item", label: mode === "hint" ? "Reading your code and the hint ladder…" : mode === "explain" ? "Reading the problem…" : "Reading your code and the problem…", noun: "problem" },
    memory: { where: `the problem room's tutor on "${shard.title}" (${shard.level}, concept: ${shard.conceptTitle}), in ${lang}; this message: ${mode} mode, last result ${VERDICT}, hint rungs open ${hintsOpen} of ${shard.rungs.length}`, on: brief.then((b) => !!b?.memory.available && !b.memory.paused) },
    prepare: async () => {
      const [unlocks, b] = await Promise.all([unlocksFor(me.id), brief]);
      return prepareTutor({ req, problemId, shard, mode, lang, code, result, hintsOpen, unlocked: unlocks.unlocked.has(problemId), solved: unlocks.solved.has(problemId), fails: b?.facts?.fails ?? 0, brief: b?.text || undefined });
    },
  });
}
