/**
 * Graceful degradation (week 7, day 5 · 3.1): the GracefulDegradation thresholds. Any of p99
 * > 500 ms, CPU > 70% or search queue > 500 is WARNING (cache TTL 300 s, 50 results, spell check
 * and personalization off); > 1,000 ms, 85% or 1,000 is CRITICAL (TTL 600 s, 20 results, facets
 * and highlighting off, simple query). Back under every threshold restores normal.
 */
import { defineExplainer, lerp, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
const GX = 24;
const GW = 250;
const LEVELS: { name: string; tone: Tone }[] = [
  { name: "NORMAL", tone: "ok" },
  { name: "WARNING", tone: "warn" },
  { name: "CRITICAL", tone: "bad" },
];
// per level: TTL, results, and the features (on/off)
const SETTINGS = [
  { ttl: "60 s", max: "100", off: [] as string[] },
  { ttl: "300 s", max: "50", off: ["spell check", "personalization"] },
  { ttl: "600 s", max: "20", off: ["spell check", "personalization", "facets", "highlighting", "full query"] },
];
const FEATURES = ["spell check", "personalization", "facets", "highlighting", "full query"];

/** gauge bar scale: latency 0 → 1,400 ms, the two thresholds marked */
function Gauge({ y, label, value, warn, crit, text }: { y: number; label: string; value: number; warn: number; crit: number; text: string }) {
  const f = Math.min(1, value);
  const tone = value > crit ? "bad" : value > warn ? "warn" : "ok";
  return (
    <g>
      <Txt x={GX} y={y} k="s" anchor="start">
        {label}
      </Txt>
      <Txt x={GX + GW} y={y} k="s" anchor="end" tone={tone === "ok" ? undefined : tone}>
        {text}
      </Txt>
      <rect x={GX} y={y + 8} width={GW} height={14} className="ax-meter" />
      <rect x={GX} y={y + 8} width={GW * f} height={14} className={`ax-fill ${tone}`} />
      {[warn, crit].map((v, i) => (
        <line key={i} x1={GX + GW * v} x2={GX + GW * v} y1={y + 3} y2={y + 27} className={`gd-lim ${i ? "bad" : "warn"}`} />
      ))}
    </g>
  );
}

function Scene({ step, t, narrow }: SceneProps) {
  const e = seg(t, 0, 0.8);
  // latency as a share of the 1,400 ms scale: 150 ms → past 500 → past 1,000 → back to 150
  const LAT = [150 / 1400, 640 / 1400, 1180 / 1400, 150 / 1400];
  const lat = step === 0 ? LAT[0] : lerp(LAT[step - 1], LAT[step], e);
  const level = step === 0 || step === 3 ? (step === 3 && e < 1 ? 2 : 0) : step === 1 ? (e >= 1 ? 1 : 0) : e >= 1 ? 2 : 1;
  const latText = step === 0 || (step === 3 && e >= 1) ? "150 ms" : lat > 1000 / 1400 ? "> 1,000 ms" : lat > 500 / 1400 ? "> 500 ms" : "";
  const s = SETTINGS[level];
  const L = LEVELS[level];
  const RX = narrow ? 300 : 318;
  return (
    <g>
      <Txt x={GX} y={34} k="k" anchor="start">
        cluster metrics
      </Txt>
      <Gauge y={70} label="p99 latency" value={lat} warn={500 / 1400} crit={1000 / 1400} text={latText} />
      <Gauge y={136} label="CPU" value={0.5} warn={0.7} crit={0.85} text={narrow ? "" : "70% / 85%"} />
      <Gauge y={202} label="search queue" value={0.18} warn={0.5} crit={1} text={narrow ? "" : "500 / 1,000"} />
      <line x1={GX} x2={GX} y1={254} y2={270} className="gd-lim warn" />
      <Txt x={GX + 10} y={267} k="s" anchor="start" tone="mute">
        warning
      </Txt>
      <line x1={GX + (narrow ? 112 : 96)} x2={GX + (narrow ? 112 : 96)} y1={254} y2={270} className="gd-lim bad" />
      <Txt x={GX + (narrow ? 122 : 106)} y={267} k="s" anchor="start" tone="mute">
        critical
      </Txt>
      {/* level and settings */}
      <rect x={RX} y={24} width={W - RX - 24} height={286} className={`ax-box ${L.tone}`} />
      <Txt x={RX + 14} y={50} k="k" anchor="start" tone={L.tone === "warn" ? "warn" : L.tone}>
        {`level ${level}`}
      </Txt>
      <Txt x={RX + 14} y={88} k="d" anchor="start" tone={L.tone === "warn" ? undefined : L.tone}>
        {L.name}
      </Txt>
      <Txt x={RX + 14} y={122} k="s" anchor="start">
        cache TTL
      </Txt>
      <Txt x={W - 38} y={122} k="s" anchor="end" tone={level ? "lit" : undefined}>
        {s.ttl}
      </Txt>
      <Txt x={RX + 14} y={146} k="s" anchor="start">
        max results
      </Txt>
      <Txt x={W - 38} y={146} k="s" anchor="end" tone={level ? "lit" : undefined}>
        {s.max}
      </Txt>
      {FEATURES.map((f, i) => {
        const off = s.off.includes(f);
        const label = f === "full query" ? "function score" : f;
        return (
          <g key={f}>
            <rect x={RX + 14} y={168 + i * 26} width={12} height={12} className={`gd-sw${off ? " off" : ""}`} />
            <Txt x={RX + 34} y={179 + i * 26} k="s" anchor="start" tone={off ? "mute" : undefined}>
              {label}
            </Txt>
            {off && <line x1={RX + 34} x2={RX + 34 + label.length * (narrow ? 9.6 : 7.2)} y1={174 + i * 26} y2={174 + i * 26} className="gd-strike" />}
          </g>
        );
      })}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.gd-lim{stroke-width:2}.gd-lim.warn{stroke:var(--ax-amber)}.gd-lim.bad{stroke:var(--ax-bad)}.gd-sw{fill:var(--ax-ok);stroke:none}.gd-sw.off{fill:none;stroke:var(--ax-fg4);stroke-width:1.5}.gd-strike{stroke:var(--ax-fg4);stroke-width:1.5}`,
  variants: [
    {
      id: "spike",
      label: "Traffic spike",
      steps: [
        { caption: "Level 0, normal: 60 s cache TTL, up to 100 results, and every feature on.", tween: 800 },
        { caption: "p99 passes 500 ms (or CPU 70%, queue 500): WARNING. TTL 300 s, 50 results, spell check and personalization off.", tween: 1800, ms: 3400 },
        { caption: "Past 1,000 ms (or CPU 85%, queue 1,000): CRITICAL. TTL 600 s, 20 results, facets and highlighting off, simple query.", tween: 1800, ms: 3800 },
        { caption: "Load drops back under every warning threshold, so level 0 restores the normal settings.", tween: 2000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
