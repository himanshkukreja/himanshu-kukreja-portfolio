// Shared by build.mjs (some articles) and batch.mjs (all of them): find an article (lesson reader, case
// file, war story, mock interview), extract what Listen reads (src/lib/listen/extract.ts, the same code
// the player runs), voice it with Kokoro af_heart, make narration.mp3 + listen.json, publish to R2.
// Setup and usage: README.md next to this file.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync, spawn } from "child_process";
import { createJiti } from "jiti";
import matter from "gray-matter";
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

/** .env (Supabase, for the case files' CMS rows) under .env.local, as Next loads them: never overriding what's set */
function loadDotEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {
    // no .env
  }
}

let site = null;
/** the site's own modules (TypeScript, through jiti): content listing, renderer, Listen extraction */
export async function siteModules() {
  if (site) return site;
  process.env.SDM_LOCAL_DIR = contentDir();
  loadDotEnv();
  // lib/stories.ts reads content/stories from the working directory, as on Vercel
  process.chdir(ROOT);
  const jiti = createJiti(import.meta.url, {
    alias: { "@": path.join(ROOT, "src"), "server-only": path.join(ROOT, "node_modules/next/dist/compiled/server-only/empty.js") },
  });
  const load = (p) => jiti.import(path.join(ROOT, p));
  const [github, render, extract, html, manifest, mcq, block, story, war, mock, stories] = await Promise.all([
    load("src/lib/github.ts"),
    load("src/lib/course/render.ts"),
    load("src/lib/listen/extract.ts"),
    load("src/lib/listen/html.ts"),
    load("src/lib/listen/manifest.ts"),
    load("src/lib/mcq-parser.ts"),
    load("src/lib/course/block-html.ts"),
    load("src/components/stories/render-story.ts"),
    load("src/lib/learn/war/parse.ts"),
    load("src/lib/learn/mock/parse.ts"),
    load("src/lib/stories.ts"),
  ]);
  site = { github, render, extract, html, manifest, mcq, block, story, war, mock, stories, content: process.env.SDM_LOCAL_DIR };
  return site;
}

/**
 * Batch order: side quests, course lessons, interview problems, LLD, case files, war stories, mock
 * interviews (each group in its own order: course order, file name).
 */
export const GROUPS = ["quest", "lesson", "problem", "lld", "case", "war", "mock"];
export const GROUP_LABEL = { quest: "side quests", lesson: "course lessons", problem: "interview problems", lld: "low-level design", case: "case files", war: "war stories", mock: "mock interviews" };
const groupOf = (kind) => (kind === "bonus" ? "quest" : kind === "problem" || kind === "lld" || kind === "case" || kind === "war" || kind === "mock" ? kind : "lesson");

const mdFiles = (dir, re = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f) && !/^readme/i.test(f)).sort() : []);

/**
 * Every article Listen can play, in batch order. `repo` + `path` is the source file (checked against that
 * repo's origin/main): "content" is the content repo (SDM_LOCAL_DIR), "site" this repo.
 * - lesson reader (lessons, side quests, interview problems, LLD): the content repo, as listed by the course
 * - case files: what /stories/<slug> shows (lib/stories.ts): the admin CMS's published (live) snapshot,
 *   repo "db", for every case file the CMS has, else content/stories/<file>.md here. Needs the Supabase
 *   env (.env); without it only the repo files are listed, and those the CMS replaced won't match.
 * - war stories: resources/war-stories/stories/*.md (war rooms are an interactive game: not voiced)
 * - mock interviews: resources/mock-interviews/mock-NN-*.md, the debrief's model answers
 */
export async function listArticles() {
  const { github, manifest, content, stories } = await siteModules();
  const all = await github.getAllLearningResources();
  const out = all
    .filter((r) => r.type !== "mcq")
    .map((r) => ({ key: manifest.listenKey(r.type, r.week, r.slug), kind: r.type, week: r.week, slug: r.slug, repo: "content", path: r.path, href: `/learn/${r.course}/${r.week}/${r.slug}` }));
  const files = new Map(
    mdFiles(path.join(ROOT, "content/stories"), /\.md$/).map((f) => {
      const fm = matter(fs.readFileSync(path.join(ROOT, "content/stories", f), "utf8")).data || {};
      return [typeof fm.slug === "string" && fm.slug ? fm.slug : f.replace(/\.md$/, ""), f];
    })
  );
  const cases = (await stories.listStorySources()).sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  if (!cases.some((c) => c.origin === "db")) console.warn("case files: no CMS rows (Supabase env missing or unreachable): the repo files are listed, and any the CMS replaces won't match");
  for (const c of cases) {
    const db = c.origin === "db";
    if (!db && !files.has(c.slug)) continue;
    out.push({ key: manifest.listenKey("case", "", c.slug), kind: "case", week: "stories", slug: c.slug, repo: db ? "db" : "site", path: db ? `case_files:${c.slug}` : `content/stories/${files.get(c.slug)}`, body: c.body, href: `/stories/${c.slug}` });
  }
  for (const f of mdFiles(path.join(content, "resources/war-stories/stories"))) {
    const slug = f.replace(/\.md$/, "");
    out.push({ key: manifest.listenKey("war", "", slug), kind: "war", week: "war-stories", slug, repo: "content", path: `resources/war-stories/stories/${f}`, href: `/learn/war-stories/${slug}` });
  }
  for (const f of mdFiles(path.join(content, "resources/mock-interviews"), /^mock-\d+-[\w-]+\.md$/)) {
    const slug = f.replace(/\.md$/, "");
    out.push({ key: manifest.listenKey("mock", "", slug), kind: "mock", week: "mock-interviews", slug, repo: "content", path: `resources/mock-interviews/${f}`, href: `/learn/mock/${slug}` });
  }
  // stable: course order (or file name) within each group
  return out.map((a, i) => ({ a, i, g: GROUPS.indexOf(groupOf(a.kind)) })).sort((x, y) => x.g - y.g || x.i - y.i).map((x) => ({ ...x.a, group: GROUPS[x.g] }));
}

