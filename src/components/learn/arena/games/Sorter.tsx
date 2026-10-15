"use client";

/**
 * Sorter engine for "Pick the Store" and "Fix the Outage": a card drops in, tap the bin it belongs to.
 * Right: +10 × streak multiplier (×2 from 3 in a row, ×3 from 6). Wrong: the streak resets and the
 * answer + why stay up until you move on (the clock keeps running, so mistakes cost time).
 */
import { useMemo, useState } from "react";
import { PRACTICE_GAMES } from "@/lib/learn/arena/games";
import { rng, shuffled } from "@/lib/learn/arena/shared";
import GameShell, { type BoardApi } from "./GameShell";
import { BTN_GHOST } from "../ui";

export type SortCard = { text: string; bin: string; why: string };
export type SortDeck = { game: string; bins: { key: string; label: string; sub: string }[]; cards: SortCard[]; prompt: string };

const BASE = 10;
const mult = (streak: number) => (streak >= 6 ? 3 : streak >= 3 ? 2 : 1);

export const STORE_DECK: SortDeck = {
  game: "arena:store",
  prompt: "Where does this data live?",
  bins: [
    { key: "sql", label: "Relational", sub: "Postgres · MySQL" },
    { key: "kv", label: "Key-value", sub: "Redis · DynamoDB" },
    { key: "doc", label: "Document", sub: "MongoDB" },
    { key: "wide", label: "Wide-column", sub: "Cassandra · ScyllaDB" },
    { key: "search", label: "Search index", sub: "Elasticsearch" },
    { key: "object", label: "Object store", sub: "S3 · GCS" },
  ],
  cards: [
    { text: "Money moves between two accounts and must never half-apply", bin: "sql", why: "Multi-row ACID transactions are the relational database's home turf." },
    { text: "Session tokens checked on every request, expiring after 30 minutes", bin: "kv", why: "O(1) lookups by key with a TTL: exactly what a key-value store does." },
    { text: "A product catalog where every category has different attributes", bin: "doc", why: "Flexible per-item schema, read and written as one document." },
    { text: "Billions of sensor readings a day, queried by device and time range", bin: "wide", why: "Write-heavy, partitioned by device, clustered by time: wide-column." },
    { text: "Full-text search over 10M support tickets, with typo tolerance", bin: "search", why: "Inverted index, relevance scoring and fuzzy matching." },
    { text: "Petabytes of user-uploaded photos and videos", bin: "object", why: "Large immutable blobs belong in cheap, durable object storage." },
    { text: "A real-time game leaderboard with rank lookups", bin: "kv", why: "Redis sorted sets give rank and top-N in O(log n)." },
    { text: "Orders, customers and invoices joined for monthly reports", bin: "sql", why: "Normalized data with joins and constraints." },
    { text: "Chat history per conversation, write-heavy, at huge scale", bin: "wide", why: "Partition by conversation, cluster by time; Discord ran this on Cassandra." },
    { text: "Autocomplete suggestions as the user types", bin: "search", why: "Prefix / n-gram queries over an index." },
    { text: "Database backups and logs kept for seven years", bin: "object", why: "Cold, cheap, durable storage with lifecycle rules." },
    { text: "Per-API-key rate limit counters", bin: "kv", why: "Atomic INCR with expiry, in memory." },
    { text: "CMS articles with nested comments and tags", bin: "doc", why: "Naturally nested data, read as a whole." },
    { text: "Inventory that must not oversell under concurrent checkouts", bin: "sql", why: "Row locks or conditional updates inside a transaction." },
    { text: "Filtering products by brand, price range and rating facets", bin: "search", why: "Faceted aggregations are what search engines are built for." },
    { text: "A user's activity timeline: append-heavy, read by user id", bin: "wide", why: "One partition per user, sorted by time." },
    { text: "Feature flags read on every request", bin: "kv", why: "Tiny values, hot reads, by key." },
    { text: "Static site assets served through a CDN", bin: "object", why: "The CDN's origin is an object store bucket." },
    { text: "User profiles with many optional fields, read by id", bin: "doc", why: "Sparse, evolving schema; fetch the whole profile at once." },
    { text: "A payroll ledger with foreign keys and constraints", bin: "sql", why: "Integrity rules belong in a relational schema." },
    { text: "Searching the last 7 days of logs across 200 services", bin: "search", why: "Log search runs on an inverted index (the ELK stack)." },
    { text: "Machine-learning training datasets, hundreds of TB", bin: "object", why: "Bulk files read in big sequential scans." },
  ],
};

