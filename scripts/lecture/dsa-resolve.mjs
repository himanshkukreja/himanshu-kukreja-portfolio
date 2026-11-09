// Resolve a DSA Mastery lecture for rendering: inline its traces, races, lesson templates and quote cast, the same
// way the site does (src/lib/dsa/lecture.ts, shared), so the recorded media's hash matches the page's lecture.
//
// usage: node scripts/lecture/dsa-resolve.mjs <dsa-mastery dir> <module>/<concept>[/<short slug>] <out.json>
//   e.g. node scripts/lecture/dsa-resolve.mjs ~/dsa-mastery m5-sliding-window/fixed-and-variable-windows /tmp/x.json
//        node scripts/lecture/dsa-resolve.mjs ~/dsa-mastery m5-sliding-window/at-most-k/the-subtraction-trick /tmp/s.json (a short)
// then: check.mjs <out.json>, export.mjs <out.json> <out dir> --site http://localhost:3200 (renders /dsa/concepts/<concept>/lecture,
// or a short's /dsa/shorts/<quest> at 1080x1920)
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { lectureRefs, resolveDsaLecture, resolveDsaShort } from "../../src/lib/dsa/lecture.ts";

const [repo, id, out] = process.argv.slice(2);
if (!repo || !id || !out || !/^[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(id)) {
  console.error("usage: node scripts/lecture/dsa-resolve.mjs <dsa-mastery dir> <module>/<concept>[/<short slug>] <out.json>");
  process.exit(2);
}
const read = (p) => {
  try {
    return fs.readFileSync(path.join(repo, p), "utf8");
  } catch {
    return null;
  }
};
const json = (p) => {
  const t = read(p);
  try {
    return t == null ? null : JSON.parse(t);
  } catch {
    return null;
  }
};
const [mod, concept, short] = id.split("/");
const dir = `resources/modules/${mod}/${concept}`;
const file = short ? `${dir}/shorts/${short}.json` : `${dir}/lecture.json`;
const raw = json(file);
if (!raw) {
  console.error(`no ${short ? "short" : "lecture"} at ${file}`);
  process.exit(1);
}
const castMd = read("resources/company/cast.md");
const cast = Object.fromEntries(((castMd ? matter(castMd, {}).data.cast : null) || []).map((c) => [c.id, { name: c.name, role: c.role }]));
const refs = lectureRefs(raw);
const traces = Object.fromEntries(refs.traces.map((t) => [t, json(`generated/traces/${t}.json`)]));
const races = Object.fromEntries(refs.races.map((r) => [r, json(`generated/races/${r}.json`)]));
const lec = (short ? resolveDsaShort : resolveDsaLecture)(raw, { lessonMd: read(`${dir}/lesson.md`), traces, races, cast });
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify(lec));
const missing = [...refs.traces.filter((t) => !traces[t]).map((t) => `trace ${t}`), ...refs.races.filter((r) => !races[r]).map((r) => `race ${r}`)];
console.log(`${lec.quest}: ${lec.scenes.length} scenes resolved → ${out}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
