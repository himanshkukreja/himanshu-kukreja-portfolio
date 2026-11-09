// Resolve a DSA Mastery lecture for rendering: inline its traces, races, lesson templates and quote cast, the same
// way the site does (src/lib/dsa/lecture.ts, shared), so the recorded media's hash matches the page's lecture.
//
// usage: node scripts/lecture/dsa-resolve.mjs <dsa-mastery dir> <module>/<concept>[/<short slug>] <out.json>
//   e.g. node scripts/lecture/dsa-resolve.mjs ~/dsa-mastery m5-sliding-window/fixed-and-variable-windows /tmp/x.json
//        node scripts/lecture/dsa-resolve.mjs ~/dsa-mastery m5-sliding-window/at-most-k/the-subtraction-trick /tmp/s.json (a short)
//        node scripts/lecture/dsa-resolve.mjs ~/dsa-mastery clips/s1-linked-lists/linked-lists/insert-head /tmp/c.json (an in-article clip)
//        node scripts/lecture/dsa-resolve.mjs ~/dsa-mastery solution/newest-first-thread /tmp/v.json (a problem's solution video)
// clips record from /dsa/video/dsa--clips--<lesson>--<clip> at 1280x720 with no music; solution videos from
// /dsa/video/dsa--solution--<problem> at 1920x1080 (export.mjs picks both from the resolved JSON)
// then: check.mjs <out.json>, export.mjs <out.json> <out dir> --site http://localhost:3200 (renders /dsa/concepts/<concept>/lecture,
// or a short's /dsa/shorts/<quest> at 1080x1920)
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { lectureRefs, resolveDsaClip, resolveDsaLecture, resolveDsaShort, resolveDsaSolution } from "../../src/lib/dsa/lecture.ts";

const [repo, id, out] = process.argv.slice(2);
if (!repo || !id || !out || !/^(?:clips\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+|solution\/[a-z0-9-]+|[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)$/.test(id)) {
  console.error("usage: node scripts/lecture/dsa-resolve.mjs <dsa-mastery dir> <module>/<concept>[/<short slug>] | clips/<module>/<lesson>/<clip> | solution/<problem> <out.json>");
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
const castMd0 = read("resources/company/cast.md");
const cast0 = Object.fromEntries(((castMd0 ? matter(castMd0, {}).data.cast : null) || []).map((c) => [c.id, { name: c.name, role: c.role }]));
const sourcesOf = (raw) => {
  const refs = lectureRefs(raw);
  const traces = Object.fromEntries(refs.traces.map((t) => [t, json(`generated/traces/${t}.json`)]));
  const races = Object.fromEntries(refs.races.map((r) => [r, json(`generated/races/${r}.json`)]));
  const missing = [...refs.traces.filter((t) => !traces[t]).map((t) => `trace ${t}`), ...refs.races.filter((r) => !races[r]).map((r) => `race ${r}`)];
  return { traces, races, missing };
};
const write = (lec, missing) => {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(lec));
  console.log(`${lec.quest}: ${lec.scenes.length} scenes resolved → ${out}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
};
if (id.startsWith("solution/")) {
  // a problem's solution video: resources/problems/<id>/solution.json + its reference solutions
  const pid = id.slice("solution/".length);
  const raw = json(`resources/problems/${pid}/solution.json`);
  const md = read(`resources/problems/${pid}/problem.md`);
  if (!raw || !md) {
    console.error(`no solution.json or problem.md for ${pid}`);
    process.exit(1);
  }
  const front = matter(md, {}).data;
  const files = { python: "solution.py", javascript: "solution.js", java: "Solution.java", cpp: "solution.cpp" };
  const solutions = Object.fromEntries(Object.entries(files).map(([l, f]) => [l, read(`resources/problems/${pid}/solutions/${f}`)]).filter(([, c]) => c));
  const { traces, races, missing } = sourcesOf(raw);
  write(resolveDsaSolution(raw, { problem: { id: pid, module: front.module || "", concept: front.concept || "" }, solutions, traces, races, cast: cast0 }), missing);
  process.exit(0);
}
if (id.startsWith("clips/")) {
  // an in-article clip: <lesson dir>/clips.json, borrowing from the lesson's resolved lecture
  const [, cmod, lesson, clipId] = id.split("/");
  const cdir = ["structures", "algorithms", "modules"].map((r) => `resources/${r}/${cmod}/${lesson}`).find((d) => fs.existsSync(path.join(repo, d)));
  const clips = cdir && json(`${cdir}/clips.json`);
  const clip = clips?.clips?.find((c) => c.id === clipId);
  if (!clip) {
    console.error(`no clip ${clipId} in ${cdir || cmod + "/" + lesson}/clips.json`);
    process.exit(1);
  }
  const lraw = json(`${cdir}/lecture.json`);
  const lmd = read(`${cdir}/lesson.md`);
  const lsrc = lraw ? sourcesOf(lraw) : { traces: {}, races: {}, missing: [] };
  const lec = lraw ? resolveDsaLecture(lraw, { lessonMd: lmd, traces: lsrc.traces, races: lsrc.races, cast: cast0 }) : null;
  const title = (lmd && matter(lmd, {}).data.title) || lesson;
  const c = resolveDsaClip(clip, lec, { module: cmod, concept: lesson, title });
  if (!c) {
    console.error(`clip ${clipId}: scene ${clip.scene} is not in the lesson's lecture`);
    process.exit(1);
  }
  write(c, lsrc.missing);
  process.exit(0);
}
const [mod, concept, short] = id.split("/");
// a 6S concept (resources/modules/), a structure lesson (Academy Part 2, resources/structures/) or an algorithm
// lesson (Part 3, resources/algorithms/)
const dir = ["structures", "algorithms"].map((r) => `resources/${r}/${mod}/${concept}`).find((d) => fs.existsSync(path.join(repo, d))) || `resources/modules/${mod}/${concept}`;
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
