#!/usr/bin/env node
// Checks every code lab in the content repo with the same runtimes and harnesses the browser uses
// (Pyodide + src/lib/learn/labs/harness.ts for Python; src/lib/learn/labs/jsHarness.ts + sucrase for
// JavaScript/TypeScript, each JS run in a worker thread with a time limit), for every language a lab has:
//
//   - the file parses (src/lib/learn/labs/parse.ts, format v2: resources/labs/README.md)
//   - the starter loads and fails every test (a test the starter passes checks nothing)
//   - the solution passes every visible, hidden and repro test
//   - projects: each stage's starting code (the previous stage's solution + its starter delta) passes the
//     earlier stages' tests and fails every one of its own; each stage's solution passes all tests so far
//   - incidents: the broken code fails every repro test (it reproduces the outage) and passes ## Tests
//   - follow-ups: their solution (or the lab's) passes the base tests and the follow-up's tests
//   - viz: the solution's tests emit the events the spec maps, with the fields each view needs
//   - chaos: the solution survives every seed; the starter fails, and replaying its failing seed gives the
//     identical trace (Python and JS share the scheduler's random numbers, checked once up front)
//   - scale: the solution's timings don't grow faster than the target complexity
//   - with --site <url> (a running build of the site): every lesson link points at a real heading id
//
// usage: node scripts/labs/check-labs.mjs [<content repo root or resources dir>] [--only <id>] [--verbose] [--no-scale] [--site http://localhost:3152]
// (Node 22.18+: the .ts modules load with built-in type stripping.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, "../..");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const noScale = args.includes("--no-scale");
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

const lib = (f) => pathToFileURL(path.join(site, "src/lib/learn/labs", f)).href;
const { parseLab } = await import(lib("parse.ts"));
const { HARNESS_PY } = await import(lib("harness.ts"));
const { judgeScale } = await import(lib("scale.ts"));
const { mulberry32 } = await import(lib("jsHarness.ts"));
const require = createRequire(import.meta.url);
const { loadPyodide } = require(path.join(site, "node_modules/pyodide/pyodide.js"));

const t0 = Date.now();
const py = await loadPyodide({ indexURL: path.join(site, "node_modules/pyodide") + "/" });
console.log(`pyodide ${py.version} loaded in ${Date.now() - t0} ms`);
let pyOut = "";
py.setStdout({ batched: (s) => (pyOut += s + "\n") });
py.setStderr({ batched: (s) => (pyOut += s + "\n") });
py.runPython(HARNESS_PY);
const pyEntry = (n) => py.globals.get(n);

// the chaos scheduler's random numbers must match across languages (same seed, same interleaving)
{
  const seeds = [0, 1, 42, 2 ** 31, 2 ** 32 - 1, 987654321];
  const pyNums = py.runPython(`','.join(repr(_hk_rng(s)()) for s in [${seeds.join(",")}])`);
  const jsNums = seeds.map((s) => String(mulberry32(s)())).join(",");
  const norm = (x) => x.split(",").map((v) => Number(v).toPrecision(15)).join(",");
  if (norm(pyNums) !== norm(jsNums)) {
    console.log(`✗ chaos RNG differs between Python and JS:\n  py ${pyNums}\n  js ${jsNums}`);
    process.exit(1);
  }
}

// ------------------------------------------------------------------------------------------ runners

