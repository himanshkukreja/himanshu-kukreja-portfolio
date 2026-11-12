/**
 * The AI quality layer's pure parts (12 Nov 2026): the citation check (lib/ai/chat/citations.ts) on fixtures with
 * deliberately bad citations, the routing classifier (lib/ai/chat/route-model.ts), the feedback body and reasons
 * (lib/ai/feedback-model.ts) and the prompt version hash (lib/ai/promptVersion.ts).
 *   node --test scripts/tests/ai-quality.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkCitations, claimBefore, contentWords, evidenceFrom } from "../../src/lib/ai/chat/citations.ts";
import { classifyTurn, codeLinesOf, DEBUG_MIN_LINES } from "../../src/lib/ai/chat/route-model.ts";
import { readFeedback, reasonOf, REASON_IDS } from "../../src/lib/ai/feedback-model.ts";
import { fnv, promptVersion } from "../../src/lib/ai/promptVersion.ts";
import { CITATION_CASES } from "../ai-eval/citation-cases.ts";

/* ------------------------------------------------------------------ citations */

for (const c of CITATION_CASES) {
  test(`citations: ${c.id}`, () => {
    const r = checkCitations(c.answer, c.evidence);
    const got = r.details.map((d) => (d.verdict === "fixed" ? `fixed:${d.to}` : d.verdict));
    assert.deepEqual(got, c.expect);
    // a dropped ref never survives in the text (unless another citation keeps it)
    const kept = new Set(r.details.flatMap((d) => (d.verdict === "fixed" ? [d.to] : d.verdict === "dropped" ? [] : [d.ref])));
    const inText = new Set([...r.text.matchAll(/\[\[([^\]]*)\]\]/g)].flatMap((m) => m[1].split(",").map((x) => x.trim())));
    for (const d of r.details) if (d.verdict === "dropped" && !kept.has(d.ref)) assert.ok(!inText.has(d.ref), `${d.ref} dropped`);
    assert.deepEqual([...inText].sort(), [...kept].sort());
  });
}

test("citations: the text keeps good refs, swaps fixed ones and cleans an emptied group", () => {
  const ev = {
    s1: "Consistent hashing places keys and servers on a hash ring; adding a server moves only one arc of keys; virtual nodes give each server many points so load evens out across the cluster",
    s2: "Token bucket rate limiting: a bucket holds up to b tokens and refills r tokens per second; each request spends one token, bursts pass up to the bucket size",
  };
  const r = checkCitations("Virtual nodes spread keys around the hash ring evenly [[s2]]. Tokens refill each second in a token bucket [[s2]].", ev);
  assert.equal(r.text, "Virtual nodes spread keys around the hash ring evenly [[s1]]. Tokens refill each second in a token bucket [[s2]].");
  const d = checkCitations("Kafka partitions keep order per partition [[s2]].", ev);
  assert.equal(d.text, "Kafka partitions keep order per partition.");
  assert.deepEqual(d.stats, { total: 1, ok: 0, fixed: 0, dropped: 1, unverifiable: 0 });
});

test("citations: refs outside the allowed set are dropped; no evidence is unverifiable (kept)", () => {
  const r = checkCitations("A bloom filter has no false negatives [[s1, s7]].", { s1: "Bloom filter: a bit array with k hash functions; no false negatives, tunable false positives, no deletes in the basic form" }, (ref) => ref === "s1");
  assert.equal(r.text, "A bloom filter has no false negatives [[s1]].");
  const u = checkCitations("Something from earlier [[s3]].", {});
  assert.equal(u.stats.unverifiable, 1);
  assert.equal(u.text, "Something from earlier [[s3]].");
});

test("citations: the claim is the sentence before the citation, widened when short", () => {
  const t = "Caches go stale. Cache-aside deletes the key on write so the next read reloads it. [[s1]]";
  assert.match(claimBefore(t, t.indexOf("[[s1]]")), /^Cache-aside deletes the key/);
  const short = "Writes hit the database first and then invalidate the cache key. It works. [[s1]]";
  assert.match(claimBefore(short, short.indexOf("[[")), /invalidate the cache key\. It works\.$/);
  assert.deepEqual(contentWords("Caching caches cached"), ["cach", "cach", "cach"]);
});

test("citations: evidence from tool results, course text and DSA passages", () => {
  const m = evidenceFrom(
    'Results:\ns3 | lesson | Caching | W04 | cache-aside and write-through\ns4 | section | Stampede | W04 | coalescing\n\n<course_text ref="s3">\nThe app reads the cache first.\n</course_text>\n[s5] lesson · Two pointers\nmove the left pointer right\n',
  );
  assert.match(m.get("s3"), /write-through/);
  assert.match(m.get("s3"), /reads the cache first/);
  assert.match(m.get("s4"), /coalescing/);
  assert.match(m.get("s5"), /left pointer/);
});

test("citations: a pointer citation (the sentence's object) and thin evidence are kept, never dropped", () => {
  const ev = { s2: "The week at a glance: Monday caching patterns, Tuesday invalidation, Wednesday CDNs, Thursday the stampede lab, Friday the trial and a mock interview", s3: "Design a news feed" };
  const r = checkCitations("That is the stampede card you flagged, and the course covers it in [[s2]] on Thursday. For the full walkthrough, see [[s3]].", ev);
  assert.equal(r.stats.dropped, 0);
  assert.match(r.text, /covers it in \[\[s2\]\] on Thursday/);
  assert.match(r.text, /see \[\[s3\]\]\.$/);
});

