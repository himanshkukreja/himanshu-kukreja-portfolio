import "server-only";
import { unstable_cache } from "next/cache";
import { after } from "next/server";

/**
 * Cross-instance stale-while-revalidate cache for the admin dashboards' read endpoints (PostHog HogQL / REST and the
 * Supabase aggregations behind Traffic, Journeys, Live, Learners, …).
 *
 * Why: on Vercel every request can land on a different function instance, so the old per-instance memory caches
 * almost never hit and each poll paid for a cold PostHog/Supabase round trip (PostHog's query API alone answers in
 * 0.5–20 s). Values live in the Next data cache (`unstable_cache`), which every instance shares:
 *
 * - younger than `revalidate` s: served as is;
 * - older: served at once, and refreshed AFTER the response is sent (`after()`): recomputed and stored as that
 *   period's generation (see "Generations" below);
 * - older than `maxAge` s (nobody looked for a long while): computed before answering, so a dashboard opened after
 *   a quiet day doesn't show yesterday's numbers as current (the stored copy is refreshed in the background too);
 * - missing: computed and stored.
 *
 * Why not unstable_cache's own `revalidate`: in Next 15.3 a route handler's response doesn't END until a stale
 * entry's background revalidation finishes (base-server hands `pendingWaitUntil` to sendResponse even when the
 * platform has waitUntil), so every stale hit would wait for PostHog again. And `revalidateTag()` inside `after()`
 * is applied only once every after-callback is done, i.e. after a refreshed value was written, expiring it again.
 *
 * Generations: unstable_cache can only store a value on a miss, so a refresh writes a NEW entry instead of replacing
 * one: generation g = floor(time / revalidate) of the args. A read looks up the latest generations in parallel
 * (back to maxAge, at most 12; their lookup function throws instead of computing, so an absent generation costs one
 * cache read and stores nothing), then the base entry (computed on a miss: the cold path). Generation entries expire
 * after ~14 periods; the base entry stays. Staleness is decided from the time stamped next to each value.
 *
 * Arguments become part of the key (JSON), so pass only plain, bounded values (window ids, filters, ids), never `now`.
 * Values must be JSON-serialisable (no Maps, no functions) and stay under the data cache's 2 MB item limit.
 * Tags: `admin-data` and `admin:<name>` (revalidateTag on either drops every stored copy).
 *
 * Outside a Next request (tsx timing scripts) the same rules run on an in-memory map.
 */

export const ADMIN_DATA_TAG = "admin-data";

type Opts<A extends unknown[], T> = {
  /** seconds a value counts as fresh (may depend on the arguments, e.g. a 24 h window vs a 90 d one) */
  revalidate: number | ((...args: A) => number);
  /** seconds after which a value is not served and the call waits for a fresh one (default 10× revalidate, 10 min–2 h) */
  maxAge?: number | ((...args: A) => number);
  tags?: string[];
  /**
   * false → answer with this value but don't store it (e.g. a report with failed sections): the stored good value
   * keeps being served and the next request tries again.
   */
  keep?: (v: T) => boolean;
};

/** thrown inside the cached function to hand a value back without storing it */
class Unkept<T> extends Error {
  constructor(readonly value: T) {
    super("admin shared cache: value not kept");
  }
}
/** a generation that hasn't been written: thrown so unstable_cache stores nothing */
class Absent extends Error {}

type Stamped<T> = { at: number; v: T };

const inNext = () => !!process.env.NEXT_RUNTIME;
/** keeps the function alive briefly after a refresh so the data-cache write (not awaited by unstable_cache) lands */
const WRITE_GRACE_MS = 400;
/** most generations one read looks up (parallel data-cache reads); older copies fall back to the base entry */
const GEN_LOOKBACK = 12;

/* in-memory stand-in (scripts / tests) with the same fresh → stale → background refresh behaviour */
const mem = new Map<string, Stamped<unknown> & { refreshing?: boolean }>();

async function memSwr<T>(key: string, revalidateS: number, fn: () => Promise<T>): Promise<Stamped<T>> {
  const hit = mem.get(key);
  if (hit) {
    if (Date.now() - hit.at > revalidateS * 1000 && !hit.refreshing) {
      hit.refreshing = true;
      fn().then(
        (v) => {
          mem.set(key, { at: Date.now(), v });
        },
        () => {
          hit.refreshing = false;
        }
      );
    }
    return { at: hit.at, v: hit.v as T };
  }
  const v = await fn();
  const at = Date.now();
  mem.set(key, { at, v });
  if (mem.size > 500) for (const k of [...mem.keys()].slice(0, 100)) mem.delete(k);
  return { at, v };
}

