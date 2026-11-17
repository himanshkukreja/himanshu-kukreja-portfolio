/**
 * Theme rule check (build spec 4.1): new DSA components use tokens only. Greps the redesign's component folders for raw
 * hex, rgb()/rgba() and named Tailwind palette colours.   node scripts/check-dsa-tokens.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const DIRS = ["home", "lesson", "lean", "practice", "review", "progress", "ui"].map((d) => `src/components/dsa/${d}`);
const FILES = ["src/components/site/DsaNav.tsx"];
const BAD = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\b(?:bg|text|border|outline|ring|fill|stroke)-(?:white|black|gray|slate|zinc|neutral|teal|emerald|green|red)\b/;

const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : /\.(tsx?|css)$/.test(p) ? [p] : []);
const files = [...DIRS.filter((d) => existsSync(join(root, d))).flatMap((d) => walk(join(root, d))), ...FILES.map((f) => join(root, f))];
let bad = 0;
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    // menus may keep the existing shadow (spec 4.1 rule 5)
    if (/shadow-\[0_12px_40px_rgba\(0,0,0,0\.18\)\]/.test(line)) return;
    if (BAD.test(line)) {
      bad++;
      console.log(`${f.replace(root + "/", "")}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}
console.log(bad ? `${bad} raw colour(s) in ${files.length} files` : `ok: ${files.length} files use tokens only`);
process.exit(bad ? 1 : 0);
