/**
 * "My lists": create, rename, add, remove, reorder, progress, next unsolved, share links and copy.
 *   node --test scripts/tests/dsa-my-lists.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const M = await import("../../src/lib/dsa/my-lists.ts");

const mk = (name = "Google prep", ids = [], at = 1000, id = "abcd1234") => ({ v: 1, id, name, desc: "", ids, createdAt: at, updatedAt: at });

test("createList trims, validates, caps and refuses duplicate names", () => {
  assert.equal(M.createList([], "   ").ok, false);
  const r = M.createList([], "  Weekend   DP ", "  for the weekend ", 5, "idid1234");
  assert.ok(r.ok);
  assert.deepEqual(r.list, { v: 1, id: "idid1234", name: "Weekend DP", desc: "for the weekend", ids: [], createdAt: 5, updatedAt: 5 });
  assert.equal(M.createList([r.list], "weekend dp").ok, false);
  const full = Array.from({ length: M.MAX_LISTS }, (_, i) => mk(`L${i}`, [], i, `id${String(i).padStart(6, "0")}`));
  assert.equal(M.createList(full, "One more").ok, false);
  assert.equal(M.createList([], "x".repeat(200)).list.name.length, M.NAME_MAX);
});

test("rename keeps ids and refuses a name another list has", () => {
  const a = mk("A", ["p1"], 1, "aaaa1111");
  const b = mk("B", [], 2, "bbbb2222");
  assert.equal(M.renameList(a, [a, b], "b", "").ok, false);
  const r = M.renameList(a, [a, b], "A2", "new desc", 9);
  assert.ok(r.ok);
  assert.equal(r.list.name, "A2");
  assert.deepEqual(r.list.ids, ["p1"]);
  assert.equal(r.list.updatedAt, 9);
  assert.ok(M.renameList(a, [a, b], "a", "").ok, "its own name in another case is fine");
});

test("addProblem: once per list, many lists, capped", () => {
  const a = M.addProblem(mk(), "two-sum", 2).list;
  assert.deepEqual(a.ids, ["two-sum"]);
  assert.equal(M.addProblem(a, "two-sum", 3).list, a, "adding twice changes nothing");
  const b = M.addProblem(mk("B", [], 1, "bbbb2222"), "two-sum").list;
  assert.deepEqual(b.ids, ["two-sum"], "a problem can be in many lists");
  assert.equal(M.addProblem(mk(), "../etc").ok, false);
  const full = mk("F", Array.from({ length: M.MAX_PROBLEMS }, (_, i) => `p${i}`));
  assert.equal(M.addProblem(full, "extra").ok, false);
});

test("removeProblem and the tombstone", () => {
  const a = mk("A", ["x", "y", "z"]);
  assert.deepEqual(M.removeProblem(a, "y", 5).ids, ["x", "z"]);
  assert.equal(M.removeProblem(a, "nope"), a);
  const t = M.tombstone(a, 7);
  assert.equal(t.deleted, true);
  assert.deepEqual(t.ids, []);
  assert.equal(t.name, "");
});

test("moveProblem and nudgeProblem reorder, clamped", () => {
  const a = mk("A", ["a", "b", "c", "d"]);
  assert.deepEqual(M.moveProblem(a, 0, 2).ids, ["b", "c", "a", "d"]);
  assert.deepEqual(M.moveProblem(a, 3, 0).ids, ["d", "a", "b", "c"]);
  assert.deepEqual(M.moveProblem(a, 1, 99).ids, ["a", "c", "d", "b"]);
  assert.equal(M.moveProblem(a, 9, 0), a);
  assert.equal(M.moveProblem(a, 2, 2), a);
  assert.deepEqual(M.nudgeProblem(a, "c", -1).ids, ["a", "c", "b", "d"]);
  assert.deepEqual(M.nudgeProblem(a, "a", -1).ids, ["a", "b", "c", "d"], "the first cannot go up");
  assert.deepEqual(M.nudgeProblem(a, "d", 1).ids, ["a", "b", "c", "d"], "the last cannot go down");
});

test("listsFrom reads live lists from the flags, oldest first; tombstones, junk and mismatched keys drop out", () => {
  const a = mk("A", ["x"], 2, "aaaa1111");
  const b = mk("B", [], 1, "bbbb2222");
  const flags = {
    [M.flagKey("aaaa1111")]: a,
    [M.flagKey("bbbb2222")]: b,
    [M.flagKey("cccc3333")]: M.tombstone(mk("C", [], 3, "cccc3333")),
    [M.flagKey("dddd4444")]: { id: "dddd4444", name: "", ids: [] },
    [M.flagKey("eeee5555")]: mk("Wrong key", [], 4, "ffff6666"),
    "dsa:saved:x": 1,
  };
  assert.deepEqual(M.listsFrom(flags).map((l) => l.name), ["B", "A"]);
});

test("cleanList cleans ids and names from a stored value", () => {
  const l = M.cleanList({ id: "abcd1234", name: "  N\n", desc: 5, ids: ["a", "a", 3, "b c", "ok-1"], createdAt: "7" });
  assert.deepEqual({ name: l.name, desc: l.desc, ids: l.ids, createdAt: l.createdAt }, { name: "N", desc: "", ids: ["a", "ok-1"], createdAt: 7 });
  assert.equal(M.cleanList({ id: "x", name: "N" }), null);
  assert.equal(M.cleanList(null), null);
});

test("progressOf counts solved and the difficulty split over problems that exist", () => {
  const level = { a: "easy", b: "medium", c: "hard", d: "easy" };
  const p = M.progressOf(["a", "b", "c", "d", "gone"], (id) => level[id], (id) => id === "a" || id === "c");
  assert.deepEqual(p, { total: 4, solved: 2, easy: 2, medium: 1, hard: 1, solvedByLevel: { easy: 1, medium: 0, hard: 1 } });
});

test("nextUnsolved is the first unsolved problem that exists, in the list's order", () => {
  const have = new Set(["a", "b", "c"]);
  assert.equal(M.nextUnsolved(["a", "gone", "b", "c"], (i) => have.has(i), (i) => i === "a"), "b");
  assert.equal(M.nextUnsolved(["a"], (i) => have.has(i), () => true), null);
  assert.equal(M.nextUnsolved([], () => true, () => false), null);
});

test("listsHolding finds every list a problem is in", () => {
  const ls = [mk("A", ["x"], 1, "aaaa1111"), mk("B", ["y"], 2, "bbbb2222"), mk("C", ["x", "y"], 3, "cccc3333")];
  assert.deepEqual(M.listsHolding(ls, "x").map((l) => l.name), ["A", "C"]);
});

test("share links round-trip, stay small for a full list, and refuse junk", async () => {
  const ids = Array.from({ length: M.MAX_PROBLEMS }, (_, i) => `a-typical-problem-slug-number-${i}`);
  const s = { name: "Google prep", desc: "Six weeks, mediums first", ids };
  const code = await M.encodeShare(s);
  assert.match(code, /^z[A-Za-z0-9_-]+$/);
  assert.ok(code.length < 4000, `a 200-problem link is ${code.length} characters`);
  assert.deepEqual(await M.decodeShare(code), s);
  assert.equal(await M.decodeShare(""), null);
  assert.equal(await M.decodeShare("zzzz!!"), null);
  assert.equal(await M.decodeShare("zAAAA"), null);
  assert.equal(await M.decodeShare("p" + Buffer.from('[""]').toString("base64url")), null, "no name");
  const plain = "p" + Buffer.from(JSON.stringify(["Hi", "", "a,b,../x"])).toString("base64url");
  assert.deepEqual(await M.decodeShare(plain), { name: "Hi", desc: "", ids: ["a", "b"] });
});

test("copyShared makes a list of the viewer's own with a unique name", () => {
  const s = { name: "Google prep", desc: "d", ids: ["a", "b", "a"] };
  const first = M.copyShared([], s, 5, "idid1234");
  assert.ok(first.ok);
  assert.deepEqual(first.list.ids, ["a", "b"]);
  assert.equal(first.list.name, "Google prep");
  const second = M.copyShared([first.list], s, 6, "idid5678");
  assert.equal(second.list.name, "Google prep (2)");
  const third = M.copyShared([first.list, second.list], s, 7, "idid9999");
  assert.equal(third.list.name, "Google prep (3)");
  const full = Array.from({ length: M.MAX_LISTS }, (_, i) => mk(`L${i}`, [], i, `id${String(i).padStart(6, "0")}`));
  assert.equal(M.copyShared(full, s).ok, false);
});