/** "quest/<slug>", "lesson/<week>/<slug>", "case/<slug>", "war/<slug>", "mock/<slug>", or a bare slug / week/slug */
export async function findArticles(ids) {
  const all = await listArticles();
  return ids.map((id) => {
    const a = all.find((x) => x.key === id) ?? all.find((x) => x.slug === id || `${x.week}/${x.slug}` === id || x.href.endsWith(`/${id}`));
    if (!a) throw new Error(`no article "${id}" (try quest/<slug>, lesson/<week>/<slug>, case/<slug>, war/<slug> or mock/<slug>)`);
    return a;
  });
}

/** the repo an article's file lives in: the content checkout, or this one */
export async function repoDir(a) {
  return a.repo === "site" ? ROOT : (await siteModules()).content;
}

/**
 * Is this what production shows? A file: only when it's as it is on its repo's origin/main. A CMS case
 * file: its live (published) snapshot is what production shows, by definition.
 */
export async function isPublished(a) {
  return a.repo === "db" || onMain(await repoDir(a), a.path);
}

/** is the file as it is on its repo's origin/main (what production reads)? */
export function onMain(repo, rel) {
  try {
    execFileSync("git", ["-C", repo, "cat-file", "-e", `origin/main:${rel}`], { stdio: "ignore" });
    execFileSync("git", ["-C", repo, "diff", "--quiet", "origin/main", "--", rel], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The mock debrief as Listen reads it (src/components/learn/mock/Debrief.tsx, every model answer open):
 * a [data-listen-scope] root whose [data-listen-part]s are each phase's heading ("P1 Clarify
 * requirements") and its model answer. Phases are numbered in order, as buildMock() does.
 */
function mockListenHtml(phases) {
  return `<div data-listen-scope="">${phases
    .map((p, k) => `<h2 data-listen-part=""><span>P${k + 1}</span> ${esc(p.title)}</h2><div data-listen-part=""><div class="course-content"><div class="sd-body">${p.answerHtml}</div></div></div>`)
    .join("")}</div>`;
}

/** The HTML the page gives the player's root (null: nothing to voice), and whether its first element is the root. */
export async function articleHtml(a) {
  const { github, render, mcq, block, story, war, mock } = await siteModules();
  if (a.kind === "case") {
    // the page wraps the body in one more <div> (StoryContentWrapper): no text of its own
    return { md: a.body, html: (await story.renderStoryBody(a.body)).htmlContent, scoped: false };
  }
  const md = await github.fetchMarkdownContent(a.path);
  if (a.kind === "war") {
    const { story: s } = war.parseStory(md, path.basename(a.path));
    return s ? { md, html: await block.renderBlockHtml(s.body), scoped: false } : null;
  }
  if (a.kind === "mock") {
    const raw = mock.parseMock(md);
    if (!raw.phases.length) return null;
    const phases = await Promise.all(raw.phases.map(async (p) => ({ title: p.title, answerHtml: await block.renderBlockHtml(p.answer) })));
    // what the debrief needs to open in a browser (parity.mjs --page): its saved run is keyed by id and version
    const run = { id: raw.id || a.slug, version: sha1(md).slice(0, 12), phases: phases.length };
    return { md, html: mockListenHtml(phases), scoped: true, run };
  }
  if (mcq.isMCQDocument(md)) return null;
  return { md, html: (await render.renderLesson(md, { kind: a.kind })).html, scoped: false };
}

/** The article's readable blocks as the reader page will extract them, plus their fingerprint. */
export async function articleText(a) {
  const { extract, html } = await siteModules();
  const h = await articleHtml(a);
  if (!h) return null;
  const parsed = html.parseHtml(h.html);
  const root = h.scoped ? parsed.childNodes.find((n) => n.nodeType === 1) : parsed;
  const blocks = extract.extractBlocks(root);
  return { md: h.md, html: h.html, scoped: h.scoped, run: h.run, blocks, source: extract.listenSource(blocks), words: blocks.reduce((n, b) => n + b.text.split(/\s+/).length, 0) };
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
  if (!allowDirty && !(await isPublished(a))) return { key: a.key, status: "dirty", note: `${a.path} differs from origin/main in ${await repoDir(a)} (production would not match; --allow-dirty to voice it anyway)` };
  const t = await articleText(a);
  if (!t) return { key: a.key, status: "skipped", note: a.kind === "mock" ? "no phases" : a.kind === "war" ? "not a valid war story" : "MCQ document" };
  if (!t.blocks.length) return { key: a.key, status: "skipped", note: "nothing to read" };
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
