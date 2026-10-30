import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, ownKey, saveTranscript, type AiResult } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { FEATURES } from "@/lib/ai/features";
import { checkImage, IMAGE_TYPES, type AiImageBlock, type ImageMediaType } from "@/lib/ai/image";
import { snipExplainInput, snipExplainSystem } from "@/lib/ai/prompts";
import { SNIP_KINDS, snipGrounding, type LectureMoment, type SnipKind } from "../_lib/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** the page text inside the box: what the model reads words and numbers from */
const TEXT_MAX = 4000;
const SLUG = /^[A-Za-z0-9-]{1,160}$/;
const KEY = /^[A-Za-z0-9-]{1,160}(\/[A-Za-z0-9-]{1,160})?$/;

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
 *   { image: { mediaType, data }, kind, key?, title?, heading?, href?, text?, lecture?: { id, scene, step, at } }
 *   → { text, credits, creditsLeft }
 * "Explain this" on a snip (Haiku 5.5, feature snip-explain): the snip's image and the exact page text inside the box
 * (from the learner's browser, sent only when they tap Explain), with the course text around it loaded here from the
 * course's own sources (snip/_lib/context.ts). Nothing is stored but the call log and the 30-day text transcript; the
 * image is never kept.
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

  const g = await snipGrounding({ kind, key, title, heading, text, lecture });
  const input = snipExplainInput({ kind, title: title || g.title, heading, moment: g.moment, text });

  const r = await callClaude({
    feature: "snip-explain",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: snipExplainSystem({ kind, title: g.title || title, context: g.context }),
    // the image first, then the text about it (the Messages API's advice for image prompts)
    messages: [{ role: "user", content: [image, { type: "text", text: input }] }],
    meta: { kind, key: key || null, ...g.meta, text_chars: text.length },
    timeoutMs: 55_000,
  });
  if (!r.ok) return aiError(r);
  // the transcript keeps the text, not the image (the snip may be of the learner's own page state)
  await saveTranscript(r.callId, me.id, "snip-explain", `[snip image ${ok.info.width}x${ok.info.height}, ${ok.info.bytes} bytes]\n${input}`, r.text);
  return NextResponse.json({ text: r.text.trim(), credits: r.credits, creditsLeft: r.creditsLeft });
}
