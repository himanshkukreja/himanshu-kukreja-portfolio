/**
 * Caching patterns (week 4, day 1 · 2.1 / 2.3 / 2.4 / 3.1 / 4.2): cache-aside's miss then hit for
 * GET /products/123 (~55 ms, then ~2 ms, TTL 300 s), write-through's synchronous cache + DB write,
 * and write-behind's immediate return, batched flush and data-loss risk.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 290;
const Y = 104;
const APP = { x: 24, y: 72, w: 120, h: 64 };
const CA = { x: 240, y: 72, w: 120, h: 64 };
const DB = { x: 456, y: 72, w: 120, h: 64 };
const WR = { x: 232, y: 204, w: 136, h: 56 };
const TOPY = 38;

type Pt = { x: number; y: number };
const P = {
  appR: { x: APP.x + APP.w, y: Y },
  caL: { x: CA.x, y: Y },
  caR: { x: CA.x + CA.w, y: Y },
  dbL: { x: DB.x, y: Y },
  caB: { x: CA.x + CA.w / 2, y: CA.y + CA.h },
  wrT: { x: CA.x + CA.w / 2, y: WR.y },
  wrR: { x: WR.x + WR.w, y: WR.y + WR.h / 2 },
  dbB: { x: DB.x + DB.w / 2, y: DB.y + DB.h },
};
const OVER: Pt[] = [{ x: APP.x + APP.w / 2, y: APP.y }, { x: APP.x + APP.w / 2, y: TOPY }, { x: DB.x + DB.w / 2, y: TOPY }, { x: DB.x + DB.w / 2, y: DB.y }];
const FLUSH: Pt[] = [P.wrR, { x: P.dbB.x, y: P.wrR.y }, P.dbB];

type Leg = { a: number; b: number; pts: Pt[]; tone: Tone; label?: string };
const L = (a: number, b: number, pts: Pt[], tone: Tone, label?: string): Leg => ({ a, b, pts, tone, label });

function along(pts: Pt[], p: number): Pt {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, p * n));
  const i = Math.floor(f);
  return { x: lerp(pts[i].x, pts[i + 1].x, f - i), y: lerp(pts[i].y, pts[i + 1].y, f - i) };
}

type Frame = { legs: Leg[]; cache: string; cacheTone?: Tone; db: string; dbTone?: Tone; lat: string; latTone?: Tone; latBig?: boolean; wr?: string; wrTone?: Tone; kicker: string };

function frame(v: string, step: number, t: number, narrow: boolean): Frame {
  const on = (x: number) => t >= x;
  if (v === "aside") {
    if (step === 0)
      return { kicker: "GET /products/123", legs: [L(0, 0.4, [P.appR, P.caL], "lit", "GET"), L(0.5, 0.9, [P.caL, P.appR], "bad", "miss")], cache: on(0.5) ? "miss" : "empty", cacheTone: on(0.5) ? "bad" : undefined, db: "products", lat: "—" };
    if (step === 1)
      return {
        kicker: "GET /products/123",
        legs: [L(0, 0.35, OVER, "lit"), L(0.38, 0.6, [...OVER].reverse(), "ok"), L(0.66, 0.92, [P.appR, P.caL], "ok", narrow ? "SET" : "SETEX 300")],
        cache: on(0.92) ? "product:123" : "empty",
        cacheTone: on(0.92) ? "ok" : undefined,
        db: on(0.35) ? "~50 ms" : "SELECT",
        dbTone: on(0.2) && !on(0.6) ? "lit" : undefined,
        lat: on(0.92) ? "~55 ms" : "…",
        latTone: on(0.92) ? "warn" : undefined,
        latBig: true,
      };
    return { kicker: "next request", legs: [L(0, 0.4, [P.appR, P.caL], "lit", "GET"), L(0.45, 0.85, [P.caL, P.appR], "ok", "hit")], cache: "product:123", cacheTone: "ok", db: "untouched", lat: on(0.85) ? "~2 ms" : "…", latTone: on(0.85) ? "ok" : undefined, latBig: true };
  }
  if (v === "through") {
    if (step === 0) return { kicker: "write", legs: [L(0, 0.4, [P.appR, P.caL], "lit", "write"), L(0.45, 0.85, [P.caR, P.dbL], "lit", narrow ? "sync" : "sync write")], cache: "writing…", db: on(0.85) ? "writing…" : "products", dbTone: on(0.85) ? "lit" : undefined, lat: "waiting…" };
    if (step === 1)
      return {
        kicker: "write",
        legs: [L(0, 0.35, [P.dbL, P.caR], "ok", "ok"), L(0.5, 0.88, [P.caL, P.appR], "ok", "success")],
        cache: on(0.4) ? "stored ✓" : "writing…",
        cacheTone: on(0.4) ? "ok" : undefined,
        db: "written ✓",
        dbTone: "ok",
        lat: "cache + DB",
        latTone: on(0.88) ? "warn" : undefined,
      };
    return { kicker: "read", legs: [L(0, 0.4, [P.appR, P.caL], "sky", "read"), L(0.45, 0.85, [P.caL, P.appR], "ok", "fresh")], cache: "stored ✓", cacheTone: "ok", db: "written ✓", dbTone: "ok", lat: "cache hit", latTone: on(0.85) ? "ok" : undefined };
  }
  // write-behind: view counts
  if (step === 0)
    return {
      kicker: "views:{id}",
      legs: [L(0, 0.35, [P.appR, P.caL], "lit", "write"), L(0.4, 0.68, [P.caL, P.appR], "ok", "ok"), L(0.5, 0.85, [P.caB, P.wrT], "warn")],
      cache: "views ✓",
      cacheTone: "ok",
      db: "behind",
      lat: "cache only",
      latTone: on(0.68) ? "ok" : undefined,
      wr: on(0.85) ? "1 queued" : "0 queued",
      wrTone: on(0.85) ? "warn" : undefined,
    };
  if (step === 1)
    return { kicker: "views:{id}", legs: [L(0.1, 0.75, FLUSH, "warn", undefined)], cache: "views ✓", cacheTone: "ok", db: on(0.75) ? "batched ✓" : "behind", dbTone: on(0.75) ? "ok" : undefined, lat: "cache only", wr: on(0.75) ? "0 queued" : "flushing", wrTone: on(0.75) ? undefined : "warn" };
  const down = on(0.62);
  return {
    kicker: "views:{id}",
    legs: [L(0, 0.22, [P.appR, P.caL], "lit"), L(0.22, 0.4, [P.caB, P.wrT], "warn"), L(0.12, 0.34, [P.appR, P.caL], "lit"), L(0.34, 0.52, [P.caB, P.wrT], "warn")],
    cache: down ? "down ✗" : "views ✓",
    cacheTone: down ? "bad" : "ok",
    db: "behind",
    dbTone: down ? "warn" : undefined,
    lat: "cache only",
    wr: down ? (narrow ? "lost" : "2 writes lost") : on(0.52) ? "2 queued" : on(0.4) ? "1 queued" : "0 queued",
    wrTone: down ? "bad" : on(0.4) ? "warn" : undefined,
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t, narrow);
  const behind = variant === "behind";
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start">
        {f.kicker}
      </Txt>
      {variant === "aside" && (
        <g>
          <Wire d={`M${OVER.map((p) => `${p.x} ${p.y}`).join("L")}`} arrow tone={step === 1 && t < 0.6 ? "lit" : undefined} dash={step !== 1} />
          <Txt x={(APP.x + DB.x + DB.w) / 2} y={TOPY - 8} k="s" tone={step === 1 ? "lit" : undefined}>
            {narrow ? "on a miss" : "on a miss: query the database"}
          </Txt>
        </g>
      )}
      <Wire d={`M${P.appR.x} ${Y}H${P.caL.x}`} />
      <Wire d={`M${P.caR.x} ${Y}H${P.dbL.x}`} opacity={variant === "aside" ? 0.3 : 1} dash={variant !== "through"} />
      {behind && (
        <g>
          <Wire d={`M${P.caB.x} ${P.caB.y}V${P.wrT.y}`} arrow />
          <Wire d={`M${FLUSH.map((p) => `${p.x} ${p.y}`).join("L")}`} arrow tone={step === 1 && t < 0.75 ? "lit" : undefined} />
          <Box x={WR.x} y={WR.y} w={WR.w} h={WR.h} label={narrow ? "writer" : "bg writer"} sub={f.wr} tone={f.wrTone} />
        </g>
      )}
      <Box x={APP.x} y={APP.y} w={APP.w} h={APP.h} label="App" sub={narrow ? undefined : variant === "aside" ? "cache-aside" : variant === "through" ? "writes cache" : "view counts"} />
      <Box x={CA.x} y={CA.y} w={CA.w} h={CA.h} label="Redis" sub={f.cache} tone={f.cacheTone} />
      <Box x={DB.x} y={DB.y} w={DB.w} h={DB.h} label="Database" sub={f.db} tone={f.dbTone} />
      {live.map((l, i) => {
        const p = along(l.pts, seg(t, l.a, l.b));
        return <Token key={i} x={p.x} y={p.y} s={11} tone={l.tone} />;
      })}
      {live
        .filter((l) => l.label && l.pts.length === 2 && l.pts[0].y === l.pts[1].y)
        .map((l, i) => (
          <Txt key={`l${i}`} x={(l.pts[0].x + l.pts[1].x) / 2} y={Y - 12} k="s" tone={l.tone}>
            {l.label}
          </Txt>
        ))}
      <Txt x={24} y={behind ? 196 : 206} k="k" anchor="start" tone="mute">
        {variant === "aside" || (variant === "through" && step === 2) ? "latency" : "write latency"}
      </Txt>
      <Txt x={24} y={behind ? 226 : 244} k={f.latBig ? "d" : "t"} anchor="start" tone={f.latTone}>
        {f.lat}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "aside",
      label: "Cache-aside",
      steps: [
        { caption: "GET /products/123: the app checks Redis for product:123. It's a miss.", tween: 1600 },
        { caption: "The app queries the database (~50 ms), then writes product:123 to Redis with a 300 s TTL.", tween: 2800 },
        { caption: "The next request is a hit: Redis answers in ~2 ms and the database isn't touched.", tween: 1600, ms: 3200 },
      ],
    },
    {
      id: "through",
      label: "Write-through",
      steps: [
        { caption: "The app writes to the cache, and the cache synchronously writes the same value to the database.", tween: 2000 },
        { caption: "Only after the database confirms does the cache store the value and return success: cache + DB latency.", tween: 2000 },
        { caption: "Reads of that key are fresh right after the write: it fits critical data like inventory counts.", tween: 1600, ms: 3200 },
      ],
    },
    {
      id: "behind",
      label: "Write-behind",
      steps: [
        { caption: "A view-count write updates the cache and returns immediately: the app waits for the cache only.", tween: 2000 },
        { caption: "A background writer batches queued writes to the database; repeated writes to one video coalesce.", tween: 2000 },
        { caption: "If the cache dies before a flush, the queued writes are lost: write-behind's data-loss risk.", tween: 2600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
