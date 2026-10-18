/**
 * Study planner: scheduler, drift (behind/ahead) and calendar export tests.
 *   node --test scripts/tests/plan.test.mjs
 *   TZ=America/New_York node --test scripts/tests/plan.test.mjs   (dates must not depend on TZ)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { addDays, buildItems, cleanRecord, cleanSettings, dayTitle, defaultSettings, drift, minutesToFit, schedule, stretchMocks, weekdayOf } from "../../src/lib/learn/plan/schedule.ts";
import { buildIcs, escapeText, foldLine, googleLink, transitions, tzOffset, uidFor, vtimezone } from "../../src/lib/learn/plan/ics.ts";

// ------------------------------------------------------------- a small course map

const C = "/learn/system-design-mastery";
const lesson = (week, slug, title, minutes, kind = "day-content", tag = "") => ({ week, slug, title, kind, minutes, code: "", label: title, tag, href: `${C}/${week}/${slug}` });
const W0 = "week-00-foundations";
const W1 = "week-01-data-at-scale";
const MAP = {
  courseId: "system-design-mastery",
  title: "SDM",
  description: "",
  plan: null,
  weeks: [
    {
      key: W1,
      num: 1,
      code: "01",
      title: "Data at scale",
      lessons: [lesson(W1, "week-01-preview", "Data at scale", 10, "week-preview"), lesson(W1, "day-01-partitioning", "Partitioning", 50), lesson(W1, "day-02-replication", "Replication", 70)],
      boss: lesson(W1, "capstone-url", "URL shortener", 90, "capstone"),
      trial: {
        week: W1,
        slug: "week-01-mcq",
        title: "Trial",
        href: `${C}/${W1}/week-01-mcq`,
        totalQuestions: 45,
        passPct: 80,
        parts: [
          { n: 1, title: "Partitioning", questions: 15, range: "", href: `${C}/${W1}/week-01-mcq?part=1` },
          { n: 2, title: "Replication", questions: 15, range: "", href: `${C}/${W1}/week-01-mcq?part=2` },
          { n: 3, title: "Integration", questions: 15, range: "", href: `${C}/${W1}/week-01-mcq?part=3` },
        ],
      },
      minutes: 220,
      badge: "",
    },
    {
      key: W0,
      num: 0,
      code: "00",
      title: "Foundations",
      lessons: [lesson(W0, "foundations-part-1", "Basics", 60, "foundations"), lesson(W0, "foundations-part-2", "Building blocks", 45, "foundations")],
      boss: null,
      trial: {
        week: W0,
        slug: "week-00-mcq",
        title: "Trial",
        href: `${C}/${W0}/week-00-mcq`,
        totalQuestions: 30,
        passPct: 80,
        parts: [
          { n: 1, title: "Basics", questions: 15, range: "", href: `${C}/${W0}/week-00-mcq?part=1` },
          { n: 2, title: "Building blocks", questions: 15, range: "", href: `${C}/${W0}/week-00-mcq?part=2` },
        ],
      },
      minutes: 105,
      badge: "",
    },
  ],
  sideQuests: [lesson("bonus-problems", "bonus-01-upi", "UPI", 40, "bonus", "SQ-01"), lesson("bonus-problems", "bonus-02-whatsapp", "WhatsApp", 120, "bonus", "SQ-02")],
  mocks: [{ id: "m1", slug: "mock-01", n: 1, code: "M1", title: "Autopay", company: "BillBolt", interviewer: "", role: "", after: W1, afterCode: "W01", coversLabel: "", level: "sde", badge: "", minutes: 60, phases: 4, curveballs: 0, signals: 0, href: "/learn/mock/mock-01" }],
  stats: {},
};

const ids = (items) => items.map((i) => i.id);
const settings = (over = {}) => ({ ...defaultSettings("2026-10-19", "2026-11-30"), ...over, include: { ...defaultSettings("2026-10-19").include, ...(over.include || {}) } });
const run = (s, over = {}) => {
  const items = buildItems(MAP, s);
  return { items, sch: schedule({ items, stretch: stretchMocks(MAP, s), status: over.status || {}, settings: s, from: over.from || "2026-10-19", cutoff: over.cutoff ?? 0 }) };
};
const entries = (sch) => sch.days.flatMap((d) => d.entries.map((e) => ({ ...e, date: d.date })));

// ------------------------------------------------------------- items

test("items follow course order; each trial part sits right after the lesson it tests", () => {
  const items = buildItems(MAP, settings());
  assert.deepEqual(ids(items), [
    `lesson:${W0}/foundations-part-1`,
    `trial:${W0}/part-1`,
    `lesson:${W0}/foundations-part-2`,
    `trial:${W0}/part-2`,
    `lesson:${W1}/week-01-preview`,
    `lesson:${W1}/day-01-partitioning`,
    `trial:${W1}/part-1`,
    `lesson:${W1}/day-02-replication`,
    `trial:${W1}/part-2`,
    `boss:${W1}`,
    `trial:${W1}/part-3`, // "Integration" ↔ the boss
    "mock:m1",
  ]);
  assert.equal(items.find((i) => i.kind === "trial").minutes, 15);
});

test("include toggles, start week, side quests and mocks at the end", () => {
  const s = settings({ include: { trials: false, bosses: false, sideQuests: true }, startWeek: W1, mocksAt: "end" });
  const items = buildItems(MAP, s);
  assert.deepEqual(ids(items), [`lesson:${W1}/week-01-preview`, `lesson:${W1}/day-01-partitioning`, `lesson:${W1}/day-02-replication`, "lesson:bonus-problems/bonus-01-upi", "lesson:bonus-problems/bonus-02-whatsapp"]);
  assert.deepEqual(ids(stretchMocks(MAP, s)), ["mock:m1"]);
});

// ------------------------------------------------------------- dates

test("weekends off: no Saturday/Sunday sessions; the plan ends before the interview", () => {
  const { sch } = run(settings({ days: [0, 1, 2, 3, 4] }), { from: "2026-10-17" }); // a Saturday
  assert.ok(sch.days.length > 0);
  for (const d of sch.days) {
    assert.ok(weekdayOf(d.date) <= 4, `${d.date} is a weekend`);
    assert.ok(d.date < "2026-11-30");
    assert.ok(d.date >= "2026-10-17");
  }
  assert.equal(sch.days[0].date, "2026-10-19"); // first Monday
});

test("weekday maths: known dates", () => {
  assert.equal(weekdayOf("2026-10-19"), 0); // Monday
  assert.equal(weekdayOf("2026-10-18"), 6); // Sunday
  assert.equal(weekdayOf("2024-02-29"), 3); // leap day, Thursday
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("DST: date stepping across US and EU clock changes neither skips nor repeats a day", () => {
  for (const [a, b] of [
    ["2026-03-06", "2026-03-10"], // US spring forward 8 Mar
    ["2026-10-23", "2026-10-28"], // EU fall back 25 Oct
    ["2026-10-30", "2026-11-03"], // US fall back 1 Nov
  ]) {
    const seen = [];
    for (let d = a; d <= b; d = addDays(d, 1)) seen.push(d);
    const n = Math.round((Date.UTC(...b.split("-").map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...a.split("-").map((x, i) => (i === 1 ? x - 1 : +x)))) / 864e5) + 1;
    assert.equal(seen.length, n);
    assert.equal(new Set(seen).size, n);
  }
  // a daily plan straddling 1 Nov has one session per date
  const s = settings({ days: [0, 1, 2, 3, 4, 5, 6], target: "2026-11-06", minutes: 30, revision: 0, buffer: false });
  const { sch } = run(s, { from: "2026-10-30" });
  assert.deepEqual(
    sch.days.map((d) => d.date),
    ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]
  );
});

// ------------------------------------------------------------- packing

test("packing: minutes per day respected (10% slack), long reading splits, trials and mocks don't", () => {
  const s = settings({ minutes: 60, revision: 0, buffer: false, days: [0, 1, 2, 3, 4, 5, 6] });
  const { sch } = run(s);
  assert.ok(sch.fits);
  for (const d of sch.days) {
    const nonMock = d.entries.filter((e) => e.kind !== "mock" && e.kind !== "boss");
    if (d.entries.length > 1) assert.ok(d.minutes <= 66, `${d.date}: ${d.minutes} min`);
    assert.ok(nonMock.every((e) => e.minutes <= 66));
  }
  const all = entries(sch);
  // the 90-min boss is split into chunks with part labels
  const boss = all.filter((e) => e.id === `boss:${W1}`);
  assert.ok(boss.length >= 2);
  assert.deepEqual(boss.map((e) => e.part), boss.map((_, k) => [k + 1, boss.length]));
  assert.equal(boss.reduce((a, e) => a + e.minutes, 0), 90);
  // trial parts are never split
  for (const id of all.filter((e) => e.kind === "trial").map((e) => e.id)) assert.equal(all.filter((e) => e.id === id).length, 1);
  // the mock starts its own day
  const mockDay = sch.days.find((d) => d.entries.some((e) => e.kind === "mock"));
  assert.equal(mockDay.entries[0].kind, "mock");
  // order is preserved across days
  const order = [...new Set(all.map((e) => e.id))];
  assert.deepEqual(order, ids(buildItems(MAP, s)));
});

test("final stretch: revision days end the plan, the last is 'Final revision' the day before", () => {
  const s = settings({ revision: 3, target: "2026-11-30" }); // Mon 30 Nov interview
  const { sch } = run(s);
  const last = sch.days.slice(-3);
  assert.deepEqual(last.map((d) => d.type), ["revision", "revision", "revision"]);
  assert.equal(last[2].date, "2026-11-27"); // Friday before (weekends off)
  assert.equal(dayTitle(last[2]), "Final revision");
  assert.equal(sch.stretchStart, last[0].date);
});

test("mocks at the end alternate with revision days", () => {
  const s = settings({ revision: 2, mocksAt: "end" });
  const { sch } = run(s);
  const tail = sch.days.slice(-3).map((d) => d.type);
  assert.deepEqual(tail, ["revision", "mock", "revision"]);
});

test("buffer days: one per week with 3+ study days, on its last study day", () => {
  const s = settings({ minutes: 30, buffer: true, revision: 0, target: "2026-12-31" });
  const { sch } = run(s);
  const buffers = sch.days.filter((d) => d.type === "buffer");
  assert.ok(buffers.length >= 1);
  buffers.forEach((b) => assert.equal(weekdayOf(b.date), 4)); // Fridays
  assert.ok(buffers.every((b) => b.entries.length === 0));
});

test("overflow: buffers are used first, then the tail is reported with the minutes/day that fits", () => {
  // 2 weeks, weekdays, 30 min/day: ~10 days minus a revision day, too little for ~8 h of work
  const s = settings({ minutes: 30, target: "2026-11-02", revision: 1, buffer: true });
  const items = buildItems(MAP, s);
  const input = { items, stretch: [], status: {}, settings: s, from: "2026-10-19", cutoff: 0 };
  const sch = schedule(input);
  assert.equal(sch.fits, false);
  assert.ok(sch.buffersUsed >= 1);
  assert.equal(sch.days.filter((d) => d.type === "buffer").length, 0);
  assert.ok(sch.overflowMinutes > 0);
  const need = minutesToFit(input);
  assert.ok(need > 30 && need % 5 === 0);
  assert.equal(schedule({ ...input, settings: { ...s, minutes: need } }).fits, true);
  assert.equal(schedule({ ...input, settings: { ...s, minutes: need - 5 } }).fits, false);
});

test("problems: interview date passed, no study days, everything done", () => {
  assert.equal(run(settings({ target: "2026-10-01" })).sch.problem, "past");
  assert.equal(run(settings({ days: [] })).sch.problem, "no-days");
  const s = settings();
  const status = Object.fromEntries(buildItems(MAP, s).map((i) => [i.id, { done: true, left: 0, doneAt: 1 }]));
  const r = run(s, { status, cutoff: 10 });
  assert.equal(r.sch.problem, "nothing-left");
  assert.equal(r.sch.contentEnd, null);
});

// ------------------------------------------------------------- progress and re-planning

const at = (d, h = 12) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00`).getTime();

test("real progress: done items drop out, a half-read lesson keeps its unread minutes", () => {
  const s = settings({ revision: 0, buffer: false });
  const status = {
    [`lesson:${W0}/foundations-part-1`]: { done: true, left: 0, doneAt: at("2026-10-01") },
    [`trial:${W0}/part-1`]: { done: true, left: 0, doneAt: at("2026-10-01") },
    [`lesson:${W0}/foundations-part-2`]: { done: false, left: 20, doneAt: 0 },
  };
  const { sch } = run(s, { status, cutoff: at("2026-10-19", 0) });
  const first = sch.days[0].entries[0];
  assert.equal(first.id, `lesson:${W0}/foundations-part-2`);
  assert.equal(first.minutes, 20);
  assert.ok(!entries(sch).some((e) => e.id === `lesson:${W0}/foundations-part-1`));
});

test("items finished today stay on today's list, ticked", () => {
  const s = settings({ revision: 0, buffer: false });
  const status = { [`lesson:${W0}/foundations-part-1`]: { done: true, left: 0, doneAt: at("2026-10-19", 9) } };
  const { sch } = run(s, { status, from: "2026-10-19", cutoff: at("2026-10-19", 0) });
  assert.equal(sch.days[0].entries[0].id, `lesson:${W0}/foundations-part-1`);
  assert.equal(sch.days[0].entries[0].done, true);
});

test("behind schedule: 2 study days missed → drift says 2 days behind, the live plan restarts today and ends later", () => {
  const s = settings({ minutes: 60, revision: 1, buffer: false, target: "2026-12-14" });
  const items = buildItems(MAP, s);
  const base = schedule({ items, stretch: [], status: {}, settings: s, from: "2026-10-19", cutoff: at("2026-10-19", 0) });
  // Wednesday 21 Oct, nothing done: Mon + Tue were planned
  const d = drift(base, items, {}, "2026-10-21", s.minutes);
  assert.equal(d.status, "behind");
  assert.equal(d.days, 2);
  const live = schedule({ items, stretch: [], status: {}, settings: s, from: "2026-10-21", cutoff: at("2026-10-21", 0) });
  assert.equal(live.days[0].date, "2026-10-21");
  assert.equal(live.days[0].entries[0].id, base.days[0].entries[0].id);
  assert.ok(live.contentEnd > base.contentEnd);
  // revision day stays the day before the interview
  assert.equal(live.days[live.days.length - 1].date, base.days[base.days.length - 1].date);
});

test("on track and ahead", () => {
  const s = settings({ minutes: 60, revision: 0, buffer: false, target: "2026-12-14" });
  const items = buildItems(MAP, s);
  const base = schedule({ items, stretch: [], status: {}, settings: s, from: "2026-10-19", cutoff: 0 });
  const doneThrough = (date) => {
    const st = {};
    base.days.filter((d) => d.date <= date).forEach((d) => d.entries.forEach((e) => (st[e.id] = { done: true, left: 0, doneAt: at(d.date) })));
    return st;
  };
  // Monday's work done, it's Tuesday morning: on track
  assert.equal(drift(base, items, doneThrough("2026-10-19"), "2026-10-20", 60).status, "on-track");
  // Mon–Thu done by Tuesday: Wed + Thu (120 min) plus the Friday half of a lesson finished early (40)
  const ahead = drift(base, items, doneThrough("2026-10-22"), "2026-10-20", 60);
  assert.equal(ahead.status, "ahead");
  assert.equal(ahead.aheadMinutes, 160);
  assert.equal(ahead.days, 3);
  // half of Wednesday's work done on Tuesday: less than a day, still on track
  const half = { ...doneThrough("2026-10-20"), [`trial:${W0}/part-2`]: { done: true, left: 0, doneAt: 1 } };
  assert.equal(drift(base, items, half, "2026-10-20", 60).status, "on-track");
});

test("settings and records from storage are validated", () => {
  assert.equal(cleanSettings(null), null);
  assert.equal(cleanSettings({ target: "nope" }), null);
  const c = cleanSettings({ target: "2026-12-01", days: [0, 0, 9, 3, "2"], minutes: 9999, time: "25:00", include: { sideQuests: true }, revision: -4 });
  assert.deepEqual(c.days, [0, 2, 3]);
  assert.equal(c.minutes, 600);
  assert.equal(c.time, "20:00");
  assert.equal(c.include.sideQuests, true);
  assert.equal(c.include.core, true);
  assert.equal(c.revision, 0);
  assert.equal(cleanRecord({ id: "x", settings: c, baseStart: "2026-10-19" }), null); // id too short
  assert.ok(cleanRecord({ id: "pabc123", settings: c, baseStart: "2026-10-19", baseAt: 5 }));
});

// ------------------------------------------------------------- .ics

const DAY = (date, extra = {}) => ({ date, start: "20:00", minutes: 60, summary: "SDM · Day 3 · Circuit Breakers, timeouts; retries", description: "1. Circuit breakers (45 min)\n2. Trial part 3 (15 min)\nhttps://example.com/x", url: "https://example.com/learn/x", ...extra });

test("ics: CRLF line endings, every line ≤ 75 octets, required properties present", () => {
  const ics = buildIcs({ planId: "pabc123", days: [DAY("2026-11-03"), DAY("2026-11-04")], tz: "Asia/Kolkata", calName: "Study plan", now: new Date("2026-10-18T10:00:00Z"), alarm: 15, sequence: 2 });
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "bare LF found");
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, `long line: ${line}`);
  const unfolded = ics.replace(/\r\n /g, "");
  for (const p of ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:", "BEGIN:VTIMEZONE", "TZID:Asia/Kolkata", "BEGIN:VEVENT", "DTSTAMP:20261018T100000Z", "SEQUENCE:2", "DTSTART;TZID=Asia/Kolkata:20261103T200000", "DTEND;TZID=Asia/Kolkata:20261103T210000", "TRIGGER:-PT15M", "END:VCALENDAR"])
    assert.ok(unfolded.includes(p), p);
  assert.ok(unfolded.includes(`UID:${uidFor("pabc123", "2026-11-03")}`));
  assert.ok(unfolded.includes("SUMMARY:SDM · Day 3 · Circuit Breakers\\, timeouts\\; retries"));
  assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((unfolded.match(/BEGIN:VALARM/g) || []).length, 2);
});

test("ics: folding never splits a UTF-8 character", () => {
  const long = `SUMMARY:${"→ résumé · 数字 ".repeat(12)}`;
  const folded = foldLine(long);
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  parts.forEach((p, i) => {
    assert.ok(Buffer.byteLength(p, "utf8") <= 75);
    if (i > 0) assert.ok(p.startsWith(" "));
  });
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(""), long);
  assert.equal(Buffer.from(folded, "utf8").toString("utf8"), folded);
});

test("ics: TEXT escaping", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
});

test("time zones: offsets and DST transitions from Intl", () => {
  assert.equal(tzOffset("Asia/Kolkata", Date.UTC(2026, 10, 3)), 330);
  assert.equal(tzOffset("America/New_York", Date.UTC(2026, 6, 1)), -240);
  assert.equal(tzOffset("America/New_York", Date.UTC(2026, 11, 1)), -300);
  const tr = transitions("America/New_York", Date.UTC(2026, 9, 1), Date.UTC(2026, 11, 31));
  assert.equal(tr.length, 1);
  assert.equal(new Date(tr[0].at).toISOString(), "2026-11-01T06:00:00.000Z"); // 2:00 EDT
  assert.deepEqual([tr[0].from, tr[0].to], [-240, -300]);
  assert.equal(transitions("Asia/Kolkata", Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31)).length, 0);
  const vt = vtimezone("America/New_York", Date.UTC(2026, 9, 20), Date.UTC(2026, 10, 20)).join("\n");
  assert.match(vt, /BEGIN:DAYLIGHT\nDTSTART:20261018T200000\nTZOFFSETFROM:-0400\nTZOFFSETTO:-0400\nEND:DAYLIGHT/);
  assert.match(vt, /BEGIN:STANDARD\nDTSTART:20261101T020000\nTZOFFSETFROM:-0400\nTZOFFSETTO:-0500\nEND:STANDARD/);
  const eu = vtimezone("Europe/London", Date.UTC(2026, 9, 20), Date.UTC(2026, 10, 20)).join("\n");
  assert.match(eu, /DTSTART:20261025T020000\nTZOFFSETFROM:\+0100\nTZOFFSETTO:\+0000/);
});

test("ics: floating local time when the zone is unknown; cancelled days have no alarm", () => {
  const ics = buildIcs({ planId: "pabc123", days: [DAY("2026-11-03"), DAY("2026-11-05", { status: "CANCELLED" })], tz: "Not/AZone", calName: "x", now: new Date(0), alarm: 10, sequence: 0 });
  const u = ics.replace(/\r\n /g, "");
  assert.ok(!u.includes("VTIMEZONE"));
  assert.ok(u.includes("DTSTART:20261103T200000"));
  assert.ok(!u.includes("TZID"));
  assert.ok(u.includes("STATUS:CANCELLED"));
  assert.equal((u.match(/BEGIN:VALARM/g) || []).length, 1);
});

test("ics: sessions crossing midnight end the next day", () => {
  const u = buildIcs({ planId: "pabc123", days: [DAY("2026-12-31", { start: "23:30", minutes: 90 })], tz: "Asia/Kolkata", calName: "x", now: new Date(0), alarm: 0, sequence: 0 }).replace(/\r\n /g, "");
  assert.ok(u.includes("DTEND;TZID=Asia/Kolkata:20270101T010000"));
  assert.ok(!u.includes("VALARM"));
});

test("ics: UIDs are stable per plan + date (re-imports update, not duplicate)", () => {
  assert.equal(uidFor("pabc123", "2026-11-03"), "pabc123-20261103@himanshukukreja.in");
  const a = buildIcs({ planId: "pabc123", days: [DAY("2026-11-03")], tz: "UTC", calName: "x", now: new Date(0), alarm: 0, sequence: 0 });
  const b = buildIcs({ planId: "pabc123", days: [DAY("2026-11-03", { summary: "changed" })], tz: "UTC", calName: "x", now: new Date(1e12), alarm: 0, sequence: 1 });
  const uid = (s) => /UID:(.+)\r\n/.exec(s)[1];
  assert.equal(uid(a), uid(b));
});

test("google link: official TEMPLATE format with local times and ctz", () => {
  const url = new URL(googleLink(DAY("2026-11-03"), "Asia/Kolkata"));
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20261103T200000/20261103T210000");
  assert.equal(url.searchParams.get("ctz"), "Asia/Kolkata");
  assert.equal(url.searchParams.get("text"), DAY("2026-11-03").summary);
  assert.ok(url.searchParams.get("details").includes("https://example.com/learn/x"));
  // no zone: UTC instants
  const u2 = new URL(googleLink(DAY("2026-11-03"), null));
  assert.match(u2.searchParams.get("dates"), /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
  assert.equal(u2.searchParams.get("ctz"), null);
});
