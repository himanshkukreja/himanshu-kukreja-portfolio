// Publish the feature-video series (/learn/guide, the hub's welcome card, "watch how it works" links)
// to Cloudflare R2, then record what's live in src/lib/learn/guide/published.json. The site shows a
// video only once it's in that manifest (and NEXT_PUBLIC_GUIDE_VIDEOS=1), so commit the manifest
// after a publish; until then nothing changes on the site.
//
// usage:
//   node --env-file=.env.local scripts/guide-videos/publish.mjs [options] [id …]
//     no ids: every finished video in --src. Ids: getting-started, code-labs, welcome-trailer, full-tour …
//   --src <dir>        the delivery folder (default ~/Downloads/demo-videos), one NN-<id>/ folder per video
//                      holding <id>-1080p.mp4, <id>-9x16.mp4, <id>.srt, thumbnail.jpg, script.md
//   --dry-run          check and convert everything, print the plan; upload nothing, write no manifest
//   --local [dir]      for `next dev`: lay the files out in public/guide-videos-dev/<id>/ (symlinks to the
//                      big files, nothing copied) and write the manifest; no upload. The dev site reads
//                      them from /guide-videos-dev (or set NEXT_PUBLIC_GUIDE_VIDEO_MEDIA=/guide-videos-dev).
//                      Put the manifest back (git checkout) before committing unless the uploads match.
//   --hardlink         with --local: hard links instead of symlinks (same disk, still no copy)
//   --alias id=folder  use another folder for an id (e.g. a stand-in trailer while testing; --local only)
//   --force            publish a folder even if a file in it changed in the last 2 minutes (still rendering?)
// env (uploads): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
//
// Per video it lands at guide-videos/<id>/: video-1080p.mp4, video-9x16.mp4, poster.jpg (the 1280×720
// thumbnail), thumb.jpg (640 wide, for the cards), captions.vtt (from the .srt), and for the welcome
// trailer preview.mp4 (its first 10 s, muted, 960 wide: the hub card's autoplay loop). Then
// guide-videos/manifest.json. File URLs carry ?v=<hash>, so a re-render never mixes with a cached copy.
// Needs ffmpeg + ffprobe (Homebrew). Encodes run niced on 2 threads.
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const MANIFEST = path.join(ROOT, "src/lib/learn/guide/published.json");
// series order; must match GUIDE_VIDEO_CATALOG in src/lib/learn/guide/videos.ts
const IDS = [
  "welcome-trailer",
  "getting-started",
  "lectures-listen",
  "shorts",
  "side-quests",
  "code-labs",
  "arena-review",
  "design-boss",
  "mock-interviews",
  "interview-prep",
  "notebook",
  "ai-tutor",
  "progress-profile",
  "full-tour",
];
const PREVIEW_FOR = new Set(["welcome-trailer"]);
const PREVIEW_SEC = 10;

// ------------------------------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const opt = { src: path.join(os.homedir(), "Downloads/demo-videos"), dry: false, local: null, hard: false, force: false, alias: {}, only: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--src") opt.src = path.resolve(argv[++i]);
  else if (a === "--dry-run") opt.dry = true;
  else if (a === "--local") opt.local = argv[i + 1] && !argv[i + 1].startsWith("-") && !IDS.includes(argv[i + 1]) ? path.resolve(argv[++i]) : path.join(ROOT, "public/guide-videos-dev");
  else if (a === "--hardlink") opt.hard = true;
  else if (a === "--force") opt.force = true;
  else if (a === "--alias") {
    const [id, dir] = argv[++i].split("=");
    opt.alias[id] = dir;
  } else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
  else opt.only.push(a);
}
for (const id of [...opt.only, ...Object.keys(opt.alias)]) if (!IDS.includes(id)) throw new Error(`unknown video id "${id}" (one of: ${IDS.join(", ")})`);
if (Object.keys(opt.alias).length && !opt.local && !opt.dry) throw new Error("--alias is for --local testing only");

