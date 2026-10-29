import type { Level } from "./level";
/**
 * Side-quest difficulty, so the site can list quests easiest first.
 *
 * Each quest is rated on what a learner must handle, not on how famous the product is:
 * - how many core ideas it combines, and how deep (caching, sharding, queues, quorums,
 *   exactly-once, ML pipelines, real-time media, cross-company protocols, ...);
 * - consistency demands (money, inventory and order matching beat feeds and caches);
 * - the scale and fan-out tricks it needs;
 * - the course weeks it builds on (later weeks = harder);
 * - the failure and edge-case depth of its final challenge.
 *
 * `level` is 1 (Starter) to 5 (Expert). `rank` is a total order across all quests,
 * 1 = easiest of all; levels are contiguous bands of ranks.
 *
 * A new quest needs an entry here (key = its file name without `.md`, case kept, e.g.
 * "bonus-08-AWS-S3"). Until it has one, `questDifficulty` rates it Medium and sorts it last.
 */

export type QuestLevel = 1 | 2 | 3 | 4 | 5;

export interface QuestDifficulty {
  level: QuestLevel;
  rank: number;
  why: string;
}

export const DIFFICULTY_LABEL: Record<QuestLevel, string> = {
  1: "Starter",
  2: "Easy",
  3: "Medium",
  4: "Hard",
  5: "Expert",
};

