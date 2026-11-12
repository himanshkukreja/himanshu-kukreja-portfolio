/**
 * Learner-brief eval cases (scripts/ai-eval/brief.ts; AI audit 12 Nov 2026, O5, O9, O10, O15): every feature that gets
 * the learner brief, with a learner's memory notes and outcome log as fixtures (no real account is read), plus a
 * memory-off regression case per feature (no brief: the route's request is byte-identical to before the brief existed).
 *
 * Each case has rule checks (`must` / `mustNot` on the answer, `compare` on the route's compared-with-last-time lines)
 * and judged expectations (`expect` / `avoid`, for the Sonnet judge; never Opus).
 */
import type { BriefNotes } from "@/lib/learner/feature-brief-model";
import type { OutcomeEvent } from "@/lib/learner/events-model";

const DAY = 86_400_000;
export const NOW = Date.now();
const ev = (kind: OutcomeEvent["kind"], ref: string, outcome: string, detail: OutcomeEvent["detail"], daysAgo: number): OutcomeEvent => ({ course: "sdm", kind, ref, outcome, detail, at: NOW - daysAgo * DAY });

/** a beginner who likes short answers and analogies, missed virtual nodes twice, and did badly on a mock's estimates */
export const BEGINNER: BriefNotes = {
  goals: ["Billbolt-style fintech SDE-1 interviews in January"],
  level: "Final-year student, new to system design; knows basic Python",
  prefs: ["short answers", "everyday analogies first"],
  struggles: ["consistent hashing virtual nodes", "back-of-the-envelope estimates (peak vs average)"],
};
export const EXPERT: BriefNotes = { goals: ["Staff interviews at a payments company"], level: "9 years backend, senior engineer, ran sharded Postgres in production", prefs: ["terse, no basics"], struggles: [] };

export const MOCK = "mock-01-billbolt-autopay";
export const LLD = "lld-01-parking-lot";
export const BEGINNER_EVENTS: OutcomeEvent[] = [
  ev("explain_back", "consistent-hashing", "partial", { miss: ["4"] }, 1),
  ev("explain_back", "consistent-hashing", "misconception", { miss: ["3", "4"] }, 5),
  ev("mock_overall", MOCK, "junior", { run: 1, target: "sde", weak: "p2", phases: { p1: "junior", p2: "below-junior", p3: "junior", p4: "junior", p5: "junior", p6: "junior" } }, 3),
  ev("mock_phase", `${MOCK}/p1`, "junior", { run: 1, miss: ["p1.s3", "p1.s4"], met: ["p1.s1"] }, 3),
  ev("mock_phase", `${MOCK}/p2`, "below-junior", { run: 1, miss: ["p2.s2", "p2.s3"], met: [] }, 3),
  ev("mock_phase", `${MOCK}/p4`, "junior", { run: 1, miss: ["p4.s2", "p4.s6"], met: ["p4.s1"] }, 3),
  ev("lld_mock", LLD, "junior", { run: 2, target: "sde", weak: "p3", phases: { p1: "sde", p2: "junior", p3: "below-junior", p4: "junior" }, miss: ["p3.s2", "p3.s3"], cl: 3, of: 9 }, 4),
  ev("lab_hint", "consistent-hashing-ring", "hint-1", { level: 1, fails: 2 }, 0.05),
  ev("lab_hint", "consistent-hashing-ring", "hint-2", { level: 2, fails: 3 }, 0.03),
  ev("lab_review", "token-bucket", "issues", { c: 3, x: 4, e: 2, r: 3, n: 3 }, 6),
];

export type BriefFeature = "lesson-qa" | "snip-explain" | "lab-hint" | "lab-review" | "explain-back" | "mock-interviewer" | "mock-scorecard" | "lld-mock" | "lld-mock-scorecard" | "design-review" | "canvas-review";
export type BriefCase = {
  id: string;
  feature: BriefFeature;
  title: string;
  /** null notes: memory off (no brief) */
  notes: BriefNotes | null;
  events: OutcomeEvent[];
  input: Record<string, unknown>;
  must?: RegExp[];
  mustNot?: RegExp[];
  /** on the compare lines the route returns (explain-back, scorecards, lab review) */
  compare?: RegExp[];
  expect: string[];
  avoid?: string[];
};

