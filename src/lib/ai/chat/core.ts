/**
 * One course-chat message, end to end, minus the HTTP and the metering: restore the conversation's refs,
 * build the history (old turns trimmed to a summary), attach the learner context to the new message, run the
 * tool loop, and clean the answer (only refs the tools returned; no links, no HTML). The route
 * (app/api/learn/ai/chat) and the eval (scripts/ai-eval/chat.ts) both call `runChatCore`, so the eval measures
 * exactly what learners get.
 */
import { answerTokens, FEATURES } from "@/lib/ai/features";
import { MODELS } from "@/lib/ai/prices";
import { isAnswerStyle, messageLines, pickActions, styleLine, type FollowupAction } from "@/lib/ai/answerStyle";
import { courseChatSystem, mockFullScorecardSystem, mockInterviewerSystem, promptOptsFor, replyFrom, type PromptSystem } from "@/lib/ai/prompts";
import { fromCourseMock, fromQuest, weakAreasPath, type ChatMock } from "./mock";
import { runLoop, type ApiMessage, type LoopResult } from "./loop";
import { checkCitations, type CiteStats } from "./citations";
import { ChatState, closingLine, fallbackAnswer, learnerContext, prefetchContext, runTool, TOOLS, type ChatDeps } from "./tools";
import { cleanAnswer, followupFilter, isRef, OFF_TOPIC_MARK, REF_RE, splitFollowups, TOOL_LABEL, type ChatSource, type MockState, type ChatEvent, type ChatRequest, type ChatTurn, type PageContext, type PathCard } from "./text";

/** Turns kept word for word; older ones become a short summary. */
export const KEEP_TURNS = 10;
/** The longest conversation a request may carry (the page keeps more; the server reads the end). */
const MAX_TURNS = 60;
export const MAX_USER_CHARS = FEATURES["course-chat"].maxInputChars;
const MAX_ASSISTANT_CHARS = 3500;
/** Tool rounds per message; then one round that must answer. */
export const MAX_TOOL_ROUNDS = 4;

