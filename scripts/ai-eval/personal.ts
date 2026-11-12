/**
 * Personalisation and continuity eval (AI audit 12 Nov 2026, O15): the cases in personal-cases.ts, end to end through the
 * routes' own code.
 *   chat       runChatCore with the production model (FEATURES["course-chat"], Haiku 5.5), the learner's snapshot built
 *              by buildSnapshot from a fixture (SDM progress, game_done practice keys, mock verdict flags) and the DSA
 *              digest built by the learner model's own pure builders (buildDsaProfile, dsaDigest) from fixture rows, plus
 *              memory lines: exactly the learner context a real learner with that record gets
 *   lesson-qa  the route's turn (lib/ai/askTurn.ts: the previous exchange clipped, the cap counted on the question only),
 *              the route's prompt and retrieval, and the client's thinking settings for the model
 * Checks per turn: rule checks (the case's `must` / `mustNot` regexes, no URL, every cited ref resolves, and for lesson-qa
 * the input cap) and a judge's verdict on each expectation (Sonnet 5.5 by default, one call per case; never Opus).
 * A turn passes when every rule passes and the judge finds every expectation met and nothing to avoid.
 *
 * The calls go straight to the API (runLoop for the chat, a fetch for lesson-qa and the judge): nothing is written to the
 * database. The search index comes from a running site (EVAL_SEARCH_ORIGIN, default http://localhost:3600); course content
 * from SDM_LOCAL_DIR. A server-only stub on NODE_PATH:
 *   NODE_PATH=<dir with server-only stub> npx tsx --env-file=.env --env-file=.env.local scripts/ai-eval/personal.ts <out dir> [case-id ...]
 *   EVAL_NOJUDGE=1   rule checks only (free apart from the answers)
 *   EVAL_JUDGE=<id>  the judge (default Sonnet 5.5)
 *   EVAL_MODEL=<id>  the answering model (default: each feature's own)
 */
import fs from "fs";
import path from "path";
import { answerTokens, FEATURES } from "@/lib/ai/features";
import { costOf, MODELS, type Usage } from "@/lib/ai/prices";
import { lessonQaSystem, promptOptsFor } from "@/lib/ai/prompts";
import { lessonContext } from "@/lib/ai/retrieve";
import { ASK_MODES, askCapChars, buildAskTurn, clipPrevious } from "@/lib/ai/askTurn";
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
import { buildSnapshot, dsaDigest, type ProgressRaw } from "@/lib/ai/chat/progress-model";
import { planFor } from "@/lib/ai/chat/reviewSeams";
import { ChatState, learnerContext, runTool, type BankItem, type ChatDeps } from "@/lib/ai/chat/tools";
import { citedRefs, splitFollowups, type ChatTurn } from "@/lib/ai/chat/text";
import { buildDsaProfile, type DsaIndex, type DsaLearnerRaw } from "@/lib/learner/dsa-profile";
import { PERSONAL_CASES, type LearnerKind, type PersonalCase } from "./personal-cases";

const OUT = path.resolve(process.argv[2] || "personal-eval-out");
const ONLY = process.argv.slice(3);
const ORIGIN = (process.env.EVAL_SEARCH_ORIGIN || "http://localhost:3600").replace(/\/$/, "");
const KEY = process.env.ANTHROPIC_API_KEY || "";
const JUDGE = process.env.EVAL_JUDGE || MODELS.sonnet;
const NOJUDGE = process.env.EVAL_NOJUDGE === "1";
if (/opus/.test(JUDGE)) throw new Error("this eval's judge is never Opus (owner's spend rule): use Sonnet 5.5 or EVAL_NOJUDGE=1");
const modelFor = (f: "course-chat" | "lesson-qa") => process.env.EVAL_MODEL || FEATURES[f].model;

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

/* ------------------------------------------------------------------ the learner fixtures */

const NOW = Date.now();
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

