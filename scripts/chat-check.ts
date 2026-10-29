/**
 * Course chat guarantees that don't need a model, checked in a second: npx tsx scripts/chat-check.ts
 * - answers keep only refs the tools returned, and lose every URL, markdown link, HTML tag, private plan line
 *   and the off-topic marker; a half-written ref doesn't flash while streaming;
 * - stored memory never keeps an email, a phone number or a link, and stays within its caps;
 * - every site-guide link points at a page that exists;
 * - a bad request body is refused, and old turns are trimmed to a summary;
 * - the tool loop (against a scripted SSE stream, no network): text never disappears. A short preamble before a
 *   tool call is never streamed, text from every round is kept in order, a long answer before a tool call stays,
 *   the streamed text is exactly the final text, and a stream that dies mid-answer keeps what was written;
 * - the local QA seam (lib/ai/chat/dev.ts) does nothing outside `next dev`.
 */
import fs from "fs";
import path from "path";
import { cleanAnswer, citedRefs, splitCitations, streamingText } from "../src/lib/ai/chat/text";
import { cleanMemory, mergeMemory, MEMORY_LIMITS } from "../src/lib/ai/chat/memory-model";
import { SITE_GUIDE, findGuide } from "../src/lib/ai/chat/siteGuide";
import { HOLD_CHARS, runLoop } from "../src/lib/ai/chat/loop";
import { chatDevLearner, chatDevPreview } from "../src/lib/ai/chat/dev";
import { DECLINE_TEXT, runChatCore } from "../src/lib/ai/chat/core";
import type { ChatDeps } from "../src/lib/ai/chat/tools";

let fails = 0;
const ok = (cond: unknown, what: string) => {
  if (!cond) {
    fails++;
    console.log(`FAIL ${what}`);
  }
};
const known = (r: string) => ["s1", "s2", "s7"].includes(r);

const a = cleanAnswer("<plan>x</plan>Use jitter [[s1]] and coalescing [[s9, s2]]. See [the lesson](https://evil.example/x) or www.evil.com now. <script>alert(1)</script>::: panel", known);
ok(!/https?:|www\.|evil|<script/.test(a), "links and HTML tags stripped");
ok(!/:::/.test(cleanAnswer("Text\n::: panel\nmore", known)), "block syntax lines stripped");
ok(a.includes("[[s1]]") && a.includes("[[s2]]") && !a.includes("s9"), "unknown refs dropped, known kept");
ok(a.startsWith("Use jitter"), "private plan stripped");
ok(!cleanAnswer("[[off_topic]] I can only help with system design.", known).includes("off_topic"), "off-topic marker stripped");
ok(cleanAnswer("Map<String, Integer> stays", known).includes("Map<String, Integer>"), "generics in text survive");
ok(JSON.stringify(citedRefs("a [[s2]] b [[s1, s2]]")) === '["s2","s1"]', "cited refs in first-cited order");
ok(splitCitations("x [[s1]] y").length === 3, "citations split from text");
ok(!streamingText("Partly [[s", known).includes("[["), "half-written ref held back while streaming");
ok(cleanAnswer("Finish the lesson first (s1). Then revise (s1, s7); see (s9).", known) === "Finish the lesson first [[s1]]. Then revise [[s1, s7]]; see (s9).", "(s1) written instead of [[s1]] becomes a citation (known refs only)");

const m = cleanMemory({ goals: ["Interview at Flipkart, mail me at a.b@example.com or +91 98765 43210", "x".repeat(500)], studied: Array.from({ length: 40 }, (_, i) => `topic ${i}`), sessions: [{ at: "2026-10-27", chat: "abc123", summary: "see https://x.y/z" }] });
ok(!/@|98765|https?:/.test(JSON.stringify(m)), "memory scrubs emails, phones and links");
ok(m.goals.every((g) => g.length <= MEMORY_LIMITS.item) && m.studied.length <= MEMORY_LIMITS.studied, "memory stays within its caps");
const merged = mergeMemory(m, { session: "Worked on caching", studied: ["caching"] }, "abc123", new Date("2026-10-29"));
ok(merged.sessions[0].summary === "Worked on caching" && merged.sessions.filter((s) => s.chat === "abc123").length === 1, "a chat's summary replaces its own earlier one");

const app = path.resolve("src/app");
for (const t of SITE_GUIDE) {
  const p = t.href.split("#")[0];
  const exists = fs.existsSync(path.join(app, p, "page.tsx"));
  ok(exists, `site guide link ${t.href} has a page`);
}
ok(findGuide("how do certificates work")[0]?.id === "certificates", "site guide finds certificates");
ok(findGuide("save lessons offline")[0]?.id === "offline", "site guide finds offline");

