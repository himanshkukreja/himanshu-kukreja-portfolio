/**
 * Whole-lesson overview (week 8, day 5 · query layer and optimization): the crisis (a 90-day
 * dashboard query scans 2.7B rows, shuffles 50GB, takes 47 seconds), engine choice by access
 * pattern, reading less (partition pruning, clustering, column pruning), computing once (rollups,
 * caching with TTLs that match freshness), and multi-tenant isolation, quotas and measuring first.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const CX = 12;
const CW = 104;
const QX = 146;
const QW = 160;
const QY = 60;
const QH = 60;
const TX = 340;
const TW = 248;
const TY = (i: number) => 52 + i * 36;
const TH = 30;
const TABLES: [string, string, string][] = [
  ["fact_sales", "fact_sales", "~11B rows"],
  ["agg_hourly_sales", "hourly", "8.7M"],
  ["agg_daily_sales", "daily", "365K"],
  ["agg_monthly_sales", "monthly", "12K"],
];

type Tn = Tone | "dim";

function Tables({ tones, narrow }: { tones: Tn[]; narrow: boolean }) {
  return (
    <g>
      {TABLES.map(([w, n, size], i) => (
        <g key={w} opacity={tones[i] === "dim" ? 0.32 : 1}>
          <rect className={`ax-box${tones[i] && tones[i] !== "dim" ? ` ${tones[i]}` : ""}`} x={TX} y={TY(i)} width={TW} height={TH} />
          <Txt x={TX + 8} y={TY(i) + 20} k="s" anchor="start" tone={tones[i] === "dim" ? undefined : tones[i]}>
            {narrow ? n : w}
          </Txt>
          <Txt x={TX + TW - 8} y={TY(i) + 20} k="s" anchor="end">
            {size}
          </Txt>
        </g>
      ))}
    </g>
  );
}

/** client → (query service) → table row r; p in 0..1 */
function route(r: number, p: number, direct: boolean) {
  const a = { x: CX + CW, y: QY + QH / 2 };
  const b = { x: QX + QW, y: QY + QH / 2 };
  const c = { x: TX, y: TY(r) + TH / 2 };
  if (direct) return { x: lerp(a.x, c.x, p), y: lerp(a.y, c.y, p) };
  return p < 0.5 ? { x: lerp(a.x, b.x, p * 2), y: a.y } : { x: lerp(b.x, c.x, p * 2 - 1), y: lerp(b.y, c.y, p * 2 - 1) };
}

function Frame({ narrow, target, direct, svc, svcTone, tables, client, tone }: { narrow: boolean; target: number; direct?: boolean; svc?: string; svcTone?: Tone; tables: Tn[]; client?: string; tone?: Tone }) {
  return (
    <g>
      {client !== "" && <Box x={CX} y={QY} w={CW} h={QH} label={client || (narrow ? "Dash" : "Dashboard")} tone={tone} />}
      {direct ? (
        <Wire d={`M${CX + CW} ${QY + QH / 2}L${TX} ${TY(target) + TH / 2}`} tone="bad" arrow />
      ) : (
        <g>
          <Wire d={`M${CX + CW} ${QY + QH / 2}H${QX}`} arrow />
          <Wire d={`M${QX + QW} ${QY + QH / 2}L${TX} ${TY(target) + TH / 2}`} tone="lit" arrow />
          <Box x={QX} y={QY} w={QW} h={QH} label={narrow ? "Query svc" : "Query service"} sub={svc} tone={svcTone} />
        </g>
      )}
      <Tables narrow={narrow} tones={tables} />
    </g>
  );
}

function Fig({ x, y, d, s, tone, o = 1 }: { x: number; y: number; d: string; s: string; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <Txt x={x} y={y} k="d" tone={tone}>
        {d}
      </Txt>
      <Txt x={x} y={y + 24} k="s">
        {s}
      </Txt>
    </g>
  );
}

