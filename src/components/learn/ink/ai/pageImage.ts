"use client";

/**
 * The page image the convert call sends: the page rendered at scale 1 (1000 x 1414) in the light theme (dark ink on
 * light paper reads best), as base64. A PNG over the cap (a page dense with ink and snips) is re-encoded as WebP,
 * smaller each try; the server checks the same caps again (lib/ai/image.ts).
 */
import { renderPagePng } from "@/lib/learn/ink/client";
import type { NotebookPage } from "@/lib/learn/ink/types";
import { DEFAULT_MAX_IMAGE_BYTES, type ImageMediaType } from "@/lib/ai/image";

/** a little under the server's 1.5 MB cap */
const CAP = DEFAULT_MAX_IMAGE_BYTES - 50_000;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

async function asWebp(png: Blob, quality: number): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(png);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return await new Promise<Blob | null>((res) => c.toBlob((b) => res(b && b.type === "image/webp" ? b : null), "image/webp", quality));
  } catch {
    return null;
  }
}

export async function pageImage(page: NotebookPage): Promise<{ mediaType: ImageMediaType; data: string; bytes: number }> {
  const png = await renderPagePng(page, { scale: 1, theme: "light" });
  if (png.size <= CAP) return { mediaType: "image/png", data: await toBase64(png), bytes: png.size };
  for (const q of [0.9, 0.75, 0.6]) {
    const w = await asWebp(png, q);
    if (w && w.size <= CAP) return { mediaType: "image/webp", data: await toBase64(w), bytes: w.size };
  }
  throw new Error("This page is too heavy to send. Try splitting it across two pages.");
}
