/**
 * Whole-lesson overview (week 7, day 5 · search operations & scale): one Elasticsearch cluster
 * through the lesson. Topology: the 3 AM Black Friday page (50K q/s, CPU 95%, p99 2.5 s vs 200 ms,
 * lag 5 min), dedicated master / coordinating / data roles, the shard plan (50M × 10 KB → 620 GB →
 * 32 primaries of ~29 GB + 32 replicas) and capacity (largest of storage, memory, CPU: 6 data, 2
 * coordinating). Black Friday: 5x → ~333 cores → ~22 data nodes, pre-scale 24 h before (12 / 6 /
 * 2 replicas), peak 22 / 10, graceful degradation, gradual scale-down. Watch & recover: dashboard,
 * PagerDuty vs Slack alerts, a single node failure, and a full restore from S3 snapshots.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const CX = 82;
const CWD = 56;
const CY = (i: number) => 64 + i * 22;
const GX = 160;
const GY = 100;
const CELL = 34;
const cell = (i: number) => ({
  x: GX + (i % 7) * 40,
  y: GY + Math.floor(i / 7) * 40,
});
const PX = 460;
const PW = 128;
/** shards per data node in the 6-node plan: 64 = 11 × 4 + 10 × 2 */
const SHARDS = [11, 11, 11, 11, 10, 10];

type S = {
  data: number;
  coord: number;
  ghost?: number;
  tone?: Tone;
  coordTone?: Tone;
  shards?: boolean;
  foot: [string, string, Tone?];
  figs: [string, string, string, Tone?][];
  cpu?: [number, Tone];
  flow?: boolean;
  hl?: boolean;
};

