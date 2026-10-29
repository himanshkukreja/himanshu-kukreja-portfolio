/**
 * The course chat's tool-use loop over the Anthropic Messages API, streamed. Raw fetch, like
 * src/lib/ai/client.ts (the project has no SDK dependency): each round streams (SSE); text deltas go to the
 * page as they arrive; a round that stops with stop_reason "tool_use" runs its tools (in parallel), sends every
 * tool_result back in one user message with the assistant turn passed back unchanged (thinking blocks
 * included), and goes again. After `maxToolRounds` tool rounds the next round may not call tools (tool_choice
 * "none"), so every message ends with an answer. One deadline bounds the whole message.
 *
 * What the learner sees is exactly what the answer is: text from every round is kept (joined by a blank line),
 * and `text` in the result is the text that was streamed, never only the last round's. A round that may still
 * call tools holds its first words back (HOLD_CHARS) until it is clear they are an answer: when a tool call
 * follows a short preamble ("I'll check the course…", or a note to itself), the preamble is dropped before it
 * was ever shown. Longer text before a tool call (a grade, then the next question) is the answer and stays.
 *
 * Metering is the caller's: this returns the summed usage and cost of every round.
 */
import { costOf, type Usage } from "@/lib/ai/prices";

const API = "https://api.anthropic.com/v1/messages";

type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "redacted_thinking"; data: string }
  | { type: "tool_use"; id: string; name: string; input: unknown; _json?: string };
export type ApiMessage = { role: "user" | "assistant"; content: string | unknown[] };

/** One round's timing (ms from the loop's start): when it began, its first streamed byte, its first token, its end. */
export type RoundTiming = {
  start: number;
  ttfb: number;
  first: number | null;
  end: number;
  stop: string;
  tools: { name: string; ms: number }[];
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
  dropped: number;
};

export type LoopResult = {
  /** the answer as the learner saw it stream: every round's kept text */
  text: string;
  stop: string;
  rounds: number;
  toolCalls: { name: string; input: unknown }[];
  usage: Required<Usage>;
  costUsd: number;
  error: string | null;
  /** the API's request id of the last round (for the admin log) */
  requestId: string | null;
  /** a refusal's category (stop_details.category), when the model declined */
  refusal: string | null;
  timing: RoundTiming[];
  /** ms from the loop's start to the first text the learner saw (null: none) */
  ttft: number | null;
};

/**
 * A round that may still call tools streams nothing until it has written this much without calling one. The fast
 * model (Haiku 5.5) gets more: it sometimes drafts a whole short reply, then calls a tool and writes it again.
 */
export const HOLD_CHARS = 200;
export const holdFor = (model: string) => (/haiku/.test(model) ? 700 : HOLD_CHARS);
const RETRY_STATUS = [429, 500, 502, 503, 529];
const RETRIES = 2;

export type LoopOpts = {
  apiKey: string;
  model: string;
  system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[];
  tools: readonly unknown[];
  messages: ApiMessage[];
  maxTokens: number;
  /** null: leave thinking to the model's default */
  thinking: Record<string, unknown> | null;
  /** output_config.effort (omitted: the model's default) */
  effort?: "low" | "medium" | "high";
  maxToolRounds: number;
  deadline: number;
  signal?: AbortSignal;
  runTool: (name: string, input: unknown) => Promise<string>;
  onRound?: (n: number) => void;
  onText?: (delta: string) => void;
  onTool?: (name: string, input: unknown) => void;
  /** after a round's tools ran: text that ends the message there (no model round to introduce it), or null */
  finish?: (ran: { name: string; input: unknown }[]) => string | null;
};

