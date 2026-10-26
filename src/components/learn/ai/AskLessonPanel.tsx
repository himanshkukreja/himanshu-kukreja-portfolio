"use client";

/**
 * "Ask this lesson": a side panel (a bottom sheet on phones) where a signed-in learner asks about the
 * lesson or the passage they selected. Each question is answered from the lesson's most relevant
 * sections (server: /api/learn/ai/ask). Shows credits left, the free-for-now line and what's sent.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { aiFetch } from "./aiFetch";
import { track } from "@/lib/track";
import AiFreeNote from "./AiFreeNote";
import AiText from "./AiText";
import { setAiCredits, useAiStatus } from "./useAiStatus";
import { useLessonFaq } from "./useLessonFaq";
import { matchFaq, type FaqItem } from "@/lib/learn/faq/parse";

const MODES = [
  { id: "", label: "just answer" },
  { id: "simple", label: "explain simply" },
  { id: "example", label: "give an example" },
  { id: "interview", label: "say it in an interview" },
  { id: "hinglish", label: "in Hinglish" },
] as const;

type Turn = { q: string; selection: string; mode: string; answer?: string; error?: string; pending?: boolean; saved?: boolean };

/** Window event: open the panel for the current lesson with no selection (reading toolbar's "Ask AI"). */
export const ASK_LESSON_EVENT = "hk:ask-lesson";

export const AI_PRIVACY = "What you send goes to Anthropic's AI to answer it. It isn't used to train models, and we keep it for 30 days to stop abuse.";

