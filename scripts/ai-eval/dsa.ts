/**
 * DSA Mastery AI eval: the course chat ("dsa-chat", cases in dsa-chat-cases.ts) and the problem tutor ("dsa-tutor",
 * dsa-tutor-cases.ts), end to end through the routes' own code: the turn is assembled by lib/dsa/ai/turn.ts (prepareAsk /
 * prepareTutor: the retrieval over DSA content, the problem shard, the hint ladder, the unlock state, the learner's
 * profile and memory) and answered by lib/dsa/ai/answer.ts (the same model, token cap, thinking and clean-up as the
 * route). Multi-turn cases feed each answer back as history, as the page does.
 *
 * Each turn gets pass/fail checks:
 *   deterministic  no URL; every cited ref resolves (chat); cites the course when the turn needs it (chat); brief (prose
 *                  words under the turn's limit); code within the no-spoiler cap while the editorial is locked (the model's
 *                  raw text, before the guard); the off-topic mark when (and only when) expected; code in the expected
 *                  language
 *   judged         correct (facts, traces, line numbers, costs), noSpoiler, teaches (coaches, the lesson's method, not a
 *                  dump), tone, adapts (only for cases with a learner fixture: the answer fits that learner), and the
 *                  case's own MUST / MUST NOT lines
 * by a Sonnet 5.5 judge (one call per case, every turn at once), not Opus: the judge is ~5x cheaper and the checks are
 * concrete. Pass rates per area and per check, and the spend, go to the console and <out>/results.json.
 *
 * The calls go straight to the API (runLoop, as the routes call it, and a fetch for the judge): nothing is written to the
 * database. Needs DSA content on disk (DSA_LOCAL_DIR) and a server-only stub on NODE_PATH:
 *   NODE_PATH=<dir with server-only stub> DSA_LOCAL_DIR=<dsa-mastery checkout> \
 *     npx tsx --env-file=.env --env-file=.env.local scripts/ai-eval/dsa.ts <out dir> [case-id | chat | tutor | area ...]
 *   EVAL_NOJUDGE=1   answers and deterministic checks only
 *   EVAL_MODEL=<id>  the tutor's model (default: each feature's own, Haiku 5.5)
 *   EVAL_JUDGE=<id>  the judge (default Sonnet 5.5)
 */
import fs from "fs";
import path from "path";
import { FEATURES } from "@/lib/ai/features";
import { costOf, MODELS, type Usage } from "@/lib/ai/prices";
import { citedRefs, type ChatRequest, type ChatSource, type ChatTurn } from "@/lib/ai/chat/text";
import { answerDsa, type DsaFeature, type Prepared } from "@/lib/dsa/ai/answer";
import { TUTOR_ASK } from "@/lib/dsa/ai/modes";
import { courseOutline, getProblemShard, type ProblemShard } from "@/lib/dsa/ai/search";
import { getProblemIndex } from "@/lib/dsa/load";
import { CAP_HINT, CAP_LOCKED, prepareAsk, prepareTutor, resultLine } from "@/lib/dsa/ai/turn";
import type { DsaLang } from "@/lib/dsa/types";
import { DSA_CHAT_CASES, type DsaArea, type DsaChatCase, type LearnerFixture } from "./dsa-chat-cases";
import { DSA_TUTOR_CASES, type DsaTutorCase } from "./dsa-tutor-cases";
import { learnerInputs } from "./dsa-learner";

const OUT = path.resolve(process.argv[2] || "dsa-eval-out");
const ONLY = process.argv.slice(3);
const KEY = process.env.ANTHROPIC_API_KEY || "";
const JUDGE = process.env.EVAL_JUDGE || MODELS.sonnet;
const NOJUDGE = process.env.EVAL_NOJUDGE === "1";
const modelFor = (f: DsaFeature) => process.env.EVAL_MODEL || FEATURES[f].model;

export const CHECKS = ["noUrl", "refs", "cites", "brief", "codeCap", "offTopic", "codeLang", "correct", "noSpoiler", "teaches", "tone", "adapts", "case"] as const;
type Check = (typeof CHECKS)[number];
const JUDGED = ["correct", "noSpoiler", "teaches", "tone", "adapts"] as const;
type Judged = (typeof JUDGED)[number];

