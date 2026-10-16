#!/usr/bin/env node
/**
 * Screenshots for the course guide (/learn/guide).
 *
 *   npm run dev -- -p 3110          # any running dev or prod server of this repo
 *   npm run guide:shots              # every shot
 *   npm run guide:shots -- hub-hero lesson-top   # only these ids (the rest of shots.json is kept)
 *
 * Env: GUIDE_BASE_URL (default http://localhost:3110), PLAYWRIGHT_MODULE (path to playwright when it
 * isn't installed in this repo). Reads NEXT_PUBLIC_SUPABASE_URL and SDM_LOCAL_DIR from .env/.env.local.
 *
 * Every context seeds realistic learner state into localStorage (scripts/guide/seed.mjs), sets
 * hk.notrack=1, blocks analytics and refuses every write (scripts/guide/mock.mjs), uses the LIGHT
 * theme, and saves WebP files + public/guide/shots.json (image sizes, numbered callout positions in
 * % of the image, legend text, alt text). The guide page overlays the callouts from that JSON.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { buildSeed, readTrialQuestions, COURSE, W00, W01, LESSONS, STORY } from "./seed.mjs";
import { installRoutes, sessionStorageEntry, DEMO_USER } from "./mock.mjs";
import { exampleBoard } from "./board.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "public/guide");
const MANIFEST = path.join(OUT, "shots.json");
const BASE = (process.env.GUIDE_BASE_URL || "http://localhost:3110").replace(/\/$/, "");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("-"));

function readEnv() {
  const env = {};
  for (const f of [".env", ".env.local"]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...env, ...process.env };
}

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", path.join(process.env.HOME || "", ".npm/_npx/705bc6b22212b352/node_modules/playwright")].filter(Boolean);
  const req = createRequire(import.meta.url);
  for (const c of candidates) {
    try {
      return req(c);
    } catch {
      // next
    }
  }
  throw new Error("Playwright not found: npm i -D playwright, or set PLAYWRIGHT_MODULE=/path/to/node_modules/playwright");
}

const env = readEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SDM_DIR = env.SDM_LOCAL_DIR;
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
if (!SDM_DIR) throw new Error("SDM_LOCAL_DIR missing (the course checkout)");

const { chromium, devices } = await loadPlaywright();
const sharp = (await import(pathToFileURL(createRequire(path.join(ROOT, "package.json")).resolve("sharp")).href)).default;

const CSS = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }
  ::-webkit-scrollbar { display: none; }
  /* XP toasts (src/game/XPToaster.tsx) would land on top of whatever is being shown */
  div[aria-live="polite"].fixed.right-4 { display: none !important; }
