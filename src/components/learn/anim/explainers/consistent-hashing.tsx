/**
 * Consistent hashing (week 1, day 1 · 3.1 / 3.2): hash mod N reshuffles ~80% of keys going from
 * 4 to 5 partitions; on the ring, adding P4 between P2 and P3 moves only the arc (P2, P4], from P3.
 */
import { defineExplainer, polar, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 340;
const C = { x: 340, y: 178, r: 112 };

type P = { id: string; deg: number; tone: NonNullable<Tone> };
const BASE: P[] = [
  { id: "P0", deg: 50, tone: "sky" },
  { id: "P1", deg: 130, tone: "ok" },
  { id: "P2", deg: 220, tone: "warn" },
  { id: "P3", deg: 320, tone: "mute" },
];
const P4: P = { id: "P4", deg: 270, tone: "lit" };
const KEYS = [12, 34, 70, 95, 118, 150, 172, 190, 205, 236, 251, 262, 284, 300, 333, 350];

function owner(deg: number, parts: P[]): P {
  const sorted = [...parts].sort((a, b) => a.deg - b.deg);
  return sorted.find((p) => p.deg >= deg) || sorted[0];
}

function arc(a: number, b: number, r: number): string {
  const span = (b - a + 360) % 360 || 360;
  const s = polar(C.x, C.y, r, a);
  const e = polar(C.x, C.y, r, a + span);
  return `M${s.x.toFixed(1)} ${s.y.toFixed(1)}A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}

function Ring({ step, t, narrow }: SceneProps) {
  const added = step >= 2;
  const parts = added ? [...BASE, P4] : BASE;
  const sorted = [...parts].sort((a, b) => a.deg - b.deg);
  const showOwners = step >= 1;
  const grow = step === 1 ? t : 1;
  const p4in = step === 2 ? t : added ? 1 : 0;
  const moving = step >= 3;
  const mv = step === 3 ? seg(t, 0.15, 1) : moving ? 1 : 0;
  const movedKeys = KEYS.filter((k) => owner(k, BASE).id === "P3" && owner(k, [...BASE, P4]).id === "P4");
  return (
    <g>
      <circle cx={C.x} cy={C.y} r={C.r} className="ch-ring" />
      {/* ownership arcs: each partition owns (predecessor, itself] */}
      {showOwners &&
        sorted.map((p, i) => {
          const prev = sorted[(i - 1 + sorted.length) % sorted.length];
          const span = (p.deg - prev.deg + 360) % 360;
          const hot = moving && p.id === "P4";
          return <path key={p.id} d={arc(prev.deg, prev.deg + span * grow, C.r)} className={`ch-arc ${p.tone}${hot ? " hot" : ""}`} opacity={p.id === "P4" ? p4in : 1} />;
        })}
      {/* 0 and 2^31 marks */}
      <line x1={C.x} x2={C.x} y1={C.y - C.r - 8} y2={C.y - C.r + 8} className="ch-mark" />
      <Txt x={C.x} y={C.y - C.r - 14} k="s">
        0
      </Txt>
      <line x1={C.x} x2={C.x} y1={C.y + C.r - 8} y2={C.y + C.r + 8} className="ch-mark" />
      <Txt x={C.x} y={C.y + C.r + 26} k="s">
        2^31
      </Txt>
      {/* keys, just inside the ring */}
      {KEYS.map((k) => {
        const p = polar(C.x, C.y, C.r - 20, k);
        const before = owner(k, BASE);
        const after = owner(k, [...BASE, P4]);
        const moved = after.id !== before.id;
        const tone: Tone = !showOwners ? "mute" : moved && moving ? (mv > 0.5 ? after.tone : before.tone) : before.tone;
        return (
          <g key={k}>
            {moved && moving && <rect x={p.x - 9} y={p.y - 9} width={18} height={18} className="ch-halo" opacity={1 - Math.abs(mv - 0.5) * 1.2} />}
            <Token x={p.x} y={p.y} s={9} tone={tone} opacity={showOwners ? 1 : 0.7} />
          </g>
        );
      })}
      {/* partitions on the ring */}
      {parts.map((p) => {
        const pt = polar(C.x, C.y, C.r, p.deg);
        const lab = polar(C.x, C.y, C.r + 26, p.deg);
        const op = p.id === "P4" ? p4in : 1;
        return (
          <g key={p.id} opacity={op}>
            <rect x={pt.x - 9} y={pt.y - 9} width={18} height={18} className={`ch-node ${p.tone}`} />
            <Txt x={lab.x} y={lab.y + 5} tone={p.id === "P4" ? "lit" : undefined}>
              {p.id}
            </Txt>
          </g>
        );
      })}
      {/* tally */}
      <g className="ch-tally">
        <Txt x={24} y={40} k="k" anchor="start">
          {added ? "5 partitions" : "4 partitions"}
        </Txt>
        {!narrow && (
          <>
            <Txt x={24} y={62} k="s" anchor="start">
              16 keys
            </Txt>
            <Txt x={24} y={80} k="s" anchor="start">
              owner = next clockwise
            </Txt>
          </>
        )}
        {moving && (
          <g opacity={mv}>
            <Txt x={W - 24} y={40} k="k" anchor="end">
              keys moved
            </Txt>
            <Txt x={W - 24} y={78} k="d" anchor="end" tone="lit">
              {`${movedKeys.length}/16`}
            </Txt>
            <Txt x={W - 24} y={narrow ? 108 : 100} k="s" anchor="end">
              all from P3
            </Txt>
          </g>
        )}
      </g>
    </g>
  );
}

/* hash mod N: 20 keys with hash 100…119, 4 → 5 partitions */
const HASHES = Array.from({ length: 20 }, (_, i) => 100 + i);
const COLS = 5;
const colX = (c: number) => 84 + c * 108;
function slot(n: number, h: number) {
  const col = h % n;
  const k = HASHES.filter((x) => x % n === col).indexOf(h);
  return { x: colX(col) - 13 + (k % 2) * 26, y: 132 + Math.floor(k / 2) * 30 };
}

function ModN({ step, t, narrow }: SceneProps) {
  const after = step >= 1;
  const mv = step === 1 ? t : after ? 1 : 0;
  const moved = HASHES.filter((h) => h % 4 !== h % 5);
  return (
    <g>
      <Txt x={24} y={40} k="k" anchor="start">
        {after ? "hash(key) % 5" : "hash(key) % 4"}
      </Txt>
      <Txt x={24} y={62} k="s" anchor="start">
        {narrow ? "hash 100…119" : "20 keys, hash values 100…119"}
      </Txt>
      {Array.from({ length: COLS }, (_, c) => (
        <g key={c} opacity={c === 4 ? (after ? mv : 0.25) : 1}>
          <rect x={colX(c) - 40} y={86} width={80} height={28} className={`ax-box${c === 4 && after ? " lit" : ""}`} />
          <Txt x={colX(c)} y={105}>{`P${c}`}</Txt>
          <rect x={colX(c) - 40} y={114} width={80} height={196} className="mn-col" />
        </g>
      ))}
      {HASHES.map((h) => {
        const a = slot(4, h);
        const b = slot(5, h);
        const x = a.x + (b.x - a.x) * mv;
        const y = a.y + (b.y - a.y) * mv;
        const isMoved = h % 4 !== h % 5;
        const tone: Tone = after && isMoved ? "lit" : after ? "ok" : "mute";
        return <Token key={h} x={x} y={y} s={16} tone={tone} />;
      })}
      {step >= 2 && (
        <g>
          <rect x={W / 2 - 200} y={252} width={400} height={64} className="mn-verdict" />
          <Txt x={W / 2} y={282} k="d" tone="lit">
            {`${moved.length}/20 moved`}
          </Txt>
          <Txt x={W / 2} y={304} k="s">
            {narrow ? "only 100–103 stay" : "only 100–103 stay (hash % 4 = hash % 5)"}
          </Txt>
        </g>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.ch-ring{fill:none;stroke:var(--ax-line);stroke-width:1.5}
.ch-mark{stroke:var(--ax-fg4);stroke-width:1.5}
.ch-arc{fill:none;stroke-width:7;stroke-linecap:butt;opacity:.9}
.ch-arc.sky{stroke:var(--ax-sky)}.ch-arc.ok{stroke:var(--ax-ok)}.ch-arc.warn{stroke:var(--ax-amber)}.ch-arc.mute{stroke:var(--ax-fg4)}.ch-arc.lit{stroke:var(--ax-accent)}
.ch-arc.hot{stroke-width:11}
.ch-node{stroke:var(--c-bg,#000);stroke-width:2}
.ch-node.sky{fill:var(--ax-sky)}.ch-node.ok{fill:var(--ax-ok)}.ch-node.warn{fill:var(--ax-amber)}.ch-node.mute{fill:var(--ax-fg3)}.ch-node.lit{fill:var(--ax-accent)}
.ch-halo{fill:none;stroke:var(--ax-accent);stroke-width:2}
.mn-col{fill:none;stroke:var(--ax-line-soft);stroke-width:1;stroke-dasharray:3 5}
.mn-verdict{fill:var(--c-bg,#000);stroke:var(--ax-accent);stroke-width:1.5}
`,
  variants: [
    {
      id: "ring",
      label: "Hash ring",
      steps: [
        { caption: "Keys and partitions hash onto one ring, from 0 to 2^32 − 1. P0 and P1 sit in the first half, P2 and P3 in the second." },
        { caption: "Walk clockwise from a key: the first partition it meets owns it. Each partition owns the arc back to its predecessor.", tween: 1800 },
        { caption: "Add P4 at one point on the ring, between P2 and P3.", tween: 1000 },
        { caption: "Only keys in the arc (P2, P4] change owner, and they all come from P3: 3 of 16 keys move.", tween: 1800, ms: 3400 },
        { caption: "Every other key stays where it was. Adding one partition to N moves about 1/(N+1) of the data, from a single neighbour.", ms: 3600 },
      ],
    },
    {
      id: "modn",
      label: "hash % N",
      steps: [
        { caption: "Hash partitioning with hash(key) % 4: twenty keys, hash values 100 to 119, spread over four partitions." },
        { caption: "Add a fifth partition and every key is re-placed with hash % 5. Orange keys changed partition.", tween: 1800 },
        { caption: "16 of 20 keys moved: a key stays only when hash % 4 equals hash % 5. Going from 4 to 5 partitions moves about 80% of the data.", ms: 4200 },
      ],
    },
  ],
  Scene: (p) => (p.variant === "modn" ? <ModN {...p} /> : <Ring {...p} />),
});
