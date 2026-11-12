/**
 * Learner-brief eval (AI audit 12 Nov 2026, O5, O9, O10, O15): the cases in brief-cases.ts, each built the way its route
 * builds the request: the route's own prompt builder and post-processing, the brief from the same pure builder
 * (lib/learner/feature-brief-model.ts) over the case's memory notes and outcome log, with the log's ids named from the
 * course's own content (lib/learner/feature-brief.ts namerFor), and the compared-with-last-time lines the route returns.
 * Memory-off cases send exactly what the route sent before the brief existed (the regression check).
 *
 * The answering model is each feature's own (FEATURES: Haiku 5.5) with the client's settings (thinking, effort, the
 * answer cap, structured output); the judge is Sonnet 5.5 (never Opus), one call per case. Direct API calls: nothing is
 * written to the database. Course content from SDM_LOCAL_DIR.
 *   NODE_PATH=<dir with a server-only stub> npx tsx --tsconfig <tsconfig mapping next/cache to a stub whose unstable_cache
 *     runs the function> --env-file=.env.local scripts/ai-eval/brief.ts <out dir> [case-id | feature ...]
 *   EVAL_NOJUDGE=1   rule checks only · EVAL_SHOW=1   print each brief
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { answerTokens, FEATURES } from "@/lib/ai/features";
import { costOf, MODELS, type Usage } from "@/lib/ai/prices";
import { canvasReviewSystem, designReviewSystem, explainBackSystem, LAB_REVIEW_SCHEMA, LAB_REVIEW_V2_SYSTEM, labHintSystem, labReviewV2Input, lessonQaSystem, lldInterviewerReply, lldInterviewerSystem, lldScorecardSystem, mockFullScorecardSystem, mockInterviewerSystem, parseLabReview, promptOptsFor, replyFrom, snipExplainInput, snipExplainSystem, stripPrivatePlan, type PromptSystem } from "@/lib/ai/prompts";
import { lessonContext } from "@/lib/ai/retrieve";
import { buildAskTurn } from "@/lib/ai/askTurn";
import { styleLine } from "@/lib/ai/answerStyle";
import { splitFollowups } from "@/lib/ai/chat/text";
import { getLearningResource } from "@/lib/github";
import { getCatalogue } from "@/lib/concepts/load";
import { getLab } from "@/lib/learn/labs/load";
import { LANG_LABEL } from "@/lib/learn/labs/types";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import { lldRubricText, lldTurnInput, problemText, promptPhase } from "@/lib/ai/mock";
import { withChange } from "@/lib/learn/mock/lld";
import { namedItems } from "@/lib/learner/events-model";
import { compareExplain, compareLabReview, featureBriefText, withBrief, type FeatureBriefInput, type Namer } from "@/lib/learner/feature-brief-model";
import { namerFor } from "@/lib/learner/feature-brief";
import { scorecardOutcome } from "@/lib/learner/scorecard";
import { snipGrounding } from "@/app/api/learn/ai/snip/_lib/context";
import { BRIEF_CASES, NOW, type BriefCase, type BriefFeature } from "./brief-cases";

const OUT = path.resolve(process.argv[2] || "brief-eval-out");
const ONLY = process.argv.slice(3);
const KEY = process.env.ANTHROPIC_API_KEY || "";
const JUDGE = process.env.EVAL_JUDGE || MODELS.sonnet;
const NOJUDGE = process.env.EVAL_NOJUDGE === "1";
if (/opus/.test(JUDGE)) throw new Error("this eval's judge is never Opus (owner's spend rule)");

/* ------------------------------------------------------------------ the API, with the client's settings (lib/ai/client.ts) */

