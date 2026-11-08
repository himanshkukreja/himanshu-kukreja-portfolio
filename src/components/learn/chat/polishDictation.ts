"use client";

/**
 * The second pass on dictated text, after the instant clean-up (lib/learn/speech/tidy.ts) is already on screen:
 * grammar, punctuation and misheard course terms. The browser's own on-device proofreader (Chrome's Proofreader
 * API) when it is ready, free and private; otherwise Haiku 5.5 through /api/learn/ai/dictation for signed-in
 * learners. Resolves to the corrected text, or null (no correction: signed out, AI resting, offline, an error).
 */
import { aiFetch } from "@/components/learn/ai/aiFetch";

type ProofreaderLike = { proofread(text: string): Promise<{ correctedInput?: string }> };
type ProofreaderCtor = {
  availability(o: { expectedInputLanguages: string[] }): Promise<string>;
  create(o: { expectedInputLanguages: string[] }): Promise<ProofreaderLike>;
};

let onDevice: Promise<ProofreaderLike | null> | null = null;

/** Chrome's built-in proofreader, only when its model is already on the device (never starts a download) */
function proofreader(): Promise<ProofreaderLike | null> {
  if (onDevice) return onDevice;
  const P = (globalThis as unknown as { Proofreader?: ProofreaderCtor }).Proofreader;
  const opts = { expectedInputLanguages: ["en"] };
  onDevice = P
    ? P.availability(opts)
        .then((a) => (a === "available" ? P.create(opts) : null))
        .catch(() => null)
    : Promise.resolve(null);
  return onDevice;
}

export async function polishDictation(text: string, where: "chat" | "answer"): Promise<string | null> {
  const t = text.trim();
  if (t.split(/\s+/).length < 3) return null;
  try {
    const p = await proofreader();
    if (p) {
      const r = await p.proofread(t);
      return r.correctedInput?.trim() || null;
    }
  } catch {
    /* fall through to the server */
  }
  try {
    const r = await aiFetch("/api/learn/ai/dictation", { method: "POST", body: JSON.stringify({ text: t, where }), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { text?: string | null };
    return j.text?.trim() || null;
  } catch {
    return null;
  }
}
