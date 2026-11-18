import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// the helper is plain TS with no imports: strip types and load it as a module
const src = readFileSync(new URL("../../src/lib/analytics/recordingFilter.ts", import.meta.url), "utf8")
  .replace(/export function (\w+)<T extends \{ active: number \}>\(list: T\[\], includeIdle: boolean\): T\[\]/, "export function $1(list, includeIdle)")
  .replace(/\(activeSeconds: number \| null \| undefined\): boolean/, "(activeSeconds)")
  .replace(/\(\): string \{/g, "() {")
  .replace(/\(seconds: number\): string/, "(seconds)")
  .replace(/\(active: number, total: number\): string/, "(active, total)")
  .replace(/\(activeSeconds as number\)/, "activeSeconds")
  .replace(/\(r\)/g, "(r)");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

test("threshold is 5 s of activity", () => {
  assert.equal(mod.MIN_ACTIVE_SECONDS, 5);
  assert.equal(mod.isSubstantialRecording(4), false);
  assert.equal(mod.isSubstantialRecording(5), true);
  assert.equal(mod.isSubstantialRecording(0), false);
  assert.equal(mod.isSubstantialRecording(undefined), false);
  assert.equal(mod.isSubstantialRecording(NaN), false);
});

test("filterRecordings hides idle unless asked", () => {
  const list = [{ active: 0 }, { active: 16 }, { active: 4 }, { active: 130 }];
  assert.deepEqual(mod.filterRecordings(list, false).map((r) => r.active), [16, 130]);
  assert.equal(mod.filterRecordings(list, true).length, 4);
});

test("PostHog predicate and labels", () => {
  assert.deepEqual(JSON.parse(mod.substantialHavingPredicates()), [{ key: "active_seconds", type: "recording", operator: "gte", value: 5 }]);
  assert.equal(mod.activeLabel(130, 1080), "Active 2m 10s · 18m total");
  assert.equal(mod.fmtDuration(301), "5m 1s");
});
