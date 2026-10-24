/**
 * Whole-lesson overview (week 8 preview): the problem (an e-commerce platform's 100M events a day,
 * 1,000+ a second, questions that need live answers and questions that can wait), the five days as
 * one analytics pipeline that grows (ingestion, stream and batch, data modeling, late data, query
 * layer, then the video-streaming capstone), and the preview's two worked examples: a late mobile
 * event that changes the dashboard from 1,000 to 1,050, and a 1B-row query cut from 60 s to 200 ms.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const ROW = (i: number) => 56 + i * 44;
const RH = 32;
const SX = 12;
const SW = 96;
const K = { x: 118, y: 118, w: 76, h: 84 };
const PX = 214;
const PW = 80;
const TOP = 72;
const BOT = 192;
const BH = 56;
const STX = 320;
const STW = 112;
const QX = 462;
const QW = 126;
const SOURCES = ["Web", "Mobile", "API logs", "IoT", "DB CDC"];
const QUERY: [string, number][] = [
  ["Dashboards", 1],
  ["BI tools", 2],
  ["ML features", 3],
];

type Lit = (part: string) => Tone | "dim";

function Item({ x, y, w, label, tone }: { x: number; y: number; w: number; label: string; tone: Tone | "dim" }) {
  return (
    <g opacity={tone === "dim" ? 0.3 : 1}>
      <rect className={`ax-box${tone && tone !== "dim" ? ` ${tone}` : ""}`} x={x} y={y} width={w} height={RH} />
      <Txt x={x + w / 2} y={y + 21} k="s" tone={tone === "dim" ? undefined : tone}>
        {label}
      </Txt>
    </g>
  );
}

/** the week's pipeline: sources → Kafka → Flink / Spark → real-time store / warehouse → query layer */
function Pipeline({ narrow, lit, subs }: { narrow: boolean; lit: Lit; subs: Record<string, string> }) {
  const tn = (p: string) => (lit(p) === "dim" ? undefined : (lit(p) as Tone));
  const op = (p: string) => (lit(p) === "dim" ? 0.3 : 1);
  const kc = K.y + K.h / 2;
  const lane = (y: number) => y + BH / 2;
  return (
    <g>
      {SOURCES.map((s, i) => (
        <g key={s}>
          <Wire d={`M${SX + SW} ${ROW(i) + RH / 2}C${SX + SW + 10} ${ROW(i) + RH / 2} ${K.x - 10} ${kc} ${K.x} ${kc}`} opacity={op("src")} tone={tn("src") === "lit" ? "lit" : undefined} />
          <Item x={SX} y={ROW(i)} w={SW} label={narrow ? s.split(" ")[0] : s} tone={lit(i === 1 ? "mobile" : "src")} />
        </g>
      ))}
      <g opacity={op("kafka")}>
        <Box x={K.x} y={K.y} w={K.w} h={K.h} label="Kafka" sub={narrow ? undefined : "ingest"} tone={tn("kafka")} />
      </g>
      {[
        ["flink", TOP, "Flink", "stream", "rt", narrow ? "Druid" : "Real-time", "rts"],
        ["spark", BOT, "Spark", "batch", "dw", narrow ? "BigQuery" : "Warehouse", "dw"],
      ].map(([id, y, l, s, sid, sl, subKey]) => (
        <g key={id as string}>
          <g opacity={op(id as string)}>
            <Wire d={`M${K.x + K.w} ${kc}C${K.x + K.w + 14} ${kc} ${PX - 14} ${lane(y as number)} ${PX} ${lane(y as number)}`} arrow />
            <Box x={PX} y={y as number} w={PW} h={BH} label={l} sub={narrow ? undefined : (subs[id as string] ?? s)} tone={tn(id as string)} />
          </g>
          <g opacity={op(sid as string)}>
            <Wire d={`M${PX + PW} ${lane(y as number)}H${STX}`} arrow />
            <Box x={STX} y={y as number} w={STW} h={BH} label={sl} sub={narrow ? undefined : (subs[subKey as string] ?? (sid === "rt" ? "store" : "star schema"))} tone={tn(sid as string)} />
          </g>
        </g>
      ))}
      {QUERY.map(([q, r]) => (
        <g key={q}>
          <Wire d={`M${STX + STW} ${lane(TOP)}C${QX - 10} ${lane(TOP)} ${QX - 14} ${ROW(r) + RH / 2} ${QX} ${ROW(r) + RH / 2}`} opacity={op("query") * 0.8} />
          <Wire d={`M${STX + STW} ${lane(BOT)}C${QX - 10} ${lane(BOT)} ${QX - 14} ${ROW(r) + RH / 2} ${QX} ${ROW(r) + RH / 2}`} opacity={op("query") * 0.8} />
          <Item x={QX} y={ROW(r)} w={QW} label={q} tone={lit(r === 1 ? "dash" : "query")} />
        </g>
      ))}
    </g>
  );
}

