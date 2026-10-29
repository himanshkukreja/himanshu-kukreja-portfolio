/**
 * Course chat eval: every case in chat-cases.ts runs end to end through the same code as the route
 * (runChatCore / runMockCore: the tools, the prompts, the loop, the answer cleaning), once per model (Sonnet 5.5,
 * the chat's model, and Haiku 5.5, its fast mode). Then:
 *   - deterministic checks per turn: every cited ref resolves to a live index entry (or a site-guide topic) with
 *     the index's own link (link validity must be 100%), no URL in the text, the expected tools were called, the
 *     forbidden ones weren't; latency and cost per message;
 *   - an Opus judge scores both conversations of a case blind (A/B shuffled) against the turns' expectations.
 * Writes results.json and report.html to the output directory.
 *
 * The index comes from a running site (`next dev`): EVAL_SEARCH_ORIGIN (default http://localhost:3318). Run with the
 * read-only Supabase stand-in (tsconfig paths in the session scratchpad), so nothing touches the production DB:
 *   NODE_PATH=<stub dir with server-only> npx tsx --tsconfig <stub tsconfig> --env-file=.env --env-file=.env.local scripts/ai-eval/chat.ts <out dir> [case-id ...]
 *   EVAL_MODELS=<id>,<id>  the models (default Sonnet 5.5 and Haiku 5.5) · EVAL_NOJUDGE=1 answers only
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { callClaude } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/prices";
import { SmartEngine, transcriptDocs } from "@/lib/search/smart/engine";
import { rowToDoc, type DocIndex } from "@/lib/search/smart/types";
import type { TranscriptIndex } from "@/lib/learn/lecture/transcript";
import { getCourseMap } from "@/lib/learn/course";
import { getLearningResource } from "@/lib/github";
import { getQuestDrills } from "@/lib/learn/drills/load";
import { getQuestionBank } from "@/lib/learn/arena/bank";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import type { CourseMap } from "@/lib/learn/types";
import { runChatCore, runMockCore } from "@/lib/ai/chat/core";
import { courseMapSummary } from "@/lib/ai/chat/mapSummary";
import { buildSnapshot, type ProgressRaw } from "@/lib/ai/chat/progress-model";
import { guideTopic } from "@/lib/ai/chat/siteGuide";
import { planFor } from "@/lib/ai/chat/reviewSeams";
import type { BankItem, ChatDeps } from "@/lib/ai/chat/tools";
import type { ChatEvent, ChatRequest, ChatSource, ChatTurn, MockCard, PageContext, PathCard } from "@/lib/ai/chat/text";
import { citedRefs, historyText } from "@/lib/ai/chat/text";
import { CHAT_CASES, type ChatCase } from "./chat-cases";

const OUT = path.resolve(process.argv[2] || "chat-eval-out");
const ONLY = process.argv.slice(3);
const ORIGIN = (process.env.EVAL_SEARCH_ORIGIN || "http://localhost:3318").replace(/\/$/, "");
const MODELS_RUN = (process.env.EVAL_MODELS || `${MODELS.sonnet},${MODELS.haiku55}`).split(",").filter(Boolean);
const JUDGE = MODELS.opus;
const KEY = process.env.ANTHROPIC_API_KEY || "";

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

/** A mid-course learner: W00-W03 done, W04's first two lessons done and the third at 40%, a failed trial part, two hard review cards. */
function progressRaw(map: CourseMap, kind: "mid" | "new"): ProgressRaw {
  if (kind === "new") return { profile: { xp: 0, game_done: {}, current_streak: 0 }, rows: [], trials: [], cards: [] };
  const done: Record<string, number> = {};
  const rows: ProgressRaw["rows"] = [];
  const t = Date.parse("2026-10-20");
  for (const w of map.weeks.filter((x) => x.num < 4)) for (const l of w.lessons) done[`lesson:${l.week}/${l.slug}`] = t;
  const w4 = map.weeks.find((x) => x.num === 4)!;
  w4.lessons.slice(0, 2).forEach((l) => (done[`lesson:${l.week}/${l.slug}`] = Date.parse("2026-10-27")));
  const cur = w4.lessons[2];
  rows.push({ week: cur.week, lesson_slug: cur.slug, status: "in_progress", progress_percentage: 40, last_stage: "part-2", last_accessed_at: "2026-10-28T10:00:00Z" });
  const w3 = map.weeks.find((x) => x.num === 3)!;
  const trials = w3.trial ? [{ week: w3.trial.week, part: 2, score: 9, total: 15, passed: false }] : [];
  const cards = [
    { front: "Why does a cache stampede happen when many keys share one TTL?", week: w4.lessons[1].week, lesson_slug: w4.lessons[1].slug, box: 1, last_grade: "again", due_at: "2026-10-29" },
    { front: "Write-invalidate vs write-update: which races does each leave?", week: w4.lessons[1].week, lesson_slug: w4.lessons[1].slug, box: 2, last_grade: "hard", due_at: "2026-10-30" },
  ];
  return { profile: { xp: 4200, game_done: done, current_streak: 4 }, rows, trials, cards };
}

