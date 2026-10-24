/**
 * Whole-lesson overview (week 7, day 3 · query processing & relevance): one query moving through
 * match → filter → score → boost. Scoring: 50,000 matches need an order, BM25 (IDF, TF saturation
 * k1 = 1.2, length normalization b = 0.75; Doc 1 8.07 vs Doc 2 2.91). Query vs filter: scored vs
 * yes/no, filters shrink the set, cached bitsets (50 ms → 1 ms). Boosting: name^3 / brand^2,
 * phrase boost, function_score signals, out-of-stock × 0.2. No results: progressive relaxation and
 * the quality metrics (zero-result rate, CTR, MRR).
 */
import { Box, defineExplainer, lerp, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const RX = 190;
const RW = 394;
const STAGES: [string, string][] = [
  ["Match", "inverted index"],
  ["Filter", "yes / no"],
  ["Score", "BM25"],
  ["Boost", "business rules"],
];

function Row({ y, label, right, tone, o = 1, h = 32 }: { y: number; label: string; right?: string; tone?: Tone; o?: number; h?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={RX} y={y} width={RW} height={h} />
      <Txt x={RX + 12} y={y + h / 2 + 5} k="s" anchor="start" tone={tone}>
        {label}
      </Txt>
      {right && (
        <Txt x={RX + RW - 12} y={y + h / 2 + 5} k="s" anchor="end">
          {right}
        </Txt>
      )}
    </g>
  );
}

function Bar({ y, label, v, tone, o = 1, right }: { y: number; label: string; v: number; tone?: Tone; o?: number; right?: string }) {
  return (
    <g opacity={o}>
      <Txt x={RX} y={y} k="s" anchor="start">
        {label}
      </Txt>
      {right && (
        <Txt x={RX + RW} y={y} k="s" anchor="end" tone={tone}>
          {right}
        </Txt>
      )}
      <rect className={`ax-fill${tone ? ` ${tone}` : ""}`} x={RX} y={y + 8} width={Math.max(2, RW * v)} height={12} />
    </g>
  );
}

function Fig({ x, y, d, s, tone }: { x: number; y: number; d: string; s: string; tone?: Tone }) {
  return (
    <g>
      <Txt x={x} y={y} k="d" tone={tone}>
        {d}
      </Txt>
      <Txt x={x} y={y + 26} k="s">
        {s}
      </Txt>
    </g>
  );
}

const LIT: Record<string, (s: number) => Tone[]> = {
  scoring: (s) => (s === 0 ? ["lit"] : [undefined, undefined, "lit"]),
  filter: (s) => (s === 0 ? [undefined, "lit", "lit"] : [undefined, "lit"]),
  boost: () => [undefined, undefined, undefined, "lit"],
  none: (s) => (s === 0 ? ["bad", "bad"] : s === 1 ? ["warn", "warn"] : [undefined, undefined, "ok", "ok"]),
};

function Right({ variant, step, t, narrow }: SceneProps) {
  const a = seg(t, 0.1, 0.8);
  const st = (i: number) => seg(t, i * 0.15, i * 0.15 + 0.35);
  if (variant === "scoring") {
    if (step === 0)
      return (
        <g>
          <Fig x={RX + RW / 2} y={140} d="50,000" s={narrow ? "documents match" : 'documents match "running shoes"'} />
          <Txt x={RX + RW / 2} y={214} k="s" tone="bad" opacity={seg(t, 0.5, 1)}>
            {narrow ? "in what order?" : "in what order? random? alphabetical?"}
          </Txt>
        </g>
      );
    if (step === 1)
      return (
        <g>
          {(
            [
              ["IDF: rare terms weigh more", "IDF: rare wins"],
              ["TF saturates (k1 = 1.2)", "TF saturates"],
              ["length normalized (b = 0.75)", "length norm"],
            ] as [string, string][]
          ).map(([w, n], i) => (
            <Row key={w} y={72 + i * 56} h={40} label={narrow ? n : w} tone="lit" o={st(i)} />
          ))}
        </g>
      );
    return (
      <g>
        <Bar y={96} label={narrow ? "Doc 1 · review" : "Doc 1 · 45-word review"} right="8.07" v={a} tone="lit" />
        <Bar y={168} label={narrow ? "Doc 2 · guide" : "Doc 2 · 150-word guide"} right="2.91" v={(a * 2.91) / 8.07} tone="sky" />
        <Txt x={RX + RW / 2} y={250} k="s">
          {narrow ? "sort: best first" : "Σ IDF × TF, sorted: best match first"}
        </Txt>
      </g>
    );
  }
  if (variant === "filter") {
    if (step === 0)
      return (
        <g>
          {(
            [
              ["query", "what they typed", "running shoes", "scored", "lit"],
              ["filter", "what they picked", "brand, price", "yes / no", "sky"],
            ] as [string, string, string, string, Tone][]
          ).map(([h, l1, l2, l3, tn], i) => (
            <g key={h} opacity={st(i)}>
              <rect className={`ax-box ${tn}`} x={RX + i * 204} y={70} width={190} height={170} />
              <Txt x={RX + i * 204 + 95} y={104} tone={tn}>
                {h}
              </Txt>
              {[l1, l2, l3].map((l, k) => (
                <Txt key={l} x={RX + i * 204 + 95} y={146 + k * 32} k="s">
                  {l}
                </Txt>
              ))}
            </g>
          ))}
        </g>
      );
    if (step === 1)
      return (
        <g>
          <Bar y={100} label="all text matches" v={1} tone="mute" />
          <Bar y={170} label={narrow ? "after filters" : "after filters: the set to score"} v={lerp(1, 0.4, a)} tone="sky" />
          <Txt x={RX + RW / 2} y={250} k="s">
            {narrow ? "score unchanged" : "filters shrink the set; they never change the score"}
          </Txt>
        </g>
      );
    return (
      <g>
        <Txt x={RX} y={84} k="s" anchor="start">
          {narrow ? "price ≤ 100 → bitset" : "filter price ≤ 100 → cached bitset"}
        </Txt>
        {[1, 0, 1, 1, 0, 0, 1, 1].map((b, i) => (
          <g key={i} opacity={st(i / 3)}>
            <rect className={`ax-box${b ? " sky" : ""}`} x={RX + i * 49} y={96} width={43} height={34} />
            <Txt x={RX + i * 49 + 21} y={118} k="s" tone={b ? "sky" : undefined}>
              {b}
            </Txt>
          </g>
        ))}
        <Fig x={RX + 98} y={200} d="50 ms" s="first time" tone="warn" />
        <Fig x={RX + 296} y={200} d="1 ms" s="once cached" tone="ok" />
      </g>
    );
  }
  if (variant === "boost") {
    if (step === 0)
      return (
        <g>
          {(
            [
              ["name", 3],
              ["brand", 2],
              ["category", 1.5],
              ["tags", 1.2],
              ["description", 1],
            ] as [string, number][]
          ).map(([f, v], i) => (
            <Bar key={f} y={80 + i * 44} label={f} right={`× ${v}`} v={(v / 3) * a} tone={i === 0 ? "lit" : undefined} />
          ))}
        </g>
      );
    if (step === 1)
      return (
        <g>
          <Bar y={96} label={narrow ? "exact phrase" : '"running shoes" as a phrase'} right="× 2" v={a} tone="lit" />
          <Bar y={168} label={narrow ? "words apart" : "running … shoes, apart"} right="× 1" v={0.5 * a} tone="mute" />
          <Txt x={RX + RW / 2} y={250} k="s">
            {narrow ? "should: match_phrase" : "should clause: match_phrase, boost 2, slop 1"}
          </Txt>
        </g>
      );
    if (step === 2)
      return (
        <g>
          <Row y={64} h={40} label={narrow ? "function_score" : "function_score: text score ×"} tone="lit" />
          {(
            [
              ["× popularity", "field_value_factor, sqrt"],
              ["× recency", "gauss decay, full for 7d"],
              ["× featured", "filter weight"],
            ] as [string, string][]
          ).map(([l, r], i) => (
            <Row key={l} y={120 + i * 46} label={l} right={narrow ? undefined : r} tone="sky" o={st(i + 1)} />
          ))}
        </g>
      );
    return (
      <g>
        <Bar y={96} label="in stock" right="× 1" v={1} tone="ok" />
        <Bar y={168} label={narrow ? "out of stock" : "out of stock: demoted, still shown"} right="× 0.2" v={lerp(1, 0.2, a)} tone="bad" />
        <Txt x={RX + RW / 2} y={250} k="s" tone="warn">
          {narrow ? "start simple, A/B test" : "start simple · A/B test every ranking change"}
        </Txt>
      </g>
    );
  }
  if (step === 0)
    return (
      <g>
        <Fig x={RX + RW / 2} y={140} d="2 results" s={narrow ? "strict AND" : "strict AND query, all filters"} tone="bad" />
        <Txt x={RX + RW / 2} y={206} k="s" tone="warn">
          minimum is 5
        </Txt>
      </g>
    );
  if (step === 1)
    return (
      <g>
        {(
          [
            ["1 exact, all filters", "1 exact"],
            ["2 relax low-intent filters", "2 relax filters"],
            ["3 fuzzy matching", "3 fuzzy"],
            ["4 any term (OR)", "4 any term"],
            ["5 no filters at all", "5 no filters"],
          ] as [string, string][]
        ).map(([w, n], i) => (
          <Row key={w} y={60 + i * 40} label={narrow ? n : w} tone={i === 0 ? "bad" : "warn"} o={i === 0 ? 1 : st(i - 0.5)} />
        ))}
        <Txt x={RX + RW / 2} y={278} k="s">
          {narrow ? "stop at ≥ 5 results" : "stop as soon as ≥ 5 results · category stays"}
        </Txt>
      </g>
    );
  return (
    <g>
      {(
        [
          ["zero-result rate", "% with nothing"],
          ["CTR", "% with a click"],
          ["MRR", "avg 1 / click position"],
        ] as [string, string][]
      ).map(([l, r], i) => (
        <Row key={l} y={66 + i * 52} h={40} label={l} right={narrow ? undefined : r} tone="ok" o={st(i)} />
      ))}
      <Txt x={RX + RW / 2} y={250} k="s" tone="warn">
        {narrow ? "low MRR: ranked low" : "low MRR: users find it, but it ranks low"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  const tones = LIT[p.variant](p.step);
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {p.narrow ? "query: running shoes" : 'one query: "running shoes"'}
      </Txt>
      {STAGES.map(([l, s], i) => (
        <Box key={l} x={16} y={60 + i * 62} w={150} h={48} label={l} sub={p.narrow ? undefined : s} tone={tones[i]} dim={!tones[i] && p.variant !== "none"} />
      ))}
      <Right {...p} />
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "scoring",
      label: "Scoring",
      steps: [
        {
          caption: '"running shoes" matches 50,000 documents. Return them in what order? Scoring turns matches into best matches.',
          tween: 1000,
        },
        {
          caption: "BM25 scores each one: rare terms weigh more (IDF), repeats saturate (k1 = 1.2), long documents are normalized (b = 0.75).",
          tween: 1400,
        },
        {
          caption: "In the lesson's example the short review scores 8.07 and the 150-word guide 2.91. Sort by score: best first.",
          tween: 1400,
        },
      ],
    },
    {
      id: "filter",
      label: "Query vs filter",
      steps: [
        {
          caption: "What the user typed goes in query context and is scored; what they selected, like brand or price, is a yes/no filter.",
          tween: 1000,
        },
        {
          caption: "Filters never change the score. They only shrink the set of documents that gets scored.",
          tween: 1400,
        },
        {
          caption: "A repeated filter like price ≤ 100 is cached as a bitset: about 50 ms the first time, 1 ms once cached.",
          tween: 1400,
        },
      ],
    },
    {
      id: "boost",
      label: "Boosting",
      steps: [
        {
          caption: "Field boosts first: a match in the name counts 3x, brand 2x, category 1.5x, description 1x.",
          tween: 1400,
        },
        {
          caption: "An exact phrase match earns a bonus: a should clause with match_phrase, boost 2.",
          tween: 1400,
        },
        {
          caption: "function_score blends the text score with business signals: popularity, recency decay and featured products.",
          tween: 1400,
        },
        {
          caption: "Negative boosting cuts out-of-stock items to 20% of their score without hiding them. Start simple and A/B test.",
          tween: 1400,
        },
      ],
    },
    {
      id: "none",
      label: "No results",
      steps: [
        {
          caption: "A strict AND query with all filters returns 2 results, below the minimum of 5.",
          tween: 1000,
        },
        {
          caption: "Progressive relaxation: drop low-intent filters, then try fuzzy matching, then any term, then no filters at all.",
          tween: 1800,
        },
        {
          caption: "Measure quality with zero-result rate, CTR and MRR. A low MRR means users find it, but it ranks low.",
          tween: 1400,
        },
      ],
    },
  ],
  Scene,
});
