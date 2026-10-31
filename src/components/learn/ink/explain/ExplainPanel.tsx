"use client";

/**
 * "Explain this" for a snip: the AI's explanation in a panel beside the snip (a popover on an iPad or a laptop, a
 * sheet on a phone), with Save to notebook (the snip and the thread), Ask in the course chat (prefilled) and Copy. It
 * asks as soon as it opens (the learner tapped Explain, Ask or a chip), and shows the thinking line, then the answer.
 *
 * Follow-ups: under an answer, "Ask a follow-up about this snip" asks again about the same snip (the image, its text and
 * the course text around it go again, with the questions and answers so far), up to five answers a snip. The thread
 * shows each question as "You asked: …" over its answer. A question that isn't about the snip or the course gets a
 * one-line decline in the thread.
 *
 * Placement: beside the box when there is room (right, else left), else under or over it, else docked at the bottom
 * of the screen (portrait iPads: the lesson column is most of the width). Under 640 px wide it is always a sheet.
 * While the learner types a follow-up it sits above the on-screen keyboard. It doesn't block the page (no backdrop):
 * the learner can scroll to compare. Esc or × closes it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Check, Copy, MessageSquare, NotebookPen, RotateCcw, Sparkles, X } from "lucide-react";
import { aiHtml } from "@/components/learn/ai/AiText";
import { Dots } from "@/components/learn/chat/ChatLive";
import { setAiCredits } from "@/components/learn/ai/useAiStatus";
import { AI_FREE_LINE } from "@/components/learn/ai/AiFreeNote";
import { openNotebookPanel } from "../capture/api";
import { captureToast, type Box } from "../capture/events";
import { saveSnip, type SavedSnip, type SnipShot } from "../capture/snip";
import { pinScrollWhileTyping, useVisibleArea } from "../capture/viewport";
import { askFollowUp, ExplainError, explainSnip, MAX_TURNS, QUESTION_MAX, saveExplained, threadText, type Turn } from "./api";

export const EXPLAIN_PRIVACY =
  "Nothing goes to the AI until you tap Explain or Ask. Then the snip's image, the page text inside it, where it was taken and your question go to Anthropic's AI to write the answer; they aren't used to train models. The request's text is kept 30 days to stop abuse, then deleted; the image is never stored. Saving puts the snip and the answers on your private notebook page.";

/** "Reading the snip…" → … : the thinking line's steps (the call is one request; these pace the wait honestly) */
const STEPS = ["Reading the snip…", "Looking at the lesson around it…", "Writing the explanation…"];
const STEPS_ASK = ["Reading your question…", "Looking at the snip and the lesson…", "Writing the answer…"];

/** One question and its answer in the thread: `q` null for the plain explain. */
type TurnState = { id: number; q: string | null } & (
  | { kind: "loading" }
  | { kind: "done"; text: string; credits: number }
  | { kind: "declined"; message: string }
  | { kind: "error"; error: ExplainError }
);

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

function useStep(on: boolean, steps: string[]) {
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
  return steps[k];
}

type Props = {
  shot: SnipShot;
  /** where the snip already is (explained from the "Snipped to …" toast), else null */
  saved: SavedSnip | null;
  /** the learner's own question from the snip bar (typed, or a chip); absent: the plain explain */
  question?: string;
  onSaved: (s: SavedSnip) => void;
  onClose: () => void;
};

