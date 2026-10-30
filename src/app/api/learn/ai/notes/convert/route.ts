import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { FEATURES } from "@/lib/ai/features";
import { checkImage, IMAGE_TYPES, type AiImageBlock, type ImageMediaType } from "@/lib/ai/image";
import { cleanNotesMd, pageItemsText, type ItemText } from "@/lib/ai/notes";
import { notesConvertInput, notesConvertSystem } from "@/lib/ai/prompts";
import { aiError, lessonKeyOf, pageIdOf } from "../_lib/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/learn/ai/notes/convert { pageId, title?, lessonKey?, image: { mediaType, data }, items?: [{ kind, text, source? }] }
 * → { md, empty, credits, creditsLeft }: the page's handwriting as Markdown (Haiku 5.5). The image is the page rendered
 * at 1000 x 1414 (renderPagePng, light theme), sent by the browser only when the learner presses "Convert to text";
 * the clips' and text boxes' typed text comes with it. Nothing is stored here: the browser saves the result on the page.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { pageId?: unknown; title?: unknown; lessonKey?: unknown; image?: { mediaType?: unknown; data?: unknown }; items?: unknown };
  const pageId = pageIdOf(b.pageId);
  if (!pageId) return NextResponse.json({ error: "Unknown page" }, { status: 400 });
  const mediaType = String(b.image?.mediaType || "") as ImageMediaType;
  const data = typeof b.image?.data === "string" ? b.image.data.replace(/^data:image\/\w+;base64,/, "") : "";
  if (!IMAGE_TYPES.includes(mediaType) || !data) return NextResponse.json({ error: "The page image is missing" }, { status: 400 });
  const image: AiImageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data } };
  const def = FEATURES["notes-convert"];
  const ok = checkImage(image, { maxBytes: def.maxImageBytes, maxSide: def.maxImageSide });
  if (!ok.ok) return NextResponse.json({ error: ok.message }, { status: ok.reason === "size" || ok.reason === "dimensions" ? 413 : 400 });

  const items: ItemText[] = (Array.isArray(b.items) ? b.items : [])
    .slice(0, 30)
    .map((x: { kind?: unknown; text?: unknown; source?: unknown }) => ({ kind: x?.kind === "clip" ? ("clip" as const) : ("text" as const), text: typeof x?.text === "string" ? x.text : "", source: typeof x?.source === "string" ? x.source : undefined }))
    .filter((x) => x.text.trim());
  const title = typeof b.title === "string" ? b.title.replace(/[<>]/g, "").trim().slice(0, 120) : "";
  const text = notesConvertInput({ title, itemsText: pageItemsText(items) });
  const lesson = lessonKeyOf(b.lessonKey);

  const r = await callClaude({
    feature: "notes-convert",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: notesConvertSystem(),
    // the image first, then the text about it (the Messages API's advice for image prompts)
    messages: [{ role: "user", content: [image, { type: "text", text }] }],
    meta: { page: pageId, lesson: lesson?.key ?? null, items: items.length },
    timeoutMs: 55_000,
  });
  if (!r.ok) return aiError(r);
  const md = cleanNotesMd(r.text);
  // the transcript keeps the text, not the image (a page image is the learner's private handwriting)
  await saveTranscript(r.callId, me.id, "notes-convert", `[page image ${ok.info.width}x${ok.info.height}, ${ok.info.bytes} bytes]\n${text}`, md || "(empty page)");
  return NextResponse.json({ md, empty: !md, credits: r.credits, creditsLeft: r.creditsLeft });
}
