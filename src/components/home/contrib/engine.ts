// Pure snake simulation over the contribution grid (no DOM). The component owns timing and drawing.
// Cells are indexed column-major like GitHub's calendar: idx = col * ROWS + row.

export const ROWS = 7;

/** 0 up · 1 right · 2 down · 3 left */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export type Mode = "attract" | "play" | "paused" | "over";

export type GridCell = { count: number; level: number; date: string } | null;

export type EngineEvent =
  | { type: "eat"; idx: number; count: number; score: number; eaten: number; mode: Mode }
  | { type: "over"; score: number; eaten: number; won: boolean }
  | { type: "cleared" };

export type Pop = { idx: number; n: number; t: number };

const ATTRACT_LEN = 6;
const ATTRACT_STEP_MS = 92;
const PLAY_START_MS = 165;
const PLAY_MIN_MS = 62;
const RESTORE_DELAY_MS = 1400;

export class SnakeEngine {
  cols = 0;
  cells: GridCell[] = [];
  /** Time a cell was eaten (0 = still there). */
  eatenAt = new Float64Array(0);
  /** Time a cell started growing back (attract loop). */
  restoredAt = new Float64Array(0);
  snake: number[] = [];
  prev: number[] = [];
  dir: Dir = 1;
  private queue: Dir[] = [];
  mode: Mode = "attract";
  stepMs = ATTRACT_STEP_MS;
  lastStep = 0;
  score = 0;
  eaten = 0;
  food = 0;
  won = false;
  clearedAt = 0;
  pops: Pop[] = [];
  /** Interpolation fraction frozen while paused / over. */
  frozenT = 1;
  onEvent: (e: EngineEvent) => void = () => {};

  setCells(cells: GridCell[], cols: number, now: number) {
    this.cells = cells;
    this.cols = cols;
    this.eatenAt = new Float64Array(cells.length);
    this.restoredAt = new Float64Array(cells.length);
    this.pops = [];
    this.resetAttract(now);
  }

  get size() {
    return this.cells.length;
  }

  isFood(i: number) {
    const c = this.cells[i];
    return !!c && c.count > 0 && this.eatenAt[i] === 0;
  }

  private countFood() {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (this.isFood(i)) n++;
    return n;
  }

  private spawn(len: number) {
    const row = 3;
    const col = Math.min(len, Math.max(0, this.cols - 1));
    this.snake = [];
    for (let k = 0; k < len; k++) this.snake.push(Math.max(0, col - k) * ROWS + row);
    this.prev = this.snake.slice();
    this.dir = 1;
    this.queue = [];
  }

  resetAttract(now: number) {
    this.mode = "attract";
    this.stepMs = ATTRACT_STEP_MS;
    this.lastStep = now;
    this.score = 0;
    this.eaten = 0;
    this.won = false;
    this.clearedAt = 0;
    this.eatenAt.fill(0);
    this.spawn(Math.min(ATTRACT_LEN, Math.max(2, this.cols - 1)));
    this.food = this.countFood();
  }

  startPlay(now: number) {
    this.mode = "play";
    this.stepMs = PLAY_START_MS;
    this.lastStep = now;
    this.score = 0;
    this.eaten = 0;
    this.won = false;
    this.clearedAt = 0;
    this.pops = [];
    // Fresh board: everything grows back with a quick left-to-right wave.
    for (let i = 0; i < this.size; i++) {
      if (this.eatenAt[i]) this.restoredAt[i] = now + Math.floor(i / ROWS) * 6;
      this.eatenAt[i] = 0;
    }
    this.spawn(3);
    this.food = this.countFood();
  }

  pause(now: number) {
    if (this.mode !== "play") return;
    this.frozenT = this.interp(now);
    this.mode = "paused";
  }

  resume(now: number) {
    if (this.mode !== "paused") return;
    this.mode = "play";
    this.lastStep = now - this.frozenT * this.stepMs;
  }

