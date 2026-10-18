/**
 * Six ready-to-schedule Design of the week challenges, each grounded in the lessons that teach
 * what it tests. The admin picks one, picks a Monday, and gets a draft with the weekly schedule.
 */
import type { ChallengeInput } from "./core";

export type ChallengeTemplate = Pick<ChallengeInput, "slug" | "title" | "summary" | "briefMd" | "constraints" | "rubric" | "relatedLessons">;

const DELIVER = `## What to submit

Write it like the whiteboard half of an interview, in markdown:

1. **Requirements** you'd confirm first (functional and non-functional), and what you'd leave out.
2. **Estimates**: the back-of-the-envelope numbers that drive the design (QPS, storage, bandwidth).
3. **API and data model**: the few calls and tables/keys that matter.
4. **High-level design** as at least one Mermaid diagram.
5. **Deep dives** on the two hardest parts, with the failure modes and how you contain them.
6. **Trade-offs**: what you chose, what you gave up, and what would make you change your mind.

Keep it under ~2,500 words. Diagrams beat paragraphs.`;

export const TEMPLATES: ChallengeTemplate[] = [
  {
    slug: "url-shortener-10b-links",
    title: "Design a URL shortener for 10B links",
    summary: "Short codes for 10 billion links, redirects in single-digit milliseconds, and a marketing campaign that turns one link into a hot key.",
    briefMd: `A messaging app wants its own link shortener. Every link shared in chats goes through it, so the read side dwarfs the write side, and a single viral link can take a large share of all traffic for an hour.

You own the service end to end: code generation, storage, redirects and click analytics.

## The traffic

- 10 billion links stored over five years; 40 million new links a day at launch.
- Redirects: 200,000 a second on a normal evening, peaking at 1.2 million a second during a festival sale.
- One campaign link once took 8% of all redirects for 40 minutes.
- Click counts per link must be visible to the link owner within a minute.

## The hard parts

- Short codes that never collide, without a single counter becoming the bottleneck.
- Partitioning 10B rows so a redirect is one lookup, and so growth doesn't mean a painful reshard.
- A hot key that would melt one shard and one cache node.
- Counting clicks without putting a write on the redirect path.

${DELIVER}`,
    constraints: [
      "p99 redirect latency under 20 ms inside India",
      "7-character codes, case-sensitive alphanumerics",
      "Links can expire; expired links answer 410, not 404",
      "Redirects stay up even if analytics is down",
      "No single region failure takes redirects down",
    ],
    rubric: [
      "Estimates are explicit and drive real decisions (storage, cache size, shard count)",
      "Code generation avoids collisions and a central bottleneck, with the trade-off stated",
      "Partitioning scheme and the plan for growth / resharding",
      "Hot-key handling that actually works for one viral link",
      "Analytics kept off the redirect path, with a freshness story",
      "Failure modes named, with what users see while they happen",
    ],
    relatedLessons: [
      "week-01-data-at-scale/capstone-interview-week-1-url-shortner-at-scale",
      "week-01-data-at-scale/day-01-partitioning-deep-dive",
      "week-01-data-at-scale/day-04-hot-keys-and-skew",
      "week-04-caching/day-01-caching-patterns",
      "week-00-foundations/foundations-part-3-back-of-the-envelope-estimation",
    ],
  },
  {
    slug: "cricket-final-notification-fan-out",
    title: "Design a notification fan-out for a cricket final",
    summary: "The last over of a World Cup final: 120 million phones need the wicket alert before the replay finishes.",
    briefMd: `A sports app has 120 million installs across India. During a World Cup final, every wicket, boundary in the last five overs and the result go out as push notifications. Followers of the match, of either team and of individual players all get alerts, and many users match several of those follow rules.

Today's system sends from a single queue and takes nine minutes to reach everyone. By then the replay is old news, and users uninstall.

## The traffic

- 120M devices; 70M opted in for this match; 25M of them follow at least one player.
- A wicket alert should reach 95% of opted-in devices within 30 seconds.
- Up to 40 alerts in the final hour, sometimes two within 10 seconds (wicket, then a review).
- Push providers (FCM, APNs) throttle per sender and answer with errors under load.

## The hard parts

- Fan-out to 70M recipients without a thundering herd on your own databases.
- Deduplication: one person following the match, the team and the bowler gets one alert, not three.
- Ordering and staleness: never deliver "WICKET" after "Review: NOT OUT".
- Backpressure from the push providers, retries and dead letters.

${DELIVER}`,
    constraints: [
      "95% of opted-in devices within 30 seconds of the event",
      "At most one alert per device per event",
      "Superseded alerts (overturned review) must not be delivered late",
      "Respect quiet hours and per-user frequency caps outside match alerts",
      "Push provider quotas are fixed; you can't buy more for the night",
    ],
    rubric: [
      "Fan-out strategy (precomputed audiences vs. at send time) chosen with numbers",
      "Dedup and per-user caps, and where they're enforced",
      "Handling superseded / out-of-order events",
      "Backpressure, retry with jitter, and dead-letter handling against provider limits",
      "Capacity plan for the final hour, including the warm-up",
      "Observability: how you'd know at minute two that you're missing the 30 s target",
    ],
    relatedLessons: [
      "week-06-designing-notification-platform/day-01-notification-platform-design",
      "week-06-designing-notification-platform/day-04-scale-reliability-edge-cases",
      "week-03-messaging-and-async-processing/day-03-backpressure-and-flow-control",
      "week-03-messaging-and-async-processing/day-04-dead-letters-and-poison-pills",
      "week-04-caching/day-03-thundering-herd",
    ],
  },
  {
    slug: "upi-rate-limiter-service",
    title: "Design a rate limiter service for UPI",
    summary: "A shared rate limiter in front of a UPI switch: per-user, per-VPA and per-bank limits at 15,000 transactions a second, with a 2 ms budget.",
    briefMd: `A payments company runs a UPI switch that every app on its platform calls. Fraud rings test stolen credentials by firing thousands of small collect requests, and one partner bank's outage once caused a retry storm that took the switch down.

Build the rate limiter every service in the payment path calls before doing any work.

## The traffic

- 15,000 transactions a second on a normal day; 40,000 at the salary-day peak.
- Limits at several levels at once: per user, per VPA, per device, per merchant, per partner bank.
- Rules change during an incident (an ops engineer tightens a bank's limit in seconds).
- The limiter's budget is 2 ms at p99, inside a payment that must finish in under 30 s.

## The hard parts

- Accurate counting across many limiter nodes without a network hop to one central counter.
- Choosing an algorithm (fixed window, sliding log, sliding window, token bucket) per rule.
- What happens when the limiter itself is slow or down: fail open or fail closed, per rule.
- Shielding a struggling partner bank from your own retries.

${DELIVER}`,
    constraints: [
      "2 ms p99 added latency",
      "Rules editable at runtime, applied everywhere within 10 seconds",
      "Fraud limits must never fail open; capacity limits may",
      "A partner bank outage must not become a retry storm",
      "Every rejection is explainable later (which rule, which counter)",
    ],
    rubric: [
      "Algorithm choice per rule type, with accuracy vs. cost spelled out",
      "Distributed counting design (local + global, sync interval, error bounds)",
      "Fail-open vs. fail-closed policy per rule, and why",
      "Dynamic rule rollout and safe defaults",
      "Retry storms and partner-bank protection (backoff, circuit breaking, budgets)",
      "Hot keys (one merchant, one bank) and how counters are partitioned",
    ],
    relatedLessons: [
      "week-01-data-at-scale/day-03-rate-limiting-at-scale",
      "week-02-failure-first-design/day-01-timeout-hell",
      "week-02-failure-first-design/day-03-circuit-breakers",
      "week-09-multi-tanency-security/day-02-noisy-neighbour",
      "bonus-problems/bonus-01-indian-upi-system",
    ],
  },
  {
    slug: "leaderboard-50m-players",
    title: "Design a leaderboard for 50M players",
    summary: "Global, friends and city leaderboards for a mobile game with 50 million players, updated live during a weekend tournament.",
    briefMd: `A mobile quiz game has 50 million registered players and runs a weekend tournament every week. Players want to see their global rank, their rank among friends and their rank in their city, all updating as they play.

The current design runs \`ORDER BY score DESC\` on a single database. It worked at 2 million players.

## The traffic

- 50M players; 6M play during a tournament weekend; 800,000 concurrently at peak.
- 120,000 score updates a second at peak; scores only go up during a tournament.
- Top-100 global board is read by everyone who opens the app (about 400,000 reads a second).
- "My rank" for any player within a few seconds of their last game, even at rank 31,402,118.

## The hard parts

- Exact ranks for the top, approximate-but-honest ranks for the long tail.
- Friends boards for players with 5,000 friends, and cities with 3M players.
- Resets at the end of each tournament, and keeping last week's final standings.
- Cheaters posting impossible scores.

${DELIVER}`,
    constraints: [
      "Top 1,000 ranks are exact and fresh within 2 seconds",
      "Any player's own rank within 5 seconds of a game",
      "Tournament reset happens at Monday 00:00 IST without downtime",
      "Final standings are kept forever and are reproducible",
      "Suspicious scores can be held back from the board",
    ],
    rubric: [
      "Data structures for ranking (sorted sets, buckets, sketches) and where each is used",
      "Sharding the board without losing global order",
      "Exact vs. approximate ranks, and how you explain it to players",
      "Friends and city boards without fan-out explosions",
      "Reset, snapshot and replay of final standings",
      "Anti-cheat hook that doesn't slow honest updates",
    ],
    relatedLessons: [
      "week-01-data-at-scale/day-04-hot-keys-and-skew",
      "week-01-data-at-scale/day-01-partitioning-deep-dive",
      "week-04-caching/day-04-feed-caching",
      "week-05-consistency-and-coordination/capstone-interview-week-5-multiplayer-game-matchmaking-system",
      "week-08-designing-analytics-pipeline/day-02-streaming-vs-batch",
    ],
  },
  {
    slug: "idempotent-payment-webhook-receiver",
    title: "Design an idempotent payment webhook receiver",
    summary: "Payment gateways retry, reorder and duplicate webhooks. Credit every order exactly once anyway.",
    briefMd: `An e-commerce company takes payments through three gateways. Each one tells you about payment outcomes with webhooks: \`payment.authorized\`, \`payment.captured\`, \`payment.failed\`, \`refund.processed\` and more.

Last festival sale, a gateway retried a batch of webhooks after a timeout on your side. 3,000 orders were marked paid twice, inventory was released for orders that were in fact paid, and finance spent a week reconciling.

## The traffic

- 2,000 webhooks a second at the sale peak, 50 a second on a quiet night.
- Gateways retry for up to 72 hours with their own backoff; they may send the same event many times and out of order (\`captured\` before \`authorized\`).
- Each gateway signs payloads differently; one rotates its signing key without notice.
- The order service is slow under load (p99 1.8 s) and sometimes down.

## The hard parts

- Exactly-once effects on top of at-least-once, out-of-order delivery.
- Acknowledging fast enough that gateways don't retry, without losing events.
- A state machine for each payment that rejects impossible transitions.
- Reconciliation: proving every rupee was accounted for at the end of the day.

${DELIVER}`,
    constraints: [
      "Acknowledge every valid webhook within 2 seconds",
      "No order is credited twice, even across gateways",
      "Out-of-order events converge to the right final state",
      "Unverifiable payloads are rejected but kept for investigation",
      "Daily reconciliation against each gateway's settlement report",
    ],
    rubric: [
      "Idempotency keys: what they are per gateway, where they're stored, how long",
      "Fast ack + durable handoff (outbox / queue) and why it can't lose events",
      "Payment state machine with explicit handling of out-of-order events",
      "Signature verification and key rotation",
      "Poison messages, dead letters and replay",
      "Reconciliation design and what an on-call engineer does with a mismatch",
    ],
    relatedLessons: [
      "week-02-failure-first-design/day-02-idempotency-in-practice",
      "week-02-failure-first-design/day-04-webhook-delivery",
      "week-03-messaging-and-async-processing/day-02-transactional-outbox",
      "week-03-messaging-and-async-processing/day-04-dead-letters-and-poison-pills",
      "bonus-problems/bonus-04-visa-mastercard-payments",
    ],
  },
  {
    slug: "live-comments-25m-viewers",
    title: "Design live comments for a 25M-viewer stream",
    summary: "25 million people watching one stream, a comment box under it, and a moment when everyone types at once.",
    briefMd: `A streaming platform shows live cricket with a comments panel under the video. On a big match night 25 million people watch the same stream; when a six is hit, hundreds of thousands of people comment within seconds.

Nobody can read 50,000 comments a second, so the product is not "deliver every comment to everyone". It is "make the panel feel alive and relevant, and never let it slow the video".

## The traffic

- 25M concurrent viewers on one stream; 3M with the comments panel open.
- 8,000 comments a second normally, 60,000 a second for ~20 seconds after a big moment.
- Comments must be moderated (abuse, spam links, banned words) before most viewers see them.
- Viewers on 2G-class connections in small towns must not lose the video because of comments.

## The hard parts

- Fan-out of a firehose to 3M open panels: what each viewer actually receives.
- Connection management at this scale (WebSockets, SSE or polling) and reconnect storms.
- Moderation inside a latency budget, and what happens when it lags.
- Sampling, ranking or bucketing so the panel reads well at 60,000 comments a second.

${DELIVER}`,
    constraints: [
      "A posted comment is visible to its author instantly and to others within 3 seconds",
      "Comments never compete with video for the viewer's bandwidth",
      "Moderation runs before broad distribution",
      "A reconnect storm after a network blip must not take the service down",
      "Per-user posting limits; banned users are silenced across all streams",
    ],
    rubric: [
      "Clear product decision on what each viewer receives (sampling / ranking / rooms)",
      "Connection layer design and the reconnect-storm story",
      "Fan-out topology with numbers (edge nodes, messages per second per node)",
      "Moderation pipeline and its failure mode",
      "Backpressure and graceful degradation on slow clients",
      "Hot-moment capacity plan and how it's tested before match night",
    ],
    relatedLessons: [
      "week-03-messaging-and-async-processing/day-03-backpressure-and-flow-control",
      "week-04-caching/day-03-thundering-herd",
      "week-06-designing-notification-platform/day-04-scale-reliability-edge-cases",
      "week-10-production-readiness-and-operational-excellence/day-04-capacity-planning",
      "bonus-problems/bonus-02-whatsapp-messaging",
    ],
  },
];

export const templateBySlug = (slug: string) => TEMPLATES.find((t) => t.slug === slug) || null;
