/**
 * Calendar export for the study planner: an RFC 5545 .ics file (Apple Calendar, Outlook, Google
 * import) and per-day "Add to Google Calendar" links.
 *
 * Choices (and why):
 *  - One event per study day (not per lesson): a calendar holds a session, the description lists
 *    what's in it with links. UID = <plan id>-<yyyymmdd>@himanshukukreja.in, so the slot for a date
 *    keeps its UID across re-plans: re-importing updates it in clients that match on UID + a higher
 *    SEQUENCE (Apple Calendar, Outlook). Dates that dropped out of the plan are exported again with
 *    STATUS:CANCELLED. Google's importer skips events whose UID it has already imported; for
 *    Google the page says to import into a fresh calendar after a re-plan.
 *  - Times carry TZID=<IANA zone> with a VTIMEZONE built from the browser's own zone rules (Intl)
 *    for the plan's date range, so 8 pm stays 8 pm across a DST change in every client. Floating
 *    local time (no TZID) is the fallback when the zone can't be resolved; RFC 5545 allows it, but
 *    some clients read floating times as UTC.
 *  - DTSTAMP and LAST-MODIFIED in UTC; lines folded at 75 octets (UTF-8 safe) with CRLF; TEXT values
 *    escaped (\\ ; , newline).
 * Self-contained: the Node tests (scripts/tests/plan.test.mjs) load this file directly.
 */

export type IcsDay = {
  /** yyyy-mm-dd */
  date: string;
  /** "20:00" */
  start: string;
  minutes: number;
  summary: string;
  description: string;
  url: string;
  status?: "CONFIRMED" | "CANCELLED";
};

export type IcsOptions = {
  planId: string;
  days: IcsDay[];
  /** IANA time zone, e.g. "Asia/Kolkata"; null = floating local time */
  tz: string | null;
  calName: string;
  /** export time */
  now: Date;
  /** minutes before; 0 = no alarm */
  alarm: number;
  /** bumps on every export so clients take the newer copy */
  sequence: number;
  domain?: string;
};

const CRLF = "\r\n";

// ---------------------------------------------------------------- text + folding

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

const utf8Len = (s: string) => {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};

/** RFC 5545 §3.1: lines longer than 75 octets are split with CRLF + one space, never inside a UTF-8 character. */
export function foldLine(line: string): string {
  if (utf8Len(line) <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  let limit = 75;
  for (const ch of line) {
    const l = utf8Len(ch);
    if (len + l > limit) {
      out.push(cur);
      cur = "";
      len = 0;
      limit = 74; // continuation lines start with a space
    }
    cur += ch;
    len += l;
  }
  if (cur) out.push(cur);
  return out.join(`${CRLF} `);
}

// ---------------------------------------------------------------- dates

const p2 = (n: number) => String(n).padStart(2, "0");

/** 2026-11-03 + "20:00" → "20261103T200000" */
export function localStamp(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

export function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
}

/** wall-clock date + time + minutes (pure calendar maths; crosses midnight correctly) */
export function addMinutesLocal(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  return { date: `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`, time: `${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}` };
}

// ---------------------------------------------------------------- time zones

/** offset of `tz` from UTC at instant `ms`, in minutes (IST → 330, New York in winter → -300) */
const formatters = new Map<string, Intl.DateTimeFormat>();

export function tzOffset(tz: string, ms: number): number {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(tz, f);
  }
  const parts: Record<string, number> = {};
  f.formatToParts(new Date(ms)).forEach((p) => p.type !== "literal" && (parts[p.type] = Number(p.value)));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

export function validTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

const fmtOffset = (min: number) => {
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  return `${sign}${p2(Math.floor(a / 60))}${p2(a % 60)}`;
};

export type Transition = { at: number; from: number; to: number };

/** offset changes of `tz` between two instants (minute precision) */
export function transitions(tz: string, fromMs: number, toMs: number): Transition[] {
  const out: Transition[] = [];
  const STEP = 6 * 3600_000;
  let prevMs = fromMs;
  let prev = tzOffset(tz, fromMs);
  for (let t = fromMs + STEP; t <= toMs + STEP; t += STEP) {
    const cur = tzOffset(tz, t);
    if (cur !== prev) {
      let lo = prevMs;
      let hi = t;
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
        if (tzOffset(tz, mid) === prev) lo = mid;
        else hi = mid;
      }
      out.push({ at: hi, from: prev, to: cur });
      prev = cur;
    }
    prevMs = t;
  }
  return out;
}

