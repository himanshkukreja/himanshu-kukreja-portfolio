"use client";

/**
 * The AI interviewer inside a mock's workspace: answer the phase out loud (typed), or send your notes,
 * and the named interviewer replies in character, probing the gaps in what you said. One conversation
 * per phase, kept in this browser; it feeds the AI scorecard in the debrief.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { aiFetch } from "./aiFetch";
import { track } from "@/lib/track";
import AiFreeNote from "./AiFreeNote";
import AiText from "./AiText";
import { AI_PRIVACY } from "./AskLessonPanel";
import { attemptKey, useMockChats, type ChatMsg } from "./mockChat";
import { setAiCredits, useAiStatus } from "./useAiStatus";

export default function AiInterviewer({ slug, startedAt, phaseId, interviewer, notes }: { slug: string; startedAt: number | null; phaseId: string; interviewer: string; notes: string }) {
  const status = useAiStatus();
  const { openAuthModal } = useAuthModal();
  const { chats, setPhase } = useMockChats(attemptKey(slug, startedAt));
  const msgs = chats[phaseId] || [];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!status?.features["mock-interviewer"]) return null;
  const first = interviewer.split(/\s+/)[0];

  const send = async (answer: string) => {
    if (!answer.trim() || busy) return;
    setBusy(true);
    setError("");
    const next: ChatMsg[] = [...msgs, { role: "user", content: answer.trim() }];
    setPhase(phaseId, next);
    setText("");
    track("ai_ask", { feature: "mock-interviewer", mock: slug, phase: phaseId, turn: next.filter((m) => m.role === "user").length });
    try {
      const r = await aiFetch("/api/learn/ai/mock/turn", { method: "POST", body: JSON.stringify({ slug, phaseId, history: msgs, answer: answer.trim() }) });
      const body = (await r.json().catch(() => ({}))) as { text?: string; error?: string; creditsLeft?: number | null };
      setAiCredits(body.creditsLeft);
      if (r.ok) setPhase(phaseId, [...next, { role: "assistant", content: body.text || "" }]);
      else setError(body.error || "Something went wrong.");
    } catch {
      setError("You seem to be offline.");
    }
    setBusy(false);
  };

  return (
    <section aria-label={`Talk to ${first}`} className="flex flex-col gap-3 border border-signal bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> live with {first} · ai{status.preview ? " · admin preview" : ""}
        </span>
        {status.creditsLeft !== null && <span className="font-mono text-[11px] text-fg-4">{status.creditsLeft} credits left today</span>}
      </div>
      {msgs.length === 0 && (
        <p className="m-0 text-[14px] text-fg-3">
          Answer {first} out loud, by typing, and {first} replies: follow-ups on what you actually said, and the curveballs a real interviewer would throw. Or send your notes for this part.
        </p>
      )}
      {msgs.map((m, i) =>
        m.role === "user" ? (
          <p key={i} className="m-0 self-end whitespace-pre-wrap border border-line-strong bg-surface-2 px-3 py-2 text-[14px] text-fg">
            {m.content}
          </p>
        ) : (
          <div key={i} className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-fg-3">{first}</span>
            <AiText text={m.content} />
          </div>
        ),
      )}
      {busy && (
        <span className="flex items-center gap-2 font-mono text-xs text-fg-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {first} is thinking…
        </span>
      )}
      {error && <p className="m-0 text-[14px] text-fg-2">{error}</p>}
      {!status.signedIn ? (
        <button type="button" onClick={openAuthModal} className="min-h-11 self-start bg-signal px-4 text-[15px] font-semibold text-on-signal">
          Sign in free to talk to {first}
        </button>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 4000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={3}
            placeholder={`Your answer to ${first}…`}
            aria-label={`Your answer to ${first}`}
            className="w-full resize-y border border-line-strong bg-bg px-3 py-2 text-[15px] leading-relaxed text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !text.trim()} onClick={() => void send(text)} className="min-h-10 bg-signal px-4 font-mono text-xs font-semibold text-on-signal disabled:opacity-50">
              Send · ⌘↵
            </button>
            {notes.trim().split(/\s+/).length >= 15 && msgs.length === 0 && (
              <button type="button" disabled={busy} onClick={() => void send(notes)} className="min-h-10 border border-line-strong px-4 font-mono text-xs text-fg hover:border-fg-3 disabled:opacity-50">
                Send my notes for this part
              </button>
            )}
          </div>
        </>
      )}
      <AiFreeNote />
      <p className="m-0 text-[11px] leading-snug text-fg-4">{AI_PRIVACY}</p>
    </section>
  );
}
