"use client";

/**
 * AI code review after a pass (signed-in learners): a rubric (correctness, complexity, edge cases,
 * readability, 1-5 each), the issues worth fixing with the exact line, and the questions an interviewer
 * would ask next. One call to /api/learn/ai/lab (kind "review", Claude Haiku 5.5, structured JSON) with the
 * lab id, the language, the stage and the reader's code: nothing else leaves the browser.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { setAiCredits, useAiStatus } from "@/components/learn/ai/useAiStatus";
import { AI_PRIVACY } from "@/components/learn/ai/AskLessonPanel";
import { AI_FREE_LINE } from "@/components/learn/ai/AiFreeNote";
import { track } from "@/lib/track";
import type { LabLang } from "@/lib/learn/labs/types";
import CompareLines from "@/components/learn/ai/CompareLines";

type Review = {
  verdict: "clean" | "minor" | "issues";
  summary: string;
  rubric: Record<"correctness" | "complexity" | "edge_cases" | "readability", { score: number; note: string }>;
  issues: { title: string; quote: string; why: string; fix: string }[];
  questions: string[];
};

const AREAS: { key: keyof Review["rubric"]; label: string }[] = [
  { key: "correctness", label: "Correctness" },
  { key: "complexity", label: "Complexity" },
  { key: "edge_cases", label: "Edge cases" },
  { key: "readability", label: "Readability" },
];
const VERDICT: Record<Review["verdict"], string> = { clean: "Clean", minor: "Minor points", issues: "Worth fixing" };

export default function LabReview({ labId, lang, stage, getCode, passed }: { labId: string; lang: LabLang; stage: number | null; getCode: () => string; passed: boolean }) {
  const status = useAiStatus();
  const { openAuthModal } = useAuthModal();
  const [state, setState] = useState<{ pending?: boolean; review?: Review; compare?: string[]; error?: string; forCode?: string } | null>(null);
  if (!passed || !status || !status.features["lab-review"]) return null;
  if (!status.signedIn) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong px-4 py-3">
        <span className="text-[14px] text-fg-2">Passed. Signed-in learners get an AI code review: a rubric, the lines worth fixing and the questions an interviewer asks next.</span>
        <button type="button" onClick={openAuthModal} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:border-fg-3">
          Sign in free
        </button>
      </div>
    );
  }
  const ask = async () => {
    const code = getCode();
    setState({ pending: true, forCode: code });
    track("ai_ask", { feature: "lab-review", lab: labId, lang });
    try {
      const res = await aiFetch("/api/learn/ai/lab", { method: "POST", body: JSON.stringify({ labId, kind: "review", lang, stage, code }) });
      const body = (await res.json().catch(() => ({}))) as { review?: Review; compare?: string[]; error?: string; creditsLeft?: number | null };
      setAiCredits(body.creditsLeft);
      setState(res.ok && body.review ? { review: body.review, compare: Array.isArray(body.compare) ? body.compare : [], forCode: code } : { error: body.error || "Something went wrong.", forCode: code });
    } catch {
      setState({ error: "You seem to be offline.", forCode: code });
    }
  };
  const r = state?.review;
  return (
    <section aria-label="AI code review" className="flex min-w-0 flex-col gap-3 border border-line bg-surface p-4" data-hk-review="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> ai code review{status.preview ? " · admin preview" : ""}
        </span>
        {status.creditsLeft !== null && <span className="font-mono text-[11px] text-fg-4">{status.creditsLeft} credits left today</span>}
      </div>
      {!state && (
        <div className="flex flex-col items-start gap-2">
          <p className="m-0 text-[14px] leading-relaxed text-fg-2">All tests pass. Get the review an interviewer would give: a score for correctness, complexity, edge cases and readability, the lines worth changing, and what they&apos;d ask next.</p>
          <button type="button" onClick={() => void ask()} className="min-h-11 bg-signal px-4 font-mono text-xs font-semibold text-on-signal hover:brightness-110">
            Review my code
          </button>
        </div>
      )}
      {state?.pending && (
        <span className="flex items-center gap-2 font-mono text-xs text-fg-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> reading your code…
        </span>
      )}
      {state?.error && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-fg-2">{state.error}</span>
          <button type="button" onClick={() => void ask()} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:border-fg-3">
            Try again
          </button>
        </div>
      )}
      {r && (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className={`self-start border px-2 py-1 font-mono text-[11px] uppercase tracking-label ${r.verdict === "clean" ? "border-ok text-ok-text" : r.verdict === "issues" ? "border-bad text-bad-text" : "border-line-strong text-fg-2"}`}>{VERDICT[r.verdict]}</span>
            <p className="m-0 text-[15px] leading-relaxed text-fg">{r.summary}</p>
          </div>
          <ul className="m-0 grid list-none gap-px border border-line bg-line p-0 sm:grid-cols-2">
            {AREAS.map((a) => {
              const it = r.rubric[a.key];
              return (
                <li key={a.key} className="flex min-w-0 flex-col gap-1.5 bg-surface p-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-label text-fg-2">{a.label}</span>
                    <span className="flex items-center gap-1" aria-label={`${it.score} out of 5`}>
                      {[1, 2, 3, 4, 5].map((k) => (
                        <span key={k} aria-hidden className={`h-2 w-4 ${k <= it.score ? (it.score >= 4 ? "bg-ok" : it.score === 3 ? "bg-signal" : "bg-bad") : "bg-line-strong"}`} />
                      ))}
                      <span className="ml-1 font-mono text-[12px] text-fg">{it.score}/5</span>
                    </span>
                  </span>
                  <span className="text-[13px] leading-snug text-fg-2">{it.note}</span>
                </li>
              );
            })}
          </ul>
          {r.issues.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{r.verdict === "clean" ? "Polish" : "Worth changing"}</span>
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {r.issues.map((i, k) => (
                  <li key={k} className="flex min-w-0 flex-col gap-1.5 border-l-2 border-line-strong pl-3">
                    <span className="text-[14px] font-semibold text-fg">
                      {k + 1}. {i.title}
                    </span>
                    {i.quote && <code className="block min-w-0 whitespace-pre-wrap break-words bg-raised px-2 py-1 font-mono text-[12.5px] text-fg">{i.quote}</code>}
                    <span className="text-[13.5px] leading-relaxed text-fg-2">{i.why}</span>
                    <span className="text-[13.5px] leading-relaxed text-fg">
                      <span className="font-mono text-[11px] uppercase tracking-label text-ok-text">fix · </span>
                      {i.fix}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <CompareLines lines={state?.compare} />
          {r.questions.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">The interviewer asks next</span>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {r.questions.map((q, k) => (
                  <li key={k} className="flex gap-2 text-[14px] leading-relaxed text-fg">
                    <span aria-hidden className="font-mono text-signal-text">?</span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state?.forCode !== getCode() && (
            <button type="button" onClick={() => void ask()} className="self-start min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:border-fg-3">
              Review my changed code
            </button>
          )}
        </div>
      )}
      <details className="text-[11px] text-fg-4">
        <summary className="cursor-pointer list-none font-mono">{AI_FREE_LINE} · privacy ›</summary>
        <p className="m-0 mt-1 leading-snug">{AI_PRIVACY} Only this lab&apos;s id and your code are sent, and while tutor memory is on a few lines about your earlier attempts: not your test results.</p>
      </details>
    </section>
  );
}
