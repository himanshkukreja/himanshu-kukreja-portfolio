/**
 * LLD (machine-coding) mock interviewer eval ("lld-mock"): every case in lld-mock-cases.ts is one candidate turn on a
 * real case study (parking lot, elevator, digital wallet), built exactly as /api/learn/ai/mock/turn builds it
 * (buildLldMock → withChange → lldTurnInput → lldInterviewerSystem, the phase's history, the feature's model, token cap
 * and thinking setting, and lldInterviewerReply on the way out). Each reply then gets per-check pass/fail:
 *   deterministic: at most one question mark; brief (≤ 80 words, ≤ 4 sentences, like the HLD interviewer's house rule);
 *                  no code (fences, method bodies, assignments);
 *   an Opus judge: one question (one ask), never gives classes / patterns / code / the fix, no lecture (doesn't explain
 *                  what is wrong or how something works), grounded (only the case study's own facts; clarifying questions
 *                  answered from its requirements, "not specified" otherwise), pushes back on a wrong claim with a
 *                  question, stays in character, the requirement change brought when due (and never before, nor again),
 *                  and the case's own expectations.
 * Pass rates per check and overall (every applicable check passes) go to the console and <out dir>/results.json.
 *
 * The calls go straight to the API with the request callClaude would send (same model, max_tokens, thinking, cached
 * system blocks), not through callClaude, so the eval writes nothing to the database (no ai_calls rows); its cost is
 * computed with prices.ts and printed.
 *
 * usage: NODE_PATH=<dir with a server-only stub> SDM_LOCAL_DIR=<system-design-mastery checkout> \
 *          npx tsx --env-file=.env.local scripts/ai-eval/lld-mock.ts <out dir> [case-id | slug ...]
 *   EVAL_REPEAT=<n>     samples per case (default 1)
 *   EVAL_NOJUDGE=1      replies and deterministic checks only (cheap prompt iterations you read yourself)
 *   EVAL_MODEL=<id>     the interviewer's model (default: the feature's, Haiku 5.5)
 *   EVAL_JUDGE=<id>     the judge (default Opus 5.5; the nightly run uses Sonnet 5.5)
 */
import fs from "fs";
import path from "path";
import { answerTokens, FEATURES } from "@/lib/ai/features";
import { costOf, MODELS, type Usage } from "@/lib/ai/prices";
import { lldInterviewerReply, lldInterviewerSystem, type PromptBlock } from "@/lib/ai/prompts";
import { lldTurnInput } from "@/lib/ai/mock";
import { buildLldMock } from "@/lib/learn/mock/lld-load";
import { withChange } from "@/lib/learn/mock/lld";
import type { MockInterview } from "@/lib/learn/mock/types";
import { LLD_CASES, type LldEvalCase } from "./lld-mock-cases";

const OUT = path.resolve(process.argv[2] || "lld-mock-eval-out");
const ONLY = process.argv.slice(3);
const MODEL = process.env.EVAL_MODEL || FEATURES["lld-mock"].model;
/** the judge: Opus by default (the tuning runs of 12 Nov 2026); the nightly run sets EVAL_JUDGE to Sonnet 5.5 */
const JUDGE = process.env.EVAL_JUDGE || MODELS.opus;
const REPEAT = Math.max(1, Number(process.env.EVAL_REPEAT) || 1);
const NOJUDGE = process.env.EVAL_NOJUDGE === "1";
const KEY = process.env.ANTHROPIC_API_KEY || "";
const API = "https://api.anthropic.com/v1/messages";
/** the HLD interviewer's house rule ("about 80 words at most"), plus a sentence cap for speech */
const MAX_WORDS = 80;
const MAX_SENTENCES = 4;

export const CHECKS = ["oneQuestion", "brief", "noSolution", "noLecture", "grounded", "pushback", "inCharacter", "change", "case"] as const;
type Check = (typeof CHECKS)[number];
const LABEL: Record<Check, string> = {
  oneQuestion: "at most one question",
  brief: `brief (≤ ${MAX_WORDS} words, ≤ ${MAX_SENTENCES} sentences)`,
  noSolution: "no classes, code or solution",
  noLecture: "no lecture / over-explaining",
  grounded: "grounded in the case's requirements",
  pushback: "wrong claim: pushback by question",
  inCharacter: "stays in character",
  change: "requirement change right",
  case: "case expectations",
};

