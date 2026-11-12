import "server-only";
/**
 * DSA Mastery's tutors keep notes in the learner's one memory (chat_memory, shared with the course chat; DSA items are
 * tagged, lib/ai/chat/memory-model.ts): a small metered Haiku 5.5 call (FEATURES "chat-memory", like the course chat's)
 * reads the current shared lines and DSA notes and one DSA conversation, and returns the updated notes; every value is
 * scrubbed and capped again before it is stored (mergeDsaMemory). Runs every few learner messages (after the answer is
 * out) and when a chat ends ("New chat"). Does nothing while the table is missing or memory is switched off.
 */
import { callClaude } from "@/lib/ai/client";
import { REF_RE, type ChatTurn } from "@/lib/ai/chat/text";
import { dsaNotes, mergeDsaMemory } from "@/lib/ai/chat/memory-model";
import { loadMemory, saveMemory } from "@/lib/ai/chat/server";
import { dsaMemorySystem } from "./prompts";

/** Update every this many learner messages (and when a chat ends). */
export const DSA_MEMORY_EVERY = 3;

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

export async function updateDsaMemory(a: {
  userId: string;
  admin: boolean;
  userKey: string | null;
  chat: string;
  turns: ChatTurn[];
  /** where the conversation happened: "DSA Mastery chat" or the problem room's tutor on a problem, with its mode, verdict and rung */
  where: string;
  /** what started it when it isn't the chat itself (lib/ai/chat/capture.ts: idle, the next chat, "New chat") */
  via?: string;
}): Promise<boolean> {
  if (!a.userId) return false;
  const m = await loadMemory(a.userId);
  if (!m.available || m.paused) return false;
  const turns = a.turns.slice(-14);
  if (!turns.some((t) => t.role === "user")) return false;
  const convo = turns.map((t) => `${t.role === "user" ? "Learner" : "Tutor"}: ${t.text.replace(REF_RE, "").replace(/\s+/g, " ").slice(0, 900)}`).join("\n");
  const n = dsaNotes(m.memory);
  const notes = { level: n.level, prefs: n.prefs, struggles: n.struggles, mistakes: n.mistakes, recent_sessions: n.sessions.slice(0, 3).map((s) => s.summary) };
  const user = `<current_notes>\n${JSON.stringify(notes)}\n</current_notes>\n\n<where>${a.where}</where>\n\n<conversation>\n${convo}\n</conversation>`;
  const r = await callClaude({
    feature: "chat-memory",
    userId: a.userId,
    adminPreview: a.admin,
    userKey: a.userKey,
    system: dsaMemorySystem(),
    messages: [{ role: "user", content: user }],
    timeoutMs: 20_000,
    meta: { chat: a.chat, turns: turns.length, course: "dsa", users: a.turns.filter((t) => t.role === "user").length, ...(a.via ? { via: a.via } : {}) },
  });
  if (!r.ok) return false;
  const update = firstJson(r.text);
  if (!update) return false;
  // re-read just before writing: the course chat may have written in the meantime (its items are kept as they are)
  const now = await loadMemory(a.userId);
  if (!now.available || now.paused) return false;
  return saveMemory(a.userId, mergeDsaMemory(now.memory, update, a.chat.slice(0, 40), new Date()));
}
