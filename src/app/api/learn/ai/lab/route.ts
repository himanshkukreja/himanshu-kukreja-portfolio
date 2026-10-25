import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getLab } from "@/lib/learn/labs/load";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { labHintSystem, labReviewSystem } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Failure = { group?: string; name?: string; message?: string; line?: number | null };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();

/**
 * POST /api/learn/ai/lab { labId, kind: "hint"|"review", level?: 1|2|3, code, failures?: Failure[], setup?: string }
 * Hints never show the solution; hidden tests are sent by message only (no names) and the prompt
 * forbids quoting them. Signed-in learners only.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { labId?: string; kind?: string; level?: number; code?: string; failures?: Failure[]; setup?: string };
  const lab = await getLab(String(b.labId || ""));
  if (!lab) return NextResponse.json({ error: "Unknown lab" }, { status: 404 });
  const code = String(b.code || "").slice(0, 8000);
  if (!code.trim()) return NextResponse.json({ error: "Write some code first" }, { status: 400 });
  const review = b.kind === "review";
  const level = Math.min(3, Math.max(1, Number(b.level) || 1));
  const brief = `${lab.summary}\n\n${text(lab.briefHtml).slice(0, 4000)}`;

  const failures = (Array.isArray(b.failures) ? b.failures : []).slice(0, 8).map((f) =>
    f.group === "hidden" ? `- a hidden test failed: ${String(f.message || "").slice(0, 300)}` : `- ${String(f.name || "test").slice(0, 120)}: ${String(f.message || "").slice(0, 400)}${f.line ? ` (line ${f.line})` : ""}`,
  );
  const user = review
    ? `My solution passes every test. Review it.\n\n\`\`\`python\n${code}\n\`\`\``
    : `Hint level ${level}.\n\nMy code:\n\`\`\`python\n${code}\n\`\`\`\n\n${b.setup ? `It doesn't load: ${String(b.setup).slice(0, 600)}` : `Failing:\n${failures.join("\n") || "- (no details)"}`}`;

  const r = await callClaude({
    feature: review ? "lab-review" : "lab-hint",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: review ? labReviewSystem({ title: lab.title, brief }) : labHintSystem({ title: lab.title, brief }),
    messages: [{ role: "user", content: user }],
    meta: { lab: lab.id, kind: review ? "review" : "hint", level: review ? null : level },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, review ? "lab-review" : "lab-hint", user, r.text);
  return NextResponse.json({ text: r.text, creditsLeft: r.creditsLeft });
}
