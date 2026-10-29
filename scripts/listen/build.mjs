// Natural-voice "Listen" narration for some articles (Kokoro af_heart, local, free).
// usage: node --env-file=.env.local scripts/listen/build.mjs <article> [<article> …] [--publish] [--dev]
//          [--out out/listen] [--force] [--allow-dirty] [--keep-wav]
//   <article>: quest/<slug>, lesson/<week>/<slug>, or just the slug / week/slug
//   --publish      upload to R2 listen/<key>/ (skipped when R2 already has this text's recording)
//   --dev          also copy into public/listen-media/ so `next dev` plays it
//   --force        voice it again even if the text is unchanged
//   --allow-dirty  voice a file that differs from the content repo's origin/main
// Everything else (all articles, timings, estimates): batch.mjs. Setup: README.md.
import path from "path";
import { buildArticle, copyForDev, findArticles, fmtTime, publishArticle, ROOT } from "./lib.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const ids = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
if (!ids.length) {
  console.error("usage: node --env-file=.env.local scripts/listen/build.mjs <quest/slug | lesson/week/slug> … [--publish] [--dev] [--force]");
  process.exit(1);
}
const out = path.resolve(ROOT, opt("out", "out/listen"));

for (const a of await findArticles(ids)) {
  const r = await buildArticle(a, { out, force: flag("force"), allowDirty: flag("allow-dirty"), keepWav: flag("keep-wav") });
  if (r.status === "dirty" || r.status === "skipped") {
    console.log(`${a.key}: ${r.status} (${r.note})`);
    continue;
  }
  const speed = r.compute ? ` · Kokoro ${r.compute.toFixed(0)} s = ${(r.compute / (r.duration / 60)).toFixed(1)} s per audio minute` : "";
  console.log(`${a.key}: ${r.status} · ${r.words} words · ${fmtTime(r.duration)} audio · ${(r.bytes / 1048576).toFixed(1)} MB${speed}`);
  if (flag("dev")) console.log(`  dev copy: ${path.relative(ROOT, copyForDev(r.dir, a.key))}`);
  if (flag("publish")) {
    const p = await publishArticle(r.dir, a.key);
    console.log(`  ${p.status}: ${p.url}`);
  }
}
