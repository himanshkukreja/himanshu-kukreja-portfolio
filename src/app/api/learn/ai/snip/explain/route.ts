import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, OFF_TOPIC_MESSAGE, ownKey, saveTranscript, type AiMessage, type AiResult } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { FEATURES } from "@/lib/ai/features";
import { checkImage, IMAGE_TYPES, type AiImageBlock, type ImageMediaType } from "@/lib/ai/image";
import { snipAskInput, snipExplainInput, snipExplainSystem, snipFollowUpInput } from "@/lib/ai/prompts";
import { SNIP_KINDS, snipGrounding, type LectureMoment, type SnipKind } from "../_lib/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** the page text inside the box: what the model reads words and numbers from */
const TEXT_MAX = 4000;
const SLUG = /^[A-Za-z0-9-]{1,160}$/;
const KEY = /^[A-Za-z0-9-]{1,160}(\/[A-Za-z0-9-]{1,160})?$/;
/** the learner's question, and the earlier turns about the same snip (the panel keeps up to five answers a snip) */
const QUESTION_MAX = 500;
const ANSWER_MAX = 1500;
const HISTORY_MAX = 5;

/** A question: one line of plain text (no control characters), ≤ 500 characters. */
const question = (v: unknown) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, QUESTION_MAX)
    : "";

