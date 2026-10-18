/**
 * Reference numbers for the Numbers playground (/learn/numbers), transcribed from the lessons that
 * teach them. Every value here must match its lesson exactly: when a lesson changes, change it here
 * (the "taught in" link on each table says which section to compare against). Where the course
 * leans on an outside figure, the table names that source too.
 */
const COURSE = "/learn/system-design-mastery";
const W00 = `${COURSE}/week-00-foundations`;
export const LESSONS = {
  part3: `${W00}/foundations-part-3-back-of-the-envelope-estimation`,
  part4: `${W00}/foundations-part-4-networking`,
  part5: `${W00}/foundations-part-5-operating-systems`,
  w03d1: `${COURSE}/week-03-messaging-and-async-processing/day-01-queue-vs-stream`,
  w03d3: `${COURSE}/week-03-messaging-and-async-processing/day-03-backpressure-and-flow-control`,
  /** Week 0 trial; part 3 is the estimation part (Q36–Q50) */
  trial: `${W00}/week-00-mcq-assessment`,
} as const;

export type Taught = { label: string; href: string };
export type External = { label: string; href: string };

export type Row = {
  what: string;
  value: string;
  /** a second column: approximate / shortcut / per second */
  alt?: string;
  /** latency rows: nanoseconds, drawn as a log-scale bar */
  ns?: number;
  /** an expression the row can send to the calculator */
  calc?: string;
};

export type RefTable = {
  id: string;
  title: string;
  /** header labels for the value columns */
  cols: [string, string] | [string, string, string];
  rows: Row[];
  taught: Taught[];
  external?: External[];
  /** a caveat shown under the table */
  note?: string;
};

export type RefSection = { id: string; title: string; kicker: string; blurb: string; tables: RefTable[] };

const t = (label: string, href: string): Taught => ({ label, href });

export const DEAN: External = { label: "Jeff Dean, “Numbers Everyone Should Know”", href: "https://brenocon.com/dean_perf.html" };
export const COLIN: External = { label: "Colin Scott, interactive latency numbers by year", href: "https://colin-scott.github.io/personal_website/research/interactive_latency.html" };