const str = (x: unknown, n: number) => (typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ").slice(0, n) : "");

/** The request body, checked (types, sizes, ref formats). Ids are checked again against the index later. */
export function readRequest(body: unknown, opts: { endsWithUser?: boolean } = {}): ChatRequest | string {
  if (!body || typeof body !== "object") return "Bad request";
  const b = body as Record<string, unknown>;
  const chat = /^[a-z0-9]{6,40}$/i.test(String(b.chat)) ? String(b.chat) : "";
  if (!chat) return "Bad chat id";
  const raw = Array.isArray(b.messages) ? b.messages.slice(-MAX_TURNS) : [];
  const messages: ChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role === "assistant" ? "assistant" : (m as { role?: unknown }).role === "user" ? "user" : null;
    const text = str((m as { text?: unknown }).text, role === "user" ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS).trim();
    if (role && text) messages.push({ role, text });
  }
  const last = messages[messages.length - 1];
  if (!last || (opts.endsWithUser !== false && last.role !== "user")) return "Ask something first";
  const rec = (x: unknown, n: number): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!x || typeof x !== "object") return out;
    for (const [k, v] of Object.entries(x as Record<string, unknown>).slice(0, n)) if (typeof v === "string" && k.length <= 6) out[k] = v.slice(0, 220);
    return out;
  };
  const paths: Record<string, Omit<PathCard, "pref">> = {};
  if (b.paths && typeof b.paths === "object")
    for (const [k, v] of Object.entries(b.paths as Record<string, unknown>).slice(0, 30)) {
      if (!isRef(k, "p") || !v || typeof v !== "object") continue;
      const p = v as Record<string, unknown>;
      const steps = (Array.isArray(p.steps) ? p.steps : []).slice(0, 12).map((s) => ({ ref: str((s as { ref?: unknown })?.ref, 8), why: str((s as { why?: unknown })?.why, 220) }));
      paths[k] = { title: str(p.title, 140), note: str(p.note, 300), steps };
    }
  let page: PageContext | null = null;
  if (b.page && typeof b.page === "object") {
    const p = b.page as Record<string, unknown>;
    const path = str(p.path, 300);
    if (path.startsWith("/")) {
      const at = Number(p.videoAt);
      page = {
        path,
        title: str(p.title, 160) || undefined,
        heading: str(p.heading, 200) || undefined,
        headingId: /^[\w-]{1,120}$/.test(String(p.headingId ?? "")) ? String(p.headingId) : undefined,
        selection: str(p.selection, 1500).trim() || undefined,
        videoAt: Number.isFinite(at) && at >= 0 && at < 36000 ? Math.floor(at) : undefined,
      };
    }
  }
  const answerTo = isRef(b.answerTo, "q") ? b.answerTo : undefined;
  let mock: MockState | null = null;
  if (b.mock && typeof b.mock === "object") {
    const m = b.mock as Record<string, unknown>;
    const turns = (x: unknown): ChatTurn[] =>
      (Array.isArray(x) ? x : [])
        .slice(-24)
        .map((t) => ({ role: (t as { role?: unknown })?.role === "assistant" ? ("assistant" as const) : ("user" as const), text: str((t as { text?: unknown })?.text, 3000).trim() }))
        .filter((t) => t.text);
    const key = String(m.key ?? "");
    if (/^(mock:mock-\d+-[\w-]{1,80}|quest:[\w-]{1,120})$/.test(key)) {
      const phases: Record<string, ChatTurn[]> = {};
      if (m.phases && typeof m.phases === "object") for (const [id, v] of Object.entries(m.phases as Record<string, unknown>).slice(0, 12)) if (/^[\w.-]{1,20}$/.test(id)) phases[id] = turns(v);
      mock = { key, phase: /^[\w.-]{1,20}$/.test(String(m.phase)) ? String(m.phase) : "", history: turns(m.history), action: m.action === "end" ? "end" : "turn", phases };
    }
  }
  const title = b.title === "first" || b.title === "again" ? b.title : undefined;
  const style = isAnswerStyle(b.style) && b.style !== "tutor" ? b.style : undefined;
  const prevCall = Number.isInteger(b.prevCall) && Number(b.prevCall) > 0 ? Number(b.prevCall) : undefined;
  return { chat, messages, sources: rec(b.sources, 300), quizzes: rec(b.quizzes, 80), paths, answerTo, page, mock, ...(title ? { title } : {}), ...(style ? { style } : {}), ...(prevCall ? { prevCall } : {}) };

}

