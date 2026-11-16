/**
 * The sign-in gate's pure parts (16 Nov 2026): where gateHtml (src/lib/gate/split.ts) cuts a rendered article, that it
 * only adds classes (the full text stays in the HTML), that it leaves short or unreadable pages whole, and the
 * before-paint guess and course detection in src/lib/gate/flag.ts.
 *   node --test scripts/tests/signin-gate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { gateHtml, GATED_CLASS, PEEK_CLASS } from "../../src/lib/gate/split.ts";
import { GATE_JS, GUEST_CLASS, gateCourse, LECTURE_FREE_S } from "../../src/lib/gate/flag.ts";

const words = (n, w = "lorem") => Array.from({ length: n }, (_, i) => `${w}${i}`).join(" ");
const strip = (html) => html.replace(/ ?hk-gated| ?hk-gate-peek/g, "").replace(/ class=""/g, "");
const textOf = (html) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, "");
const stage = (id, body) => `<section data-sd="stage" id="${id}" class="sd-stage"><header class="sd-stage-head"><p data-sd-chrome="">${id}</p></header>${body}</section>`;
const para = (n, w) => `<p>${words(n, w)}</p>`;

/** share of the text before the first gated element */
function openShare(html) {
  const at = html.search(/<[^>]*hk-gated/);
  return textOf(html.slice(0, at)).length / textOf(html).length;
}

test("a lesson of stages: cut at a stage boundary near 25-40%, the next stage is the peek", () => {
  const html = `<div class="sd-body">${["intro", "s1", "s2", "s3", "s4", "s5", "s6", "s7"].map((id) => stage(id, para(60, id) + para(60, id))).join("")}</div>`;
  const r = gateHtml(html);
  assert.equal(r.gated, true);
  assert.ok(r.open >= 0.24 && r.open <= 0.45, `open ${r.open}`);
  // only classes were added: the text is all still there
  assert.equal(strip(r.html), html);
  assert.equal(textOf(r.html), textOf(html));
  assert.equal((r.html.match(new RegExp(PEEK_CLASS, "g")) || []).length, 1);
  // the peek is a whole stage, the first gated one
  assert.match(r.html, new RegExp(`<section[^>]*class="sd-stage ${GATED_CLASS} ${PEEK_CLASS}"`));
  assert.ok(Math.abs(openShare(r.html) - r.open) < 0.05);
});

test("the hook and the first section stay open when they fit under 45%", () => {
  // intro 5%, first section 35%: the cut comes after both even though 25% falls inside the first section
  const html = `<div class="sd-body">${stage("intro", para(30, "i"))}${stage("s1", para(210, "a"))}${["s2", "s3", "s4", "s5"].map((id) => stage(id, para(90, id))).join("")}</div>`;
  const r = gateHtml(html);
  assert.equal(r.gated, true);
  assert.ok(r.html.indexOf(GATED_CLASS) > r.html.indexOf('id="s2"') - 80, "s1 stays whole");
  assert.match(r.html, /id="s2" class="sd-stage hk-gated hk-gate-peek"/);
});

test("one huge stage: the cut goes inside it, between paragraphs, and the later stages are gated too", () => {
  const big = Array.from({ length: 20 }, (_, i) => para(40, `b${i}`)).join("");
  const html = `<div class="sd-body">${stage("intro", para(10, "i"))}${stage("s1", big)}${stage("s2", para(40, "z"))}</div>`;
  const r = gateHtml(html);
  assert.equal(r.gated, true);
  assert.ok(r.open >= 0.2 && r.open <= 0.42, `open ${r.open}`);
  // the stage that holds the cut is not itself gated (its first part shows)
  assert.doesNotMatch(r.html, /id="s1" class="sd-stage hk-gated/);
  assert.match(r.html, /<p class="hk-gated hk-gate-peek">/);
  assert.match(r.html, /id="s2" class="sd-stage hk-gated"/);
  assert.equal(strip(r.html), html);
});

test("a flat article (war story): paragraphs; a short heading at the cut stays open, the peek is real text", () => {
  const blocks = [];
  for (let i = 0; i < 12; i++) blocks.push(i === 3 ? `<h2 id="h">A short heading</h2>` : para(60, `p${i}`));
  const html = blocks.join("\n");
  const r = gateHtml(html);
  assert.equal(r.gated, true);
  const peek = r.html.slice(r.html.indexOf(PEEK_CLASS) - 20, r.html.indexOf(PEEK_CLASS) + 40);
  assert.match(peek, /<p class="hk-gated hk-gate-peek">/);
  assert.doesNotMatch(r.html, /<h2[^>]*hk-gated/);
});

test("existing class attributes are extended, not duplicated; void elements and SVG are fine", () => {
  const html = `<div>${para(80, "a")}<figure class="sd-art" data-x='a>b'><img src="x.png" alt=""><svg viewBox="0 0 1 1"><path d="M0 0"/></svg><figcaption>${words(40, "c")}</figcaption></figure>${para(80, "b")}<hr>${para(80, "d")}${para(80, "e")}</div>`;
  const r = gateHtml(html, { minChars: 100 });
  assert.equal(r.gated, true);
  assert.equal(strip(r.html), html);
  assert.ok(!/class="[^"]*class=/.test(r.html));
});