export const SECTIONS: RefSection[] = [
  {
    id: "latency",
    title: "Latency",
    kicker: "how long things take",
    blurb: "The ratios matter more than the absolute values: memory is ~1,000× faster than SSD for random reads, and a cross-continent round trip costs 150 ms no matter how fast your code is.",
    tables: [
      {
        id: "latency-dean",
        title: "Latency numbers every programmer should know",
        cols: ["Operation", "Time", "ns"],
        rows: [
          { what: "L1 cache reference", value: "0.5 ns", ns: 0.5 },
          { what: "Branch mispredict", value: "5 ns", ns: 5 },
          { what: "L2 cache reference", value: "7 ns", ns: 7 },
          { what: "Mutex lock/unlock", value: "25 ns", ns: 25 },
          { what: "Main memory reference", value: "100 ns", ns: 100 },
          { what: "Compress 1 KB with Snappy", value: "3,000 ns (3 µs)", ns: 3_000 },
          { what: "Send 1 KB over 1 Gbps network", value: "10,000 ns (10 µs)", ns: 10_000 },
          { what: "Read 4 KB randomly from SSD", value: "150,000 ns (150 µs)", ns: 150_000 },
          { what: "Read 1 MB sequentially from memory", value: "250,000 ns (250 µs)", ns: 250_000 },
          { what: "Round trip within same datacenter", value: "500,000 ns (0.5 ms)", ns: 500_000 },
          { what: "Read 1 MB sequentially from SSD", value: "1,000,000 ns (1 ms)", ns: 1_000_000 },
          { what: "HDD seek", value: "10,000,000 ns (10 ms)", ns: 10_000_000 },
          { what: "Read 1 MB sequentially from HDD", value: "20,000,000 ns (20 ms)", ns: 20_000_000 },
          { what: "Send packet CA → Netherlands → CA", value: "150,000,000 ns (150 ms)", ns: 150_000_000, calc: "150 ms × 4" },
        ],
        taught: [t("W00 · Part 3 · §1.3", `${LESSONS.part3}#s-1-3-latency-numbers-every-programmer-should-know`)],
        external: [DEAN, COLIN],
        note: "Popularised by Jeff Dean (circa 2009–2012; the SSD rows came in later versions). NVMe SSDs are faster today. Part 5 (operating systems) uses the same figures, with ranges whose faster end fits newer hardware: L1 ~0.5–1 ns, L2 ~4–7 ns, L3 ~10–20 ns, RAM ~100 ns, SSD ~100–150 µs, HDD ~10 ms. The 1 KB over 1 Gbps row is 8 µs of pure transmission; 10 µs rounds up for overhead.",
      },
      {
        id: "latency-network",
        title: "Network round trips",
        cols: ["Path", "Latency"],
        rows: [
          { what: "Same datacenter (same rack)", value: "0.5 ms" },
          { what: "Same datacenter (different rack)", value: "1 ms" },
          { what: "Same region (different AZ)", value: "1–2 ms" },
          { what: "Cross-region (same continent)", value: "20–50 ms" },
          { what: "Cross-continent", value: "100–200 ms" },
          { what: "Geostationary satellite", value: "600+ ms" },
          { what: "NYC ↔ London, minimum RTT (light in fiber, ~200,000 km/s over ~5,500 km)", value: "~55 ms", calc: "2 × 5500 / 200000 × 1 s in ms" },
          { what: "1 MB on a 100 Mbps link (transmission delay)", value: "80 ms", calc: "1 MB / 100 Mbps in ms" },
          { what: "1 MB on a 1 Gbps link (transmission delay)", value: "8 ms", calc: "1 MB / 1 Gbps in ms" },
        ],
        taught: [t("W00 · Part 4 · §12.1–12.2", `${LESSONS.part4}#s-12-2-real-world-latency-numbers`)],
      },
      {
        id: "latency-handshakes",
        title: "Handshakes and lookups",
        cols: ["Step", "Cost"],
        rows: [
          { what: "TCP handshake", value: "1 RTT (~0.5 ms in a DC; 20–50 ms cross-region; 100–200 ms cross-continent)" },
          { what: "TLS 1.2 handshake (additional)", value: "2 RTT" },
          { what: "TLS 1.3 handshake (additional)", value: "1 RTT" },
          { what: "TLS 1.3 resumption", value: "0 RTT" },
          { what: "DNS, cached locally", value: "< 1 ms" },
          { what: "DNS, cached at resolver", value: "1–10 ms" },
          { what: "DNS, full resolution", value: "50–200 ms" },
        ],
        taught: [t("W00 · Part 4 · §12.2", `${LESSONS.part4}#s-12-2-real-world-latency-numbers`)],
      },
      {
        id: "latency-os",
        title: "Inside one machine",
        cols: ["Operation", "Cost"],
        rows: [
          { what: "Thread context switch", value: "~1–10 µs" },
          { what: "Process context switch (incl. TLB/cache effects)", value: "~10–100 µs" },
          { what: "Create a thread", value: "~10 µs" },
          { what: "Create a process", value: "~0.1–1 ms" },
          { what: "Minor page fault", value: "~1–10 µs" },
          { what: "Major page fault", value: "~100 µs (SSD) · ~10 ms (HDD)" },
          { what: "NUMA remote memory access", value: "~150–200 ns (local ~100 ns)" },
        ],
        taught: [t("W00 · Part 5 · processes, threads, memory", `${LESSONS.part5}#s-5-1-memory-hierarchy`)],
      },
    ],
  },
  {
    id: "throughput",
    title: "Throughput",
    kicker: "how much per second",
    blurb: "Network speeds are in bits, storage in bytes: divide Gbps by 8 for GB/s. Capacities per box are rules of thumb; real numbers depend on query complexity, data size, hardware and latency.",
    tables: [
      {
        id: "throughput-network",
        title: "Network bandwidth",
        cols: ["Connection", "Speed", "Data / second"],
        rows: [
          { what: "Home broadband", value: "100 Mbps", alt: "12.5 MB/s", calc: "100 Mbps in MB/s" },
          { what: "Home fiber", value: "1 Gbps", alt: "125 MB/s", calc: "1 Gbps in MB/s" },
          { what: "AWS within an Availability Zone", value: "10–25 Gbps", alt: "1–3 GB/s", calc: "10 Gbps in GB/s" },
          { what: "Datacenter backbone", value: "100+ Gbps", alt: "12+ GB/s", calc: "100 Gbps in GB/s" },
        ],
        taught: [t("W00 · Part 3 · §1.5", `${LESSONS.part3}#s-1-5-throughput-reference-numbers`)],
        note: "Formula: Gbps ÷ 8 = GB/s. Reading Gbps as GB/s overstates capacity 8×.",
      },
      {
        id: "throughput-disk",
        title: "Disks",
        cols: ["Device", "Throughput"],
        rows: [
          { what: "HDD, sequential", value: "~100 MB/s" },
          { what: "HDD, random", value: "~1 MB/s" },
          { what: "SSD, sequential (1 MB in 1 ms, from the latency table)", value: "~1 GB/s", calc: "1 MB / 1 ms" },
          { what: "Memory, sequential (1 MB in 250 µs)", value: "~4 GB/s", calc: "1 MB / 250 µs" },
        ],
        taught: [t("W00 · Part 5 · §7.4 (WAL)", `${LESSONS.part5}#s-7-4-write-ahead-logging-wal`), t("W00 · Part 3 · §1.3", `${LESSONS.part3}#s-1-3-latency-numbers-every-programmer-should-know`)],
        note: "The SSD and memory rows are worked out from the latency table (1 MB ÷ time), not separate measurements.",
      },
      {
        id: "throughput-db",
        title: "Databases (per node, approximate)",
        cols: ["Database", "Operations / second"],
        rows: [
          { what: "PostgreSQL (single)", value: "10,000–50,000 queries/s" },
          { what: "MySQL (single)", value: "10,000–50,000 queries/s" },
          { what: "Redis (single)", value: "100,000+ ops/s" },
          { what: "Cassandra (per node)", value: "10,000–50,000 writes/s" },
          { what: "MongoDB (single)", value: "10,000–30,000 ops/s" },
          { what: "DynamoDB (on-demand)", value: "Scales out (per-partition and account limits apply)" },
          { what: "Sizing rule: DB capacity", value: "30,000 queries/s", calc: "ceil(46k QPS / 30k QPS)" },
          { what: "Sizing rule: shard writes above", value: "10,000 writes/s on one primary" },
        ],
        taught: [t("W00 · Part 3 · §1.5 + §2.5", `${LESSONS.part3}#s-1-5-throughput-reference-numbers`)],
      },
      {
        id: "throughput-servers",
        title: "App servers (per server, approximate)",
        cols: ["Server", "Requests / second"],
        rows: [
          { what: "Node.js (simple API)", value: "5,000–10,000" },
          { what: "Go (simple API)", value: "30,000–50,000" },
          { what: "Nginx (static files)", value: "50,000–100,000" },
          { what: "Node.js (complex logic)", value: "1,000–3,000" },
          { what: "Python/Django", value: "500–2,000" },
          { what: "Sizing: simple API (CRUD)", value: "5,000–10,000 RPS per server" },
          { what: "Sizing: complex logic", value: "1,000–3,000 RPS per server" },
          { what: "Sizing: CPU-intensive", value: "100–500 RPS per server" },
          { what: "Target utilisation", value: "70% (leave headroom)", calc: "ceil(100k QPS / (5k QPS × 70%))" },
          { what: "Conservative default", value: "5,000 req/s per server" },
        ],
        taught: [t("W00 · Part 3 · §1.5 + §2.5", `${LESSONS.part3}#s-2-5-infrastructure-estimation`)],
      },
      {
        id: "throughput-kafka",
        title: "Kafka",
        cols: ["Rule", "Value"],
        rows: [
          { what: "Consumers in one group", value: "≤ partitions (12 partitions = max 12 consumers)" },
          { what: "Parallelism", value: "= number of partitions" },
          { what: "Replication", value: "3× (3 replicas per partition)" },
          { what: "Per-partition write throughput (outside figure, measure yours)", value: "~10 MB/s", calc: "ceil(100k QPS × 1 KB / (10 MB/s))" },
        ],
        taught: [
          t("W03 · Day 1 · §2.3", `${LESSONS.w03d1}#s-2-3-pattern-3-consumer-groups-partitioned-stream`),
          t("W03 · Day 3 · scaling consumers", LESSONS.w03d3),
          t("W00 · Part 3 · §2.3", `${LESSONS.part3}#s-2-3-storage-estimation`),
        ],
        external: [{ label: "Confluent (Jun Rao), “How to choose the number of topics/partitions in a Kafka cluster?”", href: "https://www.confluent.io/blog/how-choose-number-topics-partitions-kafka-cluster/" }],
        note: "The course doesn't give a per-partition throughput. Confluent's sizing rule is partitions = max(T ÷ p, T ÷ c), with p and c the producer and consumer throughput you measure on one partition; ~10 MB/s is a common conservative starting point, not a guarantee.",
      },
    ],
  },
  {
    id: "sizes",
    title: "Sizes",
    kicker: "how big things are",
    blurb: "When in doubt, estimate 1 KB per record. Media dominates storage: a 1 KB post with a 20% chance of a 500 KB image averages 100 KB.",
    tables: [
      {
        id: "sizes-text",
        title: "Text and identifiers",
        cols: ["Item", "Size"],
        rows: [
          { what: "Character (ASCII)", value: "1 byte" },
          { what: "Character (UTF-8, average)", value: "1–4 bytes" },
          { what: "UUID", value: "36 bytes (string) / 16 bytes (binary)" },
          { what: "Timestamp (64-bit, e.g. PostgreSQL timestamp, Unix epoch ms)", value: "8 bytes" },
          { what: "Email address", value: "~30 bytes" },
          { what: "URL", value: "~100 bytes" },
          { what: "Tweet (text + metadata)", value: "~300 bytes on average (~500 for a full 280 characters)" },
          { what: "Typical JSON API response", value: "2–10 KB" },
          { what: "Average email", value: "50–100 KB" },
          { what: "Average web page (HTML + assets)", value: "2–3 MB" },
        ],
        taught: [t("W00 · Part 3 · §1.4", `${LESSONS.part3}#s-1-4-typical-data-sizes`)],
        external: [{ label: "PostgreSQL docs, date/time types (timestamp: 8 bytes)", href: "https://www.postgresql.org/docs/current/datatype-datetime.html" }],
        note: "The timestamp row isn't in the course; it's from the PostgreSQL docs.",
      },
      {
        id: "sizes-records",
        title: "Database records (typical)",
        cols: ["Record", "Size"],
        rows: [
          { what: "User profile (basic)", value: "500 bytes – 1 KB" },
          { what: "Product listing", value: "1–5 KB" },
          { what: "Order record", value: "500 bytes – 1 KB" },
          { what: "Log entry", value: "200–500 bytes" },
          { what: "Search index entry", value: "200 bytes" },
          { what: "Session data", value: "1–2 KB" },
          { what: "Rule of thumb", value: "1 KB per record" },
        ],
        taught: [t("W00 · Part 3 · §1.4", `${LESSONS.part3}#s-1-4-typical-data-sizes`)],
      },
      {
        id: "sizes-media",
        title: "Media",
        cols: ["Item", "Size"],
        rows: [
          { what: "Favicon", value: "~1 KB" },
          { what: "Thumbnail image", value: "5–10 KB" },
          { what: "Profile picture (small)", value: "50–100 KB" },
          { what: "Regular photo (compressed)", value: "200 KB – 2 MB" },
          { what: "High-res photo", value: "5–10 MB" },
          { what: "1 min of video, 720p phone recording", value: "~50 MB" },
          { what: "1 min of video, 1080p phone recording", value: "~60–100 MB" },
          { what: "1 min of video, 4K phone recording", value: "~350 MB" },
          { what: "1 min of streamed video, 1080p at ~3–5 Mbps", value: "~25–40 MB", calc: "4 Mbps × 1 min in MB" },
          { what: "1 min of audio (MP3)", value: "~1 MB" },
        ],
        taught: [t("W00 · Part 3 · §1.4", `${LESSONS.part3}#s-1-4-typical-data-sizes`)],
      },
      {
        id: "sizes-bitrates",
        title: "Video bitrates (stored per hour)",
        cols: ["Resolution", "Per hour", "Bitrate"],
        rows: [
          { what: "360p", value: "200 MB/hr", alt: "~0.44 Mbps", calc: "200 MB / 1 h in Mbps" },
          { what: "720p", value: "500 MB/hr", alt: "~1.1 Mbps", calc: "500 MB / 1 h in Mbps" },
          { what: "1080p", value: "1.5 GB/hr", alt: "~3.3 Mbps", calc: "1.5 GB / 1 h in Mbps" },
        ],
        taught: [t("W00 · Part 3 · §5.2 (YouTube practice)", `${LESSONS.part3}#s-5-2-practice-youtube`)],
        note: "The per-hour sizes are the YouTube practice problem's givens; the bitrate column is worked out from them.",
      },
    ],
  },
  {
    id: "units",
    title: "Units",
    kicker: "storage and time",
    blurb: "The course estimates in decimal units (1 KB = 1,000 B). Binary units (KiB, 1,024 B) are what RAM and some tools report; the gap grows to ~10% at TB.",
    tables: [
      {
        id: "units-storage",
        title: "Storage units",
        cols: ["Unit", "Decimal (course convention)", "Binary"],
        rows: [
          { what: "Kilobyte", value: "1 KB = 1,000 B (10³)", alt: "1 KiB = 1,024 B (2¹⁰)" },
          { what: "Megabyte", value: "1 MB = 1,000 KB (10⁶ B)", alt: "1 MiB = 1,048,576 B (2²⁰)" },
          { what: "Gigabyte", value: "1 GB = 1,000 MB (10⁹ B)", alt: "1 GiB = 1,073,741,824 B (2³⁰)" },
          { what: "Terabyte", value: "1 TB = 1,000 GB (10¹² B)", alt: "1 TiB ≈ 1.1 × 10¹² B (2⁴⁰)" },
          { what: "Petabyte", value: "1 PB = 1,000 TB (10¹⁵ B)", alt: "1 PiB ≈ 1.13 × 10¹⁵ B (2⁵⁰)" },
          { what: "Shortcut", value: "1 million KB = 1 GB · 1 billion KB = 1 TB", alt: "every 10 powers of 2 ≈ 3 powers of 10" },
          { what: "Bits vs bytes", value: "1 byte = 8 bits", alt: "MB/s × 8 = Mbps", calc: "100 MB/s in Mbps" },
        ],
        taught: [t("W00 · Part 3 · §1.1 + §4.3", `${LESSONS.part3}#s-1-1-powers-of-two`)],
        note: "The lesson's powers-of-two table gives 2¹⁰ as 1 KiB ≈ 1 KB and then estimates with 1,000. This playground follows the same convention: KB/MB/GB are decimal and KiB/MiB/GiB are binary.",
      },
      {
        id: "units-time",
        title: "Seconds in…",
        cols: ["Period", "Seconds", "Round to"],
        rows: [
          { what: "1 minute", value: "60", alt: "60", calc: "1 min in s" },
          { what: "1 hour", value: "3,600", alt: "~4,000", calc: "1 h in s" },
          { what: "1 day", value: "86,400", alt: "~100,000 (10⁵)", calc: "1 day in s" },
          { what: "1 week", value: "604,800", alt: "~600,000", calc: "1 week in s" },
          { what: "1 month (30 days)", value: "2,592,000", alt: "~2.5 million", calc: "1 month in s" },
          { what: "1 year (365 days)", value: "31,536,000", alt: "~30 million (3 × 10⁷)", calc: "1 year in s" },
          { what: "X per day → per second", value: "÷ 86,400", alt: "÷ 100,000", calc: "100M / day" },
        ],
        taught: [t("W00 · Part 3 · §1.2", `${LESSONS.part3}#s-1-2-time-conversions`)],
      },
    ],
  },
  {
    id: "rules",
    title: "Rules of thumb",
    kicker: "the estimation cheat sheet",
    blurb: "State assumptions first, show the maths, round to nice numbers, then say what the number means for the design. Don't spend more than 5 minutes on it.",
    tables: [
      {
        id: "rules-traffic",
        title: "Traffic",
        cols: ["Rule", "Value"],
        rows: [
          { what: "Requests per second", value: "daily requests ÷ 86,400 (≈ ÷ 100,000)", calc: "200M DAU × 20 views / day" },
          { what: "Peak, normal apps", value: "2× average" },
          { what: "Peak, social / viral", value: "3× average" },
          { what: "Peak, flash sales / events", value: "5–10× average" },
          { what: "Read:write, read-heavy (social media)", value: "100:1 to 1000:1" },
          { what: "Read:write, mixed (e-commerce)", value: "10:1 to 100:1" },
          { what: "Read:write, write-heavy (logging)", value: "1:1 to 1:10" },
          { what: "DAU as a share of MAU", value: "usually 20–40%" },
          { what: "E-commerce conversion rate", value: "1–3%" },
        ],
        taught: [t("W00 · Part 3 · §2.2 + §3.2", `${LESSONS.part3}#s-2-2-traffic-estimation`)],
      },
      {
        id: "rules-storage",
        title: "Storage, servers and caches",
        cols: ["Rule", "Value"],
        rows: [
          { what: "Storage", value: "objects × size × retention × replication" },
          { what: "Replication: databases", value: "3× (1 primary + 2 replicas)" },
          { what: "Replication: object storage (S3)", value: "built in (already replicated)" },
          { what: "Indexes", value: "add 20–30%", calc: "500 GB × 3 + 30%" },
          { what: "Logs", value: "often as large as the main data" },
          { what: "Backups", value: "often 2–3× for backup retention" },
          { what: "API servers", value: "peak RPS ÷ 5,000 ÷ 0.7", calc: "ceil(100k QPS / 5k QPS / 0.7)" },
          { what: "DB read replicas", value: "read RPS ÷ 30,000" },
          { what: "Cache size", value: "hot data: 20% of total (80/20), or the last N hours/days" },
          { what: "Cache hit rate to aim for", value: "90%+" },
          { what: "Short codes: 62⁶ / 62⁷", value: "~56 billion / ~3.5 trillion", calc: "62^7" },
        ],
        taught: [t("W00 · Part 3 · §2.3 + §2.5 + §3.1", `${LESSONS.part3}#s-3-1-the-cheat-sheet`)],
      },
    ],
  },
];