/** VTIMEZONE for the plan's range: one observance for the start, one per transition inside it. */
export function vtimezone(tz: string, fromMs: number, toMs: number): string[] {
  const year = new Date(fromMs).getUTCFullYear();
  const jan = tzOffset(tz, Date.UTC(year, 0, 15));
  const jul = tzOffset(tz, Date.UTC(year, 6, 15));
  const standard = Math.min(jan, jul);
  const kind = (off: number) => (off > standard ? "DAYLIGHT" : "STANDARD");
  const localOf = (ms: number, off: number) => {
    const d = new Date(ms + off * 60_000);
    return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`;
  };
  const start = fromMs - 86_400_000;
  const startOff = tzOffset(tz, start);
  const lines = ["BEGIN:VTIMEZONE", `TZID:${tz}`];
  // the offset in force when the plan starts (DTSTART well before the first event)
  lines.push(`BEGIN:${kind(startOff)}`, `DTSTART:${localOf(start, startOff)}`, `TZOFFSETFROM:${fmtOffset(startOff)}`, `TZOFFSETTO:${fmtOffset(startOff)}`, `END:${kind(startOff)}`);
  for (const tr of transitions(tz, start, toMs + 86_400_000)) {
    // onset is the local time just before the change, in the old offset (RFC 5545 §3.6.5)
    lines.push(`BEGIN:${kind(tr.to)}`, `DTSTART:${localOf(tr.at, tr.from)}`, `TZOFFSETFROM:${fmtOffset(tr.from)}`, `TZOFFSETTO:${fmtOffset(tr.to)}`, `END:${kind(tr.to)}`);
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

// ---------------------------------------------------------------- the file

export const uidFor = (planId: string, date: string, domain = "himanshukukreja.in") => `${planId}-${date.replace(/-/g, "")}@${domain}`;

export function buildIcs(o: IcsOptions): string {
  const tz = validTz(o.tz) ? o.tz : null;
  const stamp = utcStamp(o.now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Himanshu Kukreja//System Design Mastery study plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(o.calName)}`,
    ...(tz ? [`X-WR-TIMEZONE:${tz}`] : []),
  ];
  const sorted = [...o.days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (tz && sorted.length) {
    const [fy, fm, fd] = sorted[0].date.split("-").map(Number);
    const [ly, lm, ld] = sorted[sorted.length - 1].date.split("-").map(Number);
    lines.push(...vtimezone(tz, Date.UTC(fy, fm - 1, fd), Date.UTC(ly, lm - 1, ld + 1)));
  }
  for (const d of sorted) {
    const end = addMinutesLocal(d.date, d.start, Math.max(5, d.minutes));
    const prop = (name: string, date: string, time: string) => (tz ? `${name};TZID=${tz}:${localStamp(date, time)}` : `${name}:${localStamp(date, time)}`);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidFor(o.planId, d.date, o.domain)}`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `SEQUENCE:${Math.max(0, Math.floor(o.sequence))}`,
      prop("DTSTART", d.date, d.start),
      prop("DTEND", end.date, end.time),
      `SUMMARY:${escapeText(d.summary)}`,
      `DESCRIPTION:${escapeText(d.description)}`,
      ...(d.url ? [`URL:${d.url}`] : []),
      `STATUS:${d.status || "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      "CATEGORIES:Study"
    );
    if (o.alarm > 0 && d.status !== "CANCELLED") {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(d.summary)}`, `TRIGGER:-PT${Math.round(o.alarm)}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}

// ---------------------------------------------------------------- Google Calendar links

/**
 * https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=START/END&details=…&ctz=…
 * Local times with ctz (the zone they're in); without a zone, UTC times computed by the browser.
 */
export function googleLink(d: IcsDay, tz: string | null): string {
  const end = addMinutesLocal(d.date, d.start, Math.max(5, d.minutes));
  let dates: string;
  if (validTz(tz)) dates = `${localStamp(d.date, d.start)}/${localStamp(end.date, end.time)}`;
  else {
    const toUtc = (date: string, time: string) => {
      const [y, m, dd] = date.split("-").map(Number);
      const [hh, mm] = time.split(":").map(Number);
      return utcStamp(new Date(y, m - 1, dd, hh, mm));
    };
    dates = `${toUtc(d.date, d.start)}/${toUtc(end.date, end.time)}`;
  }
  const details = d.description.length > 900 ? `${d.description.slice(0, 880)}…` : d.description;
  const q = new URLSearchParams({ action: "TEMPLATE", text: d.summary, dates, details: `${details}${d.url ? `\n\n${d.url}` : ""}` });
  if (validTz(tz)) q.set("ctz", tz);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