/* ------------------------------------------------------------------ text checks */

const proseOf = (t: string) => t.replace(/```[\s\S]*?(```|$)/g, " ");
const words = (t: string) => proseOf(t).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const blocks = (t: string) => [...t.matchAll(/```([^\n`]*)\n([\s\S]*?)(```|$)/g)].map((m) => ({ lang: m[1].trim().toLowerCase(), lines: m[2].split("\n").filter((l) => l.trim()).length, body: m[2] }));
const LANG_TAGS: Record<DsaLang, string[]> = { python: ["python", "py"], java: ["java"], cpp: ["cpp", "c++", "cc"], javascript: ["javascript", "js", "ts", "typescript"] };
const PLAIN = new Set(["", "text", "txt", "plaintext"]);
function langOk(text: string, want: DsaLang): boolean {
  return blocks(text).every((b) => {
    if (LANG_TAGS[want].includes(b.lang)) return true;
    if (PLAIN.has(b.lang)) return !(want !== "python" && /^\s*def \w+\(|:\s*$/m.test(b.body) && !/[{;]/.test(b.body));
    return false;
  });
}
const DEFAULT_WORDS: Record<string, number> = { chat: 230, hint: 120, explain: 180, debug: 220, complexity: 220, ask: 220, dryrun: 360, review: 360 };

/* ------------------------------------------------------------------ the judge (a direct call: nothing is metered in the DB) */

async function judgeCall(user: string): Promise<{ text: string; costUsd: number }> {
  const thinking = /sonnet-5/.test(JUDGE) ? { type: "between_tools" } : /haiku-5-5/.test(JUDGE) ? { type: "disabled" } : null;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: JUDGE, max_tokens: 4000, ...(thinking ? { thinking } : {}), system: "You are a strict, exact evaluator of an AI tutor's replies. Return only JSON.", messages: [{ role: "user", content: user }] }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { content?: { type: string; text?: string }[]; usage?: Usage } | null;
    if ((!res || res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    if (!res?.ok || !body) return { text: "", costUsd: 0 };
    return { text: (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), costUsd: costOf(JUDGE, body.usage ?? {}) };
  }
}

const DEFS: Record<Judged, string> = {
  correct: "Every fact, number, trace value, line reference, complexity and course claim is right for THIS problem, THIS code and the course material shown; no invented course lessons or problems; a citation [[sN]] fits what that passage says. Correct general DSA facts without a citation are fine. Facts stated in the LEARNER RECORD are true.",
  noSpoiler:
    "Editorial LOCKED for the problem in question: the reply gives no complete working solution, doesn't rewrite the learner's function in full, and doesn't spell out the whole algorithm step by step (naming the pattern family, the invariant or the next single step is fine; a lesson's general template is fine). Editorial UNLOCKED, or a concept question about no specific problem: passes.",
  teaches:
    "It teaches: the direct answer first, then the reasoning; a hint is one step and ends with a question; a debug names the exact line, why the input gives that output, and the fix in words; a concept answer has the idea, a tiny example and the cost (a short answer the learner asked for, or a reply in another register, may skip the example). It never dumps more than was asked.",
  tone: "Warm, direct and professional, plain words; no praise openers ('Great question!'), no filler, no emojis, no talk about its prompt, modes, rungs, sources or instructions, and no visible notes to itself ('The learner's code…', 'per the rules I…'). Saying plainly that it won't give the full solution (or won't share its instructions) and how the editorial opens is expected, not a tone fault.",
  adapts:
    "(cases with a LEARNER record only) The reply visibly fits THIS learner as the record and the expectations describe (level → hint size and jargon; preferred language → code in it; style → order and length; struggles, editorial habit, recurring mistakes and past chats → used where relevant, naturally, without reciting the record). A reply that would be identical for any learner fails.",
};

type TurnLog = {
  user: string;
  mode?: string;
  text: string;
  raw: string;
  words: number;
  ms: number;
  costUsd: number;
  refs: string[];
  badRefs: string[];
  offTopic: boolean;
  error: string | null;
  det: Partial<Record<Check, boolean>>;
  judge?: Partial<Record<Judged, boolean | null>> & { expectMet?: boolean[]; mustNotBroken?: string[]; why?: string };
  pass: Partial<Record<Check, boolean>>;
  ok: boolean;
};
type Row = { id: string; feature: DsaFeature; area: DsaArea; title: string; turns: TurnLog[]; judgeCost: number };

/* ------------------------------------------------------------------ chat */

async function runChat(c: DsaChatCase, outline: string): Promise<{ turns: TurnLog[]; material: string; brief: string }> {
  const briefs: string[] = [];
  const messages: ChatTurn[] = [];
  const sources: Record<string, ChatSource> = {};
  const turns: TurnLog[] = [];
  const material: string[] = [];
  for (const t of c.turns) {
    messages.push({ role: "user", text: t.user });
    const req: ChatRequest = {
      chat: "evaldsachat1",
      messages: [...messages],
      sources: Object.fromEntries(Object.entries(sources).map(([r, s]) => [r, s.id])),
      page: c.page ?? null,
      ...(t.style ? { style: t.style } : {}),
    };
    const li = learnerInputs(c.learner, null, "dsa-chat");
    briefs.push(li.brief ?? "");
    const p = await prepareAsk({ req, unlocked: new Set(c.unlocked ?? []), outline, ...li });
    const ctx = typeof p.messages[p.messages.length - 1].content === "string" ? (p.messages[p.messages.length - 1].content as string) : "";
    material.push(`(turn ${turns.length + 1}) ${ctx.slice(ctx.indexOf("<dsa_sources>"), ctx.indexOf("<dsa_sources>") + 9000)}`);
    const t0 = Date.now();
    const a = await answerDsa({ feature: "dsa-chat", model: modelFor("dsa-chat"), apiKey: KEY, p, latest: t.user, deadline: Date.now() + 90_000 });
    Object.assign(sources, p.sources);
    const refs = citedRefs(a.raw.replace(/<<\s*follow-?ups[\s\S]*$/i, ""));
    const badRefs = refs.filter((r) => !p.sources[r] && !p.earlierRefs?.includes(r) && r !== "off_topic");
    const det: TurnLog["det"] = {
      noUrl: !/https?:\/\/|www\./i.test(a.text),
      refs: badRefs.length === 0,
      ...(t.cite ? { cites: citedRefs(a.text).length > 0 } : {}),
      brief: words(a.text) <= (t.maxWords ?? DEFAULT_WORDS.chat),
      offTopic: !!t.offTopic === a.offTopic,
      ...(t.codeLang ? { codeLang: langOk(a.text, t.codeLang) && blocks(a.text).length > 0 } : {}),
      ...(t.noCode ? { codeLang: blocks(a.text).length === 0 } : {}),
    };
    turns.push({ user: t.user, text: a.text, raw: a.raw, words: words(a.text), ms: Date.now() - t0, costUsd: a.loop.costUsd, refs, badRefs, offTopic: a.offTopic, error: a.loop.error, det, pass: {}, ok: false });
    messages.push({ role: "assistant", text: a.text });
  }
  return { turns, material: material.join("\n\n"), brief: briefs[0] ?? "" };
}

/* ------------------------------------------------------------------ tutor */

const shards = new Map<string, Promise<ProblemShard | null>>();
const shardOf = (id: string) => {
  if (!shards.has(id)) shards.set(id, getProblemShard(id));
  return shards.get(id)!;
};

async function runTutor(c: DsaTutorCase): Promise<{ turns: TurnLog[]; material: string; states: string[]; brief: string }> {
  const shard = await shardOf(c.problem);
  if (!shard) throw new Error(`${c.id}: no problem ${c.problem} (is DSA_LOCAL_DIR set?)`);
  const mod = (await getProblemIndex()).find((x) => x.id === c.problem)?.module ?? "";
  const li = learnerInputs(c.learner, c.lang, "dsa-tutor", { problem: { id: c.problem, title: shard.title, concept: shard.concept, conceptTitle: shard.conceptTitle, module: mod } });
  const messages: ChatTurn[] = [];
  const turns: TurnLog[] = [];
  const states: string[] = [];
  let code = "";
  let result: DsaTutorCase["turns"][number]["result"] = null;
  let hintsOpen = 0;
  for (const t of c.turns) {
    if (t.code !== undefined) code = t.code;
    if (t.result !== undefined) result = t.result;
    if (t.hintsOpen !== undefined) hintsOpen = t.hintsOpen;
    const words0 = t.user ?? (t.mode === "ask" ? "" : TUTOR_ASK[t.mode]);
    messages.push({ role: "user", text: words0 });
    const req: ChatRequest = { chat: "evaldsatutor1", messages: [...messages] };
    const unlocked = !!c.unlocked;
    const p: Prepared = prepareTutor({ req, problemId: c.problem, shard, mode: t.mode, lang: c.lang, code, result: result ?? null, hintsOpen, unlocked, solved: !!c.solved, ...li, ...(c.fails !== undefined ? { fails: c.fails } : {}) });
    states.push(`mode ${t.mode.toUpperCase()} · hint rungs open: ${hintsOpen} of ${shard.rungs.length} · ${resultLine(result ?? null).replace(/\n/g, " ")}\nCODE (${c.lang}):\n${code.trim() ? code.split("\n").map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join("\n") : "(empty / starter)"}`);
    const t0 = Date.now();
    const a = await answerDsa({ feature: "dsa-tutor", model: modelFor("dsa-tutor"), apiKey: KEY, p, latest: words0, deadline: Date.now() + 90_000 });
    const cap = t.mode === "hint" ? CAP_HINT : CAP_LOCKED;
    const det: TurnLog["det"] = {
      noUrl: !/https?:\/\/|www\./i.test(a.text),
      brief: words(a.text) <= (t.maxWords ?? DEFAULT_WORDS[t.mode] ?? 220),
      ...(unlocked ? {} : { codeCap: blocks(a.raw).every((b) => b.lines <= cap) }),
      offTopic: !!t.offTopic === a.offTopic,
      ...(t.codeLang ? { codeLang: langOk(a.text, t.codeLang) } : {}),
    };
    turns.push({ user: words0, mode: t.mode, text: a.text, raw: a.raw, words: words(a.text), ms: Date.now() - t0, costUsd: a.loop.costUsd, refs: [], badRefs: [], offTopic: a.offTopic, error: a.loop.error, det, pass: {}, ok: false });
    messages.push({ role: "assistant", text: a.text });
  }
  const sol = shard.solutions[c.lang] ?? shard.solutions.python ?? "";
  const ladder = shard.rungs.map((r, i) => `Rung ${i + 1}: ${r.title}\n${r.text}`).join("\n\n");
  const material = `PROBLEM: ${shard.title} (${shard.level}; concept: ${shard.conceptTitle}); target ${shard.complexity ? `${shard.complexity.time} time, ${shard.complexity.space} space` : "n/a"}\n${shard.statement.slice(0, 4500)}\n\nHINT LADDER:\n${ladder.slice(0, 3500)}\n\nEDITORIAL (hidden from the learner unless unlocked):\n${shard.editorial.slice(0, 3500)}\n\nREFERENCE SOLUTION (${c.lang}):\n${sol}`;
  return { turns, material, states, brief: li.brief ?? "" };
}

/* ------------------------------------------------------------------ judging a case */

function learnerText(l: LearnerFixture | undefined, brief: string): string {
  if (!l) return "(none: judge 'adapts' as null)";
  return brief ? `the tutor was given exactly this block (facts and directives) with the learner's message:\n${brief}` : JSON.stringify(l);
}