// ---------------------------------------------------------------- the API, as callClaude calls it (no DB)
type ApiResult = { ok: true; text: string; usage: Usage; stop: string; costUsd: number; ms: number } | { ok: false; error: string; costUsd: 0; ms: number };
async function api(model: string, system: PromptBlock[] | string, messages: { role: string; content: string }[], maxTokens: number, think: boolean): Promise<ApiResult> {
  const haiku55 = /haiku-5-5/.test(model);
  const canSkip = /sonnet-5/.test(model);
  // callClaude: Haiku 5.5 is told not to think when the feature doesn't, Sonnet 5.x thinks only between tools; Opus may
  const thinking = haiku55 ? (think ? { type: "adaptive" } : { type: "disabled" }) : canSkip && !think ? { type: "between_tools" } : null;
  const sys = typeof system === "string" ? system : system.map((b) => ({ type: "text", text: b.text, ...(b.cache ? { cache_control: { type: "ephemeral" } } : {}) }));
  const t0 = Date.now();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, ...(thinking ? { thinking } : {}), system: sys, messages }),
    }).catch((e: Error) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }) as unknown as Response);
    const body = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; usage?: Usage; stop_reason?: string; error?: { message?: string } } | null;
    if ((res.status === 429 || res.status === 529 || res.status >= 500 || res.status === 0) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok || !body) return { ok: false, error: body?.error?.message || `HTTP ${res.status}`, costUsd: 0, ms: Date.now() - t0 };
    const usage = body.usage ?? {};
    const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    return { ok: true, text, usage, stop: body.stop_reason ?? "", costUsd: costOf(model, usage), ms: Date.now() - t0 };
  }
}

