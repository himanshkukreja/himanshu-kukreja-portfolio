/**
 * Whole-lesson overview (week 0, part 8 · databases in depth). Basketly's illustrative Diwali sale:
 * five failures on one server. Engines: a commit is one WAL flush (~1,000 commits/s alone, ~40,000
 * when 40 share a flush, ~600 ms lost with synchronous_commit off), a B-tree of depth 4 for a billion
 * rows, the LSM write path (memtable, L0 SSTs, 10× levels, tombstones, Bloom filters) and the three
 * amplifications. Indexes: what a secondary entry points to, HOT, equality-first composites, covering
 * indexes, the index on status, and EXPLAIN's three plans. Isolation: five anomalies, the ghee lost
 * update under each default and its fixes, the coupon's write skew. MVCC & locks: heap versions and
 * VACUUM vs undo and purge, the eight-hour transaction, wraparound, FOR UPDATE and version columns.
 * Choose & IDs: UUIDv4's random working set (~3,000 reads/s), the ID schemes, key bytes across five
 * indexes, picking a family, and what real companies chose.
 */
import { Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an edge: from, to, and optional port offsets (y for side-by-side boxes, x for stacked ones) */
type Ed = [string, string, number?, number?];
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/* the stage grid: four columns, three rows of boxes above the figures */
const CX = [16, 124, 260, 404];
const CW = [88, 116, 124, 180];
const RY = [40, 96, 156];
const RH = [44, 48, 40];
const nd = (c: number, r: number, l: string, n?: string, rows = 1): Nd => ({ x: CX[c], y: RY[r], w: CW[c], h: RY[r + rows - 1] + RH[r + rows - 1] - RY[r], l, n });

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd, oa = 0, ob = 0): P[] {
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: a.y + a.h / 2 + oa };
    const p3 = { x: r ? b.x : b.x + b.w, y: b.y + b.h / 2 + ob };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2 + oa, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2 + ob, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;
