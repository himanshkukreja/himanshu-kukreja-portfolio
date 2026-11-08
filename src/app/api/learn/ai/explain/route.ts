import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getCatalogue } from "@/lib/concepts/load";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { explainBackSystem, promptOptsFor, replyFrom } from "@/lib/ai/prompts";
import { DSA_FULL } from "@/lib/dsa/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/learn/ai/explain { conceptId, text, course? } → { verdict, text, creditsLeft }: grades an explanation against the
 * concept's key points. course "dsa": a DSA Mastery concept, graded against its lesson's invariant and keyPoints (staging only
 * until launch; admins and beta testers, src/lib/dsa/access.ts).
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { conceptId?: string; text?: string; course?: string };
  const text = String(b.text || "").trim();
  if (text.split(/\s+/).length < 8) return NextResponse.json({ error: "Write at least a couple of sentences in your own words." }, { status: 400 });
  let c: { id: string; term: string } | undefined;
  let keyPoints: string[] = [];
  if (b.course === "dsa") {
    if (!DSA_FULL) return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
    const { dsaBetaAllowed } = await import("@/lib/dsa/access");
    if (!(await dsaBetaAllowed(me.email))) return NextResponse.json({ error: "Explain it back opens to everyone at launch. During the beta it is for testers." }, { status: 403 });
    const { getConcept } = await import("@/lib/dsa/load");
    const d = await getConcept(String(b.conceptId || "")).catch(() => null);
    if (d) {
      c = { id: `dsa:${d.id}`, term: d.title };
      keyPoints = [d.invariant, ...d.keyPoints].filter(Boolean);
    }
  } else {
    const { catalogue } = await getCatalogue();
    const sc = catalogue.concepts.find((x) => x.id === b.conceptId);
    if (sc) {
      c = { id: sc.id, term: sc.term };
      keyPoints = [sc.definition, ...sc.refresher];
    }
  }
  if (!c) return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  const term = c.term;
  const r = await callClaude({
    feature: "explain-back",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: (model) => explainBackSystem({ term, keyPoints }, promptOptsFor(model, "explain-back")),
    messages: [{ role: "user", content: text }],
    meta: { concept: c.id },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  const out = replyFrom(r.text, "VERDICT:");
  await saveTranscript(r.callId, me.id, "explain-back", text, out);
  const verdict = (out.match(/VERDICT:\s*(solid|partial|misconception)/i)?.[1] || "").toLowerCase() || null;
  return NextResponse.json({ verdict, text: out, creditsLeft: r.creditsLeft });
}