type Msg = { role: "user" | "assistant"; content: unknown };
async function api(body: Record<string, unknown>): Promise<{ text: string; usage: Usage; stop: string }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { content?: { type: string; text?: string }[]; usage?: Usage; stop_reason?: string; error?: { message?: string } } | null;
    if ((!res || res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    if (j?.error) throw new Error(j.error.message);
    return { text: (j?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), usage: j?.usage ?? {}, stop: j?.stop_reason ?? "" };
  }
}
async function answer(feature: BriefFeature, system: PromptSystem | ((model: string) => PromptSystem), messages: Msg[], schema?: unknown): Promise<{ text: string; cost: number }> {
  const model = FEATURES[feature].model;
  const prompt = typeof system === "function" ? system(model) : system;
  const sys = typeof prompt === "string" ? prompt : prompt.map((b) => ({ type: "text", text: b.text, ...(b.cache ? { cache_control: { type: "ephemeral" } } : {}) }));
  const def = FEATURES[feature];
  const thinks = def.think;
  const outputConfig = { ...(schema ? { format: { type: "json_schema", schema } } : {}), ...(thinks ? { effort: def.effort ?? "low" } : {}) };
  const r = await api({ model, max_tokens: answerTokens(feature, model) + (thinks ? 3000 : 0), thinking: thinks ? { type: "adaptive" } : { type: "disabled" }, ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}), system: sys, messages });
  return { text: r.text, cost: costOf(model, r.usage) };
}

/** A white PNG of w x h (zlib-deflated rows, a CRC per chunk). */
function blankPng(w: number, h: number): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

const html = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ one case, as its route builds it */

