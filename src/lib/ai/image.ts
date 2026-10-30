/**
 * Images in a Claude call (the notebook page features): the Messages API image block, and the gate every image
 * passes before it is sent. Pure, no I/O, safe in the browser and in Node scripts (scripts/ai-image-check.ts).
 *
 * The gate (callClaude runs it; the routes run it first too, to answer 400 instead of logging a refusal):
 *   - a feature takes images only if it says so (FeatureDef.maxImages, 0 by default): the page features take 1
 *   - base64 PNG or WebP only, and the bytes must really be one (magic number), not just say so
 *   - at most `maxBytes` decoded (1.5 MB by default) and `maxSide` pixels on the longer side (2000): a page is
 *     rendered at 1000 x 1414, so this leaves room without letting a huge image through (the API would shrink
 *     anything over ~1568 px anyway, but we'd still pay to upload it)
 * Text in the same message still counts against the feature's maxInputChars (callClaude adds text blocks up).
 */

export type ImageMediaType = "image/png" | "image/webp";
export type AiImageBlock = { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } };
export type AiTextBlock = { type: "text"; text: string };
export type AiBlock = AiTextBlock | AiImageBlock;
export type AiContent = string | AiBlock[];

export const IMAGE_TYPES: readonly ImageMediaType[] = ["image/png", "image/webp"];
/** default caps for a feature that takes images */
export const DEFAULT_MAX_IMAGE_BYTES = 1_500_000;
export const DEFAULT_MAX_IMAGE_SIDE = 2000;

export type ImageInfo = { mediaType: ImageMediaType; bytes: number; width: number; height: number };
export type ImageRefusal = { ok: false; reason: "type" | "encoding" | "size" | "dimensions" | "count"; message: string };
export type ImageCheck = { ok: true; info: ImageInfo } | ImageRefusal;

/** The text of a message's content (string, or its text blocks joined). */
export const contentText = (c: AiContent): string =>
  typeof c === "string"
    ? c
    : c
        .filter((b): b is AiTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
export const contentImages = (c: AiContent): AiImageBlock[] => (typeof c === "string" ? [] : c.filter((b): b is AiImageBlock => b.type === "image"));

/** Decoded size of a base64 string, without decoding it. */
export function base64Bytes(data: string): number {
  const n = data.length;
  if (!n) return 0;
  const pad = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((n * 3) / 4) - pad;
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** The first `n` bytes of a base64 string. */
function head(data: string, n: number): Uint8Array {
  const take = Math.ceil(n / 3) * 4;
  const bin = atob(data.slice(0, take));
  const out = new Uint8Array(Math.min(n, bin.length));
  for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Width and height from a PNG (IHDR) or WebP (VP8 / VP8L / VP8X) header, or null if it isn't one. */
export function sniffImage(bytes: Uint8Array): { mediaType: ImageMediaType; width: number; height: number } | null {
  const b = bytes;
  // PNG: 89 50 4E 47 0D 0A 1A 0A, then the IHDR chunk: width and height as 32-bit big-endian at 16 and 20
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    return { mediaType: "image/png", width: u32(16), height: u32(20) };
  }
  // WebP: "RIFF" <size> "WEBP" then a chunk
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length >= 30 && tag(0) === "RIFF" && tag(8) === "WEBP") {
    const chunk = tag(12);
    if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { mediaType: "image/webp", width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (chunk === "VP8L" && b[20] === 0x2f) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { mediaType: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { mediaType: "image/webp", width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1 };
  }
  return null;
}

/** Is this image block one we send? (type, encoding, real format, size, dimensions) */
export function checkImage(block: AiImageBlock, caps: { maxBytes?: number; maxSide?: number } = {}): ImageCheck {
  const maxBytes = caps.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const maxSide = caps.maxSide ?? DEFAULT_MAX_IMAGE_SIDE;
  const src = block?.source;
  if (!src || src.type !== "base64" || !IMAGE_TYPES.includes(src.media_type)) return { ok: false, reason: "type", message: "Only PNG or WebP page images can be sent" };
  const data = typeof src.data === "string" ? src.data : "";
  const bytes = base64Bytes(data);
  // size first: no need to scan an oversized string
  if (bytes > maxBytes) return { ok: false, reason: "size", message: `That page image is too large (${(bytes / 1e6).toFixed(1)} MB, the limit is ${(maxBytes / 1e6).toFixed(1)} MB)` };
  if (data.length < 40 || data.length % 4 !== 0 || !B64.test(data)) return { ok: false, reason: "encoding", message: "That page image couldn't be read" };
  let sniff: ReturnType<typeof sniffImage>;
  try {
    sniff = sniffImage(head(data, 32));
  } catch {
    sniff = null;
  }
  if (!sniff || sniff.mediaType !== src.media_type) return { ok: false, reason: "type", message: "That page image couldn't be read" };
  if (!sniff.width || !sniff.height || Math.max(sniff.width, sniff.height) > maxSide)
    return { ok: false, reason: "dimensions", message: `That page image is too big (${sniff.width} x ${sniff.height}, at most ${maxSide} px a side)` };
  return { ok: true, info: { mediaType: sniff.mediaType, bytes, width: sniff.width, height: sniff.height } };
}

/**
 * The whole image gate for one call: how many images, and each one's check. `maxImages` 0 means the feature takes
 * no images (every existing feature), so an image sent to one is refused.
 */
export function gateImages(contents: AiContent[], caps: { maxImages?: number; maxBytes?: number; maxSide?: number }): { ok: true; images: ImageInfo[] } | ImageRefusal {
  const images = contents.flatMap(contentImages);
  const max = caps.maxImages ?? 0;
  if (images.length > max) return { ok: false, reason: "count", message: max ? `Send at most ${max} image${max === 1 ? "" : "s"} at a time` : "This feature doesn't take images" };
  const infos: ImageInfo[] = [];
  for (const img of images) {
    const c = checkImage(img, caps);
    if (!c.ok) return c;
    infos.push(c.info);
  }
  return { ok: true, images: infos };
}
