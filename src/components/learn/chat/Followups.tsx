"use client";

import { ArrowRight } from "lucide-react";
import { FOLLOWUP_ACTIONS, MAX_CHIPS, type FollowupAction } from "@/lib/ai/answerStyle";

/**
 * Likely next questions under the last answer, then the standard actions as small buttons ("Explain simpler",
 * "Quiz me"…; at most MAX_CHIPS in all): one tap sends it (as if typed; an action sends the words the tutor knows).
 */
export default function Followups({ items, actions = [], onAsk, className = "" }: { items: string[]; actions?: FollowupAction[]; onAsk: (q: string) => void; className?: string }) {
  const acts = actions.slice(0, Math.max(0, MAX_CHIPS - items.length));
  return (
    // data-chat-transient: only the last answer has them; they go when the next message is sent (by design)
    <div data-chat-transient role="group" aria-label="Suggested follow-up questions" className={`flex flex-col gap-1.5 ${className}`}>
      <span className="font-mono text-[10.5px] uppercase tracking-label text-fg-4">ask next</span>
      {items.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {items.map((q) => (
            <li key={q} className="flex min-w-0 grow basis-[200px]">
              <button
                type="button"
                onClick={() => onAsk(q)}
                className="group flex min-h-11 w-full min-w-0 items-start justify-between gap-2 border border-line bg-bg px-3 py-2.5 text-left text-[13.5px] leading-snug text-fg-2 hover:border-signal hover:text-fg focus-visible:border-signal"
              >
                <span className="min-w-0 break-words">{q}</span>
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-4 group-hover:text-signal-text group-focus-visible:text-signal-text" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {acts.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Quick actions">
          {acts.map((a) => (
            <li key={a}>
              <button
                type="button"
                onClick={() => onAsk(FOLLOWUP_ACTIONS[a].ask)}
                className="inline-flex min-h-9 items-center border border-line-strong bg-surface px-2.5 font-mono text-[12px] text-fg-2 hover:border-signal hover:text-fg focus-visible:border-signal [@media(pointer:coarse)]:min-h-11"
              >
                {FOLLOWUP_ACTIONS[a].label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