export function sharedCache<A extends unknown[], T>(name: string, fn: (...args: A) => Promise<T>, opts: Opts<A, T>): (...args: A) => Promise<T> {
  const revalidateOf = (args: A) => Math.max(1, Math.round(typeof opts.revalidate === "function" ? opts.revalidate(...args) : opts.revalidate));
  const maxAgeOf = (args: A, rv: number) => (opts.maxAge == null ? Math.min(7200, Math.max(600, rv * 10)) : typeof opts.maxAge === "function" ? opts.maxAge(...args) : opts.maxAge);
  const stamped = async (...args: A): Promise<Stamped<T>> => {
    const v = await fn(...args);
    if (opts.keep && !opts.keep(v)) throw new Unkept(v);
    return { at: Date.now(), v };
  };
  const tags = [ADMIN_DATA_TAG, `admin:${name}`, ...(opts.tags ?? [])];

  /** base entry: computed on a miss (first use, or after its tags were revalidated) */
  const base = unstable_cache(stamped, ["admin-shared-v3", name], { revalidate: false, tags });

  /** generation entries: written only from `pending` (a value this instance just computed), never computed on a read */
  const pending = new Map<string, Stamped<T>>();
  const genKey = (rv: number, gen: number, args: A) => `${rv}|${gen}|${JSON.stringify(args)}`;
  const genFns = new Map<number, (rv: number, gen: number, ...args: A) => Promise<Stamped<T>>>();
  const genFn = (rv: number) => {
    let f = genFns.get(rv);
    if (!f) {
      f = unstable_cache(
        async (r: number, gen: number, ...args: A) => {
          const v = pending.get(genKey(r, gen, args));
          if (!v) throw new Absent("absent");
          return v;
        },
        ["admin-shared-gen-v3", name],
        // read for at most GEN_LOOKBACK periods; expiring after that keeps the store small
        { revalidate: Math.max((GEN_LOOKBACK + 2) * rv, 600), tags }
      );
      genFns.set(rv, f);
    }
    return f;
  };
  const readGen = (rv: number, gen: number, args: A) =>
    genFn(rv)(rv, gen, ...args).then(
      (v) => v,
      (e) => {
        if (e instanceof Absent) return null;
        throw e;
      }
    );
  /** store `v` as its period's generation (a miss on that entry hands `v` to unstable_cache) */
  const writeGen = async (rv: number, args: A, v: Stamped<T>) => {
    const gen = Math.floor(v.at / (rv * 1000));
    const k = genKey(rv, gen, args);
    pending.set(k, v);
    try {
      await genFn(rv)(rv, gen, ...args);
    } finally {
      pending.delete(k);
    }
  };

  /**
   * Newest stored copy: the latest generations (up to maxAge back, at most GEN_LOOKBACK periods, looked up in
   * parallel), else the base entry.
   */
  const read = async (rv: number, maxAgeS: number, args: A): Promise<Stamped<T>> => {
    const g = Math.floor(Date.now() / (rv * 1000));
    const n = Math.min(GEN_LOOKBACK, Math.max(2, Math.ceil(maxAgeS / rv) + 1));
    const found = await Promise.all(Array.from({ length: n }, (_, i) => readGen(rv, g - i, args)));
    const best = found.filter((x): x is Stamped<T> => !!x && typeof x.at === "number").sort((a, b) => b.at - a.at)[0];
    return best ?? base(...args);
  };

  // identical concurrent calls on one instance share one lookup; one background refresh per entry per period per instance
  const inflight = new Map<string, Promise<T>>();
  const refreshedAt = new Map<string, number>();

  const refreshLater = (key: string, args: A, rv: number) => {
    if (Date.now() - (refreshedAt.get(key) ?? 0) < rv * 1000) return;
    try {
      after(async () => {
        try {
          await writeGen(rv, args, await stamped(...args));
          await new Promise((r) => setTimeout(r, WRITE_GRACE_MS));
        } catch {
          // failed or not kept: the stored value stays; the next stale read tries again
          refreshedAt.delete(key);
        }
      });
      refreshedAt.set(key, Date.now());
      if (refreshedAt.size > 2000) refreshedAt.clear();
    } catch {
      // not inside a request (no after() here): nothing to schedule
    }
  };

  return (...args: A): Promise<T> => {
    const key = JSON.stringify(args);
    const running = inflight.get(key);
    if (running) return running;
    const p = (async () => {
      const rv = revalidateOf(args);
      let hit: Stamped<T>;
      try {
        hit = inNext() ? await read(rv, maxAgeOf(args, rv), args) : await memSwr(`${name}:${key}`, rv, async () => (await stamped(...args)).v);
      } catch (e) {
        if (e instanceof Unkept) return e.value as T;
        // the data cache itself failing (not the work function) must not take the dashboard down
        if (e instanceof Error && /incrementalCache|unstable_cache/i.test(e.message)) return fn(...args);
        throw e;
      }
      if (!hit || typeof hit.at !== "number") return fn(...args);
      const age = (Date.now() - hit.at) / 1000;
      if (age <= rv) return hit.v;
      if (age <= maxAgeOf(args, rv)) {
        if (inNext()) refreshLater(key, args, rv);
        return hit.v;
      }
      // too old to show as current: compute now and store it as this period's copy
      const fresh = await stamped(...args).catch((e) => {
        if (e instanceof Unkept) return e as Unkept<T>;
        throw e;
      });
      if (fresh instanceof Unkept) return fresh.value;
      if (inNext()) await writeGen(rv, args, fresh).catch(() => {});
      return fresh.v;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
