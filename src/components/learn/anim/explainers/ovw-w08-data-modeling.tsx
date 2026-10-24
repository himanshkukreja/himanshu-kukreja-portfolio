/**
 * Whole-lesson overview (week 8, day 3 · data modeling for analytics): the problem (365,000 rows in
 * 50 ms becomes 3.65 billion rows in 45 seconds, and normalized OLTP joins), the star schema (fact
 * table of measures at line-item grain, denormalized dimensions, surrogate keys, an Unknown row),
 * and what makes it fast: columnar storage, date partitions, rollups, and not over-partitioning.
 */
import { Box, defineExplainer, lerp, Meter, seg, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

function Problem({ step, t, narrow }: SceneProps) {
  if (step < 2) {
    const big = step === 1;
    return (
      <g>
        <Txt x={W / 2} y={30} k="k">
          {big ? (narrow ? "then the CEO asks" : "then the CEO asks for more breakdowns") : narrow ? "revenue by category" : "daily revenue by category, 2024"}
        </Txt>
        <Txt x={160} y={140} k="d" tone={big ? "bad" : "lit"}>
          {big ? "3.65B" : "365,000"}
        </Txt>
        <Txt x={160} y={166} k="s">
          rows
        </Txt>
        <Txt x={440} y={140} k="d" tone={big ? "bad" : "ok"}>
          {big ? "45 s" : "50 ms"}
        </Txt>
        <Txt x={440} y={166} k="s">
          {narrow ? "query" : "query time"}
        </Txt>
        <Txt x={W / 2} y={226} k="s" tone={big ? "bad" : undefined} opacity={big ? seg(t, 0.2, 0.8) : 1}>
          {big ? (narrow ? "×200 countries ×10 ×5" : "365 days × 1,000 categories × 200 countries × 10 segments × 5 channels") : "365 days × 1,000 categories"}
        </Txt>
        {big && (
          <Txt x={W / 2} y={270} k="t" tone="bad" opacity={seg(t, 0.6, 1)}>
            {narrow ? "dashboard unusable" : "the dashboard is unusable"}
          </Txt>
        )}
      </g>
    );
  }
  const tabs = ["orders", "users", "countries"];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "OLTP: normalized" : "OLTP: normalized (3NF) for writes"}
      </Txt>
      {tabs.map((n, i) => (
        <g key={n} opacity={seg(t, i * 0.25, i * 0.25 + 0.3)}>
          {i > 0 && (
            <g>
              <Wire d={`M${40 + (i - 1) * 190 + 140} 140H${40 + i * 190}`} tone="bad" arrow />
              <Txt x={40 + i * 190 - 25} y={128} k="s" tone="bad">
                JOIN
              </Txt>
            </g>
          )}
          <Box x={40 + i * 190} y={110} w={140} h={60} label={n} />
        </g>
      ))}
      <Txt x={W / 2} y={222} k="s">
        {narrow ? "revenue by country" : "query: revenue by country"}
      </Txt>
      <Txt x={W / 2} y={252} k="s" tone="bad" opacity={seg(t, 0.7, 1)}>
        {narrow ? "each JOIN shuffles" : "each JOIN shuffles data, slower as data grows"}
      </Txt>
    </g>
  );
}

const F = { x: 210, y: 84, w: 180, h: 152 };
const DIMS: [string, string, number, number][] = [
  ["dim_product", "product", 16, 52],
  ["dim_date", "date", 434, 52],
  ["dim_customer", "customer", 16, 212],
  ["dim_store", "store", 434, 212],
];
const DW = 150;
const DH = 56;

