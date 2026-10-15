/**
 * Practice games and the lessons that teach them. Isomorphic (no server or client APIs): the
 * renderer uses it for the in-lesson "practice this" card, the Arena hub for "taught in" links.
 *
 * - kind "arena": quick 60–90 s course games under /learn/arena/<slug>
 * - kind "play":  the Engineering Playground boards at /play (deep link /play?g=<key>)
 */

/** the course the Arena belongs to (same id as COURSE_ID in src/lib/learn/course.ts, kept here client-safe) */
export const ARENA_COURSE = "system-design-mastery";

export type ArenaGameKey = "latency" | "store" | "outage";
export type PlayGameKey = "cache" | "ring" | "breaker" | "env" | "race" | "inc";

export type LessonRef = { week: string; slug: string; label: string };

export type PracticeGame = {
  id: string;
  kind: "arena" | "play";
  key: ArenaGameKey | PlayGameKey;
  name: string;
  hook: string;
  href: string;
  /** quest id awarded on the first clear (src/game/catalog.ts) */
  quest: string;
  /** lessons that teach it (first = primary) */
  lessons: LessonRef[];
  /** lesson / story titles that get the in-lesson "practice this" card */
  titleRe: RegExp;
  seconds?: number;
};

const L = (week: string, slug: string, label: string): LessonRef => ({ week, slug, label });

