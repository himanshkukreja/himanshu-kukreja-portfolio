/**
 * Batching (week 6, day 2 · 5.1 collapse before you send): 50 reactions to Kabir's split arrive
 * evenly over 240 s, one every 4.8 s, into batch:{user}:{category}. A hybrid flush (10 items or 300 s
 * after the first) sends 5 pushes, the first after ~43 s, because the burst keeps tripping the count.
 * "Send the first at once, then batch the rest for 300 s" sends 2, the first instantly: the lesson's
 * pick for social.
 */
import { defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps } from "../kit";

const W = 600;
const H = 320;
const X0 = 40;
const X1 = 560;
const AX = 170;
const GAP = 4.8; // seconds between reactions
const COUNT = 50;
const tx = (s: number) => X0 + (s * (X1 - X0)) / 300;

/** per variant: when each reaction leaves, the pushes, and the cursor range of each step (seconds) */
const PLAN = {
  hybrid: {
    sentAt: (i: number) => GAP * (Math.floor(i / 10) * 10 + 9),
    pushes: [1, 2, 3, 4, 5].map((b) => GAP * (b * 10 - 1)),
    cursor: [
      [0, 40],
      [40, 44],
      [44, 300],
    ],
    held: "in the batch",
    max: 10,
    first: "~43 s",
  },
  leading: {
    sentAt: (i: number) => (i === 0 ? 0 : 300),
    pushes: [0, 300],
    cursor: [
      [0, 1],
      [1, 240],
      [240, 300],
    ],
    held: "held for the summary",
    max: 49,
    first: "0 s",
  },
};

function Scene({ variant, step, t, narrow }: SceneProps) {
  const lead = variant === "leading";
  const p = lead ? PLAN.leading : PLAN.hybrid;
  const [c0, c1] = p.cursor[Math.min(step, 2)];
  const cur = lerp(c0, c1, seg(t, 0.05, 0.95));
  const arrived = Array.from({ length: COUNT }, (_, i) => i).filter((i) => GAP * i <= cur + 1e-6);
  const inBatch = arrived.filter((i) => p.sentAt(i) > cur + 1e-6).length;
  const sent = p.pushes.filter((s) => s <= cur + 1e-6);
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "50 reactions to a split" : "50 reactions to Kabir's split · batch:{user}:{category}"}
      </Txt>
      <Txt x={24} y={58} k="s" anchor="start" tone="lit">
        {lead ? (narrow ? "first now, rest in 300 s" : "send the first at once, batch the rest for 300 s") : narrow ? "10 items or 300 s" : "flush at 10 items or 300 s after the first"}
      </Txt>
      {/* the timeline */}
      <Wire d={`M${X0} ${AX}H${X1}`} />
      {[0, 60, 120, 180, 240, 300].map((s) => (
        <g key={s}>
          <line className="bf-tick" x1={tx(s)} x2={tx(s)} y1={AX} y2={AX + 6} />
          <Txt x={tx(s)} y={AX + 24} k="s" tone="mute">
            {s === 0 ? "0 s" : s === 300 ? "300 s" : String(s)}
          </Txt>
        </g>
      ))}
      {arrived.map((i) => (
        <Token key={i} x={tx(GAP * i)} y={AX - 12} s={5} tone={p.sentAt(i) <= cur + 1e-6 ? "ok" : "lit"} />
      ))}
      {cur > 0.5 && cur < 299.5 && <Wire d={`M${tx(cur)} ${AX - 66}V${AX + 4}`} tone="lit" dash />}
      {sent.map((s, k) => (
        <g key={s}>
          <Wire d={`M${tx(s)} ${AX - 20}V${AX - 46}`} tone="ok" />
          <Token x={tx(s)} y={AX - 54} s={12} tone="ok" label={narrow ? String(k + 1) : `push ${k + 1}`} />
        </g>
      ))}
      {/* the batch and the score */}
      <Txt x={X0} y={226} k="s" anchor="start" tone={inBatch ? "lit" : undefined}>
        {narrow ? (lead ? "held" : "in batch") : p.held}
      </Txt>
      <Txt x={X0 + 250} y={226} k="s" anchor="end" tone={inBatch ? "lit" : undefined}>
        {`${inBatch}/${p.max}`}
      </Txt>
      <Meter x={X0} y={236} w={250} h={14} value={inBatch} max={p.max} ticks={lead ? undefined : 10} tone="lit" />
      <Txt x={X0} y={284} k="s" anchor="start" tone="mute">
        {narrow ? "items stay in the inbox" : "the items are in the inbox already"}
      </Txt>
      <Txt x={400} y={254} k="d" tone={sent.length ? "ok" : "mute"}>
        {String(sent.length)}
      </Txt>
      <Txt x={400} y={278} k="s">
        {sent.length === 1 ? "push" : "pushes"}
      </Txt>
      <Txt x={510} y={254} k="d" tone={sent.length ? (lead ? "ok" : "warn") : "mute"}>
        {sent.length ? p.first : "–"}
      </Txt>
      <Txt x={510} y={278} k="s">
        {narrow ? "first" : "first push"}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.bf-tick{stroke:var(--ax-line);stroke-width:1.5}`,
  variants: [
    {
      id: "hybrid",
      label: "10 items or 300 s",
      steps: [
        { caption: "Reactions to Kabir's split arrive evenly, 50 in 240 seconds: one every 4.8 s. Each is held in batch:{user}:{category} instead of being pushed on its own.", tween: 2600 },
        { caption: "The batcher flushes at 10 items or 300 s after the first, whichever comes first. The 10th reaction lands at ~43 s, so the first push goes then.", tween: 1600 },
        { caption: "A burst keeps tripping the count: the 20th at ~91 s, and so on. Kabir gets 5 pushes, and waited ~43 s for the first.", tween: 3400, ms: 3400 },
      ],
    },
    {
      id: "leading",
      label: "First at once",
      steps: [
        { caption: "Same 50 reactions, another rule: send the first at once, so Kabir gets instant feedback.", tween: 1400 },
        { caption: "The other 49 are held for 300 s from the first; there's no count to trip, so the burst stays quiet.", tween: 3400 },
        { caption: "At 300 s they leave as one summary: 2 pushes in all, the first instant. The lesson ships this one for social: instant feedback, then quiet.", tween: 1800, ms: 3400 },
      ],
    },
  ],
  Scene,
});
