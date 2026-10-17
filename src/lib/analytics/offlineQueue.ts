"use client";

/**
 * Durable queue for product analytics captured with no connection (offline reading): one
 * localStorage key per event (`hk.an.q.<uuid>`), so two tabs appending never overwrite each
 * other, flushed by src/lib/analytics/client.ts once the site is reachable again.
 *
 * - Capped: at most MAX events (oldest dropped first), each at most MAX_BYTES of JSON, none older
 *   than MAX_AGE_MS. Storage full / blocked: kept in memory for this page instead.
 * - Every event carries a UUID made when it was queued and its original epoch-ms time, so a resend
 *   after a lost response is the same event to PostHog (deduplicated by uuid), at the real time.
 * - One flush at a time across tabs (Web Locks when available, else a short localStorage lease).
 */

export type QueuedEvent = {
  /** event uuid (sent as the PostHog event uuid) */
  id: string;
  /** event name */
  e: string;
  /** properties (already enriched with the page / device context of the original moment) */
  p: Record<string, unknown>;
  /** epoch ms when it happened */
  ts: number;
  /** the full PostHog property set was computed when queued (posthog-js was loaded then) */
  full?: 1;
};

const PREFIX = "hk.an.q.";
const LEASE_KEY = "hk.an.q-lease";
const MAX = 400;
const MAX_BYTES = 6000;
const MAX_AGE_MS = 45 * 24 * 3600_000;

const memory = new Map<string, QueuedEvent>();

const ls = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* insecure context */
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function keys(store: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(PREFIX)) out.push(k);
  }
  return out;
}

function parse(raw: string | null): QueuedEvent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as QueuedEvent;
    return v && typeof v.id === "string" && typeof v.e === "string" && typeof v.ts === "number" && v.p && typeof v.p === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Everything queued (this browser + this page's in-memory overflow), oldest first. */
export function pendingEvents(): QueuedEvent[] {
  const out = new Map<string, QueuedEvent>(memory);
  const store = ls();
  if (store) {
    for (const k of keys(store)) {
      const ev = parse(store.getItem(k));
      if (!ev || Date.now() - ev.ts > MAX_AGE_MS) {
        try {
          store.removeItem(k);
        } catch {
          /* ignore */
        }
        continue;
      }
      out.set(ev.id, ev);
    }
  }
  return [...out.values()].filter((e) => Date.now() - e.ts <= MAX_AGE_MS).sort((a, b) => a.ts - b.ts);
}

export const pendingCount = () => pendingEvents().length;

/** Queue one event. Returns false when it was too large to keep. */
export function enqueueEvent(ev: QueuedEvent): boolean {
  let json = JSON.stringify(ev);
  if (json.length > MAX_BYTES) {
    // long strings (titles, urls) are what grows: trim them, then give up
    const p: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ev.p)) p[k] = typeof v === "string" && v.length > 300 ? v.slice(0, 300) : v;
    ev = { ...ev, p };
    json = JSON.stringify(ev);
    if (json.length > MAX_BYTES) return false;
  }
  const store = ls();
  if (store) {
    try {
      const ks = keys(store);
      if (ks.length >= MAX) {
        // drop the oldest to make room
        const old = ks
          .map((k) => ({ k, ts: parse(store.getItem(k))?.ts ?? 0 }))
          .sort((a, b) => a.ts - b.ts)
          .slice(0, ks.length - MAX + 1);
        old.forEach((o) => store.removeItem(o.k));
      }
      store.setItem(PREFIX + ev.id, json);
      return true;
    } catch {
      // quota / blocked: fall through to memory
    }
  }
  if (memory.size >= MAX) memory.delete(memory.keys().next().value as string);
  memory.set(ev.id, ev);
  return true;
}

export function removeEvents(ids: string[]) {
  const store = ls();
  for (const id of ids) {
    memory.delete(id);
    try {
      store?.removeItem(PREFIX + id);
    } catch {
      /* ignore */
    }
  }
}

export function clearEvents() {
  memory.clear();
  const store = ls();
  if (!store) return;
  for (const k of keys(store)) {
    try {
      store.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** Run `fn` while no other tab is flushing (skips, returning false, when one is). */
export async function withFlushLock(fn: () => Promise<void>): Promise<boolean> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks?.request) {
    let ran = false;
    await locks.request("hk-analytics-offline-flush", { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      ran = true;
      await fn();
    });
    return ran;
  }
  const store = ls();
  const now = Date.now();
  const me = newEventId();
  try {
    const cur = store?.getItem(LEASE_KEY);
    const [, until] = (cur || "").split("|");
    if (cur && Number(until) > now) return false;
    store?.setItem(LEASE_KEY, `${me}|${now + 20_000}`);
    if (store && !store.getItem(LEASE_KEY)?.startsWith(me)) return false;
  } catch {
    /* no storage: this page is the only one that can see its memory queue anyway */
  }
  try {
    await fn();
  } finally {
    try {
      if (store?.getItem(LEASE_KEY)?.startsWith(me)) store.removeItem(LEASE_KEY);
    } catch {
      /* ignore */
    }
  }
  return true;
}
