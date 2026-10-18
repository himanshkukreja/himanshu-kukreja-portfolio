#!/usr/bin/env node
// Validates the concept catalogue (resources/concepts/concepts.yml in the content repo) against the
// real rendered lessons, and reports what hover-term marking does across the course.
//
//   SDM_LOCAL_DIR=../system-design-mastery node scripts/validate-concepts.mjs [--marks] [--context=<id>]
//
// Errors (exit 1): YAML / schema problems, unknown related ids, a taught_in / also anchor that is not
// an element id in that lesson's HTML.
// Warnings: a concept whose term (and aliases) never appears in the stage it is taught in, a concept
// that is never marked anywhere, ambiguous forms shared by two concepts.
// --marks prints per-file mark counts; --context=<id,id…> prints where those concepts get marked; --spread
// prints how many pages mark each concept.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { renderLessonDetailed } = await jiti.import(path.join(root, "src/lib/course/render.ts"));
const { parseCatalogue, buildTermIndex } = await jiti.import(path.join(root, "src/lib/concepts/catalogue.ts"));
const { buildMatcher, conceptForms, conceptsIn, formKey } = await jiti.import(path.join(root, "src/lib/concepts/match.ts"));
const { lessonStructure, stageOf } = await jiti.import(path.join(root, "src/lib/concepts/structure.ts"));

