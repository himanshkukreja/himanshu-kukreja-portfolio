import { test } from "node:test";
import assert from "node:assert/strict";
import { QueueFullError, WorkQueue } from "../src/queue.ts";
import { Stats } from "../src/stats.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("runs at most N jobs at once, FIFO", async () => {
  const q = new WorkQueue(["w0", "w1"], { maxWaitMs: 60_000, maxDepth: 100, initialJobMs: 10 });
  let running = 0;
  let peak = 0;
  const order: number[] = [];
  const jobs = Array.from({ length: 6 }, (_, i) =>
    q.submit(async () => {
      order.push(i);
      running++;
      peak = Math.max(peak, running);
      await sleep(15);
      running--;
      return i;
    }),
  );
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4, 5]);
  assert.equal(peak, 2);
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5]);
  assert.equal(q.stats().completed, 6);
});

test("refuses with QueueFullError (retry-after) when the estimated wait is over the limit", async () => {
  // 1 worker, 2.5 s estimated per job, 30 s budget -> about 11 jobs can wait.
  const q = new WorkQueue(["w0"], { maxWaitMs: 30_000, maxDepth: 1000, initialJobMs: 2500 });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const accepted: Promise<unknown>[] = [];
  let refused: QueueFullError | null = null;
  for (let i = 0; i < 20; i++) {
    const p = q.submit(() => gate);
    p.catch((e) => {
      if (e instanceof QueueFullError && !refused) refused = e;
    });
    accepted.push(p);
  }
  await sleep(0);
  assert.ok(refused, "some submissions were refused");
  const e = refused as QueueFullError;
  assert.ok(e.retryAfterSec >= 30 && e.retryAfterSec <= 120, `retryAfter=${e.retryAfterSec}`);
  assert.ok(q.stats().depth <= 12, `depth=${q.stats().depth}`);
  assert.equal(q.stats().rejected, 7, "1 running + 12 queued accepted");
  release();
  await Promise.allSettled(accepted);
});

test("drops queued jobs that already waited longer than the limit", async () => {
  let now = 0;
  const q = new WorkQueue(["w0"], { maxWaitMs: 30_000, maxDepth: 10, initialJobMs: 1, now: () => now });
  let release!: () => void;
  const first = q.submit(() => new Promise<void>((r) => (release = r)));
  const second = q.submit(async () => "ran");
  now = 31_000;
  release();
  await first;
  await assert.rejects(second, (e) => e instanceof QueueFullError);
});

test("skips jobs whose client went away", async () => {
  const q = new WorkQueue(["w0"], { maxWaitMs: 30_000, maxDepth: 10, initialJobMs: 1 });
  let release!: () => void;
  const first = q.submit(() => new Promise<void>((r) => (release = r)));
  const ac = new AbortController();
  let ran = false;
  const second = q.submit(async () => {
    ran = true;
  }, ac.signal);
  ac.abort();
  release();
  await first;
  await assert.rejects(second, /client went away/);
  assert.equal(ran, false);
});

test("Stats percentiles and verdict mix", () => {
  const s = new Stats(100);
  for (let i = 1; i <= 100; i++) s.record({ verdict: i % 10 === 0 ? "WA" : "AC", language: "cpp", totalMs: i, judgeMs: i, queueMs: 0 });
  const snap = s.snapshot();
  assert.equal(snap.total.p50Ms, 50);
  assert.equal(snap.total.p95Ms, 95);
  assert.deepEqual(s.verdicts, { AC: 90, WA: 10 });
  assert.equal(Stats.percentile([], 50), null);
});
