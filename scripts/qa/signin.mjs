#!/usr/bin/env node
/**
 * QA sign-in helper: signs the dedicated QA account into a puppeteer page, on staging or localhost.
 *
 *   import { signIn } from "./signin.mjs";
 *   const session = await signIn(page, "https://staging.systemdesignmastery.dev");   // or "http://localhost:3410"
 *   await page.goto(baseUrl + "/dsa/...");   // the page is signed in from its first script
 *
 * How: POSTs the QA email + password to Supabase's REST token endpoint (grant_type=password), then installs the session
 * exactly where the site's client (src/lib/supabase-client.ts: supabase-js, localStorage storage, default key
 * `sb-<project-ref>-auth-token`, no cookies) reads it, via evaluateOnNewDocument (so it exists before any page script runs
 * and survives navigations) plus a direct write when the page is already on baseUrl. Returns the Supabase session
 * ({ access_token, user, ... }) so scripts can also call protected APIs: `Authorization: Bearer ${session.access_token}`.
 *
 * Secrets: QA_EMAIL / QA_PASSWORD / QA_USER_ID come from ~/.cache/hk-render/qa-account.env at runtime (override with the
 * same-named env vars). The Supabase URL + anon key come from NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in the
 * environment or the repo's .env / .env.local. NEVER print, log, screenshot or commit the password (this file never does).
 *
 * The QA account is excluded from analytics (src/lib/analytics/exclude.ts isQaUser), leaderboards and learner email lists.
 * Staging and production share one Supabase project, so everything the QA user does is real data for that user only.
 *
 * Also exports: qaUser() (id + email), signedInCheck(page) (header avatar present?), and apiGet(session, baseUrl, path).
 * CLI self-test: node scripts/qa/signin.mjs [baseUrl]   (default https://staging.systemdesignmastery.dev; needs puppeteer-core in ~/.cache/hk-render/deps)
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

function config() {
  const qa = readEnvFile(path.join(homedir(), ".cache/hk-render/qa-account.env"));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const app = { ...readEnvFile(path.join(root, ".env")), ...readEnvFile(path.join(root, ".env.local")) };
  const pick = (k, src) => process.env[k] || src[k];
  const cfg = {
    email: pick("QA_EMAIL", qa),
    password: pick("QA_PASSWORD", qa),
    userId: pick("QA_USER_ID", qa),
    url: (pick("NEXT_PUBLIC_SUPABASE_URL", app) || "").replace(/\/$/, ""),
    anon: pick("NEXT_PUBLIC_SUPABASE_ANON_KEY", app),
  };
  for (const k of ["email", "password", "url", "anon"]) if (!cfg[k]) throw new Error(`signin: missing ${k} (see the file header)`);
  return cfg;
}

export function qaUser() {
  const c = config();
  return { id: c.userId, email: c.email };
}

/** Sign in via Supabase REST and return the session. */
export async function fetchSession() {
  const c = config();
  const res = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: c.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`signin: Supabase said ${res.status} ${body.error_description || body.msg || body.error || ""}`.trim());
  return body;
}

export async function signIn(page, baseUrl) {
  const c = config();
  const session = await fetchSession();
  const ref = new URL(c.url).hostname.split(".")[0];
  const key = `sb-${ref}-auth-token`;
  const origin = new URL(baseUrl).origin;
  const value = JSON.stringify(session);
  const install = ([k, v, o]) => {
    try {
      if (location.origin === o) window.localStorage.setItem(k, v);
    } catch {}
  };
  await page.evaluateOnNewDocument(install, [key, value, origin]);
  try {
    if (page.url().startsWith(origin)) await page.evaluate(install, [key, value, origin]);
  } catch {}
  return session;
}

/** True when the header shows the signed-in avatar/menu instead of a Sign in button. */
export async function signedInCheck(page) {
  return page.evaluate(() => {
    const h = document.querySelector("header");
    if (!h) return false;
    const txt = (h.textContent || "").toLowerCase();
    return !!h.querySelector('img[alt*="avatar" i], [aria-label*="account" i], [aria-label*="profile" i], [aria-label*="user menu" i], button[aria-haspopup="menu"]') && !/\bsign in\b|\blog in\b/.test(txt);
  });
}

export async function apiGet(session, baseUrl, p) {
  const r = await fetch(new URL(p, baseUrl), { headers: { Authorization: `Bearer ${session.access_token}` } });
  return { status: r.status, json: await r.json().catch(() => null) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] || "https://staging.systemdesignmastery.dev";
  const require = createRequire(path.join(homedir(), ".cache/hk-render/deps/package.json"));
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const session = await signIn(page, base);
    await page.goto(`${base}/dsa`, { waitUntil: "networkidle2", timeout: 60000 });
    console.log("header signed in:", await signedInCheck(page));
    for (const p of ["/api/learn/progress", "/api/dsa/leaderboard?period=all"]) console.log(p, (await apiGet(session, base, p)).status);
  } finally {
    await browser.close();
  }
}
