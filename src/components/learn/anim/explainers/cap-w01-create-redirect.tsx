/**
 * Week 1 capstone (TinyLink, Phase 3 · data flows): a redirect for /abc1234 that stops at the CDN,
 * at Redis, or reads a PostgreSQL replica, with the click event sent to Kafka fire-and-forget; and
 * creating a short URL (rate limit, a code from the server's pre-allocated range 0–9,999,
 * PostgreSQL insert, Redis SETEX 86400).
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 290;
const BW = 120;
const BH = 56;
const COL = [20, 167, 313, 460];
const TOP = 52;
const LOW = 150;
const mid = (i: number) => COL[i] + BW / 2;

type P = { x: number; y: number };
const R = (i: number): P => ({ x: COL[i] + BW, y: TOP + BH / 2 });
const L = (i: number): P => ({ x: COL[i], y: TOP + BH / 2 });
const Bt = (i: number): P => ({ x: mid(i), y: TOP + BH });
const Tp = (i: number): P => ({ x: mid(i), y: LOW });

type Leg = { a: number; b: number; from: P; to: P; tone: Tone };
const leg = (a: number, b: number, from: P, to: P, tone: Tone = "lit"): Leg => ({ a, b, from, to, tone });

type Frame = { legs: Leg[]; tone: Tone[]; sub: string[]; path: string; result: string; resTone?: Tone };

const CODE = "bkBdhgA";

function create(step: number, t: number, narrow: boolean): Frame {
  const done = (x: number) => t >= x;
  // 0 client · 1 API · 2 PostgreSQL · 3 Redis · 4 key range (under API)
  const tone: Tone[] = [];
  const sub = ["POST", "server 1", "primary", "cache", "next 42"];
  if (step === 0) {
    tone[1] = done(0.5) ? "ok" : "lit";
    sub[1] = done(0.5) ? "quota ok" : "checking";
    return {
      legs: [leg(0, 0.45, R(0), L(1))],
      tone,
      sub,
      path: narrow ? "rate limit" : "rate limiter · free tier",
      result: done(0.5) ? (narrow ? "allowed" : "allowed (< 100/min)") : "…",
      resTone: done(0.5) ? "ok" : undefined,
    };
  }
  if (step === 1) {
    tone[1] = "lit";
    tone[4] = done(0.5) ? "ok" : "lit";
    if (done(0.5)) sub[4] = "next 43";
    return {
      legs: [leg(0.05, 0.4, Bt(1), Tp(1)), leg(0.55, 0.9, Tp(1), Bt(1), "ok")],
      tone,
      sub,
      path: narrow ? "0–9,999, no DB" : "range 0–9,999 · no DB lookup",
      result: done(0.9) ? `42 → ${CODE}` : "…",
      resTone: done(0.9) ? "lit" : undefined,
    };
  }
  sub[4] = "next 43";
  if (step === 2) {
    tone[2] = done(0.45) ? "ok" : "lit";
    tone[3] = done(0.9) ? "ok" : undefined;
    sub[2] = done(0.45) ? "INSERT ok" : "INSERT";
    sub[3] = done(0.9) ? "TTL 86400" : "cache";
    return {
      legs: [leg(0, 0.4, R(1), L(2)), leg(0.5, 0.85, R(2), L(3), "ok")],
      tone,
      sub,
      path: narrow ? "unique insert" : "unique short_code",
      result: done(0.9) ? `url:${CODE}` : "…",
      resTone: done(0.9) ? "ok" : undefined,
    };
  }
  tone[0] = done(0.6) ? "ok" : undefined;
  tone[2] = tone[3] = "ok";
  sub[2] = "INSERT ok";
  sub[3] = "TTL 86400";
  if (done(0.6)) sub[0] = "short URL";
  return { legs: [leg(0, 0.55, L(1), R(0), "ok")], tone, sub, path: narrow ? "returned" : "returned to client", result: narrow ? `/${CODE}` : `tiny.link/${CODE}`, resTone: "ok" };
}

function redirect(step: number, t: number, narrow: boolean): Frame {
  const done = (x: number) => t >= x;
  // 0 client · 1 CDN · 2 Redirect svc · 3 Redis · 4 Kafka (under 2) · 5 PostgreSQL (under 3)
  const tone: Tone[] = [];
  const sub = ["GET", "edge", "lookup", narrow ? "abc1234" : "url:abc1234", "events", "replica"];
  if (step === 0) {
    tone[1] = done(0.4) ? "ok" : "lit";
    if (done(0.4)) sub[1] = "HIT";
    tone[0] = done(0.85) ? "ok" : undefined;
    return { legs: [leg(0, 0.38, R(0), L(1)), leg(0.45, 0.85, L(1), R(0), "ok")], tone, sub, path: "CDN hit", result: narrow ? "302 at edge" : "302 from the edge", resTone: "ok" };
  }
  if (step === 1) {
    tone[1] = "bad";
    sub[1] = "MISS";
    tone[3] = done(0.55) ? "ok" : undefined;
    if (done(0.55)) sub[3] = "HIT";
    tone[0] = done(0.95) ? "ok" : undefined;
    return {
      legs: [leg(0, 0.18, R(0), L(1)), leg(0.18, 0.36, R(1), L(2)), leg(0.36, 0.52, R(2), L(3)), leg(0.58, 0.74, L(3), R(2), "ok"), leg(0.74, 0.95, L(2), R(0), "ok")],
      tone,
      sub,
      path: narrow ? "Redis hit" : "CDN miss → Redis hit",
      result: "302",
      resTone: "ok",
    };
  }
  if (step === 2) {
    tone[1] = "bad";
    sub[1] = "MISS";
    tone[3] = done(0.8) ? "ok" : "bad";
    sub[3] = done(0.8) ? "refilled" : "MISS";
    tone[5] = done(0.5) ? "ok" : undefined;
    if (done(0.5)) sub[5] = "found";
    tone[0] = done(0.97) ? "ok" : undefined;
    return {
      legs: [
        leg(0, 0.14, R(0), L(1)),
        leg(0.14, 0.28, R(1), L(2)),
        leg(0.28, 0.4, R(2), L(3)),
        leg(0.4, 0.5, Bt(3), Tp(3)),
        leg(0.55, 0.66, Tp(3), Bt(3), "ok"),
        leg(0.66, 0.8, L(3), R(2), "ok"),
        leg(0.8, 0.97, L(2), R(0), "ok"),
      ],
      tone,
      sub,
      path: narrow ? "read replica" : "Redis miss → replica",
      result: narrow ? "302 · or 404" : "302 · 404 if absent",
      resTone: "ok",
    };
  }
  tone[0] = done(0.3) ? "ok" : undefined;
  tone[4] = done(0.85) ? "ok" : "sky";
  sub[4] = done(0.85) ? "click event" : "events";
  return { legs: [leg(0, 0.3, L(2), R(0), "ok"), leg(0.35, 0.85, Bt(2), Tp(2), "sky")], tone, sub, path: narrow ? "async event" : "fire-and-forget", result: narrow ? "302 first" : "302 doesn't wait", resTone: "ok" };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const cr = variant === "create";
  const f = cr ? create(step, t, narrow) : redirect(step, t, narrow);
  const pg = narrow ? "Postgres" : "PostgreSQL";
  const boxes: { i: number; y: number; label: string }[] = cr
    ? [
        { i: 0, y: TOP, label: "Client" },
        { i: 1, y: TOP, label: "API" },
        { i: 2, y: TOP, label: pg },
        { i: 3, y: TOP, label: "Redis" },
        { i: 1, y: LOW, label: narrow ? "Range" : "Key range" },
      ]
    : [
        { i: 0, y: TOP, label: "Client" },
        { i: 1, y: TOP, label: "CDN" },
        { i: 2, y: TOP, label: "Redirect" },
        { i: 3, y: TOP, label: "Redis" },
        { i: 2, y: LOW, label: "Kafka" },
        { i: 3, y: LOW, label: pg },
      ];
  const h = (i: number) => `M${R(i).x} ${R(i).y}H${L(i + 1).x}`;
  const v = (i: number) => `M${Bt(i).x} ${Bt(i).y}V${LOW}`;
  const wires = cr ? [h(0), h(1), h(2), v(1)] : [h(0), h(1), h(2), v(2), v(3)];
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  const RY = LOW + BH + 34;
  return (
    <g>
      <Txt x={20} y={30} k="k" anchor="start">
        {cr ? (narrow ? "POST /api/urls" : "POST /api/urls · long URL") : narrow ? "GET /abc1234" : "GET tiny.link/abc1234"}
      </Txt>
      <Txt x={W - 20} y={30} k="s" anchor="end">
        {cr ? "< 500 ms p99" : "< 100 ms p99"}
      </Txt>
      {wires.map((d) => (
        <Wire key={d} d={d} />
      ))}
      {boxes.map((b, k) => (
        <Box key={k} x={COL[b.i]} y={b.y} w={BW} h={BH} label={b.label} sub={f.sub[k]} tone={f.tone[k]} />
      ))}
      {live.map((l, i) => {
        const p = seg(t, l.a, l.b);
        return <Token key={i} x={lerp(l.from.x, l.to.x, p)} y={lerp(l.from.y, l.to.y, p)} s={11} tone={l.tone} />;
      })}
      <line className="cw-rule" x1={20} x2={W - 20} y1={RY - 22} y2={RY - 22} />
      <Txt x={20} y={RY} k="k" anchor="start" tone="mute">
        path
      </Txt>
      <Txt x={20} y={RY + 26} anchor="start">
        {f.path}
      </Txt>
      <Txt x={W - 20} y={RY} k="k" anchor="end" tone="mute">
        result
      </Txt>
      <Txt x={W - 20} y={RY + 26} anchor="end" tone={f.resTone}>
        {f.result}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.cw-rule{stroke:var(--ax-line-soft);stroke-width:1.5}`,
  variants: [
    {
      id: "redirect",
      label: "Redirect",
      steps: [
        { caption: "GET /abc1234: a CDN edge holds the cached redirect and answers it. Our servers never see the request.", tween: 1600 },
        { caption: "CDN miss: the Redirect Service finds url:abc1234 in Redis, a sub-millisecond lookup, and returns a 302.", tween: 2400 },
        { caption: "Redis miss: it reads a PostgreSQL replica, refills Redis, then redirects. An unknown code gets a 404.", tween: 3000, ms: 3400 },
        { caption: "Each redirect publishes a click event to Kafka, fire-and-forget. The 302 never waits; click counts lag seconds.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "create",
      label: "Create",
      steps: [
        { caption: "POST /api/urls reaches the API service. The rate limiter checks the user's quota: free tier, 100 requests/minute.", tween: 1400 },
        { caption: "No database lookup: Server 1 takes counter value 42 from its range 0–9,999 and encodes it as bkBdhgA.", tween: 1800 },
        { caption: "INSERT into PostgreSQL under a uniqueness constraint, then cache url:bkBdhgA in Redis for 86,400 seconds.", tween: 2000 },
        { caption: "The client gets tiny.link/bkBdhgA. Coordination happens only when a range runs out: one Redis INCR.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
