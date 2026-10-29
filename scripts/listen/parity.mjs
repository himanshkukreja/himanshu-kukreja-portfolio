// Checks that the generator's HTML parser (src/lib/listen/html.ts) and a browser read an article the
// same way: same blocks, same fingerprint. A mismatch means that article's recording would never play
// (the player falls back to the browser voice), so run this after changing the renderer or html.ts.
// usage: node scripts/listen/parity.mjs [<article> …]        (default: every article)
//        node scripts/listen/parity.mjs --page http://localhost:3313 <article> …   (the live page, enhancers and all)
// needs Chrome and puppeteer-core (npm i --no-save puppeteer-core), like the lecture exporter.
import fs from "fs";
import path from "path";
import ts from "typescript";
import puppeteer from "puppeteer-core";
import { articleText, findArticles, listArticles, ROOT, siteModules } from "./lib.mjs";

const argv = process.argv.slice(2);
const pi = argv.indexOf("--page");
const PAGE = pi >= 0 ? argv[pi + 1] : null;
const ids = argv.filter((a, i) => !a.startsWith("--") && i !== pi + 1);
const articles = ids.length ? await findArticles(ids) : await listArticles();

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
    await page.goto(`${PAGE.replace(/\/$/, "")}${a.href}`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.addScriptTag({ content: script });
    got = await page.evaluate(() => {
      const root = document.querySelector(".course-content");
      const blocks = window.__listen.extractBlocks(root);
      return { source: window.__listen.listenSource(blocks), texts: blocks.map((b) => b.text) };
    });
  } else {
    await page.setContent("<!doctype html><html><body><div id=r></div></body></html>");
    await page.addScriptTag({ content: script });
    const { github, render } = await siteModules();
    const html = (await render.renderLesson(await github.fetchMarkdownContent(a.path), { kind: a.kind })).html;
    got = await page.evaluate((h) => {
      const root = document.getElementById("r");
      root.innerHTML = h;
      const blocks = window.__listen.extractBlocks(root);
      return { source: window.__listen.listenSource(blocks), texts: blocks.map((b) => b.text) };
    }, html);
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
