// Driver generator tests. C++ and Java drivers are checked structurally here
// and compiled + run for real by test/integration.sh inside the Docker image.
// Python and JS drivers are executed here when python3/node are available.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { camelCase, fnNameFor, generateDriver, parseSignature, parseType, snakeCase } from "../src/harness/index.ts";
import { cppType } from "../src/harness/cpp.ts";
import { javaReadExpr, javaType, javaStdioClass, JAVA_IMPORTS } from "../src/harness/java.ts";

// The four signatures the owner asked for, plus list/tree helpers.
const SIGS = {
  sumArray: { fn: "array_sum", params: [{ name: "nums", type: "int[]" }], returns: "int" },
  twoSum: { fn: "two_sum", params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }], returns: "int[]" },
  palindrome: { fn: "is_palindrome", params: [{ name: "s", type: "string" }], returns: "bool" },
  islands: { fn: "num_islands", params: [{ name: "grid", type: "int[][]" }], returns: "int" },
  reverseList: { fn: "reverse_list", params: [{ name: "head", type: "ListNode" }], returns: "ListNode" },
  invertTree: { fn: "invert_tree", params: [{ name: "root", type: "TreeNode" }], returns: "TreeNode" },
  busiest: { fn: "busiest_stretch", params: [{ name: "plays", type: "int[]" }, { name: "k", type: "int" }], returns: "long" },
};

test("parseType handles scalars, nested arrays and nodes", () => {
  assert.deepEqual(parseType("int"), { kind: "scalar", name: "int" });
  assert.deepEqual(parseType("int[][]"), { kind: "array", elem: { kind: "array", elem: { kind: "scalar", name: "int" } } });
  assert.deepEqual(parseType("string[]"), { kind: "array", elem: { kind: "scalar", name: "string" } });
  assert.deepEqual(parseType("ListNode"), { kind: "node", name: "ListNode" });
  assert.throws(() => parseType("map<int,int>"), /unsupported type/);
});

test("parseSignature validates names and flags node usage", () => {
  const s = parseSignature(SIGS.reverseList);
  assert.equal(s.usesListNode, true);
  assert.equal(s.usesTreeNode, false);
  assert.throws(() => parseSignature({ fn: "f", params: [{ name: "class", type: "int" }], returns: "int" }), /reserved/);
  assert.throws(() => parseSignature({ fn: "f", params: [{ name: "a", type: "int" }, { name: "a", type: "int" }], returns: "int" }), /duplicate/);
  assert.throws(() => parseSignature({ fn: "bad name", params: [], returns: "int" }), /identifier/);
});

test("function naming per language", () => {
  assert.equal(camelCase("busiest_stretch"), "busiestStretch");
  assert.equal(snakeCase("busiestStretch"), "busiest_stretch");
  assert.equal(fnNameFor("python", "busiest_stretch"), "busiest_stretch");
  assert.equal(fnNameFor("java", "busiest_stretch"), "busiestStretch");
  assert.equal(fnNameFor("cpp", "two_sum"), "twoSum");
});

