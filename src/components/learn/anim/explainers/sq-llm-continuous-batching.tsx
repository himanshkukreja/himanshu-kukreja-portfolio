/**
 * ChatGPT LLM serving side quest (deep dive 2): a static batch of 8 where seven replies are 50
 * tokens and one is 2,000 leaves seven slots idle from step 50 to step 2,000 (1 of 8 running for
 * 97.5% of the batch's life) while new requests wait; continuous (iteration-level) batching lets a
 * finished sequence leave after its step and a waiting one join at the next; paged KV memory
 * replaces a 4,096-token reservation (~1.3 GB a request) with 16-token blocks on demand, and
 * prefix caching shares full blocks of the same instructions, reference-counted.
 */
import { clamp, defineExplainer, ease, lerp, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;
const X0 = 100;
const LW = 470;
const LY = 58;
const LH = 16;
const GAP = 5;
const MAX = 2000;
const sx = (s: number) => X0 + (LW * s) / MAX;
const laneY = (i: number) => LY + i * (LH + GAP);

// continuous batching: back-to-back requests per slot (decode steps); lane 8 is the 2,000-token reply
const CONT: number[][] = [
  [50, 600, 900, 450],
  [50, 1200, 750],
  [50, 300, 1100, 550],
  [50, 950, 1000],
  [50, 700, 650, 600],
  [50, 1500, 450],
  [50, 400, 800, 750],
  [2000],
];

function Lanes({ cursor, mode, narrow }: { cursor: number; mode: "static" | "cont"; narrow: boolean }) {
  return (
    <g>
      {Array.from({ length: 8 }, (_, i) => {
        const y = laneY(i);
        const segs: { a: number; b: number; tone: Tone; idle?: boolean }[] = [];
        if (mode === "static") {
          const len = i === 7 ? 2000 : 50;
          segs.push({ a: 0, b: Math.min(cursor, len), tone: i === 7 ? "warn" : "lit" });
          if (cursor > len) segs.push({ a: len, b: cursor, tone: "mute", idle: true });
        } else {
          let a = 0;
          CONT[i].forEach((len, k) => {
            const b = a + len;
            if (cursor > a) segs.push({ a, b: Math.min(cursor, b), tone: i === 7 ? "warn" : k === 0 ? "lit" : k % 2 ? "sky" : "ok" });
            a = b;
          });
        }
        return (
          <g key={i}>
            <Txt x={X0 - 10} y={y + 13} k="s" anchor="end" tone="mute">
              {narrow ? `${i + 1}` : `slot ${i + 1}`}
            </Txt>
            <rect className="ax-meter" x={X0} y={y} width={LW} height={LH} />
            {segs.map((s, k) =>
              s.idle ? (
                <rect key={k} className="idle" x={sx(s.a)} y={y + 1} width={Math.max(0, sx(s.b) - sx(s.a))} height={LH - 2} />
              ) : (
                <rect key={k} className={`ax-fill ${s.tone}`} x={sx(s.a) + (k ? 1 : 0)} y={y} width={Math.max(0, sx(s.b) - sx(s.a) - (k ? 1 : 0))} height={LH} />
              ),
            )}
          </g>
        );
      })}
      <line className="cur" x1={sx(cursor)} x2={sx(cursor)} y1={LY - 8} y2={laneY(7) + LH + 6} />
      <Txt x={Math.min(sx(cursor), X0 + LW - 40)} y={LY - 12} k="s" anchor="middle" tone="lit">
        {`step ${Math.round(cursor).toLocaleString("en-US")}`}
      </Txt>
    </g>
  );
}

function Waiting({ n, label, tone }: { n: number; label: string; tone?: Tone }) {
  return (
    <g>
      <Txt x={24} y={270} k="k" anchor="start" tone={tone ?? "mute"}>
        {label}
      </Txt>
      {Array.from({ length: Math.round(n) }, (_, i) => (
        <Token key={i} x={X0 + 40 + i * 18} y={265} s={10} tone={tone === "bad" ? "warn" : "sky"} />
      ))}
    </g>
  );
}

function StaticScene({ step, t, narrow }: SceneProps) {
  const cursor = step === 0 ? lerp(0, 50, ease(t)) : step === 1 ? lerp(50, MAX, ease(t)) : MAX;
  const waiting = step === 0 ? 3 : step === 1 ? lerp(3, 14, t) : 14;
  const busy = cursor <= 50 ? 8 : 1;
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start">
        {narrow ? "static batch" : "static batch of 8"}
      </Txt>
      <Txt x={576} y={24} k="s" anchor="end" tone={busy === 1 ? "bad" : "ok"}>
        {`${busy} of 8 running`}
      </Txt>
      <Lanes cursor={cursor} mode="static" narrow={narrow} />
      <Txt x={X0} y={laneY(7) + LH + 22} k="s" anchor="start" tone={step >= 1 ? "bad" : "mute"}>
        {step >= 1 ? (narrow ? "7 idle slots, 97.5%" : "7 slots idle from step 50 to 2,000: 97.5% of the time") : narrow ? "7 × 50, 1 × 2,000" : "seven 50-token replies, one 2,000"}
      </Txt>
      <Waiting n={waiting} label="waiting" tone={step === 2 ? "bad" : undefined} />
      {step === 2 && (
        <Txt x={576} y={292} k="s" anchor="end" tone="bad">
          {narrow ? "wait for whole batch" : "they wait for the whole batch"}
        </Txt>
      )}
    </g>
  );
}

