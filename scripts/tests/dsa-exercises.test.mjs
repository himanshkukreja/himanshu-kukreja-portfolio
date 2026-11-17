/**
 * DSA in-lesson exercises: the four fenced blocks (```bug, ```predict, ```order, ```breakit), their parser and checks.
 *   node --test scripts/tests/dsa-exercises.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`),
);
const X = await import("../../src/lib/dsa/exercises.ts");

const HEAD = (id, title) => `%% id: ${id}\n%% title: ${title}\n`;

const BUG = `${HEAD("bs-off-by-one", "Find the bug · The loop that never ends")}? This binary search hangs on some inputs. Which line is wrong?
@python
def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid          #! lo = mid + 1
        elif nums[mid] > target:
            hi = mid - 1
        else:
            return mid
    return -1
@java
int search(int[] nums, int target) {
    int lo = 0, hi = nums.length - 1;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (nums[mid] < target) lo = mid; //! if (nums[mid] < target) lo = mid + 1;
        else if (nums[mid] > target) hi = mid - 1;
        else return mid;
    }
    return -1;
}
hint: Look at what happens when lo and hi are next to each other.
fails: nums=[1, 3], target=3   ->   loops forever (lo stays 0)   # trailing note
> When nums[mid] < target, mid itself can't be the answer.
> So lo must move past it.
`;

test("bug: marker per language, stripped for display, fixed line keeps the indentation", () => {
  const r = X.parseExercise("bug", BUG);
  assert.ok(r.ok, r.errors?.join());
  const ex = r.ex;
  assert.equal(ex.id, "bs-off-by-one");
  assert.equal(X.exerciseTitle("bug", ex.title), "The loop that never ends");
  const py = ex.code.python;
  assert.equal(py.bugIndex, 5);
  assert.equal(py.lines[5], "            lo = mid");
  assert.equal(py.fixed, "            lo = mid + 1");
  assert.ok(!py.lines.join("\n").includes("#!"));
  const java = ex.code.java;
  assert.equal(java.lines[4], "        if (nums[mid] < target) lo = mid;");
  assert.equal(java.fixed, "        if (nums[mid] < target) lo = mid + 1;");
  assert.equal(ex.fails, "nums=[1, 3], target=3   ->   loops forever (lo stays 0)");
  assert.deepEqual(ex.explain, ["When nums[mid] < target, mid itself can't be the answer.", "So lo must move past it."]);
  assert.equal(ex.hint, "Look at what happens when lo and hi are next to each other.");
});

test("bug: needs exactly one marker per language, and a real fix", () => {
  const two = BUG.replace("hi = mid - 1\n        else:", "hi = mid - 1  #! hi = mid\n        else:");
  assert.equal(X.parseExercise("bug", two).ok, false);
  assert.match(X.parseExercise("bug", two).errors.join(), /exactly one/);
  const none = BUG.replace("#! lo = mid + 1", "");
  assert.equal(X.parseExercise("bug", none).ok, false);
  const same = BUG.replace("#! lo = mid + 1", "#! lo = mid");
  assert.match(X.parseExercise("bug", same).errors.join(), /equals the buggy line/);
  assert.equal(X.parseExercise("bug", BUG.replace("%% id: bs-off-by-one\n", "")).ok, false);
  assert.equal(X.parseExercise("bug", BUG.replace(/^fails:.*$/m, "")).ok, false);
});

const PREDICT = `${HEAD("two-pointer-final-state", "Predict · Where do the pointers stop?")}? What does this print?
@python
nums = [1, 2, 4, 7, 11]
l, r = 0, len(nums) - 1
while l < r and nums[l] + nums[r] != 13:
    if nums[l] + nums[r] < 13: l += 1
    else: r -= 1
print(l, r)
@javascript
console.log(1, 4);
- [ ] 0 4
- [x] 1 4
- [ ] 2 3
- [ ] 1 3
trace: two-pointer-sum-hand   # optional
> 1 + 11 = 12 is too small, so l moves to 1.
`;

test("predict: choices, the one [x], trace, code per language", () => {
  const r = X.parseExercise("predict", PREDICT);
  assert.ok(r.ok, r.errors?.join());
  assert.equal(r.ex.mode, "choices");
  assert.equal(r.ex.answer, "1 4");
  assert.equal(r.ex.choices.length, 4);
  assert.equal(r.ex.trace, "two-pointer-sum-hand");
  assert.ok(r.ex.code.python.endsWith("print(l, r)"));
  assert.equal(r.ex.code.javascript, "console.log(1, 4);");
  assert.ok(!r.ex.code.python.includes("- [ ]"));
});

test("predict: exact mode, and malformed choices are refused", () => {
  const exact = PREDICT.replace(/^- \[.\] .*\n/gm, "").replace("trace:", "answer: 1 4\ntrace:");
  const r = X.parseExercise("predict", exact);
  assert.ok(r.ok, r.errors?.join());
  assert.equal(r.ex.mode, "exact");
  assert.equal(r.ex.answer, "1 4");
  assert.equal(X.parseExercise("predict", PREDICT.replace("- [x]", "- [ ]")).ok, false);
  assert.equal(X.parseExercise("predict", PREDICT.replace("- [ ] 0 4", "- [x] 0 4")).ok, false);
  assert.equal(X.parseExercise("predict", PREDICT.replace("answer", "x") + "answer: 1 4\n").ok, false);
});

test("predict: a `*` bullet works too", () => {
  assert.ok(X.parseExercise("predict", PREDICT.replace(/^- \[/gm, "* [")).ok);
});

test("predict: answers compare after trimming and whitespace normalising", () => {
  assert.ok(X.answerMatches("  1   4 \n", "1 4"));
  assert.ok(X.answerMatches("a b\nc", "a   b \n c "));
  assert.ok(!X.answerMatches("14", "1 4"));
  assert.ok(!X.answerMatches("True", "true"));
});

const ORDER = `${HEAD("bfs-template-order", "Put it in order · The BFS template")}? Arrange the lines to make a working BFS that returns the visit order.
@python
def bfs(graph, start):
    seen = {start}
    queue = deque([start])
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in graph[node]:
            if nxt not in seen:
{1}                 seen.add(nxt)
{1}                 queue.append(nxt)
    return order
~     stack = [start]
sig: bfs(graph: int[][], start: int) -> int[]
check: [[[1], [0]], 0] -> [0, 1]
> Mark a node as seen when you add it to the queue.
`;

test("order: lines keep indentation, distractors and swap groups parse", () => {
  const r = X.parseExercise("order", ORDER);
  assert.ok(r.ok, r.errors?.join());
  const lines = r.ex.code.python;
  assert.equal(lines.length, 13);
  assert.equal(lines.filter((l) => l.distractor).length, 1);
  assert.equal(lines[0].text, "def bfs(graph, start):");
  assert.equal(lines[1].text, "    seen = {start}");
  assert.equal(lines[8].text, "            if nxt not in seen:");
  assert.equal(lines[9].text, "                seen.add(nxt)");
  assert.deepEqual(lines.filter((l) => l.group === 1).map((l) => l.text.trim()), ["seen.add(nxt)", "queue.append(nxt)"]);
  assert.equal(lines[12].text, "    stack = [start]");
  assert.equal(X.solutionOf(lines).length, 12);
});

test("order: a set literal at the end of a line is not a group, a lone group is refused", () => {
  const l = X.parseOrderLines(["    seen = {1}", "{3}     x = 2", "~ pass", "{12} y", "~", "  ~ keep"]);
  assert.equal(l[0].group, null);
  assert.equal(l[0].text, "    seen = {1}");
  assert.equal(l[1].group, 3);
  assert.equal(l[1].text, "    x = 2");
  assert.equal(l[2].distractor, true);
  assert.equal(l[2].text, "pass");
  assert.equal(l[3].group, 12);
  assert.equal(l.length, 5);
  assert.equal(l[4].distractor, false);
  const lone = ORDER.replace("{1}                 queue.append(nxt)", "                queue.append(nxt)");
  assert.match(X.parseExercise("order", lone).errors.join(), /single line/);
});

test("order: checkOrder finds the first wrong position, allows grouped swaps and the tray", () => {
  const lines = X.parseExercise("order", ORDER).ex.code.python;
  const sol = lines.map((l, i) => (l.distractor ? -1 : i)).filter((i) => i >= 0);
  const dis = lines.map((l, i) => (l.distractor ? i : -1)).filter((i) => i >= 0);
  assert.equal(X.checkOrder(lines, sol, dis).ok, true);
  // the grouped pair swapped is still right
  const swapped = [...sol];
  [swapped[9], swapped[10]] = [swapped[10], swapped[9]];
  assert.equal(X.checkOrder(lines, swapped, dis).ok, true);
  // two ungrouped lines swapped: the first wrong position is the earlier one
  const bad = [...sol];
  [bad[2], bad[3]] = [bad[3], bad[2]];
  const r = X.checkOrder(lines, bad, dis);
  assert.equal(r.ok, false);
  assert.equal(r.firstWrong, 2);
  // distractor left in the program
  const withD = [...sol, dis[0]];
  const r2 = X.checkOrder(lines, withD, []);
  assert.equal(r2.ok, false);
  assert.equal(r2.extra, true);
  assert.equal(r2.firstWrong, sol.length);
  // a needed line parked in the tray
  const r3 = X.checkOrder(lines, sol.slice(0, -1), [sol.at(-1), ...dis]);
  assert.equal(r3.ok, false);
  assert.equal(r3.missing, true);
  assert.equal(r3.firstWrong, sol.length - 1);
});

test("order: the shuffle is stable and never the solution order", () => {
  for (let n = 2; n < 14; n++) {
    const a = X.shuffleIndices(n, X.seedOf("x" + n));
    assert.deepEqual(a, X.shuffleIndices(n, X.seedOf("x" + n)));
    assert.deepEqual([...a].sort((p, q) => p - q), Array.from({ length: n }, (_, i) => i));
    assert.notDeepEqual(a, Array.from({ length: n }, (_, i) => i));
  }
});

const BREAK = `${HEAD("max-subarray-all-negative", "Break it · Find the input this misses")}? This "maximum subarray sum" resets to 0 too eagerly. Find an input where it gives the wrong answer.
input: nums: int[]          # input schema
example: [2, -1, 3]         # pre-filled
@python
def best(nums):
    run = best = 0
    for x in nums:
        run = max(0, run + x)
        best = max(best, run)
    return best
@run-wrong
function solve(nums){ let run=0,best=0; for(const x of nums){ run=Math.max(0,run+x); best=Math.max(best,run);} return best; }
@run-right
function solve(nums){ let run=nums[0],best=nums[0]; for(let i=1;i<nums.length;i++){ run=Math.max(nums[i],run+nums[i]); best=Math.max(best,run);} return best; }
breaks: [[-3, -1, -2]]      # at least one
hint: What if every number is negative?
> Starting at 0 lets the answer be "an empty run".
`;

test("breakit: schema, example, breaks, the JS pair", () => {
  const r = X.parseExercise("breakit", BREAK);
  assert.ok(r.ok, r.errors?.join());
  assert.deepEqual(r.ex.inputs, [{ name: "nums", type: "int[]" }]);
  assert.deepEqual(r.ex.example, ["[2, -1, 3]"]);
  assert.deepEqual(r.ex.breaks, [[[-3, -1, -2]]]);
  assert.ok(r.ex.code.python.startsWith("def best"));
  assert.match(r.ex.runWrong, /function solve/);
  assert.equal(r.ex.hint, "What if every number is negative?");
});

test("breakit: the pair agrees on the example and differs on every break (what the checker verifies)", () => {
  const ex = X.parseExercise("breakit", BREAK).ex;
  const run = (code, text) => X.evalSolve(code, [X.parseValue("int[]", text).value]);
  assert.deepEqual(run(ex.runWrong, ex.example[0]), run(ex.runRight, ex.example[0]));
  assert.equal(run(ex.runWrong, ex.example[0]).text, "4");
  const w = X.evalSolve(ex.runWrong, ex.breaks[0]);
  const rt = X.evalSolve(ex.runRight, ex.breaks[0]);
  assert.equal(w.text, "0");
  assert.equal(rt.text, "-1");
  assert.ok(X.isWin(w, rt));
  assert.ok(!X.isWin(rt, rt));
});

test("breakit: several fields, bad schema, bad example and bad breaks are refused", () => {
  const multi = BREAK.replace("input: nums: int[]", "input: nums: int[], k: int").replace("example: [2, -1, 3]", "example: [[2, -1, 3], 2]").replace("breaks: [[-3, -1, -2]]", "breaks: [[[-3, -1, -2], 1]]");
  const r = X.parseExercise("breakit", multi);
  assert.ok(r.ok, r.errors?.join());
  assert.equal(r.ex.inputs.length, 2);
  assert.deepEqual(r.ex.example, ["[2, -1, 3]", "2"]);
  assert.deepEqual(r.ex.breaks, [[[-3, -1, -2], 1]]);
  assert.equal(X.parseExercise("breakit", BREAK.replace("int[]", "float")).ok, false);
  assert.equal(X.parseExercise("breakit", BREAK.replace("example: [2, -1, 3]", "example: [2, x]")).ok, false);
  assert.equal(X.parseExercise("breakit", BREAK.replace("[[-3, -1, -2]]", "[[-3.5]]")).ok, false);
  assert.equal(X.parseExercise("breakit", BREAK.replace("@run-right", "@nope")).ok, false);
});

test("breakit: a crash or a loop in the wrong version is a win; a crash in the right one is not", () => {
  const ok = { status: "ok", text: "1" };
  assert.ok(X.isWin({ status: "error", text: "x" }, ok));
  assert.ok(X.isWin({ status: "timeout", text: "x" }, ok));
  assert.ok(!X.isWin(ok, { status: "error", text: "x" }));
  assert.ok(!X.isWin(ok, ok));
  assert.equal(X.evalSolve("function solve(a){ return a.b.c; }", [1]).status, "error");
  assert.equal(X.evalSolve("var x = 1;", []).status, "error");
});

test("breakit: input parsing by type, with the size limits", () => {
  const v = (t, s) => X.parseValue(t, s);
  assert.deepEqual(v("int", " -7 "), { ok: true, value: -7 });
  assert.equal(v("int", "1.5").ok, false);
  assert.equal(v("int", "1000001").ok, false);
  assert.deepEqual(v("int[]", "[1, 2, 3]").value, [1, 2, 3]);
  assert.deepEqual(v("int[]", "1, 2, 3").value, [1, 2, 3]);
  assert.deepEqual(v("int[]", "").value, []);
  assert.equal(v("int[]", "[1, 2.5]").ok, false);
  assert.equal(v("int[]", "[" + Array(51).fill(1).join(",") + "]").ok, false);
  assert.equal(v("int[]", "[" + Array(50).fill(1).join(",") + "]").ok, true);
  assert.equal(v("int[]", "[1, 2").ok, false);
  assert.equal(v("int[]", "[1000000, -1000000]").ok, true);
  assert.equal(v("int[]", "[1000001]").ok, false);
  assert.deepEqual(v("int[][]", "[[1, 2], [3]]").value, [[1, 2], [3]]);
  assert.equal(v("int[][]", "[1, 2]").ok, false);
  assert.equal(v("int[][]", JSON.stringify(Array(51).fill([1]))).ok, false);
  assert.deepEqual(v("string", '"abc"').value, "abc");
  assert.deepEqual(v("string", "abc").value, "abc");
  assert.equal(v("string", "a".repeat(51)).ok, false);
  assert.equal(v("string", "a".repeat(50)).ok, true);
  assert.deepEqual(v("string[]", '["ab", "c"]').value, ["ab", "c"]);
  assert.deepEqual(v("string[]", "ab, c").value, ["ab", "c"]);
  assert.deepEqual(v("string[]", "['ab']").value, ["ab"]);
  assert.deepEqual(v("bool", "True").value, true);
  assert.equal(v("bool", "yes").ok, false);
});

test("the four kinds and the title helper", () => {
  assert.ok(X.isExKind("bug") && X.isExKind("BREAKIT") && !X.isExKind("quiz"));
  assert.equal(X.exerciseTitle("predict", "Predict the output · Where do the pointers stop?"), "Where do the pointers stop?");
  assert.equal(X.exerciseTitle("breakit", "Break it"), "");
  assert.equal(X.exerciseTitle("predict", "Predict · Where do they stop?"), "Where do they stop?");
  assert.equal(X.exerciseTitle("order", "Put it in order · The BFS template"), "The BFS template");
  assert.equal(X.exerciseTitle("order", "A custom title"), "A custom title");
  assert.deepEqual(X.splitTopLevel("[1, 2], 3, 'a,b'"), ["[1, 2]", "3", "'a,b'"]);
  assert.equal(X.pickLang({ java: 1 }, "python"), "java");
  assert.equal(X.parseExercise("bug", "garbage").ok, false);
});
