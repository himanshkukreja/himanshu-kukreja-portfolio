#!/usr/bin/env node
// Validates the engineering-blog reading trail (resources/reading-trail/*.yml in the content repo).
//
//   SDM_LOCAL_DIR=../system-design-mastery node scripts/validate-reading-trail.mjs [--links] [--report=<file.json>] [--no-coverage]
//
// Errors (exit 1): YAML / schema problems (parse.ts: required fields, https URLs, types, minutes,
// summary line lengths, 2-3 entries per lesson, no duplicate id or URL within a lesson), a lesson
// key whose markdown file does not exist, a lesson listed in two files, and (unless --no-coverage)
// a day lesson, foundations part, capstone (weeks 00-10) or side quest (bonus 1-15) without a trail.
// Warnings: the same URL used in more than two lessons.
// --links GETs every URL with a generic browser User-Agent (no identifying headers) and reports the
// HTTP status and page title; --report writes that report as JSON. A link check never fails the run
// on its own, because some publishers answer bots with 403 (those entries carry a `note`).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { parseTrailFile, mergeTrailFiles, TRAIL_FILE_RE, LIMITS } = await jiti.import(path.join(root, "src/lib/learn/trail/parse.ts"));

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
const args = process.argv.slice(2);
const doLinks = args.includes("--links");
const reportFile = (args.find((a) => a.startsWith("--report=")) || "").slice(9) || null;
const coverage = !args.includes("--no-coverage");

const R = path.join(sdm, "resources");
const DIR = path.join(R, "reading-trail");
if (!fs.existsSync(DIR)) {
  console.error(`No reading-trail folder at ${DIR}`);
  process.exit(1);
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => TRAIL_FILE_RE.test(f))
  .sort();
const parsed = files.map((name) => ({ name, parsed: parseTrailFile(fs.readFileSync(path.join(DIR, name), "utf8"), name) }));
const { lessons, errors } = mergeTrailFiles(parsed);
const problems = [...errors];
const warnings = [];

// every lesson key must be a real lesson file
for (const key of lessons.keys()) {
  const [week, slug] = key.split("/");
  if (!fs.existsSync(path.join(R, week, `${slug}.md`))) problems.push(`${key}: no such lesson (resources/${week}/${slug}.md)`);
}

// coverage: foundations parts + day lessons + capstones of weeks 00-10, and side quests 1-15
const required = [];
for (const d of fs.readdirSync(R).filter((d) => /^week-(\d{2})-/.test(d)).sort()) {
  const n = parseInt(d.slice(5, 7), 10);
  if (n > 10) continue;
  for (const f of fs.readdirSync(path.join(R, d)).sort()) {
    if (/^(day-\d+|capstone|foundations-part-\d+)/.test(f) && f.endsWith(".md")) required.push(`${d}/${f.replace(/\.md$/, "")}`);
  }
}
const bonusDir = path.join(R, "bonus-problems");
if (fs.existsSync(bonusDir)) {
  for (const f of fs.readdirSync(bonusDir).sort()) {
    const m = f.match(/^bonus-(\d+)-.*\.md$/);
    if (m && +m[1] >= 1 && +m[1] <= 15) required.push(`bonus-problems/${f.replace(/\.md$/, "")}`);
  }
}
const missing = required.filter((k) => !lessons.has(k));
if (coverage) for (const k of missing) problems.push(`${k}: no reading trail`);

// reuse of the same URL across lessons
const byUrl = new Map();
for (const [key, l] of lessons) for (const e of l.entries) byUrl.set(e.url, [...(byUrl.get(e.url) || []), key]);
for (const [url, keys] of byUrl) if (keys.length > 2) warnings.push(`${url} is used in ${keys.length} lessons: ${keys.join(", ")}`);

// stats
const entries = [...lessons.values()].flatMap((l) => l.entries);
const tally = (f) => {
  const m = new Map();
  for (const e of entries) m.set(f(e), (m.get(f(e)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};
const sizes = {};
for (const l of lessons.values()) sizes[l.entries.length] = (sizes[l.entries.length] || 0) + 1;
console.log(`Reading trail: ${files.length} files, ${lessons.size} lessons, ${entries.length} entries, ${byUrl.size} distinct URLs`);
console.log(`Coverage: ${required.length - missing.length}/${required.length} required lessons have a trail`);
console.log(`Entries per lesson: ${Object.entries(sizes).map(([n, c]) => `${c} × ${n}`).join(", ")} (allowed ${LIMITS.entriesMin}-${LIMITS.entriesMax})`);
console.log(`Types: ${tally((e) => e.type).map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`Companies (${tally((e) => e.company).length}): ${tally((e) => e.company).map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`Publishers: ${tally((e) => e.publisher).length} distinct`);

// optional live link check
if (doLinks) {
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
  const titleOf = (html) => {
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1];
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return (og || t || "").replace(/\s+/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").trim();
  };
  const urls = [...byUrl.keys()];
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      const lessonsOf = byUrl.get(url);
      const entry = entries.find((e) => e.url === url);
      try {
        const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(25000), headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8", "Accept-Language": "en" } });
        const type = res.headers.get("content-type") || "";
        const title = type.includes("pdf") ? "(pdf)" : titleOf(await res.text());
        results.push({ url, status: res.status, final: res.url !== url ? res.url : null, title, expected: entry.title, note: entry.note || null, lessons: lessonsOf });
      } catch (e) {
        results.push({ url, status: 0, error: String(e?.cause?.code || e?.message || e), expected: entry.title, note: entry.note || null, lessons: lessonsOf });
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  results.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));
  const ok = results.filter((r) => r.status >= 200 && r.status < 300).length;
  console.log(`\nLink check: ${ok}/${results.length} answered 2xx`);
  for (const r of results.filter((r) => !(r.status >= 200 && r.status < 300))) warnings.push(`link ${r.status || r.error} ${r.url}${r.note ? ` (note: ${r.note})` : ""}`);
  if (reportFile) {
    fs.writeFileSync(reportFile, JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, ok, results }, null, 1));
    console.log(`Report written to ${reportFile}`);
  }
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (problems.length) {
  console.log(`\n${problems.length} error(s):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log("\nOK");
