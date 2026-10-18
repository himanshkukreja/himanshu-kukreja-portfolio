/**
 * TCP head-of-line blocking vs QUIC (week 0, part 4 · 3.6 / 6.5 / 6.6): packets 1-5 carry HTTP
 * streams 1, 3 and 5; packet 2 is lost. TCP holds 3, 4, 5 until 2 is retransmitted, stalling every
 * stream; QUIC orders per stream, so only stream 3 waits.
 */
import { Box, defineExplainer, ease, lerp, seg, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const S = 34;
const SLOT = (i: number) => 330 + i * 48;
const BUF_Y = 92;
const APP_Y = 222;
const SRC = { x: 124, y: BUF_Y + S / 2 };
const LOSS_X = 232;
const STREAM = [1, 3, 5, 1, 3]; // stream of packets 1..5
const LOST = 1; // packet 2

type P = { x: number; y: number; tone: Tone; o: number };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const quic = variant === "quic";
  // which packets reach the application in step 1 (before the retransmit)
  const early = (i: number) => (quic ? STREAM[i] !== STREAM[LOST] : i === 0);
  const pk: P[] = STREAM.map((_, i) => {
    const slot = { x: SLOT(i) + S / 2, y: BUF_Y + S / 2 };
    const app = { x: SLOT(i) + S / 2, y: APP_Y + S / 2 };
    if (step === 0) {
      const p = ease(seg(t, i * 0.13, i * 0.13 + 0.34));
      if (i === LOST) {
        const q = Math.min(1, p / 0.42);
        return { x: lerp(SRC.x, LOSS_X, q), y: lerp(SRC.y, slot.y, q), tone: q >= 1 ? "bad" : "lit", o: p <= 0 ? 0 : q >= 1 ? Math.max(0, 1 - (p - 0.42) * 3) : 1 };
      }
      return { x: lerp(SRC.x, slot.x, p), y: lerp(SRC.y, slot.y, p), tone: p >= 1 ? "warn" : "lit", o: p <= 0 ? 0 : 1 };
    }
    if (step === 1) {
      if (i === LOST) return { ...slot, tone: undefined, o: 0 };
      if (early(i)) {
        const p = ease(seg(t, 0.15, 0.7));
        return { x: slot.x, y: lerp(slot.y, app.y, p), tone: p >= 1 ? "ok" : "warn", o: 1 };
      }
      return { ...slot, tone: "warn", o: 1 };
    }
    // step 2: retransmit packet 2, then the rest flow up
    if (i === LOST) {
      const p = ease(seg(t, 0, 0.42));
      const q = ease(seg(t, 0.5, 0.9));
      return p < 1 ? { x: lerp(SRC.x, slot.x, p), y: lerp(SRC.y, slot.y, p), tone: "sky", o: 1 } : { x: slot.x, y: lerp(slot.y, app.y, q), tone: q >= 1 ? "ok" : "sky", o: 1 };
    }
    if (early(i)) return { ...app, tone: "ok", o: 1 };
    const q = ease(seg(t, 0.5, 0.9));
    return { x: slot.x, y: lerp(slot.y, app.y, q), tone: q >= 1 ? "ok" : "warn", o: 1 };
  });
  const lostMark = step === 0 ? t > 0.25 : step === 1 || (step === 2 && t < 0.42);
  const status = (s: number): [string, Tone] => {
    if (step === 0) return t < 0.9 ? ["in flight", "lit"] : ["…", "mute"];
    if (step === 1) {
      if (quic && s !== STREAM[LOST]) return t > 0.7 ? ["delivered", "ok"] : ["…", "mute"];
      return [quic ? (narrow ? "waits for 2" : "waits for packet 2") : "blocked", "bad"];
    }
    return t > 0.9 ? ["delivered", "ok"] : quic && s !== STREAM[LOST] ? ["delivered", "ok"] : ["blocked", "bad"];
  };
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={quic ? "ok" : undefined}>
        {quic ? (narrow ? "HTTP/3 · QUIC · UDP" : "HTTP/3 · QUIC over UDP · per-stream order") : narrow ? "HTTP/2 · one TCP conn" : "HTTP/2 · one TCP connection · in-order bytes"}
      </Txt>
      <Box x={24} y={BUF_Y - 12} w={100} h={58} label="Sender" />
      <Wire d={`M${SRC.x} ${SRC.y}H${SLOT(0) - 8}`} dash arrow />
      <Txt x={LOSS_X} y={BUF_Y - 10} k="s" tone="mute">
        network
      </Txt>
      {lostMark && (
        <g>
          <Txt x={LOSS_X} y={SRC.y + 6} k="t" tone="bad">
            ✕
          </Txt>
          <Txt x={LOSS_X} y={SRC.y + 34} k="s" tone="bad">
            {narrow ? "2 lost" : "packet 2 lost"}
          </Txt>
        </g>
      )}
      {step === 2 && t < 0.45 && (
        <Txt x={LOSS_X} y={SRC.y + 34} k="s" tone="sky">
          {narrow ? "resend 2" : "retransmit 2"}
        </Txt>
      )}
      <Txt x={SLOT(0)} y={BUF_Y - 12} k="s" anchor="start">
        {quic ? "receiver" : narrow ? "TCP buffer" : "receiver (TCP buffer)"}
      </Txt>
      <Txt x={SLOT(0)} y={APP_Y - 12} k="s" anchor="start">
        application
      </Txt>
      {STREAM.map((s, i) => (
        <g key={i}>
          <rect className="hl-slot" x={SLOT(i)} y={BUF_Y} width={S} height={S} />
          <rect className="hl-slot" x={SLOT(i)} y={APP_Y} width={S} height={S} />
          <Txt x={SLOT(i) + S / 2} y={APP_Y + S + 18} k="s">
            {`s${s}`}
          </Txt>
          <line className="hl-up" x1={SLOT(i) + S / 2} x2={SLOT(i) + S / 2} y1={BUF_Y + S + 4} y2={APP_Y - 26} />
        </g>
      ))}
      {pk.map((p, i) =>
        p.o > 0 ? (
          <g key={i} opacity={p.o}>
            <rect className={`hl-pk ${p.tone || ""}`} x={p.x - S / 2 + 3} y={p.y - S / 2 + 3} width={S - 6} height={S - 6} />
            <text className="ax-t hl-num" x={p.x} y={p.y + 5} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ) : null,
      )}
      <Txt x={24} y={200} k="k" anchor="start" tone="mute">
        streams
      </Txt>
      {[1, 3, 5].map((s, k) => {
        const [txt, tone] = status(s);
        return (
          <g key={s}>
            <Txt x={24} y={228 + k * 28} k="s" anchor="start">
              {`stream ${s}`}
            </Txt>
            <Txt x={narrow ? 118 : 112} y={228 + k * 28} k="s" anchor="start" tone={tone}>
              {txt}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.hl-slot{fill:none;stroke:var(--ax-line);stroke-width:1.5;stroke-dasharray:3 4}
.hl-up{stroke:var(--ax-line-soft);stroke-width:1.5}
.hl-pk{fill:var(--ax-box);stroke:var(--ax-accent);stroke-width:2}
.hl-pk.ok{stroke:var(--ax-ok)}.hl-pk.warn{stroke:var(--ax-amber)}.hl-pk.bad{stroke:var(--ax-bad)}.hl-pk.sky{stroke:var(--ax-sky)}
.hl-num{font-size:14px}
@container ax (max-width:520px){.hl-num{font-size:17px}}`,
  variants: [
    {
      id: "tcp",
      label: "TCP (HTTP/2)",
      steps: [
        { caption: "HTTP/2 sends streams 1, 3 and 5 as packets 1–5 on one TCP connection. Packet 2 is lost.", tween: 2600, ms: 2400 },
        { caption: "TCP delivers bytes in order: 3, 4 and 5 arrived but must wait for 2. Every stream is blocked.", tween: 1600, ms: 3000 },
        { caption: "Packet 2 is retransmitted; only then do 2, 3, 4 and 5 reach the application, delayed.", tween: 2400, ms: 3200 },
      ],
    },
    {
      id: "quic",
      label: "QUIC (HTTP/3)",
      steps: [
        { caption: "The same five packets over QUIC, on UDP. Packet 2, carrying stream 3, is lost.", tween: 2600, ms: 2400 },
        { caption: "QUIC orders data per stream: streams 1 and 5 reach the application now. Only stream 3 waits.", tween: 1600, ms: 3000 },
        { caption: "Packet 2 is retransmitted and stream 3 catches up. A lost packet only delays its own stream.", tween: 2400, ms: 3200 },
      ],
    },
  ],
  Scene,
});
