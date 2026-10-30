"use client";

/**
 * The AI actions on a notebook page, owned by the AI part; the page toolbar mounts it. A toolbar button ("AI") opens a
 * side panel (a bottom sheet on a phone) with three actions, all Haiku 5.5 on the learner's shared daily AI credits:
 *   Convert to text       the page image + its typed clips → Markdown, saved on the page (page.convertedMd)
 *   Check against lesson  the typed notes vs the page's lesson (only when the page has a lessonKey); converts first
 *   Make review cards     3-8 question/answer cards from the typed notes, kept ones go to the review queue
 * The typed version is stored through onPageChange: the editor's autosave (usePageAutosave → savePage) writes it with
 * the rest of the page, so a slow AI answer can never overwrite strokes drawn while it was working.
 * Nothing leaves the page until a button is pressed (the small print says so). The panel is non-modal: the learner can
 * keep looking at the page; Esc or the close button returns focus to the toolbar button. Pointer events inside the
 * panel never reach the ink canvas.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Layers, ListChecks, Sparkles, X } from "lucide-react";
import type { NotebookPage } from "@/lib/learn/ink/types";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { setAiCredits, useAiStatus } from "@/components/learn/ai/useAiStatus";
import { Dots } from "@/components/learn/chat/ChatLive";
import { track } from "@/lib/track";
import { NOTES_CREDITS, pageItems, type NoteCard } from "@/lib/ai/notes";
import { pageImage } from "./ai/pageImage";
import TypedPanel from "./ai/TypedPanel";
import CheckPanel, { type CheckData } from "./ai/CheckPanel";
import CardsPanel from "./ai/CardsPanel";
import NotesFinePrint from "./ai/NotesFinePrint";

type Action = "convert" | "check" | "cards";
type View = { kind: "typed" } | { kind: "check"; data: CheckData } | { kind: "cards"; cards: NoteCard[] } | null;

class AiError extends Error {}

/** event-time clock (outside the component, so the React compiler doesn't read it as a render-time call) */
const clock = () => Date.now();

const OUT_OF_CREDITS = "You've used today's AI credits. They refill at midnight UTC, or add your own key under You → AI.";

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

/** Seconds since `since`, ticking while `on`. */
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

