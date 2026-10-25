"use client";

/**
 * Code-lab tutor under the test results: after a failing run, "Get a hint" (level 1 nudge → 2 the
 * exact spot → 3 the fix in words, never the solution); after a pass, "Review my code". Hidden tests
 * go by message only. Signed-in learners; hidden when AI isn't available.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { aiFetch } from "./aiFetch";
import type { HarnessResult } from "@/lib/learn/labs/harness";
import { track } from "@/lib/track";
import AiFreeNote from "./AiFreeNote";
import AiText from "./AiText";
import { AI_PRIVACY } from "./AskLessonPanel";
import { setAiCredits, useAiStatus } from "./useAiStatus";

type Item = { kind: "hint" | "review"; level: number; text?: string; error?: string; pending?: boolean };
const LEVEL = ["", "a nudge", "the exact spot", "the fix, in words"];

export default function LabTutor({ labId, getCode, result, passed }: { labId: string; getCode: () => string; result: HarnessResult | null; passed: boolean }) {
  const status = useAiStatus();
  const { openAuthModal } = useAuthModal();
  const [items, setItems] = useState<Item[]>([]);
  // for guests the feature flags say whether AI is on for learners: pitch sign-in only then
  if (!status || (!status.features["lab-hint"] && !status.features["lab-review"]) || !result) return null;
  if (!status.signedIn) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong px-4 py-3">
        <span className="text-[14px] text-fg-2">Stuck? Signed-in learners get AI hints that point the way without giving the answer.</span>
        <button type="button" onClick={openAuthModal} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:border-fg-3">
          Sign in free
        </button>
      </div>
    );
  }
  const hints = items.filter((i) => i.kind === "hint");
  const nextLevel = Math.min(3, hints.length + 1);
  const busy = items.some((i) => i.pending);
  const failures = result.tests.filter((t) => !t.ok).map((t) => ({ group: t.group, name: t.title || t.name, message: t.error?.message, line: t.error?.line ?? null }));

  const ask = async (kind: "hint" | "review") => {
    const item: Item = { kind, level: kind === "hint" ? nextLevel : 0, pending: true };
    setItems((x) => [...x, item]);
    track("ai_ask", { feature: kind === "hint" ? "lab-hint" : "lab-review", lab: labId, level: item.level });
    try {
      const res = await aiFetch("/api/learn/ai/lab", {
        method: "POST",
        body: JSON.stringify({ labId, kind, level: item.level, code: getCode(), failures, setup: result.setup?.message }),
      });
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string; creditsLeft?: number | null };
      setAiCredits(body.creditsLeft);
      setItems((x) => x.map((i) => (i === item ? { ...i, pending: false, ...(res.ok ? { text: body.text } : { error: body.error || "Something went wrong." }) } : i)));
    } catch {
      setItems((x) => x.map((i) => (i === item ? { ...i, pending: false, error: "You seem to be offline." } : i)));
    }
  };

  return (
    <section aria-label="AI tutor" className="flex flex-col gap-3 border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> ai tutor{status.preview ? " · admin preview" : ""}
        </span>
        {status.creditsLeft !== null && <span className="font-mono text-[11px] text-fg-4">{status.creditsLeft} credits left today</span>}
      </div>
      {items.map((i, k) => (
        <div key={k} className="flex flex-col gap-1.5 border-l-2 border-line-strong pl-3">
          <span className="font-mono text-[11px] text-fg-3">{i.kind === "hint" ? `hint ${i.level} · ${LEVEL[i.level]}` : "code review"}</span>
          {i.pending ? (
            <span className="flex items-center gap-2 font-mono text-xs text-fg-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> reading your code…
            </span>
          ) : i.error ? (
            <span className="text-[14px] text-fg-2">{i.error}</span>
          ) : (
            <AiText text={i.text || ""} />
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {!passed && status.features["lab-hint"] && hints.length < 3 && (
          <button type="button" disabled={busy} onClick={() => void ask("hint")} className="min-h-10 bg-signal px-4 font-mono text-xs font-semibold text-on-signal disabled:opacity-50">
            {hints.length ? `Another hint · ${LEVEL[nextLevel]}` : "Stuck? Get a hint"}
          </button>
        )}
        {passed && status.features["lab-review"] && !items.some((i) => i.kind === "review") && (
          <button type="button" disabled={busy} onClick={() => void ask("review")} className="min-h-10 bg-signal px-4 font-mono text-xs font-semibold text-on-signal disabled:opacity-50">
            Review my code
          </button>
        )}
        {!passed && hints.length >= 3 && <span className="self-center text-[13px] text-fg-3">That&apos;s every hint level. The worked solution unlocks after a few more runs.</span>}
      </div>
      <AiFreeNote />
      <p className="m-0 text-[11px] leading-snug text-fg-4">{AI_PRIVACY}</p>
    </section>
  );
}
