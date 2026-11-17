#!/usr/bin/env node
/**
 * DSA layout gap check: finds big empty blocks and sideways scroll on every DSA page.
 *
 *   node scripts/qa/layout-gaps.mjs [--base http://localhost:3410] [--out DIR] [--widths 1024,1280,...]
 *                                   [--states guest,signed-in] [--pages home-map,lesson-structure,...] [--shots all]
 *                                   [--tag after] [--gap 160]
 *
 * For every page x width x state it loads the page, scrolls it top to bottom (so lazy parts mount), then measures:
 *   1. Columns: inside one parent, blocks that sit side by side (their x ranges do not overlap) and whose vertical ranges
 *      overlap are columns. A column whose bottom is more than --gap px (default 160) above a sibling column's bottom is a
 *      gap (the owner's "huge empty block"). Sticky columns (asides built to stay in view) are ignored, as are columns
 *      shorter than 120 px (labels, buttons) and fixed/absolute elements. A grid of uniform cards (heights within 1.6x) with a
 *      partly filled last row is a normal grid and is not reported.
 *   2. Horizontal overflow: the page is wider than the window, or an element sticks out past the right edge.
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
 * Needs puppeteer-core (from ~/.cache/hk-render/deps) and Google Chrome; the dev server from the session handoff
 * (HOST_OVERRIDE=course NEXT_PUBLIC_DSA_MODE=full ... npx next dev -p 3410) or a local `next build && next start`.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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
const GAP = Number(arg("gap", "160"));
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------ pages */
async function discover() {
  const html = await (await fetch(`${BASE}/dsa`)).text();
  const pick = (re) => [...new Set([...html.matchAll(re)].map((m) => m[1]))];
  const structures = pick(/\/dsa\/structures\/([a-z0-9-]+)/g);
  const algorithms = pick(/\/dsa\/algorithms\/([a-z0-9-]+)/g);
  const concepts = pick(/\/dsa\/concepts\/([a-z0-9-]+)/g);
  const problems = pick(/\\?"problems\\?":\[\{\\?"id\\?":\\?"([a-z0-9-]+)\\?"/g).concat(pick(/\/dsa\/problems\/([a-z0-9-]+)/g));
  const conceptIds = pick(/conceptId\\?":\\?"([a-z0-9-]+)\\?"/g);
  let cheat = "";
  try {
    const h = await (await fetch(`${BASE}/dsa/cheatsheets`)).text();
    cheat = (h.match(/href="\/dsa\/cheatsheets\/([a-z0-9-]+)"/) || [])[1] || "";
  } catch {}
  return { structures, algorithms, concepts, problems, conceptIds, cheat };
}

function pagesOf(d) {
  const p = [
    { id: "home-map", url: "/dsa", prefs: { "dsa:home-view:v1": "map" } },
    { id: "home-list", url: "/dsa", prefs: { "dsa:home-view:v1": "list" } },
  ];
  if (d.structures[0]) p.push({ id: "lesson-structure", url: `/dsa/structures/${d.structures[0]}` });
  if (d.algorithms[0]) p.push({ id: "lesson-algorithm", url: `/dsa/algorithms/${d.algorithms[0]}` });
  const concept = d.concepts[0] || d.conceptIds.find((c) => !d.structures.includes(c) && !d.algorithms.includes(c));
  if (concept) p.push({ id: "lesson-concept", url: `/dsa/concepts/${concept}` });
  if (d.problems[0]) p.push({ id: "problem", url: `/dsa/problems/${d.problems[0]}` });
  p.push({ id: "practice", url: "/dsa/practice" }, { id: "search-results", url: "/dsa/practice?q=array" }, { id: "review", url: "/dsa/review" }, { id: "progress", url: "/dsa/progress" }, { id: "playground", url: "/dsa/playground" }, { id: "cheatsheets", url: "/dsa/cheatsheets" });
  if (d.cheat) p.push({ id: "cheatsheet", url: `/dsa/cheatsheets/${d.cheat}` });
  return ONLY.length ? p.filter((x) => ONLY.includes(x.id)) : p;
}

/* ------------------------------------------------------------ in-page measurement */
function measure(GAP) {
  const vw = window.innerWidth;
  const out = { overflow: null, gaps: [] };
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
  // keep the outermost report per area: drop a gap fully inside another gap's box
  out.gaps = out.gaps.filter((g, i) => !out.gaps.some((h, j) => j !== i && h.left <= g.left + 2 && h.left + h.width >= g.left + g.width - 2 && h.bottom >= g.bottom - 2 && h.top <= g.top + 2 && (h.refBottom - h.bottom > g.refBottom - g.bottom || (h.refBottom - h.bottom === g.refBottom - g.bottom && j < i))));
  return out;
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
const states = STATES.filter((s) => (s === "signed-in" ? LOCAL : true));
if (!LOCAL && STATES.includes("signed-in")) console.log("note: signed-in-like state skipped (the fixture is dev-only; base is not localhost)");

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
      const game = signed ? { xp: 420, done: seedDone(), flags: { "pref:dsa-goal": { kind: "scratch" } } } : null;
      await page.evaluateOnNewDocument(
        (prefs, game, signed) => {
          try {
            localStorage.setItem("dsa:metro-tour:v1", "1");
            for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);
            if (game) localStorage.setItem("hk.game.v1", JSON.stringify(game));
            if (signed) sessionStorage.setItem("hk.qa.signedin", "1");
            else sessionStorage.removeItem("hk.qa.signedin");
            localStorage.setItem("hk.consent", "denied");
          } catch {}
        },
        { "dsa:home-view:v1": "map", ...(pg.prefs || {}) },
        game,
        signed,
      );
      const url = `${BASE}${pg.url}${signed ? (pg.url.includes("?") ? "&" : "?") + "qa=signed-in" : ""}`;
      for (let w of WIDTHS) {
        try {
        await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
        if (w === WIDTHS[0]) {
          try {
            await page.goto(url, { waitUntil: "load", timeout: 240000 });
            await page.waitForNetworkIdle({ idleTime: 1200, timeout: 25000 }).catch(() => {});
            await new Promise((r) => setTimeout(r, 1500));
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
        const m = await retry(page, measure, GAP);
        const height = await retry(page, () => document.documentElement.scrollHeight);
        const fail = !!m.overflow || m.gaps.length > 0;
        const rec = { page: pg.id, state, width: w, height, fail, overflow: m.overflow, gaps: m.gaps };
        results.push(rec);
        const name = `${pg.id}-${state}-${w}.png`;
        if (fail || SHOTS === "all") {
          if (fail) {
            await page.evaluate((gaps) => {
              for (const g of gaps) {
                const b = document.createElement("div");
                b.setAttribute("data-gap-mark", "1");
                b.style.cssText = `position:absolute;left:${g.left}px;top:${g.bottom}px;width:${g.width}px;height:${g.gap}px;outline:3px solid #e11d48;background:rgba(225,29,72,.12);z-index:99999;pointer-events:none`;
                document.body.appendChild(b);
              }
            }, m.gaps);
          }
          try {
            await page.screenshot({ path: path.join(OUT, `${TAG ? TAG + "-" : fail ? "fail-" : ""}${name}`), fullPage: true });
          } catch (e) {
            console.log(`  ! screenshot ${name}: ${e.message}`);
          }
          await page.evaluate(() => document.querySelectorAll("[data-gap-mark]").forEach((n) => n.remove()));
        }
        console.log(`${fail ? "FAIL" : "ok  "} ${pg.id.padEnd(17)} ${state.padEnd(9)} ${String(w).padStart(4)}  h=${height}${m.gaps.map((g) => `  gap ${g.gap}px under ${g.column} (${g.parent})`).join("")}${m.overflow ? `  overflow ${m.overflow.scrollWidth}>${m.overflow.viewport} ${m.overflow.culprits.join("; ")}` : ""}`);
        } catch (e) {
          results.push({ page: pg.id, state, width: w, fail: true, error: e.message.slice(0, 120), overflow: null, gaps: [] });
          console.log(`FAIL ${pg.id.padEnd(17)} ${state.padEnd(9)} ${String(w).padStart(4)}  could not measure: ${e.message.slice(0, 100)}`);
        }
      }
      for (const e of errs) console.log(`  note (${pg.id} ${state}): ${e}`);
      await page.close();
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
