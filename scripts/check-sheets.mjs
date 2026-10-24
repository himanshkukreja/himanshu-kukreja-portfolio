// Every side quest ships with a design sheet (resources/design-sheets/<quest slug>.md, see its README):
// flags quests without a sheet, sheets without a quest, sheets missing a fixed section, and runs the
// diagram checks (parse + icon names) on every sheet.
// usage: node scripts/check-sheets.mjs [content dir]   (default: $SDM_LOCAL_DIR or ../system-design-mastery)
//        exit 1 on any failure
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = path.resolve(process.argv[2] || process.env.SDM_LOCAL_DIR || path.join(process.cwd(), "..", "system-design-mastery"));
const QUESTS = path.join(root, "resources", "bonus-problems");
const SHEETS = path.join(root, "resources", "design-sheets");
const SECTIONS = ["At a glance", "Architecture", "Key flows", "Data model", "Lifecycle", "Decisions", "When it breaks", "Say it in the interview"];

const md = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md") : []);
const quests = new Set(md(QUESTS).map((f) => f.replace(/\.md$/, "")));
const sheets = md(SHEETS).map((f) => f.replace(/\.md$/, ""));

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(msg);
};

for (const q of [...quests].sort()) if (!sheets.includes(q)) fail(`quest without a sheet: ${q} (write resources/design-sheets/${q}.md)`);
for (const s of sheets) {
  if (!quests.has(s)) fail(`sheet without a quest: ${s} (the file name must match the quest's, case included)`);
  const src = fs.readFileSync(path.join(SHEETS, `${s}.md`), "utf8");
  const heads = [...src.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  const missing = SECTIONS.filter((h) => !heads.includes(h));
  if (missing.length) fail(`${s}: missing section${missing.length > 1 ? "s" : ""} ${missing.map((h) => `"## ${h}"`).join(", ")}`);
  if (!/^# .+\n+> .+/m.test(src)) fail(`${s}: needs a "# Title" line followed by a one-line "> summary"`);
}

if (sheets.length) {
  const r = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), "check-diagrams.mjs"), ...sheets.map((s) => path.join(SHEETS, `${s}.md`))], { encoding: "utf8" });
  process.stdout.write(r.stdout || "");
  if (r.status !== 0) failures++;
}

console.log(`quests ${quests.size}, sheets ${sheets.length}, failing ${failures}`);
process.exit(failures ? 1 : 0);