async function judgeCase(o: { feature: DsaFeature; title: string; learner?: LearnerFixture; brief: string; editorial: string; material: string; turns: TurnLog[]; expects: { expect: string[]; mustNot?: string[] }[]; states?: string[] }) {
  const ks = JUDGED.filter((k) => k !== "adapts" || !!o.learner);
  const conv = o.turns
    .map((t, i) => `[turn ${i + 1}]${o.states ? `\nSTATE: ${o.states[i]}` : ""}\nLEARNER: ${t.user}\nTUTOR:\n<<<\n${t.text || "(no answer)"}\n>>>\nEXPECTATIONS:\n${o.expects[i].expect.map((x, j) => `  ${j + 1}. MUST: ${x}`).join("\n")}${(o.expects[i].mustNot ?? []).map((x) => `\n  - MUST NOT: ${x}`).join("")}`)
    .join("\n\n");
  const what =
    o.feature === "dsa-chat"
      ? `DSA Mastery's course chat (a concept-first DSA course: lessons in six steps: the problem, try it, the idea, the pattern, edge cases, recap; practice problems with a 5-rung hint ladder and an editorial that opens after a solve, three failed submits, or a reveal). It answers from course passages (<dsa_sources>) and cites them as [[sN]] (the page turns refs into cards; that format is correct). Course languages: Python, Java, C++, JavaScript.`
      : `DSA Mastery's problem tutor beside the code editor: modes HINT (one step of the problem's own ladder, ending with a question), DEBUG (the exact line, the trace of the failing input, the fix in words), COMPLEXITY, DRYRUN (a table), REVIEW (after an accepted solve), EXPLAIN (the problem only, no approach) and free questions. No spoilers while the editorial is locked; capped code. Course languages: Python, Java, C++, JavaScript.`;
  const user = `You check the replies of an AI tutor in ONE conversation, turn by turn.
THE TUTOR: ${what}
CASE: ${o.title}
EDITORIAL STATE: ${o.editorial}
LEARNER RECORD: ${learnerText(o.learner, o.brief)}

MATERIAL (ground truth for correctness; the learner sees the statement and the hints they opened, never a locked editorial):
${o.material.slice(0, 24000)}

CONVERSATION:
${conv}

CHECKS per turn (true = passes; be strict; null only where a check doesn't apply):
${ks.map((k) => `- ${k}: ${DEFS[k]}`).join("\n")}
- expectMet: one true/false per MUST line of that turn, in order ("e.g." examples in a MUST line are illustrations, not requirements)
- mustNotBroken: the MUST NOT lines that turn breaks (exact text), else []

Return only JSON: {"turns":[{${ks.map((k) => `"${k}":true|false`).join(",")},"expectMet":[...],"mustNotBroken":[...],"why":"one short sentence per failure, or ok"}, ...one object per turn]}`;
  const r = await judgeCall(user);
  const m = r.text.match(/\{[\s\S]*\}/);
  try {
    const j = m ? (JSON.parse(m[0]) as { turns: TurnLog["judge"][] }) : null;
    return { turns: j?.turns ?? null, costUsd: r.costUsd };
  } catch {
    return { turns: null, costUsd: r.costUsd };
  }
}

