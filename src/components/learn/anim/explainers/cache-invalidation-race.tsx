/**
 * Write-update vs write-invalidate (week 4, day 2 · 2.4): requests A ($90) and B ($80) race on the
 * same product. The database ends at $80 either way; with write-update A's late cache SET leaves
 * $90 in the cache, with write-invalidate both just DELETE and the next read loads $80.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;
const A = { x: 24, y: 40, w: 132, h: 64 };
const B = { x: 24, y: 196, w: 132, h: 64 };
const DB = { x: 448, y: 26, w: 128, h: 96 };
const CA = { x: 448, y: 182, w: 128, h: 96 };

type Pt = { x: number; y: number };
const AD: [Pt, Pt] = [{ x: A.x + A.w, y: 66 }, { x: DB.x, y: 66 }];
const AC: [Pt, Pt] = [{ x: A.x + A.w, y: 86 }, { x: CA.x, y: 210 }];
const BD: [Pt, Pt] = [{ x: B.x + B.w, y: 214 }, { x: DB.x, y: 94 }];
const BC: [Pt, Pt] = [{ x: B.x + B.w, y: 234 }, { x: CA.x, y: 234 }];
const FILL: [Pt, Pt] = [{ x: DB.x + DB.w / 2, y: DB.y + DB.h }, { x: CA.x + CA.w / 2, y: CA.y }];
const rev = (l: [Pt, Pt]): [Pt, Pt] => [l[1], l[0]];

type Leg = { a: number; b: number; path: [Pt, Pt]; tone: Tone; label: string };
const L = (a: number, b: number, path: [Pt, Pt], tone: Tone, label: string): Leg => ({ a, b, path, tone, label });
type Frame = { legs: Leg[]; db: string; cache: string; clock: string; aSub: string; bSub: string; lit?: "AD" | "BD" | "AC" | "BC" | "FILL"; litB?: "AD" | "BD" | "AC" | "BC" };

function frame(v: string, step: number, t: number): Frame {
  const on = (x: number) => t >= x;
  if (v === "update") {
    if (step === 0) return { legs: [L(0, 0.45, rev(AD), "sky", "$100"), L(0.3, 0.75, rev(BD), "sky", "$100")], db: "$100", cache: "$100", clock: on(0.3) ? "T1.5" : "T1", aSub: on(0.45) ? "read $100" : "reading", bSub: on(0.75) ? "read $100" : on(0.3) ? "reading" : "waiting" };
    if (step === 1) return { legs: [L(0, 0.4, AD, "lit", "$90"), L(0.5, 0.9, BD, "lit", "$80")], db: on(0.9) ? "$80" : on(0.4) ? "$90" : "$100", cache: "$100", clock: on(0.5) ? "T3" : "T2", aSub: "DB ← $90", bSub: on(0.5) ? "DB ← $80" : "read $100", lit: on(0.5) ? "BD" : "AD" };
    if (step === 2) return { legs: [L(0, 0.4, BC, "warn", "$80"), L(0.5, 0.9, AC, "bad", "$90")], db: "$80", cache: on(0.9) ? "$90" : on(0.4) ? "$80" : "$100", clock: on(0.5) ? "T4" : "T3.5", aSub: on(0.5) ? "cache ← $90" : "DB ← $90", bSub: "cache ← $80", lit: on(0.5) ? "AC" : "BC" };
    return { legs: [], db: "$80", cache: "$90", clock: "after T4", aSub: "done", bSub: "done" };
  }
  if (step === 0) return { legs: [L(0, 0.35, AD, "lit", "$90"), L(0.45, 0.8, BD, "lit", "$80")], db: on(0.8) ? "$80" : on(0.35) ? "$90" : "$100", cache: "$100", clock: on(0.45) ? "T3" : "T2", aSub: "DB ← $90", bSub: on(0.45) ? "DB ← $80" : "read $100", lit: on(0.45) ? "BD" : "AD" };
  if (step === 1) return { legs: [L(0, 0.4, BC, "warn", "DEL"), L(0.5, 0.9, AC, "warn", "DEL")], db: "$80", cache: on(0.4) ? "—" : "$100", clock: on(0.5) ? "T4" : "T3.5", aSub: on(0.5) ? "DEL cache" : "DB ← $90", bSub: "DEL cache", lit: on(0.5) ? "AC" : "BC" };
  return { legs: [L(0.15, 0.7, FILL, "ok", "$80")], db: "$80", cache: on(0.7) ? "$80" : "—", clock: "next read", aSub: "done", bSub: "done", lit: "FILL" };
}

function Store({ b, label, price, tone, note }: { b: typeof DB; label: string; price: string; tone?: Tone; note?: string }) {
  return (
    <g>
      <rect className={`ax-box ${tone || ""}`} x={b.x} y={b.y} width={b.w} height={b.h} />
      <Txt x={b.x + b.w / 2} y={b.y + 24}>
        {label}
      </Txt>
      <Txt x={b.x + b.w / 2} y={b.y + 68} k="d" tone={tone}>
        {price}
      </Txt>
      {note && (
        <Txt x={b.x + b.w / 2} y={b.y + 88} k="s" tone={tone}>
          {note}
        </Txt>
      )}
    </g>
  );
}

function Scene({ variant, step, t }: SceneProps) {
  const f = frame(variant, step, t);
  const update = variant === "update";
  const stale = update && f.cache === "$90";
  const fresh = !update && step === 2 && f.cache === "$80";
  const empty = f.cache === "—";
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  const wires: [string, [Pt, Pt]][] = [
    ["AD", AD],
    ["AC", AC],
    ["BD", BD],
    ["BC", BC],
  ];
  return (
    <g>
      <Txt x={300} y={20} k="k" tone="mute">
        time
      </Txt>
      <Txt x={300} y={52} k="d">
        {f.clock}
      </Txt>
      {wires.map(([id, [p, q]]) => (
        <Wire key={id} d={`M${p.x} ${p.y}L${q.x} ${q.y}`} arrow tone={f.lit === id ? "lit" : undefined} opacity={f.lit === id ? 1 : 0.55} />
      ))}
      {!update && step === 2 && <Wire d={`M${FILL[0].x} ${FILL[0].y}V${FILL[1].y}`} arrow dash tone="ok" />}
      <Box x={A.x} y={A.y} w={A.w} h={A.h} label="Request A" sub={f.aSub} tone={f.lit === "AD" || f.lit === "AC" ? "lit" : undefined} />
      <Box x={B.x} y={B.y} w={B.w} h={B.h} label="Request B" sub={f.bSub} tone={f.lit === "BD" || f.lit === "BC" ? "lit" : undefined} />
      <Store b={DB} label="Database" price={f.db} tone={f.db === "$80" ? "ok" : undefined} />
      <Store
        b={CA}
        label="Cache"
        price={f.cache}
        tone={stale ? "bad" : fresh ? "ok" : empty ? "warn" : undefined}
        note={stale ? "STALE" : empty ? "empty" : fresh ? "fresh" : undefined}
      />
      {live.map((l, i) => {
        const p = ease(seg(t, l.a, l.b));
        return <Token key={i} x={lerp(l.path[0].x, l.path[1].x, p)} y={lerp(l.path[0].y, l.path[1].y, p)} s={11} tone={l.tone} label={l.label} />;
      })}
      {update && step === 3 && (
        <g>
          <path className="ir-ne" d={`M${FILL[0].x} ${FILL[0].y + 4}V${FILL[1].y - 4}`} />
          <Txt x={FILL[0].x + 14} y={(FILL[0].y + FILL[1].y) / 2 + 6} anchor="start" tone="bad">
            ≠
          </Txt>
        </g>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ir-ne{fill:none;stroke:var(--ax-bad);stroke-width:2;stroke-dasharray:5 4}`,
  variants: [
    {
      id: "update",
      label: "Write-update",
      steps: [
        { caption: "T1 and T1.5: requests A and B both read the product from the database at $100.", tween: 2000 },
        { caption: "T2: A writes $90 to the database. T3: B writes $80. Last write wins: the database holds $80.", tween: 2600 },
        { caption: "T3.5: B sets the cache to $80. T4: A's slower cache write lands after it: $90.", tween: 2600 },
        { caption: "Database $80, cache $90: readers now get the stale price from the cache.", ms: 3600 },
      ],
    },
    {
      id: "invalidate",
      label: "Write-invalidate",
      steps: [
        { caption: "Same race: A writes $90 at T2, B writes $80 at T3, and the database ends at $80.", tween: 2600 },
        { caption: "T3.5: B deletes the cache key. T4: A deletes it too; deleting twice is harmless.", tween: 2600 },
        { caption: "The next read misses and loads $80 from the database. No write-write race.", tween: 1800, ms: 3400 },
      ],
    },
  ],
  Scene,
});