test("citations: fixtures cover every outcome", () => {
  const all = CITATION_CASES.flatMap((c) => c.expect.map((e) => e.split(":")[0]));
  for (const k of ["ok", "fixed", "dropped", "unverifiable"]) assert.ok(all.includes(k), k);
});

/* ------------------------------------------------------------------ routing */

const code = (n, bug = "") => Array.from({ length: n }, (_, i) => (i === 3 ? `    total += nums[i]  ${bug}` : `    x${i} = foo(${i});`)).join("\n");

test("routing: easy turns stay on Haiku", () => {
  for (const text of ["What is cache-aside?", "Cache-aside vs write-through?", "Explain consistent hashing simply.", "Quiz me on rate limiting", "Which DSA problems have I solved?", "hi"]) {
    const d = classifyTurn({ feature: "course-chat", text });
    assert.equal(d.hard, false, text);
  }
});

test("routing: multi-step design trade-offs are hard", () => {
  const t =
    "We have 50k writes per second and 2M reads per second on user profiles. Should I use write-through or cache-aside with Redis, and how does that change if we shard Postgres by region? What are the trade-offs for consistency and latency?";
  assert.deepEqual(classifyTurn({ feature: "course-chat", text: t }).reason, "tradeoff");
  const dsa = "For the k-th largest in a stream, heap vs sorted array vs a balanced tree: compare time and memory, and which would you pick when k is 10 versus 1 million? Walk me through the trade-offs.";
  assert.equal(classifyTurn({ feature: "dsa-chat", text: dsa }).reason, "tradeoff");
});

test("routing: go deeper, a thumbed-down previous answer", () => {
  assert.equal(classifyTurn({ feature: "course-chat", text: "Go deeper on that." }).reason, "deeper");
  assert.equal(classifyTurn({ feature: "dsa-chat", text: "Can you explain it in more depth?" }).reason, "deeper");
  assert.equal(classifyTurn({ feature: "course-chat", text: "ok", prevDown: true }).reason, "down");
});

test("routing: debugging failing code over the line threshold", () => {
  const long = code(DEBUG_MIN_LINES + 5);
  assert.equal(classifyTurn({ feature: "dsa-tutor", text: "Why does it fail?", code: long, mode: "debug", verdict: "WA" }).reason, "debug");
  assert.equal(classifyTurn({ feature: "dsa-tutor", text: "Why does it fail?", code: code(10), mode: "debug", verdict: "WA" }).hard, false);
  // accepted code, a review: not a debugging turn
  assert.equal(classifyTurn({ feature: "dsa-tutor", text: "Review my solution", code: long, mode: "review", verdict: "AC" }).hard, false);
  const fenced = `My code throws an IndexError:\n\`\`\`python\n${code(DEBUG_MIN_LINES)}\n\`\`\``;
  assert.equal(codeLinesOf(fenced), DEBUG_MIN_LINES);
  assert.equal(classifyTurn({ feature: "course-chat", text: fenced }).reason, "debug");
});

test("routing: never a mock turn or a quick-check answer", () => {
  assert.equal(classifyTurn({ feature: "course-chat", text: "Go deeper", mock: true }).hard, false);
  assert.equal(classifyTurn({ feature: "course-chat", text: "Go deeper", grading: true, prevDown: true }).hard, false);
});

/* ------------------------------------------------------------------ feedback */

test("feedback: the body, the old chat shape, no learner text", () => {
  assert.deepEqual(readFeedback({ callId: 12, rating: -1, reason: "too_long", note: "secret words" }), { callId: 12, rating: -1, reason: "too_long" });
  assert.deepEqual(readFeedback({ callId: 12, rating: 1, reason: "wrong" }), { callId: 12, rating: 1, reason: null });
  // the old flag button: "wrong" alone is a down with the reason
  assert.deepEqual(readFeedback({ callId: 3, rating: 0, wrong: true, note: "x" }), { callId: 3, rating: -1, reason: "wrong" });
  assert.equal(readFeedback({ callId: "abc", rating: 1 }), "Unknown answer");
  assert.equal(readFeedback({ callId: 5, rating: -1, reason: "rude" }).reason, null);
  assert.deepEqual(REASON_IDS, ["wrong", "not_grounded", "too_long", "gave_away", "didnt_know_me"]);
});

test("feedback: the reason from the new column or the interim note code, never a learner note", () => {
  assert.equal(reasonOf({ reason: "gave_away" }), "gave_away");
  assert.equal(reasonOf({ note: "reason:didnt_know_me" }), "didnt_know_me");
  assert.equal(reasonOf({ note: "the answer said 3 replicas, the lesson says 5" }), null);
  assert.equal(reasonOf({ note: null, wrong: true }), "wrong");
});

/* ------------------------------------------------------------------ prompt version */

test("prompt version: stable, per feature and model", () => {
  assert.equal(fnv("abc"), fnv("abc"));
  assert.match(promptVersion("course-chat", "claude-haiku-5-5"), /^[0-9a-f]{8}$/);
  assert.notEqual(promptVersion("course-chat", "claude-haiku-5-5"), promptVersion("course-chat", "claude-sonnet-5-5"));
  assert.notEqual(promptVersion("lesson-qa", "claude-haiku-5-5"), promptVersion("course-chat", "claude-haiku-5-5"));
});
