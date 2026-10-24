/**
 * Company prep tracks: an ordered path through the course for engineers preparing for a specific
 * company. Built from what each company builds (its public products), NOT from leaked or reported
 * interview questions; the pages say so. Items are "<folder>/<file-slug>" keys into the course map;
 * anything not in the map (e.g. a problem-bank article not published yet) is simply skipped.
 */
export type TrackItem = { key: string; why: string };
export type Track = {
  slug: string;
  company: string;
  /** one line: what the company builds that shapes its system design questions */
  builds: string;
  focus: string[];
  items: TrackItem[];
  /** mock interview file slug from resources/mock-interviews (optional) */
  mock?: string;
};

const W = {
  url: "week-01-data-at-scale/capstone-interview-week-1-url-shortner-at-scale",
  partition: "week-01-data-at-scale/day-01-partitioning-deep-dive",
  replication: "week-01-data-at-scale/day-02-replication-tradeoffs",
  rateLimit: "week-01-data-at-scale/day-03-rate-limiting-at-scale",
  hotKeys: "week-01-data-at-scale/day-04-hot-keys-and-skew",
  timeouts: "week-02-failure-first-design/day-01-timeout-hell",
  idempotency: "week-02-failure-first-design/day-02-idempotency-in-practice",
  breakers: "week-02-failure-first-design/day-03-circuit-breakers",
  webhooks: "week-02-failure-first-design/day-04-webhook-delivery",
  flashSale: "week-02-failure-first-design/capstone-interview-week-2-flash-sale-for-megamart",
  queueStream: "week-03-messaging-and-async-processing/day-01-queue-vs-stream",
  outbox: "week-03-messaging-and-async-processing/day-02-transactional-outbox",
  backpressure: "week-03-messaging-and-async-processing/day-03-backpressure-and-flow-control",
  audit: "week-03-messaging-and-async-processing/day-05-audit-log-system",
  orders: "week-03-messaging-and-async-processing/capstone-interview-week-3-event-driven-order-system",
  cachePatterns: "week-04-caching/day-01-caching-patterns",
  invalidation: "week-04-caching/day-02-cache-invalidation",
  herd: "week-04-caching/day-03-thundering-herd",
  feed: "week-04-caching/day-04-feed-caching",
  multiTier: "week-04-caching/day-05-multi-tier-caching",
  catalog: "week-04-caching/capstone-interview-week-4-ecommerce-product-catalog",
  consistency: "week-05-consistency-and-coordination/day-01-consistency-models",
  saga: "week-05-consistency-and-coordination/day-02-saga-pattern",
  sagaOrch: "week-05-consistency-and-coordination/day-03-saga-orchestration",
  leader: "week-05-consistency-and-coordination/day-05-leader-election",
  notify: "week-06-designing-notification-platform/day-01-notification-platform-design",
  notifyScale: "week-06-designing-notification-platform/day-04-scale-reliability-edge-cases",
  food: "week-06-designing-notification-platform/capstone-interview-week-6-food-delivery-system",
  search: "week-07-designing-search-system/day-01-search-fundamentals",
  indexing: "week-07-designing-search-system/day-02-indexing-pipeline",
  relevance: "week-07-designing-search-system/day-03-query-processing-relevance",
  ingestion: "week-08-designing-analytics-pipeline/day-01-event-ingestion",
  streamBatch: "week-08-designing-analytics-pipeline/day-02-streaming-vs-batch",
  tenant: "week-09-multi-tanency-security/day-01-tenant-isolation",
  security: "week-09-multi-tanency-security/day-05-security-architecture",
  slo: "week-10-production-readiness-and-operational-excellence/day-01-slis-slos-slas",
  observability: "week-10-production-readiness-and-operational-excellence/day-02-observability",
  capacity: "week-10-production-readiness-and-operational-excellence/day-04-capacity-planning",
  incidents: "week-10-production-readiness-and-operational-excellence/day-05-incident-management",
  upi: "bonus-problems/bonus-01-indian-upi-system",
  cards: "bonus-problems/bonus-04-visa-mastercard-payments",
  uber: "bonus-problems/bonus-09-uber",
  irctc: "bonus-problems/bonus-11-irctc-booking-system",
  blinkit: "bonus-problems/bonus-12-blinkit-quick-commerce",
  zerodha: "bonus-problems/bonus-13-zerodha-kite-trading",
  s3: "bonus-problems/bonus-08-AWS-S3",
  netflix: "bonus-problems/bonus-06-netflix-streaming",
  payments: "problem-bank/problem-20-payment-system",
  proximity: "problem-bank/problem-13-proximity-service",
  notifyProblem: "problem-bank/problem-06-notification-system",
  hotel: "problem-bank/problem-19-hotel-reservation",
  lldParking: "low-level-design/lld-01-parking-lot",
  lldBooking: "low-level-design/lld-05-movie-ticket-booking",
  lldSplitwise: "low-level-design/lld-06-splitwise",
  lldRate: "low-level-design/lld-03-rate-limiter",
  lldLru: "low-level-design/lld-02-lru-cache",
};

