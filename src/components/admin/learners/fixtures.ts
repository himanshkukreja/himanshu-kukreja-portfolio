/**
 * DEV-ONLY fixtures for the learner / course admin screens (`/admin?preview=1`). Resolved through
 * the shell's fixture module (src/components/admin/shell/fixtures.ts), which is only imported in
 * development. Deterministic (seeded) so screenshots are stable. Names and emails are invented.
 */
import type {
  CourseAnalytics,
  LearnerDetail,
  LearnerRow,
  LearnersResponse,
  MapCell,
  Segment,
  StageDropoff,
  TimelineItem,
  WeekSegment,
} from "@/lib/admin/learners/types";

if (process.env.NODE_ENV !== "development") {
  throw new Error("learner fixtures are dev-only");
}

type L = [slug: string, code: string, title: string, tag: string, minutes: number];
const COURSE: { weeks: [key: string, code: string, title: string, nodes: L[]][]; sq: L[] } = {"weeks": [["week-00-foundations", "00", "Foundations", [["foundations-part-1-basic-concepts", "P1", "System Design Fundamentals", "W00 · PART 1", 68], ["foundations-part-2-infrastructure-building-blocks", "P2", "Infrastructure Building Blocks", "W00 · PART 2", 87], ["foundations-part-3-back-of-the-envelope-estimation", "P3", "Back-of-the-Envelope Estimation", "W00 · PART 3", 83], ["foundations-part-4-networking", "P4", "Networking Fundamentals for System Design", "W00 · PART 4", 167], ["foundations-part-5-operating-systems", "P5", "Operating System Concepts for System Design", "W00 · PART 5", 139], ["foundations-part-6-terminology-and-theory", "P6", "System Design Terminology & Theory", "W00 · PART 6", 164]]], ["week-01-data-at-scale", "01", "Data at Scale", [["week-01-preview", "PRE", "Data at Scale Preview", "W01 · PREVIEW", 26], ["day-01-partitioning-deep-dive", "D1", "Partitioning Deep-Dive", "W01 · DAY 01", 118], ["day-02-replication-tradeoffs", "D2", "Replication Trade-offs", "W01 · DAY 02", 123], ["day-03-rate-limiting-at-scale", "D3", "Rate Limiting at Scale", "W01 · DAY 03", 156], ["day-04-hot-keys-and-skew", "D4", "Hot Keys and Skew", "W01 · DAY 04", 142], ["day-05-session-store-design", "D5", "Session Store Design", "W01 · DAY 05", 144], ["capstone-interview-week-1-url-shortner-at-scale", "B", "Design a URL Shortener at Scale", "W01 · BOSS", 118]]], ["week-02-failure-first-design", "02", "Failure-First Design", [["week-02-preview", "PRE", "Failure-First Design Preview", "W02 · PREVIEW", 61], ["day-01-timeout-hell", "D1", "Timeout Hell", "W02 · DAY 01", 166], ["day-02-idempotency-in-practice", "D2", "Idempotency in Practice", "W02 · DAY 02", 176], ["day-03-circuit-breakers", "D3", "Circuit Breakers", "W02 · DAY 03", 133], ["day-04-webhook-delivery", "D4", "Webhook Delivery System", "W02 · DAY 04", 138], ["day-05-distributed-cron", "D5", "Distributed Cron & Job Scheduling", "W02 · DAY 05", 116], ["capstone-interview-week-2-flash-sale-for-megamart", "B", "The Ultimate System Design Interview", "W02 · BOSS", 115]]], ["week-03-messaging-and-async-processing", "03", "Messaging and Async Processing", [["week-03-preview", "PRE", "Messaging and Async Processing Preview", "W03 · PREVIEW", 60], ["day-01-queue-vs-stream", "D1", "Queue vs Stream", "W03 · DAY 01", 133], ["day-02-transactional-outbox", "D2", "Transactional Outbox", "W03 · DAY 02", 138], ["day-03-backpressure-and-flow-control", "D3", "Backpressure and Flow Control", "W03 · DAY 03", 132], ["day-04-dead-letters-and-poison-pills", "D4", "Dead Letters and Poison Pills", "W03 · DAY 04", 139], ["day-05-audit-log-system", "D5", "Audit Log System", "W03 · DAY 05", 145], ["capstone-interview-week-3-event-driven-order-system", "B", "Event-Driven Food Delivery Order System", "W03 · BOSS", 120]]], ["week-04-caching", "04", "Caching", [["week-04-preview", "PRE", "Caching Preview", "W04 · PREVIEW", 43], ["day-01-caching-patterns", "D1", "Caching Patterns", "W04 · DAY 01", 140], ["day-02-cache-invalidation", "D2", "Invalidation Strategies", "W04 · DAY 02", 144], ["day-03-thundering-herd", "D3", "Thundering Herd", "W04 · DAY 03", 137], ["day-04-feed-caching", "D4", "Feed Caching", "W04 · DAY 04", 123], ["day-05-multi-tier-caching", "D5", "Multi-Tier Caching", "W04 · DAY 05", 122], ["capstone-interview-week-4-ecommerce-product-catalog", "B", "Design a Global E-Commerce Product Catalog System", "W04 · BOSS", 87]]], ["week-05-consistency-and-coordination", "05", "Consistency and Coordination", [["week-05-preview", "PRE", "Consistency and Coordination Preview", "W05 · PREVIEW", 56], ["day-01-consistency-models", "D1", "Consistency Models", "W05 · DAY 01", 130], ["day-02-saga-pattern", "D2", "Distributed Transactions — The Saga Pattern", "W05 · DAY 02", 125], ["day-03-saga-orchestration", "D3", "Saga Orchestration Deep Dive", "W05 · DAY 03", 106], ["day-04-conflict-resolution", "D4", "Conflict Resolution", "W05 · DAY 04", 123], ["day-05-leader-election", "D5", "Leader Election and Coordination", "W05 · DAY 05", 105], ["capstone-interview-week-5-multiplayer-game-matchmaking-system", "B", "Multiplayer Game Matchmaking System", "W05 · BOSS", 106]]], ["week-06-designing-notification-platform", "06", "Designing a Notification Platform", [["week-06-preview", "PRE", "Designing a Notification Platform Preview", "W06 · PREVIEW", 45], ["day-01-notification-platform-design", "D1", "Notification Platform — Problem Understanding & High-Level Design", "W06 · DAY 01", 106], ["day-02-core-notification-flow", "D2", "Core Notification Flow", "W06 · DAY 02", 93], ["day-03-advanced-features", "D3", "Advanced Features", "W06 · DAY 03", 74], ["day-04-scale-reliability-edge-cases", "D4", "Scale, Reliability & Edge Cases", "W06 · DAY 04", 84], ["day-05-operations-monitoring-interview", "D5", "Operations, Monitoring & Interview Mastery", "W06 · DAY 05", 75], ["capstone-interview-week-6-food-delivery-system", "B", "Food Delivery Order System", "W06 · BOSS", 84]]], ["week-07-designing-search-system", "07", "Designing a Search System", [["week-07-preview", "PRE", "Designing a Search System Preview", "W07 · PREVIEW", 57], ["day-01-search-fundamentals", "D1", "Search Fundamentals & Architecture", "W07 · DAY 01", 91], ["day-02-indexing-pipeline", "D2", "Indexing Pipeline", "W07 · DAY 02", 94], ["day-03-query-processing-relevance", "D3", "Query Processing & Relevance", "W07 · DAY 03", 87], ["day-04-advanced-search-features", "D4", "Advanced Search Features", "W07 · DAY 04", 78], ["day-05-search-operations-scale", "D5", "Search Operations & Scale", "W07 · DAY 05", 78], ["capstone-interview-week-7-legal-document-search", "B", "Designing a Legal Document Search System", "W07 · BOSS", 107]]], ["week-08-designing-analytics-pipeline", "08", "Designing an Analytics Pipeline", [["week-08-preview", "PRE", "Designing an Analytics Pipeline Preview", "W08 · PREVIEW", 58], ["day-01-event-ingestion", "D1", "Event Ingestion at Scale", "W08 · DAY 01", 101], ["day-02-streaming-vs-batch", "D2", "Streaming vs Batch Processing", "W08 · DAY 02", 104], ["day-03-data-modeling", "D3", "Data Modeling for Analytics", "W08 · DAY 03", 101], ["day-04-late-data", "D4", "Late-Arriving Data and Correctness", "W08 · DAY 04", 94], ["day-05-query-optimization", "D5", "Query Layer and Optimization", "W08 · DAY 05", 111], ["capstone-interview-week-8-streaming-analytics", "B", "Real-Time Analytics for Video Streaming Platform", "W08 · BOSS", 104]]], ["week-09-multi-tanency-security", "09", "Multi-tenancy and Security", [["week-09-preview", "PRE", "Multi-tenancy and Security Preview", "W09 · PREVIEW", 60], ["day-01-tenant-isolation", "D1", "Tenant Isolation Strategies", "W09 · DAY 01", 121], ["day-02-noisy-neighbour", "D2", "Noisy Neighbor Prevention", "W09 · DAY 02", 96], ["day-03-data-residency", "D3", "Data Residency and GDPR", "W09 · DAY 03", 96], ["day-04-right-to-deletion", "D4", "Right to Deletion", "W09 · DAY 04", 90], ["day-05-security-architecture", "D5", "Security Architecture", "W09 · DAY 05", 91], ["capstone-interview-week-9-multi-tenant-saas", "B", "Design a Multi-Tenant Enterprise SaaS Platform", "W09 · BOSS", 107]]], ["week-10-production-readiness-and-operational-excellence", "10", "Production Readiness and Operational Excellence", [["week-10-preview", "PRE", "Production Readiness and Operational Excellence Preview", "W10 · PREVIEW", 64], ["day-01-slis-slos-slas", "D1", "SLIs, SLOs and SLAs", "W10 · DAY 01", 100], ["day-02-observability", "D2", "Observability", "W10 · DAY 02", 115], ["day-03-deployment-strategies", "D3", "Deployment Strategies", "W10 · DAY 03", 113], ["day-04-capacity-planning", "D4", "Capacity Planning", "W10 · DAY 04", 85], ["day-05-incident-management", "D5", "Incident Management", "W10 · DAY 05", 130], ["capstone-interview-week-10-the-grand-finale", "B", "The Grand Finale", "W10 · BOSS", 87]]]], "sq": [["bonus-01-indian-upi-system", "SQ-01", "India's UPI", "SQ-01", 93], ["bonus-02-whatsapp-messaging", "SQ-02", "WhatsApp Messaging", "SQ-02", 99], ["bonus-03-aadhar-identity-system", "SQ-03", "Aadhaar (UIDAI)", "SQ-03", 102], ["bonus-04-visa-mastercard-payments", "SQ-04", "Visa/Mastercard Global Payment Network", "SQ-04", 113], ["bonus-05-google-search", "SQ-05", "Google Search", "SQ-05", 102], ["bonus-06-netflix-streaming", "SQ-06", "Netflix Streaming", "SQ-06", 103], ["bonus-07-spotify-streaming", "SQ-07", "Spotify", "SQ-07", 74], ["bonus-08-AWS-S3", "SQ-08", "AWS S3", "SQ-08", 92], ["bonus-09-uber", "SQ-09", "Uber", "SQ-09", 79], ["bonus-10-twitter-x", "SQ-10", "Twitter/X", "SQ-10", 79], ["bonus-11-irctc-booking-system", "SQ-11", "IRCTC Tatkal Ticket Booking System", "SQ-11", 109]]};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

