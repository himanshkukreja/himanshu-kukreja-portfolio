import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { mockInterviewerSystem, promptOptsFor, stripPrivatePlan } from "@/lib/ai/prompts";
import { problemText, promptPhase } from "@/lib/ai/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Msg = { role: "user" | "assistant"; content: string };
const MAX_TURNS = 10;

/** POST /api/learn/ai/mock/turn { slug, phaseId, history: Msg[], answer } → { text, creditsLeft }: the interviewer's next line. */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { slug?: string; phaseId?: string; history?: Msg[]; answer?: string };
  const mock = await getMockInterview(String(b.slug || ""));
  const phase = mock?.phases.find((p) => p.id === b.phaseId);
  if (!mock || !phase) return NextResponse.json({ error: "Unknown interview" }, { status: 404 });
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
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    // the model is decided inside callClaude (admin setting, amber mode): it picks the prompt tuned for that model
    // the tuned (compact) prompt for every model: in the blind eval it lifted Sonnet from ~2 to 4.5 (one
    // question a turn, only stated facts, no teaching); its private <plan> line is stripped below
    system: (model) => mockInterviewerSystem({ company: mock.company.name, interviewer: `${mock.interviewer.name}, ${mock.interviewer.title}`, problem: problemText(mock), phase: promptPhase(phase) }, { ...promptOptsFor(model), compact: true }),
    messages: [...history, { role: "user", content: answer }],
    meta: { mock: mock.slug, phase: phase.id, turn: history.filter((m) => m.role === "user").length + 1 },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  const text = stripPrivatePlan(r.text);
  await saveTranscript(r.callId, me.id, "mock-interviewer", answer, text);
  return NextResponse.json({ text, creditsLeft: r.creditsLeft });
}
