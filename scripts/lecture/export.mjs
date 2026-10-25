// Experimental: export a side-quest lecture to MP4 (setup and usage: scripts/lecture/README.md).
// Voice: Kokoro (free, runs locally). One exact frame per step, held for that step's audio.
// usage: KOKORO_DIR=<dir with the model + venv> node scripts/lecture/export.mjs <lecture.json> <out dir> [site] [voice] [speed]
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import puppeteer from "puppeteer-core"; // not a site dependency: npm i --no-save puppeteer-core (see README)

const [file, OUT_ARG, SITE = "http://localhost:3100", VOICE = "af_heart", SPEED = "1.0"] = process.argv.slice(2);
const OUT = path.resolve(OUT_ARG);
const KOKORO = (process.env.KOKORO_DIR || path.join(process.env.HOME, ".cache/kokoro")).replace(/\/?$/, "/");
const PYTHON = process.env.KOKORO_PYTHON || path.join(KOKORO, "venv/bin/python");
const TTS = new URL("./tts.py", import.meta.url).pathname;
const lec = JSON.parse(fs.readFileSync(file, "utf8"));
const steps = lec.scenes.flatMap((s) => s.steps.map((st, k) => ({ id: `${s.id}-${k}`, say: st.say })));
const GAP = 0.45;
fs.mkdirSync(path.join(OUT, "audio"), { recursive: true });

const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
// letters a TTS voice would otherwise read as a word ("UPI" as "oopy")
const SAY_AS = { NPCI: "N P C I", UPI: "U P I", PSP: "P S P", RBI: "R B I", SBI: "S B I", VPA: "V P A", API: "A P I", APIs: "A P Is", ID: "I D", IDs: "I Ds", QR: "Q R", OTP: "O T P", SMS: "S M S", CDN: "C D N", TTL: "T T L", DB: "database", HSM: "H S M", UPIs: "U P Is", TCP: "T C P", P99: "P 99", p99: "P 99", GeoDNS: "Geo D N S", FreeBSD: "Free B S D", DNS: "D N S", BEAM: "beam", RAM: "ram", KB: "kilobytes", MB: "megabytes", GB: "gigabytes", TB: "terabytes", QPS: "Q P S", RPS: "R P S", SQL: "sequel", CPU: "C P U", HTTP: "H T T P", URL: "U R L", SKU: "S K U", OTPs: "O T Ps", SLA: "S L A", JWT: "J W T", PG: "P G", PCI: "P C I", DSS: "D S S", BMS: "B M S", PVR: "P V R", INOX: "Inox", FIFO: "fifo", TTLs: "T T Ls" };
const speakable = (t) => t.replace(/\b[A-Za-z]*[A-Z][A-Za-z0-9]*\b/g, (w) => SAY_AS[w] ?? w).replace(/@/g, " at ").replace(/[·]/g, ",").replace(/₹\s?([\d,]+)/g, "$1 rupees").replace(/(\d+)\.(\d+)/g, (_, a, b) => `${a} point ${b.split("").join(" ")}`);

// 1. voice per step (one Kokoro run for all of them), padded with the pause after it
const durations = [];
const list = [];
const items = steps.map((s) => ({ text: speakable(s.say), out: path.join(OUT, "audio", `${s.id}.raw.wav`) }));
const itemsFile = path.join(OUT, "items.json");
const same = fs.existsSync(itemsFile) && fs.readFileSync(itemsFile, "utf8") === JSON.stringify(items) && items.every((x) => fs.existsSync(x.out));
if (!same) fs.writeFileSync(itemsFile, JSON.stringify(items));
if (!same) execFileSync(PYTHON, [TTS, path.join(OUT, "items.json"), VOICE, SPEED, KOKORO], { stdio: ["ignore", "ignore", "inherit"] });
for (const s of steps) {
  const wav = path.join(OUT, "audio", `${s.id}.wav`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(OUT, "audio", `${s.id}.raw.wav`), "-af", `apad=pad_dur=${GAP}`, "-ar", "44100", "-ac", "1", wav]);
  durations.push(dur(wav));
  list.push(`file '${wav}'`);
}
fs.writeFileSync(path.join(OUT, "list.txt"), list.join("\n"));
const narration = path.join(OUT, "narration.wav");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(OUT, "list.txt"), "-c", "copy", narration]);
const total = durations.reduce((a, b) => a + b, 0);
console.log(`voice: ${steps.length} steps, ${total.toFixed(1)} s`);

// 2. one exact frame per step: jump to it, wait for its diagram, screenshot
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--no-sandbox", "--hide-scrollbars"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem("theme", "dark"); localStorage.setItem("hk.notrack", "1"); localStorage.setItem("hk.learn.seen", "1"); } catch {}
});
await page.goto(`${SITE}/learn/lectures/${lec.quest}?record=1`, { waitUntil: "networkidle2", timeout: 240000 });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{transition:none!important;animation:none!important}" });
await page.waitForFunction(() => window.__LECTURE_READY === true && typeof window.__LECTURE_GOTO === "function", { timeout: 180000 });
fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
const frames = [];
for (let k = 0; k < steps.length; k++) {
  await page.evaluate((k) => window.__LECTURE_GOTO(k), k);
  await page.waitForFunction((k) => window.__LECTURE_SHOWN === k, { timeout: 60000 }, k);
  await new Promise((r) => setTimeout(r, 250));
  const f = path.join(OUT, "frames", `${String(k).padStart(3, "0")}.png`);
  await page.screenshot({ path: f });
  frames.push(f);
}
await browser.close();
console.log(`frames: ${frames.length}`);

// 3. stitch: each frame held for its step's audio (hard cuts keep the sync exact)
const conc = frames.map((f, k) => `file '${f}'\nduration ${durations[k].toFixed(3)}`).join("\n") + `\nfile '${frames[frames.length - 1]}'\n`;
fs.writeFileSync(path.join(OUT, "frames.txt"), conc);
const mp4 = path.join(OUT, `${lec.quest}.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(OUT, "frames.txt"), "-i", narration, "-map", "0:v", "-map", "1:a", "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-tune", "stillimage", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", mp4]);
console.log(`mp4: ${mp4} · ${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB · ${dur(mp4).toFixed(1)} s`);