export const PRACTICE_GAMES: PracticeGame[] = [
  {
    id: "arena:latency",
    kind: "arena",
    key: "latency",
    name: "Latency Ladder",
    hook: "Order the numbers every engineer should know, L1 cache to a cross-continent round trip.",
    href: "/learn/arena/latency",
    quest: "arena:latency",
    seconds: 90,
    lessons: [
      L("week-00-foundations", "foundations-part-1-basic-concepts", "W00 · Part 1 · Fundamentals"),
      L("week-00-foundations", "foundations-part-4-networking", "W00 · Part 4 · Networking"),
      L("week-04-caching", "day-05-multi-tier-caching", "W04 · Day 5 · Multi-tier caching"),
    ],
    titleRe: /\b(Part 1: System Design Fundamentals|Networking Fundamentals|Operating System Concepts|Multi-Tier Caching)\b/i,
  },
  {
    id: "arena:store",
    kind: "arena",
    key: "store",
    name: "Pick the Store",
    hook: "A use case drops in. Send it to the datastore that fits before the clock runs out.",
    href: "/learn/arena/store",
    quest: "arena:store",
    seconds: 75,
    lessons: [
      L("week-00-foundations", "foundations-part-2-infrastructure-building-blocks", "W00 · Part 2 · Building blocks"),
      L("week-01-data-at-scale", "week-01-preview", "W01 · Preview · Storage trade-offs"),
      L("week-01-data-at-scale", "day-05-session-store-design", "W01 · Day 5 · Session store"),
      L("week-08-designing-analytics-pipeline", "day-03-data-modeling", "W08 · Day 3 · Data modeling"),
    ],
    titleRe: /\b(Infrastructure Building Blocks|Storage Trade-offs|Session Store Design|Search Fundamentals|Data Modeling for Analytics)\b/i,
  },
  {
    id: "arena:outage",
    kind: "arena",
    key: "outage",
    name: "Fix the Outage",
    hook: "Symptom on the left, pattern on the right. Name the fix that stops the bleeding.",
    href: "/learn/arena/outage",
    quest: "arena:outage",
    seconds: 75,
    lessons: [
      L("week-02-failure-first-design", "day-01-timeout-hell", "W02 · Day 1 · Timeout hell"),
      L("week-02-failure-first-design", "day-02-idempotency-in-practice", "W02 · Day 2 · Idempotency"),
      L("week-03-messaging-and-async-processing", "day-03-backpressure-and-flow-control", "W03 · Day 3 · Backpressure"),
      L("week-04-caching", "day-03-thundering-herd", "W04 · Day 3 · Thundering herd"),
    ],
    titleRe:
      /\b(Timeout Hell|Idempotency in Practice|Webhook Delivery|Backpressure and Flow Control|Dead Letters|Transactional Outbox|Thundering Herd|Rate Limiting at Scale|Noisy Neighbou?r)\b/i,
  },
  {
    id: "play:cache",
    kind: "play",
    key: "cache",
    name: "Cache or Miss",
    hook: "Beat LRU at eviction.",
    href: "/play?g=cache",
    quest: "play:cache",
    lessons: [
      L("week-04-caching", "day-01-caching-patterns", "W04 · Day 1 · Caching patterns"),
      L("week-04-caching", "day-05-multi-tier-caching", "W04 · Day 5 · Multi-tier caching"),
    ],
    titleRe: /\b(Caching Patterns|Invalidation Strategies|Feed Caching|Multi-Tier Caching)\b/i,
  },
  {
    id: "play:ring",
    kind: "play",
    key: "ring",
    name: "Hash Ring",
    hook: "Add a node, move the fewest keys.",
    href: "/play?g=ring",
    quest: "play:ring",
    lessons: [
      L("week-01-data-at-scale", "day-01-partitioning-deep-dive", "W01 · Day 1 · Partitioning"),
      L("week-01-data-at-scale", "day-04-hot-keys-and-skew", "W01 · Day 4 · Hot keys and skew"),
    ],
    titleRe: /\b(Partitioning Deep-Dive|Hot Keys and Skew)\b/i,
  },
  {
    id: "play:breaker",
    kind: "play",
    key: "breaker",
    name: "Trip the Breaker",
    hook: "You can't see the service while it's open.",
    href: "/play?g=breaker",
    quest: "play:breaker",
    lessons: [L("week-02-failure-first-design", "day-03-circuit-breakers", "W02 · Day 3 · Circuit breakers")],
    titleRe: /\bCircuit Breakers?\b/i,
  },
  {
    id: "play:envelope",
    kind: "play",
    key: "env",
    name: "Back of the Envelope",
    hook: "Estimate WhatsApp-scale in seconds.",
    href: "/play?g=env",
    quest: "play:envelope",
    lessons: [
      L("week-00-foundations", "foundations-part-3-back-of-the-envelope-estimation", "W00 · Part 3 · Estimation"),
      L("week-10-production-readiness-and-operational-excellence", "day-04-capacity-planning", "W10 · Day 4 · Capacity planning"),
    ],
    titleRe: /\b(Back-of-the-Envelope|Capacity Planning)\b/i,
  },
  {
    id: "play:race",
    kind: "play",
    key: "race",
    name: "Race Condition",
    hook: "Double-book a seat, then fix it.",
    href: "/play?g=race",
    quest: "play:race",
    lessons: [
      L("week-05-consistency-and-coordination", "day-01-consistency-models", "W05 · Day 1 · Consistency models"),
      L("week-02-failure-first-design", "day-02-idempotency-in-practice", "W02 · Day 2 · Idempotency"),
    ],
    titleRe: /\b(Consistency Models|Tatkal|IRCTC)\b/i,
  },
  {
    id: "play:incident",
    kind: "play",
    key: "inc",
    name: "Incident Commander",
    hook: "The pager just went off.",
    href: "/play?g=inc",
    quest: "play:incident",
    lessons: [
      L("week-10-production-readiness-and-operational-excellence", "day-05-incident-management", "W10 · Day 5 · Incident management"),
      L("week-10-production-readiness-and-operational-excellence", "day-03-deployment-strategies", "W10 · Day 3 · Deployment strategies"),
    ],
    titleRe: /\b(Incident Management|Deployment Strategies|Observability)\b/i,
  },
];

export const ARENA_GAMES = PRACTICE_GAMES.filter((g) => g.kind === "arena");

/** Games to suggest at the end of a lesson / story with this title (at most two, arena first). */
export function practiceFor(title: string): PracticeGame[] {
  if (!title) return [];
  return PRACTICE_GAMES.filter((g) => g.titleRe.test(title))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "arena" ? -1 : 1))
    .slice(0, 2);
}

export const lessonHref = (course: string, l: LessonRef) => `/learn/${course}/${l.week}/${l.slug}`;
