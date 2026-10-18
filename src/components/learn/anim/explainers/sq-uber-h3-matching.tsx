/**
 * Uber side quest (deep dives 1 and 3): every 4-second ping turns a driver's position into one H3
 * cell at resolution 9 and moves it between `cell:{id}` sets only when it crosses a cell edge, with
 * a 30 s TTL on `driver:{id}`; a ride request searches the rider's cell, then k = 1, k = 2 rings,
 * keeps the available drivers and sorts them by real distance (adjacent centres ~0.3 km apart);
 * dispatch scores candidates (0.4 ETA, 0.2 rating, 0.2 acceptance, 0.2 wait), offers the best one
 * for 15 s and falls back to the next on a decline or timeout.
 */
import { Box, clamp, defineExplainer, ease, lerp, Meter, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;
const R = 24; // hex circumradius (pointy-top)
const S3 = Math.sqrt(3);
const GX = 150;
const GY = 160;
const KM = 0.3 / (S3 * R); // adjacent cell centres are ~0.3 km apart at resolution 9

type Pt = { x: number; y: number };
const hc = (q: number, r: number): Pt => ({ x: GX + S3 * R * (q + r / 2), y: GY + 1.5 * R * r });
const ringOf = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const HEXES: { q: number; r: number; k: number }[] = [];
for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) HEXES.push({ q, r, k: ringOf(q, r) });
const hexPath = ({ x, y }: Pt) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 90) * Math.PI) / 180;
    return `${i ? "L" : "M"}${(x + R * Math.cos(a)).toFixed(1)} ${(y + R * Math.sin(a)).toFixed(1)}`;
  }).join("") + "Z";

type Drv = { id: string; q: number; r: number; dx: number; dy: number; busy?: boolean };
const DRIVERS: Drv[] = [
  { id: "D1", q: 1, r: 0, dx: -8, dy: 3 },
  { id: "D2", q: -1, r: 1, dx: 2, dy: 4 },
  { id: "D7", q: 0, r: -1, dx: 4, dy: 2, busy: true },
  { id: "D3", q: 2, r: -1, dx: -4, dy: 6 },
  { id: "D4", q: -2, r: 0, dx: 6, dy: -4 },
  { id: "D5", q: 0, r: 2, dx: -6, dy: -3 },
  { id: "D6", q: 1, r: -2, dx: 5, dy: 5 },
];
const pos = (d: Drv): Pt => {
  const c = hc(d.q, d.r);
  return { x: c.x + d.dx, y: c.y + d.dy };
};
const km = (d: Drv) => {
  const p = pos(d);
  return Math.hypot(p.x - GX, p.y - GY) * KM;
};
const ring = (d: Drv) => ringOf(d.q, d.r);
const AVAIL = DRIVERS.filter((d) => !d.busy);
const BY_DIST = [...AVAIL].sort((a, b) => km(a) - km(b));
// the weighted score's ranking (illustrative): the nearest driver, D1, comes second
const BY_SCORE: { id: string; s: number }[] = [
  { id: "D3", s: 0.81 },
  { id: "D1", s: 0.74 },
  { id: "D5", s: 0.66 },
  { id: "D2", s: 0.58 },
  { id: "D4", s: 0.47 },
  { id: "D6", s: 0.39 },
];

const PX = 316; // right panel
const PW = 268;

