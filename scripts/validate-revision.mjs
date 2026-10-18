#!/usr/bin/env node
// Validates interview-night revision cards (resources/revision/week-XX.md in the content repo)
// with the same parser the site uses (src/lib/learn/revision/parse.ts, loaded through Node's
// built-in TypeScript type stripping: Node 22.18+).
//
// usage: node scripts/validate-revision.mjs [<content repo root or resources dir>] [--strict]
//        default root: $SDM_LOCAL_DIR or ../system-design-mastery
//        --strict  also fail on warnings (card counts, missing card kinds)
// Checks: format, known card kinds, ≤ 40 words per card, no emoji, every `# slug` is a real lesson
// of that week, and lists the lessons of each week that have no cards yet.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { parseRevision, cardWords } = await import(path.join(here, "../src/lib/learn/revision/parse.ts"));

const args = process.argv.slice(2);
const strict = args.includes("--strict");
let root = args.find((a) => !a.startsWith("--")) || process.env.SDM_LOCAL_DIR || path.join(here, "../../system-design-mastery");
if (fs.existsSync(path.join(root, "resources"))) root = path.join(root, "resources");
const dir = path.join(root, "revision");
if (!fs.existsSync(dir)) {
  console.error(`no revision folder at ${dir}`);
  process.exit(1);
}

const LESSON = /^(day-\d+-.*|capstone-.*|foundations-part-\d+-.*)\.md$/;
let errors = 0;
let warns = 0;
let cards = 0;
let lessonsWithCards = 0;
const missing = [];

for (const f of fs.readdirSync(dir).filter((n) => /^week-\d+\.md$/.test(n)).sort()) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const { week, issues } = parseRevision(src);
  const lessonsDir = week ? path.join(root, week.week) : null;
  if (week && !fs.existsSync(lessonsDir)) issues.push({ line: 1, level: "error", msg: `week folder ${week.week} not found` });
  const real = lessonsDir && fs.existsSync(lessonsDir) ? fs.readdirSync(lessonsDir).filter((n) => LESSON.test(n)).map((n) => n.replace(/\.md$/, "")) : [];
  if (week) {
    if (!f.startsWith(week.week.slice(0, 7))) issues.push({ line: 1, level: "warn", msg: `file ${f} holds ${week.week}` });
    for (const l of week.lessons) if (real.length && !real.includes(l.slug)) issues.push({ line: 0, level: "error", msg: `${l.slug} is not a lesson in ${week.week}` });
    for (const r of real) if (!week.lessons.some((l) => l.slug === r)) missing.push(`${week.week}/${r}`);
    cards += week.lessons.reduce((a, l) => a + l.cards.length, 0);
    lessonsWithCards += week.lessons.length;
  }
  const e = issues.filter((x) => x.level === "error");
  const w = issues.filter((x) => x.level === "warn");
  errors += e.length;
  warns += w.length;
  const n = week ? week.lessons.reduce((a, l) => a + l.cards.length, 0) : 0;
  const longest = week ? Math.max(0, ...week.lessons.flatMap((l) => l.cards.map(cardWords))) : 0;
  console.log(`${e.length ? "FAIL" : "ok  "} ${f}: ${week?.lessons.length ?? 0} lessons, ${n} cards, longest card ${longest} words`);
  for (const x of [...e, ...w]) console.log(`     ${x.level === "error" ? "error" : "warn "} ${x.line ? `line ${x.line}: ` : ""}${x.msg}`);
}

console.log(`\n${lessonsWithCards} lessons, ${cards} cards, ${errors} errors, ${warns} warnings`);
if (missing.length) console.log(`lessons without cards (${missing.length}):\n  ${missing.join("\n  ")}`);
process.exit(errors || (strict && warns) ? 1 : 0);
