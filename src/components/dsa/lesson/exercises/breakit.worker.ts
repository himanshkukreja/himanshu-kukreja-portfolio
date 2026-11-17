/**
 * Break it: runs one JavaScript `solve` on one input, away from the page. The page terminates this worker after 1 s
 * (runBreakit.ts), so a loop that never ends is reported as a timeout. No network inside the worker.
 */
import { evalSolve } from "@/lib/dsa/exercises";

const g = self as unknown as Record<string, unknown> & { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent) => void) | null };
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "BroadcastChannel"]) {
  try {
    Object.defineProperty(g, name, { value: undefined, writable: false, configurable: false });
  } catch {
    /* already locked */
  }
}

g.onmessage = (e: MessageEvent<{ code: string; args: unknown[] }>) => {
  g.postMessage({ result: evalSolve(e.data.code, e.data.args) });
};
// the page starts its 1 s clock only after this, so loading the worker's code never counts against a run
g.postMessage({ ready: true });