function ContScene({ step, t, narrow }: SceneProps) {
  const cursor = step === 0 ? lerp(0, 150, ease(t)) : lerp(150, MAX, clamp(t));
  const waiting = step === 0 ? (cursor > 50 ? 3 : 10) : lerp(3, 1, t);
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start">
        {narrow ? "continuous" : "continuous batching"}
      </Txt>
      <Txt x={576} y={24} k="s" anchor="end" tone="ok">
        8 of 8 running
      </Txt>
      <Lanes cursor={cursor} mode="cont" narrow={narrow} />
      <Txt x={X0} y={laneY(7) + LH + 22} k="s" anchor="start" tone="ok">
        {step === 0 ? (narrow ? "leave at 50, join at 51" : "finished leave after step 50, waiting join at 51") : narrow ? "refilled every step" : "slots refilled every step (Orca, OSDI 2022)"}
      </Txt>
      <Waiting n={waiting} label="waiting" />
    </g>
  );
}

/* ------------------------------------------------------------------ paged KV memory */

const MX = 120;
const MW = 456;
const ROWS = [
  { id: "A", used: 260 },
  { id: "B", used: 2000 },
  { id: "C", used: 420 },
  { id: "D", used: 210 },
];
const MORE = [
  { id: "E", used: 700 },
  { id: "F", used: 230 },
  { id: "G", used: 400 },
];
const RES = 4096;
const BLK = 16;
const PFX = 160; // shared instructions, in tokens (10 full blocks), illustrative

