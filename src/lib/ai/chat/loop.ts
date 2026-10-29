/**
 * The course chat's tool-use loop over the Anthropic Messages API, streamed. Raw fetch, like
 * src/lib/ai/client.ts (the project has no SDK dependency): each round streams (SSE); text deltas go to the
 * page as they arrive; a round that stops with stop_reason "tool_use" runs its tools (in parallel), sends every
 * tool_result back in one user message with the assistant turn passed back unchanged (thinking blocks
 * included), and goes again. After `maxToolRounds` tool rounds the next round may not call tools (tool_choice
 * "none"), so every message ends with an answer. One deadline bounds the whole message.
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

export type LoopResult = {
  text: string;
  stop: string;
  rounds: number;
  toolCalls: { name: string; input: unknown }[];
  usage: Required<Usage>;
  costUsd: number;
  error: string | null;
  /** the API's request id of the last round (for the admin log) */
  requestId: string | null;
};

export type LoopOpts = {
  apiKey: string;
  model: string;
  system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[];
  tools: readonly unknown[];
  messages: ApiMessage[];
  maxTokens: number;
  /** null: leave thinking to the model's default */
  thinking: Record<string, unknown> | null;
  maxToolRounds: number;
  deadline: number;
  signal?: AbortSignal;
  runTool: (name: string, input: unknown) => Promise<string>;
  onRound?: (n: number) => void;
  onText?: (delta: string) => void;
  onTool?: (name: string, input: unknown) => void;
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

/** One streamed round: the content blocks, the stop reason and the usage. */
async function round(o: LoopOpts, messages: ApiMessage[], toolsAllowed: boolean, onText?: (d: string) => void) {
  const left = o.deadline - Date.now();
  if (left < 1500) throw new Error("timeout");
  const signals = [AbortSignal.timeout(left)];
  if (o.signal) signals.push(o.signal);
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: o.model,
      max_tokens: o.maxTokens,
      stream: true,
      system: o.system,
      // no tools at all (a mock interviewer turn, a scorecard): a plain streamed answer
      ...(o.tools.length ? { tools: o.tools, tool_choice: toolsAllowed ? { type: "auto" } : { type: "none" } } : {}),
      ...(o.thinking ? { thinking: o.thinking } : {}),
      messages: withCacheMark(messages),
    }),
    signal: AbortSignal.any(signals),
  });
  const requestId = res.headers.get("request-id");
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw Object.assign(new Error(body?.error?.message?.slice(0, 300) || `HTTP ${res.status}`), { status: res.status, requestId });
  }
  const blocks: Block[] = [];
  const usage: Required<Usage> = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let stop = "";
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
        if (b.type === "tool_use") blocks[i] = { type: "tool_use", id: b.id, name: b.name, input: {}, _json: "" };
        else if (b.type === "text") blocks[i] = { type: "text", text: b.text ?? "" };
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
          if (d.text) onText?.(d.text);
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
  return { blocks: blocks.filter(Boolean), stop, usage, requestId };
}

export async function runLoop(o: LoopOpts): Promise<LoopResult> {
  const messages = [...o.messages];
  const total: Required<Usage> = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let cost = 0;
  const toolCalls: LoopResult["toolCalls"] = [];
  let text = "";
  let stop = "";
  let requestId: string | null = null;
  let n = 0;
  try {
    for (;;) {
      n++;
      o.onRound?.(n);
      const toolsAllowed = n <= o.maxToolRounds;
      const r = await round(o, messages, toolsAllowed, o.onText);
      requestId = r.requestId ?? requestId;
      cost += costOf(o.model, r.usage);
      for (const k of Object.keys(total) as (keyof Usage)[]) total[k] += r.usage[k] ?? 0;
      stop = r.stop;
      text = r.blocks
        .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");
      const uses = r.blocks.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
      if (stop !== "tool_use" || !uses.length) break;
      // the assistant turn goes back unchanged (thinking blocks with their signatures), minus empty text blocks
      messages.push({ role: "assistant", content: r.blocks.filter((b) => !(b.type === "text" && !b.text)) });
      const results = await Promise.all(
        uses.map(async (u) => {
          toolCalls.push({ name: u.name, input: u.input });
          o.onTool?.(u.name, u.input);
          let out: string;
          let isError = false;
          try {
            out = (u.input as { _invalid?: boolean })._invalid ? "The tool input wasn't valid JSON. Try again." : await o.runTool(u.name, u.input);
          } catch (e) {
            out = `The tool failed: ${(e as Error).message.slice(0, 200)}`;
            isError = true;
          }
          return { type: "tool_result", tool_use_id: u.id, content: out.slice(0, 12000), ...(isError ? { is_error: true } : {}) };
        }),
      );
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" || (e as Error).message === "timeout" ? "timeout" : (e as Error).message;
    return { text, stop, rounds: n, toolCalls, usage: total, costUsd: cost, error: msg || "error", requestId };
  }
  if (stop === "max_tokens") text = trimCutOff(text);
  if (stop === "refusal") text = "";
  return { text, stop, rounds: n, toolCalls, usage: total, costUsd: cost, error: null, requestId };
}