const PEOPLE = [
  ["Aarav Mehta", "google", "desktop · macOS", "Bengaluru", "IN"],
  ["Priya Nair", "google", "mobile · iOS", "Kochi", "IN"],
  ["Rohan Gupta", "google", "desktop · Windows", "Pune", "IN"],
  ["Sara Iqbal", "email", "desktop · macOS", "Berlin", "DE"],
  ["Kabir Singh", "google", "mobile · Android", "Delhi", "IN"],
  ["Ananya Rao", "google", "desktop · Linux", "Hyderabad", "IN"],
  ["Dev Patel", "github", "desktop · macOS", "Austin", "US"],
  ["Meera Joshi", "google", "mobile · iOS", "Mumbai", "IN"],
  ["Ishaan Verma", "google", "desktop · Windows", "Noida", "IN"],
  ["Tara Kapoor", "email", "desktop · macOS", "London", "GB"],
  ["Neil D'Souza", "google", "mobile · Android", "Goa", "IN"],
  ["Zoya Khan", "google", "desktop · macOS", "Singapore", "SG"],
  ["Arjun Bhat", "google", "desktop · Windows", "Chennai", "IN"],
  ["Lena Fischer", "email", "desktop · Linux", "Munich", "DE"],
] as const;

// progress profile per learner: [nodes completed in order, in-progress pct of the next, last seen ms ago, active days in 30]
const PLAN: [number, number, number, number][] = [
  [23, 46, 6 * MIN, 19],
  [14, 72, 2 * HOUR, 11],
  [9, 31, 26 * HOUR, 7],
  [7, 88, 3 * DAY, 5],
  [6, 12, 9 * DAY, 3],
  [5, 64, 12 * DAY, 2],
  [4, 20, 15 * MIN, 8],
  [3, 55, 20 * DAY, 1],
  [2, 8, 33 * DAY, 0],
  [1, 40, 4 * DAY, 2],
  [0, 18, 2 * DAY, 1],
  [0, 0, 45 * DAY, 0],
  [12, 5, 40 * HOUR, 6],
  [0, 0, 3 * DAY, 0],
];

