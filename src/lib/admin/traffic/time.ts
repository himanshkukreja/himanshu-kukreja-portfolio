/**
 * Time-zone aware bucketing for the traffic report (no date library): bucket starts are computed
 * in the admin's IANA zone and returned as UTC instants.
 */

export type Unit = "hour" | "day" | "week";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function validTz(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

type Parts = { y: number; mo: number; d: number; h: number; mi: number; wd: number };
export function localParts(t: number, tz: string): Parts {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: WD[p.weekday] ?? 0 };
}

/** UTC offset of `tz` at instant `t`, in ms (local = utc + offset). */
export function tzOffset(t: number, tz: string): number {
  const p = localParts(t, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  return asUtc - Math.floor(t / 60_000) * 60_000;
}

/** Instant of local wall-clock time (y, mo, d, h) in tz. */
function fromLocal(y: number, mo: number, d: number, h: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz); // second pass settles DST edges
  return t;
}

export function startOf(t: number, unit: Unit, tz: string): number {
  const p = localParts(t, tz);
  if (unit === "hour") return fromLocal(p.y, p.mo, p.d, p.h, tz);
  const day = fromLocal(p.y, p.mo, p.d, 0, tz);
  if (unit === "day") return day;
  return startOf(day - p.wd * DAY + 2 * HOUR, "day", tz); // Monday
}

export function nextBucket(t: number, unit: Unit, tz: string): number {
  if (unit === "hour") return t + HOUR;
  if (unit === "day") return startOf(t + DAY + 2 * HOUR, "day", tz);
  return startOf(t + 7 * DAY + 2 * HOUR, "week", tz);
}

export function buckets(start: number, end: number, unit: Unit, tz: string): number[] {
  const out: number[] = [];
  let b = startOf(start, unit, tz);
  while (b < end && out.length < 2000) {
    out.push(b);
    b = nextBucket(b, unit, tz);
  }
  return out;
}

export type RangeKey = "24h" | "7d" | "30d" | "90d" | "12m";
export const RANGES: RangeKey[] = ["24h", "7d", "30d", "90d", "12m"];

export type Window = { key: string; start: number; end: number; prevStart: number; prevEnd: number; unit: Unit; tz: string };

/** Resolve `?range=` (24h/7d/30d/90d/12m, also `Nd`/`Nh`) or explicit from/to into a window. */
export function resolveWindow(range: string | null | undefined, tz: string, now = Date.now(), from?: string | null, to?: string | null): Window {
  let start: number;
  let end = now;
  let key = range || "30d";
  const f = from ? Date.parse(from) : NaN;
  const tt = to ? Date.parse(to) : NaN;
  if (Number.isFinite(f)) {
    start = f;
    end = Number.isFinite(tt) && tt > f ? Math.min(tt, now) : now;
    key = "custom";
  } else {
    const m = /^(\d{1,3})([hdwm])$/.exec(key) ?? /^(\d{1,3})([hdwm])$/.exec("30d")!;
    const n = Math.max(1, +m[1]);
    const u = m[2];
    if (u === "h") start = startOf(now, "hour", tz) - (n - 1) * HOUR;
    else if (u === "d") start = startOf(now - (n - 1) * DAY, "day", tz);
    else if (u === "w") start = startOf(now - (n * 7 - 1) * DAY, "day", tz);
    else start = startOf(now - Math.round(n * 30.44 - 1) * DAY, "week", tz);
  }
  const len = end - start;
  const unit: Unit = len <= 48 * HOUR + 1 ? "hour" : len <= 120 * DAY ? "day" : "week";
  return { key, start, end, prevStart: start - len, prevEnd: start, unit, tz };
}
