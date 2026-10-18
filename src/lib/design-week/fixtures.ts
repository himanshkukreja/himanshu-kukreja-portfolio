/**
 * DEV QA ONLY: an in-memory Design of the week (read by ./store.ts when NODE_ENV !== "production"
 * AND DOW_FIXTURES=1). Never the database. Times are relative to the first request, so phases are
 * stable for a QA session:
 *   two closed weeks (winners featured), the current week with submissions open, next week's
 *   challenge scheduled, one draft. Flip the current week to voting from /admin?preview=1.
 * Learner personas sign in with `Bearer fixture.<id>` (the dev persona bar on /learn/design-week):
 *   fx-ada     eligible learner with no submission yet (the QA "you")
 *   fx-newbie  account an hour old, no lessons: can't vote yet
 *   fx-grace / fx-linus / fx-margaret share profiles (full name / first name / handle only)
 *   fx-alan    doesn't share (anonymous learner); fx-katherine shares but hides it per design
 * Emails are never stored; nothing here is a real person's data.
 */
import type { AuthorSource, Challenge, ChallengeInput, DowStore, Report, Standing, Submission, VoteResult } from "./core";
import { DowError, phaseOf } from "./core";
import { TEMPLATES } from "./templates";

const DAY = 86_400_000;
const HOUR = 3_600_000;

type Persona = { id: string; name: string; handle: string | null; nameMode: "full" | "first" | "none"; createdDaysAgo: number; lessons: number };

export const PERSONAS: Persona[] = [
  { id: "fx-ada", name: "Ada Lovelace", handle: null, nameMode: "first", createdDaysAgo: 60, lessons: 6 },
  { id: "fx-newbie", name: "New Learner", handle: null, nameMode: "first", createdDaysAgo: 0, lessons: 0 },
  { id: "fx-grace", name: "Grace Hopper", handle: "grace-h", nameMode: "full", createdDaysAgo: 120, lessons: 31 },
  { id: "fx-linus", name: "Linus Torvalds", handle: "linus-t", nameMode: "first", createdDaysAgo: 90, lessons: 18 },
  { id: "fx-margaret", name: "Margaret Hamilton", handle: "margaret-h", nameMode: "none", createdDaysAgo: 80, lessons: 22 },
  { id: "fx-alan", name: "Alan Turing", handle: null, nameMode: "full", createdDaysAgo: 70, lessons: 12 },
  { id: "fx-katherine", name: "Katherine Johnson", handle: "katherine-j", nameMode: "full", createdDaysAgo: 50, lessons: 9 },
  { id: "fx-spam", name: "Spam Bot", handle: null, nameMode: "none", createdDaysAgo: 4, lessons: 0 },
];

type Db = { challenges: Challenge[]; subs: Submission[]; votes: { challengeId: string; submissionId: string; userId: string; at: string }[]; reports: Report[]; seq: number };
const g = globalThis as typeof globalThis & { __hkDowFx?: Db };

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const isoAgo = (ms: number, base: number) => new Date(base - ms).toISOString();

/* ------------------------------------------------------------------ bodies */

