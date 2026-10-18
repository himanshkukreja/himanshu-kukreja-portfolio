/**
 * BM25 (week 7, day 3 · 1.2–1.3): the lesson's worked example. 1M docs, avgdl 50, query
 * "running shoes". IDF: running 2.9957, shoes 2.3026, the 0.1054. Doc 1 (45 words, running ×3,
 * shoes ×2): TF 1.6058 and 1.4148, score 8.0683. Doc 2 (150 words, ×1 each): TF 0.55, score 2.9141.
 */
import { defineExplainer, lerp, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 350;
const X0 = 24;
const BX = 196; // bars start
const BW = 300; // width for the max value
const IDF: [string, string, number][] = [
  ["running", "5%", 2.9957],
  ["shoes", "10%", 2.3026],
  ["the", "90%", 0.1054],
];
const DOCS = [
  { name: "Doc 1", title: "Nike Running Shoes Review", words: 45, f: [3, 2], tf: [1.6058, 1.4148], s: [4.8107, 3.2577], total: 8.0683 },
  { name: "Doc 2", title: "Professional Running Shoes Guide…", words: 150, f: [1, 1], tf: [0.55, 0.55], s: [1.6476, 1.2664], total: 2.9141 },
];
const MAXS = 8.0683;

function Scene({ step, t, narrow }: SceneProps) {
  const e = seg(t, 0, 0.85);
  const idfOn = step === 0 ? e : 1;
  // TF reveal per doc: doc 1 at step 1, doc 2 at step 2; scores at step 3
  const tfOn = [step === 1 ? e : step > 1 ? 1 : 0, step === 2 ? e : step > 2 ? 1 : 0];
  const scoreOn = step === 3 ? e : 0;
  return (
    <g>
      <Txt x={X0} y={30} k="k" anchor="start">
        {narrow ? "\"running shoes\" · 1M docs" : "query \"running shoes\" · 1M docs · avgdl 50 words"}
      </Txt>
      {/* IDF */}
      <Txt x={X0} y={58} k="s" anchor="start" tone={step === 0 ? "lit" : "mute"}>
        {narrow ? "IDF" : "IDF · rarer terms weigh more"}
      </Txt>
      {IDF.map(([term, pct, v], i) => {
        const y = 72 + i * 24;
        const w = (BW * 0.66 * v * idfOn) / 3;
        const tone: Tone = term === "the" ? "mute" : step === 0 ? "lit" : undefined;
        return (
          <g key={term}>
            <Txt x={X0} y={y + 12} k="s" anchor="start" tone={term === "the" ? "mute" : undefined}>
              {narrow ? term : `${term} · ${pct}`}
            </Txt>
            <rect x={BX - (narrow ? 60 : 0)} y={y + 2} width={Math.max(1, w)} height={12} className={`ax-fill ${term === "the" ? "bm-mute" : term === "running" ? "" : "sky"}`} />
            <Txt x={BX - (narrow ? 60 : 0) + w + 8} y={y + 13} k="s" anchor="start" tone={tone}>
              {idfOn > 0.2 ? v.toFixed(4) : ""}
            </Txt>
          </g>
        );
      })}
      {/* documents */}
      {DOCS.map((d, i) => {
        const y0 = 174 + i * 86;
        const on = tfOn[i];
        const hot = step === i + 1;
        const total = lerp(0, d.total, scoreOn);
        const w1 = (BW * d.s[0] * scoreOn) / MAXS;
        const w2 = (BW * d.s[1] * scoreOn) / MAXS;
        return (
          <g key={d.name} opacity={on > 0 || step === 3 ? 1 : 0.4}>
            <rect x={X0 - 8} y={y0 - 18} width={W - 2 * X0 + 16} height={74} className={`ax-box${hot ? " lit" : step === 3 && i === 0 ? " ok" : ""}`} />
            <Txt x={X0} y={y0} k="t" anchor="start" tone={hot ? "lit" : undefined}>
              {d.name}
            </Txt>
            <Txt x={X0 + (narrow ? 84 : 66)} y={y0} k="s" anchor="start">
              {narrow ? `${d.words} words` : `${d.title} · ${d.words} words`}
            </Txt>
            {/* term frequencies → TF component */}
            <g opacity={on}>
              <Txt x={X0} y={y0 + 24} k="s" anchor="start" tone={hot ? "lit" : undefined}>
                {narrow ? `running ×${d.f[0]} → ${d.tf[0]}` : `running ×${d.f[0]} → TF ${d.tf[0]}`}
              </Txt>
              <Txt x={narrow ? 318 : 300} y={y0 + 24} k="s" anchor="start" tone={hot ? "lit" : undefined}>
                {narrow ? `shoes ×${d.f[1]} → ${d.tf[1]}` : `shoes ×${d.f[1]} → TF ${d.tf[1]}`}
              </Txt>
            </g>
            {/* score bar */}
            {step === 3 && (
              <g>
                <rect x={X0} y={y0 + 36} width={Math.max(0.5, w1)} height={12} className="ax-fill" />
                <rect x={X0 + w1} y={y0 + 36} width={Math.max(0.5, w2)} height={12} className="ax-fill sky" />
                <Txt x={W - X0} y={y0 + 47} k="t" anchor="end" tone={i === 0 ? "ok" : undefined}>
                  {total.toFixed(4)}
                </Txt>
              </g>
            )}
            {hot && !narrow && (
              <Txt x={W - X0} y={y0} k="s" anchor="end" tone="lit">
                {i === 0 ? "k1 = 1.2" : "b = 0.75"}
              </Txt>
            )}
          </g>
        );
      })}
      {step === 3 && (
        <g>
          {!narrow && (
            <Txt x={X0} y={340} k="s" anchor="start" tone="mute">
              score = Σ IDF × TF
            </Txt>
          )}
          <rect x={narrow ? X0 : 200} y={330} width={10} height={10} className="ax-fill" />
          <Txt x={(narrow ? X0 : 200) + 16} y={340} k="s" anchor="start" tone="mute">
            running
          </Txt>
          <rect x={narrow ? X0 + 110 : 290} y={330} width={10} height={10} className="ax-fill sky" />
          <Txt x={(narrow ? X0 + 110 : 290) + 16} y={340} k="s" anchor="start" tone="mute">
            shoes
          </Txt>
        </g>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.bm-mute{fill:var(--ax-fg4)}`,
  variants: [
    {
      id: "score",
      label: "Two documents",
      steps: [
        { caption: "IDF first: rarer terms weigh more. running (5% of docs) 2.9957, shoes (10%) 2.3026, the (90%) 0.1054.", tween: 1600, ms: 3200 },
        { caption: "Doc 1 has running 3 times, but TF saturates (k1 = 1.2): 1.6058, not three times as much.", tween: 1400, ms: 3200 },
        { caption: "Doc 2 has 150 words against an average 50: length normalization (b = 0.75) cuts each TF to 0.55.", tween: 1400, ms: 3400 },
        { caption: "Score = Σ IDF × TF: Doc 1 8.0683, Doc 2 2.9141. The short, focused review ranks first.", tween: 2000, ms: 3800 },
      ],
    },
  ],
  Scene,
});
