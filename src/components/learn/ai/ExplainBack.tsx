"use client";

/**
 * "Explain it back": the learner explains a concept in their own words and gets a strict verdict
 * (solid / partial / misconception) with what they got, what's missing and one fix. Concept pages.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { aiFetch } from "./aiFetch";
import { track } from "@/lib/track";
import AiFreeNote from "./AiFreeNote";
import { AI_PRIVACY } from "./AskLessonPanel";
import { setAiCredits, useAiStatus } from "./useAiStatus";

const TONE: Record<string, string> = { solid: "border-ok text-ok", partial: "border-signal text-signal-text", misconception: "border-bad text-bad" };
const LABEL: Record<string, string> = { solid: "solid ✓", partial: "partly there", misconception: "a misconception" };

function parse(t: string) {
  const get = (k: string) => t.match(new RegExp(`${k}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`))?.[1]?.trim() || "";
  return { got: get("GOT"), missing: get("MISSING"), fix: get("FIX") };
}

export default function ExplainBack({ conceptId, term }: { conceptId: string; term: string }) {
  const status = useAiStatus();
  const { openAuthModal } = useAuthModal();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ verdict: string | null; text: string } | null>(null);
  const [error, setError] = useState("");
  // for guests the feature flags say whether AI is on for learners: pitch sign-in only then
  if (!status || !status.features["explain-back"]) return null;

  const grade = async () => {
    setBusy(true);
    setError("");
    track("ai_ask", { feature: "explain-back", concept: conceptId });
    try {
      const r = await aiFetch("/api/learn/ai/explain", { method: "POST", body: JSON.stringify({ conceptId, text }) });
      const body = (await r.json().catch(() => ({}))) as { verdict?: string | null; text?: string; error?: string; creditsLeft?: number | null };
      setAiCredits(body.creditsLeft);
      if (r.ok) setRes({ verdict: body.verdict ?? null, text: body.text || "" });
      else setError(body.error || "Something went wrong.");
    } catch {
      setError("You seem to be offline.");
    }
    setBusy(false);
  };

  const p = res ? parse(res.text) : null;
  return (
    <section aria-labelledby="eb-h" className="flex flex-col gap-3 border border-signal bg-surface p-5">
      <h2 id="eb-h" className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> explain it back{status.preview ? " · admin preview" : ""}
      </h2>
      <p className="m-0 text-[15px] text-fg-2">
        Explain <strong className="text-fg">{term}</strong> in your own words, as you would to an interviewer. You&apos;ll get an honest verdict and the one thing to fix.
      </p>
      {!status.signedIn ? (
        <button type="button" onClick={openAuthModal} className="min-h-11 self-start bg-signal px-4 text-[15px] font-semibold text-on-signal">
          Sign in free to try it
        </button>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1500))}
            rows={4}
            placeholder={`${term} is…`}
            aria-label={`Your explanation of ${term}`}
            className="w-full resize-y border border-line-strong bg-bg px-3 py-2 text-[15px] leading-relaxed text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || text.trim().split(/\s+/).length < 8} onClick={() => void grade()} className="min-h-11 bg-signal px-4 text-[15px] font-semibold text-on-signal disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Check my explanation"}
            </button>
            {status.creditsLeft !== null && <span className="font-mono text-[11px] text-fg-4">{status.creditsLeft} credits left today</span>}
          </div>
        </>
      )}
      {error && <p className="m-0 text-[14px] text-fg-2">{error}</p>}
      {res && p && (
        <div className="flex flex-col gap-2 border-t border-line pt-3 text-[15px] leading-relaxed text-fg-2">
          {res.verdict && <span className={`self-start border px-2.5 py-1 font-mono text-xs uppercase tracking-label ${TONE[res.verdict] ?? ""}`}>{LABEL[res.verdict] ?? res.verdict}</span>}
          {p.got && <p className="m-0"><strong className="text-fg">You got:</strong> {p.got}</p>}
          {p.missing && p.missing.toLowerCase() !== "nothing" && <p className="m-0"><strong className="text-fg">Missing:</strong> {p.missing}</p>}
          {p.fix && <p className="m-0"><strong className="text-fg">Fix:</strong> {p.fix}</p>}
          {!p.got && !p.missing && !p.fix && <p className="m-0 whitespace-pre-wrap">{res.text}</p>}
        </div>
      )}
      <AiFreeNote />
      <p className="m-0 text-[11px] leading-snug text-fg-4">{AI_PRIVACY}</p>
    </section>
  );
}