/** a point on the path mobile → Kafka → Flink → real-time store → dashboards, p in 0..1 */
function path(p: number) {
  const pts = [
    { x: SX + SW, y: ROW(1) + RH / 2 },
    { x: K.x + K.w / 2, y: K.y + K.h / 2 },
    { x: PX + PW / 2, y: TOP + BH / 2 },
    { x: STX + STW / 2, y: TOP + BH / 2 },
    { x: QX, y: ROW(1) + RH / 2 },
  ];
  const k = Math.min(3, Math.floor(p * 4));
  const q = p * 4 - k;
  return { x: lerp(pts[k].x, pts[k + 1].x, q), y: lerp(pts[k].y, pts[k + 1].y, q) };
}

const EVENTS: [string, string, string][] = [
  ["Page views", "Views", "50M"],
  ["Clicks", "Clicks", "20M"],
  ["Searches", "Search", "10M"],
  ["Add to cart", "Cart", "5M"],
  ["Purchases", "Buys", "500K"],
];
const ASKS: [string, Tone][] = [
  ["Conversion?", "warn"],
  ["Trending?", "warn"],
  ["Flash sale?", "warn"],
  ["Funnel?", "ok"],
  ["Campaigns?", "ok"],
];

function Problem({ step, t, clock, narrow }: SceneProps) {
  const flow = (k: number) => (clock * 0.3 + k / 4) % 1;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "an e-commerce platform" : "an e-commerce platform generates events"}
      </Txt>
      {EVENTS.map(([w, n, v], i) => (
        <g key={w} opacity={step === 0 ? seg(t, i * 0.15, i * 0.15 + 0.3) : 1}>
          <rect className="ax-box lit" x={SX} y={ROW(i)} width={150} height={RH} />
          <Txt x={SX + 10} y={ROW(i) + 21} k="s" anchor="start">
            {narrow ? n : w}
          </Txt>
          <Txt x={SX + 140} y={ROW(i) + 21} k="s" anchor="end" tone="lit">
            {v}
          </Txt>
        </g>
      ))}
      <Box x={196} y={96} w={210} h={112} label="Analytics" sub={narrow ? undefined : "the pipeline to build"} tone={step >= 1 ? "lit" : undefined} />
      {step === 0 && (
        <g opacity={seg(t, 0.6, 1)}>
          <Txt x={301} y={256} k="d">
            100M
          </Txt>
          <Txt x={301} y={280} k="s">
            events/day total
          </Txt>
        </g>
      )}
      {step >= 1 &&
        ASKS.map(([a, tone], i) => (
          <g key={a} opacity={step === 1 ? seg(t, i * 0.15, i * 0.15 + 0.3) : 1}>
            <Wire d={`M406 152C430 152 430 ${ROW(i) + RH / 2} ${QX} ${ROW(i) + RH / 2}`} tone={step === 2 ? tone : undefined} />
            <Item x={QX} y={ROW(i)} w={QW} label={a} tone={step === 2 ? tone : undefined} />
          </g>
        ))}
      {step === 2 && (
        <g>
          <Txt x={301} y={256} k="d">
            1,000+
          </Txt>
          <Txt x={301} y={280} k="s">
            events/second
          </Txt>
          <Txt x={QX + QW / 2} y={ROW(0) - 10} k="s" tone="warn">
            real-time
          </Txt>
          <Txt x={QX + QW / 2} y={296} k="s" tone="ok">
            can wait
          </Txt>
          {[0, 1, 2, 3].map((k) => (
            <Token key={k} x={lerp(SX + 150, 196, flow(k))} y={lerp(ROW(k) + RH / 2, 152, flow(k))} s={8} tone="lit" />
          ))}
        </g>
      )}
    </g>
  );
}

const DAYS: [string, string, string, string, string[]][] = [
  ["Day 1 · event ingestion", "Day 1 · ingestion", "reliable event capture at 100K/sec", "capture at 100K/s", ["src", "mobile", "kafka"]],
  ["Day 2 · streaming vs batch", "Day 2 · stream/batch", "the Lambda or Kappa decision", "Lambda or Kappa", ["flink", "spark"]],
  ["Day 3 · data modeling", "Day 3 · modeling", "a star schema for e-commerce analytics", "a star schema", ["rt", "dw"]],
  ["Day 4 · late data", "Day 4 · late data", "watermarks and a reprocessing strategy", "watermarks", ["mobile", "flink"]],
  ["Day 5 · query layer", "Day 5 · queries", "sub-second dashboard queries", "sub-second queries", ["query", "dash"]],
  ["Capstone · video streaming", "Capstone", "10M concurrent viewers in a cricket final", "10M viewers", []],
];
const BUILT = [["src", "mobile", "kafka"], ["flink", "spark"], ["rt", "dw"], [], ["query", "dash"]];

