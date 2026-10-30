"use client";

/**
 * "Explain this" for a snip: the AI's explanation in a panel beside the snip (a popover on an iPad or a laptop, a
 * sheet on a phone), with Save to notebook (the snip and the explanation), Ask a follow-up (the course chat, prefilled)
 * and Copy. It asks as soon as it opens (the learner tapped Explain), and shows the thinking line, then the answer.
 *
 * Placement: beside the box when there is room (right, else left), else under or over it, else docked at the bottom
 * of the screen (portrait iPads: the lesson column is most of the width). Under 640 px wide it is always a sheet.
 * It doesn't block the page (no backdrop): the learner can scroll to compare. Esc or × closes it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, MessageSquare, NotebookPen, RotateCcw, Sparkles, X } from "lucide-react";
import { aiHtml } from "@/components/learn/ai/AiText";
import { Dots } from "@/components/learn/chat/ChatLive";
import { setAiCredits } from "@/components/learn/ai/useAiStatus";
import { AI_FREE_LINE } from "@/components/learn/ai/AiFreeNote";
import { openNotebookPanel } from "../capture/api";
import { captureToast, type Box } from "../capture/events";
import { saveSnip, type SavedSnip, type SnipShot } from "../capture/snip";
import { askFollowUp, ExplainError, explainSnip, plainText, saveExplained, type Explained } from "./api";

export const EXPLAIN_PRIVACY =
  "Nothing goes to the AI until you tap Explain. Then the snip's image, the page text inside it and where it was taken go to Anthropic's AI to write the explanation; they aren't used to train models. The request's text is kept 30 days to stop abuse, then deleted; the image is never stored. Saving puts the snip and the explanation on your private notebook page.";

/** "Reading the snip…" → … : the thinking line's steps (the call is one request; these pace the wait honestly) */
const STEPS = ["Reading the snip…", "Looking at the lesson around it…", "Writing the explanation…"];

type State =
  | { kind: "loading"; since: number }
  | { kind: "done"; res: Explained }
  | { kind: "error"; error: ExplainError };

const W_POP = 460;
const GAP = 12;

/** Where the panel goes for this box on this screen. */
function placement(box: Box): { mode: "sheet" } | { mode: "dock"; width: number } | { mode: "pop"; left: number; top?: number; bottom?: number; width: number; maxH: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (W < 640) return { mode: "sheet" };
  const width = Math.min(W_POP, W - 32);
  const minH = Math.min(420, H - 32);
  const top0 = Math.max(16, Math.min(box.y, H - minH - 16));
  // beside the box
  if (W - (box.x + box.w) >= width + GAP + 16) return { mode: "pop", left: box.x + box.w + GAP, top: top0, width, maxH: H - top0 - 16 };
  if (box.x >= width + GAP + 16) return { mode: "pop", left: box.x - GAP - width, top: top0, width, maxH: H - top0 - 16 };
  // under or over it
  const left = Math.max(16, Math.min(box.x + box.w / 2 - width / 2, W - width - 16));
  const below = H - (box.y + box.h) - GAP - 16;
  const above = box.y - GAP - 16;
  // only with room for a real answer (a squeezed panel scrolls line by line): else docked at the bottom
  if (below >= 520) return { mode: "pop", left, top: box.y + box.h + GAP, width, maxH: Math.min(below, 760) };
  if (above >= 520) {
    // anchored by its bottom edge, so a short answer still sits right over the box
    return { mode: "pop", left, bottom: H - (box.y - GAP), width, maxH: Math.min(above, 760) };
  }
  return { mode: "dock", width: Math.min(640, W - 32) };
}

function useStep(on: boolean) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (!on) return;
    const a = window.setTimeout(() => setK(1), 1400);
    const b = window.setTimeout(() => setK(2), 3200);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      setK(0);
    };
  }, [on]);
  return STEPS[k];
}

type Props = {
  shot: SnipShot;
  /** where the snip already is (explained from the "Snipped to …" toast), else null */
  saved: SavedSnip | null;
  onSaved: (s: SavedSnip) => void;
  onClose: () => void;
};

