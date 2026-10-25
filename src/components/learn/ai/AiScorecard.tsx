"use client";

/**
 * Debrief: "Get the AI scorecard". One call grades every phase against its rubric from what the
 * candidate wrote (notes, curveball answers, replies to the AI interviewer), quoting their words.
 * Sits beside the self-scored rubric; it doesn't change XP or the verdict you claim.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { userFetch } from "@/components/learn/progress/userFetch";
import type { MockInterview } from "@/lib/learn/mock/types";
import type { MockRun } from "@/lib/learn/mock/store";
import { track } from "@/lib/track";
import AiFreeNote from "./AiFreeNote";
import AiText from "./AiText";
import { AI_PRIVACY } from "./AskLessonPanel";
import { attemptKey, useMockChats } from "./mockChat";
import { setAiCredits, useAiStatus } from "./useAiStatus";

type Part = { title: string; level: string; met: string; missed: string; next: string; summary: string };

function parse(text: string): Part[] {
  return text
    .split(/^###\s+/m)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [title, ...rest] = b.split("\n");
      const body = rest.join("\n");
      const get = (k: string) => body.match(new RegExp(`^${k}:\\s*([\\s\\S]*?)(?=^[A-Z]+:|$(?![\\s\\S]))`, "m"))?.[1]?.trim() || "";
      return { title: title.trim(), level: get("LEVEL"), met: get("MET"), missed: get("MISSED"), next: get("NEXT"), summary: get("SUMMARY") };
    });
}

const TONE: Record<string, string> = { staff: "text-ok border-ok", senior: "text-ok border-ok", sde: "text-signal-text border-signal", junior: "text-bad border-bad" };

export default function AiScorecard({ mock, run }: { mock: MockInterview; run: MockRun }) {
  const status = useAiStatus();
  const { chats } = useMockChats(attemptKey(mock.slug, run.startedAt));
  const [busy, setBusy] = useState(false);
  const [parts, setParts] = useState<Part[] | null>(null);
  const [error, setError] = useState("");
  if (!status?.features["mock-scorecard"] || !status.signedIn) return null;

  const get = async () => {
    setBusy(true);
    setError("");
    track("ai_ask", { feature: "mock-scorecard", mock: mock.slug });
    const phases = mock.phases.map((p) => ({
      id: p.id,
      notes: run.notes[p.id] || "",
      curveballs: p.curveballs.map((c) => run.answers[c.id] || "").filter(Boolean),
      chat: chats[p.id] || [],
    }));
    try {
      const r = await userFetch("/api/learn/ai/mock/scorecard", { method: "POST", body: JSON.stringify({ slug: mock.slug, phases }) });
      const body = (await r.json().catch(() => ({}))) as { text?: string; error?: string; creditsLeft?: number | null };
      setAiCredits(body.creditsLeft);
      if (r.ok) setParts(parse(body.text || ""));
      else setError(body.error || "Something went wrong.");
    } catch {
      setError("You seem to be offline.");
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="ai-sc-h" className="flex max-w-[860px] flex-col gap-4 border border-signal bg-surface p-4 sm:p-6">
      <h2 id="ai-sc-h" className="m-0 flex items-center gap-2 font-mono text-[12px] uppercase tracking-label text-signal-text">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> ai scorecard{status.preview ? " · admin preview" : ""}
      </h2>
      <p className="m-0 text-[15px] text-fg-2">
        A strict second opinion: every phase graded against its rubric from what you wrote and said, with quotes. It sits beside your own scores; it doesn&apos;t change your XP or verdict.
      </p>
      {!parts && (
        <button type="button" disabled={busy} onClick={() => void get()} className="min-h-11 self-start bg-signal px-4 text-[15px] font-semibold text-on-signal disabled:opacity-50">
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> grading every phase…
            </span>
          ) : (
            "Get the AI scorecard"
          )}
        </button>
      )}
      {error && <p className="m-0 text-[14px] text-fg-2">{error}</p>}
      {parts?.map((p, i) => {
        const lvl = p.level.toLowerCase().split(/\s/)[0];
        return (
          <div key={i} className={`flex flex-col gap-1.5 ${i ? "border-t border-line pt-3" : ""}`}>
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-[16px] text-fg">{p.title}</strong>
              {p.level && <span className={`border px-2 py-0.5 font-mono text-[11px] uppercase tracking-label ${TONE[lvl] ?? "border-line-strong text-fg-3"}`}>{p.level}</span>}
            </span>
            {p.summary && <p className="m-0 text-[15px] leading-relaxed text-fg-2">{p.summary}</p>}
            {p.met && (
              <div className="flex flex-col gap-1 text-[14px]">
                <strong className="text-fg">Showed</strong>
                <AiText text={p.met} className="!text-[14px]" />
              </div>
            )}
            {p.missed && (
              <div className="flex flex-col gap-1 text-[14px]">
                <strong className="text-fg">Missed</strong>
                <AiText text={p.missed} className="!text-[14px]" />
              </div>
            )}
            {p.next && (
              <div className="flex flex-col gap-1 text-[14px]">
                <strong className="text-fg">Practise next</strong>
                <AiText text={p.next} className="!text-[14px]" />
              </div>
            )}
          </div>
        );
      })}
      <AiFreeNote />
      <p className="m-0 text-[11px] leading-snug text-fg-4">{AI_PRIVACY}</p>
    </section>
  );
}