/** "> **Quick check:** …" in a tutor answer (the question is group 1) */
const QUICK_CHECK_RE = /^\s*>\s*\*\*\s*quick check\s*:?\s*\*\*\s*:?\s*(.+)$/im;
/** the quick check the tutor's last answer ended with (the newest message may answer it), if any */
export function quickCheckOf(req: ChatRequest): string | null {
  const prev = req.messages[req.messages.length - 2];
  return prev?.role === "assistant" && !req.answerTo ? (QUICK_CHECK_RE.exec(prev.text)?.[1] ?? null) : null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The history the model sees: a summary of old turns (and the refs from them), then the recent turns, then the new message with its context. */
export function buildMessages(req: ChatRequest, st: ChatState, context: string): ApiMessage[] {
  const turns = req.messages.slice(0, -1);
  const latest = req.messages[req.messages.length - 1];
  const keep = turns.slice(-KEEP_TURNS);
  const old = turns.slice(0, Math.max(0, turns.length - KEEP_TURNS));
  const head: string[] = [];
  if (old.length) {
    const asked = old.filter((t) => t.role === "user").map((t) => `"${clip(t.text.replace(/\s+/g, " "), 120)}"`);
    head.push(`Earlier in this chat (older turns, summarised): the learner asked ${asked.slice(-8).join("; ")}.`);
  }
  // refs handed out earlier stay citable without searching again (the most recent 25)
  const refs = [...st.sources.entries()].slice(-25);
  if (refs.length && (old.length || turns.length)) head.push(`Refs from earlier in this chat you may cite again:\n${refs.map(([r, s]) => `${r} = ${s.kind === "guide" ? "site help" : s.kind}: ${clip(s.title, 90)}`).join("\n")}`);
  // which practice questions are done: the page sends earlier answers as "(my answer to q1) …"
  const graded = new Set<string>();
  for (const t of turns) {
    const m = t.role === "user" ? /^\(my answer to (q\d{1,4})\)/.exec(t.text) : null;
    if (m) graded.add(m[1]);
  }
  const quizzes = [...st.quizzes.keys()];
  const stateOf = (q: string) => (q === req.answerTo ? "answered in the newest message" : graded.has(q) ? "answered and graded already: done" : "asked, no answer yet");
  if (quizzes.length) head.push(`Practice questions in this chat: ${quizzes.map((q) => `${q} (${stateOf(q)})`).join(", ")}. check_answer grades only the question the newest message answers; never grade one again.`);
  const paths = [...st.paths.values()];
  if (paths.length) head.push(`Paths built in this chat: ${paths.map((p) => `${p.pref} "${clip(p.title, 60)}" (${p.steps.length} steps)`).join("; ")}.`);

  const out: ApiMessage[] = [];
  if (head.length) out.push({ role: "user", content: `<chat_so_far>\n${head.join("\n")}\n</chat_so_far>` });
  for (const t of keep) out.push({ role: t.role, content: t.text });
  const ask = req.answerTo && st.quizzes.has(req.answerTo) ? `My answer to practice question ${req.answerTo}: ${latest.text}` : latest.text;
  // the tutor's quick check at the end of its last answer: this message may be the learner's answer to it
  const qc = quickCheckOf(req);
  const check = qc
    ? `<quick_check>Your last answer ended with this Quick check: "${clip(qc.replace(REF_RE, "").trim(), 300)}". If this message answers it, grade their answer to THAT question. Before the first word, work out the correct answer and compare it with theirs ("${clip(latest.text.replace(/\s+/g, " ").trim(), 200)}"): the same answer or the same idea in other words → "Right!"; the right idea with a slip or missing piece → "Close!"; a different number, option or idea → "Not quite." Then the correct answer with its one-line reason (the arithmetic for a number), in two or three sentences in all, and nothing else (no shape, no callouts). If it is a new question, answer that instead.</quick_check>`
    : "";
  // the answer style the learner picked goes with their words (the system prompt stays one cached block)
  out.push({ role: "user", content: [ask, check, styleLine(req.style), ...messageLines(latest.text, req.style), context].filter(Boolean).join("\n\n") });
  // the API wants the first message from the user; consecutive same-role messages are joined by the API
  if (out[0].role !== "user") out.unshift({ role: "user", content: "(continuing our chat)" });
  return out;
}

export const thinkingFor = (model: string): Record<string, unknown> | null => (/haiku/.test(model) ? { type: "disabled" } : /sonnet-5/.test(model) ? { type: "between_tools" } : null);

/** A prompt as the API's system blocks: one string is cached whole; blocks keep their own cache marks (the fixed rules,
 *  and the mock's material, which repeats on every turn of a phase). */
const apiSystem = (p: PromptSystem): { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[] =>
  typeof p === "string" ? [{ type: "text", text: p, cache_control: { type: "ephemeral" } }] : p.map((b) => ({ type: "text", text: b.text, ...(b.cache ? { cache_control: { type: "ephemeral" } } : {}) }));

export type CoreResult = {
  text: string;
  offTopic: boolean;
  loop: LoopResult;
  state: ChatState;
  ask: string;
  mode: "tutor" | "interviewer" | "scorecard";
  /** ms spent building the learner context, and ms from the core's start to the loop's (timing for the admin log) */
  ctxMs?: number;
  loopAt?: number;
  /** the main model declined before writing anything, and this model answered instead */
  fellBack?: string;
  /** likely next questions for the page's cards (none for a quiz question, a decline, a mock or a cut-off answer) */
  followups?: string[];
  /** the standard actions offered beside them (an explanation's "Explain simpler", "Quiz me"…) */
  actions?: FollowupAction[];
  /** the citation check's counts (lib/ai/chat/citations.ts); null: nothing cited or not checked */
  cites?: CiteStats | null;
};

/** What the learner sees when every model declined (a safety decline is never an error to retry). */
export const DECLINE_TEXT = "I can't help with that one. I'm here for system design and this course: ask me about a topic, a lesson, a design you're working on or your interview prep.";

/** Two loops' results as one (a fallback after a decline): usage, cost and tools add up; the second's text stands. */
function joinLoops(a: LoopResult, b: LoopResult): LoopResult {
  const usage = { ...a.usage };
  for (const k of Object.keys(usage) as (keyof typeof usage)[]) usage[k] += b.usage[k];
  const shift = (a.timing.at(-1)?.end ?? 0) + 1;
  return { ...b, rounds: a.rounds + b.rounds, toolCalls: [...a.toolCalls, ...b.toolCalls], usage, costUsd: a.costUsd + b.costUsd, refusal: a.refusal, timing: [...a.timing, ...b.timing.map((t) => ({ ...t, start: t.start + shift, ttfb: t.ttfb + shift, first: t.first === null ? null : t.first + shift, end: t.end + shift }))], ttft: b.ttft === null ? null : b.ttft + shift };
}

export async function runChatCore(o: {
  deps: ChatDeps;
  req: ChatRequest;
  model: string;
  apiKey: string;
  map: string;
  memory: string[] | null;
  emit: (e: ChatEvent) => void;
  deadline: number;
  signal?: AbortSignal;
  /** false: no server-side lookups before the model (the eval's A/B) */
  prefetch?: boolean;
  /** another system prompt for the course map (the eval's old-vs-new prompt A/B); the route never sets it */
  system?: (map: string) => string;
}): Promise<CoreResult> {
  const t0 = Date.now();
  const st = new ChatState(o.deps, o.emit);
  await st.restore(o.req.sources ?? {}, o.req.quizzes ?? {}, o.req.paths ?? {});
  const latestText = o.req.messages[o.req.messages.length - 1].text;
  const first = o.req.messages.filter((m) => m.role === "user").length === 1;
  // the page shows each step as it happens (the first message of a chat also works out what's due for review)
  if (first) o.emit({ type: "status", tool: "context", label: TOOL_LABEL.context });
  const recentAnswers = o.req.messages.filter((m) => m.role === "assistant").slice(-3).map((m) => m.text);
  // the learner context and the lookups for this message, side by side (each was a wait of its own before the model);
  // looked up before the model runs, so most answers need no tool round (see prefetchContext)
  const [context, pre] = await Promise.all([
    learnerContext(st, o.memory, first, Date.now(), { recentAnswers }),
    o.prefetch === false ? Promise.resolve({ text: "", ran: [] as string[] }) : prefetchContext(st, latestText, { answerTo: o.req.answerTo }),
  ]);
  const ctxMs = Date.now() - t0;
  // what the context and the lookups showed the model for each ref: the citation check's evidence
  st.noteShown(context);
  st.noteShown(pre.text);
  const messages = buildMessages(o.req, st, [context, pre.text ? `<looked_up_for_this_message>\n${pre.text}\n</looked_up_for_this_message>` : ""].filter(Boolean).join("\n\n"));
  const system = o.system ? o.system(o.map) : courseChatSystem(o.map, promptOptsFor(o.model, "course-chat"));
  const loopAt = Date.now() - t0;
  // the follow-ups line at the end of an answer never streams (its own event, after the loop)
  const deltas = followupFilter((d) => o.emit({ type: "delta", text: d }));
  const grading = !!quickCheckOf(o.req);
  const run = (model: string, sys: string) =>
    runLoop({
      apiKey: o.apiKey,
      model,
      system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
      // an answer to the tutor's quick check: Haiku 5.5 thinks first (low effort). Without it, the verdict came before
      // the working and "800?" was "Right!" with 200 worked out after it (local test, 8 Nov 2026)
      maxTokens: answerTokens("course-chat", model) + (grading && /haiku-5-5/.test(model) ? 2000 : 0),
      thinking: grading && /haiku-5-5/.test(model) ? { type: "adaptive" } : thinkingFor(model),
      ...(grading && /haiku-5-5/.test(model) ? { effort: "low" as const } : {}),
      maxToolRounds: MAX_TOOL_ROUNDS,
      deadline: o.deadline,
      signal: o.signal,
      runTool: async (name, input) => {
        const out = await runTool(st, name, input);
        st.noteShown(out);
        return out;
      },
      onRound: (n) => {
        deltas.flush();
        o.emit({ type: "round", n });
        // round 1 thinks (and may call tools); a round after tool results writes the answer (on Sonnet it arrives in one piece at the end)
        o.emit(n === 1 ? { type: "status", tool: "think", label: pre.ran.length ? "Thinking it through…" : TOOL_LABEL.think } : { type: "status", tool: "write", label: TOOL_LABEL.write });
      },
      onText: (d) => deltas.push(d),
      onTool: (name, input) => st.status(name, input),
      finish: (ran) => closingLine(st, ran),
    });
  let loop = await run(o.model, system);
  deltas.flush();
  // a decline before anything was shown: the fast model answers instead (its own safety training decides),
  // as the API's refusal fallbacks do; a decline after text was shown stays a decline
  let fellBack: string | undefined;
  if (loop.stop === "refusal" && loop.ttft === null && !/haiku/.test(o.model) && o.deadline - Date.now() > 8000) {
    fellBack = MODELS.haiku55;
    loop = joinLoops(loop, await run(fellBack, courseChatSystem(o.map, promptOptsFor(fellBack, "course-chat"))));
    deltas.flush();
  }
  if (loop.stop === "refusal" && loop.ttft === null && !loop.error) {
    loop = { ...loop, text: DECLINE_TEXT };
    o.emit({ type: "delta", text: DECLINE_TEXT });
  }
  // what ran before the model counts as the message's tools (the admin trace, the quota's tool count)
  if (pre.ran.includes("check_answer")) loop.toolCalls.unshift({ name: "check_answer", input: { qref: o.req.answerTo } });
  if (pre.ran.includes("get_item")) loop.toolCalls.unshift({ name: "get_item", input: { ref: "page" } });
  if (pre.ran.includes("search")) loop.toolCalls.unshift({ name: "search_course", input: { prefetched: true } });
  const offTopic = OFF_TOPIC_MARK.test(loop.text);
  const latest = o.req.messages[o.req.messages.length - 1];
  const split = splitFollowups(loop.text, latest.text);
  let text = cleanAnswer(split.text, (ref) => st.sources.has(ref));
  // the tools ran (a plan or path card may already be on the page) but no answer came, even from the answer-only
  // round (lib/ai/chat/loop.ts), or time ran out after them: a short answer from what they made, never an error
  // for work that succeeded. Still the one message (one ai_calls row, one quota message).
  if (!text && loop.toolCalls.length && !loop.refusal && !o.signal?.aborted && (!loop.error || loop.error === "timeout")) {
    const line = fallbackAnswer(st);
    if (line) {
      deltas.push(loop.ttft === null ? line : `\n\n${line}`);
      deltas.flush();
      loop = { ...loop, text: line, error: null, recovered: "fallback" };
      text = cleanAnswer(line, (ref) => st.sources.has(ref));
    }
  }
  // every [[sN]] must point at a retrieved source that supports its sentence (lib/ai/chat/citations.ts): unsupported
  // ones are swapped for the source that does, or dropped; the counts go on the metering row. The page shows the
  // checked text when the answer is done (the streamed draft is replaced).
  let cites: CiteStats | null = null;
  if (text && !offTopic) {
    const checked = checkCitations(text, st.citationEvidence(), (ref) => st.sources.has(ref));
    text = checked.text;
    cites = checked.stats;
  }
  // cards only under a real, whole answer: not a decline, a practice question waiting for its answer, a mock just
  // started, a saved path's one line, or an answer that was cut off
  const cards = !(offTopic || st.flags.quiz || st.mock || loop.error || loop.stop !== "end_turn" || loop.refusal || !text);
  const followups = cards ? split.followups : [];
  // the buttons for "explain simpler", "quiz me"…: under an explanation, not under a path, plan, saved path, quiz
  // grade, mock, gap ("no lesson on X yet": nothing of the course's to simplify, deepen or quiz on) or a one-line answer
  const explained = cards && !st.flags.path && !st.flags.plan && !st.flags.saved && !st.flags.graded && !o.req.answerTo && text.split(/\s+/).length >= 40;
  const gap = /^\s*The course has no lesson on\b|\bnot in a lesson of (?:its|their) own\b/i.test(text);
  const actions = explained && !gap ? pickActions(followups, { asked: latest.text }) : [];
  return { text, offTopic, loop, state: st, ask: o.req.answerTo ? `[answer to ${o.req.answerTo}] ${latest.text}` : latest.text, mode: "tutor", ctxMs, loopAt, fellBack, followups, actions, cites };
}

/** The mock interview behind a key, if it is still live (a course mock, or a side quest's design round). */
async function resolveMock(st: ChatState, key: string): Promise<ChatMock | null> {
  if (key.startsWith("mock:")) {
    if (!(await st.liveDocA(`MK:${key.slice(5)}`))) return null;
    const m = await st.d.mock(key.slice(5)).catch(() => null);
    return m ? fromCourseMock(m) : null;
  }
  const slug = key.slice(6);
  const quest = (await st.docsWhere({ kind: "quest" })).find((d) => d.id.endsWith(`/${slug}`));
  if (!quest || !st.liveDoc(quest.id)) return null;
  const lm = /^L:([^/#]+)\/([^/#]+)$/.exec(quest.id);
  const [md, dr] = await Promise.all([lm ? st.d.lessonMarkdown(lm[1], lm[2]).catch(() => null) : null, st.d.drills(slug).catch(() => null)]);
  return fromQuest(quest, md, dr);
}

const emptyLoop = (text: string): LoopResult => ({ text, stop: "end_turn", rounds: 0, toolCalls: [], usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, costUsd: 0, error: null, requestId: null, refusal: null, timing: [], ttft: null });

/**
 * A message while a mock interview is on: the interviewer's next line (the mock interviewer prompt, tuned per
 * model like /api/learn/ai/mock/turn), or, for "end", the whole-interview scorecard (the mock scorecard prompt)
 * and a path through the lessons behind what it marked as missed.
 */
export async function runMockCore(o: Parameters<typeof runChatCore>[0]): Promise<CoreResult> {
  const st = new ChatState(o.deps, o.emit);
  await st.restore(o.req.sources ?? {}, o.req.quizzes ?? {}, o.req.paths ?? {});
  const ms = o.req.mock!;
  const latest = o.req.messages[o.req.messages.length - 1];
  const mock = await resolveMock(st, ms.key);
  st.flags.mock = ms.key;
  if (!mock) return { text: "That interview isn't available any more. Ask me to start another one.", offTopic: false, loop: emptyLoop(""), state: st, ask: latest.text, mode: "interviewer" };
  const run = (system: PromptSystem, messages: ApiMessage[], maxTokens: number, thinking: Record<string, unknown> | null, effort?: "low" | "medium" | "high") =>
    runLoop({ apiKey: o.apiKey, model: o.model, system: apiSystem(system), tools: [], messages, maxTokens, thinking, effort, maxToolRounds: 0, deadline: o.deadline, signal: o.signal, runTool: async () => "", onRound: (n) => o.emit({ type: "round", n }), onText: (d) => o.emit({ type: "delta", text: d }) });

  if (ms.action === "end") {
    const phases = mock.phases.map((p) => {
      const said = (ms.phases?.[p.id] ?? []).filter((t) => t.role === "user").map((t) => `Said to the interviewer:\n${t.text.slice(0, 2500)}`);
      return { title: p.title, rubric: p.prompt.rubric, modelAnswer: p.prompt.modelAnswer, candidate: said.join("\n\n") };
    });
    if (!phases.some((p) => p.candidate.split(/\s+/).length >= 20))
      return { text: "There isn't enough to score yet: answer at least one phase in a few sentences, then end the interview again.", offTopic: false, loop: emptyLoop(""), state: st, ask: latest.text, mode: "scorecard" };
    o.emit({ type: "status", tool: "scorecard", label: TOOL_LABEL.scorecard });
    const system = mockFullScorecardSystem({ company: mock.company, problem: mock.problem, phases }, promptOptsFor(o.model, "mock-scorecard"));
    // the scorecard thinks (as /api/learn/ai/mock/scorecard does): Haiku 5.5 adaptively at the feature's effort, Sonnet and
    // Opus by default, Haiku 4.5 never; thinking gets room on top of the answer
    const h55 = /haiku-5-5/.test(o.model);
    const thinks = h55 || !/haiku/.test(o.model);
    const loop = await run(system, [{ role: "user", content: "Grade my interview." }], answerTokens("mock-scorecard", o.model) + (thinks ? 3000 : 0), h55 ? { type: "adaptive" } : thinks ? null : { type: "disabled" }, h55 ? FEATURES["mock-scorecard"].effort : undefined);
    const fresh: Record<string, ChatSource> = {};
    // the reply from its first phase on (a rare un-thought call may write its working first)
    const text = cleanAnswer(replyFrom(loop.text, "### P1"), () => false);
    const path = text ? await weakAreasPath(st, mock, text, fresh) : null;
    st.sourcesSent(fresh);
    if (path) {
      st.flags.path = true;
      o.emit({ type: "path", path });
    }
    return { text, offTopic: false, loop, state: st, ask: `[end of mock ${mock.key}]`, mode: "scorecard" };
  }

  const phase = mock.phases.find((p) => p.id === ms.phase) ?? mock.phases[0];
  const history = ms.history.map((t) => ({ role: t.role, content: t.text }));
  // the API wants the candidate first: the interviewer's opening line is already in the prompt's phase notes
  while (history[0]?.role === "assistant") history.shift();
  if (history.filter((m) => m.role === "user").length >= 10) return { text: "That's ten exchanges in this phase: time to move on to the next one (or end the interview for your scorecard).", offTopic: false, loop: emptyLoop(""), state: st, ask: latest.text, mode: "interviewer" };
  const system = mockInterviewerSystem({ company: mock.company, interviewer: mock.interviewer, problem: mock.problem, phase: phase.prompt }, promptOptsFor(o.model, "mock-interviewer"));
  o.emit({ type: "status", tool: "interviewer", label: TOOL_LABEL.interviewer });
  const loop = await run(system, [...history, { role: "user", content: latest.text }], answerTokens("mock-interviewer", o.model), thinkingFor(o.model));
  return { text: cleanAnswer(loop.text, () => false), offTopic: false, loop, state: st, ask: `[mock ${mock.key} · ${phase.id}] ${latest.text}`, mode: "interviewer" };
}

