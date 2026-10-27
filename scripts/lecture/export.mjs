// Export a side-quest lecture: narration (Kokoro, free, local), the course player's media
// (narration + music + timings + captions + poster) and a 1080p MP4 with music and a watermark.
// Setup and the whole workflow: scripts/lecture/README.md.
//
// usage: node scripts/lecture/export.mjs <lecture.json> <out dir> [--site http://localhost:3100]
//          [--voice af_heart] [--speed 1.0] [--fps 25] [--music <loop.mp3>] [--no-video]
//
// Frames: the page in record mode draws any moment (step i, t seconds in) on request; each step's
// motion is captured at --fps and its last frame held for the rest of the step's audio, so picture
// and voice can't drift. Steps whose packets loop (or a quiz countdown) are captured whole.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import puppeteer from "puppeteer-core"; // not a site dependency: npm i --no-save puppeteer-core

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const k = argv.indexOf(`--${name}`);
  return k >= 0 ? argv[k + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);
const pos = [];
for (let k = 0; k < argv.length; k++) {
  if (argv[k] === "--no-video") continue;
  if (argv[k].startsWith("--")) k++;
  else pos.push(argv[k]);
}
const [file, OUT_ARG] = pos;
const SITE = opt("site", "http://localhost:3100");
const VOICE = opt("voice", "af_heart");
let SPEED = opt("speed", "");
const FPS = Number(opt("fps", "25"));
const OUT = path.resolve(OUT_ARG);
const KOKORO = (process.env.KOKORO_DIR || path.join(process.env.HOME, ".cache/kokoro")).replace(/\/?$/, "/");
const PYTHON = process.env.KOKORO_PYTHON || path.join(KOKORO, "venv/bin/python");
const HERE = path.dirname(new URL(import.meta.url).pathname);
let MUSIC = opt("music", "");
// shorts pick a track by mood from --music-dir (scripts/lecture/music_moods.py): <dir>/<mood>.mp3
const MUSIC_DIR = opt("music-dir", "");

const raw = fs.readFileSync(file, "utf8");
const lec = JSON.parse(raw);
// same fingerprint as lectureHash() in src/lib/learn/lecture/load.ts
const SOURCE = crypto.createHash("sha1").update(JSON.stringify(lec)).digest("hex").slice(0, 12);
// a vertical short: tight cuts (a beat between lines, not a pause), a slightly brisker voice, its mood's music
const SHORT = !!lec.short;
if (!SPEED) SPEED = SHORT ? "1.07" : "1.0";
if (SHORT && MUSIC_DIR && lec.short.music && fs.existsSync(path.join(MUSIC_DIR, `${lec.short.music}.mp3`))) MUSIC = path.join(MUSIC_DIR, `${lec.short.music}.mp3`);
const steps = lec.scenes.flatMap((s) => s.steps.map((st, k) => ({ id: `${s.id}-${k}`, say: st.say, who: st.who, pause: st.pause || 0, quizAsk: s.kind === "quiz" && k === 0 })));
const GAP = SHORT ? 0.12 : 0.45;
const QUIZ_WAIT = 3.2; // the video's countdown; the course player waits for an answer instead
fs.mkdirSync(path.join(OUT, "audio"), { recursive: true });

const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: ["ignore", "ignore", "inherit"] });