`;

const LESSON = (week, slug) => `/learn/${COURSE}/${week}/${slug}`;

/* ------------------------------------------------------------------ contexts */

let browser;
const questions = readTrialQuestions(SDM_DIR);
let stages = {};

async function makeContext({ phone = false, signedIn = false, seed = true, fixtures = {} } = {}) {
  const device = phone ? { ...devices["iPhone 13"], deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
  const ctx = await browser.newContext({ ...device, colorScheme: "light", locale: "en-IN", timezoneId: "Asia/Kolkata" });
  const sess = signedIn ? sessionStorageEntry(SUPABASE_URL) : null;
  const s = seed ? buildSeed({ stages, questions, userId: signedIn ? DEMO_USER.id : null }) : { store: { "hk.notrack": "1", theme: "light", "sd:coach:select": "1" } };
  const store = { ...s.store };
  if (sess) store[sess.key] = sess.value;
  await ctx.addInitScript(
    ({ store, css }) => {
      try {
        for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v);
      } catch {}
      const add = () => {
        const st = document.createElement("style");
        st.textContent = css;
        document.head.appendChild(st);
      };
      if (document.head) add();
      else document.addEventListener("DOMContentLoaded", add);
    },
    { store, css: CSS },
  );
  const profile = {
    id: DEMO_USER.id,
    full_name: DEMO_USER.name,
    avatar_url: null,
    bio: null,
    learning_goal: null,
    experience_level: "intermediate",
    created_at: "2026-09-20T10:00:00Z",
    updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    profile_visibility: "public",
    total_lessons_completed: 3,
    total_time_spent: 0,
    current_streak: 2,
    longest_streak: 4,
  };
  ctx.__seeded = seed;
  await installRoutes(ctx, { supabaseUrl: SUPABASE_URL, signedIn, fixtures, profile, user: sess?.user, game: s.game, board: (p, si) => exampleBoard(p, si) });
  return ctx;
}

async function open(ctx, url, waitFor) {
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 180_000 }).catch(() => undefined);
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 60_000 }).catch(() => console.warn(`  ! ${waitFor} not found on ${url}`));
  // hydrated: the level chip shows the seeded level (L4 for the persona) instead of the SSR default L1
  if (ctx.__seeded) await page.waitForFunction(() => /L[2-6]/.test(document.querySelector("button[data-quest-toggle]")?.textContent || ""), null, { timeout: 30_000 }).catch(() => console.warn(`  ! ${url} did not hydrate`));
  await page.waitForTimeout(1200);
  return page;
}

/* ------------------------------------------------------------------ capture */

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};

/**
 * Viewport rect of a target: a CSS selector (first VISIBLE match), a Playwright locator, or a
 * function (page) => locator. Optional `text` narrows a selector to elements containing it.
 */
async function rectOf(page, sel, text, within) {
  const inside = (b) => !within || (b.x < within.x + within.width && b.x + b.width > within.x && b.y < within.y + within.height && b.y + b.height > within.y);
  if (typeof sel === "function") sel = sel(page);
  if (sel && typeof sel === "object" && typeof sel.boundingBox === "function") {
    const n = await sel.count().catch(() => 0);
    let first = null;
    for (let i = 0; i < n; i++) {
      const b = await sel.nth(i).boundingBox().catch(() => null);
      if (!b || b.width <= 0 || b.height <= 0) continue;
      if (inside(b)) return b;
      first = first || b;
    }
    return first;
  }
  return page.evaluate(
    ({ sel, text, within }) => {
      let first = null;
      for (const el of document.querySelectorAll(sel)) {
        if (text && !(el.textContent || "").includes(text)) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (!(r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none")) continue;
        const b = { x: r.left, y: r.top, width: r.width, height: r.height };
        if (!within || (b.x < within.x + within.width && b.x + b.width > within.x && b.y < within.y + within.height && b.y + b.height > within.y)) return b;
        first = first || b;
      }
      return first;
    },
    { sel, text: text || null, within: within || null },
  );
}

/**
 * Bring `sel` (first visible match, optionally containing `text`) to `top` px from the viewport top.
 */
async function scrollTo(page, sel, top = 80, text) {
  await page.evaluate(
    ({ sel, top, text }) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().height > 0 && (!text || (e.textContent || "").includes(text)));
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - top;
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
    },
    { sel, top, text: text || null },
  );
  await page.waitForTimeout(600);
}

const ANCHORS = {
  tl: (r) => [r.x, r.y],
  tr: (r) => [r.x + r.width, r.y],
  bl: (r) => [r.x, r.y + r.height],
  br: (r) => [r.x + r.width, r.y + r.height],
  t: (r) => [r.x + r.width / 2, r.y],
  b: (r) => [r.x + r.width / 2, r.y + r.height],
  l: (r) => [r.x, r.y + r.height / 2],
  r: (r) => [r.x + r.width, r.y + r.height / 2],
  c: (r) => [r.x + r.width / 2, r.y + r.height / 2],
};

/**
 * @param {import('playwright').Page} page
 * @param {string} id
 * @param {"desktop"|"phone"} variant
 * @param {{ clip?: {x:number,y:number,width:number,height:number}, sel?: string, pad?: number|number[], callouts?: {n:number,label:string,sel?:string,point?:[number,number],at?:string,dx?:number,dy?:number}[], alt: string, maxW?: number, caption?: string }} o
 */
async function capture(page, id, variant, o) {
  const vp = page.viewportSize();
  let clip = o.clip;
  if (!clip && o.sel) {
    const r = await rectOf(page, o.sel, o.text);
    if (!r) throw new Error(`${id}: region ${o.sel} not found`);
    const [pt, pr, pb, pl] = Array.isArray(o.pad) ? o.pad : [o.pad ?? 0, o.pad ?? 0, o.pad ?? 0, o.pad ?? 0];
    clip = { x: r.x - pl, y: r.y - pt, width: r.width + pl + pr, height: r.height + pt + pb };
  }
  if (!clip) clip = { x: 0, y: 0, width: vp.width, height: vp.height };
  // never include a partly scrolled-under site header unless asked to (o.header: true)
  if (!o.header) {
    const hb = await page.evaluate(() => {
      const h = document.querySelector("header");
      if (!h) return 0;
      const r = h.getBoundingClientRect();
      return r.bottom > 0 && r.top <= 0 && getComputedStyle(h).position !== "static" ? r.bottom : 0;
    });
    const scrolled = await page.evaluate(() => window.scrollY > 0);
    if (hb && scrolled && clip.y < hb) {
      clip = { ...clip, height: clip.height - (hb - clip.y), y: hb };
    }
  }
  // keep inside the viewport
  const x0 = Math.max(0, clip.x), y0 = Math.max(0, clip.y);
  const x1 = Math.min(vp.width, clip.x + clip.width), y1 = Math.min(vp.height, clip.y + clip.height);
  clip = { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };

  const points = [];
  for (const c of o.callouts || []) {
    let pt = c.point;
    if (!pt && c.find) {
      const r = await rectOf(page, (p) => p.getByText(c.find, { exact: !!c.exact }), null, clip);
      if (r) pt = (ANCHORS[c.at || "l"] || ANCHORS.l)(r);
      else console.warn(`  ! ${id}/${variant}: callout ${c.n} text "${c.find}" not found`);
    }
    if (!pt && c.sel) {
      const r = await rectOf(page, c.sel, c.text, clip);
      if (!r) {
        console.warn(`  ! ${id}/${variant}: callout ${c.n} target ${typeof c.sel === "string" ? c.sel : "locator"} not found`);
        continue;
      }
      pt = (ANCHORS[c.at || "tl"] || ANCHORS.tl)(r);
    }
    if (!pt) continue;
    const px = pt[0] + (c.dx || 0), py = pt[1] + (c.dy || 0);
    const x = ((px - clip.x) / clip.width) * 100, y = ((py - clip.y) / clip.height) * 100;
    if (x < -2 || x > 102 || y < -2 || y > 102) {
      console.warn(`  ! ${id}/${variant}: callout ${c.n} outside the image (${x.toFixed(0)}%, ${y.toFixed(0)}%), dropped`);
      continue;
    }
    points.push({ n: c.n, x: +Math.min(97, Math.max(3, x)).toFixed(2), y: +Math.min(96, Math.max(4, y)).toFixed(2) });
  }

  const png = await page.screenshot({ clip, animations: "disabled" });
  const maxW = o.maxW || (variant === "phone" ? 780 : 1760);
  const img = sharp(png).resize({ width: Math.min(maxW, clip.width * 2), withoutEnlargement: true });
  const file = `${id}-${variant}.webp`;
  const info = await img.webp({ quality: variant === "phone" ? 78 : 80, effort: 5 }).toFile(path.join(OUT, file));
  manifest[id] = manifest[id] || {};
  manifest[id][variant] = {
    src: `/guide/${file}`,
    w: info.width,
    h: info.height,
    alt: o.alt,
    url: new URL(page.url()).pathname,
    callouts: points,
    legend: (o.callouts || []).filter((c) => points.some((p) => p.n === c.n)).map((c) => ({ n: c.n, label: c.label })),
  };
  console.log(`  ✓ ${file} ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB · ${points.length} callouts`);
}

/* ------------------------------------------------------------------ shots */

const want = (id) => !ONLY.length || ONLY.some((o) => id.startsWith(o));

/** Stage ids of the persona's lessons and a few plain sentences to highlight, read from the rendered pages. */
const samples = {};
async function readStages() {
  const ctx = await makeContext({ seed: false });
  for (const slug of Object.values(LESSONS)) {
    const page = await open(ctx, LESSON(W00, slug), 'section[data-sd="stage"]');
    stages[slug] = await page.$$eval('section[data-sd="stage"]', (els) => els.map((e) => e.id).filter(Boolean));
    samples[slug] = await page.$$eval('section[data-sd="stage"]', (els) =>
      els.map((sec) => {
        const ps = [...sec.querySelectorAll("p")].filter((p) => !p.closest("figure, aside, [data-sd-chrome], blockquote, li, table") && p.children.length === 0);
        const out = [];
        for (const p of ps) {
          const parts = (p.textContent || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
          for (const s of parts) if (s.length >= 55 && s.length <= 150 && !/[`$<>{}]/.test(s)) out.push(s);
        }
        return { stage: sec.id, sentences: out.slice(0, 6) };
      }),
    );
    console.log(`  stages ${slug}: ${stages[slug].join(", ")}`);
    await page.close();
  }
  await ctx.close();
}

const pick = (slug, stage, i = 0) => samples[slug]?.find((s) => s.stage === stage)?.sentences[i] || samples[slug]?.flatMap((s) => s.sentences)[i] || "";