function envDir() {
  if (process.env.SDM_LOCAL_DIR) return process.env.SDM_LOCAL_DIR;
  try {
    const m = fs.readFileSync(path.join(root, ".env.local"), "utf8").match(/^SDM_LOCAL_DIR=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}
const sdm = envDir();
if (!sdm) {
  console.error("Set SDM_LOCAL_DIR to a checkout of the system-design-mastery repo.");
  process.exit(2);
}
const R = path.join(sdm, "resources");
const args = process.argv.slice(2);
const showMarks = args.includes("--marks");
const contextIds = new Set((args.find((a) => a.startsWith("--context=")) || "").slice(10).split(",").filter(Boolean));

const kindOf = (slug) =>
  slug.startsWith("day-") ? "day-content" : slug.startsWith("capstone") ? "capstone" : slug.startsWith("bonus") ? "bonus" : slug.startsWith("foundations") ? "foundations" : slug.includes("preview") ? "week-preview" : "day-content";

const text = fs.readFileSync(path.join(R, "concepts/concepts.yml"), "utf8");
const { catalogue, errors } = parseCatalogue(text);
const problems = [...errors];
const warnings = [];

/* ---------------- render every lesson once */
const lessons = new Map(); // "week/slug" -> { html, stages: [{id, ids:Set, text}] }
const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
function stagesOf(html) {
  const parts = html.split(/(?=<section data-sd="stage")/);
  return parts
    .filter((p) => p.startsWith("<section"))
    .map((p) => ({
      id: (p.match(/^<section[^>]*\sid="([^"]+)"/) || [])[1] || "",
      ids: new Set([...p.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
      text: decode(p.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")),
      html: p,
    }));
}
const files = [];
for (const d of fs.readdirSync(R).sort()) {
  const dir = path.join(R, d);
  if (!fs.statSync(dir).isDirectory() || d === "concepts" || d === "mock-interviews" || d === "revision") continue;
  for (const f of fs.readdirSync(dir).sort()) if (f.endsWith(".md") && !f.includes("mcq")) files.push(`${d}/${f.replace(/\.md$/, "")}`);
}
for (const lk of files) {
  const md = fs.readFileSync(path.join(R, `${lk}.md`), "utf8");
  const { lesson } = await renderLessonDetailed(md, { kind: kindOf(lk.split("/")[1]) });
  const stages = stagesOf(lesson.html);
  // the parse-only structure (mastery map) must agree with the renderer: quiz blocks per stage
  const st = await lessonStructure(md, kindOf(lk.split("/")[1]));
  const fromHtml = stages.map((s) => `${s.id}:${[...s.html.matchAll(/data-quiz-block="(\d+)"/g)].map((m) => m[1]).join(",")}`).join(" ");
  const fromParse = st.stages.map((s) => `${s.id}:${s.quizzes.map((q) => q.block).join(",")}`).join(" ");
  if (fromHtml !== fromParse) problems.push(`${lk}: structure pass disagrees with the renderer\n    html:  ${fromHtml}\n    parse: ${fromParse}`);
  lessons.set(lk, { html: lesson.html, stages, md, st });
}

/* ---------------- refs */
const allForms = catalogue.concepts.flatMap(conceptForms);
const formOwners = new Map();
for (const f of allForms) {
  const k = formKey(f.form);
  if (!formOwners.has(k)) formOwners.set(k, new Set());
  formOwners.get(k).add(f.id);
}
for (const [k, ids] of formOwners) if (ids.size > 1) problems.push(`form "${k}" is used by ${[...ids].join(", ")}`);

for (const c of catalogue.concepts) {
  const refs = [["taught_in", c.taught], ...c.also.map((a) => ["also", a])];
  for (const [kind, ref] of refs) {
    const l = lessons.get(ref.lesson);
    if (!l) {
      problems.push(`${c.id}: ${kind} lesson not found: ${ref.lesson}`);
      continue;
    }
    const stage = l.stages.find((s) => s.ids.has(ref.anchor));
    if (!stage) {
      problems.push(`${c.id}: ${kind} anchor #${ref.anchor} not in ${ref.lesson}`);
      continue;
    }
    const parsed = stageOf(l.st, ref.anchor);
    if (parsed !== stage.id) problems.push(`${c.id}: ${kind} #${ref.anchor} is in stage ${stage.id}, structure pass says ${parsed}`);
    if (kind === "taught_in") {
      const m = buildMatcher(conceptForms(c));
      if (!m || !conceptsIn(m, stage.text).has(c.id)) warnings.push(`${c.id}: "${c.term}" (or an alias) never appears in its taught stage ${ref.lesson}#${stage.id}`);
    }
  }
}

/* ---------------- marking across the course (+ stories) */
const index = buildTermIndex(catalogue);
const markedSomewhere = new Set();
const pagesOf = new Map();
const perFile = [];
const contexts = [];
const storyDir = path.join(root, "content/stories");
const storyFiles = fs.existsSync(storyDir) ? fs.readdirSync(storyDir).filter((f) => f.endsWith(".md")).map((f) => `story/${f}`) : [];
for (const lk of [...files, ...storyFiles]) {
  const md = lk.startsWith("story/") ? fs.readFileSync(path.join(storyDir, lk.slice(6)), "utf8").replace(/^---[\s\S]*?\n---\n/, "") : lessons.get(lk).md;
  const kind = lk.startsWith("story/") ? "day-content" : kindOf(lk.split("/")[1]);
  const { lesson, stats } = await renderLessonDetailed(md, { kind, terms: { index, here: lk.startsWith("story/") ? undefined : lk } });
  const ids = [...lesson.html.matchAll(/data-term="([^"]+)"/g)].map((m) => m[1]);
  // marking must not change the text (highlight / bookmark offsets): compare with the unmarked render
  if (!lk.startsWith("story/")) {
    const flat = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, ""));
    if (flat(lesson.html) !== flat(lessons.get(lk).html)) problems.push(`${lk}: marking changed the text content`);
  }
  ids.forEach((i) => markedSomewhere.add(i));
  new Set(ids).forEach((i) => pagesOf.set(i, (pagesOf.get(i) || 0) + 1));
  perFile.push([lk, stats.terms || 0, new Set(ids).size]);
  // marks must never sit inside code, headings, links, quizzes or checkpoints
  const bad = lesson.html.match(/<(pre|code|h[1-6]|a)\b[^>]*>(?:(?!<\/\1>)[\s\S])*?class="sd-term"/g);
  if (bad) problems.push(`${lk}: a term is marked inside <${bad[0].match(/^<(\w+)/)[1]}>`);
  for (const sd of ["quiz", "checkpoint", "mermaid"]) {
    const re = new RegExp(`data-sd="${sd}"`, "g");
    if (re.test(lesson.html)) {
      // crude containment check: split the html into that component's blocks
      for (const block of lesson.html.split(`data-sd="${sd}"`).slice(1)) {
        const end = block.search(sd === "quiz" ? /<\/figure>/ : /<\/(section|figure|aside|div)>/);
        if (block.slice(0, end).includes('class="sd-term"')) problems.push(`${lk}: a term is marked inside a ${sd}`);
      }
    }
  }
  for (const id of contextIds) {
    for (const m of lesson.html.matchAll(new RegExp(`(.{0,90})<span class="sd-term" data-term="${id}"[^>]*>([^<]*)</span>(.{0,70})`, "g")))
      contexts.push(`${id} · ${lk.split("/")[1].slice(0, 28)}: …${decode(m[1].replace(/<[^>]+>/g, "").replace(/^[^ ]* /, ""))}[${m[2]}]${decode(m[3].replace(/<[^>]+>/g, ""))}…`);
  }
}
for (const c of catalogue.concepts) if (c.mark && !markedSomewhere.has(c.id)) warnings.push(`${c.id}: never marked anywhere (term "${c.term}")`);

/* ---------------- report */
const groups = {};
catalogue.concepts.forEach((c) => {
  const w = c.taught.lesson.split("/")[0];
  groups[w] = (groups[w] || 0) + 1;
});
console.log(`concepts: ${catalogue.concepts.length} (${Object.entries(groups).map(([w, n]) => `${w.replace(/^(week-\d+).*/, "$1")}: ${n}`).join(", ")})`);
console.log(`lessons rendered: ${files.length} + ${storyFiles.length} stories; concepts marked somewhere: ${markedSomewhere.size}`);
const totals = perFile.map((p) => p[1]);
console.log(`marks per page: min ${Math.min(...totals)}, max ${Math.max(...totals)}, avg ${(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1)}`);
if (showMarks) perFile.forEach(([lk, n, u]) => console.log(`  ${String(n).padStart(4)} marks · ${String(u).padStart(3)} terms  ${lk}`));
if (contexts.length) console.log(contexts.join("\n"));
if (args.includes("--spread"))
  console.log(
    catalogue.concepts
      .map((c) => [c.id, pagesOf.get(c.id) || 0])
      .sort((a, b) => a[1] - b[1])
      .map(([id, n]) => `${String(n).padStart(3)} pages  ${id}`)
      .join("\n"),
  );
if (warnings.length) console.log(`\nwarnings (${warnings.length}):\n  ${warnings.join("\n  ")}`);
if (problems.length) {
  console.log(`\nERRORS (${problems.length}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("\nok");
