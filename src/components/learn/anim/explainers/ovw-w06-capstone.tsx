/**
 * Whole-capstone overview (weeks 1-6 capstone: a food delivery order system, as a 45-minute
 * interview). The ask (5M orders a day, restaurant < 2 s, driver < 30 s, location every 3-5 s,
 * tracking pushed while the app is open, push notifications when it's closed, Stripe auth and
 * capture), the estimate (~230 orders/s at peak, ~400K active orders, ~600K live connections on ~5
 * gateway nodes; ~20,000 heartbeats, ~100K location frames, ~1,000 status changes a second), the
 * architecture (APIs, Kafka, workers, the real-time tier, three lanes and an inbox), the deep dives
 * (outbox and idempotency, row-locked assignment and the saga, live tracking with coalesced location
 * and sequenced status, Wi-Fi to 4G, the bell, the tablet and driver presence), then 10x, edge cases
 * and the build order.
 */
import { Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an edge: from, to, and optional port offsets (y for side-by-side boxes, x for stacked ones) */
type Ed = [string, string, number?, number?];
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/* the stage grid: four columns, three rows of boxes above the figures */
const CX = [16, 124, 260, 404];
const CW = [88, 116, 124, 180];
const RY = [40, 96, 156];
const RH = [44, 48, 40];
const nd = (c: number, r: number, l: string, n?: string, rows = 1): Nd => ({ x: CX[c], y: RY[r], w: CW[c], h: RY[r + rows - 1] + RH[r + rows - 1] - RY[r], l, n });

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd, oa = 0, ob = 0): P[] {
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: a.y + a.h / 2 + oa };
    const p3 = { x: r ? b.x : b.x + b.w, y: b.y + b.h / 2 + ob };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2 + oa, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2 + ob, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;
