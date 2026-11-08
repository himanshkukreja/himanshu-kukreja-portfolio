import "server-only";
import { supabase } from "@/lib/supabase";
import { background } from "@/lib/platform";

/**
 * One copy of analytics_events for the admin dashboards (Learners, Traffic and what's built on them), kept up to date
 * by fetching only the rows added since the last look.
 *
 * Why: every dashboard card refreshes on its own schedule (sharedCache, 1 to 5 min), and each refresh rebuilt its data
 * by paging through the WHOLE table (~15k rows, ~23 columns, ~10 MB of JSON). The 30-60 s per-instance memo almost
 * never hit on Cloudflare, where requests spread over many short-lived isolates, so an open admin tab pulled the table
 * from Supabase ~7 times an hour: 8 GB of egress in a month against the free plan's 5 GB (8 Nov 2026).
 *
 * Now:
 * - the rows live in this isolate's memory, and on Cloudflare also gzipped in Workers KV (PAGES binding), which isn't
 *   Supabase egress, so a fresh isolate starts from KV instead of the database;
 * - a look at most every SYNC_MS fetches rows with created_at after the newest row held (minus OVERLAP_MS for late
 *   inserts, de-duplicated by id): usually a handful of rows;
 * - every FULL_MS the whole table is read once more, which also drops rows deleted since (learner resets call
 *   invalidateEventStore() to drop the copy at once).
 *
 * Outside Cloudflare (next dev, Vercel) there's no KV: memory only, same rules.
 */

/** Every column the Learners dataset (EVENT_COLS) and the Traffic report (COLUMNS) read. */
const COLS =
  "id,event_type,page_path,page_title,visitor_id,session_id,referrer,referrer_domain,utm_source,utm_medium,utm_campaign,user_agent,device_type,browser,os,screen_width,screen_height,country,city,ip_address,created_at,duration,metadata,user_id";

export type StoredEvent = Record<string, unknown> & { id: string; created_at: string };

type Snap = { rows: StoredEvent[]; full: number; synced: number };

const KEY = "admin:analytics-events:v1";
const SYNC_MS = 20_000;
const FULL_MS = 3 * 3600_000;
const OVERLAP_MS = 5 * 60_000;
const KV_WRITE_MS = 60_000;
const PAGE = 1000;
const PARALLEL = 6;

type Kv = {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};
const kv = (): Kv | undefined =>
  (globalThis as unknown as Record<symbol, { env?: { PAGES?: Kv } } | undefined>)[Symbol.for("__cloudflare-context__")]?.env?.PAGES;

async function pipe(data: BufferSource, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer();
}

async function kvRead(): Promise<Snap | null> {
  const store = kv();
  if (!store) return null;
  const buf = await store.get(KEY, "arrayBuffer");
  if (!buf) return null;
  const snap = JSON.parse(new TextDecoder().decode(await pipe(buf, new DecompressionStream("gzip")))) as Snap;
  return Array.isArray(snap?.rows) && typeof snap.full === "number" ? snap : null;
}

let lastKvWrite = 0;
async function kvWrite(snap: Snap): Promise<void> {
  const store = kv();
  if (!store) return;
  lastKvWrite = Date.now();
  const gz = await pipe(new TextEncoder().encode(JSON.stringify(snap)), new CompressionStream("gzip"));
  await store.put(KEY, gz, { expirationTtl: 86_400 });
}

const byTime = (a: StoredEvent, b: StoredEvent) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

async function readFull(): Promise<StoredEvent[]> {
  const head = await supabase.from("analytics_events").select("id", { count: "exact", head: true });
  if (head.error) throw new Error(`analytics_events: ${head.error.message}`);
  const total = head.count ?? 0;
  const offsets: number[] = [];
  for (let o = 0; o < total; o += PAGE) offsets.push(o);
  const pages: StoredEvent[][] = new Array(offsets.length);
  for (let i = 0; i < offsets.length; i += PARALLEL) {
    await Promise.all(
      offsets.slice(i, i + PARALLEL).map(async (o, j) => {
        const { data, error } = await supabase
          .from("analytics_events")
          .select(COLS)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(o, o + PAGE - 1);
        if (error) throw new Error(`analytics_events: ${error.message}`);
        pages[i + j] = (data ?? []) as unknown as StoredEvent[];
      })
    );
  }
  // pages can overlap if rows arrive mid-read
  const seen = new Set<string>();
  const rows: StoredEvent[] = [];
  for (const p of pages)
    for (const r of p) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }
  return rows.sort(byTime);
}

async function readSince(iso: string): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for (let o = 0; ; o += PAGE) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select(COLS)
      .gte("created_at", iso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(o, o + PAGE - 1);
    if (error) throw new Error(`analytics_events: ${error.message}`);
    out.push(...((data ?? []) as unknown as StoredEvent[]));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

function merge(snap: Snap, fresh: StoredEvent[], now: number): { snap: Snap; added: number } {
  if (!fresh.length) return { snap: { ...snap, synced: now }, added: 0 };
  const cut = fresh[0].created_at;
  const held = new Set<string>();
  for (let i = snap.rows.length - 1; i >= 0 && snap.rows[i].created_at >= cut; i--) held.add(snap.rows[i].id);
  const add = fresh.filter((r) => !held.has(r.id));
  if (!add.length) return { snap: { ...snap, synced: now }, added: 0 };
  return { snap: { rows: [...snap.rows, ...add].sort(byTime), full: snap.full, synced: now }, added: add.length };
}

let mem: Snap | null = null;
let pending: Promise<Snap> | null = null;

async function refresh(): Promise<Snap> {
  const now = Date.now();
  let snap = mem && now - mem.full < FULL_MS ? mem : null;
  if (!snap) {
    const stored = await kvRead().catch(() => null);
    snap = stored && now - stored.full < FULL_MS ? stored : null;
  }
  let changed = false;
  if (!snap) {
    snap = { rows: await readFull(), full: now, synced: now };
    changed = true;
  } else {
    const newest = snap.rows.length ? Date.parse(snap.rows[snap.rows.length - 1].created_at) : snap.full;
    const r = merge(snap, await readSince(new Date(newest - OVERLAP_MS).toISOString()), now);
    snap = r.snap;
    changed = r.added > 0;
  }
  mem = snap;
  if (changed && Date.now() - lastKvWrite > KV_WRITE_MS) background(kvWrite(snap));
  return snap;
}

/** Every analytics event (oldest first), at most SYNC_MS behind the database. Callers filter by window themselves. */
export async function allEvents(): Promise<StoredEvent[]> {
  if (mem && Date.now() - mem.synced < SYNC_MS && Date.now() - mem.full < FULL_MS) return mem.rows;
  if (!pending) pending = refresh().finally(() => (pending = null));
  return (await pending).rows;
}

/** Drop every copy (after rows were deleted, e.g. a learner reset); the next read loads the table again. */
export function invalidateEventStore(): void {
  mem = null;
  const store = kv();
  if (store) background(store.delete(KEY));
}
