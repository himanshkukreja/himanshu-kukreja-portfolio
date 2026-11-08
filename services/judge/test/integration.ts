// Integration test: judges sample C++/Java (and Python/JS) solutions against a
// running judge-lite container. Run through test/integration.sh, which builds
// the image and starts the container; or point it at any judge:
//
//   JUDGE_URL=http://127.0.0.1:18080 JUDGE_HMAC_SECRET=... node test/integration.ts

import { callJudge } from "../client/judge-client.ts";

const env = {
  JUDGE_URL: process.env.JUDGE_URL ?? "http://127.0.0.1:18080",
  JUDGE_HMAC_SECRET: process.env.JUDGE_HMAC_SECRET ?? "",
  JUDGE_KEY_ID: process.env.JUDGE_KEY_ID,
};
const ARCH = process.env.JUDGE_ARCH ?? "x86_64";

const TWO_SUM = { fn: "two_sum", params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }], returns: "int[]" };
const TWO_SUM_TESTS = [
  { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
  { input: [[3, 2, 4], 6], expected: [1, 2], hidden: true },
  { input: [[3, 3], 6], expected: [0, 1], hidden: true },
];
const SUM = { fn: "array_sum", params: [{ name: "nums", type: "int[]" }], returns: "int" };
const PAL = { fn: "is_palindrome", params: [{ name: "s", type: "string" }], returns: "bool" };
const GRID = { fn: "count_ones", params: [{ name: "grid", type: "int[][]" }], returns: "int" };
const REV = { fn: "reverse_list", params: [{ name: "head", type: "ListNode" }], returns: "ListNode" };
const INV = { fn: "invert_tree", params: [{ name: "root", type: "TreeNode" }], returns: "TreeNode" };

interface Case {
  name: string;
  body: Record<string, unknown>;
  expect: string[];
  check?: (r: Record<string, any>) => string | null;
  skip?: string;
}

const fn = (language: string, code: string, signature = TWO_SUM, tests: unknown[] = TWO_SUM_TESTS, extra: Record<string, unknown> = {}) => ({
  language,
  code,
  mode: "function",
  signature,
  tests,
  limits: { timeMs: 1000, memoryMb: 256 },
  stopOnFirstFailure: false,
  ...extra,
});

const stdio = (language: string, code: string, tests: unknown[], extra: Record<string, unknown> = {}) => ({
  language,
  code,
  mode: "stdio",
  tests,
  limits: { timeMs: 1000, memoryMb: 256 },
  ...extra,
});

const CPP_TWO_SUM = `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            auto it = seen.find(target - nums[i]);
            if (it != seen.end()) return {it->second, i};
            seen[nums[i]] = i;
        }
        return {};
    }
};`;

const JAVA_TWO_SUM = `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[]{j, i};
            seen.put(nums[i], i);
        }
        return new int[0];
    }
}`;

const NET_CPP = `#include <bits/stdc++.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
int main() {
    bool ok = false;
    int s = socket(AF_INET, SOCK_STREAM, 0);
    if (s >= 0) {
        sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(80);
        inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
        if (connect(s, (sockaddr*)&a, sizeof a) == 0) ok = true;
    }
    addrinfo* res = nullptr;
    if (getaddrinfo("example.com", "80", nullptr, &res) == 0) ok = true;
    std::cout << (ok ? "NETWORK_OK" : "NETWORK_BLOCKED") << std::endl;
}`;

const NET_JAVA = `import java.net.*;
public class Main {
    public static void main(String[] args) {
        boolean ok = false;
        try (Socket s = new Socket()) { s.connect(new InetSocketAddress("1.1.1.1", 80), 2000); ok = true; } catch (Exception e) { }
        try { InetAddress.getByName("example.com"); ok = true; } catch (Exception e) { }
        try { new URL("http://example.com/").openStream().close(); ok = true; } catch (Exception e) { }
        System.out.println(ok ? "NETWORK_OK" : "NETWORK_BLOCKED");
    }
}`;

const FS_CPP = `#include <bits/stdc++.h>
int main() {
    const char* paths[] = {"/etc/passwd", "/etc/shadow", "/root", "/app/src/server.ts", "/run/judge", "/proc/1/environ"};
    int leaks = 0;
    for (auto p : paths) { FILE* f = fopen(p, "r"); if (f) { leaks++; std::cerr << "open " << p << "\\n"; fclose(f); } }
    FILE* w = fopen("/usr/pwned", "w"); if (w) { leaks++; fclose(w); }
    std::cout << (leaks ? "FS_LEAK" : "FS_ISOLATED") << std::endl;
}`;

const CASES: Case[] = [
  // ---------------------------------------------------------------- C++
  { name: "cpp correct (int[], int) -> int[]", body: fn("cpp", CPP_TWO_SUM), expect: ["AC"] },
  { name: "cpp correct, C++20", body: fn("cpp", CPP_TWO_SUM, TWO_SUM, TWO_SUM_TESTS, { std: "c++20" }), expect: ["AC"] },
  {
    name: "cpp wrong answer",
    body: fn("cpp", "class Solution { public: vector<int> twoSum(vector<int>& n, int t) { return {0, 1}; } };"),
    expect: ["WA"],
    check: (r) => (r.firstFailure?.id === "2" && r.firstFailure.hidden && r.tests[1].expected === undefined ? null : "first failing hidden test not reported correctly"),
  },
  {
    name: "cpp TLE (infinite loop)",
    body: fn("cpp", "class Solution { public: vector<int> twoSum(vector<int>& n, int t) { volatile long x = 0; while (true) x++; } };", TWO_SUM, TWO_SUM_TESTS, { stopOnFirstFailure: true }),
    expect: ["TLE"],
  },
  {
    name: "cpp MLE (huge allocation)",
    body: fn("cpp", "class Solution { public: vector<int> twoSum(vector<int>& n, int t) { vector<long long> v(200000000, 1); return {(int)v[12345], (int)v.size()}; } };", TWO_SUM, TWO_SUM_TESTS, { stopOnFirstFailure: true }),
    expect: ["MLE"],
  },
  {
    name: "cpp RE (out-of-bounds .at())",
    body: fn("cpp", "class Solution { public: vector<int> twoSum(vector<int>& n, int t) { return {n.at(100), 0}; } };"),
    expect: ["RE"],
  },
  {
    name: "cpp RE (null pointer write)",
    body: fn("cpp", "class Solution { public: vector<int> twoSum(vector<int>& n, int t) { int* p = nullptr; *p = 1; return {*p}; } };"),
    expect: ["RE"],
  },
  {
    name: "cpp RE (integer division by zero, SIGFPE)",
    body: fn("cpp", "class Solution { public: vector<int> twoSum(vector<int>& n, int t) { volatile int z = 0; return {t / z}; } };"),
    expect: ["RE"],
    skip: ARCH === "aarch64" || ARCH === "arm64" ? "arm64 does not trap on integer division by zero (it returns 0); x86-64 (Lightsail) does" : undefined,
  },
  { name: "cpp CE (syntax error)", body: fn("cpp", "class Solution { public: vector<int> twoSum(vector<int>& n, int t) { return {0, 1} } };"), expect: ["CE"], check: (r) => (/solution\.cpp:1:/.test(r.compile.output) ? null : "compile output should point at solution.cpp:1") },
  { name: "cpp network access is blocked", body: stdio("cpp", NET_CPP, [{ input: "", expected: "NETWORK_BLOCKED" }]), expect: ["AC"] },
  { name: "cpp filesystem is isolated", body: stdio("cpp", FS_CPP, [{ input: "", expected: "FS_ISOLATED" }]), expect: ["AC"] },
  {
    name: "cpp OLE (unbounded output)",
    body: stdio("cpp", "#include <cstdio>\nint main(){ for(;;) std::puts(\"spam spam spam spam spam spam spam spam\"); }", [{ input: "", expected: "" }]),
    expect: ["OLE"],
  },
  {
    name: "cpp fork bomb is contained",
    body: stdio("cpp", "#include <unistd.h>\n#include <cstdio>\nint main(){ int n=0; for(int i=0;i<10000;i++){ if(fork()==0){ sleep(5); return 0;} else n++; } }", [{ input: "", expected: "" }]),
    expect: ["AC", "RE", "TLE", "WA"],
  },
  { name: "cpp stdio a+b", body: stdio("cpp", "#include <iostream>\nint main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b<<\"\\n\"; }", [{ input: "2 3\n", expected: "5" }, { input: "-1 1\n", expected: "0" }]), expect: ["AC"] },
  { name: "cpp int[] -> int", body: fn("cpp", "class Solution { public: int arraySum(vector<int>& a) { return accumulate(a.begin(), a.end(), 0); } };", SUM, [{ input: [[1, 2, 3]], expected: 6 }, { input: [[]], expected: 0 }]), expect: ["AC"] },
  { name: "cpp string -> bool", body: fn("cpp", 'class Solution { public: bool isPalindrome(string s) { return s == string(s.rbegin(), s.rend()); } };', PAL, [{ input: ["racecar"], expected: true }, { input: ["ab"], expected: false }, { input: ['a"\\b\\"a'], expected: true }]), expect: ["AC"] },
  { name: "cpp (int[][]) -> int", body: fn("cpp", "class Solution { public: int countOnes(vector<vector<int>>& g) { int c=0; for (auto& r : g) for (int x : r) c += x; return c; } };", GRID, [{ input: [[[1, 0], [1, 1]]], expected: 3 }, { input: [[]], expected: 0 }]), expect: ["AC"] },
  { name: "cpp ListNode", body: fn("cpp", "class Solution { public: ListNode* reverseList(ListNode* h) { ListNode* p = nullptr; while (h) { auto n = h->next; h->next = p; p = h; h = n; } return p; } };", REV, [{ input: [[1, 2, 3]], expected: [3, 2, 1] }, { input: [[]], expected: [] }]), expect: ["AC"] },
  { name: "cpp TreeNode", body: fn("cpp", "class Solution { public: TreeNode* invertTree(TreeNode* r) { if (r) { swap(r->left, r->right); invertTree(r->left); invertTree(r->right); } return r; } };", INV, [{ input: [[4, 2, 7, 1, 3, 6, 9]], expected: [4, 7, 2, 9, 6, 3, 1] }, { input: [[1, null, 2]], expected: [1, 2] }]), expect: ["AC"] },

  // ---------------------------------------------------------------- Java
  { name: "java correct (int[], int) -> int[]", body: fn("java", JAVA_TWO_SUM), expect: ["AC"] },
  { name: "java wrong answer", body: fn("java", "class Solution { public int[] twoSum(int[] n, int t) { return new int[]{1, 0}; } }"), expect: ["WA"] },
  {
    name: "java TLE (infinite loop)",
    body: fn("java", "class Solution { public int[] twoSum(int[] n, int t) { long x = 0; while (true) { x++; if (x == -1) break; } return null; } }", TWO_SUM, TWO_SUM_TESTS, { stopOnFirstFailure: true }),
    expect: ["TLE"],
  },
  {
    name: "java MLE (huge allocation)",
    body: fn("java", "class Solution { public int[] twoSum(int[] n, int t) { long[] big = new long[200_000_000]; return new int[]{(int) big[1], 0}; } }", TWO_SUM, TWO_SUM_TESTS, { stopOnFirstFailure: true }),
    expect: ["MLE"],
  },
  { name: "java RE (array index out of bounds)", body: fn("java", "class Solution { public int[] twoSum(int[] n, int t) { return new int[]{n[100], 0}; } }"), expect: ["RE"], check: (r) => (/ArrayIndexOutOfBounds/.test(r.tests[0].message ?? "") ? null : "message should name the exception") },
  { name: "java RE (division by zero)", body: fn("java", "class Solution { public int[] twoSum(int[] n, int t) { int z = n.length - n.length; return new int[]{t / z}; } }"), expect: ["RE"], check: (r) => (/ArithmeticException/.test(r.tests[0].message ?? "") ? null : "message should name ArithmeticException") },
  { name: "java CE (syntax error)", body: fn("java", "class Solution { public int[] twoSum(int[] n, int t) { return new int[]{0, 1} } }"), expect: ["CE"], check: (r) => (/Solution\.java:1: error/.test(r.compile.output) ? null : "compile output should point at Solution.java:1") },
  { name: "java network access is blocked", body: stdio("java", NET_JAVA, [{ input: "", expected: "NETWORK_BLOCKED" }]), expect: ["AC"] },
  { name: "java stdio, public class name detected", body: stdio("java", "import java.util.*;\npublic class Solver { public static void main(String[] a) { Scanner s = new Scanner(System.in); System.out.println(s.nextLong() + s.nextLong()); } }", [{ input: "40 2", expected: "42" }]), expect: ["AC"] },
  { name: "java int[] -> int", body: fn("java", "class Solution { public int arraySum(int[] a) { return Arrays.stream(a).sum(); } }", SUM, [{ input: [[1, 2, 3]], expected: 6 }]), expect: ["AC"] },
  { name: "java string -> bool", body: fn("java", "class Solution { public boolean isPalindrome(String s) { return new StringBuilder(s).reverse().toString().equals(s); } }", PAL, [{ input: ["level"], expected: true }, { input: ["java"], expected: false }]), expect: ["AC"] },
  { name: "java (int[][]) -> int", body: fn("java", "class Solution { public int countOnes(int[][] g) { int c = 0; for (int[] r : g) for (int x : r) c += x; return c; } }", GRID, [{ input: [[[1, 1], [0, 1]]], expected: 3 }]), expect: ["AC"] },
  { name: "java ListNode", body: fn("java", "class Solution { public ListNode reverseList(ListNode h) { ListNode p = null; while (h != null) { ListNode n = h.next; h.next = p; p = h; h = n; } return p; } }", REV, [{ input: [[1, 2, 3]], expected: [3, 2, 1] }]), expect: ["AC"] },
  { name: "java TreeNode", body: fn("java", "class Solution { public TreeNode invertTree(TreeNode r) { if (r != null) { TreeNode t = r.left; r.left = invertTree(r.right); r.right = invertTree(t); } return r; } }", INV, [{ input: [[2, 1, 3]], expected: [2, 3, 1] }]), expect: ["AC"] },

  // ---------------------------------------------------- stored test set (R2 stand-in)
  {
    name: "cpp stored test set (problem id + version)",
    body: { language: "cpp", code: CPP_TWO_SUM, testSet: { problemId: "two-sum", version: "v1" }, stopOnFirstFailure: false },
    expect: ["AC"],
    check: (r) => (r.summary.total === 3 && r.tests[1].hidden && !r.tests[0].hidden ? null : "test set should merge visible + hidden files"),
  },
  { name: "java stored test set, unordered checker", body: { language: "java", code: JAVA_TWO_SUM, testSet: { problemId: "two-sum", version: "v1" } }, expect: ["AC"] },
  { name: "unknown test set is a 404", body: { language: "cpp", code: CPP_TWO_SUM, testSet: { problemId: "nope", version: "v1" } }, expect: ["HTTP404"] },

  // ---------------------------------------------------- Python / JS (re-judge path)
  { name: "python correct", body: fn("python", "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        seen = {}\n        for i, x in enumerate(nums):\n            if target - x in seen:\n                return [seen[target - x], i]\n            seen[x] = i\n"), expect: ["AC"] },
  { name: "python CE (syntax error)", body: fn("python", "def two_sum(nums, target)\n    return [0, 1]\n"), expect: ["CE"] },
  { name: "python TLE", body: fn("python", "def two_sum(nums, target):\n    while True:\n        pass\n", TWO_SUM, TWO_SUM_TESTS, { stopOnFirstFailure: true }), expect: ["TLE"] },
  { name: "javascript correct", body: fn("javascript", "function twoSum(nums, target) { const m = new Map(); for (let i = 0; i < nums.length; i++) { if (m.has(target - nums[i])) return [m.get(target - nums[i]), i]; m.set(nums[i], i); } }"), expect: ["AC"] },
  { name: "javascript RE", body: fn("javascript", "function twoSum(nums, target) { return undefinedThing.x; }"), expect: ["RE"] },
];

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main(): Promise<void> {
  if (!env.JUDGE_HMAC_SECRET) throw new Error("set JUDGE_HMAC_SECRET");
  let failed = 0;
  let skipped = 0;
  const only = process.env.ONLY;
  console.log(`judge: ${env.JUDGE_URL}  arch: ${ARCH}\n`);
  for (const c of CASES) {
    if (only && !c.name.includes(only)) continue;
    if (c.skip) {
      skipped++;
      console.log(`SKIP  ${pad(c.name, 46)} ${c.skip}`);
      continue;
    }
    const t0 = Date.now();
    const res = await callJudge<Record<string, any>>(env, c.body);
    const ms = Date.now() - t0;
    let problem: string | null = null;
    const httpExpect = c.expect.find((e) => e.startsWith("HTTP"));
    if (httpExpect) {
      if (`HTTP${res.status}` !== httpExpect) problem = `expected ${httpExpect}, got HTTP ${res.status}: ${JSON.stringify(res.body)}`;
    } else if (res.status !== 200) problem = `HTTP ${res.status}: ${JSON.stringify(res.body)}`;
    else if (!c.expect.includes(res.body.verdict)) problem = `expected ${c.expect.join("/")}, got ${res.body.verdict}`;
    else if (c.check) problem = c.check(res.body);
    const b = res.body;
    const detail =
      res.status === 200
        ? `${b.verdict.padEnd(4)} ${String(b.summary.passed).padStart(2)}/${b.summary.total} tests  compile ${b.compile.timeMs} ms  run max ${b.summary.maxTimeMs} ms ${(b.summary.maxMemoryKb / 1024).toFixed(1)} MB  (${ms} ms round trip)`
        : `HTTP ${res.status} ${b.error ?? ""}`;
    if (problem) {
      failed++;
      console.log(`FAIL  ${pad(c.name, 46)} ${problem}`);
      console.log(JSON.stringify(res.body, null, 2).slice(0, 3000));
    } else {
      console.log(`ok    ${pad(c.name, 46)} ${detail}`);
    }
  }

  // Health endpoint (signed GET).
  const h = await callJudge<Record<string, any>>(env, null, { method: "GET", path: "/health" });
  if (h.status !== 200 || typeof h.body.queue?.depth !== "number" || !h.body.latency?.total) {
    failed++;
    console.log(`FAIL  /health ${h.status} ${JSON.stringify(h.body)}`);
  } else {
    console.log(`\nok    /health  queue depth ${h.body.queue.depth}, p50 ${h.body.latency.total.p50Ms} ms, p95 ${h.body.latency.total.p95Ms} ms, verdicts ${JSON.stringify(h.body.verdicts)}`);
  }

  // Unsigned request must be refused.
  const raw = await fetch(`${env.JUDGE_URL}/judge`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  if (raw.status !== 401) {
    failed++;
    console.log(`FAIL  unsigned request got HTTP ${raw.status}`);
  } else {
    console.log("ok    unsigned request refused (401)");
  }

  // Burst: 8 concurrent correct submissions are all judged (queue + pool).
  const t0 = Date.now();
  const burst = await Promise.all(Array.from({ length: 8 }, (_, i) => callJudge<Record<string, any>>(env, fn(i % 2 ? "java" : "cpp", i % 2 ? JAVA_TWO_SUM : CPP_TWO_SUM))));
  const bad = burst.filter((r) => r.status !== 200 || r.body.verdict !== "AC");
  if (bad.length) {
    failed++;
    console.log(`FAIL  burst: ${bad.length}/8 not AC: ${JSON.stringify(bad.map((r) => [r.status, r.body.verdict ?? r.body]))}`);
  } else {
    console.log(`ok    burst of 8 concurrent submissions all AC in ${Date.now() - t0} ms`);
  }

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"}: ${failed} failed, ${skipped} skipped`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
