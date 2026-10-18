/**
 * Week 3 capstone (event-driven order system · Phase 3 data flow, Deep Dives 1 and 3): the order and
 * outbox rows commit together, Debezium publishes order.placed to orders.events (~100 ms), Payment,
 * Restaurant and Driver Matcher each react and publish the next event, and the audit consumer keeps
 * every event; then the failure paths: retry topics 1m / 5m / 15m and orders.dlq after 3 retries,
 * compensation for a rejection, and poison messages quarantined at once.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const TP = { x: 170, y: 40, w: 240, h: 222 };
const CX = 430;
const CW = 150;
const CH = 46;
const CY = [40, 98, 156, 214];
const LX = 20;
const LW = 130;
const OS = { x: LX, y: 40, w: LW, h: 52 };
const DB = { x: LX, y: 150, w: LW, h: 84 };
const RY = [40, 88, 136, 184, 232];
const RH = 44;
const CHIP = (i: number) => TP.y + 40 + i * 44;

type P = { x: number; y: number };
const cL = (i: number): P => ({ x: CX, y: CY[i] + CH / 2 });
const tR = (i: number): P => ({ x: TP.x + TP.w, y: CY[i] + CH / 2 });
const tL = (y: number): P => ({ x: TP.x, y });
const rR = (i: number): P => ({ x: LX + LW, y: RY[i] + RH / 2 });
const osB: P = { x: OS.x + OS.w / 2, y: OS.y + OS.h };
const dbT: P = { x: DB.x + DB.w / 2, y: DB.y };
const dbR: P = { x: DB.x + DB.w, y: DB.y + DB.h / 2 };

type Leg = { a: number; b: number; from: P; to: P; tone: Tone };
const leg = (a: number, b: number, from: P, to: P, tone: Tone = "lit"): Leg => ({ a, b, from, to, tone });

const EVENTS = ["order.placed", "payment.confirmed", "restaurant.accepted", "driver.assigned"];

type Chip = { text: string; tone?: Tone };
type Frame = { legs: Leg[]; chips: Chip[]; cons: (Tone | undefined)[]; consSub: string[]; left: (Tone | undefined)[]; leftSub?: string[]; clock: string; note: Chip };

function happy(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const subs = ["idle", "idle", "idle", "every event"];
  if (step === 0)
    return {
      legs: [leg(0.05, 0.45, osB, dbT)],
      chips: [],
      cons: [],
      consSub: subs,
      left: [d(0.5) ? "ok" : "lit", d(0.45) ? "ok" : undefined],
      clock: "T+0",
      note: d(0.7) ? { text: "customer: order placed", tone: "ok" } : { text: "one transaction", tone: "lit" },
    };
  if (step === 1)
    return {
      legs: [leg(0.05, 0.55, dbR, tL(CHIP(0) + 15))],
      chips: d(0.55) ? [{ text: EVENTS[0], tone: "lit" }] : [],
      cons: [],
      consSub: subs,
      left: ["ok", "ok"],
      clock: "T+~100 ms",
      note: { text: "CDC (Debezium) · key order_id", tone: "sky" },
    };
  if (step === 2) {
    const c0 = d(0.28);
    const c1 = d(0.78);
    return {
      legs: [leg(0, 0.22, tR(0), cL(0)), leg(0.24, 0.4, cL(0), tR(0), "ok"), leg(0.5, 0.7, tR(1), cL(1)), leg(0.72, 0.88, cL(1), tR(1), "ok")],
      chips: [{ text: EVENTS[0] }, ...(d(0.4) ? [{ text: EVENTS[1], tone: "ok" as Tone }] : []), ...(d(0.88) ? [{ text: EVENTS[2], tone: "ok" as Tone }] : [])],
      cons: [c0 ? "ok" : "lit", d(0.5) ? (c1 ? "ok" : "lit") : undefined],
      consSub: [c0 ? "confirmed" : "charging", d(0.5) ? (c1 ? "accepted" : "notifying") : "idle", "idle", "every event"],
      left: ["ok", "ok"],
      clock: d(0.5) ? "< 10 s" : "< 3 s",
      note: { text: "each service reacts, publishes next", tone: "lit" },
    };
  }
  return {
    legs: [leg(0, 0.25, tR(2), cL(2)), leg(0.27, 0.45, cL(2), tR(2), "ok"), leg(0.55, 0.85, tR(3), cL(3), "sky")],
    chips: EVENTS.map((e, i): Chip => ({ text: e, tone: i === 3 ? "ok" : undefined })).filter((_, i) => i < 3 || d(0.45)),
    cons: ["ok", "ok", d(0.3) ? "ok" : "lit", d(0.85) ? "ok" : "sky"],
    consSub: ["confirmed", "accepted", d(0.3) ? "assigned" : "matching", d(0.85) ? "4 events" : "every event"],
    left: ["ok", "ok"],
    clock: "< 2 min",
    note: d(0.85) ? { text: "audit trail in TimescaleDB", tone: "ok" } : { text: "driver assignment", tone: "lit" },
  };
}

function fail(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const subs = ["timeout", "idle", "idle", "idle"];
  if (step === 0) {
    const hop = d(0.75) ? 2 : d(0.5) ? 1 : d(0.25) ? 0 : -1;
    return {
      legs: [leg(0.02, 0.22, cL(0), rR(0), "warn"), leg(0.28, 0.46, rR(0), rR(1), "warn"), leg(0.53, 0.72, rR(1), rR(2), "warn")],
      chips: [{ text: "order.placed", tone: "warn" }],
      cons: ["warn"],
      consSub: subs,
      left: [hop === 0 ? "warn" : undefined, hop === 1 ? "warn" : undefined, hop === 2 ? "warn" : undefined],
      leftSub: [hop >= 0 ? "1st retry" : "", hop >= 1 ? "2nd retry" : "", hop >= 2 ? "3rd retry" : ""],
      clock: "1m · 5m · 15m",
      note: { text: "transient: retry with delay", tone: "warn" },
    };
  }
  if (step === 1)
    return {
      legs: [leg(0.05, 0.5, rR(2), rR(3), "bad")],
      chips: [{ text: "order.placed", tone: "mute" }],
      cons: [undefined, "ok", undefined, "ok"],
      consSub: ["idle", "flowing", "idle", "flowing"],
      left: [undefined, undefined, undefined, d(0.5) ? "bad" : undefined],
      leftSub: ["1st retry", "2nd retry", "3rd retry", d(0.5) ? "investigate" : ""],
      clock: "after 3 retries",
      note: { text: "parked in orders.dlq", tone: "bad" },
    };
  if (step === 2)
    return {
      legs: [leg(0, 0.25, tR(1), cL(1)), leg(0.35, 0.65, cL(1), cL(2), "bad")],
      chips: [{ text: "restaurant.rejected", tone: "bad" }],
      cons: [undefined, d(0.3) ? "bad" : "lit", d(0.65) ? "ok" : undefined],
      consSub: ["idle", d(0.3) ? "rejected" : "notifying", d(0.65) ? "reroute/refund" : "idle", "idle"],
      left: [],
      leftSub: ["", "", "", ""],
      clock: "no retry",
      note: { text: "permanent: compensate", tone: "bad" },
    };
  return {
    legs: [leg(0.02, 0.5, cL(0), rR(4), "bad")],
    chips: [{ text: "invalid message", tone: "bad" }],
    cons: ["bad", "ok", undefined, "ok"],
    consSub: ["can't parse", "flowing", "idle", "flowing"],
    left: [undefined, undefined, undefined, undefined, d(0.5) ? "bad" : undefined],
    leftSub: ["", "", "", "", d(0.5) ? "alert sent" : ""],
    clock: "immediately",
    note: { text: "poison: never retried", tone: "bad" },
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const ok = variant === "happy";
  const f = ok ? happy(step, t) : fail(step, t);
  const cons = ok ? ["Payment", "Restaurant", "Driver", "Audit"] : ["Payment", "Restaurant", narrow ? "Compens." : "Compensate", "Driver"];
  const lefts = narrow ? ["retry.1m", "retry.5m", "retry.15m", "dlq", "poison"] : ["retry.1m", "retry.5m", "retry.15m", "orders.dlq", "dlq.poison"];
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  return (
    <g>
      {ok ? (
        <g>
          <Wire d={`M${osB.x} ${osB.y}V${dbT.y}`} />
          <Wire d={`M${dbR.x} ${dbR.y}H${TP.x}`} dash />
          <Box x={OS.x} y={OS.y} w={OS.w} h={OS.h} label={narrow ? "Orders" : "Order Svc"} sub="API" tone={f.left[0]} />
          <rect className={`ax-box ${f.left[1] || ""}`} x={DB.x} y={DB.y} width={DB.w} height={DB.h} />
          <Txt x={DB.x + DB.w / 2} y={DB.y + 22} k="k" tone={f.left[1] ? "ok" : undefined}>
            {narrow ? "1 txn" : "one txn"}
          </Txt>
          <Txt x={DB.x + 12} y={DB.y + 48} k="s" anchor="start" tone={f.left[1] ? "ok" : "mute"}>
            {f.left[1] ? "orders ✓" : "orders"}
          </Txt>
          <Txt x={DB.x + 12} y={DB.y + 72} k="s" anchor="start" tone={f.left[1] ? "ok" : "mute"}>
            {f.left[1] ? "outbox ✓" : "outbox"}
          </Txt>
        </g>
      ) : (
        lefts.map((l, i) => <Box key={l} x={LX} y={RY[i]} w={LW} h={RH} label={l} sub={f.leftSub?.[i] || undefined} tone={f.left[i]} dim={!f.left[i] && !f.leftSub?.[i]} />)
      )}
      <rect className="ax-box" x={TP.x} y={TP.y} width={TP.w} height={TP.h} />
      <Txt x={TP.x + 12} y={TP.y + 22} k="k" anchor="start">
        orders.events
      </Txt>
      {f.chips.map((c, i) => (
        <g key={c.text}>
          <rect className={`ax-box ${c.tone || ""}`} x={TP.x + 10} y={CHIP(i) - 8} width={TP.w - 20} height={32} />
          <Txt x={TP.x + TP.w / 2} y={CHIP(i) + 13} k="s" tone={c.tone}>
            {c.text}
          </Txt>
        </g>
      ))}
      {cons.map((c, i) => (
        <g key={c}>
          <Wire d={`M${TP.x + TP.w} ${CY[i] + CH / 2}H${CX}`} />
          <Box x={CX} y={CY[i]} w={CW} h={CH} label={c} sub={f.consSub[i]} tone={f.cons[i]} dim={!ok && !f.cons[i]} />
        </g>
      ))}
      {live.map((l, i) => {
        const p = seg(t, l.a, l.b);
        return <Token key={i} x={lerp(l.from.x, l.to.x, p)} y={lerp(l.from.y, l.to.y, p)} s={11} tone={l.tone} />;
      })}
      <Txt x={20} y={H - 16} anchor="start" tone={f.note.tone}>
        {f.note.text}
      </Txt>
      <Txt x={W - 20} y={H - 16} k="s" anchor="end">
        {f.clock}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "happy",
      label: "Happy path",
      steps: [
        { caption: "The Order Service writes the order row and its outbox row in one transaction, then answers the customer.", tween: 1400 },
        { caption: "Debezium reads the outbox and publishes order.placed to orders.events, keyed by order_id, about 100 ms later.", tween: 1600 },
        { caption: "Payment consumes it and publishes payment.confirmed; Restaurant consumes that and publishes restaurant.accepted.", tween: 3000 },
        { caption: "Driver Matcher publishes driver.assigned. The audit consumer stores every event in TimescaleDB for disputes.", tween: 2400, ms: 3400 },
      ],
    },
    {
      id: "fail",
      label: "Failures",
      steps: [
        { caption: "A payment gateway timeout is transient: the event goes to orders.retry.1m, then 5m, then 15m.", tween: 2600 },
        { caption: "Still failing after 3 retries, it lands in orders.dlq for investigation. Other orders keep flowing.", tween: 1600 },
        { caption: "A restaurant rejection is permanent, so no retry: compensation reroutes to an alternative restaurant, or refunds.", tween: 2000 },
        { caption: "An invalid message is poison: quarantined in orders.dlq.poison at once, with an alert. Never retried.", tween: 2000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