/** An answer that hit max_tokens: up to its last complete sentence. */
function trimCutOff(text: string): string {
  const t = text.trimEnd();
  const m = t.match(/^[\s\S]*[.!?)\]`](?=\s|$)/);
  return m && m[0].length > t.length * 0.4 ? m[0] : `${t}…`;
}

/**
 * The messages with a cache breakpoint on the last block, so the next round of the same message (after its
 * tool results) reads the conversation so far from the cache instead of paying for it again.
 */
function withCacheMark(messages: ApiMessage[]): ApiMessage[] {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  const blocks = typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...(last.content as Record<string, unknown>[])];
  if (!blocks.length) return messages;
  blocks[blocks.length - 1] = { ...(blocks[blocks.length - 1] as Record<string, unknown>), cache_control: { type: "ephemeral" } };
  return [...messages.slice(0, -1), { role: last.role, content: blocks }];
}

/**
 * One streamed round: the content blocks, the stop reason and the usage. Text goes to `out` as it comes when
 * this round can't call tools; otherwise it is held until HOLD_CHARS are written (then it streams), and dropped
 * if a tool call starts first. `kept` is the text that went out.
 */
async function round(o: LoopOpts, messages: ApiMessage[], toolsAllowed: boolean, out: (d: string) => void, t: Omit<RoundTiming, "end" | "stop">, t0: number) {
  const left = o.deadline - Date.now();
  if (left < 1500) throw new Error("timeout");
  const signals = [AbortSignal.timeout(left)];
  if (o.signal) signals.push(o.signal);
  const body = JSON.stringify({
    model: o.model,
    max_tokens: o.maxTokens,
    stream: true,
    system: o.system,
    // no tools at all (a mock interviewer turn, a scorecard): a plain streamed answer
    ...(o.tools.length ? { tools: o.tools, tool_choice: toolsAllowed ? { type: "auto" } : { type: "none" } } : {}),
    ...(o.thinking ? { thinking: o.thinking } : {}),
    ...(o.effort ? { output_config: { effort: o.effort } } : {}),
    messages: withCacheMark(messages),
  });
  // overloaded (529), rate-limited or a server error before any byte: try again twice, briefly, while there's
  // time (the official SDKs do the same); nothing has streamed yet, so a retry is invisible to the learner
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(API, { method: "POST", headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": "2023-06-01" }, body, signal: AbortSignal.any(signals) });
    if (res.ok || attempt >= RETRIES || !RETRY_STATUS.includes(res.status) || o.deadline - Date.now() < 8000) break;
    await res.body?.cancel().catch(() => {});
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
  const requestId = res.headers.get("request-id");
  t.ttfb = Date.now() - t0;
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw Object.assign(new Error(body?.error?.message?.slice(0, 300) || `HTTP ${res.status}`), { status: res.status, requestId });
  }
  const blocks: Block[] = [];
  const usage: Required<Usage> = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let stop = "";
  let refusal: string | null = null;
  // hold-back: nothing is shown until this round has clearly started an answer
  const canCallTools = toolsAllowed && o.tools.length > 0;
  let held = "";
  let open = !canCallTools;
  let kept = "";
  const say = (d: string) => {
    if (!d) return;
    if (t.first === null) t.first = Date.now() - t0;
    kept += d;
    out(d);
  };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const handle = (data: string) => {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(data);
    } catch {
      return;
    }
    switch (e.type) {
      case "message_start": {
        const u = ((e.message as { usage?: Usage } | undefined)?.usage ?? {}) as Usage;
        usage.input_tokens = u.input_tokens ?? 0;
        usage.cache_read_input_tokens = u.cache_read_input_tokens ?? 0;
        usage.cache_creation_input_tokens = u.cache_creation_input_tokens ?? 0;
        usage.output_tokens = u.output_tokens ?? 0;
        break;
      }
      case "content_block_start": {
        const b = e.content_block as Block;
        const i = Number(e.index);
        if (b.type === "tool_use") {
          blocks[i] = { type: "tool_use", id: b.id, name: b.name, input: {}, _json: "" };
          // a preamble before a tool call is never shown
          if (!open && held) {
            t.dropped += held.length;
            held = "";
          }
        } else if (b.type === "text") blocks[i] = { type: "text", text: b.text ?? "" };
        else if (b.type === "thinking") blocks[i] = { type: "thinking", thinking: b.thinking ?? "", signature: b.signature ?? "" };
        else blocks[i] = b;
        break;
      }
      case "content_block_delta": {
        const i = Number(e.index);
        const d = e.delta as { type: string; text?: string; partial_json?: string; thinking?: string; signature?: string };
        const b = blocks[i];
        if (!b) break;
        if (d.type === "text_delta" && b.type === "text") {
          b.text += d.text ?? "";
          if (!d.text) break;
          if (open) say(d.text);
          else {
            held += d.text;
            if (held.trim().length >= holdFor(o.model)) {
              open = true;
              say(held);
              held = "";
            }
          }
        } else if (d.type === "input_json_delta" && b.type === "tool_use") b._json = (b._json ?? "") + (d.partial_json ?? "");
        else if (d.type === "thinking_delta" && b.type === "thinking") b.thinking += d.thinking ?? "";
        else if (d.type === "signature_delta" && b.type === "thinking") b.signature = (b.signature ?? "") + (d.signature ?? "");
        break;
      }
      case "content_block_stop": {
        const b = blocks[Number(e.index)];
        if (b?.type === "tool_use") {
          try {
            b.input = b._json ? JSON.parse(b._json) : {};
          } catch {
            b.input = { _invalid: true };
          }
          delete b._json;
        }
        break;
      }
      case "message_delta": {
        stop = ((e.delta as { stop_reason?: string } | undefined)?.stop_reason ?? stop) || stop;
        const sd = (e.delta as { stop_details?: { category?: string | null } | null } | undefined)?.stop_details;
        if (sd) refusal = sd.category || "unspecified";
        const u = (e.usage ?? {}) as Usage;
        if (u.output_tokens !== undefined) usage.output_tokens = u.output_tokens;
        if (u.input_tokens) usage.input_tokens = u.input_tokens;
        if (u.cache_read_input_tokens) usage.cache_read_input_tokens = u.cache_read_input_tokens;
        if (u.cache_creation_input_tokens) usage.cache_creation_input_tokens = u.cache_creation_input_tokens;
        break;
      }
      case "error": {
        const err = e.error as { message?: string } | undefined;
        throw new Error(err?.message?.slice(0, 300) || "stream error");
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) handle(data);
    }
  }
  // the round answered without a tool: what was held is the answer
  const calledTool = blocks.some((b) => b?.type === "tool_use");
  if (held && !calledTool) say(held);
  else if (held) t.dropped += held.length;
  return { blocks: blocks.filter(Boolean), stop, usage, requestId, kept, refusal };
}

export async function runLoop(o: LoopOpts): Promise<LoopResult> {
  const t0 = Date.now();
  const messages = [...o.messages];
  const total: Required<Usage> = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let cost = 0;
  const toolCalls: LoopResult["toolCalls"] = [];
  // every round's kept text, as streamed (rounds after the first start on a new paragraph)
  let text = "";
  let roundText = "";
  const out = (d: string) => {
    if (!roundText && text.trim()) {
      const sep = text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
      text += sep;
      if (sep) o.onText?.(sep);
    }
    roundText += d;
    text += d;
    o.onText?.(d);
  };
  let stop = "";
  let requestId: string | null = null;
  let refusal: string | null = null;
  const timing: RoundTiming[] = [];
  let ttft: number | null = null;
  let n = 0;
  const done = (error: string | null): LoopResult => {
    for (const r of timing) if (r.first !== null && ttft === null) ttft = r.first;
    let t = text;
    if (!error && stop === "max_tokens") t = trimCutOff(t);
    if (!error && stop === "refusal") t = "";
    return { text: t, stop, rounds: n, toolCalls, usage: total, costUsd: cost, error, requestId, refusal, timing, ttft };
  };
  try {
    for (;;) {
      n++;
      o.onRound?.(n);
      const toolsAllowed = n <= o.maxToolRounds;
      roundText = "";
      const t: RoundTiming = { start: Date.now() - t0, ttfb: 0, first: null, end: 0, stop: "", tools: [], cacheRead: 0, cacheWrite: 0, input: 0, output: 0, dropped: 0 };
      timing.push(t);
      const r = await round(o, messages, toolsAllowed, out, t, t0);
      t.end = Date.now() - t0;
      t.stop = r.stop;
      t.cacheRead = r.usage.cache_read_input_tokens;
      t.cacheWrite = r.usage.cache_creation_input_tokens;
      t.input = r.usage.input_tokens;
      t.output = r.usage.output_tokens;
      requestId = r.requestId ?? requestId;
      if (r.stop === "refusal") refusal = r.refusal ?? "unspecified";
      cost += costOf(o.model, r.usage);
      for (const k of Object.keys(total) as (keyof Usage)[]) total[k] += r.usage[k] ?? 0;
      stop = r.stop;
      const uses = r.blocks.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
      if (stop !== "tool_use" || !uses.length) break;
      // the assistant turn goes back unchanged (thinking blocks with their signatures), minus empty text blocks
      messages.push({ role: "assistant", content: r.blocks.filter((b) => !(b.type === "text" && !b.text)) });
      const results = await Promise.all(
        uses.map(async (u) => {
          toolCalls.push({ name: u.name, input: u.input });
          o.onTool?.(u.name, u.input);
          const ts = Date.now();
          let out: string;
          let isError = false;
          try {
            out = (u.input as { _invalid?: boolean })._invalid ? "The tool input wasn't valid JSON. Try again." : await o.runTool(u.name, u.input);
          } catch (e) {
            out = `The tool failed: ${(e as Error).message.slice(0, 200)}`;
            isError = true;
          }
          t.tools.push({ name: u.name, ms: Date.now() - ts });
          return { type: "tool_result", tool_use_id: u.id, content: out.slice(0, 12000), ...(isError ? { is_error: true } : {}) };
        }),
      );
      messages.push({ role: "user", content: results });
      const closing = o.finish?.(uses.map((u) => ({ name: u.name, input: u.input })));
      if (closing) {
        out(closing);
        stop = "end_turn";
        break;
      }
    }
  } catch (e) {
    // the learner stopped it, closed or reloaded the page: not a model failure
    const msg = o.signal?.aborted ? "aborted by the page" : (e as Error).name === "TimeoutError" || (e as Error).message === "timeout" ? "timeout" : (e as Error).message;
    return done(msg || "error");
  }
  return done(null);
}