const JS_WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const { createRequire } = require("node:module");
  const req = createRequire(workerData.site + "/package.json");
  const { transform } = req("sucrase");
  const H = await import(workerData.harness);
  let out = "";
  const deps = { transform: (code, ts) => transform(code, { transforms: ts ? ["typescript"] : [], disableESTransforms: true }).code, out: (t) => (out += t) };
  const fn = { run: H.jsLabRun, chaos: H.jsLabChaos, scale: H.jsLabScale }[workerData.entry];
  const r = await fn(...workerData.args, deps);
  parentPort.postMessage({ r, out });
})().catch((e) => parentPort.postMessage({ error: String((e && e.stack) || e) }));
`;

function runJs(entry, argsList, timeoutMs) {
  return new Promise((resolve) => {
    const w = new Worker(JS_WORKER, { eval: true, workerData: { site, harness: lib("jsHarness.ts"), entry, args: argsList } });
    const timer = setTimeout(() => {
      void w.terminate();
      resolve({ timeout: true });
    }, timeoutMs);
    w.on("message", (m) => {
      clearTimeout(timer);
      void w.terminate();
      resolve(m.error ? { crash: m.error } : { ...m.r, stdout: m.out });
    });
    w.on("error", (e) => {
      clearTimeout(timer);
      resolve({ crash: String(e?.stack || e) });
    });
  });
}

/** One test run in either language: { setup, tests, viz } (or { timeout } / { crash }). */
async function runTests(lab, lang, code, groups) {
  const fam = lang === "python" ? "py" : "js";
  const given = lab.family[fam]?.given ?? null;
  if (fam === "py") {
    pyOut = "";
    const res = JSON.parse(pyEntry("__hk_lab_run")(code, given?.code ?? "", JSON.stringify(groups.map((g) => ({ name: g.name, src: g.src.code })))));
    return { ...res, stdout: pyOut };
  }
  return runJs("run", [{ code, ts: lang === "typescript", given }, groups.map((g) => ({ name: g.name, src: g.src.code, ts: g.src.ts }))], Math.max(20_000, lab.timeoutSec * 3000));
}

async function runChaos(lab, lang, code, opts) {
  const fam = lang === "python" ? "py" : "js";
  const given = lab.family[fam]?.given ?? null;
  const src = lab.family[fam].chaos;
  if (fam === "py") return JSON.parse(pyEntry("__hk_lab_chaos")(code, given?.code ?? "", src.code, JSON.stringify(opts)));
  return runJs("chaos", [{ code, ts: lang === "typescript", given }, src, opts], 60_000);
}

async function runScale(lab, lang, code) {
  const fam = lang === "python" ? "py" : "js";
  const given = lab.family[fam]?.given ?? null;
  const src = lab.family[fam].scale;
  const opts = { sizes: lab.scale.sizes, budgetMs: lab.scale.budgetSec * 1000 };
  if (fam === "py") return JSON.parse(pyEntry("__hk_lab_scale")(code, given?.code ?? "", src.code, JSON.stringify({ sizes: opts.sizes, budget_ms: opts.budgetMs })));
  return runJs("scale", [{ code, ts: lang === "typescript", given }, src, opts], 90_000);
}

/** Names of the tests in a source that read __source__ (rule checks such as "no OrderedDict"): they pass on any
 *  starter that doesn't break the rule, so "the starter fails every test" doesn't apply to them. */
function ruleTests(src, fam) {
  const out = new Set();
  if (!src) return out;
  const re = fam === "py" ? /^def (test_\w+)\s*\(/gm : /^\s*test\s*\(\s*(["'`])(.*?)\1/gm;
  const marks = [...src.code.matchAll(re)].map((m) => ({ at: m.index, key: fam === "py" ? m[1] : m[2] }));
  marks.forEach((m, i) => {
    if (src.code.slice(m.at, marks[i + 1]?.at ?? src.code.length).includes("__source__")) out.add(m.key);
  });
  return out;
}
const isRule = (lab, fam, t) => {
  const src = t.group === "visible" ? lab.family[fam]?.visible : t.group === "hidden" ? lab.family[fam]?.hidden : null;
  const rules = ruleTests(src, fam);
  return rules.has(t.name) || rules.has(t.title);
};

const failed = (r) => (r.timeout ? "timed out" : r.crash ? `crashed: ${r.crash.split("\n")[0]}` : r.setup ? `doesn't load: ${r.setup.kind}: ${r.setup.message}${r.setup.line ? ` (line ${r.setup.line})` : ""}` : null);
const brief = (t) => `${t.group}/${t.title}: ${t.error?.kind}: ${t.error?.message}`.slice(0, 240);

// ------------------------------------------------------------------------------------------ viz spec

