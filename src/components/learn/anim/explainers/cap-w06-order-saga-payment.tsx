/**
 * Week 6 capstone (food delivery · Deep Dive 4, the order saga, with Deep Dive 2's payment keys):
 * validate, authorize (key order:{id}:auth, a hold), notify the restaurant, await confirmation,
 * assign a driver, capture at pickup. A rejection after authorization compensates in reverse: void
 * the hold (key void:{order_id}, retried until done), cancel, notify. A failed capture after pickup
 * is not compensated: it is flagged for manual review.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 322;
const BW = 170;
const BH = 54;
const XS = [20, 215, 410];
const YS = [44, 134];
const pos = (i: number) => ({ x: XS[i % 3], y: YS[Math.floor(i / 3)] });
const center = (i: number) => ({ x: pos(i).x + BW / 2, y: pos(i).y + BH / 2 });

type P = { x: number; y: number };
const ELBOW = YS[1] - 18;
/** the token's route: along the top row, down and back left, along the bottom row */
const SNAKE: P[] = [center(0), center(1), center(2), { x: center(2).x, y: ELBOW }, { x: center(3).x, y: ELBOW }, center(3), center(4), center(5)];
const PI = [0, 1, 2, 5, 6, 7];
function along(pts: P[], q: number): P {
  const lens = pts.slice(1).map((b, i) => Math.abs(b.x - pts[i].x) + Math.abs(b.y - pts[i].y));
  let d = q * lens.reduce((x, y) => x + y, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k) };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

type St = { sub: string; tone?: Tone };
type Frame = { steps: St[]; saga: St; pay: St; key: string; flow?: [number, number, Tone]; back?: boolean; note: St };

const idle: St = { sub: "—" };
const doneSt = (sub: string): St => ({ sub, tone: "ok" });

function happy(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  if (step === 0)
    return {
      steps: [d(0.3) ? doneSt("open · in range") : { sub: "checking", tone: "lit" }, d(0.9) ? doneSt("hold placed") : d(0.3) ? { sub: "Stripe", tone: "lit" } : idle, idle, idle, idle, idle],
      saga: { sub: "RUNNING", tone: "lit" },
      pay: d(0.9) ? { sub: "authorized", tone: "ok" } : { sub: "none" },
      key: "order:{id}:auth",
      flow: [0, 1, "lit"],
      note: { sub: "a hold, nothing captured yet", tone: "lit" },
    };
  if (step === 1)
    return {
      steps: [doneSt("open · in range"), doneSt("hold placed"), d(0.33) ? doneSt("sent < 2 s") : { sub: "sending", tone: "lit" }, d(0.62) ? doneSt("confirmed") : d(0.33) ? { sub: "waiting", tone: "lit" } : idle, d(0.9) ? doneSt("< 30 s") : d(0.62) ? { sub: "matching", tone: "lit" } : idle, idle],
      saga: { sub: "RUNNING", tone: "lit" },
      pay: { sub: "authorized", tone: "ok" },
      key: "order:{id}:auth",
      flow: [1, 4, "lit"],
      note: { sub: "restaurant, then driver", tone: "lit" },
    };
  return {
    steps: [doneSt("open · in range"), doneSt("hold placed"), doneSt("sent < 2 s"), doneSt("confirmed"), doneSt("< 30 s"), d(0.9) ? doneSt("captured") : { sub: "picked up", tone: "lit" }],
    saga: d(0.9) ? { sub: "COMPLETED", tone: "ok" } : { sub: "RUNNING", tone: "lit" },
    pay: d(0.9) ? { sub: "captured", tone: "ok" } : { sub: "authorized", tone: "ok" },
    key: "capture (idempotent)",
    flow: [4, 5, "ok"],
    note: d(0.9) ? { sub: "charged exactly once", tone: "ok" } : { sub: "driver picks up", tone: "lit" },
  };
}

function reject(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const head = [doneSt("open · in range"), doneSt("hold placed"), doneSt("sent < 2 s")];
  if (step === 0)
    return {
      steps: [...head, d(0.9) ? { sub: "REJECTED", tone: "bad" } : { sub: "waiting", tone: "lit" }, idle, idle],
      saga: d(0.9) ? { sub: "COMPENSATING", tone: "warn" } : { sub: "RUNNING", tone: "lit" },
      pay: { sub: "authorized", tone: "ok" },
      key: "order:{id}:auth",
      flow: [2, 3, "lit"],
      note: d(0.9) ? { sub: "restaurant rejected", tone: "bad" } : { sub: "awaiting confirmation", tone: "lit" },
    };
  if (step === 1)
    return {
      steps: [head[0], d(0.9) ? { sub: "voided", tone: "warn" } : { sub: "voiding…", tone: "warn" }, head[2], { sub: "REJECTED", tone: "bad" }, { sub: "no driver: skip", tone: "mute" }, idle],
      saga: { sub: "COMPENSATING", tone: "warn" },
      pay: d(0.9) ? { sub: "voided", tone: "warn" } : { sub: "authorized", tone: "ok" },
      key: "void:{order_id}",
      flow: [3, 1, "warn"],
      back: true,
      note: { sub: "reverse order, retried until done", tone: "warn" },
    };
  return {
    steps: [head[0], { sub: "voided", tone: "warn" }, head[2], { sub: "REJECTED", tone: "bad" }, { sub: "no driver: skip", tone: "mute" }, idle],
    saga: d(0.5) ? { sub: "FAILED", tone: "bad" } : { sub: "COMPENSATING", tone: "warn" },
    pay: { sub: "voided", tone: "warn" },
    key: "void:{order_id}",
    note: d(0.5) ? { sub: "cancelled · customer notified", tone: "ok" } : { sub: "cancelling", tone: "warn" },
  };
}

