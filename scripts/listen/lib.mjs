// Shared by build.mjs (some articles) and batch.mjs (all of them): find an article, extract what Listen
// reads (src/lib/listen/extract.ts, the same code the player runs), voice it with Kokoro af_heart, make
// narration.mp3 + listen.json, publish to R2. Setup and usage: README.md next to this file.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync, spawn } from "child_process";
import { createJiti } from "jiti";
import { sayArticle } from "./say.mjs";
import { r2Put } from "./r2.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const ROOT = path.resolve(HERE, "../..");
export const VOICE = "af_heart";
export const SPEED = 1.0;
/** mono MP3, constant bitrate (exact seeking in Safari), 24 kHz like Kokoro's output */
export const BITRATE = "48k";
export const PUBLIC_BASE = (process.env.LISTEN_PUBLIC_URL || "https://media.himanshukukreja.in/listen").replace(/\/$/, "");
const KOKORO = (process.env.KOKORO_DIR || path.join(process.env.HOME, ".cache/kokoro")).replace(/\/?$/, "/");
const PYTHON = process.env.KOKORO_PYTHON || path.join(KOKORO, "venv/bin/python");
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";

/** content checkout: SDM_LOCAL_DIR (env or .env.local), as the site reads it in development */
function contentDir() {
  if (process.env.SDM_LOCAL_DIR) return process.env.SDM_LOCAL_DIR;
  try {
    const m = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^SDM_LOCAL_DIR=(.+)$/m);
    if (m) return path.resolve(ROOT, m[1].trim());
  } catch {
    // no .env.local
  }
  return path.resolve(ROOT, "../system-design-mastery");
}

let site = null;
/** the site's own modules (TypeScript, through jiti): content listing, renderer, Listen extraction */
export async function siteModules() {
  if (site) return site;
  process.env.SDM_LOCAL_DIR = contentDir();
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(ROOT, "src"), "server-only": path.join(ROOT, "node_modules/next/dist/compiled/server-only/empty.js") },
  });
  const load = (p) => jiti.import(path.join(ROOT, p));
  const [github, render, extract, html, manifest, mcq] = await Promise.all([
    load("src/lib/github.ts"),
    load("src/lib/course/render.ts"),
    load("src/lib/listen/extract.ts"),
    load("src/lib/listen/html.ts"),
    load("src/lib/listen/manifest.ts"),
    load("src/lib/mcq-parser.ts"),
  ]);
  site = { github, render, extract, html, manifest, mcq, content: process.env.SDM_LOCAL_DIR };
  return site;
}

/** Every article the lesson reader shows (lessons, side quests, interview problems, LLD), in course order. */
export async function listArticles() {
  const { github, manifest } = await siteModules();
  const all = await github.getAllLearningResources();
  return all
    .filter((r) => r.type !== "mcq")
    .map((r) => ({ key: manifest.listenKey(r.type, r.week, r.slug), kind: r.type, week: r.week, slug: r.slug, path: r.path, href: `/learn/${r.course}/${r.week}/${r.slug}` }));
}

/** "quest/<slug>", "lesson/<week>/<slug>", or a bare slug / week/slug */
export async function findArticles(ids) {
  const all = await listArticles();
  return ids.map((id) => {
    const a = all.find((x) => x.key === id || x.slug === id || `${x.week}/${x.slug}` === id || x.href.endsWith(`/${id}`));
    if (!a) throw new Error(`no article "${id}" (try quest/<slug> or lesson/<week>/<slug>)`);
    return a;
  });
}

/** is the file as it is on the content repo's origin/main (what production reads)? */
export function onMain(content, rel) {
  try {
    execFileSync("git", ["-C", content, "cat-file", "-e", `origin/main:${rel}`], { stdio: "ignore" });
    execFileSync("git", ["-C", content, "diff", "--quiet", "origin/main", "--", rel], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The article's readable blocks as the reader page will extract them, plus their fingerprint. */
export async function articleText(a) {
  const { github, render, extract, html, mcq } = await siteModules();
  const md = await github.fetchMarkdownContent(a.path);
  if (mcq.isMCQDocument(md)) return null;
  const rendered = await render.renderLesson(md, { kind: a.kind });
  const blocks = extract.extractBlocks(html.parseHtml(rendered.html));
  return { md, blocks, source: extract.listenSource(blocks), words: blocks.reduce((n, b) => n + b.text.split(/\s+/).length, 0) };
}

/* ---------------------------------------------------------------- audio */

function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${file}: not a WAV`);
  let off = 12;
  let fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    if (id === "data") {
      if (!fmt || fmt.format !== 1 || fmt.bits !== 16 || fmt.channels !== 1) throw new Error(`${file}: expected 16-bit mono PCM`);
      return { rate: fmt.rate, pcm: buf.subarray(body, body + Math.min(size, buf.length - body)) };
    }
    off = body + size + (size & 1);
  }
  throw new Error(`${file}: no data chunk`);
}

function wavHeader(bytes, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}

/** silence after a block: longer before a heading, longest before a checkpoint's answer */
function gapAfter(b, next) {
  if (!next) return 0.6;
  if (next.answer) return 1.6;
  if (next.heading) return 0.9;
  if (b.heading) return 0.4;
  const tag = (b.el.tagName || "").toUpperCase();
  if (tag === "TR" && (next.el.tagName || "").toUpperCase() === "TR") return 0.3;
  return 0.45;
}

function runTts(itemsFile, onProgress) {
  return new Promise((resolve, reject) => {
    const p = spawn(PYTHON, [path.join(ROOT, "scripts/lecture/tts.py"), itemsFile, VOICE, String(SPEED), KOKORO], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stdout.on("data", (d) => {
      const m = String(d).trim().split("\n").pop()?.match(/^(\d+)\/(\d+)/);
      if (m && onProgress) onProgress(Number(m[1]), Number(m[2]));
    });
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tts.py exited ${code}: ${err.slice(-800)}`))));
  });
}

