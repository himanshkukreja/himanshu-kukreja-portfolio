/**
 * Blinkit side quest (deep dive 2): store 412 holds 3 packets of a snack and two checkouts want 2
 * each; `UPDATE stock SET reserved = reserved + q WHERE on_hand - reserved - buffer >= q` is
 * serialised by the row lock, so the first reserves 2 (HELD, 5-minute TTL) and the second rolls
 * back with "only 1 left". A paid hold becomes COMMITTED (no TTL) and the picker's scan drops
 * on_hand and reserved together; an unpaid hold is released by the sweeper, and only the call that
 * moves HELD → RELEASED gives stock back.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;

type Pt = { x: number; y: number };
const mv = (a: Pt, b: Pt, p: number): Pt => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

type Stock = { on: number; res: number; buf: number };
const avail = (s: Stock) => s.on - s.res - s.buf;

const CELLS = [
  { k: "on", label: "on_hand", x: 24, y: 58 },
  { k: "res", label: "reserved", x: 150, y: 58 },
  { k: "buf", label: "buffer", x: 24, y: 140 },
  { k: "av", label: "available", x: 150, y: 140 },
] as const;
const CW = 114;
const CH = 70;
const ROWR: Pt = { x: 264, y: 140 };

function StockPanel({ s, hot, narrow }: { s: Stock; hot?: Partial<Record<"on" | "res" | "av", Tone>>; narrow: boolean }) {
  const val = (k: string) => (k === "on" ? s.on : k === "res" ? s.res : k === "buf" ? s.buf : avail(s));
  return (
    <g>
      <Txt x={24} y={40} k="k" anchor="start">
        {narrow ? "stock · store 412" : "stock row · store 412 · snack"}
      </Txt>
      {CELLS.map((c) => {
        const tone = hot?.[c.k as "on" | "res" | "av"];
        const v = val(c.k);
        return (
          <g key={c.k}>
            <rect className={`ax-box${tone ? " " + tone : ""}`} x={c.x} y={c.y} width={CW} height={CH} />
            <Txt x={c.x + 10} y={c.y + 20} k="s" anchor="start" tone={c.k === "av" ? "lit" : undefined}>
              {c.label}
            </Txt>
            <Txt x={c.x + CW / 2} y={c.y + CH - 10} k="d" tone={tone || (c.k === "av" && v <= 1 ? "warn" : undefined)}>
              {String(v)}
            </Txt>
          </g>
        );
      })}
      <Txt x={24} y={238} k="s" anchor="start">
        available =
      </Txt>
      <Txt x={24} y={258} k="s" anchor="start">
        {narrow ? "on − reserved − buf" : "on_hand − reserved − buffer"}
      </Txt>
    </g>
  );
}

/* ------------------------------------------------------------------ two checkouts, last 3 packets */

const C1 = { x: 316, y: 40, w: 120, h: 60 };
const C2 = { x: 456, y: 40, w: 120, h: 60 };
const R1 = { x: 316, y: 204, w: 120, h: 60 };
const R2 = { x: 456, y: 204, w: 120, h: 60 };

