/**
 * Whole-lesson overview (week 6, day 2 · the delivery pipeline: guarantees, priorities and
 * preferences). Accept: the Send API with a key named after the business event, expires_at and
 * collapse_key, one transaction with the outbox, 422 on a reused key, cheap 400s. Decide: preferences
 * checked at routing and again at the last mile (Meera's 19:59 opt-out), quiet hours per lane in the
 * user's IANA zone, batching (50 reactions: 5 pushes vs 2), pinned templates. Move: three lanes with
 * their own topics, workers and quota, carried into APNs/FCM priority and a 120 s OTP SMS validity,
 * inbox first, the status of a channel task. Guarantee: claim-send-record at-least-once, classified
 * retries cut at expires_at, the fraud-alert escalation saga, and Little's law for the 20:00 peak.
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
  lanes: nd(3, 0, "Lane topics", "Lanes"),
  dev: nd(0, 1, "User", "User", 2),
  prov: nd(1, 1, "Providers", "Provider"),
  wk: nd(2, 1, "Workers"),
  router: nd(3, 1, "Router"),
  dlq: nd(1, 2, "DLQ"),
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
  ["router", "inbox", 6, 0],
  ["wk", "prov"],
  ["prov", "dev"],
  ["wk", "dlq", 6, 0],
];

const F: Record<string, Fr[]> = {
  accept: [
    {
      k: ["the Send API · what a request carries", "the request"],
      on: { svc: 1, api: "lit" },
      sub: { svc: "payments", api: ["validate", "validate"] },
      fl: [["svc", "api"]],
      chips: [
        ["key: payments:pay_8812:received", "key: the business event"],
        ["expires_at: when it's worthless", "expires_at"],
        ["collapse_key: newest wins", "collapse_key"],
        ["send_at: null means now", "send_at"],
      ],
      ctn: ["lit", "warn", "sky", "sky"],
      note: ["the key names the business event, so every retry from any pod carries it", "every retry carries the same key"],
    },
    {
      k: ["one transaction, then 202", "outbox, then 202"],
      on: { api: "lit", ob: "lit", lanes: 1 },
      sub: { ob: ["same commit", "same commit"] },
      fl: [
        ["api", "ob"],
        ["ob", "lanes"],
      ],
      chips: [
        ["notification + key + outbox row", "one transaction"],
        ["same key: the original 202", "retry: same 202"],
        ["same key, new body: 422", "new body: 422"],
        ["the relay may publish twice", "relay: maybe twice"],
      ],
      ctn: ["lit", "ok", "bad", "warn"],
    },
    {
      k: ["validate cheap, decide later", "validation"],
      on: { api: "lit" },
      chips: [
        ["unknown template: 400", "bad template: 400"],
        ["missing variables: 400", "missing vars: 400"],
        ["expires_at already past: 400", "expired: 400"],
        ["preferences, quiet hours: later", "prefs: later"],
      ],
      ctn: ["bad", "bad", "bad", "sky"],
      note: ["the API says accepted; the router decides what happens next", "the router decides the rest"],
    },
  ],
  decide: [
    {
      k: ["check late, then check again", "check twice"],
      on: { lanes: 1, router: "lit", pref: "lit", wk: "lit" },
      sub: { pref: ["cached", "cached"], wk: ["re-checks", "re-checks"] },
      fl: [
        ["router", "pref"],
        ["router", "wk"],
      ],
      cols: 1,
      chips: [
        ["19:55 · the router sees marketing on", "19:55 · router: on"],
        ["19:59:30 · Meera opts out; cache invalidated", "19:59:30 · she opts out"],
        ["20:03 · the worker re-checks: suppressed", "20:03 · suppressed"],
      ],
      ctn: ["sky", "warn", "ok"],
    },
    {
      k: ["quiet hours, in the user's zone", "quiet hours"],
      on: { router: "lit", pref: 1, inbox: "ok" },
      sub: { pref: ["IANA zone", "IANA zone"] },
      fl: [
        ["router", "pref"],
        ["router", "inbox", "ok"],
      ],
      chips: [
        ["critical · ignores them", "critical: ignores"],
        ["payments · inbox now, push held", "payments: push held"],
        ["social, reminders · 1 batched push", "social: batched"],
        ["bulk · held, then spread out", "bulk: held"],
      ],
      ctn: ["bad", "lit", "sky", "warn"],
      note: ["held pushes leave between 08:00 and 08:20, not in one second", "held pushes: 08:00–08:20"],
    },
    {
      k: ["batch before you send", "batching"],
      on: { router: "lit", wk: 1, prov: 1, dev: "lit" },
      sub: { router: ["batches per user", "batches"] },
      fl: [
        ["router", "wk"],
        ["wk", "prov"],
        ["prov", "dev"],
      ],
      figs: [
        ["50", ["reactions in 4 min", "reactions"]],
        ["5", ["pushes: 10 items or 300 s", "10 or 300 s"], "warn"],
        ["2", ["first at once, then 1", "first at once"], "ok"],
      ],
      note: ['ship "first at once, then one summary" for social', "ship first at once, then 1"],
    },
    {
      k: ["templates, pinned", "templates"],
      on: { wk: "lit" },
      sub: { wk: ["renders", "renders"] },
      chips: [
        ["(name, channel, locale, version)", "four-part key"],
        ["version pinned at accept", "version pinned"],
        ["es-MX → es → en-US", "locale fallback"],
        ["no secrets on lock screens", "no secrets"],
      ],
      ctn: ["lit", "ok", "sky", "warn"],
    },
  ],
  move: [
    {
      k: ["three lanes", "three lanes"],
      on: { lanes: "lit", router: 1 },
      sub: { lanes: ["own topic each", "own topics"] },
      fl: [["lanes", "router"]],
      cols: 1,
      chips: [
        ["notifications.critical · OTPs, fraud · < 1 s, never shed", "critical · < 1 s"],
        ["notifications.transactional · payments < 2 s; social", "transactional · < 2 s"],
        ["notifications.bulk · marketing, digests · minutes", "bulk · minutes"],
      ],
      ctn: ["bad", "lit", "warn"],
      note: ["each with its own topic, consumer group, workers, retry topics and quota", "own workers and quota"],
    },
    {
      k: ["lanes reach the provider", "to the provider"],
      on: { wk: "lit", prov: "lit" },
      sub: { prov: ["APNs, FCM, SMS", "APNs, FCM"] },
      fl: [["wk", "prov"]],
      chips: [
        ["apns-priority 10, bulk 5", "APNs 10, bulk 5"],
        ["FCM high: user-facing only", "FCM high: careful"],
        ["an OTP code: valid 5 min", "code: 5 min"],
        ["its SMS validity: 120 s", "SMS validity: 120 s"],
      ],
      ctn: ["lit", "warn", "sky", "ok"],
      note: ["a late OTP is worse than a failed one", "late is worse than failed"],
    },
    {
      k: ["inbox first, then anyone is told", "inbox first"],
      kt: "ok",
      on: { router: 1, inbox: "ok", wk: 1, prov: 1, dev: 1 },
      sub: { inbox: ["seq per user", "seq"] },
      fl: [
        ["router", "inbox", "ok"],
        ["router", "wk"],
        ["wk", "prov"],
      ],
      figs: [
        ["1184", ["seq written first", "written first"], "ok"],
        ["1", ["kept offline by APNs", "APNs keeps"]],
        ["100", ["on FCM, then all go", "FCM keeps"]],
      ],
      note: ["the push is a doorbell; the inbox is the mailbox", "push is a doorbell"],
    },
    {
      k: ["sent is not delivered", "status"],
      on: { ob: 1, router: 1, wk: 1, prov: "lit", dlq: "bad" },
      chips: [
        ["QUEUED · outbox published", "QUEUED"],
        ["SUPPRESSED · pref, cap, quiet", "SUPPRESSED"],
        ["SENT · provider accepted", "SENT · accepted"],
        ["EXPIRED · expires_at passed", "EXPIRED"],
        ["DELIVERED · needs a receipt", "DELIVERED · receipt"],
        ["FAILED · to the DLQ, redrive", "FAILED · DLQ"],
      ],
      ctn: ["sky", "warn", "lit", "bad", "ok", "bad"],
    },
  ],
  guarantee: [
    {
      k: ["claim, send, record", "at-least-once"],
      on: { wk: "lit", prov: "lit", dev: 1 },
      sub: { wk: ["n_77:push:dev_2", "claims"] },
      fl: [
        ["wk", "prov"],
        ["prov", "dev"],
      ],
      chips: [
        ["claim the task key", "claim"],
        ["send: the unrecoverable step", "send"],
        ["record done, kept 7 days", "record done"],
        ["crash: claim expires in 30 s", "crash: sent again"],
      ],
      ctn: ["sky", "lit", "ok", "warn"],
      note: ["the same apns-collapse-id makes the rare second push replace the first", "a collapse id hides it"],
    },
    {
      k: ["classify, back off, stop at expiry", "retries"],
      kt: "warn",
      on: { wk: "warn", prov: 1, dlq: "bad" },
      sub: { dlq: ["per channel", "per channel"] },
      fl: [
        ["wk", "prov", "warn"],
        ["wk", "dlq", "bad"],
      ],
      chips: [
        ["APNs 410: delete token, fall back", "410: fall back"],
        ["FCM 429: retry-after, else 60 s", "429: retry-after"],
        ["5xx: full jitter, cut at expiry", "5xx: backoff"],
        ["delay topics, not sleeping workers", "delay topics"],
      ],
      ctn: ["bad", "warn", "warn", "sky"],
    },
    {
      k: ["a fraud alert's escalation saga", "escalation saga"],
      on: { router: 1, inbox: "ok", wk: "lit", prov: "lit", dev: "lit" },
      fl: [
        ["router", "inbox", "ok"],
        ["router", "wk"],
        ["wk", "prov"],
        ["prov", "dev"],
      ],
      chips: [
        ["inbox and push now", "push now"],
        ["unread after 2 min: SMS", "2 min: SMS"],
        ["10 more minutes: email", "+10 min: email"],
        ["24 h: the fraud team", "24 h: fraud team"],
      ],
      ctn: ["lit", "warn", "sky", "bad"],
      note: ["forward-only, on durable timers; a read on any device cancels the rest", "a read cancels the rest"],
    },
    {
      k: ["sizing 20:00 with Little's law", "the 20:00 peak"],
      on: { lanes: "lit", wk: "lit", prov: 1 },
      fl: [
        ["lanes", "router"],
        ["router", "wk"],
        ["wk", "prov"],
      ],
      figs: [
        ["15", ["OTP SMS workers", "SMS workers"], "ok"],
        ["~23", ["to survive a zone", "lose a zone"]],
        ["~22 min", ["8M FCM at 6,000/s", "campaign drain"], "warn"],
      ],
      note: ["1,500 OTPs/s × 1 s = 1,500 in flight; the campaign is quota-bound", "the campaign is quota-bound"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "accept",
    label: "Accept",
    steps: [
      {
        caption:
          "The payments service calls the Send API. The idempotency key names the business event, payments:pay_8812:received, so every retry carries it; expires_at says when the notification becomes worthless, and collapse_key that only the newest matters.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The key is stored with a unique constraint in the same transaction as the notification and its outbox row. A retry gets the original 202 and id; a key reused with a different request gets 422. The relay may publish twice, so everything downstream dedups.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "The API rejects with 400 what can never succeed: an unknown template, missing variables, an expires_at already past, a closed account. It doesn't check preferences or quiet hours, which can change before the send.",
        tween: 1400,
      },
    ],
  },
  {
    id: "decide",
    label: "Decide",
    steps: [
      {
        caption:
          "Preferences are a hierarchy, and OTPs and security alerts are mandatory. The router checks them, and the channel worker checks again just before the provider call, so Meera's 19:59:30 opt-out marks her 20:03 push suppressed.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Quiet hours live in the user's IANA zone. Critical ignores them; payments go to the inbox now with the push held or sent silently; social and reminders get one batched push at the window's end; bulk is held, then spread out.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "Kabir's split gets 50 reactions in four minutes. Flushing at 10 items or 300 s sends 5 pushes, the first after ~43 s; sending the first at once and batching the rest for 300 s sends 2, the first instantly.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "Templates are keyed by name, channel, locale and version. The version is pinned at accept time so a retry hours later renders the same words, locales fall back es-MX → es → en-US, and lock screens never show secrets.",
        tween: 1400,
      },
    ],
  },
  {
    id: "move",
    label: "Lanes & inbox",
    steps: [
      {
        caption:
          "Three lanes: critical (OTPs, fraud, new logins: under 1 s, never shed), transactional (payments under 2 s; social and reminders slower) and bulk (marketing and digests), each with its own topic, consumer group, workers, retry topics and provider quota.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The lane reaches the provider: apns-priority 10 for critical and transactional, 5 for bulk; FCM high priority only for user-facing messages. An OTP code is valid 5 minutes, but its SMS carries a 120-second validity period.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The in-app worker appends the item to the user's inbox with the next sequence number before anyone is told. Push stores almost nothing (APNs keeps one per app offline, FCM 100, then discards them all), so the inbox is the record.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Each channel task has a status: QUEUED once the outbox is published, then ROUTING, then SUPPRESSED or SENDING. SENT only means the provider accepted it; DELIVERED needs a receipt; EXPIRED and FAILED (to the DLQ, redrivable) end it too.",
        tween: 1400,
      },
    ],
  },
  {
    id: "guarantee",
    label: "Guarantees",
    steps: [
      {
        caption:
          "Exactly-once isn't on offer through a provider, so critical and transactional are at-least-once: claim the task key, send, record done. A crash after APNs said 200 sends again once the 30 s claim expires; a shared collapse id hides it.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Retries are classified first: APNs 410 deletes the token and falls back, FCM 429 waits for retry-after (else 60 s), 5xx and timeouts back off with full jitter, cut at expires_at. Retries go to delay topics, final failures to a DLQ per channel.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A fraud alert is a forward-only saga on durable timers: inbox and push now, SMS if unread after 2 minutes, email after 10 more, the fraud team after 24 hours. A read on any device cancels what's left; OTPs skip the ladder.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "Little's law sizes 20:00: 1,500 OTP SMS a second × 1 s is 1,500 calls in flight, 15 workers at 100 each (~23 to lose a zone). The campaign's 8M FCM pushes at the 6,000/s left for bulk take ~22 minutes, whatever you add.",
        tween: 1400,
        loop: true,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
