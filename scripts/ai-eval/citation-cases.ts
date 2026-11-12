/**
 * Citation-check fixtures (lib/ai/chat/citations.ts): answers as the course chat and the DSA chat write them, with the
 * evidence each ref carried (the search line, the snippet or passage the model was shown), and the verdict expected for
 * every citation. Most carry deliberately bad citations: a sentence glued to the wrong source (fixable: another retrieved
 * source supports it; or not), a group with one good and one bad ref, a ref with no evidence (unverifiable, kept).
 * Run by scripts/ai-eval/citations.ts (no model calls; part of the nightly) and asserted by scripts/tests/ai-quality.test.mjs.
 */

export type CitationCase = {
  id: string;
  feature: "course-chat" | "dsa-chat";
  evidence: Record<string, string>;
  answer: string;
  /** in the order the citations appear: "ok" | "dropped" | "unverifiable" | "fixed:<ref>" */
  expect: string[];
};

const S = {
  cacheAside:
    "s1 | lesson | Caching patterns | W04 · Caching | Cache-aside (lazy loading): the app reads the cache first; on a miss it reads the database and fills the cache. On a write it updates the database, then invalidates (deletes) the cached key so the next read reloads it. Write-through writes the cache and the database together on every write.",
  rateLimit:
    "s2 | lesson | Rate limiting | W05 · Protecting services | Token bucket: a bucket holds up to b tokens and refills at r tokens per second; each request takes one token, so bursts up to b pass and the long-run rate is r. Sliding window counters smooth the edges of fixed windows.",
  hashing:
    "s3 | lesson | Consistent hashing | W06 · Partitioning | Keys and servers are placed on a hash ring; a key belongs to the next server clockwise. Adding or removing a server moves only the keys of one arc. Virtual nodes give each server many points on the ring so the load evens out.",
  bloom:
    "s4 | concept | Bloom filter | Concepts | A bit array with k hash functions answers 'definitely not present' or 'maybe present': no false negatives, a tunable false positive rate, and no deletes in the basic form.",
  kafka:
    "s5 | section | Partitions and consumer groups | W07 · Queues and streams | A Kafka topic is split into partitions; each partition is an ordered log. Within a consumer group, each partition is read by exactly one consumer, so ordering holds per partition and you scale reads by adding partitions.",
  stampede:
    "s6 | section | Cache stampede | W04 · Caching | When a hot key expires, many requests miss at once and all hit the database. Fixes: request coalescing (one loader per key), jittered TTLs, and refreshing early before expiry.",
};
const D = {
  twoPointers:
    "[s1] lesson · Two pointers\nOn a sorted array, keep one pointer at each end. If the pair sum is too small, move the left pointer right; too large, move the right pointer left. Each step discards one element, so the scan is O(n) time and O(1) extra space.",
  window:
    "[s2] lesson · Sliding window\nGrow the window by moving its right edge; when the window breaks the rule (too many distinct characters, sum too large), shrink it from the left. Every element enters and leaves once: O(n). Track counts in a hash map.",
  heap:
    "[s3] lesson · Heaps and the k-th largest\nKeep a min-heap of size k: push each number, pop when the heap grows past k. The root is the k-th largest. O(n log k) time and O(k) space; better than sorting when k is small.",
  problem:
    "[s4] problem statement · Valid parentheses\nGiven a string of brackets, return true if every opening bracket is closed by the same type in the right order.",
};

export const CITATION_CASES: CitationCase[] = [
  {
    id: "good-paraphrase",
    feature: "course-chat",
    evidence: { s1: S.cacheAside, s6: S.stampede },
    answer: "With cache-aside, a write goes to the database first and then the cached key is deleted, so the next read loads the fresh value [[s1]].",
    expect: ["ok"],
  },
  {
    id: "after-full-stop",
    feature: "course-chat",
    evidence: { s1: S.cacheAside, s6: S.stampede },
    answer: "When a popular key expires, a crowd of requests misses together and every one of them hits the database. [[s6]] Coalescing those into one loader per key fixes it.",
    expect: ["ok"],
  },
  {
    id: "wrong-source-fixable",
    feature: "course-chat",
    evidence: { s2: S.rateLimit, s3: S.hashing },
    answer: "Virtual nodes give each server many points on the hash ring, so when a server leaves only one arc of keys moves [[s2]].",
    expect: ["fixed:s3"],
  },
  {
    id: "wrong-source-unfixable",
    feature: "course-chat",
    evidence: { s1: S.cacheAside, s4: S.bloom },
    answer: "Within a consumer group each Kafka partition is read by exactly one consumer, which keeps ordering per partition [[s4]].",
    expect: ["dropped"],
  },
  {
    id: "group-one-bad",
    feature: "course-chat",
    evidence: { s1: S.cacheAside, s2: S.rateLimit, s5: S.kafka },
    answer: "A token bucket lets bursts of up to b requests through while holding the long-run rate at r tokens per second [[s2, s1]].",
    expect: ["ok", "dropped"],
  },
  {
    id: "two-sentences-mixed",
    feature: "course-chat",
    evidence: { s3: S.hashing, s4: S.bloom, s5: S.kafka },
    answer:
      "A Bloom filter never gives a false negative: if it says a key is absent, it is absent [[s4]]. Adding partitions to a topic is how you scale reads, since each partition goes to one consumer in the group [[s3]].",
    expect: ["ok", "fixed:s5"],
  },
  {
    id: "list-items",
    feature: "course-chat",
    evidence: { s1: S.cacheAside, s6: S.stampede, s2: S.rateLimit },
    answer: "Three fixes for a stampede:\n- Request coalescing, so one loader per key refills it [[s6]]\n- Jittered TTLs so hot keys don't expire together [[s6]]\n- A token bucket in front of the database [[s1]]",
    expect: ["ok", "ok", "fixed:s2"],
  },
  {
    id: "unverifiable-earlier-ref",
    feature: "course-chat",
    evidence: { s1: S.cacheAside },
    answer: "As we saw earlier, consistent hashing keeps most keys in place when a node joins [[s9]].",
    expect: ["unverifiable"],
  },
  {
    id: "invented-number",
    feature: "course-chat",
    evidence: { s4: S.bloom, s1: S.cacheAside },
    answer: "Cassandra replicates every row to three datacenters with quorum writes of two [[s1]].",
    expect: ["dropped"],
  },
  {
    id: "dsa-good",
    feature: "dsa-chat",
    evidence: { s1: D.twoPointers, s2: D.window },
    answer: "On a sorted array, start one pointer at each end and move the left one right when the sum is too small: the scan is O(n) with O(1) extra space [[s1]].",
    expect: ["ok"],
  },
  {
    id: "dsa-swapped",
    feature: "dsa-chat",
    evidence: { s1: D.twoPointers, s2: D.window, s3: D.heap },
    answer: "Keep a min-heap of size k and pop whenever it grows past k; its root is the k-th largest, in O(n log k) time [[s2]].",
    expect: ["fixed:s3"],
  },
  {
    id: "dsa-problem-statement-misused",
    feature: "dsa-chat",
    evidence: { s1: D.twoPointers, s4: D.problem },
    answer: "Shrink the window from the left whenever it holds too many distinct characters, tracking counts in a hash map [[s4]].",
    expect: ["dropped"],
  },
  {
    id: "dsa-both-good",
    feature: "dsa-chat",
    evidence: { s2: D.window, s3: D.heap },
    answer: "Each element enters and leaves the window once, so the sliding window is linear [[s2]]. For the k-th largest a heap of size k beats sorting when k is small [[s3]].",
    expect: ["ok", "ok"],
  },
];