test("short pages, empty input and unbalanced HTML stay whole", () => {
  assert.equal(gateHtml("").gated, false);
  const short = `${para(20, "a")}${para(20, "b")}`;
  assert.deepEqual(gateHtml(short), { html: short, gated: false, open: 1 });
  const broken = `<div>${para(200, "a")}<p>${words(200, "b")}</div></span>${para(200, "c")}`;
  const r = gateHtml(broken);
  assert.equal(r.gated, false);
  assert.equal(r.html, broken);
});

test("comments, scripts and entities don't count as text and don't confuse the cut", () => {
  const html = `<div class="sd-body"><!-- a comment with <p> inside --><script>var x = "</p>";</script>${Array.from({ length: 8 }, (_, i) => `<p>${words(80, `w${i}`)} &amp; &lt;tag&gt;</p>`).join("")}</div>`;
  const r = gateHtml(html);
  assert.equal(r.gated, true);
  assert.equal(strip(r.html), html);
  assert.doesNotMatch(r.html, /<script[^>]*hk-gated/);
  // nor one after the cut
  const tail = `<div class="sd-body">${Array.from({ length: 8 }, (_, i) => `<p>${words(80, `w${i}`)}</p>`).join("")}<script>window.x = 1</script></div>`;
  assert.doesNotMatch(gateHtml(tail).html, /<script[^>]*hk-gated/);
});

/* ------------------------------------------------------------------ the before-paint guess */

function runGateJs(store) {
  const classes = new Set();
  const keys = Object.keys(store);
  const ctx = {
    document: { documentElement: { classList: { add: (c) => classes.add(c) } } },
    localStorage: { length: keys.length, key: (i) => keys[i] ?? null, getItem: (k) => store[k] ?? null },
  };
  vm.runInNewContext(GATE_JS, ctx);
  return classes.has(GUEST_CLASS);
}

test("GATE_JS: guest without a stored session, member with one", () => {
  assert.equal(runGateJs({}), true);
  assert.equal(runGateJs({ "analytics_visitor_id": "x" }), true);
  assert.equal(runGateJs({ "sb-abcd-auth-token": JSON.stringify({ access_token: "t", refresh_token: "r" }) }), false);
  // an emptied entry is not a session
  assert.equal(runGateJs({ "sb-abcd-auth-token": "null" }), true);
});

test("GATE_JS: storage that throws counts as a guest", () => {
  const classes = new Set();
  vm.runInNewContext(GATE_JS, {
    document: { documentElement: { classList: { add: (c) => classes.add(c) } } },
    get localStorage() {
      throw new Error("blocked");
    },
  });
  assert.ok(classes.has(GUEST_CLASS));
});

test("gateCourse and the lecture window", () => {
  assert.equal(gateCourse("/dsa/problems/two-sum"), "dsa");
  assert.equal(gateCourse("/learn/dsa/concepts/arrays"), "dsa");
  assert.equal(gateCourse("/dsa"), "dsa");
  assert.equal(gateCourse("/week-01-data-at-scale/day-01"), "sdm");
  assert.equal(gateCourse("/dsalike"), "sdm");
  assert.equal(LECTURE_FREE_S, 75);
});
