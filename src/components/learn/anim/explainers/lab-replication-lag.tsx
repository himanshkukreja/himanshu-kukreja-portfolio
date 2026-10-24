/**
 * Break it: replication lag vs stale reads (week 1, day 2 · 3.1 / 5.5 / 5.6). The lesson's URL
 * shortener: 1,000 creates/s, replica lag ~50 ms, and Solution 2 (read new URLs from the primary
 * for 5 s). Model: reads are spread evenly over the rows being read; a read is stale when its row
 * was written less than one lag ago, so stale share = write rate × lag ÷ rows being read.
 */
import { Box, defineExplainer, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const LAGS = [0, 10, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000];
const HOT = [1000, 10000, 100000, 1000000];
const WINDOW = 5; // seconds a new URL is read from the primary (Solution 2)
const PRI = { x: 24, y: 58, w: 140, h: 60 };
const REP = { x: 436, y: 58, w: 140, h: 60 };
const RD = { x: 230, y: 168, w: 140, h: 50 };

/** point on a cubic Bézier */
function bez(p: number[], u: number) {
  const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
  return { x: a * p[0] + b * p[2] + c * p[4] + d * p[6], y: a * p[1] + b * p[3] + c * p[5] + d * p[7] };
}
const TO_REP = [RD.x + RD.w, RD.y + 25, REP.x + 70, RD.y + 25, REP.x + 70, REP.y + 80, REP.x + 70, REP.y + REP.h + 2];
const TO_PRI = [RD.x, RD.y + 25, PRI.x + 70, RD.y + 25, PRI.x + 70, PRI.y + 80, PRI.x + 70, PRI.y + PRI.h + 2];
const pathOf = (p: number[]) => `M${p[0]} ${p[1]}C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}`;

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const ms = (v: number) => (v >= 1000 ? `${v / 1000} s` : `${v} ms`);
const pct = (f: number) => (f >= 0.995 ? "100%" : f >= 0.1 ? `${Math.round(f * 100)}%` : f >= 0.001 ? `${(f * 100).toFixed(1)}%` : f > 0 ? `${(f * 100).toFixed(2)}%` : "0%");

function Scene({ variant, clock, narrow, values }: SceneProps) {
  const w = values.w ?? 1000;
  const lag = LAGS[values.lag ?? 2] ?? 50;
  const hot = HOT[values.hot ?? 1] ?? 10000;
  const prim = variant === "primary";
  const inFlight = (w * lag) / 1000;
  // rows written less than one lag ago are behind on the replica; with Solution 2 the newest 5 s go to the primary
  const toPrimary = prim ? Math.min(1, (w * WINDOW) / hot) : 0;
  const stale = Math.max(0, Math.min(1, (w * lag) / 1000 / hot) - toPrimary);
  const tone: Tone = stale === 0 ? "ok" : stale < 0.01 ? "warn" : "bad";
  const tok = Math.min(8, Math.max(lag ? 1 : 0, Math.round(inFlight / 20)));
  const N = 6;
  const red = stale > 0 ? Math.max(1, Math.round(N * stale)) : 0;
  const stats: [string, string, Tone][] = [
    [narrow ? "stale" : "stale reads", pct(stale), tone],
    [narrow ? "in flight" : "writes in flight", n(inFlight), lag ? "warn" : "ok"],
    prim ? [narrow ? "to primary" : "reads to primary", pct(toPrimary), toPrimary > 0.5 ? "warn" : "mute"] : ["1 in", stale > 0 ? n(1 / stale) : "never", tone],
  ];
  return (
    <g>
      <Txt x={24} y={30} k="k" anchor="start">
        {narrow ? "async replication" : "async replication · TinyLink creates"}
      </Txt>
      <Box x={PRI.x} y={PRI.y} w={PRI.w} h={PRI.h} label="Primary" sub={narrow ? `${n(w)}/s` : `${n(w)} writes/s`} tone={prim ? "lit" : undefined} />
      <Box x={REP.x} y={REP.y} w={REP.w} h={REP.h} label="Replica" sub={`lag ${ms(lag)}`} tone={lag >= 5000 ? "bad" : lag >= 1000 ? "warn" : undefined} />
      {/* the replication stream: writes not yet applied on the replica */}
      <rect className="ax-meter" x={PRI.x + PRI.w} y={80} width={REP.x - PRI.x - PRI.w} height={16} />
      {Array.from({ length: tok }, (_, k) => {
        const u = (clock * 0.35 + k / Math.max(1, tok)) % 1;
        return <Token key={k} x={PRI.x + PRI.w + 10 + u * (REP.x - PRI.x - PRI.w - 20)} y={88} s={8} tone="warn" />;
      })}
      <Txt x={300} y={72} k="s" tone={lag ? "warn" : "ok"}>
        {lag ? `${n(inFlight)} not yet applied` : "applied instantly"}
      </Txt>
      {/* reads */}
      <Box x={RD.x} y={RD.y} w={RD.w} h={RD.h} label="Reads" sub={narrow ? undefined : `over ${n(hot)} rows`} />
      <Wire d={pathOf(TO_REP)} arrow tone={stale > 0.01 ? "bad" : undefined} />
      {prim && <Wire d={pathOf(TO_PRI)} arrow tone="lit" />}
      {prim && (
        <Txt x={PRI.x + 70} y={RD.y + 48} k="s" tone="lit">
          {narrow ? "new < 5 s" : "created < 5 s ago"}
        </Txt>
      )}
      {Array.from({ length: N }, (_, k) => {
        const u = (clock * 0.45 + k / N) % 1;
        const bad = (k * 5) % N < red;
        const pri = prim && k % 3 === 1 && toPrimary > 0;
        const p = bez(pri ? TO_PRI : TO_REP, u);
        return <Token key={k} x={p.x} y={p.y} s={8} tone={pri ? "lit" : bad ? "bad" : "ok"} />;
      })}
      {stats.map(([k, v, tn], i) => (
        <g key={i}>
          <Txt x={24 + i * 196} y={258} k="k" anchor="start" tone={tn === "mute" ? "mute" : tn}>
            {k}
          </Txt>
          <Txt x={24 + i * 196} y={294} k="d" anchor="start" tone={tn === "mute" ? undefined : tn}>
            {v}
          </Txt>
        </g>
      ))}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  controls: [
    { id: "w", label: "Write rate", min: 100, max: 20000, step: 100, value: 1000, format: (v) => `${n(v)} writes/s` },
    { id: "lag", label: "Replica lag", min: 0, max: LAGS.length - 1, step: 1, value: 2, format: (v) => ms(LAGS[v] ?? 0) },
    { id: "hot", label: "Rows being read", min: 0, max: HOT.length - 1, step: 1, value: 1, format: (v) => n(HOT[v] ?? 0) },
  ],
  variants: [
    {
      id: "replica",
      label: "Read replicas",
      steps: [
        { caption: "1,000 creates/s with ~50 ms of lag: about 50 writes are always on their way to the replica. A read of one of those rows gets the old value, or the friend's 404 from the lesson.", loop: true, ms: 7000 },
        { caption: "Drag the lag up: under heavy load followers fall seconds or minutes behind. Writes in flight = write rate × lag, so stale reads grow with both. Push the write rate too.", loop: true, ms: 7000 },
      ],
    },
    {
      id: "primary",
      label: "Primary for 5 s",
      steps: [
        { caption: "Solution 2: reads of URLs created in the last 5 seconds go to the primary. At 50 ms of lag no stale read reaches anyone; the primary takes the reads of brand-new rows.", loop: true, ms: 7000 },
        { caption: "Now drag the lag past 5 s: the window is shorter than the lag and stale reads come back. The window must cover the worst lag you tolerate.", loop: true, ms: 6500 },
      ],
    },
  ],
  Scene,
});
