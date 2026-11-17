import type { RunOutcome } from "@/lib/dsa/exercises";

/** The time a run may take before it counts as stuck. */
export const BREAKIT_TIMEOUT_MS = 1000;
const START_TIMEOUT_MS = 15000;

/** Run `solve` from `code` on `args` in its own Web Worker; resolves with the outcome, `timeout` after 1 s. */
export function runInWorker(code: string, args: unknown[]): Promise<RunOutcome> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./breakit.worker.ts", import.meta.url), { type: "module", name: "hk-breakit" });
    } catch {
      resolve({ status: "error", text: "This browser can't run Web Workers." });
      return;
    }
    let settled = false;
    let timer = 0;
    const finish = (r: RunOutcome) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker.terminate();
      resolve(r);
    };
    // loading the worker's code may take a while on a slow network: give it its own, longer allowance
    timer = window.setTimeout(() => finish({ status: "error", text: "The runner didn't start. Check your connection and try again." }), START_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<{ ready?: boolean; result?: RunOutcome }>) => {
      if (e.data.ready) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => finish({ status: "timeout", text: `No answer after ${BREAKIT_TIMEOUT_MS / 1000} second: it is stuck in a loop.` }), BREAKIT_TIMEOUT_MS);
        worker.postMessage({ code, args });
      } else if (e.data.result) finish(e.data.result);
    };
    worker.onerror = (e) => finish({ status: "error", text: e.message || "The worker failed to start." });
  });
}