function Crisis({ step, t, clock, narrow }: SceneProps) {
  const p = step === 0 ? seg(t, 0.1, 0.9) : (clock * 0.5) % 1;
  const engines: [string, string][] = [
    ["10 users, daily refresh → Snowflake or BigQuery", "10 users → BigQuery"],
    ["10K users, real-time → ClickHouse or Druid", "10K live → ClickHouse"],
    ["ad-hoc across the data lake → Trino", "ad-hoc lake → Trino"],
  ];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {step === 3 ? (narrow ? "match the engine" : "match the engine to the access pattern") : narrow ? "90 days · no query layer" : "revenue by category, region, day · 90 days"}
      </Txt>
      <Frame narrow={narrow} target={0} direct={step < 3} tables={step < 3 ? ["bad", "dim", "dim", "dim"] : ["dim", "dim", "dim", "dim"]} svc={step === 3 ? "routes" : undefined} tone={step === 1 || step === 2 ? "bad" : undefined} />
      {step < 3 && <Token {...route(0, step === 0 ? p : step === 1 ? seg(t, 0, 1) : p, true)} s={10} tone="bad" />}
      {step === 1 && (
        <g>
          <Fig x={110} y={244} d="2.7B" s="rows scanned" o={seg(t, 0.1, 0.4)} tone="bad" />
          <Fig x={300} y={244} d="50GB" s="shuffled" o={seg(t, 0.35, 0.65)} tone="bad" />
          <Fig x={490} y={244} d="47 s" s={narrow ? "times out" : "dashboard times out"} o={seg(t, 0.6, 0.9)} tone="bad" />
        </g>
      )}
      {step === 2 && (
        <g>
          <Txt x={W / 2} y={232} k="t" tone="bad">
            {narrow ? "$50K/month, still slow" : "“We're paying $50K/month and it's still slow”"}
          </Txt>
          <Txt x={W / 2} y={266} k="s">
            {narrow ? "the query layer is broken" : "the pipeline works perfectly · the query layer is broken"}
          </Txt>
        </g>
      )}
      {step === 3 &&
        engines.map(([w, n], i) => (
          <g key={w} opacity={seg(t, i * 0.2, i * 0.2 + 0.4)}>
            <rect className={`ax-box${i === 1 ? " lit" : ""}`} x={24} y={206 + i * 34} width={552} height={28} />
            <Txt x={W / 2} y={225 + i * 34} k="s" tone={i === 1 ? "lit" : undefined}>
              {narrow ? n : w}
            </Txt>
          </g>
        ))}
    </g>
  );
}

const FILES = ["ACBADCBACD", "BADCABCDAB"];
const SORTED = ["AAAAABBBBB", "CCCCDDDDDD"];

function ReadLess({ step, t, narrow }: SceneProps) {
  const bx = 24;
  const bw = 552;
  const sorted = seg(t, 0.2, 0.7) >= 1;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {[narrow ? "partition by date" : "partition by date · skip files", narrow ? "no partition filter" : "no partition filter · full scan", narrow ? "cluster in a partition" : "cluster rows inside partitions", narrow ? "read only needed columns" : "column pruning · no SELECT *"][step]}
      </Txt>
      <Frame narrow={narrow} target={0} svc={["pruning", narrow ? "no pruning" : "nothing to prune", "clustered", "3 columns"][step]} svcTone={step === 1 ? "bad" : "ok"} tables={[step === 1 ? "bad" : "ok", "dim", "dim", "dim"]} />
      {step <= 1 && (
        <g>
          <rect className="ax-box" x={bx} y={214} width={bw} height={36} />
          <rect className={`ax-fill ${step === 1 ? "bad" : "ok"}`} x={bx} y={214} width={step === 1 ? bw * seg(t, 0, 0.8) : (bw * 31) / 365} height={36} opacity={0.7} />
          <Txt x={bx} y={206} k="s" anchor="start">
            {narrow ? "365 daily partitions" : "fact_sales/date=… · 365 daily partitions"}
          </Txt>
          <Txt x={step === 1 ? W / 2 : bx + (bw * 31) / 365 + 10} y={276} k="s" anchor={step === 1 ? "middle" : "start"} tone={step === 1 ? "bad" : "ok"}>
            {step === 1 ? (narrow ? "10TB, not 10GB" : "scans 10TB instead of 10GB · 1,000x the cost") : narrow ? "January: 31 read, 334 skipped" : "WHERE January → read 31 partitions, skip 334"}
          </Txt>
        </g>
      )}
      {step === 2 &&
        [0, 1].map((f) => (
          <g key={f} opacity={sorted && f === 1 ? 0.35 : 1}>
            <Txt x={30 + f * 280 + 130} y={208} k="s" tone={sorted ? (f === 0 ? "ok" : "mute") : "bad"}>
              {sorted ? (f === 0 ? "File 1 · read" : "File 2 · skipped") : `File ${f + 1} · read`}
            </Txt>
            {(sorted ? SORTED : FILES)[f].split("").map((c, i) => (
              <g key={i}>
                <rect className={`ax-box${c === "A" ? (sorted ? " ok" : " bad") : ""}`} x={30 + f * 280 + i * 26} y={218} width={24} height={30} />
                <Txt x={30 + f * 280 + i * 26 + 12} y={239} k="s" tone={c === "A" ? (sorted ? "ok" : "bad") : undefined}>
                  {c}
                </Txt>
              </g>
            ))}
          </g>
        ))}
      {step === 2 && (
        <Txt x={W / 2} y={282} k="s">
          WHERE category = &apos;A&apos;
        </Txt>
      )}
      {step === 3 && (
        <g>
          {Array.from({ length: 50 }, (_, i) => (
            <rect key={i} className={`ax-fill${i < 3 ? " ok" : ""}`} x={bx + i * 11.04} y={214} width={9} height={44} opacity={i < 3 ? 1 : lerp(1, 0.18, seg(t, 0.2, 0.8))} />
          ))}
          <Txt x={bx} y={206} k="s" anchor="start">
            {narrow ? "fact_sales · 50 columns" : "SELECT * reads all 50 columns of fact_sales"}
          </Txt>
          <Txt x={bx} y={282} k="s" anchor="start" tone="ok">
            {narrow ? "date, revenue, quantity" : "SELECT date, revenue, quantity → 3 columns"}
          </Txt>
        </g>
      )}
    </g>
  );
}

