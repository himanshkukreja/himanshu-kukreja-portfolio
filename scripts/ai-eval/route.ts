/**
 * Smart routing: which eval turns the classifier calls hard (lib/ai/chat/route-model.ts), and the cost per 1,000 turns of
 * Haiku 5.5 alone vs routed, from the comparison runs' summaries. No model calls here.
 *
 *   npx tsx scripts/ai-eval/route.ts                         the hard turns among every chat, dsa-chat and dsa-tutor case
 *   npx tsx scripts/ai-eval/route.ts <chat out> [<dsa haiku out> <dsa sonnet out>]
 *                                                            + the quality gain and the cost per 1,000 turns
 * The comparison runs:
 *   EVAL_CASES=route EVAL_MODELS=claude-haiku-5-5,routed scripts/ai-eval/chat.ts <chat out>        (blind A/B, Sonnet judge)
 *   scripts/ai-eval/dsa.ts <dsa haiku out> <the hard dsa case ids>                                    (Haiku 5.5)
 *   EVAL_MODEL=claude-sonnet-5-5 scripts/ai-eval/dsa.ts <dsa sonnet out> <the same ids>               (routed = Sonnet on them)
 */
import fs from "fs";
import path from "path";
import { classifyTurn, type RouteDecision } from "@/lib/ai/chat/route-model";
import { TUTOR_ASK } from "@/lib/dsa/ai/modes";
import { CHAT_CASES } from "./chat-cases";
import { ROUTE_CHAT_CASES, ROUTE_DSA_CHAT_CASES, ROUTE_DSA_TUTOR_CASES } from "./route-cases";
import { DSA_CHAT_CASES } from "./dsa-chat-cases";
import { DSA_TUTOR_CASES } from "./dsa-tutor-cases";

type Row = { feature: string; id: string; turn: number; d: RouteDecision; text: string };

export function classifyAll(): Row[] {
  const rows: Row[] = [];
  for (const c of [...CHAT_CASES, ...ROUTE_CHAT_CASES])
    c.turns.forEach((t, i) => rows.push({ feature: "course-chat", id: c.id, turn: i + 1, d: classifyTurn({ feature: "course-chat", text: t.user, mock: !!t.mock, grading: !!t.answerTo || /quick check/i.test(c.id) && i > 0 }), text: t.user }));
  for (const c of [...DSA_CHAT_CASES, ...ROUTE_DSA_CHAT_CASES]) c.turns.forEach((t, i) => rows.push({ feature: "dsa-chat", id: c.id, turn: i + 1, d: classifyTurn({ feature: "dsa-chat", text: t.user }), text: t.user }));
  for (const c of [...DSA_TUTOR_CASES, ...ROUTE_DSA_TUTOR_CASES]) {
    let code = "";
    let verdict: string | null = null;
    c.turns.forEach((t, i) => {
      if (t.code !== undefined) code = t.code;
      if (t.result !== undefined) verdict = t.result?.verdict ?? null;
      const text = t.user ?? (TUTOR_ASK as Record<string, string>)[t.mode] ?? "";
      rows.push({ feature: "dsa-tutor", id: c.id, turn: i + 1, d: classifyTurn({ feature: "dsa-tutor", text, code, mode: t.mode, verdict }), text });
    });
  }
  return rows;
}

type ModelSum = { judged: number; pass: number; rate: number | null; score: number | null; wins?: number; turns: number; sonnetTurns: number; cost: number; costPerTurn: number | null };

function main() {
  const rows = classifyAll();
  console.log("hard turns by feature (the eval corpus):");
  const share: Record<string, number> = {};
  for (const f of ["course-chat", "dsa-chat", "dsa-tutor"]) {
    const xs = rows.filter((r) => r.feature === f);
    const hard = xs.filter((r) => r.d.hard);
    share[f] = xs.length ? hard.length / xs.length : 0;
    const by = new Map<string, number>();
    for (const h of hard) by.set(h.d.reason!, (by.get(h.d.reason!) ?? 0) + 1);
    console.log(`  ${f.padEnd(12)} ${hard.length}/${xs.length} (${Math.round(share[f] * 100)}%)  ${[...by].map(([k, n]) => `${k} ${n}`).join(", ")}`);
    for (const h of hard) console.log(`      ${h.d.reason?.padEnd(8)} ${h.id}#${h.turn}  ${h.text.replace(/\s+/g, " ").slice(0, 90)}`);
  }
  const [chatOut, dsaH, dsaS] = process.argv.slice(2);
  if (!chatOut) return;
  const chat = JSON.parse(fs.readFileSync(path.join(chatOut, "summary.json"), "utf8")) as { judge: string; models: Record<string, ModelSum> };
  const h = chat.models["claude-haiku-5-5"];
  const r = chat.models.routed;
  console.log(`\ncourse chat, hard cases (${chat.judge} judge, blind A/B): Haiku ${pct(h.rate)} pass, score ${h.score?.toFixed(2)} · routed ${pct(r.rate)} pass, score ${r.score?.toFixed(2)} · wins ${h.wins ?? 0} vs ${r.wins ?? 0}`);
  console.log(`  cost a turn: Haiku $${h.costPerTurn?.toFixed(4)} · routed $${r.costPerTurn?.toFixed(4)} (${r.sonnetTurns}/${r.turns} turns on Sonnet)`);
  // cost per 1,000 turns: the hard share at the routed (Sonnet) price, the rest at Haiku's; Haiku's price for an easy turn
  // is its price on the hard cases (an upper bound: easy turns are shorter)
  const hardShare = share["course-chat"];
  const sonnetTurn = r.sonnetTurns ? (r.cost - (r.turns - r.sonnetTurns) * (h.costPerTurn ?? 0)) / r.sonnetTurns : 0;
  const per1k = (s: number) => 1000 * ((1 - s) * (h.costPerTurn ?? 0) + s * sonnetTurn);
  console.log(`  per 1,000 course-chat turns: Haiku only $${per1k(0).toFixed(2)} · routed $${per1k(hardShare).toFixed(2)} at the corpus's ${Math.round(hardShare * 100)}% hard share; at 5% $${per1k(0.05).toFixed(2)}, 10% $${per1k(0.1).toFixed(2)}, 20% $${per1k(0.2).toFixed(2)}`);
  if (dsaH && dsaS) {
    const a = JSON.parse(fs.readFileSync(path.join(dsaH, "results.json"), "utf8")) as { all: { pass: number; of: number }; cost: { answers: number } };
    const b = JSON.parse(fs.readFileSync(path.join(dsaS, "results.json"), "utf8")) as { all: { pass: number; of: number }; cost: { answers: number } };
    const ha = a.cost.answers / a.all.of;
    const sb = b.cost.answers / b.all.of;
    const dshare = (share["dsa-chat"] + share["dsa-tutor"]) / 2;
    console.log(`\nDSA hard turns (Sonnet judge): Haiku ${a.all.pass}/${a.all.of} · routed (Sonnet) ${b.all.pass}/${b.all.of}`);
    console.log(`  cost a turn: Haiku $${ha.toFixed(4)} · Sonnet $${sb.toFixed(4)}; per 1,000 DSA turns: Haiku $${(1000 * ha).toFixed(2)} · routed $${(1000 * ((1 - dshare) * ha + dshare * sb)).toFixed(2)} at ${Math.round(dshare * 100)}% hard`);
  }
}

const pct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)}%`);

if (process.argv[1]?.endsWith("route.ts")) main();
