#!/usr/bin/env node
// Regression test for `:::` blocks in the course renderer (src/lib/course/render.ts).
// Renders every lesson (and story) twice — without remark-directive (the old pipeline) and with it —
// and checks that enabling the plugin changes nothing it shouldn't:
//   1. files with no `:::` block: the HTML must be byte-identical (stray `:x` text directives are
//      turned back into their source text);
//   2. files with blocks: the course text (chrome excluded, compared word by word) must be identical
//      once the fence lines are taken out of the old output.
// usage: node scripts/test-blocks-render.mjs [dir-or-file ...]   (default: $SDM_LOCAL_DIR/resources + content/stories)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { renderLessonDetailed } = await jiti.import(path.join(root, "src/lib/course/render.ts"));

function envDir() {
  if (process.env.SDM_LOCAL_DIR) return process.env.SDM_LOCAL_DIR;
  try {
    const m = fs.readFileSync(path.join(root, ".env.local"), "utf8").match(/^SDM_LOCAL_DIR=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function walk(p, out = []) {
  if (!fs.existsSync(p)) return out;
  const st = fs.statSync(p);
  if (st.isFile()) {
    if (p.endsWith(".md")) out.push(p);
    return out;
  }
  for (const f of fs.readdirSync(p)) if (!f.startsWith(".") && f !== "node_modules") walk(path.join(p, f), out);
  return out;
}

const args = process.argv.slice(2);
const sdm = envDir();
const targets = args.length ? args : [sdm && path.join(sdm, "resources"), path.join(root, "content/stories")].filter(Boolean);
const files = targets.flatMap((t) => walk(t));

/* --- tiny HTML → text (our own well-formed rehype-stringify output), skipping data-sd-chrome subtrees */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m,
  );
function courseText(html) {
  let out = "";
  let skip = 0; // depth inside a chrome subtree
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) {
      if (!skip) out += decode(m[5]);
      continue;
    }
    const [, close, tag, attrs, selfClose] = m;
    const t = tag.toLowerCase();
    if (close) {
      const top = stack.pop();
      if (top && top.chrome) skip--;
      out += " ";
      continue;
    }
    if (VOID.has(t) || selfClose) continue;
    const chrome = /\sdata-sd-chrome(=|\s|$)/.test(attrs);
    stack.push({ t, chrome });
    if (chrome) skip++;
    out += " ";
  }
  return out;
}
const words = (s) => s.match(/[\p{L}\p{N}]+/gu) || [];
const FENCE_LINE = /^\s*:{3,}([a-z]+)?(?:\[([^\]]*)\])?(?:\{[^}]*\})?\s*$/gm;

let identical = 0;
let withBlocks = 0;
let failed = 0;
let stray = 0;
let strayFiles = 0;
const t0 = Date.now();
for (const file of files) {
  const md = fs.readFileSync(file, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
  const kind = /capstone/i.test(file) ? "capstone" : /foundations/i.test(file) ? "foundations" : /preview|overview/i.test(file) ? "week-preview" : "day-content";
  let before, after;
  try {
    before = await renderLessonDetailed(md, { kind, directives: false });
    after = await renderLessonDetailed(md, { kind });
  } catch (e) {
    failed++;
    console.log(`ERROR ${file}: ${e.message}`);
    continue;
  }
  if (after.stats.strayDirectives) {
    stray += after.stats.strayDirectives;
    strayFiles++;
  }
  const hasBlocks = /^\s*:{3,}[a-z]/m.test(md);
  const rel = path.relative(process.cwd(), file);
  if (!hasBlocks) {
    if (before.lesson.html === after.lesson.html && JSON.stringify(before.lesson.toc) === JSON.stringify(after.lesson.toc)) identical++;
    else {
      failed++;
      const a = before.lesson.html;
      const b = after.lesson.html;
      let k = 0;
      while (k < a.length && a[k] === b[k]) k++;
      console.log(`DIFF ${rel} (no blocks) at ${k}:\n  before …${a.slice(Math.max(0, k - 80), k + 120)}\n  after  …${b.slice(Math.max(0, k - 80), k + 120)}`);
    }
    continue;
  }
  withBlocks++;
  // old pipeline: fence lines are literal text — drop the fence syntax, keep the [title]
  const beforeMd = md.replace(FENCE_LINE, (_m, _name, title) => (title ? `\n\n${title.replace(/^(\d+)([.)])/, "$1\\$2")}\n\n` : "\n\n"));
  const ref = await renderLessonDetailed(beforeMd, { kind, directives: false });
  const wa = words(courseText(ref.lesson.html));
  const wb = words(courseText(after.lesson.html));
  let k = 0;
  while (k < wa.length && wa[k] === wb[k]) k++;
  if (k === wa.length && wa.length === wb.length) {
    // headings inside blocks must not reach the TOC: every TOC entry of the new render existed before
    const before = new Set(ref.lesson.toc.map((t) => t.text));
    const extra = after.lesson.toc.filter((t) => !before.has(t.text));
    const lost = ref.lesson.toc.length - after.lesson.toc.length;
    if (extra.length) {
      failed++;
      console.log(`TOC ${rel}: new entries ${extra.map((t) => t.text).join(" | ")}`);
    } else if (lost < 0) {
      failed++;
      console.log(`TOC ${rel}: grew by ${-lost}`);
    }
    continue;
  }
  failed++;
  console.log(`TEXT ${rel} (blocks) differs at word ${k}:\n  before …${wa.slice(Math.max(0, k - 12), k + 12).join(" ")}\n  after  …${wb.slice(Math.max(0, k - 12), k + 12).join(" ")}`);
}
console.log(
  `files ${files.length}: ${identical} identical HTML (no blocks), ${withBlocks} with blocks, ${failed} failing · stray directives neutralised: ${stray} in ${strayFiles} files · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
process.exit(failed ? 1 : 0);