function Once({ step, t, clock, narrow }: SceneProps) {
  const p = step === 2 ? (clock * 0.6) % 0.5 : seg(t, 0.1, 0.9);
  const route3 = [2, 2, 2, 2][step];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {[narrow ? "pre-aggregate" : "pre-aggregate what's predictable", narrow ? "route to a rollup" : "route to the coarsest rollup that fits", narrow ? "cache results" : "cache: one scan, many hits", narrow ? "TTL = freshness" : "TTL matches data freshness"][step]}
      </Txt>
      <Frame
        narrow={narrow}
        target={route3}
        svc={["rollup", "rewrite", "cache hit", "TTL"][step]}
        svcTone={step === 2 ? "ok" : "lit"}
        client={step === 2 ? (narrow ? "50 users" : "50 people") : undefined}
        tables={step === 1 ? ["dim", "lit", "ok", "lit"] : step === 2 ? ["dim", "dim", "dim", "dim"] : ["dim", "dim", "ok", "dim"]}
      />
      {step !== 2 && <Token {...route(route3, p, false)} s={10} tone="ok" />}
      {step === 2 && <Token {...route(0, p, false)} s={10} tone="ok" />}
      {step === 0 && (
        <g>
          <Fig x={150} y={244} d="45 s" s={narrow ? "raw scan" : "from raw facts"} tone="bad" />
          <Fig x={340} y={244} d="50 ms" s={narrow ? "daily rollup" : "from the daily rollup"} tone="ok" o={seg(t, 0.5, 0.9)} />
          {!narrow && (
            <Txt x={W - 12} y={300} k="s" anchor="end">
              100+ times a day → rollup · 2–3 a month → on demand
            </Txt>
          )}
        </g>
      )}
      {step === 1 &&
        (narrow
          ? ["24h by hour → hourly", "90 days by day → daily", "2 years by month → monthly"]
          : ["last 24 hours by hour → agg_hourly_sales", "last 90 days by day → agg_daily_sales", "last 2 years by month → agg_monthly_sales"]
        ).map((s, i) => (
          <Txt key={s} x={24} y={222 + i * 26} k="s" anchor="start" tone={i === 1 ? "ok" : "lit"} opacity={seg(t, i * 0.2, i * 0.2 + 0.4)}>
            {s}
          </Txt>
        ))}
      {step === 1 && (
        <Txt x={24} y={300} k="s" anchor="start" opacity={seg(t, 0.7, 1)}>
          {narrow ? "raw only for drill-downs" : "raw fact_sales only to drill into transactions"}
        </Txt>
      )}
      {step === 2 && (
        <g>
          <Fig x={160} y={246} d="1 scan" s={narrow ? "first load" : "the first load"} tone="lit" />
          <Fig x={420} y={246} d="49 hits" s={narrow ? "from Redis" : "served from Redis"} tone="ok" />
        </g>
      )}
      {step === 3 &&
        (
          [
            ["real-time · 60 s", 60 / 3600, "ok"],
            ["historical · 3600 s", 1, "ok"],
            [narrow ? "everything 24 h ✗" : "everything for 24 h ✗ stale", 1, "bad"],
          ] as [string, number, Tone][]
        ).map(([l, f, tn], i) => (
          <g key={l} opacity={seg(t, i * 0.25, i * 0.25 + 0.35)}>
            <Txt x={24} y={220 + i * 30} k="s" anchor="start" tone={tn}>
              {l}
            </Txt>
            <rect className="ax-meter" x={330} y={208 + i * 30} width={246} height={14} />
            <rect className={`ax-fill ${tn}`} x={330} y={208 + i * 30} width={Math.max(4, (i === 2 ? 246 : 120) * f)} height={14} />
          </g>
        ))}
    </g>
  );
}