async function run(c: BriefCase, names: Namer): Promise<{ user: string; text: string; compare: string[]; cost: number; brief: string }> {
  const i = c.input as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const full = (extra: Partial<FeatureBriefInput>) => featureBriefText({ feature: c.feature, course: "sdm", notes: c.notes, events: c.notes ? c.events : [], names, now: NOW, ...extra });
  const b = (extra: Partial<FeatureBriefInput>) => full(extra).text;
  switch (c.feature) {
    case "lesson-qa": {
      const lesson = (await getLearningResource(i.week, i.slug))!;
      const bt = full({ ref: { topic: `${lesson.resource.title} ${i.question}` }, styleLine: true });
      const brief = bt.text;
      const ask = buildAskTurn({ question: i.question, selection: "", kind: "lesson", mode: "", style: styleLine(bt.style), prev: null });
      const ctx = { title: lesson.resource.title, text: lessonContext(lesson.content, i.question, ""), kind: "lesson" as const };
      const r = await answer(c.feature, (m) => lessonQaSystem(ctx, promptOptsFor(m, "lesson-qa")), [{ role: "user", content: withBrief(bt, ask) }]);
      return { user: i.question, text: splitFollowups(r.text, i.question).text, compare: [], cost: r.cost, brief };
    }
    case "snip-explain": {
      const lesson = (await getLearningResource(i.week, i.slug))!;
      const g = await snipGrounding({ kind: "lesson", key: `${i.week}/${i.slug}`, title: lesson.resource.title, heading: i.heading, text: i.text, lecture: null, question: "" });
      const bt = full({ ref: { topic: `${lesson.resource.title} ${i.heading}` } });
      const brief = bt.text;
      const input = snipExplainInput({ kind: "lesson", title: lesson.resource.title, heading: i.heading, text: i.text });
      // a blank 320x120 PNG stands in for the snip's image: the model reads the snip's exact text beside it
      const png = blankPng(320, 120);
      const r = await answer(c.feature, snipExplainSystem({ kind: "lesson", title: g.title || lesson.resource.title, context: g.context }), [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: png } }, { type: "text", text: withBrief(bt, input) }] }]);
      return { user: `[snip] ${i.heading}`, text: r.text.trim(), compare: [], cost: r.cost, brief };
    }
    case "lab-hint":
    case "lab-review": {
      const lab = (await getLab(i.lab))!;
      const labBrief = [lab.summary, lab.incident ? html(lab.incident.reportHtml) : "", html(lab.briefHtml)].filter(Boolean).join("\n\n").slice(0, 4500);
      const bt = full({ ref: { kinds: ["lab_hint", "lab_pass", "lab_review"], ref: lab.id, topic: lab.title }, lab: { failedRuns: i.failedRuns ?? null, level: i.level ?? null } });
      const brief = bt.text;
      if (c.feature === "lab-review") {
        const user = labReviewV2Input({ title: lab.title, language: LANG_LABEL.python, kind: lab.type, brief: labBrief, stage: null, code: i.code });
        const r = await answer(c.feature, [{ text: LAB_REVIEW_V2_SYSTEM, cache: true }], [{ role: "user", content: withBrief(brief, user) }], LAB_REVIEW_SCHEMA);
        const p = parseLabReview(r.text);
        const compare = p && p !== "off_topic" ? compareLabReview(c.notes ? c.events.find((e) => e.kind === "lab_review" && e.ref === lab.id) : undefined, { c: p.rubric.correctness.score, x: p.rubric.complexity.score, e: p.rubric.edge_cases.score, r: p.rubric.readability.score }) : [];
        return { user: "[review my passing code]", text: p && p !== "off_topic" ? JSON.stringify(p, null, 1) : `UNPARSED ${r.text}`, compare, cost: r.cost, brief };
      }
      const failures = (i.failures as { name: string; message: string; line: number }[]).map((f) => `- ${f.name}: ${f.message} (line ${f.line})`);
      const user = `Hint level ${i.level}. Language: ${LANG_LABEL.python}.\n\nMy code:\n\`\`\`python\n${i.code}\n\`\`\`\n\nFailing:\n${failures.join("\n")}`;
      const r = await answer(c.feature, (m) => labHintSystem({ title: lab.title, brief: labBrief }, promptOptsFor(m, "lab-hint")), [{ role: "user", content: withBrief(bt, user) }]);
      return { user: `[hint level ${i.level}, failed run ${i.failedRuns}]`, text: stripPrivatePlan(r.text), compare: [], cost: r.cost, brief };
    }
    case "explain-back": {
      const sc = (await getCatalogue()).catalogue.concepts.find((x) => x.id === i.concept)!;
      const keyPoints = [sc.definition, ...sc.refresher];
      const brief = b({ ref: { kinds: ["explain_back"], ref: sc.id, topic: sc.term } });
      const r = await answer(c.feature, (m) => explainBackSystem({ term: sc.term, keyPoints }, promptOptsFor(m, "explain-back")), [{ role: "user", content: withBrief(brief, i.text, "My explanation:") }]);
      const out = replyFrom(r.text, "VERDICT:");
      const verdict = (out.match(/VERDICT:\s*(solid|partial|misconception)/i)?.[1] || "").toLowerCase() || null;
      const miss = verdict === "solid" ? [] : namedItems(out.match(/^MISSING:\s*(.*)$/im)?.[1] ?? "", keyPoints.map((k, n) => ({ id: String(n + 1), text: k })));
      const prev = c.notes ? c.events.find((e) => e.kind === "explain_back" && e.ref === sc.id) : undefined;
      const compare = compareExplain(prev, { verdict, miss }, (id) => names.item({ course: "sdm", kind: "explain_back", ref: sc.id, outcome: null, detail: {}, at: 0 }, id) ?? keyPoints[Number(id) - 1] ?? null);
      return { user: i.text, text: out, compare, cost: r.cost, brief };
    }
    case "mock-interviewer":
    case "lld-mock": {
      const built = (await getMockInterview(i.slug))!;
      const lld = built.kind === "lld";
      const mock = lld ? withChange(built, null) : built;
      const phase = mock.phases.find((p) => p.id === i.phase)!;
      const brief = b({ ref: { kinds: lld ? ["lld_mock"] : ["mock_overall", "mock_phase"], ...(lld ? { ref: mock.slug } : { prefix: mock.slug }), topic: `${mock.title} ${phase.title}` }, mock: { company: mock.company.name, title: mock.title, level: i.level, phase: { id: phase.id, title: phase.title } } });
      const content = withBrief(brief, i.answer, "What I say now:");
      if (lld) {
        const r = await answer(c.feature, lldInterviewerSystem(lldTurnInput(mock, phase, false, [])), [{ role: "user", content }]);
        return { user: i.answer, text: lldInterviewerReply(r.text, mock.interviewer.name), compare: [], cost: r.cost, brief };
      }
      const r = await answer(c.feature, (m) => mockInterviewerSystem({ company: mock.company.name, interviewer: `${mock.interviewer.name}, ${mock.interviewer.title}`, problem: problemText(mock), phase: promptPhase(phase) }, promptOptsFor(m, "mock-interviewer")), [{ role: "user", content }]);
      return { user: i.answer, text: stripPrivatePlan(r.text), compare: [], cost: r.cost, brief };
    }
    case "mock-scorecard":
    case "lld-mock-scorecard": {
      const built = (await getMockInterview(i.slug))!;
      const lld = built.kind === "lld" ? built.lld! : null;
      const mock = lld ? withChange(built, null) : built;
      const notes = i.notes as Record<string, string>;
      const phases = mock.phases.map((p) => {
        const isCode = !!lld && p.id === lld.codePhase;
        const n = notes[p.id] ?? "";
        const pp = promptPhase(p);
        return { title: p.title, rubric: lld ? lldRubricText(p, lld.checklist) : pp.rubric, modelAnswer: pp.modelAnswer, candidate: n ? (isCode ? `Code (their editor):\n${n}` : `Notes:\n${n}`) : "" };
      });
      const brief = b({ ref: { kinds: lld ? ["lld_mock"] : ["mock_overall", "mock_phase"], ...(lld ? { ref: mock.slug } : { prefix: mock.slug }), topic: mock.title }, mock: { company: mock.company.name, title: mock.title, level: i.level } });
      const grade = withBrief(brief, "Grade my interview.");
      const r = lld
        ? await answer(c.feature, lldScorecardSystem({ company: mock.company.name, problem: problemText(mock), change: mock.phases.find((p) => p.id === lld.codePhase)?.curveballs[0]?.text ?? "", checklist: lld.checklist.length, phases }), [{ role: "user", content: grade }])
        : await answer(c.feature, (m) => mockFullScorecardSystem({ company: mock.company.name, problem: problemText(mock), phases }, promptOptsFor(m, "mock-scorecard")), [{ role: "user", content: grade }]);
      const text = replyFrom(r.text, "### P1");
      const o = scorecardOutcome(mock, text, i.level, c.notes ? c.events : [], names);
      return { user: "Grade my interview.", text, compare: o.compare, cost: r.cost, brief };
    }
    case "design-review": {
      const bt = full({ ref: { topic: i.title } });
      const brief = bt.text;
      const r = await answer(c.feature, (m) => designReviewSystem({ title: i.title, text: i.problem }, promptOptsFor(m, "design-review")), [{ role: "user", content: withBrief(bt, i.md, "My design:") }]);
      return { user: i.md, text: replyFrom(r.text, "STRENGTHS"), compare: [], cost: r.cost, brief };
    }
    case "canvas-review": {
      const bt = full({ ref: { topic: i.title } });
      const brief = bt.text;
      const input = `<drawing>\n${i.drawing}\n</drawing>\n\n<notes>\n${i.notes}\n</notes>`;
      const r = await answer(c.feature, (m) => canvasReviewSystem({ title: i.title, text: i.brief }, promptOptsFor(m, "canvas-review")), [{ role: "user", content: withBrief(bt, input) }]);
      return { user: input, text: replyFrom(r.text, "VERDICT:"), compare: [], cost: r.cost, brief };
    }
  }
}