const fmtTime = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;

/**
 * Voice one article into <out>/<key>/: narration.mp3 + listen.json. Skips when listen.json there was made
 * from the same text (unless force). Returns what happened, with timings for the speed log.
 */
export async function buildArticle(a, { out, force = false, allowDirty = false, keepWav = false, log = console.log } = {}) {
  const { content } = await siteModules();
  if (!allowDirty && !onMain(content, a.path)) return { key: a.key, status: "dirty", note: `${a.path} differs from origin/main in ${content} (production would not match; --allow-dirty to voice it anyway)` };
  const t = await articleText(a);
  if (!t) return { key: a.key, status: "skipped", note: "MCQ document" };
  const dir = path.join(out, a.key);
  const manFile = path.join(dir, "listen.json");
  const mp3 = path.join(dir, "narration.mp3");
  if (!force && fs.existsSync(manFile) && fs.existsSync(mp3)) {
    const old = JSON.parse(fs.readFileSync(manFile, "utf8"));
    if (old.source === t.source && old.voice === VOICE && old.speed === SPEED) return { key: a.key, status: "unchanged", source: t.source, duration: old.duration, bytes: old.bytes, words: t.words, dir };
  }
  fs.mkdirSync(path.join(dir, "wav"), { recursive: true });
  const spoken = t.blocks.map((b, i) => ({ i, b, say: sayArticle(b.text, { heading: b.heading }) })).filter((x) => /[\p{L}\p{N}]/u.test(x.say));
  const items = spoken.map((x) => ({ text: x.say, out: path.join(dir, "wav", `${x.i}.wav`) }));
  const itemsFile = path.join(dir, "items.json");
  fs.writeFileSync(itemsFile, JSON.stringify(items));
  fs.writeFileSync(path.join(dir, "say.txt"), spoken.map((x) => `[${x.i}] ${x.say}`).join("\n"));
  const t0 = Date.now();
  let lastLog = 0;
  await runTts(itemsFile, (k, n) => {
    if (Date.now() - lastLog > 15000) {
      lastLog = Date.now();
      log(`  ${a.key}: ${k}/${n} blocks voiced (${fmtTime((Date.now() - t0) / 1000)})`);
    }
  });
  const compute = (Date.now() - t0) / 1000;

  // one WAV: each block's speech, then its pause; timings counted in samples, so they're exact
  const parts = [];
  const chunks = [];
  let rate = 24000;
  let samples = 0;
  spoken.forEach((x, k) => {
    const w = readWav(items[k].out);
    rate = w.rate;
    const n = w.pcm.length / 2;
    chunks.push({ b: x.i, t: x.b.text, s: +(samples / rate).toFixed(3), e: +((samples + n) / rate).toFixed(3) });
    parts.push(w.pcm);
    samples += n;
    const next = spoken[k + 1]?.b;
    const gap = Math.round(gapAfter(x.b, next) * rate);
    parts.push(Buffer.alloc(gap * 2));
    samples += gap;
  });
  const pcm = Buffer.concat(parts);
  const wav = path.join(dir, "narration.wav");
  fs.writeFileSync(wav, Buffer.concat([wavHeader(pcm.length, rate), pcm]));
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", String(rate), "-c:a", "libmp3lame", "-b:a", BITRATE, "-id3v2_version", "0", mp3], { stdio: ["ignore", "ignore", "inherit"] });
  const bytes = fs.statSync(mp3).size;
  const duration = +(samples / rate).toFixed(3);
  const manifest = {
    v: 1,
    key: a.key,
    source: t.source,
    voice: VOICE,
    speed: SPEED,
    audio: `narration.mp3?v=${t.source}`,
    duration,
    bytes,
    blocks: t.blocks.length,
    chunks,
    made: new Date().toISOString(),
  };
  fs.writeFileSync(manFile, JSON.stringify(manifest));
  if (!keepWav) {
    fs.rmSync(path.join(dir, "wav"), { recursive: true, force: true });
    fs.rmSync(wav, { force: true });
  }
  fs.rmSync(itemsFile, { force: true });
  return { key: a.key, status: "built", source: t.source, duration, bytes, words: t.words, compute, dir };
}

/** Upload one built article to R2 (listen/<key>/), audio first and the manifest last. Skips when R2 already has it. */
export async function publishArticle(dir, key) {
  const man = JSON.parse(fs.readFileSync(path.join(dir, "listen.json"), "utf8"));
  const remote = await fetch(`${PUBLIC_BASE}/${key}/listen.json`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (remote && remote.source === man.source && remote.bytes === man.bytes && remote.voice === man.voice) return { key, status: "already published", url: `${PUBLIC_BASE}/${key}/listen.json` };
  await r2Put(`listen/${key}/narration.mp3`, fs.readFileSync(path.join(dir, "narration.mp3")), "audio/mpeg", "public, max-age=604800");
  await r2Put(`listen/${key}/listen.json`, Buffer.from(JSON.stringify(man)), "application/json", "public, max-age=60");
  return { key, status: "published", url: `${PUBLIC_BASE}/${key}/listen.json` };
}

/** Copy a built article into public/listen-media/ for `next dev` (R2 doesn't answer localhost). */
export function copyForDev(dir, key) {
  const dest = path.join(ROOT, "public/listen-media", key);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of ["listen.json", "narration.mp3"]) fs.copyFileSync(path.join(dir, f), path.join(dest, f));
  return dest;
}

export const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
export { fmtTime };