const TEN = ["tenant_a", "tenant_b", "tenant_c"];
const TEN_Y = (i: number) => 52 + i * 40;

function Tenants({ step, t, clock, narrow }: SceneProps) {
  const pats: [string, string, number][] = [
    ["row-level · tenant_id", "tenant_id", 0.3],
    ["schema per tenant", "schema", 0.65],
    ["database per tenant", "database", 1],
  ];
  const quotas: [string, string][] = [
    ["10", "concurrent"],
    ["100GB", "per day"],
    ["300 s", "timeout"],
  ];
  const pipe = ["cache", "quota", "rewrite", "execute"];
  const q = (clock * 0.5 + t) % 1;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {[narrow ? "isolate tenants" : "tenant isolation patterns", narrow ? "per-tenant quotas" : "per-tenant quotas stop noisy neighbours", narrow ? "measure first" : "measure first, then the full pipeline"][step]}
      </Txt>
      {TEN.map((n, i) => (
        <g key={n}>
          <rect className={`ax-box${step === 1 && i === 1 ? " bad" : ""}`} x={CX} y={TEN_Y(i)} width={CW} height={32} />
          <Txt x={CX + CW / 2} y={TEN_Y(i) + 21} k="s" tone={step === 1 && i === 1 ? "bad" : undefined}>
            {n}
          </Txt>
          <Wire d={`M${CX + CW} ${TEN_Y(i) + 16}L${QX} ${QY + QH / 2}`} tone={step === 1 && i === 1 ? "bad" : undefined} />
        </g>
      ))}
      <Frame narrow={narrow} target={step === 2 ? 2 : 0} client="" svc={["tenant_id =", "quota", "rewrite"][step]} svcTone={step === 1 ? "bad" : "lit"} tables={step === 2 ? ["dim", "dim", "ok", "dim"] : ["lit", "dim", "dim", "dim"]} />
      {step === 1 && [0, 1, 2].map((k) => <Token key={k} x={lerp(CX + CW, QX, (q + k / 3) % 1)} y={lerp(TEN_Y(1) + 16, QY + QH / 2, (q + k / 3) % 1)} s={8} tone="bad" />)}
      {step === 1 && (
        <Txt x={QX + QW / 2} y={QY + QH + 22} k="s" tone="bad">
          {narrow ? "rejected" : "quota exceeded → rejected"}
        </Txt>
      )}
      {step === 0 &&
        pats.map(([w, n, f], i) => (
          <g key={w} opacity={seg(t, i * 0.2, i * 0.2 + 0.4)}>
            <Txt x={24} y={226 + i * 28} k="s" anchor="start" tone={i === 0 ? "lit" : undefined}>
              {narrow ? n : w}
            </Txt>
            <rect className="ax-meter" x={narrow ? 150 : 250} y={214 + i * 28} width={narrow ? 300 : 230} height={14} />
            <rect className={`ax-fill${i === 0 ? "" : " sky"}`} x={narrow ? 150 : 250} y={214 + i * 28} width={(narrow ? 300 : 230) * f} height={14} />
          </g>
        ))}
      {step === 0 && (
        <Txt x={W - 12} y={304} k="s" anchor="end">
          {narrow ? "more isolation, more cost" : "isolation (and cost) grows →"}
        </Txt>
      )}
      {step === 1 &&
        quotas.map(([d, s], i) => (
          <g key={d} opacity={seg(t, i * 0.2, i * 0.2 + 0.4)}>
            <rect className="ax-box" x={24 + i * 188} y={214} width={176} height={70} />
            <Txt x={24 + i * 188 + 88} y={244} k="t" tone="lit">
              {d}
            </Txt>
            <Txt x={24 + i * 188 + 88} y={268} k="s">
              {s}
            </Txt>
          </g>
        ))}
      {step === 2 && (
        <g>
          <Txt x={24} y={222} k="s" anchor="start" tone="lit">
            {narrow ? "top 10 queries: 70% of cost" : "query log: the top 10 queries are 70% of time and cost"}
          </Txt>
          {pipe.map((s, i) => {
            const w = 552 / pipe.length;
            return (
              <g key={i} opacity={seg(t, 0.2 + i * 0.12, 0.4 + i * 0.12)}>
                <rect className="ax-box ok" x={24 + i * w} y={238} width={w - 8} height={32} />
                <Txt x={24 + i * w + (w - 8) / 2} y={259} k="s" tone="ok">
                  {s}
                </Txt>
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "crisis" ? <Crisis {...p} /> : p.variant === "less" ? <ReadLess {...p} /> : p.variant === "once" ? <Once {...p} /> : <Tenants {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "crisis",
      label: "The crisis",
      steps: [
        { caption: "Marketing asks for revenue by category, region and day over 90 days, and the query goes straight to fact_sales: ~11B rows.", tween: 1400 },
        { caption: "Even with the date filter it scans 2.7 billion rows and shuffles 50GB. It takes 47 seconds, and the dashboard times out.", tween: 2000, loop: true },
        { caption: "We're paying $50K a month and it's still slow. The pipeline works perfectly: the query layer is broken.", tween: 900, loop: true },
        { caption: "First, match the engine to the access pattern: a warehouse for 10 daily users, ClickHouse or Druid for 10K real-time users.", tween: 1600 },
      ],
    },
    {
      id: "less",
      label: "Read less",
      steps: [
        { caption: "Partition by date. A query for January reads 31 daily partitions and skips the other 334.", tween: 900 },
        { caption: "Filter on product with no date and pruning can't help: every partition is read, 10TB instead of 10GB, 1,000 times the cost.", tween: 1400 },
        { caption: "Clustering sorts rows inside partitions. With category A grouped together, a query for A reads File 1 and skips File 2.", tween: 1600 },
        { caption: "SELECT * reads all 50 columns. Name only what you need, like date, revenue and quantity, and the scan shrinks.", tween: 1400 },
      ],
    },
    {
      id: "once",
      label: "Compute once",
      steps: [
        { caption: "Pre-aggregate predictable, frequent queries. Daily revenue by category, asked 100+ times a day, drops from 45 seconds to 50ms.", tween: 1400 },
        { caption: "Keep hourly, daily and monthly rollups, and route each query to the coarsest one that still has the detail it needs.", tween: 1600 },
        { caption: "Cache results. A dashboard 50 people load every morning needs one scan and 49 cache hits, not 50 scans.", tween: 900, loop: true },
        { caption: "Match the TTL to freshness: about 60 seconds for real-time, an hour for historical. Caching everything for 24 hours shows stale data.", tween: 1600 },
      ],
    },
    {
      id: "tenants",
      label: "Tenants & cost",
      steps: [
        { caption: "A tenant_id filter on shared tables is cheapest, but one forgotten WHERE leaks data. Schema or database per tenant isolates more.", tween: 1400 },
        { caption: "Per-tenant quotas stop a noisy neighbour: 10 concurrent queries, 100GB scanned per day, a 300-second timeout. Over quota is rejected.", tween: 1200, loop: true },
        { caption: "Measure first: here the top 10 queries were 70% of time and cost. Then each query goes through cache, quota, rewrite and execute.", tween: 1800 },
      ],
    },
  ],
  Scene,
});
