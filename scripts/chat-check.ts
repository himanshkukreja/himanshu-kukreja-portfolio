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
import { cleanAnswer, citedRefs, followupFilter, splitCitations, splitFollowups, streamingText, toolStatus, trailOf } from "../src/lib/ai/chat/text";
import { PASS_CHARS, paceStep, revealMs, safeCut, startPace, visibleText } from "../src/lib/ai/chat/reveal";
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

// ---------------------------------------------------------------- streaming: nothing shows, then changes or disappears
{
  const full = "<plan>covers: x | move: PROBE</plan>Use a **write-through** cache [[s1]] (see [the lesson](https://x.example/a) or https://evil.example/b), then `TTL` jitter (s2) and <b>coalescing</b>.\n\n- one\n- two";
  let prev = "";
  let grew = true;
  let maxLen = 0;
  for (let i = 1; i <= full.length; i++) {
    const t = streamingText(full.slice(0, i), known);
    // what shows is always the start of what shows next (allowing cleanAnswer's trimmed spaces)
    if (!t.startsWith(prev.trimEnd())) grew = false;
    if (t.length < maxLen - 1) grew = false;
    maxLen = Math.max(maxLen, t.length);
    prev = t;
  }
  ok(grew, "streaming text only grows, through a plan, a link, a URL, a ref and a tag");
  ok(streamingText(full, known) === cleanAnswer(full, known), "the streamed text ends exactly as the final text");
  ok(streamingText("<plan>still thinking about", known) === "", "an open private plan shows nothing");
}

// ---------------------------------------------------------------- the reveal (typewriter buffer)
{
  const md = "Caching in **three** moves [[s1]]:\n\n1. Put a `cache` in front.\n2. Add *jitter* to TTLs.\n\n```ts\nconst x = 1;\n```\n\n| a | b |\n| - | - |\n\nDone. ".repeat(4);
  // safeCut: the cut only moves forward, and never shows a half construct
  let last = 0;
  let mono = true;
  let clean = true;
  for (let i = 0; i <= md.length; i++) {
    const v = safeCut(md.slice(0, i));
    if (v.length < last) mono = false;
    last = v.length;
    const line = v.slice(v.lastIndexOf("\n") + 1);
    const inFence = ((v.match(/^```/gm) || []).length % 2) === 1;
    if (!inFence && ((line.match(/\*\*/g) || []).length % 2 === 1 || (line.match(/`/g) || []).length % 2 === 1 || (line.lastIndexOf("[[") > line.lastIndexOf("]]")))) clean = false;
  }
  ok(mono, "reveal: the markdown-safe cut only moves forward");
  ok(clean, "reveal: no half-open **bold**, `code` or [[ref]] on screen");
  ok(visibleText(md, md.length, true) === md, "reveal: the finished text shows whole");
  // pacing: one 900-character piece (Sonnet after a tool round), then done right after
  const big = "word ".repeat(180);
  const run = (text: string, doneAt: number | null, pieces: [number, number][] = [[0, text.length]]) => {
    let p = startPace(0, 0);
    let t = 0;
    let shown = 0;
    let shrank = false;
    while (t < 5000) {
      const len = pieces.filter(([at]) => at <= t).reduce((n, [, l]) => Math.max(n, l), 0);
      p = paceStep(p, text.slice(0, len), t, doneAt !== null && t >= doneAt);
      if (p.n < shown) shrank = true;
      shown = p.n;
      if (p.n >= text.length) return { ms: t, shrank };
      t += 16;
    }
    return { ms: Infinity, shrank };
  };
  const one = run(big, 5);
  ok(one.ms >= 700 && one.ms <= 1500 && !one.shrank, `reveal: 900 characters at once take ~1 s (${one.ms} ms)`);
  const huge = run("word ".repeat(800), 5);
  ok(huge.ms <= 2000 && !huge.shrank, `reveal: 4000 characters still finish within 2 s (${huge.ms} ms)`);
  const small = run("Short streamed bit.", null);
  ok(small.ms <= 20, `reveal: a small delta shows at once (${small.ms} ms)`);
  ok(one.ms <= 1000 + 16, `reveal: once done, the rest shows within 1 s of the text arriving (${one.ms} ms)`);
  const slow = run("word ".repeat(60), 300, [[0, 100], [290, 300]]);
  ok(slow.ms <= 300 + 316, `reveal: done snaps what's left within ~300 ms (${slow.ms} ms)`);
  const two = run(big, 1200, [[0, 450], [1100, 900]]);
  ok(two.ms <= 2400 && !two.shrank, `reveal: two big pieces never shrink and finish soon after the last (${two.ms} ms)`);
  ok(revealMs(PASS_CHARS) === 0, "reveal: a backlog up to PASS_CHARS shows now");
  // the buffer sat idle while the tutor thought (9 s), then the whole answer landed: the first frame shows little of it
  {
    let p = paceStep(startPace(0, 0), "", 0, false);
    p = paceStep(p, big, 9000, false);
    const first = p.n;
    let t = 9000;
    while (p.n < big.length && t < 12000) p = paceStep(p, big, (t += 16), false);
    ok(first < big.length * 0.1 && t - 9000 >= 700 && t - 9000 <= 1300, `reveal: after an idle wait the text still sweeps in (first frame ${first} chars, ${t - 9000} ms)`);
  }
}

