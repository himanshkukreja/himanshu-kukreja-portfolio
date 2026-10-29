/**
 * Whole-lesson overview (week 6, day 3 · real-time channels: WebSockets and SSE at scale). Discord's
 * 25 March 2026 reconnect storm (17% of sessions); four ways to push (polling, long polling, SSE,
 * WebSockets) and choosing per surface; the gateway tier (what a connection costs, heartbeats vs
 * in-app messages, 200K per node, 75 nodes in three zones, connect tickets and reauth); delivering to
 * the right socket (the registry with a lease and epoch per gateway, one pub/sub channel per gateway,
 * inbox first, resume after seq 1183, the ack-timeout fallback to push); and failing together
 * (heartbeats under every idle timeout, a lost zone's 3.3M reconnects, jitter and admission, drains).
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
  rt: nd(0, 0, "Router"),
  ds: nd(1, 0, "Delivery"),
  ps: nd(2, 0, "Pub/sub"),
  gw: nd(3, 0, "Gateways"),
  inbox: nd(0, 1, "Inbox"),
  reg: nd(1, 1, "Registry"),
  lb: nd(2, 1, "L4 LB", "LB"),
  dev: nd(3, 1, "Phone, browser", "Devices"),
  auth: nd(1, 2, "Auth"),
  pw: nd(2, 2, "Push worker", "Push"),
  apns: nd(3, 2, "APNs, FCM"),
};
const E: Ed[] = [
  ["rt", "ds", -7, -7],
  ["ds", "ps", -6, -6],
  ["ps", "gw"],
  ["ds", "inbox", 8, 0],
  ["ds", "reg"],
  ["dev", "lb", 7, 7],
  ["lb", "gw", -7, 0],
  ["gw", "dev"],
  ["ds", "pw", 8, 0],
  ["pw", "apns"],
  ["apns", "dev"],
];

const F: Record<string, Fr[]> = {
  ways: [
    {
      k: ["Discord · 25 March 2026", "Discord, 25 March 2026"],
      kt: "bad",
      on: { gw: "bad", lb: "warn", dev: "warn" },
      sub: { gw: ["half a zone's pods", "half a zone"], dev: ["all reconnect", "reconnect"] },
      fl: [
        ["dev", "lb", "bad"],
        ["lb", "gw", "bad"],
      ],
      figs: [
        ["17%", ["of sessions stopped", "of sessions"], "bad"],
        ["OOM", ["the zone's gateways", "gateways"], "warn"],
        ["3 h+", ['voice "Awaiting Endpoint"', "voice down"]],
      ],
      note: ["a routine deploy became a reconnect storm that took down healthy sockets", "a deploy became a storm"],
    },
    {
      k: ["four ways to push to an online user", "four ways"],
      on: { gw: "lit", dev: "lit", lb: 1 },
      fl: [["gw", "dev"]],
      chips: [
        ["short polling: mostly empty", "short polling"],
        ["long polling: the fallback", "long polling"],
        ["SSE: one way, resume built in", "SSE"],
        ["WebSockets: both ways", "WebSockets"],
      ],
      ctn: ["mute", "warn", "sky", "lit"],
      note: ["7.5M users polling every 5 s is 1.5M requests a second", "polling: 1.5M requests/s"],
    },
    {
      k: ["SSE and WebSockets", "SSE vs WebSockets"],
      on: { gw: "lit", dev: "lit" },
      fl: [["gw", "dev"]],
      chips: [
        ["SSE: Last-Event-ID resume", "SSE: Last-Event-ID"],
        ["SSE: 6 per browser on HTTP/1.1", "SSE: 6 on HTTP/1.1"],
        ["WS: Upgrade, then full duplex", "WS: full duplex"],
        ["WS: every proxy must allow it", "WS: proxies"],
      ],
      ctn: ["sky", "warn", "lit", "warn"],
      note: ["HTTP/2 makes each SSE stream a stream on one shared connection", "HTTP/2 lifts SSE's cap"],
    },
    {
      k: ["choose per surface", "choose per surface"],
      on: { gw: 1, lb: 1, dev: "lit" },
      fl: [
        ["dev", "lb"],
        ["lb", "gw"],
        ["gw", "dev"],
      ],
      cols: 1,
      chips: [
        ["web bell, many tabs · SSE over HTTP/2", "web bell · SSE"],
        ["mobile app · WebSocket: acks, compact frames", "mobile · WebSocket"],
        ["proxy strips Upgrade · SSE, then long polling", "behind a proxy · SSE"],
      ],
      ctn: ["sky", "lit", "warn"],
    },
  ],
  tier: [
    {
      k: ["a separate, rarely deployed tier", "the gateway tier"],
      on: { gw: "lit", lb: 1, dev: 1 },
      sub: { gw: ["no business logic", "no logic"] },
      fl: [
        ["dev", "lb"],
        ["lb", "gw"],
      ],
      chips: [
        ["a file descriptor", "a file descriptor"],
        ["kernel socket buffers", "socket buffers"],
        ["TLS and app state", "TLS, app state"],
        ["epoll: a few threads", "epoll"],
      ],
      ctn: ["sky", "sky", "sky", "ok"],
      note: ["WhatsApp, 2012: 2,277,845 open sockets on one server", "WhatsApp: 2.28M on one box"],
    },
    {
      k: ["what the gateways actually do", "heartbeats vs messages"],
      on: { gw: "lit", dev: 1 },
      fl: [
        ["dev", "lb"],
        ["lb", "gw"],
      ],
      bars: [
        [["heartbeats · ~333,000/s", "beats ~333K/s"], 333, 333, "lit"],
        [["in-app at peak · ~1,700/s", "in-app ~1.7K/s"], 1.7, 333, "sky"],
      ],
      note: ["over 100 to 1: size by connections, not by message rate", "size by connections"],
    },
    {
      k: ["sizing 10M connections", "sizing the fleet"],
      on: { gw: "lit", lb: 1 },
      sub: { gw: ["≤200K each", "≤200K"] },
      figs: [
        ["~400 GB", ["at ~40 KB each", "~40 KB each"]],
        ["200K", ["per node: blast radius", "per node"], "lit"],
        ["75", ["nodes in 3 zones", "nodes"], "ok"],
      ],
      note: ["memory alone needs 13 nodes; a 200K cap needs 50, and 75 to lose a zone", "memory: 13 nodes"],
    },
    {
      k: ["tokens expire, sockets don't", "auth on a socket"],
      on: { auth: "lit", gw: "lit", reg: 1, dev: 1 },
      chips: [
        ["a one-time ticket, ~30 s", "one-time ticket"],
        ["cookies: check Origin", "check Origin"],
        ["reauth before 15 min", "reauth in band"],
        ["log out all: via the registry", "revoke everywhere"],
      ],
      ctn: ["lit", "warn", "sky", "bad"],
    },
  ],
  route: [
    {
      k: ["the connection registry", "the registry"],
      on: { ds: "lit", reg: "lit", gw: 1 },
      sub: { reg: ["gw-17, epoch 9", "gw-17"] },
      fl: [["ds", "reg"]],
      cols: 1,
      chips: [
        ["conn:{user} → phone at gw-17, epoch 9", "user → gw-17, epoch 9"],
        ["a 15 s lease per gateway, not per socket", "a lease per gateway"],
      ],
      ctn: ["lit", "ok"],
      note: ["75 lease refreshes instead of 333,000 writes a second", "75 leases, not 333K writes/s"],
    },
    {
      k: ["one channel per gateway", "pub/sub"],
      on: { rt: 1, ds: "lit", inbox: "ok", ps: "lit", gw: "lit", dev: "ok" },
      sub: { ps: "gw:17", inbox: "seq 1184" },
      fl: [
        ["rt", "ds"],
        ["ds", "inbox", "ok"],
        ["ds", "ps"],
        ["ps", "gw"],
        ["gw", "dev", "ok"],
      ],
      figs: [
        ["1184", ["in the inbox first", "inbox first"], "ok"],
        ["gw:17", ["its gateway's channel", "one channel"], "lit"],
        ["ack", ["seq 1184", "seq 1184"], "ok"],
      ],
      note: ["Redis Pub/Sub is at-most-once: fine, because the inbox is the record", "at-most-once is fine"],
    },
    {
      k: ["the gateway that wasn't there", "gw-17 crashes"],
      kt: "warn",
      on: { ds: 1, ps: "warn", gw: "bad", inbox: "ok", lb: 1, dev: "lit" },
      fl: [
        ["ds", "ps", "warn"],
        ["dev", "lb"],
        ["lb", "gw"],
      ],
      chips: [
        ["21:04:10 · gw-17 crashes", "21:04:10 crash"],
        ["21:04:16 · publish lost", "21:04:16 lost"],
        ["reconnect: after 1183 → 1184", "resume: 1184"],
        ["not back in time: push", "no ack: push"],
      ],
      ctn: ["bad", "warn", "ok", "sky"],
    },
    {
      k: ["looking: socket · not looking: push", "socket or push"],
      on: { ds: "lit", pw: "lit", apns: "lit", dev: 1 },
      fl: [
        ["ds", "pw"],
        ["pw", "apns"],
        ["apns", "dev"],
      ],
      chips: [
        ["no live connection: push", "no socket: push"],
        ["no ack in a few seconds: push", "no ack: push"],
        ["acked on one device: skip", "acked: skip"],
        ["security alert: push anyway", "security: push too"],
      ],
      ctn: ["lit", "warn", "ok", "bad"],
      note: ["push is a doorbell: APNs keeps one per app offline, FCM 100", "push is a doorbell"],
    },
  ],
  storm: [
    {
      k: ["every box has an idle timeout", "idle timeouts"],
      on: { dev: "lit", lb: "warn", gw: 1 },
      fl: [
        ["dev", "lb"],
        ["lb", "gw"],
      ],
      figs: [
        ["255 s", ["one carrier's NAT", "a carrier NAT"], "warn"],
        ["60 s", ["an AWS ALB default", "an ALB"]],
        ["25–30 s", ["jittered heartbeat", "heartbeat"], "ok"],
      ],
      note: ["close after ~2.5 missed beats (75 s); the client after one missed pong", "server 75 s, client 1 pong"],
    },
    {
      k: ["a zone lost: the storm", "reconnect storm"],
      kt: "bad",
      on: { dev: "bad", lb: "warn", gw: "warn" },
      fl: [
        ["dev", "lb", "bad"],
        ["lb", "gw", "bad"],
      ],
      figs: [
        ["~3.3M", ["sockets reconnect", "reconnect"], "bad"],
        ["50,000/s", ["admitted by 50 nodes", "admitted"]],
        ["~67 s", ["if spread evenly", "spread out"], "ok"],
      ],
      note: ["if every client retries within 1 s: 3.3M/s, ~66× capacity", "1 s retries: ~66× capacity"],
      nt: "bad",
    },
    {
      k: ["shape it from both ends", "jitter, admission"],
      on: { dev: "lit", lb: "lit", gw: "lit", inbox: "ok" },
      fl: [
        ["dev", "lb"],
        ["lb", "gw"],
      ],
      chips: [
        ["full jitter, first try too", "full jitter"],
        ['"retry after N s", at once', "retry after N s"],
        ["resume after seq, no reboot", "resume, no reboot"],
        ["slow client: bounded queue", "bounded queues"],
      ],
      ctn: ["lit", "warn", "ok", "sky"],
    },
    {
      k: ["a deploy should look like a trickle", "graceful drain"],
      kt: "ok",
      on: { gw: "ok", lb: 1, dev: 1, reg: 1 },
      fl: [
        ["dev", "lb", "ok"],
        ["lb", "gw", "ok"],
      ],
      figs: [
        ["1%", ["of sockets every 6 s", "every 6 s"]],
        ["~10 min", ["to drain 200K", "per node"]],
        ["1", ["node per zone at once", "node per zone"], "ok"],
      ],
      note: ["the grace period must outlast the drain: where Discord's outage began", "grace period > drain"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "ways",
    label: "Four ways",
    steps: [
      {
        caption:
          "On 25 March 2026 a routine Discord deploy stopped half of one zone's session pods: 17% of all sessions at once. Every client reconnected as designed, the zone's gateways ran out of memory, healthy sockets dropped too, and voice calls hung for over three hours.",
        tween: 1400,
        loop: true,
      },
      { caption: "Four ways to push to an online user: short polling (7.5M users every 5 s is 1.5 million mostly empty requests a second), long polling, Server-Sent Events, and WebSockets.", tween: 1400, loop: true },
      {
        caption:
          "SSE is one long HTTP response with automatic reconnect and Last-Event-ID resume, capped at 6 per browser and domain on HTTP/1.1 until HTTP/2 lifts it. A WebSocket upgrades to full-duplex frames, but every proxy must allow it and resume is yours to build.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "Choose per surface: the web bell gets SSE over HTTP/2, the mobile apps a WebSocket for acks and a compact protocol, and a console behind a proxy that strips Upgrade gets SSE, with long polling as the last resort.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "tier",
    label: "Gateway tier",
    steps: [
      {
        caption:
          "Holding sockets is stateful, so it gets its own rarely deployed tier with no business logic. Each connection costs a file descriptor, kernel buffers, TLS and app state; epoll lets a few threads serve them, and WhatsApp once held 2,277,845 on one server.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "10 million connections heartbeating every 30 s is ~333,000 beats a second, against ~1,700 in-app notifications a second at peak: more than 100 to 1. Size the fleet by connections, not message rate.",
        tween: 1400,
        loop: true,
      },
      { caption: "At an assumed ~40 KB each, 10M connections need ~400 GB: 13 nodes by memory alone. A 200,000 cap per node for blast radius makes it 50 nodes, and 75 across three zones to survive losing one.", tween: 1400 },
      {
        caption:
          'Browsers can\'t set an Authorization header on a socket, so clients connect with a one-time ticket valid ~30 s, cookie-based sockets check Origin, the client reauths before its 15-minute token expires, and "log out all devices" reaches every socket through the registry.',
        tween: 1400,
      },
    ],
  },
  {
    id: "route",
    label: "Right socket",
    steps: [
      {
        caption:
          "Priya's phone is on gw-17, one of 75. The connection registry maps each device to a gateway and epoch; each gateway holds a 15-second lease, so lookups skip dead gateways with 75 refreshes instead of 333,000 writes a second.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "The delivery service writes seq 1184 to the inbox first, then publishes to gw:17, the one channel that gateway subscribes to. Redis Pub/Sub is at-most-once, which is fine only because the socket isn't the record.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "gw-17 crashes at 21:04:10, and a publish at 21:04:16 is lost while its lease is still alive. Priya's app reconnects elsewhere with jitter and resumes after 1183, which returns 1184; if she isn't back in time, no ack arrives and she gets a push.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "The socket is for users who are looking, push for those who aren't: no live connection, or no ack within a few seconds, means push. An ack on one device skips it for routine events, but a security alert pushes anyway.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "storm",
    label: "Heartbeats & storms",
    steps: [
      {
        caption:
          "TCP keepalive waits 2 hours, but one carrier cut idle TCP at 255 seconds and an AWS ALB defaults to 60. Heartbeat every 25–30 s with jitter; the server closes after ~2.5 missed beats (75 s), the client after one missed pong or any network change.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Losing a zone drops ~3.3M sockets. At an assumed ~1,000 admissions a second each, the 50 surviving nodes admit ~50,000/s, so spread evenly everyone is back in ~67 s; if every client retries within 1 s, that's ~66× capacity.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          'Clients back off with full jitter, first attempt included, and resume after their last sequence number instead of rebooting; gateways admit through token buckets and refuse cheaply with "retry after". A slow client gets a bounded queue, then a resumable close.',
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Deploy by draining: fail readiness, send reconnect hints to 1% of sockets every 6 s (about 10 minutes for 200,000), one node per zone at a time, with a grace period longer than the drain, which is where Discord's 2026 outage began.",
        tween: 1400,
        loop: true,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
