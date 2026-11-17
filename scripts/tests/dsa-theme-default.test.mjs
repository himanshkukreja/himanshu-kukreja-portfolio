/**
 * DSA Mastery's theme default and its separate choice (src/lib/learn/readingModes.ts): dark until picked on /dsa, SDM
 * keeps Light, a pick on one course never moves the other, the pre-paint script agrees.
 *   node --test scripts/tests/dsa-theme-default.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { register } from "node:module";

const SRC = new URL("../../src/", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`const SRC = ${JSON.stringify(SRC)};
export async function resolve(s, c, next) {
  if (s.startsWith("@/")) s = SRC + s.slice(2);
  try { return await next(s, c); } catch (e) { if ((s.startsWith(".") || s.startsWith("file:")) && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; }
}`),
);
const m = await import("../../src/lib/learn/readingModes.ts");
const { resolveEditorPalette } = await import("../../src/lib/editor/themes.ts");
const S = (o = {}) => m.cleanReading(o);

test("no choice: DSA is Night, SDM is Light", () => {
  assert.equal(m.effectiveTheme(S(), true, false), "night");
  assert.equal(m.effectiveTheme(S(), false, false), "light");
  assert.equal(m.pageIsDark(true, S(), false, true), true);
  assert.equal(m.pageIsDark(true, S(), false, false), false);
});

test("the old light / dark switch only decides SDM's never-picked theme", () => {
  assert.equal(m.effectiveTheme(S(), false, true), "night");
  assert.equal(m.effectiveTheme(S(), true, false), "night");
});

test("a pick on one course never moves the other", () => {
  const dsaSepia = S({ ...m.modePatch("sepia", true) });
  assert.equal(m.effectiveTheme(dsaSepia, true, false), "sepia");
  assert.equal(m.effectiveTheme(dsaSepia, false, false), "light");
  const sdmNight = S({ ...m.modePatch("night", false) });
  assert.equal(m.effectiveTheme(sdmNight, false, false), "night");
  const both = S({ mode: "paper", dsaMode: "light" });
  assert.equal(m.effectiveTheme(both, true, false), "light");
  assert.equal(m.effectiveTheme(both, false, true), "paper");
});

test("storage: dsaMode survives clean, an old blob gets the default, junk is ignored", () => {
  assert.equal(S({ mode: "sepia" }).dsaMode, "site");
  assert.equal(S({ mode: "sepia" }).mode, "sepia");
  assert.equal(S({ dsaMode: "nope" }).dsaMode, "site");
  assert.equal(S({ dsaMode: "mint" }).dsaMode, "mint");
  assert.equal(m.sameReading(S({ dsaMode: "mint" }), S()), false);
});

test("DSA pages are told apart from SDM's", () => {
  for (const p of ["/dsa", "/dsa/", "/dsa/problems/two-sum", "/dsa/playground?x=1"]) assert.equal(m.isDsaPage(p), true, p);
  for (const p of ["/", "/learn", "/dsas", "/week-1/intro", "/notebook"]) assert.equal(m.isDsaPage(p), false, p);
});

test("Match site theme follows the course's effective theme", () => {
  const dark = resolveEditorPalette("site", m.effectiveTheme(S(), true, false), false);
  assert.equal(dark.dark, true);
  const sdm = resolveEditorPalette("site", m.effectiveTheme(S(), false, false), false);
  assert.equal(sdm.dark, false);
  const sepia = resolveEditorPalette("site", m.effectiveTheme(S({ dsaMode: "sepia" }), true, false), false);
  assert.equal(sepia.dark, false);
});

// run the real pre-paint script against a fake page
function paint(path, look, host = "systemdesignmastery.dev") {
  const attrs = {};
  const classes = new Set();
  const metas = [{ v: "#F5F4F0", setAttribute(_, x) { this.v = x; } }];
  const root = { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, setAttribute: (k, v) => (attrs[k] = v), removeAttribute: (k) => delete attrs[k], style: { setProperty() {} } };
  const store = look ? { "hk.reader.look": JSON.stringify(look) } : {};
  const ctx = {
    document: { documentElement: root, cookie: "", querySelectorAll: () => metas, addEventListener() {} },
    window: { localStorage: { getItem: (k) => store[k] ?? null } },
    location: { pathname: path, host },
  };
  vm.runInNewContext(m.READING_JS, ctx);
  return { dark: classes.has("dark"), mode: attrs["data-read-mode"], course: attrs["data-course"], chrome: metas[0].v };
}

test("pre-paint script: new visitor", () => {
  const dsa = paint("/dsa", null);
  assert.deepEqual([dsa.dark, dsa.mode, dsa.course, dsa.chrome], [true, "night", "dsa", "#000000"]);
  const sdm = paint("/week-1/intro", null);
  assert.deepEqual([sdm.dark, sdm.mode, sdm.course], [false, "light", undefined]);
});

test("pre-paint script: separate picks", () => {
  const look = { mode: "light", dsaMode: "sepia" };
  assert.equal(paint("/dsa/problems/x", look).mode, "sepia");
  assert.equal(paint("/", look).mode, "light");
  assert.equal(paint("/dsa", { mode: "night" }).mode, "night");
  assert.equal(paint("/", { dsaMode: "night" }).mode, "light");
  assert.equal(paint("/", { dsaMode: "night" }).dark, false);
});

test("pre-paint script: the portfolio host is untouched", () => {
  const r = paint("/dsa", null, "himanshukukreja.in");
  assert.equal(r.mode, undefined);
  assert.equal(r.dark, false);
});
