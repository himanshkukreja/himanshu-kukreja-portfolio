/**
 * Key splitting / salting (week 1, day 4 · 3.3): the logical hot key "viral_url_abc" becomes ten
 * physical keys viral_url_abc:0 … :9 on partitions 0-9. Reads pick a random suffix, so the load
 * spreads; writes go to every suffix, so they are amplified by the split factor.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const N = 10;
const HOT = 3;
const COL = (i: number) => ({ x: 24 + i * 56, w: 48 });
const TOP = 188;
const BOT = 288;
const SRC = { x: 24, y: 56, w: 172, h: 60 };
const RT = { x: 244, y: 56, w: 140, h: 60 };
const OUT = { x: RT.x + RT.w / 2, y: RT.y + RT.h };
const FLOW = 10; // flowing read tokens
const pick = (i: number) => (i * 7 + 3) % N; // a fixed "random" suffix per token

function Scene({ step, t, clock, narrow }: SceneProps) {
  const split = step === 1 ? ease(seg(t, 0.1, 0.9)) : step > 1 ? 1 : 0;
  const shown = (i: number) => split * N > i;
  const spread = step === 2 ? ease(seg(t, 0, 0.7)) : step === 3 ? 1 : 0;
  const base = 0.14;
  const load = (i: number) => {
    const hot = i === HOT ? 0.84 : 0;
    const even = 0.84 / N;
    return base + lerp(hot, even, spread);
  };
  const write = step === 3 ? ease(seg(t, 0.15, 0.75)) : 0;
  const toks: { x: number; y: number; tone: Tone }[] = [];
  if (step === 0 || step === 2) {
    for (let k = 0; k < FLOW; k++) {
      const ph = (clock * 0.55 + k / FLOW) % 1;
      const target = step === 2 ? pick(k) : HOT;
      const c = COL(target);
      toks.push({ x: lerp(OUT.x, c.x + c.w / 2, ph), y: lerp(OUT.y + 6, TOP - 8, ph), tone: step === 2 ? "ok" : "warn" });
    }
  }
  if (step === 3 && write > 0 && write < 1) {
    for (let i = 0; i < N; i++) toks.push({ x: lerp(OUT.x, COL(i).x + 24, write), y: lerp(OUT.y + 6, TOP - 8, write), tone: "lit" });
  }
  const rtSub = step === 0 ? `→ P${HOT} only` : step === 3 ? (narrow ? "→ all 10" : "write → all 10") : narrow ? "random :0–:9" : "random suffix";
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={step === 0 ? "bad" : step === 3 ? "warn" : undefined}>
        {step === 0 ? (narrow ? "one hot key" : "one hot key · one partition") : step === 3 ? (narrow ? "writes ×10" : "writes amplified ×10") : narrow ? "split factor 10" : "key splitting · split factor 10"}
      </Txt>
      <Box x={SRC.x} y={SRC.y} w={SRC.w} h={SRC.h} label="viral_url_abc" sub={step === 3 ? "1 write" : narrow ? "reads" : "hot reads"} tone={step === 3 ? "lit" : "warn"} />
      <Wire d={`M${SRC.x + SRC.w} ${SRC.y + SRC.h / 2}H${RT.x}`} arrow tone={step === 3 ? "lit" : undefined} />
      <Box x={RT.x} y={RT.y} w={RT.w} h={RT.h} label={narrow ? "router" : "key router"} sub={rtSub} tone={step === 3 ? "lit" : spread >= 1 ? "ok" : undefined} />
      {step === 3 && (
        <g>
          <Txt x={W - 24} y={84} k="d" anchor="end" tone="warn">
            ×10
          </Txt>
          <Txt x={W - 24} y={106} k="s" anchor="end" tone="warn">
            {narrow ? "writes" : "physical writes"}
          </Txt>
        </g>
      )}
      {step === 0 && (
        <Txt x={W - 24} y={92} k="s" anchor="end" tone="bad">
          {narrow ? "P3 overloaded" : "P3 overloaded, 9 idle"}
        </Txt>
      )}
      {Array.from({ length: N }, (_, i) => {
        const c = COL(i);
        const l = load(i);
        const h = (BOT - TOP) * l;
        const hot = l > 0.6;
        const lit = step === 3 && write >= 1;
        return (
          <g key={i}>
            <rect className="hk-col" x={c.x} y={TOP} width={c.w} height={BOT - TOP} />
            <rect className={`hk-fill ${hot ? "bad" : spread >= 1 ? "ok" : "sky"}`} x={c.x} y={BOT - h} width={c.w} height={h} />
            {lit && <rect className="hk-lit" x={c.x} y={TOP} width={c.w} height={BOT - TOP} />}
            <Txt x={c.x + c.w / 2} y={BOT + 20} k="s" tone={hot ? "bad" : undefined}>
              {`P${i}`}
            </Txt>
            {shown(i) && (
              <Txt x={c.x + c.w / 2} y={TOP - 22} k="s" tone={lit ? "lit" : "warn"}>
                {`:${i}`}
              </Txt>
            )}
          </g>
        );
      })}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.hk-col{fill:none;stroke:var(--ax-line);stroke-width:1.5}
.hk-fill{fill:var(--ax-sky);fill-opacity:.5}.hk-fill.bad{fill:var(--ax-bad);fill-opacity:.7}.hk-fill.ok{fill:var(--ax-ok);fill-opacity:.5}
.hk-lit{fill:none;stroke:var(--ax-accent);stroke-width:2.5}`,
  variants: [
    {
      id: "split",
      label: "Key splitting",
      steps: [
        { caption: "Every read of viral_url_abc hashes to the same partition, which saturates while the others sit idle.", loop: true, ms: 3200 },
        { caption: "Mark it hot and split it into ten physical keys, viral_url_abc:0 to :9, one per partition.", tween: 2200, ms: 2400 },
        { caption: "Each read picks a random suffix, so the hot key's reads spread evenly across all ten partitions.", tween: 1600, loop: true, ms: 3400 },
        { caption: "A write must update all ten copies: writes are amplified by the split factor. Best for read-heavy keys.", tween: 1600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