const GRACE_URL = `## Requirements

- **Create**: \`POST /links {url, expiresAt?}\` → 7-char code. **Redirect**: \`GET /{code}\` → 301/302.
- Non-functional: p99 redirect < 20 ms in India, 99.99% for redirects, analytics may lag a minute.
- Out of scope: custom vanity codes, link previews.

## Estimates

| | |
|---|---|
| New links | 40M/day ≈ **460/s** avg, 2k/s peak |
| Redirects | 200k/s evening, **1.2M/s** festival peak |
| Storage | 10B × ~500 B ≈ **5 TB** + replicas |
| Hot set | top 1% of links ≈ 90% of clicks → **50 GB** cache |

## High-level design

\`\`\`mermaid
%% title: Redirect path and code minting
flowchart TD
  U@{ icon: "sd:users", label: "Chat users" } --> CDN@{ icon: "sd:cdn", label: "Edge · 301 cache" }
  CDN --> LB@{ icon: "sd:load-balancer", label: "L7 load balancer" }
  LB --> R["Redirect service"]:::core
  R --> C@{ icon: "tech:redis", label: "Redis · hot codes" }
  R --> DB@{ icon: "sd:database", label: "Links · 256 shards by code" }
  R -. "click event" .-> K@{ icon: "tech:kafka", label: "Kafka · clicks" }
  K --> AGG["Click counters · 1 min windows"]
  W["Create API"] --> RANGE["Range allocator · 1M codes per lease"]
  W --> DB
  class U client
  class CDN,LB edge
  class C cache
  class DB store
  class K queue
\`\`\`

## Deep dive 1: codes without a central counter

Each create server leases a **range of 1M ids** from a tiny allocator (a single row with a compare-and-set), then encodes \`id\` with a keyed permutation + base62 so codes look random. A lease lasts about 30 minutes at peak, so the allocator sees ~50 calls an hour. Losing a server loses at most its unused range, which is fine: 62⁷ ≈ 3.5 trillion codes.

## Deep dive 2: the 8% hot link

- The edge caches the 301 for popular codes (\`Cache-Control: max-age=300\`); 8% of 1.2M/s = 96k/s mostly never reaches us.
- Behind the edge, Redis keeps hot codes **replicated to every cache node** (key \`code#n\` with n in 0..7, the reader picks one at random) so one shard never takes the whole spike.
- Clicks are counted from the edge logs + Kafka, never on the redirect path.

## Trade-offs

- 301 at the edge means a deleted link can live for up to 5 minutes. Acceptable; abuse takedowns purge the edge explicitly.
- Range leasing makes codes roughly time-ordered internally; the permutation hides that from users.
`;

const LINUS_URL = `## Approach

Hash-free: a **Snowflake-style 42-bit id** (timestamp + worker + sequence) encoded as base62 gives 7 characters for decades. No coordination on the write path beyond assigning worker ids at boot from ZooKeeper.

## Storage

Cassandra with \`code\` as partition key: one partition per link, one read per redirect, and adding nodes doesn't need a manual reshard. RF=3, LOCAL_QUORUM writes, LOCAL_ONE reads (a just-created link may miss for a few ms; the create response already returned the code, so the user rarely clicks that fast).

\`\`\`mermaid
%% title: Write and read paths
flowchart LR
  A["Create API"] --> ID["Snowflake id → base62"]
  ID --> CS@{ icon: "tech:cassandra", label: "Cassandra · code → url" }
  B["Redirect"] --> L1["In-process LRU · 10k codes"]
  L1 --> RC@{ icon: "tech:redis", label: "Redis cluster" }
  RC --> CS
  class CS store
  class RC cache
\`\`\`

## Hot keys

A per-process LRU in front of Redis absorbs the viral link: 400 redirect pods × local hit means Redis sees each hot code once per TTL per pod.

## What I'd change at 10× scale

Move analytics sampling to the edge and keep only 1-in-10 raw click events for links above 1M clicks.
`;

const MARGARET_URL = `## The one decision

Everything follows from **read ≫ write (≈2,600:1 at peak)**. So the design optimises a single key-value lookup and pushes everything else (analytics, expiry, abuse checks) off the redirect path.

- Codes: random 7-char base62, collision check on insert (\`INSERT … IF NOT EXISTS\`); at 10B of 3.5T the collision rate is 0.3%, i.e. one retry in 350 creates.
- Store: DynamoDB-style KV partitioned by code hash; expiry via TTL attribute; expired → 410 from a tombstone kept 30 days.
- Cache: two tiers, local LRU + regional Redis, with request coalescing so a cold viral link triggers one DB read, not thousands.

\`\`\`mermaid
%% title: Request coalescing on a cache miss
sequenceDiagram
  participant P1 as Pod (req 1)
  participant P2 as Pod (req 2..n)
  participant R as Redis
  participant D as KV store
  P1->>R: GET code
  R-->>P1: miss
  P1->>D: read (holds lock)
  P2->>R: GET code
  R-->>P2: miss, lock held
  P2->>P2: wait 5 ms
  D-->>P1: url
  P1->>R: SET code url EX 300
  P2->>R: GET code (hit)
\`\`\`

Failure mode I worry about most: a regional Redis loss. Redirects fall back to the KV store with a token bucket per pod so the store isn't stampeded; p99 degrades to ~40 ms but stays up.
`;

