import { after, NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getCatalogue } from "@/lib/concepts/load";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { explainBackSystem, promptOptsFor, replyFrom } from "@/lib/ai/prompts";
import { DSA_FULL } from "@/lib/dsa/flags";
import { learnerBrief } from "@/lib/learner/brief";
import { recordOutcome } from "@/lib/learner/events";
import { namedItems } from "@/lib/learner/events-model";
import { compareExplain, withBrief } from "@/lib/learner/feature-brief-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/learn/ai/explain { conceptId, text, course? } → { verdict, text, creditsLeft }: grades an explanation against the
 * concept's key points. course "dsa": a DSA Mastery concept, graded against its lesson's invariant and keyPoints (staging only
 * until launch; admins and beta testers, src/lib/dsa/access.ts).
 *
 * The learner model (12 Nov 2026, AI audit O2/O5/O9): the learner's turn carries their brief (earlier verdicts on this
 * concept and the key points missed then; lib/learner), the verdict and the missed key point numbers go to the outcome
 * log (never the explanation), and `compare` says what moved since the last attempt ("Up from partial to solid").
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
  const course = b.course === "dsa" ? "dsa" : "sdm";
  const ref = c.id;
  const brief = await learnerBrief(me.id, { feature: "explain-back", course, ref: { kinds: ["explain_back"], ref, topic: term } });
  const r = await callClaude({
    feature: "explain-back",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: (model) => explainBackSystem({ term, keyPoints }, promptOptsFor(model, "explain-back")),
    messages: [{ role: "user", content: withBrief(brief.text, text, "My explanation:") }],
    // the cap is for what the learner wrote; the brief is the route's own context
    capChars: text.length,
    meta: { concept: c.id, ...(brief.text ? { brief: true } : {}) },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  const out = replyFrom(r.text, "VERDICT:");
  await saveTranscript(r.callId, me.id, "explain-back", text, out);
  const verdict = (out.match(/VERDICT:\s*(solid|partial|misconception)/i)?.[1] || "").toLowerCase() || null;
  // the key points the grader named as missing, as their numbers (the log keeps ids, never words)
  const points = keyPoints.map((k, i) => ({ id: String(i + 1), text: k }));
  const missing = out.match(/^MISSING:\s*(.*)$/im)?.[1] ?? "";
  const miss = verdict === "solid" ? [] : namedItems(missing, points);
  const prev = brief.events.find((e) => e.kind === "explain_back" && e.ref === ref);
  const compare = compareExplain(prev, { verdict, miss }, (id) => brief.names.item({ course, kind: "explain_back", ref, outcome: null, detail: {}, at: 0 }, id) ?? keyPoints[Number(id) - 1] ?? null);
  if (verdict) after(() => recordOutcome(request, me.id, { course, kind: "explain_back", ref, outcome: verdict, detail: { miss } }).then(() => undefined));
  return NextResponse.json({ verdict, text: out, compare, creditsLeft: r.creditsLeft, callId: r.callId });
}
