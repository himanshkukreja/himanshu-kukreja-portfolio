/**
 * Lean lessons beyond the Academy (streets, camp tents, sets): the plan parser, URLs and progress slugs, the lesson steps,
 * the side branches on the outline and the metro (never counted in a station's lessons, state, route or "Next stop"),
 * the spurs' geometry, Practice's camp and company lists, and the palette docs (src/lib/dsa/kinds.ts).
 *   node --test scripts/tests/dsa-kinds.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isLeanKey, leanHref, leanKey, leanKindOfRoot, leanLectureHref, leanOfQuest, leanQuest, leanRatingsOf, leanRowsOf, parseLeanPlan } from "../../src/lib/dsa/kinds.ts";
import { groupStages, nextStep, prevStep, stepOfStage, stepOrderOf, stepSub, visibleStages } from "../../src/lib/dsa/lesson-steps.ts";
import { buildOutline } from "../../src/lib/dsa/outline.ts";
import { STATIONS, VIEW, EDGES } from "../../src/lib/dsa/metro/layout.ts";
import { buildMetro, computeRoute, routeInfo, stationDone, stationLessons } from "../../src/lib/dsa/metro/model.ts";
import { campList, companyList } from "../../src/lib/dsa/lists.ts";
import { resolveDsaLecture } from "../../src/lib/dsa/lecture.ts";
import { register } from "node:module";

// search-index.ts imports without extensions
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`));
const { buildDsaDocs } = await import("../../src/lib/dsa/search-index.ts");

const PLAN = {
  parts: [
    { modules: [{ id: "d1-arrays-hashing", title: "Arrays & Hashing", lessons: [{ id: "pairs-and-complements", title: "Pairs and complements", kind: "street", station: "m3-hashing" }, { id: "x", kind: "pattern" }] }] },
    { modules: [{ id: "camp-1", title: "Basics", rating: [800, 1000], lessons: [{ id: "implementation-warm-ups", title: "Implementation warm ups", kind: "camp-tent", station: "m0-toolkit" }] }] },
    { modules: [{ id: "co-fintech", title: "Fintech interview set", lessons: [{ id: "warm-up-round", title: "Warm-up round", kind: "set" }] }, { id: "core-150-gaps", title: "Core 150 gaps", lessons: [{ id: "trees-and-graphs", title: "Trees and graphs", kind: "set", station: "s6-graphs" }] }] },
  ],
  problems: [
    { id: "a", home: "camp-1/implementation-warm-ups", rating: 800 },
    { id: "b", home: "camp-1/implementation-warm-ups", rating: 900 },
    { id: "c", home: "co-fintech/warm-up-round" },
    { id: "d", home: "bad home" },
  ],
};

test("the plan parser keeps streets, camp tents and sets with their station and band", () => {
  const l = parseLeanPlan(PLAN);
  assert.deepEqual(l.map((x) => `${x.kind}:${x.module}/${x.id}:${x.station}`), ["street:d1-arrays-hashing/pairs-and-complements:m3-hashing", "camp-tent:camp-1/implementation-warm-ups:m0-toolkit", "set:co-fintech/warm-up-round:null", "set:core-150-gaps/trees-and-graphs:s6-graphs"]);
  assert.deepEqual(l[1].rating, [800, 1000]);
  assert.equal(l[0].rating, null);
  assert.deepEqual(l.map((x) => x.company), [false, false, true, false]);
  assert.deepEqual(parseLeanPlan(null), []);
});

test("rows and ratings come from the plan's problem rows", () => {
  assert.deepEqual([...leanRowsOf(PLAN)], [["camp-1/implementation-warm-ups", ["a", "b"]], ["co-fintech/warm-up-round", ["c"]]]);
  assert.equal(leanRatingsOf(PLAN).get("b"), 900);
});

test("URLs, progress slugs and quests: a repeated lesson id never shares progress", () => {
  assert.equal(leanHref("street", "d1-arrays-hashing", "pairs-and-complements"), "/dsa/districts/d1-arrays-hashing/pairs-and-complements");
  assert.equal(leanHref("camp-tent", "camp-1", "a"), "/dsa/camps/camp-1/a");
  assert.equal(leanHref("set", "co-fintech", "warm-up-round"), "/dsa/sets/co-fintech/warm-up-round");
  assert.equal(leanLectureHref("set", "core-150-gaps", "trees-and-graphs"), "/dsa/sets/core-150-gaps/trees-and-graphs/lecture");
  assert.notEqual(leanKey("co-fintech", "warm-up-round"), leanKey("co-health", "warm-up-round"));
  assert.ok(isLeanKey(leanKey("co-fintech", "warm-up-round")));
  assert.ok(!isLeanKey("fixed-and-variable-windows"));
  assert.equal(leanQuest("co-fintech", "warm-up-round"), "dsa--co-fintech--warm-up-round");
  assert.equal(leanKindOfRoot("camps"), "camp-tent");
  assert.equal(leanKindOfRoot("modules"), null);
  const all = parseLeanPlan(PLAN);
  assert.equal(leanOfQuest("dsa--camp-1--implementation-warm-ups", all)?.kind, "camp-tent");
});

test("a lean lesson's beats are Learn, Practice (the ladder) and Check; there is no Try it", () => {
  const street = ["family", "move", "beyond", "ladder", "recap"].map((id) => ({ id }));
  const set = ["brief", "moves", "ladder", "practice", "recap"].map((id) => ({ id }));
  assert.deepEqual(groupStages("lean", street), { learn: ["family", "move", "beyond"], try: [], practice: ["ladder"], check: ["recap"] });
  assert.deepEqual(groupStages("lean", set), { learn: ["brief", "moves"], try: [], practice: ["ladder", "practice"], check: ["recap"] });
  assert.equal(stepOfStage("lean", { id: "contest" }), "learn");
  assert.deepEqual(stepOrderOf("lean"), ["learn", "practice", "check"]);
  assert.equal(nextStep("learn", "lean"), "practice");
  assert.equal(nextStep("check", "lean"), null);
  assert.equal(prevStep("practice", "lean"), "learn");
  // the existing kinds keep four steps
  assert.equal(nextStep("learn"), "try");
  assert.equal(nextStep("learn", "concept"), "try");
  assert.deepEqual(visibleStages({ kind: "lean", stages: street, step: "practice", beat: null, whole: false }), ["ladder"]);
  assert.equal(stepSub("practice", "lean", { learnBeats: 3, tryBeats: 0, traces: 0, races: 0, hasVisualizer: false, practice: 7, checkBeats: 1 }), "7 problems");
});

// an outline with the real station ids: m3-hashing has two lessons and one street branch
const lesson = (id) => ({ conceptId: id, title: id, href: `/dsa/concepts/${id}`, kind: "concept", minutes: 10, problemCount: 2, built: true, nodeId: id });
const mod = (regionId, ids, branches = []) => ({ regionCode: regionId.split("-")[0], regionId, moduleId: regionId, step: "", title: regionId, objective: "", lessons: ids.map(lesson), branches, checkpoints: [], minutes: ids.length * 10, problemCount: 0, planned: false, placement: { built: false }, boss: null, readyLessons: ids.length });
const BR = { key: "d1-arrays-hashing--pairs-and-complements", kind: "street", module: "d1-arrays-hashing", lesson: "pairs-and-complements", title: "Pairs and complements", href: "/dsa/districts/d1-arrays-hashing/pairs-and-complements", minutes: 10, problemCount: 7 };
const outlineOf = (branches) => {
  const regs = STATIONS.map((s) => s.id);
  return { parts: [{ id: "part-1", label: "PART 1", title: "All", summary: "", modules: regs.map((r) => mod(r, [`${r}-1`, `${r}-2`], r === "m3-hashing" ? branches : [])) }], totals: { lessons: 0, ready: 0, planned: 0, problems: 0 } };
};

test("buildOutline hangs a branch off its station and nowhere else", () => {
  const academy = { parts: [{ id: "p", title: "P", label: "", summary: "", regions: ["r"] }], regions: [{ id: "r", code: "m3", title: "Hashing", module: "m3-hashing", detail: "full", status: "x", intro: null, line: null, objective: null, moduleTitle: "Hashing", stretches: [], side: [], boss: null }], final: null };
  const o = buildOutline(academy, [], [], {}, {}, [{ ...BR, station: "m3-hashing" }, { ...BR, key: "other", station: "m0-toolkit" }]);
  assert.deepEqual(o.parts[0].modules[0].branches.map((b) => b.key), ["d1-arrays-hashing--pairs-and-complements"]);
  assert.equal(o.parts[0].modules[0].branches[0].station, undefined);
  assert.equal(buildOutline(academy, [], [], {}, {}).parts[0].modules[0].branches.length, 0);
});

test("a branch is optional: it never changes a station's counts, state, route or lessons", () => {
  const progress = { concepts: new Set(["m3-hashing-1", "m3-hashing-2"]), solved: new Set() };
  const plain = buildMetro(outlineOf([]), progress);
  const withBranch = buildMetro(outlineOf([BR]), progress);
  const a = plain.byId.get("m3-hashing");
  const b = withBranch.byId.get("m3-hashing");
  for (const k of ["state", "done", "total", "all", "minutes", "problems", "lessonIds", "href", "nextLesson"]) assert.deepEqual(b[k], a[k], k);
  assert.equal(b.state, "done");
  assert.equal(b.branches.length, 1);
  assert.equal(b.branches[0].done, false);
  assert.deepEqual(withBranch.edges.map((e) => `${e.from}>${e.to}`), plain.edges.map((e) => `${e.from}>${e.to}`));
  assert.deepEqual(computeRoute(withBranch.adj, "m2-arrays-strings", "s1-linked-lists"), computeRoute(plain.adj, "m2-arrays-strings", "s1-linked-lists"));
  const ri = routeInfo(withBranch, "m3-hashing", { kind: "topic", station: "s1-linked-lists" }, progress, outlineOf([BR]));
  const rp = routeInfo(plain, "m3-hashing", { kind: "topic", station: "s1-linked-lists" }, progress, outlineOf([]));
  assert.deepEqual([ri.stops, ri.lessons, ri.minutes], [rp.stops, rp.lessons, rp.minutes]);
  // done only when the learner finished it (its progress slug)
  const finished = buildMetro(outlineOf([BR]), { concepts: new Set([...progress.concepts, BR.key]), solved: new Set() });
  assert.equal(finished.byId.get("m3-hashing").branches[0].done, true);
  assert.equal(stationDone(["m3-hashing-1", "m3-hashing-2"], progress.concepts), true);
  const sl = stationLessons(outlineOf([BR]), withBranch.byId.get("m3-hashing"), { concepts: progress.concepts });
  assert.equal(sl.lessons.length, 2);
  assert.equal(sl.branches.length, 1);
});

test("Practice: camps are sections of tents, company types link their set lessons", () => {
  const camps = campList([{ id: "camp-1", title: "Basics", band: [800, 1000], tents: [{ id: "t1", title: "T1", ids: ["a", "b", "z"], href: "/dsa/camps/camp-1/t1" }, { id: "t2", title: "T2", ids: ["z"], href: null }] }], new Set(["a", "b"]));
  assert.equal(camps.sections[0].title, "Camp 1 · Basics");
  assert.equal(camps.sections[0].hint, "rated 800 to 1000");
  assert.deepEqual(camps.sections[0].ids, ["a", "b"]);
  assert.equal(camps.sections[0].planned, 2);
  assert.deepEqual(camps.sections[0].streets.map((s) => [s.id, s.href]), [["t1", "/dsa/camps/camp-1/t1"]]);
  const co = companyList([{ id: "p", companies: ["fintech"] }, { id: "q", companies: ["fintech", "big-tech-product"] }], [{ id: "fintech", label: "Fintech" }, { id: "big-tech-product", label: "Big tech" }, { id: "none", label: "None" }], [{ module: "co-fintech", title: "Warm-up round", href: "/dsa/sets/co-fintech/warm-up-round" }]);
  assert.deepEqual(co.sections.map((s) => [s.id, s.ids.length, s.links?.length ?? 0]), [["fintech", 2, 1], ["big-tech-product", 1, 0]]);
});

test("the palette finds a lean lesson by its title, kind and station", () => {
  const docs = buildDsaDocs([], [], () => "", [{ id: "pairs-and-complements", module: "d1-arrays-hashing", kind: "street", title: "Pairs and complements", summary: "Two items that belong together.", where: "2.2 Hashing" }]);
  assert.equal(docs.length, 1);
  assert.equal(`/${docs[0].week}/${docs[0].slug}`, "/dsa/districts/d1-arrays-hashing/pairs-and-complements");
  assert.match(docs[0].content, /Street .*2\.2 Hashing/);
  assert.equal(docs[0].type, "day-content");
});

test("a resolved lean lecture names its kind, so the recorder opens its own page; an Academy lecture is unchanged", () => {
  const src = { lessonMd: null, traces: {}, races: {}, cast: {} };
  const lean = resolveDsaLecture({ v: 2, quest: "dsa--camp-1--a", title: "t", summary: "s", lesson: { course: "dsa", module: "camp-1", concept: "a", kind: "camp-tent" }, scenes: [] }, src);
  assert.deepEqual(lean.dsa, { module: "camp-1", concept: "a", kind: "camp-tent" });
  const old = resolveDsaLecture({ v: 2, quest: "dsa--m5--b", title: "t", summary: "s", lesson: { course: "dsa", module: "m5", concept: "b" }, scenes: [] }, src);
  assert.deepEqual(old.dsa, { module: "m5", concept: "b" });
});

const DSA = join(process.env.DSA_LOCAL_DIR || join(homedir(), ".cache/hk-render/dsa-content"), "resources/plan/curriculum.yml");
test("the real plan: every lean lesson has a root, and a station, when named, is a station of the map", { skip: !existsSync(DSA) && "curriculum.yml not available" }, async () => {
  const matter = (await import("gray-matter")).default;
  const plan = matter(`---\n${readFileSync(DSA, "utf8")}\n---\n`, {}).data;
  const lean = parseLeanPlan(plan);
  assert.ok(lean.length > 10);
  for (const l of lean) {
    if (l.company) assert.equal(l.station, null, `${l.module}/${l.id}: a company set has no station`);
    // a planned tent may not name its station yet (the content checker requires it once the lesson is written)
    else if (l.station) assert.ok(STATIONS.some((s) => s.id === l.station), `${l.module}/${l.id}: station ${l.station}`);
  }
});
