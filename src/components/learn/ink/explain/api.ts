"use client";

/**
 * "Explain this" on a snip, the browser side: the image the AI gets (the snip, ≤ 1568 px a side and under the 1.5 MB
 * cap), the call to /api/learn/ai/snip/explain, saving the snip with its explanation to the notebook, and the
 * follow-up question in the course chat.
 */
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { DEFAULT_MAX_IMAGE_BYTES, type ImageMediaType } from "@/lib/ai/image";
import { INK_EVENTS, LIMITS } from "@/lib/learn/ink/types";
import { estimateLines, TEXT } from "@/lib/learn/ink/geometry";
import { appendItem } from "../capture/api";
import { saveSnip, type SavedSnip, type SnipShot } from "../capture/snip";

/** the API scales anything longer down to about this anyway: sending more only costs upload time */
const SIDE = 1568;
const CAP = DEFAULT_MAX_IMAGE_BYTES - 60_000;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

const encode = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", q));

/** The snip as the AI gets it: as stored when it is small enough, else redrawn smaller (WebP; PNG in Safari). */
export async function aiImage(img: { blob: Blob; pw: number; ph: number }): Promise<{ mediaType: ImageMediaType; data: string; bytes: number }> {
  const type = img.blob.type as ImageMediaType;
  if ((type === "image/webp" || type === "image/png") && img.blob.size <= CAP && Math.max(img.pw, img.ph) <= SIDE) return { mediaType: type, data: await toBase64(img.blob), bytes: img.blob.size };
  const bmp = await createImageBitmap(img.blob);
  try {
    let k = Math.min(1, SIDE / Math.max(bmp.width, bmp.height));
    for (let round = 0; round < 6; round++) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
      for (const q of [0.85, 0.7]) {
        const b = await encode(c, q);
        if (b && (b.type === "image/webp" || b.type === "image/png") && b.size <= CAP) return { mediaType: b.type as ImageMediaType, data: await toBase64(b), bytes: b.size };
        if (b && b.type !== "image/webp") break; // PNG: quality doesn't apply, only a smaller size helps
      }
      k *= 0.75;
    }
  } finally {
    bmp.close();
  }
  throw new ExplainError("too_long", "That snip is too big to explain. Snip a smaller area.");
}

export type ExplainFailure = "over_quota" | "disabled" | "too_long" | "rate_limited" | "blocked" | "off_topic" | "auth" | "error" | "network";

export class ExplainError extends Error {
  constructor(
    public code: ExplainFailure,
    message: string,
    public creditsLeft: number | null = null,
  ) {
    super(message);
  }
}

export type Explained = { text: string; credits: number; creditsLeft: number | null; ms: number };