const DESIGN = {
  key: "problem:url-shortener",
  title: "URL shortener",
  brief: "Design a URL shortener like bit.ly: 100M new links a month, 10:1 reads to writes, links never expire, redirects under 50 ms.",
  drawing: "Boxes: Users, Load balancer, App server, PostgreSQL\nArrows: Users -> Load balancer; Load balancer -> App server; App server -> PostgreSQL",
  notes: "App server generates a random 7-char code and inserts it. On redirect it looks up the code in Postgres and returns 301.",
  updatedAt: "2026-10-28T12:00:00Z",
};

type TurnLog = { user: string; text: string; ms: number; ttft: number | null; cost: number; tools: string[]; links: number; bad: string[]; urls: boolean; toolOk: boolean | null; mode: string; error: string | null; usage: Record<string, number> };
type ModelRun = { model: string; turns: TurnLog[]; sources?: Record<string, ChatSource>; quizzes?: Record<string, unknown>; paths?: Record<string, PathCard>; mock?: unknown };
type Row = { id: string; title: string; runs: ModelRun[]; judge: unknown; judgeCost: number; order: string[] };

async function runCase(c: ChatCase, model: string, e: SmartEngine, map: CourseMap): Promise<ModelRun> {
  const sources: Record<string, ChatSource> = {};
  const quizzes: Record<string, string> = {};
  const quizCards: Record<string, unknown> = {};
  const paths: Record<string, PathCard> = {};
  const messages: ChatTurn[] = [...(c.ctx?.history ?? [])];
  let mock: (MockCard & { phase: number; turns: Record<string, ChatTurn[]> }) | null = null;
  let page: PageContext | null = null;
  if (c.ctx?.page) {
    const lesson = e.doc(c.ctx.page.lesson)!;
    const secs = e.docs.filter((d) => d.parent === lesson.id && d.kind === "section");
    const sec = c.ctx.page.section === "second" ? secs[1] : c.ctx.page.section === "first" ? secs[0] : null;
    page = { path: lesson.href, title: lesson.title, heading: sec?.title, headingId: sec ? sec.href.split("#")[1] : undefined, selection: c.ctx.page.selection };
  }
  const deps: ChatDeps = {
    engine: e,
    live: () => true,
    courseMap: async () => map,
    lessonMarkdown: async (w, s) => (await getLearningResource(w, s).catch(() => null))?.content ?? null,
    storyBody: async () => null,
    drills: (s) => getQuestDrills(s, []),
    questionBank: async () => (await getQuestionBank()).questions as BankItem[],
    progress: async () => (c.ctx?.progress ? buildSnapshot(progressRaw(map, c.ctx.progress), map, new Date("2026-10-29")) : null),
    savedPaths: async () => [],
    page,
    mock: (slug) => getMockInterview(slug),
    design: async () => (c.ctx?.design ? DESIGN : null),
    dueReviews: async () => (c.ctx?.due ? [{ kind: "review", id: "review:x", title: "Cache invalidation", href: "/learn/review", why: "2 review cards due", dueAt: "2026-10-29" }] : []),
    studyPlan: planFor,
  };
  const turns: TurnLog[] = [];
  for (const t of c.turns) {
    // the history as the page sends it (lib/ai/chat/text.ts historyText): earlier answers name their question
    messages.push({ role: "user", text: t.user, ...(t.answerTo ? { answerTo: t.answerTo } : {}) } as ChatTurn);
    const tools: string[] = [];
    const shownBefore = new Set(Object.keys(quizCards));
    let mode = "tutor";
    const emit = (ev: ChatEvent) => {
      if (ev.type === "status") tools.push(ev.tool);
      else if (ev.type === "sources") Object.assign(sources, ev.sources);
      else if (ev.type === "quiz") {
        quizzes[ev.quiz.qref] = ev.quiz.item;
        quizCards[ev.quiz.qref] = ev.quiz;
      } else if (ev.type === "graded") quizCards[ev.result.qref] = { ...(quizCards[ev.result.qref] as object), result: ev.result };
      else if (ev.type === "path") paths[ev.path.pref] = ev.path;
      else if (ev.type === "mock") mock = { ...ev.mock, phase: 0, turns: { [ev.mock.phases[0].id]: [{ role: "assistant", text: ev.mock.phases[0].opener }] } };
    };
    const m = mock as (MockCard & { phase: number; turns: Record<string, ChatTurn[]> }) | null;
    const phaseId = m ? m.phases[m.phase].id : "";
    const req: ChatRequest = {
      chat: "evalchat1",
      messages: messages.map((m, i) => ({ role: m.role, text: historyText(m as Parameters<typeof historyText>[0], quizCards as Record<string, { question: string }>, i === messages.length - 1) })),
      sources: Object.fromEntries(Object.entries(sources).map(([r, s]) => [r, s.id])),
      quizzes: { ...quizzes },
      paths: Object.fromEntries(Object.entries(paths).map(([p, x]) => [p, { title: x.title, note: x.note, steps: x.steps }])),
      answerTo: t.answerTo,
      page,
      mock: t.mock && m ? { key: m.key, phase: phaseId, history: m.turns[phaseId] ?? [], action: t.mock, ...(t.mock === "end" ? { phases: m.turns } : {}) } : null,
    };
    const t0 = Date.now();
    const r = await (req.mock ? runMockCore : runChatCore)({ deps, req, model, apiKey: KEY, map: courseMapSummary(map), memory: c.ctx?.memory ?? null, emit, deadline: Date.now() + 90_000 });
    mode = r.mode;
    // link validity: every cited ref resolves to a live index entry (or a guide topic) with the same link
    const refs = citedRefs(r.text);
    const bad = refs.filter((ref) => {
      const s = r.state.sources.get(ref);
      if (!s) return true;
      if (s.id.startsWith("G:")) return guideTopic(s.id.slice(2))?.href !== s.href;
      const d = e.doc(s.id);
      return !d || d.href !== s.href;
    });
    const called = r.loop.toolCalls.map((x) => x.name);
    const toolOk = t.tools ? (t.tools.length ? t.tools.some((x) => called.includes(x)) : called.length === 0) && !(t.noTools ?? []).some((x) => called.includes(x)) : t.noTools ? !t.noTools.some((x) => called.includes(x)) : null;
    turns.push({ user: t.user, text: r.text, ms: Date.now() - t0, ttft: r.loop.ttft === null ? null : r.loop.ttft + (r.loopAt ?? 0), cost: r.loop.costUsd, tools: called, links: refs.length, bad, urls: /https?:\/\/|www\./i.test(r.text), toolOk, mode, error: r.loop.error, usage: r.loop.usage as unknown as Record<string, number> });
    const shownNow = Object.keys(quizCards).filter((q) => !shownBefore.has(q));
    messages.push({ role: "assistant", text: r.text, ...(shownNow.length ? { quizzes: shownNow } : {}) } as ChatTurn);
    if (m && mode === "interviewer" && r.text) m.turns[phaseId] = [...(m.turns[phaseId] ?? []), { role: "user", text: t.user }, { role: "assistant", text: r.text }];
    console.log(`  ${c.id} · ${model.replace("claude-", "")} · turn ${turns.length}: ${(Date.now() - t0) / 1000}s ttft ${turns[turns.length - 1].ttft === null ? "-" : (turns[turns.length - 1].ttft! / 1000).toFixed(1)}s rounds ${r.loop.rounds} $${r.loop.costUsd.toFixed(4)} tools=[${called.join(",")}] refs=${refs.length} bad=${bad.length}${r.loop.error ? ` ERROR ${r.loop.error}` : ""}${r.loop.stop === "refusal" || r.loop.refusal ? ` REFUSAL ${r.loop.refusal}` : ""}${r.fellBack ? ` (fell back to ${r.fellBack})` : ""}`);
  }
  return { model, turns, sources, quizzes: quizCards, paths, mock };
}