function capture(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const head = [doneSt("open · in range"), doneSt("hold placed"), doneSt("sent < 2 s"), doneSt("confirmed"), doneSt("< 30 s")];
  if (step === 0)
    return {
      steps: [...head, d(0.9) ? { sub: "capture failed", tone: "bad" } : { sub: "picked up", tone: "lit" }],
      saga: { sub: "RUNNING", tone: "lit" },
      pay: d(0.9) ? { sub: "not captured", tone: "bad" } : { sub: "authorized", tone: "ok" },
      key: "capture (idempotent)",
      flow: [4, 5, "lit"],
      note: d(0.9) ? { sub: "pickup can't be undone", tone: "bad" } : { sub: "driver picks up", tone: "lit" },
    };
  return {
    steps: [...head, { sub: "manual review", tone: "warn" }],
    saga: { sub: "no compensation", tone: "warn" },
    pay: { sub: "not captured", tone: "bad" },
    key: "flagged for review",
    note: { sub: "food keeps moving; ops follows up", tone: "warn" },
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = variant === "reject" ? reject(step, t) : variant === "capture" ? capture(step, t) : happy(step, t);
  const labels = narrow ? ["Validate", "Authorize", "Restaurant", "Confirm", "Driver", "Capture"] : ["Validate", "Authorize", "Notify restaurant", "Await confirm", "Assign driver", "Capture"];
  const p = f.flow ? seg(t, 0.05, 0.9) : 0;
  let tok: P | null = null;
  if (f.flow && p > 0 && p < 1) {
    const [a, b] = f.flow;
    // one hop per saga step, each taking the same time, so a step's state flips as the token arrives
    const n = Math.abs(b - a);
    const k = Math.min(n - 1, Math.floor(p * n));
    const from = a + (b > a ? k : -k);
    const to = from + (b > a ? 1 : -1);
    const pts = SNAKE.slice(PI[Math.min(from, to)], PI[Math.max(from, to)] + 1);
    tok = along(to > from ? pts : pts.slice().reverse(), p * n - k);
  }
  const cols = [20, 210, 400];
  return (
    <g>
      <Wire d={`M${XS[0] + BW} ${center(0).y}H${XS[1]}M${XS[1] + BW} ${center(1).y}H${XS[2]}`} />
      <Wire d={`M${center(2).x} ${YS[0] + BH}V${ELBOW}H${center(3).x}V${YS[1]}`} />
      <Wire d={`M${XS[0] + BW} ${center(3).y}H${XS[1]}M${XS[1] + BW} ${center(4).y}H${XS[2]}`} />
      {labels.map((l, i) => {
        const q = pos(i);
        const s = f.steps[i];
        return <Box key={i} x={q.x} y={q.y} w={BW} h={BH} label={l} sub={narrow && s.sub === "open · in range" ? "valid" : narrow && s.sub === "no driver: skip" ? "skip" : s.sub} tone={s.tone === "mute" ? undefined : s.tone} dim={s.sub === "—"} />;
      })}
      {tok && <Token x={tok.x} y={tok.y} s={12} tone={f.flow![2]} />}
      <line className="sg-rule" x1={20} x2={W - 20} y1={214} y2={214} />
      {[
        ["saga", f.saga],
        ["payment", f.pay],
        ["key", { sub: f.key } as St],
      ].map(([k, v], i) => (
        <g key={k as string}>
          <Txt x={cols[i]} y={240} k="k" anchor="start" tone="mute">
            {k as string}
          </Txt>
          <Txt x={cols[i]} y={266} k={i === 2 ? "s" : "t"} anchor="start" tone={(v as St).tone}>
            {narrow && i === 2 ? (v as St).sub.replace(" (idempotent)", "").replace("flagged for review", "flagged") : narrow && (v as St).sub === "COMPENSATING" ? "COMPENS." : narrow && (v as St).sub === "no compensation" ? "none" : (v as St).sub}
          </Txt>
        </g>
      ))}
      <Txt x={20} y={H - 14} anchor="start" tone={f.note.tone}>
        {f.note.sub}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sg-rule{stroke:var(--ax-line-soft);stroke-width:1.5}`,
  variants: [
    {
      id: "happy",
      label: "Happy path",
      steps: [
        { caption: "Validate (restaurant open, address in range), then authorize with key order:{id}:auth: a hold, nothing captured yet.", tween: 2000 },
        { caption: "The restaurant sees the order within 2 s and confirms; a driver is assigned within 30 s.", tween: 2600 },
        { caption: "At pickup the saga captures the authorized amount, idempotently. The customer is charged exactly once.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "reject",
      label: "Restaurant rejects",
      steps: [
        { caption: "Payment is authorized and the order sent, then the restaurant rejects it. The saga switches to COMPENSATING.", tween: 1600 },
        { caption: "Compensate in reverse: no driver to release, so void the authorization with key void:{order_id}, retried until done.", tween: 2000 },
        { caption: "Then the order is marked cancelled and the customer notified. Nothing was ever captured.", tween: 1200, ms: 3400 },
      ],
    },
    {
      id: "capture",
      label: "Capture fails",
      steps: [
        { caption: "The driver picks up the food, then the capture fails. Pickup can't be undone, so there's no compensation.", tween: 1600 },
        { caption: "Instead the failure is logged and flagged for manual review, while the food keeps moving.", tween: 800, ms: 3400 },
      ],
    },
  ],
  Scene,
});
