import "server-only";
/**
 * Naming a course-chat conversation: one tiny metered Haiku 5.5 call (FEATURES "chat-title", ~24 tokens out) that
 * runs beside the answer, never before it. It goes through callClaude, so the master switch, the feature's own
 * switch, the governor (red: no title; amber: still Haiku 5.5) and the feature's calls-per-day apply, and every call
 * is an ai_calls row on /admin/ai; the block list, rate limit and off-topic pause were the chat message's to pass
 * (`admitted`). Part of the chat's own spend (quota.ts CHAT_FEATURES), never counted as a chat message. Reads only the first message (and on a second try the start of the first answer); nothing is kept.
 */
import { callClaude } from "@/lib/ai/client";
import { chatTitleSystem } from "@/lib/ai/prompts";
import { cleanChatTitle, titleInput, type TitlePass } from "./title-model";
import type { ChatTurn } from "./text";

/**
 * The title for this conversation: `{ title }` (null when the model found no topic yet, or wrote something unusable),
 * or null when there was no call or it failed (switched off, resting, an error): the page keeps its own title.
 */
export async function makeChatTitle(a: { pass: TitlePass; messages: ChatTurn[]; userId: string | null; admin: boolean; userKey: string | null; chat: string }): Promise<{ title: string | null } | null> {
  const first = a.messages.find((m) => m.role === "user")?.text ?? "";
  const reply = a.pass === "again" ? a.messages.find((m) => m.role === "assistant")?.text ?? "" : null;
  if (!first.trim()) return null;
  const r = await callClaude({
    feature: "chat-title",
    userId: a.userId,
    adminPreview: a.admin,
    userKey: a.userKey,
    // the message it rides on was admitted by the chat (quota.ts: block list, rate, off-topic pause)
    admitted: true,
    system: chatTitleSystem(),
    messages: [{ role: "user", content: titleInput(first, reply) }],
    timeoutMs: 8000,
    meta: { chat: a.chat, pass: a.pass },
  });
  if (!r.ok) return null;
  return { title: cleanChatTitle(r.text) };
}
