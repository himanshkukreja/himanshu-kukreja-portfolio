/**
 * Notification status state machine (week 6, day 2 · 7.1 / 7.2): one notification walks the
 * valid transitions. Delivered: PENDING → QUEUED (outbox) → ROUTING (router) → SENDING (channel
 * topic) → SENT (provider accepted) → DELIVERED (callback) → READ. Bounce: SENT → BOUNCED, which
 * has no way out. Retry: SENDING → FAILED → QUEUED and round again.
 */
import { defineExplainer, lerp, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const BW = 120;
const BH = 40;
type S = "PENDING" | "QUEUED" | "ROUTING" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "BOUNCED";
const POS: Record<S, { x: number; y: number }> = {
  PENDING: { x: 24, y: 30 },
  QUEUED: { x: 168, y: 30 },
  ROUTING: { x: 312, y: 30 },
  SENDING: { x: 456, y: 30 },
  FAILED: { x: 168, y: 140 },
  BOUNCED: { x: 312, y: 140 },
  SENT: { x: 456, y: 140 },
  READ: { x: 312, y: 250 },
  DELIVERED: { x: 456, y: 250 },
};
const TONE: Record<S, Tone> = { PENDING: "sky", QUEUED: "sky", ROUTING: "sky", SENDING: "lit", SENT: "ok", DELIVERED: "ok", READ: "ok", FAILED: "bad", BOUNCED: "bad" };
const c = (s: S) => ({ x: POS[s].x + BW / 2, y: POS[s].y + BH / 2 });

/** the drawn edges: [from, to, path through these points] */
const EDGES: [S, S, [number, number][]][] = [
  ["PENDING", "QUEUED", [[144, 50], [168, 50]]],
  ["QUEUED", "ROUTING", [[288, 50], [312, 50]]],
  ["ROUTING", "SENDING", [[432, 50], [456, 50]]],
  ["SENDING", "SENT", [[516, 70], [516, 140]]],
  ["SENDING", "BOUNCED", [[476, 70], [404, 140]]],
  ["SENDING", "FAILED", [[466, 70], [466, 104], [258, 104], [258, 140]]],
  ["SENT", "BOUNCED", [[456, 160], [432, 160]]],
  ["SENT", "DELIVERED", [[516, 180], [516, 250]]],
  ["SENT", "FAILED", [[466, 180], [466, 214], [228, 214], [228, 180]]],
  ["DELIVERED", "READ", [[456, 270], [432, 270]]],
  ["FAILED", "QUEUED", [[198, 140], [198, 70]]],
];
const pathD = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");

/** a point along a polyline, p 0 → 1 by length */
function along(pts: { x: number; y: number }[], p: number) {
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  let d = lens.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, p));
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, f), y: lerp(pts[i].y, pts[i + 1].y, f) };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

/** each step: the states it walks through, with the trigger shown for that hop */
type Hop = { to: S; why: string };
const PLAN: Record<string, { start: S; steps: Hop[][] }> = {
  delivered: {
    start: "PENDING",
    steps: [
      [
        { to: "QUEUED", why: "written to outbox" },
        { to: "ROUTING", why: "consumed by router" },
      ],
      [{ to: "SENDING", why: "published to channel topic" }],
      [{ to: "SENT", why: "provider accepted" }],
      [
        { to: "DELIVERED", why: "provider callback" },
        { to: "READ", why: "user interaction" },
      ],
    ],
  },
  bounce: {
    start: "SENDING",
    steps: [[{ to: "SENT", why: "SendGrid accepted" }], [{ to: "BOUNCED", why: "bounce webhook" }]],
  },
  retry: {
    start: "SENDING",
    steps: [
      [{ to: "FAILED", why: "provider call failed" }],
      [{ to: "QUEUED", why: "retry" }],
      [
        { to: "ROUTING", why: "consumed by router" },
        { to: "SENDING", why: "published to channel topic" },
        { to: "SENT", why: "provider accepted" },
      ],
    ],
  },
};