function Days({ step, t, clock, narrow }: SceneProps) {
  const [kw, kn, dw, dn, active] = DAYS[step];
  const built = BUILT.slice(0, step + 1).flat();
  const lit: Lit = (p) => (step === 5 ? "lit" : active.includes(p) ? (step === 3 && p === "mobile" ? "warn" : "lit") : built.includes(p) ? undefined : "dim");
  const subs: Record<string, string> = step === 3 ? { flink: "watermark" } : step === 4 ? { rts: "rollups", dw: "partitions" } : {};
  const p = (t * 0.8 + clock * 0.25) % 1;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? kn : kw}
      </Txt>
      <Pipeline narrow={narrow} lit={lit} subs={subs} />
      {step === 0 && <Token x={lerp(SX + SW, K.x, seg(p, 0, 0.8))} y={lerp(ROW(1) + RH / 2, K.y + K.h / 2, seg(p, 0, 0.8))} s={10} tone="lit" />}
      {step === 1 && [TOP, BOT].map((y) => <Token key={y} x={lerp(K.x + K.w, PX, seg(p, 0, 0.8))} y={lerp(K.y + K.h / 2, y + BH / 2, seg(p, 0, 0.8))} s={10} tone="lit" />)}
      {step === 3 && <Token x={lerp(SX + SW, K.x, 0.6 * seg(t, 0.2, 1))} y={lerp(ROW(1) + RH / 2, K.y + K.h / 2, 0.6 * seg(t, 0.2, 1))} s={11} tone="warn" />}
      {step === 4 && <Token {...path(0.75 + seg(p, 0, 1) * 0.25)} s={10} tone="lit" />}
      <Txt x={W / 2} y={300} k="s" tone="lit" opacity={seg(t, 0.3, 0.9)}>
        {narrow ? dn : `deliverable: ${dw}`}
      </Txt>
    </g>
  );
}

function Late({ step, t, narrow }: SceneProps) {
  const pos = step === 0 ? path(seg(t, 0, 0.9)) : step === 1 ? path(0) : path(seg(t, 0.1, 0.9));
  const lit: Lit = (p) =>
    p === "mobile" ? (step === 1 ? "warn" : "lit") : p === "dash" ? (step === 2 ? "warn" : step === 3 ? "ok" : "lit") : ["kafka", "flink", "rt"].includes(p) ? undefined : "dim";
  const count = step === 1 ? "1,000" : step >= 2 ? "1,050" : null;
  const when = ["t=0 → t=2s", "t=5min · no signal", "t=30min · event sent", ""][step];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {step === 0 ? (narrow ? "expected" : "expected: processed at t=2s") : step === 3 ? "solutions" : narrow ? "reality" : "reality: user in the subway"}
      </Txt>
      <Pipeline narrow={narrow} lit={lit} subs={step === 3 ? { flink: "watermark" } : {}} />
      {step < 3 && <Token x={pos.x} y={pos.y} s={11} tone={step === 0 ? "lit" : "warn"} />}
      {count && (
        <g>
          <Txt x={QX + QW / 2} y={ROW(0) + 24} k="t" tone={step === 2 ? "warn" : undefined}>
            {count}
          </Txt>
        </g>
      )}
      {when && (
        <Txt x={W / 2} y={300} k="s" tone={step === 0 ? "lit" : "warn"}>
          {when}
        </Txt>
      )}
      {step === 3 &&
        (narrow ? ["watermarks", "reprocess", "as of", "corrections"] : ["watermarks", "reprocessing", "“as of” time", "corrections"]).map((s, i) => (
          <g key={s} opacity={seg(t, i * 0.18, i * 0.18 + 0.3)}>
            <rect className="ax-box ok" x={8 + i * 147} y={276} width={141} height={30} />
            <Txt x={8 + i * 147 + 70} y={296} k="s" tone="ok">
              {s}
            </Txt>
          </g>
        ))}
    </g>
  );
}

const FAST: [string, string, string, number][] = [
  ["1B", "rows scanned", "60 s", 1],
  ["3M", "rows: one day", "", 0.6],
  ["365", "pre-computed rows", "", 0.3],
  ["−90%", "I/O: 2 columns", "200 ms", 0.06],
];
const FIXES = ["partition", "pre-agg", "columnar", "MV+cache"];