/** content_notes + bookmarks for the signed-in mock (notebook, highlights in the reader). */
function notebookFixtures() {
  const uid = DEMO_USER.id;
  const at = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
  const note = (id, slug, text, color, noteText, type, d) => ({
    id,
    user_id: uid,
    course_id: COURSE,
    week: W00,
    lesson_slug: slug,
    note_text: noteText,
    note_type: type,
    highlight_text: text,
    highlight_offset: null,
    color,
    is_private: true,
    created_at: at(d),
    updated_at: at(d),
  });
  const n4 = LESSONS.p4;
  const content_notes = [
    note("guide-h1", n4, pick(n4, "part-2", 0), "yellow", "", "general", 0.2),
    note("guide-h2", n4, pick(n4, "part-1", 1), "green", "", "general", 1),
    note("guide-h3", n4, pick(n4, "part-1", 3), "blue", "", "general", 1.1),
    note("guide-n1", n4, pick(n4, "part-2", 2), "yellow", "Ask in the interview: does the client need server push, or is polling fine?", "question", 0.3),
    note("guide-h4", LESSONS.p2, pick(LESSONS.p2, "chapter-1", 0), "yellow", "", "general", 12),
    note("guide-h5", LESSONS.p2, pick(LESSONS.p2, "chapter-2", 1), "red", "", "general", 12.2),
    note("guide-n2", LESSONS.p2, pick(LESSONS.p2, "chapter-3", 0), "green", "Say the trade-off out loud before naming a product.", "important", 12.4),
    note("guide-h6", LESSONS.p1, pick(LESSONS.p1, "chapter-1", 0), "yellow", "", "general", 18),
  ].filter((r) => r.highlight_text);
  const bookmarks = [
    {
      id: "guide-b1",
      user_id: uid,
      course_id: COURSE,
      week: W00,
      lesson_slug: n4,
      custom_title: "Come back before the WebSocket question",
      note: "Re-read before the mock interview on Friday.",
      bookmark_text: pick(n4, "part-2", 1),
      bookmark_offset: 0,
      created_at: at(0.4),
      updated_at: at(0.4),
    },
    { id: "guide-b2", user_id: uid, course_id: COURSE, week: W00, lesson_slug: LESSONS.p3, custom_title: "Estimation cheat sheet", note: null, bookmark_text: null, bookmark_offset: null, created_at: at(6), updated_at: at(6) },
  ];
  return { content_notes, bookmarks };
}

const SHOTS = [];
const shot = (id, fn) => SHOTS.push({ id, fn });
const HUB = `/learn/${COURSE}`;
const P4 = LESSON(W00, LESSONS.p4);

/** a desktop + a phone context, closed after `fn` */
async function both(fn, o = {}) {
  for (const phone of [false, true]) {
    if (o.only && o.only !== (phone ? "phone" : "desktop")) continue;
    const ctx = await makeContext({ phone, ...o });
    try {
      await fn(ctx, phone ? "phone" : "desktop");
    } finally {
      await ctx.close();
    }
  }
}

/* ---------- a) course map */

shot("hub-hero", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, HUB, "#tree-h");
    if (v === "desktop") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await capture(page, "hub-hero", v, {
        clip: { x: 60, y: 0, width: 1320, height: 610 },
        alt: "The course hub: the course tabs in the header, the course title with its numbers, and a Continue card for the lesson in progress with a daily standup link.",
        callouts: [
          { n: 1, label: "Course tabs: course · arena · notebook · progress", sel: 'header nav[aria-label="Course"]', at: "l", dx: -8 },
          { n: 2, label: "Your level and XP. Click it for the quest log", sel: "button[data-quest-toggle]", at: "bl", dx: 6, dy: 4 },
          { n: 3, label: "What the course holds, and what you have done", sel: "main section .grid", at: "tl" },
          { n: 4, label: "Continue: the lesson and stage you were on", sel: "main section .border-signal", at: "tl" },
          { n: 5, label: "Daily standup: review cards due today", sel: 'main a[href="/learn/review"]', at: "l" },
        ],
      });
    } else {
      await scrollTo(page, "main section .border-signal", 76);
      const card = await rectOf(page, "main section .border-signal");
      await capture(page, "hub-hero", v, {
        clip: { x: 0, y: card.y - 14, width: 390, height: card.height + 28 },
        alt: "The Continue card on a phone, above the course dock.",
        callouts: [
          { n: 1, label: "Continue: the lesson and stage you were on", sel: "main section .border-signal", at: "tl" },
          { n: 2, label: "Daily standup: review cards due today", sel: 'main a[href="/learn/review"]', at: "tl" },
        ],
      });
    }
  }),
);

shot("hub-tree", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, HUB, "#tree-h");
    if (v === "desktop") {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await scrollTo(page, "#tree-h", 96);
      const tree = await rectOf(page, 'section[aria-labelledby="tree-h"]');
      await capture(page, "hub-tree", v, {
        clip: { x: tree.x - 16, y: tree.y - 16, width: tree.width + 32, height: Math.min(560, tree.height + 32) },
        alt: "The skill tree: one row per world with a node for every lesson, a diamond for the boss and boxes for trial parts, next to the selected world's panel.",
        callouts: [
          { n: 1, label: "A world (one week of the course)", sel: 'section[aria-labelledby="tree-h"] ol li button', at: "tl", dx: -6 },
          { n: 2, label: "Lessons: filled = done, orange = current, dashed = ahead", sel: 'a[aria-label$=", current"]', at: "t" },
          { n: 3, label: "Trial parts (T1–T6): the week's MCQs", sel: 'section[aria-labelledby="tree-h"] a[title*="Trial"], section[aria-labelledby="tree-h"] a[aria-label*="Trial"]', at: "t" },
          { n: 4, label: "The boss: a timed interview at the end of the week", sel: 'section[aria-labelledby="tree-h"] [aria-label*="Boss"]', at: "t" },
          { n: 5, label: "Selected world: its lessons with real minutes", sel: 'aside[aria-label="Selected week"]', at: "tl" },
        ],
      });
    } else {
      await scrollTo(page, "#tree-h", 70);
      await capture(page, "hub-tree", v, {
        alt: "The skill tree on a phone: a list of worlds with their progress; tap one to open its lessons.",
        callouts: [
          { n: 1, label: "Tap a world to open its lessons, boss and trial", sel: 'section[aria-labelledby="tree-h"] .lg\\:hidden button, section[aria-labelledby="tree-h"] .lg\\:hidden li', at: "tl" },
        ],
      });
    }
  }),
);

shot("hub-side", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, HUB, "#side-h");
      await page.setViewportSize({ width: 1440, height: 1000 });
      await scrollTo(page, "#side-h", 40);
      const sec = await rectOf(page, 'section[aria-labelledby="side-h"]');
      await capture(page, "hub-side", v, {
        clip: { x: sec.x - 16, y: sec.y - 16, width: sec.width + 32, height: Math.min(460, sec.height + 32) },
        alt: "Side quests: eleven real systems (UPI, WhatsApp, Aadhaar, Netflix…) designed end to end, each worth 120 XP.",
        callouts: [{ n: 1, label: "Side quests: open any time, +120 XP each", sel: 'section[aria-labelledby="side-h"] a', at: "tl" }],
      });
    },
    { only: "desktop" },
  ),
);

