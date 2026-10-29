/**
 * Whole-lesson overview (week 6, day 5 · operations, scale and edge cases). Measure and promise:
 * GOV.UK Notify's all-or-nothing SMS failover, the delivery funnel (accepted is not delivered),
 * end-to-end latency from created_at and lane age, SLOs that stop at the provider hand-off (~14
 * minutes of stall a month). Bursts and providers: campaign mode (~5,500/s, from 10:07), lanes all the
 * way to the provider (reserved quota, a separate OTP sender), breakers per provider and route, SMS
 * always split and shifted 10 points at a time, APNs down with no second provider. Cost, regions and
 * edge cases: segments, the ~$11.9M to ~$5.9M bill, fence-replay-re-admit, IANA zones, token
 * deletion, the same OTP code. Then the whole week as a 45-minute interview.
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
  api: nd(0, 0, "API"),
  lanes: nd(1, 0, "Lanes"),
  camp: nd(2, 0, "Campaign"),
  apns: nd(3, 0, "APNs, FCM"),
  regA: nd(0, 1, "Region A", "Reg. A"),
  regB: nd(1, 1, "Region B"),
  wk: nd(2, 1, "Workers"),
  smsA: nd(3, 1, "SMS provider A", "SMS A"),
  obs: nd(0, 2, "SLOs", "SLOs"),
  dev: nd(1, 2, "Users"),
  gw: nd(2, 2, "Gateways"),
  smsB: nd(3, 2, "SMS provider B", "SMS B"),
};
const E: Ed[] = [
  ["api", "lanes"],
  ["camp", "lanes", 0, -8],
  ["lanes", "wk", 8, -8],
  ["regA", "regB"],
  ["regB", "wk", 0, 8],
  ["wk", "apns"],
  ["wk", "smsA"],
  ["wk", "smsB"],
  ["wk", "gw"],
  ["gw", "dev"],
];
const ALL = { api: 1, lanes: 1, camp: 1, apns: 1, regA: 1, regB: 1, wk: 1, smsA: 1, obs: 1, dev: 1, gw: 1, smsB: 1 } as const;

const F: Record<string, Fr[]> = {
  measure: [
    {
      k: ["GOV.UK Notify · late 2019", "GOV.UK Notify, 2019"],
      kt: "bad",
      on: { wk: 1, smsA: "bad", smsB: "bad" },
      sub: { smsA: ["fails under a spike", "fails"], smsB: ["100% at once: fails", "fails too"] },
      fl: [
        ["wk", "smsA", "bad"],
        ["wk", "smsB", "bad"],
      ],
      cols: 1,
      chips: [
        ["a spike makes one provider fail", "a spike: A fails"],
        ["failover swaps all traffic to the other", "100% swaps to B"],
        ["the sudden load makes it fail too", "B fails too"],
      ],
      ctn: ["bad", "warn", "bad"],
      note: ["the fix: split every text ~50/50, shift 10 points at a time", "fix: split, shift in steps"],
      nt: "ok",
    },
    {
      k: ["the delivery funnel", "the funnel"],
      on: { api: 1, lanes: 1, wk: 1, apns: "warn", smsA: "sky", gw: "ok", dev: 1 },
      fl: [
        ["api", "lanes"],
        ["lanes", "wk"],
        ["wk", "apns"],
        ["wk", "smsA"],
        ["wk", "gw"],
        ["gw", "dev", "ok"],
      ],
      chips: [
        ["APNs: best-effort, no receipt", "APNs: best-effort"],
        ["FCM: Android only, 5 days late", "FCM: up to 5 days"],
        ["SMS: carrier receipts", "SMS: receipts"],
        ["in-app: the client acks a seq", "in-app: acks"],
      ],
      ctn: ["warn", "warn", "sky", "ok"],
      note: ["provider accepted is not delivered, and the providers say so", "accepted is not delivered"],
    },
    {
      k: ["green dashboard, angry users", "measure the user's clock"],
      kt: "warn",
      on: { lanes: "warn", obs: "lit", wk: 1 },
      sub: { lanes: ["critical 4 min", "4 min"] },
      figs: [
        ["99.8%", ["push success", "success"], "ok"],
        ["4 min", ["for an OTP at 19:05", "OTP wait"], "bad"],
        ["age", ["oldest message, per lane", "lane age"], "lit"],
      ],
      note: ["measure from created_at: a waiting message hasn't failed yet", "measure from created_at"],
    },
    {
      k: ["SLOs stop at the provider", "SLOs"],
      on: { obs: "lit", lanes: 1, wk: 1, apns: 1 },
      chips: [
        ["critical · 99.9% in 10 s", "critical 99.9%, 10 s"],
        ["payments · 99.5% in 30 s", "payments 99.5%"],
        ["in-app ack · 99% in 2 s", "in-app 99%, 2 s"],
        ["bulk · no availability target", "bulk: no target"],
      ],
      ctn: ["bad", "lit", "ok", "warn"],
      note: ["critical at 5% (assumed): 750,000 late a month, ~14 min at peak", "~14 min of stall a month"],
      nt: "bad",
    },
  ],
  burst: [
    {
      k: ["a campaign is a job", "campaign mode"],
      on: { camp: "lit", lanes: "lit", wk: 1 },
      sub: { camp: ["paced, pausable", "paced"] },
      fl: [
        ["camp", "lanes"],
        ["lanes", "wk"],
      ],
      figs: [
        ["~5,500/s", ["10M over 30 min", "10M / 30 min"], "lit"],
        ["10:07", ["not 10:00", "not 10:00"]],
        ["600K", ["a minute: FCM's quota", "FCM a minute"]],
      ],
      note: ["snapshot, filter once, pace, wave by zone, key each send, kill switch", "keyed sends, a kill switch"],
    },
    {
      k: ["lanes all the way to the provider", "to the provider"],
      on: { lanes: "lit", wk: "lit", apns: "lit", smsA: "ok", smsB: "warn" },
      sub: { wk: ["reserved quota", "reserve"], smsA: ["OTPs only, 120 s", "OTPs"], smsB: "marketing" },
      fl: [
        ["lanes", "wk"],
        ["wk", "apns"],
        ["wk", "smsA", "ok"],
        ["wk", "smsB", "warn"],
      ],
      chips: [
        ["notifications.critical", "critical"],
        ["notifications.transactional", "transactional"],
        ["notifications.bulk", "bulk"],
        ["a share bulk can't touch", "reserved quota"],
      ],
      ctn: ["bad", "lit", "warn", "ok"],
      note: ["bulk taking 590,000 of FCM's 600,000 a minute gives an OTP a 429", "or the OTP gets a 429"],
    },
    {
      k: ["a breaker per provider and route", "circuit breakers"],
      kt: "warn",
      on: { wk: 1, apns: "warn", smsA: "warn" },
      sub: { smsA: ["A to India: open", "open"] },
      chips: [
        ["count 5xx, timeouts, slow receipts", "5xx, slow receipts"],
        ["not 410s or bad numbers", "not bad tokens"],
        ["open: fail over or hold", "open: fail over"],
        ["half-open: a trickle", "half-open: trickle"],
      ],
      ctn: ["warn", "mute", "sky", "ok"],
    },
    {
      k: ["SMS: always split, shifted in steps", "SMS in steps"],
      kt: "ok",
      on: { wk: 1, smsA: "warn", smsB: "ok" },
      fl: [
        ["wk", "smsA", "warn"],
        ["wk", "smsB", "ok"],
      ],
      bars: [
        [["provider A · 50 → 40 after a 5xx", "A 50 → 40"], 40, 100, "warn"],
        [["provider B · 50 → 60", "B 50 → 60"], 60, 100, "ok"],
      ],
      note: ["at most one cut a minute; an hour without change drifts back 10 points", "one cut a minute at most"],
    },
    {
      k: ["APNs down, no second provider", "APNs down"],
      kt: "bad",
      on: { apns: "bad", wk: 1, smsA: "lit", gw: "lit", camp: "warn" },
      fl: [
        ["wk", "smsA"],
        ["wk", "gw"],
      ],
      cols: 1,
      chips: [
        ["40,000 security and fraud alerts: SMS now, ~$500", "alerts: SMS now"],
        ["160,000 payments: in-app, or held and collapsed", "payments: in-app"],
        ["1,000,000 campaign pushes: paused", "campaign: paused"],
      ],
      ctn: ["bad", "lit", "warn"],
      note: ["on recovery, ramp the drain, critical first", "ramp the drain"],
    },
  ],
  cost: [
    {
      k: ["segments: one character can triple it", "SMS segments"],
      on: { wk: 1, smsA: "lit", smsB: "lit" },
      figs: [
        ["1", ["95 English chars", "95 English"], "ok"],
        ["2", ["95 Hindi chars", "95 Hindi"], "warn"],
        ["3", ["150 chars, one ’", "one ’"], "bad"],
      ],
      note: ["GSM-7 fits 160 a segment; UCS-2 only 70, then 67", "GSM-7 160, UCS-2 70"],
    },
    {
      k: ["messages × segments × price", "the SMS bill"],
      kt: "ok",
      on: { wk: 1, smsA: 1, smsB: 1, obs: "lit" },
      bars: [
        [["list price · ~$11.9M a month", "~$11.9M a month"], 11.9, 11.9, "bad"],
        [["after both levers · ~$5.9M", "after: ~$5.9M"], 5.9, 11.9, "ok"],
      ],
      note: ["marketing off SMS (−10M), payment SMS on real push failure (−6.5M)", "−10M and −6.5M segments"],
    },
    {
      k: ["21:00 · region A goes dark", "losing a region"],
      kt: "bad",
      on: { regA: "bad", regB: "lit", wk: 1, gw: "lit", dev: 1 },
      sub: { regB: ["epoch bumped", "fenced"] },
      fl: [
        ["regA", "regB", "bad"],
        ["regB", "wk"],
        ["gw", "dev"],
      ],
      cols: 1,
      chips: [
        ["1 · fence region A: bump the region epoch", "1 · fence"],
        ["2 · replay unsent from the ledger, critical first", "2 · replay"],
        ["3 · re-admit 5M sockets with admission control", "3 · re-admit"],
      ],
      ctn: ["bad", "lit", "ok"],
      note: ["a few sends from the final seconds go twice; collapse ids hide them", "a few duplicates, collapsed"],
    },
    {
      k: ["edge cases at 50M users", "edge cases"],
      on: { wk: "lit", apns: 1, smsA: 1 },
      chips: [
        ["IANA zones: DST has gaps", "IANA zones, DST"],
        ["410: delete unless re-registered", "careful deletes"],
        ["the same OTP code every attempt", "the same OTP code"],
        ["ledger: (notification_id, channel)", "send ledger"],
      ],
      ctn: ["sky", "warn", "ok", "lit"],
      note: ["at 50M users, a one-in-a-million case happens 50 times a day", "1 in a million: 50 a day"],
    },
  ],
  interview: [
    {
      k: ["minutes 0–10 · ask, then estimate", "0–10 min"],
      on: { api: "lit", lanes: 1 },
      figs: [
        ["~5,800/s", ["average", "average"]],
        ["~17,000/s", ["at peak", "peak"], "lit"],
        ["10M", ["sockets at peak", "sockets"]],
      ],
      note: ["50M users, 500M a day, 99.9% critical, campaigns never delay payments", "500M a day, 99.9% critical"],
    },
    {
      k: ["minutes 10–35 · design, deep dive", "10–35 min"],
      on: ALL,
      fl: [
        ["api", "lanes"],
        ["lanes", "wk"],
        ["wk", "apns"],
        ["wk", "gw"],
        ["gw", "dev"],
      ],
      cols: 3,
      chips: [
        ["guarantees", "guarantees"],
        ["real time, storms", "real time"],
        ["presence, fan-out", "fan-out"],
      ],
      ctn: ["lit", "sky", "ok"],
      note: ["API with keys → outbox → router → lanes → workers; inbox and gateways", "API → lanes → workers"],
    },
    {
      k: ["minutes 35–45 · run it", "35–45 min"],
      kt: "ok",
      on: { obs: "ok", lanes: 1, wk: 1, smsA: 1, smsB: 1, regB: 1 },
      chips: [
        ["SLOs per class", "SLOs per class"],
        ["lanes to the provider", "lanes to provider"],
        ["breakers, SMS in steps", "SMS in steps"],
        ["cost, regions, edge cases", "cost, regions"],
      ],
      ctn: ["ok", "lit", "warn", "sky"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "measure",
    label: "Measure & promise",
    steps: [
      {
        caption:
          "GOV.UK Notify, late 2019: a spike made one SMS provider fail, failover swapped all traffic to the other, and the sudden load made that one fail too. The fix: split every text roughly 50/50 and shift traffic 10 percentage points at a time.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Count every notification at every stage by class, channel and provider. Provider accepted isn't delivered: APNs is best-effort, FCM's delivery data is Android-only and up to 5 days late, SMS has carrier receipts, and only in-app shows the device's ack.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "At 19:05 push success is 99.8% and errors are flat, yet OTPs take four minutes. Measure end to end from created_at, and the oldest message's age per lane: a message waiting in a topic hasn't failed, so success rates can't see a queue.",
        tween: 1400,
      },
      {
        caption:
          "SLOs cover what we can measure: 99.9% of critical handed off or acked within 10 s, payments 99.5% within 30 s, in-app acks 99% within 2 s, no availability target for bulk. If critical is 5% of traffic (assumed), a full stall at peak spends the month in ~14 minutes.",
        tween: 1400,
      },
    ],
  },
  {
    id: "burst",
    label: "Bursts & providers",
    steps: [
      {
        caption:
          "A campaign is a job, not 10M API calls: snapshot the audience, filter once, pace it into the bulk lane (10M over 30 minutes ≈ 5,500 a second, ramped, starting at 10:07, not 10:00), wave by time zone, key each send, and keep a kill switch.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Separate topics aren't enough: FCM's 600,000-a-minute quota is per project, and an SMS sender has one queue. So token buckets reserve a share bulk can't touch, OTPs get their own SMS sender, and an OTP text carries a 120 s validity period.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          'One breaker per provider and route, so "A to India" can fail while "A to the US" works. Count 5xx, timeouts and slow receipts, never 410s or invalid numbers; open means fail over or hold, never drop, and half-open lets a trickle through.',
        tween: 1400,
      },
      {
        caption:
          "SMS is always split, roughly 50/50, so both providers stay warm. A 5xx, or 30% of receipts slower than 4 minutes, cuts that provider's share by 10 points, at most once a minute; an hour with no change drifts back. Never move traffic onto a provider that's had none.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "APNs returns 503 for 20 minutes, and iPhones have no other path: 40,000 security and fraud alerts go by SMS at once (~$500), 160,000 payment alerts go in-app or are held and collapsed per user, the 1,000,000-push campaign pauses, and the drain is ramped on recovery.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "cost",
    label: "Cost & regions",
    steps: [
      {
        caption:
          "SMS is priced per segment: GSM-7 fits 160 characters, UCS-2 only 70 (67 when split), and one character outside GSM-7 switches the whole message. A 95-character English OTP is 1 segment, the same in Hindi 2, and a 150-character alert with one curly apostrophe 3.",
        tween: 1400,
      },
      {
        caption:
          "At ~$0.012 a segment (Twilio's US list price plus a carrier fee), 33M segments a day is ~$11.9M a month. Moving marketing to push, in-app and email, and sending payment SMS only on real push failures (assumed half), cuts it to ~$5.9M.",
        tween: 1400,
      },
      {
        caption:
          "When region A fails at 21:00, region B fences it first by bumping a region epoch, replays unsent notifications from the replicated outbox and ledger, critical first, and re-admits A's 5M sockets with admission control. A few sends from the final seconds go twice; collapse ids hide them.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "At 50M users a one-in-a-million case happens 50 times a day: store IANA zones (DST makes missing and doubled times), delete a token on APNs' 410 only if it wasn't registered again after it, send the same OTP code on every attempt, and key the send ledger by notification and channel.",
        tween: 1400,
      },
    ],
  },
  {
    id: "interview",
    label: "Interview",
    steps: [
      {
        caption:
          "Minutes 0–10: requirements (types, channels, 50M users, 500M a day, 10M an hour in campaigns, latency per class, 99.9% for critical), then estimates (~5,800 a second, ~17,000 at peak, the channel mix, SMS cost, 10M sockets at the evening peak).",
        tween: 1400,
      },
      {
        caption:
          "Minutes 10–20: the architecture, API with idempotency keys → outbox → router → lanes → channel workers → providers, with the inbox and gateways for in-app. Minutes 20–35: the interviewer's deep dive, guarantees, real-time delivery and reconnect storms, or presence and fan-out.",
        tween: 1400,
        loop: true,
      },
      { caption: "Minutes 35–45: run it, with SLOs per class, lanes all the way to the provider, breakers and SMS shifted in steps, cost, regions and edge cases. That's the whole week as one answer.", tween: 1400 },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