export default function ExplainPanel({ shot, saved, onSaved, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: "loading", since: Date.now() });
  const [attempt, setAttempt] = useState(0);
  const [pos, setPos] = useState<ReturnType<typeof placement> | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<{ pageId: string; pageTitle: string; withText: boolean } | null>(saved ? { ...saved, withText: false } : null);
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState(false);
  const [thumb, setThumb] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const loading = state.kind === "loading";
  const step = useStep(loading);

  // the snip's picture at the top of the panel
  useEffect(() => {
    const u = URL.createObjectURL(shot.img.blob);
    setThumb(u);
    return () => URL.revokeObjectURL(u);
  }, [shot.img.blob]);

  // place it, and again when the screen turns
  useLayoutEffect(() => {
    const place = () => setPos(placement(shot.box));
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [shot.box]);

  // focus in on open, so Esc and Tab start here; the page's focus comes back on close
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("[data-hk-snip-ui]")) return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ask (again on Retry)
  useEffect(() => {
    const ac = new AbortController();
    explainSnip(shot, ac.signal)
      .then((res) => {
        setAiCredits(res.creditsLeft);
        setState({ kind: "done", res });
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        const err = e instanceof ExplainError ? e : new ExplainError("error", "The AI didn't answer. Try again in a moment.");
        if (err.creditsLeft != null) setAiCredits(err.creditsLeft);
        setState({ kind: "error", error: err });
      });
    return () => ac.abort();
  }, [shot, attempt]);

  const answer = state.kind === "done" ? state.res.text : "";

  const save = useCallback(async () => {
    if (!answer || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const s = await saveExplained(shot, answer, savedTo);
      setSavedTo({ ...s, withText: true });
      onSaved(s);
      captureToast({ kind: "snip", pageId: s.pageId, pageTitle: s.pageTitle, note: "with its explanation" });
    } catch (e) {
      console.error("[explain] save", e);
      setSaveError((e as Error)?.message && (e as Error).message.length < 140 ? (e as Error).message : "Couldn't save to your notebook. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }, [answer, saving, shot, savedTo, onSaved]);

  /** open the page it was saved to (the panel's job is done: it would cover the notebook) */
  const openSaved = (pageId: string) => {
    openNotebookPanel({ pageId });
    onClose();
  };

  /** the snip alone (the AI couldn't answer) */
  const saveOnly = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const s = await saveSnip(shot);
      setSavedTo({ ...s, withText: false });
      onSaved(s);
      captureToast({ kind: "snip", pageId: s.pageId, pageTitle: s.pageTitle });
    } catch (e) {
      console.error("[explain] save", e);
      setSaveError("Couldn't save to your notebook. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!answer) return;
    const where = shot.place.title || shot.title;
    const text = `${plainText(answer)}\n\n— ${where}${shot.place.heading ? ` › ${shot.place.heading}` : ""}\n${shot.href}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const retry = () => {
    setState({ kind: "loading", since: Date.now() });
    setAttempt((n) => n + 1);
  };

  const followUp = () => {
    if (!answer) return;
    askFollowUp(shot, answer);
    onClose();
  };

  if (!pos) return null;
  const where = shot.place.title || shot.title;
  const sheet = pos.mode === "sheet";
  const frame: React.CSSProperties =
    pos.mode === "pop"
      ? { left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: Math.max(280, pos.maxH) }
      : pos.mode === "dock"
        ? { left: "50%", bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", width: pos.width, transform: "translateX(-50%)", maxHeight: "min(70dvh, 720px)" }
        : { left: 0, right: 0, bottom: 0, maxHeight: "82dvh" };
  const credits = state.kind === "done" ? `${state.res.credits} credit${state.res.credits === 1 ? "" : "s"}${state.res.creditsLeft != null ? ` · ${state.res.creditsLeft.toLocaleString()} left today` : ""}` : "~1 credit";
  const action = "inline-flex min-h-11 items-center justify-center gap-2 px-3.5 text-[13.5px] font-semibold disabled:opacity-60";

  const ui = (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby="hk-explain-title"
      tabIndex={-1}
      data-hk-explain=""
      data-sd-chrome=""
      data-mode={pos.mode}
      className={`fixed z-[10000] flex flex-col border border-line-strong bg-bg text-fg shadow-[0_18px_60px_rgba(0,0,0,0.45)] outline-none motion-safe:animate-hk-in ${sheet ? "border-x-0 border-b-0 pb-[env(safe-area-inset-bottom,0px)]" : ""}`}
      style={frame}
    >
      {sheet && <span aria-hidden className="mx-auto mt-2 block h-1 w-10 shrink-0 bg-line-strong" />}
      <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id="hk-explain-title" className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[12px] font-semibold uppercase tracking-label text-signal-text">
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Explain this
            </span>
            <span className="whitespace-nowrap font-normal normal-case tracking-normal text-fg-4">· {credits}</span>
          </h2>
          <p className="m-0 mt-1 truncate text-[13px] text-fg-3" title={`${where}${shot.place.heading ? ` › ${shot.place.heading}` : ""}`}>
            {where}
            {shot.place.heading && <span className="text-fg-4"> › {shot.place.heading}</span>}
            {shot.place.lecture && <span className="font-mono text-[12px] text-fg-4"> · {fmt(shot.place.lecture.at)}</span>}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the explanation" className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center text-fg-3 hover:text-fg">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the snip
          <img src={thumb} alt="The snip" className="mb-3 block max-h-[120px] max-w-full border border-line object-contain object-left" style={{ aspectRatio: `${shot.img.pw} / ${shot.img.ph}` }} />
        )}
        {state.kind === "loading" && (
          <div className="flex flex-col gap-2 border-l-2 border-signal py-0.5 pl-3" role="status" aria-live="polite">
            <span className="flex min-w-0 items-center gap-2.5">
              <Dots />
              <span key={step} className="hk-shimmer min-w-0 truncate text-[13.5px] font-medium leading-snug">
                {step}
              </span>
            </span>
          </div>
        )}
        {state.kind === "done" && (
          <div aria-live="polite" className="flex flex-col gap-3 text-[15px] leading-relaxed text-fg-2" dangerouslySetInnerHTML={{ __html: aiHtml(tidy(state.res.text)) }} />
        )}
        {state.kind === "error" && (
          <div role="alert" className="flex flex-col gap-3 border-l-2 border-bad py-0.5 pl-3">
            <p className="m-0 text-[14px] text-fg">{state.error.code === "disabled" ? "The AI is off right now, so Explain isn't available. You can still save the snip." : state.error.message}</p>
            <div className="flex flex-wrap gap-2">
              {["error", "network", "rate_limited"].includes(state.error.code) && (
                <button type="button" onClick={retry} className={`${action} border border-line-strong text-fg hover:border-fg-3`}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Try again
                </button>
              )}
              {/* the snip isn't lost when the AI can't answer */}
              {savedTo ? (
                <button type="button" onClick={() => openSaved(savedTo.pageId)} className={`${action} border border-line-strong text-fg hover:border-fg-3`}>
                  <Check className="h-4 w-4 text-ok" aria-hidden />
                  <span className="max-w-[220px] truncate">Snip saved · open {savedTo.pageTitle}</span>
                </button>
              ) : (
                <button type="button" onClick={() => void saveOnly()} disabled={saving} className={`${action} border border-line-strong text-fg hover:border-fg-3`}>
                  <NotebookPen className="h-4 w-4" aria-hidden />
                  {saving ? "Saving…" : "Save the snip"}
                </button>
              )}
            </div>
            {saveError && <p className="m-0 text-[13px] text-bad-text">{saveError}</p>}
          </div>
        )}
      </div>

      {state.kind === "done" && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {savedTo?.withText ? (
              <button type="button" onClick={() => openSaved(savedTo.pageId)} className={`${action} border border-signal text-signal-text hover:bg-signal hover:text-on-signal`}>
                <Check className="h-4 w-4" aria-hidden />
                <span className="max-w-[220px] truncate">Saved · open {savedTo.pageTitle}</span>
              </button>
            ) : (
              <button type="button" onClick={() => void save()} disabled={saving} aria-busy={saving || undefined} className={`${action} bg-signal text-on-signal hover:brightness-110`}>
                <NotebookPen className="h-4 w-4" aria-hidden />
                {saving ? "Saving…" : savedTo ? "Add to the snip's page" : "Save to notebook"}
              </button>
            )}
            <button type="button" onClick={followUp} className={`${action} border border-line-strong text-fg hover:border-fg-3`}>
              <MessageSquare className="h-4 w-4" aria-hidden />
              Ask a follow-up
            </button>
            <button type="button" onClick={() => void copy()} className={`${action} border border-line-strong text-fg hover:border-fg-3`} aria-label={copied ? "Copied" : "Copy the explanation"}>
              {copied ? <Check className="h-4 w-4 text-ok" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {saveError && (
            <p role="alert" className="m-0 text-[13px] text-bad-text">
              {saveError}
            </p>
          )}
        </div>
      )}

      <details className="group shrink-0 border-t border-line px-4 text-[11.5px] leading-snug text-fg-4">
        <summary className="cursor-pointer list-none py-2 font-mono text-[11px] leading-relaxed hover:text-fg-3 [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:py-3">
          sent to the AI only when you tap Explain · not used to train AI · <span className="underline decoration-line-strong underline-offset-2 group-open:text-fg-3">privacy</span>
        </summary>
        <p className="m-0 mb-2">
          {EXPLAIN_PRIVACY} {AI_FREE_LINE}
        </p>
      </details>
    </div>
  );
  return createPortal(ui, document.body);
}

/**
 * The renderer (AiText) makes a list only of a paragraph that is all bullets: a bold label line straight above its
 * bullets ("**Steps**\n- …") gets its own paragraph, and so does a bullet run after a plain line.
 */
const tidy = (md: string) => md.replace(/\r\n?/g, "\n").replace(/^(?!\s*(?:[-*•]|\d+[.)])\s)(.+)\n(?=\s*(?:[-*•]|\d+[.)])\s)/gm, "$1\n\n");

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