/* ---------- b) reading a lesson */

shot("lesson-top", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, P4, 'section[data-sd="stage"]');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    if (v === "desktop") {
      await capture(page, "lesson-top", v, {
        alt: "The top of a lesson: breadcrumb, chips with reading time, stage and XP, the stage rail with Save checkpoint, the week list, contents and the reading tools.",
        callouts: [
          { n: 1, label: "Breadcrumb: course › week › lesson", sel: 'nav[aria-label="Breadcrumb"]', at: "l", dx: -8 },
          { n: 2, label: "Reading time, where you are, and the +60 XP for finishing", sel: "main section .font-mono.text-xs.tracking-\\[0\\.06em\\]", at: "tl" },
          { n: 3, label: "Stage rail: each stage with its minutes; ✓ when read", sel: 'ol[aria-label="Lesson stages"]', at: "tl" },
          { n: 4, label: "Save checkpoint (reads “Read ✓” once the stage you're on is read)", sel: "[data-reader-ui] button.self-center", at: "t" },
          { n: 5, label: "Resume at the stage you were reading", sel: "main section button, section button", text: "Resume at", at: "tl" },
          { n: 6, label: "Course path: this week's lessons, boss and trial", sel: 'nav[aria-label="Course path"]', at: "tl" },
          { n: 8, label: "On this page: the lesson's contents", sel: 'aside[aria-label="On this page"]', at: "tl" },
          { n: 7, label: "Reading tools: stage, Listen, Focus, text size", sel: 'div[role="toolbar"][aria-label="Reading tools"]', at: "tl" },
        ],
      });
    } else {
      await capture(page, "lesson-top", v, {
        alt: "A lesson on a phone: compact header, stage strip that opens the contents, and the reading toolbar at the bottom.",
        callouts: [
          { n: 1, label: "Lesson, time left, stage and XP in one line", sel: "main p.font-mono, section p.font-mono", at: "tl" },
          { n: 2, label: "Stage strip: tap for the contents sheet", sel: "button", text: "contents ▾", at: "tl" },
          { n: 3, label: "Listen · Contents · Aa · Focus · Notebook", sel: 'div[role="toolbar"][aria-label="Reading tools"]', at: "tl" },
          { n: 4, label: "Save checkpoint for the current stage", sel: 'div[role="toolbar"][aria-label="Reading tools"] button.flex-1', at: "t" },
        ],
      });
    }
  }),
);

shot("lesson-reading", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, P4, 'section[data-sd="stage"]');
      // read down into Part II: the header slides away, the compact stage bar pins
      await page.evaluate(() => {
        const el = document.getElementById("part-2");
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 400, behavior: "instant" });
      });
      await page.waitForTimeout(300);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(900);
      await capture(page, "lesson-reading", v, {
        clip: { x: 0, y: 0, width: 1440, height: 520 },
        alt: "Reading mid-lesson: the site header has slid away and a thin stage bar stays pinned at the top with the current stage, minutes left and Save checkpoint.",
        callouts: [
          { n: 1, label: "Where you are and how much is left", sel: "[data-stage-rail] .font-semibold", at: "l", dx: -26 },
          { n: 2, label: "Segments fill as you actually read each stage", sel: '[data-stage-rail] ol[aria-label="Lesson stages"]', at: "t", dx: -120 },
          { n: 3, label: "Save checkpoint", sel: "[data-stage-rail] button.shrink-0", at: "l", dx: -16 },
        ],
      });
    },
    { only: "desktop" },
  ),
);

shot("lesson-quiz", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, P4, 'figure[data-sd="quiz"]');
    await scrollTo(page, 'figure[data-sd="quiz"]', v === "phone" ? 70 : 100);
    // answer the first question correctly, the second one wrong
    await page.evaluate(() => {
      const fig = document.querySelector('figure[data-sd="quiz"]');
      const qs = fig.querySelectorAll("li.sd-quiz-q");
      const click = (li, right) => {
        const a = Number(li.dataset.answer);
        const btns = [...li.querySelectorAll("button[data-quiz-opt]")];
        const b = btns.find((x) => (Number(x.dataset.quizOpt) === a) === right);
        b?.click();
      };
      if (qs[0]) click(qs[0], true);
    });
    await page.waitForTimeout(900);
    await scrollTo(page, 'figure[data-sd="quiz"]', v === "phone" ? 70 : 100);
    const fig = await rectOf(page, 'figure[data-sd="quiz"]');
    const vp = page.viewportSize();
    await capture(page, "lesson-quiz", v, {
      clip: { x: fig.x - 12, y: fig.y - 12, width: fig.width + 24, height: Math.min(vp.height - fig.y - 4, fig.height + 24, v === "phone" ? 560 : 560) },
      alt: "A quick check inside a lesson: the first question answered correctly with +5 XP and its explanation open.",
      callouts: [
        { n: 1, label: "Quick check: a few questions, +5 XP each first try", sel: 'figure[data-sd="quiz"] .sd-quiz-score', at: "l", dx: -10 },
        { n: 2, label: "Your pick, the answer and why", sel: 'figure[data-sd="quiz"] li.sd-quiz-q[data-state="right"] .sd-quiz-status', at: "l", dx: -10 },
      ],
    });
  }),
);

shot("lesson-practice", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, P4, "aside.sd-practice");
      await scrollTo(page, "aside.sd-practice", 220);
      const r = await rectOf(page, "aside.sd-practice");
      await capture(page, "lesson-practice", v, {
        clip: { x: r.x - 16, y: r.y - 16, width: r.width + 32, height: r.height + 32 },
        alt: "A 'Practice this' card at the end of a lesson's last quick check, linking to the Latency Ladder game in the Arena.",
        callouts: [{ n: 1, label: "Practice this: a game that drills what you just read", sel: "aside.sd-practice", at: "tl" }],
      });
    },
    { only: "desktop" },
  ),
);

shot("lesson-diagram", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, P4, "figure.sd-mermaid svg");
      await scrollTo(page, "figure.sd-mermaid", 160);
      await page.waitForTimeout(800);
      const r = await rectOf(page, "figure.sd-mermaid");
      const vp = page.viewportSize();
      await capture(page, "lesson-diagram", v, {
        clip: { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: Math.min(vp.height - r.y, r.height + 24, 560) },
        alt: "A diagram in a lesson, drawn in the site's colours, with buttons to open it full screen or copy its source.",
        callouts: [
          { n: 1, label: "Diagrams follow the light / dark theme", sel: "figure.sd-mermaid .sd-mermaid-label, figure.sd-mermaid figcaption", at: "l", dx: -14 },
          { n: 2, label: "Open it full screen (Esc closes)", sel: "figure.sd-mermaid button", text: "Fullscreen", at: "t" },
        ],
      });
    },
    { only: "desktop" },
  ),
);

