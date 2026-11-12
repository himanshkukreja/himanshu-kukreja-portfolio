/**
 * Citation-check eval (lib/ai/chat/citations.ts) on the fixtures in citation-cases.ts: answers with deliberately bad
 * citations (glued to the wrong source, half-good groups, invented facts) and good ones (paraphrases, list items, a
 * citation after the full stop). Every citation's verdict (ok / fixed:<ref> / dropped / unverifiable) is compared with
 * the expected one. Also reports the catch rate (bad citations fixed or dropped) and the false-drop rate (good citations
 * touched). Deterministic, no model calls: part of the nightly run.
 *   npx tsx scripts/ai-eval/citations.ts <out dir>
 */
import fs from "fs";
import path from "path";
import { checkCitations } from "@/lib/ai/chat/citations";
import { CITATION_CASES } from "./citation-cases";

const OUT = path.resolve(process.argv[2] || "citations-eval-out");
let right = 0;
let total = 0;
let bad = 0;
let caught = 0;
let good = 0;
let touched = 0;
const rows = CITATION_CASES.map((c) => {
  const r = checkCitations(c.answer, c.evidence);
  const got = r.details.map((d) => (d.verdict === "fixed" ? `fixed:${d.to}` : d.verdict));
  c.expect.forEach((e, i) => {
    total++;
    if (got[i] === e) right++;
    if (e.startsWith("fixed") || e === "dropped") {
      bad++;
      if (got[i] && got[i] !== "ok" && got[i] !== "unverifiable") caught++;
    } else if (e === "ok") {
      good++;
      if (got[i] !== "ok") touched++;
    }
  });
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  console.log(`${ok ? "ok  " : "FAIL"} ${c.id.padEnd(32)} ${got.join(",")}${ok ? "" : `  (want ${c.expect.join(",")})`}`);
  return { id: c.id, feature: c.feature, ok, got, expect: c.expect, text: r.text };
});
const summary = { verdicts: { right, total, rate: total ? right / total : null }, catch: { caught, bad, rate: bad ? caught / bad : null }, falseDrop: { touched, good, rate: good ? touched / good : null } };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ summary, rows }, null, 2));
console.log(`\nverdicts ${right}/${total} · bad citations caught ${caught}/${bad} · good citations touched ${touched}/${good}`);