export default function AskLessonPanel({
  open,
  onClose,
  week,
  slug,
  lessonTitle,
  selection,
  story = false,
}: {
  open: boolean;
  onClose: () => void;
  week: string;
  slug: string;
  lessonTitle: string;
  selection: string;
  /** a case file (/stories/<slug>) rather than a course lesson; `week` is ignored */
  story?: boolean;
}) {
  const status = useAiStatus();
  const faq = useLessonFaq(story ? null : week, slug);
  const noun = story ? "case file" : "lesson";
  const { openAuthModal } = useAuthModal();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(selection);
  const [mode, setMode] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // desktop: the panel docks to the right and the page makes room for it (html.hk-ask-open, globals.css)
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("hk-ask-open");
    return () => document.documentElement.classList.remove("hk-ask-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // braces matter: smooth scrollIntoView returns a Promise in current Chrome, and an effect may only return a cleanup
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns]);

  if (!open) return null;
  const busy = turns.some((t) => t.pending);
  const canAsk = !!(q.trim() || sel) && !busy;

  // a saved answer costs nothing: offer it when the question matches one
  const dup = q.trim() && !sel && !mode && faq ? matchFaq(faq.items, q) : null;
  const showSaved = (it: FaqItem) => {
    setTurns((t) => [...t, { q: it.q, selection: "", mode: "", answer: `${it.a}${it.section ? ` [${it.section}]` : ""}`, saved: true }]);
    setQ("");
    track("ai_faq_saved", { lesson: `${week}/${slug}` });
  };

  const ask = async () => {
    if (!canAsk) return;
    const turn: Turn = { q: q.trim(), selection: sel, mode, pending: true };
    setTurns((t) => [...t, turn]);
    setQ("");
    track("ai_ask", { feature: "lesson-qa", mode: mode || "plain", selection: !!sel, ...(story ? { story: slug } : {}) });
    try {
      const res = await aiFetch("/api/learn/ai/ask", { method: "POST", body: JSON.stringify({ ...(story ? { story: slug } : { week, slug }), question: turn.q, selection: turn.selection, mode: turn.mode || undefined }) });
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string; creditsLeft?: number | null };
      setAiCredits(body.creditsLeft);
      setTurns((t) => t.map((x) => (x === turn ? { ...x, pending: false, ...(res.ok ? { answer: body.text || "" } : { error: body.error || "Something went wrong. Try again." }) } : x)));
    } catch {
      setTurns((t) => t.map((x) => (x === turn ? { ...x, pending: false, error: "You seem to be offline. Try again when you're back." } : x)));
    }
    setSel("");
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-end bg-black/40 lg:pointer-events-none lg:top-[var(--hk-header-h,61px)] lg:items-stretch lg:bg-transparent"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        role="dialog"
        aria-label={`Ask this ${noun}`}
        className="flex max-h-[88dvh] w-full flex-col border-t border-line-strong bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.5)] lg:pointer-events-auto lg:max-h-none lg:w-[var(--hk-ask-w)] lg:border-l lg:border-t-0 lg:shadow-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> ask this {noun}
              {status?.preview && <span className="border border-line-strong px-1.5 text-fg-3">admin preview</span>}
            </span>
            <span className="truncate text-[15px] font-semibold text-fg">{lessonTitle}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center text-fg-3 hover:text-fg">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <AiFreeNote />
          {turns.length === 0 && <p className="m-0 text-[14px] text-fg-3">Ask anything about this {noun}. Answers come from the {noun} itself and point to the section they use.</p>}
          {turns.length === 0 && faq && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">questions learners ask · free</span>
              {faq.items.slice(0, 5).map((it) => (
                <button key={it.q} type="button" onClick={() => showSaved(it)} className="border border-line px-3 py-2 text-left text-[14px] text-fg-2 hover:border-fg-3 hover:text-fg">
                  {it.q}
                </button>
              ))}
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="self-end border border-line-strong bg-surface-2 px-3 py-2 text-[14px] text-fg">
                {t.selection && <span className="mb-1 block border-l-2 border-signal pl-2 text-[13px] text-fg-3">&ldquo;{t.selection.slice(0, 220)}{t.selection.length > 220 ? "…" : ""}&rdquo;</span>}
                {t.q || "Explain this part."}
                {t.mode && <span className="ml-2 font-mono text-[11px] text-fg-4">· {MODES.find((m) => m.id === t.mode)?.label}</span>}
              </div>
              {t.saved && <span className="font-mono text-[11px] text-fg-4">saved answer · no credits used</span>}
              {t.pending ? (
                <p className="m-0 flex items-center gap-2 font-mono text-xs text-fg-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> reading the {noun}…
                </p>
              ) : t.error ? (
                <p className="m-0 border border-bad/50 px-3 py-2 text-[14px] text-fg-2">{t.error}</p>
              ) : (
                <AiText text={t.answer || ""} />
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <footer className="flex flex-col gap-2.5 border-t border-line px-4 py-3">
          {!status?.signedIn ? (
            <button type="button" onClick={openAuthModal} className="min-h-12 bg-signal px-4 text-[15px] font-semibold text-on-signal">
              Sign in free to ask
            </button>
          ) : !status.features["lesson-qa"] ? (
            <p className="m-0 text-[14px] text-fg-3">AI is resting right now. Try the Ask Claude or ChatGPT links in the selection menu instead.</p>
          ) : (
            <>
              {sel && (
                <p className="m-0 flex items-start gap-2 border-l-2 border-signal pl-2 text-[13px] text-fg-3">
                  <span className="min-w-0 flex-1">&ldquo;{sel.slice(0, 160)}{sel.length > 160 ? "…" : ""}&rdquo;</span>
                  <button type="button" onClick={() => setSel("")} aria-label="Don't include the selected text" className="text-fg-4 hover:text-fg">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </p>
              )}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="How to answer">
                {MODES.map((m) => (
                  <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={`min-h-8 border px-2.5 font-mono text-[11px] ${mode === m.id ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value.slice(0, 1000))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void ask();
                    }
                  }}
                  rows={2}
                  placeholder={sel ? "What about it? (or just press Ask)" : `Ask about this ${noun}…`}
                  aria-label="Your question"
                  className="min-h-[52px] flex-1 resize-none border border-line-strong bg-bg px-3 py-2 text-[15px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
                />
                <button type="button" onClick={() => void ask()} disabled={!canAsk} className="min-h-[52px] bg-signal px-4 text-[15px] font-semibold text-on-signal disabled:opacity-50">
                  Ask
                </button>
              </div>
              {dup && (
                <button type="button" onClick={() => showSaved(dup)} className="border border-ok/60 px-3 py-2 text-left text-[13px] text-fg-2 hover:border-ok">
                  Already answered: <strong className="text-fg">{dup.q}</strong> · read it free
                </button>
              )}
              {status.creditsLeft !== null && <p className="m-0 font-mono text-[11px] text-fg-4">{status.creditsLeft} AI credits left today · Enter to ask, Shift+Enter for a new line</p>}
            </>
          )}
          <p className="m-0 text-[11px] leading-snug text-fg-4">{AI_PRIVACY}</p>
        </footer>
      </aside>
    </div>
  );
}
