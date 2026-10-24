/**
 * Week 10, day 4 overview (capacity planning): the whole lesson in four tabs. Friday 11:47 PM at
 * 5x traffic versus a system pre-scaled a day earlier, and the measure → forecast → identify →
 * plan → validate cycle; headroom (3,000 vs 2,000 QPS = 33%) and the latency-vs-load curve
 * (1,000 RPS sustainable, 1,800 breaking); the month-by-month forecast, Little's Law sizing
 * (500 RPS × 0.2 s → 36 pods) and queueing; load tests, scale up vs out, and auto-scaling lag.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- the nightmare */

function Nightmare({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  if (step === 0) {
    const al: [string, string][] = [
      ["p99 latency", "15 s (SLO 200 ms)"],
      ["DB connections", "exhausted"],
      ["error rate", "45% (SLO 0.1%)"],
      ["memory", "98%"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start" tone="bad">
          Friday, 11:47 PM · the dashboard is all red
        </Txt>
        {al.map(([a, b], i) => (
          <g key={a} opacity={o(i)}>
            <Box x={20 + (i % 2) * 290} y={48 + Math.floor(i / 2) * 82} w={270} h={68} label={a} sub={b} tone="bad" />
          </g>
        ))}
        <Txt x={20} y={244} k="t" anchor="start" tone="warn" opacity={o(4)}>
          {narrow ? "viral campaign: 5x traffic" : "a viral campaign sent 5x traffic, and nobody told engineering"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "firefighting at midnight" : "you're firefighting at midnight"}
        </Txt>
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start" tone="ok">
          the same night, with capacity planning
        </Txt>
        {(narrow ? ["know your limits", "forecast demand", "scale BEFORE", "pre-scaled 24 h ago"] : ["you know your system's limits", "you forecast future demand", "you scale BEFORE you need to", "the campaign was pre-scaled 24 hours ago"]).map((s, i) => (
          <g key={s} opacity={o(i)}>
            <Token x={34} y={72 + i * 46} s={12} tone="ok" />
            <Txt x={54} y={77 + i * 46} k="t" anchor="start">
              {s}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start" tone="ok" opacity={o(4)}>
          {narrow ? "you're asleep at midnight" : "and you're sleeping peacefully at midnight"}
        </Txt>
      </g>
    );
  const cyc: [string, string, Tone][] = [
    ["measure", "what now?", "sky"],
    ["forecast", "what next?", "sky"],
    ["identify", "what breaks?", "bad"],
    ["plan", "what to do?", "sky"],
    ["validate", "it works?", "ok"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        the capacity planning cycle
      </Txt>
      {cyc.map(([a, b, tone], i) => (
        <g key={a} opacity={o(i)}>
          <Box x={20 + i * 114} y={90} w={104} h={70} label={a} sub={narrow ? undefined : b} tone={tone} />
          {i < 4 && <Wire d={`M${124 + i * 114} 125H${134 + i * 114}`} arrow />}
        </g>
      ))}
      <Wire d="M532 160V200H72V164" dash arrow />
      <Txt x={300} y={224} k="s" opacity={o(5)}>
        back to measure
      </Txt>
      <Txt x={20} y={H - 16} anchor="start">
        {narrow ? "scale before you need to" : "the best time to scale is before you need to"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- measure */

const BANDS: [number, number, string, Tone][] = [
  [50, 100, "healthy", "ok"],
  [30, 50, "adequate", "sky"],
  [20, 30, "warning", "warn"],
  [10, 20, "critical", "bad"],
  [0, 10, "emerg.", "bad"],
];

function Measure({ step, t, narrow }: SceneProps) {
  const k = ease(t);
  if (step === 0) {
    const x = (p: number) => lerp(40, 560, p / 100);
    const head = lerp(100, 33, k);
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "headroom = (max − used) / max" : "headroom = (max capacity − current) / max capacity"}
        </Txt>
        <Txt x={40} y={74} k="t" anchor="start">
          {narrow ? "DB max 3,000 QPS" : "database max 3,000 QPS"}
        </Txt>
        <Txt x={560} y={74} k="t" anchor="end" tone="sky">
          {`${Math.round(lerp(0, 2000, k)).toLocaleString("en-US")} used`}
        </Txt>
        {BANDS.map(([a, b, l, tone]) => (
          <g key={l}>
            <rect className={`ax-fill ${tone}`} x={x(a)} y={96} width={x(b) - x(a)} height={40} opacity={0.3} />
            <Txt x={(x(a) + x(b)) / 2} y={160} k="s" tone={tone}>
              {b - a < 20 ? "" : l}
            </Txt>
          </g>
        ))}
        <Txt x={x(15)} y={160} k="s" tone="bad">
          {narrow ? "< 30%" : "< 30%: scale"}
        </Txt>
        <rect className="ax-fill lit" x={x(head) - 3} y={88} width={6} height={56} />
        <Txt x={300} y={222} k="d" tone={head < 30 ? "warn" : "sky"}>
          {`${Math.round(head)}% headroom`}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "keep ≥ 30% on critical parts" : "keep at least 30% headroom on critical resources"}
        </Txt>
      </g>
    );
  }
  const px = (r: number) => lerp(60, 560, r / 2000);
  const py = (ms: number) => lerp(250, 50, Math.min(1, Math.log10(ms / 100) / Math.log10(50)));
  const pts = [0, 500, 1000, 1250, 1500, 1650, 1800, 1900].map((r) => [r, [100, 120, 200, 300, 500, 1000, 3000, 5000][[0, 500, 1000, 1250, 1500, 1650, 1800, 1900].indexOf(r)]]);
  const d = pts
    .filter(([r]) => r <= lerp(0, 1900, k))
    .map(([r, ms], i) => `${i ? "L" : "M"}${px(r)} ${py(ms)}`)
    .join("");
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        latency vs load · find the limits
      </Txt>
      <line className="ax-wire" x1={60} x2={560} y1={250} y2={250} />
      <line className="ax-wire ok" x1={60} x2={560} y1={py(200)} y2={py(200)} strokeDasharray="5 6" />
      <Txt x={64} y={py(200) - 8} k="s" anchor="start" tone="ok">
        200 ms SLO
      </Txt>
      <path className="cp-curve" d={d} />
      {[
        [700, "plan ≤ 700", "sky"],
        [1000, "1,000 sustainable", "ok"],
        [1800, "1,800 breaks", "bad"],
      ].map(([r, l, tone]) => (
        <g key={l as string} opacity={seg(t, 0.5, 0.9)}>
          <line className={`ax-wire ${tone}`} x1={px(r as number)} x2={px(r as number)} y1={60} y2={250} strokeDasharray="3 5" />
          <Txt x={px(r as number)} y={r === 700 ? 52 : 272} k="s" tone={tone as Tone}>
            {narrow ? (l as string).split(" ")[0] : (l as string)}
          </Txt>
        </g>
      ))}
      <Txt x={20} y={H - 14} anchor="start">
        {narrow ? "capacity: max load within SLO" : "capacity = the max load within the SLO, minus 30% headroom"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- forecast + bottlenecks */

const MONTHS: [string, number, number][] = [
  ["Jan", 1500, 2000],
  ["Feb", 1650, 2000],
  ["Mar", 1815, 2000],
  ["Apr", 2000, 2500],
  ["May", 2200, 2500],
];

function Forecast({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  if (step === 0) {
    const y = (r: number) => lerp(250, 60, r / 2600);
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "forecast · 10% a month" : "forecast · peak grows ~10% a month"}
        </Txt>
        {MONTHS.map(([m, peak, cap], i) => {
          const hd = Math.floor(((cap - peak) / cap) * 100);
          const tone: Tone = hd < 10 ? "bad" : hd < 20 ? "bad" : hd < 30 ? "warn" : "ok";
          return (
            <g key={m} opacity={o(i)}>
              <rect className="ax-meter" x={50 + i * 106} y={y(cap)} width={70} height={250 - y(cap)} />
              <rect className={`ax-fill ${tone}`} x={50 + i * 106} y={y(peak)} width={70} height={250 - y(peak)} opacity={0.8} />
              <Txt x={85 + i * 106} y={272} k="s">
                {m}
              </Txt>
              <Txt x={85 + i * 106} y={y(cap) - 8} k="s" tone={tone}>
                {`${hd}%`}
              </Txt>
            </g>
          );
        })}
        <Txt x={20} y={H - 14} anchor="start" tone="warn" opacity={o(5)}>
          {narrow ? "Feb 17%: scale now (4–6 wk)" : "Feb at 17%: start scaling now, it takes 4–6 weeks"}
        </Txt>
      </g>
    );
  }
  if (step === 1) {
    const rows: [string, string][] = [
      ["L = λ × W", "Little's Law"],
      ["500 RPS × 0.2 s", "= 100 in flight"],
      ["100 ÷ 4 workers", "= 25 pods"],
      ["25 ÷ 0.7", "≈ 36 pods"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "size it with Little's Law" : "size it: L = arrivals × time in system"}
        </Txt>
        {rows.map(([a, b], i) => (
          <g key={a} opacity={o(i * 1.3)}>
            <Txt x={30} y={84 + i * 50} k="t" anchor="start" tone={i === 0 ? "lit" : undefined}>
              {a}
            </Txt>
            <Txt x={570} y={84 + i * 50} k="t" anchor="end" tone={i === 3 ? "ok" : undefined}>
              {b}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start" tone="warn">
          {narrow ? "20 workers at 150 RPS: spiral" : "at 150 RPS, 20 workers need 30: queues and latency spiral"}
        </Txt>
      </g>
    );
  }
  const px = (u: number) => lerp(60, 560, u);
  const py = (w: number) => lerp(250, 60, Math.min(1, w / 12));
  const curve = Array.from({ length: 19 }, (_, i) => i / 20)
    .filter((u) => u <= lerp(0.05, 0.95, ease(t)))
    .map((u, i) => `${i ? "L" : "M"}${px(u)} ${py(u / (1 - u))}`)
    .join("");
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? "wait vs utilization" : "queueing · wait vs utilization"}
      </Txt>
      <rect className="ax-fill bad" x={px(0.8)} y={60} width={px(1) - px(0.8)} height={190} opacity={0.15} />
      <line className="ax-wire" x1={60} x2={560} y1={250} y2={250} />
      <path className="cp-curve" d={curve} />
      {[
        [0.5, "1×"],
        [0.8, "4×"],
        [0.9, "9×"],
      ].map(([u, l]) => (
        <g key={l as string} opacity={seg(t, 0.4, 0.9)}>
          <rect className="ax-fill lit" x={px(u as number) - 5} y={py((u as number) / (1 - (u as number))) - 5} width={10} height={10} />
          <Txt x={px(u as number) - 10} y={py((u as number) / (1 - (u as number))) - 12} k="t" anchor="end" tone="lit">
            {l as string}
          </Txt>
          <Txt x={px(u as number)} y={272} k="s">
            {`${Math.round((u as number) * 100)}%`}
          </Txt>
        </g>
      ))}
      <Txt x={20} y={H - 14} anchor="start" tone="bad">
        {narrow ? "stay under 70–80%" : "never run critical resources above 70–80% utilization"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- scale + test */

function Scale({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  if (step === 0) {
    const tests: [string, string, number[]][] = [
      ["smoke", "it works", [1, 1, 1, 1]],
      ["load", "normal load", [5, 5, 5, 5]],
      ["stress", "find limits", [2, 4, 6, 8]],
      ["spike", "2x → 10x → 2x", [2, 8, 2, 2]],
      ["soak", "hours, days", [4, 4, 4, 4, 4, 4]],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          five load tests
        </Txt>
        {tests.map(([a, b, bars], i) => (
          <g key={a} opacity={o(i)}>
            <Box x={20 + i * 114} y={50} w={104} h={190} label={a} sub={narrow ? undefined : b} />
            {bars.map((v, j) => (
              <rect key={j} className="ax-fill sky" x={30 + i * 114 + j * (84 / bars.length)} y={226 - v * 6} width={84 / bars.length - 3} height={v * 6} />
            ))}
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "know the limits before users find them" : "find the limits before your users do"}
        </Txt>
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          scale up or scale out
        </Txt>
        <Box x={20} y={56} w={270} h={170} label="vertical" sub={narrow ? "4 → 16 CPU" : "4 CPU · 8 GB → 16 CPU · 64 GB"} tone="sky" />
        <Box x={310} y={56} w={270} h={170} label="horizontal" sub={narrow ? "pod → 4 pods" : "pod → pod 1, 2, 3, 4"} tone="ok" />
        <Txt x={155} y={196} k="s" opacity={o(2)}>
          {narrow ? "simple · limited" : "simple · limited · for DBs"}
        </Txt>
        <Txt x={445} y={196} k="s" opacity={o(3)}>
          {narrow ? "unlimited · stateless" : "near-unlimited · stateless"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "up for the DB, out for services" : "scale up the primary database; scale out stateless services"}
        </Txt>
      </g>
    );
  const k = ease(seg(t, 0, 0.8));
  const lag = k > 0.4;
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        auto-scaling · and its lag
      </Txt>
      {[
        ["CPU > 70%", "+3 pods", "ok"],
        ["CPU < 30%", "−1 pod, 15 min cooldown", "sky"],
        ["p99 > 200 ms", "scale up", "ok"],
      ].map(([a, b, tone], i) => (
        <g key={a} opacity={o(i)}>
          <Txt x={30} y={76 + i * 40} k="t" anchor="start">
            {a}
          </Txt>
          <Txt x={570} y={76 + i * 40} k={narrow ? "s" : "t"} anchor="end" tone={tone as Tone}>
            {narrow ? b.split(",")[0] : b}
          </Txt>
        </g>
      ))}
      <rect className="ax-meter" x={30} y={190} width={540} height={30} />
      <rect className={`ax-fill ${lag ? "bad" : "warn"}`} x={30} y={190} width={540 * k} height={30} opacity={0.6} />
      <Txt x={300} y={210} k="s">
        {narrow ? "3–5 min to scale" : "a scale-up takes 3–5 minutes: the spike arrives first"}
      </Txt>
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {narrow ? "pre-scale known events" : "pre-scale for known events; auto-scale for sustained growth"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "measure") return <Measure {...p} />;
  if (p.variant === "forecast") return <Forecast {...p} />;
  if (p.variant === "scale") return <Scale {...p} />;
  return <Nightmare {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.cp-curve{fill:none;stroke:var(--ax-accent);stroke-width:2.5}`,
  variants: [
    {
      id: "night",
      label: "Why",
      steps: [
        { caption: "Friday, 11:47 PM: p99 latency is 15 seconds, database connections are exhausted, errors are at 45 percent. A viral campaign sent 5x traffic and nobody told engineering.", tween: 1600, ms: 3800 },
        { caption: "With capacity planning you know your limits, forecast demand and scale before you need to: the campaign was pre-scaled 24 hours earlier.", tween: 1400, ms: 3400 },
        { caption: "It's a cycle: measure what you can handle now, forecast demand, identify what breaks first, plan the scaling, validate with tests, and measure again.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "measure",
      label: "Measure",
      steps: [
        { caption: "Headroom is spare capacity over maximum: a database that handles 3,000 queries a second at 2,000 has 33 percent. Keep at least 30 percent on critical resources.", tween: 1600, ms: 3600 },
        { caption: "Load-test to find the curve: latency stays within the 200 millisecond SLO up to 1,000 requests a second and breaks at 1,800. Plan to run at about 700.", tween: 2000, ms: 3600 },
      ],
    },
    {
      id: "forecast",
      label: "Forecast",
      steps: [
        { caption: "At 10 percent a month, January's 25 percent headroom becomes 17 percent in February and 9 in March. Start scaling in February: it takes 4 to 6 weeks.", tween: 1600, ms: 3800 },
        { caption: "Little's Law sizes the fleet: 500 requests a second at 0.2 seconds is 100 in flight, 25 pods of 4 workers, about 36 with 30 percent headroom.", tween: 1600, ms: 3600 },
        { caption: "Queueing explains the headroom: at 50 percent utilization wait is about one service time, at 80 percent four, at 90 percent nine. Stay under 70 to 80 percent.", tween: 1800, ms: 3600 },
      ],
    },
    {
      id: "scale",
      label: "Scale & test",
      steps: [
        { caption: "Five load tests: smoke to check it works, load for normal traffic, stress to find the breaking point, spike for sudden jumps, and soak for hours to days.", tween: 1600, ms: 3400 },
        { caption: "Scale up with bigger machines, simple but limited and good for databases, or scale out with more pods, nearly unlimited but they must be stateless.", tween: 1200, ms: 3400 },
        { caption: "Auto-scaling adds 3 pods above 70 percent CPU and removes one below 30, but a scale-up takes 3 to 5 minutes. Pre-scale for known events.", tween: 1600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
