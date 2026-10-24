/**
 * Week 9, day 2 overview (noisy neighbour): the whole lesson in four tabs. The Monday 9 AM incident
 * (acme_corp's export: 847 s, 2.3 billion rows, latency 200 → 15,000 ms) and the shared-capacity
 * picture (15/25/20% → 95/3/2%); the defence layers (gateway token bucket, concurrency, query guard,
 * per-tenant pools and timeouts, infrastructure quotas); quota tiers, per-tenant buckets and fair
 * scheduling; and the mistakes (global limiter, silent throttling, one limit for every operation).
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- the problem */

function Problem({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const o = seg(t, 0.2, 0.8);
    const kpi: [string, string, string][] = [
      ["API latency", "200ms", "15,000ms"],
      ["DB CPU", "30%", "98%"],
      ["errors", "0.1%", "45%"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start" tone="bad">
          Monday 9:00 AM · alerts fire
        </Txt>
        {kpi.map(([l, a, b], i) => (
          <g key={l}>
            <Txt x={110 + i * 190} y={66} k="s">
              {l}
            </Txt>
            <Txt x={110 + i * 190} y={88} k="s">
              {`was ${a}`}
            </Txt>
            <Txt x={110 + i * 190} y={124} k="d" tone={o > 0.5 ? "bad" : undefined}>
              {o > 0.5 ? b : a}
            </Txt>
          </g>
        ))}
        <rect className="ax-box bad" x={20} y={148} width={560} height={92} />
        <Txt x={36} y={174} k="s" anchor="start">
          {narrow ? "SELECT * FROM events" : "SELECT * FROM events WHERE tenant_id = 'acme_corp'"}
        </Txt>
        <Txt x={36} y={196} k="s" anchor="start">
          {narrow ? "tenant: acme_corp" : "AND created_at > '2020-01-01' ORDER BY created_at"}
        </Txt>
        <Txt x={36} y={224} k="t" anchor="start" tone="bad">
          {narrow ? "847 s · 2.3B rows" : "847 s and still running · 2.3 billion rows scanned"}
        </Txt>
        <Txt x={20} y={H - 20} anchor="start" tone="bad" opacity={seg(t, 0.6, 1)}>
          {narrow ? "500 tenants down · $50K/hour" : "500 other tenants can't work · $50,000/hour churn"}
        </Txt>
      </g>
    );
  }
  const segs: [string, number, number, Tone][] = [
    ["A", 15, 95, "lit"],
    ["B", 25, 3, "sky"],
    ["C", 20, 2, "ok"],
  ];
  const k = step === 1 ? 0 : ease(t);
  let x = 40;
  const used = segs.reduce((a, s) => a + lerp(s[1], s[2], k), 0);
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        shared resources · 100% capacity
      </Txt>
      <rect className="ax-meter" x={40} y={110} width={520} height={56} />
      {segs.map(([n, a, b, tone]) => {
        const w = (520 * lerp(a, b, k)) / 100;
        const x0 = x;
        x += w;
        const pct = Math.round(lerp(a, b, k));
        return (
          <g key={n}>
            <rect className={`ax-fill ${tone}`} x={x0} y={110} width={w} height={56} />
            {(step === 1 || t <= 0.6) && w > 40 && (
              <Txt x={x0 + w / 2} y={96} k="t">
                {`${n} ${pct}%`}
              </Txt>
            )}
          </g>
        );
      })}
      {step === 2 && t > 0.6 && (
        <g>
          <Txt x={40 + 260} y={96} k="t" tone="bad">
            {narrow ? "A 95% · noisy" : "Tenant A 95% · noisy neighbour"}
          </Txt>
          <Txt x={556} y={196} k="t" anchor="end" tone="bad">
            {narrow ? "B 3% · C 2%: starved" : "B 3% · C 2% · starved"}
          </Txt>
        </g>
      )}
      <Txt x={300} y={240} k="d" tone={used > 99 ? "bad" : "ok"}>
        {`${Math.max(0, Math.round(100 - used))}% free`}
      </Txt>
      <Txt x={20} y={H - 20} anchor="start" tone={step === 1 ? "ok" : "bad"}>
        {step === 1 ? "system healthy" : narrow ? "one tenant's legit use broke all" : "one tenant's legitimate use broke everyone"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- the layers */

const COLS = [
  { x: 110, l: "Gateway", n: "Gateway", lim: ["60/min · 429", "60/min"], blk: "429 · Retry-After" },
  { x: 230, l: "App", n: "App", lim: ["5 at once", "5 at once"], blk: "6th in flight" },
  { x: 350, l: "Query guard", n: "Guard", lim: ["EXPLAIN", "EXPLAIN"], blk: "> 10M rows" },
  { x: 470, l: "Database", n: "DB", lim: ["5 conn · 30s", "5 · 30 s"], blk: "timeout" },
];
const LANES = [
  { n: "acme", y: 112 },
  { n: "globex", y: 152 },
  { n: "initech", y: 192 },
];

function Layers({ step, t, narrow }: SceneProps) {
  const cw = 110;
  const k = ease(seg(t, 0, 0.7));
  const stopX = step < 4 ? COLS[step].x - 10 : 560;
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? `layer ${[1, 2, 2, 3, 4][step]} of 4` : ["layer 1 · API gateway", "layer 2 · application", "layer 2 · application: query guard", "layer 3 · database", "layer 4 · infrastructure"][step]}
      </Txt>
      {LANES.map((l) => (
        <g key={l.n}>
          <line className="ax-wire" x1={86} x2={580} y1={l.y} y2={l.y} />
          <Txt x={20} y={l.y + 5} k="s" anchor="start" tone={l.n === "acme" ? "bad" : undefined}>
            {l.n}
          </Txt>
        </g>
      ))}
      {COLS.map((c, i) => (
        <g key={c.l}>
          <rect className={`ax-box ${i === step ? "lit" : i < step ? "ok" : ""}`} x={c.x} y={60} width={cw - 10} height={170} opacity={0.92} />
          <Txt x={c.x + 50} y={82} k="t" tone={i <= step ? undefined : "mute"}>
            {narrow ? c.n : c.l}
          </Txt>
          {i <= step && (
            <Txt x={c.x + 50} y={220} k="s" tone={i === step ? "lit" : undefined}>
              {c.lim[narrow ? 1 : 0]}
            </Txt>
          )}
        </g>
      ))}
      {step === 4 && <rect className="ax-box lit" x={110} y={240} width={460} height={28} opacity={seg(t, 0, 0.4)} />}
      {step === 4 && (
        <Txt x={340} y={259} k="s" tone="lit" opacity={seg(t, 0, 0.4)}>
          {narrow ? "CPU · memory · I/O quotas" : "k8s CPU/memory quotas · I/O throttling · bandwidth"}
        </Txt>
      )}
      {step < 4 && <Token x={lerp(86, stopX, k)} y={112} s={12} tone="bad" />}
      {t > 0.7 && step < 4 && (
        <Txt x={COLS[step].x + 50} y={50} k="s" tone="bad">
          {narrow ? ["429", "6th", "10M+", "timeout"][step] : COLS[step].blk}
        </Txt>
      )}
      {[152, 192].map((y, i) => (
        <Token key={y} x={lerp(86, 572, seg(t, 0.1 * i, 0.8 + 0.1 * i))} y={y} s={10} tone="ok" />
      ))}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {narrow ? "others keep working" : "each layer catches what the previous layers missed"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- quotas + fairness */

const TIERS = [
  ["API calls/min", "60", "1,000", "10,000"],
  ["concurrent", "5", "50", "200"],
  ["query timeout", "30 s", "120 s", "300 s"],
  ["export rows", "1,000", "100,000", "1M"],
];

function Quotas({ step, t, narrow }: SceneProps) {
  const o = seg(t, 0, 0.5);
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {["quota tiers by plan", "token bucket per tenant", "fair queue · round robin", "weighted fair queuing"][step]}
      </Txt>
      {step === 0 && (
        <g opacity={o}>
          {["", "Free", "Pro", "Enterprise"].map((h, i) => (
            <Txt key={h} x={i === 0 ? 20 : 200 + (i - 1) * 140} y={70} k="k" anchor={i === 0 ? "start" : "middle"}>
              {narrow && h === "Enterprise" ? "Ent." : h}
            </Txt>
          ))}
          {TIERS.map((r, j) =>
            r.map((c, i) => (
              <Txt key={`${j}${i}`} x={i === 0 ? 20 : 200 + (i - 1) * 140} y={110 + j * 44} k={i === 0 ? "s" : "t"} anchor={i === 0 ? "start" : "middle"} tone={i === 3 ? "lit" : undefined}>
                {narrow && i === 0 ? c.split(" ")[0] : c}
              </Txt>
            )),
          )}
          <Txt x={20} y={H - 16} anchor="start" tone="ok">
            {narrow ? "an upgrade path, built in" : "limits become a feature: higher limits = higher tier"}
          </Txt>
        </g>
      )}
      {step === 1 &&
        [
          { n: "acme", x: 140, v: lerp(10, 0, ease(t)), tone: "bad" as Tone },
          { n: "globex", x: 380, v: 10, tone: "ok" as Tone },
        ].map((b) => (
          <g key={b.n}>
            <Txt x={b.x + 40} y={66} k="t">
              {b.n}
            </Txt>
            <rect className="ax-meter" x={b.x} y={78} width={80} height={140} />
            <rect className={`ax-fill ${b.tone}`} x={b.x} y={78 + 140 * (1 - b.v / 10)} width={80} height={(140 * b.v) / 10} />
            <Txt x={b.x + 40} y={244} k="s" tone={b.v < 0.5 ? "bad" : "ok"}>
              {b.v < 0.5 ? "empty → 429" : "tokens left"}
            </Txt>
            {b.n === "acme" && t > 0.9 && (
              <Txt x={b.x + 40} y={264} k="s" tone="bad">
                Retry-After
              </Txt>
            )}
          </g>
        ))}
      {step === 1 && (
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "bursts OK · per tenant" : "bursts up to the bucket size · limit headers always"}
        </Txt>
      )}
      {step >= 2 && (
        <g>
          <Txt x={20} y={84} k="s" anchor="start">
            {step === 2 ? "A: 100 jobs" : narrow ? "ent. w 20" : "enterprise · w 20"}
          </Txt>
          <Txt x={20} y={164} k="s" anchor="start">
            {step === 2 ? "B: 1 job" : narrow ? "free w 1" : "free · w 1"}
          </Txt>
          {step === 2 &&
            Array.from({ length: 12 }, (_, i) => <Token key={i} x={170 + i * 16} y={80} s={11} tone="sky" opacity={i === 0 && t > 0.3 ? 0.2 : 1} />)}
          {step === 2 && <Token x={170} y={160} s={11} tone="ok" opacity={t > 0.65 ? 0.2 : 1} />}
          {step === 2 &&
            ["A", "B", "A", "A"].map((n, i) => (
              <g key={i} opacity={seg(t, 0.25 + i * 0.18, 0.4 + i * 0.18)}>
                <Box x={410 + (i % 2) * 80} y={70 + Math.floor(i / 2) * 60} w={70} h={44} label={n} tone={n === "B" ? "ok" : "sky"} />
              </g>
            ))}
          {step === 3 && (
            <g>
              <Txt x={200} y={84} k="t" anchor="start" tone="ok">
                (9 + 1) / 20 = 0.5
              </Txt>
              <Txt x={200} y={164} k="t" anchor="start">
                (0 + 1) / 1 = 1.0
              </Txt>
              <Txt x={200} y={214} k="s" anchor="start" tone="lit" opacity={seg(t, 0.4, 1)}>
                {narrow ? "lower runs first" : "lower score runs first: enterprise wins"}
              </Txt>
            </g>
          )}
          <Txt x={20} y={H - 16} anchor="start" tone="ok">
            {step === 2 ? (narrow ? "B runs after ~1 A job" : "B runs after about one of A's jobs, not all 100") : narrow ? "weight by plan" : "weighted by plan · no tenant starves"}
          </Txt>
        </g>
      )}
    </g>
  );
}

/* ---------------------------------------------------------------- mistakes */

const OPS: [string, number][] = [
  ["health", 10000],
  ["default", 1000],
  ["search", 100],
  ["export", 10],
  ["bulk_create", 5],
];

function Mistakes({ step, t, narrow }: SceneProps) {
  const o = seg(t, 0, 0.5);
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone={step < 3 ? "bad" : "ok"}>
        {["mistake · one global limiter", "mistake · silent throttling", "mistake · same limit for everything", "the default approach"][step]}
      </Txt>
      {step === 0 && (
        <g opacity={o}>
          <Txt x={40} y={84} k="s" anchor="start">
            global limit · 1,000 req/s
          </Txt>
          <rect className="ax-meter" x={40} y={96} width={520} height={48} />
          <rect className="ax-fill bad" x={40} y={96} width={468 * ease(t)} height={48} />
          <rect className="ax-fill ok" x={40 + 468 * ease(t)} y={96} width={52} height={48} />
          <Txt x={40 + 234} y={176} k="t" tone="bad">
            one tenant: 900
          </Txt>
          <Txt x={556} y={176} k="t" anchor="end" tone="ok">
            {narrow ? "rest: 100" : "everyone else: 100"}
          </Txt>
          <Txt x={20} y={H - 16} anchor="start" tone="ok">
            {narrow ? "fix: per-tenant limits" : "fix: a rate limit per tenant, not one for all"}
          </Txt>
        </g>
      )}
      {step === 1 && (
        <g opacity={o}>
          <Box x={30} y={70} w={260} h={150} label="sleep(10)" sub={narrow ? "holds a conn" : "holds a connection"} tone="bad" />
          <Box x={310} y={70} w={260} h={150} label="429" sub="Retry-After: 30" tone="ok" />
          <Txt x={160} y={244} k="s" tone="bad">
            {narrow ? "user: why slow?" : "user doesn't know why"}
          </Txt>
          <Txt x={440} y={244} k="s" tone="ok">
            {narrow ? "clear message" : "message + upgrade link"}
          </Txt>
        </g>
      )}
      {step === 2 &&
        OPS.map(([n, v], i) => {
          const f = Math.log10(v) / 4;
          return (
            <g key={n}>
              <Txt x={narrow ? 150 : 140} y={82 + i * 40} k="s" anchor="end">
                {narrow && n === "bulk_create" ? "bulk" : n}
              </Txt>
              <Meter x={160} y={68 + i * 40} w={300 * f * ease(t)} h={18} value={1} max={1} tone={v <= 10 ? "warn" : v >= 10000 ? "ok" : undefined} />
              <Txt x={170 + 300 * f * ease(t)} y={82 + i * 40} k="t" anchor="start">
                {v.toLocaleString("en-US")}
              </Txt>
            </g>
          );
        })}
      {step === 2 && (
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "req/min by cost (log scale)" : "requests/minute by operation cost (log scale)"}
        </Txt>
      )}
      {step === 3 &&
        ["per-tenant rate limits first", "query timeouts early", "monitor before you enforce", "alert at 80% of quota"].map((s, i) => (
          <g key={s} opacity={seg(t, i * 0.2, i * 0.2 + 0.3)}>
            <Token x={44} y={84 + i * 48} s={12} tone="ok" />
            <Txt x={64} y={89 + i * 48} k="t" anchor="start">
              {narrow ? s.replace(" of quota", "").replace("per-tenant ", "") : s}
            </Txt>
          </g>
        ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "layers") return <Layers {...p} />;
  if (p.variant === "quotas") return <Quotas {...p} />;
  if (p.variant === "mistakes") return <Mistakes {...p} />;
  return <Problem {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "Problem",
      steps: [
        { caption: "Monday, 9 AM: latency jumps from 200 milliseconds to 15 seconds. Someone at acme_corp ran an export-all-data report: 847 seconds, 2.3 billion rows scanned.", tween: 1600, ms: 3800 },
        { caption: "Normally tenants A, B and C use 15, 25 and 20 percent of the shared capacity, and 40 percent is free.", tween: 800, ms: 3000 },
        { caption: "A noisy neighbour takes 95 percent and starves B and C. One tenant's legitimate use broke everyone else.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "layers",
      label: "Layers",
      steps: [
        { caption: "Layer one, the API gateway: a token bucket per tenant. acme's flood gets HTTP 429 with Retry-After, while globex and initech pass.", tween: 1600 },
        { caption: "Layer two, the application: concurrency limits. Inside its rate limit, acme still can't run more than 5 requests at once on Free.", tween: 1600 },
        { caption: "A query guard runs EXPLAIN first. Over 10 million estimated rows is very high, and a DELETE without WHERE is blocked outright.", tween: 1600, ms: 3200 },
        { caption: "Layer three, the database: per-tenant connection pools and statement timeouts, 5 connections and 30 seconds on Free, 50 and 5 minutes on Enterprise.", tween: 1600, ms: 3400 },
        { caption: "Layer four, infrastructure: CPU and memory quotas, I/O throttling and bandwidth limits. Each layer catches what the previous ones missed.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "quotas",
      label: "Quotas",
      steps: [
        { caption: "Quotas are tiered by plan: 60, 1,000 or 10,000 API calls a minute, and 5, 50 or 200 concurrent requests. Higher limits become the upgrade path.", tween: 1000, ms: 3600 },
        { caption: "A token bucket per tenant allows short bursts. When acme's bucket is empty it gets 429 with Retry-After; globex's bucket is untouched.", tween: 1600, ms: 3200 },
        { caption: "Background jobs get one queue per tenant, served round-robin. B's single job runs after about one of A's 100, not after all of them.", tween: 2000, ms: 3200 },
        { caption: "Weighted fair queuing scores running plus one over weight. Enterprise with 9 running scores 0.5 and beats a free tenant's 1.0.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "mistakes",
      label: "Mistakes",
      steps: [
        { caption: "One global limiter of 1,000 requests a second: a tenant sending 900 leaves 100 for everyone else. Limits must be per tenant.", tween: 1400, ms: 3200 },
        { caption: "Silent throttling sleeps 10 seconds and holds a connection, and the user never learns why. A 429 with Retry-After frees it at once.", tween: 1000, ms: 3200 },
        { caption: "One limit for every operation is wrong: 1,000 exports melt the database, 1,000 health checks are nothing. Search 100, export 10, health 10,000.", tween: 1400, ms: 3400 },
        { caption: "The default: start with per-tenant rate limits, add query timeouts early, monitor before you enforce, and warn tenants at 80 percent of quota.", tween: 1600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
