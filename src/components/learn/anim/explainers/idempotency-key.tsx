/**
 * Idempotency keys (week 2, day 2 · 1.3 / 2.1 / 5.2 / 6.2 / 6.3): the lost response that turns a
 * retry into a double charge, the same retry answered from the idempotency store (pay_abc123 →
 * txn_789), and the double click that finds the record still "processing".
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 290;
const Y = 74;
const CL = { x: 24, y: 44, w: 120, h: 60 };
const SV = { x: 240, y: 44, w: 120, h: 60 };
const BK = { x: 456, y: 44, w: 120, h: 60 };
const ST = { x: 200, y: 172, w: 200, h: 64 };

type Pt = { x: number; y: number };
const C: Pt = { x: CL.x + CL.w, y: Y };
const SL: Pt = { x: SV.x, y: Y };
const SR: Pt = { x: SV.x + SV.w, y: Y };
const B: Pt = { x: BK.x, y: Y };
const SD: Pt = { x: SV.x + SV.w / 2, y: SV.y + SV.h };
const STT: Pt = { x: ST.x + ST.w / 2, y: ST.y };
const LOST: Pt = { x: (C.x + SL.x) / 2, y: Y };

/** a token's trip: legs of [from, to] in the window [a, b] of t */
type Leg = { a: number; b: number; from: Pt; to: Pt; tone: Tone; label?: string; fade?: boolean };
const leg = (a: number, b: number, from: Pt, to: Pt, tone: Tone, label?: string, fade?: boolean): Leg => ({ a, b, from, to, tone, label, fade });

type Frame = {
  legs: Leg[];
  charges: number;
  store: "none" | "processing" | "completed";
  client: string;
  clientTone?: Tone;
  server?: string;
  lost?: boolean;
  time: string;
};

const key = (v: string) => (v === "dbl" ? "order_123_pay_1" : "pay_abc123");

