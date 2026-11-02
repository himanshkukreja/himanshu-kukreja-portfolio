/**
 * The course's move to systemdesignmastery.dev (src/lib/learn/paths.ts, src/lib/site/carry.ts):
 * clean ↔ internal paths, no first-segment collisions, no leftover "/learn/…" links in the source,
 * and the localStorage carry-over (bridge → import) end to end with stubbed browser globals.
 *   node --test scripts/tests/course-paths.test.mjs
 * (Node ≥ 22.18 strips the TypeScript types of the imported modules.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_AREA, LEARN_FEATURES, LEARN_FILES, cleanHtmlLinks, cleanPath, internalPath, isCourseVisit, isLessonPath, legacyTarget, parseLessonPath } from "../../src/lib/learn/paths.ts";
import { CARRY_JS, IMPORT_JS, MAX_FRAGMENT } from "../../src/lib/site/carry.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("every directory under src/app/learn is a known feature or file route", () => {
  const known = new Set([...LEARN_FEATURES, ...LEARN_FILES, "[course]"]);
  for (const e of fs.readdirSync(path.join(ROOT, "src/app/learn"), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    assert.ok(known.has(e.name), `src/app/learn/${e.name} has no clean path: add it to LEARN_FEATURES or LEARN_FILES`);
  }
});

test("no feature name can be a content area, and content folders are areas", () => {
  for (const f of LEARN_FEATURES) assert.ok(!CONTENT_AREA.test(f), `${f} collides with the content-area pattern`);
  const areas = ["overview", "bonus-problems", "problem-bank", "low-level-design", "week-00-foundations", "week-04-caching", "week-11-designing-ai-systems"];
  const local = process.env.SDM_LOCAL_DIR;
  if (local && fs.existsSync(local)) for (const d of fs.readdirSync(local)) if (/^week-\d+/.test(d)) areas.push(d);
  for (const a of areas) {
    assert.ok(CONTENT_AREA.test(a), `${a} must match CONTENT_AREA`);
    assert.ok(!LEARN_FEATURES.includes(a), `${a} collides with a feature`);
  }
  // shared top-level routes are never course segments
  for (const top of ["api", "admin", "auth", "cert", "u", "newsletter", "_next", "projects", "now", "play"]) assert.equal(internalPath(`/${top}/x`), null, top);
});

const PAIRS = [
  ["/learn", "/", null],
  ["/learn/system-design-mastery", "/", "/learn/system-design-mastery"],
  ["/learn/system-design-mastery/week-04-caching/day-01-caching-patterns", "/week-04-caching/day-01-caching-patterns", "/learn/system-design-mastery/week-04-caching/day-01-caching-patterns"],
  ["/learn/system-design-mastery/bonus-problems/bonus-01-indian-upi-system", "/bonus-problems/bonus-01-indian-upi-system", "/learn/system-design-mastery/bonus-problems/bonus-01-indian-upi-system"],
  ["/learn/system-design-mastery/overview/plan", "/overview/plan", "/learn/system-design-mastery/overview/plan"],
  ["/learn/lectures/lecture-x?t=12", "/lectures/lecture-x?t=12", "/learn/lectures/lecture-x?t=12"],
  ["/learn/shorts", "/shorts", "/learn/shorts"],
  ["/learn/war-stories/war-room/x#y", "/war-stories/war-room/x#y", "/learn/war-stories/war-room/x#y"],
  ["/learn/notebook/page/abc", "/notebook/page/abc", "/learn/notebook/page/abc"],
  ["/learn/podcast.xml", "/podcast.xml", "/learn/podcast.xml"],
  ["/stories", "/case-files", "/stories"],
  ["/stories/cdn-cache-poisoning-disaster", "/case-files/cdn-cache-poisoning-disaster", "/stories/cdn-cache-poisoning-disaster"],
  ["/stories/feed.xml", "/case-files/feed.xml", "/stories/feed.xml"],
  ["/learn/practice", "/prep", "/learn/prep"],
  ["/learn/tracks/google", "/prep/companies/google", "/learn/prep/companies/google"],
  ["/learn/search?q=x", "/chat?q=x", "/learn/chat?q=x"],
];

test("cleanPath (old → clean) and internalPath (clean → route)", () => {
  for (const [old, clean, internal] of PAIRS) {
    assert.equal(cleanPath(old), clean, old);
    assert.equal(cleanPath(clean), clean, `idempotent: ${clean}`);
    if (internal) assert.equal(internalPath(clean), internal, clean);
  }
  for (const p of ["/", "/projects", "/cert/SDM-1", "/u/me", "/api/x", "/learn-art/a.webp", "/case-files/x.png"]) {
    if (p !== "/") assert.equal(cleanPath(p), p);
  }
  assert.equal(internalPath("/case-files/bridgelink-architecture.png"), null, "static case-file images are public files");
  assert.equal(legacyTarget("/practice"), "/prep");
});

test("lesson paths: clean and old forms", () => {
  assert.deepEqual(parseLessonPath("/week-04-caching/day-01?x=1#s"), { week: "week-04-caching", slug: "day-01" });
  assert.deepEqual(parseLessonPath("/learn/system-design-mastery/problem-bank/problem-01-x"), { week: "problem-bank", slug: "problem-01-x" });
  assert.equal(parseLessonPath("/lectures/x"), null);
  assert.equal(parseLessonPath("/revise/week-04-caching/day-01"), null);
  assert.ok(isLessonPath("https://systemdesignmastery.dev/low-level-design/lld-01-parking-lot"));
  assert.ok(isCourseVisit("/learn/arena") && isCourseVisit("/arena") && !isCourseVisit("/projects") && !isCourseVisit("/"));
  assert.ok(isCourseVisit("/", "systemdesignmastery.dev"));
});

test("rendered content links are cleaned", () => {
  const html = '<a href="/learn/system-design-mastery/week-01-data-at-scale/day-02-x#s-1">a</a> <a href="https://www.himanshukukreja.in/stories/x">b</a> <a href="/learn-art/a.webp">c</a> <a href="/api/learn/x">d</a>';
  assert.equal(cleanHtmlLinks(html), '<a href="/week-01-data-at-scale/day-02-x#s-1">a</a> <a href="/case-files/x">b</a> <a href="/learn-art/a.webp">c</a> <a href="/api/learn/x">d</a>');
});

/* ---------------------------------------------------------------- no leftover links in the source */

