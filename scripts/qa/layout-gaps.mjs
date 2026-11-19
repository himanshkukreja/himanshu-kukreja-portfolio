#!/usr/bin/env node
/**
 * DSA layout gap check: finds big empty blocks and sideways scroll on every DSA page.
 *
 *   node scripts/qa/layout-gaps.mjs [--base http://localhost:3410] [--out DIR] [--widths 1024,1280,...]
 *                                   [--states guest,signed-in] [--pages home-map,lesson-structure,...] [--shots all]
 *                                   [--tag after] [--gap 160]
 *
 * For every page x width x state it loads the page, scrolls it top to bottom (so lazy parts mount), then measures:
 *   (the home map is measured with Arrays selected: a 7-lesson station card)
 *   1. Columns: inside one parent, blocks that sit side by side (their x ranges do not overlap) and whose vertical ranges
 *      overlap are columns. A column whose bottom is more than --gap px (default 160) above a sibling column's bottom is a
 *      gap (the owner's "huge empty block"). Sticky columns (asides built to stay in view) are ignored, as are columns
 *      shorter than 120 px (labels, buttons) and fixed/absolute elements. A grid of uniform cards (heights within 1.6x) with a
 *      partly filled last row is a normal grid and is not reported.
 *   2. Horizontal overflow: the page is wider than the window, or an element sticks out past the right edge.
 *   3. Pixels (catches empty space INSIDE a box, which comparing box bottoms cannot see, e.g. a map floating in a tall
 *      frame): a screenshot of the page (first 9000 px) is scanned for rows that are pure page background across a
 *      column's width (every detected column except sticky asides, plus the full content width). A run of such rows longer than --gap px
 *      fails. Runs touching the end of the content (after the last card) are ignored, so are rows that differ only by a
 *      few levels (shadows, borders). Failing runs are outlined in blue in the screenshot.
 * Output: a table, results.json, and a screenshot (failing columns outlined in red) per failure in --out
 * (default ~/Downloads/dsa-redesign/gaps). `--shots all` also saves every screenshot (named <tag>-<page>-<state>-<width>.png).
 * Exit code 1 when anything fails.
 *
 * Signed-in-like state: agents cannot mint real sessions, so the check uses a DEV-ONLY fixture (src/lib/dsa/qa-fixture.ts):
 * `?qa=signed-in` (kept for the tab in sessionStorage) makes AuthProvider hand out a fake learner and answers the readiness
 * and tutor-memory reads with fake data, and this script seeds localStorage with progress (lessons and problems done) so the
 * left-off, Today, tutor, readiness and quick-review cards all render at real size. The fixture is inert when
 * NODE_ENV === "production", so against staging or production only the guest state runs (the signed-in state is skipped).
 *
 * The dev server is slow under load; for a fast run build locally with the fixture on (never in CI or on staging):
 *   NEXT_PUBLIC_QA_FIXTURE=1 HOST_OVERRIDE=course NEXT_PUBLIC_DSA_MODE=full ... npx next build && npx next start -p 3410
 * GAP_DEBUG=1 also writes the scanned screenshot of every check.
 *
 * Needs puppeteer-core (from ~/.cache/hk-render/deps) and Google Chrome; the dev server from the session handoff
 * (HOST_OVERRIDE=course NEXT_PUBLIC_DSA_MODE=full ... npx next dev -p 3410) or a local `next build && next start`.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { signIn } from "./signin.mjs";

const require = createRequire(path.join(homedir(), ".cache/hk-render/deps/package.json"));
const puppeteer = require("puppeteer-core");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3410").replace(/\/$/, "");
const OUT = arg("out", path.join(homedir(), "Downloads/dsa-redesign/gaps"));
const WIDTHS = arg("widths", "1024,1280,1440,1512,1728,1920,2560").split(",").map(Number);
const STATES = arg("states", "guest,signed-in").split(",");
const ONLY = arg("pages", "").split(",").filter(Boolean);
const SHOTS = arg("shots", "fails");
const TAG = arg("tag", "");
const GAP = Number(arg("gap", "180"));
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------ pages */
async function discover() {
  let html = "";
  for (let i = 0; i < 6 && !html; i++) {
    try {
      html = await (await fetch(`${BASE}/dsa`, { signal: AbortSignal.timeout(280000) })).text();
    } catch (e) {
      console.log(`  (waiting for ${BASE}: ${e.cause?.code || e.message})`);
    }
  }
  const pick = (re) => [...new Set([...html.matchAll(re)].map((m) => m[1]))];
  const structures = pick(/\/dsa\/structures\/([a-z0-9-]+)/g);
  const algorithms = pick(/\/dsa\/algorithms\/([a-z0-9-]+)/g);
  const concepts = pick(/\/dsa\/concepts\/([a-z0-9-]+)/g);
  const problems = pick(/\\?"problems\\?":\[\{\\?"id\\?":\\?"([a-z0-9-]+)\\?"/g).concat(pick(/\/dsa\/problems\/([a-z0-9-]+)/g));
  // lean lessons beyond the Academy (streets, camp tents, sets): /dsa/<districts|camps|sets>/<module>/<lesson>
  const lean = [...new Set([...html.matchAll(/\/dsa\/(districts|camps|sets)\/([a-z0-9-]+)\/([a-z0-9-]+)/g)].map((m) => m[0]))];
  const conceptIds = pick(/conceptId\\?":\\?"([a-z0-9-]+)\\?"/g);
  let cheat = "";
  try {
    const h = await (await fetch(`${BASE}/dsa/cheatsheets`)).text();
    cheat = (h.match(/href="\/dsa\/cheatsheets\/([a-z0-9-]+)"/) || [])[1] || "";
  } catch {}
  return { structures, algorithms, concepts, problems, conceptIds, cheat, lean };
}

function pagesOf(d) {
  const p = [
    { id: "home-map", url: "/dsa", prefs: { "dsa:home-view:v1": "map" }, pin: "Arrays" },
    { id: "home-list", url: "/dsa", prefs: { "dsa:home-view:v1": "list" } },
  ];
  if (d.structures[0]) p.push({ id: "lesson-structure", url: `/dsa/structures/${d.structures[0]}` });
  if (d.algorithms[0]) p.push({ id: "lesson-algorithm", url: `/dsa/algorithms/${d.algorithms[0]}` });
  const concept = d.concepts[0] || d.conceptIds.find((c) => !d.structures.includes(c) && !d.algorithms.includes(c));
  if (concept) p.push({ id: "lesson-concept", url: `/dsa/concepts/${concept}` });
  for (const root of ["districts", "camps", "sets"]) {
    const u = (d.lean || []).find((x) => x.startsWith(`/dsa/${root}/`));
    if (u) p.push({ id: `lean-${root}`, url: u });
  }
  // My lists: the hub and a list page, seeded through the game flags (pref:dsa-list:<id>) so a guest has two lists
  const seedLists = JSON.stringify({ xp: 0, done: {}, flags: { "pref:dsa-list:qaqa1234": { v: 1, id: "qaqa1234", name: "Google prep", desc: "Six weeks, mediums first", ids: ["sum-of-two-numbers", "read-until-the-end-of-input", "sum-of-many-lines-fast", "find-the-maximum-and-its-position", "stress-test-a-wrong-minimum", "handling-tle-with-a-faster-loop", "even-or-odd-steps", "count-the-digits", "parity-of-the-sum", "smallest-missing-positive-in-a-short-list", "reverse-and-compare", "palindromic-number-check", "count-the-letters-that-repeat", "sort-three-numbers"], createdAt: 1, updatedAt: 1 }, "pref:dsa-list:qaqb5678": { v: 1, id: "qaqb5678", name: "Weekend DP", desc: "", ids: [], createdAt: 2, updatedAt: 2 } } });
  p.push({ id: "practice-my-lists", url: "/dsa/practice?list=my-lists", prefs: { "hk.game.v1": seedLists } }, { id: "my-list", url: "/dsa/lists/qaqa1234", prefs: { "hk.game.v1": seedLists } });
  p.push({ id: "practice-camps", url: "/dsa/practice?list=cp-camps" }, { id: "practice-company", url: "/dsa/practice?list=company-types" });
  if (d.problems[0]) p.push({ id: "problem", url: `/dsa/problems/${d.problems[0]}` });
  p.push({ id: "practice", url: "/dsa/practice" }, { id: "search-results", url: "/dsa/practice?q=array" }, { id: "review", url: "/dsa/review" }, { id: "progress", url: "/dsa/progress" }, { id: "playground", url: "/dsa/playground" }, { id: "cheatsheets", url: "/dsa/cheatsheets" }, { id: "ai-tutor", url: "/dsa/ai-tutor" }, { id: "sdm-ai-tutor", url: "/ai-tutor" });
  if (d.cheat) p.push({ id: "cheatsheet", url: `/dsa/cheatsheets/${d.cheat}` });
  return ONLY.length ? p.filter((x) => ONLY.includes(x.id)) : p;
}

/* ------------------------------------------------------------ in-page measurement */
function measure(GAP) {
  const vw = window.innerWidth;
  const out = { overflow: null, gaps: [], regions: [] };
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) {
    const wide = [];
    for (const el of document.body.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > vw + 1) {
        let clipped = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const o = getComputedStyle(a);
          if (/(auto|scroll|hidden|clip)/.test(o.overflowX) || o.position === "fixed") { clipped = true; break; }
        }
        if (!clipped) wide.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 3).join(".") : ""} (right ${Math.round(r.right)})`);
      }
    }
    if (wide.length) out.overflow = { scrollWidth: sw, viewport: vw, culprits: wide.slice(0, 3) };
  }
  const sy = window.scrollY;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left + window.scrollX, r: r.right + window.scrollX, t: r.top + sy, b: r.bottom + sy };
  };
  const inFlow = (el) => {
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.position !== "fixed" && cs.position !== "absolute";
  };
  const hasSticky = (el, depth = 2) => {
    if (getComputedStyle(el).position === "sticky") return true;
    if (depth === 0) return false;
    for (const c of el.children) if (hasSticky(c, depth - 1)) return true;
    return false;
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;
  for (const parent of document.body.querySelectorAll("*")) {
    if (!inFlow(parent)) continue;
    const pr = parent.getBoundingClientRect();
    if (pr.width < 500) continue;
    const kids = [...parent.children].filter(inFlow).map((el) => ({ el, ...rect(el) })).filter((k) => k.r - k.l >= 140 && k.b - k.t >= 20);
    if (kids.length < 2) continue;
    // a uniform card grid (all cards about one height) whose last row is partly filled is a normal grid, not a gap
    if (kids.length >= 3 && getComputedStyle(parent).display === "grid" && !parent.hasAttribute("data-balanced")) {
      const hs = kids.map((k) => k.b - k.t);
      if (Math.max(...hs) / Math.min(...hs) <= 1.6) continue;
    }
    // cluster kids into columns by overlapping x range
    kids.sort((a, b) => a.l - b.l);
    const cols = [];
    for (const k of kids) {
      const c = cols.find((c) => Math.min(c.r, k.r) - Math.max(c.l, k.l) > 0.5 * Math.min(c.r - c.l, k.r - k.l));
      if (c) {
        c.kids.push(k);
        c.l = Math.min(c.l, k.l);
        c.r = Math.max(c.r, k.r);
        c.t = Math.min(c.t, k.t);
        c.b = Math.max(c.b, k.b);
      } else cols.push({ l: k.l, r: k.r, t: k.t, b: k.b, kids: [k] });
    }
    if (cols.length < 2) continue;
    for (const c of cols) out.regions.push({ l: c.l, r: c.r, t: c.t, b: Math.max(...cols.map((o) => o.b)), parent: label(parent), sticky: c.kids.some((k) => hasSticky(k.el)) });
    // a block that spans the other columns (full-width) means these are rows, not columns
    const live = cols.filter((c) => !c.kids.some((k) => hasSticky(k.el)) && c.b - c.t >= 120);
    if (live.length < 2) continue;
    const maxB = Math.max(...live.map((c) => c.b));
    for (const c of live) {
      const others = live.filter((o) => o !== c && Math.min(o.b, c.b) - Math.max(o.t, c.t) > 40);
      if (!others.length) continue;
      const ref = Math.max(...others.map((o) => o.b));
      if (ref - c.b > GAP) {
        out.gaps.push({ parent: label(parent), gap: Math.round(ref - c.b), top: Math.round(c.t), bottom: Math.round(c.b), refBottom: Math.round(ref), left: Math.round(c.l), width: Math.round(c.r - c.l), column: label(c.kids[c.kids.length - 1].el), columns: live.length });
      }
    }
  }
  // cards: rounded boxes with a visible surface; their interior is scanned for empty runs (scanCards)
  out.cards = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (!inFlow(el)) continue;
    const cs = getComputedStyle(el);
    const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(cs.backgroundColor);
    if (!m || (m[4] !== undefined && +m[4] < 0.5) || cs.backgroundImage !== "none") continue;
    if (parseFloat(cs.borderTopLeftRadius) < 6) continue;
    const r = rect(el);
    if (r.r - r.l < 200 || r.b - r.t < 140) continue;
    if (el.querySelector("img,video,canvas")) continue; // a poster or picture is flat by nature
    if (el.closest(".hk-gated")) continue; // the guest gate's peek region is clipped and faded by design; a full-page capture shows its tail as an empty box
    if (el.closest("figure.dsa-clip")) continue; // a lesson clip mounts its video only near the viewport; its 16:9 stage is empty until then, by design
    out.cards.push({ l: r.l, r: r.r, t: r.t, b: r.b, label: label(el) });
  }
  const main = document.querySelector("main") || document.body;
  const mr = rect(main);
  out.regions.push({ l: mr.l, r: mr.r, t: mr.t, b: mr.b, parent: "main (full width)", full: true });
  // keep the outermost report per area: drop a gap fully inside another gap's box
  out.gaps = out.gaps.filter((g, i) => !out.gaps.some((h, j) => j !== i && h.left <= g.left + 2 && h.left + h.width >= g.left + g.width - 2 && h.bottom >= g.bottom - 2 && h.top <= g.top + 2 && (h.refBottom - h.bottom > g.refBottom - g.bottom || (h.refBottom - h.bottom === g.refBottom - g.bottom && j < i))));
  return out;
}

/** in the page: rows of a screenshot that are pure page background across each region; returns runs longer than GAP */
async function scan(b64, regions, GAP, MAXY) {
  const img = new Image();
  img.src = "data:image/png;base64," + b64;
  await img.decode();
  const W = img.naturalWidth;
  const H = Math.min(img.naturalHeight, MAXY);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, W, H).data;
  // page background = the most common colour of the left gutter (x = 3)
  const counts = new Map();
  for (let y = 0; y < H; y += 3) {
    const i = (y * W + 3) * 4;
    const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const bgk = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = [(bgk >> 16) & 255, (bgk >> 8) & 255, bgk & 255];
  const TOL = 4;
  const isBg = (i) => Math.abs(data[i] - bg[0]) <= TOL && Math.abs(data[i + 1] - bg[1]) <= TOL && Math.abs(data[i + 2] - bg[2]) <= TOL;
  const rowBlank = (y, l, r) => {
    for (let x = l; x < r; x += 2) if (!isBg((y * W + x) * 4)) return false;
    return true;
  };
  const seen = new Set();
  const runs = [];
  for (const g of regions) {
    if (g.sticky) continue; // a sticky aside stays in view while the page scrolls: its trailing space is by design
    const l = Math.max(0, Math.round(g.l) + 3);
    const r = Math.min(W, Math.round(g.r) - 3);
    if (r - l < 100) continue;
    const key = `${l}-${r}-${Math.round(g.t)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const y0 = Math.max(0, Math.round(g.t));
    const y1 = Math.min(H, Math.round(g.b));
    let start = -1;
    let lastContent = y0;
    const found = [];
    for (let y = y0; y < y1; y++) {
      if (rowBlank(y, l, r)) {
        if (start < 0) start = y;
      } else {
        if (start >= 0 && y - start > GAP) found.push([start, y]);
        start = -1;
        lastContent = y;
      }
    }
    // a run reaching the end of the region is the space after the last content: ignored for the full width; for a column
    // it is the space under the column's last card (the box-bottom check owns that case, it is reported too)
    if (start >= 0 && !g.full && y1 - start > GAP && lastContent > y0) found.push([start, y1]);
    for (const [a, b] of found) runs.push({ left: l, width: r - l, top: a, height: b - a, parent: g.parent, full: !!g.full });
  }
  // one report per area: drop a run inside a bigger one
  return runs.filter((x, i) => !runs.some((y, j) => j !== i && y.left <= x.left + 2 && y.left + y.width >= x.left + x.width - 2 && y.top <= x.top + 2 && y.top + y.height >= x.top + x.height - 2 && (y.height > x.height || (y.height === x.height && j < i))));
}

/** in the page: runs over CARD_GAP px inside a card where every row is one flat colour across the card's whole width (the card's own surface) */
async function scanCards(b64, cards, CARD_GAP, MAXY) {
  const img = new Image();
  img.src = "data:image/png;base64," + b64;
  await img.decode();
  const W = img.naturalWidth;
  const H = Math.min(img.naturalHeight, MAXY);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, W, H).data;
  const runs = [];
  for (const c of cards) {
    const l = Math.max(0, Math.round(c.l) + 6);
    const r = Math.min(W, Math.round(c.r) - 6);
    const y0 = Math.max(0, Math.round(c.t) + 6);
    const y1 = Math.min(H, Math.round(c.b) - 6);
    if (r - l < 100 || y1 - y0 < CARD_GAP) continue;
    // the surface colour: the commonest colour down the card's left inside edge
    const counts = new Map();
    for (let y = y0; y < y1; y += 2) {
      const i = (y * W + l) * 4;
      const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (!counts.size) continue;
    const sk = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const sr = (sk >> 16) & 255, sg = (sk >> 8) & 255, sb = sk & 255;
    const flat = (y) => {
      for (let x = l; x < r; x += 2) {
        const i = (y * W + x) * 4;
        if (Math.abs(data[i] - sr) > 3 || Math.abs(data[i + 1] - sg) > 3 || Math.abs(data[i + 2] - sb) > 3) return false;
      }
      return true;
    };
    let start = -1;
    for (let y = y0; y <= y1; y++) {
      if (y < y1 && flat(y)) {
        if (start < 0) start = y;
      } else {
        if (start >= 0 && y - start > CARD_GAP) runs.push({ left: l, width: r - l, top: start, height: y - start, parent: "card " + c.label });
        start = -1;
      }
    }
  }
  return runs.filter((x, i) => !runs.some((y, j) => j !== i && y.left <= x.left + 2 && y.left + y.width >= x.left + x.width - 2 && y.top <= x.top + 2 && y.top + y.height >= x.top + x.height - 2 && (y.height > x.height || (y.height === x.height && j < i))));
}

/* ------------------------------------------------------------ run */
// a page that navigates under us (dev reload, redirect) detaches its frame: wait and retry
const retry = async (page, fn, ...args) => {
  for (let i = 0; ; i++) {
    try {
      return await page.evaluate(fn, ...args);
    } catch (e) {
      if (i >= 12 || !/detached|Execution context|navigat/i.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
};
const d = await discover();
const pages = pagesOf(d);
// off localhost the signed-in state is the real QA account (scripts/qa/signin.mjs); on localhost it is the dev-only fixture
const states = STATES;

const seedDone = () => {
  const done = {};
  const now = Date.now() - 3600_000;
  d.conceptIds.slice(0, 8).forEach((c, i) => (done[`dsa:c:${c}`] = now - i * 86400_000));
  d.conceptIds.slice(0, 8).forEach((c, i) => (done[`dsa:s:${c}/read`] = now - i * 86400_000));
  const nxt = d.conceptIds[8];
  if (nxt) done[`dsa:s:${nxt}/read`] = now;
  d.problems.slice(0, 12).forEach((p, i) => (done[`dsa:p:${p}`] = now - i * 3600_000));
  return done;
};

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", protocolTimeout: 600000, args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"] });
const results = [];
try {
  for (const pg of pages) {
    for (const state of states) {
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(240000);
      const signed = state === "signed-in";
      const errs = new Set();
      page.on("pageerror", (e) => errs.add(`pageerror: ${e.message.slice(0, 160)}`));
      page.on("console", (m) => m.type() === "error" && !/401|403|Failed to load resource|favicon/.test(m.text()) && errs.add(`console: ${m.text().slice(0, 160)}`));
      const game = signed && LOCAL ? { xp: 420, done: seedDone(), flags: { "pref:dsa-goal": { kind: "scratch" } } } : null;
      await page.evaluateOnNewDocument(
        (prefs, game, signed, local) => {
          try {
            localStorage.setItem("dsa:metro-tour:v1", "1");
            for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);
            if (game) localStorage.setItem("hk.game.v1", JSON.stringify(game));
            if (signed && local) sessionStorage.setItem("hk.qa.signedin", "1");
            else sessionStorage.removeItem("hk.qa.signedin");
            localStorage.setItem("hk.consent", "denied");
          } catch {}
        },
        { "dsa:home-view:v1": "map", ...(pg.prefs || {}) },
        game,
        signed,
        LOCAL,
      );
      if (signed && !LOCAL) await signIn(page, BASE);
      const url = `${BASE}${pg.url}${signed && LOCAL ? (pg.url.includes("?") ? "&" : "?") + "qa=signed-in" : ""}`;
      for (let w of WIDTHS) {
        try {
        await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
        if (w === WIDTHS[0]) {
          try {
            await page.goto(url, { waitUntil: "load", timeout: 240000 });
            await page.waitForNetworkIdle({ idleTime: 1200, timeout: 25000 }).catch(() => {});
            await new Promise((r) => setTimeout(r, 1500));
            // the home map: select a 7-lesson station (Arrays) so the station card shows a long lesson list
            if (pg.pin) await retry(page, (name) => [...document.querySelectorAll("button,a")].find((e) => (e.getAttribute("aria-label") || "").startsWith(name))?.click(), pg.pin);
          } catch (e) {
            console.log(`  ! ${pg.id} ${state}: ${e.message}`);
          }
        } else await new Promise((r) => setTimeout(r, 700));
        // scroll the whole page so lazy sections mount, then settle
        await retry(page, async () => {
          const h = () => document.documentElement.scrollHeight;
          for (let y = 0; y < h(); y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 1200));
        // wait until the layout stops moving (self-balancing flows re-place cards over a few frames)
        await retry(page, async () => {
          const sig = () => document.documentElement.scrollHeight + ":" + [...document.querySelectorAll("[data-balanced] > *, main > *")].map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.height)}`; }).join("|");
          let last = "";
          let same = 0;
          for (let i = 0; i < 40 && same < 4; i++) {
            await new Promise((r) => setTimeout(r, 250));
            const now = sig();
            same = now === last ? same + 1 : 0;
            last = now;
          }
        });
        const m = await retry(page, measure, GAP);
        const height = await retry(page, () => document.documentElement.scrollHeight);
        await retry(page, () => document.querySelectorAll("nextjs-portal, [data-nextjs-toast]").forEach((n) => (n.style.display = "none")));
        // a fade-in still running at the first screenshot reads as an empty area: a finding is confirmed with a second, later look
        let probe, blank;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 2500));
          probe = await page.screenshot(height <= 9000 ? { fullPage: true, encoding: "base64" } : { clip: { x: 0, y: 0, width: w, height: 9000 }, captureBeyondViewport: true, encoding: "base64" });
          if (process.env.GAP_DEBUG) writeFileSync(path.join(OUT, `probe-${pg.id}-${state}-${w}.png`), Buffer.from(probe, "base64"));
          blank = await retry(page, scan, probe, m.regions, GAP, 9000);
          blank.push(...(await retry(page, scanCards, probe, m.cards, 120, 9000)));
          if (!blank.length) break;
        }
        const fail = !!m.overflow || m.gaps.length > 0 || blank.length > 0;
        const rec = { page: pg.id, state, width: w, height, fail, overflow: m.overflow, gaps: m.gaps, blank };
        results.push(rec);
        const name = `${pg.id}-${state}-${w}.png`;
        if (fail || SHOTS === "all") {
          if (fail) {
            await page.evaluate((gaps, blank) => {
              for (const g of gaps) {
                const b = document.createElement("div");
                b.setAttribute("data-gap-mark", "1");
                b.style.cssText = `position:absolute;left:${g.left}px;top:${g.bottom}px;width:${g.width}px;height:${g.gap}px;outline:3px solid #e11d48;background:rgba(225,29,72,.12);z-index:99999;pointer-events:none`;
                document.body.appendChild(b);
              }
              for (const g of blank) {
                const b = document.createElement("div");
                b.setAttribute("data-gap-mark", "1");
                b.style.cssText = `position:absolute;left:${g.left}px;top:${g.top}px;width:${g.width}px;height:${g.height}px;outline:3px solid #2563eb;background:rgba(37,99,235,.12);z-index:99999;pointer-events:none`;
                document.body.appendChild(b);
              }
            }, m.gaps, blank);
          }
          try {
            await page.screenshot({ path: path.join(OUT, `${TAG ? TAG + "-" : fail ? "fail-" : ""}${name}`), fullPage: true });
          } catch (e) {
            console.log(`  ! screenshot ${name}: ${e.message}`);
          }
          await page.evaluate(() => document.querySelectorAll("[data-gap-mark]").forEach((n) => n.remove()));
        }
        console.log(`${fail ? "FAIL" : "ok  "} ${pg.id.padEnd(17)} ${state.padEnd(9)} ${String(w).padStart(4)}  h=${height}${m.gaps.map((g) => `  gap ${g.gap}px under ${g.column} (${g.parent})`).join("")}${blank.map((g) => `  blank ${g.height}px at y=${g.top} (${g.parent})`).join("")}${m.overflow ? `  overflow ${m.overflow.scrollWidth}>${m.overflow.viewport} ${m.overflow.culprits.join("; ")}` : ""}`);
        } catch (e) {
          results.push({ page: pg.id, state, width: w, fail: true, error: e.message.slice(0, 120), overflow: null, gaps: [] });
          console.log(`FAIL ${pg.id.padEnd(17)} ${state.padEnd(9)} ${String(w).padStart(4)}  could not measure: ${e.message.slice(0, 100)}`);
        }
      }
      for (const e of errs) console.log(`  note (${pg.id} ${state}): ${e}`);
      await page.close().catch(() => {});
    }
  }
} finally {
  await browser.close();
}

writeFileSync(path.join(OUT, `results${TAG ? "-" + TAG : ""}.json`), JSON.stringify(results, null, 1));
console.log("\npage              state      " + WIDTHS.join("  ") + "   (. clean, X fail)");
for (const pg of pages)
  for (const state of states) {
    const row = WIDTHS.map((w) => (results.find((r) => r.page === pg.id && r.state === state && r.width === w)?.fail ? "X".padStart(String(w).length) : ".".padStart(String(w).length)));
    console.log(`${pg.id.padEnd(17)} ${state.padEnd(9)}  ${row.join("  ")}`);
  }
const bad = results.filter((r) => r.fail);
console.log(`\n${results.length} checks, ${bad.length} failing`);
process.exit(bad.length ? 1 : 0);
