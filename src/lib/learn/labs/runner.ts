"use client";

/**
 * Runs lab code in a Web Worker with a time limit: Python in public/labs-runtime/py-worker.mjs
 * (Pyodide), JavaScript and TypeScript in js.worker.ts (bundled with the site: the harness and the
 * sucrase transpiler). Both speak one protocol and return the same JSON (harness.ts types).
 *
 * One worker per language per tab. Python loads once (the first run pays the download; later runs and
 * later labs reuse it), and a run that exceeds its limit gets its worker terminated and a fresh one
 * started: the only way to stop an infinite loop without SharedArrayBuffer interrupts (which need
 * cross-origin isolation the site doesn't have).
 *
 * Messages in:   { type: "init", ... }   { type: "run", id, entry, args: [...], maxOutput }
 * Messages out:  { type: "ready", ms, version, python? }   { type: "fatal", message }
 *                { type: "out", id, text }   { type: "done", id, result, ms }   { type: "error", id, message }
 */
import { HARNESS_PY, type ChaosResult, type HarnessEntry, type HarnessResult, type ScaleResult } from "./harness";
import { PYODIDE_BASE, WORKER_URL } from "./runtime";
import type { LabFamily } from "./types";

export type RuntimeStatus =
  | { phase: "idle" }
  | { phase: "loading"; since: number; restart: boolean }
  | { phase: "ready"; loadMs: number; python: string; pyodide: string }
  | { phase: "failed"; message: string };

export type RunOutcome<R = HarnessResult> = { kind: "done"; result: R; ms: number } | { kind: "timeout"; limitMs: number } | { kind: "crash"; message: string };

/** A source in the worker protocol (Python ignores `ts`). */
export type WireSrc = { code: string; ts: boolean };
export type TestsInput = { code: string; ts: boolean; given: WireSrc | null; groups: { name: string; src: string; ts: boolean }[] };

type Pending = { id: number; resolve: (o: RunOutcome<unknown>) => void; timer: number; onOutput: (t: string) => void };

const LOAD_TIMEOUT_MS = 120_000;

export class LabRunner {
  readonly family: LabFamily;
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pending: Pending | null = null;
  private seq = 0;
  private listeners = new Set<(s: RuntimeStatus) => void>();
  status: RuntimeStatus = { phase: "idle" };
  /** first successful load in this page: the number reported as "first run" */
  firstLoadMs: number | null = null;

  constructor(family: LabFamily) {
    this.family = family;
  }

