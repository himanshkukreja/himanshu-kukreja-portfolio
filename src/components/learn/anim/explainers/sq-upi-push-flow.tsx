/**
 * UPI push payment (side quest 1 · Phase 3 transaction flow / Deep Dive 2 atomicity): Alice pays
 * ₹500 to bob@okaxis. NPCI resolves the VPA at Axis, debits HDFC (ABC123), credits Axis (XYZ789)
 * and answers in < 2 s; when the credit times out the payment becomes DEEMED_SUCCESS, goes into
 * the settlement file, and is auto-reversed by T+1 when Axis finds no credit.
 */
import { Box, clamp, defineExplainer, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 284;

type Pt = { x: number; y: number };
const AB = { x: 24, y: 46, w: 124, h: 64 };
const NB = { x: 238, y: 46, w: 124, h: 64 };
const HB = { x: 452, y: 10, w: 124, h: 60 };
const XB = { x: 452, y: 120, w: 124, h: 60 };
const AN: Pt[] = [{ x: 148, y: 78 }, { x: 238, y: 78 }];
const TOH: Pt[] = [{ x: 362, y: 62 }, { x: 400, y: 62 }, { x: 400, y: 40 }, { x: 452, y: 40 }];
const TOX: Pt[] = [{ x: 362, y: 94 }, { x: 414, y: 94 }, { x: 414, y: 150 }, { x: 452, y: 150 }];
const LOST: Pt = { x: 414, y: 124 };
const TOX_CUT: Pt[] = [TOX[0], TOX[1], LOST];
const rev = (p: Pt[]) => [...p].reverse();
const path = (p: Pt[]) => p.map((q, i) => `${i ? "L" : "M"}${q.x} ${q.y}`).join("");

/** point at fraction p along a polyline */
function along(pts: Pt[], p: number): Pt {
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  let d = clamp(p) * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

type Leg = { a: number; b: number; pts: Pt[]; tone: Tone; label: string };
const leg = (a: number, b: number, pts: Pt[], tone: Tone, label: string): Leg => ({ a, b, pts, tone, label });

type Frame = { legs: Leg[]; state: string; st: Tone; al: string; alT?: Tone; hd: string; hdT?: Tone; ax: string; axT?: Tone; time: string; lost?: boolean };

function frame(variant: string, step: number, t: number): Frame {
  const after = (x: number) => t >= x;
  if (variant === "ok") {
    if (step === 0)
      return {
        legs: [leg(0, 0.3, AN, "lit", "pay ₹500 to bob@okaxis + encrypted PIN"), leg(0.36, 0.62, TOX, "sky", "resolve: who is bob@okaxis?"), leg(0.66, 0.92, rev(TOX), "sky", "Bob's account XXXX1234")],
        state: after(0.3) ? "PENDING" : "CREATED",
        st: undefined,
        al: "paying…",
        hd: "Alice's bank",
        ax: after(0.92) ? "VPA found" : "Bob's bank",
        axT: after(0.92) ? "sky" : undefined,
        time: "T+0",
      };
    if (step === 1)
      return {
        legs: [leg(0, 0.4, TOH, "lit", "debit ₹500 from Alice"), leg(0.5, 0.9, rev(TOH), "ok", "debited · ref ABC123")],
        state: after(0.9) ? "DEBITED" : "DEBIT_INITIATED",
        st: undefined,
        al: "paying…",
        hd: after(0.4) ? "−₹500" : "Alice's bank",
        hdT: after(0.4) ? "warn" : undefined,
        ax: "Bob's bank",
        time: "T+0",
      };
    if (step === 2)
      return {
        legs: [leg(0, 0.4, TOX, "lit", "credit ₹500 to Bob"), leg(0.5, 0.9, rev(TOX), "ok", "credited · ref XYZ789")],
        state: after(0.9) ? "COMPLETED" : "CREDIT_INITIATED",
        st: after(0.9) ? "ok" : undefined,
        al: "paying…",
        hd: "−₹500",
        hdT: "warn",
        ax: after(0.4) ? "+₹500 Bob" : "Bob's bank",
        axT: after(0.4) ? "ok" : undefined,
        time: "T+0",
      };
    return {
      legs: [leg(0, 0.5, rev(AN), "ok", "success · TXN123456")],
      state: "COMPLETED",
      st: "ok",
      al: after(0.5) ? "paid ✓" : "paying…",
      alT: after(0.5) ? "ok" : undefined,
      hd: "−₹500",
      hdT: "warn",
      ax: "+₹500 Bob",
      axT: "ok",
      time: "< 2 s",
    };
  }
  // the credit call times out
  if (step === 0)
    return {
      legs: [
        leg(0, 0.16, AN, "lit", "pay ₹500 to bob@okaxis"),
        leg(0.18, 0.32, TOX, "sky", "resolve bob@okaxis"),
        leg(0.34, 0.48, rev(TOX), "sky", "VPA found"),
        leg(0.52, 0.7, TOH, "lit", "debit ₹500 from Alice"),
        leg(0.74, 0.92, rev(TOH), "ok", "debited · ref ABC123"),
      ],
      state: after(0.92) ? "DEBITED" : after(0.52) ? "DEBIT_INITIATED" : after(0.16) ? "PENDING" : "CREATED",
      st: undefined,
      al: "paying…",
      hd: after(0.7) ? "−₹500" : "Alice's bank",
      hdT: after(0.7) ? "warn" : undefined,
      ax: "Bob's bank",
      time: "T+0",
    };
  if (step === 1)
    return {
      legs: [leg(0, 0.45, TOX_CUT, "lit", "credit ₹500 to Bob")],
      state: after(0.6) ? "DEEMED_SUCCESS" : "CREDIT_INITIATED",
      st: after(0.6) ? "warn" : undefined,
      al: "pending",
      alT: after(0.6) ? "warn" : undefined,
      hd: "−₹500",
      hdT: "warn",
      ax: after(0.45) ? "no answer" : "Bob's bank",
      axT: after(0.45) ? "warn" : undefined,
      lost: after(0.45),
      time: "T+0 · timeout",
    };
  if (step === 2)
    return {
      legs: [leg(0, 0.4, TOX, "sky", "settlement file: this txn"), leg(0.5, 0.9, rev(TOX), "bad", "reconciled: no credit found")],
      state: "DEEMED_SUCCESS",
      st: "warn",
      al: "pending",
      alT: "warn",
      hd: "−₹500",
      hdT: "warn",
      ax: after(0.5) ? "no credit" : "reconciling",
      axT: after(0.5) ? "bad" : "sky",
      time: "T+0 / T+1",
    };
  return {
    legs: [leg(0, 0.4, TOH, "warn", "auto-reverse ₹500 · same txn ID"), leg(0.5, 0.9, rev(TOH), "ok", "reversed")],
    state: after(0.9) ? "REVERSED" : "DEEMED_SUCCESS",
    st: "warn",
    al: after(0.9) ? "₹500 back" : "pending",
    alT: after(0.9) ? "ok" : "warn",
    hd: after(0.4) ? "+₹500 back" : "−₹500",
    hdT: after(0.4) ? "ok" : "warn",
    ax: "no credit",
    axT: "bad",
    time: "by end of T+1",
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  const msg = live[0];
  return (
    <g>
      <Box x={AB.x} y={AB.y} w={AB.w} h={AB.h} label="Alice" sub={f.al} tone={f.alT} />
      <Box x={NB.x} y={NB.y} w={NB.w} h={NB.h} label="NPCI" sub="switch" tone={msg ? "lit" : undefined} />
      <Box x={HB.x} y={HB.y} w={HB.w} h={HB.h} label="HDFC" sub={f.hd} tone={f.hdT} />
      <Box x={XB.x} y={XB.y} w={XB.w} h={XB.h} label="Axis" sub={f.ax} tone={f.axT} />
      <Wire d={path(AN)} />
      <Wire d={path(TOH)} />
      <Wire d={path(TOX)} />
      <Txt x={NB.x + NB.w / 2} y={136} k="s" tone="mute">
        {narrow ? "holds no money" : "routes info, holds no money"}
      </Txt>
      <Txt x={AB.x + AB.w / 2} y={136} k="s" tone="mute">
        {narrow ? "PSP app" : "PSP app · PIN"}
      </Txt>
      {f.lost && (
        <g>
          <path className="sq-x" d={`M${LOST.x - 7} ${LOST.y - 7}L${LOST.x + 7} ${LOST.y + 7}M${LOST.x + 7} ${LOST.y - 7}L${LOST.x - 7} ${LOST.y + 7}`} />
          <Txt x={LOST.x + 8} y={LOST.y - 14} k="s" anchor="start" tone="bad">
            timeout
          </Txt>
        </g>
      )}
      {live.map((l, i) => {
        const p = along(l.pts, seg(t, l.a, l.b));
        return <Token key={i} x={p.x} y={p.y} s={11} tone={l.tone} />;
      })}
      {msg && (
        <Txt x={24} y={28} k="s" anchor="start" tone={msg.tone}>
          {`→ ${msg.label}`}
        </Txt>
      )}
      <Txt x={24} y={212} k="k" anchor="start" tone="mute">
        {narrow ? "txn state" : "transaction state · one txn ID end to end"}
      </Txt>
      <Txt x={24} y={256} k="d" anchor="start" tone={f.st}>
        {f.state}
      </Txt>
      <Txt x={W - 24} y={212} k="k" anchor="end" tone="mute">
        time
      </Txt>
      <Txt x={W - 24} y={252} anchor="end" tone={f.time.includes("T+1") ? "warn" : undefined}>
        {f.time}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sq-x{fill:none;stroke:var(--ax-bad);stroke-width:2.5}`,
  variants: [
    {
      id: "ok",
      label: "Happy path",
      steps: [
        { caption: "Alice pays ₹500 to bob@okaxis. NPCI first asks Axis to resolve the VPA to Bob's real account.", tween: 2600 },
        { caption: "NPCI sends the debit to HDFC: ₹500 leaves Alice's account, ref ABC123. State: DEBITED.", tween: 2200 },
        { caption: "NPCI sends the credit to Axis: Bob gets ₹500, ref XYZ789. State: COMPLETED.", tween: 2200 },
        { caption: "Alice sees success in under 2 seconds. NPCI only routed messages; the money moved bank to bank.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "timeout",
      label: "Credit times out",
      steps: [
        { caption: "Same ₹500 payment: the VPA resolves and HDFC debits Alice. State: DEBITED, money has left her account.", tween: 3400 },
        { caption: "The credit call to Axis times out. Don't guess: NPCI marks it DEEMED_SUCCESS and adds it to the settlement file.", tween: 2000, ms: 3400 },
        { caption: "By T+1 Axis reconciles the file against real credits. Had Bob been credited: COMPLETED. Here, none is found.", tween: 2400, ms: 3200 },
        { caption: "So the debit is auto-reversed with the same transaction ID: ₹500 back to Alice by T+1. State: REVERSED.", tween: 2200, ms: 3600 },
      ],
    },
  ],
  Scene,
});