// letters a TTS voice would otherwise read as a word ("UPI" as "oopy")
const SAY_AS = { NPCI: "N P C I", UPI: "U P I", PSP: "P S P", RBI: "R B I", SBI: "S B I", VPA: "V P A", VPAs: "V P As", API: "A P I", APIs: "A P Is", ID: "I D", IDs: "I Ds", QR: "Q R", OTP: "O T P", OTPs: "O T Ps", SMS: "S M S", CDN: "C D N", CDNs: "C D Ns", TTL: "T T L", TTLs: "T T Ls", DB: "database", HSM: "H S M", TCP: "T C P", P99: "P 99", p99: "P 99", GeoDNS: "Geo D N S", FreeBSD: "Free B S D", DNS: "D N S", BEAM: "beam", RAM: "ram", KB: "kilobytes", MB: "megabytes", GB: "gigabytes", TB: "terabytes", PB: "petabytes", QPS: "Q P S", RPS: "R P S", TPS: "T P S", SQL: "sequel", NoSQL: "no sequel", CPU: "C P U", GPU: "G P U", GPUs: "G P Us", HTTP: "H T T P", URL: "U R L", URLs: "U R Ls", SKU: "S K U", SKUs: "S K Us", SLA: "S L A", SLO: "S L O", JWT: "J W T", PCI: "P C I", DSS: "D S S", BMS: "B M S", PVR: "P V R", INOX: "Inox", FIFO: "fifo", AWS: "A W S", S3: "S 3", EC2: "E C 2", LLM: "L L M", LLMs: "L L Ms", KV: "K V", CRDT: "C R D T", CRDTs: "C R D Ts", OT: "O T", HLS: "H L S", DASH: "dash", ABR: "A B R", ETA: "E T A", ETAs: "E T As", UIDAI: "U I D A I", CIDR: "C I D R", RTT: "R T T", WAL: "wal", LSM: "L S M", IRCTC: "I R C T C", PNR: "P N R", NSE: "N S E", BSE: "B S E", OMS: "O M S", ML: "M L", AI: "A I", UI: "U I", IoT: "I o T", MAU: "M A U", DAU: "D A U", DAUs: "D A Us", POS: "P O S", HDFC: "H D F C", ICICI: "I C I C I", IMPS: "I M P S", NEFT: "N E F T", KYC: "K Y C", PII: "P I I", GPS: "G P S", RTO: "R T O", RPO: "R P O" , US: "U S", PostgreSQL: "Postgres Q L", IP: "I P", TLS: "T L S", DynamoDB: "Dynamo D B", WebSocket: "web socket", WebSockets: "web sockets", NAT: "nat", QUIC: "quick", SSD: "S S D", SSDs: "S S Ds", UDP: "U D P", JSON: "jason", GET: "get", POST: "post", PUT: "put", DELETE: "delete", PATCH: "patch", HEAD: "head", OPTIONS: "options", HLD: "H L D", LLD: "L L D", TLB: "T L B", CAP: "cap", CP: "C P", AP: "A P", EU: "E U", IPs: "I Ps", MySQL: "my sequel", OK: "okay", gRPC: "G R P C", IPv4: "I P v 4", IPv6: "I P v 6", DDoS: "D dos", CSRF: "C S R F", HTTPS: "H T T P S", ElastiCache: "Elasti cache", DAX: "dax", IPC: "I P C", RocksDB: "Rocks D B", LRU: "L R U", UNIQUE: "unique", REST: "rest", ZooKeeper: "Zoo keeper", HBase: "H base", BASE: "base", ACID: "acid", MongoDB: "Mongo D B", CloudFront: "Cloud front", JOINs: "joins", VPC: "V P C", SYN: "sin", SYNs: "sins", ACK: "ack", ACKs: "acks", DNSSEC: "D N S sec", JWTs: "J W Ts", HttpOnly: "H T T P only", SameSite: "same site", AZ: "A Z", NUMA: "numa", EAGAIN: "E again", BSD: "B S D", macOS: "mac O S", InnoDB: "Inno D B", PID: "P I D", OOM: "O O M", UUID: "U U I D", NICs: "nicks", DMs: "D Ms", CRUD: "crud", GraphQL: "graph Q L", CA: "C A", PACELC: "pass elk", PA: "P A", EL: "E L", PC: "P C", EC: "E C", MVCC: "M V C C", SSTable: "S S table", CQRS: "C Q R S", SLI: "S L I", PgBouncer: "P G bouncer", STONITH: "stonith", TinyURL: "Tiny U R L", CSS: "C S S", ETag: "E tag", OS: "O S", ISP: "I S P", AAAA: "quad A", CNAME: "C name", MX: "M X", TXT: "T X T", NS: "N S", SQS: "S Q S", IO: "I O", XFetch: "X fetch", TLD: "T L D", OSI: "O S I", BBR: "B B R", SSH: "S S H", WebRTC: "web R T C", STUN: "stun", TURN: "turn", ICE: "ice", OrderCreated: "order created", TinyLink: "Tiny link", LB: "load balancer", LBs: "load balancers", RPC: "R P C", IOPS: "I ops", HDD: "H D D", ERD: "E R D", SLAs: "S L As", SLOs: "S L Os" };
// Kokoro already spells plain acronyms well (API, URLs, NPCI); a spaced-out spelling ("N P C I")
// only makes it worse. So only substitutions that change the word apply (SQL as "sequel", DB as
// "database", units, mixed-case names).
const wordy = (w) => SAY_AS[w] !== undefined && SAY_AS[w].replace(/\s/g, "") !== w;
// lower-case technical words the voice gets wrong
const SAY_LOWER = { epoll: "E poll", kqueue: "K queue", mmap: "M map", io_uring: "I O uring", stdin: "standard in", stdout: "standard out", nginx: "engine X", sqlite: "S Q lite", kubectl: "kube control" };
const speakable = (t) =>
  t
    // "HTTP/2", "I/O", "TCP/IP": the slash isn't spoken
    .replace(/([A-Za-z])\/([A-Za-z0-9])/g, "$1 $2")
    .replace(/\b(epoll|kqueue|mmap|io_uring|stdin|stdout|nginx|sqlite|kubectl)\b/gi, (w) => SAY_LOWER[w.toLowerCase()] ?? w)
    .replace(/\b[A-Za-z]*[A-Z][A-Za-z0-9]*\b/g, (w) => (wordy(w) ? SAY_AS[w] : w))
    .replace(/@/g, " at ")
    .replace(/[·]/g, ",")
    .replace(/₹\s?([\d,]+)/g, "$1 rupees")
    .replace(/(\d+)\.(\d+)/g, (_, a, b) => `${a} point ${b.split("").join(" ")}`);

