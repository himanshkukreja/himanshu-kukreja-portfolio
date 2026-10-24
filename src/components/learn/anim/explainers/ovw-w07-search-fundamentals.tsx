/**
 * Whole-lesson overview (week 7, day 1 · search fundamentals): why SQL LIKE fails (a B-tree only
 * helps prefixes, '%Running%' scans 50M rows in 30+ s, characters not words) and the inverted-index
 * flip; text analysis (character filters → tokenizer → token filters, the same analyzer at index
 * and query time); document modeling (field types, the multi-field pattern); and the cluster
 * (shards, scatter-gather by the coordinating node, 20 shards for 500 GB, fixed at creation).
 */
import { Box, defineExplainer, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

function Chip({ x, y, w, label, tone, o = 1, h = 26 }: { x: number; y: number; w: number; label: string; tone?: Tone; o?: number; h?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={x} y={y} width={w} height={h} />
      <Txt x={x + w / 2} y={y + h / 2 + 5} k="s" tone={tone}>
        {label}
      </Txt>
    </g>
  );
}

const NAMES = ["Apple iPhone 14", "Blue Running Shoes", "Green Tea Kettle", "Nike Air Max", "Red Nike Running Shoes", "Running Shorts Blue"];
const POST: [string, number[], Tone][] = [
  ["running", [1, 2, 4, 5], "lit"],
  ["shoes", [1, 2, 3], "lit"],
  ["both", [1, 2], "ok"],
];

function Like({ step, t, narrow }: SceneProps) {
  const scan = step === 1 ? seg(t, 0.05, 0.85) : 1;
  if (step === 3)
    return (
      <g>
        <Txt x={W / 2} y={30} k="k">
          {narrow ? "inverted index" : "flip it: word → documents"}
        </Txt>
        {POST.map(([term, docs, tn], r) => (
          <g key={term} opacity={seg(t, r * 0.3, r * 0.3 + 0.3)}>
            <Chip x={24} y={78 + r * 56} w={110} h={34} label={term} tone={tn} />
            {docs.map((d) => (
              <Chip key={d} x={150 + (d - 1) * 46} y={78 + r * 56} w={40} h={34} label={`p${d}`} tone={tn} />
            ))}
          </g>
        ))}
        <Txt x={490} y={140} k="d" tone="ok" opacity={seg(t, 0.7, 1)}>
          {"< 1 ms"}
        </Txt>
        <Txt x={490} y={168} k="s" opacity={seg(t, 0.7, 1)}>
          vs 30+ s for LIKE
        </Txt>
        <Txt x={W / 2} y={276} k="s">
          {narrow ? "2 lookups + 1 intersection" : 'query "running shoes": two lookups and one intersection'}
        </Txt>
      </g>
    );
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "B-tree on name" : "B-tree index on products.name"}
      </Txt>
      <g opacity={step === 2 ? 0.3 : 1}>
        {NAMES.map((n, i) => {
          const tn: Tone = step === 0 ? (i === 3 ? "ok" : undefined) : scan * 6 > i ? "bad" : undefined;
          return (
            <g key={n}>
              <rect className={`ax-box${tn ? ` ${tn}` : ""}`} x={24} y={56 + i * 36} width={260} height={28} />
              <Txt x={34} y={75 + i * 36} k="s" anchor="start" tone={tn}>
                {n}
              </Txt>
            </g>
          );
        })}
      </g>
      {step === 0 && (
        <g>
          <Txt x={446} y={84} tone="ok">
            {"LIKE 'Nike%'"}
          </Txt>
          <Txt x={446} y={114} k="s">
            {narrow ? "sorted by start" : "sorted by string start"}
          </Txt>
          <Txt x={446} y={138} k="s" tone="ok">
            {narrow ? "→ jump to it" : "→ jump straight to the row"}
          </Txt>
          <Wire d={`M316 ${70 + 3 * 36}H290`} tone="ok" arrow />
        </g>
      )}
      {step === 1 && (
        <g>
          <Txt x={446} y={84} tone="bad">
            {"LIKE '%Running%'"}
          </Txt>
          <Txt x={446} y={114} k="s">
            {narrow ? "no entry point" : "leading % · no entry point"}
          </Txt>
          <Txt x={446} y={190} k="d" tone="bad" opacity={seg(t, 0.6, 1)}>
            30+ s
          </Txt>
          <Txt x={446} y={218} k="s" opacity={seg(t, 0.6, 1)}>
            {narrow ? "50M rows scanned" : "all 50M rows scanned"}
          </Txt>
          <Token x={290} y={56 + Math.min(5.5, scan * 6) * 36} s={10} tone="bad" />
        </g>
      )}
      {step === 2 && (
        <g>
          <Txt x={446} y={64} tone="bad">
            {"LIKE '%red%'"}
          </Txt>
          {(
            [
              ["Red Shoes ✓", "ok"],
              ["Bored Games ✗", "bad"],
              ["Hundred Items ✗", "bad"],
            ] as [string, Tone][]
          ).map(([l, tn], i) => (
            <Chip key={l} x={316} y={78 + i * 34} w={260} label={l} tone={tn} o={seg(t, i * 0.2, i * 0.2 + 0.4)} />
          ))}
          <Txt x={446} y={214} k="s" tone="bad">
            running ≠ run
          </Txt>
          <Txt x={446} y={238} k="s" tone="bad">
            couch ≠ sofa
          </Txt>
          <Txt x={446} y={262} k="s" tone="bad">
            nikee → 0 results
          </Txt>
        </g>
      )}
    </g>
  );
}

