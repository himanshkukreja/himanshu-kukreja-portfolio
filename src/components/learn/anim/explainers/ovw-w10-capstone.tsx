/**
 * Week 10 capstone overview (global real-time bidding): the whole interview in four tabs. The brief
 * and the bar (10B requests a day, 100 ms p99, 99.99%, 500K RPS, ≤ 0.1% overspend) and the
 * estimates (80 TB a day, ~200 PB over 7 years, 150 servers); the 100 ms latency budget and the
 * request path; the deep dives (the $29,990 overspend, hierarchical budget leases, the outbox audit
 * trail, tiered fraud detection); and operating it (Super Bowl, edge cases, SLOs, the biggest risk).
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- requirements */

function Reqs({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.12, i * 0.12 + 0.3);
  const kick = ["the brief · global real-time bidding", "the bar", "the estimate"][step];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? kick.split(" · ")[0] : kick}
      </Txt>
      {step === 0 &&
        ["receive the bid request", "query the DSPs", "run an auction", "return the winner"].map((s, i) => (
          <g key={s} opacity={o(i)}>
            <Box x={20 + i * 142} y={70} w={134} h={80} label={`${i + 1}`} sub={narrow ? s.split(" ")[s.split(" ").length - 1] : s.replace("receive the ", "").replace("return the ", "")} tone={i === 1 ? "lit" : "sky"} />
            {i < 3 && <Wire d={`M${154 + i * 142} 110H${162 + i * 142}`} arrow />}
          </g>
        ))}
      {step === 0 && (
        <Txt x={300} y={204} k="d" tone="lit" opacity={o(5)}>
          100 ms
        </Txt>
      )}
      {step === 1 &&
        [
          ["p99 latency", "< 100 ms", "lit"],
          ["availability", "99.99% · 52 min/yr", "ok"],
          ["peak", "500,000 RPS", "sky"],
          ["overspend", "≤ 0.1% of budget", "bad"],
          ["audit trail", "7 years", "warn"],
        ].map(([a, b, tone], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={30} y={70 + i * 42} k="t" anchor="start">
              {a}
            </Txt>
            <Txt x={570} y={70 + i * 42} k="t" anchor="end" tone={tone as Tone}>
              {narrow ? b.split(" · ")[0] : b}
            </Txt>
          </g>
        ))}
      {step === 2 &&
        [
          ["10B ÷ 86,400 s", "≈ 116K RPS avg"],
          ["× ~4 at peak", "≈ 500K RPS"],
          ["10B × 8 KB", "80 TB / day"],
          ["× 365 × 7", "~200 PB"],
          ["500K ÷ 5K per server", "100 → 150 servers"],
        ].map(([a, b], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={30} y={70 + i * 42} k={narrow ? "s" : "t"} anchor="start">
              {a}
            </Txt>
            <Txt x={570} y={70 + i * 42} k="t" anchor="end" tone="lit">
              {b}
            </Txt>
          </g>
        ))}
      <Txt x={20} y={H - 16} anchor="start">
        {[narrow ? "10B requests/day, 6 continents" : "10 billion ad requests a day across 6 continents", narrow ? "miss 100 ms: lose the impression" : "miss the deadline and the exchange moves on: speed is revenue", narrow ? "tiered storage, 50% headroom" : "tiered hot/warm/cold storage · servers with 50% headroom"][step]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- latency budget + path */

const SLICES: [string, number, Tone][] = [
  ["receive", 2, "sky"],
  ["parse", 5, "sky"],
  ["DSP fan-out", 75, "lit"],
  ["auction", 10, "ok"],
  ["send", 3, "sky"],
];
const STARTS = SLICES.map((_, i) => SLICES.slice(0, i).reduce((a, sl) => a + sl[1], 0));

function Path({ step, t, narrow }: SceneProps) {
  const k = ease(seg(t, 0.05, 0.9));
  if (step === 0) {
    const x = (ms: number) => lerp(30, 570, ms / 100);
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          the 100 ms latency budget
        </Txt>
        {SLICES.map(([n, ms, tone], i) => {
          const a = STARTS[i];
          const vis = k * 95 > a;
          return (
            <g key={n} opacity={vis ? 1 : 0.15}>
              <rect className={`ax-fill ${tone}`} x={x(a)} y={90} width={x(a + ms) - x(a) - 1} height={50} opacity={0.75} />
              {ms > 50 && (
                <Txt x={(x(a) + x(a + ms)) / 2} y={120} k="t">
                  {narrow ? "DSPs 75" : "DSP fan-out · 75 ms"}
                </Txt>
              )}
            </g>
          );
        })}
        <rect className="ax-meter" x={x(95)} y={90} width={x(100) - x(95)} height={50} />
        <Txt x={x(97.5)} y={78} k="s" anchor="end">
          {narrow ? "5 spare" : "5 ms buffer"}
        </Txt>
        <Txt x={30} y={170} k="s" anchor="start">
          {narrow ? "2 · 5 · 75 · 10 · 3 ms" : "receive 2 · parse 5 · DSPs 75 · auction 10 · send 3 (ms)"}
        </Txt>
        <Txt x={30} y={214} k="t" anchor="start" tone="lit" opacity={seg(t, 0.6, 1)}>
          {narrow ? "DSP timeout: 70 ms" : "hard DSP timeout: 70 ms inside the 75 ms window"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "95 ms planned, 5 ms spare" : "2 + 5 + 75 + 10 + 3 = 95 ms, with 5 ms for variance"}
        </Txt>
      </g>
    );
  }
  const nodes: [string, string, Tone][] = [
    ["GeoDNS", "nearest region", "sky"],
    ["edge", "limits · fraud", "warn"],
    ["orchestrator", "pick 5–10 DSPs", "lit"],
    ["auction", "reserve budget", "ok"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        one bid request
      </Txt>
      {nodes.map(([a, b, tone], i) => (
        <g key={a}>
          <Box x={20 + i * 142} y={56} w={134} h={64} label={narrow && a === "orchestrator" ? "orch." : a} sub={narrow ? undefined : b} tone={tone} />
          {i < 3 && <Wire d={`M${154 + i * 142} 88H${162 + i * 142}`} arrow />}
        </g>
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i}>
          <Wire d={`M364 120L${60 + i * 96} 200`} dash />
          <Box x={30 + i * 96} y={200} w={60} h={36} label="DSP" tone={k > 0.5 ? (i === 5 ? "bad" : "ok") : undefined} />
        </g>
      ))}
      <Token x={lerp(87, 442, k)} y={88} s={11} tone="lit" />
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {narrow ? "late DSPs are cut off · Kafka async" : "a late DSP is cut off at 70 ms · Kafka gets the event after"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- deep dives */

function Dives({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  const k = ease(seg(t, 0.1, 0.8));
  if (step === 0) {
    const spend = lerp(9990, 29990, k);
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start" tone="bad">
          {narrow ? "why budget is hard" : "why budget is hard · $10,000 daily, $9,990 spent"}
        </Txt>
        {Array.from({ length: 20 }, (_, i) => (
          <Token key={i} x={40 + i * 27} y={lerp(70, 130, k)} s={12} tone={k > 0.5 ? "bad" : "lit"} />
        ))}
        <Txt x={300} y={100} k="s" opacity={1 - k}>
          {narrow ? "1,000 × $20 bids" : "1,000 simultaneous $20 bids · each sees $10 left"}
        </Txt>
        <Txt x={300} y={200} k="d" tone={spend > 10000 ? "bad" : undefined}>
          {`$${Math.round(spend).toLocaleString("en-US")}`}
        </Txt>
        <Txt x={300} y={230} k="t" tone="bad" opacity={seg(t, 0.7, 1)}>
          {narrow ? "200% over budget" : "overspend $19,990 · 200% over budget"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "independent checks overspend" : "servers checking budget independently all approve"}
        </Txt>
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          hierarchical budget leases
        </Txt>
        <Box x={170} y={44} w={260} h={54} label="global · $10,000" sub={narrow ? "$500 reserve" : "keeps $500 in reserve"} tone="lit" />
        {[
          ["US-EAST", "$4,000"],
          ["EU-WEST", "$3,500"],
          ["AP-SOUTH", "$2,000"],
        ].map(([a, b], i) => (
          <g key={a} opacity={o(i + 1)}>
            <Wire d={`M300 98L${110 + i * 190} 130`} />
            <Box x={20 + i * 190} y={130} w={180} h={54} label={a} sub={b} tone="sky" />
            <Wire d={`M${110 + i * 190} 184V212`} />
            <Box x={40 + i * 190} y={212} w={140} h={44} label={narrow ? "pod $100" : "pod lease $100"} tone="ok" />
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start" tone="ok">
          {narrow ? "spend locally, refill in background" : "pods spend leases locally; refills run off the critical path"}
        </Txt>
      </g>
    );
  if (step === 2) {
    const chain: [string, string, Tone][] = [
      ["outbox", "same txn as budget", "lit"],
      ["Debezium", "CDC", "sky"],
      ["Kafka", "by advertiser_id", "sky"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "audit · 10B events a day" : "audit trail · 10 billion events a day, none lost"}
        </Txt>
        {chain.map(([a, b, tone], i) => (
          <g key={a} opacity={o(i)}>
            <Box x={20 + i * 196} y={56} w={176} h={64} label={a} sub={narrow ? undefined : b} tone={tone} />
            {i < 2 && <Wire d={`M${196 + i * 196} 88H${216 + i * 196}`} tone="lit" arrow />}
          </g>
        ))}
        {[
          ["billing", "billing DB"],
          ["data lake", "S3 → Glacier, 7 yr"],
          ["fraud ML", "feature store"],
        ].map(([a, b], i) => (
          <g key={a} opacity={o(i + 3)}>
            <Wire d={`M500 120L${110 + i * 190} 170`} dash />
            <Box x={20 + i * 190} y={170} w={180} h={64} label={a} sub={narrow ? undefined : b} tone="ok" />
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "ordered per advertiser" : "ordered per advertiser for billing, queryable for disputes"}
        </Txt>
      </g>
    );
  }
  const tiers: [string, string, string, Tone][] = [
    ["rules", "< 0.5 ms", "blocks ~5%", "bad"],
    ["ML score", "< 2 ms", "blocks ~2%", "warn"],
    ["deep analysis", "async", "updates rules", "sky"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? "tiered fraud detection" : "tiered fraud detection · under 5 ms in the path"}
      </Txt>
      {tiers.map(([a, b, c, tone], i) => (
        <g key={a} opacity={o(i * 1.5)}>
          <Box x={20 + i * 190} y={56} w={180} h={110} label={a} sub={b} tone={tone} />
          <Txt x={110 + i * 190} y={192} k="t" tone={tone}>
            {c}
          </Txt>
        </g>
      ))}
      <Txt x={20} y={240} k="s" anchor="start" opacity={o(4)}>
        {narrow ? "> 0.95 block · 0.5–0.95 bid lower" : "ML: above 0.95 block · 0.5 to 0.95 flag and bid lower · below 0.5 allow"}
      </Txt>
      <Txt x={20} y={H - 16} anchor="start">
        {narrow ? "false positives = lost revenue" : "accuracy matters: false positives are lost revenue"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- operate */

function Operate({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  if (step === 0)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          Super Bowl · 5x traffic
        </Txt>
        {[
          ["24 h before", "pre-scale to 3x · warm caches"],
          ["during", "top 5 DSPs · timeout 70 → 50 ms"],
          ["overwhelmed", "shed low-value requests: no bid"],
        ].map(([a, b], i) => (
          <g key={a} opacity={o(i * 1.5)}>
            <Box x={20} y={50 + i * 74} w={170} h={60} label={a} tone={["sky", "lit", "warn"][i] as Tone} />
            <Txt x={210} y={85 + i * 74} k={narrow ? "s" : "t"} anchor="start">
              {narrow ? b.split(" · ")[0] : b}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "the 100 ms deadline can't move" : "internal budgets tighten: the 100 ms deadline can't move"}
        </Txt>
      </g>
    );
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          edge cases
        </Txt>
        <Box x={20} y={56} w={270} h={150} label={narrow ? "rogue DSP" : "a DSP answers in 500 ms"} sub={narrow ? "breaker: 5 → out 30 s" : "breaker: 5 timeouts → 30 s out"} tone="warn" />
        <Box x={310} y={56} w={270} h={150} label={narrow ? "partition" : "US-EAST partitioned"} sub={narrow ? "spend lease, then stop" : "bid on its leases, then stop"} tone="sky" />
        <Txt x={20} y={H - 16} anchor="start" tone="ok">
          {narrow ? "under-spend beats over-spend" : "conservative by design: under-spend beats over-spend"}
        </Txt>
      </g>
    );
  if (step === 2) {
    const slos: [string, string, string][] = [
      ["latency", "99.9% < 100 ms", "10M slow/day"],
      ["availability", "99.99%", "1M failures/day"],
      ["budget accuracy", "99.9% of campaigns", "≤ 0.1% over"],
      ["bid rate", "> 80%", "with budget"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          SLOs for the platform
        </Txt>
        {slos.map(([a, b, c], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={30} y={76 + i * 48} k="t" anchor="start">
              {narrow ? a.split(" ")[0] : a}
            </Txt>
            <Txt x={narrow ? 570 : 250} y={76 + i * 48} k="t" anchor={narrow ? "end" : "start"} tone="ok">
              {b}
            </Txt>
            {!narrow && (
              <Txt x={570} y={76 + i * 48} k="s" anchor="end">
                {c}
              </Txt>
            )}
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "budget accuracy is contractual" : "budget accuracy is a hard, contractual requirement"}
        </Txt>
      </g>
    );
  }
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone="bad">
        the biggest risk
      </Txt>
      <Box x={20} y={56} w={560} h={90} label="budget accuracy" sub={narrow ? "a contractual breach" : "latency and availability recover; an overspend is a contractual breach"} tone="bad" />
      <Box x={20} y={170} w={560} h={70} label={narrow ? "chaos-test the budget path" : "test it hardest: chaos engineering on the budget path"} tone="ok" opacity={o(3)} />
      <Txt x={20} y={H - 16} anchor="start">
        {narrow ? "advertisers don't pay overspend" : "if we overspend, advertisers don't pay; we eat the cost"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "path") return <Path {...p} />;
  if (p.variant === "dives") return <Dives {...p} />;
  if (p.variant === "operate") return <Operate {...p} />;
  return <Reqs {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "reqs",
      label: "Requirements",
      steps: [
        { caption: "The final design: a real-time bidding platform for 10 billion ad requests a day. In 100 milliseconds it must take a bid request, query the DSPs, run an auction and return the winner.", tween: 1600, ms: 3800 },
        { caption: "The bar: under 100 milliseconds at p99, 99.99 percent availability, 500,000 requests a second at peak, never more than 0.1 percent over budget, and 7 years of audit.", tween: 1600, ms: 3600 },
        { caption: "10 billion a day is about 116,000 a second, about 500,000 at peak. At 8 KB each that's 80 TB a day, about 200 PB over 7 years, and 150 servers with headroom.", tween: 1600, ms: 3800 },
      ],
    },
    {
      id: "path",
      label: "Latency & path",
      steps: [
        { caption: "Budget the 100 milliseconds: 2 to receive, 5 to parse, 75 for the DSP fan-out with a hard 70 millisecond timeout, 10 for the auction and 3 to send, leaving 5 spare.", tween: 2000, ms: 3800 },
        { caption: "GeoDNS picks the nearest region, the edge rate-limits and filters fraud, the orchestrator fans out to 5 to 10 DSPs, and the auction reserves budget. Events go to Kafka after the reply.", tween: 2000, ms: 3800 },
      ],
    },
    {
      id: "dives",
      label: "Deep dives",
      steps: [
        { caption: "Why budget is hard: $10,000 a day, $9,990 spent, and 1,000 simultaneous $20 bids that each see $10 left. Spend becomes $29,990, 200 percent over.", tween: 1800, ms: 3600 },
        { caption: "So budget is a hierarchy of leases: the global coordinator gives regions $4,000, $3,500 and $2,000 and keeps $500; each pod spends a $100 lease locally.", tween: 1600, ms: 3600 },
        { caption: "The audit trail writes an outbox row in the same transaction as the budget; Debezium feeds Kafka, partitioned by advertiser, into billing, a 7-year data lake and fraud training.", tween: 1600, ms: 3600 },
        { caption: "Fraud detection is tiered: rules in under half a millisecond block about 5 percent, an ML score in under 2 milliseconds about 2 percent, and a deep async analysis updates both.", tween: 1600, ms: 3600 },
      ],
    },
    {
      id: "operate",
      label: "Operate",
      steps: [
        { caption: "For the Super Bowl: pre-scale to 3x a day before, query only the top 5 DSPs with a 50 millisecond timeout, and shed low-value requests if still overwhelmed.", tween: 1600, ms: 3600 },
        { caption: "A DSP answering in 500 milliseconds trips its circuit breaker after 5 timeouts for 30 seconds. A partitioned region bids on its leases, then stops.", tween: 1400, ms: 3400 },
        { caption: "SLOs: 99.9 percent under 100 milliseconds, 99.99 percent availability, 99.9 percent of campaigns within 0.1 percent of budget, and a bid rate above 80 percent.", tween: 1600, ms: 3600 },
        { caption: "The biggest risk is budget accuracy: latency and availability recover, but an overspend is a contractual breach. Test that path hardest, with chaos engineering.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