// 1. voice per step (one Kokoro run for all of them), then the pause after it
// mock interview videos: each line in its speaker's voice
const voiceOf = (s) => (lec.cast && s.who && lec.cast[s.who]?.voice) || undefined;
const items = steps.map((s) => ({ text: speakable(s.say), out: path.join(OUT, "audio", `${s.id}.raw.wav`), ...(voiceOf(s) ? { voice: voiceOf(s) } : {}) }));
const itemsFile = path.join(OUT, "items.json");
const same = fs.existsSync(itemsFile) && fs.readFileSync(itemsFile, "utf8") === JSON.stringify(items) && items.every((x) => fs.existsSync(x.out));
if (!same) {
  fs.writeFileSync(itemsFile, JSON.stringify(items));
  execFileSync(PYTHON, [path.join(HERE, "tts.py"), itemsFile, VOICE, SPEED, KOKORO], { stdio: ["ignore", "ignore", "inherit"] });
}
const durations = [];
const list = [];
for (const s of steps) {
  const wav = path.join(OUT, "audio", `${s.id}.wav`);
  // a short's last beat holds ~2 s on its end card, so it doesn't stop on the last word
  const hold = GAP + s.pause + (s.quizAsk ? QUIZ_WAIT : 0) + (SHORT && s === steps[steps.length - 1] ? 2.2 : 0);
  ff("-i", path.join(OUT, "audio", `${s.id}.raw.wav`), "-af", `apad=pad_dur=${hold}`, "-ar", "44100", "-ac", "1", wav);
  durations.push(dur(wav));
  list.push(`file '${wav}'`);
}
fs.writeFileSync(path.join(OUT, "list.txt"), list.join("\n"));
// shorts: every script word's timing, for the Reels-style captions (faster-whisper, aligned to the script)
let WORDS = null;
if (SHORT) {
  fs.writeFileSync(path.join(OUT, "script-words.json"), JSON.stringify(steps.map((s) => s.say.split(/\s+/).filter(Boolean))));
  execFileSync(PYTHON, [path.join(HERE, "words.py"), OUT], { stdio: ["ignore", "inherit", "inherit"] });
  WORDS = JSON.parse(fs.readFileSync(path.join(OUT, "words.json"), "utf8"));
}
const narration = path.join(OUT, "narration.wav");
ff("-f", "concat", "-safe", "0", "-i", path.join(OUT, "list.txt"), "-c", "copy", narration);
const starts = durations.reduce((a, d, k) => (a.push(k ? a[k - 1] + durations[k - 1] : 0), a), []);
const total = durations.reduce((a, b) => a + b, 0);
console.log(`voice: ${steps.length} steps, ${total.toFixed(1)} s`);

