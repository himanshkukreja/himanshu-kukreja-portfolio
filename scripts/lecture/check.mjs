// usage: node scripts/lecture/check.mjs <lecture.json>  — structure, highlight ids, sequence cut points, narration length
import fs from "fs";
const f = process.argv[2];
const L = JSON.parse(fs.readFileSync(f, "utf8"));
const errs = [], warns = [];
if (!L.quest || !L.title || !L.summary || !Array.isArray(L.scenes)) errs.push("needs quest, title, summary, scenes[]");
const KINDS = ["title", "numbers", "flowchart", "sequence", "state"];
let words = 0, steps = 0;
for (const s of L.scenes || []) {
  if (!KINDS.includes(s.kind)) errs.push(`${s.id}: bad kind ${s.kind}`);
  if (!s.id || !s.title || !Array.isArray(s.steps) || !s.steps.length) errs.push(`${s.id}: needs id, title, steps`);
  if (["flowchart", "sequence", "state"].includes(s.kind) && !s.diagram) errs.push(`${s.id}: ${s.kind} needs diagram`);
  if (s.kind === "numbers" && !(s.numbers || []).length) errs.push(`${s.id}: numbers scene needs numbers[]`);
  const src = s.diagram || "";
  const msgs = src.split("\n").filter((l) => /(-{1,2}>>|-{1,2}x|-{1,2}\)|-{1,2}>)/.test(l.trim()) || /^Note\s/i.test(l.trim())).length;
  const ids = new Set([...src.matchAll(/(?:^|[\s>|&-])([A-Za-z][A-Za-z0-9_]*)(?=\s*(?:\[|\(|\{|@\{|-->|==>|-\.->|:::|$|\s*&))/gm)].map((m) => m[1]));
  if (s.kind === "state") for (const m of src.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*-->/gm)) ids.add(m[1]);
  if (s.kind === "state") for (const m of src.matchAll(/-->\s*([A-Za-z_][A-Za-z0-9_]*)/gm)) ids.add(m[1]);
  let lastUpto = 0;
  for (const [k, st] of s.steps.entries()) {
    steps++;
    const w = (st.say || "").split(/\s+/).filter(Boolean).length;
    words += w;
    if (!st.say) errs.push(`${s.id}#${k}: empty say`);
    if (w > 45) warns.push(`${s.id}#${k}: ${w} words (keep steps under ~40)`);
    if (/[→·~₹%$€&<>{}\[\]=*_#|\\]/.test(st.say || "")) warns.push(`${s.id}#${k}: symbol in narration: ${(st.say.match(/[→·~₹%$€&<>{}\[\]=*_#|\\]/g) || []).join(" ")}`);
    if (st.caption && st.caption.split(/\s+/).length > 9) warns.push(`${s.id}#${k}: caption over 9 words`);
    for (const h of st.highlight || []) if (!ids.has(h)) errs.push(`${s.id}#${k}: highlight "${h}" isn't a node id in the diagram`);
    if (s.kind === "sequence" && st.upto) {
      if (st.upto > msgs) errs.push(`${s.id}#${k}: upto ${st.upto} > ${msgs} messages`);
      if (st.upto < lastUpto) warns.push(`${s.id}#${k}: upto goes backwards`);
      lastUpto = st.upto;
    }
  }
}
console.log(`${f.split("/").pop()}: ${L.scenes?.length} scenes, ${steps} steps, ${words} words (~${(words / 150).toFixed(1)} min)`);
for (const w of warns) console.log("  warn:", w);
for (const e of errs) console.log("  ERROR:", e);
process.exit(errs.length ? 1 : 0);