const STEPS: Record<string, S[]> = {
  topo: [
    {
      data: 6,
      coord: 2,
      tone: "bad",
      coordTone: "bad",
      flow: true,
      foot: ["indexing lag: 5 minutes", "lag: 5 min", "bad"],
      figs: [
        ["50K", "queries/sec", "q/sec", "warn"],
        ["2.5s", "p99 vs 200ms", "p99", "bad"],
      ],
      cpu: [0.95, "bad"],
    },
    {
      data: 6,
      coord: 2,
      hl: true,
      foot: ["cluster state · routing · shards", "3 · 2 · 6 nodes"],
      figs: [
        ["11", "nodes", "nodes"],
        ["3", "masters (odd)", "masters"],
      ],
    },
    {
      data: 6,
      coord: 2,
      shards: true,
      foot: ["50M × 10 KB → 620 GB with overhead", "620 GB index"],
      figs: [
        ["32", "primaries", "primaries"],
        ["29GB", "per shard", "per shard", "ok"],
      ],
    },
    {
      data: 6,
      coord: 2,
      tone: "ok",
      foot: ["storage · memory · CPU: largest wins", "largest need wins"],
      figs: [
        ["10K", "queries/sec", "q/sec"],
        ["6", "data nodes", "data nodes", "ok"],
      ],
      cpu: [0.5, "ok"],
    },
  ],
  bf: [
    {
      data: 6,
      coord: 2,
      ghost: 22,
      tone: "warn",
      foot: ["~150 q/s per core → ~22 nodes", "~22 data nodes"],
      figs: [
        ["50K", "5x normal", "5x normal", "warn"],
        ["333", "CPU cores", "cores", "warn"],
      ],
      cpu: [0.95, "bad"],
    },
    {
      data: 12,
      coord: 6,
      ghost: 22,
      tone: "lit",
      foot: ["warm caches · raise refresh interval", "warm caches"],
      figs: [
        ["-24h", "pre-scale", "pre-scale", "lit"],
        ["2", "replicas", "replicas"],
      ],
    },
    {
      data: 22,
      coord: 10,
      tone: "ok",
      flow: true,
      foot: ["watch p99, error rate, queue depth", "watch p99, queue"],
      figs: [
        ["22", "data nodes", "data", "ok"],
        ["10", "coordinating", "coord", "ok"],
      ],
      cpu: [0.6, "ok"],
    },
    {
      data: 22,
      coord: 10,
      tone: "warn",
      coordTone: "warn",
      flow: true,
      foot: ["slow search beats no search", "slow beats none", "warn"],
      figs: [
        ["L1", "no spell check", "no spell", "warn"],
        ["L2", "simpler queries", "simpler", "warn"],
      ],
      cpu: [0.85, "warn"],
    },
    {
      data: 6,
      coord: 2,
      ghost: 22,
      foot: ["drain nodes before removing them", "drain first"],
      figs: [
        ["+6h", "12 data nodes", "12 data"],
        ["+24h", "6 data nodes", "6 data", "ok"],
      ],
    },
  ],
  watch: [
    {
      data: 6,
      coord: 2,
      tone: "ok",
      foot: ["GREEN · 11/11 nodes · 12,345 q/s", "GREEN · 11/11", "ok"],
      figs: [
        ["145ms", "p99 latency", "p99", "ok"],
        ["4.2%", "zero results", "zero hits"],
      ],
      cpu: [0.75, "ok"],
    },
    {
      data: 6,
      coord: 2,
      tone: "warn",
      foot: ["critical → PagerDuty, warn → Slack", "page vs Slack", "bad"],
      figs: [
        [">1s", "p99 5m → page", "p99 → page", "bad"],
        ["75%", "heap → Slack", "→ Slack", "warn"],
      ],
    },
    {
      data: 6,
      coord: 2,
      tone: "warn",
      foot: ["YELLOW · Kubernetes restarts the pod", "YELLOW · restart", "warn"],
      figs: [
        ["5-10", "minutes", "minutes", "warn"],
        ["0", "data lost", "data lost", "ok"],
      ],
    },
    {
      data: 6,
      coord: 2,
      tone: "ok",
      foot: ["", ""],
      figs: [
        ["1-4h", "restore + CDC", "restore", "warn"],
        ["30d", "snapshot keep", "retention"],
      ],
    },
  ],
};

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  const s = STEPS[variant][step];
  const prev = STEPS[variant][step - 1];
  const grow = (a: number | undefined, b: number) => Math.round(lerp(a ?? b, b, seg(t, 0.1, 0.8)));
  const data = grow(prev?.data, s.data);
  const coord = grow(prev?.coord, s.coord);
  const lost = variant === "watch" && step === 3 ? t < 0.5 : false;
  const dead = variant === "watch" && step === 2 ? 3 : -1;
  const p = (k: number) => (clock * 0.6 + k / 4 + t * 0.5) % 1;
  return (
    <g>
      <Txt x={36} y={48} k="s">
        users
      </Txt>
      <Txt x={CX + CWD / 2} y={48} k="s" tone={s.hl ? "lit" : undefined}>
        coord
      </Txt>
      <Txt x={GX} y={48} k="s" anchor="start" tone={s.hl ? "lit" : undefined}>
        masters
      </Txt>
      <Txt x={440} y={92} k="s" anchor="end" tone={s.hl ? "lit" : undefined}>
        {narrow ? "data" : "data nodes"}
      </Txt>
      {[0, 1, 2].map((i) => (
        <Box key={i} x={GX + i * 42} y={56} w={36} h={26} label="M" tone={lost ? "bad" : s.hl ? "lit" : i === 0 ? "sky" : undefined} dim={lost} />
      ))}
      <Wire d={`M${CX + CWD} ${CY(0) + 9}H${GX - 6}`} arrow dash opacity={0.6} />
      {Array.from({ length: Math.max(coord, prev?.coord ?? 0) }, (_, i) => (
        <rect key={i} className={`ax-box${lost ? " bad" : i < coord ? ` ${s.coordTone || s.tone || ""}` : ""}`} x={CX} y={CY(i)} width={CWD} height={18} opacity={i < coord ? 1 : 0.2} />
      ))}
      {Array.from({ length: Math.max(s.ghost ?? 0, data, prev?.data ?? 0) }, (_, i) => {
        const c = cell(i);
        const on = i < data;
        const tone: Tone = lost || i === dead ? "bad" : s.tone;
        return (
          <g key={i}>
            <rect
              className={`ax-box${on ? ` ${tone || ""}` : ""}${on ? "" : " ax-dash"}`}
              x={c.x}
              y={c.y}
              width={CELL}
              height={CELL}
              opacity={on ? (lost ? 0.5 : 1) : 0.35}
              strokeDasharray={on ? undefined : "3 3"}
            />
            {i === dead && (
              <Txt x={c.x + CELL / 2} y={c.y + 23} k="t" tone="bad">
                ×
              </Txt>
            )}
          </g>
        );
      })}
      {s.shards &&
        SHARDS.map((n, d) =>
          Array.from({ length: n }, (_, k) => {
            const c = cell(d);
            const rep = (k + d) % 2 === 1;
            return (
              <rect
                key={`${d}-${k}`}
                className={`ax-tok ${rep ? "sky" : "lit"}`}
                x={c.x + 3 + (k % 4) * 7.5}
                y={c.y + 4 + Math.floor(k / 4) * 9}
                width={6}
                height={6}
                opacity={seg(t, (d * 11 + k) / 80, (d * 11 + k) / 80 + 0.2)}
              />
            );
          }),
        )}
      {s.shards && (
        <Txt x={440} y={GY + 66} k="s" anchor="end">
          {narrow ? "primary · replica" : "lit primary · blue replica"}
        </Txt>
      )}
      {s.flow &&
        [0, 1, 2, 3].map((k) => {
          const q = p(k);
          return q < 0.5 ? (
            <Token key={k} x={lerp(20, CX, q * 2)} y={CY(k % 2) + 9} s={8} tone={s.tone === "bad" ? "bad" : "lit"} />
          ) : (
            <Token key={k} x={lerp(CX + CWD, GX + 8, (q - 0.5) * 2)} y={lerp(CY(k % 2) + 9, GY + 17 + (k % 3) * 40, (q - 0.5) * 2)} s={8} tone={s.tone === "bad" ? "bad" : "lit"} />
          );
        })}
      {variant === "watch" && step === 3 ? (
        <g>
          <Box x={GX} y={268} w={narrow ? 150 : 196} h={32} label={narrow ? "S3 snapshot" : "S3 snapshot (daily)"} tone="sky" />
          <Wire d={`M${GX + (narrow ? 150 : 196)} 284H${440}V${GY + 2 * 40 + CELL}`} tone="ok" arrow />
          {!narrow && (
            <Txt x={440} y={258} k="s" anchor="end" tone={t < 0.5 ? "bad" : "ok"}>
              {t < 0.5 ? "cluster lost" : "restored"}
            </Txt>
          )}
        </g>
      ) : (
        <Txt x={GX} y={292} k="s" anchor="start" tone={s.foot[2]} opacity={seg(t, 0.3, 0.8)}>
          {narrow ? s.foot[1] : s.foot[0]}
        </Txt>
      )}
      <rect className="ax-box" x={PX} y={40} width={PW} height={262} />
      {s.figs.map(([d, wl, nl, tn], i) => (
        <g key={i} opacity={seg(t, 0.2 + i * 0.25, 0.5 + i * 0.25)}>
          <Txt x={PX + PW / 2} y={100 + i * 92} k="d" tone={tn}>
            {d}
          </Txt>
          <Txt x={PX + PW / 2} y={124 + i * 92} k="s">
            {narrow ? nl : wl}
          </Txt>
        </g>
      ))}
      {s.cpu && (
        <g>
          <Meter x={PX + 14} y={262} w={PW - 28} h={12} value={lerp(0.3, s.cpu[0], seg(t, 0.2, 0.9))} max={1} tone={s.cpu[1]} />
          <Txt x={PX + PW / 2} y={292} k="s" tone={s.cpu[1]}>
            {`CPU ${Math.round(lerp(0.3, s.cpu[0], seg(t, 0.2, 0.9)) * 100)}%`}
          </Txt>
        </g>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "topo",
      label: "Cluster",
      steps: [
        {
          caption: "3 AM, Black Friday: 50K queries a second, CPU at 95%, p99 at 2.5 s against a 200 ms target, indexing 5 minutes behind.",
          tween: 1400,
          loop: true,
        },
        {
          caption: "Separate the roles: 3 small dedicated masters (odd, for quorum), coordinating nodes that route and merge, data nodes that hold shards.",
          tween: 1000,
        },
        {
          caption: "50 million 10 KB products make a 620 GB index: 32 primaries of about 29 GB (inside 20 to 50 GB), plus 32 replicas.",
          tween: 2000,
        },
        {
          caption: "Storage, memory and CPU each give a node count, and the largest wins. At 10K queries a second: 6 data nodes and 2 coordinating.",
          tween: 1200,
        },
      ],
    },
    {
      id: "bf",
      label: "Black Friday",
      steps: [
        {
          caption: "Black Friday is 5x: 50K queries a second. At ~150 simple queries per core that's ~333 cores, about 22 data nodes. CPU sets the size.",
          tween: 1400,
        },
        {
          caption: "24 hours before, pre-scale to 12 data and 6 coordinating nodes with 2 replicas. Warm the caches and raise the refresh interval.",
          tween: 1600,
        },
        {
          caption: "At the start: 22 data and 10 coordinating nodes, watching p99, error rate and queue depth. Reactive scaling is too slow.",
          tween: 1600,
          loop: true,
        },
        {
          caption: "Still overloaded? Degrade: level 1 turns off spell check and personalization, level 2 simplifies queries. Slow beats no search.",
          tween: 1200,
          loop: true,
        },
        {
          caption: "Afterwards, scale down gradually: 12 data nodes 6 hours after, 6 at 24 hours. Drain nodes first so no shard loses every copy.",
          tween: 2000,
        },
      ],
    },
    {
      id: "watch",
      label: "Watch & recover",
      steps: [
        {
          caption: "Measure everything: health, latency, QPS, CPU and heap, plus business metrics. Here: green, p99 145 ms, 4.2% zero results.",
          tween: 1200,
        },
        {
          caption: "Critical alerts page PagerDuty: cluster red, p99 over 1 s for 5 minutes, errors over 5%. Warnings go to Slack: yellow, heap over 75%.",
          tween: 1200,
        },
        {
          caption: "One data node dies: the cluster goes yellow with no data loss. Kubernetes restarts the pod and shards reallocate in 5 to 10 minutes.",
          tween: 1200,
        },
        {
          caption: "Lose the whole cluster: restore the latest S3 snapshot and resume CDC, 1 to 4 hours. Snapshot daily, keep 30 days, test restores monthly.",
          tween: 2200,
          ms: 3600,
        },
      ],
    },
  ],
  Scene,
});
