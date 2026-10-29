// Does every quiz (checkpoint) card fit its 16:9 stage? Draws each quiz scene in record mode at 1920x1080, the
// same frames export.mjs captures, and fails a scene whose question/options/answer block reaches the scene label
// ("07 · CHECKPOINT …" top left, the quest code or the mock call bar top right), the caption chip or watermark at
// the bottom, or runs off the frame.
//
// usage: node scripts/lecture/quiz-fit.mjs <lecture.json ...> [--site http://localhost:3316] [--shots <dir> [--shots-all]] [--json <out.json>] [--verbose]
//        node scripts/lecture/quiz-fit.mjs <lecture.json ...> --serve [--app <site checkout>] [--port 3316] [--content <sdm checkout>]
//
// --site: a running dev server whose content has these lectures. --serve starts one (next dev in --app, default
// this checkout) on a copy of the content (--content, default $SDM_LOCAL_DIR) with the given files laid over
// resources/lectures/<quest>.json, and stops it at the end. Don't --serve in a checkout that already runs
// `next dev` (they'd share .next): use a git worktree with node_modules linked in.
// Exit code 1 when any quiz doesn't fit. Needs puppeteer-core (npm i --no-save puppeteer-core) and Chrome.
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import puppeteer from "puppeteer-core";

const argv = process.argv.slice(2);
const VALUED = new Set(["site", "shots", "json", "app", "port", "content"]);
const opt = (name, dflt) => {
  const k = argv.indexOf(`--${name}`);
  return k >= 0 ? argv[k + 1] : dflt;
};
const files = [];
for (let k = 0; k < argv.length; k++) {
  if (argv[k].startsWith("--")) k += VALUED.has(argv[k].slice(2)) ? 1 : 0;
  else files.push(path.resolve(argv[k]));
}
if (!files.length) {
  console.error("usage: node scripts/lecture/quiz-fit.mjs <lecture.json ...> [--site URL | --serve] [--shots dir] [--json out]");
  process.exit(2);
}
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SERVE = argv.includes("--serve");
const PORT = Number(opt("port", "3316"));
if (PORT === 3200) throw new Error("3200 is the render server: use another port");
const SITE = opt("site", `http://localhost:${PORT}`);
const SHOTS = opt("shots", "");
const W = 1920;
const H = 1080;

const lectures = files
  .filter((f) => path.basename(f) !== "lesson-index.json")
  .map((f) => ({ file: f, lec: JSON.parse(fs.readFileSync(f, "utf8")) }))
  .filter(({ lec }) => Array.isArray(lec.scenes) && lec.quest);

