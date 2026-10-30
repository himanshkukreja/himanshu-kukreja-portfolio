"use client";

/**
 * The AI on one notebook page, shared by every control that uses it: the toolbar's "Turn into text" button and its
 * Ink / Text toggle, the idle "Turn into text?" chip, the Text view (update, edit) and the AI menu (check, cards).
 * One instance per open page (PageEditor), so a conversion started from the chip shows as busy on the button too.
 * All calls are Haiku 5.5 on the learner's shared daily AI credits; nothing leaves the page until one is pressed.
 *
 * The typed version is stored on the page (convertedMd) through onPatch, which the editor's autosave writes with the
 * rest of the page; only the typed fields are patched, so a slow answer can never undo strokes drawn meanwhile. It
 * carries the ink signature of the page it was read from (lib/ai/notes.ts withInkStamp), so the page can tell when
 * the handwriting changed after it was typed up (`stale`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NotebookPage } from "@/lib/learn/ink/types";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { setAiCredits, useAiStatus, type AiStatus } from "@/components/learn/ai/useAiStatus";
import { track } from "@/lib/track";
import { inkSignature, NOTES_CREDITS, pageItems, readTyped, withInkStamp, type NoteCard } from "@/lib/ai/notes";
import { pageImage } from "./pageImage";
import type { CheckData } from "./CheckPanel";

export type PageAiAction = "convert" | "check" | "cards";
export type PageAiResult = { kind: "check"; data: CheckData } | { kind: "cards"; cards: NoteCard[] } | null;

class AiError extends Error {}

/** event-time clock (outside the hook, so the React compiler doesn't read it as a render-time call) */
const clock = () => Date.now();

export const OUT_OF_CREDITS = "You've used today's AI credits. They refill at midnight UTC, or add your own key under You → AI.";

async function post<T>(url: string, body: unknown): Promise<T> {
  let r: Response;
  try {
    r = await aiFetch(url, { method: "POST", body: JSON.stringify(body) });
  } catch {
    throw new AiError("You seem to be offline. Your page is safe; try again when you're back.");
  }
  const b = (await r.json().catch(() => ({}))) as T & { error?: string; creditsLeft?: number | null };
  setAiCredits(b.creditsLeft);
  if (!r.ok) throw new AiError(b.error || "Something went wrong. Try again in a moment.");
  return b;
}

