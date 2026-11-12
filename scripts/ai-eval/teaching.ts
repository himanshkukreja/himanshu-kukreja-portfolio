/**
 * Teaching features eval (owner-approved 12 Nov 2026): the cases in teaching-cases.ts, end to end through the routes' own
 * code, on each feature's production model (Haiku 5.5):
 *   chat       runChatCore with `teach` / `restyle` on the request (a new learner: no progress, no memory)
 *   dsa-chat   prepareAsk + answerDsa (lib/dsa/ai/turn.ts, answer.ts), as /api/learn/ai/dsa/ask
 *   lesson-qa  the route's turn (buildAskTurn with teachLine / restyleLine, the previous exchange), prompt and retrieval
 *   goal       the goal chat (lib/learner/goal-chat-model.ts) with its schema, a scripted learner, then readGoalReply
 * Checks per turn: rules (one question and a closing question for a Socratic turn, a word cap, no headings / tables /
 * lists, the case's regexes; for the goal chat each reply's length and question count and the captured profile) and a
 * Sonnet 5.5 judge on the EXPECT / AVOID lines (one call per case; never Opus).
 *
 * Nothing is written to the database. The search index comes from a running site (EVAL_SEARCH_ORIGIN, default
 * http://localhost:3820); course content from SDM_LOCAL_DIR, DSA content from DSA_LOCAL_DIR; a server-only stub on NODE_PATH:
 *   NODE_PATH=<dir with server-only stub> npx tsx --env-file=.env --env-file=.env.local scripts/ai-eval/teaching.ts <out dir> [case-id | kind ...]
 *   EVAL_NOJUDGE=1   rule checks only · EVAL_JUDGE=<id> the judge (default Sonnet 5.5)
 */
import fs from "fs";
import path from "path";
import { answerTokens, FEATURES } from "@/lib/ai/features";
import { costOf, MODELS, type Usage } from "@/lib/ai/prices";
import { lessonQaSystem, promptOptsFor } from "@/lib/ai/prompts";
import { lessonContext } from "@/lib/ai/retrieve";
import { buildAskTurn, clipPrevious } from "@/lib/ai/askTurn";
import { endAtQuestion, restyleLine, REVEAL_RE, teachLine } from "@/lib/ai/teaching";
import { SmartEngine, transcriptDocs } from "@/lib/search/smart/engine";
import { rowToDoc, type DocIndex } from "@/lib/search/smart/types";
import { LocalSearch } from "@/lib/search/smart/api";
import type { TranscriptIndex } from "@/lib/learn/lecture/transcript";
import { getCourseMap } from "@/lib/learn/course";
import { getLearningResource } from "@/lib/github";
import { getQuestDrills } from "@/lib/learn/drills/load";
import { getWeekQuestions } from "@/lib/learn/arena/bank";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import type { CourseMap } from "@/lib/learn/types";
import { runChatCore } from "@/lib/ai/chat/core";
import { courseMapSummary } from "@/lib/ai/chat/mapSummary";
import { buildSnapshot } from "@/lib/ai/chat/progress-model";
import { planFor } from "@/lib/ai/chat/reviewSeams";
import type { BankItem, ChatDeps } from "@/lib/ai/chat/tools";
import { splitFollowups, type ChatRequest, type ChatSource, type ChatTurn } from "@/lib/ai/chat/text";
import { answerDsa } from "@/lib/dsa/ai/answer";
import { courseOutline } from "@/lib/dsa/ai/search";
import { prepareAsk } from "@/lib/dsa/ai/turn";
import { closingLine, goalChatInput, goalChatSystem, GOAL_CHAT_MAX_TURNS, GOAL_CHAT_SCHEMA, readGoalReply, wantsToStop, withKnown, type GoalKnown, type GoalProfile, type GoalTurn } from "@/lib/learner/goal-chat-model";
import { TEACH_CASES, type TeachCase, type TeachTurn } from "./teaching-cases";

const OUT = path.resolve(process.argv[2] || "teaching-eval-out");
const ONLY = process.argv.slice(3);
const ORIGIN = (process.env.EVAL_SEARCH_ORIGIN || "http://localhost:3820").replace(/\/$/, "");
const KEY = process.env.ANTHROPIC_API_KEY || "";
const JUDGE = process.env.EVAL_JUDGE || MODELS.sonnet;
const NOJUDGE = process.env.EVAL_NOJUDGE === "1";
if (/opus/.test(JUDGE)) throw new Error("this eval's judge is never Opus (owner's spend rule)");