export const OUTAGE_DECK: SortDeck = {
  game: "arena:outage",
  prompt: "Which pattern stops this?",
  bins: [
    { key: "breaker", label: "Circuit breaker", sub: "fail fast, probe later" },
    { key: "idem", label: "Idempotency key", sub: "same request, one effect" },
    { key: "jitter", label: "Backoff + jitter", sub: "spread the retries" },
    { key: "coalesce", label: "Request coalescing", sub: "one rebuild per key" },
    { key: "dlq", label: "Dead-letter queue", sub: "park the poison" },
    { key: "outbox", label: "Transactional outbox", sub: "DB write + event, atomically" },
  ],
  cards: [
    { text: "The payment provider is down; every checkout thread waits 30 s and the service runs out of threads", bin: "breaker", why: "Open the breaker and fail fast instead of blocking threads on a dead dependency." },
    { text: "A client retried a timed-out POST and the customer was charged twice", bin: "idem", why: "An idempotency key makes the retry return the first result instead of charging again." },
    { text: "After a 2 s blip, 10,000 clients retry at exactly the same moment and knock the API over again", bin: "jitter", why: "Exponential backoff with jitter spreads retries out in time." },
    { text: "A hot cache key expires and 5,000 requests hit the database for the same row", bin: "coalesce", why: "Let one request rebuild the key; the rest wait for its result." },
    { text: "One malformed message crashes the consumer, which restarts and reads it again, forever", bin: "dlq", why: "After N failures move it to a dead-letter queue so the rest can flow." },
    { text: "The order is saved, but the 'order placed' event never reaches Kafka: the process died in between", bin: "outbox", why: "Write the event to an outbox table in the same transaction; a relay publishes it." },
    { text: "A webhook receiver gets the same event delivered three times", bin: "idem", why: "Delivery is at-least-once; de-duplicate on the event id." },
    { text: "Recommendations time out at p99, and the home page should load without them", bin: "breaker", why: "Trip the breaker and serve the fallback instead of waiting." },
    { text: "Mobile apps reconnecting after an outage arrive in synchronized waves every 30 s", bin: "jitter", why: "Randomize the reconnect delay so the waves flatten out." },
    { text: "A celebrity's profile cache miss triggers thousands of identical rebuilds", bin: "coalesce", why: "Single-flight per key: one rebuild, many readers." },
    { text: "A payment event fails validation every time and the partition is stuck behind it", bin: "dlq", why: "Park the poison pill, alert, keep consuming." },
    { text: "Stock is decremented in the DB, but after a crash the search index never hears about it", bin: "outbox", why: "Dual writes drift; publish from an outbox written in the same transaction." },
    { text: "A user double-taps Pay and two orders are created", bin: "idem", why: "One idempotency key per checkout attempt turns the second tap into a no-op." },
    { text: "A downstream keeps failing; stop calling it and check it again every 30 s", bin: "breaker", why: "That's open → half-open: a trial request decides whether to close." },
    { text: "Retries to a flaky dependency in lockstep turn a small error spike into an outage", bin: "jitter", why: "Back off exponentially and add jitter so retries don't amplify load." },
    { text: "A deploy flushes the cache and DB CPU pins at 100% on identical queries", bin: "coalesce", why: "Coalesce misses per key (and warm the hot keys) so the DB sees one query each." },
    { text: "An event with a schema the consumer can't parse keeps blocking the queue", bin: "dlq", why: "Unprocessable messages go to a DLQ for inspection and replay." },
    { text: "Writing to the DB and the broker separately sometimes leaves them disagreeing", bin: "outbox", why: "The outbox makes 'save + publish' a single local transaction." },
  ],
};