const ORDERED = COURSE.weeks.flatMap(([key, code, , nodes]) => nodes.map((n) => ({ week: key, weekCode: code, n })));
const STAGES = ["Preface", "Part I", "Part II", "Part III", "Part IV", "Exercises"];
const STAGE_TITLES = ["The problem", "Mental model", "Deep dive", "Failure modes", "Trade-offs", "Practice"];

function buildRow(i: number): LearnerRow {
  const [name, provider, device, city, country] = PEOPLE[i];
  const [done, pct, seenAgo, active30] = PLAN[i];
  const r = rng(i * 97 + 3);
  const email = `${name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}${i > 6 ? i : ""}@example.com`;
  const weeks: WeekSegment[] = COURSE.weeks.map(([key, code, , nodes]) => {
    const start = ORDERED.findIndex((o) => o.week === key);
    const d = Math.max(0, Math.min(nodes.length, done - start));
    const partial = done >= start && done < start + nodes.length && pct ? pct / 100 : 0;
    return { key, code, done: d, partial, total: nodes.length };
  });
  const cur = ORDERED[Math.min(done, ORDERED.length - 1)];
  const touched = done + (pct ? 1 : 0);
  const strip30 = Array.from({ length: 30 }, (_, d) => (d >= 30 - Math.ceil(seenAgo / DAY) || r() > active30 / 30 ? 0 : 1 + Math.floor(r() * 6)));
  if (seenAgo < DAY) strip30[29] = 3 + Math.floor(r() * 4);
  const real30 = strip30.filter(Boolean).length;
  const segments: Segment[] = [];
  if (seenAgo < 30 * MIN) segments.push("active-now");
  if (touched > 0 && seenAgo >= 7 * DAY && seenAgo < 60 * DAY) segments.push("at-risk");
  if (weeks.some((w) => w.done === w.total)) segments.push("week-done");
  if (touched === 0) segments.push("never-started");
  if (real30 >= 4 || done >= 5) segments.push("power");
  const answered = done > 6 ? 25 + Math.floor(r() * 90) : done > 2 ? Math.floor(r() * 25) : 0;
  const correct = Math.round(answered * (0.55 + r() * 0.4));
  const st = Math.floor(r() * STAGES.length);
  return {
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    name,
    email,
    avatar: null,
    provider,
    isAdmin: false,
    signedUpAt: ago((i * 11 + 20) * DAY),
    lastSignInAt: ago(seenAgo + 3 * HOUR),
    lastSeenAt: ago(seenAgo),
    position: touched
      ? {
          week: cur.week,
          lesson: cur.n[0],
          title: cur.n[2],
          tag: cur.n[3],
          weekCode: cur.weekCode,
          href: `/learn/system-design-mastery/${cur.week}/${cur.n[0]}`,
          stage: `part-${st}`,
          stageLabel: `${STAGES[st]} · ${STAGE_TITLES[st]}`,
          stageSource: i % 3 === 0 ? "event" : "estimate",
          pct,
          status: pct ? "in_progress" : "completed",
          at: ago(seenAgo),
          source: i % 3 === 0 ? "event" : "progress",
        }
      : null,
    coursePct: Math.round((done / ORDERED.length) * 1000) / 10,
    completed: done + (i === 1 ? 2 : 0),
    inProgress: pct ? 1 + (i % 3) : 0,
    touched,
    sideQuestsDone: i === 1 ? 2 : 0,
    weeks,
    timeSec: done * 52 * 60 + Math.round(pct * 30),
    activeDays30: real30,
    activeDaysTotal: real30 + Math.floor(done * 1.4),
    strip30,
    sessions30: Math.round(real30 * 1.6),
    frequency: real30 >= 15 ? "daily" : real30 >= 6 ? "several/wk" : real30 >= 3 ? "weekly" : real30 >= 1 ? "occasional" : "dormant",
    streak: seenAgo < DAY ? Math.min(real30, 1 + (i % 6)) : 0,
    longestStreak: Math.max(1, Math.min(real30 + 2, 3 + (i % 9))),
    mcq: { answered, correct, pct: answered ? Math.round((correct / answered) * 1000) / 10 : null },
    notes: Math.floor(r() * (done + 1) * 0.8),
    bookmarks: Math.floor(r() * 4),
    comments: i % 4 === 1 ? 1 : 0,
    device,
    country,
    city,
    segments,
  };
}