async function judge(c: ChatCase, A: ModelRun, B: ModelRun) {
  const conv = (run: ModelRun) => run.turns.map((t, i) => `[turn ${i + 1}] LEARNER: ${t.user}\n[tools called: ${t.tools.join(", ") || "none"}]\nTUTOR: ${t.text || "(no answer)"}`).join("\n\n");
  const exp = c.turns.map((t, i) => `turn ${i + 1}:\n${t.expect.map((x) => `  MUST: ${x}`).join("\n")}${(t.mustNot ?? []).map((x) => `\n  MUST NOT: ${x}`).join("")}`).join("\n");
  const system = `You grade two conversations between a learner and the course tutor of the free course "System Design Mastery" (a chat that answers from the course with citations like [[s3]], builds paths, quizzes, runs mock interviews, answers questions about the site). Citations [[sN]] and [[sN, sM]] are both the correct format; the page turns them into numbered links and source cards, and a lecture moment's card opens the video at its second. Practice questions and learning paths are shown as cards on the page (the tutor shouldn't repeat them). Judge strictly against the expectations, and the house rules: concise, warm, accurate; course claims cited; honest about gaps; off-topic and injection politely refused; replies in the learner's language register. Reply with JSON only:
{"A":{"score":1-5,"expectMet":[true/false per MUST/MUST NOT line in order],"violations":["..."],"note":"one sentence"},"B":{...},"better":"A"|"B"|"tie"}`;
  const user = `CASE: ${c.title}\n${c.ctx ? `CONTEXT: ${JSON.stringify(c.ctx)}\n` : ""}EXPECTATIONS:\n${exp}\n\n=== CONVERSATION A ===\n${conv(A)}\n\n=== CONVERSATION B ===\n${conv(B)}`;
  const r = await callClaude({ feature: "eval", model: JUDGE, system, messages: [{ role: "user", content: user }], maxTokens: 1500, meta: { case: c.id, as: "chat-judge" } });
  if (!r.ok) return { j: null, cost: 0 };
  const m = r.text.match(/\{[\s\S]*\}/);
  try {
    return { j: m ? JSON.parse(m[0]) : null, cost: r.costUsd };
  } catch {
    return { j: null, cost: r.costUsd };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main() {
  if (!KEY) throw new Error("ANTHROPIC_API_KEY missing");
  fs.mkdirSync(OUT, { recursive: true });
  const [e, map] = await Promise.all([engine(), getCourseMap()]);
  if (!map) throw new Error("course map unavailable");
  console.log(`index: ${e.size} docs`);
  const cases = CHAT_CASES.filter((c) => !ONLY.length || ONLY.includes(c.id));
  const rows: Row[] = [];
  for (const c of cases) {
    const runs: ModelRun[] = [];
    for (const m of MODELS_RUN) runs.push(await runCase(c, m, e, map));
    const order = crypto.randomInt(2) ? [runs[0].model, runs[1]?.model ?? runs[0].model] : [runs[1]?.model ?? runs[0].model, runs[0].model];
    const byM = (m: string) => runs.find((r) => r.model === m)!;
    const { j, cost } = process.env.EVAL_NOJUDGE || runs.length < 2 ? { j: null, cost: 0 } : await judge(c, byM(order[0]), byM(order[1]));
    rows.push({ id: c.id, title: c.title, runs, judge: j, judgeCost: cost, order });
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
  }

  // summary per model
  const lines: string[] = [];
  let spend = 0;
  for (const m of MODELS_RUN) {
    const ts = rows.flatMap((r) => r.runs.filter((x) => x.model === m).flatMap((x) => x.turns));
    const scores = rows.map((r) => (r.judge ? ((r.judge as Record<string, { score: number }>)[r.order[0] === m ? "A" : "B"]?.score ?? null) : null)).filter((x): x is number => typeof x === "number");
    const links = ts.reduce((a, t) => a + t.links, 0);
    const bad = ts.reduce((a, t) => a + t.bad.length, 0);
    const toolChecks = ts.filter((t) => t.toolOk !== null);
    const lat = ts.map((t) => t.ms).sort((a, b) => a - b);
    const tt = ts.map((t) => t.ttft ?? t.ms).sort((a, b) => a - b);
    const cost = ts.reduce((a, t) => a + t.cost, 0);
    spend += cost;
    lines.push(
      `${m.padEnd(20)} score ${(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)).toFixed(2)} (${scores.length} cases) · links ${links - bad}/${links} valid${ts.some((t) => t.urls) ? " · URL IN TEXT" : ""} · tools ${toolChecks.filter((t) => t.toolOk).length}/${toolChecks.length} · p50 ${(lat[Math.floor(lat.length / 2)] / 1000).toFixed(1)}s p95 ${(lat[Math.floor(lat.length * 0.95)] / 1000).toFixed(1)}s · ttft p50 ${(tt[Math.floor(tt.length / 2)] / 1000).toFixed(1)}s p95 ${(tt[Math.floor(tt.length * 0.95)] / 1000).toFixed(1)}s · $${(cost / Math.max(1, ts.length)).toFixed(4)}/message · errors ${ts.filter((t) => t.error).length}`,
    );
  }
  const judgeCost = rows.reduce((a, r) => a + r.judgeCost, 0);
  spend += judgeCost;
  lines.push(`judge ${JUDGE}: $${judgeCost.toFixed(3)} · total spend $${spend.toFixed(3)}`);
  console.log(`\n${lines.join("\n")}`);
  const html = `<!doctype html><meta charset="utf-8"><title>Course chat eval</title><style>body{font:14px/1.5 system-ui;background:#000;color:#ddd;max-width:1100px;margin:auto;padding:24px}h2{color:#FF6B2B;margin-top:32px}pre{white-space:pre-wrap;background:#111;padding:10px;border:1px solid #333}.m{display:grid;grid-template-columns:1fr 1fr;gap:12px}.bad{color:#f66}.ok{color:#6c6}</style><h1>Course chat eval</h1><pre>${esc(lines.join("\n"))}</pre>${rows
    .map(
      (r) =>
        `<h2>${esc(r.id)} · ${esc(r.title)}</h2><div class="m">${r.runs
          .map((run) => {
            const jj = r.judge as Record<string, { score: number; note: string; violations: string[] }> | null;
            const side = jj ? jj[r.order[0] === run.model ? "A" : "B"] : null;
            return `<div><b>${esc(run.model)}</b> ${side ? `· judge ${side.score}/5: ${esc(side.note || "")}${side.violations?.length ? `<br><span class="bad">${esc(side.violations.join("; "))}</span>` : ""}` : ""}${run.turns
              .map((t) => `<pre><b>Learner:</b> ${esc(t.user)}\n<i>tools: ${esc(t.tools.join(", ") || "none")} · ${(t.ms / 1000).toFixed(1)} s · $${t.cost.toFixed(4)} · refs ${t.links} <span class="${t.bad.length ? "bad" : "ok"}">bad ${t.bad.length}</span> · tool check ${t.toolOk === null ? "–" : t.toolOk ? "ok" : "MISS"}</i>\n\n${esc(t.text || t.error || "(no answer)")}</pre>`)
              .join("")}</div>`;
          })
          .join("")}</div>`,
    )
    .join("")}`;
  fs.writeFileSync(path.join(OUT, "report.html"), html);
  console.log(`report: ${path.join(OUT, "report.html")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