function checkViz(spec, events, problems, where, tests = []) {
  const all = Object.entries(events || {});
  if (spec.test) {
    const t = tests.find((x) => x.name === spec.test || x.title === spec.test);
    if (!t) problems.push(`${where}viz.test "${spec.test}" matches no test (use the test's title, or its Python function name)`);
    else if (!events?.[`${t.group}:${t.name}`]?.length) problems.push(`${where}viz.test "${spec.test}" emitted no events`);
  }
  const flat = all.flatMap(([, list]) => list);
  const of = (type) => flat.filter((e) => e.type === type);
  const need = (type, fields, check) => {
    const evs = of(type);
    if (!evs.length) return problems.push(`${where}viz: no "${type}" events were emitted by the solution's tests`);
    const bad = evs.find((e) => fields.some((f) => !(f in e.data)) || (check && !check(e.data)));
    if (bad) problems.push(`${where}viz: a "${type}" event lacks ${fields.join(", ")} or has the wrong types: ${JSON.stringify(bad.data).slice(0, 160)}`);
  };
  if (spec.view === "timeline") {
    for (const s of spec.series) need(s.event, [spec.x, ...(s.value ? [s.value] : [])], (d) => typeof d[spec.x] === "number" && (!s.value || typeof d[s.value] === "number"));
    for (const s of spec.series) if (s.where && !of(s.event).some((e) => Object.entries(s.where).every(([k, v]) => e.data[k] === v))) problems.push(`${where}viz: series "${s.label}" matches no "${s.event}" event (where ${JSON.stringify(s.where)})`);
  } else if (spec.view === "ring") {
    need(spec.events.node, ["id", "pos"], (d) => typeof d.pos === "number");
    need(spec.events.key, ["key", "pos", "node"], (d) => typeof d.pos === "number");
  } else if (spec.view === "state") {
    need(spec.event, ["to"]);
    const ids = new Set(spec.states.map((s) => s.id));
    const unknown = [...new Set(of(spec.event).map((e) => String(e.data.to)))].filter((s) => !ids.has(s));
    if (unknown.length) problems.push(`${where}viz: states ${unknown.join(", ")} are emitted but not listed in viz.states`);
  } else if (spec.view === "list") {
    need(spec.event, [], (d) => Array.isArray(d.items) || (d.entries && typeof d.entries === "object"));
  }
}

