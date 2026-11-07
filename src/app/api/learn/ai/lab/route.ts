import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getLab } from "@/lib/learn/labs/load";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { MODELS } from "@/lib/ai/prices";
import { LAB_REVIEW_SCHEMA, LAB_REVIEW_V2_SYSTEM, labHintSystem, labReviewV2Input, parseLabReview, promptOptsFor, stripPrivatePlan } from "@/lib/ai/prompts";
import { LANG_LABEL, type Lab, type LabLang } from "@/lib/learn/labs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Failure = { group?: string; name?: string; message?: string; line?: number | null };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();

/** The lab's brief as plain text: an incident's report first, a project's current stage after the brief. */
function briefOf(lab: Lab, stage: number | null): string {
  const parts = [lab.summary, lab.incident ? text(lab.incident.reportHtml) : "", text(lab.briefHtml)];
  if (stage != null && lab.stages[stage]) parts.push(`Current stage ${stage + 1} of ${lab.stages.length}, "${lab.stages[stage].title}": ${text(lab.stages[stage].briefHtml)}`);
  return parts.filter(Boolean).join("\n\n").slice(0, 4500);
}

/**
 * POST /api/learn/ai/lab { labId, kind: "hint"|"review", lang?, stage?, level?: 1|2|3, code, failures?: Failure[], setup?: string }
 * Hints never show the solution; hidden tests are sent by message only (no names) and the prompt
 * forbids quoting them. Signed-in learners only.
 *
 * kind "review" (after a pass): the v2 structured review. Only the lab's brief (looked up here from labId) and the
 * reader's code go to the model: no test output, no account data. Claude Haiku 5.5, pinned (no Sonnet, whatever
 * the admin's model override says; amber mode keeps Haiku 5.5), JSON through output_config.format, and the fixed
 * system prompt as a cached prefix so repeat reviews read it at a tenth of the price. Returns { review, costUsd }.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { labId?: string; kind?: string; lang?: string; stage?: number; level?: number; code?: string; failures?: Failure[]; setup?: string };
  const lab = await getLab(String(b.labId || ""));
  if (!lab) return NextResponse.json({ error: "Unknown lab" }, { status: 404 });
  const code = String(b.code || "").slice(0, 8000);
  if (!code.trim()) return NextResponse.json({ error: "Write some code first" }, { status: 400 });
  const lang: LabLang = b.lang === "javascript" || b.lang === "typescript" ? b.lang : "python";
  const stage = Number.isInteger(b.stage) && lab.stages[b.stage as number] ? (b.stage as number) : null;
  const review = b.kind === "review";
  const level = Math.min(3, Math.max(1, Number(b.level) || 1));
  const brief = briefOf(lab, stage);
  const fence = lang === "python" ? "python" : lang === "typescript" ? "ts" : "js";

  if (review) {
    const user = labReviewV2Input({ title: lab.title, language: LANG_LABEL[lang], kind: lab.type, brief, stage: stage != null ? `${stage + 1} of ${lab.stages.length}: ${lab.stages[stage].title}` : null, code });
    const r = await callClaude({
      feature: "lab-review",
      model: MODELS.haiku55,
      userId: me.id,
      adminPreview: await isAdminEmail(me.email),
      userKey: ownKey(request),
      system: [{ text: LAB_REVIEW_V2_SYSTEM, cache: true }],
      messages: [{ role: "user", content: user }],
      outputSchema: LAB_REVIEW_SCHEMA as unknown as Record<string, unknown>,
      meta: { lab: lab.id, kind: "review", lang, stage, v: 2 },
    });
    if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
    const parsed = parseLabReview(r.text);
    await saveTranscript(r.callId, me.id, "lab-review", user, r.text);
    if (parsed === "off_topic") return NextResponse.json({ error: "That doesn't look like code for this lab.", creditsLeft: r.creditsLeft }, { status: 422 });
    if (!parsed) return NextResponse.json({ error: r.stopReason === "max_tokens" ? "The review ran long and was cut off. Try again." : "The review came back garbled. Try again.", creditsLeft: r.creditsLeft }, { status: 502 });
    return NextResponse.json({
      review: parsed,
      creditsLeft: r.creditsLeft,
      costUsd: r.costUsd,
      usage: { input: r.usage?.input_tokens ?? 0, output: r.usage?.output_tokens ?? 0, cacheRead: r.usage?.cache_read_input_tokens ?? 0, cacheWrite: r.usage?.cache_creation_input_tokens ?? 0 },
    });
  }

  const failures = (Array.isArray(b.failures) ? b.failures : []).slice(0, 8).map((f) =>
    f.group === "hidden" ? `- a hidden test failed: ${String(f.message || "").slice(0, 300)}` : `- ${String(f.name || "test").slice(0, 120)}: ${String(f.message || "").slice(0, 400)}${f.line ? ` (line ${f.line})` : ""}`,
  );
  const user = `Hint level ${level}. Language: ${LANG_LABEL[lang]}.\n\nMy code:\n\`\`\`${fence}\n${code}\n\`\`\`\n\n${b.setup ? `It doesn't load: ${String(b.setup).slice(0, 600)}` : `Failing:\n${failures.join("\n") || "- (no details)"}`}`;

  const r = await callClaude({
    feature: "lab-hint",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: (model) => labHintSystem({ title: lab.title, brief }, promptOptsFor(model, "lab-hint")),
    messages: [{ role: "user", content: user }],
    meta: { lab: lab.id, kind: "hint", level, lang },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  const answer = stripPrivatePlan(r.text);
  await saveTranscript(r.callId, me.id, "lab-hint", user, answer);
  return NextResponse.json({ text: answer, creditsLeft: r.creditsLeft });
}