function Star({ step, t, narrow }: SceneProps) {
  const used = (i: number) => (step === 1 ? i < 2 : step === 3 ? i === 2 : true);
  const rows: [string, Tone][] =
    step === 3
      ? [["customer_key", "lit"], [narrow ? "= version" : "→ version at sale", "lit"], [narrow ? "NULL → -1" : "NULL → key -1", "ok"]]
      : step === 2
        ? [["grain:", undefined], ["one line item", "lit"], [narrow ? "rolls up" : "rolls up to orders", "ok"]]
        : [["quantity", "lit"], ["revenue", "lit"], [narrow ? "discount" : "discount · profit", "lit"]];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {["star schema", narrow ? "revenue by category" : "revenue by category by month", narrow ? "grain first" : "grain is foundational", "surrogate keys"][step]}
      </Txt>
      {DIMS.map(([w, n, x, y], i) => {
        const on = used(i);
        const fx = x < F.x ? F.x : F.x + F.w;
        const fy = y < F.y ? F.y + 30 : F.y + F.h - 30;
        return (
          <g key={w} opacity={on ? 1 : 0.3}>
            <Wire d={`M${x < F.x ? x + DW : x} ${y + DH / 2}H${(fx + (x < F.x ? x + DW : x)) / 2}V${fy}H${fx}`} tone={step === 1 && on ? "lit" : undefined} />
            <Box x={x} y={y} w={DW} h={DH} label={narrow ? n : w} sub={narrow ? undefined : ["category · brand", "month · quarter", "segment · region", "city · country"][i]} tone={step === 1 && on ? "lit" : step === 3 && on ? "lit" : undefined} />
          </g>
        );
      })}
      <rect className="ax-box lit" x={F.x} y={F.y} width={F.w} height={F.h} />
      <Txt x={F.x + F.w / 2} y={F.y + 28}>
        fact_sales
      </Txt>
      {rows.map(([r, tn], i) => (
        <Txt key={r} x={F.x + F.w / 2} y={F.y + 64 + i * 28} k="s" tone={tn} opacity={step === 0 ? 1 : seg(t, i * 0.2, i * 0.2 + 0.4)}>
          {r}
        </Txt>
      ))}
      {step === 1 && (
        <Txt x={W / 2} y={300} k="s" tone="ok" opacity={seg(t, 0.5, 1)}>
          {narrow ? "one hop per dimension" : "fact → dim_product, fact → dim_date: one hop each"}
        </Txt>
      )}
      {step === 0 && (
        <Txt x={W / 2} y={300} k="s">
          {narrow ? "measures + attributes" : "measures in the middle, attributes around it"}
        </Txt>
      )}
    </g>
  );
}

const COLS = ["id", "name", "country", "revenue"];

