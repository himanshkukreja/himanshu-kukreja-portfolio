import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { mockFullScorecardSystem } from "@/lib/ai/prompts";
import { problemText, promptPhase } from "@/lib/ai/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PhaseIn = { id: string; notes?: string; curveballs?: string[]; chat?: { role: string; content: string }[] };

/** POST /api/learn/ai/mock/scorecard { slug, phases: PhaseIn[] } → { text, creditsLeft }: every phase graded in one call. */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { slug?: string; phases?: PhaseIn[]; board?: string };
  const mock = await getMockInterview(String(b.slug || ""));
  if (!mock) return NextResponse.json({ error: "Unknown interview" }, { status: 404 });
  const given = new Map((Array.isArray(b.phases) ? b.phases : []).map((p) => [p.id, p]));
  const phases = mock.phases.map((p) => {
    const x = given.get(p.id);
    const chat = (x?.chat || []).filter((m) => m.role === "user").map((m) => String(m.content).slice(0, 2500));
    const candidate = [x?.notes ? `Notes:\n${String(x.notes).slice(0, 5000)}` : "", ...(x?.curveballs || []).filter(Boolean).map((a) => `Curveball answer:\n${String(a).slice(0, 2000)}`), ...chat.map((c) => `Said to the interviewer:\n${c}`)]
      .filter(Boolean)
      .join("\n\n");
    const pp = promptPhase(p);
    return { title: p.title, rubric: pp.rubric, modelAnswer: pp.modelAnswer, candidate };
  });
  // the whiteboard (drawing summarised as text, plus its notes) belongs with the design phase
  const board = String(b.board || "").trim().slice(0, 4000);
  if (board) {
    const k = phases.findIndex((p) => /high[- ]level|architecture|design/i.test(p.title));
    const at = k >= 0 ? k : phases.length - 1;
    phases[at] = { ...phases[at], candidate: [phases[at].candidate, `Whiteboard:\n${board}`].filter(Boolean).join("\n\n") };
  }
  if (!phases.some((p) => p.candidate.trim().split(/\s+/).length >= 20)) return NextResponse.json({ error: "Write a bit more in at least one phase first." }, { status: 400 });

  const r = await callClaude({
    feature: "mock-scorecard",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: mockFullScorecardSystem({ company: mock.company.name, problem: problemText(mock), phases }),
    messages: [{ role: "user", content: "Grade my interview." }],
    meta: { mock: mock.slug },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, "mock-scorecard", phases.map((p) => `## ${p.title}\n${p.candidate}`).join("\n\n"), r.text);
  return NextResponse.json({ text: r.text, creditsLeft: r.creditsLeft });
}
