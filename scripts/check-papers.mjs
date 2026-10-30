#!/usr/bin/env node
// Written papers (resources/papers/<key>.md and resources/papers-next/<key>.md, see papers-next/README.md in the
// content repo): runs the site's own strict parser (src/lib/learn/papers/parse.ts) on every paper, then checks what
// the parser can't: the key names a real week or side quest, every source lesson exists, and every #anchor is an id
// the site really renders for that lesson (the lesson is rendered with src/lib/course/render.ts, as on the site).
// Warnings (a source without an anchor, an unusual mark total) don't fail the run.
// usage: node scripts/check-papers.mjs [content dir] [key ...]
//        (content dir default: $SDM_LOCAL_DIR, .env.local's SDM_LOCAL_DIR, or ../system-design-mastery)
//        exit 1 on any error
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createJiti } from "jiti";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(site, "src") } });
const { parsePaper, PAPER_KINDS } = await jiti.import(path.join(site, "src/lib/learn/papers/parse.ts"));

function envDir() {
  if (process.env.SDM_LOCAL_DIR) return process.env.SDM_LOCAL_DIR;
  try {
    const m = fs.readFileSync(path.join(site, ".env.local"), "utf8").match(/^SDM_LOCAL_DIR=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const dirArg = args[0] && fs.existsSync(args[0]) && fs.statSync(args[0]).isDirectory() ? args.shift() : null;
const root = path.resolve(dirArg || envDir() || path.join(site, "..", "system-design-mastery"));
const only = new Set(args);
const RES = path.join(root, "resources");
if (!fs.existsSync(RES)) {
  console.error(`no resources/ folder in ${root}`);
  process.exit(1);
}

const weeks = new Set(fs.readdirSync(RES).filter((d) => /^week-\d{2}-/.test(d) && fs.statSync(path.join(RES, d)).isDirectory()));
const quests = new Set(
  fs.existsSync(path.join(RES, "bonus-problems")) ? fs.readdirSync(path.join(RES, "bonus-problems")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")) : [],
);

/** the kind the site renders a lesson with (src/lib/github.ts parseFileToResource) */
function kindOf(week, slug) {
  if (week === "bonus-problems") return "bonus";
  if (week === "problem-bank") return "problem";
  if (week === "low-level-design") return "lld";
  if (slug.includes("preview")) return "week-preview";
  if (slug.includes("capstone")) return "capstone";
  if (slug.includes("foundations")) return "foundations";
  return "day-content";
}

const idCache = new Map();
let render = null;
async function lessonIds(week, slug) {
  const k = `${week}/${slug}`;
  if (idCache.has(k)) return idCache.get(k);
  const file = path.join(RES, week, `${slug}.md`);
  let ids = null;
  if (fs.existsSync(file)) {
    render ||= (await jiti.import(path.join(site, "src/lib/course/render.ts"))).renderLesson;
    const html = (await render(fs.readFileSync(file, "utf8"), { kind: kindOf(week, slug) })).html;
    ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  }
  idCache.set(k, ids);
  return ids;
}

let errors = 0;
let warns = 0;
let papers = 0;
const seen = new Map();
for (const folder of ["papers", "papers-next"]) {
  const dir = path.join(RES, folder);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".md") || f.toLowerCase() === "readme.md") continue;
    const key = f.replace(/\.md$/, "");
    if (only.size && !only.has(key)) continue;
    papers++;
    const at = `${folder}/${f}`;
    const out = [];
    const warn = [];
    const r = parsePaper(fs.readFileSync(path.join(dir, f), "utf8"), key);
    warn.push(...r.warnings);
    if (!r.ok) out.push(...r.errors);
    else {
      const p = r.paper;
      if (!weeks.has(key) && !quests.has(key)) out.push(`"${key}" is neither a week folder nor a side quest file`);
      if (seen.has(key)) warn.push(`also in ${seen.get(key)} (papers-next wins in development, papers/ in production)`);
      seen.set(key, folder);
      if (p.questions.length < 5 || p.questions.length > 8) warn.push(`${p.questions.length} questions (5 to 8 expected)`);
      if (p.marks < 40 || p.marks > 60) warn.push(`${p.marks} marks in total (about 40 to 60 expected)`);
      if (!p.questions.some((q) => q.kind === "diagram")) warn.push("no diagram question");
      const per = p.minutes / p.marks;
      if (per < 1.2 || per > 1.9) warn.push(`${p.minutes} minutes for ${p.marks} marks (about 1.5 minutes a mark expected)`);
      for (const q of p.questions) {
        if (!PAPER_KINDS.includes(q.kind)) out.push(`Q${q.n}: kind ${q.kind}`);
        for (const s of q.sources) {
          const ids = await lessonIds(s.week, s.slug);
          if (!ids) out.push(`Q${q.n}: source lesson ${s.week}/${s.slug}.md doesn't exist`);
          else if (s.anchor && !ids.has(s.anchor)) out.push(`Q${q.n}: #${s.anchor} is not an id in the rendered ${s.week}/${s.slug}`);
        }
      }
    }
    errors += out.length;
    warns += warn.length;
    const total = r.ok ? ` · ${r.paper.questions.length} questions · ${r.paper.marks} marks · ${r.paper.minutes} min` : "";
    console.log(`${out.length ? "✗" : "✓"} ${at}${total}`);
    out.forEach((e) => console.log(`    error: ${e}`));
    warn.forEach((w) => console.log(`    warning: ${w}`));
  }
}
console.log(`\n${papers} paper${papers === 1 ? "" : "s"}, ${errors} error${errors === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"}`);
process.exit(errors ? 1 : 0);
