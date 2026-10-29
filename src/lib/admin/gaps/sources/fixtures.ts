import "server-only";
/**
 * Dev QA sample asks for /admin/gaps (NODE_ENV !== "production" AND GAPS_FIXTURES=1, see ../report.ts).
 * They run through the real clustering and the real search index, so the page shows real closest material
 * and real verdicts. Deterministic.
 */
import { dayOf, normaliseQuery } from "../text";
import type { GapEvent, GapScope, GapSource, GapSourceId } from "../types";

export const gapFixtures = () => process.env.NODE_ENV !== "production" && process.env.GAPS_FIXTURES === "1";

/** [query, how many learners asked, scope the feature saw, source] */
const SAMPLE: [string, number, GapScope, GapSourceId][] = [
  ["how does graphql federation work", 9, "none", "smart-search"],
  ["graphql federation gateway design", 4, "partial", "chat"],
  ["design a crdt for collaborative editing", 7, "partial", "smart-search"],
  ["crdts vs operational transformation", 5, "partial", "chat"],
  ["webrtc signaling server for video calls", 6, "none", "smart-search"],
  ["vector database for rag retrieval", 8, "partial", "smart-search"],
  ["how to shard a vector index", 3, "partial", "chat"],
  ["kubernetes horizontal pod autoscaler", 5, "partial", "smart-search"],
  ["autoscaling kubernetes pods on queue depth", 2, "partial", "chat"],
  ["how do I stop my cache from melting at midnight", 6, "covered", "smart-search"],
  ["thundering herd on cache expiry", 4, "covered", "chat"],
  ["consistent hashing with virtual nodes", 7, "covered", "smart-search"],
  ["what is a hash ring", 3, "covered", "chat"],
  ["rate limiter token bucket vs sliding window", 8, "covered", "smart-search"],
  ["distributed rate limiting with redis", 4, "covered", "chat"],
  ["exactly once delivery in kafka", 5, "partial", "smart-search"],
  ["idempotency key for payments", 4, "covered", "smart-search"],
  ["geo spatial index for ride matching quadtree", 5, "partial", "smart-search"],
  ["geohash vs quadtree", 3, "partial", "chat"],
  ["multi region active active database", 4, "partial", "smart-search"],
  ["cell based architecture blast radius", 3, "none", "chat"],
  ["design ticketmaster seat booking", 3, "covered", "smart-search"],
  ["bloom filter false positives", 2, "covered", "smart-search"],
  ["write me a cover letter", 2, "off_topic", "chat"],
];

export const fixtureSource: GapSource = {
  id: "fixtures",
  label: "Sample asks (GAPS_FIXTURES=1)",
  async load() {
    const today = Date.now();
    const events: GapEvent[] = [];
    let u = 0;
    SAMPLE.forEach(([q, n, scope, source], i) => {
      for (let k = 0; k < n; k++) {
        const day = dayOf(today - ((i * 3 + k * 2) % 28) * 86_400_000);
        // a few learners ask the same topic twice on different days
        const user = `fx${String((u + (k % 3 === 2 ? -1 : 0)) % 61).padStart(2, "0")}`;
        u++;
        events.push({ source, day, q: normaliseQuery(q), user, scope, top: [] });
      }
    });
    return { status: "ok", events };
  },
};
