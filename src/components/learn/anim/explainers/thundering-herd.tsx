/**
 * Thundering herd and request coalescing (week 4, day 3 · preface / 1.3 / 2.2): the Black Friday
 * homepage key expires under 50,000 users; the database takes 5,000 queries/s. Single flight turns
 * N misses for one key into one query.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const CACHE = { x: 196, y: 118, w: 124, h: 64 };
const DB = { x: 452, y: 104, w: 124, h: 92 };
const SF = 372; // where coalesced requests wait
const N = 12; // each square stands for ~4,000 users

const home = (i: number) => ({ x: 34 + (i % 4) * 26, y: 112 + Math.floor(i / 4) * 26 });

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  // ~4,000 users per square
  const sf = variant === "single";
  const cacheEmpty = sf ? step <= 1 || (step === 2 && t < 0.5) : step >= 1;
  let dbLoad = 0;
  let dbTone: Tone = undefined;
  const toks = Array.from({ length: N }, (_, i) => {
    const h = home(i);
    let x = h.x;
    let y = h.y;
    let tone: Tone = "mute";
    let o = 1;
    const atCache = { x: CACHE.x - 14 - (i % 4) * 4, y: CACHE.y + 10 + Math.floor(i / 4) * 20 + (i % 4) * 3 };
    if (!sf) {
      if (step === 0 || step > 3) {
        const p = (clock * 0.5 + i / N) % 1;
        const there = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
        x = lerp(h.x, CACHE.x - 6, there);
        y = lerp(h.y, CACHE.y + CACHE.h / 2, there);
        tone = "ok";
      } else if (step === 1) {
        const p = seg(t, 0.2 + (i % 4) * 0.03, 0.75);
        x = lerp(h.x, atCache.x, p);
        y = lerp(h.y, atCache.y, p);
        tone = p >= 1 ? "warn" : "mute";
      } else {
        const p = step === 2 ? seg(t, (i / N) * 0.35, 0.55 + (i / N) * 0.35) : 1;
        x = lerp(atCache.x, DB.x - 10, p);
        y = lerp(atCache.y, DB.y + 12 + (i % 6) * 13, p);
        tone = p >= 1 ? "bad" : "warn";
        o = p >= 1 ? 0.85 : 1;
      }
    } else {
      if (step === 0) {
        const p = seg(t, 0.2 + (i % 4) * 0.03, 0.75);
        x = lerp(h.x, atCache.x, p);
        y = lerp(h.y, atCache.y, p);
        tone = p >= 1 ? "warn" : "mute";
      } else if (step === 1) {
        if (i === 0) {
          const p = seg(t, 0, 0.6);
          x = lerp(atCache.x, DB.x - 10, p);
          y = lerp(atCache.y, DB.y + DB.h / 2, p);
          tone = "lit";
        } else {
          const p = seg(t, 0.15, 0.85);
          const wait = { x: SF - 14 + ((i - 1) % 2) * 14, y: CACHE.y - 2 + Math.floor((i - 1) / 2) * 13 };
          x = lerp(atCache.x, wait.x, p);
          y = lerp(atCache.y, wait.y, p);
          tone = "warn";
        }
      } else if (step === 2) {
        const p = seg(t, 0.35, 1);
        const wait = i === 0 ? { x: DB.x - 10, y: DB.y + DB.h / 2 } : { x: SF - 14 + ((i - 1) % 2) * 14, y: CACHE.y - 2 + Math.floor((i - 1) / 2) * 13 };
        x = lerp(wait.x, h.x, p);
        y = lerp(wait.y, h.y, p);
        tone = p > 0 ? "ok" : i === 0 ? "lit" : "warn";
      } else {
        const p = (clock * 0.5 + i / N) % 1;
        const there = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
        x = lerp(h.x, CACHE.x - 6, there);
        y = lerp(h.y, CACHE.y + CACHE.h / 2, there);
        tone = "ok";
      }
    }
    return { x, y, tone, o };
  });
  if (!sf && step >= 2) {
    dbLoad = step === 2 ? seg(t, 0.2, 0.9) * 10 : 10;
    dbTone = "bad";
  }
  if (sf && (step === 1 || step === 2)) {
    dbLoad = step === 1 ? seg(t, 0.4, 0.6) * 0.0002 * 10 : 0.0002;
    dbTone = "ok";
  }
  const queries = !sf ? (step >= 2 ? (step === 2 ? Math.round(seg(t, 0.2, 0.9) * 50000) : 50000) : 0) : step >= 1 ? 1 : 0;
  return (
    <g>
      <Txt x={24} y={36} k="k" anchor="start" tone={cacheEmpty ? "bad" : "ok"}>
        {cacheEmpty ? "12:00:00 · TTL expired" : sf ? "cache refilled" : "cache hit"}
      </Txt>
      <Txt x={24} y={94} k="s" anchor="start">
        50,000 users
      </Txt>
      <Box x={CACHE.x} y={CACHE.y} w={CACHE.w} h={CACHE.h} label="Cache" sub={cacheEmpty ? "homepage: EMPTY" : "homepage ✓"} tone={cacheEmpty ? "bad" : "ok"} />
      <Wire d={`M${CACHE.x + CACHE.w} ${CACHE.y + CACHE.h / 2}H${DB.x}`} arrow tone={queries ? (sf ? "ok" : "bad") : undefined} />
      {sf && step >= 1 && step <= 2 && (
        <g>
          <rect x={SF - 26} y={CACHE.y - 14} width={40} height={CACHE.y + 82 - (CACHE.y - 14)} className="th-sf" />
          <Txt x={SF - 6} y={CACHE.y - 22} k="k" tone="warn">
            {narrow ? "join" : "single flight"}
          </Txt>
        </g>
      )}
      <Box x={DB.x} y={DB.y} w={DB.w} h={DB.h} label="Database" sub={!sf && step === 3 ? "down" : "5,000 q/s max"} tone={dbTone} />
      <Meter x={DB.x} y={DB.y + DB.h + 14} w={DB.w} h={12} value={Math.min(dbLoad, 1)} max={1} tone={dbTone || "sky"} />
      <Txt x={DB.x + DB.w} y={DB.y + DB.h + 46} k="s" anchor="end" tone={dbTone}>
        {!sf && step >= 2 ? `${Math.max(1, Math.round(dbLoad))}× capacity` : sf && step >= 1 ? "1 query" : "idle"}
      </Txt>
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={12} tone={k.tone} opacity={k.o} />
      ))}
      <Txt x={DB.x + DB.w} y={58} k="k" anchor="end" tone={queries > 1 ? "bad" : queries ? "ok" : "mute"}>
        db queries
      </Txt>
      <Txt x={DB.x + DB.w} y={92} k="d" anchor="end" tone={queries > 1 ? "bad" : queries ? "ok" : undefined}>
        {queries.toLocaleString("en-US")}
      </Txt>
      {!sf && step === 3 && (
        <Txt x={W / 2} y={292} k="s" tone="bad">
          {narrow ? "50ms → 5,000ms · pool exhausted" : "latency 50 ms → 5,000 ms · pool exhausted · site down"}
        </Txt>
      )}
      {sf && step >= 2 && (
        <Txt x={W / 2} y={292} k="s" tone="ok">
          {narrow ? "1 miss = 1 query" : "1 cache miss = 1 database query, result shared"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.th-sf{fill:none;stroke:var(--ax-amber);stroke-width:1.5;stroke-dasharray:4 4}`,
  variants: [
    {
      id: "herd",
      label: "No protection",
      steps: [
        { caption: "Normal traffic: the homepage key is cached, every request is a cache hit and the database sits idle.", loop: true },
        { caption: "12:00:00, the sale starts: the key's TTL expires and 50,000 users refresh at once. Every request misses.", tween: 1600 },
        { caption: "Every miss queries the database: 50,000 identical queries against a capacity of 5,000 per second, ten times what it can take.", tween: 2400, ms: 3200 },
        { caption: "Query latency climbs from 50 ms to 5,000 ms, the connection pool runs dry and the site goes down. All because one cache key expired.", ms: 3800 },
      ],
    },
    {
      id: "single",
      label: "Single flight",
      steps: [
        { caption: "Same expiry: 50,000 requests miss the homepage key at the same moment.", tween: 1600 },
        { caption: "Request coalescing: the first miss starts the fetch, and every other request for that key joins the in-flight call instead of querying.", tween: 2000, ms: 3200 },
        { caption: "One database query. Its result refills the cache and is handed to every waiting request at the same time, with no polling.", tween: 2000, ms: 3200 },
        { caption: "One cache miss became one database query instead of N. The next requests hit the refilled cache.", loop: true, ms: 3400 },
      ],
    },
  ],
  Scene,
});
