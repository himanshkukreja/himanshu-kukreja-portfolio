#!/usr/bin/env node
// Copies the Pyodide runtime the code labs need from node_modules/pyodide into
// public/pyodide/<version>/ (git-ignored), so the site serves it itself: no third-party CDN at
// runtime, and the service worker can keep it for offline labs. Runs before `next dev` and
// `next build` (package.json predev / prebuild).
//
// Fails when the versions disagree: package.json "pyodide", PYODIDE_VERSION in
// src/lib/learn/labs/runtime.ts and RUNTIME_VERSION in public/sw.js must be the same.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const MAX_FILE = 50 * 1024 * 1024; // keep every static file well under hosting limits

const fail = (msg) => {
  console.error(`[vendor-pyodide] ${msg}`);
  process.exit(1);
};

const src = path.join(site, "node_modules/pyodide");
if (!fs.existsSync(path.join(src, "package.json"))) fail("node_modules/pyodide is missing: run npm install");
const version = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8")).version;

const runtimeTs = fs.readFileSync(path.join(site, "src/lib/learn/labs/runtime.ts"), "utf8");
const tsVersion = runtimeTs.match(/PYODIDE_VERSION\s*=\s*"([^"]+)"/)?.[1];
const sw = fs.readFileSync(path.join(site, "public/sw.js"), "utf8");
const swVersion = sw.match(/RUNTIME_VERSION\s*=\s*"([^"]+)"/)?.[1];
const pkg = JSON.parse(fs.readFileSync(path.join(site, "package.json"), "utf8"));
const pinned = pkg.dependencies?.pyodide;
if (pinned !== version) fail(`package.json pins pyodide "${pinned}" but ${version} is installed (pin the exact version)`);
if (tsVersion !== version) fail(`src/lib/learn/labs/runtime.ts PYODIDE_VERSION is ${tsVersion}, installed pyodide is ${version}`);
if (swVersion !== version) fail(`public/sw.js RUNTIME_VERSION is ${swVersion}, installed pyodide is ${version}`);

const root = path.join(site, "public/pyodide");
const out = path.join(root, version);
fs.mkdirSync(out, { recursive: true });
let total = 0;
let copied = 0;
for (const f of FILES) {
  const from = path.join(src, f);
  if (!fs.existsSync(from)) fail(`node_modules/pyodide/${f} is missing`);
  const size = fs.statSync(from).size;
  if (size > MAX_FILE) fail(`${f} is ${(size / 1e6).toFixed(1)} MB, over the 50 MB static file budget`);
  const to = path.join(out, f);
  if (!fs.existsSync(to) || fs.statSync(to).size !== size) {
    fs.copyFileSync(from, to);
    copied++;
  }
  total += size;
}
// older versions are dead weight in the deployment
for (const d of fs.readdirSync(root)) if (d !== version && fs.statSync(path.join(root, d)).isDirectory()) fs.rmSync(path.join(root, d), { recursive: true, force: true });
console.log(`[vendor-pyodide] pyodide ${version}: ${FILES.length} files, ${(total / 1e6).toFixed(2)} MB in public/pyodide/${version}/ (${copied} copied)`);
