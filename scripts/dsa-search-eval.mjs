/**
 * Eval for the Practice search: scripts/dsa-search-eval.json holds 40 queries with the problems or topic each should
 * bring up. hit@5 = an expected problem is in the top 5, or (for a topic) at least 3 of the top 5 carry it.
 *
 *   node scripts/dsa-search-eval.mjs            instant layer only (no network)
 *   node scripts/dsa-search-eval.mjs --set other.json   another query file in the same shape
 *   node scripts/dsa-search-eval.mjs --smart    also asks Claude Haiku 4.5 (needs ANTHROPIC_API_KEY, a few cents)
 *
 * Reads the problems straight from DSA_LOCAL_DIR (default ~/.cache/hk-render/dsa-content). Combined = the smart layer's
 * ranking where the instant layer misses (the learner presses Enter), and also where the query reads like a sentence
 * (smart runs by itself).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import matter from "gray-matter";

register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`));
const root = path.resolve(import.meta.dirname, "..");
const L = (p) => import(path.join(root, "src/lib/dsa", p));
const { buildProblemData } = await L("problem-rows.ts");
const { itemsFromRows } = await L("search/items.ts");
const { instantRank, makeIndex, smartRank } = await L("search/rank.ts");
const { buildTaxonomy, parseSmart, smartSystem, smartKey, SMART_MODEL, SMART_SCHEMA } = await L("search/smart.ts");
const { classicsOf } = await L("classics.ts");
const { blurbOf } = await L("bundle.ts");
const { isNatural } = await L("search/engine.ts");

const dir = path.join(process.env.DSA_LOCAL_DIR || path.join(os.homedir(), ".cache/hk-render/dsa-content"), "resources/problems");
const problems = [];
for (const id of fs.readdirSync(dir).sort()) {
  const p = path.join(dir, id, "problem.md");
  if (!fs.existsSync(p)) continue;
  const md = fs.readFileSync(p, "utf8");
  const f = matter(md).data;
  const t = f.tags || {};
  problems.push({
    id, title: f.title || id, module: f.module || "", concept: f.concept || "", line: f.line || "", level: f.level === "easy" || f.level === "hard" ? f.level : "medium", order: f.order ?? 0,
    patterns: t.patterns || [], minutes: t.minutes ?? null, classic: classicsOf(id, t.classic), rating: typeof t.difficulty === "number" ? t.difficulty : null,
    role: f.role === "checkpoint" || f.role === "warm-up" ? f.role : "practice", companyTypes: t.companyTypes || [], own: { structures: t.structures, algorithms: t.algorithms },
    blurb: blurbOf(md), domain: typeof t.domain === "string" ? t.domain : undefined, signals: Array.isArray(t.signals) ? t.signals.slice(0, 4) : undefined,
  });
}
const data = buildProblemData(problems, { labels: {}, concepts: [], videos: [] });
const rows = [...data.rows].sort((a, b) => a.seq - b.seq || a.order - b.order);
const index = makeIndex(itemsFromRows(rows, data.concepts));
const byId = new Map(rows.map((r) => [r.id, r]));
const taxonomy = buildTaxonomy(rows, data.companies, data.concepts, data.lessons);
const statusOf = () => "todo";
const setFile = process.argv.find((a, i) => process.argv[i - 1] === "--set") || path.join(root, "scripts/dsa-search-eval.json");
const evalSet = JSON.parse(fs.readFileSync(setFile, "utf8")).queries;

const hit = (q, ids) => {
  const top = ids.slice(0, 5);
  if (q.ids) return top.some((id) => q.ids.includes(id));
  const [g, v] = q.topic.split(":");
  const key = { structures: "structures", algorithms: "algorithms", patterns: "patterns" }[g];
  return top.filter((id) => byId.get(id)[key].includes(v) && (!q.level || byId.get(id).level === q.level)).length >= 3;
};

function env() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    return fs.readFileSync(path.join(root, ".env.local"), "utf8").match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

async function ask(q) {
  const key = env();
  const t0 = performance.now();
  const body = { model: SMART_MODEL, max_tokens: 500, system: smartSystem(taxonomy), messages: [{ role: "user", content: q }], output_config: { format: { type: "json_schema", schema: SMART_SCHEMA } } };
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j).slice(0, 300)}`);
  const ms = performance.now() - t0;
  const text = j.content?.map((c) => c.text || "").join("") || "";
  return { answer: parseSmart(text, taxonomy), ms, usage: j.usage, text };
}

const useSmart = process.argv.includes("--smart");
const rowsOut = [];
let sInstant = 0, sSmart = 0, sUnion = 0, sAuto = 0, tokIn = 0, tokOut = 0, msSum = 0, calls = 0;
for (const q of evalSet) {
  const t0 = performance.now();
  const inst = instantRank(index, q.q, { statusOf }).hits.map((h) => h.item.id);
  const instMs = performance.now() - t0;
  const i = hit(q, inst);
  let s = null, smartIds = [], note = "", filt = "";
  if (useSmart) {
    const r = await ask(q.q);
    calls++;
    msSum += r.ms;
    tokIn += r.usage?.input_tokens || 0;
    tokOut += r.usage?.output_tokens || 0;
    if (r.answer) {
      const ranked = smartRank(rows, index, r.answer, statusOf, q.q);
      smartIds = ranked.rows.map((x) => x.id);
      s = hit(q, smartIds);
      note = r.answer.note;
      filt = JSON.stringify({ ...r.answer.filters, kw: r.answer.keywords, relaxed: ranked.relaxed });
    } else s = false;
  }
  const natural = isNatural(q.q);
  if (i) sInstant++;
  if (s) sSmart++;
  if (i || s) sUnion++;
  if (natural ? s : i || s) sAuto++;
  rowsOut.push({ q: q.q, kind: q.kind, instant: i, smart: s, natural, instMs: +instMs.toFixed(2), top: inst.slice(0, 3).join(", "), smartTop: smartIds.slice(0, 3).join(", "), filt, note });
}
for (const r of rowsOut) console.log(`${r.instant ? "I" : "-"}${r.smart === null ? " " : r.smart ? "S" : "-"} ${r.kind.padEnd(9)} ${r.q.slice(0, 60).padEnd(60)} ${r.instant ? "" : "instant: " + r.top}${r.smart === false ? `\n      smart: ${r.smartTop}  ${r.filt}` : ""}`);
const n = evalSet.length;
const pct = (x) => `${x}/${n} = ${((100 * x) / n).toFixed(1)}%`;
console.log(`\nhit@5 instant only      ${pct(sInstant)}`);
if (useSmart) {
  console.log(`hit@5 smart only        ${pct(sSmart)}`);
  console.log(`hit@5 instant + smart   ${pct(sUnion)}  (smart asked when instant misses)`);
  console.log(`hit@5 as the UI runs it ${pct(sAuto)}  (sentences go straight to smart)`);
  console.log(`smart: ${calls} calls, avg ${(msSum / calls).toFixed(0)} ms, avg ${(tokIn / calls).toFixed(0)} in + ${(tokOut / calls).toFixed(0)} out tokens, $${(((tokIn / calls) * 1 + (tokOut / calls) * 5) / 1e6).toFixed(5)} per query (Haiku 4.5 list price)`);
}
const ms = rowsOut.map((r) => r.instMs).sort((a, b) => a - b);
console.log(`instant: median ${ms[ms.length >> 1]} ms, max ${ms[ms.length - 1]} ms (cold per query, Node)`);
if (process.argv.includes("--json")) fs.writeFileSync(path.join(root, "scripts/dsa-search-eval.last.json"), JSON.stringify(rowsOut, null, 1));
