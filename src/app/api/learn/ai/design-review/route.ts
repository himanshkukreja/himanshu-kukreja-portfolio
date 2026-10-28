import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getStore } from "@/lib/design-week/store";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { designReviewSystem, promptOptsFor, stripPrivatePlan } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/learn/ai/design-review { slug, md } → { text, creditsLeft }: a staff-engineer review of a design-of-the-week draft. */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { slug?: string; md?: string };
  const md = String(b.md || "").trim();
  if (md.split(/\s+/).length < 80) return NextResponse.json({ error: "Write at least a rough design (80+ words) first." }, { status: 400 });
  const c = await getStore()
    .getChallengeBySlug(String(b.slug || ""))
    .catch(() => null);
  if (!c || c.status === "draft") return NextResponse.json({ error: "Unknown challenge" }, { status: 404 });
  const problem = `${c.title}\n\n${c.briefMd}\n\nConstraints:\n${c.constraints.map((x) => `- ${x}`).join("\n")}`;
  const r = await callClaude({
    feature: "design-review",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: (model) => designReviewSystem({ title: c.title, text: problem }, promptOptsFor(model)),
    messages: [{ role: "user", content: md.slice(0, 15000) }],
    meta: { challenge: c.slug },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  const text = stripPrivatePlan(r.text);
  await saveTranscript(r.callId, me.id, "design-review", md, text);
  return NextResponse.json({ text, creditsLeft: r.creditsLeft });
}
