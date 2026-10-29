#!/usr/bin/env node
// Checks every code lab in the content repo with the same Pyodide build and harness the browser uses:
//   - the file parses (src/lib/learn/labs/parse.ts)
//   - the starter loads and fails at least one test (a lab you pass without coding is broken)
//   - the solution passes every visible and hidden test
//
//   - with --site <url> (a running build of the site): every lesson link on each lab page points at
//     a heading id that exists on that lesson page
//
// usage: node scripts/labs/check-labs.mjs [<content repo root or resources dir>] [--only <id>] [--verbose] [--site http://localhost:3152]
// (Node 22.18+: the .ts modules load with built-in type stripping.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, "../..");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const siteIdx = args.indexOf("--site");
const siteUrl = siteIdx >= 0 ? args[siteIdx + 1]?.replace(/\/+$/, "") : null;
const positional = args.filter((a, i) => !a.startsWith("--") && (onlyIdx < 0 || i !== onlyIdx + 1) && (siteIdx < 0 || i !== siteIdx + 1));
let root = positional[0] || process.env.SDM_LOCAL_DIR || path.resolve(site, "../system-design-mastery");
if (fs.existsSync(path.join(root, "resources"))) root = path.join(root, "resources");
const dir = path.join(root, "labs");
if (!fs.existsSync(dir)) {
  console.error(`no labs folder at ${dir}`);
  process.exit(1);
}

const { parseLab } = await import(path.join(site, "src/lib/learn/labs/parse.ts"));
const { HARNESS_PY } = await import(path.join(site, "src/lib/learn/labs/harness.ts"));
const require = createRequire(import.meta.url);
const { loadPyodide } = require(path.join(site, "node_modules/pyodide/pyodide.js"));

const t0 = Date.now();
const py = await loadPyodide({ indexURL: path.join(site, "node_modules/pyodide") + "/" });
console.log(`pyodide ${py.version} loaded in ${Date.now() - t0} ms`);
let out = "";
py.setStdout({ batched: (s) => (out += s + "\n") });
py.setStderr({ batched: (s) => (out += s + "\n") });
py.runPython(HARNESS_PY);
const run = py.globals.get("__hk_lab_run");

function exec(lab, code) {
  out = "";
  const groups = [{ name: "visible", src: lab.visible }, ...(lab.hidden ? [{ name: "hidden", src: lab.hidden }] : [])];
  const t = Date.now();
  const res = JSON.parse(run(code, lab.given, JSON.stringify(groups)));
  return { ...res, wall: Date.now() - t, stdout: out };
}

// same rule as the site's loader (src/lib/learn/labs/load.ts): lowercase kebab-case <id>.md, so notes
// such as README.md or PLAN-W5-W11.md are never parsed as labs
const files = fs.readdirSync(dir).filter((n) => /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(n) && n !== "readme.md").sort();
let bad = 0;
const ids = new Set();
for (const f of files) {
  let lab;
  try {
    lab = parseLab(fs.readFileSync(path.join(dir, f), "utf8"), f);
  } catch (e) {
    bad++;
    console.log(`✗ ${f}: ${e.message}`);
    continue;
  }
  if (only && lab.id !== only) continue;
  const problems = [];
  if (ids.has(lab.id)) problems.push(`duplicate id ${lab.id}`);
  ids.add(lab.id);
  if (`${lab.id}.md` !== f) problems.push(`file name should be ${lab.id}.md`);

  const s = exec(lab, lab.starter);
  const sFail = s.tests.filter((t) => !t.ok).length;
  if (s.setup) problems.push(`starter does not load: ${s.setup.kind}: ${s.setup.message}`);
  else if (!sFail) problems.push("starter passes every test");

  const r = exec(lab, lab.solution);
  if (r.setup) problems.push(`solution does not load: ${r.setup.kind}: ${r.setup.message}`);
  const failed = r.tests.filter((t) => !t.ok);
  for (const t of failed) problems.push(`solution fails ${t.group}/${t.name}: ${t.error?.kind}: ${t.error?.message}`);
  const nv = r.tests.filter((t) => t.group === "visible").length;
  const nh = r.tests.filter((t) => t.group === "hidden").length;
  if (nv < 2) problems.push(`only ${nv} visible tests`);
  if (nh < 3) problems.push(`only ${nh} hidden tests`);

  const slow = r.tests.filter((t) => t.ms > 1500);
  for (const t of slow) problems.push(`solution test ${t.name} takes ${t.ms} ms`);

  if (siteUrl) {
    const page = await fetch(`${siteUrl}/learn/labs/${lab.id}`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    if (!page) problems.push(`${siteUrl}/learn/labs/${lab.id} did not load`);
    const links = [...new Set([...page.matchAll(/href="(\/learn\/[^"#]+)(?:#([^"]+))?"/g)].filter((m) => !m[1].startsWith("/learn/labs")).map((m) => `${m[1]}#${m[2] || ""}`))];
    if (page && links.length < lab.lessons.length) problems.push(`${lab.lessons.length} lessons listed, ${links.length} linked (an unknown lesson code?)`);
    for (const l of links) {
      const [href, anchor] = l.split("#");
      if (!anchor) continue;
      const html = await fetch(siteUrl + href).then((r) => r.text()).catch(() => "");
      if (!html.includes(`id="${anchor}"`)) problems.push(`no heading id "${anchor}" on ${href}`);
    }
  }

  const mark = problems.length ? "✗" : "✓";
  if (problems.length) bad++;
  console.log(
    `${mark} ${lab.id.padEnd(28)} W${String(lab.week).padStart(2, "0")} ${lab.difficulty.padEnd(6)} tests ${nv}+${nh} · starter fails ${sFail}/${s.tests.length} · solution ${r.tests.length - failed.length}/${r.tests.length} in ${r.ms} ms`
  );
  for (const p of problems) console.log(`    - ${p}`);
  if (verbose) {
    for (const t of s.tests) console.log(`    starter ${t.ok ? "ok  " : "FAIL"} ${t.group}/${t.title}${t.ok ? "" : ` · ${t.error?.kind}: ${t.error?.message}`}`);
    if (r.stdout.trim()) console.log(`    solution stdout: ${r.stdout.trim().slice(0, 400)}`);
  }
}
console.log(bad ? `\n${bad} lab(s) need attention` : `\nall ${ids.size} labs OK`);
process.exit(bad ? 1 : 0);