/** Seconds since `since`, ticking while it is set. */
function useElapsed(since: number | null) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!since) return;
    const t = () => setNow(Date.now());
    const first = window.setTimeout(t, 0);
    const id = window.setInterval(t, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

/** Why the AI can't be used on this page right now, in one line (null: it can). */
export function aiBlocked(status: AiStatus | null): string | null {
  if (!status) return "Checking AI…";
  if (!status.signedIn) return "Sign in to use AI on your pages.";
  if (!status.features["notes-convert"]) return status.mode === "red" ? "AI is resting for today: the day's share of the budget is used. It's back after midnight UTC." : "AI is switched off right now.";
  if (!status.ownKey && status.creditsLeft !== null && status.creditsLeft <= 0) return OUT_OF_CREDITS;
  return null;
}

export function usePageAi(page: NotebookPage | null, onPatch: (patch: Partial<NotebookPage>) => void) {
  const status = useAiStatus();
  const [busy, setBusy] = useState<PageAiAction | null>(null);
  const [step, setStep] = useState("");
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState<{ action: PageAiAction; text: string; at: number } | null>(null);
  const [result, setResult] = useState<PageAiResult>(null);
  const secs = useElapsed(since);
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const strokes = page?.strokes;
  const items = page?.items;
  const sig = useMemo(() => (strokes && items ? inkSignature({ strokes, items }) : ""), [strokes, items]);
  const typedInfo = useMemo(() => readTyped(page?.convertedMd), [page?.convertedMd]);
  const typed = typedInfo.md;
  // older typed versions carry no signature: they can't be called out of date
  const stale = !!typed && !!typedInfo.sig && typedInfo.sig !== sig;
  const hasContent = !!page && (page.strokes.length > 0 || page.items.length > 0);
  const blocked = aiBlocked(status);

  /** Reads the page and saves the typed version on it; returns the Markdown. */
  const convert = async (): Promise<string> => {
    const p = pageRef.current;
    if (!p) throw new AiError("This page isn't open yet.");
    setStep("Rendering the page…");
    // the signature of exactly what goes to the AI (strokes drawn while it reads make the text out of date)
    const sent = inkSignature(p);
    let img: Awaited<ReturnType<typeof pageImage>>;
    try {
      img = await pageImage(p);
    } catch (e) {
      throw new AiError(e instanceof Error && /heavy/.test(e.message) ? e.message : "Couldn't render this page. Try again.");
    }
    setStep("Reading your handwriting…");
    const b = await post<{ md: string; empty: boolean }>("/api/learn/ai/notes/convert", {
      pageId: p.id,
      title: p.title,
      lessonKey: p.lessonKey,
      image: { mediaType: img.mediaType, data: img.data },
      items: pageItems(p),
    });
    if (b.empty || !b.md) throw new AiError("The AI found nothing to type up on this page yet.");
    onPatch({ convertedMd: withInkStamp(b.md, sent), convertedAt: new Date().toISOString() });
    return readTyped(b.md).md;
  };

  /** Runs one action; true when it worked (errors land in `error`). */
  const run = async (action: PageAiAction): Promise<boolean> => {
    const p = pageRef.current;
    if (busy || !p) return false;
    setBusy(action);
    setSince(clock());
    setError(null);
    track("ai_ask", { feature: `notes-${action}`, lesson: p.lessonKey ?? "" });
    let ok = true;
    try {
      if (action === "convert") await convert();
      else {
        let notes = readTyped(pageRef.current?.convertedMd).md;
        if (!notes) notes = await convert();
        if (action === "check") {
          setStep("Checking against the lesson…");
          const b = await post<CheckData>("/api/learn/ai/notes/check", { pageId: p.id, lessonKey: p.lessonKey, notes });
          setResult({ kind: "check", data: b });
        } else {
          setStep("Making review cards…");
          const b = await post<{ cards: NoteCard[] }>("/api/learn/ai/notes/cards", { pageId: p.id, lessonKey: p.lessonKey, notes });
          setResult({ kind: "cards", cards: b.cards || [] });
        }
      }
    } catch (e) {
      ok = false;
      setError({ action, text: e instanceof AiError ? e.message : "Something went wrong. Try again in a moment.", at: clock() });
    }
    setBusy(null);
    setSince(null);
    setStep("");
    return ok;
  };

  /** The learner's own edit of the typed version (it keeps the page's signature: editing text doesn't change ink). */
  const saveEdit = useCallback(
    (md: string) => {
      const cur = readTyped(pageRef.current?.convertedMd);
      const text = md.trim();
      onPatch({ convertedMd: text ? withInkStamp(text, cur.sig, true) : null, convertedAt: text ? pageRef.current?.convertedAt || new Date().toISOString() : null });
    },
    [onPatch],
  );

  const cost = (a: PageAiAction) => {
    if (status?.ownKey) return "uses your own key";
    const n = NOTES_CREDITS[a] + (a !== "convert" && !typed ? NOTES_CREDITS.convert : 0);
    return `about ${n} credit${n === 1 ? "" : "s"}`;
  };

  return {
    status,
    /** why the AI can't run now (null: it can) */
    blocked,
    busy,
    step,
    secs,
    error,
    clearError: () => setError(null),
    result,
    showResult: setResult,
    run,
    saveEdit,
    cost,
    hasContent,
    /** the typed version, without its stamp */
    typed,
    /** the learner edited the typed version by hand */
    edited: typedInfo.edited,
    /** the handwriting changed since it was typed up */
    stale,
    sig,
  };
}

export type PageAi = ReturnType<typeof usePageAi>;