const STAGES: [string, string][] = [
  ["Char filters", "Chars"],
  ["Tokenizer", "Tokenizer"],
  ["Token filters", "Filters"],
];
const OUT: [string, Tone][][] = [
  [["The Quick Brown Fox", undefined]],
  [
    ["The", undefined],
    ["Quick", undefined],
    ["Brown", undefined],
    ["Fox", undefined],
  ],
  [
    ["the ✗", "bad"],
    ["quick", "ok"],
    ["brown", "ok"],
    ["fox", "ok"],
  ],
];

function Analysis({ step, t, narrow }: SceneProps) {
  if (step === 3) {
    const toks = ["red", "nike", "run", "shoe"];
    return (
      <g>
        <Txt x={W / 2} y={30} k="k">
          {narrow ? "same analyzer" : "the same analyzer at index and query time"}
        </Txt>
        {[0, 1].map((r) => (
          <g key={r} opacity={r === 1 ? seg(t, 0.2, 0.6) : 1}>
            <Txt x={16} y={70 + r * 110} k="s" anchor="start">
              {r === 0 ? (narrow ? "doc: Red Nike Running Shoes" : 'index time · doc: "Red Nike Running Shoes"') : narrow ? "query: Running Shoes" : 'query time · query: "Running Shoes"'}
            </Txt>
            <Box x={16} y={82 + r * 110} w={150} h={40} label="analyzer" tone="lit" />
            <Wire d={`M166 ${102 + r * 110}H${r === 0 ? 362 : 470}`} arrow />
            {toks.map((k, i) => (r === 1 && i < 2 ? null : <Chip key={k} x={370 + i * 54} y={88 + r * 110} w={50} h={28} label={k} tone={r === 1 ? "ok" : "lit"} />))}
          </g>
        ))}
        <Wire d="M503 116V198" tone="ok" dash />
        <Wire d="M557 116V198" tone="ok" dash />
        <Txt x={W / 2} y={286} k="s" tone="bad" opacity={seg(t, 0.6, 1)}>
          {narrow ? "else: Running ≠ run" : 'skip it at query time: "Running" never matches "run"'}
        </Txt>
      </g>
    );
  }
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "The <b>Quick</b> Brown Fox" : 'input: "The <b>Quick</b> Brown Fox"'}
      </Txt>
      {STAGES.map(([w, n], r) => {
        const on = r <= step;
        const y = 60 + r * 76;
        return (
          <g key={w} opacity={on ? 1 : 0.3}>
            {r > 0 && <Wire d={`M91 ${y - 32}V${y}`} tone={r === step ? "lit" : undefined} arrow />}
            <Box x={16} y={y} w={150} h={44} label={narrow ? n : w} tone={r === step ? "lit" : undefined} />
            {on && <Wire d={`M166 ${y + 22}H190`} />}
            {on &&
              OUT[r].map(([l, tn], i) => (
                <Chip key={l} x={r === 0 ? 190 : 190 + i * 98} y={y + 8} w={r === 0 ? 240 : 90} h={28} label={l} tone={tn} o={r === step ? seg(t, 0.2 + i * 0.12, 0.5 + i * 0.12) : 1} />
              ))}
          </g>
        );
      })}
      <Txt x={W / 2} y={292} k="s" opacity={step === 2 ? seg(t, 0.6, 1) : 0}>
        {narrow ? "jumps → jump · couch +sofa" : "also stemming (jumps → jump) and synonyms (couch +sofa)"}
      </Txt>
      {step === 0 && (
        <Txt x={190} y={114} k="s" anchor="start" opacity={seg(t, 0.5, 1)}>
          {"HTML stripped: <b> removed"}
        </Txt>
      )}
    </g>
  );
}

