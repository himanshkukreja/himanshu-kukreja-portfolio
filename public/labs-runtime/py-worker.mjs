/* eslint-disable */
/**
 * Code labs: the Python worker (a module Web Worker, hand-written like /sw.js).
 *
 * Created by src/lib/learn/labs/runner.ts as
 *   new Worker("/labs-runtime/py-worker.mjs?v=<pyodide>-<rev>", { type: "module" })
 * so the page never freezes while Python runs. The page enforces the time limit: it terminates this
 * worker when a run takes too long (an infinite loop) and starts a fresh one.
 *
 * Messages in:
 *   { type: "init", base: "/pyodide/<version>/", harness: "<python source>" }
 *   { type: "run", id, code, given, groups: [{ name, src }], maxOutput }
 * Messages out:
 *   { type: "ready", ms, version, python }         interpreter loaded and harness defined
 *   { type: "fatal", message }                     the runtime could not load
 *   { type: "out", id, text }                      stdout/stderr, batched, capped per run
 *   { type: "done", id, result, ms }               harness JSON (see src/lib/learn/labs/harness.ts)
 *   { type: "error", id, message }                 the run itself failed outside the harness
 *
 * Network: once Pyodide has loaded, fetch / XMLHttpRequest / WebSocket / importScripts are replaced
 * by functions that throw, and package loading is switched off, so code in a lab can't reach the
 * network (Python's socket module doesn't work in the browser anyway).
 */
let py = null;
let runFn = null;
let current = null; // { id, sent, cap, buf, last, truncated }

const FLUSH_BYTES = 4096;
const FLUSH_MS = 120;

function flush(force) {
  const c = current;
  if (!c || !c.buf) return;
  if (!force && c.buf.length < FLUSH_BYTES && Date.now() - c.last < FLUSH_MS) return;
  self.postMessage({ type: "out", id: c.id, text: c.buf });
  c.buf = "";
  c.last = Date.now();
}

function write(text) {
  const c = current;
  if (!c || c.truncated) return;
  const room = c.cap - c.sent;
  if (text.length > room) {
    c.buf += text.slice(0, Math.max(0, room)) + `\n… output truncated at ${c.cap.toLocaleString("en")} characters\n`;
    c.sent = c.cap;
    c.truncated = true;
    flush(true);
    return;
  }
  c.sent += text.length;
  c.buf += text;
  flush(false);
}

function lockDown(pyodide) {
  const blocked = (what) =>
    function () {
      throw new Error(`${what} is disabled in code labs: lab code runs offline, with no network access.`);
    };
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "importScripts"]) {
    try {
      Object.defineProperty(self, name, { value: blocked(name), writable: false, configurable: false });
    } catch (e) {
      try {
        self[name] = blocked(name);
      } catch (e2) {}
    }
  }
  const noPackages = async () => {
    throw new Error("Installing packages is disabled in code labs: the standard library is available.");
  };
  try {
    pyodide.loadPackage = noPackages;
    pyodide.loadPackagesFromImports = noPackages;
  } catch (e) {}
}

async function init(msg) {
  const t0 = performance.now();
  try {
    const { loadPyodide } = await import(/* webpackIgnore: true */ msg.base + "pyodide.mjs");
    py = await loadPyodide({
      indexURL: msg.base,
      stdout: (s) => write(s + "\n"),
      stderr: (s) => write(s + "\n"),
      stdin: () => {
        throw new Error("input() is not available in code labs");
      },
    });
    py.runPython(msg.harness);
    runFn = py.globals.get("__hk_lab_run");
    const python = py.runPython("import sys; '.'.join(map(str, sys.version_info[:3]))");
    lockDown(py);
    self.postMessage({ type: "ready", ms: Math.round(performance.now() - t0), version: py.version, python });
  } catch (e) {
    self.postMessage({ type: "fatal", message: String((e && e.message) || e) });
  }
}

function run(msg) {
  current = { id: msg.id, sent: 0, cap: msg.maxOutput || 50000, buf: "", last: Date.now(), truncated: false };
  const t0 = performance.now();
  try {
    const result = runFn(msg.code, msg.given || "", JSON.stringify(msg.groups || []));
    flush(true);
    self.postMessage({ type: "done", id: msg.id, result: String(result), ms: Math.round(performance.now() - t0) });
  } catch (e) {
    flush(true);
    self.postMessage({ type: "error", id: msg.id, message: String((e && e.message) || e) });
  } finally {
    current = null;
  }
}

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === "init") void init(msg);
  else if (msg.type === "run") {
    if (!runFn) self.postMessage({ type: "error", id: msg.id, message: "Python is still loading" });
    else run(msg);
  }
};