test("C++ type mapping and driver for (int[], int) -> int[]", () => {
  assert.equal(cppType(parseType("int[][]")), "vector<vector<int>>");
  assert.equal(cppType(parseType("long")), "long long");
  assert.equal(cppType(parseType("TreeNode")), "TreeNode*");
  const learner = "class Solution { public: vector<int> twoSum(vector<int>& nums, int target) { return {0, 1}; } };";
  const src = generateDriver("cpp", parseSignature(SIGS.twoSum), learner).files["main.cpp"];
  assert.match(src, /#include <bits\/stdc\+\+\.h>/);
  assert.match(src, /#line 1 "solution\.cpp"\n class Solution|#line 1 "solution\.cpp"\nclass Solution/);
  assert.match(src, /vector<int> a0 = judge_rt::Read<vector<int>>::go\(r_\);/);
  assert.match(src, /int a1 = judge_rt::Read<int>::go\(r_\);/);
  assert.match(src, /vector<int> res_ = sol_\.twoSum\(a0, a1\);/);
  assert.doesNotMatch(src, /struct ListNode/, "node structs only when used");
});

test("C++ drivers for the other required signatures", () => {
  // LeetCode style: a class Solution is called through an instance
  const sum = generateDriver("cpp", parseSignature(SIGS.sumArray), "class Solution { public: int arraySum(vector<int>& a) { return 0; } };").files["main.cpp"];
  assert.match(sum, /int res_ = sol_\.arraySum\(a0\);/);
  // the course's style: a plain function is called directly (a Solution-only driver failed every such submission)
  const plain = generateDriver("cpp", parseSignature(SIGS.sumArray), "int arraySum(const vector<int>& a) { return 0; }").files["main.cpp"];
  assert.match(plain, /int res_ = arraySum\(a0\);/);
  assert.doesNotMatch(plain, /Solution sol_/);
  const pal = generateDriver("cpp", parseSignature(SIGS.palindrome), "struct Solution { bool isPalindrome(string s) { return true; } };").files["main.cpp"];
  assert.match(pal, /string a0 = judge_rt::Read<string>::go\(r_\);/);
  assert.match(pal, /bool res_ = sol_\.isPalindrome\(a0\);/);
  const isl = generateDriver("cpp", parseSignature(SIGS.islands), "").files["main.cpp"];
  assert.match(isl, /vector<vector<int>> a0 = judge_rt::Read<vector<vector<int>>>::go\(r_\);/);
  const rl = generateDriver("cpp", parseSignature(SIGS.reverseList), "").files["main.cpp"];
  assert.match(rl, /struct ListNode/);
  assert.match(rl, /template <> struct Read<ListNode\*>/);
  assert.doesNotMatch(rl, /struct TreeNode/);
});

test("Java type mapping, reader expressions and drivers", () => {
  assert.equal(javaType(parseType("int[][]")), "int[][]");
  assert.equal(javaType(parseType("bool")), "boolean");
  assert.equal(javaReadExpr(parseType("int[]")), "r.readIntArray()");
  assert.equal(javaReadExpr(parseType("int[][]")), "r.readArray(() -> r.readIntArray(), int[][]::new)");
  assert.equal(javaReadExpr(parseType("string[]")), "r.readArray(() -> r.readString(), String[]::new)");
  assert.equal(javaReadExpr(parseType("TreeNode")), "r.readTree()");

  const learner = "class Solution { public int[] twoSum(int[] nums, int target) { return new int[]{0, 1}; } }";
  const files = generateDriver("java", parseSignature(SIGS.twoSum), learner).files;
  assert.deepEqual(Object.keys(files).sort(), ["Main.java", "Solution.java"]);
  assert.ok(files["Solution.java"].startsWith(JAVA_IMPORTS + "class Solution"), "imports share line 1");
  assert.ok(!JAVA_IMPORTS.includes("\n"));
  assert.match(files["Main.java"], /int\[\] a0 = r\.readIntArray\(\);\n {8}r\.expect\(','\);\n {8}int a1 = r\.readInt\(\);/);
  assert.match(files["Main.java"], /int\[\] res = new Solution\(\)\.twoSum\(a0, a1\);/);

  const isl = generateDriver("java", parseSignature(SIGS.islands), "").files["Main.java"];
  assert.match(isl, /int\[\]\[\] a0 = r\.readArray\(\(\) -> r\.readIntArray\(\), int\[\]\[\]::new\);/);
  const pal = generateDriver("java", parseSignature(SIGS.palindrome), "").files["Main.java"];
  assert.match(pal, /boolean res = new Solution\(\)\.isPalindrome\(a0\);/);
  const sum = generateDriver("java", parseSignature(SIGS.sumArray), "").files["Main.java"];
  assert.match(sum, /int res = new Solution\(\)\.arraySum\(a0\);/);
  const tree = generateDriver("java", parseSignature(SIGS.invertTree), "").files["Main.java"];
  assert.match(tree, /class TreeNode/);
  assert.doesNotMatch(tree, /class ListNode/);
});

test("javaStdioClass finds the public class", () => {
  assert.equal(javaStdioClass("public class Solver { public static void main(String[] a){} }"), "Solver");
  assert.equal(javaStdioClass("class Main {}"), "Main");
  assert.equal(javaStdioClass("public final class Fast {}"), "Fast");
});

function have(bin: string): boolean {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runDriver(lang: "python" | "javascript", sig: object, code: string, input: string): string {
  const dir = mkdtempSync(join(tmpdir(), "judge-harness-"));
  const files = generateDriver(lang, parseSignature(sig as never), code).files;
  for (const [n, c] of Object.entries(files)) writeFileSync(join(dir, n), c);
  const cmd = lang === "python" ? ["python3", ["-B", "main.py"]] : [process.execPath, ["main.js"]];
  execFileSync(cmd[0] as string, cmd[1] as string[], { cwd: dir, input, stdio: ["pipe", "pipe", "pipe"] });
  return readFileSync(join(dir, "__result.json"), "utf8");
}

const py = have("python3");

test("Python driver runs: function and class Solution styles", { skip: !py && "python3 not installed" }, () => {
  assert.equal(runDriver("python", SIGS.sumArray, "def array_sum(nums):\n    return sum(nums)\n", "[[1,2,3]]"), "6");
  assert.equal(
    runDriver("python", SIGS.twoSum, "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        return [0, 1]\n", "[[2,7],9]"),
    "[0,1]",
  );
  assert.equal(runDriver("python", SIGS.palindrome, "def is_palindrome(s):\n    return s == s[::-1]\n", '["abba"]'), "true");
  assert.equal(runDriver("python", SIGS.islands, "def num_islands(grid):\n    return len(grid)\n", "[[[1,0],[0,1]]]"), "2");
  assert.equal(
    runDriver(
      "python",
      SIGS.reverseList,
      "class Solution:\n    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:\n        prev = None\n        while head:\n            head.next, prev, head = prev, head, head.next\n        return prev\n",
      "[[1,2,3]]",
    ),
    "[3,2,1]",
  );
  assert.equal(
    runDriver(
      "python",
      SIGS.invertTree,
      "def invert_tree(root):\n    if root:\n        root.left, root.right = invert_tree(root.right), invert_tree(root.left)\n    return root\n",
      "[[4,2,7,1,3,6,9]]",
    ),
    "[4,7,2,9,6,3,1]",
  );
  assert.equal(runDriver("python", SIGS.busiest, "def busiest_stretch(plays, k):\n    return 2**62\n", "[[1],1]"), String(2n ** 62n));
});

test("JS driver runs: function and class Solution styles", () => {
  assert.equal(runDriver("javascript", SIGS.sumArray, "function arraySum(nums) { return nums.reduce((a, b) => a + b, 0); }", "[[1,2,3]]"), "6");
  assert.equal(runDriver("javascript", SIGS.twoSum, "class Solution { twoSum(nums, target) { return [0, 1]; } }", "[[2,7],9]"), "[0,1]");
  assert.equal(runDriver("javascript", SIGS.palindrome, "var isPalindrome = function (s) { return s === [...s].reverse().join(''); };", '["abc"]'), "false");
  assert.equal(runDriver("javascript", SIGS.islands, "function numIslands(g) { return g.length; }", "[[[1],[0],[1]]]"), "3");
  assert.equal(
    runDriver("javascript", SIGS.reverseList, "function reverseList(h) { let p = null; while (h) { const n = h.next; h.next = p; p = h; h = n; } return p; }", "[[1,2,3]]"),
    "[3,2,1]",
  );
  assert.equal(
    runDriver("javascript", SIGS.invertTree, "function invertTree(r) { if (r) { [r.left, r.right] = [invertTree(r.right), invertTree(r.left)]; } return r; }", "[[2,1,3]]"),
    "[2,3,1]",
  );
  assert.equal(runDriver("javascript", SIGS.busiest, "function busiestStretch() { return 2n ** 62n; }", "[[1],1]"), String(2n ** 62n));
});