const FIELDS: [string, string, Tone][] = [
  ["product_id", "keyword", "sky"],
  ["name", "text", "lit"],
  ["description", "text", "lit"],
  ["brand", "text +", "lit"],
  ["category", "keyword", "sky"],
  ["price", "float", "ok"],
  ["in_stock", "boolean", "ok"],
];
const PRINC: [string, string][] = [
  ["denormalize for search", "denormalize"],
  ["right field types", "field types"],
  ["analysis per field", "analysis"],
  ["store what you display", "store to display"],
];
const TYPES: [string, string, Tone][] = [
  ["text: full-text, relevance", "text: full-text", "lit"],
  ["keyword: exact, facets, sort", "keyword: exact", "sky"],
  ["numeric: ranges, sort", "numeric: ranges", "ok"],
];
const MULTI: [string, string, string][] = [
  ["brand", "text · search", "search"],
  ["brand.keyword", "facets, sort", "facets"],
  ["brand.autocomplete", "as you type", "typing"],
];

function Docs({ step, t, narrow }: SceneProps) {
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "product document" : "one product, one search document"}
      </Txt>
      <rect className="ax-box" x={16} y={48} width={250} height={226} />
      {FIELDS.map(([f, ty, tn], i) => {
        const hi = step === 2 && f === "brand";
        return (
          <g key={f} opacity={step === 2 && !hi ? 0.4 : 1}>
            <Txt x={30} y={78 + i * 30} k="s" anchor="start" tone={hi ? "lit" : undefined}>
              {f}
            </Txt>
            {step >= 1 && (
              <Txt x={252} y={78 + i * 30} k="s" anchor="end" tone={tn} opacity={step === 1 ? seg(t, i * 0.08, i * 0.08 + 0.3) : 1}>
                {ty}
              </Txt>
            )}
          </g>
        );
      })}
      {step === 0 && PRINC.map(([w, n], i) => <Chip key={w} x={290} y={64 + i * 44} w={294} h={32} label={narrow ? n : w} tone="lit" o={seg(t, i * 0.18, i * 0.18 + 0.35)} />)}
      {step === 1 && TYPES.map(([w, n, tn], i) => <Chip key={w} x={290} y={74 + i * 54} w={294} h={36} label={narrow ? n : w} tone={tn} o={seg(t, 0.3 + i * 0.15, 0.6 + i * 0.15)} />)}
      {step === 2 && (
        <g>
          <Wire d={`M266 ${73 + 3 * 30}H290`} tone="lit" />
          {MULTI.map(([f, u, un], i) => (
            <g key={f} opacity={seg(t, i * 0.2, i * 0.2 + 0.4)}>
              <Wire d={`M290 163V${78 + i * 66}H306`} tone="lit" />
              <rect className="ax-box lit" x={306} y={56 + i * 66} width={278} height={44} />
              <Txt x={318} y={75 + i * 66} k="s" anchor="start" tone="lit">
                {f}
              </Txt>
              <Txt x={318} y={93 + i * 66} k="s" anchor="start">
                {narrow ? un : u}
              </Txt>
            </g>
          ))}
          <Txt x={W / 2} y={300} k="s">
            {narrow ? "one source, many indexes" : "multi-field: one source field, several index representations"}
          </Txt>
        </g>
      )}
    </g>
  );
}

const SH = (i: number) => 24 + i * 144;
const TOPS = ["doc1 0.95", "doc2 0.91", "doc3 0.89", "doc4 0.88"];

