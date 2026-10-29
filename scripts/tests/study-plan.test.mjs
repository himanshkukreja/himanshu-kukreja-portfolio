/**
 * Study plan (lib/learn/study-plan.ts): packing, weekends, the revision + mock stretch, the .ics file
 * (folding, escaping, CRLF, UID, DTSTAMP, all-day dates) and saved-path dates (lib/learn/saved-paths.ts).
 *   node --test scripts/tests/study-plan.test.mjs
 *   TZ=America/New_York node --test scripts/tests/study-plan.test.mjs   (dates must not depend on TZ)
 * (Node ≥ 22.18 strips the TypeScript types of the imported modules. saved-paths.ts imports "@/…" modules,
 * so a small resolve hook maps "@/x" to src/x.ts and extensionless relative imports to .ts.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const SRC = new URL("../../src/", import.meta.url).href;
const hooks = `
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) return next(${JSON.stringify(SRC)} + spec.slice(2) + ".ts", ctx);
  if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.[cm]?[jt]s$/.test(spec) && ctx.parentURL && ctx.parentURL.endsWith(".ts")) return next(spec + ".ts", ctx);
  return next(spec, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`, import.meta.url);

const SP = await import("../../src/lib/learn/study-plan.ts");
const SV = await import("../../src/lib/learn/saved-paths.ts");
const { buildStudyPlan, toIcs, estimateMinutes, planDueDates, savedPathPlan, foldLine, escapeText, icsUid, addDays, weekdayOf, isDate } = SP;

const C = "/learn/system-design-mastery";
const L = (n, minutes, extra = {}) => ({ id: `L:week-01/day-0${n}`, kind: "lesson", title: `Lesson ${n}`, href: `${C}/week-01/day-0${n}`, readingMinutes: minutes, ...extra });

// ------------------------------------------------------------- estimates

test("estimates: explicit minutes win, then reading + lecture + lab, then words, then the kind default", () => {
  assert.equal(estimateMinutes({ kind: "lesson", minutes: 42, readingMinutes: 10 }), 42);
  assert.equal(estimateMinutes({ kind: "lesson", readingMinutes: 20, lectureMinutes: 12, labMinutes: 30 }), 62);
  assert.equal(estimateMinutes({ kind: "lesson", words: 1300 }), 10);
  assert.equal(estimateMinutes({ kind: "lesson", words: 1301 }), 11);
  assert.equal(estimateMinutes({ kind: "mock" }), 60);
  assert.equal(estimateMinutes({ kind: "unknown-kind" }), 20);
});

// ------------------------------------------------------------- packing

test("packing: items fill days in order at hours per day, split reading, then revision and a final mock day", () => {
  const items = [L(1, 50), L(2, 100), L(3, 40), L(4, 30), { id: "lab:x", kind: "lab", title: "Lab X", href: "/learn/labs/x", labMinutes: 45 }];
  const plan = buildStudyPlan({ goal: "Data at scale", days: 7, startDate: "2026-11-02", hoursPerDay: 1, items });
  assert.equal(plan.problem, null);
  assert.equal(plan.fits, true);
  assert.equal(plan.workMinutes, 265);
  assert.equal(plan.goalDate, "2026-11-09");
  assert.equal(plan.endDate, "2026-11-08");
  // 7 study days: 5 content, 1 revision, 1 mock
  const types = plan.days.map((d) => d.type);
  assert.deepEqual(types.slice(-2), ["revision", "mock"]);
  assert.equal(plan.days.at(-1).date, "2026-11-08");
  assert.equal(plan.days.at(-2).date, "2026-11-07");
  // order kept, and no content day goes past an hour + 10% slack (unless one item alone is longer)
  const content = plan.days.filter((d) => d.type === "study");
  const ids = content.flatMap((d) => d.steps.map((s) => s.id));
  assert.deepEqual([...new Set(ids)], items.map((i) => i.id));
  for (const d of content) assert.ok(d.minutes <= 66 || d.steps.length === 1, `${d.date} has ${d.minutes} min`);
  // lesson 2 (100 min) is split across two days, and its chunks say so
  const l2 = content.flatMap((d) => d.steps).filter((s) => s.id === "L:week-01/day-02");
  assert.ok(l2.length >= 2);
  assert.deepEqual(l2.map((s) => s.part[0]), l2.map((_, i) => i + 1));
  assert.equal(l2.reduce((a, s) => a + s.minutes, 0), 100);
  // revision day: the review queue first, then items it revisits
  const rev = plan.days.at(-2);
  assert.equal(rev.steps[0].id, "review-queue");
  assert.ok(rev.steps.slice(1).every((s) => s.id.startsWith("revise:")));
  // the mock day: the generic mock practice (no mock in the list)
  assert.equal(plan.days.at(-1).steps[0].id, "mock-practice");
  // numbering
  assert.deepEqual(plan.days.map((d) => d.n), plan.days.map((_, i) => i + 1));
});

test("packing: a lab or mock is never split; a mock in the list becomes the final day", () => {
  const items = [L(1, 20), { id: "lab:y", kind: "lab", title: "Lab Y", href: "/learn/labs/y", labMinutes: 50 }, L(2, 20), { id: "mock:m1", kind: "mock", title: "Mock 1", href: "/learn/mock/m1", minutes: 75 }];
  const plan = buildStudyPlan({ goal: "g", days: 4, startDate: "2026-11-02", hoursPerDay: 1, items });
  const lab = plan.days.flatMap((d) => d.steps).filter((s) => s.id === "lab:y");
  assert.equal(lab.length, 1);
  assert.equal(lab[0].part, null);
  assert.equal(plan.days.at(-1).type, "mock");
  assert.equal(plan.days.at(-1).steps[0].id, "mock:m1");
  assert.equal(plan.days.filter((d) => d.steps.some((s) => s.id === "mock:m1")).length, 1);
});

test("packing: too much for the days → overflow and the hours per day that would fit", () => {
  const items = Array.from({ length: 8 }, (_, i) => L(i + 1, 60));
  const plan = buildStudyPlan({ goal: "g", days: 4, startDate: "2026-11-02", hoursPerDay: 1, items });
  assert.equal(plan.fits, false);
  assert.ok(plan.overflow.length > 0);
  assert.ok(plan.suggestedHoursPerDay >= 2.5, String(plan.suggestedHoursPerDay));
  const again = buildStudyPlan({ goal: "g", days: 4, startDate: "2026-11-02", hoursPerDay: plan.suggestedHoursPerDay, items });
  assert.equal(again.fits, true);
  assert.equal(again.suggestedHoursPerDay, null);
});

test("packing: empty inputs give an empty plan with a reason", () => {
  assert.equal(buildStudyPlan({ goal: "g", days: 5, startDate: "2026-11-02", hoursPerDay: 1, items: [] }).problem, "no-items");
  // Saturday + Sunday only, weekends skipped
  assert.equal(buildStudyPlan({ goal: "g", days: 2, startDate: "2026-11-07", hoursPerDay: 1, items: [L(1, 10)], skipWeekends: true }).problem, "no-days");
  // one day: content only, no mock day
  const one = buildStudyPlan({ goal: "g", days: 1, startDate: "2026-11-02", hoursPerDay: 1, items: [L(1, 10)] });
  assert.deepEqual(one.days.map((d) => d.type), ["study"]);
});

// ------------------------------------------------------------- weekends

test("weekends: skipWeekends leaves Saturdays and Sundays empty; the mock is the last weekday", () => {
  assert.equal(weekdayOf("2026-11-02"), 0); // Monday
  const items = Array.from({ length: 12 }, (_, i) => L(i + 1, 45));
  const plan = buildStudyPlan({ goal: "g", days: 14, startDate: "2026-11-02", hoursPerDay: 1, items, skipWeekends: true });
  assert.ok(plan.days.length > 0);
  for (const d of plan.days) assert.ok(weekdayOf(d.date) < 5, `${d.date} is a weekend`);
  // 14 calendar days from Mon 2 Nov end Sun 15 Nov; the last weekday is Fri 13 Nov
  assert.equal(plan.days.at(-1).date, "2026-11-13");
  assert.equal(plan.days.at(-1).type, "mock");
  // 10 study days → 1 revision day just before
  assert.equal(plan.days.at(-2).type, "revision");
  assert.equal(plan.days.at(-2).date, "2026-11-12");
  const withWeekends = buildStudyPlan({ goal: "g", days: 14, startDate: "2026-11-02", hoursPerDay: 1, items });
  assert.ok(withWeekends.days.some((d) => weekdayOf(d.date) >= 5));
  assert.equal(withWeekends.days.at(-1).date, "2026-11-15");
  // 14 study days → 2 revision days
  assert.deepEqual(withWeekends.days.slice(-3).map((d) => d.type), ["revision", "revision", "mock"]);
});

test("dates: month and year ends, leap days, invalid dates", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(isDate("2026-02-30"), false);
  assert.equal(isDate("2026-1-5"), false);
  const plan = buildStudyPlan({ goal: "g", days: 3, startDate: "2026-12-30", hoursPerDay: 1, items: [L(1, 30)] });
  assert.equal(plan.goalDate, "2027-01-02");
});

// ------------------------------------------------------------- ICS

const NOW = new Date(Date.UTC(2026, 9, 29, 10, 0, 0));

function unfold(ics) {
  return ics.replace(/\r\n /g, "");
}
function unescape(v) {
  return v.replace(/\\n/g, "\n").replace(/\\([\\;,])/g, "$1");
}

test("ics: structure, CRLF, all-day dates, stable UIDs, DTSTAMP", () => {
  const items = [L(1, 50), L(2, 70), L(3, 40)];
  const plan = buildStudyPlan({ goal: "Crack the loop", days: 5, startDate: "2026-11-02", hoursPerDay: 1, items });
  const ics = toIcs(plan, { title: "SDM plan", url: "https://www.himanshukukreja.in/learn/saved#p-abc", now: NOW });
  // CRLF everywhere, nothing bare
  assert.ok(ics.endsWith("\r\n"));
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false);
  assert.equal(ics.replace(/\r\n/g, "").includes("\r"), false);
  const lines = unfold(ics).split("\r\n").filter(Boolean);
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-1), "END:VCALENDAR");
  for (const p of ["VERSION:2.0", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]) assert.ok(lines.includes(p), p);
  assert.ok(lines.some((l) => l.startsWith("PRODID:")));
  // balanced components, one VEVENT per plan day
  const begins = lines.filter((l) => l === "BEGIN:VEVENT").length;
  assert.equal(begins, lines.filter((l) => l === "END:VEVENT").length);
  assert.equal(begins, plan.days.length);
  // every event: UID, DTSTAMP, DTSTART/DTEND as DATE, the next day as the exclusive end
  const events = unfold(ics).split("BEGIN:VEVENT").slice(1).map((e) => e.split("END:VEVENT")[0].split("\r\n").filter(Boolean));
  const uids = new Set();
  events.forEach((ev, i) => {
    const prop = (name) => ev.find((l) => l.startsWith(name))?.slice(name.length);
    const day = plan.days[i];
    assert.equal(prop("UID:"), `${plan.id}-${day.date.replace(/-/g, "")}@himanshukukreja.in`);
    assert.match(prop("UID:"), /^[A-Za-z0-9-]+@[a-z0-9.-]+$/);
    uids.add(prop("UID:"));
    assert.equal(prop("DTSTAMP:"), "20261029T100000Z");
    assert.match(prop("DTSTAMP:"), /^\d{8}T\d{6}Z$/);
    assert.equal(prop("DTSTART;VALUE=DATE:"), day.date.replace(/-/g, ""));
    assert.equal(prop("DTEND;VALUE=DATE:"), addDays(day.date, 1).replace(/-/g, ""));
    // no time-of-day anywhere in the event: all-day, the same date in every zone
    assert.equal(ev.some((l) => /^DT(START|END)[:;](?!VALUE=DATE:)/.test(l)), false);
    // SUMMARY names the items; DESCRIPTION lists each with its full https link
    const summary = unescape(prop("SUMMARY:"));
    const desc = unescape(prop("DESCRIPTION:"));
    for (const s of day.steps) {
      assert.ok(summary.includes(s.title) || day.steps.length > 3, `summary lists ${s.title}`);
      assert.ok(desc.includes(s.title));
      assert.ok(desc.includes(`https://www.himanshukukreja.in${s.href}`), `desc links ${s.href}`);
    }
    assert.equal(prop("URL:"), "https://www.himanshukukreja.in/learn/saved#p-abc");
  });
  assert.equal(uids.size, events.length);
  // same goal + start → same UIDs on a re-plan
  const again = buildStudyPlan({ goal: "Crack the loop", days: 5, startDate: "2026-11-02", hoursPerDay: 2, items });
  assert.equal(again.id, plan.id);
  assert.equal(icsUid(plan.id, "2026-11-02"), `${plan.id}-20261102@himanshukukreja.in`);
});

test("ics: dates don't move with the machine's time zone (UTC maths only)", () => {
  const plan = buildStudyPlan({ goal: "tz", days: 2, startDate: "2026-11-02", hoursPerDay: 1, items: [L(1, 20)] });
  const ics = toIcs(plan, { title: "t", url: "https://www.himanshukukreja.in/learn/saved", now: NOW });
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261102\r\n"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20261103\r\n"));
});

test("ics: TEXT escaping (backslash, semicolon, comma, newline)", () => {
  assert.equal(escapeText("a\\b;c,d\ne\r\nf"), "a\\\\b\\;c\\,d\\ne\\nf");
  const plan = { id: "spx", goal: "Caching; fast, cheap", days: [{ date: "2026-11-02", n: 1, type: "study", minutes: 10, steps: [{ id: "a", kind: "lesson", title: "Read-through, write-behind; TTL \\ eviction", href: "/learn/x?a=1,2", minutes: 10, part: null }] }] };
  const ics = unfold(toIcs(plan, { title: "Plan, v2", url: "https://www.himanshukukreja.in/learn/saved", now: NOW }));
  const summary = ics.split("\r\n").find((l) => l.startsWith("SUMMARY:"));
  assert.ok(summary.includes("Read-through\\, write-behind\\; TTL \\\\ eviction"));
  assert.ok(ics.includes("X-WR-CALNAME:Plan\\, v2"));
  const desc = ics.split("\r\n").find((l) => l.startsWith("DESCRIPTION:"));
  // a raw newline never reaches the file; unescaped it round-trips
  assert.ok(desc.includes("\\n"));
  assert.ok(unescape(desc.slice(12)).includes("Goal: Caching; fast, cheap"));
  assert.ok(unescape(desc.slice(12)).includes("https://www.himanshukukreja.in/learn/x?a=1,2"));
});

test("ics: lines folded at 75 octets, UTF-8 safe, unfolding restores them", () => {
  const long = `SUMMARY:${"é".repeat(60)}${"x".repeat(100)}🚀🚀🚀`;
  const folded = foldLine(long);
  for (const part of folded.split("\r\n")) assert.ok(Buffer.byteLength(part, "utf8") <= 75, `${Buffer.byteLength(part, "utf8")} octets`);
  assert.ok(folded.split("\r\n").slice(1).every((l) => l.startsWith(" ")));
  assert.equal(folded.replace(/\r\n /g, ""), long);
  assert.equal(foldLine("SHORT:ok"), "SHORT:ok");
  // every line of a real file
  const items = Array.from({ length: 6 }, (_, i) => L(i + 1, 25, { title: `A rather long lesson title about consistent hashing and virtual nodes, part ${i + 1}` }));
  const plan = buildStudyPlan({ goal: "Long titles", days: 6, startDate: "2026-11-02", hoursPerDay: 2, items });
  const ics = toIcs(plan, { title: "SDM", url: "https://www.himanshukukreja.in/learn/saved", now: NOW });
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, line);
});

test("ics: links that aren't site-relative or https are left out", () => {
  const plan = { id: "spx", days: [{ date: "2026-11-02", n: 1, type: "study", minutes: 10, steps: [{ id: "a", kind: "lesson", title: "Evil", href: "javascript:alert(1)", minutes: 5, part: null }, { id: "b", kind: "lesson", title: "Ext", href: "https://example.com/x", minutes: 5, part: null }] }] };
  const ics = unfold(toIcs(plan, { title: "t", url: "https://www.himanshukukreja.in/learn/saved", now: NOW }));
  assert.equal(ics.includes("javascript"), false);
  assert.ok(ics.includes("https://example.com/x"));
});

// ------------------------------------------------------------- saved paths

const hit = (n, kind = "lesson") => ({ id: `L:week-01/day-0${n}`, kind, title: `Lesson ${n}`, sub: "W01", href: `${C}/week-01/day-0${n}`, summary: "", at: -1, score: 1 });

test("saved paths: due dates survive save, clean (JSON round trip) and re-save; bad dates are dropped", () => {
  const p = SV.buildSavedPath({ source: "path", q: "consistent hashing", steps: [{ ...hit(1), due: "2026-11-02" }, { ...hit(2), due: "2026-02-30" }, hit(3)] }, 1000);
  assert.equal(p.steps[0].due, "2026-11-02");
  assert.equal("due" in p.steps[1], false);
  assert.equal("due" in p.steps[2], false);
  const back = SV.cleanSavedPath(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(back, p);
  // the same search saved again: the date carries over unless the new copy brings one
  const again = SV.buildSavedPath({ source: "path", q: "consistent hashing", steps: [hit(1), { ...hit(3), due: "2026-11-04" }] }, 2000, back);
  assert.equal(again.steps[0].due, "2026-11-02");
  assert.equal(again.steps[1].due, "2026-11-04");
  // an old path (no dates at all) reads exactly as before
  const old = { v: 1, id: "pabc", source: "path", q: "q", title: "q", note: "", steps: [{ id: "L:week-01/day-01", kind: "lesson", title: "T", sub: "", href: `${C}/week-01/day-01`, at: -1, why: "" }], ticks: {}, createdAt: 1, updatedAt: 1 };
  assert.deepEqual(SV.cleanSavedPath(old), old);
  assert.equal(SV.hasStepDues(old), false);
});

test("saved paths: schedule from a study plan, merge keeps the newer copy's dates, export as .ics", () => {
  const base = SV.buildSavedPath({ source: "path", q: "caching", steps: [hit(1), hit(2), hit(3)] }, 1000);
  const plan = buildStudyPlan({
    goal: base.title,
    days: 5,
    startDate: "2026-11-02",
    hoursPerDay: 1,
    items: base.steps.map((s) => ({ id: s.id, kind: s.kind, title: s.title, href: s.href, readingMinutes: 50 })),
  });
  const dues = planDueDates(plan);
  assert.deepEqual(Object.keys(dues).sort(), base.steps.map((s) => s.id).sort());
  const dated = SV.withStepDues(base, dues, 5000);
  assert.ok(dated.updatedAt > base.updatedAt);
  assert.ok(dated.steps.every((s) => s.due === dues[s.id]));
  // no change → same object (no write)
  assert.equal(SV.withStepDues(dated, dues, 6000), dated);
  // clearing one date
  const cleared = SV.withStepDues(dated, { [base.steps[0].id]: null }, 7000);
  assert.equal("due" in cleared.steps[0], false);
  // device merge: the newer copy (with dates) wins over the older one without
  const key = SV.savedPathKey(base.id);
  const merged = SV.mergeSavedPathFlags({ [key]: base }, { [key]: JSON.parse(JSON.stringify(dated)) });
  assert.deepEqual(SV.cleanSavedPath(merged[key]), dated);
  const kept = SV.mergeSavedPathFlags({ [key]: dated }, { [key]: base });
  assert.equal(kept[key], dated);
  // the saved path as a calendar: one day per due date, every step linked
  const sp = savedPathPlan(SV.cleanSavedPath(merged[key]));
  assert.equal(sp.id, `spath-${base.id}`);
  assert.deepEqual(sp.days.map((d) => d.date), [...new Set(Object.values(dues))].sort());
  const ics = unfold(toIcs(sp, { title: base.title, url: `https://www.himanshukukreja.in/learn/saved#p-${base.id}`, now: NOW, sequence: Math.floor(dated.updatedAt / 1000) }));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, sp.days.length);
  for (const s of base.steps) assert.ok(ics.includes(`https://www.himanshukukreja.in${s.href}`));
  assert.equal(savedPathPlan(base), null);
});
