// Rolling latency percentiles and the verdict mix for GET /health.

export class Stats {
  private readonly window: number;
  private total: number[] = [];
  private judge: number[] = [];
  private queue: number[] = [];
  readonly verdicts: Record<string, number> = {};
  readonly byLanguage: Record<string, number> = {};
  errors = 0;
  readonly startedAt = Date.now();

  constructor(window = 1000) {
    this.window = window;
  }

  private push(arr: number[], v: number): void {
    arr.push(v);
    if (arr.length > this.window) arr.shift();
  }

  record(opts: { verdict: string; language: string; totalMs: number; judgeMs: number; queueMs: number }): void {
    this.push(this.total, opts.totalMs);
    this.push(this.judge, opts.judgeMs);
    this.push(this.queue, opts.queueMs);
    this.verdicts[opts.verdict] = (this.verdicts[opts.verdict] ?? 0) + 1;
    this.byLanguage[opts.language] = (this.byLanguage[opts.language] ?? 0) + 1;
  }

  static percentile(values: number[], p: number): number | null {
    if (values.length === 0) return null;
    const s = [...values].sort((a, b) => a - b);
    const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
    return s[idx];
  }

  snapshot() {
    const pct = (a: number[]) => ({ p50Ms: Stats.percentile(a, 50), p95Ms: Stats.percentile(a, 95) });
    return {
      samples: this.total.length,
      total: pct(this.total),
      judge: pct(this.judge),
      queue: pct(this.queue),
    };
  }
}