/** Ask the AI. Throws ExplainError (with the reason the learner should see). */
export async function explainSnip(shot: SnipShot, signal?: AbortSignal): Promise<Explained> {
  const t0 = performance.now();
  const image = await aiImage(shot.img);
  const { place } = shot;
  let res: Response;
  try {
    res = await aiFetch("/api/learn/ai/snip/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        image: { mediaType: image.mediaType, data: image.data },
        kind: place.kind,
        key: place.key,
        title: place.title || shot.title,
        heading: place.heading,
        href: shot.href,
        text: shot.text,
        lecture: place.lecture ? { id: place.lecture.id, scene: place.lecture.scene, step: place.lecture.step, at: place.lecture.at } : null,
      }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ExplainError("network", "Couldn't reach the AI. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as { text?: string; credits?: number; creditsLeft?: number | null; error?: string; status?: string } | null;
  if (res.status === 401) throw new ExplainError("auth", "Sign in to use Explain.");
  if (!res.ok || !body?.text) {
    const code = (body?.status as ExplainFailure) || (res.status === 413 ? "too_long" : res.status === 429 ? "over_quota" : "error");
    throw new ExplainError(code, body?.error || "The AI didn't answer. Try again in a moment.", body?.creditsLeft ?? null);
  }
  return { text: body.text, credits: body.credits ?? 1, creditsLeft: body.creditsLeft ?? null, ms: Math.round(performance.now() - t0) };
}

/* ------------------------------------------------------------------ the explanation as notebook text boxes */

/** Markdown → the plain text a text box shows (bold labels stay as their own lines, bullets stay "- "). */
export function plainText(md: string): string {
  return md
    .replace(/\r\n?/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** the width a saved explanation's text boxes ask for (a page is 1000 wide; the paper may make it narrower) */
const BOX_W = 760;
/**
 * At most this many lines a box (estimated at BOX_W): a box must fit on a fresh page even on the narrowest paper
 * (appendItem can't place one taller than a page), and shorter boxes fill the space under a snip better.
 */
const BOX_LINES = 16;

const fitsBox = (t: string, max: number) => t.length <= max && estimateLines(t, BOX_W - TEXT.pad * 2, TEXT.font) <= BOX_LINES;

/** Text boxes that each fit on a page: split between paragraphs, else lines, else words. */
export function splitText(text: string, max = LIMITS.textChars): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  const add = (piece: string, sep: string, finer: (p: string) => void) => {
    const next = cur ? `${cur}${sep}${piece}` : piece;
    if (fitsBox(next, max)) {
      cur = next;
      return;
    }
    flush();
    if (fitsBox(piece, max)) cur = piece;
    else finer(piece);
  };
  const byWords = (p: string) => p.split(/\s+/).forEach((w) => add(w, " ", (x) => out.push(x.slice(0, max))));
  const byLines = (p: string) => p.split("\n").forEach((l) => add(l, "\n", byWords));
  text.split(/\n{2,}/).forEach((p) => add(p, "\n\n", byLines));
  flush();
  return out;
}

/** Append items to a page, following it onto the next page when it fills up (appendItem makes one). */
async function appendText(pageId: string, text: string): Promise<string> {
  let landed = pageId;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const onItem = (e: Event) => {
    const d = (e as CustomEvent<{ pageId: string; item: { id: string } }>).detail;
    if (d?.item?.id === id) landed = d.pageId;
  };
  window.addEventListener(INK_EVENTS.item, onItem);
  try {
    await appendItem(pageId, { id, kind: "text", text, w: BOX_W });
  } finally {
    window.removeEventListener(INK_EVENTS.item, onItem);
  }
  return landed;
}

/**
 * The snip (unless it is already on a page) and its explanation on the notebook's inbox (or open) page: the snip, then
 * the explanation as text boxes under it ("Explain this · <page>" first, the link back at the end).
 */
export async function saveExplained(shot: SnipShot, md: string, already: SavedSnip | null): Promise<SavedSnip> {
  const saved = already ?? (await saveSnip(shot));
  const head = `Explain this · ${shot.place.title || shot.title}${shot.place.heading ? ` › ${shot.place.heading}` : ""}`;
  const boxes = splitText(`${head}\n\n${plainText(md)}`);
  let page = saved.pageId;
  for (const t of boxes) page = await appendText(page, t);
  return saved;
}

/* ------------------------------------------------------------------ follow-up in the course chat */

/** The explanation's gist: its opening sentences, ≤ `max` characters. */
export function gist(md: string, max = 260): string {
  const first = plainText(md).split(/\n\n/)[0] || "";
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/**
 * Open the course chat with a follow-up about this snip: the composer is prefilled (the learner adds their question),
 * and the explanation goes with it as the selection the chat answers about (tutor:open, the chat's shared contract).
 */
export function askFollowUp(shot: SnipShot, md: string) {
  const where = shot.place.title || shot.title;
  const prompt = `About my snip from "${where}"${shot.place.heading ? ` (${shot.place.heading})` : ""}: ${gist(md)} My question: `;
  const path = (() => {
    try {
      const u = new URL(shot.href);
      return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return window.location.pathname;
    }
  })();
  const context = `What the snip shows${shot.text ? ` (its text: ${shot.text.slice(0, 400)})` : ""}, as explained:\n${plainText(md)}`.slice(0, 1500);
  window.dispatchEvent(new CustomEvent("tutor:open", { detail: { prompt, send: false, context: { kind: "selection", text: context, href: path, heading: shot.place.heading || undefined } } }));
}