// ---------------------------------------------------------------- the local QA seam is dev-only
{
  const env = process.env as Record<string, string | undefined>;
  const was = env.NODE_ENV;
  const req = new Request("http://localhost/api/learn/ai/chat", { headers: { "x-smart-preview": "1", "x-chat-dev-user": "00000000-0000-4000-8000-000000000001" } });
  env.NODE_ENV = "production";
  ok(!chatDevPreview(req) && chatDevLearner(req) === null, "QA seam: the preview header and stand-in learner do nothing in production");
  env.NODE_ENV = "test";
  ok(!chatDevPreview(req) && chatDevLearner(req) === null, "QA seam: nothing outside next dev");
  env.NODE_ENV = "development";
  ok(chatDevLearner(req)?.id === "00000000-0000-4000-8000-000000000001", "QA seam: works under next dev");
  ok(chatDevLearner(new Request("http://localhost/", { headers: { "x-smart-preview": "1", "x-chat-dev-user": "8c1f0d1e-1111-4222-8333-123456789abc" } })) === null, "QA seam: only the fixed fake ids, never a real account's");
  env.NODE_ENV = was;
  const route = fs.readFileSync(path.resolve("src/app/api/learn/ai/chat/route.ts"), "utf8");
  ok(/chatDevLearner\(request\)/.test(route) && !/x-chat-dev-user/.test(route), "QA seam: the route reads the stand-in learner only through lib/ai/chat/dev.ts");
}

