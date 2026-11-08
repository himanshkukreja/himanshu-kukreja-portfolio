import { test } from "node:test";
import assert from "node:assert/strict";
import { compareJson, compareText, parseCompareSpec } from "../src/compare.ts";

const exact = parseCompareSpec("exact");
const token = parseCompareSpec("token");
const float6 = parseCompareSpec("float:1e-6");
const unordered = parseCompareSpec("unordered");
const deep = parseCompareSpec("unordered:deep");

test("parseCompareSpec accepts plan and object forms", () => {
  assert.deepEqual(parseCompareSpec(undefined), { mode: "exact" });
  assert.deepEqual(parseCompareSpec("float"), { mode: "float", epsilon: 1e-6 });
  assert.deepEqual(parseCompareSpec("float:1e-3"), { mode: "float", epsilon: 1e-3 });
  assert.deepEqual(parseCompareSpec({ mode: "float", epsilon: 0.01 }), { mode: "float", epsilon: 0.01 });
  assert.deepEqual(parseCompareSpec({ mode: "unordered", deep: true }), { mode: "unordered", deep: true });
  assert.throws(() => parseCompareSpec("custom"), /not supported/);
  assert.throws(() => parseCompareSpec("float:abc"), /epsilon/);
  assert.throws(() => parseCompareSpec("fuzzy"), /unsupported/);
});

test("text exact: ignores CRLF, trailing spaces and trailing blank lines only", () => {
  assert.equal(compareText("1 2\n3\n", "1 2  \r\n3\n\n\n", exact).ok, true);
  assert.equal(compareText("1 2\n3", "1  2\n3", exact).ok, false);
  assert.equal(compareText("1\n2", "1\n\n2", exact).ok, false);
  assert.deepEqual(compareText("a\nb", "a\nc", exact), { ok: false, reason: "line 2 differs" });
});

test("text token: any whitespace between tokens", () => {
  assert.equal(compareText("1 2\n3", "1\n2   3\n", token).ok, true);
  assert.equal(compareText("1 2 3", "1 2", token).ok, false);
  assert.equal(compareText("1.0", "1", token).ok, false);
});

test("text float: absolute or relative epsilon, non-numbers exact", () => {
  assert.equal(compareText("0.3333333", "0.33333334", float6).ok, true);
  assert.equal(compareText("1000000000", "1000000500", float6).ok, true, "relative");
  assert.equal(compareText("0.5", "0.6", float6).ok, false);
  assert.equal(compareText("YES 0.5", "NO 0.5", float6).ok, false);
  assert.equal(compareText("1e3", "1000.0000001", float6).ok, true);
});

test("text unordered: line multiset", () => {
  assert.equal(compareText("a\nb\nb", "b\na\nb\n", unordered).ok, true);
  assert.equal(compareText("a\nb\nb", "a\na\nb", unordered).ok, false);
});

test("json exact: values, not formatting; 64-bit integers compare exactly", () => {
  assert.equal(compareJson("[1, 2, 3]", "[1,2,3]", exact).ok, true);
  assert.equal(compareJson("9223372036854775807", "9223372036854775807", exact).ok, true);
  assert.equal(compareJson("9223372036854775807", "9223372036854775806", exact).ok, false, "differs beyond double precision");
  assert.equal(compareJson("2.5", "2.50", exact).ok, true);
  assert.equal(compareJson("0.1", "0.10000000000000001", exact).ok, true, "C++ %.17g of 0.1");
  assert.equal(compareJson("1e10", "1.0E10", exact).ok, true, "Java Double.toString");
  assert.equal(compareJson("true", "1", exact).ok, false);
  assert.equal(compareJson('"abc"', '"abd"', exact).ok, false);
  assert.equal(compareJson("[1,null,2]", "[1,null,2]", exact).ok, true);
  assert.equal(compareJson("[[1,2],[3]]", "[[1,2],[3,4]]", exact).ok, false);
});

test("json float: nested numbers within epsilon", () => {
  assert.equal(compareJson("[0.333333, 2]", "[0.33333333333,2.0000001]", float6).ok, true);
  assert.equal(compareJson("[0.3]", "[0.31]", float6).ok, false);
});

test("json unordered: top level only, or deep", () => {
  assert.equal(compareJson("[[1,2],[3,4]]", "[[3,4],[1,2]]", unordered).ok, true);
  assert.equal(compareJson("[[1,2],[3,4]]", "[[4,3],[1,2]]", unordered).ok, false);
  assert.equal(compareJson("[[1,2],[3,4]]", "[[4,3],[2,1]]", deep).ok, true);
  assert.equal(compareJson("[1,1,2]", "[1,2,2]", unordered).ok, false);
});

test("json: unreadable output is WA, unreadable expected is a test-data error", () => {
  assert.deepEqual(compareJson("[1]", "[1", exact), { ok: false, reason: "returned value could not be read" });
  assert.throws(() => compareJson("[1", "[1]", exact), /expected value is not valid JSON/);
});