// ------------------------------------------------------------------------------------------ tools
function tool(name) {
  for (const dir of [...(process.env.PATH || "").split(":"), "/opt/homebrew/bin", "/usr/local/bin"]) {
    const p = path.join(dir, name);
    if (dir && fs.existsSync(p)) return p;
  }
  throw new Error(`${name} not found (brew install ffmpeg)`);
}
const FFMPEG = tool("ffmpeg");
const FFPROBE = tool("ffprobe");
const NICE = fs.existsSync("/usr/bin/nice") ? "/usr/bin/nice" : null;
const run = (bin, args) => (NICE ? execFileSync(NICE, ["-n", "15", bin, ...args], { stdio: ["ignore", "pipe", "pipe"] }) : execFileSync(bin, args, { stdio: ["ignore", "pipe", "pipe"] }));

function probe(file) {
  const out = JSON.parse(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,pix_fmt", "-of", "json", file]).toString());
  const v = out.streams.find((s) => s.codec_type === "video");
  return { duration: Number(out.format.duration), codec: v?.codec_name, width: v?.width, height: v?.height, pix: v?.pix_fmt, audio: out.streams.some((s) => s.codec_type === "audio") };
}

/** moov before mdat, so playback starts before the whole file is down */
function faststart(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(8);
    let pos = 0;
    const size = fs.fstatSync(fd).size;
    while (pos < size) {
      fs.readSync(fd, head, 0, 8, pos);
      let len = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (len === 1) {
        const big = Buffer.alloc(8);
        fs.readSync(fd, big, 0, 8, pos + 8);
        len = Number(big.readBigUInt64BE(0));
      }
      if (len < 8) return false;
      pos += len;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

// ------------------------------------------------------------------------------------------ inputs
/** "0:00 Getting started" lines after the first "chapters" line of script.md (the main cut's) */
function chaptersFrom(md) {
  const lines = md.split(/\r?\n/);
  const at = lines.findIndex((l) => /chapters/i.test(l));
  if (at < 0) return [];
  const out = [];
  for (const l of lines.slice(at + 1)) {
    const m = /^\s*(?:[-*]\s*)?(\d+):(\d\d)\s+(?:[-–—]\s*)?(.+?)\s*$/.exec(l);
    if (m) out.push({ t: Number(m[1]) * 60 + Number(m[2]), label: m[3] });
    else if (l.trim() && out.length) break; // the list ended
  }
  return out;
}

function srtToVtt(srt) {
  const body = srt
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2")
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

function findDir(id) {
  if (opt.alias[id]) {
    const d = path.join(opt.src, opt.alias[id]);
    if (!fs.existsSync(d)) throw new Error(`--alias ${id}: no folder ${d}`);
    return d;
  }
  const hit = fs.readdirSync(opt.src).find((n) => n === id || new RegExp(`^\\d{2}-${id}$`).test(n));
  return hit ? path.join(opt.src, hit) : null;
}

function pick(dir, names, test) {
  const files = fs.readdirSync(dir);
  for (const n of names) if (files.includes(n)) return path.join(dir, n);
  const f = files.find(test);
  return f ? path.join(dir, f) : null;
}

function gather(id) {
  const dir = findDir(id);
  if (!dir) return { id, skip: "no folder yet" };
  const base = opt.alias[id] ? path.basename(dir).replace(/^\d{2}-/, "") : id;
  const main = pick(dir, [`${base}-1080p.mp4`], (n) => n.endsWith("-1080p.mp4"));
  if (!main) return { id, skip: `no *-1080p.mp4 in ${path.basename(dir)} (still rendering?)` };
  const vertical = pick(dir, [`${base}-9x16.mp4`], (n) => n.endsWith("-9x16.mp4"));
  const srt = pick(dir, [`${base}.srt`], (n) => n.endsWith(".srt") && !/9x16|4x5/.test(n));
  const poster = pick(dir, ["thumbnail.jpg"], (n) => /^thumbnail.*\.jpe?g$/.test(n) && !/4k/i.test(n));
  const script = pick(dir, ["script.md"], () => false);
  const fresh = [main, vertical, srt, poster].filter(Boolean).filter((f) => Date.now() - fs.statSync(f).mtimeMs < 120_000);
  if (fresh.length && !opt.force) return { id, skip: `${fresh.map((f) => path.basename(f)).join(", ")} changed in the last 2 min (still rendering? --force to publish anyway)` };
  return { id, dir, main, vertical, srt, poster, script };
}

// ------------------------------------------------------------------------------------------ R2
const { R2_ACCOUNT_ID: ACC, R2_ACCESS_KEY_ID: KEY, R2_SECRET_ACCESS_KEY: SECRET, R2_BUCKET: BUCKET, R2_PUBLIC_URL: PUBLIC } = process.env;
const uploading = !opt.dry && !opt.local;
if (uploading && (!ACC || !KEY || !SECRET || !BUCKET)) throw new Error("set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET (node --env-file=.env.local …)");
const HOST = `${ACC}.r2.cloudflarestorage.com`;
const TYPES = { ".json": "application/json", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".vtt": "text/vtt; charset=utf-8" };
const hmac = (k, s) => crypto.createHmac("sha256", k).update(s).digest();
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

async function put(key, body, type, cache) {
  for (let attempt = 1; ; attempt++) {
    const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const day = now.slice(0, 8);
    const uri = `/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const hash = sha(body);
    const headers = { host: HOST, "content-type": type, "cache-control": cache, "x-amz-content-sha256": hash, "x-amz-date": now };
    const names = Object.keys(headers).sort();
    const canon = ["PUT", uri, "", ...names.map((h) => `${h}:${headers[h]}`), "", names.join(";"), hash].join("\n");
    const scope = `${day}/auto/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", now, scope, sha(canon)].join("\n");
    const kSign = hmac(hmac(hmac(hmac(`AWS4${SECRET}`, day), "auto"), "s3"), "aws4_request");
    const sig = crypto.createHmac("sha256", kSign).update(toSign).digest("hex");
    try {
      const res = await fetch(`https://${HOST}${uri}`, {
        method: "PUT",
        headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${KEY}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` },
        body,
      });
      if (res.ok) return;
      throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    } catch (e) {
      if (attempt >= 3) throw new Error(`PUT ${key}: ${e.message}`);
      console.warn(`  retry ${key} (${e.message})`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// ------------------------------------------------------------------------------------------ main
const fileHash = (f) => {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(f, "r");
  const buf = Buffer.alloc(1 << 20);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest("hex");
};
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

const work = path.join(os.tmpdir(), "hk-guide-videos");
fs.mkdirSync(work, { recursive: true });
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { videos: {} };
manifest.videos ||= {};
const ids = opt.only.length ? opt.only : IDS;
let done = 0;

for (const id of ids) {
  const g = gather(id);
  if (g.skip) {
    console.log(`- ${id}: skipped, ${g.skip}`);
    continue;
  }
  const info = probe(g.main);
  const problems = [];
  if (info.codec !== "h264") problems.push(`codec ${info.codec}, want h264`);
  // yuvj420p (full-range 4:2:0) plays in every browser; anything else (4:4:4, 10-bit) doesn't everywhere
  if (info.pix && !/^yuvj?420p$/.test(info.pix)) problems.push(`pixel format ${info.pix}, want yuv420p`);
  if (!faststart(g.main)) problems.push(`moov atom at the end: run ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`);
  if (!info.audio) problems.push("no audio track");
  if (problems.length) {
    console.log(`- ${id}: NOT published: ${problems.join("; ")}`);
    continue;
  }
  if (info.width !== 1920) console.warn(`  ${id}: ${info.width}×${info.height}, expected 1920×1080`);

  const chapters = g.script ? chaptersFrom(fs.readFileSync(g.script, "utf8")) : [];
  const badCh = chapters.length && (chapters[0].t !== 0 || chapters.some((c, i) => i && c.t <= chapters[i - 1].t) || chapters.at(-1).t >= info.duration);
  if (!chapters.length) console.warn(`  ${id}: no chapters found in script.md`);
  if (badCh) console.warn(`  ${id}: chapters look wrong (must start at 0:00, ascend, end before ${info.duration.toFixed(0)} s)`);

  // derived files
  const tmp = path.join(work, id);
  fs.mkdirSync(tmp, { recursive: true });
  const out = {}; // published name → { file } or { body }
  out["video-1080p.mp4"] = { file: g.main };
  if (g.vertical) out["video-9x16.mp4"] = { file: g.vertical };
  if (g.poster) out["poster.jpg"] = { file: g.poster };
  else {
    run(FFMPEG, ["-v", "error", "-y", "-ss", "3", "-i", g.main, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", path.join(tmp, "poster.jpg")]);
    out["poster.jpg"] = { file: path.join(tmp, "poster.jpg"), made: true };
  }
  run(FFMPEG, ["-v", "error", "-y", "-i", out["poster.jpg"].file, "-vf", "scale=640:-2", "-q:v", "5", path.join(tmp, "thumb.jpg")]);
  out["thumb.jpg"] = { file: path.join(tmp, "thumb.jpg"), made: true };
  if (g.srt) out["captions.vtt"] = { body: Buffer.from(srtToVtt(fs.readFileSync(g.srt, "utf8"))) };
  else console.warn(`  ${id}: no .srt, so no captions track`);
  if (PREVIEW_FOR.has(id)) {
    const p = path.join(tmp, "preview.mp4");
    run(FFMPEG, ["-v", "error", "-y", "-t", String(PREVIEW_SEC), "-i", g.main, "-an", "-vf", "scale=960:-2", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "2", p]);
    out["preview.mp4"] = { file: p, made: true };
  }

  const hashes = Object.entries(out).map(([n, f]) => `${n}:${f.body ? sha(f.body) : fileHash(f.file)}`);
  const v = sha(hashes.join("\n")).slice(0, 10);
  const files = Object.keys(out);
  const bytes = Object.values(out).reduce((a, f) => a + (f.body ? f.body.length : fs.statSync(f.file).size), 0);
  console.log(`- ${id}: ${path.basename(g.dir)} · ${info.duration.toFixed(1)} s · ${chapters.length} chapters · ${files.join(", ")} · ${mb(bytes)} · v=${v}`);

  if (opt.local) {
    const dest = path.join(opt.local, id);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const [n, f] of Object.entries(out)) {
      const to = path.join(dest, n);
      if (f.body) fs.writeFileSync(to, f.body);
      else if (f.made) fs.copyFileSync(f.file, to); // small: thumb, preview
      else if (opt.hard) fs.linkSync(f.file, to);
      else fs.symlinkSync(f.file, to);
    }
  } else if (uploading) {
    // the big files first; a learner can't see the video until the manifest is committed anyway
    for (const [n, f] of Object.entries(out)) {
      const body = f.body || fs.readFileSync(f.file);
      process.stdout.write(`  ↑ guide-videos/${id}/${n} (${mb(body.length)})…`);
      await put(`guide-videos/${id}/${n}`, body, TYPES[path.extname(n)], "public, max-age=604800");
      process.stdout.write(" ok\n");
    }
  }

  manifest.videos[id] = { v, duration: Math.round(info.duration * 100) / 100, chapters, files, bytes, source: path.basename(g.dir), published: new Date().toISOString() };
  done++;
}

if (!done) {
  console.log("nothing to publish");
  process.exit(0);
}
// series order, so diffs stay readable
manifest.videos = Object.fromEntries(IDS.filter((id) => manifest.videos[id]).map((id) => [id, manifest.videos[id]]));
manifest.updated = new Date().toISOString();
const json = `${JSON.stringify(manifest, null, 2)}\n`;
if (opt.dry) {
  console.log(`\n(dry run: nothing uploaded, ${path.relative(ROOT, MANIFEST)} unchanged)`);
} else {
  if (uploading) await put("guide-videos/manifest.json", Buffer.from(json), "application/json", "public, max-age=60");
  fs.writeFileSync(MANIFEST, json);
  console.log(`\n${done} video(s) ${opt.local ? `laid out in ${path.relative(ROOT, opt.local)}/` : `live at ${PUBLIC ? `${PUBLIC.replace(/\/$/, "")}/guide-videos/` : `r2://${BUCKET}/guide-videos/`}`}`);
  console.log(`manifest: ${path.relative(ROOT, MANIFEST)}${opt.local ? " (local paths are the same as on R2; revert it if these weren't uploaded)" : ": commit it to show these on the site"}`);
}