function Grid({ fill, labels }: { fill: (q: number, r: number, k: number) => string; labels?: Record<string, string> }) {
  return (
    <g>
      {HEXES.map((h) => {
        const c = hc(h.q, h.r);
        const key = `${h.q},${h.r}`;
        return (
          <g key={key}>
            <path d={hexPath(c)} className={`hx ${fill(h.q, h.r, h.k)}`} />
            {labels?.[key] && (
              <text className="ax-s hx-l" x={c.x} y={c.y + 21} textAnchor="middle">
                {labels[key]}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function Rider() {
  return <rect className="rider" x={GX - 7} y={GY - 7} width={14} height={14} />;
}

function IndexScene({ step, t, narrow }: SceneProps) {
  // D1 drives from cell A (0,0) into cell B (1,0); D2 waits in B
  const a = hc(0, 0);
  const b = hc(1, 0);
  const edge = GX + (S3 * R) / 2;
  const p = step === 0 ? 0 : step === 1 ? ease(seg(t, 0.05, 0.85)) : 1;
  const d1: Pt = { x: lerp(a.x - 12, b.x - 6, p), y: a.y + 2 };
  const inB = d1.x > edge;
  const expired = step === 2 && t >= 1;
  const ttl = step === 2 ? Math.round(30 * (1 - t)) : 30;
  const pinging = step === 0 ? seg(t, 0.1, 0.7) : step === 1 ? seg(t, 0.55, 0.95) : 0;
  const box = (x: number, label: string, sub: string, tone: Tone) => <Box x={x} y={64} w={128} h={60} label={label} sub={sub} tone={tone} />;
  const cmd = step === 0 ? "SADD cell:A D1" : step === 1 ? (inB ? (narrow ? "SREM A · SADD B" : "SREM cell:A · SADD cell:B") : "same cell: no change") : expired ? "hash gone: skip D1" : "no pings arriving";
  const target: Pt = inB ? { x: PX + 140 + 64, y: 124 } : { x: PX + 64, y: 124 };
  return (
    <g>
      <Grid fill={(q, r) => (q === 0 && r === 0 ? (inB ? "" : "on") : q === 1 && r === 0 ? (inB ? "on" : "") : "")} labels={{ "0,0": "A", "1,0": "B" }} />
      <Token x={b.x + 14} y={b.y - 12} tone="ok" label="D2" />
      <Token x={d1.x} y={d1.y} s={12} tone={step === 2 ? (expired ? "mute" : "warn") : "lit"} label="D1" opacity={expired ? 0.5 : 1} />
      {pinging > 0 && pinging < 1 && <Token x={lerp(d1.x, target.x, pinging)} y={lerp(d1.y, target.y, pinging)} s={8} tone="lit" />}
      <Txt x={GX} y={40} k="k">
        {narrow ? "H3 res 9" : "H3 · resolution 9 · ~0.1 km²"}
      </Txt>
      <Txt x={GX} y={286} k="s">
        {step === 2 ? (narrow ? "D1 stops pinging" : "D1 goes quiet") : narrow ? "ping every 4 s" : "a ping every 4 s"}
      </Txt>
      <Txt x={PX} y={40} k="k" anchor="start">
        redis
      </Txt>
      {box(PX, "cell:A", inB ? "{ }" : "{D1}", inB ? undefined : "lit")}
      {box(PX + 140, "cell:B", inB ? "{D1, D2}" : "{D2}", inB ? "lit" : undefined)}
      <Box x={PX} y={146} w={PW} h={60} label="driver:D1" sub={expired ? "expired" : narrow ? `cell ${inB ? "B" : "A"} · TTL ${ttl}s` : `cell ${inB ? "B" : "A"} · lat, lng · TTL ${ttl} s`} tone={expired ? "bad" : step === 2 ? "warn" : undefined} />
      <Meter x={PX} y={216} w={PW} h={8} value={ttl} max={30} tone={step === 2 ? "warn" : "ok"} />
      <Txt x={PX} y={256} anchor="start" tone={expired ? "bad" : step === 1 && inB ? "lit" : undefined}>
        {cmd}
      </Txt>
    </g>
  );
}

function RingScene({ step, t, narrow }: SceneProps) {
  const reach = step === 0 ? 0 : step === 1 ? 1 : 2;
  const grow = step === 0 ? 1 : t;
  const shown = (d: Drv) => ring(d) < reach || (ring(d) === reach && grow >= 0.5);
  const list = step >= 2 ? BY_DIST.filter((d) => t >= 0.6 || ring(d) <= 1) : BY_DIST.filter(shown);
  return (
    <g>
      <Grid fill={(_q, _r, k) => (k === 0 ? "on" : k < reach || (k === reach && grow >= 0.3) ? "ring" : "")} />
      {DRIVERS.map((d) => {
        const p = pos(d);
        const hit = shown(d);
        return <Token key={d.id} x={p.x} y={p.y} tone={d.busy ? "mute" : hit ? "ok" : "mute"} label={d.id} opacity={hit ? 1 : 0.45} />;
      })}
      <Rider />
      <Txt x={GX} y={40} k="k">
        {narrow ? "rider's cell + rings" : "rider's cell, then rings"}
      </Txt>
      <Txt x={GX} y={286} anchor="middle" tone="lit">
        {`k = ${reach}`}
      </Txt>
      <Txt x={PX} y={40} k="k" anchor="start">
        {step >= 2 ? (narrow ? "nearest first" : "candidates · nearest first") : "candidates"}
      </Txt>
      {list.length === 0 && (
        <Txt x={PX} y={78} anchor="start" tone="mute">
          {narrow ? "none in k = 0" : "none in the rider's cell"}
        </Txt>
      )}
      {list.map((d, i) => (
        <g key={d.id}>
          <Txt x={PX} y={78 + i * 30} anchor="start" tone={i === 0 && step >= 2 ? "ok" : undefined}>
            {d.id}
          </Txt>
          <Txt x={PX + 60} y={78 + i * 30} anchor="start" k="s">
            {step >= 2 ? `${km(d).toFixed(2)} km` : `ring ${ring(d)}`}
          </Txt>
        </g>
      ))}
      {step >= 1 && (
        <Txt x={PX} y={78 + Math.max(list.length, 1) * 30} anchor="start" k="s" tone="mute">
          {narrow ? "D7 busy: skip" : "D7 busy: filtered out"}
        </Txt>
      )}
      <Txt x={PX} y={286} anchor="start" k="s">
        {step >= 2 ? (narrow ? "then ETA + score" : "real distance, then ETA + score") : narrow ? "cell → driver set" : "each cell → its driver set"}
      </Txt>
    </g>
  );
}

function DispatchScene({ step, t, narrow }: SceneProps) {
  const rank = BY_SCORE;
  const offer = step === 0 ? -1 : step === 1 ? 0 : t < 0.35 ? 0 : 1;
  const left = step === 1 ? Math.round(15 - 12 * clamp(t)) : 0;
  const matched = step === 2 && t >= 0.85;
  const drv = (id: string) => DRIVERS.find((d) => d.id === id)!;
  const bar = (s: number) => (PW - 80) * s;
  const off = drv(rank[Math.max(0, offer)].id);
  const op = pos(off);
  const fly = step === 2 ? seg(t, 0.4, 0.8) : step === 1 ? seg(t, 0, 0.3) : 0;
  return (
    <g>
      <Grid fill={(_q, _r, k) => (k === 0 ? "on" : "ring")} />
      {DRIVERS.map((d) => {
        const p = pos(d);
        const isOffer = offer >= 0 && d.id === rank[offer].id;
        const declined = step === 2 && d.id === rank[0].id;
        const tone: Tone = d.busy ? "mute" : declined ? "bad" : matched && isOffer ? "ok" : isOffer ? "lit" : "sky";
        return <Token key={d.id} x={p.x} y={p.y} s={isOffer ? 13 : 10} tone={tone} label={d.id} opacity={d.busy ? 0.45 : 1} />;
      })}
      <Rider />
      {fly > 0 && fly < 1 && <Token x={lerp(GX, op.x, fly)} y={lerp(GY, op.y, fly)} s={8} tone="lit" />}
      <Txt x={GX} y={40} k="k">
        {narrow ? "score, offer" : "score, then offer"}
      </Txt>
      <Txt x={GX} y={286} k="s" tone={matched ? "ok" : step >= 1 ? "warn" : undefined}>
        {matched ? "MATCHED" : step === 0 ? (narrow ? "6 available" : "6 available candidates") : step === 2 ? (t < 0.35 ? "D3: no answer" : "offer → D1") : `${narrow ? "" : "offer · "}${left} s left`}
      </Txt>
      <Txt x={PX} y={40} k="k" anchor="start">
        {narrow ? "score" : "weighted score"}
      </Txt>
      {rank.map((r, i) => {
        const y = 60 + i * 30;
        const isOffer = i === offer;
        const declined = step === 2 && i === 0;
        const tone: Tone = declined ? "bad" : matched && isOffer ? "ok" : isOffer ? "lit" : undefined;
        return (
          <g key={r.id}>
            <Txt x={PX} y={y + 13} anchor="start" tone={tone}>
              {r.id}
            </Txt>
            <rect className="ax-meter" x={PX + 44} y={y} width={PW - 80} height={16} />
            <rect className={`ax-fill${tone ? " " + tone : " sky"}`} x={PX + 44} y={y} width={bar(r.s) * (step === 0 ? ease(seg(t, i * 0.08, 0.5 + i * 0.08)) : 1)} height={16} />
            <Txt x={PX + PW} y={y + 13} anchor="end" k="s" tone={tone}>
              {declined ? "no" : matched && isOffer ? "yes" : `#${i + 1}`}
            </Txt>
          </g>
        );
      })}
      <Txt x={PX} y={248} anchor="start" k="s">
        0.4 ETA + 0.2 rating
      </Txt>
      <Txt x={PX} y={267} anchor="start" k="s">
        + 0.2 accept + 0.2 wait
      </Txt>
      <Txt x={PX} y={288} anchor="start" k="s" tone="mute">
        {narrow ? "nearest D1 is #2" : "the nearest, D1, ranks #2"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "index") return <IndexScene {...p} />;
  if (p.variant === "ring") return <RingScene {...p} />;
  return <DispatchScene {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "index",
      label: "Cell index",
      steps: [
        { caption: "Every 4 seconds a driver's ping becomes one H3 cell id at resolution 9: a street block. D1 joins cell:A.", tween: 1600 },
        { caption: "D1 crosses into cell B: SREM from cell:A, SADD to cell:B. Moving inside a cell changes no set.", tween: 2600 },
        { caption: "driver:D1 carries a 30-second TTL. If its pings stop, the hash expires and lookups skip D1.", tween: 2400, ms: 3200 },
      ],
    },
    {
      id: "ring",
      label: "Ring search",
      steps: [
        { caption: "A rider requests. Their point maps to one cell; that cell's driver set is read first (k = 0): nobody.", tween: 900 },
        { caption: "Widen to the 6 neighbours (k = 1), all equidistant. D1 and D2 are free; busy D7 is filtered out.", tween: 1600 },
        { caption: "Widen to k = 2. Only these few candidates get a real distance, sorted nearest first, then ETA and scoring.", tween: 2200, ms: 3400 },
      ],
    },
    {
      id: "dispatch",
      label: "Dispatch",
      steps: [
        { caption: "Each candidate is scored: 0.4 ETA, 0.2 rating, 0.2 acceptance, 0.2 wait time. The nearest isn't automatically first.", tween: 1800 },
        { caption: "Top scorer D3 is marked pending and offered the ride. It has 15 seconds to answer.", tween: 3200 },
        { caption: "No answer in 15 s: D3 is released and the next best, D1, gets the offer and accepts.", tween: 2400, ms: 3200 },
      ],
    },
  ],
  css: `.hx{fill:none;stroke:var(--ax-line);stroke-width:1.5}.hx.ring{fill:var(--ax-accent);fill-opacity:.1}.hx.on{fill:var(--ax-accent);fill-opacity:.22;stroke:var(--ax-accent);stroke-width:2}.rider{fill:none;stroke:var(--ax-fg);stroke-width:2.5}.hx-l{fill:var(--ax-fg4)}`,
  Scene,
});