function PagedScene({ step, t, narrow }: SceneProps) {
  const paged = step >= 1;
  const prefix = step === 2;
  const k = step === 1 ? ease(seg(t, 0, 0.7)) : paged ? 1 : 0;
  const px = (tok: number) => (MW * tok) / RES;
  const rows = paged ? [...ROWS, ...MORE] : ROWS;
  const rh = paged ? 20 : 30;
  const gap = paged ? 6 : 12;
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start">
        {paged ? (prefix ? (narrow ? "prefix cache" : "prefix caching") : narrow ? "16-token blocks" : "paged: 16-token blocks") : narrow ? "reserve 4,096" : "reserve the 4,096 max"}
      </Txt>
      <Txt x={576} y={24} k="s" anchor="end" tone={paged ? "ok" : "bad"}>
        {paged ? `${rows.length} sequences` : "~1.3 GB each"}
      </Txt>
      {rows.map((r, i) => {
        const y = 50 + i * (rh + gap);
        const used = Math.ceil(r.used / BLK) * BLK;
        const resW = lerp(px(RES), px(used), k);
        const extra = i >= ROWS.length;
        const shareW = prefix ? px(PFX) : 0;
        return (
          <g key={r.id} opacity={extra ? (step === 1 ? seg(t, 0.6, 1) : 1) : 1}>
            <Txt x={MX - 12} y={y + rh / 2 + 5} k="s" anchor="end" tone="mute">
              {narrow ? r.id : `req ${r.id}`}
            </Txt>
            <rect className={paged ? "ax-meter" : "resv"} x={MX} y={y} width={resW} height={rh} />
            <rect className="ax-fill sky" x={MX + shareW} y={y} width={Math.max(0, px(r.used) - shareW)} height={rh} />
            {prefix && <rect className="ax-fill lit" x={MX} y={y} width={shareW} height={rh} />}
            {!paged && (
              <Txt x={MX + px(RES) - 8} y={y + rh / 2 + 5} k="s" anchor="end" tone="bad">
                {`${r.used.toLocaleString("en-US")} of 4,096 used`}
              </Txt>
            )}
          </g>
        );
      })}
      {prefix && (
        <g>
          <line className="share" x1={MX + px(PFX) / 2} x2={MX + px(PFX) / 2} y1={50} y2={50 + (rows.length - 1) * (rh + gap) + rh} />
          <Txt x={MX + px(PFX) + 8} y={50 + rows.length * (rh + gap) + 14} k="s" anchor="start" tone="lit">
            {narrow ? "shared, ref 7" : "same instructions: one copy, ref count 7"}
          </Txt>
        </g>
      )}
      <Txt x={24} y={286} k="s" anchor="start" tone={paged ? "ok" : "bad"}>
        {step === 0
          ? narrow
            ? "4,096 × 0.33 MB ≈ 1.3 GB"
            : "4,096 tokens × 0.33 MB ≈ 1.3 GB reserved per request"
          : step === 1
            ? narrow
              ? "waste < 1 block each"
              : "allocated on demand: waste under one block per sequence"
            : narrow
              ? "prefill only the new part"
              : "matching prefix blocks are reused: prefill only the new part"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "static") return <StaticScene {...p} />;
  if (p.variant === "cont") return <ContScene {...p} />;
  return <PagedScene {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "static",
      label: "Static batch",
      steps: [
        { caption: "A batch of 8 starts together. Seven replies will be 50 tokens long; one will be 2,000.", tween: 1400 },
        { caption: "Seven slots finish at step 50, then idle until step 2,000: 1 of 8 runs for 97.5% of it.", tween: 3200 },
        { caption: "New requests wait for the whole batch, so their first token includes someone else's long reply.", tween: 700, ms: 3200 },
      ],
    },
    {
      id: "cont",
      label: "Continuous",
      steps: [
        { caption: "Schedule per step, not per batch: the seven finished sequences leave after step 50 and waiting ones join at 51.", tween: 1600 },
        { caption: "Every slot stays busy until the long reply ends. This is Orca's iteration-level scheduling.", tween: 3600, ms: 3200 },
      ],
    },
    {
      id: "paged",
      label: "Paged KV",
      steps: [
        { caption: "Reserving KV cache for the 4,096-token maximum holds ~1.3 GB per request, mostly empty.", tween: 900 },
        { caption: "PagedAttention allocates 16-token blocks on demand, like memory pages, so the same memory holds more sequences.", tween: 2200 },
        { caption: "Prefix caching: full blocks of the same instructions are shared, reference-counted; each request prefills only its new part.", tween: 1600, ms: 3400 },
      ],
    },
  ],
  css: `.idle{fill:none;stroke:var(--ax-fg4);stroke-width:1;stroke-dasharray:3 4}.cur{stroke:var(--ax-accent);stroke-width:2}.resv{fill:none;stroke:var(--ax-bad);stroke-width:1.5;stroke-dasharray:5 4}.share{stroke:var(--ax-accent);stroke-width:2}`,
  Scene,
});
