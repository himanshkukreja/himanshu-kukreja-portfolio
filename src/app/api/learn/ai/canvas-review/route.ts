import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { canvasReviewSystem, promptOptsFor, stripPrivatePlan } from "@/lib/ai/prompts";
import { canvasPrompts, FREE_RE, getDesign, isPromptKey, promptBrief, saveReview } from "@/lib/learn/canvas";
import { sketchSummary } from "@/lib/learn/mock/sketch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { key } → { text, creditsLeft }: a staff-engineer review of the SAVED drawing and notes. */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { key?: string };
  const key = String(b.key || "");
  if (!isPromptKey(key)) return NextResponse.json({ error: "Unknown design." }, { status: 404 });
  const d = await getDesign(me.id, key).catch(() => null);
  if (!d) return NextResponse.json({ error: "Draw something first (it saves as you go)." }, { status: 400 });
  const drawing = sketchSummary(d.scene);
  const boxes = (drawing.match(/^Boxes: (.*)$/m)?.[1] || "").split(",").filter((x) => x.trim()).length;
  const words = d.notes.trim() ? d.notes.trim().split(/\s+/).length : 0;
  if (boxes < 3 && words < 60) return NextResponse.json({ error: "Draw at least 3 labelled boxes (or write 60+ words of notes) first." }, { status: 400 });

  let brief: { title: string; text: string };
  if (FREE_RE.test(key)) {
    brief = { title: d.title || "My own design", text: d.brief || d.title || "The learner's own system; infer the requirements from the drawing and notes, and say which you assumed." };
  } else {
    const p = (await canvasPrompts().catch(() => [])).find((x) => x.key === key);
    if (!p) return NextResponse.json({ error: "Unknown design." }, { status: 404 });
    brief = { title: p.title, text: await promptBrief(p) };
  }
  const input = `<drawing>\n${drawing || "(nothing labelled on the board)"}\n</drawing>\n\n<notes>\n${d.notes.trim() || "(no notes)"}\n</notes>`;
  const r = await callClaude({
    feature: "canvas-review",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: (model) => canvasReviewSystem(brief, promptOptsFor(model, "canvas-review")),
    messages: [{ role: "user", content: input.slice(0, 12000) }],
    meta: { design: key },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  // a tuned prompt's private plan line never reaches the learner (or the saved review)
  const text = stripPrivatePlan(r.text);
  await saveTranscript(r.callId, me.id, "canvas-review", input, text);
  await saveReview(d.id, text, d.reviews + 1).catch(() => undefined);
  return NextResponse.json({ text, creditsLeft: r.creditsLeft });
}