function frame(variant: string, step: number, t: number): Frame {
  const after = (x: number) => t >= x;
  if (variant === "nokey") {
    if (step === 0)
      return {
        legs: [leg(0, 0.28, C, SL, "lit", "$99"), leg(0.28, 0.55, SR, B, "lit", "$99"), leg(0.6, 0.88, B, SR, "ok", "txn_789")],
        charges: after(0.55) ? 1 : 0,
        store: "none",
        client: "waiting…",
        time: "T=0 → 3 s",
      };
    if (step === 1)
      return { legs: [leg(0, 0.5, SL, LOST, "ok", "txn_789", true)], charges: 1, store: "none", client: after(0.7) ? "timed out" : "waiting…", clientTone: after(0.7) ? "bad" : undefined, lost: after(0.5), time: "T=5 s" };
    return {
      legs: [leg(0, 0.28, C, SL, "warn", "$99"), leg(0.28, 0.55, SR, B, "warn", "$99"), leg(0.6, 0.8, B, SR, "ok"), leg(0.8, 1, SL, C, "ok")],
      charges: after(0.55) ? 2 : 1,
      store: "none",
      client: after(1) ? "paid twice" : "retrying…",
      clientTone: after(1) ? "bad" : undefined,
      time: "T=5.2 s",
    };
  }
  if (variant === "key") {
    if (step === 0)
      return {
        legs: [leg(0, 0.22, C, SL, "lit", "key"), leg(0.24, 0.44, SD, STT, "warn"), leg(0.5, 0.75, SR, B, "lit", "$99")],
        charges: after(0.75) ? 1 : 0,
        store: after(0.44) ? "processing" : "none",
        client: "waiting…",
        time: "T=0",
      };
    if (step === 1)
      return {
        legs: [leg(0, 0.24, B, SR, "ok", "txn_789"), leg(0.26, 0.46, SD, STT, "ok"), leg(0.52, 0.78, SL, LOST, "ok", "txn_789", true)],
        charges: 1,
        store: after(0.46) ? "completed" : "processing",
        client: after(0.88) ? "timed out" : "waiting…",
        clientTone: after(0.88) ? "bad" : undefined,
        lost: after(0.78),
        time: after(0.5) ? "T=5 s" : "T=3 s",
      };
    return {
      legs: [leg(0, 0.24, C, SL, "warn", "same key"), leg(0.26, 0.42, SD, STT, "warn"), leg(0.42, 0.58, STT, SD, "ok"), leg(0.62, 0.9, SL, C, "ok", "txn_789")],
      charges: 1,
      store: "completed",
      client: after(0.9) ? "success ✓" : "retrying…",
      clientTone: after(0.9) ? "ok" : undefined,
      server: t > 0.42 && t < 0.9 ? "cached" : undefined,
      time: "T=5.2 s",
    };
  }
  // double click
  if (step === 0)
    return { legs: [leg(0, 0.3, C, SL, "lit", "click 1"), leg(0.32, 0.56, SD, STT, "warn")], charges: 0, store: after(0.56) ? "processing" : "none", client: "spinner…", server: after(0.6) ? "fraud check" : undefined, time: "T=0.001 s" };
  if (step === 1)
    return {
      legs: [leg(0, 0.26, C, SL, "warn", "click 2"), leg(0.28, 0.44, SD, STT, "warn"), leg(0.44, 0.6, STT, SD, "warn"), leg(0.62, 0.9, SL, C, "warn", "in progress")],
      charges: 0,
      store: "processing",
      client: after(0.9) ? "processing…" : "spinner…",
      server: "fraud check",
      time: "T=2.001 s",
    };
  if (step === 2)
    return {
      legs: [leg(0, 0.3, SR, B, "lit", "$99"), leg(0.36, 0.6, B, SR, "ok", "success"), leg(0.64, 0.86, SD, STT, "ok")],
      charges: after(0.3) ? 1 : 0,
      store: after(0.86) ? "completed" : "processing",
      client: "processing…",
      server: "charging",
      time: "T=3.5 s",
    };
  return {
    legs: [leg(0, 0.24, C, SL, "warn", "retry"), leg(0.26, 0.42, SD, STT, "warn"), leg(0.42, 0.58, STT, SD, "ok"), leg(0.62, 0.9, SL, C, "ok", "cached")],
    charges: 1,
    store: "completed",
    client: after(0.9) ? "success ✓" : "processing…",
    clientTone: after(0.9) ? "ok" : undefined,
    time: "T=3.6 s",
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const nokey = variant === "nokey";
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  const toks = live.map((l) => {
    const p = seg(t, l.a, l.b);
    return { x: lerp(l.from.x, l.to.x, p), y: lerp(l.from.y, l.to.y, p), tone: l.tone, o: l.fade ? 1 - p * 0.6 : 1 };
  });
  // a leg's label sits above the middle of its wire, so it never runs into the boxes
  const labels = live.filter((l) => l.label && l.from.y === l.to.y).map((l) => ({ x: (l.from.x + l.to.x) / 2, text: narrow && l.label === "in progress" ? "wait" : l.label, tone: l.tone }));
  const storeTone: Tone = f.store === "processing" ? "warn" : f.store === "completed" ? "ok" : undefined;
  const storeSub = nokey ? (narrow ? "nothing" : "nothing to check") : f.store === "none" ? "—" : f.store === "processing" ? "processing" : narrow ? "completed" : "completed · txn_789";
  const twice = f.charges > 1;
  return (
    <g>
      <Box x={CL.x} y={CL.y} w={CL.w} h={CL.h} label="Client" sub={narrow && f.client === "processing…" ? "pending…" : f.client} tone={f.clientTone} />
      <Box x={SV.x} y={SV.y} w={SV.w} h={SV.h} label="Server" sub={narrow && f.server === "fraud check" ? "checking" : f.server || "payments"} tone={f.server === "cached" ? "ok" : undefined} />
      <Box x={BK.x} y={BK.y} w={BK.w} h={BK.h} label="Bank" sub={f.charges === 0 ? "card" : twice ? "charged ×2" : narrow ? "charged" : "charged $99"} tone={twice ? "bad" : f.charges ? "ok" : undefined} />
      <Wire d={`M${C.x} ${Y}H${SL.x}`} />
      <Wire d={`M${SR.x} ${Y}H${B.x}`} />
      <Wire d={`M${SD.x} ${SD.y}V${STT.y}`} opacity={nokey ? 0.35 : 1} />
      <Box x={ST.x} y={ST.y} w={ST.w} h={ST.h} label={nokey ? "no key" : key(variant)} sub={storeSub} tone={storeTone} dim={nokey} />
      <Txt x={ST.x + ST.w / 2} y={ST.y + ST.h + 22} k="k" tone={nokey ? "mute" : undefined}>
        idempotency store
      </Txt>
      {f.lost && (
        <g>
          <path className="ik-x" d={`M${LOST.x - 7} ${Y - 7}L${LOST.x + 7} ${Y + 7}M${LOST.x + 7} ${Y - 7}L${LOST.x - 7} ${Y + 7}`} />
          <Txt x={LOST.x} y={Y + 28} k="s" tone="bad">
            lost
          </Txt>
        </g>
      )}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={11} tone={k.tone} opacity={k.o} />
      ))}
      {labels.map((l, i) => (
        <Txt key={i} x={l.x} y={Y - 12} k="s" tone={l.tone}>
          {l.text}
        </Txt>
      ))}
      <Txt x={24} y={196} k="k" anchor="start" tone={twice ? "bad" : "mute"}>
        card charged
      </Txt>
      <Txt x={24} y={236} k="d" anchor="start" tone={twice ? "bad" : f.charges ? "ok" : undefined}>
        {`$${f.charges * 99}`}
      </Txt>
      <Txt x={W - 24} y={196} k="k" anchor="end" tone="mute">
        time
      </Txt>
      <Txt x={W - 24} y={228} anchor="end">
        {f.time}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ik-x{fill:none;stroke:var(--ax-bad);stroke-width:2.5}`,
  variants: [
    {
      id: "nokey",
      label: "No key",
      steps: [
        { caption: "The client POSTs a $99 payment. The server charges the bank, which returns txn_789.", tween: 2600 },
        { caption: "The response is lost on the way back. At 5 s the client times out and shows an error.", tween: 1800 },
        { caption: "The user clicks Try Again. Without a key the server can't tell it's a retry: charged twice.", tween: 2600, ms: 3400 },
      ],
    },
    {
      id: "key",
      label: "Idempotency key",
      steps: [
        { caption: "The request carries Idempotency-Key pay_abc123. The server records it as processing, then charges the bank.", tween: 2800 },
        { caption: "The bank returns txn_789 and the record becomes completed. The response is lost; the client times out.", tween: 2800 },
        { caption: "The retry reuses pay_abc123. The store says completed, so the server returns cached txn_789: charged once.", tween: 2800, ms: 3400 },
      ],
    },
    {
      id: "dbl",
      label: "Double click",
      steps: [
        { caption: "T=0: the user clicks Pay Now. Key order_123_pay_1 is new, so the server records processing.", tween: 2000 },
        { caption: "T=2 s: an impatient second click sends the same key. Found, processing: “Request in progress, please wait”.", tween: 2800 },
        { caption: "T=3.5 s: the bank charges the card once and the record becomes completed.", tween: 2600 },
        { caption: "T=3.6 s: the second click's retry finds completed and gets the cached success. Charged once.", tween: 2600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
