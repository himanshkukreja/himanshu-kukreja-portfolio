/**
 * Model evaluation: every case in cases.ts goes to each candidate model with the production prompts,
 * then a judge model scores both answers blind (shuffled, unlabelled) against the case's expectations.
 * Writes results.json (with the model mapping) and review.html (blind pairs for the owner's own picks).
 * Every call goes through src/lib/ai/client.ts as feature "eval", so it is metered on /admin/ai.
 *
 * Fidelity: each case is built the way its route builds the request (same prompt builder, same user
 * message shape, same history, the feature's own thinking setting), and the system prompt is chosen by
 * the model being tested (promptOptsFor), exactly as callClaude does in production. Mock cases can name
 * a real mock and phase (ctx.mock, ctx.phase): the eval then parses that mock file from the content repo.
 *
 * usage: NODE_PATH=<stub with server-only> npx tsx --env-file=.env --env-file=.env.local scripts/ai-eval/run.ts <out dir> [case-id | feature ...]
 *   EVAL_PROMPT=compact | shared       give every model the Haiku-tuned prompts (does Sonnet gain from them too?), or
 *                                      every model the original prompts (the baseline the tuning is measured against)
 *   EVAL_REUSE=<results.json[,more]>  reuse answers whose request is byte-identical (and their judging when
 *                                      both answers are unchanged): rounds that only change one model's prompt
 *                                      then pay for that model and the judge only.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { callClaude, type AiMessage } from "@/lib/ai/client";
import { FEATURES } from "@/lib/ai/features";
import { MODELS } from "@/lib/ai/prices";
import {
  canvasReviewSystem,
  designReviewSystem,
  explainBackSystem,
  labHintSystem,
  labReviewSystem,
  lessonQaSystem,
  mockCoachSystem,
  mockFullScorecardSystem,
  mockInterviewerSystem,
  promptOptsFor,
  stripPrivatePlan,
  warRoomPromptInput,
  warRoomSystem,
  type MockPhase,
} from "@/lib/ai/prompts";
import { lessonContext } from "@/lib/ai/retrieve";
import { problemText, promptPhase } from "@/lib/ai/mock";
import { buildMock } from "@/lib/learn/mock/load";
import { parseLab } from "@/lib/learn/labs/parse";
import { parseWarRoom } from "@/lib/learn/war/parse";
import { parseCatalogue } from "@/lib/concepts/catalogue";
import { TEMPLATES } from "@/lib/design-week/templates";
import { briefFromMarkdown } from "@/lib/learn/canvas";
import type { MockInterview } from "@/lib/learn/mock/types";
import { CASES, type EvalCase } from "./cases";

const OUT = path.resolve(process.argv[2] || "ai-eval-out");
const ONLY = process.argv.slice(3);
const CONTENT = process.env.SDM_LOCAL_DIR || path.resolve(process.cwd(), "..", "system-design-mastery");
const CANDIDATES = [MODELS.haiku, MODELS.sonnet];
const JUDGE = MODELS.opus;
const REUSE: Row[] = (process.env.EVAL_REUSE || "")
  .split(",")
  .filter(Boolean)
  .flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Row[]);

const optsFor = (model: string) => (process.env.EVAL_PROMPT === "compact" ? { compact: true } : process.env.EVAL_PROMPT === "shared" ? { compact: false } : promptOptsFor(model));

const s = (v: unknown) => (Array.isArray(v) ? v.join("\n") : typeof v === "string" ? v : v == null ? "" : String(v));
const read = (rel: string) => fs.readFileSync(path.join(CONTENT, "resources", rel), "utf8");
const sha = (t: string) => crypto.createHash("sha1").update(t).digest("hex").slice(0, 16);

// ---------------------------------------------------------------- content, parsed with the site's own code
const mocks = new Map<string, Promise<MockInterview>>();
function mockOf(slug: string): Promise<MockInterview> {
  if (!mocks.has(slug)) mocks.set(slug, buildMock({ slug, n: 1, path: "", md: read(`mock-interviews/${slug}.md`) }, { weeks: [], sideQuests: [] }));
  return mocks.get(slug)!;
}
const plainMd = (md: string) => md.replace(/:::[\w-]*(\[[^\]]*\])?(\{[^}]*\})?/g, "").replace(/\*\*/g, "").replace(/\n{3,}/g, "\n\n").trim();

