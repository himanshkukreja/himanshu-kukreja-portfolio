import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { mockCoachSystem } from "@/lib/ai/prompts";
import { problemText, promptPhase } from "@/lib/ai/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/learn/ai/mock/coach { slug, phaseId, notes, curveballs?, chat?, board? } → { text, creditsLeft }:
 * a short live read on one finished phase (went well, missing as nudges, what to try next).
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { slug?: string; phaseId?: string; notes?: string; curveballs?: string[]; chat?: { role: string; content: string }[]; board?: string };
  const mock = await getMockInterview(String(b.slug || ""));
  const phase = mock?.phases.find((p) => p.id === b.phaseId);
  if (!mock || !phase) return NextResponse.json({ error: "Unknown interview" }, { status: 404 });
  const said = (Array.isArray(b.chat) ? b.chat : []).filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content.slice(0, 2000));
  const candidate = [
    b.notes ? `Written answer:\n${String(b.notes).slice(0, 6000)}` : "",
    ...(Array.isArray(b.curveballs) ? b.curveballs : []).filter(Boolean).map((a) => `Curveball answer:\n${String(a).slice(0, 2000)}`),
    ...said.map((c) => `Said to the interviewer:\n${c}`),
    b.board ? `Whiteboard:\n${String(b.board).slice(0, 3000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  if (candidate.split(/\s+/).length < 8) return NextResponse.json({ error: "Write or say a little more in this phase for a useful read." }, { status: 400 });

  const r = await callClaude({
    feature: "mock-coach",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: mockCoachSystem({ company: mock.company.name, problem: problemText(mock), phase: promptPhase(phase) }),
    messages: [{ role: "user", content: candidate }],
    meta: { mock: mock.slug, phase: phase.id },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, "mock-coach", `[${mock.slug} · ${phase.id}]\n${candidate.slice(0, 4000)}`, r.text);
  return NextResponse.json({ text: r.text, creditsLeft: r.creditsLeft });
}