shot("lesson-end", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, P4, 'section[aria-label="End of lesson"]');
    await scrollTo(page, 'section[aria-label="End of lesson"]', v === "phone" ? 60 : 90);
    const r = await rectOf(page, 'section[aria-label="End of lesson"]');
    const vp = page.viewportSize();
    await capture(page, "lesson-end", v, {
      clip: { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: Math.min(vp.height - r.y - (v === "phone" ? 150 : 0), r.height + 24) },
      alt: "The end of a lesson: the Finish card says 'Keep reading, about N minutes left' because not enough has been read yet; below it the next lesson and the trial part.",
      callouts: [
        { n: 1, label: "Mark complete unlocks after enough real reading", sel: 'section[aria-label="End of lesson"] button', at: "tl" },
        { n: 2, label: "Up next, across weeks", sel: 'section[aria-label="End of lesson"] a', at: "tl" },
        { n: 3, label: "The trial part that tests this lesson", sel: 'section[aria-label="End of lesson"] a', text: "TRIAL", at: "tl" },
      ],
    });
  }),
);

shot("lesson-focus", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, P4, 'section[data-sd="stage"]');
      await scrollTo(page, "#part-2", 40);
      await page.getByRole("button", { name: /FOCUS/ }).first().click();
      await page.waitForTimeout(900);
      await capture(page, "lesson-focus", v, {
        clip: { x: 0, y: 0, width: 1440, height: 560 },
        alt: "Focus mode: only the article remains, with a hairline stage bar along the top and a quiet text-size and exit control.",
        callouts: [
          { n: 1, label: "Hairline stage progress", point: [300, 2] },
          { n: 2, label: "Text size and exit (Esc)", sel: 'div[role="toolbar"][aria-label="Focus mode"]', at: "l", dx: -6 },
        ],
      });
    },
    { only: "desktop" },
  ),
);

/* ---------- d) highlights, notes, bookmarks */

async function selectSentence(page, text, touch) {
  await page.evaluate(
    ({ text, touch }) => {
      const root = document.querySelector(".course-content") || document.body;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const i = (n.nodeValue || "").indexOf(text);
        if (i < 0) continue;
        const el = n.parentElement;
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (touch ? 260 : 380), behavior: "instant" });
        if (touch) document.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true }));
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + text.length);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        return true;
      }
      return false;
    },
    { text, touch },
  );
}

shot("select-menu", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, P4, "mark");
      // select a sentence in the paragraph right after a saved highlight, so both are in the shot
      const text = await page.evaluate(() => {
        // prefer more text in the same paragraph as a saved highlight
        for (const mark of document.querySelectorAll(".course-content mark")) {
          for (const sib of [mark.nextSibling, mark.previousSibling]) {
            const t = sib && sib.nodeType === 3 ? (sib.nodeValue || "").trim() : "";
            const m = t.match(/[A-Z][^.!?]{20,120}[.!?]/);
            if (m) return m[0];
          }
        }
        const mark = document.querySelector(".course-content mark");
        const p = mark?.closest("p, li");
        let next = p?.nextElementSibling;
        while (next && !(next.tagName === "P" && (next.textContent || "").trim().length > 40)) next = next.nextElementSibling;
        const t = next?.firstChild?.nodeType === 3 ? next.firstChild.nodeValue || "" : "";
        const m = t.match(/^[^.!?]{20,140}[.!?]?/);
        return m ? m[0] : "";
      });
      await selectSentence(page, text || pick(LESSONS.p4, "part-1", 2), v === "phone");
      await page.waitForTimeout(400);
      if (v === "desktop") await page.keyboard.press("Shift+F10");
      await page.waitForTimeout(900);
      const bar = await rectOf(page, 'div[role="toolbar"][aria-label="Selection actions"]');
      if (!bar) throw new Error("selection toolbar did not open");
      if (v === "desktop") {
        const col = await rectOf(page, ".course-content");
        const clip = { x: col.x - 24, y: Math.max(70, bar.y - 170), width: col.width + 48, height: 440 };
        await capture(page, "select-menu", v, {
          clip,
          alt: "Selecting a sentence in a lesson opens a toolbar: Highlight, Note, Bookmark, Ask AI and Copy link. Saved highlights show in colour in the text around it.",
          callouts: [
            { n: 1, label: "Highlight (pick one of four colours)", sel: 'div[role="toolbar"] button', text: "Highlight", at: "t" },
            { n: 2, label: "Note: your words attached to the passage", sel: 'div[role="toolbar"] button', text: "Note", at: "t" },
            { n: 3, label: "Bookmark this exact passage", sel: 'div[role="toolbar"] button', text: "Bookmark", at: "t" },
            { n: 4, label: "Ask AI: Claude or ChatGPT, with the context", sel: 'div[role="toolbar"] button', text: "Ask AI", at: "t" },
            { n: 5, label: "Copy link: opens the page at this line", sel: 'div[role="toolbar"] button', text: "Copy link", at: "t" },
            { n: 6, label: "A saved highlight", sel: ".course-content mark", at: "tl" },
          ],
        });
        // second panel: Ask AI
        await page.keyboard.press("a");
        await page.waitForTimeout(400);
        const ab = await rectOf(page, 'div[role="toolbar"][aria-label="Ask an AI about the selection"]');
        await capture(page, "select-ask", v, {
          clip: { x: ab.x - 16, y: ab.y - 16, width: ab.width + 32, height: ab.height + 110 },
          alt: "The Ask AI panel of the selection toolbar: Ask Claude, Ask ChatGPT and Copy prompt.",
          callouts: [
            { n: 1, label: "Opens claude.ai / chatgpt.com with the passage and its lesson context", sel: 'div[role="toolbar"] button', text: "Ask Claude", at: "t" },
            { n: 2, label: "Copy the same prompt for any AI", sel: 'div[role="toolbar"] button', text: "Copy prompt", at: "t" },
          ],
        });
      } else {
        await capture(page, "select-menu", v, {
          alt: "On a phone, a long-press selection docks the toolbar at the bottom of the screen.",
          callouts: [
            { n: 1, label: "Toolbar docks at the bottom on touch screens", sel: 'div[role="toolbar"][aria-label="Selection actions"]', at: "tl" },
            { n: 2, label: "A saved highlight", sel: ".course-content mark", at: "tl" },
          ],
        });
      }
    },
    { signedIn: true, fixtures: notebookFixtures() },
  ),
);