type Ctx = { company: string; interviewer: string; problem: string; phase: MockPhase };
/** A mock phase as the routes send it: from a real mock (ctx.mock + ctx.phase), or inline (older cases). */
async function mockCtx(c: EvalCase): Promise<Ctx & { mock?: MockInterview }> {
  const x = c.ctx;
  if (x.mock) {
    const m = await mockOf(s(x.mock));
    const p = m.phases.find((q) => q.id === s(x.phase)) ?? m.phases[0];
    return { company: m.company.name, interviewer: `${m.interviewer.name}, ${m.interviewer.title}`, problem: problemText(m), phase: promptPhase(p), mock: m };
  }
  return {
    company: s(x.company),
    interviewer: s(x.interviewer),
    problem: s(x.problem),
    phase: { title: s(x.phaseTitle), interviewer: s(x.phaseQuestions), curveballs: s(x.curveballs), rubric: s(x.rubric), modelAnswer: s(x.modelAnswer) },
  };
}

/** `post`: what the route does to the model's text before the learner sees it */
type Built = { system: (model: string) => string; messages: AiMessage[]; context: string; post?: (text: string) => string };

/** The request exactly as the feature's route builds it, for any model. `context` is what the judge sees of the material. */
async function build(c: EvalCase): Promise<Built> {
  const x = c.ctx;
  const one = (content: string): AiMessage[] => [...(c.history ?? []), { role: "user", content }];
  switch (c.feature) {
    case "lab-hint":
    case "lab-review": {
      let title = s(x.labTitle);
      let brief = s(x.brief);
      if (x.lab) {
        const lab = parseLab(read(`labs/${s(x.lab)}.md`), `${s(x.lab)}.md`);
        title = lab.title;
        brief = `${lab.summary}\n\n${plainMd(lab.brief).slice(0, 4000)}`;
      }
      const user =
        c.feature === "lab-review"
          ? `My solution passes every test. Review it.\n\n\`\`\`python\n${s(x.code)}\n\`\`\``
          : x.code
            ? `Hint level ${s(x.level) || "1"}.\n\nMy code:\n\`\`\`python\n${s(x.code)}\n\`\`\`\n\n${x.setup ? `It doesn't load: ${s(x.setup)}` : `Failing:\n${s(x.failures) || "- (no details)"}`}`
            : `Hint level ${s(x.level)}.\n\n${c.input}`;
      const sys = c.feature === "lab-review" ? labReviewSystem : labHintSystem;
      return { system: (m) => sys({ title, brief }, optsFor(m)), messages: one(user), context: `LAB: ${title}\n${brief.slice(0, 2500)}` };
    }
    case "explain-back": {
      let term = s(x.term);
      let keyPoints = (x.keyPoints as string[]) ?? [];
      if (x.concept) {
        const cat = parseCatalogue(read("concepts/concepts.yml")).catalogue;
        const k = cat.concepts.find((q) => q.id === s(x.concept));
        if (!k) throw new Error(`unknown concept ${s(x.concept)}`);
        term = k.term;
        keyPoints = [k.definition, ...k.refresher];
      }
      return { system: (m) => explainBackSystem({ term, keyPoints }, optsFor(m)), messages: one(c.input), context: `CONCEPT: ${term}\nKEY POINTS:\n${keyPoints.map((k) => `- ${k}`).join("\n")}` };
    }
    case "mock-interviewer": {
      const m = await mockCtx(c);
      return {
        system: (model) => mockInterviewerSystem({ company: m.company, interviewer: m.interviewer, problem: m.problem, phase: m.phase }, optsFor(model)),
        messages: one(c.input),
        post: stripPrivatePlan,
        context: `PROBLEM:\n${m.problem}\n\nPHASE: ${m.phase.title}\nTHE PHASE'S QUESTIONS AND FACTS THE INTERVIEWER MAY GIVE:\n${m.phase.interviewer}\nCURVEBALLS:\n${m.phase.curveballs}\nRUBRIC (hidden from the candidate):\n${m.phase.rubric}`,
      };
    }
    case "mock-coach": {
      const m = await mockCtx(c);
      return {
        system: (model) => mockCoachSystem({ company: m.company, problem: m.problem, phase: m.phase }, optsFor(model)),
        messages: one(c.input),
        context: `PROBLEM:\n${m.problem}\n\nPHASE: ${m.phase.title}\nRUBRIC:\n${m.phase.rubric}`,
      };
    }
    case "mock-scorecard": {
      // the whole finished mock in one call, as /api/learn/ai/mock/scorecard sends it; ctx.answers = { p1: "...", ... }
      const m = await mockOf(s(x.mock));
      const answers = (x.answers ?? {}) as Record<string, string>;
      const phases = m.phases.map((p) => {
        const pp = promptPhase(p);
        return { title: p.title, rubric: pp.rubric, modelAnswer: pp.modelAnswer, candidate: answers[p.id] ?? "" };
      });
      return {
        system: (model) => mockFullScorecardSystem({ company: m.company.name, problem: problemText(m), phases }, optsFor(model)),
        messages: one("Grade my interview."),
        context: phases.map((p, i) => `### P${i + 1} · ${p.title}\nRUBRIC:\n${p.rubric}\nCANDIDATE:\n${p.candidate || "(nothing written)"}`).join("\n\n"),
      };
    }
    case "design-review": {
      // a Design-of-the-week challenge (ctx.dow = template slug), with the problem text the route builds
      let title = s(x.title);
      let text = s(x.text);
      if (x.dow) {
        const t = TEMPLATES.find((q) => q.slug === s(x.dow));
        if (!t) throw new Error(`unknown DOW template ${s(x.dow)}`);
        title = t.title;
        text = `${t.title}\n\n${t.briefMd}\n\nConstraints:\n${t.constraints.map((q) => `- ${q}`).join("\n")}`;
      }
      return { system: (m) => designReviewSystem({ title, text }, optsFor(m)), messages: one(c.input), context: `PROBLEM: ${title}\n${text.slice(0, 3000)}` };
    }
    case "canvas-review": {
      // a problem-bank brief (ctx.problem = file name), cut the way the canvas route cuts it
      let title = s(x.title);
      let text = s(x.text);
      if (x.problem) {
        const md = read(`problem-bank/${s(x.problem)}.md`);
        title = title || md.match(/^#\s+(.+)$/m)?.[1]?.trim() || s(x.problem);
        text = briefFromMarkdown(md, "problem");
      }
      return { system: () => canvasReviewSystem({ title, text }), messages: one(c.input), context: `PROBLEM: ${title}\n${text}` };
    }
    case "lesson-qa": {
      const text = read(s(x.lessonPath));
      const selection = s(x.selection);
      const MODES: Record<string, string> = { simple: "Explain it like I'm new to this.", hinglish: "Answer in Hinglish.", example: "Give one concrete real-world example.", interview: "How would I say this in an interview, in 3-4 sentences?" };
      const ask = [selection ? `About this part of the lesson:\n"""${selection}"""` : "", c.input || "Explain this part.", MODES[s(x.mode)] ?? ""].filter(Boolean).join("\n\n");
      const ctxText = lessonContext(text, c.input, selection);
      return { system: () => lessonQaSystem({ title: s(x.title), text: ctxText }), messages: one(ask), context: `LESSON: ${s(x.title)} (the answer sees the lesson's most relevant sections)` };
    }
    case "war-room": {
      const { room } = parseWarRoom(read(`war-stories/war-room/${s(x.room)}.md`), `${s(x.room)}.md`);
      if (!room) throw new Error(`war room ${s(x.room)} doesn't parse`);
      const input = warRoomPromptInput(room, Number(x.beat));
      if (!input) throw new Error(`beat ${s(x.beat)} of ${s(x.room)} is not a decision`);
      return {
        system: () => warRoomSystem(input),
        messages: one(c.input),
        context: `WAR ROOM: ${input.title} at ${input.company}\nCHANNEL (last part):\n${input.story.slice(-1500)}\nDECISION: ${input.question}\n${input.options.map((o, i) => `${i + 1}. ${o.text}${o.best ? " [BEST]" : ""}`).join("\n")}`,
      };
    }
  }
}

// ---------------------------------------------------------------- grading
/** Rules every answer of a feature must follow (the judge applies them on top of the case's own expectations). */
const HOUSE: Partial<Record<EvalCase["feature"], string>> = {
  "mock-interviewer": `HOUSE RULES for an interviewer turn (each broken rule lowers the score by at least one point):
- asks at most ONE question (a curveball's own closing question counts as one; two separate asks, "Also, ...", or a list of questions break this)
- uses only facts the candidate said or that the PROBLEM / PHASE material gives; no invented numbers, components or claims
- no teaching: doesn't state the answer, name the missing technique, or explain what's wrong
- doesn't grade the candidate or mention a rubric
- short, like speech: about 80 words at most`,
  "mock-coach": `HOUSE RULES: exact READ / WENT WELL / MISSING / TRY NEXT format, under ~110 words; MISSING items are nudges or questions, never the model answer; judges only what the candidate's words show.`,
  "explain-back": `HOUSE RULES: exact VERDICT / GOT / MISSING / FIX format, under ~70 words; strict verdict (any missing key point = partial, anything wrong = misconception); kind tone.`,
  "lab-hint": `HOUSE RULES: one hint at the requested level, never the full solution or more than 3 lines of code, under ~90 words; doesn't guess hidden test names.`,
  "lab-review": `HOUSE RULES: like a senior code review: what is good, then up to 4 concrete improvements ranked by importance, quoting the exact lines; under ~200 words; claims about the code must be true.`,
  "lesson-qa": `HOUSE RULES: lead with the direct answer; cite the lesson section in [brackets] when it uses the lesson; "Beyond this lesson:" when it goes beyond; under ~120 words unless asked for more; correct.`,
  "war-room": `HOUSE RULES: exact "MATCH: <n|none>" then "REPLY: <Name>: <1-3 sentences in character>"; matches by intent; never names the best option outright when the move matches none.`,
  "design-review": `HOUSE RULES: STRENGTHS / RISKS (3, worst first, each: what breaks, when, the fix) / QUESTIONS; under ~250 words; only real problems of THIS design, no invented components.`,
  "canvas-review": `HOUSE RULES: VERDICT / STRENGTHS / GAPS (3, worst first, each with a box or arrow fix) / NEXT; under ~280 words; judges only what is drawn and written.`,
  "mock-scorecard": `HOUSE RULES: per phase "### P<n> · title" with LEVEL / MET (with quotes) / MISSED / NEXT, then "### Overall"; grades only what the candidate wrote; a signal counts only if their words show it.`,
};

type Answer = { model: string; text: string; raw?: string; costUsd: number; ok: boolean; hash: string; reused?: boolean };
type Judged = { score: number; expectMet: boolean[]; violations: string[]; verdict: string | null; note: string };
type Row = { id: string; feature: string; title: string; input: string; answers: Answer[]; order: string[]; judge: { A: Judged; B: Judged; better: string } | null; judgeCost: number; judgeHash?: string };

async function answer(c: EvalCase, b: Built, model: string): Promise<Answer> {
  const hash = sha(JSON.stringify([model, b.system(model), b.messages, FEATURES[c.feature].maxTokens, FEATURES[c.feature].think]));
  const old = REUSE.filter((r) => r.id === c.id)
    .flatMap((r) => r.answers)
    .find((a) => a.model === model && a.hash === hash && a.ok);
  if (old) return { ...old, reused: true };
  const r = await callClaude({ feature: "eval", model, system: b.system, messages: b.messages, maxTokens: FEATURES[c.feature].maxTokens, think: FEATURES[c.feature].think, meta: { case: c.id, as: c.feature } });
  // every route strips a tuned prompt's private plan line before the learner sees the text
  const post = b.post ?? stripPrivatePlan;
  return r.ok ? { model, text: post(r.text), raw: r.text, costUsd: r.costUsd, ok: true, hash } : { model, text: `[${r.status}] ${r.message}`, costUsd: 0, ok: false, hash };
}

const transcript = (c: EvalCase) =>
  [...(c.history ?? []).map((m) => `${m.role === "user" ? "LEARNER" : "AI"}: ${m.content}`), `LEARNER: ${c.input}`].join("\n\n");

async function judge(c: EvalCase, b: Built, A: string, B: string) {
  const system = `You are a strict evaluator of answers from an AI tutor in a system design course. Score each answer independently against the case's expectations and the feature's house rules, then say which is better for a learner. Return only JSON.`;
  const user = `CASE: ${c.title}
FEATURE: ${c.feature}

MATERIAL THE AI HAD:
${b.context}

${c.feature === "mock-scorecard" ? "" : `CONVERSATION (the AI answers the last LEARNER message):\n${transcript(c)}\n`}
A GOOD ANSWER MUST:
${c.expect.map((e, i) => `${i + 1}. ${e}`).join("\n")}
${c.mustNot?.length ? `IT MUST NOT:\n${c.mustNot.map((e) => `- ${e}`).join("\n")}` : ""}
${c.answer ? `CORRECT VERDICT/LEVEL/MATCH: ${c.answer}` : ""}
${HOUSE[c.feature] ?? ""}

ANSWER A:
<<<
${A}
>>>

ANSWER B:
<<<
${B}
>>>

Return JSON exactly like:
{"A":{"score":1-5,"expectMet":[true/false per expectation],"violations":["any MUST NOT or house rule broken"],"verdict":"the verdict/level/match the answer gave or null","note":"one sentence"},"B":{...same...},"better":"A"|"B"|"tie"}
Score 5 = meets every expectation and house rule, specific and correct; 3 = partly; 1 = wrong or broke a rule badly.`;
  const judgeHash = sha(system + user);
  const old = REUSE.find((r) => r.id === c.id && r.judgeHash === judgeHash && r.judge);
  if (old) return { j: old.judge, cost: old.judgeCost, judgeHash, reused: true };
  const r = await callClaude({ feature: "eval", model: JUDGE, system, messages: [{ role: "user", content: user }], maxTokens: 1500, meta: { case: c.id, as: "judge" } });
  if (!r.ok) return { j: null, cost: 0, judgeHash };
  const m = r.text.match(/\{[\s\S]*\}/);
  try {
    return { j: m ? (JSON.parse(m[0]) as Row["judge"]) : null, cost: r.costUsd, judgeHash };
  } catch {
    return { j: null, cost: r.costUsd, judgeHash };
  }
}

/** The verdict read from the answer itself (not the judge), for features with a right answer. */
function verdictOk(c: EvalCase, text: string): boolean | null {
  if (!c.answer) return null;
  const want = (k: string) => c.answer!.split(",").find((p) => p.trim().startsWith(`${k}:`))?.split(":")[1].trim().split("|") ?? [];
  switch (c.feature) {
    case "explain-back": {
      const v = text.match(/VERDICT:\s*\**\s*(solid|partial|misconception)/i)?.[1]?.toLowerCase() ?? "";
      return c.answer.split("|").includes(v);
    }
    case "mock-coach": {
      const v = text.match(/READ:\s*\**\s*"?(strong|on track|needs work)/i)?.[1]?.toLowerCase() ?? "";
      return c.answer.split("|").includes(v);
    }
    case "war-room": {
      const v = text.match(/MATCH:\s*\**\s*(\d+|none)/i)?.[1]?.toLowerCase() ?? "";
      return c.answer.split("|").includes(v);
    }
    case "mock-scorecard": {
      // answer like "p5:senior|staff,overall:senior": every listed phase must get one of its levels
      return c.answer.split(",").every((part) => {
        const key = part.split(":")[0].trim();
        const sec = key === "overall" ? text.split(/###\s*Overall/i)[1] : text.split(new RegExp(`###\\s*P${key.slice(1)}\\b`, "i"))[1]?.split(/###/)[0];
        const lv = sec?.match(/LEVEL:\s*\**\s*(below-junior|not answered|junior|sde|senior|staff)/i)?.[1]?.toLowerCase() ?? "";
        return want(key).includes(lv);
      });
    }
    default:
      return null;
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function reviewHtml(rows: Row[]): string {
  const items = rows
    .map(
      (r, i) => `<section><h2>${i + 1}. ${esc(r.title)} <small>${r.feature}</small></h2>
<details><summary>What the learner sent</summary><pre>${esc(r.input)}</pre></details>
<div class="pair">${["A", "B"].map((L, k) => `<div><h3>${L}</h3><pre>${esc(r.answers.find((a) => a.model === r.order[k])!.text)}</pre></div>`).join("")}</div>
<p class="pick">Better for a learner: ${["A", "B", "same"].map((v) => `<label><input type="radio" name="${r.id}" value="${v}"> ${v}</label>`).join(" ")} <input class="note" data-id="${r.id}" placeholder="note (optional)"></p></section>`,
    )
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI model blind review</title>
<style>:root{--bg:#0b0b0c;--fg:#f3f2ee;--fg2:#c9c8c4;--line:#2a2a2e;--signal:#ff6b2b}@media (prefers-color-scheme:light){:root{--bg:#f5f4f0;--fg:#0b0b0b;--fg2:#2e2e33;--line:#dddbd4}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,sans-serif}main{max-width:1200px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:28px;margin:0 0 6px}h2{font-size:18px;margin:32px 0 8px}h2 small{color:var(--fg2);font:12px ui-monospace,monospace;margin-left:8px}h3{margin:0 0 6px;font:600 13px ui-monospace,monospace;color:var(--signal)}
.pair{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))}.pair>div{border:1px solid var(--line);padding:12px}pre{white-space:pre-wrap;margin:0;font:13px/1.5 ui-monospace,monospace;color:var(--fg2)}
.pick{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:10px 0 0}.note{flex:1;min-width:200px;background:transparent;color:var(--fg);border:1px solid var(--line);padding:6px}
button{background:var(--signal);color:#120700;border:0;padding:12px 18px;font:600 14px ui-monospace,monospace;cursor:pointer}#out{width:100%;height:90px;margin-top:10px;background:transparent;color:var(--fg);border:1px solid var(--line)}</style></head>
<body><main><h1>Blind review: which answer is better?</h1><p>${rows.length} pairs. A and B are shuffled per question; the model behind each is hidden until you send your picks. Pick the answer you'd rather a learner got.</p>
${items}
<p><button id="copy">Copy my picks</button></p><textarea id="out" readonly placeholder="Your picks appear here; paste them back in the chat."></textarea></main>
<script>document.getElementById("copy").onclick=()=>{const picks={};document.querySelectorAll("input[type=radio]:checked").forEach(r=>picks[r.name]=r.value);document.querySelectorAll(".note").forEach(n=>{if(n.value)picks[n.dataset.id+":note"]=n.value});const t=JSON.stringify(picks);document.getElementById("out").value=t;navigator.clipboard&&navigator.clipboard.writeText(t)}</script></body></html>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cases = CASES.filter((c) => !ONLY.length || ONLY.includes(c.id) || ONLY.includes(c.feature));
  let spent = 0;
  const rows = await pool(cases, 4, async (c): Promise<Row> => {
    const b = await build(c);
    const answers = await Promise.all(CANDIDATES.map((m) => answer(c, b, m)));
    const prev = REUSE.find((r) => r.id === c.id);
    // keep the earlier A/B order when re-judging, so a reused judgement maps to the same answers
    const order = prev?.order ?? (Math.random() < 0.5 ? [...CANDIDATES] : [...CANDIDATES].reverse());
    const { j, cost, judgeHash, reused } = await judge(c, b, answers.find((a) => a.model === order[0])!.text, answers.find((a) => a.model === order[1])!.text);
    spent += (reused ? 0 : cost) + answers.reduce((a, x) => a + (x.reused ? 0 : x.costUsd), 0);
    process.stderr.write(`${c.id} `);
    return { id: c.id, feature: c.feature, title: c.title, input: c.input, answers, order, judge: j, judgeCost: cost, judgeHash };
  });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(OUT, "review.html"), reviewHtml(rows));

  // summary per feature and model
  const byModel = (r: Row, m: string): Judged | null => (r.judge ? (r.order[0] === m ? r.judge.A : r.judge.B) : null);
  const feats = [...new Set(rows.map((r) => r.feature))];
  console.log("\nfeature            model                       score  expect met  verdict ok  prefers  words  q-marks  cost/call");
  for (const f of feats) {
    const rs = rows.filter((r) => r.feature === f);
    for (const m of CANDIDATES) {
      const js = rs.map((r) => byModel(r, m)).filter((x): x is Judged => !!x);
      const avg = js.reduce((a, j) => a + j.score, 0) / Math.max(1, js.length);
      const met = js.flatMap((j) => j.expectMet ?? []);
      const keyed = rs.map((r) => verdictOk(CASES.find((c) => c.id === r.id)!, r.answers.find((x) => x.model === m)?.text ?? "")).filter((v): v is boolean => v !== null);
      const prefers = rs.filter((r) => r.judge && r.judge.better !== "tie" && r.order[r.judge.better === "A" ? 0 : 1] === m).length;
      const texts = rs.map((r) => r.answers.find((x) => x.model === m)?.text ?? "");
      const words = texts.reduce((a, t) => a + t.split(/\s+/).filter(Boolean).length, 0) / Math.max(1, texts.length);
      const qs = texts.reduce((a, t) => a + (t.match(/\?/g)?.length ?? 0), 0) / Math.max(1, texts.length);
      const cost = rs.reduce((a, r) => a + (r.answers.find((x) => x.model === m)?.costUsd ?? 0), 0) / Math.max(1, rs.length);
      console.log(
        `${f.padEnd(18)} ${m.padEnd(27)} ${avg.toFixed(2).padStart(5)}  ${`${met.filter(Boolean).length}/${met.length}`.padStart(10)}  ${keyed.length ? `${keyed.filter(Boolean).length}/${keyed.length}`.padStart(10) : "         -"}  ${`${prefers}/${rs.length}`.padStart(7)}  ${words.toFixed(0).padStart(5)}  ${qs.toFixed(1).padStart(7)}  $${cost.toFixed(5)}`,
      );
    }
  }
  console.log(`\ncases ${rows.length} · new spend this run $${spent.toFixed(4)} · ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
