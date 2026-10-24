/**
 * Break it: cache TTL vs hit rate (week 4, day 1 · 4.2 / 6.2 / 6.3). Cache-aside in front of a
 * database: hit ~2 ms, miss ~55 ms, TTL 300 s, 1,000 req/s. Model (stated in the catalog summary):
 * 3,000 equally popular keys, Poisson arrivals, so each key misses once and then hits for one TTL:
 * hit rate = λT / (1 + λT) with λ = traffic / 3,000. That reproduces the lesson's 99% / ~10 req/s.
 */
import { defineExplainer, Meter, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const KEYS = 3000;
const APP = { x: 24, y: 128, w: 104, h: 56 };
const RED = { x: 196, y: 52, w: 140, h: 56 };
const DB = { x: 196, y: 204, w: 140, h: 56 };
const SX = 376;

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const dur = (s: number) => (s >= 3600 ? `${+(s / 3600).toFixed(1)} h` : s >= 120 ? `${+(s / 60).toFixed(1)} min` : `${s} s`);

/** point on a cubic Bézier */
function bez(p: number[], u: number) {
  const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
  return { x: a * p[0] + b * p[2] + c * p[4] + d * p[6], y: a * p[1] + b * p[3] + c * p[5] + d * p[7] };
}
const HIT = [APP.x + APP.w, 148, 164, 148, 164, RED.y + 28, RED.x, RED.y + 28];
const MISS = [APP.x + APP.w, 164, 164, 164, 164, DB.y + 28, DB.x, DB.y + 28];
const pathOf = (p: number[]) => `M${p[0]} ${p[1]}C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}`;

function Scene({ step, clock, narrow, values }: SceneProps) {
  const ttl = values.ttl ?? 300;
  const rps = values.rps ?? 1000;
  const lt = (rps / KEYS) * ttl;
  const hit = lt / (1 + lt);
  const db = rps * (1 - hit);
  const avg = hit * 2 + (1 - hit) * 55;
  const tone: Tone = hit >= 0.95 ? "ok" : hit >= 0.8 ? "warn" : "bad";
  const N = 8;
  const misses = db < 0.5 ? 0 : Math.max(1, Math.round(N * (1 - hit)));
  return (
    <g>
      <Txt x={APP.x} y={30} k="k" anchor="start">
        {narrow ? "cache-aside" : "cache-aside · get product:123"}
      </Txt>
      <Txt x={APP.x + APP.w / 2} y={APP.y - 14} k="s" tone="sky">
        {`${n(rps)}/s`}
      </Txt>
      <rect className="ax-box" x={APP.x} y={APP.y} width={APP.w} height={APP.h} />
      <Txt x={APP.x + APP.w / 2} y={APP.y + 33}>
        App
      </Txt>
      <Wire d={pathOf(HIT)} tone={hit > 0.5 ? "ok" : undefined} arrow />
      <Wire d={pathOf(MISS)} tone={db > rps * 0.2 ? "bad" : undefined} arrow />
      <rect className={`ax-box${step === 0 ? " lit" : ""}`} x={RED.x} y={RED.y} width={RED.w} height={RED.h} />
      <Txt x={RED.x + RED.w / 2} y={RED.y + 25}>
        Redis
      </Txt>
      <Txt x={RED.x + RED.w / 2} y={RED.y + 45} k="s">
        hit ~2 ms
      </Txt>
      <rect className={`ax-box${step === 1 ? " lit" : db > rps * 0.5 ? " bad" : ""}`} x={DB.x} y={DB.y} width={DB.w} height={DB.h} />
      <Txt x={DB.x + DB.w / 2} y={DB.y + 25}>
        Database
      </Txt>
      <Txt x={DB.x + DB.w / 2} y={DB.y + 45} k="s">
        miss ~55 ms
      </Txt>
      {/* traffic: a share of the tokens miss and go to the database */}
      {Array.from({ length: N }, (_, k) => {
        const u = (clock * 0.5 + k / N) % 1;
        const miss = (k * 3) % N < misses;
        const p = bez(miss ? MISS : HIT, u);
        return <Token key={k} x={p.x} y={p.y} s={8} tone={miss ? "bad" : "ok"} />;
      })}
      {/* TTL: how long one fill lives */}
      <Txt x={DB.x + DB.w / 2} y={RED.y + RED.h + 22} k="s" tone={step === 2 ? "lit" : "mute"}>
        {`TTL ${ttl} s`}
      </Txt>
      {/* readouts */}
      <Txt x={SX} y={42} k="k" anchor="start" tone={tone}>
        hit rate
      </Txt>
      <Txt x={SX} y={78} k="d" anchor="start" tone={tone}>
        {`${(hit * 100).toFixed(hit > 0.999 || hit < 0.001 ? 0 : 1)}%`}
      </Txt>
      <Txt x={SX} y={100} k="s" anchor="start">
        {narrow ? `avg ${avg.toFixed(1)} ms` : `avg latency ${avg.toFixed(1)} ms`}
      </Txt>
      <Txt x={SX} y={138} k="k" anchor="start" tone={db > rps * 0.5 ? "bad" : "mute"}>
        db load
      </Txt>
      <Txt x={SX} y={174} k="d" anchor="start" tone={db > rps * 0.5 ? "bad" : undefined}>
        {`${n(db)}/s`}
      </Txt>
      <Meter x={SX} y={184} w={200} h={10} value={db} max={Math.max(1, rps)} tone={db > rps * 0.5 ? "bad" : "sky"} />
      <Txt x={SX} y={232} k="k" anchor="start" tone={step === 2 ? "lit" : "mute"}>
        {narrow ? "worst stale" : "worst staleness"}
      </Txt>
      <Txt x={SX} y={268} k="d" anchor="start" tone={step === 2 ? "lit" : undefined}>
        {ttl === 0 ? "none" : dur(ttl)}
      </Txt>
      <Txt x={SX} y={290} k="s" anchor="start">
        {narrow ? "if inval. fails" : "if invalidation fails"}
      </Txt>
      {!narrow && (
        <Txt x={APP.x} y={300} k="s" anchor="start" tone="mute">
          {`model · ${n(KEYS)} equally hot keys`}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  controls: [
    { id: "ttl", label: "Cache TTL", min: 0, max: 1800, step: 15, value: 300, unit: "s" },
    { id: "rps", label: "Traffic", min: 100, max: 10000, step: 100, value: 1000, format: (v) => `${n(v)} req/s` },
  ],
  variants: [
    {
      id: "lab",
      label: "Lab",
      steps: [
        { caption: "TTL 300 s at 1,000 req/s: about 99% hits, so only ~10 req/s reach the database. Drag the TTL to 0: every request misses and all 1,000 hit the database, like a cold restart.", loop: true, ms: 7000 },
        { caption: "Put the TTL back and push traffic up. The database barely notices: each key misses about once per TTL, so misses level off however busy it gets.", loop: true, ms: 6500 },
        { caption: "Now drag the TTL up. The hit rate creeps toward 100%, but if an invalidation fails readers see the old price for up to the whole TTL. Set it to the staleness you can tolerate.", loop: true, ms: 7000 },
      ],
    },
  ],
  Scene,
});
