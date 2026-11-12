import { after, NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { lldScorecardSystem, mockFullScorecardSystem, promptOptsFor, replyFrom } from "@/lib/ai/prompts";
import { lldRubricText, problemText, promptPhase } from "@/lib/ai/mock";
import { withChange } from "@/lib/learn/mock/lld";
import { MOCK_LEVELS, type MockInterview } from "@/lib/learn/mock/types";
import { scorecardOutcome } from "@/lib/learner/scorecard";
import { learnerBrief } from "@/lib/learner/brief";
import { recordOutcome } from "@/lib/learner/events";
import { withBrief, type Namer } from "@/lib/learner/feature-brief-model";
import type { OutcomeEvent } from "@/lib/learner/events-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PhaseIn = { id: string; notes?: string; curveballs?: string[]; chat?: { role: string; content: string }[] };

/**
 * POST /api/learn/ai/mock/scorecard { slug, phases: PhaseIn[] } → { text, creditsLeft }: every phase graded in one call.
 * A machine-coding round (kind "lld") also sends { change }; its code phase's notes are the code. It runs as feature
 * "lld-mock-scorecard" and grades against the case study's Interview checklist, quoting the lines missed.
 *
 * The learner model (12 Nov 2026, AI audit O2/O5/O9): `level` is the bar the learner picked. The learner's turn carries
 * their brief (earlier attempts at this mock, phase by phase); the levels and the rubric signal ids each phase met and
 * missed go to the outcome log (never their answers), and `compare` says what moved since the last attempt.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { slug?: string; phases?: PhaseIn[]; board?: string; change?: string; level?: string };
  const built = await getMockInterview(String(b.slug || ""));
  if (!built) return NextResponse.json({ error: "Unknown interview" }, { status: 404 });
  const lld = built.kind === "lld" ? built.lld! : null;
  const mock = lld ? withChange(built, typeof b.change === "string" ? b.change : null) : built;
  const given = new Map((Array.isArray(b.phases) ? b.phases : []).map((p) => [p.id, p]));
  const phases = mock.phases.map((p) => {
    const x = given.get(p.id);
    const chat = (x?.chat || []).filter((m) => m.role === "user").map((m) => String(m.content).slice(0, 2500));
    const isCode = !!lld && p.id === lld.codePhase;
    const candidate = [x?.notes ? (isCode ? `Code (their editor):\n${String(x.notes).slice(0, 12000)}` : `Notes:\n${String(x.notes).slice(0, 5000)}`) : "", ...(x?.curveballs || []).filter(Boolean).map((a) => `${lld ? "Answer to the requirement change" : "Curveball answer"}:\n${String(a).slice(0, 2000)}`), ...chat.map((c) => `Said to the interviewer:\n${c}`)]
      .filter(Boolean)
      .join("\n\n");
    const pp = promptPhase(p);
    return { title: p.title, rubric: lld ? lldRubricText(p, lld.checklist) : pp.rubric, modelAnswer: pp.modelAnswer, candidate };
  });
  // the whiteboard (drawing summarised as text, plus its notes) belongs with the design phase
  const board = String(b.board || "").trim().slice(0, 4000);
  if (board) {
    const k = lld ? mock.phases.findIndex((p) => p.id === lld.designPhase) : phases.findIndex((p) => /high[- ]level|architecture|design/i.test(p.title));
    const at = k >= 0 ? k : phases.length - 1;
    phases[at] = { ...phases[at], candidate: [phases[at].candidate, `Whiteboard:\n${board}`].filter(Boolean).join("\n\n") };
  }
  if (!phases.some((p) => p.candidate.trim().split(/\s+/).length >= 20)) return NextResponse.json({ error: "Write a bit more in at least one phase first." }, { status: 400 });
  const level = (MOCK_LEVELS as readonly string[]).includes(String(b.level)) ? String(b.level) : null;
  const ref = { kinds: lld ? (["lld_mock"] as const) : (["mock_overall", "mock_phase"] as const), ...(lld ? { ref: mock.slug } : { prefix: mock.slug }), topic: mock.title };
  const brief = await learnerBrief(me.id, { feature: lld ? "lld-mock-scorecard" : "mock-scorecard", ref: { ...ref, kinds: [...ref.kinds] }, mock: { company: mock.company.name, title: mock.title, level }, mockContent: mock });
  const grade = "Grade my interview.";

  if (lld) {
    const change = mock.phases.find((p) => p.id === lld.codePhase)?.curveballs[0]?.text ?? "";
    const r = await callClaude({
      feature: "lld-mock-scorecard",
      userId: me.id,
      adminPreview: await isAdminEmail(me.email),
      userKey: ownKey(request),
      system: lldScorecardSystem({ company: mock.company.name, problem: problemText(mock), change, checklist: lld.checklist.length, phases }),
      messages: [{ role: "user", content: withBrief(brief.text, grade) }],
      capChars: grade.length,
      meta: { mock: mock.slug, kind: "lld", ...(brief.text ? { brief: true } : {}) },
    });
    if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
    const text = replyFrom(r.text, "### P1");
    await saveTranscript(r.callId, me.id, "lld-mock-scorecard", phases.map((p) => `## ${p.title}\n${p.candidate}`).join("\n\n"), text);
    const compare = outcomes(request, me.id, mock, text, level, brief);
    return NextResponse.json({ text, compare, creditsLeft: r.creditsLeft });
  }

  const r = await callClaude({
    feature: "mock-scorecard",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: (model) => mockFullScorecardSystem({ company: mock.company.name, problem: problemText(mock), phases }, promptOptsFor(model, "mock-scorecard")),
    messages: [{ role: "user", content: withBrief(brief.text, grade) }],
    capChars: grade.length,
    meta: { mock: mock.slug, ...(brief.text ? { brief: true } : {}) },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  const text = replyFrom(r.text, "### P1");
  await saveTranscript(r.callId, me.id, "mock-scorecard", phases.map((p) => `## ${p.title}\n${p.candidate}`).join("\n\n"), text);
  const compare = outcomes(request, me.id, mock, text, level, brief);
  return NextResponse.json({ text, compare, creditsLeft: r.creditsLeft });
}

/** The scorecard's outcomes go to the log after the answer is out; the compare lines go back with it. */
function outcomes(request: Request, userId: string, mock: MockInterview, text: string, level: string | null, brief: { events: OutcomeEvent[]; names: Namer }): string[] {
  const o = scorecardOutcome(mock, text, level, brief.events, brief.names);
  if (o.rows.length) after(() => recordOutcome(request, userId, o.rows).then(() => undefined));
  return o.compare;
}