// ---------- optional: a dev server on a content copy with these lectures in place ----------
let server = null;
let overlay = null;
const stop = async () => {
  if (server && server.exitCode == null) {
    const gone = new Promise((r) => server.once("exit", r));
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    // next dev's own server process goes with the group; give it a moment, then make sure
    if (!(await Promise.race([gone.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))]))) {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {}
    }
  }
  if (overlay) fs.rmSync(overlay, { recursive: true, force: true });
};
process.on("SIGINT", () => void stop().then(() => process.exit(130)));
if (SERVE) {
  const base = path.resolve(opt("content", process.env.SDM_LOCAL_DIR || path.join(os.homedir(), "system-design-mastery")));
  const app = path.resolve(opt("app", path.join(HERE, "../..")));
  overlay = fs.mkdtempSync(path.join(os.tmpdir(), "quiz-fit-content-"));
  // everything links back to the real checkout except resources/lectures, which is a folder of links plus our files
  for (const n of fs.readdirSync(base)) if (n !== "resources") fs.symlinkSync(path.join(base, n), path.join(overlay, n));
  fs.mkdirSync(path.join(overlay, "resources/lectures"), { recursive: true });
  for (const n of fs.readdirSync(path.join(base, "resources"))) if (n !== "lectures") fs.symlinkSync(path.join(base, "resources", n), path.join(overlay, "resources", n));
  for (const n of fs.readdirSync(path.join(base, "resources/lectures"))) fs.symlinkSync(path.join(base, "resources/lectures", n), path.join(overlay, "resources/lectures", n));
  for (const { file, lec } of lectures) {
    const to = path.join(overlay, "resources/lectures", `${lec.quest}.json`);
    fs.rmSync(to, { force: true });
    fs.copyFileSync(file, to);
  }
  const log = fs.openSync(path.join(overlay, "..", `quiz-fit-next-${PORT}.log`), "w");
  server = spawn(path.join(app, "node_modules/.bin/next"), ["dev", "-p", String(PORT)], { cwd: app, detached: true, stdio: ["ignore", log, log], env: { ...process.env, SDM_LOCAL_DIR: overlay, NODE_ENV: "development" } });
  console.log(`next dev on :${PORT} in ${app} (content: ${base} + ${lectures.length} files; log ${os.tmpdir()}/quiz-fit-next-${PORT}.log)`);
  const t0 = Date.now();
  for (;;) {
    const fail = server.exitCode != null ? "next dev exited: see its log" : Date.now() - t0 > 180000 ? "next dev didn't come up in 3 min" : "";
    if (!fail) {
      try {
        await fetch(`${SITE}/`, { method: "HEAD" });
        break; // it answers (whatever the home page says)
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    await stop();
    throw new Error(fail);
  }
}

// ---------- measure ----------
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"] });
const results = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("theme", "dark");
      localStorage.setItem("hk.notrack", "1");
      localStorage.setItem("hk.learn.seen", "1");
    } catch {}
  });
  let token = 0;
  for (const { file, lec } of lectures) {
    const id = lec.quest;
    const out = { id, file, quizzes: 0, bad: [], notes: [] };
    results.push(out);
    if (lec.short) {
      out.notes.push("a short (no quizzes)");
      continue;
    }
    const flat = lec.scenes.flatMap((s, si) => s.steps.map((st, k) => ({ s, si, k })));
    const quizzes = lec.scenes.filter((s) => s.kind === "quiz");
    out.quizzes = quizzes.length;
    if (!quizzes.length) continue;
    await page.goto(`${SITE}/learn/lectures/${id}?record=1`, { waitUntil: "networkidle2", timeout: 300000 });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{transition:none!important;animation:none!important;caret-color:transparent!important}" });
    await page.waitForFunction(() => window.__LECTURE_READY === true && typeof window.__LECTURE_SET === "function", { timeout: 180000 });
    const plan = await page.evaluate(() => window.__LECTURE_PLAN);
    if (plan.length !== flat.length) throw new Error(`${id}: page has ${plan.length} steps, file ${flat.length}: is the server on this content?`);
    for (const s of quizzes) {
      const last = flat.findLastIndex((f) => f.s === s);
      const first = flat.findIndex((f) => f.s === s);
      // the answer shown (the tallest card, the step the video holds longest) and the ask's countdown
      const frames = [
        { i: last, t: 99, dur: 10, what: "answer" },
        { i: first, t: 9, dur: 10, what: "countdown" },
      ];
      const why = [];
      for (const fr of frames) {
        token++;
        await page.evaluate((i, t, d, tok) => window.__LECTURE_SET(i, t, d, tok), fr.i, fr.t, fr.dur, token);
        await page.waitForFunction((tok) => window.__LECTURE_FRAME === tok, { timeout: 60000, polling: "raf" }, token);
        const m = await page.evaluate(
          (question, W, H) => {
            const norm = (x) => x.replace(/\s+/g, " ").trim();
            const h2 = [...document.querySelectorAll("h2")].find((h) => norm(h.textContent || "") === norm(question));
            if (!h2) return { error: "question not on the stage (stale content?)" };
            const card = h2.parentElement;
            const root = card.closest('[class*="container-type"]');
            const box = (el) => {
              const b = el.getBoundingClientRect();
              return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom };
            };
            // what's drawn: the card and everything in it (a visible descendant can spill out of the card's box)
            let c = box(card);
            for (const el of card.querySelectorAll("*")) {
              const cs = getComputedStyle(el);
              if (cs.visibility === "hidden" || el.closest('[aria-hidden="true"]')) continue;
              const b = box(el);
              if (b.x1 - b.x0 <= 0 || b.y1 - b.y0 <= 0) continue;
              c = { x0: Math.min(c.x0, b.x0), y0: Math.min(c.y0, b.y0), x1: Math.max(c.x1, b.x1), y1: Math.max(c.y1, b.y1) };
            }
            // the stage's top chrome: the scene label (left) and the quest code / call bar (right)
            const chrome = [...root.children].filter((el) => /\bz-10\b/.test(el.className) && el.getBoundingClientRect().top < H * 0.15).map((el) => ({ text: norm(el.textContent || "").slice(0, 40), ...box(el) }));
            // ...and the bottom: the caption chip / recall chip over the progress bar, and the watermark
            const low = [...root.children].filter((el) => el.getBoundingClientRect().top > H * 0.8);
            for (const el of low) {
              const parts = el.children.length ? [...el.children] : [el];
              for (const p of parts) {
                const b = box(p);
                if (b.x1 - b.x0 > 0 && b.y1 - b.y0 > 0 && b.y1 - b.y0 < H * 0.15) chrome.push({ text: norm(p.textContent || "").slice(0, 40) || "progress bar", ...b });
              }
            }
            // the card's own shrink (Stage's fitQuiz), 1 when it fits as authored
            const tf = getComputedStyle(card).transform;
            const scale = tf && tf !== "none" ? Number(tf.match(/matrix\(([^,]+)/)?.[1] || 1) : 1;
            return { card: c, chrome, scale };
          },
          s.question,
          W,
          H,
        );
        if (m.error) {
          why.push(`${fr.what}: ${m.error}`);
          continue;
        }
        const r = m.card;
        const hits = m.chrome.filter((l) => r.x0 < l.x1 && r.x1 > l.x0 && r.y0 < l.y1 && r.y1 > l.y0);
        for (const l of hits) why.push(`${fr.what}: overlaps "${l.text}" by ${Math.ceil(l.y0 > H / 2 ? r.y1 - l.y0 : l.y1 - r.y0)}px`);
        if (r.y0 < 0 || r.y1 > H || r.x0 < 0 || r.x1 > W) why.push(`${fr.what}: off the frame (${Math.round(r.x0)},${Math.round(r.y0)})-(${Math.round(r.x1)},${Math.round(r.y1)})`);
        // headroom under the label, for the summary
        const label = Math.max(0, ...m.chrome.filter((l) => l.y0 < H / 2).map((l) => l.y1));
        if (fr.what === "answer") out.notes.push(`${s.id}: ${Math.round(r.y0 - label)}px under the label, ${Math.round(H - r.y1)}px above the bottom${m.scale < 1 ? `, shrunk to ${m.scale.toFixed(2)}` : ""}`);
        if (SHOTS && (argv.includes("--shots-all") || hits.length || r.y0 < 0 || r.y1 > H || r.x0 < 0 || r.x1 > W)) {
          fs.mkdirSync(SHOTS, { recursive: true });
          await page.screenshot({ path: path.join(SHOTS, `${id}--${s.id}--${fr.what}.jpg`), type: "jpeg", quality: 80 });
        }
      }
      if (why.length) out.bad.push({ scene: s.id, why });
    }
    console.log(`${out.bad.length ? "FAIL" : "ok  "} ${id}: ${out.quizzes} quizzes${out.bad.length ? ` · ${out.bad.map((b) => b.scene).join(", ")}` : ""}`);
    for (const b of out.bad) for (const w of b.why) console.log(`       ${b.scene} · ${w}`);
    if (argv.includes("--verbose")) for (const n of out.notes) console.log(`       ${n}`);
  }
} finally {
  await browser.close();
  await stop();
}

const bad = results.filter((r) => r.bad.length);
console.log(`\n${results.length} lectures, ${results.reduce((a, r) => a + r.quizzes, 0)} quizzes: ${bad.reduce((a, r) => a + r.bad.length, 0)} don't fit, in ${bad.length} lectures`);
for (const r of bad) console.log(`  ${r.id} → ${r.bad.map((b) => b.scene).join(", ")}`);
if (opt("json", "")) fs.writeFileSync(opt("json", ""), JSON.stringify(results, null, 1));
process.exit(bad.length ? 1 : 0);