/* ------------------------------------------------------------------ the judge */

type Judged = { expectMet: boolean[]; avoided: boolean[]; why: string };
async function judge(c: BriefCase, a: { user: string; text: string; compare: string[]; brief: string }): Promise<{ j: Judged | null; cost: number }> {
  if (NOJUDGE) return { j: null, cost: 0 };
  const user = `You grade one reply of an AI feature ("${c.feature}") in "System Design Mastery", an online course, for the case: ${c.title}.
The feature was given this brief about the learner in their turn (their memory and graded record; empty means memory off):
<brief>
${a.brief || "(none: memory off)"}
</brief>
What the learner sent (abridged):
<sent>
${a.user.slice(0, 1500)}
</sent>
The reply:
<reply>
${a.text.slice(0, 6000)}
</reply>
${a.compare.length ? `The site also shows these "compared with last time" lines beside it (worked out by code, not the model):\n${a.compare.map((l) => `- ${l}`).join("\n")}\n` : ""}
EXPECT (each must hold):
${c.expect.map((x, k) => `${k + 1}. ${x}`).join("\n")}
AVOID (each must NOT happen):
${(c.avoid ?? []).map((x, k) => `${k + 1}. ${x}`).join("\n") || "(none)"}

Judge strictly and literally. Reply with JSON only: {"expectMet":[true|false per EXPECT line],"avoided":[true per AVOID line avoided, false if it happened],"why":"one sentence on any failure"}`;
  const r = await api({ model: JUDGE, max_tokens: 1500, ...(/sonnet-5/.test(JUDGE) ? { thinking: { type: "between_tools" } } : {}), system: "You are a strict, exact evaluator of an AI tutor's replies. Return only JSON.", messages: [{ role: "user", content: user }] });
  const m = r.text.match(/\{[\s\S]*\}/);
  try {
    return { j: m ? (JSON.parse(m[0]) as Judged) : null, cost: costOf(JUDGE, r.usage) };
  } catch {
    return { j: null, cost: costOf(JUDGE, r.usage) };
  }
}