function Fast({ step, t, narrow }: SceneProps) {
  const [d, s, ms, v] = FAST[step];
  const prev = FAST[Math.max(0, step - 1)][3];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "1B-row query" : "SUM(revenue) by date over 1B rows"}
      </Txt>
      <Txt x={170} y={130} k="d" tone={step === 0 ? "bad" : "lit"}>
        {d}
      </Txt>
      <Txt x={170} y={156} k="s">
        {s}
      </Txt>
      <Txt x={430} y={130} k="d" tone={step === 0 ? "bad" : step === 3 ? "ok" : undefined} opacity={ms ? 1 : 0.3}>
        {ms || "…"}
      </Txt>
      <Txt x={430} y={156} k="s">
        {narrow ? "time" : "dashboard query time"}
      </Txt>
      <Meter x={60} y={190} w={480} h={16} value={lerp(prev, v, step === 0 ? 1 : t)} max={1} tone={step === 0 ? "bad" : step === 3 ? "ok" : "lit"} />
      {FIXES.map((f, i) => (
        <g key={f} opacity={i < step || (step === 3 && i === 3) ? 1 : 0.3}>
          <rect className={`ax-box${i < step || (step === 3 && i === 3) ? " ok" : ""}`} x={60 + i * 122} y={236} width={114} height={30} />
          <Txt x={60 + i * 122 + 57} y={256} k="s" tone={i < step || (step === 3 && i === 3) ? "ok" : undefined}>
            {f}
          </Txt>
        </g>
      ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "problem" ? <Problem {...p} /> : p.variant === "days" ? <Days {...p} /> : p.variant === "late" ? <Late {...p} /> : <Fast {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "The problem",
      steps: [
        { caption: "An e-commerce platform generates events: 50M page views, 20M clicks, 10M searches a day, about 100M user actions in total.", tween: 1800 },
        { caption: "The business needs answers: conversion rate this hour, what's trending, the funnel, which campaigns drove revenue, flash-sale revenue.", tween: 1800 },
        { caption: "That's 1,000+ events a second. Some questions need answers in real time, others can wait, and every number must be correct.", tween: 1000, loop: true },
      ],
    },
    {
      id: "days",
      label: "Five days",
      steps: [
        { caption: "Day 1: capture everything without dropping anything. Web, mobile, logs, IoT and CDC events flow into Kafka, the event backbone.", tween: 1600, loop: true },
        { caption: "Day 2: real-time vs accurate. Flink streams for live numbers, Spark batches for exact ones, and you pick Lambda or Kappa.", tween: 1600, loop: true },
        { caption: "Day 3: model for queries. A star schema, columnar storage and partitions make a query over 1 billion rows return in under 5 seconds.", tween: 1400 },
        { caption: "Day 4: a mobile event from 2 hours ago arrives. Event time, watermarks and reprocessing keep the numbers correct.", tween: 1800 },
        { caption: "Day 5: make big data feel small. OLAP stores, rollups and caching make a dashboard over a year of data return in milliseconds.", tween: 1400, loop: true },
        { caption: "The capstone puts it all together: analytics for a video streaming platform, handling 10M concurrent viewers in a cricket final.", tween: 1200 },
      ],
    },
    {
      id: "late",
      label: "Late data",
      steps: [
        { caption: "Expected: an event happens on the mobile app at t=0, is sent at 1 second and processed at 2 seconds.", tween: 1800 },
        { caption: "Reality: the user is in a subway with no signal. At t=5min the dashboard shows 1,000 events.", tween: 900 },
        { caption: "At 30 minutes the user exits the subway and the event is finally sent. At t=35min the dashboard shows 1,050. Why did it change?", tween: 1800 },
        { caption: "The fixes: watermarks for events up to X minutes late, reprocessing, an “as of” timestamp, and correction tables.", tween: 1600 },
      ],
    },
    {
      id: "fast",
      label: "Fast queries",
      steps: [
        { caption: "Daily revenue over a year of sales: with 1B rows, the query takes 60 seconds. Unacceptable for a dashboard.", tween: 800 },
        { caption: "Partition by date, and a single day reads 3M rows instead of 1B.", tween: 1200 },
        { caption: "Pre-aggregate into a daily_revenue table, kept fresh by the streaming or batch job: the query reads 365 rows.", tween: 1200 },
        { caption: "Columnar storage reads only date and revenue: 90% less I/O. Add materialized views and caching: 60 seconds becomes 200 ms.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