const ROWS = PEOPLE.map((_, i) => buildRow(i));

function learners(u: URL): LearnersResponse {
  const range = u.searchParams.get("range") || "30d";
  const q = (u.searchParams.get("q") || "").toLowerCase();
  const segment = u.searchParams.get("segment") || "all";
  const sort = u.searchParams.get("sort") || "lastSeen";
  const dir = u.searchParams.get("dir") === "asc" ? 1 : -1;
  let rows = ROWS.filter((r) => !q || r.name.toLowerCase().includes(q) || r.email.includes(q) || (r.position?.title || "").toLowerCase().includes(q));
  if (segment !== "all") rows = rows.filter((r) => r.segments.includes(segment as Segment));
  const key: Record<string, (r: LearnerRow) => number | string> = {
    lastSeen: (r) => r.lastSeenAt || "",
    name: (r) => r.name,
    signedUp: (r) => r.signedUpAt || "",
    progress: (r) => r.coursePct,
    completed: (r) => r.completed,
    time: (r) => r.timeSec,
    frequency: (r) => r.activeDays30,
    streak: (r) => r.streak,
    mcq: (r) => r.mcq.pct ?? -1,
    notes: (r) => r.notes + r.bookmarks,
  };
  const k = key[sort] || key.lastSeen;
  rows = [...rows].sort((a, b) => (k(a) < k(b) ? -dir : k(a) > k(b) ? dir : 0));
  const n = range === "24h" ? 24 : range === "7d" ? 7 : range === "90d" ? 90 : range === "12m" ? 365 : 30;
  const r = rng(n);
  const trend = Array.from({ length: n }, (_, i) => ({
    t: range === "24h" ? new Date(Date.now() - (n - 1 - i) * HOUR).toISOString() : dayKey(Date.now() - (n - 1 - i) * DAY),
    active: Math.round((range === "24h" ? 1 : 3) + r() * (range === "24h" ? 3 : 6) + Math.sin(i / 3) * 2),
    completions: Math.round(r() * 4),
  }));
  const seg = (s: Segment) => ROWS.filter((x) => x.segments.includes(s)).length;
  return {
    generatedAt: new Date().toISOString(),
    tz: "Asia/Kolkata",
    range: range as LearnersResponse["range"],
    kpis: { learners: ROWS.length, activeToday: 4, active7d: 8, active30d: 11, activeInRange: 11, avgLessonsPerLearner: 7.4, completionRate: 58.2, avgMinutesPerActive: 96.5, newInRange: 3 },
    trend,
    segments: { all: ROWS.length, "active-now": seg("active-now"), "at-risk": seg("at-risk"), "week-done": seg("week-done"), "never-started": seg("never-started"), power: seg("power") },
    weeks: COURSE.weeks.map(([key, code, title, nodes]) => ({ key, code, title, total: nodes.length })),
    rows,
    total: rows.length,
    page: 1,
    pageSize: 50,
    features: { stageColumns: false, gameColumns: false, trialAttempts: false, reviewCards: false, learnEvents: true, pageLeave: true },
  };
}

