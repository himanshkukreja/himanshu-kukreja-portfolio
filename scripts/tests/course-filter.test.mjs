import { test } from "node:test";
import assert from "node:assert/strict";

const m = await import("../../src/lib/analytics/courseFilter.ts");

test("dsa paths", () => {
  assert.equal(m.isDsaPath("/dsa"), true);
  assert.equal(m.isDsaPath("/dsa/arrays/two-sum"), true);
  assert.equal(m.isDsaPath("/dsa?x=1"), true);
  assert.equal(m.isDsaPath("/dsaxyz"), false);
  assert.equal(m.isDsaPath("/learn/dsa"), false);
  assert.equal(m.isDsaPath("/"), false);
  assert.equal(m.isDsaPath(null), false);
});

test("classifyPaths: sdm, dsa, crossover", () => {
  assert.equal(m.classifyPaths([]), "sdm");
  assert.equal(m.classifyPaths(["/", "/learn/week-1"]), "sdm");
  assert.equal(m.classifyPaths(["/dsa", "/dsa/arrays"]), "dsa");
  assert.equal(m.classifyPaths(["/dsa", "/learn/x"]), "dsa");
  assert.equal(m.classifyPaths(["/learn/x", "/dsa/arrays"]), "sdm-dsa");
  assert.equal(m.classifyPaths(["/", null, "/dsa"]), "sdm-dsa");
});

test("classifySummary matches classifyPaths", () => {
  assert.equal(m.classifySummary("/learn/x", 0), "sdm");
  assert.equal(m.classifySummary(null, 0), "sdm");
  assert.equal(m.classifySummary("/dsa", 3), "dsa");
  assert.equal(m.classifySummary("/learn/x", 1), "sdm-dsa");
});

test("filters: DSA includes crossovers, SDM only excludes both, crossover alone", () => {
  const all = ["sdm", "dsa", "sdm-dsa"];
  assert.deepEqual(all.filter((c) => m.matchesCourse("all", c)), all);
  assert.deepEqual(all.filter((c) => m.matchesCourse("dsa", c)), ["dsa", "sdm-dsa"]);
  assert.deepEqual(all.filter((c) => m.matchesCourse("sdm", c)), ["sdm"]);
  assert.deepEqual(all.filter((c) => m.matchesCourse("sdm-dsa", c)), ["sdm-dsa"]);
});

test("parseCourse and staging hosts", () => {
  assert.equal(m.parseCourse("dsa"), "dsa");
  assert.equal(m.parseCourse("sdm-dsa"), "sdm-dsa");
  assert.equal(m.parseCourse("nope"), "all");
  assert.equal(m.parseCourse(null), "all");
  assert.equal(m.isStagingHost("staging.systemdesignmastery.dev"), true);
  assert.equal(m.isStagingHost("systemdesignmastery.dev"), false);
});
