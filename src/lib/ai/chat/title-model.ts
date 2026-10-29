/**
 * The course chat's titles (pure, shared by the route and scripts/chat-check.ts). On the first message of a new
 * conversation a tiny Haiku 5.5 call (FEATURES "chat-title", lib/ai/chat/title.ts) names it from the topic, not
 * the learner's wording ("why does my cache stampede at midnight??" → "Cache stampedes at midnight"). When the
 * first message has no topic yet ("hi", "help", "quiz me"), the model says NONE and the page asks once more with
 * the second message, naming the chat from the start of the first answer. Whatever the model writes is cleaned
 * here before anyone sees it; anything odd falls back to the old title (the first message, cut short).
 */
import { REF_RE } from "./text";

/** The longest title kept (the sidebar shows two lines of about this). */
export const CHAT_TITLE_MAX = 48;
/** What the title call may read: the first message, and for the second try the start of the first answer. */
export const TITLE_FIRST_CHARS = 500;
export const TITLE_REPLY_CHARS = 300;

/** Which title call this message gets: "first" (a new conversation's first message), "again" (the first one had no topic). */
export type TitlePass = "first" | "again";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The model's answer as a sidebar title, or null (no title: keep the fallback). The first line only; no quotes,
 * markdown, links, tags, emoji or ending punctuation; a "Title:" label dropped; NONE, an empty answer, a refusal,
 * a URL or a ramble (more than 8 words) is null; longer than CHAT_TITLE_MAX it is cut at a word.
 */
export function cleanChatTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let t = raw.replace(/<plan>[\s\S]*?<\/plan>/gi, "").replace(/<[^>]*>/g, " ");
  t = t.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  t = t
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    // markdown: a heading or list mark, links (keep the words), emphasis and code marks
    .replace(/^\s*(#{1,6}|[-*+>•]|\d+[.)])\s+/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/^\s*(chat\s+)?title\s*[:：\-–—]\s*/i, "")
    // quotes of every kind (an apostrophe inside a word stays: "Kafka's ordering")
    .replace(/["“”„‟«»「」『』]/g, "")
    .replace(/(^|\s)['‘’]+|['‘’]+(?=\s|$)/g, "$1")
    // emoji, pictographs and their joiners
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "");
  t = oneLine(t).replace(/^[\s\-–—•:;,.]+/, "").replace(/[\s.!?…:;,\-–—]+$/, "");
  if (!t || /^none$/i.test(t)) return null;
  if (/https?:|www\.|\.(com|in|io|org)\b|@/i.test(t)) return null;
  if (!/\p{L}/u.test(t)) return null;
  if (/^(i |i'm |i am |sorry|as an ai|here is|here's|sure\b|okay\b|this (chat|conversation) )/i.test(t)) return null;
  if (t.split(" ").length > 8) return null;
  if (t.length > CHAT_TITLE_MAX) {
    const cut = t.slice(0, CHAT_TITLE_MAX + 1);
    const sp = cut.lastIndexOf(" ");
    t = (sp > CHAT_TITLE_MAX * 0.5 ? cut.slice(0, sp) : t.slice(0, CHAT_TITLE_MAX)).replace(/[\s.!?…:;,\-–—&/]+$/, "").replace(/\s+(and|or|of|for|to|in|on|with|the|a|an|vs)$/i, "");
  }
  if (!t) return null;
  return t.charAt(0).toLocaleUpperCase("en") + t.slice(1);
}

/** The one message the title call sees: the learner's first message, and on the second try the start of the first answer. */
export function titleInput(first: string, reply?: string | null): string {
  const clip = (s: string, n: number) => {
    const o = oneLine(s.replace(REF_RE, ""));
    return o.length > n ? `${o.slice(0, n)}…` : o;
  };
  const msg = `<first_message>\n${clip(first, TITLE_FIRST_CHARS)}\n</first_message>`;
  return reply ? `${msg}\n<start_of_tutor_reply>\n${clip(reply.replace(/[*_`#>]+/g, ""), TITLE_REPLY_CHARS)}\n</start_of_tutor_reply>` : msg;
}

/** Which title call a request may make, checked against the conversation itself (a client can't ask for more). */
export function titlePassFor(asked: unknown, messages: { role: string }[], mock: unknown): TitlePass | null {
  if (mock) return null;
  const users = messages.filter((m) => m.role === "user").length;
  if (asked === "first" && users === 1) return "first";
  if (asked === "again" && users === 2 && messages.some((m) => m.role === "assistant")) return "again";
  return null;
}