/** The fixture DSA index and rows (the learner model's shapes: lib/learner/dsa-profile.ts). */
const DSA_IX: DsaIndex = {
  problems: new Map([
    ["busiest-launch-stretch", { title: "Busiest stretch on the launch dashboard", concept: "fixed-window", level: "easy" }],
    ["compact-log-buffer", { title: "Compact the log buffer", concept: "read-write-pointers", level: "easy" }],
    ["best-distinct-bundle", { title: "Best bundle of distinct products", concept: "window-counts", level: "medium" }],
    ["fewest-moves-to-pickup", { title: "Fewest moves to a pickup point", concept: "grid-bfs", level: "easy" }],
    ["unsend-kth-newest", { title: "Unsend the k-th newest message", concept: "linked-lists", level: "easy" }],
    ["longest-calm-stretch", { title: "Longest calm stretch", concept: "variable-window", level: "medium" }],
  ]),
  concepts: new Map([
    ["fixed-window", "Fixed-size sliding window"],
    ["variable-window", "Variable-size sliding window"],
    ["window-counts", "Windows with counts"],
    ["read-write-pointers", "Read and write pointers"],
    ["grid-bfs", "BFS on a grid"],
    ["linked-lists", "Linked lists"],
  ]),
};
function dsaRaw(): DsaLearnerRaw {
  const sub = (problem_id: string, verdict: string, ago: number, language = "python") => ({ problem_id, language, verdict, created_at: iso(NOW - ago) });
  return {
    done: { "dsa:p:busiest-launch-stretch": NOW - 2 * DAY, "dsa:p:compact-log-buffer": NOW - 3 * DAY, "dsa:p:best-distinct-bundle": NOW - 3 * DAY, "dsa:p:fewest-moves-to-pickup": NOW - 2 * DAY, "dsa:p:unsend-kth-newest": NOW - 3 * DAY, "dsa:c:fixed-window": NOW - 4 * DAY },
    onboarding: null,
    rows: [],
    // newest first
    subs: [
      sub("longest-calm-stretch", "WA", DAY),
      sub("longest-calm-stretch", "WA", DAY + 60_000),
      sub("longest-calm-stretch", "TLE", DAY + 120_000),
      sub("busiest-launch-stretch", "AC", 2 * DAY, "java"),
      sub("busiest-launch-stretch", "AC", 2 * DAY + 60_000),
      sub("busiest-launch-stretch", "WA", 2 * DAY + 120_000),
      sub("busiest-launch-stretch", "WA", 2 * DAY + 180_000),
      sub("fewest-moves-to-pickup", "AC", 2 * DAY + DAY / 2),
      sub("compact-log-buffer", "AC", 3 * DAY),
      sub("compact-log-buffer", "ERR", 3 * DAY + 60_000),
      sub("best-distinct-bundle", "AC", 3 * DAY + DAY / 2),
    ],
    prog: [{ problem_id: "longest-calm-stretch", status: "attempted", editorial_viewed: true }],
  };
}

/** A mid-course SDM learner (W00-W03 cleared, W04 half way with its trial's part 1 not passed, two hard review cards),
 *  plus practice and DSA for "mixed". */
function progressRaw(map: CourseMap, kind: LearnerKind): ProgressRaw {
  if (kind === "new") return { profile: { xp: 0, game_done: {}, current_streak: 0 }, rows: [], trials: [], cards: [], flags: {}, dsa: null };
  const done: Record<string, number> = {};
  const rows: ProgressRaw["rows"] = [];
  const t = NOW - 20 * DAY;
  // W00-W03 cleared: every lesson, the capstone and every trial part
  for (const w of map.weeks.filter((x) => x.num < 4)) {
    for (const l of w.lessons) done[`lesson:${l.week}/${l.slug}`] = t;
    if (w.boss) done[`boss:${w.key}`] = t;
    for (const p of w.trial?.parts ?? []) done[`trial:${w.trial!.week}/part-${p.n}`] = t;
  }
  const w4 = map.weeks.find((x) => x.num === 4)!;
  w4.lessons.slice(0, 2).forEach((l) => (done[`lesson:${l.week}/${l.slug}`] = NOW - 5 * DAY));
  const cur = w4.lessons[2];
  rows.push({ week: cur.week, lesson_slug: cur.slug, status: "in_progress", progress_percentage: 40, last_stage: "part-2", last_accessed_at: iso(NOW - DAY) });
  // W04's trial: part 1 tried and not passed
  const trials = w4.trial ? [{ week: w4.trial.week, part: 1, score: 9, total: 15, passed: false }] : [];
  const cards = [
    { front: "Why does a cache stampede happen when many keys share one TTL?", week: w4.lessons[1].week, lesson_slug: w4.lessons[1].slug, box: 1, last_grade: "again", due_at: iso(NOW).slice(0, 10) },
    { front: "Write-invalidate vs write-update: which races does each leave?", week: w4.lessons[1].week, lesson_slug: w4.lessons[1].slug, box: 2, last_grade: "hard", due_at: iso(NOW + DAY).slice(0, 10) },
  ];
  const flags: Record<string, unknown> = {};
  let dsa = null;
  if (kind === "mixed") {
    done["lab:lru-cache"] = NOW - 4 * DAY;
    w4.lessons.slice(0, 2).forEach((l, i) => (done[`quiz:${map.courseId}/${l.week}/${l.slug}:1:${i + 1}`] = NOW - 5 * DAY));
    const m = (map.mocks ?? [])[0];
    if (m) {
      done[`mock:${m.id}`] = NOW - 6 * DAY;
      flags[`mock:${m.id}`] = { best: { at: NOW - 6 * DAY, level: "sde2", verdict: "lean-hire", pct: 62 }, last: { at: NOW - DAY, level: "sde2", verdict: "lean-no-hire", pct: 47 }, n: 2 };
    }
    const raw = dsaRaw();
    dsa = dsaDigest(raw, DSA_IX, buildDsaProfile(raw, DSA_IX, null));
  }
  return { profile: { xp: 4200, game_done: done, current_streak: 4 }, rows, trials, cards, flags, dsa };
}

