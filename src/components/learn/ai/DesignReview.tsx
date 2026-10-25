"use client";

/** Design of the week editor: "Get AI feedback on this draft", a staff-engineer review (strengths, risks worst first, next questions). */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { aiFetch } from "./aiFetch";
import { track } from "@/lib/track";
import AiFreeNote from "./AiFreeNote";
import AiText from "./AiText";
import { AI_PRIVACY } from "./AskLessonPanel";
import { setAiCredits, useAiStatus } from "./useAiStatus";

export default function DesignReview({ slug, body }: { slug: string; body: string }) {
  const status = useAiStatus();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  if (!status?.features["design-review"] || !status.signedIn) return null;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  const review = async () => {
    setBusy(true);
    setError("");
    track("ai_ask", { feature: "design-review", challenge: slug, words });
    try {
      const r = await aiFetch("/api/learn/ai/design-review", { method: "POST", body: JSON.stringify({ slug, md: body }) });
      const b = (await r.json().catch(() => ({}))) as { text?: string; error?: string; creditsLeft?: number | null };
      setAiCredits(b.creditsLeft);
      if (r.ok) setText(b.text || "");
      else setError(b.error || "Something went wrong.");
    } catch {
      setError("You seem to be offline.");
    }
    setBusy(false);
  };

  return (
    <section aria-label="AI design review" className="flex flex-col gap-3 border border-signal bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> ai design review{status.preview ? " · admin preview" : ""}
        </span>
        {status.creditsLeft !== null && <span className="font-mono text-[11px] text-fg-4">{status.creditsLeft} credits left today</span>}
      </div>
      <p className="m-0 text-[14px] text-fg-2">A private review of your draft before you submit: what&apos;s strong, the risks that would sink it in an interview, worst first, and what you&apos;d be asked next. Nobody else sees it.</p>
      <button type="button" disabled={busy || words < 80} onClick={() => void review()} className="min-h-10 self-start bg-signal px-4 font-mono text-xs font-semibold text-on-signal disabled:opacity-50">
        {busy ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> reviewing…
          </span>
        ) : words < 80 ? (
          `Write ${80 - words} more words to get a review`
        ) : text ? (
          "Review the new draft"
        ) : (
          "Get AI feedback on this draft"
        )}
      </button>
      {error && <p className="m-0 text-[14px] text-fg-2">{error}</p>}
      {text && <AiText text={text} />}
      <AiFreeNote />
      <p className="m-0 text-[11px] leading-snug text-fg-4">{AI_PRIVACY}</p>
    </section>
  );
}
