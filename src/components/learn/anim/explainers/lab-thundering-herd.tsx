/**
 * Break it: the thundering herd (week 4, day 3 · 1.3 / 2.2 / 2.3 / 8.3). The lesson's numbers:
 * 10,000 req/s, 99% hits so 100 misses/s, a database that handles 1,000 queries/s, a hot key with
 * 5,000 req/s (5,100/s, 5× overload), 10,000 keys warmed together with TTL 300 s, ±10% jitter.
 * Model: expiries spread evenly over ±jitter × 300 s; while a key is missing, every request for it
 * in that second queries the database (no protection) or one query per key does (single flight).
 */
import { defineExplainer, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const TTL = 300;
const BASE = 100;
const CAP = 1000;
const C = { x0: 60, x1: 584, y0: 120, y1: 268, span: 160 };
const KEYS = [1, 10, 100, 1000, 10000];

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const yOf = (v: number) => C.y1 - ((Math.log10(Math.max(10, v)) - 1) / (Math.log10(20000) - 1)) * (C.y1 - C.y0);
const xOf = (s: number) => C.x0 + ((s + C.span) / (2 * C.span)) * (C.x1 - C.x0);

function Scene({ variant, clock, narrow, values }: SceneProps) {
  const K = KEYS[values.keys ?? 0] ?? 1;
  const rps = values.rps ?? 5000;
  const jit = (values.jit ?? 0) / 100;
  const sf = variant === "sf";
  const spread = Math.max(1, 2 * jit * TTL);
  const perKey = rps / K;
  const q = sf ? Math.min(1, perKey) : perKey; // database queries per expiring key, in its second
  const discrete = K < spread; // keys expire one at a time, seconds apart
  const peak = BASE + (discrete ? q : (K / spread) * q);
  const over = peak / CAP;
  const tone: Tone = over > 1 ? "bad" : over > 0.7 ? "warn" : "ok";
  // the load curve over ±160 s around the moment the TTL runs out
  const half = spread / 2;
  let d = `M${C.x0} ${yOf(BASE)}`;
  if (discrete) {
    const xs = K === 1 ? [0] : Array.from({ length: K }, (_, i) => -half + (spread * (i + 0.5)) / K);
    for (const s of xs) {
      const x = xOf(s);
      d += `H${x - 1.5}V${yOf(peak)}H${x + 1.5}V${yOf(BASE)}`;
    }
  } else {
    d += `H${Math.max(C.x0, xOf(-half) - (spread <= 1 ? 1.5 : 0))}V${yOf(peak)}H${Math.min(C.x1, xOf(half) + (spread <= 1 ? 1.5 : 0))}V${yOf(BASE)}`;
  }
  d += `H${C.x1}`;
  const area = `${d}V${C.y1}H${C.x0}Z`;
  const cur = clock > 0 ? C.x0 + ((clock * 0.12) % 1) * (C.x1 - C.x0) : 0;
  const stats: [string, string, Tone][] = [
    [narrow ? "peak db" : "peak db load", `${n(peak)}/s`, tone],
    [narrow ? "vs 1,000/s" : "vs capacity 1,000/s", `${over >= 10 ? Math.round(over) : over.toFixed(1)}×`, tone],
    [narrow ? "spread" : "expiries spread", spread <= 1 ? "1 s" : `${Math.round(spread)} s`, jit > 0 ? "ok" : "mute"],
  ];
  return (
    <g>
      <Txt x={C.x0 - 44} y={28} k="k" anchor="start">
        {sf ? "single flight" : "no protection"}
      </Txt>
      <Txt x={C.x1} y={28} k="k" anchor="end" tone="mute">
        {narrow ? `${n(K)} key${K > 1 ? "s" : ""} · ttl 300 s` : `${n(K)} key${K > 1 ? "s expire" : " expires"} · ${n(rps)} req/s on ${K > 1 ? "them" : "it"} · ttl 300 s`}
      </Txt>
      {stats.map(([k, v, tn], i) => (
        <g key={i}>
          <Txt x={C.x0 - 44 + i * 196} y={56} k="k" anchor="start" tone={tn === "mute" ? "mute" : tn}>
            {k}
          </Txt>
          <Txt x={C.x0 - 44 + i * 196} y={92} k="d" anchor="start" tone={tn === "mute" ? undefined : tn}>
            {v}
          </Txt>
        </g>
      ))}
      {/* chart */}
      <line className="th-ax" x1={C.x0} x2={C.x1} y1={C.y1} y2={C.y1} />
      {[100, 1000, 10000].map((v) => (
        <g key={v}>
          <line className="th-g" x1={C.x0} x2={C.x1} y1={yOf(v)} y2={yOf(v)} />
          <Txt x={C.x0 - 6} y={yOf(v) + 4} k="s" anchor="end">
            {v >= 1000 ? `${v / 1000}K` : String(v)}
          </Txt>
        </g>
      ))}
      <path className={`th-a ${tone}`} d={area} />
      <path className={`th-l ${tone}`} d={d} />
      <line className="th-cap" x1={C.x0} x2={C.x1} y1={yOf(CAP)} y2={yOf(CAP)} />
      <Txt x={C.x0 + 4} y={yOf(CAP) - 6} k="s" anchor="start" tone="bad">
        capacity
      </Txt>
      <line className="th-g" x1={xOf(0)} x2={xOf(0)} y1={C.y0} y2={C.y1} />
      {cur > 0 && <line className="th-cur" x1={cur} x2={cur} y1={C.y0} y2={C.y1} />}
      <Txt x={C.x0} y={C.y1 + 22} k="s" anchor="start">
        −160 s
      </Txt>
      <Txt x={xOf(0)} y={C.y1 + 22} k="s">
        {narrow ? "TTL ends" : "TTL runs out"}
      </Txt>
      <Txt x={C.x1} y={C.y1 + 22} k="s" anchor="end">
        +160 s
      </Txt>
      {!narrow && (
        <Txt x={C.x0 + 4} y={C.y0 - 6} k="s" anchor="start" tone="mute">
          db queries/s (log scale) · baseline 100 misses/s
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.th-ax{stroke:var(--ax-line);stroke-width:1.5}.th-g{stroke:var(--ax-line-soft);stroke-width:1}.th-cap{stroke:var(--ax-bad);stroke-width:1.5;stroke-dasharray:5 5}.th-cur{stroke:var(--ax-fg4);stroke-width:1}
.th-a{opacity:.22;fill:var(--ax-ok)}.th-a.warn{fill:var(--ax-amber)}.th-a.bad{fill:var(--ax-bad)}.th-l{fill:none;stroke-width:2;stroke:var(--ax-ok)}.th-l.warn{stroke:var(--ax-amber)}.th-l.bad{stroke:var(--ax-bad)}`,
  controls: [
    { id: "keys", label: "Keys expiring together", min: 0, max: 4, step: 1, value: 0, format: (v) => n(KEYS[v] ?? 1) },
    { id: "rps", label: "Traffic on those keys", min: 100, max: 10000, step: 100, value: 5000, format: (v) => `${n(v)} req/s` },
    { id: "jit", label: "TTL jitter", min: 0, max: 50, step: 5, value: 0, format: (v) => `±${v}%` },
  ],
  variants: [
    {
      id: "none",
      label: "No protection",
      steps: [
        { caption: "One very hot key takes 5,000 req/s and expires: every request misses at once. 100 + 5,000 = 5,100 queries/s against a database that handles 1,000: 5× overload. Jitter can't help one key; try the Single flight tab.", loop: true, ms: 7500 },
        { caption: "Now set 10,000 keys and 10,000 req/s: a deploy warmed them all with TTL 300 s, so they expire in the same second. Drag the jitter to ±10% (±30 s) and watch the spike flatten.", loop: true, ms: 7500 },
      ],
    },
    {
      id: "sf",
      label: "Single flight",
      steps: [
        { caption: "Single flight: one database query per expiring key; the other requests wait for its result. The hot key's 5,000 misses become 1.", loop: true, ms: 6500 },
        { caption: "Set 10,000 keys expiring together: single flight still sends one query per key, 10,000 at once. Only jitter spreads them out; production uses both.", loop: true, ms: 7000 },
      ],
    },
  ],
  Scene,
});
