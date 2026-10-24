/**
 * Whole-lesson overview (week 7 preview): the problem (SQL LIKE on 50M rows: a 30+ second full
 * scan with no ranking, typo tolerance or synonyms, against a search engine's 50 ms ranked answer),
 * the system (50M products, 10K queries/sec, p99 < 200 ms, 5-minute freshness), the five days on
 * one architecture (read path, CDC write path, the cluster) and the preview's sizing estimate.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

function Chip({ x, y, w, label, tone, o = 1 }: { x: number; y: number; w: number; label: string; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={x} y={y} width={w} height={26} />
      <Txt x={x + w / 2} y={y + 18} k="s" tone={tone}>
        {label}
      </Txt>
    </g>
  );
}

const ROWS = [0, 1, 2, 3, 4, 5];
const RESULTS: [string, string, string][] = [
  ["Nike Air Zoom Pegasus", "Pegasus", "0.95"],
  ["Nike Free Run", "Free Run", "0.91"],
  ["Nike Revolution", "Revolution", "0.87"],
];
const BAD: [string, string][] = [
  ["no ranking", "no ranking"],
  ["nikee → 0 results", "nikee → 0"],
  ["sneakers ≠ shoes", "no synonyms"],
];
const GOOD: [string, string][] = [
  ["inverted index", "inverted index"],
  ["BM25 + boosts", "BM25 + boosts"],
  ["typos & synonyms", "typos, synonyms"],
];
const FEAT = ["full-text", "facets", "autocomplete", "typo tolerance"];
const FIGS: [string, string][] = [
  ["50M", "products"],
  ["10K/s", "queries"],
  ["200ms", "p99 latency"],
  ["5 min", "freshness"],
];

function Problem({ step, t, narrow }: SceneProps) {
  if (step === 3)
    return (
      <g>
        <Txt x={W / 2} y={30} k="k">
          {narrow ? "the system" : "the system we're building · product search"}
        </Txt>
        {FIGS.map(([d, s], i) => (
          <g key={d} opacity={seg(t, i * 0.18, i * 0.18 + 0.4)}>
            <Txt x={75 + i * 150} y={150} k="d" tone={i === 2 ? "lit" : undefined}>
              {d}
            </Txt>
            <Txt x={75 + i * 150} y={178} k="s">
              {s}
            </Txt>
          </g>
        ))}
        {FEAT.map((f, i) => (
          <Chip
            key={f}
            x={narrow ? 16 + (i % 2) * 288 : 15 + i * 144}
            y={narrow ? 214 + Math.floor(i / 2) * 34 : 222}
            w={narrow ? 280 : 138}
            label={f}
            tone="lit"
            o={seg(t, 0.5 + i * 0.1, 0.8 + i * 0.05)}
          />
        ))}
        {!narrow && (
          <Txt x={W / 2} y={290} k="s">
            peak 30K/s during sales · index ~500 GB · 99.9% available
          </Txt>
        )}
      </g>
    );
  const scan = step === 0 ? seg(t, 0.05, 0.9) : 1;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "red running shoes nike" : '"red running shoes nike size 10"'}
      </Txt>
      <Txt x={154} y={62} tone="bad">
        {step >= 1 ? "SQL LIKE · 30+ s" : "SQL LIKE '%…%'"}
      </Txt>
      {ROWS.map((i) => (
        <rect key={i} className={`ax-box${scan * 6 > i ? " bad" : ""}`} x={24} y={76 + i * 16} width={260} height={11} />
      ))}
      {step === 0 && (
        <g>
          <Meter x={24} y={184} w={260} h={10} value={scan} max={1} tone="bad" />
          <Txt x={154} y={214} k="s">
            {narrow ? "50M comparisons" : "full scan · 50M string comparisons"}
          </Txt>
          <Txt x={154} y={262} k="d" tone="bad" opacity={seg(t, 0.7, 1)}>
            30+ s
          </Txt>
        </g>
      )}
      {step >= 1 && BAD.map(([w, n], i) => <Chip key={w} x={24} y={190 + i * 34} w={260} label={narrow ? n : w} tone="bad" o={step === 1 ? seg(t, i * 0.25, i * 0.25 + 0.4) : 1} />)}
      <g opacity={step >= 2 ? (step === 2 ? seg(t, 0, 0.5) : 1) : 0.25}>
        <Txt x={446} y={62} tone={step >= 2 ? "ok" : undefined}>
          {step >= 2 ? "Search engine · 50 ms" : "Search engine"}
        </Txt>
        {RESULTS.map(([w, n, s], i) => (
          <g key={w}>
            <rect className={`ax-box${step >= 2 ? " ok" : ""}`} x={316} y={76 + i * 32} width={260} height={26} />
            {step >= 2 && (
              <g>
                <Txt x={326} y={94 + i * 32} k="s" anchor="start">
                  {narrow ? n : w}
                </Txt>
                <Txt x={566} y={94 + i * 32} k="s" anchor="end" tone="ok">
                  {s}
                </Txt>
              </g>
            )}
          </g>
        ))}
        {step >= 2 && GOOD.map(([w, n], i) => <Chip key={w} x={316} y={190 + i * 34} w={260} label={narrow ? n : w} tone="ok" />)}
      </g>
    </g>
  );
}

const CLIENT = { x: 16, y: 64, w: 88, h: 44 };
const API = { x: 128, y: 64, w: 100, h: 44 };
const QP = { x: 252, y: 40, w: 108, h: 40 };
const SUG = { x: 252, y: 96, w: 108, h: 40 };
const ES = { x: 392, y: 40, w: 192, h: 180 };
const PG = { x: 16, y: 252, w: 112, h: 44 };
const KAF = { x: 148, y: 252, w: 96, h: 44 };
const PIPE = { x: 264, y: 252, w: 104, h: 44 };
const DAYS = ["Day 1 · search fundamentals", "Day 2 · indexing pipeline", "Day 3 · query & relevance", "Day 4 · advanced features", "Day 5 · operations & scale"];
const CHIPS: [string, string][][] = [
  [
    ["inverted index", "inverted index"],
    ["text analysis", "text analysis"],
    ["document schema", "doc schema"],
    ["cluster sizing", "cluster sizing"],
  ],
  [
    ["CDC (Debezium)", "CDC"],
    ["bulk indexing", "bulk indexing"],
    ["reindex, no downtime", "reindex"],
    ["index aliases", "aliases"],
  ],
  [
    ["query parsing", "query parsing"],
    ["BM25 scoring", "BM25 scoring"],
    ["filter vs query", "filters"],
    ["boosting", "boosting"],
  ],
  [
    ["autocomplete", "autocomplete"],
    ["did you mean", "did you mean"],
    ["facet counts", "facets"],
    ["synonyms", "synonyms"],
  ],
  [
    ["shard strategy", "shard strategy"],
    ["monitoring", "monitoring"],
    ["traffic spikes", "traffic spikes"],
    ["disaster recovery", "recovery"],
  ],
];
const WRITE = [
  { x: PG.x + PG.w, y: 274 },
  { x: KAF.x, y: 274 },
  { x: KAF.x + KAF.w, y: 274 },
  { x: PIPE.x, y: 274 },
  { x: PIPE.x + PIPE.w, y: 274 },
  { x: 488, y: 274 },
  { x: 488, y: ES.y + ES.h },
];
const READ = [
  { x: CLIENT.x + CLIENT.w, y: 86 },
  { x: API.x, y: 86 },
  { x: API.x + API.w, y: 86 },
  { x: QP.x, y: 60 },
  { x: QP.x + QP.w, y: 60 },
  { x: ES.x, y: 60 },
];
function along(pts: { x: number; y: number }[], p: number) {
  const n = pts.length - 1;
  const k = Math.min(n - 1, Math.floor(p * n));
  const q = p * n - k;
  return {
    x: lerp(pts[k].x, pts[k + 1].x, q),
    y: lerp(pts[k].y, pts[k + 1].y, q),
  };
}

function Days({ step, t, clock, narrow }: SceneProps) {
  const p = (t * 0.9 + clock * 0.3) % 1;
  const tn = (on: boolean): Tone => (on ? "lit" : undefined);
  const read = step === 2;
  const write = step === 1;
  return (
    <g>
      <Txt x={W / 2} y={24} k="k">
        {narrow ? `Day ${step + 1}` : DAYS[step]}
      </Txt>
      <Wire d={`M${READ[0].x} 86H${API.x}`} tone={tn(read)} arrow />
      <Wire d={`M${API.x + API.w} 86C${API.x + API.w + 12} 86 ${QP.x - 12} 60 ${QP.x} 60`} tone={tn(read)} />
      <Wire d={`M${API.x + API.w} 86C${API.x + API.w + 12} 86 ${SUG.x - 12} 116 ${SUG.x} 116`} tone={tn(step === 3)} />
      <Wire d={`M${QP.x + QP.w} 60H${ES.x}`} tone={tn(read)} arrow />
      <Wire d={`M${SUG.x + SUG.w} 116H${ES.x}`} tone={tn(step === 3)} arrow />
      <Wire d={`M${PG.x + PG.w} 274H${KAF.x}`} tone={tn(write)} arrow />
      <Wire d={`M${KAF.x + KAF.w} 274H${PIPE.x}`} tone={tn(write)} arrow />
      <Wire d={`M${PIPE.x + PIPE.w} 274H488V${ES.y + ES.h}`} tone={tn(write)} arrow />
      <Box {...CLIENT} label="Client" tone={tn(read)} />
      <Box {...API} label={narrow ? "API" : "Search API"} tone={tn(read || step === 3)} />
      <Box {...QP} label="Parser" tone={tn(read)} />
      <Box {...SUG} label="Suggest" tone={tn(step === 3)} />
      <Box {...PG} label={narrow ? "PG" : "PostgreSQL"} tone={tn(write)} />
      <Box {...KAF} label="Kafka" sub="CDC" tone={tn(write)} />
      <Box {...PIPE} label={narrow ? "Index" : "Pipeline"} sub={narrow ? undefined : "indexing"} tone={tn(write)} />
      <rect className={`ax-box${step === 0 ? " lit" : step === 4 ? " warn" : ""}`} x={ES.x} y={ES.y} width={ES.w} height={ES.h} />
      <Txt x={ES.x + ES.w / 2} y={ES.y + 24}>
        Elasticsearch
      </Txt>
      {[0, 1, 2].map((i) => (
        <Box key={i} x={404 + i * 60} y={84} w={48} h={40} label={`S${i + 1}`} tone={step === 0 ? "lit" : undefined} />
      ))}
      <Txt x={ES.x + ES.w / 2} y={150} k="s" tone={step === 0 ? "lit" : undefined}>
        {narrow ? "inverted index" : "local inverted index"}
      </Txt>
      {step === 4 && (
        <g>
          <Meter x={404} y={172} w={168} h={12} value={lerp(0.2, 1, seg(t, 0.1, 0.9))} max={1} tone="warn" ticks={5} />
          <Txt x={ES.x + ES.w / 2} y={206} k="s" tone="warn">
            {narrow ? "5x traffic" : "Black Friday · 5x"}
          </Txt>
        </g>
      )}
      {CHIPS[step].map(([w, n], i) => (
        <Chip key={w} x={16 + (i % 2) * 180} y={154 + Math.floor(i / 2) * 34} w={172} label={narrow ? n : w} tone="lit" o={seg(t, i * 0.15, i * 0.15 + 0.3)} />
      ))}
      {write && <Token {...along(WRITE, p)} s={11} tone="lit" />}
      {read && <Token {...along(READ, p)} s={11} tone="lit" />}
    </g>
  );
}

const EST: [string, string, string, string, string][] = [
  ["documents", "500 GB", "50M × 10 KB", "+1 replica → 1 TB", "+1 replica → 1 TB"],
  ["primary shards", "20", "500 / 30 GB ≈ 17", "round up for growth", "round up for growth"],
  ["shard copies", "40", "20 primary + 20 replica", "on 6 data nodes", "20 + 20 replicas"],
  ["nodes", "11", "6 data + 3 master", "+ 2 coordinating", "+ 2 coordinating"],
];
const NODE_N = [7, 7, 7, 7, 6, 6];

function Estimate({ step, t, narrow }: SceneProps) {
  const [k, d, s1, s2, s1n] = EST[step];
  const a = seg(t, 0.1, 0.7);
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "cluster sizing" : "estimation preview · cluster sizing"}
      </Txt>
      <Txt x={137} y={76} k="k">
        {k}
      </Txt>
      <Txt x={137} y={124} k="d" tone="lit" opacity={lerp(0.3, 1, a)}>
        {d}
      </Txt>
      <Txt x={137} y={154} k="s">
        {narrow && step === 2 ? s1n : s1}
      </Txt>
      <Txt x={137} y={176} k="s">
        {s2}
      </Txt>
      {step === 0 && <Box x={300} y={60} w={260} h={174} label="products" sub={narrow ? "500 GB" : "500 GB · 20 fields"} tone="lit" opacity={lerp(0.4, 1, a)} />}
      {step === 1 &&
        Array.from({ length: 20 }, (_, i) => (
          <g key={i} opacity={seg(t, i * 0.03, i * 0.03 + 0.3)}>
            <rect className="ax-box lit" x={300 + (i % 5) * 54} y={60 + Math.floor(i / 5) * 46} width={44} height={36} />
            <Txt x={322 + (i % 5) * 54} y={83 + Math.floor(i / 5) * 46} k="s">
              {i}
            </Txt>
          </g>
        ))}
      {step >= 2 &&
        NODE_N.map((n, j) => {
          const x = 282 + (j % 3) * 102;
          const y = 50 + Math.floor(j / 3) * 92;
          return (
            <g key={j}>
              <rect className="ax-box" x={x} y={y} width={96} height={82} />
              <Txt x={x + 48} y={y + 22} k="s">
                {narrow ? `D${j + 1}` : `data ${j + 1}`}
              </Txt>
              {Array.from({ length: n }, (_, i) => (
                <rect
                  key={i}
                  className={`ax-tok ${(j + i) % 2 ? "sky" : ""}`}
                  x={x + 11 + (i % 4) * 20}
                  y={y + 36 + Math.floor(i / 4) * 20}
                  width={14}
                  height={14}
                  opacity={step === 2 ? seg(t, (j * 7 + i) * 0.015, (j * 7 + i) * 0.015 + 0.3) : 1}
                />
              ))}
            </g>
          );
        })}
      {step === 2 && !narrow && (
        <g>
          <Token x={300} y={250} s={12} />
          <Txt x={314} y={254} k="s" anchor="start">
            primary
          </Txt>
          <Token x={400} y={250} s={12} tone="sky" />
          <Txt x={414} y={254} k="s" anchor="start">
            replica
          </Txt>
        </g>
      )}
      {step === 3 && (
        <g opacity={seg(t, 0.1, 0.6)}>
          {[0, 1, 2].map((i) => (
            <Box key={i} x={282 + i * 60} y={240} w={52} h={32} label={`M${i + 1}`} tone="sky" />
          ))}
          {[0, 1].map((i) => (
            <Box key={i} x={474 + i * 56} y={240} w={52} h={32} label={`C${i + 1}`} tone="ok" />
          ))}
          <Txt x={137} y={218} k="s">
            {narrow ? "64 GB per node" : "per data node: 64 GB RAM"}
          </Txt>
          <rect className="ax-fill" x={24} y={232} width={108} height={14} />
          <rect className="ax-fill sky" x={134} y={232} width={116} height={14} />
          <Txt x={78} y={268} k="s" tone="lit">
            {narrow ? "heap" : "31 heap"}
          </Txt>
          <Txt x={192} y={268} k="s" tone="sky">
            {narrow ? "cache" : "33 cache"}
          </Txt>
        </g>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "problem" ? <Problem {...p} /> : p.variant === "days" ? <Days {...p} /> : <Estimate {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "The problem",
      steps: [
        {
          caption: 'Search "red running shoes nike size 10" with SQL LIKE and the database scans all 50 million rows: 30+ seconds.',
          tween: 1800,
        },
        {
          caption: 'LIKE also has no relevance ranking, no typo tolerance ("nikee" finds 0 results) and no synonyms (sneakers vs shoes).',
          tween: 1400,
        },
        {
          caption: "A search engine answers in 50 ms from an inverted index, ranked by BM25 plus boosts, with typos and synonyms handled.",
          tween: 1200,
        },
        {
          caption: "This week's system: search over 50M products at 10K queries a second, p99 under 200 ms, fresh within 5 minutes.",
          tween: 1400,
        },
      ],
    },
    {
      id: "days",
      label: "Five days",
      steps: [
        {
          caption: "Day 1: how search engines think. Inverted indexes, text analysis, document schemas and the Elasticsearch cluster.",
          tween: 1400,
        },
        {
          caption: "Day 2: keeping search fresh. CDC streams PostgreSQL changes through Kafka into the index; aliases allow zero-downtime reindexing.",
          tween: 1600,
          loop: true,
        },
        {
          caption: "Day 3: finding the needle and ranking the haystack. Parse the query, score it with BM25, filter and boost.",
          tween: 1600,
          loop: true,
        },
        {
          caption: 'Day 4: from good to great. Autocomplete with edge n-grams, "did you mean", facet counts and synonyms.',
          tween: 1400,
        },
        {
          caption: "Day 5: search that stays up. Shard strategy, monitoring, Black Friday's 5x traffic and disaster recovery.",
          tween: 1600,
        },
      ],
    },
    {
      id: "estimate",
      label: "Estimate",
      steps: [
        {
          caption: "50 million products at about 10 KB each make a 500 GB index, 1 TB with one replica.",
          tween: 1000,
        },
        {
          caption: "At about 30 GB per shard that is ~17 shards, rounded up to 20 primaries for growth.",
          tween: 1400,
        },
        {
          caption: "One replica of each makes 40 shard copies, spread over 6 data nodes.",
          tween: 1400,
        },
        {
          caption: "Add 3 dedicated master nodes and 2 coordinating nodes: 11 in all. Each data node's 64 GB is ~31 GB heap, ~33 GB OS cache.",
          tween: 1200,
        },
      ],
    },
  ],
  Scene,
});
