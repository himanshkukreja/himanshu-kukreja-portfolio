#!/usr/bin/env node
// Shorts coverage: every long lecture should have its vertical shorts, and every short should still match
// the lecture it was made from. Run before a release, and whenever content with a video is added or edited.
//   node scripts/shorts/coverage.mjs [content dir] [--missing] [--strict]
// - per category: lectures, lectures with at least one short (released or staged), shorts
// - --missing lists the lectures with none
// - stale: a short whose long lecture changed since the short was released (resources/shorts/index.json
//   records the long lecture's fingerprint at release); review it, re-write if the idea changed
// - war stories told only as a short (no long lecture): `of` is war-stories--<slug> and the source is the
//   story's markdown (stories/<slug>.md, or stories-next/ while staged); every story should have a short
// --strict exits 1 when anything is missing or stale (for a pre-release check)
import crypto from "crypto";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => !a.startsWith("--")) || process.env.SDM_LOCAL_DIR || "../system-design-mastery");
const R = path.join(root, "resources");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const hash = (o) => crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 12);
const jsons = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "lesson-index.json" && f !== "index.json") : []);

const category = (id) =>
  id.startsWith("war-stories--") ? "war stories" : id.startsWith("problem-bank--") ? "interview problems" : id.startsWith("low-level-design--") ? "low-level design" : id.startsWith("case-files--") ? "case files" : id.startsWith("mock-interviews--") ? "mock interviews" : id.startsWith("bonus-") ? "side quests" : "course";

const lectures = jsons(path.join(R, "lectures")).map((f) => {
  const l = read(path.join(R, "lectures", f));
  return { id: f.replace(/\.json$/, ""), hash: hash(l), v2: l.v === 2 };
}).filter((l) => l.v2);
const shorts = [...jsons(path.join(R, "shorts")).map((f) => ({ f, staged: false })), ...jsons(path.join(R, "shorts-next")).map((f) => ({ f, staged: true }))].map(({ f, staged }) => {
  const s = read(path.join(R, staged ? "shorts-next" : "shorts", f));
  return { id: s.quest, of: s.short?.of, staged };
});
const index = fs.existsSync(path.join(R, "shorts", "index.json")) ? read(path.join(R, "shorts", "index.json")) : {};

const byOf = new Map();
for (const s of shorts) byOf.set(s.of, [...(byOf.get(s.of) || []), s]);
const rows = new Map();
for (const l of lectures) {
  const c = category(l.id);
  const r = rows.get(c) || { lectures: 0, covered: 0, shorts: 0, missing: [] };
  r.lectures++;
  const mine = byOf.get(l.id) || [];
  if (mine.length) r.covered++;
  else r.missing.push(l.id);
  r.shorts += mine.length;
  rows.set(c, r);
}
// war stories without a long lecture: the story text is the source a short is checked against
const storyFile = (slug) => [path.join(R, "war-stories", "stories", `${slug}.md`), path.join(R, "war-stories", "stories-next", `${slug}.md`)].find((f) => fs.existsSync(f));
const storyHash = (slug) => {
  const f = storyFile(slug);
  return f ? crypto.createHash("sha1").update(fs.readFileSync(f, "utf8")).digest("hex").slice(0, 12) : null;
};
const sourceHash = (of) => lectures.find((l) => l.id === of)?.hash ?? (of.startsWith("war-stories--") ? storyHash(of.slice("war-stories--".length)) : null);
const stale = shorts.filter((s) => !s.staged && index[s.id] && sourceHash(s.of) !== index[s.id].ofSource).map((s) => s.id);
const orphan = shorts.filter((s) => !lectures.some((l) => l.id === s.of) && !(s.of?.startsWith("war-stories--") && storyFile(s.of.slice("war-stories--".length)))).map((s) => s.id);
const storySlugs = ["stories", "stories-next"].flatMap((d) => (fs.existsSync(path.join(R, "war-stories", d)) ? fs.readdirSync(path.join(R, "war-stories", d)).filter((f) => f.endsWith(".md")) : [])).map((f) => f.replace(/\.md$/, ""));
const storiesNoShort = storySlugs.filter((slug) => !shorts.some((s) => s.of === `war-stories--${slug}`));

console.log("category              lectures  with shorts  shorts");
let missing = 0;
for (const [c, r] of rows) {
  console.log(`${c.padEnd(22)}${String(r.lectures).padStart(8)}${String(r.covered).padStart(13)}${String(r.shorts).padStart(8)}`);
  missing += r.missing.length;
}
console.log(`${"war stories".padEnd(22)}${String(storySlugs.length).padStart(8)}${String(storySlugs.length - storiesNoShort.length).padStart(13)}${String(shorts.filter((s) => s.of?.startsWith("war-stories--")).length).padStart(8)}   (stories, incl. staged)`);
console.log(`\n${missing} lectures without shorts · ${storiesNoShort.length} stories without shorts · ${stale.length} stale shorts · ${orphan.length} shorts whose lecture is gone`);
if (args.includes("--missing")) for (const [c, r] of rows) if (r.missing.length) console.log(`\n${c}:\n  ${r.missing.join("\n  ")}`);
if (stale.length) console.log(`\nstale (their lecture changed since release):\n  ${stale.join("\n  ")}`);
if (orphan.length) console.log(`\norphans:\n  ${orphan.join("\n  ")}`);
if (args.includes("--missing") && storiesNoShort.length) console.log(`\nstories without a short:\n  ${storiesNoShort.join("\n  ")}`);
if (args.includes("--strict") && (missing || storiesNoShort.length || stale.length || orphan.length)) process.exit(1);
