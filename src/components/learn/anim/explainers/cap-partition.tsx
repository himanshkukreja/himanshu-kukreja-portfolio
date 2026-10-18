/**
 * CAP during a partition (week 0, part 6 · 1.1 / 1.2): a client writes value = 100 to Node A while
 * a partition cuts A off from B; a read at B is then refused (CP) or answered with B's last known,
 * stale value (AP).
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const A = { x: 104, y: 104, w: 150, h: 76 };
const B = { x: 346, y: 104, w: 150, h: 76 };
const WR = { x: 24, y: 240, w: 150, h: 56 };
const RD = { x: 426, y: 240, w: 150, h: 56 };
const GAP = (A.x + A.w + B.x) / 2;
const LINK_Y = A.y + A.h / 2;

function Scene({ variant, step, t, narrow }: SceneProps) {
  const cp = variant === "cp";
  const cut = step === 0 ? ease(seg(t, 0.2, 0.7)) : 1;
  const write = step === 1 ? ease(seg(t, 0, 0.4)) : step > 1 ? 1 : 0;
  const repl = step === 1 ? ease(seg(t, 0.45, 0.85)) : 0;
  const read = step === 2 ? ease(seg(t, 0, 0.35)) : step > 2 ? 1 : 0;
  const reply = step === 2 ? ease(seg(t, 0.5, 0.9)) : step > 2 ? 1 : 0;
  const aVal = write >= 1 ? "value = 100" : "old value";
  const toks: { x: number; y: number; tone: Tone; label?: string; o?: number }[] = [];
  if (step === 1 && write > 0 && write < 1) toks.push({ x: lerp(WR.x + WR.w / 2, A.x + 40, write), y: lerp(WR.y, A.y + A.h, write), tone: "lit", label: "write 100" });
  if (step === 1 && repl > 0) toks.push({ x: lerp(A.x + A.w, GAP - 6, Math.min(1, repl * 1.4)), y: LINK_Y, tone: repl > 0.7 ? "bad" : "sky", o: repl > 0.7 ? Math.max(0, 1 - (repl - 0.7) * 3.3) : 1 });
  if (step === 2 && read > 0 && read < 1) toks.push({ x: lerp(RD.x + RD.w / 2, B.x + B.w - 40, read), y: lerp(RD.y, B.y + B.h, read), tone: "mute", label: "read" });
  if (step === 2 && reply > 0 && reply < 1)
    toks.push({ x: lerp(B.x + B.w - 40, RD.x + RD.w / 2 + 20, reply), y: lerp(B.y + B.h, RD.y, reply), tone: cp ? "bad" : "warn", label: cp ? "error" : "old value" });
  const answered = reply >= 1;
  const bSub = step >= 2 && read >= 1 ? (cp ? (narrow ? "refuses" : "can't confirm") : narrow ? "old value" : "answers: old value") : "old value";
  const bTone: Tone = step >= 2 && read >= 1 ? (cp ? "bad" : "warn") : undefined;
  const rdSub = answered ? (cp ? (narrow ? "error" : "error / timeout") : narrow ? "stale" : "got stale value") : step === 2 ? "reads" : "–";
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={cut > 0 ? "bad" : undefined}>
        {cut >= 1 ? (narrow ? "partition" : "network partition") : "replicating"}
      </Txt>
      {step === 3 && (
        <g>
          <Txt x={W - 24} y={44} k="d" anchor="end" tone={cp ? "sky" : "ok"}>
            {cp ? "CP" : "AP"}
          </Txt>
          <Txt x={W - 24} y={68} k="s" anchor="end">
            {cp ? (narrow ? "consistent" : "consistent, not available") : narrow ? "available" : "available, maybe stale"}
          </Txt>
        </g>
      )}
      <Box x={A.x} y={A.y} w={A.w} h={A.h} label="Node A" sub={aVal} tone={write >= 1 ? "ok" : undefined} />
      <Box x={B.x} y={B.y} w={B.w} h={B.h} label="Node B" sub={bSub} tone={bTone} />
      {/* the A ⇄ B link, cut in the middle by the partition */}
      <path className={cut > 0 ? "cp-link cut" : "cp-link"} d={`M${A.x + A.w} ${LINK_Y}H${GAP - 12 * cut}M${GAP + 12 * cut} ${LINK_Y}H${B.x}`} />
      {cut > 0 && (
        <g opacity={cut}>
          <path className="cp-zig" d={`M${GAP - 6} ${LINK_Y - 30}L${GAP + 6} ${LINK_Y - 14}L${GAP - 6} ${LINK_Y}L${GAP + 6} ${LINK_Y + 14}L${GAP - 6} ${LINK_Y + 30}`} />
          <Txt x={GAP} y={LINK_Y - 40} k="s" tone="bad">
            {narrow ? "cut" : "partition"}
          </Txt>
        </g>
      )}
      <Box x={WR.x} y={WR.y} w={WR.w} h={WR.h} label="Client" sub={write >= 1 ? "wrote 100" : "writer"} tone={step === 1 && write < 1 ? "lit" : undefined} />
      <Box x={RD.x} y={RD.y} w={RD.w} h={RD.h} label="Client" sub={rdSub} tone={answered ? (cp ? "bad" : "warn") : step === 2 ? "lit" : undefined} />
      <Wire d={`M${WR.x + WR.w / 2} ${WR.y}L${A.x + 40} ${A.y + A.h}`} arrow tone={step === 1 && write < 1 ? "lit" : undefined} />
      <Wire d={`M${RD.x + RD.w / 2} ${RD.y}L${B.x + B.w - 40} ${B.y + B.h}`} arrow tone={step === 2 && read < 1 ? "lit" : undefined} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={12} tone={k.tone} opacity={k.o} label={narrow ? undefined : k.label} />
      ))}
      {step === 3 && (
        <Txt x={W / 2} y={226} k="s" tone={cp ? "sky" : "ok"}>
          {cp ? (narrow ? "ZooKeeper · etcd" : "e.g. ZooKeeper · etcd") : narrow ? "Cassandra · DynamoDB" : "e.g. Cassandra · DynamoDB · DNS"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.cp-link{fill:none;stroke:var(--ax-line);stroke-width:1.5}.cp-link.cut{stroke:var(--ax-bad);stroke-dasharray:4 5}
.cp-zig{fill:none;stroke:var(--ax-bad);stroke-width:2.5}`,
  variants: [
    {
      id: "cp",
      label: "CP: refuse",
      steps: [
        { caption: "A network partition cuts Node A off from Node B: messages between them are lost or delayed.", tween: 1400, ms: 2600 },
        { caption: "A client writes value = 100 to Node A. Replication to Node B can't get through.", tween: 2000, ms: 2600 },
        { caption: "Another client reads from Node B. B can't confirm with A, so it refuses: error or timeout.", tween: 2000, ms: 3000 },
        { caption: "CP: consistency over availability. No stale answer is ever served. ZooKeeper and etcd choose this.", tween: 600, ms: 3400 },
      ],
    },
    {
      id: "ap",
      label: "AP: answer",
      steps: [
        { caption: "A network partition cuts Node A off from Node B: messages between them are lost or delayed.", tween: 1400, ms: 2600 },
        { caption: "A client writes value = 100 to Node A. Replication to Node B can't get through.", tween: 2000, ms: 2600 },
        { caption: "Another client reads from Node B. B answers with its last known value, which is stale.", tween: 2000, ms: 3000 },
        { caption: "AP: availability over consistency. Every request gets a response. Cassandra, DynamoDB and DNS lean this way.", tween: 600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
