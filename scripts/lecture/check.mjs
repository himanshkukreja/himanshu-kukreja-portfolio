// usage: node scripts/lecture/check.mjs <lecture.json>  — structure, highlight ids, sequence cut points, narration length
import fs from "fs";
import path from "path";
const f = process.argv[2];
const L = JSON.parse(fs.readFileSync(f, "utf8"));
const errs = [], warns = [];
if (!L.quest || !L.title || !L.summary || !Array.isArray(L.scenes)) errs.push("needs quest, title, summary, scenes[]");
const KINDS = ["title", "numbers", "flowchart", "sequence", "state", "list", "compare", "quiz", "chart", "timeline", "phone"];
// flowchart edges as "from>to" (node shapes, classes and edge labels stripped; "A & B --> C" expanded)
function edgesOf(src) {
  const out = new Set();
  for (let line of src.split("\n")) {
    line = line.replace(/@\{[^}]*\}/g, "").replace(/\["[^"]*"\]|\[[^\]]*\]/g, "").replace(/\(\[[^\]]*\]\)|\(\([^)]*\)\)|\([^)]*\)/g, "").replace(/\{"[^"]*"\}|\{[^}]*\}/g, "").replace(/:::[\w-]+/g, "").replace(/\|[^|]*\|/g, "");
    const parts = line.split(/\s*(?:-\.->|==>|-->|---|-\.-|<-->|~~~)\s*/);
    if (parts.length < 2) continue;
    for (let k = 0; k + 1 < parts.length; k++)
      for (const a of parts[k].split("&").map((x) => x.trim()).filter(Boolean))
        for (const b of parts[k + 1].split("&").map((x) => x.trim()).filter(Boolean)) out.add(`${a}>${b}`);
  }
  return out;
}
let quizzes = 0;
let words = 0, steps = 0;
for (const s of L.scenes || []) {
  if (!KINDS.includes(s.kind)) errs.push(`${s.id}: bad kind ${s.kind}`);
  if (!s.id || !s.title || !Array.isArray(s.steps) || !s.steps.length) errs.push(`${s.id}: needs id, title, steps`);
  if (["flowchart", "sequence", "state"].includes(s.kind) && !s.diagram) errs.push(`${s.id}: ${s.kind} needs diagram`);
  // mermaid ends a sequence statement at ";": the diagram fails and the export waits forever on that frame
  if (s.kind === "sequence" && (s.diagram || "").includes(";")) errs.push(`${s.id}: no ";" in a sequence diagram (mermaid reads it as the end of a line)`);
  if (s.kind === "numbers" && !(s.numbers || []).length) errs.push(`${s.id}: numbers scene needs numbers[]`);
  if (s.kind === "list" && !(s.points || []).length) errs.push(`${s.id}: list scene needs points[]`);
  if (s.kind === "compare" && !(s.left?.points?.length && s.right?.points?.length)) errs.push(`${s.id}: compare needs left/right with points[]`);
  if (s.kind === "chart" && (!["bar", "line"].includes(s.type) || !(s.points || []).length || s.points.some((p) => typeof p.value !== "number"))) errs.push(`${s.id}: chart needs type bar|line and numeric points[]`);
  if (s.kind === "timeline" && !(s.events || []).length) errs.push(`${s.id}: timeline needs events[]`);
  if (s.kind === "phone" && !(s.app && (s.screens || []).length && s.screens.every((x) => x.title && Array.isArray(x.rows)))) errs.push(`${s.id}: phone needs app and screens[{title, rows[]}]`);
  const edges = s.kind === "flowchart" ? edgesOf(s.diagram || "") : new Set();
  if (s.kind === "quiz") {
    quizzes++;
    if (!s.question || !Array.isArray(s.options) || s.options.length < 3 || s.options.length > 4) errs.push(`${s.id}: quiz needs a question and 3-4 options`);
    if (!(Number.isInteger(s.answer) && s.answer >= 0 && s.answer < (s.options || []).length)) errs.push(`${s.id}: quiz answer must index options`);
    if (!s.explain) errs.push(`${s.id}: quiz needs explain`);
    if (s.steps.length !== 2) errs.push(`${s.id}: quiz needs exactly 2 steps (ask, answer)`);
  }
  const revealMax = s.kind === "list" || s.kind === "chart" ? (s.points || []).length : s.kind === "timeline" ? (s.events || []).length : s.kind === "phone" ? Math.max(0, ...(s.screens || []).map((x) => x.rows.length)) : s.kind === "compare" ? (s.left?.points?.length || 0) + (s.right?.points?.length || 0) : 0;
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
    if (st.reveal != null && !["list", "compare", "chart", "timeline", "phone"].includes(s.kind)) warns.push(`${s.id}#${k}: reveal only applies to list/compare/chart/timeline/phone`);
    if (st.flow) {
      if (s.kind !== "flowchart") warns.push(`${s.id}#${k}: flow only applies to flowcharts`);
      else for (let j = 0; j + 1 < st.flow.length; j++) if (!edges.has(`${st.flow[j]}>${st.flow[j + 1]}`)) errs.push(`${s.id}#${k}: flow ${st.flow[j]} -> ${st.flow[j + 1]} isn't an edge in the diagram`);
    }
    for (const h of st.focus || []) if (!ids.has(h)) errs.push(`${s.id}#${k}: focus "${h}" isn't a node id`);
    if (s.kind === "phone" && st.screen != null && !(st.screen >= 0 && st.screen < (s.screens || []).length)) errs.push(`${s.id}#${k}: screen ${st.screen} out of range`);
    if (st.reveal != null && (st.reveal < 0 || st.reveal > revealMax)) errs.push(`${s.id}#${k}: reveal ${st.reveal} outside 0..${revealMax}`);
    if (st.pause != null && !(st.pause >= 0 && st.pause <= 3)) errs.push(`${s.id}#${k}: pause must be 0-3 s`);
    if (s.kind === "sequence" && st.upto) {
      if (st.upto > msgs) errs.push(`${s.id}#${k}: upto ${st.upto} > ${msgs} messages`);
      if (st.upto < lastUpto) warns.push(`${s.id}#${k}: upto goes backwards`);
      lastUpto = st.upto;
    }
  }
}
// course lessons have their own ranges (resources/lectures/README.md, "Course lessons")
const RANGES = { quest: [1700, 2300, 3, 4, 16, 24], preview: [900, 1600, 1, 2, 8, 14], lesson: [2100, 3400, 3, 5, 20, 34], capstone: [2700, 3900, 3, 5, 24, 38], problem: [1900, 2900, 3, 4, 18, 30], lld: [1900, 2900, 3, 4, 18, 30], case: [1500, 2600, 2, 4, 14, 26], interview: [5000, 7800, 0, 3, 28, 80], story: [330, 560, 0, 1, 6, 10], short: [150, 270, 0, 0, 5, 9] };
const kind = L.short ? "short" : L.lesson ? L.lesson.kind : "quest";
// vertical shorts (resources/shorts/shorts--<long id>.json): portrait-friendly scenes only
if (L.short) {
  // one lecture can give several shorts: shorts--<long id> or shorts--<long id>--<part slug>
  if (!/^shorts--[A-Za-z0-9-]+$/.test(L.quest || "") || !(L.quest === `shorts--${L.short.of}` || (L.quest || "").startsWith(`shorts--${L.short.of}--`))) errs.push(`short quest must be "shorts--${L.short?.of}" or "shorts--${L.short?.of}--<part>"`);
  if (!L.short.of || !L.short.article || !L.short.label) errs.push("short needs of (the long lecture id), article (its page) and label");
  if (!Array.isArray(L.short.topics) || L.short.topics.length < 1 || L.short.topics.length > 3) errs.push("short needs 1-3 topics (lowercase tags like caching, databases, incidents)");
  if (!["tension", "drive", "lofi", "playful", "bright"].includes(L.short.music)) errs.push("short needs music: tension | drive | lofi | playful | bright");
  else for (const tg of L.short.topics) if (!/^[a-z][a-z0-9-]{1,24}$/.test(tg)) errs.push(`topic "${tg}" must be a lowercase tag`);
  // `at` must be a scene of the long lecture (looked up next to this file: ../lectures or ../lectures-next)
  if (L.short.at) {
    const dir = path.dirname(path.resolve(f));
    const longFile = [path.join(dir, "..", "lectures", `${L.short.of}.json`), path.join(dir, "..", "lectures-next", `${L.short.of}.json`)].find((x) => fs.existsSync(x));
    if (!longFile) warns.push(`long lecture ${L.short.of} not found next to this file`);
    else if (!JSON.parse(fs.readFileSync(longFile, "utf8")).scenes?.some((s) => s.id === L.short.at)) errs.push(`at "${L.short.at}" isn't a scene of ${L.short.of}`);
  } else if (!L.short.of.startsWith("war-stories--")) warns.push("short has no at: the full-lecture link opens at the start");
  // a war story told only as a short + its article has no long lecture, so nothing to point `at`
  for (const s of L.scenes || []) {
    if (["quiz"].includes(s.kind)) errs.push(`${s.id}: shorts have no quizzes`);
    // sequence diagrams lay out sideways: on a phone their text is unreadable. Use a top-down flowchart.
    if (s.kind === "sequence") errs.push(`${s.id}: no sequence diagrams in a short (use flowchart TB)`);
    if (s.kind === "flowchart" && ((s.diagram || "").match(/^\s*[A-Za-z][\w-]*\s*[\[({]/gm) || []).length > 6) warns.push(`${s.id}: more than 6 nodes is too small on a phone`);
    if (s.kind === "flowchart" && /^\s*(flowchart|graph)\s+(LR|RL)/m.test(s.diagram || "")) errs.push(`${s.id}: flowcharts in a short run top-down (flowchart TB)`);
    // state diagrams spread sideways and don't zoom in a short: a busy one is unreadable on a phone
    if (s.kind === "state") {
      const tr = (s.diagram || "").split("\n").filter((l) => l.includes("-->"));
      const label = Math.max(0, ...tr.map((l) => (l.split(":")[1] || "").trim().length));
      if (tr.length > 5 || label > 22) warns.push(`${s.id}: a busy state diagram (${tr.length} transitions, ${label}-char label) is unreadable on a phone; use a flowchart TB with 1-3 word labels`);
    }
    if ((s.kind === "numbers" && (s.numbers || []).length > 3) || (s.kind === "list" && (s.points || []).length > 3) || (s.kind === "chart" && (s.points || []).length > 4) || (s.kind === "timeline" && (s.events || []).length > 4) || (s.kind === "compare" && Math.max(s.left?.points?.length || 0, s.right?.points?.length || 0) > 3)) errs.push(`${s.id}: too many items for a phone screen (numbers/list 3, chart/timeline 4, compare 3 a side)`);
    for (const [k, st] of (s.steps || []).entries()) for (const sentence of (st.say || "").split(/(?<=[.!?])\s+/)) if (sentence.split(/\s+/).length > 14) warns.push(`${s.id}#${k}: a ${sentence.split(/\s+/).length}-word sentence (Reels lines are ≤ 12)`);
  }
}
if (L.lesson) {
  if (!["preview", "lesson", "capstone", "problem", "lld", "case", "interview", "story"].includes(L.lesson.kind) || !L.lesson.week || !L.lesson.slug) errs.push("lesson needs week, slug and kind preview|lesson|capstone|problem|lld|case|interview|story");
  if (L.quest !== `${L.lesson.week}--${L.lesson.slug}`) errs.push(`quest must be "${L.lesson.week}--${L.lesson.slug}"`);
}
let index = null;
try {
  index = JSON.parse(fs.readFileSync(new URL("lesson-index.json", `file://${path.resolve(f)}`), "utf8"));
} catch {}
let refs = 0;
for (const s of L.scenes || [])
  for (const [k, st] of s.steps.entries()) {
    if (!st.ref) continue;
    refs++;
    if (!st.ref.lecture || !st.ref.label) errs.push(`${s.id}#${k}: ref needs lecture and label`);
    else if (st.ref.label.split(/\s+/).length > 6) warns.push(`${s.id}#${k}: ref label over 6 words`);
    if (index && st.ref.lecture) {
      const at = index.findIndex((x) => x.id === st.ref.lecture);
      const me = index.findIndex((x) => x.id === L.quest);
      if (at < 0) errs.push(`${s.id}#${k}: ref lecture "${st.ref.lecture}" isn't in lesson-index.json`);
      else if (me >= 0 && at >= me) errs.push(`${s.id}#${k}: ref must point to an earlier lesson`);
    }
  }
if (L.lesson && ["problem", "lld"].includes(L.lesson.kind) && (refs < 2 || refs > 5)) warns.push(`${refs} refs (target 2-5)`);
if (L.lesson && L.lesson.kind === "case" && (refs < 1 || refs > 4)) warns.push(`${refs} refs (target 1-4)`);
if (L.lesson?.kind === "interview" || L.cast) {
  const VOICES = /^(af|am|bf|bm)_[a-z]+$/;
  if (!L.cast?.interviewer?.name || !L.cast?.candidate?.name) errs.push("interview needs cast.interviewer and cast.candidate with name and voice");
  else for (const r of ["interviewer", "candidate"]) if (!VOICES.test(L.cast[r].voice || "")) errs.push(`cast.${r}.voice must be a Kokoro English voice like am_michael`);
  if (L.cast && L.cast.interviewer.voice === L.cast.candidate.voice) errs.push("interviewer and candidate need different voices");
  for (const s of L.scenes || []) for (const [k, st] of s.steps.entries()) if (s.kind !== "quiz" && !["interviewer", "candidate"].includes(st.who)) errs.push(`${s.id}#${k}: who must be interviewer or candidate`);
}
if (L.lesson && L.lesson.kind !== "preview" && index && index.findIndex((x) => x.id === L.quest) > 0 && (refs < 2 || refs > 6)) warns.push(`${refs} refs (target 2-6)`);
if (L.v === 2) {
  const [wMin, wMax, qMin, qMax, sMin, sMax] = RANGES[kind];
  if (words < wMin || words > wMax) warns.push(`narration is ${words} words (${kind} target ${wMin}-${wMax})`);
  if (quizzes < qMin || quizzes > qMax) warns.push(`${quizzes} quiz checkpoints (${kind} target ${qMin}-${qMax})`);
  if ((L.scenes || []).length < sMin || (L.scenes || []).length > sMax) warns.push(`${(L.scenes || []).length} scenes (${kind} target ${sMin}-${sMax})`);
  // 16:9 lectures read left to right; vertical shorts run top-down (checked in the short rules above)
  if (!L.short) for (const s of L.scenes || []) if (s.kind === "flowchart" && /^\s*(flowchart|graph)\s+(TD|TB)/m.test(s.diagram || "")) warns.push(`${s.id}: flowchart should be LR for video`);
  for (const s of L.scenes || []) if (s.kind === "flowchart" && /<br\/?>/.test(s.diagram || "")) warns.push(`${s.id}: flowchart labels should be one line (no <br/>)`);
}
console.log(`${f.split("/").pop()}: ${L.scenes?.length} scenes, ${steps} steps, ${words} words (~${(words / 150).toFixed(1)} min), ${quizzes} quizzes`);
for (const w of warns) console.log("  warn:", w);
for (const e of errs) console.log("  ERROR:", e);
process.exit(errs.length ? 1 : 0);
