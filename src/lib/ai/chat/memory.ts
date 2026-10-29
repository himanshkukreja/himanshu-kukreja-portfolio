import "server-only";
/**
 * Updating the course chat's memory of a learner: a small metered Haiku 5.5 call (FEATURES "chat-memory")
 * reads their current notes and one conversation and rewrites the notes; every value is scrubbed and capped
 * again before it is stored (memory-model.ts). Runs every few messages and when a chat ends, after the answer
 * has been sent. Does nothing while the chat_memory table is missing or the learner switched memory off.
 */
import { callClaude } from "@/lib/ai/client";
import { chatMemorySystem } from "@/lib/ai/prompts";
import { REF_RE, type ChatTurn } from "./text";
import { mergeMemory } from "./memory-model";
import { loadMemory, saveMemory } from "./server";

/** Update every this many learner messages (and when the chat ends). */
export const MEMORY_EVERY = 4;

const firstJson = (t: string): unknown => {
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(t.slice(s, e + 1));
  } catch {
    return null;
  }
};

export async function updateMemory(a: { userId: string; admin: boolean; userKey: string | null; chat: string; turns: ChatTurn[] }): Promise<boolean> {
  if (!a.userId) return false;
  const m = await loadMemory(a.userId);
  if (!m.available || m.paused) return false;
  const turns = a.turns.slice(-16);
  if (!turns.some((t) => t.role === "user")) return false;
  const convo = turns.map((t) => `${t.role === "user" ? "Learner" : "Tutor"}: ${t.text.replace(REF_RE, "").replace(/\s+/g, " ").slice(0, 900)}`).join("\n");
  const { sessions, updatedAt: _u, v: _v, ...notes } = m.memory;
  void _u;
  void _v;
  const user = `<current_notes>\n${JSON.stringify({ ...notes, recent_sessions: sessions.slice(0, 3).map((s) => s.summary) })}\n</current_notes>\n\n<conversation>\n${convo}\n</conversation>`;
  const r = await callClaude({
    feature: "chat-memory",
    userId: a.userId,
    adminPreview: a.admin,
    userKey: a.userKey,
    system: chatMemorySystem(),
    messages: [{ role: "user", content: user }],
    timeoutMs: 20_000,
    meta: { chat: a.chat, turns: turns.length },
  });
  if (!r.ok) return false;
  const update = firstJson(r.text);
  if (!update) return false;
  return saveMemory(a.userId, mergeMemory(m.memory, update, a.chat, new Date()));
}