async function engine(): Promise<SmartEngine> {
  const get = async <T,>(p: string) => {
    const r = await fetch(`${ORIGIN}${p}`, { signal: AbortSignal.timeout(300_000) });
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return (await r.json()) as T;
  };
  const parts = await Promise.all(["a", "b", "c", "d", "e"].map((x) => get<DocIndex>(`/api/search/index/${x}`)));
  const t = await get<TranscriptIndex>("/api/search/transcripts");
  return new SmartEngine([...parts.flatMap((x) => x.d.map(rowToDoc)), ...transcriptDocs(t)], "eval", parts.flatMap((x) => x.syn ?? []));
}

async function api(model: string, body: Record<string, unknown>): Promise<{ text: string; usage: Usage; ms: number }> {
  const t0 = Date.now();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, ...body }) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { content?: { type: string; text?: string }[]; usage?: Usage; error?: { message?: string } } | null;
    if ((!res || res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    if (j?.error) console.warn("api error:", j.error.message);
    return { text: (j?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), usage: j?.usage ?? {}, ms: Date.now() - t0 };
  }
}

/* ------------------------------------------------------------------ rule checks */

const words = (s: string) => s.replace(/```[\s\S]*?```/g, " ").replace(/\[\[[^\]]*\]\]/g, "").split(/\s+/).filter(Boolean).length;
const questions = (s: string) => (s.replace(/```[\s\S]*?```/g, "").match(/\?/g) ?? []).length;
function rulesFor(t: TeachTurn, text: string): { name: string; ok: boolean }[] {
  const body = text.replace(/\[\[[^\]]*\]\]/g, "").trim();
  return [
    ...(t.oneQuestion ? [{ name: "one question", ok: questions(body) === 1 }, { name: "ends with the question", ok: /\?\s*\**\s*$/.test(body.replace(/\s*\(?\[[^\]]+\]\)?\s*$/, "")) }] : []),
    ...(t.maxWords ? [{ name: `≤ ${t.maxWords} words (${words(body)})`, ok: words(body) <= t.maxWords }] : []),
    ...(t.noStructure ? [{ name: "no headings, tables or lists", ok: !/^\s*(#{1,4}\s|\|.*\|\s*$|[-*•]\s|\d+[.)]\s)/m.test(body) }] : []),
    ...(t.must ?? []).map((re) => ({ name: `must ${re.source.slice(0, 40)}`, ok: re.test(text) })),
    ...(t.mustNot ?? []).map((re) => ({ name: `mustNot ${re.source.slice(0, 40)}`, ok: !re.test(text) })),
    { name: "no URL", ok: !/https?:\/\/|www\./i.test(text) },
    { name: "answered", ok: !!text.trim() },
  ];
}

/* ------------------------------------------------------------------ the judge */

type Judged = { expectMet: boolean[]; avoided: boolean[]; why: string };
async function judge(c: TeachCase, turns: { user: string; text: string }[], expect: string[][], avoid: string[][]): Promise<{ j: Judged[] | null; cost: number }> {
  if (NOJUDGE) return { j: null, cost: 0 };
  const lines = turns.map((t, i) => `[turn ${i + 1}] LEARNER: ${t.user}\nTUTOR: ${t.text || "(no answer)"}\nEXPECT (each must hold):\n${(expect[i] ?? []).map((x, k) => `  ${k + 1}. ${x}`).join("\n") || "  (none)"}\nAVOID (each must NOT happen):\n${(avoid[i] ?? []).map((x, k) => `  ${k + 1}. ${x}`).join("\n") || "  (none)"}`).join("\n\n");
  const user = `You grade replies of an AI tutor on an online course site ("System Design Mastery" and "DSA Mastery") for one case: ${c.title}.
${c.kind === "goal" ? "This is the site's short welcome chat that learns a new learner's goals; the TUTOR lines are its replies." : 'In "Teach me" turns the learner switched on a Socratic mode: the tutor should guide with one question at a time and explain only after the learner tries or asks. In "Explain it differently" turns the learner asked for the previous answer again in another way.'}
Citations like [[s3]] are the correct format. Judge each line strictly and literally.

${lines}

Reply with JSON only: {"turns":[{"expectMet":[true|false per EXPECT line],"avoided":[true per AVOID line that was avoided, false if it happened],"why":"one sentence on any failure"}]}`;
  const r = await api(JUDGE, { max_tokens: 2000, system: "You are a strict, exact evaluator of an AI tutor's replies. Return only JSON.", messages: [{ role: "user", content: user }] });
  const cost = costOf(JUDGE, r.usage);
  const m = r.text.match(/\{[\s\S]*\}/);
  try {
    return { j: m ? (JSON.parse(m[0]) as { turns: Judged[] }).turns : null, cost };
  } catch {
    return { j: null, cost };
  }
}

/* ------------------------------------------------------------------ runs */

type TurnLog = { user: string; text: string; ms: number; cost: number; rules: { name: string; ok: boolean }[]; judge?: Judged | null; ok: boolean };

async function runChat(c: Extract<TeachCase, { kind: "chat" }>, e: SmartEngine, map: CourseMap): Promise<TurnLog[]> {
  const snap = buildSnapshot({ profile: { xp: 0, game_done: {}, current_streak: 0 }, rows: [], trials: [], cards: [], flags: {}, dsa: null }, map, new Date());
  const deps: ChatDeps = {
    search: new LocalSearch(Promise.resolve(e)),
    live: () => true,
    courseMap: async () => map,
    lessonMarkdown: async (w, s) => (await getLearningResource(w, s).catch(() => null))?.content ?? null,
    storyBody: async () => null,
    drills: (s) => getQuestDrills(s, []),
    questionBank: async (w) => (await getWeekQuestions(w)) as BankItem[],
    progress: async () => snap,
    savedPaths: async () => [],
    page: null,
    mock: (slug) => getMockInterview(slug),
    design: async () => null,
    dueReviews: async () => [],
    studyPlan: planFor,
    learnerName: async () => null,
  };
  const messages: ChatTurn[] = [];
  const sources: Record<string, string> = {};
  const out: TurnLog[] = [];
  for (const t of c.turns) {
    messages.push({ role: "user", text: t.user });
    const t0 = Date.now();
    const req: ChatRequest = { chat: "evalteach0001", messages: [...messages], sources: { ...sources }, quizzes: {}, paths: {}, page: null, mock: null, ...(t.teach ? { teach: true } : {}), ...(t.restyle ? { restyle: t.restyle } : {}) };
    const r = await runChatCore({ deps, req, model: FEATURES["course-chat"].model, apiKey: KEY, map: courseMapSummary(map), memory: null, emit: () => {}, deadline: Date.now() + 90_000 });
    for (const [ref, s] of r.state.sources.entries()) sources[ref] = (s as ChatSource).id;
    out.push({ user: t.user, text: r.text, ms: Date.now() - t0, cost: r.loop.costUsd, rules: [...rulesFor(t, r.text), ...(t.teach && t.oneQuestion ? [{ name: "only 'Just show me' under it", ok: !r.followups?.length && (r.actions ?? []).every((a) => a === "reveal") }] : [])], ok: false });
    messages.push({ role: "assistant", text: r.text });
  }
  return out;
}

async function runDsa(c: Extract<TeachCase, { kind: "dsa-chat" }>, outline: string): Promise<TurnLog[]> {
  const messages: ChatTurn[] = [];
  const sources: Record<string, ChatSource> = {};
  const out: TurnLog[] = [];
  for (const t of c.turns) {
    messages.push({ role: "user", text: t.user });
    const req: ChatRequest = { chat: "evalteachdsa1", messages: [...messages], sources: Object.fromEntries(Object.entries(sources).map(([r, s]) => [r, s.id])), page: null, ...(t.teach ? { teach: true } : {}), ...(t.restyle ? { restyle: t.restyle } : {}) };
    const p = await prepareAsk({ req, unlocked: new Set(), outline });
    const t0 = Date.now();
    const a = await answerDsa({ feature: "dsa-chat", model: FEATURES["dsa-chat"].model, apiKey: KEY, p, latest: t.user, deadline: Date.now() + 90_000 });
    Object.assign(sources, p.sources);
    // as the route does (lib/dsa/ai/run.ts)
    const text = t.teach && !t.restyle && !REVEAL_RE.test(t.user) ? endAtQuestion(a.text) : a.text;
    out.push({ user: t.user, text, ms: Date.now() - t0, cost: a.loop.costUsd, rules: rulesFor(t, text), ok: false });
    messages.push({ role: "assistant", text });
  }
  return out;
}

async function runLessonQa(c: Extract<TeachCase, { kind: "lesson-qa" }>): Promise<TurnLog[]> {
  const lesson = await getLearningResource(c.week, c.slug);
  if (!lesson) throw new Error(`${c.week}/${c.slug}: lesson not found`);
  const model = FEATURES["lesson-qa"].model;
  const def = FEATURES["lesson-qa"];
  const out: TurnLog[] = [];
  let prev: { q: string; a: string } | null = null;
  for (const t of c.turns) {
    const p = clipPrevious(prev);
    const style = [t.restyle && p ? restyleLine(t.restyle) : "", t.teach && !t.restyle ? teachLine({ answering: !!p, topic: p?.q ?? t.user, latest: t.user }) : ""].filter(Boolean).join("\n\n");
    const ask = buildAskTurn({ question: t.user, selection: "", kind: "lesson", mode: "", style, prev: p });
    const ctx = { title: lesson.resource.title, text: lessonContext(lesson.content, [t.user, p ? p.q : ""].filter(Boolean).join(" "), ""), kind: "lesson" as const };
    const sys = lessonQaSystem(ctx, promptOptsFor(model, "lesson-qa"));
    const system = typeof sys === "string" ? [{ type: "text", text: sys }] : sys.map((b) => ({ type: "text", text: b.text }));
    const r = await api(model, { max_tokens: answerTokens("lesson-qa", model) + 3000, thinking: { type: "adaptive" }, output_config: { effort: def.effort ?? "low" }, system, messages: [{ role: "user", content: ask }] });
    const split = splitFollowups(r.text, t.user);
    const text = t.teach && !t.restyle && !REVEAL_RE.test(t.user) ? endAtQuestion(split.text) : split.text;
    out.push({ user: t.user, text, ms: r.ms, cost: costOf(model, r.usage), rules: rulesFor(t, text), ok: false });
    prev = { q: t.user, a: text };
  }
  return out;
}

async function runGoal(c: Extract<TeachCase, { kind: "goal" }>): Promise<{ turns: TurnLog[]; profile: GoalProfile | null; done: boolean }> {
  const known: GoalKnown = { goals: [], level: "", prefs: [], dsaExp: null, dsaGoal: null, dsaFull: false, started: [], ...c.known };
  const model = FEATURES["goal-chat"].model;
  const convo: GoalTurn[] = [];
  const out: TurnLog[] = [];
  let profile: GoalProfile | null = null;
  let done = false;
  const ask = async (userText: string) => {
    const t0 = Date.now();
    const r = await api(model, { max_tokens: FEATURES["goal-chat"].maxTokens, thinking: { type: "disabled" }, output_config: { format: { type: "json_schema", schema: GOAL_CHAT_SCHEMA } }, system: goalChatSystem(), messages: [{ role: "user", content: goalChatInput(convo, known) }] });
    const g = readGoalReply(r.text);
    const reply = g?.reply ?? "";
    out.push({
      user: userText,
      text: reply,
      ms: r.ms,
      cost: costOf(model, r.usage),
      rules: [
        { name: "valid JSON", ok: !!g },
        { name: `≤ 40 words (${words(reply)})`, ok: words(reply) <= 40 },
        { name: "at most one question (raw)", ok: questions(r.text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? reply) <= 1 },
      ],
      ok: false,
    });
    // as the route does: the sixth answer or a request to stop ends it, with a closing line
    const users = convo.filter((t) => t.role === "user").length;
    const forced = users >= GOAL_CHAT_MAX_TURNS || (users > 0 && wantsToStop(userText));
    if (g) {
      profile = withKnown(g.profile, known);
      done = g.done || forced;
    }
    if (done) out[out.length - 1].text = closingLine(reply);
    convo.push({ role: "assistant", text: out[out.length - 1].text });
  };
  await ask("(opens the chat)");
  for (const a of c.answers) {
    if (done) break;
    convo.push({ role: "user", text: a });
    await ask(a);
  }
  return { turns: out, profile, done };
}

async function main() {
  if (!KEY) throw new Error("ANTHROPIC_API_KEY missing");
  fs.mkdirSync(OUT, { recursive: true });
  const cases = TEACH_CASES.filter((c) => !ONLY.length || ONLY.includes(c.id) || ONLY.includes(c.kind));
  const [e, map, outline] = await Promise.all([cases.some((c) => c.kind === "chat") ? engine() : Promise.resolve(null), getCourseMap(), cases.some((c) => c.kind === "dsa-chat") ? courseOutline() : Promise.resolve("")]);
  if (!map) throw new Error("course map unavailable");
  const rows: { id: string; kind: string; turns: TurnLog[]; judgeCost: number; profile?: GoalProfile | null; profileMiss?: string[] }[] = [];
  for (const c of cases) {
    let turns: TurnLog[];
    let profileMiss: string[] | undefined;
    let profile: GoalProfile | null | undefined;
    if (c.kind === "goal") {
      const g = await runGoal(c);
      turns = g.turns;
      profile = g.profile;
      profileMiss = [...(g.profile ? c.profile(g.profile) : ["no profile"]), ...(g.done ? [] : ["never finished"]), ...(c.maxTurns && g.turns.length - 1 > c.maxTurns ? ["went on after the learner stopped"] : [])];
      // the whole conversation is judged as one turn
      const all = turns.map((t) => `${t.user === "(opens the chat)" ? "" : `LEARNER: ${t.user}\n`}TUTOR: ${t.text}`).join("\n");
      const { j, cost } = await judge(c, [{ user: "(the whole conversation)", text: all }], [c.expect], [c.avoid ?? []]);
      const judged = j?.[0] ?? null;
      const ok = turns.every((t) => t.rules.every((r) => r.ok)) && !profileMiss.length && (NOJUDGE || (!!judged && judged.expectMet.every(Boolean) && (judged.avoided ?? []).every(Boolean)));
      turns.forEach((t) => (t.ok = ok));
      if (turns[0]) turns[0].judge = judged;
      console.log(`${ok ? "PASS" : "FAIL"} ${c.id} turns=${turns.length - 1} done=${profileMiss.includes("never finished") ? "no" : "yes"}${profileMiss.length ? ` profile: ${profileMiss.join("; ")}` : ""}${turns.flatMap((t) => t.rules.filter((r) => !r.ok).map((r) => r.name)).join("; ") ? ` rules: ${turns.flatMap((t) => t.rules.filter((r) => !r.ok).map((r) => r.name)).join("; ")}` : ""}${judged && !ok ? ` judge: ${judged.why}` : ""}`);
      for (const t of turns) console.log(`     ${t.user === "(opens the chat)" ? "" : `[${t.user.slice(0, 40)}] `}→ ${t.text}`);
      console.log(`     profile: ${JSON.stringify(profile)}`);
      rows.push({ id: c.id, kind: c.kind, turns, judgeCost: cost, profile, profileMiss });
    } else {
      turns = c.kind === "chat" ? await runChat(c, e!, map) : c.kind === "dsa-chat" ? await runDsa(c, outline) : await runLessonQa(c);
      const { j, cost } = await judge(c, turns, c.turns.map((t) => t.expect), c.turns.map((t) => t.avoid ?? []));
      turns.forEach((t, i) => {
        t.judge = j?.[i] ?? null;
        const judgedOk = NOJUDGE ? true : !!t.judge && t.judge.expectMet.length >= c.turns[i].expect.length && t.judge.expectMet.every(Boolean) && (t.judge.avoided ?? []).every(Boolean);
        t.ok = t.rules.every((r) => r.ok) && judgedOk;
        const failed = t.rules.filter((r) => !r.ok).map((r) => r.name);
        console.log(`${t.ok ? "PASS" : "FAIL"} ${c.id}#${i + 1} ${(t.ms / 1000).toFixed(1)}s $${t.cost.toFixed(4)}${failed.length ? ` rules failed: ${failed.join("; ")}` : ""}${t.judge && !t.ok ? ` judge: ${t.judge.why}` : ""}`);
        console.log(`     ${t.text.replace(/\s+/g, " ").slice(0, 320)}`);
      });
      rows.push({ id: c.id, kind: c.kind, turns, judgeCost: cost });
    }
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
  }
  const ts = rows.flatMap((r) => (r.kind === "goal" ? r.turns.slice(0, 1) : r.turns));
  const answers = rows.flatMap((r) => r.turns).reduce((a, t) => a + t.cost, 0);
  const judging = rows.reduce((a, r) => a + r.judgeCost, 0);
  const summary = [
    `cases ${rows.filter((r) => r.turns.every((t) => t.ok)).length}/${rows.length} pass · turns ${ts.filter((t) => t.ok).length}/${ts.length}`,
    `rule checks ${rows.flatMap((r) => r.turns.flatMap((t) => t.rules)).filter((r) => r.ok).length}/${rows.flatMap((r) => r.turns.flatMap((t) => t.rules)).length}${NOJUDGE ? " · judge off" : ` · judge ${JUDGE}`}`,
    `spend: answers $${answers.toFixed(4)} + judge $${judging.toFixed(4)} = $${(answers + judging).toFixed(4)}`,
  ];
  console.log(`\n${summary.join("\n")}`);
  fs.writeFileSync(path.join(OUT, "summary.txt"), summary.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