  /** Queue a turn; ignores reversals and repeats so fast double-taps feel right. */
  turn(d: Dir) {
    if (this.mode !== "play") return;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d === last || (d + 2) % 4 === last) return;
    if (this.queue.length < 3) this.queue.push(d);
  }

  /** 0..1 progress between the previous and current step, for smooth drawing. */
  interp(now: number) {
    if (this.mode === "paused" || this.mode === "over") return this.frozenT;
    return Math.max(0, Math.min(1, (now - this.lastStep) / this.stepMs));
  }

  /** True while a one-off effect (eat fade, regrow wave, "+N" pop) is still playing. */
  transient(now: number) {
    if (this.pops.some((p) => now - p.t < 700)) return true;
    for (let i = 0; i < this.size; i++) if (now - this.eatenAt[i] < 400 || now - this.restoredAt[i] < 600) return true;
    return false;
  }

  setListener(fn: (e: EngineEvent) => void) {
    this.onEvent = fn;
  }

  update(now: number) {
    this.pops = this.pops.filter((p) => now - p.t < 700);
    if (this.mode !== "attract" && this.mode !== "play") return;
    if (this.mode === "attract" && this.clearedAt && now - this.clearedAt > RESTORE_DELAY_MS) this.regrow(now);
    let guard = 0;
    while (now - this.lastStep >= this.stepMs && guard++ < 4) {
      this.lastStep += this.stepMs;
      if (this.mode === "attract") this.stepAttract(this.lastStep);
      else if (this.mode === "play") this.stepPlay(this.lastStep);
      else break;
    }
    // Tab was asleep: don't fast-forward through minutes of steps.
    if (now - this.lastStep > this.stepMs * 4) this.lastStep = now;
  }

  private regrow(now: number) {
    for (let i = 0; i < this.size; i++) {
      if (this.eatenAt[i]) this.restoredAt[i] = now + Math.floor(i / ROWS) * 14;
      this.eatenAt[i] = 0;
    }
    this.clearedAt = 0;
    this.food = this.countFood();
  }

  private neighbor(i: number, d: Dir, wrap: boolean): number {
    const c = Math.floor(i / ROWS);
    const r = i % ROWS;
    let nc = c + DX[d];
    let nr = r + DY[d];
    if (wrap) {
      nc = (nc + this.cols) % this.cols;
      nr = (nr + ROWS) % ROWS;
    } else if (nc < 0 || nc >= this.cols || nr < 0 || nr >= ROWS) return -1;
    return nc * ROWS + nr;
  }

  /** BFS to the nearest uneaten contribution; returns the first direction to take, or -1. */
  private seek(): number {
    const head = this.snake[0];
    const blocked = new Uint8Array(this.size);
    for (let k = 0; k < this.snake.length - 1; k++) blocked[this.snake[k]] = 1;
    const firstDir = new Int8Array(this.size).fill(-1);
    const seen = new Uint8Array(this.size);
    seen[head] = 1;
    let frontier = [head];
    // Prefer going straight, then turning, so the path reads like a snake rather than a zig-zag.
    const order: Dir[] = [this.dir, ((this.dir + 1) % 4) as Dir, ((this.dir + 3) % 4) as Dir, ((this.dir + 2) % 4) as Dir];
    while (frontier.length) {
      const next: number[] = [];
      for (const i of frontier) {
        for (const d of order) {
          const n = this.neighbor(i, d, false);
          if (n < 0 || seen[n] || blocked[n]) continue;
          seen[n] = 1;
          firstDir[n] = i === head ? d : firstDir[i];
          if (this.isFood(n)) return firstDir[n];
          next.push(n);
        }
      }
      frontier = next;
    }
    return -1;
  }

  private move(next: number, grow: boolean) {
    this.prev = this.snake.slice();
    this.snake.unshift(next);
    if (!grow) this.snake.pop();
    else this.prev.push(this.prev[this.prev.length - 1]);
  }

  private eat(i: number, now: number) {
    const n = this.cells[i]!.count;
    this.eatenAt[i] = now;
    this.restoredAt[i] = 0;
    this.eaten++;
    this.food--;
    this.score += n;
    this.pops.push({ idx: i, n, t: now });
    this.onEvent({ type: "eat", idx: i, count: n, score: this.score, eaten: this.eaten, mode: this.mode });
  }

  private stepAttract(now: number) {
    let d = this.food > 0 ? this.seek() : -1;
    if (d < 0) {
      // Nothing reachable (or the board is clear): wander, preferring straight lines.
      const blocked = new Set(this.snake.slice(0, -1));
      const opts = [this.dir, (this.dir + 1) % 4, (this.dir + 3) % 4] as Dir[];
      d = opts.find((o) => {
        const n = this.neighbor(this.snake[0], o, false);
        return n >= 0 && !blocked.has(n);
      }) ?? -1;
      if (d < 0) {
        this.spawn(this.snake.length);
        return;
      }
    }
    this.dir = d as Dir;
    const next = this.neighbor(this.snake[0], this.dir, false);
    this.move(next, false);
    if (this.isFood(next)) {
      this.eat(next, now);
      if (this.food === 0) {
        this.clearedAt = now;
        this.onEvent({ type: "cleared" });
      }
    }
  }

  private stepPlay(now: number) {
    const q = this.queue.shift();
    if (q !== undefined) this.dir = q;
    const next = this.neighbor(this.snake[0], this.dir, true);
    const grow = this.isFood(next);
    const body = grow ? this.snake : this.snake.slice(0, -1);
    if (body.includes(next)) {
      this.frozenT = 1;
      this.mode = "over";
      this.onEvent({ type: "over", score: this.score, eaten: this.eaten, won: false });
      return;
    }
    this.move(next, grow);
    if (grow) {
      this.eat(next, now);
      this.stepMs = Math.max(PLAY_MIN_MS, PLAY_START_MS - this.eaten * 2.4);
      if (this.food === 0) {
        this.won = true;
        this.frozenT = 1;
        this.mode = "over";
        this.onEvent({ type: "over", score: this.score, eaten: this.eaten, won: true });
      }
    }
  }
}