export default function PageAiActions(props: { page: NotebookPage; onPageChange: (p: NotebookPage) => void }) {
  const { page, onPageChange } = props;
  const status = useAiStatus();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [step, setStep] = useState("");
  const [since, setSince] = useState<number | null>(null);
  // results belong to the page they were made for: another page starts clean
  const [errorOf, setErrorOf] = useState<{ pageId: string; text: string }>({ pageId: "", text: "" });
  const [viewOf, setViewOf] = useState<{ pageId: string; view: View }>({ pageId: "", view: null });
  const pageRef = useRef(page);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const secs = useElapsed(since);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const error = errorOf.pageId === page.id ? errorOf.text : "";
  const view = viewOf.pageId === page.id ? viewOf.view : null;
  const setError = (text: string) => setErrorOf({ pageId: pageRef.current.id, text });
  const setView = (v: View) => setViewOf({ pageId: pageRef.current.id, view: v });

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const hasContent = page.strokes.length > 0 || page.items.length > 0;
  const typed = page.convertedMd?.trim() || "";
  const on = !!status?.features["notes-convert"];
  const outOfCredits = !!status && !status.ownKey && status.creditsLeft !== null && status.creditsLeft <= 0;

  /** Converts the page and saves the typed version on it; returns the Markdown. */
  const convert = async (): Promise<string> => {
    setStep("Rendering the page…");
    let img: Awaited<ReturnType<typeof pageImage>>;
    try {
      img = await pageImage(pageRef.current);
    } catch (e) {
      throw new AiError(e instanceof Error && /heavy/.test(e.message) ? e.message : "Couldn't render this page. Try again.");
    }
    setStep("Reading your handwriting…");
    const p = pageRef.current;
    const b = await post<{ md: string; empty: boolean }>("/api/learn/ai/notes/convert", {
      pageId: p.id,
      title: p.title,
      lessonKey: p.lessonKey,
      image: { mediaType: img.mediaType, data: img.data },
      items: pageItems(p),
    });
    if (b.empty || !b.md) throw new AiError("The AI found nothing to type up on this page yet.");
    const next: NotebookPage = { ...pageRef.current, convertedMd: b.md, convertedAt: new Date().toISOString() };
    pageRef.current = next;
    onPageChange(next);
    return b.md;
  };

  const run = async (action: Action) => {
    if (busy) return;
    setBusy(action);
    setSince(clock());
    setError("");
    track("ai_ask", { feature: `notes-${action}`, lesson: page.lessonKey ?? "" });
    try {
      if (action === "convert") {
        await convert();
        setView({ kind: "typed" });
      } else {
        let notes = pageRef.current.convertedMd?.trim() || "";
        if (!notes) {
          notes = await convert();
          setView({ kind: "typed" });
        }
        if (action === "check") {
          setStep("Checking against the lesson…");
          const b = await post<CheckData>("/api/learn/ai/notes/check", { pageId: page.id, lessonKey: page.lessonKey, notes });
          setView({ kind: "check", data: b });
        } else {
          setStep("Making review cards…");
          const b = await post<{ cards: NoteCard[] }>("/api/learn/ai/notes/cards", { pageId: page.id, lessonKey: page.lessonKey, notes });
          setView({ kind: "cards", cards: b.cards || [] });
        }
      }
    } catch (e) {
      setError(e instanceof AiError ? e.message : "Something went wrong. Try again in a moment.");
    }
    setBusy(null);
    setSince(null);
    setStep("");
  };

  const saveEdit = async (md: string): Promise<boolean> => {
    const next: NotebookPage = { ...pageRef.current, convertedMd: md || null, convertedAt: md ? pageRef.current.convertedAt || new Date().toISOString() : null };
    pageRef.current = next;
    onPageChange(next);
    return true;
  };

  const cost = (a: Action) => {
    const n = NOTES_CREDITS[a] + (a !== "convert" && !typed ? NOTES_CREDITS.convert : 0);
    return status?.ownKey ? "your key" : `~${n} credit${n === 1 ? "" : "s"}`;
  };

  const actions: { id: Action; label: string; hint: string; icon: typeof FileText; show: boolean }[] = [
    { id: "convert", label: typed ? "Convert again" : "Convert to text", hint: "handwriting → typed notes", icon: FileText, show: true },
    { id: "check", label: "Check against lesson", hint: "what matches, what's off", icon: ListChecks, show: !!page.lessonKey },
    { id: "cards", label: "Make review cards", hint: "3–8 cards for your review", icon: Layers, show: true },
  ];

  const body = () => {
    if (!status) return <p className="m-0 font-mono text-[12px] text-fg-4">Checking AI…</p>;
    if (!status.signedIn) return <p className="m-0 text-[14px] text-fg-2">Sign in to use AI on your pages.</p>;
    if (!on)
      return (
        <p className="m-0 text-[14px] leading-relaxed text-fg-2">
          {status.mode === "red" ? "AI is resting for today: the day's share of the budget is used. It's back after midnight UTC." : "AI is switched off right now."} Your pages work as normal.
        </p>
      );
    const disabled = !!busy || !hasContent || outOfCredits;
    return (
      <>
        <div className="flex flex-col gap-2">
          {actions
            .filter((a) => a.show)
            .map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={disabled}
                onClick={() => void run(a.id)}
                aria-busy={busy === a.id}
                className="group flex min-h-12 w-full items-center gap-3 border border-line-strong bg-bg px-3 text-left hover:border-signal focus-visible:border-signal disabled:opacity-50 disabled:hover:border-line-strong [touch-action:manipulation] [@media(pointer:coarse)]:min-h-14"
              >
                <a.icon className="h-4 w-4 shrink-0 text-signal-text" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14.5px] font-semibold leading-snug text-fg">{a.label}</span>
                  <span className="text-[12px] leading-snug text-fg-3">{a.hint}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-fg-4">{cost(a.id)}</span>
              </button>
            ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!hasContent ? <span className="text-[13px] text-fg-3">Write something on the page first.</span> : <span />}
          {status.ownKey ? (
            <span className="font-mono text-[11px] text-fg-4">answering with your own key</span>
          ) : (
            status.creditsLeft !== null && <span className="font-mono text-[11px] text-fg-4">{status.creditsLeft} credits left today</span>
          )}
        </div>
        {outOfCredits && !error && <p className="m-0 text-[14px] text-fg-2">{OUT_OF_CREDITS}</p>}
      </>
    );
  };

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-modal="false"
      aria-label="AI on this page"
      tabIndex={-1}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="hk-chat-in fixed inset-x-0 bottom-0 z-[80] flex max-h-[85dvh] flex-col border-t border-line-strong bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.25)] outline-none md:inset-x-auto md:bottom-auto md:right-4 md:top-20 md:max-h-[calc(100dvh-6rem)] md:w-[420px] md:border md:shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> ai on this page{status?.preview ? " · admin preview" : ""}
        </span>
        <button type="button" onClick={close} aria-label="Close" className="-mr-2 inline-flex h-10 w-10 items-center justify-center text-fg-3 hover:text-fg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {body()}
        {busy && (
          <div role="status" aria-live="polite" className="flex flex-col gap-1.5 border-l-2 border-signal py-0.5 pl-3">
            <span className="flex items-center gap-2.5">
              <Dots />
              <span className="hk-shimmer text-[13.5px] font-medium leading-snug">{step || "Working…"}</span>
            </span>
            {secs >= 6 && (
              <span className="text-[12.5px] text-fg-3">
                Still working · a full page takes a few seconds… <span className="font-mono text-fg-4">{secs}s</span>
              </span>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="m-0 border-l-2 border-bad py-0.5 pl-3 text-[14px] leading-relaxed text-fg-2">
            {error}
          </p>
        )}
        {view?.kind === "check" && <CheckPanel data={view.data} />}
        {view?.kind === "cards" && <CardsPanel key={view.cards.map((c) => c.q).join("|")} cards={view.cards} pageId={page.id} pageTitle={page.title} lessonKey={page.lessonKey} />}
        {typed && (view?.kind === "typed" || !view) && (
          <TypedPanel key={`${page.id}:${page.convertedAt}`} md={typed} convertedAt={page.convertedAt} pageTitle={page.title} lessonKey={page.lessonKey} busy={!!busy} onEdit={saveEdit} onReconvert={() => void run("convert")} />
        )}
        {typed && view && view.kind !== "typed" && (
          <button type="button" onClick={() => setView({ kind: "typed" })} className="inline-flex min-h-10 items-center self-start font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg [@media(pointer:coarse)]:min-h-11">
            Show the typed version
          </button>
        )}
        <NotesFinePrint />
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="AI on this page"
        className={`inline-flex min-h-10 items-center gap-1.5 border px-2.5 font-mono text-[12px] [touch-action:manipulation] [@media(pointer:coarse)]:min-h-11 ${open ? "border-signal text-fg" : "border-line-strong text-fg-2 hover:border-fg-3 hover:text-fg"}`}
      >
        <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />
        AI
        {busy && <span aria-hidden className="h-1.5 w-1.5 animate-pulse bg-signal" />}
      </button>
      {open && createPortal(panel, document.body)}
    </>
  );
}
