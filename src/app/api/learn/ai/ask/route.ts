import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getLearningResource } from "@/lib/github";
import { getStorySource } from "@/lib/stories";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { lessonQaSystem, promptOptsFor } from "@/lib/ai/prompts";
import { lessonContext } from "@/lib/ai/retrieve";
import { isAnswerStyle, styleLine } from "@/lib/ai/answerStyle";
import { isRestyle, restyleLine, teachLine, TEACH_REVEAL_ASK } from "@/lib/ai/teaching";
import { splitFollowups } from "@/lib/ai/chat/text";
import { ASK_MODES as MODES, askCapChars, buildAskTurn, clipPrevious } from "@/lib/ai/askTurn";
import { learnerBrief } from "@/lib/learner/brief";
import { withBrief } from "@/lib/learner/feature-brief-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SLUG = /^[A-Za-z0-9-]{1,120}$/;

/**
 * POST /api/learn/ai/ask { week, slug, question, selection?, mode?, style?, previous? } → { text, followups, creditsLeft }
 * or { story, question, selection?, mode?, style?, previous? } for a case file (/case-files/<story>).
 * Signed-in learners only. The lesson's (or case file's) outline and its most relevant sections go as context.
 * `style` is the learner's answer style (lib/ai/answerStyle.ts), `previous` their last question and its answer in the
 * panel (so "explain that more simply" and a quick check's answer work); both go in the learner's turn, as data.
 * The answer's follow-ups line becomes `followups` (the panel's cards).
 * The learner's turn also carries their brief (lib/learner, 12 Nov 2026): level and how they like answers (the default
 * style when they picked none, O10), what they found hard, and their graded results on this topic. Off when memory is.
 * `teach: true` ("Teach me", lib/ai/teaching.ts): one guiding question at a time, the explanation once they've tried;
 * `restyle` ("Explain it differently"): the previous answer again, another way (an analogy, steps, a diagram, code first).
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => ({}))) as { week?: string; slug?: string; story?: string; question?: string; selection?: string; mode?: string; style?: string; previous?: { q?: unknown; a?: unknown } | null; teach?: unknown; restyle?: unknown };
  const story = body.story ? String(body.story) : "";
  const week = String(body.week || "");
  const slug = String(body.slug || "");
  const question = String(body.question || "").trim();
  const selection = String(body.selection || "").trim().slice(0, 1500);
  if (story ? !SLUG.test(story) : !SLUG.test(week) || !SLUG.test(slug)) return NextResponse.json({ error: "Unknown lesson" }, { status: 400 });
  if (!question && !selection && !(body.mode && MODES[body.mode])) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  // a course lesson, or a case file from the CMS
  let doc: { title: string; content: string } | null = null;
  if (story) {
    const src = await getStorySource(story).catch(() => null);
    if (src) doc = { title: src.title, content: src.body };
  } else {
    const lesson = await getLearningResource(week, slug).catch(() => null);
    if (lesson) doc = { title: lesson.resource.title, content: lesson.content };
  }
  if (!doc) return NextResponse.json({ error: story ? "Unknown case file" : "Unknown lesson" }, { status: 404 });
  const kind = story ? "case file" : "lesson";

  const mode = body.mode && MODES[body.mode] ? MODES[body.mode] : "";
  // the panel's last exchange, clipped at a sentence end; it never counts toward the input cap (lib/ai/askTurn.ts)
  const prev = clipPrevious(body.previous);
  const brief = await learnerBrief(me.id, { feature: "lesson-qa", ref: { topic: `${doc.title} ${question} ${selection.slice(0, 200)}` }, styleChosen: !!mode || isAnswerStyle(body.style), styleLine: true });
  // the learner's own pick, else the style their memory points to (O10: a beginner gets "simple"), never over a mode
  const style = isAnswerStyle(body.style) ? body.style : !mode ? brief.style : null;
  // "Explain it differently" (needs the previous answer) replaces the style line; "Teach me" adds its own
  const restyle = isRestyle(body.restyle) && prev ? body.restyle : null;
  const teach = body.teach === true && !restyle && question !== TEACH_REVEAL_ASK ? teachLine({ answering: !!prev }) : "";
  const ask = buildAskTurn({ question, selection, kind, mode, style: [restyle ? restyleLine(restyle) : styleLine(style), teach].filter(Boolean).join("\n\n"), prev });
  // a follow-up about the previous answer finds its sections from that question's words too
  const context = { title: doc.title, text: lessonContext(doc.content, [question, prev && !selection ? prev.q : ""].filter(Boolean).join(" "), selection), kind } as const;
  // the prompt is picked by the model the call actually uses (Haiku 5.5 has its own variant)
  const system = (model: string) => lessonQaSystem(context, promptOptsFor(model, "lesson-qa"));
  const r = await callClaude({
    feature: "lesson-qa",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system,
    messages: [{ role: "user", content: withBrief(brief, ask) }],
    capChars: askCapChars(question),
    meta: { ...(story ? { story } : { week, slug }), mode: body.mode ?? null, selection: !!selection, ...(brief.text ? { brief: true } : {}), ...(teach ? { teach: true } : {}), ...(restyle ? { restyle } : {}) },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, status: r.status, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  const { text, followups } = splitFollowups(r.text, question);
  await saveTranscript(r.callId, me.id, "lesson-qa", ask, text);
  return NextResponse.json({ text, followups, creditsLeft: r.creditsLeft });
}