const ALAN_URL = `## Summary

Counter-based codes from a sharded counter (64 shards, each owning a slice of the id space), Postgres partitioned by code prefix, Redis read-through cache, Kafka for clicks.

The weak spot I'd fix next: resharding Postgres means moving whole prefixes; I'd start with 1,024 logical partitions mapped onto 16 physical nodes so a move is a metadata change plus a copy, not a rehash.

I didn't get to a diagram for this one, but the read path is a single cache lookup followed by a single-partition read on a miss, and the click event goes to Kafka asynchronously so analytics never slows the redirect.
`;

const KATHERINE_URL = `## Estimates first

- 1.2M redirects/s × 600 B response ≈ **720 MB/s** egress at peak, mostly absorbed by the edge.
- 40M creates/day × 5 years ≈ 73B? No: the brief says 10B total, so creation slows over time; plan for 10B rows and 2× headroom.
- Cache: 10B × 1% hot × 500 B ≈ 50 GB → fits in a 6-node Redis cluster with replicas.

## Design

\`\`\`mermaid
%% title: Components
flowchart TD
  E@{ icon: "sd:cdn", label: "CDN" } --> S["Redirect service"]:::core
  S --> RC@{ icon: "tech:redis", label: "Redis" }
  S --> PG@{ icon: "tech:postgresql", label: "PostgreSQL · 64 partitions" }
  S -.-> Q@{ icon: "sd:queue", label: "Click queue" }
  class E edge
  class RC cache
  class PG store
  class Q queue
\`\`\`

Expiry: a nightly job marks expired links; the redirect service checks \`expires_at\` too, so the job being late never serves an expired link.
`;

const SPAM = `Buy followers cheap!!! Visit our site for the best deals on likes and followers. Limited offer, act now. Best prices guaranteed. Repeat: best prices, best deals, best followers. Contact us today for more information about our amazing services and packages for every budget.`;

const ALAN_UPI = `## Rules as data

Every limit is a rule \`{key: "vpa" | "user" | "device" | "merchant" | "bank", window, limit, algorithm, failMode}\` stored in a config service and pushed to every limiter pod (watch + version number). An ops change reaches all pods in < 5 s.

| Rule | Algorithm | Fail mode |
|---|---|---|
| Collect requests per VPA | sliding window (60 s) | **closed** (fraud) |
| Payments per user | token bucket | closed |
| Calls to a partner bank | concurrency limit + token bucket | open, with a cap |
| Merchant API | fixed window | open |

## Counting without a central hop

\`\`\`mermaid
%% title: Local counting with periodic sync
flowchart LR
  A["Payment API pod"] --> L["Limiter sidecar · local counters"]:::core
  L -- "every 250 ms: deltas" --> RC@{ icon: "tech:redis", label: "Redis cluster · global counters" }
  RC -- "global totals" --> L
  CFG["Rule config service"] -- "watch" --> L
  class RC cache
\`\`\`

Each sidecar enforces \`limit / pods\` locally plus the last global total it saw. Worst-case overshoot is one sync interval of traffic, which I bound per rule: fraud rules use a 50 ms sync instead.

## Partner bank protection

Retries to a bank go through a retry budget (10% of successful calls) and a circuit breaker per bank; when it opens, the switch answers "bank unavailable, try later" in 2 ms instead of piling on.
`;

const GRACE_UPI = `## Requirements I'd confirm

- Limits are evaluated **before** any money moves; a rejected call has no side effects.
- 2 ms p99 is for the limiter call itself, measured at the caller.
- Fraud limits must be exact enough to stop credential stuffing (say ≤ 5% overshoot).

## Design

A Redis cluster with Lua scripts for atomic sliding-window counters (sorted sets per key for the fraud rules, fixed-window counters with interpolation for capacity rules). Clients call it with a 1.5 ms timeout.

\`\`\`mermaid
%% title: Decision path
flowchart TD
  C["Caller"] --> D{"Rule in local cache?"}
  D -- "yes" --> E["Evaluate in Redis (Lua)"]
  D -- "no" --> F["Load rule"] --> E
  E -- "timeout" --> G{"failMode"}
  G -- "closed" --> X["Reject 429"]:::bad
  G -- "open" --> Y["Allow + count locally"]:::ok
  E -- "ok" --> Z["Allow / reject"]
\`\`\`

## Hot keys

A large merchant is one hot key: I split it into 16 sub-keys (\`merchant:42#0..15\`), each with limit/16, and sum them only for reporting.
`;

