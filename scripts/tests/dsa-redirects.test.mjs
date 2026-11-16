/**
 * DSA Mastery's old URLs (src/lib/dsa/redirects.ts) and the path-only LEGACY rows (src/lib/learn/paths.ts).
 *   node --test scripts/tests/dsa-redirects.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { dsaRedirect, WORLD_TARGETS } from "../../src/lib/dsa/redirects.ts";
import { cleanPath, legacyTarget } from "../../src/lib/learn/paths.ts";

const r = (p, q = "") => dsaRedirect(p, new URLSearchParams(q));

test("the old worlds", () => {
  assert.equal(r("/dsa", "world=academy"), "/dsa");
  assert.equal(r("/dsa", "world=product-districts"), "/dsa/practice?list=interview-patterns");
  assert.equal(r("/dsa", "world=challenge-league"), "/dsa/practice?list=cp-camps");
  assert.equal(r("/dsa", "world=career-studio"), "/dsa/progress#plan");
  assert.equal(r("/dsa", "world=release-train"), "/dsa/review#plans");
  assert.equal(r("/dsa", "world=infrastructure"), "/dsa/practice?list=systems-bridge");
  assert.equal(r("/dsa", "world=nope"), "/dsa");
  assert.equal(r("/dsa/", "world=academy&x=1"), "/dsa");
  assert.equal(Object.keys(WORLD_TARGETS).length, 6);
});

test("a map node goes to its module", () => {
  assert.equal(r("/dsa", "node=m3.checkpoint-1"), "/dsa#m3");
  assert.equal(r("/dsa", "node=s1.linked-lists"), "/dsa#s1");
  assert.equal(r("/dsa", "node=garbage"), "/dsa");
});

test("lectures and daily", () => {
  assert.equal(r("/dsa/lectures"), "/dsa?view=lectures");
  assert.equal(r("/dsa/daily"), "/dsa/practice?list=daily");
});

test("no loops: targets are never redirected again", () => {
  for (const t of ["/dsa", "/dsa?view=lectures", "/dsa/practice?list=daily", "/dsa/progress#plan", "/dsa/review#plans", "/dsa/practice?list=cp-camps"]) {
    const [path, rest = ""] = t.split("#")[0].split("?");
    assert.equal(r(path, rest), null, t);
  }
  assert.equal(r("/dsa/problems/busiest-shard"), null);
  assert.equal(r("/dsa/concepts/x", "world=academy"), null);
});

test("path-only rows keep problem pages", () => {
  assert.equal(legacyTarget("/dsa/problems"), "/dsa/practice");
  assert.equal(legacyTarget("/dsa/problems/"), "/dsa/practice");
  assert.equal(legacyTarget("/dsa/problems/busiest-shard"), null);
  assert.equal(legacyTarget("/dsa/revise"), "/dsa/review");
  assert.equal(legacyTarget("/dsa/stats"), "/dsa/progress");
  assert.equal(cleanPath("/learn/dsa/problems?lvl=easy"), "/dsa/practice?lvl=easy");
  assert.equal(cleanPath("/learn/dsa/revise"), "/dsa/review");
});