async function main() {
  if (!KEY) throw new Error("ANTHROPIC_API_KEY missing");
  fs.mkdirSync(OUT, { recursive: true });
  const cases = BRIEF_CASES.filter((c) => !ONLY.length || ONLY.includes(c.id) || ONLY.includes(c.feature));
  // the log's ids named from the course content, once for every fixture event
  const names = await namerFor(cases.flatMap((c) => c.events).filter((e, k, a) => a.findIndex((x) => x.kind === e.kind && x.ref === e.ref) === k));
  const rows: unknown[] = [];
  let spend = 0;
  let judging = 0;
  let pass = 0;
  for (const c of cases) {
    const r = await run(c, names).catch((err) => ({ user: "", text: `ERROR ${(err as Error).message}`, compare: [] as string[], cost: 0, brief: "" }));
    if (process.env.EVAL_SHOW) console.log(`--- brief for ${c.id}\n${r.brief || "(none)"}`);
    const rules = [
      ...(c.must ?? []).map((re) => ({ name: `must ${re.source.slice(0, 50)}`, ok: re.test(r.text) })),
      ...(c.mustNot ?? []).map((re) => ({ name: `mustNot ${re.source.slice(0, 50)}`, ok: !re.test(r.text) })),
      ...(c.compare ?? []).map((re) => ({ name: `compare ${re.source.slice(0, 50)}`, ok: r.compare.some((l) => re.test(l)) })),
      { name: "brief only with memory on", ok: c.notes ? true : !r.brief || c.feature === "lab-hint" },
      { name: "brief ≤ 6 lines", ok: (r.brief.match(/<learner[\s\S]*?<\/learner>/)?.[0].split("\n").length ?? 2) - 2 <= 6 },
      { name: "answered", ok: !!r.text && !r.text.startsWith("ERROR") && !r.text.startsWith("UNPARSED") },
    ];
    const { j, cost } = await judge(c, r);
    spend += r.cost;
    judging += cost;
    const judgedOk = NOJUDGE ? true : !!j && j.expectMet.length >= c.expect.length && j.expectMet.every(Boolean) && (j.avoided ?? []).every(Boolean);
    const ok = rules.every((x) => x.ok) && judgedOk;
    if (ok) pass++;
    const failed = rules.filter((x) => !x.ok).map((x) => x.name);
    console.log(`${ok ? "PASS" : "FAIL"} ${c.id} (${c.feature}) $${r.cost.toFixed(4)}${failed.length ? ` rules failed: ${failed.join("; ")}` : ""}${j && !ok ? ` judge: ${j.why}` : ""}`);
    console.log(`     ${r.text.replace(/\s+/g, " ").slice(0, 260)}${r.compare.length ? `\n     compare: ${r.compare.join(" | ")}` : ""}`);
    rows.push({ id: c.id, feature: c.feature, ok, rules, judge: j, brief: r.brief, text: r.text, compare: r.compare, cost: r.cost, judgeCost: cost });
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
  }
  const summary = `cases ${pass}/${cases.length} pass · spend: answers $${spend.toFixed(4)} + judge $${judging.toFixed(4)} = $${(spend + judging).toFixed(4)} (${NOJUDGE ? "judge off" : JUDGE})`;
  console.log(`\n${summary}`);
  fs.writeFileSync(path.join(OUT, "summary.txt"), summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