shot("notebook", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, "/learn/notebook", "mark, blockquote, article, li");
      await page.waitForTimeout(1500);
      if (v === "desktop") {
        await page.setViewportSize({ width: 1440, height: 1100 });
        await page.waitForTimeout(500);
        await capture(page, "notebook", v, {
          clip: { x: 60, y: 60, width: 1320, height: 1000 },
          alt: "The Notebook: tabs for highlights, notes and bookmarks, search and filters, and saved passages grouped by lesson with 'Open at' links.",
          callouts: [
            { n: 1, label: "Highlights · Notes · Bookmarks", sel: '[role="tablist"], nav[aria-label*="Notebook"]', at: "tl" },
            { n: 2, label: "Search, filter by week and colour", sel: 'input[type="search"], input', at: "tl" },
            { n: 3, label: "Grouped by lesson, in course order", sel: "main h2, main h3", text: "System Design Fundamentals", at: "l", dx: -14 },
            { n: 4, label: "Open at the stage you saved it from", sel: "main a", text: "Open at", at: "l", dx: -8 },
            { n: 5, label: "Turn a highlight into a review card", sel: "main button", text: "Review card", at: "t" },
            { n: 6, label: "Export everything as Markdown", sel: "main button", text: "Export", at: "l" },
          ],
        });
      } else {
        await page.setViewportSize({ width: 390, height: 1000 });
        await page.waitForTimeout(500);
        await capture(page, "notebook", v, {
          alt: "The Notebook on a phone: tabs, search and highlights grouped by lesson.",
          callouts: [
            { n: 1, label: "Highlights · Notes · Bookmarks", sel: '[role="tablist"], nav[aria-label*="Notebook"]', at: "tl" },
            { n: 2, label: "Open at the stage you saved it from", sel: "main a", text: "Open at", at: "l" },
          ],
        });
      }
    },
    { signedIn: true, fixtures: notebookFixtures() },
  ),
);

/* ---------- e) review / standup */

shot("review", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, "/learn/review", 'section[aria-labelledby="session-h"]');
    await page.waitForTimeout(800);
    if (v === "desktop") {
      await page.setViewportSize({ width: 1440, height: 1200 });
      await scrollTo(page, "#rv-h", 90);
      const boxesBottom = await page.evaluate(() => {
        const h = [...document.querySelectorAll("main h2")].find((e) => /Leitner/.test(e.textContent || ""));
        const box = h?.closest("section, div.border");
        return box ? box.getBoundingClientRect().bottom : 1080;
      });
      await capture(page, "review-boxes", v, {
        clip: { x: 60, y: 0, width: 1320, height: Math.min(1180, boxesBottom + 16) },
        alt: "The daily standup: today's numbers, a 7-day streak strip, the five Leitner boxes with how often each comes back, and where cards come from.",
        callouts: [
          { n: 1, label: "Cards due today and how long they take", sel: "main section .grid, main section dl", at: "tl" },
          { n: 2, label: "Streak: a review or a finished stage counts the day", find: "STREAK" },
          { n: 3, label: "Leitner boxes: Box 1 daily → Box 5 monthly", sel: "main h2", text: "Leitner boxes", at: "l", dx: -10 },
          { n: 4, label: "Where cards come from", sel: "main h2", text: "Where cards come from", at: "l", dx: -10 },
        ],
      });
    }
    await scrollTo(page, "#session-h", 100);
    await page.getByRole("button", { name: /Show answer/ }).first().click();
    await page.waitForTimeout(700);
    if (v === "phone") {
      await page.setViewportSize({ width: 390, height: 1300 });
      await page.waitForTimeout(400);
    }
    await scrollTo(page, "#session-h", 100);
    const sec = await rectOf(page, 'section[aria-labelledby="session-h"]');
    const vp = page.viewportSize();
    await capture(page, "review-card", v, {
      clip: { x: Math.max(0, sec.x - 12), y: Math.max(0, sec.y - 12), width: Math.min(vp.width, sec.width + 24), height: Math.min(vp.height - sec.y, v === "phone" ? 900 : 760) },
      alt: "A review card after 'Show answer': the question you missed in a trial, your pick, the right answer and why, and the four grade buttons that decide when it comes back.",
      callouts: [
        { n: 1, label: "Where the card came from", sel: 'section[aria-labelledby="session-h"] .font-mono', text: "MISSED", at: "l", dx: -8 },
        { n: 2, label: "Again · Hard · Good · Easy: picks the next box", sel: 'section[aria-labelledby="session-h"] button[aria-label^="Again"]', at: "tl" },
        { n: 3, label: "Today's queue", sel: 'aside[aria-labelledby="queue-h"]', at: "tl" },
      ],
    });
  }),
);

/* ---------- f) trials and bosses */

const TRIAL = LESSON(W00, "week-00-mcq-assessment");

shot("trial-hub", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, TRIAL, "#parts-h");
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    if (v === "desktop") await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const vp = page.viewportSize();
    const parts = await rectOf(page, 'section[aria-labelledby="parts-h"]');
    await capture(page, "trial-hub", v, {
      clip: { x: 0, y: v === "phone" ? 60 : 70, width: vp.width, height: Math.min(vp.height - (v === "phone" ? 60 : 70), parts.y + parts.height + 10 - (v === "phone" ? 60 : 70)) },
      alt: "A week's trial page: parts cleared, questions this week, the 80% pass mark, +100 XP per first pass, and a strip of parts marked passed, failed, current or locked.",
      callouts: [
        { n: 1, label: "Pass mark 80% per part · +100 XP on the first pass", sel: "main .grid", text: "80%", at: "tl" },
        { n: 2, label: "Start (or retry) the next part", sel: "main a", text: "Part", at: "tl" },
        { n: 3, label: "Practice all questions untimed, no XP", sel: "main a", text: "Practice all", at: "tl" },
        { n: 4, label: "One card per part: passed, failed, open or locked", sel: 'section[aria-labelledby="parts-h"] a, section[aria-labelledby="parts-h"] li', at: "tl" },
      ],
    });
  }),
);

shot("trial-question", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, `${TRIAL}?part=3`, "main");
      await page.getByRole("button", { name: /Start attempt/ }).first().click();
      await page.waitForTimeout(900);
      // choose an option (not locked in yet)
      const opt = page.locator('main button[aria-pressed], main [role="radio"], main button:has-text("B")').first();
      await opt.click().catch(() => undefined);
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await capture(page, "trial-question", v, {
        clip: { x: 0, y: 60, width: 1440, height: 760 },
        alt: "A trial question: one per screen with a progress strip, a flag button, and Lock in to commit the answer.",
        callouts: [
          { n: 1, label: "One question per screen", sel: "main h1, main h2", at: "tl" },
          { n: 2, label: "Flag a guess: it joins your review queue", sel: "main button", text: "Flag", at: "tl" },
          { n: 3, label: "Lock in to see the answer and explanation", sel: "main button", text: "Lock in", at: "tl" },
        ],
      });
    },
    { only: "desktop" },
  ),
);

