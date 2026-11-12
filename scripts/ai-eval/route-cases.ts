/**
 * Hard turns for the smart-routing comparison (lib/ai/chat/route-model.ts; scripts/ai-eval/route.ts): course-chat cases
 * the classifier sends to Sonnet 5.5 (multi-step design trade-offs, an explicit "go deeper", debugging failing code of
 * 25+ lines). Same shape as chat-cases.ts; run by scripts/ai-eval/chat.ts with EVAL_CASES=route (Haiku 5.5 vs routed,
 * judged blind A/B). The DSA hard turns are the existing dsa-chat / dsa-tutor cases the classifier marks hard.
 */
import type { ChatCase } from "./chat-cases";
import type { DsaChatCase } from "./dsa-chat-cases";
import type { DsaTutorCase } from "./dsa-tutor-cases";

const LRU_BUGGY = `\`\`\`python
class Node:
    def __init__(self, key, value):
        self.key = key
        self.value = value
        self.prev = None
        self.next = None


class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.map = {}
        self.head = Node(0, 0)
        self.tail = Node(0, 0)
        self.head.next = self.tail
        self.tail.prev = self.head

    def _remove(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _add_front(self, node):
        node.next = self.head.next
        node.prev = self.head
        self.head.next.prev = node
        self.head.next = node

    def get(self, key):
        if key not in self.map:
            return None
        node = self.map[key]
        return node.value

    def put(self, key, value):
        if key in self.map:
            self._remove(self.map[key])
        node = Node(key, value)
        self._add_front(node)
        self.map[key] = node
        if len(self.map) > self.capacity:
            lru = self.tail.prev
            self._remove(lru)
            del self.map[key]
\`\`\``;