function detail(id: string): LearnerDetail | undefined {
  const i = ROWS.findIndex((x) => x.id === id);
  const row = ROWS[i >= 0 ? i : 0];
  const idx = i >= 0 ? i : 0;
  const [done, pct] = PLAN[idx];
  const r = rng(idx * 13 + 7);
  let k = 0;
  const cell = (week: string, n: L, completedIdx: number): MapCell => {
    const status = completedIdx < done ? "completed" : completedIdx === done && pct ? "in_progress" : "not_started";
    const started = status !== "not_started" ? Date.now() - (done - completedIdx + 1) * 1.7 * DAY : 0;
    return {
      week,
      slug: n[0],
      code: n[1],
      title: n[2],
      kind: "day-content",
      href: `/learn/system-design-mastery/${week}/${n[0]}`,
      status,
      pct: status === "completed" ? 100 : status === "in_progress" ? pct : 0,
      timeSec: status === "completed" ? Math.round(n[4] * 60 * (0.6 + r() * 0.8)) : status === "in_progress" ? Math.round(n[4] * 60 * (pct / 100)) : 0,
      startedAt: started ? new Date(started).toISOString() : null,
      completedAt: status === "completed" ? new Date(started + 5 * HOUR).toISOString() : null,
      lastAt: started ? new Date(started + 5 * HOUR).toISOString() : null,
      lastStage: null,
      visits: status === "not_started" ? (r() > 0.9 ? 1 : 0) : 1 + Math.floor(r() * 4),
    };
  };
  const map = COURSE.weeks.map(([key, code, title, nodes]) => ({ key, code, title, cells: nodes.map((n) => cell(key, n, k++)) }));
  const sideQuests = COURSE.sq.map((n, j) => ({ ...cell("bonus-problems", n, 999), status: (idx === 1 && j < 2 ? "completed" : "not_started") as MapCell["status"], pct: idx === 1 && j < 2 ? 100 : 0 }));
  const calendar = Array.from({ length: 84 }, (_, d) => ({ d: dayKey(Date.now() - (83 - d) * DAY), n: d >= 54 ? row.strip30[d - 54] : r() > 0.7 ? 1 + Math.floor(r() * 5) : 0 }));
  const timeline: TimelineItem[] = [];
  map.flatMap((w) => w.cells)
    .filter((c) => c.startedAt)
    .forEach((c) => {
      timeline.push({
        kind: "session",
        at: c.startedAt!,
        end: c.lastAt!,
        minutes: Math.round(c.timeSec / 60),
        device: `${row.device} · Chrome`,
        country: row.country,
        city: row.city,
        pages: [
          { path: "/learn/system-design-mastery", title: "Learn hub", at: c.startedAt! },
          { path: c.href, title: `${c.code} · ${c.title}`, at: c.startedAt! },
        ],
      });
      timeline.push({ kind: "started", at: c.startedAt!, week: c.week, lesson: c.slug, title: c.title });
      if (c.completedAt) timeline.push({ kind: "completed", at: c.completedAt, week: c.week, lesson: c.slug, title: c.title });
    });
  timeline.push({ kind: "note", at: ago(2 * DAY), week: map[0].key, lesson: map[0].cells[1].slug, title: map[0].cells[1].title, text: "Load balancers: L4 vs L7. L7 can route on path/header, costs more CPU." });
  timeline.push({ kind: "event", at: ago(3 * HOUR), name: "stage_done", title: row.position?.title || "", detail: "Stage part-2 (3/6)" });
  timeline.sort((a, b) => b.at.localeCompare(a.at));
  const qs = Array.from({ length: Math.min(40, row.mcq.answered) }, (_, n) => {
    const ok = r() < (row.mcq.pct || 0) / 100;
    return { n: n + 1, part: 1 + Math.floor(n / 25), text: `Sample question ${n + 1}: which approach keeps p99 latency bounded when a downstream dependency slows down?`, picked: ok ? "B" : "C", correct: "B", ok };
  });
  const parts = [1, 2].map((p) => {
    const q = qs.filter((x) => x.part === p);
    const correct = q.filter((x) => x.ok).length;
    return { n: p, title: p === 1 ? "Building Blocks" : "Estimation", total: 25, answered: q.length, correct, passed: correct / 25 >= 0.8 };
  });
  return {
    generatedAt: new Date().toISOString(),
    tz: "Asia/Kolkata",
    learner: row,
    resume: row.position
      ? { week: row.position.week, lesson: row.position.lesson, title: row.position.title, tag: row.position.tag, href: row.position.href, stageLabel: row.position.stageLabel, reason: "Unfinished lesson they were last in" }
      : { week: map[0].key, lesson: map[0].cells[0].slug, title: map[0].cells[0].title, tag: "W00 · PART 1", href: map[0].cells[0].href, stageLabel: null, reason: "Start of the course" },
    map,
    sideQuests,
    calendar,
    timeline,
    mcq: qs.length
      ? [{ assessmentId: "a1", week: "week-00-foundations", slug: "week-00-mcq-assessment", title: "Week 0 Foundations - MCQ Assessment", total: 120, answered: qs.length, correct: qs.filter((x) => x.ok).length, lastAt: ago(4 * DAY), parts, questions: qs }]
      : [],
    trials: [],
    notes: Array.from({ length: row.notes }, (_, n) => ({ id: `n${n}`, week: map[0].key, lesson: map[0].cells[n % 6].slug, title: map[0].cells[n % 6].title, text: ["Consistent hashing: adding a node moves ~1/N keys.", "Little's law: L = λW. Queue depth tells you latency.", "Write-through vs write-back: durability vs latency."][n % 3], createdAt: ago((n + 1) * 2.3 * DAY) })),
    bookmarks: Array.from({ length: row.bookmarks }, (_, n) => ({ id: `b${n}`, week: map[1].key, lesson: map[1].cells[n % 5].slug, title: map[1].cells[n % 5].title, text: "Hot partition example", createdAt: ago((n + 1) * 3 * DAY) })),
    comments: [],
    devices: [
      { label: `${row.device} · Chrome`, n: 120 },
      { label: "mobile · iOS · Safari", n: 22 },
    ],
    locations: [
      { label: `${row.city}, ${row.country}`, n: 128 },
      { label: "Mumbai, IN", n: 14 },
    ],
    firstVisit: { at: row.signedUpAt!, path: "/stories/the-cache-that-lied", referrer: "linkedin.com", utm: null, device: row.device, country: row.country, city: row.city },
    streakDays: Array.from({ length: Math.min(6, done) }, (_, n) => ({ d: dayKey(Date.now() - n * 2 * DAY), lessons: 1, timeSec: 2400 })),
    game: null,
    features: { stageColumns: false, gameColumns: false, trialAttempts: false, reviewCards: false, learnEvents: true, pageLeave: true },
  };
}

