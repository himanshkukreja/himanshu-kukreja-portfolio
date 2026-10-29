/**
 * Whole-lesson overview (week 6, day 1 · designing a real-time notification platform): the
 * Preface's illustrative evening (a 10M campaign in the one queue, Priya's push and Rohan's OTP at
 * 20:08, Meera's ignored opt-out, Kabir's stale green dot, SMS at 5% of messages and ~90% of the
 * bill); the requirements (FERNS, the five classes and why they can't share a queue); the estimate
 * (~5,800/s, design for 20,000/s, the channel mix, SMS ~89% of ~$3.4M a month, ~10M connections);
 * and the architecture: seven pieces, Arjun's ₹2,400 to Priya's browser (inbox first, push only
 * without an ack) and the five records.
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
  ob: nd(2, 0, "Outbox"),
  lanes: nd(3, 0, "Priority lanes", "Lanes"),
  dev: nd(0, 1, "Apps", "Apps", 2),
  prov: nd(1, 1, "Providers", "Provider"),
  wk: nd(2, 1, "Workers"),
  router: nd(3, 1, "Router"),
  gw: nd(1, 2, "Gateways"),
  inbox: nd(2, 2, "Inbox"),
  pref: nd(3, 2, "Preferences", "Prefs"),
};
const E: Ed[] = [
  ["svc", "api"],
  ["api", "ob"],
  ["ob", "lanes"],
  ["lanes", "router"],
  ["router", "pref"],
  ["router", "wk"],
  ["wk", "prov"],
  ["prov", "dev", 0, -12],
  ["router", "inbox"],
  ["inbox", "gw"],
  ["gw", "dev", 0, 12],
];
const ALL = { svc: 1, api: 1, ob: 1, lanes: 1, dev: 1, prov: 1, wk: 1, router: 1, gw: 1, inbox: 1, pref: 1 } as const;

const F: Record<string, Fr[]> = {
  evening: [
    {
      k: ["19:55 · one queue for everything", "19:55 · one queue"],
      kt: "warn",
      on: { svc: "warn", api: 1, ob: 1, lanes: "warn" },
      sub: { svc: "marketing", lanes: ["one shared queue", "one queue"] },
      fl: [
        ["svc", "api", "warn"],
        ["api", "ob", "warn"],
        ["ob", "lanes", "warn"],
      ],
      figs: [
        ["10M", ["cashback pushes", "pushes"], "warn"],
        ["20:00", ["sharp", "sharp"]],
        ["1", ["queue for everything", "queue"], "bad"],
      ],
      note: ["an illustrative Friday evening; each failure is a classic one", "an illustrative evening"],
    },
    {
      k: ["20:00 · a payment and an OTP, late", "20:00 · late"],
      kt: "bad",
      on: { lanes: "bad", router: 1, wk: 1, prov: 1, dev: "bad" },
      sub: { lanes: ["9.2M ahead", "9.2M ahead"] },
      fl: [
        ["lanes", "router", "bad"],
        ["router", "wk", "bad"],
        ["wk", "prov", "bad"],
        ["prov", "dev", "bad"],
      ],
      figs: [
        ["20:08", ["Priya's push buzzes", "Priya's push"], "bad"],
        ["20:08", ["Rohan's OTP arrives", "Rohan's OTP"], "bad"],
        ["5 min", ["the code's expiry", "code expiry"]],
      ],
      note: ["Priya's web bell only refreshes on reload; Rohan taps Resend three times", "her bell only refreshes on reload"],
    },
    {
      k: ["20:03 · Meera's opt-out ignored", "20:03 · opt-out ignored"],
      kt: "bad",
      on: { router: 1, pref: "bad", wk: 1, prov: 1, dev: "bad" },
      fl: [
        ["router", "pref", "bad"],
        ["router", "wk", "bad"],
        ["wk", "prov", "bad"],
      ],
      cols: 1,
      chips: [
        ["19:55 · the campaign checks preferences once", "19:55 · checked once"],
        ["19:59 · Meera turns marketing off", "19:59 · Meera opts out"],
        ["20:03 · she gets the cashback push anyway", "20:03 · pushed anyway"],
      ],
      ctn: ["sky", "warn", "bad"],
    },
    {
      k: ["21:30 · a green dot, a dead phone", "21:30 · Kabir's dot"],
      kt: "warn",
      on: { gw: "warn", dev: 1 },
      sub: { gw: ['"online"', '"online"'] },
      figs: [
        ["20:12", ["Kabir's phone dies", "phone dies"]],
        ["21:30", ["still a green dot", "still green"], "warn"],
      ],
      note: ['in the "Goa Trip" group, nothing ever said he left', "nothing said he left"],
    },
    {
      k: ["month end · the bill", "month end"],
      kt: "warn",
      on: { wk: 1, prov: "warn" },
      figs: [
        ["5%", ["of the messages are SMS", "of messages: SMS"]],
        ["~90%", ["of the provider bill", "of the bill"], "bad"],
      ],
      note: ["each failure is a missing piece of the platform, not a clever algorithm", "each is a missing piece"],
    },
  ],
  ask: [
    {
      k: ["the answers (FERNS)", "requirements"],
      on: { svc: "lit", api: 1 },
      figs: [
        ["50M", ["users, ~10M daily", "users"]],
        ["500M", ["a day, +10M/h campaigns", "a day"], "lit"],
        ["99.9%", ["for critical", "critical"], "ok"],
      ],
      note: ["security near-instant, payments 1–2 s, in-app < 1 s, marketing < 1 min", "in-app < 1 s, payments 1–2 s"],
    },
    {
      k: ["five classes, five clocks", "five classes"],
      on: { lanes: "lit", router: 1 },
      sub: { lanes: ["critical·trans.·bulk", "3 lanes"] },
      chips: [
        ["critical · OTP, fraud · seconds", "critical · seconds"],
        ["transactional · payments · 1–2 s", "payments · 1–2 s"],
        ["social · chat · ~1 s live", "social · ~1 s live"],
        ["reminder · at a set time", "reminder · scheduled"],
        ["marketing · minutes · bulk lane", "marketing · minutes"],
      ],
      ctn: ["bad", "lit", "sky", "sky", "warn"],
      note: ["each class gets its own latency target, channels and lane", "its own channels and lane each"],
    },
    {
      k: ["why they can't share a queue", "one queue at 20:00"],
      kt: "bad",
      on: { lanes: "bad", router: 1 },
      sub: { lanes: ["one FIFO", "one FIFO"] },
      fl: [["lanes", "router", "bad"]],
      figs: [
        ["9.2M", ["ahead of the OTP", "ahead of it"], "bad"],
        ["460 s", ["at 20,000 a second", "at 20,000/s"]],
        ["~167K/s", ["to drain 10M in a minute", "to drain in 1 min"], "warn"],
      ],
      note: ["so critical gets its own lane, and campaigns are paced into bulk", "separate lanes, paced bulk"],
    },
  ],
  numbers: [
    {
      k: ["500 million a day", "the volume"],
      on: { api: "lit", ob: 1, lanes: 1 },
      fl: [
        ["api", "ob"],
        ["ob", "lanes"],
      ],
      figs: [
        ["~5,800/s", ["average", "average"]],
        ["~17,400/s", ["at a 3× peak", "3× peak"]],
        ["20,000/s", ["design for", "design for"], "lit"],
      ],
      note: ["a 10M campaign spread over an hour adds 2,800/s (+48%); bursts are worse", "a campaign: +2,800/s"],
    },
    {
      k: ["the channel mix", "channel mix"],
      on: { wk: 1, prov: 1, inbox: 1 },
      bars: [
        [["push 60% · 300M a day", "push 60%"], 60, 100, "lit"],
        [["email 25% · 125M a day", "email 25%"], 25, 100, "sky"],
        [["in-app 10% · ~580 a second", "in-app 10%"], 10, 100, "ok"],
        [["SMS 5% · 750M a month", "SMS 5%"], 5, 100, "warn"],
      ],
    },
    {
      k: ["the provider bill", "the bill"],
      kt: "warn",
      on: { wk: 1, prov: "warn" },
      bars: [
        [["SMS · ~$3.0M a month", "SMS ~$3.0M"], 3, 3.4, "bad"],
        [["email · ~$375K a month", "email ~$375K"], 0.375, 3.4, "sky"],
        [["push · $0, FCM is no-cost", "push $0"], 0, 3.4, "ok"],
      ],
      note: ["SMS ≈ 89% of ~$3.4M at an assumed $0.004 each: one SMS costs 40 emails", "SMS ≈ 89% of ~$3.4M"],
    },
    {
      k: ["the live connections", "live connections"],
      on: { inbox: 1, gw: "lit", dev: "lit" },
      fl: [
        ["inbox", "gw"],
        ["gw", "dev"],
      ],
      figs: [
        ["15%", ["online at the peak", "online"]],
        ["~1.33", ["devices each", "devices each"]],
        ["~10M", ["live connections", "connections"], "lit"],
      ],
      note: ["so the real-time tier is sized by connections, not ~580 in-app a second", "sized by connections"],
    },
  ],
  arch: [
    {
      k: ["seven pieces, one job each", "seven pieces"],
      on: ALL,
      sub: { api: ["+ idem. key", "+ key"], lanes: ["critical·trans.·bulk", "3 lanes"], gw: ["+ presence", "+ presence"], inbox: ["seq per user", "seq"] },
      chips: [
        ["ingest, preferences, the pipeline", "ingest, prefs, pipeline"],
        ["workers, inbox, gateways, presence", "inbox, gateways, presence"],
      ],
      ctn: ["lit", "sky"],
      note: ["ingest never calls a provider, so the payment service never waits on one", "ingest never calls a provider"],
    },
    {
      k: ["Arjun's ₹2,400 · in through a lane", "₹2,400 · ingest"],
      on: { svc: 1, api: "lit", ob: "lit", lanes: "lit", router: 1 },
      sub: { svc: "payments" },
      fl: [
        ["svc", "api"],
        ["api", "ob"],
        ["ob", "lanes"],
        ["lanes", "router"],
      ],
      chips: [
        ["key txn-9f3", "key txn-9f3"],
        ["notification + outbox, one txn", "one transaction"],
        ["202 Accepted, n-81", "202, n-81"],
        ["the transactional lane", "transactional lane"],
      ],
      ctn: ["lit", "sky", "ok", "lit"],
    },
    {
      k: ["inbox first, then the hint", "inbox first"],
      kt: "ok",
      on: { router: 1, pref: 1, inbox: "lit", gw: "lit", dev: "ok" },
      sub: { pref: ["in-app on", "in-app on"], gw: "gw-17", dev: "Priya" },
      fl: [
        ["router", "pref"],
        ["router", "inbox"],
        ["inbox", "gw"],
        ["gw", "dev", "ok"],
      ],
      figs: [
        ["1184", ["inbox seq", "inbox seq"], "lit"],
        ["gw-17", ["gets the hint", "the hint"]],
        ["ack", ["within 5 s: no push", "no push"], "ok"],
      ],
    },
    {
      k: ["no ack: push", "no ack: push"],
      kt: "warn",
      on: { router: 1, wk: "lit", prov: "lit", dev: 1, inbox: "ok", gw: "warn" },
      fl: [
        ["router", "wk"],
        ["wk", "prov"],
        ["prov", "dev"],
      ],
      chips: [
        ["gw-17 dies? resume after 1183", "resume after 1183"],
        ["no ack in a few seconds? push", "no ack? push"],
      ],
      ctn: ["ok", "warn"],
      note: ["push via APNs or FCM; the socket is a fast path, never the record", "the socket is never the record"],
    },
    {
      k: ["five records", "the data model"],
      on: { ob: "lit", inbox: "lit", pref: "lit", wk: 1 },
      chips: [
        ["notifications · one per event", "notifications"],
        ["deliveries · one per attempt", "deliveries"],
        ["inbox_items · (user_id, seq)", "inbox items"],
        ["preferences + a consent log", "preferences"],
        ["device_tokens · with a status", "device tokens"],
      ],
      ctn: ["lit", "sky", "ok", "sky", "sky"],
      note: ['sent is not delivered: FCM\'s "sent" means enqueued', "sent is not delivered"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "evening",
    label: "The evening",
    steps: [
      { caption: "An illustrative Friday evening at the super-app: at 19:55 marketing schedules a Diwali cashback push to 10 million users for 20:00 sharp, and it goes into the same queue as everything else.", tween: 1400, loop: true },
      {
        caption: "Arjun pays Priya ₹2,400 at 20:00:02: her web bell only refreshes on reload, and the push buzzes at 20:08. Rohan's OTP SMS waits behind 9.2M campaign messages and arrives at 20:08, after the code's 5-minute expiry.",
        tween: 1400,
        loop: true,
      },
      { caption: "Meera turned marketing off at 19:59 and still gets the cashback push at 20:03, because the campaign checked preferences once, when it was built at 19:55.", tween: 1400, loop: true },
      { caption: 'At 21:30, in the "Goa Trip" group, Kabir still shows a green dot. His phone died at 20:12.', tween: 1200 },
      {
        caption:
          "At month end Finance asks why SMS, 5% of the messages, is nearly 90% of the provider bill. Each failure is a missing piece: a priority lane, a send-time preference check, an inbox with a live connection, presence that expires, a channel policy.",
        tween: 1400,
      },
    ],
  },
  {
    id: "ask",
    label: "Requirements",
    steps: [
      {
        caption:
          "Spend the first five minutes on FERNS questions. The answers: 50M users, ~10M daily active, 500M a day plus 10M an hour in campaigns, ~15% online at peak; security near-instant, payments in 1–2 s, live in-app under 1 s; 99.9% for critical.",
        tween: 1400,
      },
      {
        caption:
          "Notifications aren't all the same: critical (OTP, fraud) in seconds, transactional (payments) in 1–2 s, social about a second live, reminders at a scheduled time, marketing within minutes. Each class gets its own channels and lane.",
        tween: 1400,
      },
      {
        caption: "Why it matters: with one queue drained at 20,000 a second, an OTP enqueued at 20:00:40 has 9.2M messages ahead and leaves 460 s later, at about 20:08. Draining 10M in a minute would take ~167,000 a second.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "numbers",
    label: "Estimate",
    steps: [
      {
        caption: "500 million a day is ~5,800 a second; a 3× evening peak (assumed) is ~17,400, so design for 20,000. A 10M campaign spread evenly over an hour adds 2,800 a second, +48%, and bursts are far worse unless paced.",
        tween: 1400,
        loop: true,
      },
      { caption: "The channel mix: push 60% (300M a day), email 25% (125M), in-app 10% (50M, ~580 a second) and SMS 5%: 25M a day, 750M a month.", tween: 1400 },
      { caption: "At an assumed $0.004 per SMS, 750M a month cost ~$3.0M; 3.75B emails at SES's $0.10 per 1,000 cost ~$375,000; FCM is no-cost. SMS is ~89% of ~$3.4M a month, so every SMS needs a reason.", tween: 1400 },
      { caption: "15% of 50M online at the evening peak, ~1.33 devices each, is ~10 million live connections: the real-time tier is sized by connections, not by ~580 in-app notifications a second.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Seven pieces, each with one job: ingest (the Send API, an idempotency key, the outbox), preferences, the pipeline (lanes and the router), channel workers, the inbox, the real-time gateways, and presence.", tween: 1400 },
      {
        caption:
          "Arjun pays Priya ₹2,400. The payment service calls send() with key txn-9f3; the Send API writes the notification and its outbox row in one transaction and returns 202 for n-81, and the relay publishes it to the transactional lane.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The router reads her preferences: in-app on, a web session live. In-app delivery appends seq 1184 to her inbox before anyone is told, then hints gateway gw-17; her browser shows it and acks within 5 s, so a routine payment gets no push.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "If gw-17 crashes between the inbox write and the socket push, her browser reconnects elsewhere and asks for everything after 1183. If no ack arrives within a few seconds, the platform falls back to push via APNs or FCM.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Five records: notifications (one per event, holding the idempotency key), deliveries (one per channel attempt, so sent and delivered stay apart), inbox items keyed by (user_id, seq), preferences with a consent log, and device tokens with a status.",
        tween: 1400,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