export default function ExplainPanel({ shot, saved, question, onSaved, onClose }: Props) {
  const [turns, setTurns] = useState<TurnState[]>(() => [{ id: 0, q: question?.trim() || null, kind: "loading" }]);
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null);
  const [pos, setPos] = useState<ReturnType<typeof placement> | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<{ pageId: string; pageTitle: string; withText: boolean } | null>(saved ? { ...saved, withText: false } : null);
  /** how many of the answers are on the notebook page already */
  const [savedN, setSavedN] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState(false);
  const [thumb, setThumb] = useState("");
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [pin] = useState(() => pinScrollWhileTyping(setTyping));
  useEffect(() => () => pin.dispose(), [pin]);
  const visible = useVisibleArea(typing);
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const ac = useRef<AbortController | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const last = turns[turns.length - 1];
  const loading = last.kind === "loading";
  const step = useStep(loading, last.q ? STEPS_ASK : STEPS);
  const answered: Turn[] = turns.flatMap((t) => (t.kind === "done" ? [{ q: t.q, a: t.text }] : []));
  const spent = turns.reduce((a, t) => a + (t.kind === "done" ? t.credits : 0), 0);

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
      // typing a follow-up: Esc clears it first
      if (document.activeElement === composerRef.current && composerRef.current?.value) {
        setDraft("");
        return;
      }
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** ask the AI for turn `id`: its question (null: the plain explain) with the answers before it */
  const run = useCallback(
    (id: number, q: string | null, history: Turn[]) => {
      ac.current?.abort();
      const c = new AbortController();
      ac.current = c;
      const settle = (next: TurnState) => setTurns((ts) => ts.map((t) => (t.id === id ? next : t)));
      explainSnip(shot, c.signal, { question: q, history })
        .then((res) => {
          setAiCredits(res.creditsLeft);
          setCreditsLeft(res.creditsLeft);
          settle({ id, q, kind: "done", text: res.text, credits: res.credits });
        })
        .catch((e) => {
          if ((e as Error).name === "AbortError") return;
          const err = e instanceof ExplainError ? e : new ExplainError("error", "The AI didn't answer. Try again in a moment.");
          if (err.creditsLeft != null) {
            setAiCredits(err.creditsLeft);
            setCreditsLeft(err.creditsLeft);
          }
          settle(err.declined ? { id, q, kind: "declined", message: err.message } : { id, q, kind: "error", error: err });
        });
    },
    [shot],
  );

  // the first answer, as soon as the panel opens
  useEffect(() => {
    run(0, question?.trim() || null, []);
    return () => ac.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once a panel (a new snip gets a new panel)
  }, []);

  /** the answers before turn `id`, oldest first */
  const before = (id: number): Turn[] => turns.filter((t) => t.id < id).flatMap((t) => (t.kind === "done" ? [{ q: t.q, a: t.text }] : []));

  const retry = (t: TurnState) => {
    setTurns((ts) => ts.map((x) => (x.id === t.id ? { id: t.id, q: t.q, kind: "loading" } : x)));
    run(t.id, t.q, before(t.id));
  };

  const canAsk = !loading && turns.length < MAX_TURNS && turns.some((t) => t.kind === "done" || t.kind === "declined");
  const ask = () => {
    const q = draft.replace(/\s+/g, " ").trim().slice(0, QUESTION_MAX);
    if (!q || !canAsk) return;
    const id = nextId.current++;
    const history = before(id);
    setTurns((ts) => [...ts, { id, q, kind: "loading" }]);
    setDraft("");
    // on a touch screen the keyboard closes, so the answer has the room
    if (window.matchMedia?.("(pointer: coarse)").matches) composerRef.current?.blur();
    run(id, q, history);
  };

  // a new question, and again when its answer lands: bring it to the top of the thread, so the answer reads from the start
  const count = turns.length;
  const lastKind = last.kind;
  useEffect(() => {
    if (count < 2) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-turn="${count - 1}"]`);
    const box = scrollRef.current;
    if (!el || !box) return;
    box.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [count, lastKind]);

  const save = useCallback(async () => {
    const n = answered.length;
    if (!n || saving || n <= savedN) return;
    setSaving(true);
    setSaveError("");
    try {
      const s = await saveExplained(shot, answered.slice(savedN), savedTo, savedN > 0);
      setSavedTo({ ...s, withText: true });
      setSavedN(n);
      onSaved(s);
      captureToast({ kind: "snip", pageId: s.pageId, pageTitle: s.pageTitle, note: savedN > 0 ? "the new answers" : n > 1 || answered[0].q ? "with the answers" : "with its explanation" });
    } catch (e) {
      console.error("[explain] save", e);
      setSaveError((e as Error)?.message && (e as Error).message.length < 140 ? (e as Error).message : "Couldn't save to your notebook. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }, [answered, saving, savedN, shot, savedTo, onSaved]);

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
    if (!answered.length) return;
    const where = shot.place.title || shot.title;
    const text = `${threadText(answered)}\n\n— ${where}${shot.place.heading ? ` › ${shot.place.heading}` : ""}\n${shot.href}`;
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

  const toChat = () => {
    if (!answered.length) return;
    askFollowUp(shot, answered);
    onClose();
  };

  if (!pos) return null;
  const where = shot.place.title || shot.title;
  const sheet = pos.mode === "sheet";
  // typing a follow-up with the on-screen keyboard up: the panel sits on top of it, as tall as what's left
  const H = window.innerHeight;
  const kb = visible && H - visible.bottom > 60 ? { inset: H - visible.bottom, room: visible.bottom - visible.top } : null;
  const frame: React.CSSProperties = kb
    ? sheet
      ? { left: 0, right: 0, bottom: kb.inset, maxHeight: Math.max(220, kb.room - 8) }
      : { left: pos.mode === "pop" ? pos.left : "50%", bottom: kb.inset + 8, width: pos.width, transform: pos.mode === "dock" ? "translateX(-50%)" : undefined, maxHeight: Math.max(220, kb.room - 24) }
    : pos.mode === "pop"
      ? { left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: Math.max(280, pos.maxH) }
      : pos.mode === "dock"
        ? { left: "50%", bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", width: pos.width, transform: "translateX(-50%)", maxHeight: "min(70dvh, 720px)" }
        : { left: 0, right: 0, bottom: 0, maxHeight: "82dvh" };
  const credits = spent ? `${spent} credit${spent === 1 ? "" : "s"}${creditsLeft != null ? ` · ${creditsLeft.toLocaleString()} left today` : ""}` : "~1 credit";
  const action = "inline-flex min-h-11 items-center justify-center gap-2 px-3.5 text-[13.5px] font-semibold disabled:opacity-60";
  const quiet = `${action} border border-line-strong text-fg hover:border-fg-3`;
  // the thread's footer: once something came back (an answer or a decline)
  const footer = turns.some((t) => t.kind === "done" || t.kind === "declined");
  const allSaved = !!savedTo?.withText && savedN === answered.length && answered.length > 0;

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

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the snip
          <img src={thumb} alt="The snip" className="mb-3 block max-h-[120px] max-w-full border border-line object-contain object-left" style={{ aspectRatio: `${shot.img.pw} / ${shot.img.ph}` }} />
        )}
        <ol className="m-0 flex list-none flex-col p-0" aria-label={turns.length > 1 ? "Questions and answers about this snip" : undefined}>
          {turns.map((t, i) => (
            <li key={t.id} data-turn={i} className={i ? "mt-4 border-t border-line pt-4" : ""}>
              {t.q && (
                <p className="m-0 mb-2.5 border-l-2 border-line-strong pl-3 text-[14px] leading-snug text-fg-2">
                  <span className="font-semibold text-fg-3">You asked: </span>
                  {t.q}
                </p>
              )}
              {t.kind === "loading" && (
                <div className="flex flex-col gap-2 border-l-2 border-signal py-0.5 pl-3" role="status" aria-live="polite">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Dots />
                    <span key={step} className="hk-shimmer min-w-0 truncate text-[13.5px] font-medium leading-snug">
                      {step}
                    </span>
                  </span>
                </div>
              )}
              {t.kind === "done" && <div aria-live="polite" className="flex flex-col gap-3 text-[15px] leading-relaxed text-fg-2" dangerouslySetInnerHTML={{ __html: aiHtml(tidy(t.text)) }} />}
              {t.kind === "declined" && (
                <p aria-live="polite" className="m-0 text-[14px] leading-snug text-fg-3">
                  {t.message}
                </p>
              )}
              {t.kind === "error" && (
                <div role="alert" className="flex flex-col gap-3 border-l-2 border-bad py-0.5 pl-3">
                  <p className="m-0 text-[14px] text-fg">{t.error.code === "disabled" ? "The AI is off right now, so Explain isn't available. You can still save the snip." : t.error.message}</p>
                  <div className="flex flex-wrap gap-2">
                    {["error", "network", "rate_limited"].includes(t.error.code) && (
                      <button type="button" onClick={() => retry(t)} className={quiet}>
                        <RotateCcw className="h-4 w-4" aria-hidden /> Try again
                      </button>
                    )}
                    {/* the snip isn't lost when the AI can't answer (with answers above, the footer saves them) */}
                    {!footer &&
                      (savedTo ? (
                        <button type="button" onClick={() => openSaved(savedTo.pageId)} className={quiet}>
                          <Check className="h-4 w-4 text-ok" aria-hidden />
                          <span className="max-w-[220px] truncate">Snip saved · open {savedTo.pageTitle}</span>
                        </button>
                      ) : (
                        <button type="button" onClick={() => void saveOnly()} disabled={saving} className={quiet}>
                          <NotebookPen className="h-4 w-4" aria-hidden />
                          {saving ? "Saving…" : "Save the snip"}
                        </button>
                      ))}
                  </div>
                  {!footer && saveError && <p className="m-0 text-[13px] text-bad-text">{saveError}</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      {footer && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3">
          {turns.length < MAX_TURNS ? (
            <form
              className="flex items-stretch gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <label htmlFor="hk-explain-ask" className="sr-only">
                Ask a follow-up about this snip
              </label>
              <input
                ref={composerRef}
                id="hk-explain-ask"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, QUESTION_MAX))}
                onFocus={pin.onFocus}
                onBlur={pin.onBlur}
                maxLength={QUESTION_MAX}
                placeholder="Ask a follow-up about this snip"
                enterKeyHint="send"
                autoComplete="off"
                spellCheck
                className="min-h-11 min-w-0 flex-1 border border-line-strong bg-surface px-3 text-[16px] leading-tight text-fg outline-none placeholder:text-fg-4 focus:border-signal"
              />
              <button type="submit" disabled={!canAsk || !draft.trim()} aria-label="Ask" title="Ask (Enter)" className="grid h-11 w-11 shrink-0 place-items-center bg-signal text-on-signal hover:brightness-110 disabled:opacity-40">
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
            </form>
          ) : (
            <p className="m-0 text-[13px] leading-snug text-fg-3">That&apos;s {MAX_TURNS} answers on this snip. Keep going in the course chat.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {answered.length === 0 ? (
              savedTo ? (
                <button type="button" onClick={() => openSaved(savedTo.pageId)} className={quiet}>
                  <Check className="h-4 w-4 text-ok" aria-hidden />
                  <span className="max-w-[220px] truncate">Snip saved · open {savedTo.pageTitle}</span>
                </button>
              ) : (
                <button type="button" onClick={() => void saveOnly()} disabled={saving} className={quiet}>
                  <NotebookPen className="h-4 w-4" aria-hidden />
                  {saving ? "Saving…" : "Save the snip"}
                </button>
              )
            ) : allSaved && savedTo ? (
              <button type="button" onClick={() => openSaved(savedTo.pageId)} className={`${action} border border-signal text-signal-text hover:bg-signal hover:text-on-signal`}>
                <Check className="h-4 w-4" aria-hidden />
                <span className="max-w-[220px] truncate">Saved · open {savedTo.pageTitle}</span>
              </button>
            ) : (
              <button type="button" onClick={() => void save()} disabled={saving} aria-busy={saving || undefined} className={`${action} bg-signal text-on-signal hover:brightness-110`}>
                <NotebookPen className="h-4 w-4" aria-hidden />
                {saving ? "Saving…" : savedN > 0 ? "Save the new answers" : savedTo ? "Add to the snip's page" : "Save to notebook"}
              </button>
            )}
            {answered.length > 0 && (
              <>
                <button type="button" onClick={toChat} className={quiet}>
                  <MessageSquare className="h-4 w-4" aria-hidden />
                  Ask in the course chat
                </button>
                <button type="button" onClick={() => void copy()} className={quiet} aria-label={copied ? "Copied" : turns.length > 1 ? "Copy the answers" : "Copy the explanation"}>
                  {copied ? <Check className="h-4 w-4 text-ok" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </>
            )}
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
          sent to the AI only when you tap Explain or Ask · not used to train AI · <span className="underline decoration-line-strong underline-offset-2 group-open:text-fg-3">privacy</span>
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