/** A stable version for the offline catalog: changes whenever the reference data changes. */
export const REFERENCE_VERSION = (() => {
  const s = JSON.stringify(SECTIONS);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
})();

// ---------------------------------------------------------------- calculator presets
// The estimates interviews ask for, each worked like the lesson that teaches it. The numbers are the
// lessons' own givens, so the answers can be checked against the lesson. (Kept in this file so the
// Node test runner can load it: scripts/tests/calc.test.mjs runs every preset.)

export type Preset = {
  id: string;
  title: string;
  /** one line under the chip */
  blurb: string;
  q: string;
  /** what the lesson gets, to compare */
  expect: string;
  taught: { label: string; href: string };
};

const P3 = LESSONS.part3;

export const PRESETS: Preset[] = [
  {
    id: "qps-from-dau",
    title: "QPS from DAU",
    blurb: "Daily actions ÷ 86,400, then the peak.",
    q: "# Twitter-like: 200M DAU, 20 tweet views each per day\navg = 200M DAU × 20 views / day\npeak = 2 × avg",
    expect: "~46,000 read RPS, peak ~94,000 (lesson, using 46,296 + 1,157 writes)",
    taught: { label: "W00 · Part 3 · §2.2", href: `${P3}#s-2-2-traffic-estimation` },
  },
  {
    id: "storage-per-year",
    title: "Storage per year",
    blurb: "Objects × size × retention × replication.",
    q: "# 100M tweets a day, 300 bytes each (text + metadata)\ndaily = 100M tweets/day × 300 bytes\nyearly = daily × 365 days\nyearly × 5 × 3 # 5 years, 3 replicas",
    expect: "30 GB/day; 165 TB over 5 years with 3× replication",
    taught: { label: "W00 · Part 3 · §2.3", href: `${P3}#s-2-3-storage-estimation` },
  },
  {
    id: "storage-media",
    title: "Storage with media",
    blurb: "Media dominates: weight each kind by its share.",
    q: "# 10% of tweets carry a 200 KB image, 1% a 5 MB video\n100M tweets/day × (300 B + 10% × 200 KB + 1% × 5 MB) in TB/day",
    expect: "≈ 7 TB/day (media is 99%+)",
    taught: { label: "W00 · Part 3 · §2.3", href: `${P3}#s-2-3-storage-estimation` },
  },
  {
    id: "bandwidth",
    title: "Bandwidth",
    blurb: "RPS × payload, then × 8 for bits.",
    q: "# egress: 46k reads/s, 2 KB per response, 20% carry a 200 KB image\negress = 46k QPS × (2 KB + 20% × 200 KB)\negress in Gbps",
    expect: "92 MB/s text + 1,840 MB/s images ≈ 1.9 GB/s ≈ 15 Gbps",
    taught: { label: "W00 · Part 3 · §2.4", href: `${P3}#s-2-4-bandwidth-estimation` },
  },
  {
    id: "storage-bandwidth",
    title: "50k QPS × 2 KB × 30 days",
    blurb: "Total storage, and the bandwidth on the way.",
    q: "50k QPS × 2 KB × 30 days",
    expect: "100 MB/s (800 Mbps) for 30 days ≈ 259 TB",
    taught: { label: "W00 · Part 3 · §2.3–2.4", href: `${P3}#s-2-4-bandwidth-estimation` },
  },
  {
    id: "servers",
    title: "Servers needed",
    blurb: "Peak ÷ (per-server RPS × 70% utilisation).",
    q: "peak = 100k QPS\nper_server = 5k QPS # simple CRUD API\nceil(peak / (per_server × 70%))",
    expect: "29 servers (round up to 30–35 for availability)",
    taught: { label: "W00 · Part 3 · §2.5", href: `${P3}#s-2-5-infrastructure-estimation` },
  },
  {
    id: "db-replicas",
    title: "DB read replicas",
    blurb: "Read RPS ÷ 30,000 per database.",
    q: "reads = 46k QPS\nceil(reads / 30k QPS)",
    expect: "2 read replicas + 1 primary",
    taught: { label: "W00 · Part 3 · §2.5", href: `${P3}#s-2-5-infrastructure-estimation` },
  },
  {
    id: "cache",
    title: "Cache for the hot set",
    blurb: "Last N days of data, or 20% of the total.",
    q: "# cache the last 7 days of text\ndaily = 30 GB/day\ndaily × 7 days\n# or the 80/20 rule on 10 TB of data\n20% × 10 TB",
    expect: "210 GB → a 256 GB Redis cluster",
    taught: { label: "W00 · Part 3 · §2.5", href: `${P3}#s-2-5-infrastructure-estimation` },
  },
  {
    id: "kafka",
    title: "Kafka partitions",
    blurb: "Throughput ÷ per-partition throughput, and ≥ consumers.",
    q: "# 100k events/s of 1 KB; ~10 MB/s per partition (assumption: measure yours)\nthroughput = 100k events/s × 1 KB\nper_partition = 10 MB/s\nceil(throughput / per_partition)",
    expect: "10 partitions (and at least as many as consumers in the group)",
    taught: { label: "W03 · Day 1 · consumer groups", href: `${LESSONS.w03d1}#s-2-3-pattern-3-consumer-groups-partitioned-stream` },
  },
  {
    id: "instagram",
    title: "Instagram egress",
    blurb: "The practice problem's photo egress, before and after the CDN.",
    q: "views = 500M DAU × 50 views / day\negress = views × 2 MB\negress in Tbps\negress × 5% in GB/s # origin traffic at a 95% CDN hit rate",
    expect: "~250,000 RPS (shortcut) → 4 Tbps; 25 GB/s at the origin",
    taught: { label: "W00 · Part 3 · §5.1", href: `${P3}#s-5-1-practice-instagram` },
  },
  {
    id: "url-codes",
    title: "Short code length",
    blurb: "How many base-62 characters cover N URLs.",
    q: "urls = 100M/month × 5 years\nceil(log(urls, 62))",
    expect: "6 chars = 56B combinations, 7 chars = 3.5T",
    taught: { label: "W00 · Part 3 · §3.2", href: `${P3}#s-3-2-common-estimation-templates` },
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) || null;
