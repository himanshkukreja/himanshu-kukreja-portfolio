import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, ownKey, saveTranscript, type AiResult } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { FEATURES } from "@/lib/ai/features";
import { checkImage, IMAGE_TYPES, type AiImageBlock, type ImageMediaType } from "@/lib/ai/image";
import { firstJson } from "@/lib/ai/notes";
import { MODELS } from "@/lib/ai/prices";
import { paperGradeInput, paperGradeSystem } from "@/lib/ai/prompts";
import { checkGrade, escalationReasons, type CheckedGrade, type EscalationReason, type QuestionGrade } from "@/lib/learn/papers/grade";
import { getParsedPaper } from "@/lib/learn/papers/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/** A refused or failed call, as the other AI routes answer it (502 for the API's failure, 429 for every limit). */
const aiError = (r: Extract<AiResult, { ok: false }>) =>
  NextResponse.json({ error: r.message, status: r.status, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : r.status === "too_long" ? 413 : 429, headers: noStore });

/**
 * POST /api/learn/ai/paper/grade { key, n, image: { mediaType, data }, typed?, sheets? }
 * → { grade: QuestionGrade, creditsLeft }: one handwritten answer graded against its marking scheme.
 *
 * The browser renders the answer's sheets into one PNG (lib/learn/papers/client.ts answerImage) and sends it only when
 * the learner asks for grading; the question, the scheme and the model answer are read here from the cached paper
 * (never from the request), so the grade is always against the real scheme. Haiku 5.5 grades first; Sonnet 5.5
 * re-grades when grade.ts escalationReasons says so, and its result is kept. Every grade is checked against the
 * scheme (checkGrade) before it is returned. Nothing is stored here: the browser keeps the marks (game flag) and the
 * page image is never stored (the transcript keeps the text only).
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { key?: unknown; n?: unknown; image?: { mediaType?: unknown; data?: unknown }; typed?: unknown; sheets?: unknown };
  const key = typeof b.key === "string" ? b.key : "";
  const found = key ? await getParsedPaper(key) : null;
  const paper = found?.paper;
  if (!paper) return NextResponse.json({ error: "Unknown paper" }, { status: 400, headers: noStore });
  const n = Number(b.n);
  const q = Number.isInteger(n) ? paper.questions[n - 1] : undefined;
  if (!q) return NextResponse.json({ error: "Unknown question" }, { status: 400, headers: noStore });

  const mediaType = String(b.image?.mediaType || "") as ImageMediaType;
  const data = typeof b.image?.data === "string" ? b.image.data.replace(/^data:image\/\w+;base64,/, "") : "";
  if (!IMAGE_TYPES.includes(mediaType) || !data) return NextResponse.json({ error: "The answer image is missing" }, { status: 400, headers: noStore });
  const image: AiImageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data } };
  const def = FEATURES["paper-grade"];
  const ok = checkImage(image, { maxBytes: def.maxImageBytes, maxSide: def.maxImageSide });
  if (!ok.ok) return NextResponse.json({ error: ok.message }, { status: ok.reason === "size" || ok.reason === "dimensions" ? 413 : 400, headers: noStore });
  const typed = typeof b.typed === "string" ? b.typed.replace(/[<>]/g, " ").slice(0, 4000) : "";
  const sheets = Math.max(1, Math.min(3, Number(b.sheets) || 1));

  const text = paperGradeInput({ title: paper.title, n: q.n, kind: q.kind, marks: q.marks, prompt: q.prompt, scheme: q.scheme, answer: q.answer, typed, sheets });
  const scheme = { scheme: q.scheme, marks: q.marks };
  const call = (model?: string, pass = 1) =>
    callClaude({
      feature: "paper-grade",
      userId: me.id,
      adminPreview: isAdminEmail(me.email),
      userKey: ownKey(request),
      system: paperGradeSystem(),
      // the image first, then the text about it (the Messages API's advice for image prompts)
      messages: [{ role: "user", content: [image, { type: "text", text }] }],
      ...(model ? { model } : {}),
      meta: { paper: paper.key, q: q.n, kind: q.kind, pass, sheets },
      timeoutMs: pass === 1 ? 25_000 : 32_000,
    });

  const first = await call();
  if (!first.ok) return aiError(first);
  const g1 = checkGrade(firstJson(first.text), scheme);
  const isSonnet = (m: string) => /sonnet/.test(m);
  let kept: { g: CheckedGrade; model: string } | null = g1 ? { g: g1, model: first.model } : null;
  let credits = first.credits;
  let creditsLeft = first.creditsLeft;
  let firstScore: number | null = null;
  let recheckFailed = false;
  const reasons: EscalationReason[] = g1 ? escalationReasons(g1, q.kind) : ["unreadable"];

  // re-grade with Sonnet 5.5 when Haiku was unsure, the answer is drawn, or the mark is on the pass line. Not when the
  // first grade already came from Sonnet (an admin's model choice), nor in amber mode (Sonnet is paused to save budget).
  if (reasons.length && !isSonnet(first.model)) {
    if (first.mode === "amber") recheckFailed = true;
    else {
      const second = await call(MODELS.sonnet, 2);
      if (second.ok) {
        credits += second.credits;
        creditsLeft = second.creditsLeft;
        const g2 = checkGrade(firstJson(second.text), scheme);
        if (g2) {
          firstScore = g1 ? g1.score : null;
          kept = { g: g2, model: second.model };
        } else recheckFailed = true;
      } else {
        recheckFailed = true;
        if (second.creditsLeft !== null) creditsLeft = second.creditsLeft;
      }
    }
  }
  if (!kept) return NextResponse.json({ error: "The grader couldn't read this answer. Try again, or write a little larger.", status: "error", creditsLeft }, { status: 502, headers: noStore });

  const grade: QuestionGrade = {
    n: q.n,
    score: kept.g.score,
    max: kept.g.max,
    points: kept.g.points,
    read: kept.g.read,
    missing: kept.g.missing,
    feedback: kept.g.feedback,
    model: isSonnet(kept.model) ? "sonnet" : "haiku",
    firstScore,
    escalated: reasons,
    ...(recheckFailed && reasons.length ? { recheckFailed: true } : {}),
    credits,
    at: Date.now(),
  };
  // the transcript keeps the text, not the image (an answer sheet is the learner's private handwriting)
  if (first.callId) await saveTranscript(first.callId, me.id, "paper-grade", `[answer image ${ok.info.width}x${ok.info.height}, ${ok.info.bytes} bytes]\n${text}`, JSON.stringify(grade).slice(0, 8000));
  return NextResponse.json({ grade, creditsLeft }, { headers: noStore });
}