export const ROUTE_CHAT_CASES: ChatCase[] = [
  {
    id: "route-cache-shard-tradeoff",
    title: "Hard: write path trade-off with sharding and consistency",
    ctx: { progress: "mid" },
    turns: [
      {
        user: "We serve user profiles: 50k writes per second and 2M reads per second. Should I use write-through or cache-aside with Redis, and how does that change if we shard Postgres by region? What are the trade-offs for consistency and latency, and what breaks on a region failover?",
        expect: [
          "Compares write-through and cache-aside concretely for this read-heavy load (write latency, stale reads, cache churn) and picks one with a reason",
          "Addresses sharding by region: where the cache sits, cross-region reads/writes, and what consistency a reader gets",
          "Names at least one failure mode on region failover (stale or lost cache entries, split writes, thundering herd on a cold cache) with a mitigation",
          "Cites the course's caching / partitioning material with refs",
        ],
        mustNot: ["Invent numbers or claims not supported by the course or the question", "Exceed ~350 words"],
      },
    ],
  },
  {
    id: "route-queue-choice",
    title: "Hard: picking a queue under ordering and delivery constraints",
    turns: [
      {
        user: "Order events at 20k per second, ordering must hold per customer, consumers sometimes crash mid-batch. Kafka vs RabbitMQ vs SQS FIFO: compare them for this, and walk me through how I'd get effectively-once processing end to end.",
        expect: [
          "Explains per-key ordering (partition by customer id / message group id) and what each option offers for it at 20k/s",
          "Explains that exactly-once delivery is not the goal: at-least-once plus idempotent consumers (dedupe by event id, transactional outbox or offsets committed after the write)",
          "Covers the crash mid-batch case: what is redelivered and why the consumer must be idempotent",
          "Cites course material on queues / idempotency with refs where the course covers it",
        ],
        mustNot: ["Claim any of the three gives exactly-once delivery with no consumer-side work"],
      },
    ],
  },
  {
    id: "route-rate-limit-global",
    title: "Hard: a global rate limit across regions",
    turns: [
      {
        user: "I need a global limit of 1000 requests per minute per API key across 3 regions using Redis. Token bucket vs sliding window log vs sliding window counter: compare accuracy and memory, and what breaks when the regions' Redis can't talk to each other?",
        expect: [
          "Compares the three algorithms on accuracy at window edges and memory per key, with a recommendation",
          "Explains the cross-region problem: a single global counter adds latency; per-region budgets or async sync trade accuracy",
          "Says what happens under a partition (each region enforces its share or fails open/closed) and the trade-off between them",
          "Cites the course's rate limiting lesson with refs",
        ],
      },
    ],
  },
  {
    id: "route-go-deeper",
    title: "Hard: an explicit go deeper after a short answer",
    turns: [
      { user: "What is consistent hashing, briefly?", expect: ["A short, correct explanation (hash ring, keys move only on one arc when a node joins or leaves)", "Cites the course"] },
      {
        user: "Go deeper on that.",
        expect: [
          "Goes beyond the first answer: virtual nodes and why they even out load, what happens to keys and replicas when a node fails, and a worked example with numbers",
          "Stays accurate and cites the course's material with refs",
        ],
        mustNot: ["Repeat the first answer in other words without new depth"],
      },
    ],
  },
  {
    id: "route-debug-lru",
    title: "Hard: debugging a 40-line LRU cache that fails",
    turns: [
      {
        user: `My LRU cache fails the eviction test with a KeyError and get() doesn't seem to refresh recency. What's wrong?\n${LRU_BUGGY}`,
        expect: [
          "Finds the eviction bug: it deletes self.map[key] (the new key) instead of self.map[lru.key], which raises KeyError or evicts the wrong entry",
          "Finds that get() never moves the node to the front, so recency isn't updated",
          "Explains each fix in a line or two (and may show the corrected lines), pointing to the course's LRU lab or caching lesson where relevant",
        ],
        mustNot: ["Miss either bug", "Rewrite the whole class from scratch when two small fixes suffice"],
      },
    ],
  },
  {
    id: "route-feed-storage",
    title: "Hard: storage choice for a feed, with failover",
    turns: [
      {
        user: "For a news feed with 5M daily users and 50k posts per second at peak, should I store timelines in Postgres with read replicas or in Cassandra? Compare fan-out on write vs fan-out on read here, the consistency each gives, and what happens when a replica lags.",
        expect: [
          "Compares fan-out on write and on read for this load, including the celebrity / hot user problem and a hybrid",
          "Compares Postgres + replicas and Cassandra for the timeline store (write throughput, partitioning, consistency) with a recommendation",
          "Explains replica lag's effect (stale timelines, read-your-writes) and a mitigation",
          "Cites the course with refs where it covers these",
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ DSA Mastery: dsa-chat and dsa-tutor hard turns */

/** busiest-launch-stretch, written the long way (helpers, validation, logging): two real bugs in 30+ lines */
const BUSIEST_LONG = `def window_sum(plays, start, k):
    # sum of k values from start
    total = 0
    for i in range(start, start + k):
        total += plays[i]
    return total


def validate(plays, k):
    if k <= 0:
        return False
    if k > len(plays):
        return False
    return True


def busiest_start(plays, k):
    if not validate(plays, k):
        return -1
    window = window_sum(plays, 0, k)
    best = window
    best_start = 0
    right = k
    while right < len(plays):
        leaving = plays[right - k]
        joining = plays[right]
        window = window + joining - leaving
        if window >= best:
            best = window
            best_start = right - k
        right += 1
    return best_start
`;

export const ROUTE_DSA_TUTOR_CASES: DsaTutorCase[] = [
  {
    id: "route-t-debug-long",
    area: "debug",
    title: "Hard: debugging a 30-line solution with two bugs",
    problem: "busiest-launch-stretch",
    lang: "python",
    turns: [
      {
        mode: "debug",
        code: BUSIEST_LONG,
        result: { mode: "run", verdict: "WA", passed: 1, total: 3, message: "", failing: { name: "example-1", hidden: false, input: '{"plays":[4,2,7,1,8,3],"k":3}', expected: "2", got: "1", message: "" } },
        expect: [
          "Finds that best_start = right - k is off by one: the window ending at right starts at right - k + 1 (traces example-1 to show 1 instead of 2)",
          "Also flags `if window >= best:` (line 28): ties must keep the earliest start, so it must be strictly greater",
          "Says what to change in words, at most a line or two of code per fix",
        ],
        mustNot: ["Rewrite the whole function", "Miss the off-by-one"],
      },
    ],
  },
];

export const ROUTE_DSA_CHAT_CASES: DsaChatCase[] = [
  {
    id: "route-c-heap-tradeoff",
    area: "method",
    title: "Hard: heap vs sorting vs a tree for the k-th largest in a stream",
    turns: [
      {
        user: "For the k-th largest in a stream of 10 million numbers, compare a min-heap of size k, sorting, and a balanced BST: time and memory for each, and which would you pick when k is 10 versus 1 million? Walk me through the trade-offs.",
        expect: [
          "Gives correct costs: heap O(n log k) time and O(k) memory; sorting O(n log n) and O(n) memory (and not streaming); a balanced BST O(n log k) with more overhead per node",
          "Picks the heap for small k and explains what changes at k = 1 million (memory of k items, log k cost; a selection algorithm or the complement heap when k is near n)",
          "Grounded in the course's heap material where it covers it",
        ],
      },
    ],
  },
  {
    id: "route-c-go-deeper",
    area: "followup",
    title: "Hard: go deeper on the sliding window",
    turns: [
      { user: "What is a sliding window, briefly?", expect: ["A short, correct explanation with the course's lesson cited"] },
      {
        user: "Go deeper on that.",
        expect: ["Adds depth: fixed vs variable windows, the invariant, why each index enters and leaves once (O(n)), and a worked trace with numbers", "Stays correct and cites the course"],
        mustNot: ["Repeat the first answer without new depth"],
      },
    ],
  },
];