const LINUS_UPI = `## Token buckets everywhere

Token bucket per (rule, key) in Redis, refilled lazily on read (store tokens + last refill time). One round trip, one Lua script, O(1) memory per key, burst-friendly, and a single algorithm the ops team can reason about.

For the bank side I add an **adaptive concurrency limit** (AIMD on the bank's p99): when the bank slows down, we lower how many calls are in flight instead of waiting for timeouts.

Fail mode is per rule and defaults to closed for anything tagged \`fraud\`.
`;

const KATHERINE_UPI = `## Two layers

1. **Edge layer** (per pod, in memory): cheap fixed windows that stop obvious floods (> 50 requests/s from one device).
2. **Global layer** (Redis): sliding windows for the rules that matter for fraud and money.

The edge layer means a credential-stuffing burst never reaches Redis. The global layer gives exact-enough counts for the rules an auditor will ask about. Every rejection is logged with \`{rule_id, rule_version, key, count, limit}\` to a Kafka topic for later explanation.
`;

const MARGARET_DRAFT = `## Notes (draft)

- token bucket vs sliding window?
- fail open for bank limits, closed for fraud
- TODO diagram
`;

const ALAN_WEBHOOK = `## Fast ack, durable handoff

The receiver does three things and returns 200: verify the signature, insert the raw event into an \`inbox\` table keyed by \`(gateway, event_id)\` (\`ON CONFLICT DO NOTHING\`), and commit. Everything else happens after.

\`\`\`mermaid
%% title: Webhook inbox
flowchart LR
  G@{ icon: "sd:bank", label: "Payment gateway" } --> R["Receiver · verify + insert"]:::core
  R --> I@{ icon: "tech:postgresql", label: "inbox · unique (gateway, event_id)" }
  I --> W["Worker · state machine"]
  W --> O["Order service"]
  W -.-> DLQ@{ icon: "sd:queue", label: "Dead letters" }
  class G external
  class I store
  class DLQ queue
\`\`\`

## The state machine

\`created → authorized → captured → (refunded | partially_refunded)\`, plus \`failed\`. An event that would move a payment backwards is recorded but doesn't change state; \`captured\` arriving before \`authorized\` moves straight to captured (it implies authorization).

## Reconciliation

Nightly: settlement report rows joined against our captured payments by gateway reference; mismatches open a ticket with both rows attached.
`;

const GRACE_WEBHOOK = `## Idempotency key

Per gateway the natural key differs (event id, or payment id + event type + sequence). I normalise to \`gateway:event_key\` and keep it for 7 days (gateways retry for 72 h).

Credit is applied with a conditional update: \`UPDATE orders SET paid_at = now() WHERE id = $1 AND paid_at IS NULL\`. Even if dedup failed, the order can't be credited twice.

\`\`\`mermaid
%% title: Exactly-once effect on at-least-once delivery
sequenceDiagram
  participant G as Gateway
  participant R as Receiver
  participant Q as Queue
  participant O as Orders
  G->>R: webhook (attempt 1)
  R->>Q: enqueue (key)
  R-->>G: 200
  G->>R: webhook (retry)
  R-->>G: 200 (key seen)
  Q->>O: credit if not paid
\`\`\`
`;

/* ------------------------------------------------------------------ seed */