/* ------------------------------------------------------------------ the judge (a direct call: nothing is metered in the DB) */

async function api(model: string, body: Record<string, unknown>): Promise<{ text: string; usage: Usage; ms: number }> {
  const t0 = Date.now();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, ...body }) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { content?: { type: string; text?: string }[]; usage?: Usage } | null;
    if ((!res || res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    return { text: (j?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), usage: j?.usage ?? {}, ms: Date.now() - t0 };
  }
}

type Judged = { expectMet: boolean[]; avoided: boolean[]; why: string };
async function judge(c: PersonalCase, context: string, turns: { user: string; text: string }[], expect: string[][], avoid: string[][]): Promise<{ j: Judged[] | null; cost: number }> {
  if (NOJUDGE) return { j: null, cost: 0 };
  const lines = turns.map((t, i) => `[turn ${i + 1}] LEARNER: ${t.user}\nTUTOR: ${t.text || "(no answer)"}\nEXPECT (each must hold):\n${expect[i].map((x, k) => `  ${k + 1}. ${x}`).join("\n")}\nAVOID (each must NOT happen):\n${(avoid[i] ?? []).map((x, k) => `  ${k + 1}. ${x}`).join("\n") || "  (none)"}`).join("\n\n");
  const user = `You grade replies of the AI tutor of "System Design Mastery" (an online course that also has a DSA course, "DSA Mastery") for one case: ${c.title}.
What the tutor knew about this learner (their own record and memory, facts):
<record>
${context || "(nothing)"}
</record>
Citations like [[s3]] or [2.4 Section title] are the correct formats. Judge each line strictly and literally; a reply that is vague where the line asks for something specific fails that line.

${lines}

Reply with JSON only: {"turns":[{"expectMet":[true|false per EXPECT line],"avoided":[true per AVOID line that was avoided, false if it happened],"why":"one sentence on any failure"}]}`;
  const r = await api(JUDGE, { max_tokens: 2000, ...(/sonnet-5/.test(JUDGE) ? { thinking: { type: "between_tools" } } : {}), system: "You are a strict, exact evaluator of an AI tutor's replies. Return only JSON.", messages: [{ role: "user", content: user }] });
  const cost = costOf(JUDGE, r.usage);
  const m = r.text.match(/\{[\s\S]*\}/);
  try {
    return { j: m ? (JSON.parse(m[0]) as { turns: Judged[] }).turns : null, cost };
  } catch {
    return { j: null, cost };
  }
}

/* ------------------------------------------------------------------ runs */

type TurnLog = { user: string; text: string; ms: number; ttft: number | null; cost: number; tools: string[]; rules: { name: string; ok: boolean }[]; judge?: Judged | null; ok: boolean };
type Row = { id: string; kind: string; title: string; turns: TurnLog[]; judgeCost: number };
const URL_RE = /https?:\/\/|www\./i;

