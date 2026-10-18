/**
 * Quorum reads and writes (week 5, day 1 · 12.1 / 12.2): N = 3 replicas. W = 2, R = 2 overlaps,
 * so the read sees v2 (highest version wins, read repair fixes the stale copy); W = 1, R = 1 does
 * not overlap, so a read can return v1 after v2 was acknowledged.
 */
import { Box, defineExplainer, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const CL = { x: 24, y: 126, w: 120, h: 68 };
const RX = 400;
const RW = 172;
const RH = 58;
const RY = [26, 131, 236];
const NAMES = ["A", "B", "C"];
const FROM = { x: CL.x + CL.w, y: CL.y + CL.h / 2 };

/** point on the wire from the client to replica i (cubic curve), p 0 → 1 */
function onWire(i: number, p: number) {
  const y1 = RY[i] + RH / 2;
  const cx = (FROM.x + RX) / 2;
  const u = 1 - p;
  const x = u * u * u * FROM.x + 3 * u * u * p * cx + 3 * u * p * p * cx + p * p * p * RX;
  const y = u * u * u * FROM.y + 3 * u * u * p * FROM.y + 3 * u * p * p * y1 + p * p * p * y1;
  return { x, y };
}
const wireD = (i: number) => {
  const y1 = RY[i] + RH / 2;
  const cx = (FROM.x + RX) / 2;
  return `M${FROM.x} ${FROM.y}C${cx} ${FROM.y} ${cx} ${y1} ${RX} ${y1}`;
};

type Tok = { i: number; p: number; tone: Tone; o?: number };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const strong = variant === "strong";
  const toks: Tok[] = [];
  // versions per replica, the sets, the client's answer
  let ver = ["v1", "v1", "v1"];
  const tone: Tone[] = [undefined, undefined, undefined];
  const tag = ["", "", ""];
  let answer: string | null = null;
  let ansTone: Tone = undefined;
  let status = "";

  if (step === 0) {
    const out = seg(t, 0, 0.5);
    const back = seg(t, 0.5, 0.9);
    for (let i = 0; i < 3; i++) {
      const reaches = strong ? i < 2 : i === 0;
      if (out < 1) toks.push({ i, p: strong && i === 2 ? Math.min(out, 0.6) : reaches ? out : out * 0.55, tone: "lit", o: strong && i === 2 && out > 0.6 ? 0 : 1 });
      else if (reaches && back < 1) toks.push({ i, p: 1 - back, tone: "ok" });
      else if (!strong && !reaches) toks.push({ i, p: 0.55, tone: "lit", o: 0.55 });
      if (out >= 1 && reaches) ver[i] = "v2";
      if (out >= 1 && reaches) [tone[i], tag[i]] = ["lit", "ack"];
    }
    if (strong && out > 0.6) tag[2] = "missed";
    status = back >= 1 ? (strong ? "2 acks ≥ W=2 · ok" : "1 ack ≥ W=1 · ok") : "writing v2…";
  } else {
    ver = strong ? ["v2", "v2", "v1"] : ["v2", "v1", "v1"];
    const readSet = strong ? [1, 2] : [2];
    [tone[0], tag[0]] = ["lit", "has v2"];
    if (strong) [tone[1], tag[1]] = ["lit", "has v2"];
    if (step === 1) {
      const out = seg(t, 0, 0.5);
      const back = seg(t, 0.5, 1);
      for (const i of readSet) {
        if (out < 1) toks.push({ i, p: out, tone: "sky" });
        else if (back < 1) toks.push({ i, p: 1 - back, tone: ver[i] === "v2" ? "ok" : "bad" });
        tone[i] = out >= 1 ? (ver[i] === "v2" ? "ok" : "sky") : tone[i] || "sky";
        if (out >= 1) tag[i] = `replies ${ver[i]}`;
      }
      status = `read · R=${readSet.length}`;
    } else {
      for (const i of readSet) [tone[i], tag[i]] = [ver[i] === "v2" ? "ok" : strong ? "sky" : "bad", `replied ${ver[i]}`];
      if (strong) {
        answer = "v2";
        ansTone = "ok";
        const rp = seg(t, 0.3, 0.9);
        if (rp > 0 && rp < 1) toks.push({ i: 2, p: rp, tone: "ok" });
        if (rp >= 1) [ver[2], tone[2], tag[2]] = ["v2", "ok", "repaired"];
        status = rp > 0 ? "read repair → C" : "highest version wins";
      } else {
        answer = "v1";
        ansTone = "bad";
        const conv = seg(t, 0.45, 1);
        if (conv >= 1) [ver[1], ver[2]] = ["v2", "v2"];
        if (conv >= 1) [tone[1], tone[2], tag[1], tag[2]] = [undefined, undefined, "", "caught up"];
        status = conv >= 1 ? "replicas converge" : "stale read";
      }
    }
  }
  const sum = strong ? "2 + 2 = 4 > 3" : "1 + 1 = 2 < 3";

  return (
    <g>
      <Txt x={CL.x} y={34} k="k" anchor="start">
        {strong ? "N=3 · W=2 · R=2" : "N=3 · W=1 · R=1"}
      </Txt>
      <Txt x={CL.x} y={62} k="t" anchor="start" tone={strong ? "ok" : "bad"}>
        {narrow ? sum.replace(/ /g, "") : `W + R: ${sum}`}
      </Txt>
      {!narrow && (
        <Txt x={CL.x} y={84} k="s" anchor="start" tone={strong ? "ok" : "bad"}>
          {strong ? "read and write sets overlap" : "sets may not overlap"}
        </Txt>
      )}
      {[0, 1, 2].map((i) => (
        <Wire key={i} d={wireD(i)} tone={toks.some((k) => k.i === i && k.tone === "lit") ? "lit" : undefined} />
      ))}
      <Box x={CL.x} y={CL.y} w={CL.w} h={CL.h} label="Client" tone={answer ? ansTone : undefined} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Box x={RX} y={RY[i]} w={RW} h={RH} label={`Replica ${NAMES[i]}`} sub={tag[i] && !narrow ? `${ver[i]} · ${tag[i]}` : ver[i]} tone={tone[i]} />
        </g>
      ))}
      {toks.map((k, n) => {
        const p = onWire(k.i, k.p);
        return <Token key={n} x={p.x} y={p.y} s={11} tone={k.tone} opacity={k.o} />;
      })}
      <Txt x={CL.x} y={232} k="k" anchor="start" tone="mute">
        {narrow ? "status" : "client status"}
      </Txt>
      <Txt x={CL.x} y={254} k="s" anchor="start" tone={status.includes("ok") ? "ok" : status.includes("stale") ? "bad" : undefined}>
        {status}
      </Txt>
      {answer && (
        <g opacity={step === 2 ? Math.min(1, t * 3) : 1}>
          <Txt x={CL.x} y={300} k="d" anchor="start" tone={ansTone}>
            {`read → ${answer}`}
          </Txt>
        </g>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "strong",
      label: "W=2, R=2",
      steps: [
        { caption: "Write v2 goes to all 3 replicas. A and B ack; C misses it. W=2 met: success.", tween: 2400, ms: 2600 },
        { caption: "Read with R=2: replies come from B (v2) and C (v1). 2 + 2 > 3, so they overlap.", tween: 1800, ms: 2600 },
        { caption: "Highest version wins: the read returns v2. Read repair then copies v2 to stale C.", tween: 2000, ms: 3400 },
      ],
    },
    {
      id: "eventual",
      label: "W=1, R=1",
      steps: [
        { caption: "W=1: the write is acknowledged as soon as A has v2. B and C are still catching up.", tween: 2400, ms: 2600 },
        { caption: "R=1: the read asks only C, still on v1. 1 + 1 < 3, so the sets needn't overlap.", tween: 1800, ms: 2600 },
        { caption: "The client reads v1 after v2 was acknowledged. Later B and C converge: eventual consistency.", tween: 2200, ms: 3400 },
      ],
    },
  ],
  Scene,
});
