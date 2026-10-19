/**
 * Case file "The iOS Bridge Story": the prototype's per-frame cost (simctl subprocess ~50 ms, PNG
 * ~30 ms, base64 ~20 ms = ~100 ms, so 10 FPS at best; a few FPS in practice over a WebSocket) against
 * the WebRTC engine: a one-frame queue that drops the old frame and keeps the newest, a paced
 * FastVideoTrack at the 45-90 FPS presets, and taps going back over the control WebSocket.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
const SIM = { x: 16, y: 40, w: 116, h: 64 };
const CLI = { x: 468, y: 40, w: 116, h: 64 };
const BAR = { x: 156, w: 288, y: 170, h: 28 }; // 100 ms → 288 px
const MS = BAR.w / 100;
const SEGS = [
  { ms: 50, name: "simctl subprocess", short: "simctl", tone: "warn" as Tone },
  { ms: 30, name: "PNG", short: "PNG", tone: "sky" as Tone },
  { ms: 20, name: "base64", short: "b64", tone: "lit" as Tone },
];

function Prototype({ step, t, clock, narrow }: SceneProps) {
  const fill = [step === 0 ? seg(t, 0.1, 1) : 1, step === 0 ? 0 : step === 1 ? seg(t, 0, 0.55) : 1, step === 0 ? 0 : step === 1 ? seg(t, 0.55, 1) : 1];
  const total = SEGS.reduce((s, x, i) => s + x.ms * fill[i], 0);
  const frames: { x: number; y: number; tone: Tone }[] = [];
  if (step === 2) {
    // a slow trickle of frames over the WebSocket: a few FPS
    const n = 2;
    for (let i = 0; i < n; i++) {
      const p = clock > 0 ? (clock * 0.22 + i / n) % 1 : 0.3 + i * 0.4;
      frames.push({ x: lerp(SIM.x + SIM.w, CLI.x, p), y: SIM.y + SIM.h / 2, tone: "warn" });
    }
  }
  const starts = SEGS.map((_, i) => BAR.x + SEGS.slice(0, i).reduce((a, s) => a + s.ms * MS, 0));
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start">
        {narrow ? "weekend 1 · screenshots" : "weekend 1 prototype · screenshot per frame"}
      </Txt>
      <Box x={SIM.x} y={SIM.y} w={SIM.w} h={SIM.h} label="Simulator" sub={narrow ? "Mac" : "on the Mac"} />
      <Box x={CLI.x} y={CLI.y} w={CLI.w} h={CLI.h} label="Client" sub={step === 2 ? "few FPS" : narrow ? "Windows" : "Windows dev"} tone={step === 2 ? "bad" : undefined} />
      <Wire d={`M${SIM.x + SIM.w} ${SIM.y + SIM.h / 2}H${CLI.x}`} arrow tone={step === 2 ? "warn" : undefined} />
      <Txt x={W / 2} y={SIM.y + SIM.h / 2 - 10} k="s" tone={step === 2 ? "warn" : "mute"}>
        {narrow ? "WebSocket · JSON" : "WebSocket · base64 frame in JSON"}
      </Txt>
      <Txt x={BAR.x} y={BAR.y - 14} k="s" anchor="start">
        {narrow ? "one frame" : "cost of one frame"}
      </Txt>
      <Txt x={BAR.x + BAR.w} y={BAR.y - 14} k="s" anchor="end" tone={total >= 99 ? "bad" : undefined}>
        {`${Math.round(total)} ms`}
      </Txt>
      <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} className="ib-bar" />
      {SEGS.map((s, i) => {
        const w = s.ms * MS * fill[i];
        const x0 = starts[i];
        return (
          <g key={s.name}>
            <rect x={x0} y={BAR.y} width={w} height={BAR.h} className={`ax-fill ${s.tone}`} />
            {fill[i] > 0 && (
              <Txt x={narrow && i === 2 ? BAR.x + BAR.w + 2 : x0 + (s.ms * MS) / 2} y={BAR.y + BAR.h + 22} k="s" anchor={narrow && i === 2 ? "end" : "middle"} tone={s.tone}>
                {narrow ? `${s.short} ${s.ms}` : `${i > 0 ? s.short : s.name} ~${s.ms}`}
              </Txt>
            )}
          </g>
        );
      })}
      <Txt x={W / 2} y={262} k="d" tone={step === 2 ? "bad" : step === 1 && t > 0.95 ? "warn" : "mute"}>
        {step === 0 ? "" : step === 1 ? (t > 0.95 ? "≤ 10 FPS" : "") : "a few FPS"}
      </Txt>
      <Txt x={W / 2} y={292} k="s" tone={step === 2 ? "bad" : "mute"}>
        {step === 2 ? (narrow ? "lags behind" : "visibly behind the simulator") : step === 1 && t > 0.95 ? (narrow ? "theoretical max" : "1,000 ms ÷ 100 ms: theoretical max") : ""}
      </Txt>
      {frames.map((f, i) => (
        <Token key={i} x={f.x} y={f.y} s={12} tone={f.tone} />
      ))}
    </g>
  );
}

const CAP = { x: 176, y: 40, w: 124, h: 64 };
const Q = { x: 340, y: 40, w: 100, h: 64 };
const TRK = { x: 250, y: 150, w: 156, h: 60 };
const CLI2 = { x: 476, y: 146, w: 108, h: 70 };
const DEV = { x: 16, y: 248, w: 168, h: 60 };
const SLOT = { x: Q.x + Q.w / 2 - 12, y: Q.y + 34, s: 22 };

function Engine({ step, t, clock, narrow }: SceneProps) {
  const toks: { x: number; y: number; tone: Tone; o?: number }[] = [];
  const capOut = { x: CAP.x + CAP.w, y: CAP.y + CAP.h / 2 };
  const slot = { x: SLOT.x + SLOT.s / 2, y: SLOT.y + SLOT.s / 2 };
  let slotTone: Tone = "lit";
  let filled = true;
  if (step === 0) {
    const p = seg(t, 0, 0.5);
    const q = seg(t, 0.5, 1);
    if (p < 1) toks.push({ x: lerp(SIM.x + SIM.w, CAP.x, p), y: SIM.y + SIM.h / 2, tone: "lit" });
    else if (q < 1) toks.push({ x: lerp(capOut.x, slot.x, q), y: lerp(capOut.y, slot.y, q), tone: "lit" });
    filled = q >= 1;
  }
  if (step === 1) {
    // a new frame arrives while the slot is full: the old one is dropped
    const c = clock > 0 ? (clock * 0.5) % 1 : t < 1 ? t : 0.75;
    const inP = seg(c, 0, 0.45);
    const drop = seg(c, 0.45, 0.9);
    if (inP < 1) toks.push({ x: lerp(capOut.x, slot.x - 26, inP), y: lerp(capOut.y, slot.y, inP), tone: "lit" });
    if (inP >= 1) toks.push({ x: slot.x - drop * 30, y: slot.y + drop * 50, tone: "bad", o: 1 - seg(drop, 0.7, 1) });
    slotTone = inP >= 1 ? "ok" : "lit";
  }
  if (step >= 2) slotTone = "ok";
  const pace = step === 2;
  if (pace) {
    for (let i = 0; i < 5; i++) {
      const p = clock > 0 ? (clock * 1.1 + i / 5) % 1 : (i + 0.5) / 5;
      const a = { x: TRK.x + TRK.w, y: TRK.y + TRK.h / 2 };
      const b = { x: CLI2.x, y: TRK.y + TRK.h / 2 };
      toks.push({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), tone: "ok" });
    }
  }
  const tap = step === 3;
  const tp = tap ? t : 0;
  const route = [
    { x: CLI2.x + CLI2.w / 2, y: CLI2.y + CLI2.h },
    { x: CLI2.x + CLI2.w / 2, y: DEV.y + DEV.h / 2 },
    { x: DEV.x + DEV.w, y: DEV.y + DEV.h / 2 },
  ];
  if (tap) {
    const p1 = seg(tp, 0, 0.25);
    const p2 = seg(tp, 0.25, 0.65);
    const p3 = seg(tp, 0.7, 1);
    if (p1 < 1) toks.push({ x: route[0].x, y: lerp(route[0].y, route[1].y, p1), tone: "sky" });
    else if (p2 < 1) toks.push({ x: lerp(route[1].x, route[2].x, p2), y: route[1].y, tone: "sky" });
    else if (p3 < 1) toks.push({ x: SIM.x + SIM.w / 2, y: lerp(DEV.y, SIM.y + SIM.h, p3), tone: "sky" });
  }
  return (
    <g>
      <Box x={SIM.x} y={SIM.y} w={SIM.w} h={SIM.h} label="Simulator" sub={narrow ? "Mac" : "on the Mac"} tone={tap && tp > 0.95 ? "sky" : undefined} />
      <Wire d={`M${SIM.x + SIM.w} ${SIM.y + SIM.h / 2}H${CAP.x}`} arrow />
      <Box x={CAP.x} y={CAP.y} w={CAP.w} h={CAP.h} label="Capture" sub={narrow ? "optimized" : "optimized shot"} tone={step <= 1 ? "lit" : undefined} />
      <Wire d={`M${capOut.x} ${capOut.y}H${Q.x}`} arrow />
      <rect x={Q.x} y={Q.y} width={Q.w} height={Q.h} className={`ax-box${step === 1 ? " warn" : ""}`} />
      <Txt x={Q.x + Q.w / 2} y={Q.y + 22}>
        queue
      </Txt>
      <rect x={SLOT.x} y={SLOT.y} width={SLOT.s} height={SLOT.s} className={`ib-slot${filled ? ` ${slotTone}` : ""}`} />
      <Txt x={Q.x + Q.w / 2} y={Q.y - 10} k="s">
        maxsize=1
      </Txt>
      {step === 1 && (
        <Txt x={Q.x - 12} y={Q.y + Q.h + 32} k="s" anchor="end" tone="bad">
          {narrow ? "old dropped" : "old frame dropped"}
        </Txt>
      )}
      <Wire d={`M${Q.x + Q.w / 2} ${Q.y + Q.h}V${TRK.y}`} arrow tone={step >= 2 ? "ok" : undefined} />
      <Box x={TRK.x} y={TRK.y} w={TRK.w} h={TRK.h} label={narrow ? "VideoTrack" : "FastVideoTrack"} sub={narrow ? "paced" : "paced · WebRTC"} tone={step === 2 ? "ok" : undefined} />
      <Wire d={`M${TRK.x + TRK.w} ${TRK.y + TRK.h / 2}H${CLI2.x}`} arrow tone={step === 2 ? "ok" : undefined} />
      <Box x={CLI2.x} y={CLI2.y} w={CLI2.w} h={CLI2.h} label="Client" sub={step >= 2 ? "45-90 FPS" : "Windows"} tone={step === 2 ? "ok" : tap ? "sky" : undefined} />
      {step === 2 && (
        <Txt x={CLI2.x + CLI2.w / 2} y={CLI2.y - 12} k="s" tone="ok">
          newest frame
        </Txt>
      )}
      <path className={`ib-ctl${tap ? " on" : ""}`} d={`M${route[0].x} ${route[0].y}V${route[1].y}H${route[2].x}`} />
      <Txt x={(route[1].x + route[2].x) / 2 + 20} y={route[1].y - 10} k="s" tone={tap ? "sky" : "mute"}>
        {narrow ? "control WS" : "control WebSocket · tap x, y"}
      </Txt>
      <Box x={DEV.x} y={DEV.y} w={DEV.w} h={DEV.h} label={narrow ? "Controller" : "Device Controller"} sub="simctl / idb" tone={tap ? "sky" : undefined} />
      <Wire d={`M${SIM.x + SIM.w / 2} ${DEV.y}V${SIM.y + SIM.h}`} arrow tone={tap ? "sky" : undefined} />
      {tap && (
        <Txt x={CLI2.x + CLI2.w / 2} y={CLI2.y - 12} k="s" tone="sky">
          {narrow ? "x, y scaled" : "click → x, y"}
        </Txt>
      )}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={12} tone={k.tone} opacity={k.o} />
      ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "rtc" ? <Engine {...p} /> : <Prototype {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ib-bar{fill:none;stroke:var(--ax-line);stroke-width:1.5}.ib-slot{fill:none;stroke:var(--ax-line);stroke-width:1.5;stroke-dasharray:3 3}.ib-slot.lit{fill:var(--ax-accent);stroke:var(--ax-accent);stroke-dasharray:none}.ib-slot.ok{fill:var(--ax-ok);stroke:var(--ax-ok);stroke-dasharray:none}.ib-ctl{fill:none;stroke:var(--ax-line);stroke-width:1.5;stroke-dasharray:5 6}.ib-ctl.on{stroke:var(--ax-sky);stroke-width:2.5}`,
  variants: [
    {
      id: "ws",
      label: "Screenshot loop",
      steps: [
        { caption: "Prototype: every frame starts with an xcrun simctl screenshot subprocess, about 50 ms of overhead.", tween: 1400, ms: 2600 },
        { caption: "PNG encoding adds ~30 ms and base64 ~20 ms: ~100 ms a frame, so 10 FPS at best.", tween: 1800, ms: 2800 },
        { caption: "Sent as JSON over a WebSocket, the stream crawled at a few frames a second, visibly behind the simulator.", tween: 900, ms: 3400, loop: true },
      ],
    },
    {
      id: "rtc",
      label: "WebRTC engine",
      steps: [
        { caption: "The capture loop puts each optimized screenshot into a frame queue that holds exactly one frame.", tween: 1600, ms: 2400 },
        { caption: "Queue full? Drop the old frame and keep the newest, so the stream never falls behind.", tween: 1400, ms: 3000, loop: true },
        { caption: "FastVideoTrack paces frames out over WebRTC at the preset rate: 45, 60, 75 or 90 FPS.", tween: 900, ms: 3000, loop: true },
        { caption: "Clicks go back on the control WebSocket, scaled to simulator coordinates, and become taps.", tween: 2000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
