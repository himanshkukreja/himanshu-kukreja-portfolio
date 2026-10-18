/**
 * Zero-downtime reindex (week 7, day 2 · 5.2 / 5.3): the app searches the "products" alias. A
 * new products_v2 gets the new mapping, CDC writes to both indexes (products_write → v2), the
 * old data is bulk-copied (op_type create), counts are checked within 0.1%, and one atomic
 * update_aliases call moves "products" to v2. v1 is deleted afterwards.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps } from "../kit";

const W = 600;
const H = 320;
const APP = { x: 24, y: 46, w: 112, h: 60 };
const CDC = { x: 24, y: 210, w: 112, h: 60 };
const AL = { x: 186, y: 46, w: 150, h: 60 };
const WA = { x: 186, y: 210, w: 150, h: 60 };
const V1 = { x: 412, y: 36, w: 164, h: 80 };
const V2 = { x: 412, y: 200, w: 164, h: 80 };

function Scene({ step, t, clock, narrow }: SceneProps) {
  const v2 = step >= 1;
  const v2In = step === 1 ? seg(t, 0, 0.4) : v2 ? 1 : 0;
  const copy = step === 2 ? seg(t, 0.1, 0.95) : step > 2 ? 1 : 0;
  const switched = step === 3 && t > 0.45;
  const deleted = step === 3 && t > 0.9;
  const readsTo = switched ? V2 : V1;
  const flow = (k: number, n: number, speed = 0.5) => (clock * speed + k / n) % 1;
  // a read: app → alias → index
  const read = (p: number) => {
    if (p < 0.4) return { x: lerp(APP.x + APP.w, AL.x, p / 0.4), y: APP.y + 30 };
    const q = (p - 0.4) / 0.6;
    return { x: lerp(AL.x + AL.w, readsTo.x, q), y: lerp(AL.y + 30, readsTo.y + 40, q) };
  };
  const cdcToV1 = (p: number) => ({ x: lerp(CDC.x + CDC.w, V1.x, p), y: lerp(CDC.y + 30, V1.y + 60, p) });
  const cdcToV2 = (p: number) => (p < 0.4 ? { x: lerp(CDC.x + CDC.w, WA.x, p / 0.4), y: CDC.y + 30 } : { x: lerp(WA.x + WA.w, V2.x, (p - 0.4) / 0.6), y: WA.y + 30 });
  const dual = v2 && !switched;
  const v1Count = "old mapping";
  return (
    <g>
      <Box x={APP.x} y={APP.y} w={APP.w} h={APP.h} label="App" sub="search" />
      <Box x={CDC.x} y={CDC.y} w={CDC.w} h={CDC.h} label="CDC" sub={narrow ? "updates" : "pipeline"} />
      <Box x={AL.x} y={AL.y} w={AL.w} h={AL.h} label="products" sub="alias" tone={step === 3 && switched && t < 1 ? "lit" : undefined} />
      <Box x={WA.x} y={WA.y} w={WA.w} h={WA.h} label={narrow ? "_write" : "products_write"} sub="alias" opacity={dual ? 1 : 0.18} tone={dual && step === 1 ? "lit" : undefined} />
      {/* wires */}
      <Wire d={`M${APP.x + APP.w} ${APP.y + 30}H${AL.x}`} arrow />
      <Wire d={`M${AL.x + AL.w} ${AL.y + 30}L${V1.x} ${V1.y + 40}`} arrow tone={switched ? "mute" : undefined} opacity={switched ? 0.3 : 1} />
      <Wire d={`M${AL.x + AL.w} ${AL.y + 30}L${V2.x} ${V2.y + 40}`} arrow tone={switched ? "lit" : "mute"} opacity={switched ? 1 : 0.2} />
      <Wire d={`M${CDC.x + CDC.w} ${CDC.y + 30}L${V1.x} ${V1.y + 60}`} arrow opacity={deleted ? 0.15 : switched ? 0.3 : 1} />
      <Wire d={`M${CDC.x + CDC.w} ${CDC.y + 30}H${WA.x}M${WA.x + WA.w} ${WA.y + 30}H${V2.x}`} arrow opacity={dual ? 1 : 0.18} tone={dual && step === 1 ? "lit" : undefined} />
      {switched && <Wire d={`M${CDC.x + CDC.w} ${CDC.y + 30}C${WA.x + 40} ${CDC.y + 70} ${V2.x - 60} ${V2.y + 70} ${V2.x} ${V2.y + 56}`} arrow />}
      {/* indexes */}
      <rect x={V1.x} y={V1.y} width={V1.w} height={V1.h} className={`ax-box${switched ? "" : " ok"}`} opacity={deleted ? 0.25 : 1} />
      <Txt x={V1.x + 14} y={V1.y + 28} k="t" anchor="start" tone={deleted ? "mute" : undefined}>
        products_v1
      </Txt>
      <Txt x={V1.x + 14} y={V1.y + 52} k="s" anchor="start" tone={deleted ? "bad" : undefined}>
        {deleted ? (narrow ? "deleted" : "deleted after 30 s") : v1Count}
      </Txt>
      <g opacity={v2In}>
        <rect x={V2.x} y={V2.y} width={V2.w} height={V2.h} className={`ax-box${switched ? " ok" : step === 1 ? " lit" : ""}`} />
        <Txt x={V2.x + 14} y={V2.y + 28} k="t" anchor="start">
          products_v2
        </Txt>
        <Txt x={V2.x + 14} y={V2.y + 50} k="s" anchor="start" tone={step === 1 ? "lit" : undefined}>
          {step === 1 ? "new mapping" : copy >= 1 ? "count ≈ v1" : `${Math.round(copy * 100)}% copied`}
        </Txt>
        <rect x={V2.x + 14} y={V2.y + 60} width={V2.w - 28} height={8} className="ax-meter" />
        <rect x={V2.x + 14} y={V2.y + 60} width={(V2.w - 28) * copy} height={8} className={`ax-fill${copy >= 1 ? " ok" : ""}`} />
      </g>
      {/* bulk copy v1 → v2 */}
      {step === 2 && (
        <g>
          <Wire d={`M${V1.x + V1.w / 2} ${V1.y + V1.h}V${V2.y}`} arrow dash tone="lit" />
          {copy < 1 && [0, 1, 2].map((k) => <Token key={k} x={V1.x + V1.w / 2} y={lerp(V1.y + V1.h + 4, V2.y - 6, flow(k, 3, 0.9))} s={8} tone="lit" />)}
          <Txt x={V1.x + V1.w / 2 - 10} y={(V1.y + V1.h + V2.y) / 2 + 4} k="s" anchor="end" tone="lit">
            {narrow ? "copy" : "bulk copy · op_type create"}
          </Txt>
        </g>
      )}
      {/* searches keep flowing the whole time */}
      {[0, 1].map((k) => {
        const p = read(flow(k, 2));
        return <Token key={`r${k}`} x={p.x} y={p.y} s={8} tone="sky" />;
      })}
      {dual &&
        [0].map((k) => {
          const p = flow(k, 1, 0.35);
          const a = cdcToV1(p);
          const b = cdcToV2(p);
          return (
            <g key={`w${k}`}>
              <Token x={a.x} y={a.y} s={8} tone="warn" />
              <Token x={b.x} y={b.y} s={8} tone="warn" />
            </g>
          );
        })}
      {step === 3 && (
        <Txt x={AL.x + AL.w / 2} y={AL.y + AL.h + 26} k="s" tone="lit">
          {narrow ? "atomic switch" : "atomic remove + add"}
        </Txt>
      )}
      <Txt x={24} y={306} k="s" anchor="start" tone="sky">
        {narrow ? "■ searches never stop" : "■ searches keep working throughout"}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "reindex",
      label: "Alias switch",
      steps: [
        { caption: "Before: the app searches the products alias, which points at products_v1.", tween: 1000, ms: 2600, loop: true },
        { caption: "Create products_v2 with the new mapping. CDC now writes to both; products_write points at v2.", tween: 1600, ms: 3000, loop: true },
        { caption: "Bulk-copy v1 into v2; op_type create won't overwrite newer dual-written docs. Searches still hit v1.", tween: 3200, ms: 2400, loop: true },
        { caption: "Counts match within 0.1%, so one atomic call moves the alias to v2. v1 is deleted afterwards.", tween: 2600, ms: 3400, loop: true },
      ],
    },
  ],
  Scene,
});