const ends = (e: Ed) => geo(N[e[0]], N[e[1]], e[2], e[3]);

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = (F[variant] || F[Object.keys(F)[0]])[Math.min(step, (F[variant] || F[Object.keys(F)[0]]).length - 1)];
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map((e) => {
        const [a, b] = e;
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(ends(e))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const e = E.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        if (!e) return null;
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const p = bz(ends(e), e[0] === a ? u : 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}


const N: Record<string, Nd> = {
  app: nd(0, 0, "App"),
  backend: nd(1, 0, "Backend"),
  wal: nd(2, 0, "WAL"),
  repl: nd(3, 0, "Replicas"),
  analyst: nd(0, 1, "Analyst", "Report", 2),
  locks: nd(1, 1, "Locks"),
  mem: nd(2, 1, "Memory"),
  disk: nd(3, 1, "On disk"),
  ids: nd(1, 2, "ID gen", "IDs"),
  idx: nd(2, 2, "Indexes"),
  vac: nd(3, 2, "Vacuum / purge", "Vacuum"),
};
const E: Ed[] = [
  ["app", "backend"],
  ["analyst", "backend", -30, 12],
  ["backend", "wal", -8, -8],
  ["backend", "mem", 8, 0],
  ["backend", "locks"],
  ["wal", "repl"],
  ["mem", "disk"],
  ["ids", "idx"],
  ["idx", "disk", 0, 12],
  ["vac", "disk"],
];

const F: Record<string, Fr[]> = {
  engines: [
    {
      k: ["the Diwali sale, 10:00 (illustrative)", "the Diwali sale"],
      kt: "warn",
      on: { app: "lit", backend: 1, analyst: "warn", locks: "warn", idx: "bad", vac: "bad" },
      sub: { app: "checkouts" },
      fl: [["app", "backend"]],
      chips: [
        ["10:00:00 · inserts 2 → 40 ms", "inserts: 2 → 40 ms"],
        ["10:00:30 · one tin, sold twice", "one tin, sold twice"],
        ["10:05 · one coupon, used twice", "a coupon, used twice"],
        ["10:40 · an index nobody uses", "an unused index"],
        ["14:00 · orders grew by a third", "14:00 · grew by a third"],
        ["all of it on one server", "all on one server"],
      ],
      ctn: ["bad", "bad", "warn", "warn", "bad", "mute"],
    },
    {
      k: ["a commit is one sequential write", "log first"],
      on: { app: 1, backend: "lit", wal: "lit", mem: "warn", disk: 1, repl: 1 },
      sub: { wal: "append, fsync", mem: "dirty pages", disk: "written later", repl: "same log" },
      fl: [
        ["app", "backend"],
        ["backend", "wal"],
        ["backend", "mem"],
        ["wal", "repl"],
      ],
      chips: [
        ["change pages in memory: dirty", "pages dirty in memory"],
        ["append WAL, fsync, COMMIT OK", "WAL fsync, then OK"],
        ["later: checkpoints write pages", "pages written later"],
        ["crash: replay WAL from checkpoint", "crash: replay the WAL"],
      ],
      ctn: ["warn", "lit", "sky", "ok"],
      note: ["pages: 8 kB in PostgreSQL, 16 KB in InnoDB", "8 kB PG pages, 16 KB InnoDB"],
    },
    {
      k: ["how many commits a second?", "commits per second"],
      on: { app: 1, backend: "lit", wal: "lit" },
      sub: { wal: "~1 ms a flush" },
      fl: [
        ["app", "backend"],
        ["backend", "wal"],
      ],
      figs: [
        ["~1,000", ["one flush per commit", "1 flush each"], "warn"],
        ["~40,000", ["40 share each flush", "40 per flush"], "ok"],
        ["~600 ms", ["lost: sync commit off", "lost if async"], "bad"],
      ],
      note: ["1 ms a flush is an assumption: measure yours with pg_test_fsync", "measure with pg_test_fsync"],
    },
    {
      k: ["B-tree: update in place", "B-tree"],
      on: { backend: 1, mem: "lit", disk: "lit", idx: "lit" },
      sub: { mem: "internal pages", disk: "leaves, in place", idx: "orders PK" },
      fl: [
        ["backend", "mem"],
        ["mem", "disk"],
      ],
      figs: [
        ["4", ["levels for 1B rows", "levels, 1B rows"]],
        ["~22 GB", ["BIGINT leaf pages", "BIGINT leaves"], "sky"],
        ["62 MB", ["internal pages, cached", "internal, cached"], "ok"],
      ],
      note: ["a full leaf splits; sequential inserts leave pages ~15/16 full", "a full leaf splits in two"],
    },
    {
      k: ["LSM-tree: append, merge later", "LSM-tree"],
      kt: "ok",
      on: { app: 1, backend: 1, wal: "lit", mem: "lit", disk: "lit" },
      sub: { wal: "append", mem: "memtable", disk: "SSTs, L0 → Ln" },
      fl: [
        ["backend", "wal"],
        ["backend", "mem"],
        ["mem", "disk"],
      ],
      chips: [
        ["write: WAL + memtable in RAM", "WAL + memtable"],
        ["full: flush a sorted L0 SST", "flush to L0"],
        ["compaction: each level 10×", "levels grow 10×"],
        ["delete: a tombstone", "delete: a tombstone"],
        ["Bloom: 10 bits/key, ~1% false +", "Bloom: ~1% false +"],
        ["never updates in place", "never in place"],
      ],
      ctn: ["lit", "sky", "warn", "mute", "ok", "lit"],
    },
    {
      k: ["three amplifications", "amplification"],
      on: { mem: 1, disk: "warn" },
      fl: [["mem", "disk", "warn"]],
      figs: [
        ["33", ["LSM write amp, example", "LSM write amp"], "warn"],
        ["1.14", ["LSM space amp, example", "LSM space amp"], "sky"],
        ["~1", ["B-tree point-read I/O", "B-tree point read"], "ok"],
      ],
      note: ["LSM: big background writes · B-tree: small random ones on commit", "LSM: big writes, in background"],
    },
  ],
  indexes: [
    {
      k: ["what a secondary index points to", "secondary indexes"],
      on: { backend: 1, idx: "lit", disk: "lit" },
      sub: { idx: "secondary", disk: "heap or PK tree" },
      fl: [["idx", "disk"]],
      chips: [
        ["InnoDB: the primary key", "InnoDB: the PK"],
        ["PostgreSQL: a ctid (page, slot)", "PG: a ctid"],
        ["PG: a new version, every index", "PG: every index updated"],
        ["HOT: same page, no new entries", "HOT: no new entries"],
      ],
      ctn: ["sky", "lit", "warn", "ok"],
      note: ["Uber, 2016: index write amplification, a reason to leave PostgreSQL", "Uber, 2016: moved to MySQL"],
    },
    {
      k: ["equality first, then range", "composite, covering"],
      kt: "ok",
      on: { backend: 1, mem: 1, idx: "ok" },
      sub: { idx: "composite" },
      fl: [["backend", "mem", "ok"]],
      cols: 1,
      chips: [
        ["(user_id, created_at, id): one seek, 20 adjacent entries", "(user_id, created_at, id)"],
        ["INCLUDE (status, total): an index-only scan", "INCLUDE: index-only scan"],
        ["it skips the heap only on all-visible (vacuumed) pages", "only all-visible pages"],
      ],
      ctn: ["ok", "lit", "warn"],
    },
    {
      k: ["10:40 · an index on status", "an index on status"],
      kt: "warn",
      on: { app: 1, backend: 1, idx: "warn", disk: 1 },
      sub: { idx: "now six" },
      fl: [
        ["app", "backend"],
        ["idx", "disk", "warn"],
      ],
      chips: [
        ["every insert: one more tree", "+1 tree per insert"],
        ["status changes: no more HOT", "no more HOT updates"],
        ["delivered, 90%: a seq scan", "90%: a seq scan"],
        ["payment_pending, <1%: helps", "<1%: it helps"],
        ["better: a partial index", "a partial index"],
        ["add one when EXPLAIN uses it", "check EXPLAIN first"],
      ],
      ctn: ["bad", "warn", "mute", "ok", "ok", "sky"],
    },
    {
      k: ["EXPLAIN · an index on created_at only", "plan 1: wrong index"],
      kt: "bad",
      on: { backend: "bad", idx: "bad", disk: "bad" },
      sub: { idx: "created_at", disk: "1.3M pages read" },
      fl: [["idx", "disk", "bad"]],
      figs: [
        ["8.4 s", ["for 21 rows", "for 21 rows"], "bad"],
        ["3.2M", ["rows removed by filter", "removed by filter"], "bad"],
        ["1.3M", ["pages read from disk", "pages from disk"], "warn"],
      ],
      note: ["the giveaway: Rows Removed by Filter far above rows returned", "removed far above returned"],
    },
    {
      k: ["the right index, then a covering one", "plans 2 and 3"],
      kt: "ok",
      on: { backend: "ok", mem: "ok", idx: "ok" },
      sub: { mem: "5 pages, cached", idx: "Index Cond" },
      fl: [["backend", "mem", "ok"]],
      figs: [
        ["8.4 s", ["created_at index", "created_at only"], "bad"],
        ["1.4 ms", ["composite: 25 pages", "composite"], "sky"],
        ["0.08 ms", ["covering: Heap Fetches 0", "covering"], "ok"],
      ],
      note: ["illustrative numbers; Heap Fetches climbing means vacuum is behind", "illustrative numbers"],
    },
  ],
  iso: [
    {
      k: ["five anomalies (Berenson et al., 1995)", "five anomalies"],
      on: { app: "lit", backend: "lit" },
      fl: [["app", "backend"]],
      chips: [
        ["dirty read · 'paid', rolled back", "dirty read"],
        ["non-repeatable · ₹540, then ₹490", "non-repeatable read"],
        ["phantom · 118 orders, then 121", "phantom"],
        ["lost update · stock 1, two 0s", "lost update"],
        ["write skew · one coupon, twice", "write skew"],
        ["skew: no row written twice", "no row written twice"],
      ],
      ctn: ["mute", "sky", "sky", "bad", "bad", "warn"],
    },
    {
      k: ["10:00:30 · the last tin of ghee", "the last tin of ghee"],
      kt: "bad",
      on: { app: "lit", backend: "bad", mem: 1 },
      sub: { backend: "Read Committed", mem: "stock = 1" },
      fl: [
        ["app", "backend"],
        ["backend", "mem"],
      ],
      cols: 1,
      chips: [
        ["two checkouts SELECT stock: both read 1", "both read stock = 1"],
        ["both check stock >= 1 in Python", "both check in Python"],
        ["both UPDATE stock = 0 and commit: one tin, two paid orders", "both write 0: two orders"],
      ],
      ctn: ["sky", "warn", "bad"],
    },
    {
      k: ["what the defaults do", "the defaults"],
      on: { backend: "warn" },
      cols: 1,
      chips: [
        ["PostgreSQL Read Committed: both succeed, update lost", "PG Read Committed: lost"],
        ["PostgreSQL Repeatable Read: \"could not serialize access\"", "PG Repeatable Read: error"],
        ["MySQL InnoDB Repeatable Read: silently overwrites", "InnoDB Repeatable Read: lost"],
      ],
      ctn: ["bad", "warn", "bad"],
      note: ["read-then-write in app code loses updates on both defaults", "both defaults lose it"],
    },
    {
      k: ["two fixes that don't need the level", "the fixes"],
      kt: "ok",
      on: { app: 1, backend: "ok", locks: "ok", mem: 1 },
      sub: { locks: "FOR UPDATE", mem: "stock = 0" },
      fl: [
        ["backend", "locks", "ok"],
        ["backend", "mem", "ok"],
      ],
      cols: 1,
      chips: [
        ["UPDATE … SET stock = stock - 1 WHERE id = 7 AND stock >= 1", "SET stock = stock - 1 … AND stock >= 1"],
        ["0 rows affected: sold out", "0 rows: sold out"],
        ["or SELECT … FOR UPDATE: the second checkout waits, reads 0", "or FOR UPDATE: the second waits"],
      ],
      ctn: ["ok", "sky", "ok"],
    },
    {
      k: ["10:05 · write skew: the coupon", "write skew: the coupon"],
      kt: "warn",
      on: { app: "lit", backend: "warn", idx: "ok" },
      sub: { idx: "UNIQUE" },
      fl: [["app", "backend"]],
      cols: 1,
      chips: [
        ["phone and laptop both count earlier uses: 0", "both count uses: 0"],
        ["each inserts a use: no row written twice", "each inserts a different row"],
        ["UNIQUE (customer_id, coupon_code): the second insert fails", "UNIQUE (customer_id, coupon_code)"],
      ],
      ctn: ["warn", "bad", "ok"],
      note: ["no constraint fits? Serializable, and retry on 40001", "else Serializable + retry 40001"],
    },
  ],
  mvcc: [
    {
      k: ["PostgreSQL: versions in the table", "PostgreSQL MVCC"],
      on: { backend: 1, disk: "lit", vac: "ok" },
      sub: { disk: "heap tuples", vac: "removes v1" },
      fl: [["vac", "disk", "ok"]],
      chips: [
        ["v1 stock=1 · xmin 900, xmax 905", "v1 stock=1 · xmax 905"],
        ["v2 stock=0 · xmin 905, xmax 0", "v2 stock=0 · xmin 905"],
        ["readers and writers don't block", "no reader-writer blocks"],
        ["VACUUM: v1 once no one needs it", "VACUUM removes v1"],
      ],
      ctn: ["bad", "ok", "sky", "lit"],
    },
    {
      k: ["InnoDB: update in place, old in undo", "InnoDB MVCC"],
      on: { backend: 1, disk: "lit", vac: "ok" },
      sub: { disk: "row + undo log", vac: "purge" },
      fl: [["vac", "disk", "ok"]],
      chips: [
        ["row: stock=0 · DB_TRX_ID 905", "row: stock=0, trx 905"],
        ["DB_ROLL_PTR → undo: stock=1", "undo: stock=1, trx 900"],
        ["old snapshots walk the chain", "snapshots walk back"],
        ["purge when no snapshot needs it", "purge when unneeded"],
      ],
      ctn: ["ok", "bad", "sky", "lit"],
    },
    {
      k: ["06:00 → 14:00 · one open transaction", "an 8-hour transaction"],
      kt: "bad",
      on: { analyst: "bad", backend: 1, disk: "warn", vac: "bad" },
      sub: { disk: "old versions", vac: "blocked" },
      fl: [["analyst", "backend", "bad"]],
      chips: [
        ["PG: VACUUM can't remove them", "VACUUM can't clean"],
        ["InnoDB: the undo log grows", "InnoDB: undo grows"],
        ["users: everything slows", "everything slows"],
        ["alert on transaction age", "alert on txn age"],
        ["PG: idle-in-transaction timeout", "idle-txn timeout"],
        ["run exports on a replica", "exports on a replica"],
      ],
      ctn: ["bad", "bad", "warn", "ok", "ok", "ok"],
    },
    {
      k: ["freezing: 32-bit transaction IDs", "XID wraparound"],
      kt: "warn",
      on: { vac: "warn", disk: 1 },
      sub: { vac: "freezes old rows" },
      fl: [["vac", "disk", "warn"]],
      figs: [
        ["32-bit", ["transaction IDs", "transaction IDs"]],
        ["~4B", ["then the counter wraps", "then it wraps"], "bad"],
        ["200M", ["age that forces a VACUUM", "forced VACUUM"], "warn"],
      ],
      note: ["Notion, 2021: VACUUM stalled and wraparound loomed before it sharded", "Notion, 2021: VACUUM stalled"],
    },
    {
      k: ["pessimistic: SELECT … FOR UPDATE", "FOR UPDATE"],
      on: { app: "lit", backend: 1, locks: "lit", mem: 1 },
      sub: { locks: "row 7 held" },
      fl: [
        ["app", "backend"],
        ["backend", "locks"],
      ],
      chips: [
        ["the second checkout waits", "the second one waits"],
        ["NOWAIT: error, don't wait", "NOWAIT: error"],
        ["SKIP LOCKED: queue tables", "SKIP LOCKED: queues"],
        ["InnoDB: next-key range locks", "InnoDB: range locks"],
        ["short, no network calls inside", "short, no network"],
        ["lock rows in ID order", "lock in ID order"],
      ],
      ctn: ["lit", "sky", "sky", "warn", "ok", "ok"],
    },
    {
      k: ["optimistic: a version column", "version column"],
      kt: "ok",
      on: { app: "lit", backend: 1, mem: "ok" },
      sub: { mem: "price 48 · v18" },
      fl: [
        ["app", "backend"],
        ["backend", "mem"],
      ],
      cols: 1,
      chips: [
        ["A and B read price 45, version 17", "both read 45, version 17"],
        ["A: SET 48 WHERE version = 17 → 1 row, now 18", "A: 1 row, now version 18"],
        ["B: SET 42 WHERE version = 17 → 0 rows: 412, reload", "B: 0 rows → 412, reload"],
      ],
      ctn: ["sky", "ok", "bad"],
      note: ["the database half of Part 7's ETag and If-Match", "Part 7's ETag, in the database"],
    },
  ],
  ids: [
    {
      k: ["10:00:00 · random keys, random pages", "UUIDv4 inserts"],
      kt: "bad",
      on: { app: 1, backend: 1, ids: "bad", idx: "bad", mem: "warn", disk: "bad" },
      sub: { ids: "UUIDv4", idx: "40 GB, all hot", mem: "16 GB buffer", disk: "random reads" },
      fl: [
        ["app", "backend"],
        ["ids", "idx", "bad"],
        ["idx", "disk", "bad"],
      ],
      figs: [
        ["32 kB", ["hot: BIGINT, sequential", "BIGINT hot set"], "ok"],
        ["~40 GB", ["hot: UUIDv4 leaves", "UUIDv4 hot set"], "bad"],
        ["~3,000", ["disk reads/s, one index", "reads/s, 1 index"], "warn"],
      ],
      note: ["16 GB caches ~40% of leaves: ~60% of inserts read disk first", "~60% of inserts read first"],
    },
    {
      k: ["generating IDs", "ID schemes"],
      on: { ids: "lit", idx: 1 },
      fl: [["ids", "idx"]],
      chips: [
        ["BIGSERIAL: 8 B, one writer", "BIGSERIAL: one writer"],
        ["UUIDv4: 122 random bits", "UUIDv4: random"],
        ["UUIDv7: 48-bit ms, then random", "UUIDv7: time first"],
        ["Snowflake: 41 ms · 10 · 12 bits", "Snowflake: 64 bits"],
        ["ULID: 26 base32 characters", "ULID: 26 chars"],
        ["tickets: odd and even servers", "ticket servers"],
      ],
      ctn: ["warn", "bad", "ok", "ok", "sky", "mute"],
      note: ["Snowflake: 1,024 machines, 4,096 per ms each; needs NTP", "1,024 machines × 4,096 per ms"],
    },
    {
      k: ["the key, copied into 5 indexes (InnoDB)", "key bytes × 5 indexes"],
      on: { ids: "lit", idx: "lit", disk: 1 },
      sub: { idx: "5 secondary" },
      fl: [["ids", "idx"]],
      bars: [
        [["Snowflake BIGINT · 40 GB", "Snowflake · 40 GB"], 40, 180, "ok"],
        [["UUIDv7 BINARY(16) · 80 GB", "UUIDv7 · 80 GB"], 80, 180, "sky"],
        [["UUIDv4 CHAR(36) · 180 GB+", "UUIDv4 · 180 GB+"], 180, 180, "bad"],
      ],
      note: ["UUIDv4 also inserts rows at random leaves of the clustered index", "v4 also scatters the table"],
    },
    {
      k: ["choose from the access patterns", "choosing a store"],
      on: { app: "lit", backend: "lit" },
      fl: [["app", "backend"]],
      chips: [
        ["wallet ledger: relational, B-tree", "ledger: relational"],
        ["GPS, 200,000/s: LSM, by rider", "GPS 200k/s: LSM"],
        ["'%ghee%': a search index", "'%ghee%': search"],
        ["key lookups: key-value", "by key: key-value"],
        ["metrics: time-series", "metrics: time-series"],
        ["whole aggregates: document", "aggregates: document"],
      ],
      ctn: ["lit", "ok", "sky", "sky", "sky", "sky"],
      note: ["the default is relational; leave it for a pattern you can name", "default: relational"],
    },
    {
      k: ["what real companies chose", "real choices"],
      on: { backend: "lit", repl: 1, disk: 1 },
      figs: [
        ["480", ["Notion's shards, 32 DBs", "Notion shards"], "sky"],
        ["15 ms", ["Discord p99 on ScyllaDB", "Discord p99"], "ok"],
        ["151M", ["DynamoDB req/s, Prime Day", "DynamoDB req/s"], "lit"],
      ],
      note: ["Discord: 177 Cassandra nodes → 72 ScyllaDB, p99 40–125 → 15 ms", "177 Cassandra → 72 ScyllaDB"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "engines",
    label: "Engines",
    steps: [
      {
        caption:
          "Basketly's Diwali sale (illustrative): inserts climb from 2 to 40 ms, the last tin of ghee sells twice, one coupon is used twice, an unused index slows inserts, and by 14:00 orders has grown by a third. All five happen on one server.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A commit changes pages in memory and appends WAL records, then fsyncs the log; the dirty pages reach the data files later, at checkpoints. After a crash the WAL is replayed from the last checkpoint, and replicas apply the same log.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "At an assumed 1 ms a WAL flush, one flush per commit caps you near 1,000 commits a second. If 40 concurrent checkouts share each flush (group commit), it's ~40,000. synchronous_commit = off can lose ~600 ms of commits: data loss, not corruption.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A B-tree updates pages in place. A billion BIGINT keys fill ~2.8 million leaf pages (~22 GB) under three levels: depth 4, and the ~62 MB of internal pages stays cached. A full leaf splits into two half-full pages.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "An LSM-tree never updates in place: a write goes to the WAL and a sorted memtable, a full memtable flushes to an L0 SST file, and compaction merges into levels 10× bigger each. Deletes are tombstones; a Bloom filter at 10 bits a key gives about a 1% false-positive rate.",
        tween: 1600,
        loop: true,
      },
      {
        caption:
          "The costs: RocksDB's example write amplification is 1 + 2 + 10 + 10 + 10 = 33 and space amplification 1.14, while a B-tree point read is ~1 disk read. LSM's writes are large, sequential and in the background; a B-tree's are small, random and on the commit path.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "indexes",
    label: "Indexes",
    steps: [
      {
        caption:
          "An InnoDB secondary index stores the primary key, so a lookup searches two B-trees. PostgreSQL's stores a ctid, so a new row version needs new entries in every index, unless a HOT update fits on the same page. Uber cited this when it moved to MySQL in 2016.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Equality columns first, then the one range or sort column: (user_id, created_at, id) reads a user's newest orders as adjacent entries. INCLUDE (status, total) makes it covering, an index-only scan, which skips the heap only on pages the visibility map marks all-visible.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "At 10:40 ops indexes status. Every insert now maintains one more tree, and updates to status can't be HOT. For delivered (90% of rows) the planner prefers a sequential scan; for payment_pending (under 1%) a small partial index does the job.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "EXPLAIN (ANALYZE, BUFFERS) on the café's history page, with only an index on created_at: PostgreSQL walks orders backwards in time, removes 3.2 million rows by filter to return 21, and reads 1.3 million pages from disk in 8.4 seconds (illustrative output).",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "With (user_id, created_at DESC, id DESC) it's an Index Cond: one seek, 21 adjacent entries, 25 pages, 1.4 ms. Adding INCLUDE (status, total) makes it an Index Only Scan with Heap Fetches: 0 and five cached pages.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "iso",
    label: "Isolation",
    steps: [
      {
        caption:
          "Five anomalies on Basketly: a dirty read, a non-repeatable read, a phantom, and the two Berenson et al. added in 1995, lost update and write skew. Write skew is the hard one: no row is written twice, so row-level conflict checks never see it.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The last tin of ghee: two checkouts each SELECT stock and read 1, check stock >= 1 in Python, UPDATE stock = 0 and commit. Both succeed, a lost update: one tin, two paid orders.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "PostgreSQL's default, Read Committed, allows the lost update. At Repeatable Read the second writer gets \"could not serialize access\", so you need a retry loop. MySQL InnoDB's default Repeatable Read lets the UPDATE silently overwrite.",
        tween: 1400,
      },
      {
        caption:
          "Two fixes that don't depend on the level: a guarded atomic UPDATE (SET stock = stock - 1 WHERE id = 7 AND stock >= 1, where 0 rows means sold out), or SELECT … FOR UPDATE, so the second checkout waits and then reads 0.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The coupon is write skew: from a phone and a laptop, each checkout counts earlier uses, sees 0 and inserts a use. UNIQUE (customer_id, coupon_code) makes the second insert fail at any level; where no constraint fits, use Serializable and retry on 40001.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "mvcc",
    label: "MVCC & locks",
    steps: [
      {
        caption:
          "PostgreSQL keeps versions in the table: an UPDATE writes tuple v2 (stock=0, xmin 905) and sets xmax 905 on v1 (stock=1, xmin 900). Reading never blocks writing; VACUUM removes v1 once no snapshot could still see it.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "InnoDB updates the row in place (stock=0, DB_TRX_ID 905) and keeps the old version in the undo log behind DB_ROLL_PTR (stock=1, trx 900). Older snapshots walk the chain; purge discards undo once no read view needs it.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "An analyst's export opens a transaction at 06:00 and holds it. PostgreSQL's VACUUM can't remove versions that snapshot might see, InnoDB's undo grows, and everything slowly gets slower. Alert on transaction age, set idle_in_transaction_session_timeout, run exports on a replica.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "VACUUM also freezes old rows: transaction IDs are 32 bits, so after about 4 billion the counter wraps. Autovacuum forces a VACUUM on a table whose oldest unfrozen XID is 200 million old. Notion saw VACUUM stall with wraparound looming before it sharded.",
        tween: 1400,
      },
      {
        caption:
          "Pessimistic locking: SELECT … FOR UPDATE makes the second checkout wait for the row. NOWAIT errors instead, SKIP LOCKED suits queue-like tables, and InnoDB's next-key locks cover ranges. Keep it short, no network calls inside, rows locked in ID order.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Optimistic concurrency spans a manager's think time: both read price 45 at version 17; A's UPDATE … WHERE version = 17 hits 1 row and makes it 18, B's hits 0 rows and gets a conflict (412 at the API). It's the database half of Part 7's ETag.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "ids",
    label: "Choose & IDs",
    steps: [
      {
        caption:
          "Back to 10:00:00. A sequential BIGINT insert touches the index's right-hand path, 4 pages or 32 kB. A UUIDv4 lands on a random leaf of 5 million (~40 GB); with 16 GB of buffer, ~60% of inserts read from disk first: ~3,000 random reads a second at 5,000 inserts.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The ID schemes: auto-increment (8 bytes, one writer, gaps, leaks volume), UUIDv4 (122 random bits), UUIDv7 (48-bit milliseconds first, so it sorts by time), Snowflake (41 bits of time, 10 of machine, 12 of sequence), ULID, and Flickr's ticket servers.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "In InnoDB every secondary entry carries the primary key. Across five indexes and a billion rows: 40 GB for a Snowflake BIGINT, 80 GB for a BINARY(16) UUIDv7, at least 180 GB for a UUIDv4 as CHAR(36), which also scatters the table itself.",
        tween: 1600,
        loop: true,
      },
      {
        caption:
          "Choose from the queries and invariants. The wallet ledger needs transactions and range reads: relational, a B-tree. A rider GPS stream at 200,000 points a second suits an LSM store partitioned by rider. LIKE '%ghee%' needs a search index fed from the primary store.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Notion stayed on PostgreSQL with 480 logical shards on 32 databases. Discord moved messages from 177 Cassandra nodes to 72 ScyllaDB nodes, p99 reads 40–125 ms down to 15 ms. Amazon's own DynamoDB traffic peaked at 151 million requests a second on Prime Day 2025.",
        tween: 1400,
        loop: true,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
