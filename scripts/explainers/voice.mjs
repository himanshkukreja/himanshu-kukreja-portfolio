// Voice the DSA graphical explainers (generated/explainers/<id>.json in the dsa-mastery repo) with the Listen narrator
// (Kokoro af_heart): one narration.mp3 per explainer, every frame's start time and the recap's in listen.json, at
// media.himanshukukreja.in/listen/dsa-explainers/<id>/. The player uses a recording only when its `source` matches the
// explainer's current captions (src/lib/dsa/explainer.ts explainerTexts), so an edited explainer plays silent until
// it is voiced again.
//
//   node --env-file=.env.local scripts/explainers/voice.mjs [--content <dsa-mastery dir>] [--only id,id] [--dev] [--publish]
//
// --dev copies each recording into public/listen-media/ for `next dev`; --publish uploads it to R2.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { BITRATE, ROOT, SPEED, VOICE, copyForDev, publishArticle, readWav, runTts, sha1, wavHeader } from "../listen/lib.mjs";
import { sayArticle } from "../listen/say.mjs";

const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const flag = (k) => process.argv.includes(`--${k}`);
const content = path.resolve(arg("content") || process.env.DSA_LOCAL_DIR || path.join(ROOT, "../dsa-mastery"));
const only = (arg("only") || "").split(",").filter(Boolean);
const out = path.join(ROOT, "out/explainers");

/** The narration lines, in play order: each frame's `say` (or its note), then the recap. Same as the site's explainerTexts. */
export function explainerTexts(e) {
  const frames = e.beats.flatMap((b) => b.frames.map((f) => f.say || f.note));
  return [...frames, e.recap.say || `${e.recap.pattern}. ${e.recap.takeaway}`];
}
const sourceOf = (texts) => sha1(JSON.stringify(texts)).slice(0, 12);
/** at least this long on screen per frame, speech included */
const MIN_FRAME = 1.8;

const gen = path.join(content, "generated/explainers");
const ids = fs
  .readdirSync(gen)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5))
  .filter((id) => !only.length || only.includes(id));
console.log(`${ids.length} explainers from ${path.relative(ROOT, gen) || gen}`);

for (const id of ids) {
  const e = JSON.parse(fs.readFileSync(path.join(gen, `${id}.json`), "utf8"));
  const texts = explainerTexts(e);
  const source = sourceOf(texts);
  const key = `dsa-explainers/${id}`;
  const dir = path.join(out, id);
  const manFile = path.join(dir, "listen.json");
  const have = fs.existsSync(manFile) ? JSON.parse(fs.readFileSync(manFile, "utf8")) : null;
  if (have?.source === source && have.voice === VOICE) console.log(`  ${id}: unchanged (${have.duration}s)`);
  else {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "wav"), { recursive: true });
    const items = texts.map((t, i) => ({ text: sayArticle(t), out: path.join(dir, "wav", `${i}.wav`) }));
    const itemsFile = path.join(dir, "items.json");
    fs.writeFileSync(itemsFile, JSON.stringify(items));
    const t0 = Date.now();
    await runTts(itemsFile);
    // one WAV: each line, then a pause (longer between beats; every frame at least MIN_FRAME); times counted in samples
    const beatOf = e.beats.flatMap((b) => b.frames.map(() => b.id));
    const parts = [];
    const marks = [];
    let rate = 24000;
    let samples = 0;
    items.forEach((it, k) => {
      const w = readWav(it.out);
      rate = w.rate;
      marks.push(+(samples / rate).toFixed(3));
      const n = w.pcm.length / 2;
      parts.push(w.pcm);
      const next = k + 1 < items.length ? (beatOf[k + 1] ?? "recap") : null;
      const pause = !next ? 0.6 : next !== beatOf[k] ? 0.9 : 0.45;
      const gap = Math.round(Math.max(pause, MIN_FRAME - n / rate) * rate);
      parts.push(Buffer.alloc(gap * 2));
      samples += n + gap;
    });
    const pcm = Buffer.concat(parts);
    const wav = path.join(dir, "narration.wav");
    const mp3 = path.join(dir, "narration.mp3");
    fs.writeFileSync(wav, Buffer.concat([wavHeader(pcm.length, rate), pcm]));
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", String(rate), "-c:a", "libmp3lame", "-b:a", BITRATE, "-id3v2_version", "0", mp3], { stdio: ["ignore", "ignore", "inherit"] });
    const manifest = {
      v: 1,
      key,
      source,
      voice: VOICE,
      speed: SPEED,
      audio: `narration.mp3?v=${source}`,
      duration: +(samples / rate).toFixed(3),
      bytes: fs.statSync(mp3).size,
      marks: marks.slice(0, -1),
      recap: marks[marks.length - 1],
      made: new Date().toISOString(),
    };
    fs.writeFileSync(manFile, JSON.stringify(manifest));
    fs.rmSync(path.join(dir, "wav"), { recursive: true, force: true });
    fs.rmSync(wav, { force: true });
    fs.rmSync(itemsFile, { force: true });
    console.log(`  ${id}: voiced ${texts.length} lines, ${manifest.duration}s (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  if (flag("dev")) copyForDev(dir, key);
  if (flag("publish")) console.log(`  ${id}: ${(await publishArticle(dir, key)).status}`);
}