const RING_BUG = `import bisect\nclass ConsistentHashRing:\n    def __init__(self, nodes=None, virtual_nodes=150):\n        self.vn = virtual_nodes\n        self.ring = []\n        self.owner = {}\n        for n in nodes or []:\n            self.add_node(n)\n    def add_node(self, node):\n        for i in range(self.vn):\n            h = ring_hash(f"{node}:{i}")\n            bisect.insort(self.ring, h)\n            self.owner[h] = node\n    def remove_node(self, node):\n        for i in range(self.vn):\n            h = ring_hash(f"{node}:{i}")\n            self.ring.remove(h)\n            del self.owner[h]\n    def get_node(self, key):\n        i = bisect.bisect_left(self.ring, ring_hash(key))\n        return self.owner[self.ring[i]]\n    def nodes(self):\n        return set(self.owner.values())\n`;
const RING_FAILS = [
  { group: "visible", name: "test_wraps_past_the_end", message: "IndexError: list index out of range", line: 20 },
  { group: "visible", name: "test_empty_ring_raises", message: "Expected LookupError, got IndexError", line: 20 },
];
const BUCKET = `import time\nclass TokenBucket:\n    def __init__(self, capacity, refill_per_sec, clock=time.monotonic):\n        if capacity <= 0 or refill_per_sec <= 0:\n            raise ValueError("capacity and rate must be positive")\n        self.capacity = capacity\n        self.rate = refill_per_sec\n        self.clock = clock\n        self.tokens = float(capacity)\n        self.last = clock()\n    def _refill(self):\n        now = self.clock()\n        elapsed = max(0.0, now - self.last)\n        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)\n        self.last = now\n    def allow(self, cost=1):\n        if cost <= 0:\n            raise ValueError("cost must be positive")\n        self._refill()\n        if self.tokens >= cost:\n            self.tokens -= cost\n            return True\n        return False\n`;
const WEAK_NOTES = { p1: "Users pay bills and set AutoPay. How many users?", p2: "10 million payments a day is about 115 per second, fine for one database.", p3: "POST /pay; tables users, billers, payments(id, user, amount, status).", p4: "API calls payment service, which calls PayGate then BillHub and saves to Postgres. Retry if BillHub fails.", p5: "A cron job each morning pays due mandates one by one.", p6: "Database could be a bottleneck; add a cache." };
const STRONG_NOTES = {
  ...WEAK_NOTES,
  p1: "Who moves the money and who confirms the bill? Debited is not confirmed by the biller: a gap, so payments have states. How are AutoPay due dates spread? Likely a 1st-5th spike. BillHub's timeout rate, rate limit, callbacks? Scale: users, payments a day, peak hour?",
  p2: "10M a day is ~115/s average, but the evening peak is maybe 5x and the AutoPay day on the 1st much more: design for ~3,000/s on the 1st. BillHub allows 500/s so a 6M AutoPay backlog drains in ~3.3 hours: BillHub is the bottleneck. One Postgres primary handles 3,000 writes/s; no sharding day one, shard key user_id later.",
  p4: "The pay API enqueues and returns; workers call BillHub with an explicit timeout and bounded retries with backoff and jitter. Callbacks from PayGate and BillHub are signed, deduplicated webhooks. A timeout is unknown: poll status and reconcile, never a blind retry or refund. Circuit breaker per biller before debiting.",
};
const LLD_WEAK = { p1: "Parking lot with floors and spots. Cars come and go.", p2: "Classes: ParkingLot, Floor, Spot, Car.", p3: "No patterns needed, it's simple.", p4: "class ParkingLot:\n    def park(self, car):\n        for s in self.spots:\n            if s.free:\n                s.free = False\n                return s" };
const LLD_BETTER = {
  p1: "Questions: how many floors and gates? Vehicle sizes (bike, car, truck) and spot sizes? Do we price by hour, and is payment in scope? Can two gates park at once? Scope: park, unpark with a ticket, fees; out of scope: reservations.",
  p2: "ParkingLot has Floors; Floor has Spots; Spot(size, vehicle?); Vehicle(size); Ticket(spot, vehicle, entered_at); PricingPolicy computes fees; SpotFinder picks a spot.",
  p3: "Strategy for spot finding (nearest first vs fill floors in order) and for pricing (hourly vs flat), so each can change without touching ParkingLot. A lock around find+assign so two gates never get one spot.",
  p4: "class ParkingLot:\n    def __init__(self, floors, finder, pricing):\n        self.floors, self.finder, self.pricing = floors, finder, pricing\n        self.lock = threading.Lock()\n    def park(self, vehicle):\n        with self.lock:\n            spot = self.finder.find(self.floors, vehicle.size)\n            if spot is None:\n                raise LotFull()\n            spot.assign(vehicle)\n            return Ticket(spot, vehicle, now())\n    def unpark(self, ticket):\n        with self.lock:\n            ticket.spot.release()\n        return self.pricing.fee(ticket, now())",
};

