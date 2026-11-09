"use client";

/**
 * The chat's small print: today's messages, the free-for-now line, and what happens to what you send (kept 90 days, to stop abuse and improve the
 * tutor; the tutor's memory of your learning, which you can see and clear under You → Memory; and the chat history,
 * saved to the account for 90 days once chat_threads exists, else kept on the device, deletable from History).
 */
import Link from "next/link";
import { AI_FREE_LINE } from "@/components/learn/ai/AiFreeNote";
import type { ChatQuota } from "@/lib/ai/chat/text";

export const CHAT_PRIVACY = "What you send goes to Anthropic's AI to answer it and isn't used to train models. Conversations are kept 90 days to stop abuse and to improve the tutor, then deleted; usage counts and your ratings are kept without the text.";

/** DSA Mastery's tutors keep what learners send 30 days (the AI transcripts' retention); the chat history 90, like the course chat's. */
export const DSA_PRIVACY = "What you send goes to Anthropic's AI to answer it and isn't used to train models. Messages are kept 30 days to stop abuse, then deleted; usage counts are kept without the text.";

export function QuotaLine({ quota }: { quota: ChatQuota | null }) {
  if (!quota) return null;
  if (quota.ownKey) return <span className="font-mono text-[11px] text-fg-4">answering with your own key</span>;
  return (
    <span className="font-mono text-[11px] text-fg-4">
      {quota.left} of {quota.perDay} messages left today
    </span>
  );
}

/** Where the learner's chat history lives: "on" in their account (chat_threads), "off" on this device only. */
export const historyLine = (where: "on" | "off" | "unknown") =>
  where === "on"
    ? "Your chat history is saved to your account for 90 days after your last message, so you can pick a chat up on any device; delete one chat or all of them from History."
    : "Your chat history is kept on this device for 90 days after your last message; delete one chat or all of them from History.";

/**
 * One quiet line ("free for now · not used to train AI · privacy & memory"); the full small print opens
 * under it on a tap (the owner found the whole paragraph under every chat distracting, 29 Oct 2026).
 */
export function ChatFinePrint({ memory, history, className = "", privacy = CHAT_PRIVACY }: { memory: { available: boolean; paused: boolean } | null; history?: "on" | "off" | "unknown"; className?: string; /** another tutor's retention (DSA Mastery: 30 days) */ privacy?: string }) {
  return (
    <details className={`group text-[11.5px] leading-snug text-fg-4 ${className}`}>
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 font-mono text-[11px] hover:text-fg-3 [&::-webkit-details-marker]:hidden">
        free for now · not used to train AI ·{" "}
        <span className="underline decoration-line-strong underline-offset-2 group-open:text-fg-3">privacy &amp; memory</span>
      </summary>
      <p className="m-0 mt-1.5 max-w-[640px]">
        {AI_FREE_LINE} {privacy} {history ? `${historyLine(history)} ` : ""}
        {memory?.available && (
          <>
            {memory.paused ? "Memory is off." : "The tutor remembers your learning between chats."}{" "}
            <Link href="/memory" className="underline decoration-line-strong underline-offset-2 hover:text-fg-2">
              {memory.paused ? "Turn it on" : "See or clear it"}
            </Link>
            .
          </>
        )}
      </p>
    </details>
  );
}
