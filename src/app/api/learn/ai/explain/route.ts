import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getCatalogue } from "@/lib/concepts/load";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { explainBackSystem } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/learn/ai/explain { conceptId, text } → { verdict, text, creditsLeft }: grades an explanation against the concept's key points. */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { conceptId?: string; text?: string };
  const text = String(b.text || "").trim();
  if (text.split(/\s+/).length < 8) return NextResponse.json({ error: "Write at least a couple of sentences in your own words." }, { status: 400 });
  const { catalogue } = await getCatalogue();
  const c = catalogue.concepts.find((x) => x.id === b.conceptId);
  if (!c) return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  const keyPoints = [c.definition, ...c.refresher];
  const r = await callClaude({
    feature: "explain-back",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: explainBackSystem({ term: c.term, keyPoints }),
    messages: [{ role: "user", content: text }],
    meta: { concept: c.id },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, "explain-back", text, r.text);
  const verdict = (r.text.match(/VERDICT:\s*(solid|partial|misconception)/i)?.[1] || "").toLowerCase() || null;
  return NextResponse.json({ verdict, text: r.text, creditsLeft: r.creditsLeft });
}
