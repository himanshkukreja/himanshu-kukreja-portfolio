#!/usr/bin/env node
/**
 * Renders scripts/resume/resume.html to public/resume.pdf (A4, fonts embedded) with Playwright's Chromium.
 *
 *   npm run resume                 # writes public/resume.pdf
 *   npm run resume -- --png <dir>  # also writes one PNG per page for a visual check
 *
 * Playwright is not a project dependency. The script uses, in order: `playwright` resolvable from the repo,
 * $PLAYWRIGHT_MODULE (path to a playwright package), or a copy cached by `npx playwright` under ~/.npm/_npx.
 * Chromium must be installed once: `npx playwright install chromium`.
 */
import { existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const src = join(here, "resume.html");
const out = join(root, "public/resume.pdf");

function loadPlaywright() {
  const req = createRequire(join(root, "package.json"));
  const tries = ["playwright", "playwright-core"];
  if (process.env.PLAYWRIGHT_MODULE) tries.unshift(process.env.PLAYWRIGHT_MODULE);
  const npx = join(homedir(), ".npm/_npx");
  if (existsSync(npx)) {
    for (const d of readdirSync(npx)) {
      const p = join(npx, d, "node_modules/playwright");
      if (existsSync(p)) tries.push(p);
    }
  }
  for (const t of tries) {
    try {
      return req(t);
    } catch {
      // try the next one
    }
  }
  console.error("Playwright not found. Run `npx playwright install chromium` once, or set PLAYWRIGHT_MODULE=/path/to/playwright.");
  process.exit(1);
}

const args = process.argv.slice(2);
const pngDir = args.includes("--png") ? resolve(args[args.indexOf("--png") + 1] || join(here, "preview")) : null;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(src).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const updated = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  await page.evaluate((u) => {
    const el = document.getElementById("updated");
    if (el) el.textContent = u;
  }, updated);
  await page.emulateMedia({ media: "print" });

  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true, outline: false });
  writeFileSync(out, pdf);
  console.log(`wrote ${out} (${Math.round(pdf.length / 1024)} KB)`);

  if (pngDir) {
    mkdirSync(pngDir, { recursive: true });
    // Rasterise the PDF itself (not the HTML), so the preview is exactly what ships.
    const viewer = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
    const pdfjs = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
    await viewer.setContent(`<html><body style="margin:0;background:#888"><script src="${pdfjs}/pdf.min.js"></script></body></html>`);
    await viewer.waitForFunction(() => "pdfjsLib" in window);
    const count = await viewer.evaluate(
      async ({ b64, worker }) => {
        const lib = window.pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = worker;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const doc = await lib.getDocument({ data: bytes }).promise;
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i);
          const vp = p.getViewport({ scale: 1240 / p.getViewport({ scale: 1 }).width });
          const c = document.createElement("canvas");
          c.width = vp.width;
          c.height = vp.height;
          c.id = `p${i}`;
          c.style.display = "block";
          document.body.appendChild(c);
          await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        }
        return doc.numPages;
      },
      { b64: pdf.toString("base64"), worker: `${pdfjs}/pdf.worker.min.js` }
    );
    for (let i = 1; i <= count; i++) {
      const file = join(pngDir, `resume-p${i}.png`);
      await viewer.locator(`#p${i}`).screenshot({ path: file });
      console.log(`wrote ${file}`);
    }
    console.log(`${count} page(s)`);
  }
} finally {
  await browser.close();
}
