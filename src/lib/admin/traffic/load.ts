/**
 * Row loading for the traffic report (service role, read-only).
 * Reads a window of analytics_events from the shared copy (eventStore.ts, capped at the 200k most
 * recent rows per window) and caches the normalised dataset for 60 s so every card of one page load
 * shares a single scan.
 */
import { supabase } from "@/lib/supabase";
import { dropInternal } from "@/lib/analytics/excludeServer";
import { allEvents } from "@/lib/admin/eventStore";
import { normalise, type Ev, type RawRow } from "./model";
import { prepare, type Dataset } from "./report";

const PAGE = 1000;
export const CAP = 200_000;
const TTL = 60_000;

export type Loaded = { rows: Ev[]; total: number; capped: boolean };

async function loadRaw(from: number, to: number): Promise<Loaded> {
  // the window's rows from the shared copy of the table (eventStore.ts) instead of paging through Supabase each time
  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();
  const all = (await allEvents()).filter((r) => r.created_at >= fromIso && r.created_at < toIso);
  const total = all.length;
  const skip = Math.max(0, total - CAP); // keep the most recent CAP rows
  // the owner's test accounts, their browsers and dev/localhost rows aren't traffic
  const rows: Ev[] = [];
  for (const r of await dropInternal(all.slice(skip) as unknown as (RawRow & { metadata?: Record<string, unknown> | null })[])) rows.push(normalise(r));
  return { rows, total, capped: skip > 0 };
}

/**
 * Distinct visitor ids matching `filter`, without paging through every row of a heavy visitor:
 * each round excludes the ids already found.
 */
async function distinctVisitors(apply: (q: ReturnType<typeof base>) => ReturnType<typeof base>, ids?: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  const run = async (subset?: string[]) => {
    for (let round = 0; round < 50; round++) {
      let q = apply(base());
      if (subset) {
        const remaining = subset.filter((v) => !found.has(v));
        if (!remaining.length) return;
        q = q.in("visitor_id", remaining);
      } else if (found.size) {
        q = q.not("visitor_id", "in", `(${[...found].map((v) => `"${v.replace(/"/g, "")}"`).join(",")})`);
      }
      const { data, error } = await q.limit(PAGE);
      if (error) throw new Error(error.message);
      const before = found.size;
      for (const r of (data ?? []) as { visitor_id: string }[]) found.add(r.visitor_id);
      if ((data?.length ?? 0) < PAGE || found.size === before) return;
    }
  };
  if (ids) {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 120) chunks.push(ids.slice(i, i + 120));
    for (let i = 0; i < chunks.length; i += 4) await Promise.all(chunks.slice(i, i + 4).map((c) => run(c)));
  } else await run();
  return found;
}
const base = () => supabase.from("analytics_events").select("visitor_id");

const cache = new Map<string, { at: number; p: Promise<unknown> }>();
function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < ttl) return hit.p as Promise<T>;
  if (cache.size > 40) for (const [k, v] of cache) if (now - v.at > ttl) cache.delete(k);
  const p = fn().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: now, p });
  return p;
}

/** Visitor ids that ever carried this (admin) user id — "exclude my visits". */
export function meVisitors(userId: string): Promise<Set<string>> {
  return cached(`me:${userId}`, 5 * 60_000, () => distinctVisitors((q) => q.eq("user_id", userId)));
}

/** Which of `ids` were seen before `before` (→ returning, not new). */
export function priorVisitors(ids: string[], before: number): Promise<Set<string>> {
  if (!ids.length) return Promise.resolve(new Set());
  const iso = new Date(before).toISOString();
  return distinctVisitors((q) => q.lt("created_at", iso), ids);
}

export type DatasetInfo = Dataset & { total: number; capped: boolean; from: number; to: number };

/**
 * Clean dataset for [from, to). `to` is rounded up to the minute so successive requests share
 * the cache. `meUser` (admin id) → that admin's rows and devices are excluded.
 */
export function getDataset(from: number, to: number, meUser: string | null, ttl = TTL): Promise<DatasetInfo> {
  const step = ttl < TTL ? 10_000 : 60_000;
  const toR = Math.ceil(to / step) * step;
  return cached(`ds:${from}:${toR}:${meUser ?? "-"}`, ttl, async () => {
    const [loaded, me] = await Promise.all([
      cached(`raw:${from}:${toR}`, ttl, () => loadRaw(from, toR)),
      meUser ? meVisitors(meUser) : Promise.resolve(new Set<string>()),
    ]);
    const pre = prepare(loaded.rows, { meVisitors: me, meUser });
    const prior = await priorVisitors([...pre.firstSeen.keys()], from);
    return { ...pre, prior, total: loaded.total, capped: loaded.capped, from, to: toR };
  });
}