/** callClaude's: an answer cut off at max_tokens is kept up to its last complete sentence */
function trimCutOff(text: string): string {
  const t = text.trimEnd();
  const m = t.match(/^[\s\S]*[.!?)\]`](?=\s|$)/);
  return m && m[0].length > t.length * 0.4 ? m[0] : `${t}…`;
}

// ---------------------------------------------------------------- the turn, as the route builds it
const built = new Map<string, Promise<MockInterview | null>>();
async function mockOf(slug: string): Promise<MockInterview> {
  if (!built.has(slug)) built.set(slug, buildLldMock(slug));
  const m = await built.get(slug)!;
  if (!m) throw new Error(`${slug}: no LLD mock (is SDM_LOCAL_DIR the content repo's root?)`);
  return m;
}

async function turnOf(c: LldEvalCase) {
  const mock = withChange(await mockOf(c.slug), c.change?.id ?? null);
  const phase = mock.phases.find((p) => p.id === c.phase);
  if (!phase) throw new Error(`${c.id}: no phase ${c.phase}`);
  const chosen = mock.phases.find((p) => p.id === mock.lld!.codePhase)!.curveballs[0];
  if (c.change && chosen?.id !== c.change.id) throw new Error(`${c.id}: no change ${c.change.id}`);
  const input = lldTurnInput(mock, phase, !!c.change?.announced, c.history ?? []);
  return { mock, phase, input, change: chosen, system: lldInterviewerSystem(input), messages: [...(c.history ?? []), { role: "user" as const, content: c.input }] };
}

// ---------------------------------------------------------------- deterministic checks
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const sentences = (t: string) => (t.replace(/\b(e\.g|i\.e|vs|etc)\./gi, "$1").match(/[.!?…]+(?=\s|$)/g) ?? []).length || (t.trim() ? 1 : 0);
const questionMarks = (t: string) => (t.match(/\?/g) ?? []).length;
const CODE = /```|^\s*(def|class|with|for|if|while|elif|else|try)\b[^\n]*:\s*$|^\s*(public|private|func|fn|function)\b|[{};]\s*$|\b(self|this)\.\w+\s*[-+*/]?=(?!=)/m;

// ---------------------------------------------------------------- the judge
const DEFS: Record<Exclude<Check, "brief" | "case">, string> = {
  oneQuestion: "The reply asks the candidate for at most ONE thing. Fails: two question marks; a question plus a second ask ('…? Also …', '…? Walk me through …', 'X, and why?' asking two things); a list of questions. One question about one moment passes; a reply with no question passes.",
  noSolution: "The reply gives none of the design away: names no class, interface, enum, data structure, pattern, algorithm, lock placement or lock order that the candidate hasn't said themselves (names from PROBLEM or REQUIREMENTS are fine), writes no code, pseudo-code or method signature, and doesn't state the fix or describe the reference design.",
  noLecture: "The reply doesn't teach or over-explain: no explanation of why the candidate's claim is wrong, of how a concept works (the GIL, atomicity, floating point, deadlock, a pattern's trade-off) or of what they should do. Setting up one concrete moment in a clause or sentence is fine.",
  grounded: "Every fact the reply states comes from PROBLEM, REQUIREMENTS or the candidate's words: no invented numbers, rules, limits or scope. For a clarifying question: it answers what was asked, in the requirements' own sense (not the whole table, not other rows), and when the requirements don't cover it, says it isn't specified and asks them to assume.",
  pushback: "(wrong-claim turns) The reply doesn't accept the wrong claim: it names a concrete case or moment where the claim breaks and asks about it as a question, without saying the claim is wrong and why, and without correcting it.",
  inCharacter: "The reply is the named interviewer speaking to the candidate: plain speech, no markdown lists or headings, no mention of being an AI, a prompt, a plan, a rubric, a checklist or a reference design, no grading or praise beyond one short 'Good: …' when moving on. An off-topic remark is steered back to the round in character (a bare refusal or 'OFF_TOPIC' fails unless the case says it is acceptable).",
  change: "(code phase and after) If the case says the change is DUE and the candidate hasn't said how their code absorbs it: the reply retells the change briefly and asks how their code absorbs it (e.g. which classes change). If its status is 'not yet': the reply never mentions or hints at that change. If the candidate already handled it, or the phase is after the code phase: the reply doesn't bring it up again as a new requirement.",
};

type Judged = Partial<Record<Exclude<Check, "brief">, boolean | null>> & { expectMet?: boolean[]; mustNotBroken?: string[]; why?: string };

function applies(c: LldEvalCase): Check[] {
  return CHECKS.filter((k) => (k === "pushback" ? c.kind === "wrong-claim" : k === "change" ? !!c.change : true));
}

async function judge(c: LldEvalCase, t: Awaited<ReturnType<typeof turnOf>>, reply: string): Promise<{ j: Judged | null; costUsd: number }> {
  const ks = applies(c).filter((k): k is Exclude<Check, "brief" | "case"> => k !== "brief" && k !== "case");
  const changeLine = !t.change ? "(none)" : `status: ${!c.change ? "n/a" : t.input.change ? t.input.change.status : "not in this phase"}${c.phase === "p5" ? " (this is the phase AFTER the code phase: the change was brought earlier)" : ""}${c.kind === "change-due" ? "; the case says it is DUE now" : ""}\ntext: ${t.change.text}`;
  const transcript = [...(c.history ?? []).map((m) => `${m.role === "user" ? "CANDIDATE" : "INTERVIEWER"}: ${m.content}`), `CANDIDATE: ${c.input}`].join("\n\n");
  const user = `You check ONE reply of an AI interviewer in a machine-coding (low-level design) mock interview. The interviewer is ${t.input.interviewer} at ${t.input.company}. Its job: answer clarifying questions from the case study's requirements, never give the design or code, ask ONE short question per turn, push back on wrong claims with a question, stay in character, and bring the requirement change only when it is due.

PROBLEM:
${t.input.problem}

REQUIREMENTS (what the interviewer may answer from):
${t.input.requirements}

PHASE: ${t.input.phase.title}
PHASE QUESTIONS:
${t.input.phase.questions}

HIDDEN RUBRIC (the candidate must not be told these):
${t.input.phase.rubric}

HIDDEN REFERENCE DESIGN (must never be named or described to the candidate):
${t.input.reference.slice(0, 3500)}

REQUIREMENT CHANGE:
${changeLine}

TURN TYPE: ${c.kind}
CASE: ${c.title}

CONVERSATION (the reply answers the last CANDIDATE turn):
${transcript}

THE REPLY:
<<<
${reply}
>>>

THIS CASE'S EXPECTATIONS:
${c.expect.map((e, i) => `${i + 1}. ${e}`).join("\n")}
${c.mustNot?.length ? `IT MUST NOT:\n${c.mustNot.map((e) => `- ${e}`).join("\n")}` : ""}
${c.offTopicOk ? "For this case a reply of exactly OFF_TOPIC is acceptable." : ""}

CHECKS (true = passes, false = fails; be strict):
${ks.map((k) => `- ${k}: ${DEFS[k]}`).join("\n")}

Return only JSON: {${ks.map((k) => `"${k}":true|false`).join(",")},"expectMet":[true|false per expectation],"mustNotBroken":["each MUST NOT line the reply breaks"],"why":"one sentence on every failure, or ok"}`;
  const r = await api(JUDGE, "You are a strict, exact evaluator. Return only JSON.", [{ role: "user", content: user }], 3000, false);
  if (!r.ok) return { j: null, costUsd: 0 };
  const m = r.text.match(/\{[\s\S]*\}/);
  try {
    return { j: m ? (JSON.parse(m[0]) as Judged) : null, costUsd: r.costUsd };
  } catch {
    return { j: null, costUsd: r.costUsd };
  }
}

// ---------------------------------------------------------------- run
type Sample = { id: string; slug: string; phase: string; kind: string; sample: number; input: string; reply: string; raw: string; offTopic: boolean; words: number; sentences: number; qmarks: number; code: boolean; costUsd: number; judgeCost: number; ms: number; stop: string; judge: Judged | null; pass: Partial<Record<Check, boolean>> };

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

async function runOne(c: LldEvalCase, sample: number): Promise<Sample> {
  const t = await turnOf(c);
  const f = FEATURES["lld-mock"];
  const r = await api(MODEL, t.system, t.messages, answerTokens("lld-mock", MODEL), f.think);
  const raw = r.ok ? r.text : `[error] ${r.error}`;
  // callClaude turns a leading OFF_TOPIC (after a plan line, if any) into the route's refusal, outside the conversation
  const offTopic = r.ok && /^\s*(<plan>[\s\S]*?<\/plan>\s*)?OFF_TOPIC\b/.test(raw);
  const reply = !r.ok ? raw : offTopic ? "OFF_TOPIC" : lldInterviewerReply(r.stop === "max_tokens" ? trimCutOff(raw) : raw, t.mock.interviewer.name);
  const s: Sample = { id: c.id, slug: c.slug, phase: c.phase, kind: c.kind, sample, input: c.input, reply, raw, offTopic, words: words(reply), sentences: sentences(reply), qmarks: questionMarks(reply), code: CODE.test(reply), costUsd: r.costUsd, judgeCost: 0, ms: r.ms, stop: r.ok ? r.stop : "error", judge: null, pass: {} };
  const det = { oneQuestion: s.qmarks <= 1, brief: s.words <= MAX_WORDS && s.sentences <= MAX_SENTENCES, noSolution: !s.code };
  if (!NOJUDGE && r.ok) {
    const j = await judge(c, t, reply);
    s.judge = j.j;
    s.judgeCost = j.costUsd;
  }
  for (const k of applies(c)) {
    const jv = s.judge ? (k === "case" ? (s.judge.expectMet ?? []).every(Boolean) && !(s.judge.mustNotBroken ?? []).length : k === "brief" ? true : s.judge[k] !== false) : true;
    const offOk = !(offTopic && !c.offTopicOk && k === "inCharacter");
    s.pass[k] = r.ok && offOk && (k in det ? det[k as keyof typeof det] : true) && (NOJUDGE ? true : !!s.judge && jv);
  }
  return s;
}

function summary(rows: Sample[]) {
  const out: Record<string, { pass: number; of: number; rate: string }> = {};
  for (const k of CHECKS) {
    const xs = rows.filter((r) => k in r.pass);
    const p = xs.filter((r) => r.pass[k]).length;
    out[k] = { pass: p, of: xs.length, rate: xs.length ? `${Math.round((100 * p) / xs.length)}%` : "-" };
  }
  const all = rows.filter((r) => Object.values(r.pass).every(Boolean)).length;
  out.all = { pass: all, of: rows.length, rate: `${Math.round((100 * all) / rows.length)}%` };
  return out;
}

async function main() {
  if (!KEY) throw new Error("ANTHROPIC_API_KEY is not set (use --env-file=.env.local)");
  const cases = LLD_CASES.filter((c) => !ONLY.length || ONLY.includes(c.id) || ONLY.includes(c.slug));
  const jobs = cases.flatMap((c) => Array.from({ length: REPEAT }, (_, i) => ({ c, i })));
  console.log(`${jobs.length} turns (${cases.length} cases x ${REPEAT}) on ${MODEL}${NOJUDGE ? ", no judge" : `, judged by ${JUDGE}`}`);
  const rows = await pool(jobs, 6, async ({ c, i }) => {
    const s = await runOne(c, i);
    const failed = Object.entries(s.pass)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    console.log(`${failed.length ? "FAIL" : "ok  "} ${c.id}#${i} ${s.words}w ${s.qmarks}? ${failed.join(",")}\n     ${s.reply.replace(/\n+/g, " / ")}${s.judge?.why && failed.length ? `\n     judge: ${s.judge.why}` : ""}`);
    return s;
  });
  const sum = summary(rows);
  const cost = { interviewer: rows.reduce((a, r) => a + r.costUsd, 0), judge: rows.reduce((a, r) => a + r.judgeCost, 0) };
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ model: MODEL, judge: NOJUDGE ? null : JUDGE, repeat: REPEAT, summary: sum, cost, rows }, null, 2));
  console.log("\ncheck".padEnd(42), "pass");
  for (const k of [...CHECKS, "all"] as const) console.log(`${(k === "all" ? "every applicable check" : LABEL[k as Check]).padEnd(41)} ${sum[k].rate.padStart(4)}  (${sum[k].pass}/${sum[k].of})`);
  console.log(`\ncost: interviewer $${cost.interviewer.toFixed(4)} ($${(cost.interviewer / rows.length).toFixed(5)} a turn), judge $${cost.judge.toFixed(4)}; p50 ${ms[Math.floor(ms.length / 2)]} ms, max ${ms[ms.length - 1]} ms`);
  console.log(`words: mean ${(rows.reduce((a, r) => a + r.words, 0) / rows.length).toFixed(1)}, max ${Math.max(...rows.map((r) => r.words))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