export const QUEST_DIFFICULTY: Record<string, QuestDifficulty> = {
  // ── Level 1 · Starter: read-heavy classics, caching, CDNs and fan-out ──
  "bonus-10-twitter-x": {
    level: 1,
    rank: 1,
    why: "Push/pull fan-out by follower count, ID-only timeline cache, tombstone deletes",
  },
  "bonus-06-netflix-streaming": {
    level: 1,
    rank: 2,
    why: "Control vs data plane, ISP-embedded CDN fill, client ABR, breakers; live needs coalescing",
  },
  "bonus-07-spotify-streaming": {
    level: 1,
    rank: 3,
    why: "Signed URLs at a CDN, prefetch, async events; play-ID dedup for exactly-once counts",
  },
  "bonus-21-instagram-feed": {
    level: 1,
    rank: 4,
    why: "Media stored once, time-sortable sharded IDs, hybrid fan-out, staged ranking, story TTLs",
  },
  "bonus-05-google-search": {
    level: 1,
    rank: 5,
    why: "Doc-sharded index, 1,000-way fan-out tail latency, async crawl, fresh in-memory tier",
  },
  "bonus-02-whatsapp-messaging": {
    level: 1,
    rank: 6,
    why: "Connection density, delete-on-ACK queue, at-least-once + dedup, E2EE on linked devices",
  },

  // ── Level 2 · Easy: one or two harder ideas on top of the classics ──
  "bonus-19-youtube-video-platform": {
    level: 2,
    rank: 7,
    why: "Resumable uploads, chunked transcode task graph, sharded view counters, verified counts",
  },
  "bonus-03-aadhar-identity-system": {
    level: 2,
    rank: 8,
    why: "1:1 auth vs 1:N biometric dedup, 2-of-3 matcher vote, HSM-only decrypt, offline enrolment",
  },
  "bonus-09-uber": {
    level: 2,
    rank: 9,
    why: "H3 index on soft-state pings, one-at-a-time dispatch, local surge, exactly-once trips",
  },
  "bonus-08-AWS-S3": {
    level: 2,
    rank: 10,
    why: "10+6 erasure coding across AZs, partitioned index, read-after-write witness, fast repair",
  },
  "bonus-01-indian-upi-system": {
    level: 2,
    rank: 11,
    why: "Cross-bank state machine, deemed-success timeouts, one txn ID, per-bank breakers",
  },
  "bonus-04-visa-mastercard-payments": {
    level: 2,
    rank: 12,
    why: "Auth in a tight time budget, issuer stand-in, idempotent retries, netted clearing",
  },

  // ── Level 3 · Medium: contended inventory, marketplaces, specialised serving ──
  "bonus-26-truecaller-caller-id": {
    level: 3,
    rank: 13,
    why: "Precomputed lookups, hot-number copies, trust-weighted crowd spam, private PIR lookups",
  },
  "bonus-17-swiggy-food-delivery": {
    level: 3,
    rank: 14,
    why: "Just-in-time joint rider matching, kitchen saga with timers, calibrated ETA quantiles",
  },
  "bonus-11-irctc-booking-system": {
    level: 3,
    rank: 15,
    why: "One hot seat counter at 280K/s, adaptive waiting room, hold-then-pay saga, bots",
  },
  "bonus-12-blinkit-quick-commerce": {
    level: 3,
    rank: 16,
    why: "Atomic per-store stock holds, H3 store choice, pick queues, rider batching, ETA promise",
  },
  "bonus-16-bookmyshow-seat-booking": {
    level: 3,
    rank: 17,
    why: "All-or-nothing multi-seat holds, partner-owned seats, unknown outcomes, on-sale lottery",
  },
  "bonus-14-chatgpt-llm-serving": {
    level: 3,
    rank: 18,
    why: "Continuous batching, paged KV memory, prefix-affinity routing, tier lanes, stream resume",
  },

  // ── Level 4 · Hard: money ledgers, fencing, OT, routing algorithms, many ideas at once ──
  "bonus-18-razorpay-payment-gateway": {
    level: 4,
    rank: 19,
    why: "Idempotency with request hash, UNKNOWN outcomes + reconciliation, double-entry ledger",
  },
  "bonus-27-flipkart-big-billion-days": {
    level: 4,
    rank: 20,
    why: "Versioned midnight flip, per-deal token queues, expiring stock holds, UNKNOWN payments",
  },
  "bonus-35-fastag-electronic-tolling": {
    level: 4,
    rank: 21,
    why: "Offline lane decisions on signed tags, one txn id end to end, stale-list liability, netting",
  },
  "bonus-34-amazon-prime-day-checkout": {
    level: 4,
    rank: 22,
    why: "Tagged-line cart merges, purchase-id placement, deal sub-counters, cells and shuffle shards",
  },
  "bonus-15-figma-multiplayer": {
    level: 4,
    rank: 23,
    why: "One owner process per file, per-property LWW, fenced journal, fractional index, handoff",
  },
  "bonus-13-zerodha-kite-trading": {
    level: 4,
    rank: 24,
    why: "Orders UNKNOWN until reconciled, partitioned in-memory margin, tick fan-out, Little's law",
  },
  "bonus-28-gmail-email-at-scale": {
    level: 4,
    rank: 25,
    why: "Quorum write before 250 OK, deferral backpressure, spam cascade, DMARC, erasure-coded mail",
  },
  "bonus-24-airbnb-stays-marketplace": {
    level: 4,
    rank: 26,
    why: "Filtered vector retrieval, external iCal calendars, signed quotes, hold-and-payout ledger",
  },
  "bonus-22-google-maps": {
    level: 4,
    rank: 27,
    why: "CRP partition-overlay routing, HMM map matching from probes, time-dependent ETAs",
  },
  "bonus-20-google-docs-collaboration": {
    level: 4,
    rank: 28,
    why: "Server-ordered OT transforms, fenced revision log, composing days of offline edits",
  },

  // ── Level 5 · Expert: real-time media, consensus, ML loops, cross-company and matching ──
  "bonus-31-discord-voice-and-servers": {
    level: 5,
    rank: 29,
    why: "One process per guild with relays, gateway backpressure, lazy member lists, SFU voice",
  },
  "bonus-36-slack-workspace-messaging": {
    level: 5,
    rank: 30,
    why: "Channel-hashed routing, two-hop fan-out, shared-channel tenancy, Kafka-fronted jobs, scoped search",
  },
  "bonus-25-dream11-fantasy-sports": {
    level: 5,
    rank: 31,
    why: "Forecast spike, sharded spot counters, single lock flip, per-ball ranks, keyed ledger",
  },
  "bonus-23-zoom-video-meetings": {
    level: 5,
    rank: 32,
    why: "SFU forwarding, simulcast/SVC per receiver, UDP loss recovery, cascades, fenced controller",
  },
  "bonus-29-github-code-hosting": {
    level: 5,
    rank: 33,
    why: "Quorum writes per reference, push-event fan-out, isolated fair CI, n-gram code search",
  },
  "bonus-30-tiktok-for-you-feed": {
    level: 5,
    rank: 34,
    why: "Online training loop, collisionless embeddings, minute-level parameter sync, late labels",
  },
  "bonus-32-ondc-open-commerce": {
    level: 5,
    rank: 35,
    why: "Signed async protocol between companies, two-DB orders, cascade cancels, settlement",
  },
  "bonus-33-nse-stock-exchange": {
    level: 5,
    rank: 36,
    why: "Sequencer + deterministic matching, output-gated replication, multicast fairness, DR halts",
  },
};

const UNKNOWN_RANK =
  Math.max(0, ...Object.values(QUEST_DIFFICULTY).map((d) => d.rank)) + 1;

/** Difficulty for a quest slug; an unrated quest is Medium and sorts after every rated one. */
export function questDifficulty(slug: string): QuestDifficulty {
  return (
    QUEST_DIFFICULTY[slug] ?? {
      level: 3,
      rank: UNKNOWN_RANK,
      why: "Not rated yet",
    }
  );
}

/**
 * The site-wide level (lib/learn/level.ts) a side quest shows, on its tile and its page. Every quest is
 * a whole system design, so none is "Beginner": Starter and Easy show Intermediate, Medium and Hard show
 * Advanced, Expert stays Expert. The rank, not this, sets the order.
 */
export function questLevel(slug: string): Level {
  const l = questDifficulty(slug).level;
  return l <= 2 ? "Intermediate" : l <= 4 ? "Advanced" : "Expert";
}