async function runChat(c: Extract<PersonalCase, { kind: "chat" }>, e: SmartEngine, map: CourseMap): Promise<{ turns: TurnLog[]; context: string }> {
  const snap = buildSnapshot(progressRaw(map, c.learner), map, new Date(NOW));
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
  const turns: TurnLog[] = [];
  let context = "";
  for (const t of c.turns) {
    messages.push({ role: "user", text: t.user });
    const tools: string[] = [];
    const t0 = Date.now();
    const model = modelFor("course-chat");
    const r = await runChatCore({ deps, req: { chat: "evalpersonal1", messages: [...messages], sources: {}, quizzes: {}, paths: {}, page: null, mock: null }, model, apiKey: KEY, map: courseMapSummary(map), memory: c.memory ?? null, emit: (ev) => ev.type === "status" && tools.push(ev.tool), deadline: Date.now() + 90_000 });
    // the learner context the model got (the record the judge checks claims against)
    if (!context) {
      // what the tutor had: the learner context on the turn and get_progress's full record (it may call it), without
      // their refs (a fresh state numbers them differently); the refs of this answer are listed from its own state
      const st = new ChatState(deps, () => {});
      const noRefs = (x: string) => x.replace(/\[\[[^\]]*\]\]\s?|\bs\d{1,3}\s(?=[A-Z])/g, "");
      context = `${noRefs(await learnerContext(st, c.memory ?? null, false, NOW))}\n\n<get_progress>\n${noRefs(await runTool(st, "get_progress", {}))}\n</get_progress>`;
    }
    const refsOf = [...r.state.sources.entries()].map(([ref, src]) => `${ref} = ${src.kind}: ${src.title}`).join("; ");
    const refs = citedRefs(r.text);
    const bad = refs.filter((ref) => !r.state.sources.has(ref));
    const rules = [
      ...(t.must ?? []).map((re) => ({ name: `must ${re.source.slice(0, 40)}`, ok: re.test(r.text) })),
      ...(t.mustNot ?? []).map((re) => ({ name: `mustNot ${re.source.slice(0, 40)}`, ok: !re.test(r.text) })),
      { name: "no URL", ok: !URL_RE.test(r.text) },
      { name: "refs resolve", ok: !bad.length },
      { name: "answered", ok: !!r.text && !r.loop.error },
    ];
    turns.push({ user: t.user, text: `${r.text}${refsOf ? `\n\n(refs this answer could cite: ${refsOf})` : ""}`, ms: Date.now() - t0, ttft: r.loop.ttft === null ? null : r.loop.ttft + (r.loopAt ?? 0), cost: r.loop.costUsd, tools: r.loop.toolCalls.map((x) => x.name), rules, ok: false });
    messages.push({ role: "assistant", text: r.text });
  }
  return { turns, context };
}

async function runLessonQa(c: Extract<PersonalCase, { kind: "lesson-qa" }>): Promise<{ turns: TurnLog[]; context: string }> {
  const lesson = await getLearningResource(c.week, c.slug);
  if (!lesson) throw new Error(`${c.week}/${c.slug}: lesson not found`);
  const prev = clipPrevious(c.previous);
  const mode = c.mode ? ASK_MODES[c.mode] : "";
  const ask = buildAskTurn({ question: c.question, selection: "", kind: "lesson", mode, style: "", prev });
  const model = modelFor("lesson-qa");
  const ctx = { title: lesson.resource.title, text: lessonContext(lesson.content, [c.question, prev ? prev.q : ""].filter(Boolean).join(" "), ""), kind: "lesson" as const };
  const sys = lessonQaSystem(ctx, promptOptsFor(model, "lesson-qa"));
  const system = typeof sys === "string" ? [{ type: "text", text: sys }] : sys.map((b) => ({ type: "text", text: b.text }));
  // the client's settings for the feature (lib/ai/client.ts): Haiku 5.5 thinks adaptively at the feature's effort
  const h55 = /haiku-5-5/.test(model);
  const def = FEATURES["lesson-qa"];
  const thinks = h55 ? def.think : !/haiku/.test(model);
  const r = await api(model, { max_tokens: answerTokens("lesson-qa", model) + (thinks ? 3000 : 0), ...(thinks && h55 ? { thinking: { type: "adaptive" }, output_config: { effort: def.effort ?? "low" } } : !thinks && h55 ? { thinking: { type: "disabled" } } : {}), system, messages: [{ role: "user", content: ask }] });
  const { text } = splitFollowups(r.text, c.question);
  const cap = askCapChars(c.question);
  const rules = [
    { name: `cap counts the question only (${cap} ≤ ${def.maxInputChars}; the whole turn is ${ask.length})`, ok: cap <= def.maxInputChars && ask.length > cap },
    { name: "previous clipped at a sentence end", ok: !!prev && prev.a.length <= 900 && /[.!?)\]] …$|[.!?)\]]$/.test(prev.a.trim()) },
    ...(c.must ?? []).map((re) => ({ name: `must ${re.source.slice(0, 40)}`, ok: re.test(text) })),
    ...(c.mustNot ?? []).map((re) => ({ name: `mustNot ${re.source.slice(0, 40)}`, ok: !re.test(text) })),
    { name: "no URL", ok: !URL_RE.test(text) },
    { name: "answered", ok: !!text },
  ];
  return { turns: [{ user: ask.replace(/<previous_exchange[\s\S]*?<\/previous_exchange>\n\n/, "[previous exchange] "), text, ms: r.ms, ttft: null, cost: costOf(model, r.usage), tools: [], rules, ok: false }], context: `The panel's previous exchange:\nQ: ${prev?.q}\nA: ${prev?.a}` };
}

