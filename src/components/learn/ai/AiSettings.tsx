"use client";

/**
 * You → Progress: today's AI credits and "use your own Anthropic key" (bring your own key). The key is
 * kept only in this browser and sent only with AI requests; calls on it are billed to the learner's
 * Anthropic account, so the site's daily limits don't apply.
 */
import { useState, useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import AiFreeNote from "./AiFreeNote";
import { AI_KEY_EVENT, readOwnKey, saveOwnKey } from "./aiFetch";
import { useAiStatus } from "./useAiStatus";

const sub = (cb: () => void) => (window.addEventListener(AI_KEY_EVENT, cb), () => window.removeEventListener(AI_KEY_EVENT, cb));

export default function AiSettings({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const status = useAiStatus();
  const saved = useSyncExternalStore(sub, readOwnKey, () => "");
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");
  // show the card when the site's AI is on for learners, or when someone already uses their own key
  if (!status || (!status.available && !saved)) return null;

  const save = () => {
    const k = draft.trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(k)) {
      setMsg("That doesn't look like an Anthropic API key (it starts with sk-ant-).");
      return;
    }
    saveOwnKey(k);
    setDraft("");
    setMsg("Saved in this browser. AI features now use your key.");
  };

  return (
    <section aria-labelledby="ai-set-h" className="flex flex-col gap-3 border border-line bg-surface p-5 sm:p-6">
      <h2 id="ai-set-h" className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> ai in the course
      </h2>
      <p className="m-0 text-[15px] text-fg-2">
        Ask a lesson, get hints in code labs, explain a concept back, interview with an AI interviewer, get a design reviewed, and type your own moves in war rooms.
      </p>
      <AiFreeNote />
      {!signedIn ? (
        <button type="button" onClick={onSignIn} className="min-h-11 self-start bg-signal px-4 text-[15px] font-semibold text-on-signal">
          Sign in free to use AI
        </button>
      ) : saved ? (
        <p className="m-0 font-mono text-xs text-fg-2">Using your own Anthropic key (…{saved.slice(-4)}). The site&apos;s daily limits don&apos;t apply; your Anthropic account is billed.</p>
      ) : (
        status.creditsLeft !== null && (
          <p className="m-0 font-mono text-xs text-fg-2">
            {status.creditsLeft} of {status.creditsPerDay} AI credits left today · they refill at midnight UTC
          </p>
        )
      )}
      {signedIn && (
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer font-mono text-xs text-fg-3 hover:text-fg">{saved ? "Change or remove your own key" : "Use your own Anthropic key (no daily limit)"}</summary>
          <div className="mt-3 flex flex-col gap-2">
            <p className="m-0 text-[13px] leading-relaxed text-fg-3">
              Paste an API key from console.anthropic.com. It stays in this browser only and is sent just with AI requests, over HTTPS; we never store or log it. Usage is billed to your Anthropic account.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                autoComplete="off"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="sk-ant-…"
                aria-label="Your Anthropic API key"
                className="min-h-11 min-w-0 flex-1 border border-line-strong bg-bg px-3 font-mono text-[13px] text-fg placeholder:text-fg-4"
              />
              <button type="button" onClick={save} disabled={!draft.trim()} className="min-h-11 border border-line-strong px-4 font-mono text-xs text-fg hover:border-fg-3 disabled:opacity-50">
                Save key
              </button>
              {saved && (
                <button type="button" onClick={() => (saveOwnKey(""), setMsg("Removed. AI features use the site's free credits again."))} className="min-h-11 border border-bad/60 px-4 font-mono text-xs text-fg-2 hover:border-bad">
                  Remove
                </button>
              )}
            </div>
            {msg && <span className="font-mono text-[11px] text-fg-3">{msg}</span>}
          </div>
        </details>
      )}
    </section>
  );
}
