/**
 * Break it: feed fan-out, push vs pull (week 4, day 4 · 3.1–3.3). The lesson's numbers: celebrity
 * threshold 10,000 followers, fan-out workers at 100,000 feed writes/s, 10M / 20M / 300M-follower
 * accounts, a reader following 500 accounts of which 10 are celebrities. Model: below the threshold
 * a post is pushed (one cache write per follower, delivered at 100,000 writes/s); at or above it the
 * post is stored once and pulled. The reader is illustrative: 10 of the 500 accounts are above
 * 10,000 followers, and ~3× more clear each 10× lower threshold (capped at 500).
 */
import { Box, defineExplainer, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const FOL = [50, 200, 1000, 10000, 100000, 1e6, 1e7, 2e7, 5e7, 3e8];
const THR = [100, 1000, 10000, 100000, 1e6, 1e7, 1e8, Infinity];
const WPS = 100000;
const GRID = { x: 214, y: 56, cols: 8, rows: 4, s: 16, gap: 7 };

const short = (v: number) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : String(v));
const n = (v: number) => Math.round(v).toLocaleString("en-US");
const dur = (s: number) => (s >= 60 ? `${+(s / 60).toFixed(1)} min` : s >= 1 ? `${+s.toFixed(1)} s` : `${Math.max(1, Math.round(s * 1000))} ms`);
/** illustrative reader: celebrities (≥ threshold) among the 500 accounts they follow */
const celebs = (t: number) => (t === Infinity ? 0 : Math.min(500, Math.round(10 * Math.sqrt(10000 / t))));

function Scene({ clock, narrow, values }: SceneProps) {
  const F = FOL[values.fol ?? 6] ?? 1e7;
  const T = THR[values.thr ?? 2] ?? 10000;
  const push = F < T;
  const deliver = F / WPS;
  const c = celebs(T);
  const cells = GRID.cols * GRID.rows;
  const filled = push ? (clock > 0 ? Math.floor(((clock * 0.35) % 1) * (cells + 1)) : cells) : 0;
  const slow = push && deliver >= 60;
  const wTone: Tone = !push ? "ok" : slow ? "bad" : deliver >= 10 ? "warn" : "ok";
  const rTone: Tone = c > 50 ? "bad" : c > 20 ? "warn" : "ok";
  const gw = GRID.cols * (GRID.s + GRID.gap) - GRID.gap;
  const stats: [string, string, Tone][] = [
    [narrow ? "writes" : "cache writes", push ? short(F) : "0", wTone],
    [narrow ? "last sees it" : "last follower sees it", push ? dur(deliver) : "on read", wTone],
    [narrow ? "pulls/load" : "pulls per feed load", String(c), rTone],
  ];
  return (
    <g>
      <Txt x={24} y={30} k="k" anchor="start" tone={push ? "lit" : "sky"}>
        {push ? (narrow ? "push · on write" : "push · fan-out on write") : narrow ? "pull · on read" : "pull · fan-out on read"}
      </Txt>
      <Txt x={576} y={30} k="k" anchor="end" tone="mute">
        {T === Infinity ? (narrow ? "no threshold" : "no threshold: pure push") : `threshold ${short(T)}`}
      </Txt>
      <Box x={24} y={64} w={130} h={56} label="Poster" sub={narrow ? short(F) : `${short(F)} followers`} tone={push ? "lit" : "sky"} />
      {/* push: one write per follower feed */}
      {Array.from({ length: cells }, (_, i) => {
        const x = GRID.x + (i % GRID.cols) * (GRID.s + GRID.gap);
        const y = GRID.y + Math.floor(i / GRID.cols) * (GRID.s + GRID.gap);
        return <rect key={i} className={i < filled ? `ax-fill ${slow ? "bad" : "lit"}` : "ax-meter"} x={x} y={y} width={GRID.s} height={GRID.s} />;
      })}
      <Txt x={GRID.x + gw / 2} y={GRID.y - 8} k="s" tone={push ? "lit" : "mute"}>
        follower feeds
      </Txt>
      <Wire d={`M154 92H${GRID.x - 8}`} arrow tone={push ? "lit" : "mute"} dash={!push} />
      {/* pull: stored once in the post index */}
      <Box x={GRID.x} y={170} w={gw} h={46} label="post index" sub={narrow ? undefined : "stored once"} tone={push ? undefined : "sky"} dim={push} />
      <Wire d={`M89 120V193H${GRID.x - 6}`} arrow tone={push ? "mute" : "sky"} dash={push} />
      <Box x={446} y={64} w={130} h={56} label="Reader" sub="500 follows" />
      <Wire d={`M${GRID.x + gw + 6} 92H440`} arrow />
      <Wire d={`M${GRID.x + gw + 6} 193H511V126`} arrow tone={c ? "sky" : "mute"} dash />
      {c > 0 &&
        [0, 1, 2].map((k) => {
          const u = (clock * 0.4 + k / 3) % 1;
          const x0 = GRID.x + gw + 10;
          const p = u < 0.55 ? { x: x0 + (511 - x0) * (u / 0.55), y: 193 } : { x: 511, y: 193 - (193 - 130) * ((u - 0.55) / 0.45) };
          return <Token key={k} x={p.x} y={p.y} s={8} tone="sky" />;
        })}
      <Txt x={576} y={54} k="s" anchor="end" tone={rTone}>
        {`1 read + ${c} pull${c === 1 ? "" : "s"}`}
      </Txt>
      {stats.map(([k, v, tn], i) => (
        <g key={i}>
          <Txt x={24 + i * 192} y={254} k="k" anchor="start" tone={tn}>
            {k}
          </Txt>
          <Txt x={24 + i * 192} y={290} k="d" anchor="start" tone={tn}>
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
    { id: "fol", label: "Poster's followers", min: 0, max: FOL.length - 1, step: 1, value: 6, format: (v) => n(FOL[v] ?? 0) },
    { id: "thr", label: "Celebrity threshold", min: 0, max: THR.length - 1, step: 1, value: 2, format: (v) => ((THR[v] ?? 0) === Infinity ? "off (pure push)" : `${n(THR[v] ?? 0)} followers`) },
  ],
  variants: [
    {
      id: "lab",
      label: "Lab",
      steps: [
        { caption: "A 10M-follower account is above the 10,000 threshold: the post is stored once, 0 cache writes, and followers pull it when they load their feed. Drag the threshold to off to force fan-out on write.", loop: true, ms: 7500 },
        { caption: "Pushed, 10M followers means 10M cache writes; at 100,000 writes/s the last follower waits 100 s. Try 300M: about 50 minutes, the lesson's celebrity problem.", loop: true, ms: 7000 },
        { caption: "Now drag the threshold down: more accounts are pulled and writes vanish, but each feed load fans out into more pulls. This reader is illustrative: 10 of their 500 accounts are above 10,000.", loop: true, ms: 7500 },
      ],
    },
  ],
  Scene,
});