shot("boss", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, LESSON(W01, "capstone-interview-week-1-url-shortner-at-scale"), 'section[aria-label="Boss fight"]');
      await scrollTo(page, 'section[aria-label="Boss fight"]', 120);
      const card = await rectOf(page, 'section[aria-label="Boss fight"]');
      await capture(page, "boss-entry", v, {
        clip: { x: card.x - 14, y: card.y - 14, width: card.width + 28, height: card.height + 28 },
        alt: "The boss card at the top of a capstone lesson: fight it as a timed interview, or just read the model answer.",
        callouts: [{ n: 1, label: "Fight the boss, or read the model answer", sel: 'section[aria-label="Boss fight"] button', at: "tl" }],
      });
      await page.getByRole("button", { name: /Fight the boss/ }).click();
      await page.waitForTimeout(1200);
      await page.setViewportSize({ width: 1440, height: 1250 });
      await scrollTo(page, "#map-h", 100);
      const vp = page.viewportSize();
      await capture(page, "boss-brief", v, {
        clip: { x: 60, y: 0, width: 1320, height: vp.height - 10 },
        alt: "The boss briefing: the timed phases, interview mode versus read mode, the rules of the fight and the +200 XP reward for a 70% rubric score.",
        callouts: [
          { n: 1, label: "Phases with their time budgets", sel: "#map-h", at: "l", dx: -10 },
          { n: 2, label: "Interview mode: answer hidden, earns XP", sel: "fieldset button, fieldset label", text: "Interview mode", at: "tl" },
          { n: 3, label: "Read mode: model answer open, no XP", sel: "fieldset button, fieldset label", text: "Read mode", at: "tl" },
          { n: 4, label: "+200 XP at 70% of the rubric, once", sel: 'aside[aria-label="Reward"]', at: "tl" },
        ],
      });
    },
    { only: "desktop" },
  ),
);

/* ---------- g) arena */

shot("arena-hub", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, "/learn/arena", "#arena-h");
    await page.waitForTimeout(1200);
    if (v === "desktop") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const rv = await rectOf(page, 'main a[href="/learn/review"]');
      await capture(page, "arena-hub", v, {
        clip: { x: 60, y: 62, width: 1320, height: rv.y + rv.height + 14 - 62 },
        alt: "The Arena: your level, daily streak, weekly points and league; today's daily challenge; your league's top five this week; and the review queue.",
        callouts: [
          { n: 1, label: "Level · daily streak · this week's points · league", sel: "main section .grid.h-full", at: "tl" },
          { n: 2, label: "Today's daily challenge", sel: "main section .border-signal", at: "tl" },
          { n: 3, label: "Your league this week, promotion zone marked", sel: "main section .bg-raised", at: "tl" },
          { n: 4, label: "Review queue · daily standup", sel: 'main a[href="/learn/review"]', at: "tl" },
        ],
      });
      await scrollTo(page, "#games-h", 100);
      await capture(page, "arena-games", v, {
        clip: { x: 60, y: 0, width: 1320, height: 860 },
        alt: "Arena games (60–90 second rounds) and the Engineering Playground, each tied to the lessons that teach it.",
        callouts: [
          { n: 1, label: "Arena games: 60–90 s rounds, +40 XP on first clear", sel: "#games-h", at: "l", dx: -10 },
          { n: 2, label: "Taught in: the lessons behind each game", sel: "main li span", text: "taught in", at: "l", dx: -8 },
          { n: 3, label: "Playground boards, +60 XP each", sel: "#play-h", at: "l", dx: -10 },
        ],
      });
    } else {
      await page.setViewportSize({ width: 390, height: 1000 });
      await scrollTo(page, "main section .border-signal", 70);
      await capture(page, "arena-hub", v, {
        alt: "The Arena on a phone: today's daily challenge and your league.",
        callouts: [
          { n: 1, label: "Today's daily challenge", sel: "main section .border-signal", at: "tl" },
          { n: 2, label: "Your league this week", sel: "main section .bg-raised", at: "tl" },
        ],
      });
    }
  }),
);

shot("arena-daily", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, "/learn/arena/daily", "main button");
    const start = page.getByRole("button", { name: /Start|Play/ }).first();
    await start.click().catch(() => undefined);
    await page.waitForTimeout(3200);
    await page.evaluate(() => window.scrollTo(0, 0));
    const vp = page.viewportSize();
    await capture(page, "arena-daily", v, {
      clip: v === "phone" ? { x: 0, y: 50, width: vp.width, height: vp.height - 50 } : { x: 220, y: 62, width: 1000, height: 520 },
      alt: "The daily challenge running: question 1 of 5 with a 20-second timer bar and four options.",
      callouts: [
        { n: 1, label: "5 questions, the same for everyone today", find: "question 1/5", at: "r", dx: 14 },
        { n: 2, label: "20 seconds each; faster right answers score more", sel: 'main [role="progressbar"], main [role="timer"]', at: "b", dy: 10 },
        { n: 3, label: "Pick an answer (keys A–D or 1–4)", sel: "main button", text: "A", at: "l", dx: -8 },
      ],
    });
  }),
);

shot("leaderboard", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, "/learn/arena/leaderboard", "#lb-h");
      await page.waitForTimeout(1200);
      await page.setViewportSize({ width: 1440, height: 1250 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await capture(page, "leaderboard", v, {
        clip: { x: 60, y: 62, width: 1320, height: 1150 },
        alt: "The weekly leaderboard (example data): your rank, points and breakdown, league tabs L1 Intern to L6 Principal, and the ranked list with the promotion zone.",
        callouts: [
          { n: 1, label: "This week or all time", sel: "main button", text: "week", at: "tl" },
          { n: 2, label: "Your points, rank and where they came from", sel: 'section[aria-label="Your standing"]', at: "tl" },
          { n: 3, label: "Leagues follow the levels: L1 Intern → L6 Principal", sel: "main button", text: "Junior", at: "tl" },
          { n: 4, label: "Promotion zone: the top 20% move up on Monday", sel: 'main [title="Promotion zone"]', at: "l", dx: -8 },
        ],
      });
      await scrollTo(page, "#pts-h", 100);
      const sec = await rectOf(page, 'section[aria-labelledby="pts-h"]');
      await capture(page, "leaderboard-points", v, {
        clip: { x: sec.x - 14, y: sec.y - 14, width: sec.width + 28, height: sec.height + 28 },
        alt: "How scoring works: the points table and the rules for caps, re-checks and leagues.",
        callouts: [],
      });
    },
    { only: "desktop", signedIn: true, fixtures: notebookFixtures() },
  ),
);

/* ---------- h) XP: quest log */