// the old host keeps its own manifest on purpose (installed apps open /learn, which forwards)
const ALLOW = new Set(["src/middleware.ts", "src/lib/learn/paths.ts", "src/lib/site/carry.ts", "src/app/manifest.ts"]);
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|mjs|js)$/.test(e.name)) yield p;
  }
}

test("no hrefs, pushes or URLs to /learn/… or /stories/… remain in src (internal routes only)", () => {
  // a path literal that starts a string or template: "/learn…", '/stories…', `/learn…`, or after an origin
  const LEFT = /(["'`]|himanshukukreja\.in)\/(?:learn|stories)(?=[/"'`?#]|$)/;
  const bad = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, file);
    if (ALLOW.has(rel)) continue;
    fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (!LEFT.test(line)) return;
      if (/revalidatePath\(|outputFileTracingIncludes|^\s*(\/\/|\*|\/\*)/.test(line)) return; // ISR paths are internal routes; comments
      if (/\b(?:pattern|startsWith)\b.*\/learn%?["']|"\/learn%"/.test(line)) return; // analytics over pre-move data
      bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  assert.deepEqual(bad, []);
});

/* ---------------------------------------------------------------- the carry-over, end to end */

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

async function runCarry(store, target, hash = "") {
  let replaced = null;
  const g = globalThis;
  const saved = { window: g.window, localStorage: g.localStorage, location: g.location, document: g.document };
  g.window = g;
  g.localStorage = store;
  g.location = { hash, protocol: "https:", replace: (u) => (replaced = u) };
  g.document = { cookie: "" };
  try {
    new Function(CARRY_JS)();
    await g.__hkCarry(target);
    for (let i = 0; i < 50 && !replaced; i++) await new Promise((r) => setTimeout(r, 10));
    return { url: replaced, cookie: g.document.cookie };
  } finally {
    Object.assign(g, saved);
    delete g.__hkCarry;
  }
}

async function runImport(store, url) {
  const u = new URL(url);
  const g = globalThis;
  const saved = { localStorage: g.localStorage, sessionStorage: g.sessionStorage, location: g.location, history: g.history };
  const session = fakeStorage();
  let reloaded = null;
  g.localStorage = store;
  g.sessionStorage = session;
  g.history = { state: null, replaceState: (_s, _t, p) => (g.location.hash = p.includes("#") ? p.slice(p.indexOf("#")) : "") };
  g.location = { hash: u.hash, pathname: u.pathname, search: u.search, replace: (x) => (reloaded = x) };
  try {
    new Function(IMPORT_JS)();
    for (let i = 0; i < 100 && !reloaded; i++) await new Promise((r) => setTimeout(r, 10));
    return { reloaded, session: session.dump(), hashAfterStrip: g.location.hash };
  } finally {
    Object.assign(g, saved);
  }
}

test("carry: old host packs, new host imports (no overwrite, migrated paths, auth tokens stay, hash kept)", async () => {
  const old = fakeStorage({
    "hk.game.v1": JSON.stringify({ xp: 900 }),
    "hk.lesson.v1": JSON.stringify({ href: "/learn/system-design-mastery/week-04-caching/day-01", s: "/stories/x" }),
    "hk.theme": "dark",
    "sb-proj-auth-token": "secret",
    "ph_phc_x_posthog": "{}",
  });
  const { url, cookie } = await runCarry(old, "https://systemdesignmastery.dev/week-04-caching/day-01", "#s-2");
  assert.match(url, /^https:\/\/systemdesignmastery\.dev\/week-04-caching\/day-01#hk-import=[gj]\./);
  assert.match(cookie, /hk_moved=1/);
  assert.ok(url.length < MAX_FRAGMENT + 200);
  const fresh = fakeStorage({ "hk.theme": "light" });
  const r = await runImport(fresh, url);
  const d = fresh.dump();
  assert.equal(d["hk.theme"], "light", "a value the new host already had is kept");
  assert.deepEqual(JSON.parse(d["hk.game.v1"]), { xp: 900 });
  assert.deepEqual(JSON.parse(d["hk.lesson.v1"]), { href: "/week-04-caching/day-01", s: "/case-files/x" });
  assert.ok(!("sb-proj-auth-token" in d) && !("ph_phc_x_posthog" in d), "sessions and analytics state are never carried");
  assert.equal(r.reloaded, "/week-04-caching/day-01#s-2", "reloads once at the clean URL with the original hash");
  assert.equal(JSON.parse(r.session["hk.moved"]).n, 2);
});

test("carry: over the cap, big nice-to-have keys are dropped and named", async () => {
  const noise = (n) => Array.from({ length: n }, () => Math.random().toString(36).slice(2)).join("");
  const old = fakeStorage({ "hk.game.v1": JSON.stringify({ xp: 1 }), "hk.ink.dev.db": noise(12000), "hk.annot.dev.db": noise(9000) });
  const { url } = await runCarry(old, "https://systemdesignmastery.dev/");
  assert.ok(url.length <= "https://systemdesignmastery.dev/#hk-import=".length + MAX_FRAGMENT, `fragment ${url.length}`);
  const fresh = fakeStorage();
  const r = await runImport(fresh, url);
  assert.deepEqual(JSON.parse(fresh.dump()["hk.game.v1"]), { xp: 1 });
  assert.ok(JSON.parse(r.session["hk.moved"]).dropped.includes("hk.ink.dev.db"));
});

test("carry: nothing to carry → straight to the new URL", async () => {
  const { url, cookie } = await runCarry(fakeStorage({ "sb-x-auth-token": "t" }), "https://systemdesignmastery.dev/prep");
  assert.equal(url, "https://systemdesignmastery.dev/prep");
  assert.match(cookie, /hk_moved=1/);
});
