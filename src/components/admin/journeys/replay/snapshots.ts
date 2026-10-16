/**
 * Client-side helpers for the admin replay player: chunk plan, JSONL → rrweb events, per-window
 * grouping, meta patching and inactivity segments. Pure (no React, no rrweb import) so the player
 * chunk stays the only heavy bit.
 */

export type RrEvent = { type: number; timestamp: number; data?: unknown; delay?: number; cv?: string };

export const EV = { FullSnapshot: 2, Incremental: 3, Meta: 4 } as const;

/** rrweb IncrementalSource values that mean "the user did something". */
const ACTIVE_SOURCES = new Set([1, 2, 3, 4, 5, 6, 7, 12]);
/** Gaps longer than this are "inactive" (rrweb's own skip threshold is 10 s). */
export const INACTIVE_MS = 10_000;

/** [from, to] blob ranges: a small first chunk (fast first frame), then `chunk` blobs at a time. */
export function chunkPlan(keys: number[], chunk: number): [number, number][] {
  if (!keys.length) return [];
  const sorted = [...keys].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const out: [number, number][] = [];
  const first = Math.min(hi, lo + 1);
  out.push([lo, first]);
  for (let a = first + 1; a <= hi; a += chunk) out.push([a, Math.min(hi, a + chunk - 1)]);
  return out;
}

/** JSONL `[windowId, event]` → pairs (bad lines and still-compressed events are dropped). */
export function parseChunk(text: string): [string, RrEvent][] {
  const out: [string, RrEvent][] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const v = JSON.parse(line) as [string, RrEvent];
      const ev = v?.[1];
      if (!ev || typeof ev.type !== "number" || typeof ev.timestamp !== "number") continue;
      if (ev.cv) continue; // server couldn't inflate it: rrweb can't apply a compressed payload
      out.push([String(v[0] ?? ""), ev]);
    } catch {
      /* skip */
    }
  }
  return out;
}

type Viewport = { width: number; height: number; href: string };

const metaOf = (ev: RrEvent): Viewport | null => {
  const d = ev.data as { width?: number; height?: number; href?: string } | undefined;
  return ev.type === EV.Meta && d?.width && d?.height ? { width: d.width, height: d.height, href: d.href || "" } : null;
};

/**
 * Playable events for one window: sorted, starting at its first meta / full snapshot, with a
 * synthetic Meta in front of a full snapshot that has none (rrweb needs the viewport size).
 */
export function playable(events: RrEvent[], fallback: Viewport | null): RrEvent[] {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const fi = sorted.findIndex((e) => e.type === EV.FullSnapshot);
  if (fi < 0) return [];
  const mi = sorted.slice(0, fi + 1).findLastIndex((e) => e.type === EV.Meta);
  if (mi >= 0) return sorted.slice(mi);
  const vp = fallback || { width: 1280, height: 800, href: "" };
  return [{ type: EV.Meta, timestamp: sorted[fi].timestamp, data: vp }, ...sorted.slice(fi)];
}

/** Collects pairs per window across chunks. */
export class WindowStore {
  byWindow = new Map<string, RrEvent[]>();
  /** windows in order of their first full snapshot */
  order: string[] = [];
  viewport: Viewport | null = null;
  last = 0;

  add(pairs: [string, RrEvent][]) {
    for (const [w, ev] of pairs) {
      let list = this.byWindow.get(w);
      if (!list) {
        list = [];
        this.byWindow.set(w, list);
      }
      list.push(ev);
      if (ev.type === EV.FullSnapshot && !this.order.includes(w)) this.order.push(w);
      if (!this.viewport) this.viewport = metaOf(ev);
      if (ev.timestamp > this.last) this.last = ev.timestamp;
    }
  }

  /** windows that can be played (have a full snapshot) */
  windows() {
    return this.order.filter((w) => (this.byWindow.get(w)?.length ?? 0) >= 2);
  }

  lastOf(w: string) {
    const list = this.byWindow.get(w) || [];
    let m = 0;
    for (const e of list) if (e.timestamp > m) m = e.timestamp;
    return m;
  }
}

/** Inactive stretches [from, to] (ms offsets from `base`) between user interactions. */
export function inactiveSegments(events: RrEvent[], base: number, end: number): [number, number][] {
  const times: number[] = [];
  for (const e of events) {
    if (e.type === EV.FullSnapshot || e.type === EV.Meta) times.push(e.timestamp);
    else if (e.type === EV.Incremental && ACTIVE_SOURCES.has(Number((e.data as { source?: number } | undefined)?.source))) times.push(e.timestamp);
  }
  times.sort((a, b) => a - b);
  const out: [number, number][] = [];
  let prev = base;
  for (const t of times) {
    if (t - prev > INACTIVE_MS) out.push([prev - base, t - base]);
    prev = Math.max(prev, t);
  }
  if (end - prev > INACTIVE_MS) out.push([prev - base, end - base]);
  return out;
}