const ends = (e: Ed) => geo(N[e[0]], N[e[1]], e[2], e[3]);

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = (F[variant] || F[Object.keys(F)[0]])[Math.min(step, (F[variant] || F[Object.keys(F)[0]]).length - 1)];
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map((e) => {
        const [a, b] = e;
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(ends(e))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const e = E.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        if (!e) return null;
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const p = bz(ends(e), e[0] === a ? u : 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  cust: nd(0, 0, "Customer", "Cust"),
  oapi: nd(1, 0, "Order API"),
  kafka: nd(2, 0, "Kafka"),
  wk: nd(3, 0, "Workers"),
  rest: nd(0, 1, "Kitchen", "Rest"),
  gw: nd(1, 1, "Gateways"),
  notif: nd(2, 1, "Notifications", "Notify"),
  pg: nd(3, 1, "PostgreSQL"),
  drv: nd(0, 2, "Driver"),
  dapi: nd(1, 2, "Driver API", "Drv API"),
  track: nd(2, 2, "Tracking"),
  geo: nd(3, 2, "Redis GEO"),
};
const E: Ed[] = [
  ["cust", "oapi", -8, -8],
  ["oapi", "kafka"],
  ["kafka", "wk"],
  ["wk", "pg"],
  ["kafka", "notif"],
  ["notif", "gw", 0, -8],
  ["gw", "cust", 0, 8],
  ["gw", "rest"],
  ["gw", "drv", 0, -8],
  ["drv", "dapi", 8, 8],
  ["dapi", "track", 8, 8],
  ["track", "gw", -8, 8],
  ["track", "geo"],
];
const ALL = { cust: 1, oapi: 1, kafka: 1, wk: 1, rest: 1, gw: 1, notif: 1, pg: 1, drv: 1, dapi: 1, track: 1, geo: 1 } as const;

const F: Record<string, Fr[]> = {
  ask: [
    {
      k: ["phase 1 · the ask", "requirements"],
      on: { cust: "lit", rest: "lit", drv: "lit", oapi: 1 },
      fl: [["cust", "oapi"]],
      cols: 3,
      chips: [
        ["5M orders a day", "5M a day"],
        ["kitchen sees it < 2 s", "kitchen < 2 s"],
        ["a driver < 30 s", "driver < 30 s"],
        ["location every 3–5 s", "location 3–5 s"],
        ["status in ~1 s", "status ~1 s"],
        ["99.9% uptime", "99.9% up"],
      ],
      ctn: ["lit", "sky", "sky", "sky", "sky", "ok"],
      note: ["the driver within 30 s of the restaurant confirming", "driver: 30 s after confirm"],
    },
    {
      k: ["push it, don't poll", "push, don't poll"],
      on: { cust: "lit", gw: "lit", notif: 1 },
      sub: { gw: ["live socket", "live"] },
      fl: [
        ["notif", "gw"],
        ["gw", "cust"],
      ],
      cols: 1,
      chips: [
        ["app open: tracking pushed down a live connection", "app open: live push"],
        ["app closed: a push notification", "app closed: push"],
        ["both through the Week 6 notification platform", "via Week 6's platform"],
      ],
      ctn: ["lit", "sky", "ok"],
    },
    {
      k: ["never lost, never twice", "correctness"],
      on: { oapi: 1, wk: "ok", pg: "ok" },
      sub: { wk: ["Stripe", "Stripe"] },
      fl: [
        ["kafka", "wk"],
        ["wk", "pg"],
      ],
      chips: [
        ["authorize, capture at pickup", "capture at pickup"],
        ["orders never lost", "never lost"],
        ["payments exactly once", "charged once"],
        ["no driver on two orders", "1 driver, 1 order"],
      ],
      ctn: ["sky", "ok", "ok", "ok"],
    },
    {
      k: ["phase 2 · the estimate", "the estimate"],
      on: { cust: 1, gw: "lit", track: 1 },
      sub: { gw: ["~5 nodes", "~5 nodes"] },
      figs: [
        ["~230/s", ["orders at a 4× peak", "peak orders"]],
        ["~400K", ["active orders at peak", "active orders"]],
        ["~600K", ["live connections", "connections"], "lit"],
      ],
      note: ["polling every 10 s would be ~40,000 reads a second, mostly empty", "polling: ~40K empty reads/s"],
    },
    {
      k: ["what the real-time tier carries", "the real-time tier"],
      on: { drv: 1, dapi: 1, track: "lit", gw: "lit", cust: "lit" },
      fl: [
        ["drv", "dapi"],
        ["dapi", "track"],
        ["track", "gw"],
        ["gw", "cust"],
      ],
      figs: [
        ["~20K/s", ["heartbeats", "heartbeats"]],
        ["~100K/s", ["location, coalesced", "location"], "sky"],
        ["~1,000/s", ["status changes, seq'd", "status"], "lit"],
      ],
      note: ["a zone lost: ~200K sockets back in about a minute, with jitter", "a lost zone: ~1 minute back"],
    },
  ],
  arch: [
    {
      k: ["phase 3 · APIs, Kafka, workers", "the core"],
      on: { cust: 1, oapi: "lit", kafka: "lit", wk: "lit", pg: 1 },
      sub: { oapi: ["+ outbox", "+ outbox"], wk: ["saga, match, payments", "saga, match"] },
      fl: [
        ["cust", "oapi"],
        ["oapi", "kafka"],
        ["kafka", "wk"],
        ["wk", "pg"],
      ],
      note: ["the Order API writes the order and its outbox row, then returns the ID", "order + outbox, then the ID"],
    },
    {
      k: ["the real-time tier", "the gateways"],
      on: { kafka: 1, notif: 1, gw: "lit", cust: "lit", rest: "lit", drv: "lit", track: 1 },
      sub: { gw: ["~600K sockets", "~600K"] },
      fl: [
        ["notif", "gw"],
        ["gw", "cust"],
        ["gw", "rest"],
        ["gw", "drv"],
        ["track", "gw"],
      ],
      chips: [
        ["SSE on the web, WebSocket in apps", "SSE, WebSocket"],
        ["a registry: who holds which app", "a registry"],
        ["drivers' online dots: presence", "driver presence"],
        ["a slow, randomised drain", "slow drains"],
      ],
      ctn: ["lit", "sky", "ok", "sky"],
    },
    {
      k: ["three lanes and an inbox", "three lanes"],
      on: { kafka: 1, notif: "lit", gw: 1 },
      sub: { notif: ["3 lanes, inbox", "3 lanes"] },
      fl: [
        ["kafka", "notif"],
        ["notif", "gw"],
      ],
      cols: 1,
      chips: [
        ["critical · OTPs; driver offers that expire in seconds", "critical · OTPs, offers"],
        ["transactional · order updates, new orders, refunds", "transactional · orders"],
        ["bulk · promotions, paced, never ahead of an update", "bulk · promotions"],
      ],
      ctn: ["bad", "lit", "warn"],
    },
  ],
  dives: [
    {
      k: ["outbox and idempotency", "never lost, once"],
      on: { oapi: "lit", kafka: 1, wk: "lit", pg: "ok" },
      fl: [
        ["oapi", "kafka"],
        ["kafka", "wk"],
        ["wk", "pg"],
      ],
      chips: [
        ["order + outbox: one transaction", "one transaction"],
        ["the relay may publish twice", "maybe twice"],
        ["Stripe key order:{id}:auth", "a key per call"],
        ["a retry: the first result", "retry: 1 charge"],
      ],
      ctn: ["ok", "warn", "lit", "ok"],
    },
    {
      k: ["one driver, and the saga", "assignment, saga"],
      on: { wk: "lit", pg: "lit", drv: 1 },
      chips: [
        ["A and B both see driver X free", "both see X free"],
        ["FOR UPDATE + version: one wins", "lock + version"],
        ["kitchen rejects after auth", "kitchen rejects"],
        ["void the hold, cancel, notify", "void, cancel"],
      ],
      ctn: ["warn", "ok", "warn", "ok"],
    },
    {
      k: ["live tracking over the real-time tier", "live tracking"],
      on: { drv: "lit", dapi: 1, track: "lit", geo: "lit", gw: "lit", cust: "ok" },
      sub: { geo: ["latest points", "latest"] },
      fl: [
        ["drv", "dapi"],
        ["dapi", "track"],
        ["track", "geo"],
        ["track", "gw"],
        ["gw", "cust", "ok"],
      ],
      chips: [
        ["location: coalesced, latest only", "location: coalesced"],
        ["no seq, no ack: next in ~4 s", "next in ~4 s"],
        ["status: written first, a seq", "status: a seq"],
        ["the app acks; resume after it", "resume after seq"],
      ],
      ctn: ["sky", "sky", "lit", "ok"],
    },
    {
      k: ["Wi-Fi to 4G, halfway", "a network change"],
      kt: "warn",
      on: { cust: "warn", gw: "lit", track: 1 },
      fl: [
        ["track", "gw"],
        ["gw", "cust", "warn"],
      ],
      cols: 1,
      chips: [
        ["the TCP connection dies, and nobody tells the server", "TCP dies silently"],
        ["the app reconnects on the network-change event", "reconnect, jittered"],
        ['"resume after seq 3", then the next point in ~4 s', "resume after seq 3"],
      ],
      ctn: ["warn", "lit", "ok"],
    },
    {
      k: ["the bell, the tablet, the dots", "bell, tablet, dots"],
      on: { notif: "lit", gw: "lit", rest: "lit", cust: 1, drv: "sky" },
      fl: [
        ["notif", "gw"],
        ["gw", "rest"],
        ["gw", "cust"],
      ],
      cols: 1,
      chips: [
        ["order update: inbox first, push only if no ack", "inbox, then push"],
        ["kitchen tablet: seq, ack, resume after N", "tablet resumes"],
        ["driver dot: a TTL, never for correctness", "dot: display only"],
      ],
      ctn: ["lit", "sky", "ok"],
    },
  ],
  scale: [
    {
      k: ["phase 5 · 10× the load", "10× the load"],
      on: { pg: "warn", gw: "lit", oapi: 1 },
      sub: { pg: ["shard by city", "by city"] },
      figs: [
        ["2,300/s", ["orders at peak", "peak"]],
        ["by city", ["the shard key", "shard key"], "lit"],
        ["~45", ["gateway nodes", "gateways"]],
      ],
      note: ["~6M connections: 30 nodes at 200K, ~45 across three zones", "~6M sockets, 3 zones"],
    },
    {
      k: "edge cases",
      kt: "warn",
      on: { drv: "warn", gw: "warn", wk: 1, notif: 1 },
      chips: [
        ["driver silent > 5 min: reassign", "silent: reassign"],
        ["capture fails after pickup: retry", "capture: retry"],
        ["a gateway dies at 19:30: resume", "gateway dies: resume"],
        ["APNs down: socket, hold, ramp", "APNs down: hold"],
      ],
      ctn: ["warn", "warn", "sky", "sky"],
      note: ["the driver's dot is display only; reassignment waits for location", "the dot is display only"],
    },
    {
      k: ["build first", "build order"],
      kt: "ok",
      on: ALL,
      chips: [
        ["1 · order flow + outbox", "1 · order flow"],
        ["2 · payments + idempotency", "2 · payments"],
        ["3 · restaurant notification", "3 · restaurant"],
        ["4 · nearest-driver matching", "4 · driver"],
        ["5 · customer notifications", "5 · customer"],
      ],
      ctn: ["ok", "ok", "lit", "lit", "sky"],
      note: ["phase 2: the saga, real-time tracking, smarter matching", "then saga, tracking, matching"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "ask",
    label: "Ask & estimate",
    steps: [
      {
        caption:
          "Design a food delivery order system: 5 million orders a day with lunch and dinner peaks. The restaurant sees an order within 2 seconds, a driver is assigned within 30 seconds of its confirmation, and locations update every 3–5 seconds.",
        tween: 1400,
      },
      {
        caption:
          "Live tracking is pushed while the app is open, since polling every few seconds at dinner is a lot of empty answers; when it's closed, a push notification. Both go through the notification platform you'd design for this company anyway.",
        tween: 1400,
        loop: true,
      },
      { caption: "Stripe authorizes at order time and captures at pickup. Orders must never be lost, payments must be exactly-once, driver assignment atomic, with 99.9% uptime.", tween: 1400 },
      {
        caption:
          "5M a day is ~58 orders a second, ~230 at a 4× dinner peak, ~400K active orders. Polling every 10 s would be ~40,000 mostly empty reads a second; instead ~600K live connections, ~5 gateway nodes at 200K each across three zones.",
        tween: 1400,
      },
      {
        caption:
          "At the dinner peak the tier carries ~20,000 heartbeats a second, ~100,000 location frames (the newest point per order every ~4 s, coalesced) and only ~1,000 status changes, each with a sequence number. It's sized by connections.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      {
        caption:
          "The Order API validates, writes the order and its outbox row, and returns the order ID at once. Events flow through Kafka to the workers: the order saga, driver matching, payments, notifications and tracking, each consuming on its own.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The real-time gateways hold the customer, driver and restaurant apps' ~600K connections: SSE for tracking on the web, a WebSocket in the apps. A connection registry finds the right gateway, and drivers' online status is presence with a TTL.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Nothing in the order flow calls APNs or an SMS provider: OTPs and driver offers ride the critical lane; order updates, restaurants' new orders and refunds the transactional lane; promotions the bulk lane, paced and never ahead of an order update.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "dives",
    label: "Deep dives",
    steps: [
      {
        caption:
          "The order and its outbox row commit in one transaction, so Kafka being down can't lose an order; consumers stay idempotent because the relay may publish twice. Every Stripe call carries an idempotency key, so a retried authorization gets the first result.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "Orders A and B both see driver X free: a row lock plus a version check lets one win. If the restaurant rejects after payment is authorized, the saga voids the authorization, cancels the order and notifies the customer.",
        tween: 1400,
      },
      {
        caption:
          "50K drivers report every 3 s into Redis GEO. The tracking worker pushes each order's latest point to the customer's gateway, coalesced so a slow phone never builds a backlog, while status changes are written first with a sequence number and acked.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          'When the customer\'s phone switches from Wi-Fi to 4G, TCP dies without the server knowing. The app reconnects with jittered backoff to any healthy gateway, sends "resume after seq 3", gets the status changes it missed, then the next location point.',
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Order updates are inbox first: written with a sequence number, hinted live, pushed only if no device acks. The restaurant tablet resumes after its last sequence number, and a driver's online dot expires by TTL but never decides a reassignment.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "scale",
    label: "Scale & decide",
    steps: [
      { caption: "At 10×, 50M orders a day and 2,300 a second at peak: shard orders, drivers and restaurants by city, and grow the real-time tier to ~6M connections, 30 nodes at 200K, ~45 across three zones.", tween: 1400 },
      {
        caption:
          "Edge cases: a driver silent over 5 minutes is reassigned (the dot is display only), a capture failing after pickup is retried without blocking delivery, a gateway dying at 19:30 means jittered reconnects and resume, and an APNs outage is held with an expiry.",
        tween: 1400,
      },
      {
        caption:
          "Build first: the order flow with its outbox, payments with idempotency, restaurant notification, simple nearest-driver matching, then customer notifications; the saga, real-time tracking and smarter matching come in phase 2.",
        tween: 1400,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