function Board({ api, deck }: { api: BoardApi; deck: SortDeck }) {
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const order = useMemo(() => shuffled(deck.cards, rng(seed + api.round)), [deck.cards, seed, api.round]);
  const [i, setI] = useState(0);
  const [streak, setStreak] = useState(0);
  const [miss, setMiss] = useState<{ pick: string } | null>(null);
  const [hit, setHit] = useState<string | null>(null);
  const [stats, setStats] = useState({ right: 0, wrong: 0 });
  const card = order[i % order.length];

  const pick = (bin: string) => {
    if (!api.running || miss) return;
    if (bin === card.bin) {
      const s = streak + 1;
      api.addScore(BASE * mult(s), s >= 3 ? `streak ${s}` : "right");
      setStreak(s);
      setStats((x) => ({ ...x, right: x.right + 1 }));
      setHit(bin);
      window.setTimeout(() => {
        setHit(null);
        setI((k) => k + 1);
      }, 280);
    } else {
      setStreak(0);
      setStats((x) => ({ ...x, wrong: x.wrong + 1 }));
      setMiss({ pick: bin });
      api.addScore(0, `wrong, it's ${deck.bins.find((b) => b.key === card.bin)?.label}`);
    }
  };

  const next = () => {
    setMiss(null);
    setI((k) => k + 1);
  };

  const binLabel = (k: string) => deck.bins.find((b) => b.key === k)?.label || k;

  return (
    <section aria-label={deck.prompt} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 font-mono text-xs text-fg-3">
        <span>
          card {i + 1} · {stats.right} right · {stats.wrong} wrong
        </span>
        <span className={streak >= 3 ? "font-semibold text-signal-text" : ""}>
          ×{mult(streak)} {streak >= 3 ? `· streak ${streak}` : ""}
        </span>
      </div>

      <div
        key={i}
        className={`flex min-h-[132px] flex-col justify-center gap-2 border bg-surface p-5 motion-safe:animate-[sd-arena-pop_0.22s_ease-out] ${
          miss ? "border-bad motion-safe:animate-[sd-arena-shake_0.42s_ease-in-out]" : hit ? "border-ok" : "border-line-strong"
        }`}
      >
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{deck.prompt}</span>
        <p className="m-0 font-display text-[clamp(20px,3vw,26px)] font-bold leading-[1.25] tracking-[-0.015em] text-fg">{card.text}</p>
      </div>

      {miss && (
        <div aria-live="polite" className="flex flex-col gap-2 border border-line bg-surface p-4">
          <p className="m-0 font-mono text-sm font-semibold text-bad-text">
            Not {binLabel(miss.pick)} · it&apos;s {binLabel(card.bin)}
          </p>
          <p className="m-0 text-[15px] text-fg-2">{card.why}</p>
          <button type="button" onClick={next} className={`${BTN_GHOST} self-start`} autoFocus>
            Next card →
          </button>
        </div>
      )}

      <ul className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-3" aria-label="Choices">
        {deck.bins.map((b) => {
          const state = miss ? (b.key === card.bin ? "right" : b.key === miss.pick ? "wrong" : "dim") : hit === b.key ? "right" : "idle";
          return (
            <li key={b.key}>
              <button
                type="button"
                onClick={() => pick(b.key)}
                disabled={!api.running || !!miss}
                className={`flex min-h-[64px] w-full flex-col items-start justify-center gap-0.5 border px-3 py-2 text-left ${
                  state === "right" ? "border-ok bg-ok/10" : state === "wrong" ? "border-bad bg-bad/10" : state === "dim" ? "border-line opacity-50" : "border-line bg-bg hover:border-signal hover:bg-surface-2"
                }`}
              >
                <span className="text-[15px] font-semibold text-fg">{b.label}</span>
                <span className="font-mono text-[11px] text-fg-3">{b.sub}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StoreBoard({ api }: { api: BoardApi }) {
  return <Board api={api} deck={STORE_DECK} />;
}

function OutageBoard({ api }: { api: BoardApi }) {
  return <Board api={api} deck={OUTAGE_DECK} />;
}

export default function Sorter({ which }: { which: "store" | "outage" }) {
  const deck = which === "store" ? STORE_DECK : OUTAGE_DECK;
  const game = PRACTICE_GAMES.find((g) => g.id === deck.game)!;
  return (
    <GameShell
      game={game}
      seconds={game.seconds || 75}
      rules={
        <ul className="m-0 grid list-none gap-1.5 p-0">
          <li>■ A card drops in: {deck.prompt.toLowerCase()} Tap the right box.</li>
          <li>■ +{BASE} per right answer, ×2 from 3 in a row, ×3 from 6 in a row.</li>
          <li>■ A wrong answer resets the streak and shows why. The clock keeps running.</li>
        </ul>
      }
      Board={which === "store" ? StoreBoard : OutageBoard}
    />
  );
}
