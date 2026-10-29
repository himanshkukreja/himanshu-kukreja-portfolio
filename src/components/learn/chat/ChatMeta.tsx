"use client";

/**
 * The chat's small print: today's messages (and, once the main model's share is used, a quiet "fast mode"
 * line), the free-for-now line, and what happens to what you send (kept 90 days, to stop abuse and improve the
 * tutor; the tutor's memory of your learning, which you can see and clear under You → Memory; and the chat history,
 * saved to the account for 90 days once chat_threads exists, else kept on the device, deletable from History).
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

/** Where the learner's chat history lives: "on" in their account (chat_threads), "off" on this device only. */
export const historyLine = (where: "on" | "off" | "unknown") =>
  where === "on"
    ? "Your chat history is saved to your account for 90 days after your last message, so you can pick a chat up on any device; delete one chat or all of them from History."
    : "Your chat history is kept on this device for 90 days after your last message; delete one chat or all of them from History.";

export function ChatFinePrint({ memory, history, className = "" }: { memory: { available: boolean; paused: boolean } | null; history?: "on" | "off" | "unknown"; className?: string }) {
  return (
    <p className={`m-0 text-[11.5px] leading-snug text-fg-4 ${className}`}>
      {AI_FREE_LINE} {CHAT_PRIVACY} {history ? `${historyLine(history)} ` : ""}
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