// ---------------------------------------------------------------- the loop never makes text disappear
type Ev = Record<string, unknown>;
const sse = (events: Ev[], opts: { failAfter?: number } = {}) => {
  const enc = new TextEncoder();
  let i = 0;
  return new Response(
    new ReadableStream({
      pull(c) {
        if (opts.failAfter !== undefined && i >= opts.failAfter) return c.error(new Error("network down"));
        if (i >= events.length) return c.close();
        c.enqueue(enc.encode(`event: x\ndata: ${JSON.stringify(events[i++])}\n\n`));
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
};
const textBlock = (i: number, parts: string[]): Ev[] => [{ type: "content_block_start", index: i, content_block: { type: "text", text: "" } }, ...parts.map((t) => ({ type: "content_block_delta", index: i, delta: { type: "text_delta", text: t } })), { type: "content_block_stop", index: i }];
const toolBlock = (i: number, name: string, input: unknown): Ev[] => [
  { type: "content_block_start", index: i, content_block: { type: "tool_use", id: `tu${i}${name}`, name, input: {} } },
  { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } },
  { type: "content_block_stop", index: i },
];
const msg = (blocks: Ev[], stop: string): Ev[] => [{ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } }, ...blocks, { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 20 } }, { type: "message_stop" }];

async function loopCase(rounds: { events?: Ev[]; failAfter?: number; status?: number }[], maxToolRounds = 4, opts: { deadline?: number; runTool?: (name: string) => Promise<string>; model?: string } = {}) {
  const realFetch = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (async () => {
    const r = rounds[n++];
    if (r.status) return new Response(JSON.stringify({ error: { message: "Overloaded" } }), { status: r.status });
    return sse(r.events ?? [], { failAfter: r.failAfter });
  }) as typeof fetch;
  const streamed: string[] = [];
  try {
    const r = await runLoop({ apiKey: "k", model: opts.model ?? "claude-sonnet-5-5", system: [], tools: [{ name: "t" }], messages: [{ role: "user", content: "x" }], maxTokens: 100, thinking: null, maxToolRounds, deadline: Date.now() + (opts.deadline ?? 20_000), runTool: opts.runTool ?? (async () => "ok"), onText: (d) => streamed.push(d) });
    return { r, streamed: streamed.join(""), calls: n };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const longGrade = `Right. ${"The content hash gives every release a new URL, so caches miss once and never serve the old file. ".repeat(3)}`;
void (async () => {
  // the owner's bug: a quiz answer graded with a preamble, then a tool round, then the answer
  const a = await loopCase([
    { events: msg([...textBlock(0, ["I'll grade your ", "answer against the course."]), ...toolBlock(1, "check_answer", { qref: "q1", answer: "C" })], "tool_use") },
    { events: msg(textBlock(0, ["Right. Option C ", "is correct [[s1]]."]), "end_turn") },
  ]);
  ok(!a.streamed.includes("I'll grade"), "loop: a short preamble before a tool call is never streamed");
  ok(a.r.text === a.streamed && a.r.text === "Right. Option C is correct [[s1]].", "loop: the final text is exactly what streamed");

  // a grade (long), then the next question it was asked for, then its intro: both stay, in order
  const b = await loopCase([
    { events: msg([...textBlock(0, [longGrade.slice(0, 120), longGrade.slice(120)]), ...toolBlock(1, "get_practice", { topic: "caching" })], "tool_use") },
    { events: msg(textBlock(0, ["Here's the next one."]), "end_turn") },
  ]);
  ok(b.r.text.startsWith("Right.") && b.r.text.endsWith("Here's the next one.") && b.r.text.includes("\n\n"), "loop: text from every round is kept, in order, a paragraph apart");
  ok(b.r.text === b.streamed, "loop: what streamed is what is kept (nothing replaced at the end)");
  ok(longGrade.trim().length >= HOLD_CHARS, "loop: the long-grade case is past the hold");
  // the fast model's draft-then-tool habit: a 400-character draft before a tool call is never shown on Haiku
  const hk = await loopCase([{ events: msg([...textBlock(0, [longGrade, "Let me look that up."]), ...toolBlock(1, "search_course", { query: "x" })], "tool_use") }, { events: msg(textBlock(0, ["The answer."]), "end_turn") }], 4, { model: "claude-haiku-5-5" });
  ok(hk.r.text === "The answer." && hk.streamed === "The answer.", "loop: Haiku's draft before a tool call is dropped unseen");

  // a short answer with no tool call is still shown (the held text is flushed at the end of the round)
  const c = await loopCase([{ events: msg(textBlock(0, ["Hi! Ask me about system design."]), "end_turn") }]);
  ok(c.r.text === "Hi! Ask me about system design." && c.streamed === c.r.text, "loop: a short answer without tools is shown");

  // the forced last round (no tools allowed) streams at once
  const d = await loopCase([{ events: msg(toolBlock(0, "search_course", { query: "x" }), "tool_use") }, { events: msg(textBlock(0, ["Short."]), "end_turn") }], 1);
  ok(d.r.text === "Short." && d.r.timing[1].first !== null, "loop: the answer-only round streams");

  // the stream dies mid-answer: what was written is kept and reported with the error
  const e = await loopCase([{ events: msg(textBlock(0, [longGrade, "and more"]), "end_turn"), failAfter: 6 }]);
  ok(!!e.r.error && e.r.text.length > 0 && e.r.text === e.streamed, "loop: an error mid-answer keeps the text that was shown");

  // overloaded (529) before any byte: retried, invisible to the learner
  const f = await loopCase([{ status: 529 }, { events: msg(textBlock(0, ["Fine after a retry."]), "end_turn") }]);
  ok(!f.r.error && f.r.text === "Fine after a retry." && f.calls === 2, "loop: a 529 is retried once and the answer comes through");
  const g = await loopCase([{ status: 529 }, { status: 529 }, { status: 529 }]);
  ok(g.r.error === "Overloaded" && g.calls === 3, "loop: a 529 that persists gives up after two retries with an error");
  // a tool that throws: an is_error result goes back and the model answers anyway
  const h = await loopCase([{ events: msg(toolBlock(0, "search_course", { query: "x" }), "tool_use") }, { events: msg(textBlock(0, ["Answered without it."]), "end_turn") }], 4, {
    runTool: async () => {
      throw new Error("index down");
    },
  });
  ok(!h.r.error && h.r.text === "Answered without it.", "loop: a failing tool doesn't fail the message");
  // the deadline: a round that can't start in time ends with "timeout" (the route says so; the text so far stays)
  const i = await loopCase([{ events: msg(textBlock(0, ["x"]), "end_turn") }], 4, { deadline: 1000 });
  ok(i.r.error === "timeout", "loop: past the deadline it stops with a timeout");

  // a decline before any text: the fast model answers instead; if it declines too, a polite line (never an error)
  const refusal: Ev[] = [{ type: "message_start", message: { usage: { input_tokens: 5, output_tokens: 0 } } }, { type: "message_delta", delta: { stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms" } }, usage: { output_tokens: 0 } }];
  const deps = { engine: {}, live: () => true, courseMap: async () => null, lessonMarkdown: async () => null, storyBody: async () => null, drills: async () => null, questionBank: async () => [], progress: async () => null, savedPaths: async () => null, page: null, mock: async () => null, design: async () => null, dueReviews: async () => null, studyPlan: async () => null } as unknown as ChatDeps;
  const core = async (answers: Ev[][]) => {
    const realFetch = globalThis.fetch;
    const models: string[] = [];
    let n = 0;
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      models.push(JSON.parse(String(init?.body)).model);
      return sse(answers[n++] ?? refusal);
    }) as typeof fetch;
    try {
      const r = await runChatCore({ deps, req: { chat: "checkchat1", messages: [{ role: "user", text: "Review my design please" }] }, model: "claude-sonnet-5-5", apiKey: "k", map: "", memory: null, emit: () => {}, deadline: Date.now() + 30_000, prefetch: false });
      return { r, models };
    } finally {
      globalThis.fetch = realFetch;
    }
  };
  const fb = await core([refusal, msg(textBlock(0, ["Here is the review."]), "end_turn")]);
  ok(fb.r.text === "Here is the review." && fb.r.fellBack === "claude-haiku-5-5" && fb.models[1] === "claude-haiku-5-5" && fb.r.loop.refusal === "general_harms", "decline before any text: the fast model answers instead");
  const both = await core([refusal, refusal]);
  ok(both.r.text === DECLINE_TEXT && !both.r.loop.error, "both models decline: a polite line, not an error");
})()
  .catch((err) => ok(false, `loop checks threw: ${(err as Error).message}`))
  .finally(() => {
    console.log(fails ? `${fails} check(s) failed` : "chat checks: all passed");
    process.exit(fails ? 1 : 0);
  });
