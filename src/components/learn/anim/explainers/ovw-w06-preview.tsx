/**
 * Whole-lesson overview (week 6 preview, "Real-time delivery"): one platform with two halves, store
 * and forward through providers and a real-time tier we run ourselves; the super-app's problem (five
 * kinds of notification over push, SMS, email and in-app; 50M users, 500M a day, +10M an hour in
 * campaigns, 99.9% for critical; ~15% online at the evening peak, ~10M live connections); the five
 * days as one system (design, pipeline, WebSockets and SSE, presence and chat fan-out, operations);
 * and the preview's production example, the zombie socket and its three fixes.
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
  svc: nd(0, 0, "Services", "Svcs"),
  api: nd(1, 0, "Send API"),
  lanes: nd(2, 0, "3 lanes", "Lanes"),
  prov: nd(3, 0, "Providers"),
  camp: nd(0, 1, "Campaign", "Promo"),
  pres: nd(1, 1, "Presence"),
  router: nd(2, 1, "Router"),
  phone: nd(3, 1, "Phone"),
  app: nd(0, 2, "Open app", "App"),
  gw: nd(1, 2, "Gateways"),
  inbox: nd(2, 2, "Inbox"),
};
const E: Ed[] = [
  ["svc", "api", 0, -7],
  ["camp", "api", 0, 8],
  ["api", "lanes"],
  ["lanes", "router"],
  ["router", "prov"],
  ["prov", "phone"],
  ["router", "inbox"],
  ["inbox", "gw"],
  ["gw", "app"],
  ["pres", "gw"],
];
const ALL = { svc: 1, api: 1, lanes: 1, prov: 1, camp: 1, pres: 1, router: 1, phone: 1, app: 1, gw: 1, inbox: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    {
      k: ["one platform, two halves", "two halves"],
      on: { ...ALL, prov: "lit", phone: "lit", gw: "sky", app: "sky" },
      sub: { prov: ["APNs, FCM, SMS, email", "push, SMS, email"], gw: ["we hold it", "ours"] },
      fl: [
        ["router", "prov"],
        ["prov", "phone"],
        ["inbox", "gw", "sky"],
        ["gw", "app", "sky"],
      ],
      chips: [
        ["store and forward via providers", "via providers"],
        ["real time over our sockets, < 1 s", "our sockets, < 1 s"],
      ],
      ctn: ["lit", "sky"],
      note: ["the same real-time tier carries chat and the green online dots", "it also carries chat and dots"],
    },
    {
      k: ["a fintech super-app in India", "a fintech super-app"],
      on: { svc: "lit", api: 1 },
      sub: { svc: "payments" },
      fl: [["svc", "api"]],
      cols: 3,
      chips: [
        ["transactions", "payments"],
        ["security, OTPs", "security"],
        ["social, chat", "social"],
        ["reminders", "reminders"],
        ["marketing", "marketing"],
        ["no WhatsApp", "no WhatsApp"],
      ],
      ctn: ["lit", "bad", "sky", "sky", "warn", "mute"],
      note: ["over push, SMS, email and in-app: a bell with an unread count", "push, SMS, email, in-app"],
    },
    {
      k: "the scale",
      on: { svc: 1, camp: "warn", api: 1, lanes: "lit" },
      sub: { lanes: ["critical first", "critical first"] },
      fl: [
        ["svc", "api"],
        ["camp", "api", "warn"],
        ["api", "lanes"],
      ],
      figs: [
        ["50M", ["users, ~10M daily", "users"]],
        ["500M", ["a day, +10M/h campaigns", "a day"], "lit"],
        ["99.9%", ["for critical", "critical"], "ok"],
      ],
      note: ["marketing must never delay a transaction or a security alert", "marketing never delays a payment"],
    },
    {
      k: ["and online, in real time", "online, in real time"],
      on: { inbox: 1, gw: "lit", app: "lit", pres: "sky" },
      sub: { gw: ["~10M sockets", "~10M"], pres: ["who's online", "dots"] },
      fl: [
        ["inbox", "gw"],
        ["gw", "app"],
        ["pres", "gw", "sky"],
      ],
      figs: [
        ["15%", ["online at the peak", "online at peak"]],
        ["~7.5M", ["people", "people"]],
        ["~10M", ["live connections", "connections"], "lit"],
      ],
      note: ["live in-app under 1 s, and group chats show who's online", "live in under 1 s"],
    },
    {
      k: "the rules",
      on: { router: "lit", prov: "warn", lanes: 1 },
      fl: [["router", "prov", "warn"]],
      chips: [
        ["opt out per category and channel", "per category, channel"],
        ["OTPs, security alerts: always on", "OTPs can't be off"],
        ["SMS is expensive: DLT templates", "SMS: DLT templates"],
        ["an audit trail for every send", "an audit trail"],
      ],
      ctn: ["sky", "bad", "warn", "lit"],
    },
  ],
  days: [
    {
      k: ["Day 1 · draw every box once", "Day 1 · the design"],
      on: ALL,
      figs: [
        ["~5,800/s", ["average", "average"]],
        ["20,000/s", ["design rate", "design rate"], "lit"],
        ["~89%", ["of the bill is SMS", "bill is SMS"], "warn"],
      ],
      note: ["SMS is 5% of the messages; ~10M live connections at the evening peak", "SMS: 5% of messages"],
    },
    {
      k: ["Day 2 · the delivery pipeline", "Day 2 · the pipeline"],
      on: { svc: 1, api: "lit", lanes: "lit", router: "lit", prov: 1, inbox: "ok" },
      fl: [
        ["svc", "api"],
        ["api", "lanes"],
        ["lanes", "router"],
        ["router", "prov"],
        ["router", "inbox", "ok"],
      ],
      chips: [
        ["key from the business event", "idempotency key"],
        ["outbox, then three lanes", "outbox, 3 lanes"],
        ["preferences checked again", "check prefs twice"],
        ["inbox first, dedup every hop", "inbox first"],
      ],
      ctn: ["lit", "sky", "sky", "ok"],
    },
    {
      k: ["Day 3 · WebSockets and SSE", "Day 3 · sockets"],
      on: { inbox: "ok", gw: "lit", app: "lit" },
      sub: { gw: ["≤200K a node", "≤200K"] },
      fl: [
        ["inbox", "gw"],
        ["gw", "app"],
      ],
      figs: [
        ["200K", ["sockets per node", "per node"], "lit"],
        ["75", ["nodes, 3 zones", "nodes"]],
        ["25–30 s", ["heartbeats", "heartbeats"]],
      ],
      note: ["a registry with a lease and an epoch per gateway; resume from the inbox", "resume from the inbox"],
    },
    {
      k: ["Day 4 · presence and chat fan-out", "Day 4 · presence, chat"],
      on: { pres: "sky", gw: "lit", app: 1, inbox: 1 },
      fl: [
        ["pres", "gw", "sky"],
        ["gw", "app"],
      ],
      chips: [
        ["presence: a TTL of d + ε", "presence: TTL"],
        ["told only if on screen", "visible-only"],
        ["bodies once, pointers to groups", "bodies once"],
        ["one owner numbers a chat", "a seq per chat"],
      ],
      ctn: ["sky", "sky", "lit", "ok"],
      note: "push the hint, pull the truth",
    },
    {
      k: ["Day 5 · operations, then the interview", "Day 5 · operations"],
      on: { ...ALL, camp: "warn", prov: "lit" },
      fl: [
        ["camp", "api", "warn"],
        ["router", "prov"],
      ],
      chips: [
        ["the funnel and lane age", "funnel, lane age"],
        ["SLOs stop at the provider", "SLOs at hand-off"],
        ["paced, pausable campaigns", "paced campaigns"],
        ["SMS split, shifted in steps", "SMS in steps"],
      ],
      ctn: ["lit", "sky", "warn", "ok"],
      note: ["then the whole week as one 45-minute interview answer", "then a 45-minute answer"],
    },
  ],
  reality: [
    {
      k: ["edge case: the zombie socket", "the zombie socket"],
      kt: "warn",
      on: { gw: "warn", app: 1, inbox: 1 },
      sub: { gw: ['socket "open"', '"open"'] },
      figs: [
        ["255 s", ["one carrier's NAT", "a carrier NAT"], "warn"],
        ["4 of 73", ["cut in ≤ 5 min", "cut ≤ 5 min"]],
        ["2 h", ["Linux keepalive", "TCP keepalive"]],
      ],
      note: ["an idle TCP connection sends nothing, so neither end notices", "neither end notices"],
    },
    {
      k: ["the registry still points at it", "a dead socket"],
      kt: "bad",
      on: { router: 1, inbox: 1, gw: "bad", app: "bad" },
      sub: { gw: ["dead socket", "dead"] },
      fl: [
        ["router", "inbox"],
        ["inbox", "gw", "bad"],
      ],
      note: ['users see notifications only "when I reopen the app"', '"only when I reopen the app"'],
      nt: "bad",
    },
    {
      k: ["fix 1 · beat under every timeout", "fix 1 · heartbeats"],
      on: { gw: "lit", app: "lit" },
      fl: [["app", "gw"]],
      figs: [
        ["25–30 s", ["client heartbeat, jittered", "heartbeat"], "lit"],
        ["75 s", ["server closes: ~2.5 missed", "server closes"]],
      ],
      note: ["under the shortest idle timeout on the path; the registry entry goes too", "under the shortest timeout"],
    },
    {
      k: ["fix 2 · reconnect, or push", "fix 2 · reconnect, push"],
      on: { router: 1, prov: "lit", phone: "lit", gw: 1, app: "lit" },
      fl: [
        ["router", "prov"],
        ["prov", "phone"],
      ],
      cols: 1,
      chips: [
        ["one missed pong: reconnect", "missed pong: reconnect"],
        ["every network change: reconnect", "network change: reconnect"],
        ["no ack within a few seconds: mobile push", "no ack: mobile push"],
      ],
      ctn: ["lit", "lit", "warn"],
    },
    {
      k: ["fix 3 · resume from the inbox", "fix 3 · resume"],
      kt: "ok",
      on: { inbox: "ok", gw: "ok", app: "ok" },
      sub: { inbox: ["the record", "record"] },
      fl: [
        ["inbox", "gw", "ok"],
        ["gw", "app", "ok"],
      ],
      figs: [
        ["1183", ["last seq it saw", "last seq"]],
        ["→ 1184", ["read from the inbox", "from the inbox"], "ok"],
      ],
      note: ["the socket is a fast path; the inbox is the record", "the inbox is the record"],
      nt: "ok",
    },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      {
        caption:
          "This week's platform has two halves: store and forward through providers (push via APNs and FCM, SMS, email), and real time to online users, where we hold a connection and push in under a second. The same tier carries chat and the online dots.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "A fintech super-app in India notifies people about transactions, security (OTPs, new logins, fraud), social (chat, split requests), reminders and marketing, over push, SMS, email and an in-app bell. No WhatsApp for now.",
        tween: 1400,
      },
      {
        caption:
          "50 million users, about 10 million daily active, 500 million notifications a day, and campaigns can add 10 million in an hour. Critical notifications need 99.9% delivery, and marketing must never delay a transaction or security alert.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "About 15% of users are online at the evening peak: ~7.5 million people and ~10 million live connections. They see notifications and chat live in under a second, and group chats show who's online.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The rules: opt in or out per category and channel, quiet hours, one-tap unsubscribe, but OTPs and security alerts can't be turned off. SMS is expensive and India's local routes need templates registered through DLT; every send needs an audit trail.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "days",
    label: "Five days",
    steps: [
      {
        caption: "Day 1 draws every box once: requirements, five classes of notification, 500M a day ≈ 5,800 a second (design for 20,000), SMS at 5% of messages but ~89% of the bill, ~10M live connections, and the data model.",
        tween: 1400,
      },
      {
        caption:
          "Day 2 builds the delivery pipeline: an idempotency key named after the business event, the outbox, three lanes so a campaign never delays an OTP, preferences checked again at the last mile, inbox first, and at-least-once with dedup at every hop.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Day 3 makes us the provider: SSE and WebSockets, a gateway tier of 200,000 sockets a node, 75 nodes across three zones, a registry kept honest with leases and epochs, heartbeats every 25–30 s, and reconnect storms survived.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Day 4 builds on the sockets: presence as soft state with a TTL, told only to people with that user on screen; typing that's never stored; message bodies once with pointers to small groups; one owner per conversation numbering its messages.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Day 5 runs it: the delivery funnel and lane age, SLOs that stop at the provider hand-off, paced campaigns and lanes all the way to the provider, SMS always split and shifted in steps, cost, lost regions, and the whole week as one 45-minute interview.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "reality",
    label: "Production reality",
    steps: [
      {
        caption:
          "An idle TCP connection sends nothing, so when a carrier NAT forgets the mapping neither end notices. In a 2011 study of 73 carriers, 4 cut idle TCP in 5 minutes or less, one at 255 seconds; Linux's TCP keepalive waits 2 hours.",
        tween: 1400,
      },
      { caption: 'The connection registry still points at the dead socket, and live notifications vanish into it. Trust TCP, and users see their notifications only "when I reopen the app".', tween: 1400, loop: true },
      { caption: "Fix 1: the client heartbeats every 25–30 seconds, with jitter, under the shortest idle timeout on the path; the server closes after ~2.5 missed beats (75 s) and deletes the registry entry.", tween: 1400, loop: true },
      { caption: "Fix 2: the client reconnects after one missed pong and on every network change, and a notification with no ack within a few seconds falls back to mobile push.", tween: 1400, loop: true },
      { caption: "Fix 3: on reconnect the client resumes from the inbox after its last sequence number, so whatever the dead socket swallowed still arrives. The socket is a fast path; the inbox is the record.", tween: 1400, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