async function main() {
  if (!KEY) throw new Error("ANTHROPIC_API_KEY missing");
  fs.mkdirSync(OUT, { recursive: true });
  const cases = PERSONAL_CASES.filter((c) => !ONLY.length || ONLY.includes(c.id) || ONLY.includes(c.kind));
  const needChat = cases.some((c) => c.kind === "chat");
  const [e, map] = await Promise.all([needChat ? engine() : Promise.resolve(null), getCourseMap()]);
  if (!map) throw new Error("course map unavailable");
  const rows: Row[] = [];
  for (const c of cases) {
    const { turns, context } = c.kind === "chat" ? await runChat(c, e!, map) : await runLessonQa(c);
    const expect = c.kind === "chat" ? c.turns.map((t) => t.expect) : [c.expect];
    const avoid = c.kind === "chat" ? c.turns.map((t) => t.avoid ?? []) : [c.avoid ?? []];
    const { j, cost } = await judge(c, context, turns, expect, avoid);
    turns.forEach((t, i) => {
      t.judge = j?.[i] ?? null;
      const judgedOk = NOJUDGE ? true : !!t.judge && t.judge.expectMet.length >= expect[i].length && t.judge.expectMet.every(Boolean) && (t.judge.avoided ?? []).every(Boolean);
      t.ok = t.rules.every((r) => r.ok) && judgedOk;
      const failed = t.rules.filter((r) => !r.ok).map((r) => r.name);
      console.log(`${t.ok ? "PASS" : "FAIL"} ${c.id}#${i + 1} ${(t.ms / 1000).toFixed(1)}s $${t.cost.toFixed(4)} tools=[${t.tools.join(",")}]${failed.length ? ` rules failed: ${failed.join("; ")}` : ""}${t.judge && !t.ok ? ` judge: ${t.judge.why}` : ""}`);
      console.log(`     ${t.text.replace(/\s+/g, " ").slice(0, 300)}`);
    });
    rows.push({ id: c.id, kind: c.kind, title: c.title, turns, judgeCost: cost });
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
  }
  const ts = rows.flatMap((r) => r.turns);
  const rules = ts.flatMap((t) => t.rules);
  const exp = ts.flatMap((t) => t.judge?.expectMet ?? []);
  const answers = ts.reduce((a, t) => a + t.cost, 0);
  const judging = rows.reduce((a, r) => a + r.judgeCost, 0);
  const summary = [
    `cases ${rows.filter((r) => r.turns.every((t) => t.ok)).length}/${rows.length} pass · turns ${ts.filter((t) => t.ok).length}/${ts.length}`,
    `rule checks ${rules.filter((r) => r.ok).length}/${rules.length}${NOJUDGE ? " · judge off" : ` · judged expectations ${exp.filter(Boolean).length}/${exp.length} (${JUDGE})`}`,
    `spend: answers $${answers.toFixed(4)} + judge $${judging.toFixed(4)} = $${(answers + judging).toFixed(4)}`,
  ];
  console.log(`\n${summary.join("\n")}`);
  fs.writeFileSync(path.join(OUT, "summary.txt"), summary.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
