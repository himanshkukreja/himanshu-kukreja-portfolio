// FIFO queue with a fixed worker pool (one worker per vCPU by default). Each
// worker owns a compile box and a run box, so jobs never share sandboxes.
//
// Admission control: a job is refused (QueueFullError -> HTTP 503 with
// Retry-After) when its estimated wait is over maxWaitMs, and a queued job that
// has already waited longer than maxWaitMs when a worker frees up is dropped
// the same way. The estimate uses an EWMA of recent job durations.

export class QueueFullError extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number, message = "judge is busy") {
    super(message);
    this.retryAfterSec = retryAfterSec;
  }
}

interface Pending<W, T> {
  run: (worker: W) => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  enqueuedAt: number;
  signal?: AbortSignal;
}

export interface QueueStats {
  workers: number;
  busy: number;
  depth: number;
  estimatedWaitMs: number;
  avgJobMs: number;
  rejected: number;
  completed: number;
}

export class WorkQueue<W> {
  private readonly idle: W[];
  private readonly total: number;
  private readonly pending: Pending<W, unknown>[] = [];
  private readonly maxWaitMs: number;
  private readonly maxDepth: number;
  private avgMs: number;
  private rejected = 0;
  private completed = 0;
  private readonly now: () => number;

  constructor(workers: W[], opts: { maxWaitMs: number; maxDepth: number; initialJobMs?: number; now?: () => number }) {
    if (workers.length === 0) throw new Error("need at least one worker");
    this.idle = [...workers];
    this.total = workers.length;
    this.maxWaitMs = opts.maxWaitMs;
    this.maxDepth = opts.maxDepth;
    this.avgMs = opts.initialJobMs ?? 2500;
    this.now = opts.now ?? Date.now;
  }

  /** Expected wait for a job enqueued now. */
  estimateWaitMs(): number {
    if (this.idle.length > 0 && this.pending.length === 0) return 0;
    const ahead = this.pending.length + 1;
    return Math.ceil(ahead / this.total) * this.avgMs;
  }

  private retryAfter(waitMs: number): number {
    return Math.min(120, Math.max(1, Math.ceil(waitMs / 1000)));
  }

  submit<T>(run: (worker: W) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const wait = this.estimateWaitMs();
    if (wait > this.maxWaitMs || this.pending.length >= this.maxDepth) {
      this.rejected++;
      return Promise.reject(new QueueFullError(this.retryAfter(wait)));
    }
    return new Promise<T>((resolve, reject) => {
      this.pending.push({ run, resolve, reject, enqueuedAt: this.now(), signal } as Pending<W, unknown>);
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length > 0 && this.pending.length > 0) {
      const job = this.pending.shift()!;
      if (job.signal?.aborted) {
        job.reject(new Error("client went away"));
        continue;
      }
      const waited = this.now() - job.enqueuedAt;
      if (waited > this.maxWaitMs) {
        this.rejected++;
        job.reject(new QueueFullError(this.retryAfter(this.estimateWaitMs()), "judge is busy (queue wait exceeded)"));
        continue;
      }
      const worker = this.idle.pop()!;
      const started = this.now();
      job
        .run(worker)
        .then(job.resolve, job.reject)
        .finally(() => {
          const took = this.now() - started;
          this.avgMs = this.avgMs * 0.8 + took * 0.2;
          this.completed++;
          this.idle.push(worker);
          this.pump();
        });
    }
  }

  stats(): QueueStats {
    return {
      workers: this.total,
      busy: this.total - this.idle.length,
      depth: this.pending.length,
      estimatedWaitMs: this.estimateWaitMs(),
      avgJobMs: Math.round(this.avgMs),
      rejected: this.rejected,
      completed: this.completed,
    };
  }
}