function RaceScene({ step, t, narrow }: SceneProps) {
  const c1: Pt = { x: C1.x + C1.w / 2, y: C1.y + C1.h };
  const c2: Pt = { x: C2.x + C2.w / 2, y: C2.y + C2.h };
  const wait2: Pt = { x: ROWR.x + 34, y: ROWR.y + 18 };
  const toks: (Pt & { tone: Tone })[] = [];
  let s: Stock = { on: 3, res: 0, buf: 0 };
  if (step === 0) {
    toks.push({ ...mv(c1, { x: ROWR.x + 8, y: ROWR.y - 10 }, ease(seg(t, 0.1, 0.8))), tone: "lit" });
    toks.push({ ...mv(c2, wait2, ease(seg(t, 0.15, 0.85))), tone: "warn" });
  } else if (step === 1) {
    const p = seg(t, 0.2, 0.7);
    s = { on: 3, res: p >= 1 ? 2 : 0, buf: 0 };
    if (t < 0.7) toks.push({ ...mv({ x: ROWR.x + 8, y: ROWR.y - 10 }, c1, 0), tone: "lit" });
    const back = seg(t, 0.7, 1);
    if (back > 0 && back < 1) toks.push({ ...mv({ x: ROWR.x + 8, y: ROWR.y - 10 }, { x: R1.x + R1.w / 2, y: R1.y }, ease(back)), tone: "ok" });
    toks.push({ ...wait2, tone: "warn" });
  } else {
    s = { on: 3, res: 2, buf: 0 };
    const p = seg(t, 0, 0.35);
    if (p < 1) toks.push({ ...mv(wait2, { x: ROWR.x + 8, y: ROWR.y - 10 }, ease(p)), tone: "warn" });
    const back = seg(t, 0.55, 0.9);
    if (back > 0 && back < 1) toks.push({ ...mv({ x: ROWR.x + 8, y: ROWR.y - 10 }, { x: R2.x + R2.w / 2, y: R2.y }, ease(back)), tone: "bad" });
  }
  const r1 = step > 1 || (step === 1 && t >= 0.7);
  const r2 = step === 2 && t >= 0.9;
  const lockOn = step === 0 ? t >= 0.8 : true;
  return (
    <g>
      <StockPanel s={s} narrow={narrow} hot={step === 1 && t >= 0.7 ? { res: "lit", av: "warn" } : step === 2 && t >= 0.4 && t < 0.9 ? { av: "bad" } : undefined} />
      <Wire d={`M${c1.x} ${c1.y}L${ROWR.x + 8} ${ROWR.y - 10}`} dash opacity={0.6} />
      <Wire d={`M${c2.x} ${c2.y}L${wait2.x} ${wait2.y}`} dash opacity={0.6} />
      <Box x={C1.x} y={C1.y} w={C1.w} h={C1.h} label={narrow ? "Order 1" : "Checkout 1"} sub="wants 2" tone="lit" />
      <Box x={C2.x} y={C2.y} w={C2.w} h={C2.h} label={narrow ? "Order 2" : "Checkout 2"} sub="wants 2" tone="warn" />
      <Txt x={ROWR.x + 30} y={ROWR.y + 52} k="s" anchor="start" tone={lockOn ? "warn" : "mute"}>
        {step === 2 && t >= 0.35 ? (narrow ? "guard: 1 < 2" : "guard: 1 ≥ 2? no") : step === 1 ? (narrow ? "guard: 3 ≥ 2" : "guard: 3 ≥ 2? yes") : narrow ? "row lock" : "row lock: one at a time"}
      </Txt>
      <Box x={R1.x} y={R1.y} w={R1.w} h={R1.h} label="HELD" sub={narrow ? "TTL 5 min" : "2 · TTL 5 min"} tone={r1 ? "ok" : undefined} dim={!r1} />
      <Box x={R2.x} y={R2.y} w={R2.w} h={R2.h} label={narrow ? "ROLLBACK" : "rolled back"} sub={narrow ? "1 left" : "only 1 left"} tone={r2 ? "bad" : undefined} dim={!r2} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={11} tone={k.tone} />
      ))}
      <Txt x={316} y={288} k="s" anchor="start" tone="mute">
        {narrow ? "told before paying" : "told before paying · no oversell"}
      </Txt>
    </g>
  );
}

/* ------------------------------------------------------------------ the life of the hold */

const HE = { x: 316, y: 40, w: 120, h: 56 };
const CO = { x: 456, y: 40, w: 120, h: 56 };
const PI = { x: 456, y: 150, w: 120, h: 56 };
const RE = { x: 316, y: 150, w: 120, h: 56 };

