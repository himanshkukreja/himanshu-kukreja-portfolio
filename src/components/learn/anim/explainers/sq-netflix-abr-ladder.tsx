/**
 * Adaptive bitrate on the per-title ladder (side quest 6 · Deep Dive 1): the lesson's commute,
 * 20 Mbps home Wi-Fi → 5 Mbps LTE → 500 Kbps subway → 10 Mbps out of the tunnel. The player
 * takes the highest rung whose bitrate × 1.2 fits the bandwidth (4K, 720p, 240p, 1080p HDR),
 * switching at chunk boundaries and refusing to climb while the buffer is under 15 s. Without ABR
 * a fixed 8 Mbps stream needs 6.4 s per 4 s chunk on LTE and stalls.
 */
import { Box, defineExplainer, lerp, Meter, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 280;
const LADDER = [
  { r: "4K HDR", b: 25, l: "25 Mbps", n: "25M" },
  { r: "4K", b: 15, l: "15 Mbps", n: "15M" },
  { r: "1080p HDR", b: 7, l: "7 Mbps", n: "7M" },
  { r: "1080p", b: 5, l: "5 Mbps", n: "5M" },
  { r: "720p", b: 3, l: "3 Mbps", n: "3M" },
  { r: "480p", b: 1, l: "1.0 Mbps", n: "1M" },
  { r: "360p", b: 0.56, l: "560 Kbps", n: "560K" },
  { r: "240p", b: 0.235, l: "235 Kbps", n: "235K" },
];
const LX = 380;
const LW = 196;
const RY = (i: number) => 16 + i * 24;
const CH = 8;
const CX = (i: number) => 24 + i * 69;
const CY = 230;

type Frame = { bw: number; bwText: string; where: string; pick: number; buf: number; bufText: string; bufT?: Tone; chunks: string[]; stall?: boolean; held?: boolean };

function frame(variant: string, step: number, t: number): Frame {
  const fresh = t >= 0.25; // the new network reading lands a beat into the step
  if (variant === "fixed") {
    if (step === 0) return { bw: 20, bwText: "20 Mbps", where: "home Wi-Fi", pick: -1, buf: 34, bufText: "healthy", chunks: ["8 Mb", "8 Mb"].slice(0, t < 0.5 ? 1 : 2) };
    const buf = lerp(34, 0, t);
    return {
      bw: 5,
      bwText: fresh ? "5 Mbps" : "20 Mbps",
      where: fresh ? "LTE" : "home Wi-Fi",
      pick: -1,
      buf,
      bufText: t >= 1 ? "empty: buffering…" : "draining: 6.4 s per 4 s chunk",
      bufT: t >= 1 ? "bad" : "warn",
      chunks: ["8 Mb", "8 Mb", "8 Mb", "8 Mb", "slow", "slow"].slice(0, 2 + Math.round(t * 4)),
      stall: t >= 1,
    };
  }
  const base = ["4K", "4K"];
  if (step === 0) return { bw: 20, bwText: "20 Mbps", where: "home Wi-Fi", pick: 1, buf: 34, bufText: "healthy: over 30 s", bufT: "ok", chunks: base.slice(0, t < 0.5 ? 1 : 2) };
  if (step === 1)
    return { bw: fresh ? 5 : 20, bwText: fresh ? "5 Mbps" : "20 Mbps", where: fresh ? "minute 5 · LTE" : "home Wi-Fi", pick: fresh ? 4 : 1, buf: lerp(34, 30, t), bufText: "healthy", bufT: "ok", chunks: [...base, "720p", "720p"].slice(0, t < 0.6 ? 3 : 4) };
  if (step === 2)
    return {
      bw: fresh ? 0.5 : 5,
      bwText: fresh ? "500 Kbps" : "5 Mbps",
      where: fresh ? "minute 15 · subway" : "minute 5 · LTE",
      pick: fresh ? 7 : 4,
      buf: lerp(30, 8, t),
      bufText: t > 0.6 ? "low: under 15 s" : "draining",
      bufT: "warn",
      chunks: [...base, "720p", "720p", "240p", "240p"].slice(0, t < 0.6 ? 5 : 6),
    };
  const buf = lerp(8, 18, t);
  const climb = buf > 15;
  return {
    bw: fresh ? 10 : 0.5,
    bwText: fresh ? "10 Mbps" : "500 Kbps",
    where: fresh ? "minute 25 · out of tunnel" : "minute 15 · subway",
    pick: climb ? 2 : 7,
    buf,
    bufText: climb ? "past 15 s: climb allowed" : "under 15 s: no step up yet",
    bufT: climb ? "ok" : "warn",
    held: fresh && !climb,
    chunks: [...base, "720p", "720p", "240p", "240p", "240p", "1080p"].slice(0, climb ? 8 : 7),
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const fixed = variant === "fixed";
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start" tone="mute">
        network
      </Txt>
      <Txt x={24} y={62} k="d" anchor="start" tone={f.bw < 1 ? "warn" : undefined}>
        {f.bwText}
      </Txt>
      <Txt x={24} y={86} k="s" anchor="start">
        {narrow ? f.where.replace(" · out of tunnel", "") : f.where}
      </Txt>
      <Txt x={24} y={112} k="s" anchor="start" tone={fixed ? "bad" : "lit"}>
        {fixed ? (narrow ? "fixed 8 Mbps" : "no ABR: fixed 8 Mbps stream") : narrow ? "rung × 1.2 ≤ net" : "pick: top rung with bitrate × 1.2 ≤ net"}
      </Txt>
      {/* the per-title ladder */}
      {LADDER.map((r, i) => {
        const fits = r.b * 1.2 <= f.bw;
        const on = !fixed && f.pick === i;
        return (
          <Box
            key={r.r}
            x={LX}
            y={RY(i)}
            w={LW}
            h={22}
            label={narrow ? `${r.r} ${r.n}` : `${r.r} · ${r.l}`}
            tone={on ? "lit" : fixed ? undefined : fits ? undefined : false}
            dim={fixed || (!on && !fits)}
          />
        );
      })}
      {f.held && (
        <Txt x={LX - 10} y={RY(2) + 15} k="s" anchor="end" tone="warn">
          {narrow ? "held" : "fits, but held"}
        </Txt>
      )}
      {/* buffer */}
      <Txt x={24} y={146} k="k" anchor="start" tone="mute">
        buffer
      </Txt>
      <Meter x={24} y={156} w={320} h={14} value={f.buf} max={60} tone={f.bufT === "bad" ? "bad" : f.bufT === "warn" ? "warn" : "ok"} />
      {[5, 15, 30].map((s) => (
        <g key={s}>
          <line className="sq-mark" x1={24 + (320 * s) / 60} x2={24 + (320 * s) / 60} y1={152} y2={174} />
          {!narrow && (
            <Txt x={24 + (320 * s) / 60} y={188} k="s" tone="mute">
              {`${s} s`}
            </Txt>
          )}
        </g>
      ))}
      <Txt x={narrow ? 24 : 344} y={narrow ? 196 : 146} k="s" anchor={narrow ? "start" : "end"} tone={f.bufT}>
        {f.bufText}
      </Txt>
      {/* chunks, 4 s each, switchable at any boundary */}
      <Txt x={24} y={CY - 10} k="k" anchor="start" tone="mute">
        {narrow ? "4 s chunks" : "chunks · 4 s each · switch at any boundary"}
      </Txt>
      {Array.from({ length: CH }, (_, i) => {
        const c = f.chunks[i];
        const tone: Tone = !c ? undefined : c === "slow" ? "bad" : c === "240p" ? "warn" : c === "8 Mb" ? undefined : "lit";
        return <Box key={i} x={CX(i)} y={CY} w={64} h={34} label={c ?? ""} tone={c === "4K" || c === "1080p" ? "lit" : tone} dim={!c} />;
      })}
      {f.stall && (
        <Txt x={CX(6) + 4} y={CY + 22} k="t" anchor="start" tone="bad">
          stall
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sq-mark{stroke:var(--ax-fg3);stroke-width:1.5;stroke-dasharray:2 2}`,
  variants: [
    {
      id: "abr",
      label: "Adaptive",
      steps: [
        { caption: "Home Wi-Fi at 20 Mbps: the player takes the highest rung with 20% headroom, 4K at 15 Mbps.", tween: 1400 },
        { caption: "Minute 5, LTE at 5 Mbps: 1080p needs 6 with headroom, so it drops to 720p at the next chunk.", tween: 1800 },
        { caption: "Minute 15, subway at 500 Kbps: only 240p fits. A few seconds of low quality beats a frozen screen.", tween: 2200 },
        { caption: "At 10 Mbps it climbs back to 1080p HDR, but only after the buffer passes 15 s.", tween: 3000, ms: 3400 },
      ],
    },
    {
      id: "fixed",
      label: "Fixed 8 Mbps",
      steps: [
        { caption: "Without ABR: one fixed 8 Mbps stream. On 20 Mbps home Wi-Fi it plays fine.", tween: 1400 },
        { caption: "On 5 Mbps LTE each 4 s chunk takes 6.4 s to download. The buffer drains and playback stalls.", tween: 3000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
