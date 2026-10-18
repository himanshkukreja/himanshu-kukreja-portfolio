/**
 * Case file "The Great Video Call Revolution" (ConnectNow): the video path over WebSockets, every
 * frame relayed and processed by the server (200-500 ms, CPU at 95% with 50 calls), against WebRTC:
 * SDP offer / answer through a signaling server, ICE, then media peer to peer over UDP, with a TURN
 * relay for the ~10-20% of connections NAT won't let through.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const A = { x: 16, y: 128, w: 124, h: 64 };
const B = { x: 460, y: 128, w: 124, h: 64 };
const S = { x: 222, y: 22, w: 156, h: 66 };
const T = { x: 222, y: 236, w: 156, h: 60 };
const aR = { x: A.x + A.w, y: A.y + A.h / 2 };
const bL = { x: B.x, y: B.y + B.h / 2 };
const sB = { x: S.x + S.w / 2, y: S.y + S.h };
const tT = { x: T.x + T.w / 2, y: T.y };

type P = { x: number; y: number };
const qb = (a: P, c: P, b: P, p: number) => ({ x: (1 - p) * (1 - p) * a.x + 2 * (1 - p) * p * c.x + p * p * b.x, y: (1 - p) * (1 - p) * a.y + 2 * (1 - p) * p * c.y + p * p * b.y });
// A → server → B as one route (two quadratic legs)
const viaServer = (p: number) => (p < 0.5 ? qb({ x: aR.x, y: aR.y - 12 }, { x: sB.x - 60, y: aR.y - 12 }, sB, p * 2) : qb(sB, { x: sB.x + 60, y: bL.y - 12 }, { x: bL.x, y: bL.y - 12 }, p * 2 - 1));
const viaTurn = (p: number) => (p < 0.5 ? qb({ x: aR.x, y: aR.y + 14 }, { x: tT.x - 60, y: aR.y + 14 }, tT, p * 2) : qb(tT, { x: tT.x + 60, y: bL.y + 14 }, { x: bL.x, y: bL.y + 14 }, p * 2 - 1));

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  const rtc = variant === "rtc";
  const frames: { x: number; y: number; tone: Tone; o?: number }[] = [];
  const flow = (route: (p: number) => P, speed: number, n: number, tone: Tone, hold = false) => {
    for (let i = 0; i < n; i++) {
      const p = clock > 0 ? (clock * speed + i / n) % 1 : hold ? (i + 0.5) / n : -1;
      if (p >= 0) frames.push({ ...route(p), tone });
    }
  };
  let sLabel = narrow ? "WS server" : "WebSocket server";
  let sSub = narrow ? "relay hub" : "relays every frame";
  let sTone: Tone = undefined;
  let cpu = 0;
  let latency = "";
  let latTone: Tone = undefined;
  let direct = false;
  let turn = false;
  if (!rtc) {
    sTone = step >= 1 ? "bad" : "lit";
    if (step === 0) {
      const p = seg(t, 0, 0.9) * 0.5;
      if (t < 1) frames.push({ ...viaServer(p), tone: "lit" });
      flow((p) => viaServer(p * 0.5), 0.6, 3, "lit", true);
      cpu = 0.35;
    } else {
      flow(viaServer, step === 1 ? 0.35 : 0.5, step === 1 ? 4 : 7, step === 1 ? "warn" : "bad", true);
      if (step === 1 && t < 1) frames.push({ ...viaServer(lerp(0.5, 1, t)), tone: "warn" });
      cpu = step === 1 ? lerp(0.35, 0.6, t) : lerp(0.6, 0.95, t);
      latency = "200-500 ms";
      latTone = "bad";
      sSub = step === 2 ? (narrow ? "95% · 50 calls" : "CPU 95% · 50 calls") : sSub;
    }
  } else {
    sLabel = narrow ? "Signaling" : "Signaling server";
    sSub = narrow ? "setup only" : "setup · no video";
    if (step === 0) {
      sTone = "lit";
      const p1 = seg(t, 0, 0.45);
      const p2 = seg(t, 0.5, 0.95);
      if (p1 > 0 && p1 < 1) frames.push({ ...viaServer(p1), tone: "sky" });
      if (p2 > 0 && p2 < 1) frames.push({ ...viaServer(1 - p2), tone: "sky" });
    } else if (step === 1) {
      sTone = undefined;
      direct = t > 0.5;
    } else if (step === 2) {
      direct = true;
      flow((p) => ({ x: lerp(aR.x + 6, bL.x - 6, p), y: aR.y }), 0.9, 6, "ok", true);
      latency = "~100-300 ms";
      latTone = "ok";
    } else {
      turn = true;
      flow(viaTurn, 0.45, 5, "warn", true);
      latency = "relayed";
      latTone = "warn";
    }
  }
  const sigLabel = rtc && step === 0 ? (t < 0.5 ? "offer (SDP)" : "answer") : "";
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={rtc ? "sky" : undefined}>
        {rtc ? (narrow ? "WebRTC · UDP" : "WebRTC · P2P, UDP") : narrow ? "WebSocket·TCP" : "WebSocket · TCP"}
      </Txt>
      <Box x={A.x} y={A.y} w={A.w} h={A.h} label="User A" sub={narrow ? "camera" : "camera · 30 fps"} tone={!rtc || step >= 2 ? "lit" : undefined} />
      <Box x={B.x} y={B.y} w={B.w} h={B.h} label="User B" sub="display" tone={latTone} />
      <Box x={S.x} y={S.y} w={S.w} h={S.h} label={sLabel} sub={sSub} tone={sTone} dim={rtc && step >= 1} />
      <path className="wr-route" d={`M${aR.x} ${aR.y - 12}Q${sB.x - 60} ${aR.y - 12} ${sB.x} ${sB.y}Q${sB.x + 60} ${bL.y - 12} ${bL.x} ${bL.y - 12}`} opacity={rtc && step >= 1 ? 0.35 : 1} />
      {!rtc && (
        <g>
          <Meter x={S.x + S.w + 14} y={S.y + 20} w={narrow ? 66 : 76} h={12} value={cpu} max={1} tone={cpu > 0.8 ? "bad" : cpu > 0.5 ? "warn" : "sky"} />
          <Txt x={S.x + S.w + 14} y={S.y + 52} k="s" anchor="start" tone={cpu > 0.8 ? "bad" : undefined}>
            {`CPU ${Math.round(cpu * 100)}%`}
          </Txt>
        </g>
      )}
      {rtc && (
        <g>
          <Box x={T.x} y={T.y} w={T.w} h={T.h} label={step === 3 ? "TURN relay" : "STUN / TURN"} sub={step === 1 ? (narrow ? "public IPs" : "finds public IPs") : step === 3 ? (narrow ? "~10-20%" : "~10-20% of calls") : "NAT traversal"} tone={step === 1 ? "sky" : step === 3 ? "warn" : undefined} dim={step === 0 || step === 2} />
          {step === 1 && (
            <g opacity={seg(t, 0, 0.4)}>
              <Wire d={`M${aR.x} ${aR.y + 18}Q${tT.x - 40} ${aR.y + 18} ${tT.x - 20} ${tT.y}`} dash tone="sky" />
              <Wire d={`M${bL.x} ${bL.y + 18}Q${tT.x + 40} ${bL.y + 18} ${tT.x + 20} ${tT.y}`} dash tone="sky" />
              <Txt x={W / 2} y={aR.y + 46} k="s" tone="sky">
                ICE candidates
              </Txt>
            </g>
          )}
          {(direct || turn) && (
            <g>
              <Wire d={`M${aR.x} ${aR.y}H${bL.x}`} arrow tone={turn ? "bad" : "ok"} dash={turn} opacity={step === 1 ? seg(t, 0.5, 1) : 1} />
              <Txt x={W / 2} y={aR.y - 10} k="s" tone={turn ? "bad" : "ok"}>
                {turn ? (narrow ? "NAT blocks direct" : "NAT blocks the direct path") : narrow ? "direct P2P" : "direct, browser to browser"}
              </Txt>
            </g>
          )}
          {turn && <path className="wr-route turn" d={`M${aR.x} ${aR.y + 14}Q${tT.x - 60} ${aR.y + 14} ${tT.x} ${tT.y}Q${tT.x + 60} ${bL.y + 14} ${bL.x} ${bL.y + 14}`} />}
        </g>
      )}
      {sigLabel && (
        <Txt x={S.x + S.w / 2} y={S.y + S.h + 24} k="s" tone="sky">
          {sigLabel}
        </Txt>
      )}
      {frames.map((f, i) => (
        <Token key={i} x={f.x} y={f.y} s={10} tone={f.tone} opacity={f.o} />
      ))}
      {latency && (
        <Txt x={B.x + B.w / 2} y={B.y + B.h + 24} k="k" tone={latTone}>
          {latency}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.wr-route{fill:none;stroke:var(--ax-line);stroke-width:1.5}.wr-route.turn{stroke:var(--ax-amber);stroke-dasharray:5 6}`,
  variants: [
    {
      id: "ws",
      label: "WebSockets",
      steps: [
        { caption: "User A's camera makes 30 frames a second. Over WebSockets, every frame goes up to ConnectNow's server.", tween: 1600, ms: 2600, loop: true },
        { caption: "The server processes and forwards each frame to User B: 200-500 ms, seconds under packet loss.", tween: 1600, ms: 2800, loop: true },
        { caption: "All video flows through that one hub: CPU hit 95% with just 50 concurrent video calls.", tween: 1600, ms: 3400, loop: true },
      ],
    },
    {
      id: "rtc",
      label: "WebRTC",
      steps: [
        { caption: "WebRTC signals first: A's SDP offer and B's answer pass through a lightweight signaling server.", tween: 2200, ms: 2400 },
        { caption: "ICE candidates, found with STUN, open a direct path between the two browsers.", tween: 1600, ms: 2400 },
        { caption: "Video flows peer to peer over UDP, ~100-300 ms glass to glass. The server carries no video.", tween: 900, ms: 3200, loop: true },
        { caption: "When NAT blocks the direct path, about 10-20% of connections, a TURN server relays the media.", tween: 900, ms: 3400, loop: true },
      ],
    },
  ],
  Scene,
});