function course(u: URL): CourseAnalytics {
  const range = (u.searchParams.get("range") || "30d") as CourseAnalytics["range"];
  const lessons = [
    ...ORDERED.map((o, i) => ({ o, i, core: true })),
    ...COURSE.sq.map((n, j) => ({ o: { week: "bonus-problems", weekCode: "SQ", n }, i: ORDERED.length + j, core: false })),
  ].map(({ o, i, core }) => {
    const r = rng(i + 5);
    const opened = core ? Math.max(0, Math.round(14 * Math.pow(0.86, i) + (o.n[1] === "B" ? -1 : 0) + r() * 1.5)) : Math.round(r() * 4);
    const reached50 = Math.round(opened * (0.55 + r() * 0.25));
    const completed = Math.round(reached50 * (0.6 + r() * 0.3));
    return {
      week: o.week,
      slug: o.n[0],
      title: o.n[2],
      tag: o.n[3],
      weekCode: o.weekCode,
      order: i,
      core,
      href: `/learn/system-design-mastery/${o.week}/${o.n[0]}`,
      opened,
      reached50,
      completed,
      completionRate: opened ? Math.round((completed / opened) * 1000) / 10 : 0,
      medianTimeSec: opened ? Math.round(o.n[4] * 60 * (0.5 + r() * 0.5)) : 0,
      avgPct: opened ? Math.round(45 + r() * 45) : 0,
      guests: Math.round(opened * (1.5 + r() * 2)),
      views: Math.round(opened * (3 + r() * 3)),
      notes: Math.floor(r() * 4),
      comments: Math.floor(r() * 2),
      bookmarks: Math.floor(r() * 3),
    };
  });
  const r = rng(77);
  return {
    generatedAt: new Date().toISOString(),
    tz: "Asia/Kolkata",
    range,
    lessons,
    weeks: COURSE.weeks.map(([key, code, title, nodes], i) => ({ key, code, title, nodes: nodes.length, started: Math.max(0, 12 - i * 2), cleared: Math.max(0, 5 - i), avgPct: Math.max(0, Math.round(72 - i * 7 + r() * 6)) })),
    hardest: [
      { week: "week-01-data-at-scale", title: "Week 1 Data at Scale - MCQ Assessment", n: 37, text: "A table is range-partitioned by created_at. Which query pattern creates a hot partition during a flash sale?", answered: 9, correct: 2, pct: 22.2, topWrong: "A) Point reads by primary key" },
      { week: "week-00-foundations", title: "Week 0 Foundations - MCQ Assessment", n: 64, text: "With 3 replicas, W=2, R=2, which failure still allows a stale read?", answered: 11, correct: 4, pct: 36.4, topWrong: "D) None, quorum overlap prevents it" },
      { week: "week-02-failure-first-design", title: "Week 2 Failure-First Design - MCQ Assessment", n: 12, text: "Why do retries with no jitter make an outage worse?", answered: 7, correct: 3, pct: 42.9, topWrong: "B) They exceed the timeout budget" },
    ],
    heatmap: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => Math.max(0, Math.round((h >= 20 || h <= 1 ? 6 : h >= 9 && h <= 12 ? 3 : 1) * (d >= 5 ? 1.6 : 1) * r() * 2 - 0.4)))),
    stageEvents: true,
    learners: ROWS.length,
  };
}

