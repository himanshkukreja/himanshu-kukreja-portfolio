"use client";

/**
 * The chat's small print: today's messages (and, once the main model's share is used, a quiet "fast mode"
 * line), the free-for-now line, and what happens to what you send (kept 90 days, to stop abuse and improve the
 * tutor; the tutor's memory of your learning, which you can see and clear under You → Memory).
 */
import Link from "next/link";
import { Zap } from "lucide-react";
import { AI_FREE_LINE } from "@/components/learn/ai/AiFreeNote";
import type { ChatQuota } from "@/lib/ai/chat/text";

export const CHAT_PRIVACY = "What you send goes to Anthropic's AI to answer it and isn't used to train models. Conversations are kept 90 days to stop abuse and to improve the tutor, then deleted; usage counts and your ratings are kept without the text.";

export function QuotaLine({ quota }: { quota: ChatQuota | null }) {
  if (!quota) return null;
  if (quota.ownKey) return <span className="font-mono text-[11px] text-fg-4">answering with your own key</span>;
  if (quota.fast)
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-fg-3" title="After today's first messages the chat answers with a faster model. Back to the full model after midnight UTC.">
        <Zap className="h-3 w-3 text-signal-text" aria-hidden />
        fast mode for the rest of today{quota.totalLeft <= 20 ? ` · ${quota.totalLeft} left` : ""}
      </span>
    );
  return (
    <span className="font-mono text-[11px] text-fg-4">
      {quota.mainLeft} of {quota.mainPerDay} messages left today
    </span>
  );
}

export function ChatFinePrint({ memory, className = "" }: { memory: { available: boolean; paused: boolean } | null; className?: string }) {
  return (
    <p className={`m-0 text-[11.5px] leading-snug text-fg-4 ${className}`}>
      {AI_FREE_LINE} {CHAT_PRIVACY}{" "}
      {memory?.available && (
        <>
          {memory.paused ? "Memory is off." : "The tutor remembers your learning between chats."}{" "}
          <Link href="/learn/memory" className="underline decoration-line-strong underline-offset-2 hover:text-fg-2">
            {memory.paused ? "Turn it on" : "See or clear it"}
          </Link>
          .
        </>
      )}
    </p>
  );
}
