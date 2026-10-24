/**
 * The whole problem, interview problem bank 06 (design a notification system): requirements and the
 * estimate (10M transactional a day ≈ 116 a second, a 50M campaign ≈ 13,900 a second, provider limits);
 * the pipeline (notify API with idempotency and outbox, Kafka high/bulk topics, router, channel workers);
 * the deep dives (dedupe and retries, provider failover, isolating OTPs from campaigns); failure modes.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 380;
type Pt = { x: number; y: number };
type Nd = { x: number; y: number; w: number; h: number; label: string; nl?: string };
type St = { tone?: Tone; sub?: string; ns?: string; dim?: boolean };
type Row = { k: string; v: string; nv?: string; tone?: Tone; m?: number };
type Go = { r: string[]; a: number; b: number; tone?: Tone };
type Fr = { kick: string; kt?: Tone; on?: string[]; st?: Record<string, St>; rows?: Row[]; mx?: number; go?: Go[]; l: [string, string]; nl?: [string, string] };
type Sp = { c: string; f: Fr; tween?: number; ms?: number };

const N: Record<string, Nd> = {
  sv: { x: 16, y: 150, w: 82, h: 56, label: "Services", nl: "Apps" },
  api: { x: 114, y: 150, w: 90, h: 56, label: "API" },
  kf: { x: 220, y: 150, w: 78, h: 56, label: "Kafka" },
  ro: { x: 314, y: 150, w: 104, h: 56, label: "Router" },
  pf: { x: 314, y: 262, w: 104, h: 48, label: "Prefs" },
  wp: { x: 442, y: 52, w: 142, h: 56, label: "Push" },
  we: { x: 442, y: 150, w: 142, h: 56, label: "Email" },
  ws: { x: 442, y: 248, w: 142, h: 56, label: "SMS" },
};
const EDGES: [string, string, boolean?][] = [
  ["sv", "api"],
  ["api", "kf"],
  ["kf", "ro"],
  ["ro", "pf"],
  ["ro", "wp"],
  ["ro", "we"],
  ["ro", "ws"],
];
const IN = ["sv", "api", "kf"];
const ALLN = [...IN, "ro", "pf", "wp", "we", "ws"];
const PROV = { wp: { sub: "APNs · FCM", ns: "APNs/FCM" }, we: { sub: "SendGrid", ns: "SendGrid" }, ws: { sub: "gateway", ns: "gateway" } };

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "One API for every service to reach a user by push, email or SMS, with templates, per-category preferences, quiet hours and campaigns.",
        f: {
          kick: "the brief",
          rows: [
            { k: "send", v: "user, template, data, priority, key", nv: "user + template" },
            { k: "channels", v: "push (iOS, Android), email, SMS", nv: "push, email, SMS" },
            { k: "preferences", v: "per category and channel · quiet hours", nv: "per category" },
            { k: "campaigns", v: "a segment, now or scheduled", nv: "segments" },
            { k: "status", v: "queued, sent, delivered, failed", nv: "per channel" },
          ],
          l: ["security messages always go out", "the in-app inbox is out of scope"],
          nl: ["security always sent", "no in-app inbox"],
        },
      },
      {
        c: "OTPs reach the provider within seconds, even mid-campaign. No duplicates, no silent losses, and no channel stopped by one provider's outage.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "urgent", v: "OTP to provider in a few seconds", nv: "OTP in seconds", tone: "lit" },
            { k: "no duplicates", v: "retries must not send SMS twice", nv: "no double SMS", tone: "ok" },
            { k: "no losses", v: "delivered, or reported failed", nv: "never dropped" },
            { k: "resilient", v: "survive a provider outage", nv: "provider outages" },
          ],
          l: ["users notice duplicates, and SMS costs money", "bursts of tens of thousands a second"],
          nl: ["duplicates cost money", "bursts: 10,000s a second"],
        },
      },
      {
        c: "Transactional traffic averages about 116 a second. A 50M-user campaign is about 13,900 a second for an hour, over 100 times more.",
        f: {
          kick: "estimate",
          mx: 13900,
          rows: [
            { k: "transactional", v: "10M a day ≈ 116/s", nv: "≈ 116/s", m: 116 },
            { k: "campaign", v: "50M in 1 hour ≈ 13,900/s", nv: "≈ 13,900/s", m: 13900, tone: "lit" },
            { k: "sms limit", v: "1,000/s → 2.5M SMS ≈ 42 min", nv: "2.5M ≈ 42 min", tone: "warn" },
            { k: "log", v: "~60 GB/day · ~5.4 TB for 90 days", nv: "~5.4 TB / 90 d" },
          ],
          l: ["the spike, not the average, shapes the design", "bulk and urgent traffic share providers"],
          nl: ["the spike shapes it", "bulk and urgent share"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "A service calls the API with an idempotency key. The API stores the notification and an outbox row in one transaction, then answers 202.",
        f: {
          kick: "accept",
          on: IN,
          st: { api: { tone: "lit", sub: "202 + id", ns: "202" }, kf: { sub: "outbox", ns: "outbox" } },
          go: [{ r: ["sv", "api", "kf"], a: 0.05, b: 0.95, tone: "lit" }],
          l: ["202: stored and will be processed, not delivered", "never stored without queued, or queued without stored"],
          nl: ["202 = stored, not sent", "outbox: store + queue"],
        },
      },
      {
        c: "The router reads preferences, quiet hours and frequency caps, renders the template, and turns one notification into one job per channel.",
        f: {
          kick: "route",
          on: [...IN, "ro", "pf"],
          st: { ro: { tone: "lit", sub: "decide", ns: "decide" }, pf: { tone: "sky", sub: "", ns: "" }, kf: { sub: "high/bulk", ns: "lanes" } },
          go: [{ r: ["kf", "ro", "pf"], a: 0.05, b: 0.95, tone: "sky" }],
          l: ["opt-outs checked at routing time", "security messages ignore opt-outs and quiet hours"],
          nl: ["opt-outs at routing", "security ignores them"],
        },
      },
      {
        c: "Each channel has its own worker pool calling APNs or FCM, an email provider or an SMS gateway, with retries and rate limits.",
        f: {
          kick: "deliver",
          on: ALLN,
          st: { ...PROV, ro: { sub: "jobs", ns: "jobs" } },
          go: [{ r: ["ro", "wp"], a: 0.1, b: 0.8, tone: "lit" }, { r: ["ro", "we"], a: 0.2, b: 0.9, tone: "lit" }, { r: ["ro", "ws"], a: 0.3, b: 0.98, tone: "lit" }],
          l: ["one pool per channel: separate failures", "results recorded as status per channel"],
          nl: ["a pool per channel", "status per channel"],
        },
      },
      {
        c: "A campaign scheduler expands a segment into batches at a controlled rate onto the bulk topic, never dumping 50 million jobs at once.",
        f: {
          kick: "campaigns",
          on: ALLN,
          st: { ...PROV, kf: { tone: "warn", sub: "bulk", ns: "bulk" }, sv: { tone: "sky", sub: "scheduler", ns: "sched" } },
          go: [0, 0.2, 0.4].map((a) => ({ r: ["sv", "api", "kf"], a, b: a + 0.5, tone: "warn" as Tone })),
          l: ["release at the rate providers can take", "pause the scheduler first when things lag"],
          nl: ["release at provider rate", "pause campaigns first"],
        },
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      {
        c: "Exactly once is impossible with providers. Use at-least-once plus dedupe: an idempotency key at the API, a per-channel key at the worker.",
        f: {
          kick: "1 · make duplicates harmless",
          rows: [
            { k: "api", v: "same Idempotency-Key → same id", nv: "same key, same id", tone: "ok" },
            { k: "worker", v: "SET NX (notification, channel)", nv: "SET NX dedupe", tone: "ok" },
            { k: "retry", v: "timeouts, 5xx, 429: backoff + jitter", nv: "backoff + jitter" },
            { k: "don't retry", v: "bad number, invalid push token", nv: "permanent errors", tone: "bad" },
            { k: "give up", v: "dead-letter queue, status failed", nv: "DLQ → failed" },
          ],
          l: ["the window left: crash between call and status", "invalid tokens are deactivated"],
          nl: ["tiny window remains", "bad tokens deactivated"],
        },
      },
      {
        c: "When an SMS gateway fails, a circuit breaker stops the pile-up of timeouts and the workers fail over to a backup provider.",
        f: {
          kick: "1 · provider outage",
          kt: "warn",
          on: ALLN,
          st: { ...PROV, ws: { tone: "warn", sub: "breaker → backup", ns: "→ backup" }, wp: { sub: "wait + retry", ns: "retry" } },
          go: [{ r: ["ro", "ws"], a: 0.1, b: 0.9, tone: "warn" }],
          l: ["SMS and email: keep a second provider", "push has no alternative: APNs is the only way to an iPhone"],
          nl: ["SMS/email: 2 providers", "push: wait and retry"],
        },
      },
      {
        c: "An OTP a minute into a 50M campaign travels its own topic, consumers and workers, so the bulk backlog never sits in front of it.",
        f: {
          kick: "2 · the otp during a campaign",
          kt: "ok",
          on: ALLN,
          st: { ...PROV, kf: { tone: "ok", sub: "high", ns: "high" }, ws: { tone: "ok", sub: "OTP lane", ns: "OTP" } },
          go: [{ r: ["sv", "api", "kf", "ro", "ws"], a: 0.05, b: 0.95, tone: "ok" }, ...[0, 0.25, 0.5].map((a) => ({ r: ["kf", "ro", "wp"], a, b: a + 0.45, tone: "warn" as Tone }))],
          l: ["separate partitions, consumer groups and pools", "alert on the age of the oldest high message"],
          nl: ["separate lanes end to end", "alert: oldest high msg"],
        },
      },
      {
        c: "Reserve provider capacity for urgent traffic, say 30% of SMS, and protect users: frequency caps, quiet hours and collapsing bursts.",
        f: {
          kick: "2 · budgets and caps",
          rows: [
            { k: "reserve", v: "30% of SMS throughput for high", nv: "30% for high", tone: "lit" },
            { k: "bulk", v: "700 SMS/s → 2.5M in about an hour", nv: "≈ 1 hour" },
            { k: "frequency", v: "≤ 3 marketing pushes a day", nv: "≤ 3 a day", tone: "ok" },
            { k: "quiet hours", v: "2 AM → delivered at 8 AM", nv: "2 AM → 8 AM" },
            { k: "collapse", v: "5 comments in a minute → 1", nv: "5 → 1" },
          ],
          l: ["token buckets split each provider's limit", "security messages skip quiet hours"],
          nl: ["token buckets split limits", "security skips quiet hours"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Trade-offs",
    steps: [
      {
        c: "If Kafka consumers or the router fall behind, the API still accepts and stores. Shed bulk work first by pausing the campaign scheduler.",
        f: {
          kick: "falling behind",
          kt: "warn",
          on: ALLN,
          st: { ...PROV, ro: { tone: "warn", sub: "lagging", ns: "lag" }, api: { tone: "ok", sub: "still 202", ns: "202" } },
          go: [{ r: ["sv", "api", "kf"], a: 0.1, b: 0.9, tone: "ok" }],
          l: ["stored with an outbox: delivery resumes later", "never shed the high topic first"],
          nl: ["stored: resumes later", "shed bulk first"],
        },
      },
      {
        c: "Related messages can arrive out of order. Partition by user ID and add a sequence so the app drops an older status that arrives late.",
        f: {
          kick: "ordering and tokens",
          rows: [
            { k: "order", v: "partition by user · add a sequence", nv: "by user + seq" },
            { k: "late status", v: "\"delivered\" before \"shipped\": drop old", nv: "drop the older" },
            { k: "tokens", v: "remove invalid, re-register on start", nv: "refresh tokens" },
            { k: "opt-out", v: "checked at routing, not at the API", nv: "check at routing" },
          ],
          l: ["queued messages respect a fresh opt-out", "reinstalls and new phones churn push tokens"],
          nl: ["opt-outs apply in flight", "tokens churn"],
        },
      },
      {
        c: "SMS is the expensive channel. Prefer push when the user has a working token, keep SMS for OTPs and fallbacks, and alert on hourly spend.",
        f: {
          kick: "cost",
          on: ALLN,
          st: { ...PROV, wp: { tone: "ok", sub: "preferred", ns: "first" }, ws: { tone: "warn", sub: "OTP, fallback", ns: "OTP" } },
          l: ["a duplicate SMS is a visible bug and a bill", "alert on SMS spend per hour"],
          nl: ["duplicate SMS = a bill", "alert on SMS spend"],
        },
      },
    ],
  },
];

const ALL = Object.keys(N);
/** orthogonal wire from box a to box b: an elbow when they sit side by side, straight when stacked */
function pts(a: string, b: string): Pt[] {
  const p = N[a];
  const q = N[b];
  const pc = p.y + p.h / 2;
  const qc = q.y + q.h / 2;
  if (q.x >= p.x + p.w) {
    const m = Math.round((p.x + p.w + q.x) / 2);
    return [{ x: p.x + p.w, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x, y: qc }];
  }
  if (q.x + q.w <= p.x) {
    const m = Math.round((q.x + q.w + p.x) / 2);
    return [{ x: p.x, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x + q.w, y: qc }];
  }
  const x = Math.round((Math.max(p.x, q.x) + Math.min(p.x + p.w, q.x + q.w)) / 2);
  return q.y >= p.y + p.h ? [{ x, y: p.y + p.h }, { x, y: q.y }] : [{ x, y: p.y }, { x, y: q.y + q.h }];
}
const path = (ps: Pt[]) => "M" + ps.map((p) => `${p.x} ${p.y}`).join("L");
function walk(ps: Pt[], k: number): Pt {
  const lens = ps.slice(1).map((q, i) => Math.abs(q.x - ps[i].x) + Math.abs(q.y - ps[i].y));
  let d = k * lens.reduce((s, v) => s + v, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const u = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: lerp(ps[i].x, ps[i + 1].x, u), y: lerp(ps[i].y, ps[i + 1].y, u) };
    }
    d -= lens[i];
  }
  return ps[ps.length - 1];
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const v = V.find((x) => x.id === variant) || V[0];
  const i = Math.min(step, v.steps.length - 1);
  const f = v.steps[i].f;
  const before = i > 0 ? v.steps[i - 1].f.on || [] : [];
  const on = f.on || [];
  const l = narrow && f.nl ? f.nl : f.l;
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={f.kt}>
        {f.kick}
      </Txt>
      {f.rows ? (
        <g>
          <rect className="ax-box lit" x={16} y={44} width={W - 32} height={Math.min(270, 24 + f.rows.length * 50)} />
          {f.rows.map((r, j) => {
            const y = 76 + j * 50;
            return (
              <g key={r.k} opacity={ease(seg(t, j * 0.12, j * 0.12 + 0.4))}>
                <Txt x={32} y={y} k="k" anchor="start" tone="mute">
                  {r.k}
                </Txt>
                <Txt x={32} y={y + 24} anchor="start" tone={r.tone}>
                  {narrow ? r.nv || r.v : r.v}
                </Txt>
                {r.m !== undefined && <Meter x={420} y={y + 12} w={148} h={14} value={r.m * ease(seg(t, 0.2, 0.9))} max={f.mx || r.m} tone={r.tone || "sky"} />}
              </g>
            );
          })}
        </g>
      ) : (
        <g>
          {EDGES.filter(([a, b]) => on.includes(a) && on.includes(b)).map(([a, b, dash]) => (
            <Wire key={a + b} d={path(pts(a, b))} arrow dash={dash} />
          ))}
          {ALL.filter((k) => on.includes(k)).map((k) => {
            const n = N[k];
            const s = f.st?.[k] || {};
            const sub = narrow ? (s.ns ?? s.sub) : s.sub;
            return (
              <g key={k} opacity={before.includes(k) ? 1 : ease(seg(t, 0, 0.4))}>
                <Box x={n.x} y={n.y} w={n.w} h={n.h} label={narrow ? n.nl || n.label : n.label} sub={sub || undefined} tone={s.tone} dim={s.dim} />
              </g>
            );
          })}
          {f.go?.map((g, j) => {
            const q = seg(t, g.a, g.b);
            if (q <= 0 || q >= 1) return null;
            const p = walk(g.r.slice(1).flatMap((b, n) => pts(g.r[n], b)), ease(q));
            return <Token key={j} x={p.x} y={p.y} tone={g.tone} />;
          })}
        </g>
      )}
      <Txt x={16} y={H - 34} k="s" anchor="start" tone={f.kt}>
        {l[0]}
      </Txt>
      <Txt x={16} y={H - 10} k="s" anchor="start">
        {l[1]}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.steps.map((s) => ({ caption: s.c, tween: s.tween ?? 1400, ms: s.ms ?? 3600 })) })),
  Scene,
});
