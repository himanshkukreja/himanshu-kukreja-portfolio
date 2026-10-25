/**
 * Model evaluation: every case in cases.ts goes to each candidate model with the production prompts,
 * then a judge model scores both answers blind (shuffled, unlabelled) against the case's expectations.
 * Writes results.json (with the model mapping) and review.html (blind pairs for the owner's own picks).
 * Every call goes through src/lib/ai/client.ts as feature "eval", so it is metered on /admin/ai.
 *
 * usage: NODE_PATH=<stub with server-only> npx tsx --env-file=.env --env-file=.env.local scripts/ai-eval/run.ts <out dir> [case-id ...]
 */
import fs from "fs";
import path from "path";
import { callClaude } from "@/lib/ai/client";
import { FEATURES } from "@/lib/ai/features";
import { MODELS } from "@/lib/ai/prices";
import { designReviewSystem, explainBackSystem, labHintSystem, lessonQaSystem, mockInterviewerSystem, mockScorecardSystem } from "@/lib/ai/prompts";
import { CASES, type EvalCase } from "./cases";

const OUT = path.resolve(process.argv[2] || "ai-eval-out");
const ONLY = process.argv.slice(3);
const CONTENT = process.env.SDM_LOCAL_DIR || path.resolve(process.cwd(), "..", "system-design-mastery");
const CANDIDATES = [MODELS.haiku, MODELS.sonnet];
const JUDGE = MODELS.opus;

const s = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("\n") : (v ?? ""));

function build(c: EvalCase): { system: string; user: string } {
  const x = c.ctx;
  switch (c.feature) {
    case "lab-hint":
      return { system: labHintSystem({ title: s(x.labTitle), brief: s(x.brief) }), user: `Hint level ${s(x.level)}.\n\n${c.input}` };
    case "explain-back":
      return { system: explainBackSystem({ term: s(x.term), keyPoints: x.keyPoints as string[] }), user: c.input };
    case "mock-interviewer":
    case "mock-scorecard": {
      const phase = { title: s(x.phaseTitle), interviewer: s(x.phaseQuestions), curveballs: s(x.curveballs), rubric: s(x.rubric), modelAnswer: s(x.modelAnswer) };
      return c.feature === "mock-interviewer"
        ? { system: mockInterviewerSystem({ company: s(x.company), interviewer: s(x.interviewer), problem: s(x.problem), phase }), user: c.input }
        : { system: mockScorecardSystem({ company: s(x.company), problem: s(x.problem), phase }), user: c.input };
    }
    case "design-review":
      return { system: designReviewSystem({ title: s(x.title), text: s(x.text) }), user: c.input };
    case "lesson-qa": {
      const text = fs.readFileSync(path.join(CONTENT, "resources", s(x.lessonPath)), "utf8");
      return { system: lessonQaSystem({ title: s(x.title), text }), user: c.input };
    }
  }
}

type Answer = { model: string; text: string; costUsd: number; ok: boolean };
type Judged = { score: number; expectMet: boolean[]; violations: string[]; verdict: string | null; note: string };
type Row = { id: string; feature: string; title: string; input: string; answers: Answer[]; order: string[]; judge: { A: Judged; B: Judged; better: string } | null; judgeCost: number };

async function answer(c: EvalCase, model: string): Promise<Answer> {
  const { system, user } = build(c);
  const r = await callClaude({ feature: "eval", model, system, messages: [{ role: "user", content: user }], maxTokens: FEATURES[c.feature].maxTokens, meta: { case: c.id, as: c.feature } });
  return r.ok ? { model, text: r.text, costUsd: r.costUsd, ok: true } : { model, text: `[${r.status}] ${r.message}`, costUsd: 0, ok: false };
}

