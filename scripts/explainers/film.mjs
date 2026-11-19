// Render DSA explainers as videos: the film page (src/app/learn/dsa/explainer-film/[id], local only) is stepped frame
// by frame on the narration's clock, each frame screenshotted and piped to ffmpeg, the narration (scripts/explainers/
// voice.mjs, out/explainers/<id>/narration.mp3) laid under it after a short title card.
//
//   node scripts/explainers/film.mjs --base http://localhost:3344 --only id,id [--format wide|tall|both] [--theme light|dark] [--fps 30]
//
// Writes out/explainers/<id>/<id>-<format>.mp4 (wide: 1920x1080, tall: 1080x1920).
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { ROOT } from "../listen/lib.mjs";

const require = createRequire(path.join(os.homedir(), ".cache/hk-render/deps/package.json"));
const puppeteer = require("puppeteer-core");
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3344").replace(/\/$/, "");
const ids = arg("only", "").split(",").filter(Boolean);
const formats = arg("format", "both") === "both" ? ["wide", "tall"] : [arg("format")];
const theme = arg("theme", "light");
const FPS = Number(arg("fps", "30"));
const LEAD = 1.6; // the title card, seconds before the narration
const TAIL = 1.4; // the recap held after it

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 900000, args: ["--hide-scrollbars", "--force-device-scale-factor=1"] });
for (const id of ids) {
  const mp3 = path.join(ROOT, "out/explainers", id, "narration.mp3");
  if (!fs.existsSync(mp3)) {
    console.log(`  ${id}: no narration (run voice.mjs first)`);
    continue;
  }
  for (const format of formats) {
    const [w, h] = format === "tall" ? [1080, 1920] : [1920, 1080];
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/dsa/explainer-film/${id}?format=${format}&theme=${theme}`, { waitUntil: "networkidle2", timeout: 600000 });
    await page.waitForFunction(() => window.__filmReady === true, { timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    const dur = await page.evaluate(() => window.__filmDuration);
    const total = LEAD + dur + TAIL;
    const frames = Math.ceil(total * FPS);
    const out = path.join(ROOT, "out/explainers", id, `${id}-${format}.mp4`);
    const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-i", mp3, "-filter_complex", `[1:a]adelay=${Math.round(LEAD * 1000)}:all=1,apad[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
    const t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      const sec = f / FPS - LEAD;
      await page.evaluate((s) => new Promise((r) => (window.__filmSeek(s), requestAnimationFrame(() => requestAnimationFrame(r)))), sec);
      const shot = await page.screenshot({ type: "jpeg", quality: 92 });
      if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % (FPS * 15) === 0) console.log(`  ${id} ${format}: ${Math.round((f / frames) * 100)}%`);
    }
    ff.stdin.end();
    await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg exited ${c}`)))));
    await page.close();
    console.log(`  ${id} ${format}: ${path.relative(ROOT, out)} (${total.toFixed(1)} s of video in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}
await browser.close();
