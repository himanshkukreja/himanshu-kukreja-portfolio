import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import type { MockInterview, MockPhase } from "@/lib/learn/mock/types";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { lldInterviewerReply, lldInterviewerSystem, mockInterviewerSystem, promptOptsFor, stripPrivatePlan } from "@/lib/ai/prompts";
import { lldTurnInput, problemText, promptPhase } from "@/lib/ai/mock";
import { withChange } from "@/lib/learn/mock/lld";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Msg = { role: "user" | "assistant"; content: string };
const MAX_TURNS = 10;
/** machine-coding rounds: more back-and-forth per phase (clarifying questions, code walk-throughs), and room for code */
const LLD_TURNS = 14;
const LLD_ANSWER = 6000;
const LLD_HISTORY_CHARS = 9000;

/**
 * POST /api/learn/ai/mock/turn { slug, phaseId, history: Msg[], answer } → { text, creditsLeft }: the interviewer's next line.
 * A machine-coding round (/mock/lld-NN-*, kind "lld") also sends { change, changeAnnounced }: the attempt's requirement
 * change and whether the room has brought it yet. It runs as feature "lld-mock" (shared daily credits, signed in only).
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { slug?: string; phaseId?: string; history?: Msg[]; answer?: string; change?: string; changeAnnounced?: boolean };
  const built = await getMockInterview(String(b.slug || ""));
  const lld = built?.kind === "lld";
  const mock = built && lld ? withChange(built, typeof b.change === "string" ? b.change : null) : built;
  const phase = mock?.phases.find((p) => p.id === b.phaseId);
  if (!mock || !phase) return NextResponse.json({ error: "Unknown interview" }, { status: 404 });
  if (lld) return lldTurn(request, me, mock, phase, b);
  const answer = String(b.answer || "").trim().slice(0, 4000);
  if (!answer) return NextResponse.json({ error: "Say something first" }, { status: 400 });
  const history = (Array.isArray(b.history) ? b.history : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-2 * MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
  if (history.filter((m) => m.role === "user").length >= MAX_TURNS) return NextResponse.json({ error: `That's ${MAX_TURNS} exchanges in this phase: time to move on to the next one.` }, { status: 429 });
  // the API wants the conversation to start with the candidate: drop a leading interviewer line
  while (history[0]?.role === "assistant") history.shift();

  const r = await callClaude({
    feature: "mock-interviewer",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    // the model is decided inside callClaude (admin setting, amber mode): it picks the prompt tuned for that model
    // Haiku 5.5 (the model since 7 Nov 2026) gets its own tuned prompt (TUNED_FOR_HAIKU55), other models the compact one
    // (TUNED_FOR_EVERY_MODEL: in the blind eval it lifted Sonnet from ~2 to 4.5); the private <plan> line is stripped below
    system: (model) => mockInterviewerSystem({ company: mock.company.name, interviewer: `${mock.interviewer.name}, ${mock.interviewer.title}`, problem: problemText(mock), phase: promptPhase(phase) }, promptOptsFor(model, "mock-interviewer")),
    messages: [...history, { role: "user", content: answer }],
    meta: { mock: mock.slug, phase: phase.id, turn: history.filter((m) => m.role === "user").length + 1 },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  const text = stripPrivatePlan(r.text);
  await saveTranscript(r.callId, me.id, "mock-interviewer", answer, text);
  return NextResponse.json({ text, creditsLeft: r.creditsLeft });
}

/** One interviewer turn of a machine-coding round: the case study's own requirements, no code and no design in the reply. */
async function lldTurn(request: Request, me: { id: string; email: string | null }, mock: MockInterview, phase: MockPhase, b: { history?: Msg[]; answer?: string; changeAnnounced?: boolean }) {
  const answer = String(b.answer || "").trim().slice(0, LLD_ANSWER);
  if (!answer) return NextResponse.json({ error: "Say something first" }, { status: 400 });
  let history = (Array.isArray(b.history) ? b.history : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-2 * LLD_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
  if (history.filter((m) => m.role === "user").length >= LLD_TURNS) return NextResponse.json({ error: `That's ${LLD_TURNS} exchanges in this phase: time to move on to the next one.` }, { status: 429 });
  // keep the newest turns within the feature's input cap (a pasted file early on shouldn't block the phase)
  while (history.length && history.reduce((a, m) => a + m.content.length, 0) > LLD_HISTORY_CHARS) history = history.slice(2);
  while (history[0]?.role === "assistant") history.shift();
  const turn = history.filter((m) => m.role === "user").length + 1;
  const r = await callClaude({
    feature: "lld-mock",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: lldInterviewerSystem(lldTurnInput(mock, phase, !!b.changeAnnounced)),
    messages: [...history, { role: "user", content: answer }],
    meta: { mock: mock.slug, phase: phase.id, turn, kind: "lld", change: mock.phases.find((p) => p.id === mock.lld?.codePhase)?.curveballs[0]?.id ?? null },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  // the reply is speech: no "Ananya:" label in front of it
  const first = mock.interviewer.name.split(/\s+/)[0];
  const text = lldInterviewerReply(r.text).replace(new RegExp(`^\\s*\\**${first}\\**\\s*:\\s*`, "i"), "") || "Go on: talk me through it.";
  await saveTranscript(r.callId, me.id, "lld-mock", answer, text);
  return NextResponse.json({ text, creditsLeft: r.creditsLeft });
}