/** An earlier answer, as the panel shows it: trimmed, and no tag can pretend to open or close a prompt block. */
const answer = (v: unknown) => {
  if (typeof v !== "string") return "";
  const t = v
    .replace(/\r\n?/g, "\n")
    .replace(/<\/?\s*(learner_question|snip_text|where|context|system)\b[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.length > ANSWER_MAX ? `${t.slice(0, ANSWER_MAX - 1).trimEnd()}…` : t;
};

/** What the learner sees when the question isn't about the snip or the course (the model answered OFF_TOPIC). */
const SNIP_OFF_TOPIC = "I can only answer questions about this snip and the course. Try asking what part of it means, why it's built this way, or for an example.";

const clean = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[<>]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/** A refused or failed call (502 for the API's failure, 413 for too big, 429 for every limit), as the notebook AI answers. */
function aiError(r: Extract<AiResult, { ok: false }>) {
  return NextResponse.json({ error: r.message, status: r.status, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : r.status === "too_long" ? 413 : 429 });
}

/**
 * POST /api/learn/ai/snip/explain
 *   { image: { mediaType, data }, kind, key?, title?, heading?, href?, text?, lecture?: { id, scene, step, at },
 *     question?, history?: [{ q, a }] }
 *   → { text, credits, creditsLeft }
 * "Explain this" on a snip (Haiku 5.5, feature snip-explain): the snip's image and the exact page text inside the box
 * (from the learner's browser, sent only when they tap Explain), with the course text around it loaded here from the
 * course's own sources (snip/_lib/context.ts). Nothing is stored but the call log and the 30-day text transcript; the
 * image is never kept.
 *
 * Ask and follow-ups: `question` (≤ 500 characters) is the learner's own question about the snip ("why is the cache
 * before the DB?", or a chip: "Explain simply"); without it the snip is explained. `history` is the earlier turns about
 * the same snip (≤ 5, oldest first: `q` the question, null for the plain explain; `a` the answer, trimmed to 1,500
 * characters). The conversation goes to the model as real turns: the image and the snip text in the first user turn
 * only (one image a call), the earlier answers as its turns, then the new question. Every turn is one call (~1 credit).
 * A question that isn't about the snip or the course gets OFF_TOPIC (status off_topic, a one-line decline).
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as {
    image?: { mediaType?: unknown; data?: unknown };
    kind?: unknown;
    key?: unknown;
    title?: unknown;
    heading?: unknown;
    href?: unknown;
    text?: unknown;
    lecture?: { id?: unknown; scene?: unknown; step?: unknown; at?: unknown } | null;
    question?: unknown;
    history?: unknown;
  };

  const mediaType = String(b.image?.mediaType || "") as ImageMediaType;
  const data = typeof b.image?.data === "string" ? b.image.data.replace(/^data:image\/\w+;base64,/, "") : "";
  if (!IMAGE_TYPES.includes(mediaType) || !data) return NextResponse.json({ error: "The snip's image is missing" }, { status: 400 });
  const image: AiImageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data } };
  const def = FEATURES["snip-explain"];
  const ok = checkImage(image, { maxBytes: def.maxImageBytes, maxSide: def.maxImageSide });
  if (!ok.ok) return NextResponse.json({ error: ok.reason === "size" || ok.reason === "dimensions" ? "That snip is too big to explain. Snip a smaller area." : ok.message, status: "too_long" }, { status: ok.reason === "size" || ok.reason === "dimensions" ? 413 : 400 });

  const kind: SnipKind = (SNIP_KINDS as readonly string[]).includes(String(b.kind)) ? (b.kind as SnipKind) : "page";
  const key = typeof b.key === "string" && KEY.test(b.key) ? b.key : "";
  const title = clean(b.title, 160);
  const heading = clean(b.heading, 200);
  const text = typeof b.text === "string" ? b.text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, TEXT_MAX) : "";
  const lec = b.lecture;
  const lecture: LectureMoment | null =
    kind === "lecture" && lec && typeof lec.id === "string" && SLUG.test(lec.id) && typeof lec.scene === "string" && SLUG.test(lec.scene)
      ? { id: lec.id, scene: lec.scene, step: Math.max(0, Math.floor(Number(lec.step) || 0)), at: Math.max(0, Number(lec.at) || 0) }
      : null;

  const q = question(b.question);
  const rawHistory = Array.isArray(b.history) ? (b.history as { q?: unknown; a?: unknown }[]) : [];
  if (rawHistory.length > HISTORY_MAX) return NextResponse.json({ error: "That's a long conversation about one snip. Continue it in the course chat.", status: "too_long" }, { status: 413 });
  const history = rawHistory.map((t) => ({ q: question(t?.q), a: answer(t?.a) })).filter((t) => t.a);
  if (history.length !== rawHistory.length) return NextResponse.json({ error: "The conversation so far is missing" }, { status: 400 });
  if (history.length && !q) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  const g = await snipGrounding({ kind, key, title, heading, text, lecture });
  const where = { kind, title: title || g.title, heading, moment: g.moment, text };
  // the first turn: the image, then where it was taken and its text (the plain explain, or the learner's question)
  const first = history.length ? history[0].q : q;
  const input = first ? snipAskInput({ ...where, question: first }) : snipExplainInput(where);
  const messages: AiMessage[] = [{ role: "user", content: [image, { type: "text", text: input }] }];
  history.forEach((t, i) => {
    messages.push({ role: "assistant", content: t.a });
    messages.push({ role: "user", content: snipFollowUpInput(i + 1 < history.length ? history[i + 1].q || "Explain this snip." : q) });
  });

  const r = await callClaude({
    feature: "snip-explain",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: snipExplainSystem({ kind, title: g.title || title, context: g.context }),
    // the image first, then the text about it (the Messages API's advice for image prompts)
    messages,
    meta: { kind, key: key || null, ...g.meta, text_chars: text.length, turn: history.length + 1, q_chars: q.length },
    timeoutMs: 55_000,
  });
  // the model's decline (not the day's pause after several): a short polite line in the thread, `declined`
  if (!r.ok && r.status === "off_topic" && r.message === OFF_TOPIC_MESSAGE) return NextResponse.json({ error: SNIP_OFF_TOPIC, status: "off_topic", declined: true, creditsLeft: r.creditsLeft }, { status: 429 });
  if (!r.ok) return aiError(r);
  // the transcript keeps the text, not the image (the snip may be of the learner's own page state)
  const thread = messages
    .slice(1)
    .map((m) => `[${m.role}] ${typeof m.content === "string" ? m.content : ""}`)
    .join("\n\n");
  await saveTranscript(r.callId, me.id, "snip-explain", `[snip image ${ok.info.width}x${ok.info.height}, ${ok.info.bytes} bytes]\n${input}${thread ? `\n\n${thread}` : ""}`, r.text);
  return NextResponse.json({ text: r.text.trim(), credits: r.credits, creditsLeft: r.creditsLeft });
}
