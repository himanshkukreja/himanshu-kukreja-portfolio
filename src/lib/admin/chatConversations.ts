import "server-only";
/**
 * /admin/chat's conversations table: the course chat's messages (ai_calls, feature "course-chat", one row per message,
 * grouped by meta.chat) for the page's window, filtered by learner, mode (main model, fast mode, own key) and outcome
 * (an off-topic decline, a thumbs down, an answer marked wrong), sorted (newest, oldest, messages, cost, tokens) and
 * paged here on the server, 25 a page. The window's rows are read once and kept 30 seconds, so paging and changing
 * a filter don't read them again. Emails come through lib/admin/aiCalls.ts (auth admin API, cached).
 */
import { supabase } from "@/lib/supabase";
import { emailsFor, userOf, windowOf, windowStart, withEmails, type CallWindow } from "./aiCalls";

export const CONV_PAGE = 25;
const MAX_ROWS = 20_000;

export const CONV_SORTS = ["new", "old", "messages.desc", "messages.asc", "cost.desc", "cost.asc", "tokens.desc", "tokens.asc"] as const;
export type ConvSort = (typeof CONV_SORTS)[number];
export const CONV_MODES = ["main", "fast", "own"] as const;
export const CONV_OUTCOMES = ["off_topic", "down", "wrong"] as const;

export type Conv = {
  chat: string;
  user: string | null;
  email: string | null;
  messages: number;
  first: string;
  last: string;
  /** messages answered in fast mode (Haiku) */
  fast: number;
  /** messages on the learner's own key */
  own: number;
  /** the conversation's mode: any own-key message → "own", else any fast-mode one → "fast", else "main" */
  mode: (typeof CONV_MODES)[number];
  cost: number;
  tokens: number;
  offTopic: number;
  down: number;
  wrong: number;
};

export type ConvQuery = { window: CallWindow; sort: ConvSort; user: string | null; mode: Conv["mode"] | null; outcome: (typeof CONV_OUTCOMES)[number] | null; page: number };

export function readConvQuery(p: URLSearchParams): ConvQuery {
  const pick = <T extends string>(v: string | null, of: readonly T[]) => (v && (of as readonly string[]).includes(v) ? (v as T) : null);
  return {
    window: windowOf(p),
    sort: pick(p.get("sort"), CONV_SORTS) ?? "new",
    user: userOf(p.get("user")),
    mode: pick(p.get("mode"), CONV_MODES),
    outcome: pick(p.get("outcome"), CONV_OUTCOMES),
    page: Math.min(10_000, Math.max(1, Math.floor(Number(p.get("page"))) || 1)),
  };
}

type Row = { id: number; created_at: string; user_id: string | null; model: string; status: string; cost_usd: number | null; input_tokens: number | null; output_tokens: number | null; byok: boolean | null; chat: string | null };
type Window = { convs: Conv[]; feedback: boolean; partial: boolean };

const cache = new Map<string, { at: number; v: Window }>();

/** Every conversation in the window, with its counts (cached 30 s per window). */
async function load(w: CallWindow): Promise<Window> {
  const hit = cache.get(w.key);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const from = windowStart(w);
  const rows: Row[] = [];
  for (let at = 0; at < MAX_ROWS; at += 1000) {
    const { data, error } = await supabase
      .from("ai_calls")
      .select("id, created_at, user_id, model, status, cost_usd, input_tokens, output_tokens, byok, chat:meta->>chat")
      .eq("feature", "course-chat")
      .gte("created_at", from)
      .order("id", { ascending: true })
      .range(at, at + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  // thumbs down / marked wrong, by message (feedback is given after the message, so the window covers it)
  const fb = await supabase.from("chat_feedback").select("call_id, rating, wrong").gte("created_at", from).limit(10_000);
  const rated = new Map<number, { down: boolean; wrong: boolean }>();
  for (const f of (fb.error ? [] : fb.data ?? []) as { call_id: number; rating: number; wrong: boolean }[]) rated.set(f.call_id, { down: f.rating < 0, wrong: !!f.wrong });

  const by = new Map<string, Conv>();
  for (const r of rows) {
    // answered messages only (ok and off-topic), as the page's message counts
    if (!r.chat || (r.status !== "ok" && r.status !== "off_topic")) continue;
    const c = by.get(r.chat) ?? { chat: r.chat, user: r.user_id, email: null, messages: 0, first: r.created_at, last: r.created_at, fast: 0, own: 0, mode: "main", cost: 0, tokens: 0, offTopic: 0, down: 0, wrong: 0 };
    c.messages++;
    c.last = r.created_at;
    c.cost += Number(r.cost_usd) || 0;
    c.tokens += (Number(r.input_tokens) || 0) + (Number(r.output_tokens) || 0);
    if (r.byok) c.own++;
    else if (/haiku/.test(r.model)) c.fast++;
    if (r.status === "off_topic") c.offTopic++;
    const f = rated.get(r.id);
    if (f?.down) c.down++;
    if (f?.wrong) c.wrong++;
    by.set(r.chat, c);
  }
  for (const c of by.values()) c.mode = c.own ? "own" : c.fast ? "fast" : "main";
  const v: Window = { convs: [...by.values()], feedback: !fb.error, partial: rows.length >= MAX_ROWS };
  cache.set(w.key, { at: Date.now(), v });
  if (cache.size > 50) cache.clear();
  return v;
}

const SORT_KEY: Record<string, (c: Conv) => number | string> = { messages: (c) => c.messages, cost: (c) => c.cost, tokens: (c) => c.tokens };

export async function conversations(q: ConvQuery) {
  const w = await load(q.window);
  let list = w.convs.filter(
    (c) =>
      (!q.user || c.user === q.user) &&
      (!q.mode || c.mode === q.mode) &&
      (!q.outcome || (q.outcome === "off_topic" ? c.offTopic > 0 : q.outcome === "down" ? c.down > 0 : c.wrong > 0)),
  );
  if (q.sort === "new") list = list.sort((a, b) => b.last.localeCompare(a.last));
  else if (q.sort === "old") list = list.sort((a, b) => a.first.localeCompare(b.first));
  else {
    const [k, dir] = q.sort.split(".");
    const get = SORT_KEY[k];
    list = list.sort((a, b) => ((get(a) as number) - (get(b) as number)) * (dir === "asc" ? 1 : -1) || b.last.localeCompare(a.last));
  }
  const page = list.slice((q.page - 1) * CONV_PAGE, q.page * CONV_PAGE);
  // the learner filter's choices: everyone with a conversation in the window
  const counts = new Map<string, number>();
  for (const c of w.convs) if (c.user) counts.set(c.user, (counts.get(c.user) ?? 0) + 1);
  const [emails, users] = await Promise.all([emailsFor(page.map((c) => c.user).filter((u): u is string => !!u)), withEmails(counts)]);
  return {
    rows: page.map((c) => ({ ...c, email: c.user ? emails.get(c.user) ?? null : null })),
    total: list.length,
    page: q.page,
    pageSize: CONV_PAGE,
    users,
    /** chat_feedback exists: the thumbs-down and marked-wrong filters work */
    feedback: w.feedback,
    partial: w.partial,
  };
}
