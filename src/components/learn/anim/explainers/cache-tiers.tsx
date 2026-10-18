/**
 * Multi-tier caching (week 4, day 5 · preface / 1.1 / 6.1 / 6.2): a request for product #12345
 * falls through browser (0 ms), CDN edge (20 ms), API gateway (5 ms), Redis (2 ms), buffer pool
 * (10 ms) and disk (50 ms); a $99 → $79 price change is invalidated Redis first, then the gateway,
 * then a CDN purge, while browsers keep $99 until Cache-Control max-age runs out.
 */
import { defineExplainer, ease, lerp, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 304;
const BX = 150;
const BW = 320;
const RAIL = 120;
const RY = (i: number) => 34 + i * 44;
const RH = 34;
const LAYERS = [
  { wide: "Browser cache", short: "Browser", ms: "0 ms" },
  { wide: "CDN edge", short: "CDN edge", ms: "20 ms" },
  { wide: "API gateway", short: "Gateway", ms: "5 ms" },
  { wide: "Redis (app cache)", short: "Redis", ms: "2 ms" },
  { wide: "DB buffer pool", short: "Buffer pool", ms: "10 ms" },
  { wide: "Database disk", short: "Disk", ms: "50 ms" },
];

type Cell = { text: string; tone?: Tone };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const read = variant === "read";
  const left: (Cell | null)[] = LAYERS.map(() => null);
  const right: (Cell | null)[] = LAYERS.map(() => null);
  const box: Tone[] = LAYERS.map(() => undefined);
  let tok: { x: number; y: number; tone: Tone } | null = null;
  if (read) {
    const hit = [0, 1, 3, 5][step];
    const shown = [1, 2, 4, 6][step];
    const down = ease(seg(t, 0, 0.55));
    const back = ease(seg(t, 0.62, 1));
    const yHit = RY(hit) + RH / 2;
    const y = back > 0 ? lerp(yHit, 8, back) : lerp(8, yHit, down);
    if (t < 1) tok = { x: down >= 1 && back === 0 ? RAIL + 14 : RAIL, y, tone: back > 0 ? "ok" : "lit" };
    for (let i = 0; i < shown; i++) right[i] = { text: LAYERS[i].ms, tone: i === hit && down >= 1 ? "ok" : undefined };
    const yDown = lerp(8, yHit, down);
    for (let i = 0; i < hit; i++) if (yDown >= RY(i) + RH / 2 - 4) left[i] = { text: "miss", tone: "bad" };
    if (down >= 1) {
      left[hit] = { text: "hit", tone: "ok" };
      box[hit] = "ok";
    }
  } else {
    const price = (i: number): Cell => (i >= 4 ? { text: "$79", tone: "ok" } : { text: "$99", tone: "bad" });
    for (let i = 0; i < LAYERS.length; i++) right[i] = price(i);
    if (step === 0) {
      const p = seg(t, 0.2, 0.7);
      right[4] = right[5] = p >= 1 ? { text: "$79", tone: "ok" } : { text: "$99", tone: "bad" };
      if (p < 1 && t > 0.2) tok = { x: RAIL + 14, y: lerp(RY(5) + RH / 2, RY(4) + RH / 2, p), tone: "lit" };
      if (p >= 1) {
        box[4] = "ok";
        left[4] = { text: narrow ? "fresh" : "updated", tone: "ok" };
        for (let i = 0; i < 4; i++) left[i] = { text: "stale", tone: "bad" };
      }
    } else {
      for (let i = 0; i < 4; i++) left[i] = { text: "stale", tone: "bad" };
      left[4] = { text: narrow ? "fresh" : "updated", tone: "ok" };
      const redis = step > 1 || t >= 0.3;
      const gw = step > 1 || t >= 0.7;
      if (redis) {
        right[3] = { text: "deleted", tone: "ok" };
        left[3] = { text: "1st", tone: "lit" };
      }
      if (gw) {
        right[2] = { text: "deleted", tone: "ok" };
        left[2] = { text: "2nd", tone: "lit" };
      }
      if (step === 1) box[t < 0.5 ? 3 : 2] = "lit";
      if (step >= 2) {
        const done = step > 2 || t >= 0.85;
        right[1] = done ? { text: "purged", tone: "ok" } : { text: "purging…", tone: "warn" };
        left[1] = { text: "3rd", tone: "lit" };
        if (step === 2) box[1] = done ? "ok" : "warn";
      }
      if (step === 3) {
        box[0] = "bad";
        right[0] = { text: narrow ? "$99" : "$99 (max-age)", tone: "bad" };
        left[0] = { text: narrow ? "wait" : "can't push", tone: "bad" };
      }
    }
  }
  return (
    <g>
      <Txt x={24} y={20} k="k" anchor="start">
        {read ? (narrow ? "GET #12345" : "GET product #12345") : narrow ? "$99 → $79" : "price change $99 → $79"}
      </Txt>
      {read && <line className="mt-rail" x1={RAIL} x2={RAIL} y1={8} y2={RY(5) + RH / 2} />}
      {LAYERS.map((l, i) => {
        const y = RY(i);
        return (
          <g key={l.wide}>
            {read && <line className="mt-rail" x1={RAIL} x2={BX} y1={y + RH / 2} y2={y + RH / 2} />}
            <rect className={`ax-box ${box[i] || ""}`} x={BX} y={y} width={BW} height={RH} />
            <Txt x={BX + 14} y={y + RH / 2 + 5} anchor="start">
              {narrow ? l.short : l.wide}
            </Txt>
            {!narrow && (
              <Txt x={BX + BW - 12} y={y + RH / 2 + 4} k="s" anchor="end">
                {`layer ${i + 1}`}
              </Txt>
            )}
            {left[i] && (
              <Txt x={RAIL - 10} y={y + RH / 2 + 5} k="s" anchor="end" tone={left[i]!.tone}>
                {left[i]!.text}
              </Txt>
            )}
            {right[i] && (
              <Txt x={BX + BW + 14} y={y + RH / 2 + 5} anchor="start" tone={right[i]!.tone}>
                {right[i]!.text}
              </Txt>
            )}
          </g>
        );
      })}
      {tok && <Token x={tok.x} y={tok.y} s={12} tone={tok.tone} />}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.mt-rail{stroke:var(--ax-line);stroke-width:1.5}`,
  variants: [
    {
      id: "read",
      label: "Request path",
      steps: [
        { caption: "Product #12345: the browser cache has it, so the page returns in 0 ms with no network at all.", tween: 1400 },
        { caption: "A browser miss continues to the CDN edge, which returns it in 20 ms. Your origin never sees it.", tween: 1600 },
        { caption: "CDN miss: the API gateway may answer in 5 ms; on a gateway miss, Redis answers in 2 ms.", tween: 2000 },
        { caption: "Only a miss at every layer reaches the database: buffer pool in 10 ms, or disk in 50 ms.", tween: 2400, ms: 3400 },
      ],
    },
    {
      id: "inval",
      label: "Price change",
      steps: [
        { caption: "The price drops from $99 to $79. The database write updates the buffer pool itself: nothing stale there.", tween: 1800 },
        { caption: "Invalidate fastest first: delete the Redis key, then the API gateway's cached response.", tween: 2000 },
        { caption: "Then purge the CDN: every edge server must drop it, and the purge takes time to propagate.", tween: 2400 },
        { caption: "Browsers can't be pushed: they show $99 until Cache-Control max-age expires. Propagation order matters.", ms: 3600 },
      ],
    },
  ],
  Scene,
});