// 2. course-player media: narration, music, timings, captions
ff("-i", narration, "-ac", "1", "-b:a", "96k", path.join(OUT, "narration.mp3"));
const hasMusic = !!MUSIC && fs.existsSync(MUSIC);
if (hasMusic) fs.copyFileSync(MUSIC, path.join(OUT, "music.mp3"));
const vttTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`;
};
const cues = [];
steps.forEach((s, k) => {
  const parts = s.say.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.map((x) => x.trim()) || [s.say];
  const speak = Math.max(0.5, durations[k] - GAP - s.pause - (s.quizAsk ? QUIZ_WAIT : 0));
  const chars = parts.reduce((a, p) => a + p.length, 0) || 1;
  let at = starts[k];
  // mock interviews: name the speaker (WebVTT voice span)
  const who = lec.cast && s.who ? lec.cast[s.who]?.name : null;
  for (const p of parts) {
    const d = (p.length / chars) * speak;
    cues.push(`${vttTime(at)} --> ${vttTime(at + d)}\n${who ? `<v ${who}>` : ""}${p}`);
    at += d;
  }
});
fs.writeFileSync(path.join(OUT, "captions.vtt"), `WEBVTT\n\n${cues.join("\n\n")}\n`);
const chapters = lec.scenes.map((s) => ({ title: s.kind === "quiz" ? "Checkpoint" : s.title, at: starts[steps.findIndex((x) => x.id === `${s.id}-0`)] }));
fs.writeFileSync(path.join(OUT, "chapters.json"), JSON.stringify(chapters));

const writeMedia = (video) =>
  fs.writeFileSync(
    path.join(OUT, "media.json"),
    JSON.stringify({ source: SOURCE, audio: "narration.mp3", music: hasMusic ? "music.mp3" : undefined, video, poster: "poster.jpg", captions: "captions.vtt", duration: Number(total.toFixed(3)), starts: starts.map((x) => Number(x.toFixed(3))) }, null, 1),
  );
writeMedia(undefined);

// 3. frames
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));
// a vertical short (lec.short) renders at 1080x1920 from its own record page
const PORTRAIT = !!lec.short;
await page.setViewport(PORTRAIT ? { width: 1080, height: 1920, deviceScaleFactor: 1 } : { width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("hk.notrack", "1");
    localStorage.setItem("hk.learn.seen", "1");
  } catch {}
});
await page.goto(`${SITE}/learn/${PORTRAIT ? "shorts" : "lectures"}/${lec.quest}?record=1`, { waitUntil: "networkidle2", timeout: 240000 });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{transition:none!important;animation:none!important;caret-color:transparent!important}" });
await page.waitForFunction(() => window.__LECTURE_READY === true && typeof window.__LECTURE_SET === "function", { timeout: 180000 });
if (WORDS) await page.evaluate((w) => (window.__SHORT_WORDS = w), WORDS);
const plan = await page.evaluate(() => window.__LECTURE_PLAN);
if (plan.length !== steps.length) throw new Error(`page has ${plan.length} steps, script ${steps.length}: is the dev server on the same content?`);
const FR = path.join(OUT, "frames");
fs.rmSync(FR, { recursive: true, force: true });
fs.mkdirSync(FR, { recursive: true });
let token = 0;
const shot = async (i, t, d, f) => {
  token++;
  await page.evaluate((i, t, d, tok) => window.__LECTURE_SET(i, t, d, tok), i, t, d, token);
  await page.waitForFunction((tok) => window.__LECTURE_FRAME === tok, { timeout: 60000, polling: "raf" }, token);
  await page.screenshot({ path: f, type: "jpeg", quality: 90, optimizeForSpeed: true });
};
const concat = [];
let n = 0;
const t0 = Date.now();
for (let i = 0; i < steps.length; i++) {
  const d = durations[i];
  const motion = plan[i].anim < 0 ? d : Math.min(plan[i].anim, d);
  const frames = Math.max(1, Math.round(motion * FPS));
  for (let k = 0; k < frames; k++) {
    const f = path.join(FR, `${String(n++).padStart(6, "0")}.jpg`);
    const t = k === frames - 1 && plan[i].anim >= 0 ? 99 : k / FPS;
    await shot(i, t, d, f);
    const hold = k === frames - 1 ? d - (frames - 1) / FPS : 1 / FPS;
    concat.push(`file '${f}'\nduration ${hold.toFixed(4)}`);
  }
  if (i === 0) await shot(0, 99, d, path.join(OUT, "poster.jpg"));
  if (i % 10 === 9) console.log(`frames: step ${i + 1}/${steps.length} · ${n} frames · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
concat.push(concat[concat.length - 1].split("\n")[0]);
fs.writeFileSync(path.join(OUT, "frames.txt"), concat.join("\n"));
console.log(`frames: ${n} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (flag("no-video")) process.exit(0);

// 4. the MP4: frames + narration + music ducked under the voice
const mp4 = path.join(OUT, "video.mp4");
const audioArgs = hasMusic
  ? ["-stream_loop", "-1", "-i", MUSIC, "-filter_complex", `[2:a]volume=${SHORT ? "0.32" : "0.20"},aformat=channel_layouts=stereo[m];[1:a]aformat=channel_layouts=stereo,asplit=2[v][key];[m][key]sidechaincompress=threshold=0.02:ratio=5:attack=30:release=600[md];[v][md]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=` + Math.max(0, total - 2.5).toFixed(2) + ":d=2.5[a]", "-map", "0:v", "-map", "[a]"]
  : ["-map", "0:v", "-map", "1:a"];
ff("-f", "concat", "-safe", "0", "-i", path.join(OUT, "frames.txt"), "-i", narration, ...audioArgs, "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(3), "-movflags", "+faststart", mp4);
writeMedia("video.mp4");
console.log(`mp4: ${mp4} · ${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB · ${dur(mp4).toFixed(1)} s`);
