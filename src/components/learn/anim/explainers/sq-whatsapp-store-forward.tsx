/**
 * WhatsApp store-and-forward (side quest 2 · Phase 3 message flow / Deep Dive 3 offline
 * handling): the server only routes an encrypted blob and tracks delivery. Online Bob: one tick
 * on the server's ACK, two on his device's delivered ACK, blue on the read receipt. Offline Bob:
 * the message waits in his offline queue, is drained when he reconnects, resent after a dropped
 * link, and deleted only once his device ACKs.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 272;
type Pt = { x: number; y: number };
const Y = 72;
const AR: Pt = { x: 148, y: Y };
const SL: Pt = { x: 238, y: Y };
const SR: Pt = { x: 362, y: Y };
const BL: Pt = { x: 452, y: Y };
const SD: Pt = { x: 300, y: 104 };
const QT: Pt = { x: 300, y: 164 };
const CUT: Pt = { x: 407, y: Y };

type Leg = { a: number; b: number; from: Pt; to: Pt; tone: Tone; label: string };
const leg = (a: number, b: number, from: Pt, to: Pt, tone: Tone, label: string): Leg => ({ a, b, from, to, tone, label });

type Frame = { legs: Leg[]; ticks: 0 | 1 | 2 | 3; bob: string; bobT?: Tone; bobDim?: boolean; queue: string; queueT?: Tone; lost?: boolean };

function frame(variant: string, step: number, t: number): Frame {
  const after = (x: number) => t >= x;
  if (variant === "online") {
    if (step === 0)
      return { legs: [leg(0, 0.45, AR, SL, "lit", "encrypted blob for bob@wa"), leg(0.55, 0.85, SL, AR, "ok", "server ACK: sent")], ticks: after(0.85) ? 1 : 0, bob: "online", queue: "empty" };
    if (step === 1)
      return {
        legs: [leg(0, 0.35, SR, BL, "lit", "registry → route to Bob's process"), leg(0.4, 0.65, BL, SR, "ok", "delivered ACK from Bob's device"), leg(0.7, 0.95, SL, AR, "ok", "delivered")],
        ticks: after(0.95) ? 2 : 1,
        bob: after(0.35) ? "has it" : "online",
        bobT: after(0.35) ? "ok" : undefined,
        queue: "empty",
      };
    return {
      legs: [leg(0, 0.4, BL, SR, "sky", "read receipt: Bob opened the chat"), leg(0.45, 0.85, SL, AR, "sky", "read")],
      ticks: after(0.85) ? 3 : 2,
      bob: "read it",
      bobT: "sky",
      queue: "empty",
    };
  }
  if (step === 0)
    return {
      legs: [leg(0, 0.35, AR, SL, "lit", "encrypted blob for bob@wa"), leg(0.4, 0.62, SL, AR, "ok", "server ACK: sent"), leg(0.66, 0.9, SD, QT, "warn", "Bob is offline: store in his queue")],
      ticks: after(0.62) ? 1 : 0,
      bob: "offline",
      bobDim: true,
      queue: after(0.9) ? "Hello · seq 1" : "empty",
      queueT: after(0.9) ? "warn" : undefined,
    };
  if (step === 1)
    return {
      legs: [leg(0, 0.25, BL, SR, "sky", "Bob comes online (TCP)"), leg(0.3, 0.45, QT, SD, "lit", "drain queue"), leg(0.5, 0.75, SR, CUT, "lit", "Hello")],
      ticks: 1,
      bob: after(0.75) ? "link dropped" : after(0.25) ? "online" : "offline",
      bobT: after(0.75) ? "bad" : undefined,
      bobDim: !after(0.25),
      queue: "Hello · no ACK",
      queueT: "warn",
      lost: after(0.75),
    };
  return {
    legs: [
      leg(0, 0.2, BL, SR, "sky", "reconnect"),
      leg(0.22, 0.36, QT, SD, "lit", "resend unacknowledged"),
      leg(0.38, 0.58, SR, BL, "lit", "Hello, same message ID"),
      leg(0.6, 0.75, BL, SR, "ok", "delivery ACK"),
      leg(0.78, 0.95, SL, AR, "ok", "delivered"),
    ],
    ticks: after(0.95) ? 2 : 1,
    bob: after(0.58) ? "has it" : "online",
    bobT: after(0.58) ? "ok" : undefined,
    queue: after(0.75) ? "empty · deleted" : "Hello · no ACK",
    queueT: after(0.75) ? "ok" : "warn",
  };
}

/** one tick mark at (x, y) */
const tick = (x: number, y: number) => `M${x} ${y}l4 4l8 -9`;

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  const msg = live[0];
  const tk = f.ticks;
  const tickTone = tk === 3 ? "sq-tk sq-read" : "sq-tk";
  const status = tk === 0 ? "sending…" : tk === 1 ? "sent" : tk === 2 ? "delivered" : "read";
  return (
    <g>
      <Box x={24} y={40} w={124} h={64} label="Alice" sub="phone" />
      <Box x={238} y={40} w={124} h={64} label="Server" sub={narrow ? "ciphertext" : "sees ciphertext"} tone={msg ? "lit" : undefined} />
      <Box x={452} y={40} w={124} h={64} label="Bob" sub={f.bob} tone={f.bobT} dim={f.bobDim} />
      <Wire d={`M${AR.x} ${Y}H${SL.x}`} />
      <Wire d={`M${SR.x} ${Y}H${BL.x}`} />
      <Wire d={`M${SD.x} ${SD.y}V${QT.y}`} dash />
      <Box x={220} y={164} w={160} h={56} label="Bob's queue" sub={f.queue} tone={f.queueT} />
      <Txt x={300} y={242} k="s" tone="mute">
        {narrow ? "kept ≤ 30 days" : "kept up to 30 days"}
      </Txt>
      {f.lost && (
        <g>
          <path className="sq-x" d={`M${CUT.x - 7} ${Y - 7}L${CUT.x + 7} ${Y + 7}M${CUT.x + 7} ${Y - 7}L${CUT.x - 7} ${Y + 7}`} />
          <Txt x={CUT.x} y={Y + 26} k="s" tone="bad">
            drop
          </Txt>
        </g>
      )}
      {live.map((l, i) => {
        const p = seg(t, l.a, l.b);
        return <Token key={i} x={lerp(l.from.x, l.to.x, p)} y={lerp(l.from.y, l.to.y, p)} s={11} tone={l.tone} />;
      })}
      {msg && (
        <Txt x={24} y={24} k="s" anchor="start" tone={msg.tone}>
          {`→ ${msg.label}`}
        </Txt>
      )}
      {/* Alice's screen: the bubble and its ticks */}
      <Txt x={24} y={158} k="k" anchor="start" tone="mute">
        {narrow ? "Alice sees" : "Alice's screen"}
      </Txt>
      <rect className="sq-bubble" x={24} y={172} width={150} height={44} />
      <Txt x={38} y={199} anchor="start">
        Hello
      </Txt>
      {tk >= 1 && <path className={tickTone} d={tick(tk >= 2 ? 136 : 146, 192)} />}
      {tk >= 2 && <path className={tickTone} d={tick(146, 192)} />}
      <Txt x={24} y={240} k="s" anchor="start" tone={tk === 3 ? "sky" : tk === 2 ? "ok" : undefined}>
        {status}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sq-x{fill:none;stroke:var(--ax-bad);stroke-width:2.5}
.sq-bubble{fill:var(--ax-box);stroke:var(--ax-line);stroke-width:1.5}
.sq-tk{fill:none;stroke:var(--ax-fg3);stroke-width:2}.sq-tk.sq-read{stroke:var(--ax-sky);stroke-width:2.5}`,
  variants: [
    {
      id: "online",
      label: "Bob online",
      steps: [
        { caption: "Alice's phone encrypts “Hello” for Bob and sends the blob. The server ACKs: one tick, sent.", tween: 2000 },
        { caption: "The user registry says which server holds Bob. The blob is routed; his device ACKs: two ticks, delivered.", tween: 2600 },
        { caption: "Bob opens the chat and his read receipt flows back: blue ticks. The server never decrypted anything.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "offline",
      label: "Bob offline",
      steps: [
        { caption: "Bob's phone is off. The server ACKs Alice (one tick) and stores the blob in Bob's offline queue.", tween: 2400 },
        { caption: "Bob comes online and the server drains his queue, but the link drops before his ACK. The message stays queued.", tween: 2600, ms: 3200 },
        { caption: "Resent on reconnect, Bob's device skips IDs it already has and ACKs. Only now is it deleted: two ticks.", tween: 3200, ms: 3600 },
      ],
    },
  ],
  Scene,
});