function seed(): Db {
  const now = Date.now();
  const db: Db = { challenges: [], subs: [], votes: [], reports: [], seq: 100 };
  const tpl = (slug: string) => TEMPLATES.find((x) => x.slug === slug)!;
  const challenge = (n: number, slug: string, startsAgo: number, status: Challenge["status"], o: Partial<Challenge> = {}): Challenge => {
    const t = tpl(slug);
    const startsAt = new Date(now - startsAgo).toISOString();
    const sch = { startsAt, submissionsCloseAt: new Date(now - startsAgo + 5 * DAY).toISOString(), endsAt: new Date(now - startsAgo + 7 * DAY).toISOString() };
    return {
      id: uid(n),
      ...t,
      ...sch,
      status,
      maxVotesPerUser: 3,
      showLiveCounts: false,
      featuredSubmissionIds: [],
      winnersAnnouncedAt: null,
      createdAt: isoAgo(startsAgo + 3 * DAY, now),
      updatedAt: isoAgo(Math.max(0, startsAgo - 7 * DAY), now),
      ...o,
    };
  };
  const c0 = challenge(1, "idempotent-payment-webhook-receiver", 16 * DAY, "closed");
  const c1 = challenge(2, "url-shortener-10b-links", 9 * DAY, "closed");
  const c2 = challenge(3, "upi-rate-limiter-service", 2 * DAY, "scheduled");
  const c3 = challenge(4, "leaderboard-50m-players", -5 * DAY, "scheduled");
  const c4 = challenge(5, "live-comments-25m-viewers", -12 * DAY, "draft");
  db.challenges.push(c0, c1, c2, c3, c4);

  let n = 1000;
  const sub = (c: Challenge, userId: string, title: string, bodyMd: string, status: Submission["status"], o: Partial<Submission> = {}): Submission => {
    const at = Date.parse(c.startsAt) + (1 + (n % 4)) * DAY - (n % 7) * HOUR;
    const s: Submission = {
      id: uid(++n),
      challengeId: c.id,
      userId,
      title,
      bodyMd,
      status,
      showAuthor: true,
      voteCount: 0,
      reportCount: 0,
      editCount: 12,
      submittedAt: status === "draft" ? null : new Date(at).toISOString(),
      moderationNote: null,
      moderatedAt: null,
      createdAt: new Date(at - 2 * HOUR).toISOString(),
      updatedAt: new Date(at).toISOString(),
      ...o,
    };
    db.subs.push(s);
    return s;
  };
  const vote = (s: Submission, k: number) => {
    for (let i = 0; i < k; i++) db.votes.push({ challengeId: s.challengeId, submissionId: s.id, userId: `fx-voter-${(i * 7 + s.id.length + k) % 40}-${i}`, at: s.updatedAt });
    s.voteCount += k;
  };

  // two weeks ago: webhooks (winner doesn't share a profile)
  const w1 = sub(c0, "fx-alan", "Inbox table + state machine", ALAN_WEBHOOK, "submitted");
  const w2 = sub(c0, "fx-grace", "Idempotency at three layers", GRACE_WEBHOOK, "submitted");
  vote(w1, 14);
  vote(w2, 11);
  c0.featuredSubmissionIds = [w1.id, w2.id];
  c0.winnersAnnouncedAt = new Date(Date.parse(c0.endsAt) + HOUR).toISOString();

  // last week: URL shortener
  const u1 = sub(c1, "fx-grace", "Leased ranges, edge-cached 301s", GRACE_URL, "submitted");
  const u2 = sub(c1, "fx-linus", "Snowflake ids on Cassandra", LINUS_URL, "submitted");
  const u3 = sub(c1, "fx-margaret", "Read-optimised KV with request coalescing", MARGARET_URL, "submitted");
  const u4 = sub(c1, "fx-alan", "Sharded counters on Postgres", ALAN_URL, "submitted");
  const u5 = sub(c1, "fx-katherine", "Estimates-first shortener", KATHERINE_URL, "submitted", { showAuthor: false });
  const u6 = sub(c1, "fx-spam", "Cheap followers", SPAM, "hidden", { moderationNote: "Hidden automatically after 3 reports, pending review.", reportCount: 3 });
  vote(u1, 12);
  vote(u2, 9);
  vote(u3, 7);
  vote(u4, 3);
  vote(u5, 5);
  c1.featuredSubmissionIds = [u1.id, u2.id, u3.id];
  c1.winnersAnnouncedAt = new Date(Date.parse(c1.endsAt) + 2 * HOUR).toISOString();
  ["fx-grace", "fx-linus", "fx-alan"].forEach((r, i) =>
    db.reports.push({ id: uid(5000 + i), submissionId: u6.id, challengeId: c1.id, reporterId: r, reason: "spam", note: i === 0 ? "Advertising, not a design." : "", status: "open", createdAt: isoAgo((5 - i) * DAY, now), resolvedAt: null })
  );

  // this week: UPI rate limiter, submissions open
  sub(c2, "fx-alan", "Rules as data, local counters with sync", ALAN_UPI, "submitted");
  sub(c2, "fx-grace", "Redis + Lua sliding windows, fail modes per rule", GRACE_UPI, "submitted");
  sub(c2, "fx-linus", "Token buckets and adaptive concurrency", LINUS_UPI, "submitted");
  sub(c2, "fx-katherine", "Two layers: edge floods, global fraud", KATHERINE_UPI, "submitted");
  sub(c2, "fx-margaret", "", MARGARET_DRAFT, "draft");
  return db;
}