async function judge(c: EvalCase, A: string, B: string) {
  const system = `You are a strict evaluator of answers from an AI tutor in a system design course. Score each answer independently against the case's expectations, then say which is better for a learner. Return only JSON.`;
  const user = `CASE: ${c.title}
FEATURE: ${c.feature}
LEARNER INPUT:
${c.input}

A GOOD ANSWER MUST:
${c.expect.map((e, i) => `${i + 1}. ${e}`).join("\n")}
${c.mustNot?.length ? `IT MUST NOT:\n${c.mustNot.map((e) => `- ${e}`).join("\n")}` : ""}
${c.answer ? `CORRECT VERDICT/LEVEL: ${c.answer}` : ""}

ANSWER A:
<<<
${A}
>>>

ANSWER B:
<<<
${B}
>>>

Return JSON exactly like:
{"A":{"score":1-5,"expectMet":[true/false per expectation],"violations":["any MUST NOT broken"],"verdict":"the verdict/level the answer gave or null","note":"one sentence"},"B":{...same...},"better":"A"|"B"|"tie"}
Score 5 = meets every expectation, specific and correct; 3 = partly; 1 = wrong or broke a rule.`;
  const r = await callClaude({ feature: "eval", model: JUDGE, system, messages: [{ role: "user", content: user }], maxTokens: 1200, meta: { case: c.id, as: "judge" } });
  if (!r.ok) return { j: null, cost: 0 };
  const m = r.text.match(/\{[\s\S]*\}/);
  try {
    return { j: m ? (JSON.parse(m[0]) as Row["judge"]) : null, cost: r.costUsd };
  } catch {
    return { j: null, cost: r.costUsd };
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
  const cases = CASES.filter((c) => !ONLY.length || ONLY.includes(c.id));
  const rows = await pool(cases, 3, async (c): Promise<Row> => {
    const answers = await Promise.all(CANDIDATES.map((m) => answer(c, m)));
    const order = Math.random() < 0.5 ? [...CANDIDATES] : [...CANDIDATES].reverse();
    const { j, cost } = await judge(c, answers.find((a) => a.model === order[0])!.text, answers.find((a) => a.model === order[1])!.text);
    process.stderr.write(`${c.id} `);
    return { id: c.id, feature: c.feature, title: c.title, input: c.input, answers, order, judge: j, judgeCost: cost };
  });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(OUT, "review.html"), reviewHtml(rows));

  // summary per feature and model
  const byModel = (r: Row, m: string): Judged | null => (r.judge ? (r.order[0] === m ? r.judge.A : r.judge.B) : null);
  const feats = [...new Set(rows.map((r) => r.feature))];
  console.log("\nfeature            model                       avg score  verdict ok  judge prefers  avg cost/call");
  for (const f of feats) {
    const rs = rows.filter((r) => r.feature === f);
    for (const m of CANDIDATES) {
      const js = rs.map((r) => byModel(r, m)).filter((x): x is Judged => !!x);
      const avg = js.reduce((a, j) => a + j.score, 0) / Math.max(1, js.length);
      const withKey = rs.filter((r) => CASES.find((c) => c.id === r.id)?.answer);
      const vOk = withKey.filter((r) => (byModel(r, m)?.verdict || "").toLowerCase().includes(String(CASES.find((c) => c.id === r.id)!.answer))).length;
      const prefers = rs.filter((r) => r.judge && r.judge.better !== "tie" && r.order[r.judge.better === "A" ? 0 : 1] === m).length;
      const cost = rs.reduce((a, r) => a + (r.answers.find((x) => x.model === m)?.costUsd ?? 0), 0) / Math.max(1, rs.length);
      console.log(`${f.padEnd(18)} ${m.padEnd(27)} ${avg.toFixed(2).padStart(9)}  ${withKey.length ? `${vOk}/${withKey.length}`.padStart(10) : "         -"}  ${String(prefers).padStart(13)}  $${cost.toFixed(5)}`);
    }
  }
  const total = rows.reduce((a, r) => a + r.judgeCost + r.answers.reduce((b, x) => b + x.costUsd, 0), 0);
  console.log(`\ncases ${rows.length} · total eval spend $${total.toFixed(4)} · ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