export const BRIEF_CASES: BriefCase[] = [
  /* ---------------------------------------------------------------- lesson-qa */
  {
    id: "qa-struggles",
    feature: "lesson-qa",
    title: "Ask this lesson: 'given what I struggle with' uses their record",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { week: "week-01-data-at-scale", slug: "day-01-partitioning-deep-dive", question: "Given what I struggle with, what should I focus on in this lesson?" },
    must: [/virtual node/i],
    expect: ["Points them at virtual nodes as the part to focus on, because their record shows they missed it (in an explain-back or as a struggle)", "Explains it in plain words with an everyday analogy, suited to a beginner who likes short answers", "Stays within this lesson's material"],
    avoid: ["Invents struggles or results that are not in their record", "Recites the record back as a list"],
  },
  {
    id: "qa-default-style-expert",
    feature: "lesson-qa",
    title: "Ask this lesson: the default style for an experienced engineer is terse (O10)",
    notes: EXPERT,
    events: [],
    input: { week: "week-01-data-at-scale", slug: "day-01-partitioning-deep-dive", question: "When is consistent hashing worth it over hash mod N?" },
    mustNot: [/\bimagine\b|\bthink of it like\b|\blike a (?:pizza|clock|library|restaurant)/i],
    expect: ["Answers tersely and exactly for an experienced engineer: the trade-off first, no analogy, no basics", "Correct: worth it when nodes join and leave often (caches, Dynamo-style stores); overkill for a fixed shard count"],
    avoid: ["Explains what hashing or a shard is from scratch"],
  },
  {
    id: "qa-memory-off",
    feature: "lesson-qa",
    title: "Ask this lesson with memory off: no brief, a normal answer (regression)",
    notes: null,
    events: BEGINNER_EVENTS,
    input: { week: "week-01-data-at-scale", slug: "day-01-partitioning-deep-dive", question: "What problem does consistent hashing solve?" },
    mustNot: [/last time|you missed|your (?:explain|mock|record)/i],
    expect: ["Answers from the lesson: hash mod N remaps almost every key when N changes; a ring moves only one arc", "Doesn't claim to know anything about the learner"],
  },
  /* ---------------------------------------------------------------- snip-explain */
  {
    id: "snip-beginner",
    feature: "snip-explain",
    title: "Explain a snip, for a beginner who missed this point before",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { week: "week-01-data-at-scale", slug: "day-01-partitioning-deep-dive", heading: "Virtual Nodes: Solving the Balance Problem", text: "With only a few physical nodes on the ring, the arcs between them are uneven: one node can own 40% of the key space. Virtual nodes give each physical node many positions (e.g. 150), so each node's share averages out to close to 1/N." },
    must: [/virtual/i],
    expect: ["Explains the snip in plain words, with an everyday analogy early on (they like analogies and short answers)", "Correct: many positions per node even out the arcs"],
    avoid: ["A long technical answer full of jargon", "Dwells on their earlier mistakes instead of explaining"],
  },
  {
    id: "snip-memory-off",
    feature: "snip-explain",
    title: "Explain a snip with memory off (regression)",
    notes: null,
    events: [],
    input: { week: "week-01-data-at-scale", slug: "day-01-partitioning-deep-dive", heading: "Virtual Nodes: Solving the Balance Problem", text: "With only a few physical nodes on the ring, the arcs between them are uneven: one node can own 40% of the key space. Virtual nodes give each physical node many positions (e.g. 150), so each node's share averages out to close to 1/N." },
    mustNot: [/last time|you missed|you struggled/i],
    expect: ["Explains what the snip shows correctly: few nodes give uneven arcs; many virtual positions per node even out each node's share"],
  },
  /* ---------------------------------------------------------------- lab hint */
  {
    id: "hint-fifth-failure",
    feature: "lab-hint",
    title: "Lab hint: the 5th failed run, levels 1 and 2 already shown, level 3 asked",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { lab: "consistent-hashing-ring", level: 3, failedRuns: 5, code: RING_BUG, failures: RING_FAILS },
    mustNot: [/def get_node[\s\S]*def /],
    expect: ["Gives a level-3 hint: the fix stated precisely (wrap the index past the end back to the first position, and/or raise LookupError on an empty ring)", "Doesn't paste a whole solution (at most one or two corrected lines)", "Any mention of their failed runs is brief and warm (it is optional)"],
    avoid: ["Restarts from a vague nudge question as if no hints had been given"],
  },
  {
    id: "hint-memory-off",
    feature: "lab-hint",
    title: "Lab hint, memory off: only the page's failed-run count (regression)",
    notes: null,
    events: [],
    input: { lab: "consistent-hashing-ring", level: 1, failedRuns: 1, code: RING_BUG, failures: RING_FAILS },
    expect: ["A level-1 hint: points at the wrong behaviour (what happens past the last position, or on an empty ring) as a question, without the fix"],
    avoid: ["Gives the fix or code"],
  },
  /* ---------------------------------------------------------------- lab review */
  {
    id: "review-since-last",
    feature: "lab-review",
    title: "Lab review compares with the last review (O9)",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { lab: "token-bucket", code: BUCKET },
    compare: [/Since your last review .*(up on|down on)|The same scores as your last review/],
    expect: ["The review grades only this code: specific, with quoted lines", "The compared-with-last-time line (from the site) agrees with the rubric scores given"],
    avoid: ["The review claims an improvement since last time that its scores don't show", "Talks about the learner's other labs or mocks"],
  },
  {
    id: "review-memory-off",
    feature: "lab-review",
    title: "Lab review, memory off (regression)",
    notes: null,
    events: [],
    input: { lab: "token-bucket", code: BUCKET },
    mustNot: [/last review|last time/i],
    expect: ["A specific review of this code with quoted lines and a sensible rubric"],
  },
  /* ---------------------------------------------------------------- explain-back */
  {
    id: "explain-again",
    feature: "explain-back",
    title: "Explain-back: misses virtual nodes again; says so and the compare lines say so (O9)",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { concept: "consistent-hashing", text: "Keys and nodes are hashed onto the same ring and a key belongs to the next node clockwise. When a node is added it takes over one arc, so only about 1/(N+1) of keys move, unlike hash mod N. It's worth it when nodes come and go, like in caches." },
    must: [/^VERDICT:\s*partial/i, /again/i],
    compare: [/same as last time, partial/i, /Still missing: "Virtual nodes/],
    expect: ["Verdict partial: virtual nodes (uneven arcs) is missing", "Marks virtual nodes as missed again, briefly", "Grades only this explanation: GOT credits what it does say (the ring, the one arc that moves)"],
  },
  {
    id: "explain-improved",
    feature: "explain-back",
    title: "Explain-back: now covers what it missed before",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { concept: "consistent-hashing", text: "Keys and nodes are hashed onto a ring, 0 to 2^32-1, and a key goes to the first node clockwise. Adding a node takes over one arc, so about 1/(N+1) of keys move, all from one neighbour. Virtual nodes give each server many points on the ring so the arcs even out. It's worth it when nodes come and go, like caches or Dynamo-style stores, and overkill for a fixed shard count." },
    must: [/^VERDICT:\s*solid/i],
    compare: [/Up from partial to solid/i, /Covered now: "Virtual nodes/],
    expect: ["Verdict solid", "GOT acknowledges that virtual nodes (missed before) is now there, in a few words"],
    avoid: ["Marks anything as missing again"],
  },
  {
    id: "explain-memory-off",
    feature: "explain-back",
    title: "Explain-back, memory off: the format is unchanged (regression)",
    notes: null,
    events: [],
    input: { concept: "consistent-hashing", text: "Consistent hashing puts the servers on a ring using a hash and each key goes to the nearest server going clockwise, so you don't use hash mod N." },
    must: [/^VERDICT:\s*(partial|misconception)/i, /^GOT:/im, /^MISSING:/im, /^FIX:/im],
    mustNot: [/\(again\)|last time|than before|as before/i],
    expect: ["Verdict partial (the one arc that moves and virtual nodes are missing)"],
  },
  /* ---------------------------------------------------------------- mock interviewer */
  {
    id: "interviewer-probes-last-gap",
    feature: "mock-interviewer",
    title: "Mock interviewer: probes last attempt's missed peak estimate without naming it first",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { slug: MOCK, phase: "p2", level: "sde", answer: "About 10 million payments a day, so roughly 115 per second. One database can easily handle that." },
    mustNot: [/last (?:time|attempt)|previous (?:attempt|round)|your record/i],
    // the same bar as its memory-off twin (interviewer-p2-memory-off): naming "the evening" or "AutoPay day" is the base
    // prompt's way of probing, with or without the brief
    expect: ["Stays in character as the interviewer and asks one sharp follow-up", "The follow-up probes the peak (the evening or the AutoPay day on the 1st) rather than the average"],
    avoid: ["Mentions an earlier attempt, the learner's record or their goal", "Gives the answer (a peak number or the design) or lectures"],
  },
  {
    id: "interviewer-p2-memory-off",
    feature: "mock-interviewer",
    title: "Mock interviewer, memory off, the same estimate answer (the baseline for interviewer-probes-last-gap)",
    notes: null,
    events: [],
    input: { slug: MOCK, phase: "p2", level: "sde", answer: "About 10 million payments a day, so roughly 115 per second. One database can easily handle that." },
    expect: ["Stays in character as the interviewer and asks one sharp follow-up", "The follow-up probes the peak (the evening or the AutoPay day on the 1st) rather than the average"],
    avoid: ["Gives the answer or lectures"],
  },
  {
    id: "interviewer-memory-off",
    feature: "mock-interviewer",
    title: "Mock interviewer, memory off (regression)",
    notes: null,
    events: [],
    input: { slug: MOCK, phase: "p1", level: "sde", answer: "So users pay their bills through us and can set up AutoPay. I'd start with a payments table and an API." },
    expect: ["Stays in character and follows up on requirements they skipped (who confirms the bill, scale, or the AutoPay spike)"],
    avoid: ["Gives the answer"],
  },
  /* ---------------------------------------------------------------- mock scorecard */
  {
    id: "scorecard-compares",
    feature: "mock-scorecard",
    title: "Mock scorecard compares with the earlier attempt (O9)",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { slug: MOCK, level: "sde", notes: STRONG_NOTES },
    must: [/^### P1/m, /^### Overall/m],
    compare: [/^Overall: (up|the same|down)/, /Up on .*Estimates/],
    expect: ["Grades each phase on this attempt's words only (Estimates now reaches sde or higher: it covers the peak, the AutoPay day and BillHub's drain time)", "The compared-with-last-time lines (from the site) match the levels: Estimates moved up, and a gap from last time is named as fixed or still missing"],
    avoid: ["Lets the earlier attempt lower or raise a level", "Invents what the candidate said"],
  },
  {
    id: "scorecard-strong-memory-off",
    feature: "mock-scorecard",
    title: "Mock scorecard of the strong attempt, memory off (regression: the same notes as scorecard-compares)",
    notes: null,
    events: [],
    input: { slug: MOCK, level: "sde", notes: STRONG_NOTES },
    must: [/^### P1/m, /^### Overall/m],
    expect: ["Grades each phase from the candidate's words (Estimates reaches sde or higher)"],
  },
  {
    id: "scorecard-memory-off",
    feature: "mock-scorecard",
    title: "Mock scorecard, memory off (regression)",
    notes: null,
    events: [],
    input: { slug: MOCK, level: "sde", notes: WEAK_NOTES },
    must: [/^### P1/m, /^### Overall/m],
    mustNot: [/earlier attempt|last attempt|last time/i],
    expect: ["Grades every phase from the candidate's thin notes: mostly junior, with misses named from the rubric"],
  },
  /* ---------------------------------------------------------------- LLD mock */
  {
    id: "lld-interviewer-probes",
    feature: "lld-mock",
    title: "LLD interviewer: the code phase knows last time's gap",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { slug: LLD, phase: "p4", level: "sde", answer: "Here's my park method: it loops over the spots and takes the first free one. I think that covers parking." },
    mustNot: [/last (?:time|attempt)|previous (?:attempt|round)/i, /```/],
    expect: ["Stays in character; one question", "Probes a gap in their park method (two cars racing for one spot, the spot-finding strategy, or what happens when the lot is full)"],
    avoid: ["Writes code or gives the design", "Mentions an earlier attempt"],
  },
  {
    id: "lld-scorecard-compares",
    feature: "lld-mock-scorecard",
    title: "LLD scorecard compares with the earlier attempt (O9)",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: { slug: LLD, level: "sde", notes: LLD_BETTER },
    must: [/^### P1/m, /^### Overall/m],
    compare: [/^Overall: /],
    expect: ["Grades this attempt from its own code and notes", "The compared-with-last-time lines (from the site) agree with the levels given"],
    avoid: ["Lets the earlier attempt change a level"],
  },
  /* ---------------------------------------------------------------- design reviews */
  {
    id: "design-review-beginner",
    feature: "design-review",
    title: "Design review fits a beginner who struggles with estimates",
    notes: BEGINNER,
    events: BEGINNER_EVENTS,
    input: {
      title: "A URL shortener for a campus app",
      problem: "Design a URL shortener for a campus app: 50,000 students, 2 million redirects a day, links expire after 90 days.\n\nConstraints:\n- Redirects under 50 ms p99\n- Custom aliases",
      md: "## Design\nA web server with a Postgres table links(code, url, expires_at). Creating a link generates a random 7-character base62 code and inserts it; on a collision we retry. Redirects read the row and return 301. Expired links are deleted by a nightly job. Custom aliases are inserted as the code if free.\n\nI think one server and one database are enough because there aren't many students. Maybe add Redis later.\n\nAPIs: POST /links {url, alias?} -> {code}; GET /{code} -> 301.\n\nThe main risk is the database going down, so we take backups.",
    },
    expect: ["The review is pitched for a beginner: plain words, with the most important fixes first", "Pushes on the numbers with the working shown (2 million a day is about 23 per second on average; the peak; whether one server is enough), since estimates are a known struggle for them"],
    avoid: ["Mentions the learner's record or earlier mocks explicitly"],
  },
  {
    id: "canvas-review-memory-off",
    feature: "canvas-review",
    title: "Canvas review, memory off (regression)",
    notes: null,
    events: [],
    input: { title: "Rate limiter", brief: "Design a distributed rate limiter for an API gateway: 100k requests per second, per-user limits, under 2 ms added latency.", drawing: "Boxes: Client, API gateway, Rate limiter service, Redis\nArrows: Client → API gateway; API gateway → Rate limiter service; Rate limiter service → Redis", notes: "Token bucket per user in Redis with a Lua script so check-and-decrement is atomic. Gateway calls the limiter on every request. If Redis is down we fail open." },
    must: [/^VERDICT:/m],
    expect: ["A specific review of this drawing and notes (the Lua atomicity, fail-open trade-off, the extra network hop on every request)"],
  },
  {
    id: "canvas-review-expert",
    feature: "canvas-review",
    title: "Canvas review for an experienced engineer: terse, no basics",
    notes: EXPERT,
    events: [],
    input: { title: "Rate limiter", brief: "Design a distributed rate limiter for an API gateway: 100k requests per second, per-user limits, under 2 ms added latency.", drawing: "Boxes: Client, API gateway, Rate limiter service, Redis\nArrows: Client → API gateway; API gateway → Rate limiter service; Rate limiter service → Redis", notes: "Token bucket per user in Redis with a Lua script so check-and-decrement is atomic. Gateway calls the limiter on every request. If Redis is down we fail open." },
    must: [/^VERDICT:/m],
    expect: ["Terse and senior-level: goes straight to the trade-offs (for example the extra hop against the 2 ms budget, local token caches, Redis capacity or hot keys), no basics"],
    avoid: ["Explains what a token bucket or Redis is"],
  },
];