// ------------------------------------------------------------------------------------------ a lab

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
  const notes = [];
  if (ids.has(lab.id)) problems.push(`duplicate id ${lab.id}`);
  ids.add(lab.id);
  if (`${lab.id}.md` !== f) problems.push(`file name should be ${lab.id}.md`);
  const started = Date.now();

  for (const lang of lab.languages) {
    const fam = lang === "python" ? "py" : "js";
    const L = lang === "python" ? "py" : lang === "javascript" ? "js" : "ts";
    const where = lab.languages.length > 1 ? `[${L}] ` : "";
    const fc = lab.family[fam];
    const { starter, solution } = lab.code[lang];
    const fuTests = lab.followUps.map((fu, i) => (fu.tests[fam] ? { name: `followup${i + 1}`, src: fu.tests[fam] } : null)).filter(Boolean);

    if (lab.stages.length) {
      // ---------------------------------------------------------------- projects
      const so = [];
      for (let k = 0; k < lab.stages.length; k++) {
        const st = lab.stages[k];
        const groups = (i) => [
          { name: `stage${i + 1}`, src: lab.stages[i].family[fam].visible },
          ...(lab.stages[i].family[fam].hidden ? [{ name: `stage${i + 1}h`, src: lab.stages[i].family[fam].hidden }] : []),
        ];
        const own = groups(k);
        const earlier = Array.from({ length: k }, (_, i) => groups(i)).flat();
        const startCode = k === 0 ? starter : `${lab.stages[k - 1].lang[lang].solution.replace(/\s+$/, "")}\n\n${st.lang[lang].delta}`;
        const s = await runTests(lab, lang, startCode, [...earlier, ...own]);
        const sf = failed(s);
        if (sf) {
          if (k === 0 || !/NotImplemented|not implemented/i.test(sf)) problems.push(`${where}stage ${k + 1} starting code ${sf}`);
        } else {
          for (const t of s.tests.filter((t) => own.some((g) => g.name === t.group) && t.ok)) problems.push(`${where}stage ${k + 1}'s starting code already passes "${t.title}"`);
          for (const t of s.tests.filter((t) => !own.some((g) => g.name === t.group) && !t.ok)) problems.push(`${where}stage ${k + 1}'s starting code (stage ${k} solution + delta) breaks an earlier stage: ${brief(t)}`);
        }
        const r = await runTests(lab, lang, st.lang[lang].solution, [...earlier, ...own]);
        const rf = failed(r);
        if (rf) problems.push(`${where}stage ${k + 1} solution ${rf}`);
        else for (const t of r.tests.filter((t) => !t.ok)) problems.push(`${where}stage ${k + 1} solution fails ${brief(t)}`);
        so.push(`${k + 1}:${r.tests?.filter((t) => t.ok).length ?? 0}/${r.tests?.length ?? 0}`);
        if (k === lab.stages.length - 1 && lab.viz && !rf) checkViz(lab.viz, r.viz, problems, where, r.tests);
      }
      notes.push(`${L} stages ${so.join(" ")}`);
    } else {
      // ---------------------------------------------------------------- labs and incidents
      const base = [
        ...(fc.repro ? [{ name: "repro", src: fc.repro }] : []),
        ...(fc.visible ? [{ name: "visible", src: fc.visible }] : []),
        ...(fc.hidden ? [{ name: "hidden", src: fc.hidden }] : []),
      ];
      const s = await runTests(lab, lang, starter, base);
      const sf = failed(s);
      if (lab.type === "incident") {
        if (sf) problems.push(`${where}broken code ${sf} (it should load and misbehave)`);
        else {
          for (const t of s.tests.filter((t) => t.group === "repro" && t.ok)) problems.push(`${where}repro test passes on the broken code (it doesn't reproduce the incident): ${t.title}`);
          for (const t of s.tests.filter((t) => t.group === "visible" && !t.ok)) problems.push(`${where}the broken code fails a ## Tests test (those check what still works): ${brief(t)}`);
        }
      } else if (sf) {
        if (!/^doesn't load/.test(sf)) problems.push(`${where}starter ${sf}`);
        else problems.push(`${where}starter ${sf}`);
      } else {
        const passing = s.tests.filter((t) => t.ok && !isRule(lab, fam, t));
        for (const t of passing) problems.push(`${where}starter passes "${t.group}/${t.title}" (a test the starter passes checks nothing)`);
      }
      const r = await runTests(lab, lang, solution, base);
      const rf = failed(r);
      if (rf) problems.push(`${where}solution ${rf}`);
      else {
        for (const t of r.tests.filter((t) => !t.ok)) problems.push(`${where}solution fails ${brief(t)}`);
        for (const t of r.tests.filter((t) => t.ms > 1500)) problems.push(`${where}solution test ${t.name} takes ${t.ms} ms`);
        if (lab.viz) checkViz(lab.viz, r.viz, problems, where, r.tests);
      }
      const nv = r.tests?.filter((t) => t.group === "visible" || t.group === "repro").length ?? 0;
      const nh = r.tests?.filter((t) => t.group === "hidden").length ?? 0;
      if (nv < 2 && lab.type !== "incident") problems.push(`${where}only ${nv} visible tests`);
      if (nh < 3 && lab.type !== "incident") problems.push(`${where}only ${nh} hidden tests`);
      notes.push(`${L} tests ${nv}+${nh} · starter fails ${s.tests?.filter((t) => !t.ok).length ?? "?"}/${s.tests?.length ?? "?"} · solution ${r.tests?.filter((t) => t.ok).length ?? 0}/${r.tests?.length ?? 0} in ${r.ms ?? "?"} ms`);
      if (verbose) {
        for (const t of s.tests ?? []) console.log(`    ${L} starter ${t.ok ? "ok  " : "FAIL"} ${t.group}/${t.title}${t.ok ? "" : ` · ${t.error?.kind}: ${t.error?.message}`}`.slice(0, 220));
        if (r.stdout?.trim()) console.log(`    ${L} solution stdout: ${r.stdout.trim().slice(0, 400)}`);
      }

      // follow-ups
      for (const [i, fu] of lab.followUps.entries()) {
        if (!fu.tests[fam]) continue;
        const code = fu.solution[lang] ?? solution;
        const fr = await runTests(lab, lang, code, [...base, { name: `followup${i + 1}`, src: fu.tests[fam] }]);
        const ff = failed(fr);
        if (ff) problems.push(`${where}follow-up "${fu.title}" solution ${ff}`);
        else for (const t of fr.tests.filter((t) => !t.ok)) problems.push(`${where}follow-up "${fu.title}": ${fu.solution[lang] ? "its" : "the lab's"} solution fails ${brief(t)}`);
        if (fu.solution[lang]) {
          const main = await runTests(lab, lang, solution, [{ name: `followup${i + 1}`, src: fu.tests[fam] }]);
          if (!failed(main) && main.tests.every((t) => t.ok)) notes.push(`${L} note: the lab's solution already passes follow-up "${fu.title}"`);
        }
      }
      void fuTests;
    }

    // ---------------------------------------------------------------- chaos
    if (lab.chaos && fc.chaos) {
      const finalSolution = lab.stages.length ? lab.stages[lab.stages.length - 1].lang[lang].solution : solution;
      const opts = { scenarios: lab.chaos.scenarios, runs: lab.chaos.runs };
      const cr = await runChaos(lab, lang, finalSolution, opts);
      const cf = failed(cr);
      if (cf) problems.push(`${where}chaos: solution ${cf}`);
      else for (const c of cr.chaos.filter((c) => !c.ok)) problems.push(`${where}chaos: solution fails "${c.title}" on seed ${c.seed}: ${c.error?.kind}: ${c.error?.message}`.slice(0, 260));
      const cs = await runChaos(lab, lang, lab.type === "incident" ? starter : starter, opts);
      const firstFail = cs.chaos?.find((c) => !c.ok && c.seed != null);
      if (!failed(cs) && cs.chaos && !cs.chaos.some((c) => !c.ok)) problems.push(`${where}chaos: the ${lab.type === "incident" ? "broken code" : "starter"} survives every seed (the chaos tests check nothing)`);
      if (firstFail && firstFail.trace?.length) {
        const rep = await runChaos(lab, lang, starter, { ...opts, seed: firstFail.seed, test: firstFail.name });
        const again = rep.chaos?.[0];
        if (!again || JSON.stringify(again.trace) !== JSON.stringify(firstFail.trace)) problems.push(`${where}chaos: replaying seed ${firstFail.seed} of "${firstFail.title}" gave a different trace (non-deterministic test or code: use sim.rand(), not random)`);
      }
      notes.push(`${L} chaos ${cr.chaos?.filter((c) => c.ok).length ?? 0}/${cr.chaos?.length ?? 0} × ${opts.runs} seeds`);
    }

    // ---------------------------------------------------------------- scale
    if (lab.scale && fc.scale && !noScale) {
      const finalSolution = lab.stages.length ? lab.stages[lab.stages.length - 1].lang[lang].solution : solution;
      const sr = await runScale(lab, lang, finalSolution);
      const sf = failed(sr);
      if (sf) problems.push(`${where}scale: ${sf}`);
      else {
        const v = judgeScale(sr.scale, lab.scale);
        if (v.status === "slow" || v.status === "error") problems.push(`${where}scale: the reference solution is flagged: ${v.headline}. ${v.detail}`);
        notes.push(`${L} scale ${sr.scale.points.map((p) => `${p.n}:${p.ms.toFixed(1)}ms`).join(" ")} → ${v.status}${v.exponent != null ? ` (slope ${v.exponent.toFixed(2)})` : ""}`);
      }
    }
  }

  if (siteUrl) {
    const page = await fetch(`${siteUrl}/labs/${lab.id}`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    if (!page) problems.push(`${siteUrl}/labs/${lab.id} did not load`);
    const links = [...new Set([...page.matchAll(/href="(\/(?:learn\/)?[^"#]+)(?:#([^"]+))?"/g)].filter((m) => lab.lessons.some((l) => l.anchor && m[2] === l.anchor)).map((m) => `${m[1]}#${m[2] || ""}`))];
    for (const l of links) {
      const [href, anchor] = l.split("#");
      if (!anchor) continue;
      const html = await fetch(siteUrl + href).then((r) => r.text()).catch(() => "");
      if (!html.includes(`id="${anchor}"`)) problems.push(`no heading id "${anchor}" on ${href}`);
    }
  }

  if (problems.length) bad++;
  const feats = [lab.type !== "lab" ? lab.type : "", lab.stages.length ? `${lab.stages.length} stages` : "", lab.followUps.length ? `${lab.followUps.length} follow-ups` : "", lab.viz ? `viz:${lab.viz.view}` : "", lab.chaos ? "chaos" : "", lab.scale ? `scale ${lab.scale.target}` : ""].filter(Boolean).join(", ");
  console.log(`${problems.length ? "✗" : "✓"} ${lab.id.padEnd(28)} W${String(lab.week).padStart(2, "0")} ${lab.difficulty.padEnd(6)} ${lab.languages.map((l) => (l === "python" ? "py" : l === "javascript" ? "js" : "ts")).join("+").padEnd(8)} ${((Date.now() - started) / 1000).toFixed(1)} s${feats ? ` · ${feats}` : ""}`);
  for (const n of notes) console.log(`    ${n}`);
  for (const p of problems) console.log(`    - ${p}`);
}
console.log(bad ? `\n${bad} lab(s) need attention` : `\nall ${ids.size} labs OK`);
process.exit(bad ? 1 : 0);
