// Resolve a System Design Mastery lesson's in-article clips (resources/clips/<week>--<slug>.json) into one-scene
// lectures for rendering, one file per clip: <out dir>/clips--<week>--<slug>--<clip>.json. Built the same way as the
// page's clips (sdmClipLecture in src/lib/course/sdm-extras.ts), so the recorded media's hash matches the page.
//
// usage: node scripts/lecture/sdm-clips.mjs <clips json> <out dir>
//   e.g. node scripts/lecture/sdm-clips.mjs ~/sdm/resources/clips/low-level-design--dp-16-strategy.json /tmp/stage
// then: check.mjs and export.mjs on each file (export.mjs records a clip from /dsa/video/<quest> at 1280x720, no music)
import fs from "fs";
import path from "path";
import { resolveDsaClip } from "../../src/lib/dsa/lecture.ts";

const [file, out] = process.argv.slice(2);
const m = file && path.basename(file).match(/^([a-z0-9-]+?)--([a-z0-9-]+)\.json$/);
if (!m || !out) {
  console.error("usage: node scripts/lecture/sdm-clips.mjs <resources/clips/<week>--<slug>.json> <out dir>");
  process.exit(2);
}
const [, week, slug] = m;
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
fs.mkdirSync(out, { recursive: true });
let bad = 0;
for (const clip of raw.clips ?? []) {
  const l = resolveDsaClip(clip, null, { module: week, concept: slug, title: slug });
  if (!l) {
    console.error(`clip ${clip.id}: does not resolve`);
    bad++;
    continue;
  }
  // as sdmClipLecture: drop the DSA lesson link, take the SDM media id
  const { dsa: _dsa, ...rest } = l;
  void _dsa;
  const lec = { ...rest, quest: `clips--${week}--${slug}--${clip.id}` };
  fs.writeFileSync(path.join(out, `${lec.quest}.json`), JSON.stringify(lec, null, 1));
  console.log(lec.quest);
}
process.exit(bad ? 1 : 0);