  /** subscribe to status changes (useSyncExternalStore-style: no immediate call) */
  onStatus(cb: (s: RuntimeStatus) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private set(s: RuntimeStatus) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  /** Start loading the runtime now (e.g. when the reader focuses the editor), without running anything. */
  warm(): Promise<void> {
    return this.ensure().catch(() => undefined);
  }

  private create(): Worker {
    // both URLs are literal so webpack bundles the JS worker (and its sucrase) as its own chunk
    return this.family === "py" ? new Worker(WORKER_URL, { type: "module", name: "hk-python" }) : new Worker(new URL("./js.worker.ts", import.meta.url), { type: "module", name: "hk-js" });
  }

  private ensure(restart = false): Promise<void> {
    if (this.ready) return this.ready;
    const what = this.family === "py" ? "Python" : "JavaScript";
    if (typeof Worker === "undefined") {
      this.set({ phase: "failed", message: "This browser can't run Web Workers, which code labs need." });
      return Promise.reject(new Error("no workers"));
    }
    const since = Date.now();
    this.set({ phase: "loading", since, restart });
    let w: Worker;
    try {
      w = this.create();
    } catch (e) {
      this.set({ phase: "failed", message: `Couldn't start the ${what} worker: ${(e as Error).message}` });
      return Promise.reject(e);
    }
    this.worker = w;
    this.ready = new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => fail(`${what} took too long to load. Check your connection and try again.`), LOAD_TIMEOUT_MS);
      const fail = (message: string) => {
        window.clearTimeout(t);
        this.kill();
        this.set({ phase: "failed", message });
        reject(new Error(message));
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        if (this.status.phase === "loading") fail(e.message || `The ${what} worker failed to start (offline and not saved?)`);
        else this.crash(e.message || `The ${what} worker stopped`);
      };
      w.onmessage = (e: MessageEvent) => {
        const m = e.data || {};
        if (m.type === "ready") {
          window.clearTimeout(t);
          if (this.firstLoadMs == null) this.firstLoadMs = Date.now() - since;
          this.set({ phase: "ready", loadMs: Date.now() - since, python: m.python ?? "", pyodide: m.version ?? "" });
          resolve();
        } else if (m.type === "fatal") {
          fail(
            navigator.onLine || this.family === "js"
              ? `${what} failed to load: ${m.message}`
              : "You're offline and the Python runtime isn't saved on this device yet. Save this lab offline while online to run it anywhere."
          );
        } else this.message(m);
      };
      w.postMessage(this.family === "py" ? { type: "init", base: PYODIDE_BASE, harness: HARNESS_PY } : { type: "init" });
    });
    return this.ready;
  }

  private message(m: { type: string; id: number; text?: string; result?: string; ms?: number; message?: string }) {
    const p = this.pending;
    if (!p || m.id !== p.id) return;
    if (m.type === "out" && m.text) p.onOutput(m.text);
    else if (m.type === "done") {
      let result: unknown;
      try {
        result = JSON.parse(m.result || "{}");
      } catch {
        this.finish({ kind: "crash", message: "the run returned something that isn't JSON" });
        return;
      }
      this.finish({ kind: "done", result, ms: m.ms ?? 0 });
    } else if (m.type === "error") this.finish({ kind: "crash", message: m.message || "the run failed" });
  }

  private finish(o: RunOutcome<unknown>) {
    const p = this.pending;
    if (!p) return;
    window.clearTimeout(p.timer);
    this.pending = null;
    p.resolve(o);
  }

  private crash(message: string) {
    this.kill();
    this.finish({ kind: "crash", message });
    void this.ensure(true).catch(() => undefined);
  }

  private kill() {
    try {
      this.worker?.terminate();
    } catch {
      // already gone
    }
    this.worker = null;
    this.ready = null;
  }

  get busy() {
    return !!this.pending;
  }

  /** Call a harness entry point in the worker. `args` are already in the worker protocol's shape. */
  async call<R>(entry: HarnessEntry, args: unknown[], timeoutMs: number, onOutput: (text: string) => void = () => {}): Promise<RunOutcome<R>> {
    if (this.pending) return { kind: "crash", message: "a run is already in progress" };
    try {
      await this.ensure();
    } catch (e) {
      return { kind: "crash", message: this.status.phase === "failed" ? this.status.message : (e as Error).message };
    }
    const w = this.worker;
    if (!w) return { kind: "crash", message: "the worker is not running" };
    const id = ++this.seq;
    return new Promise<RunOutcome<R>>((resolve) => {
      const timer = window.setTimeout(() => {
        // infinite loop (or just too slow): the worker can't be interrupted, so replace it
        this.kill();
        this.finish({ kind: "timeout", limitMs: timeoutMs });
        void this.ensure(true).catch(() => undefined);
      }, timeoutMs);
      this.pending = { id, resolve: resolve as (o: RunOutcome<unknown>) => void, timer, onOutput };
      w.postMessage({ type: "run", id, entry, args, maxOutput: 50_000 });
    });
  }

  /** The tests (visible, hidden, a stage's, a follow-up's…). */
  runTests(input: TestsInput, timeoutMs: number, onOutput: (t: string) => void): Promise<RunOutcome<HarnessResult>> {
    if (this.family === "py")
      return this.call<HarnessResult>("__hk_lab_run", [input.code, input.given?.code ?? "", JSON.stringify(input.groups.map((g) => ({ name: g.name, src: g.src })))], timeoutMs, onOutput);
    return this.call<HarnessResult>("__hk_lab_run", [{ code: input.code, ts: input.ts, given: input.given }, input.groups], timeoutMs, onOutput);
  }

  runChaos(input: Omit<TestsInput, "groups">, chaos: WireSrc, opts: { scenarios: string[]; runs: number; seed?: number | null; test?: string | null }, timeoutMs: number): Promise<RunOutcome<ChaosResult>> {
    if (this.family === "py") return this.call<ChaosResult>("__hk_lab_chaos", [input.code, input.given?.code ?? "", chaos.code, JSON.stringify(opts)], timeoutMs);
    return this.call<ChaosResult>("__hk_lab_chaos", [{ code: input.code, ts: input.ts, given: input.given }, chaos, opts], timeoutMs);
  }

  runScale(input: Omit<TestsInput, "groups">, scale: WireSrc, opts: { sizes: number[]; budgetMs: number }, timeoutMs: number): Promise<RunOutcome<ScaleResult>> {
    if (this.family === "py") return this.call<ScaleResult>("__hk_lab_scale", [input.code, input.given?.code ?? "", scale.code, JSON.stringify({ sizes: opts.sizes, budget_ms: opts.budgetMs })], timeoutMs);
    return this.call<ScaleResult>("__hk_lab_scale", [{ code: input.code, ts: input.ts, given: input.given }, scale, opts], timeoutMs);
  }

  dispose() {
    if (this.pending) {
      window.clearTimeout(this.pending.timer);
      this.pending = null;
    }
    this.kill();
    this.listeners.clear();
  }
}

// ------------------------------------------------------------------------------------------------
// one runner per language per tab, shared by every lab page: Python stays loaded while the reader
// moves between labs, and is shut down a minute after the last lab page closes (it holds ~100 MB)

const shared: Partial<Record<LabFamily, LabRunner>> = {};
let users = 0;
let idleTimer: number | null = null;

export function getRunner(family: LabFamily = "py"): LabRunner {
  return (shared[family] ??= new LabRunner(family));
}

export function retainRunner(): () => void {
  users++;
  if (idleTimer) window.clearTimeout(idleTimer);
  idleTimer = null;
  return () => {
    users = Math.max(0, users - 1);
    if (users) return;
    idleTimer = window.setTimeout(() => {
      for (const k of Object.keys(shared) as LabFamily[]) {
        shared[k]?.dispose();
        delete shared[k];
      }
      idleTimer = null;
    }, 60_000);
  };
}