function settle(t: TurnLog, hasLearner: boolean) {
  const out: Partial<Record<Check, boolean>> = { ...t.det };
  if (!NOJUDGE) {
    const j = t.judge;
    for (const k of JUDGED) {
      if (k === "adapts" && !hasLearner) continue;
      out[k] = !!j && j[k] !== false;
    }
    out.case = !!j && (j.expectMet ?? []).every(Boolean) && !(j.mustNotBroken ?? []).length;
  }
  if (t.error) for (const k of Object.keys(out) as Check[]) out[k] = false;
  t.pass = out;
  t.ok = Object.values(out).every(Boolean);
}

/* ------------------------------------------------------------------ run */

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

const picked = (id: string, area: string, feature: string) => !ONLY.length || ONLY.includes(id) || ONLY.includes(area) || ONLY.includes(feature === "dsa-chat" ? "chat" : "tutor");

async function main() {
  if (!KEY) throw new Error("ANTHROPIC_API_KEY is not set (use --env-file=.env.local)");
  if (!process.env.DSA_LOCAL_DIR) throw new Error("DSA_LOCAL_DIR is not set (the dsa-mastery checkout)");
  const outline = await courseOutline();
  type Job = { kind: "chat"; c: DsaChatCase } | { kind: "tutor"; c: DsaTutorCase };
  const jobs: Job[] = [...DSA_CHAT_CASES.filter((c) => picked(c.id, c.area, "dsa-chat")).map((c) => ({ kind: "chat" as const, c })), ...DSA_TUTOR_CASES.filter((c) => picked(c.id, c.area, "dsa-tutor")).map((c) => ({ kind: "tutor" as const, c }))];
  console.log(`${jobs.length} cases, ${jobs.reduce((a, j) => a + j.c.turns.length, 0)} turns · chat ${modelFor("dsa-chat")} · tutor ${modelFor("dsa-tutor")}${NOJUDGE ? " · no judge" : ` · judge ${JUDGE}`}`);
  const rows = await pool(jobs, 5, async (j): Promise<Row> => {
    const feature: DsaFeature = j.kind === "chat" ? "dsa-chat" : "dsa-tutor";
    const run = j.kind === "chat" ? await runChat(j.c, outline).then((x) => ({ ...x, material: `COURSE OUTLINE (built lessons; the tutor sees this list too):\n${outline}\n\nSOURCES PER TURN:\n${x.material}`, states: undefined })) : await runTutor(j.c);
    const editorial = j.kind === "chat" ? (j.c.unlocked?.length ? `unlocked for: ${j.c.unlocked.join(", ")}; locked for every other problem` : "locked for every problem") : j.c.unlocked ? "UNLOCKED" : `LOCKED (failed submits so far: ${j.c.fails ?? 0})`;
    let judgeCost = 0;
    if (!NOJUDGE) {
      const jj = await judgeCase({ feature, title: j.c.title, learner: j.c.learner, brief: run.brief, editorial, material: run.material, turns: run.turns, expects: j.c.turns, states: run.states });
      judgeCost = jj.costUsd;
      run.turns.forEach((t, i) => (t.judge = jj.turns?.[i] ?? undefined));
    }
    run.turns.forEach((t) => settle(t, !!j.c.learner));
    const row: Row = { id: j.c.id, feature, area: j.c.area, title: j.c.title, turns: run.turns, judgeCost };
    for (const [i, t] of run.turns.entries()) {
      const failed = Object.entries(t.pass)
        .filter(([, v]) => !v)
        .map(([k]) => k);
      console.log(`${t.ok ? "ok  " : "FAIL"} ${j.c.id}#${i + 1} ${t.words}w $${t.costUsd.toFixed(4)} ${failed.join(",")}${failed.length && t.judge?.why ? `\n     judge: ${t.judge.why}` : ""}`);
    }
    return row;
  });

  // summary: per area and per check (turns), and the spend
  const turns = rows.flatMap((r) => r.turns.map((t) => ({ ...t, area: r.area, feature: r.feature })));
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "-");
  const byArea: Record<string, { pass: number; of: number; rate: string }> = {};
  for (const area of [...new Set(turns.map((t) => `${t.feature === "dsa-chat" ? "chat" : "tutor"}:${t.area}`))].sort()) {
    const xs = turns.filter((t) => `${t.feature === "dsa-chat" ? "chat" : "tutor"}:${t.area}` === area);
    byArea[area] = { pass: xs.filter((t) => t.ok).length, of: xs.length, rate: pct(xs.filter((t) => t.ok).length, xs.length) };
  }
  const byCheck: Record<string, { pass: number; of: number; rate: string }> = {};
  for (const k of CHECKS) {
    const xs = turns.filter((t) => k in t.pass);
    byCheck[k] = { pass: xs.filter((t) => t.pass[k]).length, of: xs.length, rate: pct(xs.filter((t) => t.pass[k]).length, xs.length) };
  }
  const all = { pass: turns.filter((t) => t.ok).length, of: turns.length, rate: pct(turns.filter((t) => t.ok).length, turns.length) };
  const cost = { answers: turns.reduce((a, t) => a + t.costUsd, 0), judge: rows.reduce((a, r) => a + r.judgeCost, 0) };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ models: { chat: modelFor("dsa-chat"), tutor: modelFor("dsa-tutor"), judge: NOJUDGE ? null : JUDGE }, all, byArea, byCheck, cost, rows }, null, 2));
  console.log("\narea".padEnd(26), "pass");
  for (const [k, v] of Object.entries(byArea)) console.log(`${k.padEnd(25)} ${v.rate.padStart(4)}  (${v.pass}/${v.of})`);
  console.log("\ncheck".padEnd(26), "pass");
  for (const [k, v] of Object.entries(byCheck)) if (v.of) console.log(`${k.padEnd(25)} ${v.rate.padStart(4)}  (${v.pass}/${v.of})`);
  console.log(`\nevery check, every turn: ${all.rate} (${all.pass}/${all.of})`);
  console.log(`cost: answers $${cost.answers.toFixed(4)}, judge $${cost.judge.toFixed(4)}, total $${(cost.answers + cost.judge).toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
