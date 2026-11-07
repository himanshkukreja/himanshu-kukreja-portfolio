/**
 * Code labs: the JavaScript / TypeScript worker. Bundled by webpack from
 *   new Worker(new URL("./js.worker.ts", import.meta.url), { type: "module" })   (runner.ts)
 * so it is one hashed /_next/static chunk with the harness (jsHarness.ts) and sucrase, the TypeScript
 * transpiler. The page enforces the time limit: it terminates this worker when a run takes too long.
 *
 * Why sucrase: it only strips types (no type checking, like esbuild or Babel), keeps line numbers so
 * errors point at the reader's own lines, and its parser doubles as the syntax checker for plain JS
 * (errors with a line and column, which `new Function` doesn't give in Chrome). It adds ~190 KB
 * minified (~45 KB gzip) to this worker chunk only; the TypeScript compiler would be ~9 MB, esbuild-wasm
 * ~10 MB and Babel standalone ~3 MB.
 *
 * Same protocol as the Python worker (runner.ts). Network: after init, fetch / XMLHttpRequest /
 * WebSocket / EventSource / importScripts throw, and the harness refuses `import`.
 */
import { transform } from "sucrase";
import { jsLabChaos, jsLabRun, jsLabScale, type JsDeps } from "./jsHarness";

const FLUSH_BYTES = 4096;
const FLUSH_MS = 120;
type Current = { id: number; sent: number; cap: number; buf: string; last: number; truncated: boolean };
let current: Current | null = null;
const post = (m: unknown) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);

function flush(force: boolean) {
  const c = current;
  if (!c || !c.buf) return;
  if (!force && c.buf.length < FLUSH_BYTES && Date.now() - c.last < FLUSH_MS) return;
  post({ type: "out", id: c.id, text: c.buf });
  c.buf = "";
  c.last = Date.now();
}

function write(text: string) {
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

function lockDown() {
  const g = self as unknown as Record<string, unknown>;
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "importScripts", "BroadcastChannel"]) {
    const blocked = function () {
      throw new Error(`${name} is disabled in code labs: lab code runs offline, with no network access.`);
    };
    try {
      Object.defineProperty(g, name, { value: blocked, writable: false, configurable: false });
    } catch {
      try {
        g[name] = blocked;
      } catch {
        // leave it
      }
    }
  }
}

const deps: JsDeps = {
  transform: (code, ts) => transform(code, { transforms: ts ? ["typescript"] : [], disableESTransforms: true }).code,
  out: write,
};

let ready = false;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data || {};
  if (msg.type === "init") {
    const t0 = performance.now();
    try {
      deps.transform("const x: number = 1;", true); // warm the parser
      lockDown();
      ready = true;
      post({ type: "ready", ms: Math.round(performance.now() - t0), version: "sucrase", python: "" });
    } catch (err) {
      post({ type: "fatal", message: String((err as Error)?.message ?? err) });
    }
    return;
  }
  if (msg.type !== "run") return;
  if (!ready) {
    post({ type: "error", id: msg.id, message: "JavaScript is still loading" });
    return;
  }
  current = { id: msg.id, sent: 0, cap: msg.maxOutput || 50_000, buf: "", last: Date.now(), truncated: false };
  const t0 = performance.now();
  try {
    const a = msg.args || [];
    let result: unknown;
    if (msg.entry === "__hk_lab_run") result = await jsLabRun(a[0], a[1], deps);
    else if (msg.entry === "__hk_lab_chaos") result = await jsLabChaos(a[0], a[1], a[2], deps);
    else if (msg.entry === "__hk_lab_scale") result = await jsLabScale(a[0], a[1], a[2], deps);
    else throw new Error(`unknown harness entry ${msg.entry}`);
    flush(true);
    post({ type: "done", id: msg.id, result: JSON.stringify(result), ms: Math.round(performance.now() - t0) });
  } catch (err) {
    flush(true);
    post({ type: "error", id: msg.id, message: String((err as Error)?.message ?? err) });
  } finally {
    current = null;
  }
};
