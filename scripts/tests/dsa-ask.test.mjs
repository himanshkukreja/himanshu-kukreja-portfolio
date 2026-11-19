/**
 * Practice "Ask or search": which text is a question (answer card) and which a plain search (instant results, no AI call),
 * the answer parser's link checks, and the card's states.
 *   node --test scripts/tests/dsa-ask.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const { isQuestion, parseAsk, cardState, exampleWindow, EXAMPLES } = await import("../../src/lib/dsa/search/ask.ts");

test("questions and concept asks are detected", () => {
  for (const q of [
    "What's the difference between BFS and DFS?",
    "When should I use a heap instead of sorting?",
    "Why does binary search need a sorted array?",
    "how does dijkstra work",
    "explain union find",
    "bfs vs dfs when to use which",
    "is two pointers the same as sliding window?",
  ]) assert.equal(isQuestion(q), true, q);
});

test("plain searches and requests for problems are not questions", () => {
  for (const q of ["binary search", "two sum", "lc 1", "dp", "medium sliding window strings", "Two-pointer problems on strings", "Easy problems to start with heaps", "give me hard dp problems", "show me graph problems asked at fintech", "I want to learn sliding window, give me medium string problems", "", "   "]) assert.equal(isQuestion(q), false, q);
});

test("every rotating example is exactly one kind and the window wraps", () => {
  assert.ok(EXAMPLES.some(isQuestion) && EXAMPLES.some((e) => !isQuestion(e)));
  assert.equal(exampleWindow(0).length, 3);
  assert.deepEqual(exampleWindow(EXAMPLES.length - 1)[1], EXAMPLES[0]);
});

const P = [
  { tag: "s1", link: { kind: "lesson", title: "BFS", href: "/dsa/concepts/bfs#when" } },
  { tag: "s2", link: { kind: "lesson", title: "BFS", href: "/dsa/concepts/bfs" } },
  { tag: "s3", link: { kind: "problem", title: "Rack blocks", href: "/dsa/problems/islands" } },
];

test("parseAsk keeps only shown passages, one link per page, at most three", () => {
  const a = parseAsk(JSON.stringify({ answer: "BFS goes level by level [s1]. DFS goes deep.", sources: ["s1", "s2", "s9", "s3"] }), P);
  assert.equal(a.text, "BFS goes level by level. DFS goes deep.");
  assert.deepEqual(a.links.map((l) => l.href), ["/dsa/concepts/bfs#when", "/dsa/problems/islands"]);
});

test("parseAsk: falls back, and an empty or broken answer is empty", () => {
  const fb = [{ kind: "lesson", title: "Heaps", href: "/dsa/concepts/heap" }];
  assert.deepEqual(parseAsk('{"answer":"A heap keeps the best on top.","sources":["s7"]}', P, fb).links, fb);
  // the model named only a problem: the catalog's lesson goes first
  assert.deepEqual(parseAsk('{"answer":"A heap keeps the best on top.","sources":["s3"]}', P, fb).links.map((l) => l.kind), ["lesson", "problem"]);
  assert.deepEqual(parseAsk('{"answer":"","sources":[]}', P), { text: "", links: [] });
  assert.deepEqual(parseAsk("not json", P), { text: "", links: [] });
});

const base = { text: "What's the difference between BFS and DFS?", signedIn: true, authLoading: false, busy: false, hasAnswer: false, answerText: "", failed: false };
test("card states", () => {
  assert.equal(cardState({ ...base, text: "binary search" }), "none");
  assert.equal(cardState({ ...base, signedIn: false, text: "binary search" }), "none");
  assert.equal(cardState({ ...base, authLoading: true, signedIn: false }), "none");
  assert.equal(cardState({ ...base, signedIn: false }), "guest");
  assert.equal(cardState(base), "loading");
  assert.equal(cardState({ ...base, busy: true }), "loading");
  assert.equal(cardState({ ...base, hasAnswer: true, answerText: "BFS is wide." }), "answer");
  assert.equal(cardState({ ...base, hasAnswer: true, answerText: "" }), "empty");
  assert.equal(cardState({ ...base, failed: true }), "error");
  assert.equal(cardState({ ...base, failed: true, busy: true }), "loading");
});
