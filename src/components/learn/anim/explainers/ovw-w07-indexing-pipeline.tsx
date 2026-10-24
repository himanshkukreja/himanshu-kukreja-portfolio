/**
 * Whole-lesson overview (week 7, day 2 · indexing pipeline): the freshness problem (PostgreSQL
 * says $150, search still says $120) and why dual-write fails (failed writes, crashes, partitions,
 * reordering); the CDC pipeline (WAL → Debezium → Kafka → indexing pipeline → Elasticsearch, bulk
 * batches of 500, 3 retries then dlq.products, lag); and bulk imports (1M at 100/s ≈ 3 hours vs a
 * separate rate-limited bulk indexer) and zero-downtime reindexing behind the "products" alias.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const BX = (i: number) => 16 + i * 97;
const CX = (i: number) => BX(i) + BW / 2;
const BY = 130;
const BW = 86;
const BH = 52;
const NODES: [string, string][] = [
  ["App", "App"],
  ["Postgres", "PG"],
  ["Debezium", "CDC"],
  ["Kafka", "Kafka"],
  ["Pipeline", "Index"],
  ["Elastic", "ES"],
];

function Chain({ narrow, tone, dim }: { narrow: boolean; tone: (i: number) => Tone; dim: (i: number) => boolean }) {
  return (
    <g>
      {NODES.map(([w, n], i) => (
        <g key={w}>
          {i > 0 && <Wire d={`M${BX(i - 1) + BW} ${BY + BH / 2}H${BX(i)}`} arrow tone={tone(i) === "lit" && tone(i - 1) === "lit" ? "lit" : undefined} opacity={dim(i) || dim(i - 1) ? 0.3 : 1} />}
          <Box x={BX(i)} y={BY} w={BW} h={BH} label={narrow ? n : w} tone={tone(i)} dim={dim(i)} />
        </g>
      ))}
    </g>
  );
}

function Note({ i, a, b, tone, o = 1 }: { i: number; a: string; b?: string; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <Txt x={CX(i)} y={b ? 84 : 106} k="s" tone={tone}>
        {a}
      </Txt>
      {b && (
        <Txt x={CX(i)} y={108} k="s">
          {b}
        </Txt>
      )}
    </g>
  );
}

function Chip({ x, y, w, label, tone, o = 1 }: { x: number; y: number; w: number; label: string; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={x} y={y} width={w} height={28} />
      <Txt x={x + w / 2} y={y + 19} k="s" tone={tone}>
        {label}
      </Txt>
    </g>
  );
}

function Val({ i, v, s, tone }: { i: number; v: string; s: string; tone: Tone }) {
  return (
    <g>
      <Txt x={CX(i)} y={216} tone={tone}>
        {v}
      </Txt>
      <Txt x={CX(i)} y={238} k="s" tone={tone}>
        {s}
      </Txt>
    </g>
  );
}

const FAILS: [string, string][] = [
  ["ES write fails", "ES write fails"],
  ["crash in between", "crash between"],
  ["connections exhausted", "pool exhausted"],
];

function Problem({ step, t, narrow }: SceneProps) {
  const mid = (i: number) => i >= 2 && i <= 4;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {[narrow ? "the freshness problem" : "the freshness problem · Nike Air Max", "naive fix: dual-write", "order of operations"][step]}
      </Txt>
      {step >= 1 && <Wire d={`M${CX(0)} ${BY}V62H${CX(5)}V${BY}`} tone="bad" dash arrow />}
      {step >= 1 && (
        <Txt x={W / 2} y={56} k="s" tone="bad">
          {narrow ? "app also writes ES" : "the app writes Elasticsearch too"}
        </Txt>
      )}
      <Chain narrow={narrow} tone={(i) => (i === 1 ? "ok" : i === 5 ? "bad" : i === 0 ? "lit" : undefined)} dim={mid} />
      {step === 0 && (
        <g>
          <Val i={1} v="$150" s="10:00 update" tone="ok" />
          <Val i={5} v="$120" s="stale" tone="bad" />
          <Txt x={W / 2} y={286} k="s" tone="bad" opacity={seg(t, 0.4, 1)}>
            {narrow ? "sees $120, pays $150" : "10:00:01 the customer sees $120, checkout says $150"}
          </Txt>
        </g>
      )}
      {step === 1 && (
        <g>
          <Val i={1} v="$150" s="written" tone="ok" />
          <Val i={5} v="$120" s="failed" tone="bad" />
          {FAILS.map(([w, n], i) => (
            <Chip key={w} x={16 + i * 194} y={262} w={180} label={narrow ? n : w} tone="bad" o={seg(t, i * 0.2, i * 0.2 + 0.4)} />
          ))}
        </g>
      )}
      {step === 2 && (
        <g>
          <Val i={1} v="A then B" s="$120 ✓" tone="ok" />
          <Val i={5} v="B then A" s="$100 ✗" tone="bad" />
          <Token x={lerp(CX(0), CX(1), seg(t, 0, 0.5))} y={BY - 18} s={10} tone="ok" label={narrow ? undefined : "A $100"} opacity={1 - seg(t, 0.5, 0.6)} />
          <Txt x={W / 2} y={286} k="s" tone="bad" opacity={seg(t, 0.5, 1)}>
            {narrow ? "retries reorder writes" : "A sets $100, B sets $120: retries apply them out of order"}
          </Txt>
        </g>
      )}
    </g>
  );
}

const WAL = { x: BX(1), y: 228, w: BW, h: 40 };

function Cdc({ step, t, clock, narrow }: SceneProps) {
  const p = (seg(t, 0, 0.9) + clock * 0.35) % 1;
  const lit = (i: number) => (step === 0 ? i <= 1 : step === 1 ? i === 2 : step === 2 ? i === 3 : step === 3 ? i === 4 : i >= 4);
  const tok =
    step === 0
      ? { x: lerp(BX(0) + BW, BX(1), p), y: BY + BH / 2 }
      : step === 1
        ? { x: lerp(BX(1) + BW, BX(2), p), y: lerp(248, BY + BH, p) }
        : step === 2
          ? { x: lerp(BX(2) + BW, BX(3), p), y: BY + BH / 2 }
          : null;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "change data capture" : "change data capture · one source of truth"}
      </Txt>
      <Chain narrow={narrow} tone={(i) => (lit(i) ? "lit" : undefined)} dim={() => false} />
      <Wire d={`M${CX(1)} ${BY + BH}V${WAL.y}`} tone={step === 0 ? "lit" : undefined} arrow />
      <Box {...WAL} label="WAL" tone={step <= 1 ? "lit" : undefined} />
      <Wire d={`M${WAL.x + BW} 248H${CX(2)}V${BY + BH}`} tone={step === 1 ? "lit" : undefined} arrow />
      {step === 0 && <Note i={1} a={narrow ? "the only write" : "the app's only write"} b={narrow ? "→ WAL" : "every change → WAL"} tone="lit" />}
      {step === 1 && <Note i={2} a={narrow ? "reads the WAL" : "logical replication"} b={narrow ? "c · u · d" : "events: c · u · d"} tone="lit" />}
      {step === 2 && <Note i={3} a={narrow ? "ordered" : "ordered per partition"} b={narrow ? "replayable" : "persisted, replayable"} tone="lit" />}
      {step === 3 && (
        <g>
          <Note i={4} a={narrow ? "bulk" : "bulk request"} b={narrow ? "500 / 5 s" : "500 docs or 5 s"} tone="lit" />
          <Meter x={BX(4)} y={200} w={BW} h={12} value={lerp(0.1, 1, seg(t, 0.1, 0.9))} max={1} ticks={5} />
          <Txt x={CX(4)} y={232} k="s">
            {narrow ? "batch" : "batch → ES"}
          </Txt>
        </g>
      )}
      {step === 4 && (
        <g>
          <Note i={4} a={narrow ? "3 retries" : "3 retries, then"} b={narrow ? "then DLQ" : "dead-letter queue"} tone="bad" />
          <Wire d={`M${CX(4)} ${BY + BH}V228`} tone="bad" arrow />
          <Box x={BX(4) - 14} y={228} w={BW + 28} h={40} label="DLQ" sub={narrow ? undefined : "dlq.products"} tone="bad" />
          <Meter x={BX(5)} y={200} w={BW} h={12} value={lerp(0.2, 0.45, seg(t, 0.2, 0.9))} max={1} tone="warn" />
          <Txt x={CX(5)} y={232} k="s" tone="warn">
            {narrow ? "lag" : "lag 45s"}
          </Txt>
        </g>
      )}
      {tok && <Token {...tok} s={10} tone="lit" />}
    </g>
  );
}

const BULK = { x: BX(3), y: 236, w: BW * 2 + 15, h: 44 };
const V1 = { x: 420, y: 204, w: 164, h: 34 };
const V2 = { x: 420, y: 254, w: 164, h: 34 };

function Bulk({ step, t, narrow }: SceneProps) {
  const alias = step >= 2;
  const a = seg(t, 0.2, 0.8);
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {[narrow ? "1M-product import" : "a vendor import: 1M products", "a separate bulk indexer", "a mapping change", "atomic alias switch"][step]}
      </Txt>
      <Chain
        narrow={narrow}
        tone={(i) => (step === 0 ? (i >= 1 ? "warn" : undefined) : step === 1 ? (i === 5 ? "lit" : undefined) : i === 0 || i === 5 ? "lit" : undefined)}
        dim={(i) => alias && i > 0 && i < 5}
      />
      {step === 0 && (
        <g>
          <Txt x={W / 2} y={92} k="d" tone="warn" opacity={seg(t, 0.4, 1)}>
            ≈ 3 hours
          </Txt>
          <Txt x={W / 2} y={116} k="s">
            {narrow ? "1M ÷ 100/s" : "1M ÷ ~100/s through CDC = 10,000 s"}
          </Txt>
          <Meter x={BX(1)} y={214} w={BX(5) + BW - BX(1)} h={12} value={lerp(0, 0.25, seg(t, 0.1, 1))} max={1} tone="warn" />
          <Txt x={W / 2} y={252} k="s" tone="warn">
            {narrow ? "new products unfindable" : "users search for products not indexed yet"}
          </Txt>
        </g>
      )}
      {step === 1 && (
        <g opacity={lerp(0.3, 1, a)}>
          <Wire d={`M${CX(1)} ${BY + BH}V258H${BULK.x}`} tone="lit" arrow />
          <Wire d={`M${BULK.x + BULK.w} 258H${CX(5)}V${BY + BH}`} tone="lit" arrow />
          <Box {...BULK} label={narrow ? "Bulk" : "Bulk indexer"} tone="lit" />
          <Txt x={W / 2} y={84} k="s" tone="lit">
            {narrow ? "≤ 5,000/s · 4 workers" : "rate-limited: ≤ 5,000/s · 4 workers · batches of 1,000"}
          </Txt>
          <Txt x={W / 2} y={108} k="s">
            {narrow ? "resumable" : "resumable · separate from the CDC pipeline"}
          </Txt>
        </g>
      )}
      {alias && (
        <g>
          <Wire d={`M${CX(0)} ${BY + BH}V246H240`} tone="lit" arrow />
          <Box x={240} y={226} w={130} h={40} label="products" tone="lit" />
          <Wire d={`M370 246C395 246 395 ${step === 2 ? 221 : 271} 420 ${step === 2 ? 221 : 271}`} tone="lit" arrow />
          <Chip x={V1.x} y={V1.y + 3} w={V1.w} label="products_v1" tone={step === 2 ? "lit" : "mute"} o={step === 3 ? lerp(1, 0.45, a) : 1} />
          <Chip x={V2.x} y={V2.y + 3} w={V2.w} label={step === 2 && !narrow ? "products_v2 · new" : "products_v2"} tone={step === 3 ? "ok" : undefined} o={step === 2 ? seg(t, 0.3, 0.8) : 1} />
          <Txt x={W / 2} y={step === 2 ? 84 : 96} k="s" tone={step === 2 ? "warn" : "ok"}>
            {step === 2
              ? narrow
                ? "can't edit field mappings"
                : "existing field mappings can't change: build a new index"
              : narrow
                ? "one atomic call"
                : "one atomic update_aliases call · v1 deleted after checks"}
          </Txt>
          {step === 2 && (
            <Txt x={W / 2} y={108} k="s">
              {narrow ? "app reads the alias" : "the app only knows the alias"}
            </Txt>
          )}
        </g>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "problem" ? <Problem {...p} /> : p.variant === "cdc" ? <Cdc {...p} /> : <Bulk {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "The problem",
      steps: [
        {
          caption: "At 10:00 PostgreSQL updates Nike Air Max to $150, but search still says $120. The customer sees $120 and pays $150.",
          tween: 1200,
        },
        {
          caption: "The naive fix is dual-write: the app writes both. If the ES write fails or the process crashes in between, they disagree.",
          tween: 1400,
        },
        {
          caption: "Ordering breaks too: A sets $100, then B sets $120. Retries can apply B then A in Elasticsearch, leaving $100.",
          tween: 1600,
        },
      ],
    },
    {
      id: "cdc",
      label: "CDC pipeline",
      steps: [
        {
          caption: "With CDC the app writes only to PostgreSQL, the single source of truth. Every change lands in the write-ahead log.",
          tween: 1400,
          loop: true,
        },
        {
          caption: "Debezium reads the WAL through logical replication and publishes create, update and delete events to Kafka.",
          tween: 1400,
          loop: true,
        },
        {
          caption: "Kafka persists the events and keeps them in order per partition, so they can be replayed.",
          tween: 1400,
          loop: true,
        },
        {
          caption: "The indexing pipeline consumes them, transforms them into search documents and sends bulk requests of 500, or every 5 s.",
          tween: 1600,
        },
        {
          caption: "Failed documents are retried 3 times, then go to dlq.products. Watch the lag: how far the index is behind.",
          tween: 1400,
        },
      ],
    },
    {
      id: "bulk",
      label: "Bulk & reindex",
      steps: [
        {
          caption: "A vendor imports 1 million products. Through CDC at about 100 a second that takes 10,000 seconds: about 3 hours.",
          tween: 1600,
        },
        {
          caption: "A separate bulk indexer handles it: rate-limited to protect the cluster, 4 workers, resumable, without starving CDC.",
          tween: 1400,
        },
        {
          caption: "Changing an existing field's mapping means a new index. The app searches the products alias, which points to products_v1.",
          tween: 1400,
        },
        {
          caption: "Fill products_v2, then one atomic alias switch moves searches to it. v1 is deleted after verification.",
          tween: 1400,
        },
      ],
    },
  ],
  Scene,
});
