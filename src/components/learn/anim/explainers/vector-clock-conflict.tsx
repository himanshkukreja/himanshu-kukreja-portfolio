/**
 * Conflict detection (week 5, day 4 · 1.2 / 3.1 / 3.2): last-write-wins syncs two carts and
 * silently loses item C; vector clocks catch the same kind of conflict. A writes X=1 {A:1},
 * B receives it {A:1, B:1}, C writes X=2 {C:1} concurrently: neither clock is before the other.
 */
import { defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ------------------------------------------------------------------ LWW cart */

const NODES = [
  { x: 40, label: "Node 1" },
  { x: 340, label: "Node 2" },
];

function Cart({ x, y, items, lost, fresh }: { x: number; y: number; items: string[]; lost?: string; fresh?: string }) {
  return (
    <g>
      {items.map((it, i) => {
        const tone: Tone = it === lost ? "bad" : it === fresh ? "lit" : undefined;
        return (
          <g key={it + i}>
            <rect x={x + i * 48} y={y} width={38} height={38} className={`ax-box${tone ? ` ${tone}` : ""}`} />
            <Txt x={x + i * 48 + 19} y={y + 25} tone={tone}>
              {it}
            </Txt>
            {it === lost && <path d={`M${x + i * 48 + 4} ${y + 4}L${x + i * 48 + 34} ${y + 34}`} className="vc-strike" />}
          </g>
        );
      })}
    </g>
  );
}

function LwwScene({ step, t, narrow }: SceneProps) {
  const added = step > 0 || t > 0.4;
  const synced = step >= 1 ? (step === 1 ? seg(t, 0.2, 0.9) : 1) : 0;
  const carts = [
    synced >= 1 ? ["A", "B", "D"] : added ? ["A", "B", "C"] : ["A", "B"],
    added ? ["A", "B", "D"] : ["A", "B"],
  ];
  return (
    <g>
      {NODES.map((n, i) => (
        <g key={n.label}>
          <rect x={n.x} y={40} width={220} height={150} className={`ax-box${i === 0 && synced >= 1 ? " bad" : ""}`} />
          <Txt x={n.x + 16} y={66} k="k" anchor="start">
            {n.label}
          </Txt>
          <Txt x={n.x + 204} y={66} k="s" anchor="end">
            {i === 1 && step >= 1 ? (narrow ? "last" : "synced last") : "cart"}
          </Txt>
          <Cart x={n.x + 16} y={96} items={carts[i]} fresh={added && step === 0 ? (i === 0 ? "C" : "D") : undefined} />
          {added && step === 0 && (
            <Txt x={n.x + 16} y={168} k="s" anchor="start" tone="lit">
              {i === 0 ? "user adds C" : "user adds D"}
            </Txt>
          )}
        </g>
      ))}
      {step >= 1 && (
        <g>
          <Wire d="M340 115H264" arrow tone="lit" />
          <Token x={lerp(336, 268, synced)} y={115} s={10} tone="lit" opacity={synced > 0 && synced < 1 ? 1 : 0} />
          <Txt x={300} y={104} k="s" tone="lit">
            LWW
          </Txt>
        </g>
      )}
      {step === 2 && (
        <g opacity={Math.min(1, t * 2.5)}>
          <Txt x={40} y={234} k="k" anchor="start" tone="bad">
            after sync, both
          </Txt>
          <Cart x={40} y={248} items={["A", "B", "D", "C"]} lost="C" />
          <Txt x={240} y={274} k="t" anchor="start" tone="bad">
            {narrow ? "C lost" : "C lost, no error"}
          </Txt>
        </g>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ vector clocks */

const LANES = [
  { id: "A", y: 74 },
  { id: "B", y: 168 },
  { id: "C", y: 262 },
];
const LX = 24;
const LEND = 392;
const EV = { a: 210, b: 330, c: 250 };
const vc = (a: number, b: number, c: number, narrow: boolean) => (narrow ? `{A:${a},B:${b},C:${c}}` : `{A:${a}, B:${b}, C:${c}}`);

function VcScene({ step, t, narrow }: SceneProps) {
  const aw = step > 0 || t > 0.5; // A has written
  const msg = step === 1 ? seg(t, 0, 0.5) : step > 1 ? 1 : 0;
  const bMerged = step === 1 ? t > 0.5 : step > 1;
  const bInc = step === 1 ? t > 0.8 : step > 1;
  const cw = step === 2 ? t > 0.5 : step > 2;
  const clocks = [aw ? vc(1, 0, 0, narrow) : vc(0, 0, 0, narrow), bInc ? vc(1, 1, 0, narrow) : bMerged ? vc(1, 0, 0, narrow) : vc(0, 0, 0, narrow), cw ? vc(0, 0, 1, narrow) : vc(0, 0, 0, narrow)];
  const hot = [step === 0, step === 1, step === 2];
  const cmp = step === 3;
  const reveal = cmp ? seg(t, 0, 0.8) : 0;
  return (
    <g>
      {LANES.map((l, i) => (
        <g key={l.id}>
          <Txt x={LX} y={l.y - 14} k="k" anchor="start" tone={hot[i] ? undefined : "mute"}>
            {`node ${l.id}`}
          </Txt>
          <line x1={LX} x2={LEND} y1={l.y} y2={l.y} className={`vc-lane${hot[i] ? " on" : ""}`} />
          <Txt x={LX} y={l.y + 24} k="s" anchor="start" tone={cmp && i === 0 ? "lit" : cmp && i === 2 ? "warn" : hot[i] ? undefined : "mute"}>
            {clocks[i]}
          </Txt>
        </g>
      ))}
      {/* A writes X=1 */}
      {aw && (
        <g>
          <circle cx={EV.a} cy={LANES[0].y} r={6} className="vc-dot lit" />
          <Txt x={EV.a} y={LANES[0].y - 12} k="s" tone="lit">
            X=1
          </Txt>
        </g>
      )}
      {/* A → B */}
      {msg > 0 && (
        <g>
          <Wire d={`M${EV.a} ${LANES[0].y}L${EV.b} ${LANES[1].y - 6}`} arrow dash tone={step === 1 ? "lit" : undefined} />
          {msg < 1 && <Token x={lerp(EV.a, EV.b, msg)} y={lerp(LANES[0].y, LANES[1].y, msg)} s={9} tone="lit" />}
        </g>
      )}
      {bMerged && (
        <g>
          <circle cx={EV.b} cy={LANES[1].y} r={6} className={`vc-dot${step === 1 ? " lit" : ""}`} />
          {!narrow && (
            <Txt x={EV.b} y={LANES[1].y + 24} k="s" tone={step === 1 ? "lit" : "mute"}>
              {bInc ? "merge, +1" : "merge"}
            </Txt>
          )}
        </g>
      )}
      {/* C writes X=2, concurrently */}
      {cw && (
        <g>
          <circle cx={EV.c} cy={LANES[2].y} r={6} className="vc-dot warn" />
          <Txt x={EV.c} y={LANES[2].y - 12} k="s" tone="warn">
            X=2
          </Txt>
        </g>
      )}
      {/* compare */}
      <rect x={412} y={40} width={164} height={250} className={`ax-box${cmp && reveal >= 1 ? " bad" : ""}`} opacity={cmp ? 1 : 0.45} />
      <Txt x={424} y={64} k="k" anchor="start" tone={cmp ? undefined : "mute"}>
        compare
      </Txt>
      {cmp ? (
        <g>
          <Txt x={424} y={96} k="s" anchor="start">
            A&apos;s write
          </Txt>
          <Txt x={424} y={116} k="s" anchor="start" tone="lit">
            {vc(1, 0, 0, true)}
          </Txt>
          <Txt x={424} y={144} k="s" anchor="start">
            C&apos;s write
          </Txt>
          <Txt x={424} y={164} k="s" anchor="start" tone="warn">
            {vc(0, 0, 1, true)}
          </Txt>
          <g opacity={seg(reveal, 0.2, 0.6)}>
            <Txt x={424} y={196} k="s" anchor="start">
              {"A: 1 > 0"}
            </Txt>
            <Txt x={424} y={216} k="s" anchor="start">
              {"C: 0 < 1"}
            </Txt>
          </g>
          <g opacity={seg(reveal, 0.6, 1)}>
            <Txt x={424} y={250} k="t" anchor="start" tone="bad">
              {"V1 || V2"}
            </Txt>
            <Txt x={424} y={274} k="s" anchor="start" tone="bad">
              concurrent
            </Txt>
          </g>
        </g>
      ) : (
        <Txt x={494} y={170} k="s" tone="mute">
          …
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "lww" ? <LwwScene {...p} /> : <VcScene {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.vc-strike{stroke:var(--ax-bad);stroke-width:2}.vc-lane{stroke:var(--ax-line);stroke-width:1.5}.vc-lane.on{stroke:var(--ax-fg4)}.vc-dot{fill:var(--ax-box);stroke:var(--ax-fg3);stroke-width:2}.vc-dot.lit{stroke:var(--ax-accent);fill:var(--ax-accent)}.vc-dot.warn{stroke:var(--ax-amber);fill:var(--ax-amber)}`,
  variants: [
    {
      id: "lww",
      label: "Last-write-wins",
      steps: [
        { caption: "Both nodes hold cart [A, B]. Concurrently, the user adds C on Node 1 and D on Node 2.", tween: 1600 },
        { caption: "The nodes sync with last-write-wins. Node 2 synced last, so its cart overwrites Node 1's.", tween: 1800 },
        { caption: "Both end up with [A, B, D]: item C is silently lost. LWW can't tell concurrent writes apart.", tween: 1200, ms: 3600 },
      ],
    },
    {
      id: "vector",
      label: "Vector clocks",
      steps: [
        { caption: "Every node starts at {A:0, B:0, C:0}. A writes X=1 and increments its own counter.", tween: 1400 },
        { caption: "A sends to B. B merges, taking the max of each counter, then increments: {A:1, B:1, C:0}.", tween: 2000 },
        { caption: "Meanwhile C writes X=2 without having seen A's write: {A:0, B:0, C:1}.", tween: 1400 },
        { caption: "A's write is ahead on A, C's on C. Neither happened before the other: concurrent, a conflict.", tween: 2400, ms: 3800 },
      ],
    },
  ],
  Scene,
});