// ---------------------------------------------------------------- follow-ups: their own event, never in the text
{
  const ans = 'Consistent hashing moves only a slice of keys [[s1]].\n\n<<followups>>["How do virtual nodes fix hot spots?","What happens when a node leaves?","Quiz me on this","A fourth one"]';
  const f = splitFollowups(ans, "what is consistent hashing");
  ok(f.text === "Consistent hashing moves only a slice of keys [[s1]]." && f.followups.length === 3 && f.followups[0] === "How do virtual nodes fix hot spots?", "follow-ups split off the answer (at most 3)");
  ok(splitFollowups("Plain answer.").followups.length === 0 && splitFollowups("Answer.\n<<followups>> not json at all").followups.length === 0, "no or malformed follow-ups: no cards, no error");
  ok(splitFollowups("A.\n<<followups>>[\"What is **this** [[s2]]?\", \"" + "x".repeat(120) + "\", 7, \"what is consistent hashing?\"]", "What is consistent hashing").followups.join("|") === "What is this?", "follow-ups: plain text, short, not the question just asked");
  ok(!cleanAnswer(ans, known).includes("<<") && !cleanAnswer(ans, known).includes("Quiz me"), "cleanAnswer never keeps the follow-ups line");
  // streamed in odd pieces: the line never reaches the page
  for (const cut of [1, 3, 7, 50, 60, 61, 62, 63, 70]) {
    let out = "";
    const flt = followupFilter((d) => (out += d));
    for (let i = 0; i < ans.length; i += cut) flt.push(ans.slice(i, i + cut));
    flt.flush();
    ok(!out.includes("<") && !out.includes("Quiz me") && out.trim() === f.text, `follow-ups line never streams (pieces of ${cut})`);
  }
  let lt = "";
  const f2 = followupFilter((d) => (lt += d));
  ["a ", "<", " b and x <", "< y"].forEach((d) => f2.push(d));
  f2.flush();
  ok(lt === "a < b and x << y", `a real < or << in text still streams (${JSON.stringify(lt)})`);
  ok(!streamingText("Answer here.\n\n<<follo", known).includes("<"), "a half-written follow-ups mark doesn't flash");
}

// ---------------------------------------------------------------- status lines and the trail
{
  const t = (r: string) => (r === "s4" ? "Caching patterns" : undefined);
  ok(toolStatus("search_course", { query: "cache stampede" }) === "Searching the course for “cache stampede”…", "status names the search");
  ok(toolStatus("get_item", { ref: "S4" }, t) === "Reading “Caching patterns”…", "status names what it reads");
  ok(toolStatus("make_study_plan", { days: 14, goal: "x", steps: [] }) === "Building your 14-day plan…", "status names the plan's length");
  ok(toolStatus("get_week_plan", { week: "W04" }) === "Reading the Week 4 plan…", "status names the week");
  ok(toolStatus("nope", {}) === "Working…" && toolStatus("check_answer", {}) === "Grading your answer…", "status falls back to the tool's line");
  ok(toolStatus("search_course", { query: "x".repeat(200) }).length < 80, "status clips long model words");
  const trail = trailOf([{ tool: "send" }, { tool: "search_course" }, { tool: "think" }, { tool: "get_item", noun: "lesson" }, { tool: "get_item", noun: "lesson" }, { tool: "get_item", noun: "lesson" }, { tool: "search_course" }, { tool: "write" }]);
  ok(JSON.stringify(trail) === JSON.stringify(["searched the course 2×", "read 3 lessons"]), `trail sums steps up (${JSON.stringify(trail)})`);
  ok(JSON.stringify(trailOf([{ tool: "get_item", noun: "lesson" }, { tool: "get_item", noun: "war story" }])) === '["read 2 pages"]', "trail: mixed reads are pages");
  ok(JSON.stringify(trailOf([{ tool: "get_item", noun: "case file" }])) === '["read 1 case file"]', "trail: one read");
}

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