function HoldScene({ variant, step, t, narrow }: SceneProps) {
  const paid = variant === "paid";
  let s: Stock = { on: 3, res: 2, buf: 0 };
  let ttl = 300; // seconds left on the hold
  let state: "HELD" | "COMMITTED" | "PICKED" | "RELEASED" = "HELD";
  let note = "";
  let noteTone: Tone = undefined;
  let hot: Partial<Record<"on" | "res" | "av", Tone>> | undefined;
  const toks: (Pt & { tone: Tone })[] = [];
  if (step === 0) {
    ttl = Math.round(300 - 60 * t);
    s = { on: 3, res: t >= 0.3 ? 2 : 0, buf: 0 };
    hot = t >= 0.3 ? { res: "lit" } : undefined;
    note = narrow ? "paying…" : "customer is paying…";
  } else if (paid) {
    if (step === 1) {
      ttl = 220;
      state = t >= 0.5 ? "COMMITTED" : "HELD";
      const p = seg(t, 0.1, 0.5);
      if (p > 0 && p < 1) toks.push({ ...mv({ x: HE.x + HE.w, y: HE.y + HE.h / 2 }, { x: CO.x, y: CO.y + CO.h / 2 }, ease(p)), tone: "ok" });
      note = narrow ? "expires_at = NULL" : "payment ok · expires_at = NULL";
      noteTone = "ok";
    } else {
      state = t >= 0.6 ? "PICKED" : "COMMITTED";
      const done = t >= 0.6;
      s = done ? { on: 1, res: 0, buf: 0 } : { on: 3, res: 2, buf: 0 };
      hot = done ? { on: "ok", res: "ok" } : undefined;
      const p = seg(t, 0.1, 0.6);
      if (p > 0 && p < 1) toks.push({ ...mv({ x: CO.x + CO.w / 2, y: CO.y + CO.h }, { x: PI.x + PI.w / 2, y: PI.y }, ease(p)), tone: "ok" });
      note = narrow ? "scan: −2 on, −2 res" : "scan_out: on_hand −2, reserved −2";
      noteTone = "ok";
    }
  } else {
    if (step === 1) {
      ttl = Math.max(0, Math.round(240 * (1 - seg(t, 0, 0.45))));
      const out = t >= 0.7;
      state = out ? "RELEASED" : "HELD";
      s = { on: 3, res: out ? 0 : 2, buf: 0 };
      hot = out ? { res: "bad", av: "ok" } : undefined;
      const p = seg(t, 0.45, 0.7);
      if (p > 0 && p < 1) toks.push({ ...mv({ x: HE.x + HE.w / 2, y: HE.y + HE.h }, { x: RE.x + RE.w / 2, y: RE.y }, ease(p)), tone: "bad" });
      note = narrow ? "sweeper: expired" : "sweeper: expires_at < now";
      noteTone = "bad";
    } else {
      ttl = 0;
      state = "RELEASED";
      s = { on: 3, res: 0, buf: 0 };
      const p = seg(t, 0.05, 0.5);
      if (p > 0 && p < 1) toks.push({ ...mv({ x: 600, y: RE.y + RE.h / 2 + 50 }, { x: RE.x + RE.w / 2, y: RE.y + RE.h }, ease(p)), tone: "warn" });
      note = t >= 0.5 ? (narrow ? "not HELD: no-op" : "not HELD → returns, gives nothing") : narrow ? "late fail callback" : "late payment-failure callback";
      noteTone = t >= 0.5 ? "ok" : "warn";
    }
  }
  const tone = (st: string): Tone => (state !== st ? undefined : st === "RELEASED" ? "bad" : st === "HELD" ? "lit" : "ok");
  const mmss = `${Math.floor(ttl / 60)}:${String(ttl % 60).padStart(2, "0")}`;
  const ttlOn = state === "HELD";
  return (
    <g>
      <StockPanel s={s} narrow={narrow} hot={hot} />
      <Wire d={`M${HE.x + HE.w} ${HE.y + HE.h / 2}H${CO.x}`} arrow tone={paid && step >= 1 ? "ok" : undefined} opacity={paid ? 1 : 0.35} />
      <Wire d={`M${CO.x + CO.w / 2} ${CO.y + CO.h}V${PI.y}`} arrow tone={paid && step === 2 ? "ok" : undefined} opacity={paid ? 1 : 0.35} />
      <Wire d={`M${HE.x + HE.w / 2} ${HE.y + HE.h}V${RE.y}`} arrow tone={!paid && step >= 1 ? "bad" : undefined} opacity={paid ? 0.35 : 1} />
      <Box x={HE.x} y={HE.y} w={HE.w} h={HE.h} label="HELD" sub={ttlOn ? `TTL ${mmss}` : narrow ? "done" : "hold ended"} tone={tone("HELD")} />
      <Box x={CO.x} y={CO.y} w={CO.w} h={CO.h} label={narrow ? "COMMIT" : "COMMITTED"} sub="no TTL" tone={tone("COMMITTED")} dim={!paid} />
      <Box x={PI.x} y={PI.y} w={PI.w} h={PI.h} label="PICKED" sub={narrow ? "scanned" : "in the bag"} tone={tone("PICKED")} dim={!paid} />
      <Box x={RE.x} y={RE.y} w={RE.w} h={RE.h} label="RELEASED" sub={narrow ? "returned" : "stock returned"} tone={tone("RELEASED")} dim={paid} />
      <Meter x={HE.x} y={HE.y + HE.h + 10} w={HE.w} h={6} value={ttlOn ? ttl : 0} max={300} tone={ttl < 60 ? "bad" : "lit"} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={11} tone={k.tone} />
      ))}
      <Txt x={316} y={252} k="s" anchor="start" tone={noteTone}>
        {note}
      </Txt>
      <Txt x={316} y={284} k="s" anchor="start" tone="mute">
        {paid ? (narrow ? "on_hand drops at scan" : "on_hand only drops at the scan") : narrow ? "only HELD → RELEASED" : "only HELD → RELEASED gives back"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "race" ? <RaceScene {...p} /> : <HoldScene {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "race",
      label: "Two checkouts",
      steps: [
        { caption: "Store 412 has 3 packets (on_hand 3, reserved 0, buffer 0). Two checkouts want 2 each, at the same moment.", tween: 1800 },
        { caption: "The row lock serialises them. Checkout 1's guard passes, 3 ≥ 2: reserved becomes 2, available 1. HELD.", tween: 2200 },
        { caption: "Checkout 2's guard fails, 1 < 2: its transaction rolls back and the customer sees “only 1 left” before paying.", tween: 2200, ms: 3400 },
      ],
    },
    {
      id: "paid",
      label: "Paid",
      steps: [
        { caption: "Checkout reserves 2 packets. The hold is HELD with a 5-minute TTL while the customer pays.", tween: 1600 },
        { caption: "Payment succeeds: HELD becomes COMMITTED and stops expiring. Nothing has left the shelf yet.", tween: 1800 },
        { caption: "The picker scans both packets: on_hand and reserved both drop by 2, and available stays 1.", tween: 2000, ms: 3400 },
      ],
    },
    {
      id: "expired",
      label: "Expired",
      steps: [
        { caption: "Checkout reserves 2 packets. The hold is HELD with a 5-minute TTL while the customer pays.", tween: 1600 },
        { caption: "Payment never arrives. The sweeper finds the expired hold and moves it HELD → RELEASED: available is 3 again.", tween: 2600 },
        { caption: "A late payment-failure callback finds RELEASED, not HELD, so it returns nothing. The units come back once.", tween: 2000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
