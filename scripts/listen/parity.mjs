// Checks that the generator's HTML parser (src/lib/listen/html.ts) and a browser read an article the
// same way: same blocks, same fingerprint. A mismatch means that article's recording would never play
// (the player falls back to the browser voice), so run this after changing the renderer or html.ts.
// usage: node scripts/listen/parity.mjs [<article> …]        (default: every article: lessons, side quests,
//          problems, LLD, case files, war stories, mock interviews)
//        node scripts/listen/parity.mjs --only war/            (one kind: quest/ lesson/ case/ war/ mock/ …)
//        node scripts/listen/parity.mjs --page http://localhost:3313 <article> …   (the live page, enhancers and all;
//          the player's root is [data-listen-root]; a mock opens on its debrief with every model answer shown)
// needs Chrome and puppeteer-core (npm i --no-save puppeteer-core), like the lecture exporter.
import fs from "fs";
import path from "path";
import ts from "typescript";
import puppeteer from "puppeteer-core";
import { articleText, findArticles, listArticles, ROOT } from "./lib.mjs";

const argv = process.argv.slice(2);
const pi = argv.indexOf("--page");
const PAGE = pi >= 0 ? argv[pi + 1] : null;
const oi = argv.indexOf("--only");
const ONLY = oi >= 0 ? argv[oi + 1] : "";
const ids = argv.filter((a, i) => !a.startsWith("--") && i !== pi + 1 && i !== oi + 1);
const articles = (ids.length ? await findArticles(ids) : await listArticles()).filter((a) => a.key.startsWith(ONLY));

/** a mock's saved run, opened on the debrief with every model answer shown (lib/learn/mock/store.ts) */
function debriefRun(run) {
  const now = Date.now();
  const revealed = Object.fromEntries(Array.from({ length: run.phases }, (_, k) => [`p${k + 1}`, true]));
  const value = { v: 1, version: run.version, screen: "debrief", level: "sde", phase: 0, maxPhase: run.phases - 1, used: {}, fired: {}, submitted: {}, notes: {}, answers: {}, board: "", sketch: "", coach: {}, coachOn: false, hints: {}, pauses: 0, scores: {}, revealed, startedAt: now, endedAt: now, live: false, claimed: false, attempt: 1, history: [] };
  return { key: `hk.mock.v1:${run.id}`, value: JSON.stringify(value) };
}

// extract.ts as a plain script for the page: window.__listen = { extractBlocks, listenSource, … }
const src = fs.readFileSync(path.join(ROOT, "src/lib/listen/extract.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const script = `(() => { const exports = {}; ${js}; window.__listen = exports; })();`;

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const page = await browser.newPage();
let bad = 0;
for (const a of articles) {
  const t = await articleText(a);
  if (!t) continue;
  let got;
  if (PAGE) {
    const url = `${PAGE.replace(/\/$/, "")}${a.href}`;
    // the saved run goes in before the page's scripts run (leaving a mock page writes its own back)
    if (t.run) {
      const { key, value } = debriefRun(t.run);
      await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), key, value);
    }
    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector("[data-listen-root]", { timeout: 30000 }).catch(() => {});
    await page.addScriptTag({ content: script });
    got = await page.evaluate(() => {
      const root = document.querySelector("[data-listen-root]") || document.querySelector(".course-content");
      if (!root) return { source: "(no root)", texts: [] };
      const blocks = window.__listen.extractBlocks(root);
      return { source: window.__listen.listenSource(blocks), texts: blocks.map((b) => b.text) };
    });
  } else {
    await page.setContent("<!doctype html><html><body><div id=r></div></body></html>");
    await page.addScriptTag({ content: script });
    got = await page.evaluate(
      (h, scoped) => {
        const box = document.getElementById("r");
        box.innerHTML = h;
        const root = scoped ? box.firstElementChild : box;
        const blocks = window.__listen.extractBlocks(root);
        return { source: window.__listen.listenSource(blocks), texts: blocks.map((b) => b.text) };
      },
      t.html,
      t.scoped
    );
  }
  if (got.source === t.source) {
    console.log(`ok   ${a.key} (${t.blocks.length} blocks, ${t.source})`);
    continue;
  }
  bad++;
  const mine = t.blocks.map((b) => b.text);
  const k = mine.findIndex((x, i) => x !== got.texts[i]);
  console.log(`DIFF ${a.key}: generator ${t.source} (${mine.length} blocks) vs browser ${got.source} (${got.texts.length} blocks)`);
  console.log(`     first difference at block ${k}:\n       generator: ${JSON.stringify(mine[k])?.slice(0, 300)}\n       browser:   ${JSON.stringify(got.texts[k])?.slice(0, 300)}`);
}
await browser.close();
console.log(bad ? `${bad} of ${articles.length} differ` : `all ${articles.length} match`);
process.exit(bad ? 1 : 0);