export const TRACKS: Track[] = [
  {
    slug: "flipkart",
    company: "Flipkart",
    builds: "a large e-commerce marketplace: catalog, search, carts and orders, and Big Billion Days-style sale spikes",
    focus: ["sale-day spikes", "catalog caching", "search", "order pipelines", "machine coding"],
    items: [
      { key: W.flashSale, why: "the sale-day spike: rate limits, idempotent claims, no overselling" },
      { key: W.catalog, why: "a product catalog read millions of times, written rarely" },
      { key: W.herd, why: "what a cache expiry does at peak traffic" },
      { key: W.search, why: "product search basics: inverted index, analysis" },
      { key: W.relevance, why: "ranking results people actually click" },
      { key: W.orders, why: "orders as events: outbox, retries, dead letters" },
      { key: W.blinkit, why: "the quick-commerce cousin: stock, dark stores, slots" },
      { key: W.lldParking, why: "machine coding round warm-up" },
      { key: W.lldBooking, why: "machine coding with concurrency: holds and bookings" },
    ],
    mock: "mock-04-tillsy-pos-platform",
  },
  {
    slug: "razorpay",
    company: "Razorpay",
    builds: "payment gateways and APIs for businesses: charges, refunds, webhooks and settlements",
    focus: ["idempotency", "webhooks", "sagas", "consistency", "audit"],
    items: [
      { key: W.idempotency, why: "charge exactly once, whatever the retries" },
      { key: W.webhooks, why: "delivering payment events to merchants reliably" },
      { key: W.timeouts, why: "timeouts and retries against banks" },
      { key: W.saga, why: "multi-step money movement without 2PC" },
      { key: W.consistency, why: "which reads must be strongly consistent" },
      { key: W.outbox, why: "never lose an event after a DB commit" },
      { key: W.audit, why: "tamper-evident records regulators ask for" },
      { key: W.upi, why: "how UPI moves money end to end" },
      { key: W.payments, why: "the classic payment-system interview question" },
    ],
    mock: "mock-01-billbolt-autopay",
  },
  {
    slug: "swiggy",
    company: "Swiggy",
    builds: "food and grocery delivery: live orders, delivery partners on the map, ETAs and notifications",
    focus: ["dispatch & geo", "real-time updates", "notifications", "order sagas"],
    items: [
      { key: W.food, why: "the whole food-delivery system as an interview" },
      { key: W.uber, why: "matching riders and drivers on a map (H3, ETAs)" },
      { key: W.proximity, why: "nearby search: geohash, quadtree, H3" },
      { key: W.notify, why: "order updates by push, SMS and in-app" },
      { key: W.notifyScale, why: "notifications at dinner-time scale" },
      { key: W.sagaOrch, why: "order → payment → restaurant → rider as one workflow" },
      { key: W.blinkit, why: "10-minute grocery delivery (Instamart territory)" },
      { key: W.lldParking, why: "machine coding round warm-up" },
    ],
  },
  {
    slug: "zerodha",
    company: "Zerodha",
    builds: "a retail stock broking platform: order placement, live market data at market open, and reliability under bursts",
    focus: ["burst traffic at 9:15", "streaming market data", "backpressure", "reliability"],
    items: [
      { key: W.zerodha, why: "Kite: market open, ticks, orders" },
      { key: W.backpressure, why: "when producers outrun consumers" },
      { key: W.queueStream, why: "queues vs streams for market data and orders" },
      { key: W.rateLimit, why: "protecting order APIs" },
      { key: W.breakers, why: "failing fast when a dependency is slow" },
      { key: W.capacity, why: "planning for the busiest minute of the day" },
      { key: W.incidents, why: "running an incident during market hours" },
    ],
  },
  {
    slug: "phonepe",
    company: "PhonePe",
    builds: "UPI payments at national scale: payments, merchants, and very high transaction volumes",
    focus: ["UPI", "idempotency", "hot keys", "high TPS", "observability"],
    items: [
      { key: W.upi, why: "the UPI flow, PSPs and NPCI" },
      { key: W.idempotency, why: "exactly-once debits" },
      { key: W.hotKeys, why: "one hot merchant or account" },
      { key: W.partition, why: "sharding payment data" },
      { key: W.replication, why: "replicas, lag and what to read from where" },
      { key: W.cards, why: "how card networks compare to UPI" },
      { key: W.observability, why: "seeing a failing bank before users do" },
      { key: W.slo, why: "SLOs for payment success" },
      { key: W.payments, why: "the classic payment-system interview question" },
    ],
    mock: "mock-01-billbolt-autopay",
  },
  {
    slug: "amazon",
    company: "Amazon (India)",
    builds: "e-commerce, logistics and cloud: catalog, orders, storage and services that must stay up",
    focus: ["caching", "storage", "queues", "availability", "operational excellence"],
    items: [
      { key: W.catalog, why: "the product catalog interview" },
      { key: W.multiTier, why: "caches at every layer and invalidating them" },
      { key: W.s3, why: "object storage at planet scale" },
      { key: W.orders, why: "event-driven order processing" },
      { key: W.leader, why: "leader election and fencing" },
      { key: W.slo, why: "SLIs, SLOs and error budgets" },
      { key: W.capacity, why: "capacity planning for peak sales" },
      { key: W.incidents, why: "incident management and postmortems" },
      { key: W.lldLru, why: "a classic coding/LLD warm-up" },
    ],
    mock: "mock-02-wanderstay-bookings",
  },
];

export const trackBySlug = (slug: string) => TRACKS.find((t) => t.slug === slug) || null;
