"use client";

/**
 * Runs lab code in the Python worker (public/labs-runtime/py-worker.mjs) with a time limit.
 *
 * One worker per page. It loads Pyodide once (the first run pays the download; later runs and
 * later labs reuse it), and a run that exceeds its limit gets the worker terminated and a fresh
 * one started: the only way to stop an infinite loop without SharedArrayBuffer interrupts (which
 * need cross-origin isolation the site doesn't have).
 */
import { HARNESS_PY, type HarnessResult } from "./harness";
import { PYODIDE_BASE, WORKER_URL } from "./runtime";

export type RuntimeStatus =
  | { phase: "idle" }
  | { phase: "loading"; since: number; restart: boolean }
  | { phase: "ready"; loadMs: number; python: string; pyodide: string }
  | { phase: "failed"; message: string };

export type RunOutcome =
  | { kind: "done"; result: HarnessResult; ms: number }
  | { kind: "timeout"; limitMs: number }
  | { kind: "crash"; message: string };

export type RunInput = { code: string; given: string; groups: { name: string; src: string }[]; timeoutMs: number; maxOutput?: number };

type Pending = { id: number; resolve: (o: RunOutcome) => void; timer: number; onOutput: (t: string) => void };

const LOAD_TIMEOUT_MS = 120_000;

export class PyRunner {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pending: Pending | null = null;
  private seq = 0;
  private listeners = new Set<(s: RuntimeStatus) => void>();
  status: RuntimeStatus = { phase: "idle" };
  /** first successful load in this page: the number reported as "first run" */
  firstLoadMs: number | null = null;

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

  /** Start loading Python now (e.g. when the reader focuses the editor), without running anything. */
  warm(): Promise<void> {
    return this.ensure().catch(() => undefined);
  }

  private ensure(restart = false): Promise<void> {
    if (this.ready) return this.ready;
    if (typeof Worker === "undefined") {
      this.set({ phase: "failed", message: "This browser can't run Web Workers, which code labs need." });
      return Promise.reject(new Error("no workers"));
    }
    const since = Date.now();
    this.set({ phase: "loading", since, restart });
    let w: Worker;
    try {
      w = new Worker(WORKER_URL, { type: "module", name: "hk-python" });
    } catch (e) {
      this.set({ phase: "failed", message: `Couldn't start the Python worker: ${(e as Error).message}` });
      return Promise.reject(e);
    }
    this.worker = w;
    this.ready = new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => fail("Python took too long to load. Check your connection and try again."), LOAD_TIMEOUT_MS);
      const fail = (message: string) => {
        window.clearTimeout(t);
        this.kill();
        this.set({ phase: "failed", message });
        reject(new Error(message));
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        if (this.status.phase === "loading") fail(e.message || "The Python worker failed to start (offline and not saved?)");
        else this.crash(e.message || "The Python worker stopped");
      };
      w.onmessage = (e: MessageEvent) => {
        const m = e.data || {};
        if (m.type === "ready") {
          window.clearTimeout(t);
          if (this.firstLoadMs == null) this.firstLoadMs = Date.now() - since;
          this.set({ phase: "ready", loadMs: Date.now() - since, python: m.python, pyodide: m.version });
          resolve();
        } else if (m.type === "fatal") {
          fail(navigator.onLine ? `Python failed to load: ${m.message}` : "You're offline and the Python runtime isn't saved on this device yet. Save this lab offline while online to run it anywhere.");
        } else this.message(m);
      };
      w.postMessage({ type: "init", base: PYODIDE_BASE, harness: HARNESS_PY });
    });
    return this.ready;
  }

  private message(m: { type: string; id: number; text?: string; result?: string; ms?: number; message?: string }) {
    const p = this.pending;
    if (!p || m.id !== p.id) return;
    if (m.type === "out" && m.text) p.onOutput(m.text);
    else if (m.type === "done") {
      this.finish({ kind: "done", result: JSON.parse(m.result || "{}") as HarnessResult, ms: m.ms ?? 0 });
    } else if (m.type === "error") this.finish({ kind: "crash", message: m.message || "the run failed" });
  }

  private finish(o: RunOutcome) {
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

  async run(input: RunInput, onOutput: (text: string) => void): Promise<RunOutcome> {
    if (this.pending) return { kind: "crash", message: "a run is already in progress" };
    try {
      await this.ensure();
    } catch (e) {
      return { kind: "crash", message: this.status.phase === "failed" ? this.status.message : (e as Error).message };
    }
    const w = this.worker;
    if (!w) return { kind: "crash", message: "the Python worker is not running" };
    const id = ++this.seq;
    return new Promise<RunOutcome>((resolve) => {
      const timer = window.setTimeout(() => {
        // infinite loop (or just too slow): the worker can't be interrupted, so replace it
        this.kill();
        this.finish({ kind: "timeout", limitMs: input.timeoutMs });
        void this.ensure(true).catch(() => undefined);
      }, input.timeoutMs);
      this.pending = { id, resolve, timer, onOutput };
      w.postMessage({ type: "run", id, code: input.code, given: input.given, groups: input.groups, maxOutput: input.maxOutput ?? 50_000 });
    });
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
// one runner per tab, shared by every lab page: Python stays loaded while the reader moves between
// labs, and is shut down a minute after the last lab page closes (it holds ~100 MB in the worker)

let shared: PyRunner | null = null;
let users = 0;
let idleTimer: number | null = null;

export function getRunner(): PyRunner {
  shared ??= new PyRunner();
  return shared;
}

export function retainRunner(): () => void {
  users++;
  if (idleTimer) window.clearTimeout(idleTimer);
  idleTimer = null;
  return () => {
    users = Math.max(0, users - 1);
    if (users) return;
    idleTimer = window.setTimeout(() => {
      shared?.dispose();
      shared = null;
      idleTimer = null;
    }, 60_000);
  };
}
