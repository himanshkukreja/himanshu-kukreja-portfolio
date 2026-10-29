// Natural-voice "Listen" narration for every article Listen plays, one after another, in this order:
// side quests, course lessons, interview problems, LLD, case files, war stories, mock interviews
// (lib.mjs listArticles). Resumable: an article whose text hasn't changed since its listen.json was made
// is skipped, and so is a publish R2 already has. Only files identical to their repo's origin/main are
// voiced (production would never match anything else).
//
// usage: nice -n 10 node --env-file=.env.local scripts/listen/batch.mjs [--publish] [--only <key prefix>] [--limit N]
//          [--out out/listen] [--force] [--allow-dirty]
//        node scripts/listen/batch.mjs --estimate     (words, audio minutes, MB and Kokoro hours; voices nothing)
//   --only quest/        just the side quests (or lesson/week-04-caching/, lesson/problem-bank/, case/, war/, mock/, …)
//   --limit 10           stop after voicing 10 articles (unchanged ones don't count)
// Each voiced article appends a line to <out>/batch.jsonl (words, audio seconds, Kokoro seconds, bytes);
// the estimate uses those lines for its speed once there are some. Ctrl-C stops after the current article.
import fs from "fs";
import os from "os";
import path from "path";
import { articleText, buildArticle, fmtTime, GROUP_LABEL, GROUPS, isPublished, listArticles, publishArticle, ROOT, BITRATE } from "./lib.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const out = path.resolve(ROOT, opt("out", "out/listen"));
const logFile = path.join(out, "batch.jsonl");
fs.mkdirSync(out, { recursive: true });

/** measured so far: audio seconds per word and Kokoro seconds per audio second */
function measured() {
  if (!fs.existsSync(logFile)) return null;
  const rows = fs
    .readFileSync(logFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.compute);
  if (!rows.length) return null;
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return { n: rows.length, secPerWord: sum("duration") / sum("words"), computePerSec: sum("compute") / sum("duration"), bytesPerSec: sum("bytes") / sum("duration") };
}

if (flag("estimate")) {
  const groups = new Map();
  const add = (g, words) => {
    const x = groups.get(g) ?? { n: 0, words: 0 };
    x.n++;
    x.words += words;
    groups.set(g, x);
  };
  for (const a of await listArticles()) {
    // what production reads: not the content repo's unpublished folders (week-*-next) or local edits
    if (!(await isPublished(a))) continue;
    const t = await articleText(a).catch(() => null);
    if (t?.blocks.length) add(GROUP_LABEL[a.group], t.words);
  }

  const m = measured();
  // until something is measured: ~150 spoken words a minute, Kokoro at the speed in README.md
  const secPerWord = m ? m.secPerWord : 60 / 150;
  const computePerSec = m ? m.computePerSec : Number(opt("compute", "0.25"));
  const bytesPerSec = m ? m.bytesPerSec : (parseInt(BITRATE, 10) * 1000) / 8;
  console.log(m ? `speeds from ${m.n} voiced articles: ${(60 / secPerWord).toFixed(0)} words/min, Kokoro ${(computePerSec * 60).toFixed(1)} s per audio minute` : `no voiced articles yet: 150 words/min, Kokoro ${(computePerSec * 60).toFixed(1)} s per audio minute (--compute)`);
  let T = { n: 0, words: 0 };
  console.log("collection               articles    words   audio h     MB   Kokoro h");
  for (const [g, x] of groups) {
    const sec = x.words * secPerWord;
    console.log(`${g.padEnd(24)} ${String(x.n).padStart(8)} ${String(x.words).padStart(8)} ${(sec / 3600).toFixed(1).padStart(9)} ${((sec * bytesPerSec) / 1048576).toFixed(0).padStart(6)} ${((sec * computePerSec) / 3600).toFixed(1).padStart(10)}`);
    T = { n: T.n + x.n, words: T.words + x.words };
  }
  const sec = T.words * secPerWord;
  console.log(`${"total".padEnd(24)} ${String(T.n).padStart(8)} ${String(T.words).padStart(8)} ${(sec / 3600).toFixed(1).padStart(9)} ${((sec * bytesPerSec) / 1048576).toFixed(0).padStart(6)} ${((sec * computePerSec) / 3600).toFixed(1).padStart(10)}`);
  process.exit(0);
}

// a background job: at least nice 10 (Kokoro, started from here, inherits it), so renders and the Mac come first
try {
  if (os.getPriority() < 10) os.setPriority(10);
} catch {
  // not allowed: run as is
}

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log("\nstopping after this article (Ctrl-C again to quit now)");
});

const only = opt("only", "");
const limit = Number(opt("limit", "0")) || Infinity;
const articles = (await listArticles()).filter((a) => a.key.startsWith(only));
console.log(`${articles.length} articles${only ? ` under ${only}` : ""} → ${path.relative(ROOT, out)}${flag("publish") ? " (and R2)" : ""}`);
console.log(`order: ${GROUPS.map((g) => [g, articles.filter((a) => a.group === g).length]).filter(([, n]) => n).map(([g, n]) => `${GROUP_LABEL[g]} (${n})`).join(" → ")}`);
const t0 = Date.now();
let voiced = 0;
let audio = 0;
const tally = {};
for (const [i, a] of articles.entries()) {
  if (stopping || voiced >= limit) break;
  let r;
  try {
    r = await buildArticle(a, { out, force: flag("force"), allowDirty: flag("allow-dirty"), log: console.log });
  } catch (e) {
    r = { key: a.key, status: "failed", note: e.message };
  }
  tally[r.status] = (tally[r.status] || 0) + 1;
  let pub = "";
  if (flag("publish") && (r.status === "built" || r.status === "unchanged")) {
    try {
      pub = ` · ${(await publishArticle(r.dir, a.key)).status}`;
    } catch (e) {
      pub = ` · publish FAILED: ${e.message}`;
      tally["publish failed"] = (tally["publish failed"] || 0) + 1;
    }
  }
  if (r.status === "built") {
    voiced++;
    audio += r.duration;
    fs.appendFileSync(logFile, JSON.stringify({ key: a.key, words: r.words, duration: r.duration, compute: r.compute, bytes: r.bytes, at: new Date().toISOString() }) + "\n");
  }
  const elapsed = (Date.now() - t0) / 1000;
  const detail = r.duration ? ` · ${fmtTime(r.duration)} audio${r.compute ? `, ${fmtTime(r.compute)} Kokoro` : ""}` : r.note ? ` · ${r.note}` : "";
  console.log(`[${i + 1}/${articles.length}] ${a.key}: ${r.status}${detail}${pub} · ${fmtTime(elapsed)} so far`);
}
console.log(`done: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(", ")} · ${fmtTime(audio)} of new audio in ${fmtTime((Date.now() - t0) / 1000)}`);