shot("questlog", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, HUB, "#tree-h");
      await page.locator("button[data-quest-toggle]").first().click();
      await page.waitForTimeout(500);
      const r = await rectOf(page, "header div.absolute");
      const chip = await rectOf(page, "button[data-quest-toggle]");
      await capture(page, "questlog", v, {
        clip: { x: chip.x - 40, y: 0, width: r.x + r.width + 16 - (chip.x - 40), height: r.y + r.height + 16 },
        alt: "The quest log opened from the level chip: the site's main quests with their XP, and every badge, earned ones in orange.",
        callouts: [
          { n: 1, label: "Level chip: opens the quest log", sel: "button[data-quest-toggle]", at: "l", dx: -8 },
          { n: 2, label: "Main quests with their XP", sel: "header div.absolute ul", at: "tl" },
          { n: 3, label: "Badges: orange = earned (hover for how)", sel: "header div.absolute .flex-wrap", at: "tl" },
        ],
      });
    },
    { only: "desktop" },
  ),
);

/* ---------- i) progress page */

shot("progress", () =>
  both(async (ctx, v) => {
    const page = await open(ctx, "/learn/dashboard", "#map");
    await page.waitForTimeout(1500);
    if (v === "desktop") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      await capture(page, "progress-top", v, {
        clip: { x: 60, y: 62, width: 1320, height: 700 },
        alt: "The Progress page overview: level and XP, course percentage, streak, reading time, lessons done, progress by week, the resume card, next trial and the daily standup.",
        callouts: [
          { n: 1, label: "Level, XP and what the next level unlocks", sel: "main h1", at: "l", dx: -10 },
          { n: 2, label: "Course % · streak · reading time · lessons", sel: "main section .grid", at: "tl" },
          { n: 3, label: "Progress by week", find: "BY WEEK" },
          { n: 4, label: "Resume, next trial part and the standup", sel: "main section .border-signal", at: "tl" },
          { n: 5, label: "Jump to a section", sel: 'nav[aria-label="Progress sections"]', at: "l" },
        ],
      });
      for (const [id, sel, h, alt, callouts] of [
        ["progress-map", "#map", 820, "The course map grid: every lesson, boss, trial part and side quest of every week, coloured by status, trial cells showing your best score.", [
          { n: 1, label: "One row per week: done / total", find: "5/12", at: "l", dx: -14 },
          { n: 2, label: "Trial parts show your best score", sel: "#map a, #map span", text: "T1", at: "t" },
        ]],
        ["progress-activity", "#activity", 760, "Your rhythm: a 12-week activity heatmap, minutes per week, streak tiles and the XP log.", [
          { n: 1, label: "Daily activity heatmap (12 weeks)", sel: '#activity [role="group"]', at: "tl" },
          { n: 2, label: "Minutes per week", sel: "#activity svg", at: "tl" },
          { n: 3, label: "Streak, best day, sessions this week", find: "current streak", at: "l", dx: -14 },
        ]],
        ["progress-goals", "#goals", 760, "Weekly goal with a projected finish date, and What stuck: trial scores per part, the review queue by box, notebook counts and badges.", [
          { n: 1, label: "Weekly goal: minutes or lessons, optional finish date", sel: "#goals-h", at: "l", dx: -10 },
          { n: 2, label: "Best trial score per part", sel: "#mastery-h", at: "l", dx: -10 },
          { n: 3, label: "Badges: earned ones are outlined in orange", sel: "#mastery li", at: "tl" },
        ]],
        ["progress-data", "#data", 760, "Your data: download everything as JSON, and reset one lesson, a week, the course or everything, choosing which kinds of data to clear.", [
          { n: 1, label: "Download my data (.json)", sel: "#data button", text: "Download", at: "tl" },
          { n: 2, label: "1 · What to reset: lesson, week, course, everything", sel: "#data fieldset, #data legend", at: "tl" },
          { n: 3, label: "2 · Which data: progress, quiz answers, notes…", sel: "#data legend", text: "2", at: "l", dx: -8 },
        ]],
      ]) {
        await scrollTo(page, sel, 130);
        const sr = await rectOf(page, sel);
        await capture(page, id, v, { clip: { x: 60, y: sr.y - 16, width: 1320, height: Math.min(h, sr.height + 32) }, alt, callouts });
      }
    } else {
      await page.setViewportSize({ width: 390, height: 1100 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      await capture(page, "progress-top", v, {
        alt: "The Progress page on a phone: level, course percentage, streak and the resume card.",
        callouts: [
          { n: 1, label: "Level, XP and what the next level unlocks", sel: "main h1", at: "tl" },
          { n: 2, label: "Course % · streak · reading time · lessons", sel: "main section .grid", at: "tl" },
        ],
      });
    }
  }),
);

/* ---------- j) case files */

shot("cases", () =>
  both(
    async (ctx, v) => {
      const page = await open(ctx, "/stories", "main");
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, 0));
      await capture(page, "case-index", v, {
        clip: { x: 60, y: 62, width: 1320, height: 560 },
        alt: "The Case files index: your record of closed and solved cases, filters by type, search, and the latest case file.",
        callouts: [
          { n: 1, label: "Your record: cases closed (read) and solved (activity)", find: "YOUR RECORD" },
          { n: 2, label: "Filter: incidents, system design, build logs", sel: "main button", text: "Incidents", at: "tl" },
        ],
      });
      const p2 = await open(ctx, `/stories/${STORY}`, "main");
      await scrollTo(p2, `section[aria-labelledby="act-${STORY}-h"]`, 170);
      await p2.waitForTimeout(800);
      const r = await rectOf(p2, `section[aria-labelledby="act-${STORY}-h"]`);
      await capture(p2, "case-activity", v, {
        clip: { x: r.x - 14, y: r.y - 14, width: r.width + 28, height: Math.min(800, r.height + 28) },
        alt: "The interactive activity at the end of a case file: steps, the score needed to solve it and the XP it pays.",
        callouts: [
          { n: 1, label: "End-of-file activity: solve it at 70% for +25 XP", sel: `#act-${STORY}-h`, at: "l", dx: -10 },
          { n: 2, label: "Score needed to solve it, and your best so far", find: "solve at", at: "tl" },
          { n: 3, label: "Run (or rerun) the drill", sel: `section[aria-labelledby="act-${STORY}-h"] button`, at: "l", dx: -14 },
        ],
      });
    },
    { only: "desktop" },
  ),
);

/* ------------------------------------------------------------------ run */

fs.mkdirSync(OUT, { recursive: true });
browser = await chromium.launch();
try {
  console.log(`guide shots → ${path.relative(ROOT, OUT)} from ${BASE}`);
  await readStages();
  for (const s of SHOTS) {
    if (!want(s.id)) continue;
    console.log(`• ${s.id}`);
    try {
      await s.fn();
    } catch (e) {
      console.error(`  ✗ ${s.id}: ${e.message}`);
      process.exitCode = 1;
    }
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  }
} finally {
  await browser.close();
}