function db(): Db {
  if (!g.__hkDowFx) g.__hkDowFx = seed();
  return g.__hkDowFx;
}

/** Reset (dev only): the QA script calls it between runs. */
export function resetFixtures() {
  g.__hkDowFx = seed();
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const nowIso = () => new Date().toISOString();

let store: DowStore | null = null;

export function fixtureStore(): DowStore {
  if (process.env.NODE_ENV === "production") throw new Error("design-week fixtures are dev-only");
  return (store ||= {
    kind: "fixtures",
    async ready() {
      return { ready: true, missing: [] };
    },
    async listChallenges() {
      return clone([...db().challenges].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)));
    },
    async getChallenge(id) {
      const c = db().challenges.find((x) => x.id === id);
      return c ? clone(c) : null;
    },
    async getChallengeBySlug(slug) {
      const c = db().challenges.find((x) => x.slug === slug);
      return c ? clone(c) : null;
    },
    async insertChallenge(c: ChallengeInput) {
      const d = db();
      if (d.challenges.some((x) => x.slug === c.slug)) throw new DowError(409, "conflict", "A challenge with that slug already exists.", { slug: "Slug is taken." });
      const row: Challenge = { ...c, id: uid(++d.seq), featuredSubmissionIds: [], winnersAnnouncedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
      d.challenges.push(row);
      return clone(row);
    },
    async updateChallenge(id, patch) {
      const d = db();
      const c = d.challenges.find((x) => x.id === id);
      if (!c) return null;
      if (patch.slug && d.challenges.some((x) => x.slug === patch.slug && x.id !== id)) throw new DowError(409, "conflict", "A challenge with that slug already exists.", { slug: "Slug is taken." });
      Object.assign(c, patch, { updatedAt: nowIso() });
      return clone(c);
    },
    async deleteChallenge(id) {
      const d = db();
      d.challenges = d.challenges.filter((x) => x.id !== id);
      d.subs = d.subs.filter((x) => x.challengeId !== id);
      d.votes = d.votes.filter((x) => x.challengeId !== id);
      d.reports = d.reports.filter((x) => x.challengeId !== id);
    },
    async listSubmissions(challengeId, statuses) {
      return clone(db().subs.filter((s) => (!challengeId || s.challengeId === challengeId) && (!statuses?.length || statuses.includes(s.status))));
    },
    async listSubmissionsByUser(userId) {
      return clone(db().subs.filter((s) => s.userId === userId));
    },
    async getSubmission(id) {
      const s = db().subs.find((x) => x.id === id);
      return s ? clone(s) : null;
    },
    async getUserSubmission(challengeId, userId) {
      const s = db().subs.find((x) => x.challengeId === challengeId && x.userId === userId);
      return s ? clone(s) : null;
    },
    async insertSubmission(x) {
      const d = db();
      if (d.subs.some((s) => s.challengeId === x.challengeId && s.userId === x.userId)) throw new DowError(409, "conflict", "You already have a design for this challenge.");
      const row: Submission = { ...x, id: uid(++d.seq + 20_000), voteCount: 0, reportCount: 0, editCount: 1, moderationNote: null, moderatedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
      d.subs.push(row);
      return clone(row);
    },
    async updateSubmission(id, patch) {
      const s = db().subs.find((x) => x.id === id);
      if (!s) return null;
      const { moderatedBy: _by, ...rest } = patch;
      void _by;
      Object.assign(s, rest, { updatedAt: new Date(Math.max(Date.now(), Date.parse(s.updatedAt) + 1)).toISOString() });
      return clone(s);
    },
    async deleteSubmission(id) {
      const d = db();
      d.subs = d.subs.filter((x) => x.id !== id);
      d.votes = d.votes.filter((x) => x.submissionId !== id);
      d.reports = d.reports.filter((x) => x.submissionId !== id);
    },
    async votesByUser(challengeId, userId) {
      return db()
        .votes.filter((v) => v.challengeId === challengeId && v.userId === userId)
        .map((v) => v.submissionId);
    },
    async addVote(challengeId, submissionId, userId): Promise<VoteResult> {
      // same rules as the trg_dow_votes_guard trigger
      const d = db();
      const s = d.subs.find((x) => x.id === submissionId);
      const c = d.challenges.find((x) => x.id === challengeId);
      if (!s || !c || s.status !== "submitted" || s.challengeId !== challengeId) return "missing";
      if (s.userId === userId) return "own";
      if (phaseOf(c) !== "voting") return "closed";
      if (d.votes.some((v) => v.submissionId === submissionId && v.userId === userId)) return "duplicate";
      if (d.votes.filter((v) => v.challengeId === challengeId && v.userId === userId).length >= c.maxVotesPerUser) return "limit";
      d.votes.push({ challengeId, submissionId, userId, at: nowIso() });
      s.voteCount++;
      return "ok";
    },
    async removeVote(submissionId, userId) {
      const d = db();
      const before = d.votes.length;
      d.votes = d.votes.filter((v) => !(v.submissionId === submissionId && v.userId === userId));
      const removed = before !== d.votes.length;
      const s = d.subs.find((x) => x.id === submissionId);
      if (removed && s) s.voteCount = Math.max(0, s.voteCount - 1);
      return removed;
    },
    async voteTotals(challengeId) {
      const vs = db().votes.filter((v) => !challengeId || v.challengeId === challengeId);
      const by: Record<string, { votes: number; voters: Set<string> }> = {};
      vs.forEach((v) => {
        (by[v.challengeId] ||= { votes: 0, voters: new Set() }).votes++;
        by[v.challengeId].voters.add(v.userId);
      });
      return {
        votes: vs.length,
        voters: new Set(vs.map((v) => v.userId)).size,
        byChallenge: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { votes: v.votes, voters: v.voters.size }])),
      };
    },
    async addReport(r) {
      const d = db();
      if (d.reports.some((x) => x.submissionId === r.submissionId && x.reporterId === r.reporterId)) return "duplicate";
      d.reports.push({ ...r, id: uid(++d.seq + 40_000), status: "open", createdAt: nowIso(), resolvedAt: null });
      return "ok";
    },
    async reportsByUserSince(userId, since) {
      return db().reports.filter((r) => r.reporterId === userId && r.createdAt >= since).length;
    },
    async listReports(f) {
      return clone(
        db()
          .reports.filter((r) => (!f.status || r.status === f.status) && (!f.challengeId || r.challengeId === f.challengeId) && (!f.submissionId || r.submissionId === f.submissionId))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    },
    async resolveReports(ids, status) {
      db().reports.forEach((r) => {
        if (ids.includes(r.id)) Object.assign(r, { status, resolvedAt: nowIso() });
      });
    },
    async standing(userId): Promise<Standing> {
      const p = PERSONAS.find((x) => x.id === userId);
      const days = p ? p.createdDaysAgo : 30;
      return { accountCreatedAt: new Date(Date.now() - (days ? days * DAY : HOUR)).toISOString(), lessonsCompleted: p ? p.lessons : 3 };
    },
    async authors(userIds) {
      const out: Record<string, AuthorSource> = {};
      userIds.forEach((id) => {
        const p = PERSONAS.find((x) => x.id === id);
        out[id] = {
          share: p?.handle ? { enabled: true, handle: p.handle, visibility: { name: p.nameMode, avatar: false, progress: true, tree: true, streak: true, scores: true, badges: true, milestones: true }, updatedAt: null } : null,
          fullName: p?.name ?? null,
          avatarUrl: null,
        };
      });
      return out;
    },
  });
}
