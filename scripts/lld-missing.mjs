/**
 * What each low-level design lesson still lacks for the interview walkthrough (steps, interview
 * checklist, code in other languages), for writers. Reads the course repo's lessons the way the
 * site does (src/lib/learn/lld/steps.ts), so the list matches what learners see as "not written yet".
 *   node scripts/lld-missing.mjs [path to resources/low-level-design]
 */
import fs from "node:fs";
import path from "node:path";
import { restructureLld } from "../src/lib/learn/lld/steps.ts";

const dir = process.argv[2] || path.join(process.env.SDM_LOCAL_DIR || "../system-design-mastery", "resources/low-level-design");
if (!fs.existsSync(dir)) {
  console.error(`No such folder: ${dir}`);
  process.exit(1);
}
for (const f of fs.readdirSync(dir).filter((x) => /^lld-\d+-.+\.md$/.test(x)).sort()) {
  const { analysis } = restructureLld(fs.readFileSync(path.join(dir, f), "utf8"));
  console.log(`${f.replace(/\.md$/, "")}: ${analysis.missing.length ? analysis.missing.join("; ") : "complete"}`);
  if (analysis.fallthrough.length) console.log(`  (headings placed in the Code step: ${analysis.fallthrough.join(", ")})`);
}