function stages(u: URL): StageDropoff {
  const week = u.searchParams.get("week") || "";
  const lesson = u.searchParams.get("lesson") || "";
  const t = ORDERED.find((o) => o.week === week && o.n[0] === lesson);
  const base = 14;
  return {
    week,
    lesson,
    title: t?.n[2] || lesson,
    source: "events",
    stages: STAGES.map((label, i) => ({ id: `s${i}`, label, title: STAGE_TITLES[i], minutes: 6 + ((i * 7) % 11), reached: Math.round(base * Math.pow(0.8, i) - (i === 3 ? 3 : 0)), done: Math.min(Math.round(base * Math.pow(0.8, i) - (i === 3 ? 3 : 0)), Math.round(base * Math.pow(0.8, i + 1))) })),
  };
}

/** GET resolver for learner/course admin endpoints; undefined = not ours. */
export function resolveLearnFixture(u: URL): unknown {
  const p = u.pathname;
  if (p === "/api/admin/learners") return learners(u);
  if (p === "/api/admin/course") return course(u);
  if (p === "/api/admin/course/stages") return stages(u);
  const m = p.match(/^\/api\/admin\/learners\/([^/]+)$/);
  if (m && m[1] !== "summary") return detail(decodeURIComponent(m[1]));
  return undefined;
}

/** Text endpoints (exports). */
export function resolveLearnFixtureText(u: URL): string | undefined {
  const m = u.pathname.match(/^\/api\/admin\/learners\/([^/]+)\/export$/);
  if (!m) return undefined;
  const d = detail(decodeURIComponent(m[1]));
  if (u.searchParams.get("format") === "csv")
    return ["week,lesson,status,pct", ...(d?.map.flatMap((w) => w.cells) || []).map((c) => `${c.week},${c.slug},${c.status},${c.pct}`)].join("\n");
  return JSON.stringify(d, null, 2);
}