function Fast({ step, t, narrow }: SceneProps) {
  if (step === 0)
    return (
      <g>
        <Txt x={W / 2} y={30} k="k">
          {narrow ? "columnar storage" : "columnar: SELECT SUM(revenue)"}
        </Txt>
        {COLS.map((c, i) => {
          const on = i === 3;
          return (
            <g key={c} opacity={on ? 1 : lerp(1, 0.3, seg(t, 0.2, 0.7))}>
              <rect className={`ax-box${on ? " lit" : ""}`} x={60 + i * 126} y={60} width={100} height={170} />
              {[0, 1, 2, 3, 4].map((r) => (
                <rect key={r} className={`ax-fill${on ? " lit" : ""}`} x={74 + i * 126} y={74 + r * 30} width={72} height={18} />
              ))}
              <Txt x={110 + i * 126} y={254} k="s" tone={on ? "lit" : undefined}>
                {c}
              </Txt>
            </g>
          );
        })}
        <Txt x={W / 2} y={292} k="s" tone="ok" opacity={seg(t, 0.6, 1)}>
          {narrow ? "1 of 4 columns: 75% less I/O" : "read 1 column of 4: 75% less I/O, better compression"}
        </Txt>
      </g>
    );
  if (step === 1 || step === 3) {
    const over = step === 3;
    return (
      <g>
        <Txt x={W / 2} y={30} k="k" tone={over ? "bad" : undefined}>
          {over ? (narrow ? "over-partitioning" : "over-partitioning: by customer_id") : narrow ? "partition by date" : "fact_sales partitioned by date"}
        </Txt>
        {over
          ? Array.from({ length: 1280 }, (_, i) => <rect key={i} className="ax-fill bad" x={44 + (i % 128) * 4} y={80 + Math.floor(i / 128) * 6} width={3} height={4} />)
          : Array.from({ length: 365 }, (_, i) => (
              <rect key={i} className={`ax-fill${i === 14 ? " lit" : ""}`} x={44 + (i % 73) * 7} y={70 + Math.floor(i / 73) * 16} width={6} height={12} opacity={i === 14 ? 1 : lerp(1, 0.35, seg(t, 0.3, 0.8))} />
            ))}
        <Txt x={W / 2} y={208} k="t" tone={over ? "bad" : "lit"}>
          {over ? (narrow ? "10M partitions" : "10 million partitions") : narrow ? "date = 2024-01-15" : "WHERE date = '2024-01-15'"}
        </Txt>
        <Txt x={W / 2} y={244} k="s" tone={over ? "bad" : "ok"} opacity={seg(t, 0.5, 1)}>
          {over ? (narrow ? "metadata, small files" : "metadata overhead and small files") : narrow ? "reads 1, skips 364" : "reads 1 partition, skips 364"}
        </Txt>
        {over && (
          <Txt x={W / 2} y={284} k="s" tone="ok" opacity={seg(t, 0.6, 1)}>
            {narrow ? "date, maybe region" : "instead: date, maybe region"}
          </Txt>
        )}
      </g>
    );
  }
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "pre-aggregate" : "pre-aggregate: rollup tables"}
      </Txt>
      {[
        ["fact_sales", "1B rows", 1, "60 s", "bad"],
        ["agg_daily_revenue", "365 rows", 0.04, "50 ms", "ok"],
      ].map(([n, r, v, ms, tn], i) => (
        <g key={n as string} opacity={i === 1 ? seg(t, 0.3, 0.8) : 1}>
          <Txt x={40} y={96 + i * 100} k="t" anchor="start">
            {narrow ? (i ? "agg_daily" : "fact_sales") : (n as string)}
          </Txt>
          <Meter x={40} y={110 + i * 100} w={400} h={18} value={v as number} max={1} tone={tn as Tone} />
          <Txt x={40} y={150 + i * 100} k="s" anchor="start">
            {r as string}
          </Txt>
          <Txt x={560} y={128 + i * 100} k="d" anchor="end" tone={tn as Tone}>
            {ms as string}
          </Txt>
        </g>
      ))}
      <Txt x={W / 2} y={300} k="s" opacity={seg(t, 0.6, 1)}>
        {narrow ? "trade storage for speed" : "trade storage for speed; refresh strategy matters"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "problem" ? <Problem {...p} /> : p.variant === "star" ? <Star {...p} /> : <Fast {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "The problem",
      steps: [
        { caption: "Daily revenue by category for 2024 is 365 days × 1,000 categories: 365,000 rows, and the query takes 50 ms.", tween: 900 },
        { caption: "Then the CEO wants it by country, segment and channel: 3.65 billion rows, 45 seconds, and the dashboard is unusable.", tween: 1400 },
        { caption: "The problem isn't compute, it's the model. Normalized OLTP tables need a JOIN per hop, and every JOIN shuffles data.", tween: 1600 },
      ],
    },
    {
      id: "star",
      label: "Star schema",
      steps: [
        { caption: "A star schema: a fact table of measures you aggregate, surrounded by denormalized dimension tables of attributes you group by.", tween: 900 },
        { caption: "Revenue by category by month is fact_sales joined to dim_product and dim_date: one hop each, no chains of joins.", tween: 1400 },
        { caption: "Define the grain first. Store one row per line item and you can roll up to orders, but never drill below what you stored.", tween: 1400 },
        { caption: "Facts hold surrogate keys: customer_key points to the customer version valid at sale time, and NULLs map to an Unknown row, key -1.", tween: 1400 },
      ],
    },
    {
      id: "fast",
      label: "Make it fast",
      steps: [
        { caption: "Columnar storage: SUM(revenue) reads only the revenue column, 1 of 4, for 75% less I/O and better compression.", tween: 1400 },
        { caption: "Partition fact_sales by date: a query for 2024-01-15 reads 1 partition and skips the other 364.", tween: 1400 },
        { caption: "Pre-aggregate common queries: daily revenue from fact_sales takes 60 seconds; from the agg_daily_revenue rollup, 50 milliseconds.", tween: 1400 },
        { caption: "But don't over-partition: by customer_id that's 10 million partitions, all metadata and small files. Use date, maybe region.", tween: 1400 },
      ],
    },
  ],
  Scene,
});