function edgePts(a: S, b: S) {
  const e = EDGES.find(([f, to]) => f === a && to === b);
  const mid = e ? e[2].map(([x, y]) => ({ x, y })) : [];
  return [c(a), ...mid, c(b)];
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const plan = PLAN[variant] || PLAN.delivered;
  // where the notification was at the start of this step, and which hops it makes now
  let cur: S = plan.start;
  const visited = new Set<S>([cur]);
  const walked = new Set<string>();
  for (let i = 0; i < step; i++)
    for (const h of plan.steps[i] || []) {
      walked.add(`${cur}-${h.to}`);
      cur = h.to;
      visited.add(cur);
    }
  const hops = plan.steps[step] || [];
  const n = hops.length;
  const pos = Math.min(n, t * n); // hops done (fractional)
  const k = Math.min(n - 1, Math.floor(pos));
  const from = k === 0 ? cur : hops[k - 1].to;
  const hop = hops[k];
  const p = ease2(pos - k);
  const at = p >= 1 ? hop.to : from;
  for (let i = 0; i < k; i++) {
    walked.add(`${i === 0 ? cur : hops[i - 1].to}-${hops[i].to}`);
    visited.add(hops[i].to);
  }
  if (p >= 1) visited.add(hop.to);
  const tok = hop && p > 0 && p < 1 ? along(edgePts(from, hop.to), p) : null;
  const why = hop ? hop.why : "";
  const final = at === "BOUNCED" || at === "READ";
  return (
    <g>
      {EDGES.map(([a, b, pts]) => {
        const live = hop && a === from && b === hop.to;
        const done = walked.has(`${a}-${b}`) && !live;
        return <Wire key={`${a}-${b}`} d={pathD(pts)} arrow tone={live ? "lit" : done ? undefined : "mute"} opacity={live || done ? 1 : 0.55} />;
      })}
      {(Object.keys(POS) as S[]).map((s) => {
        const on = s === at;
        const seen = visited.has(s);
        return (
          <g key={s} opacity={on || seen ? 1 : 0.42}>
            <rect x={POS[s].x} y={POS[s].y} width={BW} height={BH} className={`ax-box${on ? ` ${TONE[s]}` : ""}`} />
            <Txt x={POS[s].x + BW / 2} y={POS[s].y + 25} k="t" tone={on ? TONE[s] : seen ? undefined : "mute"}>
              {s}
            </Txt>
          </g>
        );
      })}
      {tok && <Token x={tok.x} y={tok.y} s={10} tone="lit" />}
      {/* the trigger for the current hop */}
      <Txt x={24} y={262} k="k" anchor="start" tone="mute">
        transition
      </Txt>
      <Txt x={24} y={286} k="s" anchor="start" tone="lit">
        {hop ? `${narrow ? "" : `${from} → `}${hop.to}` : ""}
      </Txt>
      <Txt x={24} y={308} k="s" anchor="start">
        {why}
      </Txt>
      {final && (
        <Txt x={POS[at].x + BW / 2} y={POS[at].y + BH + 22} k="s" tone={at === "BOUNCED" ? "bad" : "ok"}>
          {at === "BOUNCED" ? "no way out" : "done"}
        </Txt>
      )}
    </g>
  );
}

/** soft start and stop for each hop (plain ease would be too slow at the ends for chained hops) */
const ease2 = (x: number) => {
  const v = Math.min(1, Math.max(0, x * 1.15));
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
};

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "delivered",
      label: "Delivered",
      steps: [
        { caption: "PENDING becomes QUEUED when written to the outbox, then ROUTING once the router consumes it.", tween: 2200 },
        { caption: "Published to its channel topic, it is SENDING while the worker calls the provider.", tween: 1200 },
        { caption: "The provider accepts it: SENT. Accepted, not yet confirmed on the device or inbox.", tween: 1200 },
        { caption: "A provider callback moves it to DELIVERED; a user interaction later makes it READ.", tween: 2200, ms: 3400 },
      ],
    },
    {
      id: "bounce",
      label: "Bounce",
      steps: [
        { caption: "An email is SENDING, and SendGrid accepts it: SENT.", tween: 1200 },
        { caption: "Then a bounce webhook arrives: SENT → BOUNCED. BOUNCED has no valid next state: it's final.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "retry",
      label: "Retry",
      steps: [
        { caption: "The provider call fails: SENDING → FAILED.", tween: 1400 },
        { caption: "FAILED has exactly one valid next state, QUEUED: the retry.", tween: 1400 },
        { caption: "It goes through ROUTING and SENDING again; this time the provider accepts it: SENT.", tween: 2600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
