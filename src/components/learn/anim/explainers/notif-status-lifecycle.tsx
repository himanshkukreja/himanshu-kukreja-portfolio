/**
 * The status of one channel task (week 6, day 2 · 7.3 status tracking): PENDING → QUEUED (outbox
 * published) → ROUTING (router picked it up) → SENDING (channel task created) → SENT (provider
 * accepted) → DELIVERED (provider or device receipt) → READ (opened in the app). ROUTING can end in
 * SUPPRESSED (a preference, cap or quiet-hours drop); SENDING in EXPIRED (expires_at passed) or
 * FAILED (retries exhausted, to the DLQ), which a redrive moves back to QUEUED; a bounce callback
 * moves SENT to BOUNCED.
 */
import { defineExplainer, lerp, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 340;
const BW = 132;
const BH = 40;
type S = "PENDING" | "QUEUED" | "ROUTING" | "SENDING" | "SUPPRESSED" | "EXPIRED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "BOUNCED";
const CX = [12, 156, 300, 444];
const RY = [20, 90, 160, 230];
const POS: Record<S, { x: number; y: number }> = {
  SUPPRESSED: { x: CX[2], y: RY[0] },
  EXPIRED: { x: CX[3], y: RY[0] },
  PENDING: { x: CX[0], y: RY[1] },
  QUEUED: { x: CX[1], y: RY[1] },
  ROUTING: { x: CX[2], y: RY[1] },
  SENDING: { x: CX[3], y: RY[1] },
  FAILED: { x: CX[1], y: RY[2] },
  BOUNCED: { x: CX[2], y: RY[2] },
  SENT: { x: CX[3], y: RY[2] },
  READ: { x: CX[2], y: RY[3] },
  DELIVERED: { x: CX[3], y: RY[3] },
};
const TONE: Record<S, Tone> = {
  PENDING: "sky",
  QUEUED: "sky",
  ROUTING: "sky",
  SENDING: "lit",
  SENT: "ok",
  DELIVERED: "ok",
  READ: "ok",
  SUPPRESSED: "warn",
  FAILED: "bad",
  BOUNCED: "bad",
  EXPIRED: "bad",
};
const c = (s: S) => ({ x: POS[s].x + BW / 2, y: POS[s].y + BH / 2 });

/** the drawn edges: [from, to, path through these points] */
const EDGES: [S, S, [number, number][]][] = [
  [
    "PENDING",
    "QUEUED",
    [
      [144, 110],
      [156, 110],
    ],
  ],
  [
    "QUEUED",
    "ROUTING",
    [
      [288, 110],
      [300, 110],
    ],
  ],
  [
    "ROUTING",
    "SENDING",
    [
      [432, 110],
      [444, 110],
    ],
  ],
  [
    "ROUTING",
    "SUPPRESSED",
    [
      [366, 90],
      [366, 60],
    ],
  ],
  [
    "SENDING",
    "EXPIRED",
    [
      [510, 90],
      [510, 60],
    ],
  ],
  [
    "SENDING",
    "SENT",
    [
      [510, 130],
      [510, 160],
    ],
  ],
  [
    "SENDING",
    "FAILED",
    [
      [462, 130],
      [462, 145],
      [240, 145],
      [240, 160],
    ],
  ],
  [
    "SENT",
    "BOUNCED",
    [
      [444, 180],
      [432, 180],
    ],
  ],
  [
    "SENT",
    "DELIVERED",
    [
      [510, 200],
      [510, 230],
    ],
  ],
  [
    "DELIVERED",
    "READ",
    [
      [444, 250],
      [432, 250],
    ],
  ],
  [
    "FAILED",
    "QUEUED",
    [
      [200, 160],
      [200, 130],
    ],
  ],
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

/** each step: the hops it makes, with the trigger for each; `from` starts a new task at that state */
type Hop = { to: S; why: string };
type Step = { from?: S; hops: Hop[] };
const PLAN: Record<string, Step[]> = {
  delivered: [
    {
      from: "PENDING",
      hops: [
        { to: "QUEUED", why: "outbox published" },
        { to: "ROUTING", why: "router picked it up" },
      ],
    },
    { hops: [{ to: "SENDING", why: "channel task created" }] },
    { hops: [{ to: "SENT", why: "provider accepted" }] },
    {
      hops: [
        { to: "DELIVERED", why: "provider or device receipt" },
        { to: "READ", why: "opened in the app" },
      ],
    },
  ],
  skipped: [
    { from: "ROUTING", hops: [{ to: "SUPPRESSED", why: "preference, cap or quiet-hours drop" }] },
    { from: "SENDING", hops: [{ to: "EXPIRED", why: "expires_at passed" }] },
  ],
  bounce: [{ from: "SENDING", hops: [{ to: "SENT", why: "provider accepted" }] }, { hops: [{ to: "BOUNCED", why: "bounce callback" }] }],
  retry: [
    { from: "SENDING", hops: [{ to: "FAILED", why: "retries exhausted, to the DLQ" }] },
    { hops: [{ to: "QUEUED", why: "redrive" }] },
    {
      hops: [
        { to: "ROUTING", why: "router picked it up" },
        { to: "SENDING", why: "channel task created" },
        { to: "SENT", why: "provider accepted" },
      ],
    },
  ],
};

function edgePts(a: S, b: S) {
  const e = EDGES.find(([f, to]) => f === a && to === b);
  const mid = e ? e[2].map(([x, y]) => ({ x, y })) : [];
  return [c(a), ...mid, c(b)];
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const plan = PLAN[variant] || PLAN.delivered;
  const st = plan[Math.min(step, plan.length - 1)];
  // where the task was at the start of this step, and what it has been through
  let cur: S = plan[0].from || "PENDING";
  let visited = new Set<S>([cur]);
  let walked = new Set<string>();
  for (let i = 0; i < Math.min(step, plan.length - 1); i++) {
    if (plan[i].from && i > 0) {
      cur = plan[i].from!;
      visited = new Set([cur]);
      walked = new Set();
    }
    for (const h of plan[i].hops) {
      walked.add(`${cur}-${h.to}`);
      cur = h.to;
      visited.add(cur);
    }
  }
  if (st.from && step > 0) {
    cur = st.from;
    visited = new Set([cur]);
    walked = new Set();
  }
  const hops = st.hops;
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
  const final = at === "READ" || at === "SUPPRESSED" || at === "EXPIRED" || at === "BOUNCED";
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
            <Txt x={POS[s].x + BW / 2} y={POS[s].y + 25} k={narrow ? "s" : "t"} tone={on ? TONE[s] : seen ? undefined : "mute"}>
              {s}
            </Txt>
          </g>
        );
      })}
      {tok && <Token x={tok.x} y={tok.y} s={10} tone="lit" />}
      {/* the trigger for the current hop */}
      <Txt x={24} y={298} k="t" anchor="start" tone="lit">
        {hop ? `${from} → ${hop.to}` : ""}
      </Txt>
      <Txt x={24} y={322} k="s" anchor="start">
        {hop ? `${hop.why}${final && p >= 1 ? " · final" : ""}` : ""}
      </Txt>
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
        { caption: "A channel task starts PENDING, becomes QUEUED once the outbox relay has published it, and ROUTING when the router picks it up.", tween: 2200 },
        { caption: "Preferences, caps and quiet hours pass, so the router creates the channel task: SENDING while the worker calls the provider.", tween: 1200 },
        { caption: "The provider accepts it: SENT. That means accepted, nothing more; FCM's HTTP v1 API has no per-message delivery callback.", tween: 1200 },
        {
          caption: "A receipt (an email delivery webhook, an SMS delivery report, or the app reporting the push) makes it DELIVERED; opening it in the app makes it READ. Webhooks are verified, and a transition only moves forward.",
          tween: 2200,
          ms: 3400,
        },
      ],
    },
    {
      id: "skipped",
      label: "Suppressed, expired",
      steps: [
        { caption: "Not every task is sent: a preference, frequency cap or quiet-hours check that fails ends ROUTING in SUPPRESSED, with the reason recorded.", tween: 1400 },
        { caption: "Another task waits too long: once its expires_at has passed, SENDING ends in EXPIRED instead of delivering something worthless.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "bounce",
      label: "Bounce",
      steps: [
        { caption: "An email is SENDING, and the provider accepts it: SENT.", tween: 1200 },
        { caption: "Later a bounce callback arrives: SENT → BOUNCED. Accepted was never delivered.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "retry",
      label: "Failed, redriven",
      steps: [
        { caption: "The retries run out: SENDING → FAILED, and the task goes to its channel's dead letter queue.", tween: 1400 },
        { caption: "A redrive moves FAILED back to QUEUED: it re-enters the pipeline, so it's deduped and re-checked for preferences and expiry.", tween: 1400 },
        { caption: "Through ROUTING and SENDING again; this time the provider accepts it: SENT.", tween: 2600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