function Cluster({ step, t, clock, narrow }: SceneProps) {
  const p = (seg(t, 0.1, 0.9) + clock * 0.4) % 1.0001;
  const fan = step === 1 || step === 2;
  return (
    <g>
      <Txt x={W / 2} y={24} k="k">
        {["an index split into shards", "scatter", "gather", "shard sizing"][step]}
      </Txt>
      <Box x={16} y={44} w={100} h={44} label="Client" tone={fan ? "lit" : undefined} />
      <Wire d="M116 66H230" tone={fan ? "lit" : undefined} arrow />
      <Box x={230} y={44} w={140} h={44} label={narrow ? "Coord" : "Coordinator"} tone={fan ? "lit" : undefined} />
      {[0, 1, 2, 3].map((i) => {
        const x = SH(i) + 60;
        return (
          <g key={i}>
            <Wire d={`M300 88C300 118 ${x} 112 ${x} 144`} tone={fan ? (step === 2 ? "ok" : "lit") : undefined} opacity={step === 0 || step === 3 ? 0.4 : 1} />
            {step === 1 && <Token x={300 + (x - 300) * p} y={88 + 56 * p} s={9} tone="lit" />}
            {step === 2 && <Chip x={SH(i)} y={208} w={120} h={30} label={narrow ? `doc${i + 1}` : TOPS[i]} tone="ok" o={seg(t, 0.1 + i * 0.1, 0.4 + i * 0.1)} />}
            <Box x={SH(i)} y={144} w={120} h={50} label={`Shard ${i}`} sub={step === 3 ? "20-40 GB" : "primary"} tone={step === 0 ? "lit" : step === 3 ? "sky" : undefined} />
            {step < 2 && <Box x={SH(i) + 12} y={208} w={96} h={30} label={narrow ? `R${i}` : "replica"} dim={step !== 0} />}
          </g>
        );
      })}
      {step === 0 && (
        <Txt x={W / 2} y={276} k="s">
          {narrow ? "each: its own inverted index" : "each shard is a Lucene index with its own inverted index"}
        </Txt>
      )}
      {step === 2 && (
        <g opacity={seg(t, 0.5, 1)}>
          <Txt x={W / 2} y={270} k="s" tone="ok">
            {narrow ? "merged by score" : "merged, sorted by score: doc1 0.95, doc2 0.91, doc3 0.89 …"}
          </Txt>
        </g>
      )}
      {step === 3 && (
        <g opacity={seg(t, 0.2, 0.7)}>
          <Txt x={W / 2} y={232} k="t" tone="lit">
            {narrow ? "500 GB → 20 shards" : "500 GB / 30 GB ≈ 17 → 20 shards"}
          </Txt>
          <Txt x={W / 2} y={262} k="s" tone="warn">
            {narrow ? "count fixed at creation" : "primary count is fixed at creation: plan for growth"}
          </Txt>
          {!narrow && (
            <Txt x={W / 2} y={288} k="s">
              too few: slow recovery · too many: oversharding
            </Txt>
          )}
        </g>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "like" ? <Like {...p} /> : p.variant === "analysis" ? <Analysis {...p} /> : p.variant === "docs" ? <Docs {...p} /> : <Cluster {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "like",
      label: "Why LIKE fails",
      steps: [
        {
          caption: "A B-tree on products.name is sorted by how strings start, so LIKE 'Nike%' jumps straight to its row.",
          tween: 1000,
        },
        {
          caption: "LIKE '%Running%' has no entry point: all 50 million rows are scanned, and the query takes 30+ seconds.",
          tween: 1800,
        },
        {
          caption: "LIKE matches characters, not words: '%red%' finds Bored Games. And no stemming, synonyms or typo tolerance.",
          tween: 1400,
        },
        {
          caption: 'The inverted index flips it: for each word, the documents containing it. "running shoes" is two lookups and an intersection.',
          tween: 1600,
        },
      ],
    },
    {
      id: "analysis",
      label: "Text analysis",
      steps: [
        {
          caption: "Analysis turns text into tokens. First, character filters clean the raw string, stripping HTML tags such as bold markup.",
          tween: 1000,
        },
        {
          caption: "Then the tokenizer splits on whitespace and punctuation: The, Quick, Brown, Fox.",
          tween: 1200,
        },
        {
          caption: 'Token filters lowercase, drop stop words like "the", stem and add synonyms. Only quick, brown and fox are indexed.',
          tween: 1400,
        },
        {
          caption: 'The same analyzer must run at query time: "Running Shoes" becomes run and shoe, which match the index.',
          tween: 1400,
        },
      ],
    },
    {
      id: "docs",
      label: "Documents",
      steps: [
        {
          caption: "Each product becomes one search document: denormalized, with the right field types and the fields you display.",
          tween: 1200,
        },
        {
          caption: "text fields are analyzed for full-text search; keyword fields match exactly, for IDs, facets and sorting.",
          tween: 1400,
        },
        {
          caption: "The multi-field pattern indexes brand three ways: text for search, brand.keyword for facets, plus autocomplete.",
          tween: 1400,
        },
      ],
    },
    {
      id: "cluster",
      label: "Cluster",
      steps: [
        {
          caption: "An index is split into shards, each a Lucene index with its own inverted index, and each primary has a replica.",
          tween: 1000,
        },
        {
          caption: "Scatter: the coordinating node sends the query to every shard, primary or replica.",
          tween: 1400,
          loop: true,
        },
        {
          caption: "Gather: each shard returns only its top N with scores, and the coordinator merges and sorts them.",
          tween: 1400,
        },
        {
          caption: "Size shards at 20-40 GB: 500 GB is about 20 shards. Primary count is fixed at creation, so plan for growth.",
          tween: 1200,
        },
      ],
    },
  ],
  Scene,
});
