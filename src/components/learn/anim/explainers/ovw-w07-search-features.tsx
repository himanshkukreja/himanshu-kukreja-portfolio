/**
 * Whole-lesson overview (week 7, day 4 · advanced search features): one shopper's search session
 * with the engine beside it. Typing: trending searches, edge n-gram autocomplete under 50 ms,
 * popularity ranking and "Did you mean" (shown only when the fix has over 2x and over 10 results).
 * Results: 2,847 results with facets from aggregations, filter context, multi-select facets, then
 * synonyms (couch → sofa) and index- vs query-time expansion. Language & you: "zapatillas" via
 * name_es, index vs field per language, detection with fallback, then personalization (purchases 3x
 * views, boosts not filters, recently viewed 0.8) balanced against popular results.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const UX = 24;
const UW = 372;
const EX = 412;
const EW = 172;
const RY = (i: number) => 92 + i * 34;

type L = [string, string?, Tone?];
const pick = (narrow: boolean, [w, n]: L) => (narrow && n !== undefined ? n : w);

function SearchBox({ text, narrow, tag }: { text: string; narrow: boolean; tag?: string }) {
  return (
    <g>
      <rect className="ax-box lit" x={UX} y={40} width={UW} height={36} />
      <Txt x={UX + 12} y={64} anchor="start" tone={text ? undefined : "mute"}>
        {text || (narrow ? "search" : "search products")}
      </Txt>
      {tag && (
        <g>
          <rect className="ax-box sky" x={UX + UW - 46} y={47} width={36} height={22} />
          <Txt x={UX + UW - 28} y={63} k="s" tone="sky">
            {tag}
          </Txt>
        </g>
      )}
    </g>
  );
}

function Engine({ lines, narrow, fig, t }: { lines: L[]; narrow: boolean; fig?: [string, string]; t: number }) {
  return (
    <g>
      <rect className="ax-box" x={EX} y={40} width={EW} height={262} />
      <Txt x={EX + EW / 2} y={62} k="k">
        engine
      </Txt>
      {lines.map((l, i) => (
        <Txt key={i} x={EX + 12} y={92 + i * 26} k="s" anchor="start" tone={l[2]} opacity={seg(t, i * 0.12, i * 0.12 + 0.3)}>
          {pick(narrow, l)}
        </Txt>
      ))}
      {fig && (
        <g opacity={seg(t, 0.4, 0.8)}>
          <Txt x={EX + EW / 2} y={262} k="d" tone="lit">
            {fig[0]}
          </Txt>
          <Txt x={EX + EW / 2} y={288} k="s">
            {fig[1]}
          </Txt>
        </g>
      )}
    </g>
  );
}

/** a list row in the UI column (suggestion, result, facet value) */
function Row({ y, x = UX, w = UW, label, right, tone, dim, check }: { y: number; x?: number; w?: number; label: string; right?: string; tone?: Tone; dim?: boolean; check?: boolean }) {
  return (
    <g opacity={dim ? 0.35 : 1}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={x} y={y} width={w} height={28} />
      {check !== undefined && <rect className={`ax-box${check ? " lit" : ""}`} x={x + 8} y={y + 9} width={10} height={10} />}
      <Txt x={x + (check !== undefined ? 26 : 12)} y={y + 19} k="s" anchor="start" tone={tone || undefined}>
        {label}
      </Txt>
      {right && (
        <Txt x={x + w - 8} y={y + 19} k="s" anchor="end" tone={tone || undefined}>
          {right}
        </Txt>
      )}
    </g>
  );
}

function Typing({ step, t, narrow }: SceneProps) {
  const text = ["", "n", "nike ru", "runnign shoes"][step];
  const sugg: string[] = [[], ["nike", "new balance", "north face"], ["nike running shoes", "nike running shorts"], []][step];
  const eng: L[][] = [
    [["every keystroke", "each keystroke"], ["is a query", "= a query"], ["50M products"], ["typos, accents,", "typos, accents"], ["word order", "word order"]],
    [["edge n-grams", "edge n-grams", "lit"], ['"nike" indexed as', "nike →"], ["n ni nik nike"], ['"n" is an exact', '"n" = exact'], ["token match", "token"]],
    [["rank suggestions:", "rank by:"], ["text match"], ["popularity", "popularity", "lit"], ["personalization"]],
    [
      ["phrase suggester", "suggester", "lit"],
      ["→ running shoes", "→ running"],
      ["2,400 vs 3", "2,400 vs 3"],
      ["over 2x and >10", ">2x and >10", "ok"],
      ["collate: only if", "collate:"],
      ["results exist", "has results"],
    ],
  ];
  return (
    <g>
      <SearchBox text={text.slice(0, step === 0 ? 0 : Math.max(1, Math.round(text.length * Math.min(1, t * 1.6))))} narrow={narrow} />
      {step === 0 && (
        <g>
          <Txt x={UX + 4} y={RY(0) + 4} k="s" anchor="start" tone="mute">
            {narrow ? "trending" : "trending searches"}
          </Txt>
          {[0, 1, 2].map((i) => (
            <rect key={i} className="ax-box" x={UX} y={RY(0) + 14 + i * 34} width={UW - i * 60} height={28} opacity={0.5} />
          ))}
        </g>
      )}
      {sugg.map((s, i) => (
        <g key={s} opacity={seg(t, 0.4 + i * 0.12, 0.6 + i * 0.12)}>
          <Row y={RY(i)} label={s} tone={i === 0 ? "lit" : undefined} />
        </g>
      ))}
      {step === 3 && (
        <g>
          <Row y={RY(0)} label={narrow ? "3 results" : "3 results for runnign shoes"} tone="bad" />
          <g opacity={seg(t, 0.5, 0.8)}>
            <Row y={RY(1) + 8} label={narrow ? "Did you mean:" : "Did you mean: running shoes"} tone="lit" />
            {narrow && (
              <Txt x={UX + 12} y={RY(2) + 26} k="s" anchor="start" tone="lit">
                running shoes
              </Txt>
            )}
          </g>
        </g>
      )}
      <Engine lines={eng[step]} narrow={narrow} t={t} fig={step === 0 || step === 1 ? ["<50ms", step === 0 ? "target" : "per keystroke"] : undefined} />
    </g>
  );
}

const CATS: L[] = [
  ["Running Shoes", "Running", undefined],
  ["Trail Running", "Trail"],
  ["Track & Field", "Track"],
];
const BRANDS: L[] = [
  ["Nike", "Nike"],
  ["Adidas", "Adidas"],
  ["New Balance", "New Bal."],
];
const CAT_N = ["1,234", "456", "123"];
const BRAND_N = ["892", "567", "234"];
const FW = 172;
const FY = (i: number) => 104 + i * 30;

function Results({ step, t, narrow }: SceneProps) {
  if (step >= 3) {
    const syn = step === 3;
    return (
      <g>
        <SearchBox text={syn ? "couch" : "ipod"} narrow={narrow} />
        {syn ? (
          [0, 1, 2].map((i) => (
            <g key={i} opacity={seg(t, 0.3 + i * 0.15, 0.5 + i * 0.15)}>
              <Row y={RY(i)} label={narrow ? `sofa ${i + 1}` : `sofa ${i + 1} · indexed as "sofa"`} tone={i === 0 ? "ok" : undefined} />
            </g>
          ))
        ) : (
          <g>
            <Box x={UX} y={96} w={180} h={150} label={narrow ? "index" : "index time"} tone="sky" />
            <Box x={UX + 192} y={96} w={180} h={150} label={narrow ? "query" : "query time"} tone="lit" />
            {[
              [
                ["bigger index", "bigger"],
                ["reindex to", "reindex"],
                ["change", "to change"],
              ],
              [
                ["bigger query", "bigger"],
                ["change with", "change"],
                ["no reindex", "any time"],
              ],
            ].map((col, c) =>
              col.map(([w, n], i) => (
                <Txt key={`${c}${i}`} x={UX + 90 + c * 192} y={196 + i * 18} k="s" opacity={seg(t, 0.3, 0.7)}>
                  {narrow ? n : w}
                </Txt>
              )),
            )}
            <Txt x={UX + 90} y={276} k="s" tone="sky">
              {narrow ? "stable" : "stable synonyms"}
            </Txt>
            <Txt x={UX + 282} y={276} k="s" tone="lit">
              {narrow ? "changing" : "changing ones"}
            </Txt>
          </g>
        )}
        <Engine
          lines={
            syn
              ? [["synonyms", "synonyms", "lit"], ["couch, sofa,"], ["settee → sofa"], ["tv, television"], ["user says couch", "says couch"], ["you have sofa", "has sofa", "ok"]]
              : [["one-way:", "one-way:", "lit"], ["ipod =>"], ["ipod, mp3 player", "ipod, mp3"], ["", "player"], ["not the reverse", "not reverse"]]
          }
          narrow={narrow}
          t={t}
        />
      </g>
    );
  }
  const total = ["2,847", "1,234", "+Nike"][step];
  return (
    <g>
      <SearchBox text="running shoes" narrow={narrow} />
      <Txt x={UX + 4} y={FY(0) - 8} k="s" anchor="start" tone="mute">
        category
      </Txt>
      {CATS.map((c, i) => (
        <Row
          key={c[0]}
          x={UX}
          w={FW}
          y={FY(i)}
          label={pick(narrow, c)}
          right={step === 0 ? CAT_N[i] : undefined}
          check={step >= 1 ? i === 0 : undefined}
          tone={step >= 1 && i === 0 ? "lit" : undefined}
          dim={step === 2 && i > 0}
        />
      ))}
      <Txt x={UX + 4} y={FY(3) + 14} k="s" anchor="start" tone="mute">
        brand
      </Txt>
      {BRANDS.map((b, i) => (
        <Row
          key={b[0]}
          x={UX}
          w={FW}
          y={FY(3) + 22 + i * 30}
          label={pick(narrow, b)}
          right={step === 0 ? BRAND_N[i] : undefined}
          check={step === 2 ? i === 0 : undefined}
          tone={step === 2 ? (i === 0 ? "lit" : "ok") : undefined}
        />
      ))}
      <Txt x={UX + 290} y={128} k="d" tone={step ? "lit" : undefined} opacity={step ? seg(t, 0.3, 0.7) : 1}>
        {total}
      </Txt>
      <Txt x={UX + 290} y={150} k="s">
        {step === 2 ? (narrow ? "brand added" : "brand filter added") : "results"}
      </Txt>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} className={`ax-box${step === 2 && i < 2 ? " lit" : ""}`} x={UX + 196} y={166 + i * 34} width={176 - (i % 2) * 30} height={26} opacity={0.6} />
      ))}
      {step === 2 && !narrow && (
        <Txt x={UX + 196} y={308} k="s" anchor="start" tone="ok">
          other brands still shown
        </Txt>
      )}
      <Engine
        lines={
          (
            [
              [["aggregations", "aggregations", "lit"], ["terms: category", "terms: cat."], ["terms: brand"], ["→ facet counts", "→ counts"]],
              [["filter context", "filter ctx", "lit"], ["no scoring"], ["cacheable", "cacheable", "ok"], ["counts update", "counts update"]],
              [
                ["multi-select", "multi-select", "lit"],
                ["each facet's", "each facet"],
                ["counts exclude", "skips its"],
                ["its own filter", "own filter"],
                ["other brands", "others stay", "ok"],
                ["stay pickable", "pickable", "ok"],
              ],
            ] as L[][]
          )[step]
        }
        narrow={narrow}
        t={t}
      />
    </g>
  );
}

const BRANDS2 = ["Adidas", "Nike", "Brooks", "Nike"];
const ORDER = [
  [0, 1, 2, 3],
  [1, 3, 0, 2],
  [1, 0, 3, 2],
];

function Personal({ step, t, narrow }: SceneProps) {
  if (step <= 2) {
    const strat = step === 1;
    return (
      <g>
        <SearchBox text="zapatillas" narrow={narrow} tag="ES" />
        {strat ? (
          <g>
            <Box x={UX} y={92} w={180} h={40} label={narrow ? "per index" : "index per lang"} tone="sky" />
            {["products_en", "products_es", "products_fr", "products_de"].map((n, i) => (
              <Row key={n} x={UX} w={180} y={140 + i * 34} label={n} tone={i === 1 ? "lit" : undefined} />
            ))}
            <Box x={UX + 192} y={92} w={180} h={40} label={narrow ? "per field" : "field per lang"} tone="ok" />
            {["name_en", "name_es", "name_fr"].map((n, i) => (
              <Row key={n} x={UX + 192} w={180} y={140 + i * 34} label={n} tone={i === 1 ? "lit" : undefined} />
            ))}
          </g>
        ) : (
          [0, 1, 2].map((i) => (
            <g key={i} opacity={seg(t, 0.3 + i * 0.15, 0.5 + i * 0.15)}>
              <Row y={RY(i)} label={narrow ? "Zapatillas para" : "Zapatillas para correr"} right={narrow ? undefined : "running shoes"} tone={i === 0 ? "lit" : undefined} />
            </g>
          ))
        )}
        {step === 2 && <Token x={lerp(UX + UW, EX + 12, seg(t, 0, 0.5))} y={58} s={10} tone="lit" />}
        <Engine
          lines={
            (
              [
                [
                  ["name_es:", "name_es:", "lit"],
                  ['"Zapatillas', '"Zapatillas'],
                  ['para correr"', 'para correr"'],
                  ["spanish analyzer", "es analyzer"],
                  ["same products", "same items"],
                ],
                [
                  ["separate index:", "per index:", "sky"],
                  ["clean, but", "clean, but"],
                  ["cross-language", "cross-lang"],
                  ["is harder", "harder"],
                  ["field per lang:", "per field:", "ok"],
                  ["one index", "one index"],
                ],
                [["detect language", "detect lang", "lit"], ["→ es"], ["search name_es"], ["fallback: base", "fallback:", "warn"], ["language fields", "base fields", "warn"]],
              ] as L[][]
            )[step]
          }
          narrow={narrow}
          t={t}
        />
      </g>
    );
  }
  const o = ORDER[step - 2];
  const prev = ORDER[step - 3];
  return (
    <g>
      <SearchBox text="running shoes" narrow={narrow} />
      {BRANDS2.map((b, i) => {
        const y = lerp(RY(prev.indexOf(i)), RY(o.indexOf(i)), seg(t, 0.3, 0.9));
        const nike = i % 2 === 1;
        const viewed = step === 4 && i === 3;
        return (
          <Row
            key={i}
            y={y}
            label={b}
            right={viewed ? (narrow ? "viewed ×0.8" : "recently viewed ×0.8") : nike ? (narrow ? "boost" : "affinity boost") : undefined}
            tone={nike ? (viewed ? "warn" : "lit") : undefined}
          />
        );
      })}
      {step === 4 && (
        <Txt x={UX + 4} y={250} k="s" anchor="start" tone="ok" opacity={seg(t, 0.5, 0.9)}>
          {narrow ? "+ popular mixed in" : "+ popular results mixed in"}
        </Txt>
      )}
      <Wire d={`M${EX} 160H${UX + UW + 2}`} dash tone="lit" />
      <Engine
        lines={
          step === 3
            ? [["profile", "profile", "lit"], ["purchase = 3", "purchase = 3"], ["view = 1"], ["→ Nike affinity", "→ Nike"], ["boost, not", "boost, not", "ok"], ["a filter", "a filter", "ok"]]
            : [
                ["recently viewed", "viewed:", "warn"],
                ["weight 0.8", "weight 0.8"],
                ["demoted, not", "demoted,"],
                ["hidden", "not hidden"],
                ["avoid filter", "no filter", "ok"],
                ["bubbles", "bubbles", "ok"],
              ]
        }
        narrow={narrow}
        t={t}
      />
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "typing" ? <Typing {...p} /> : p.variant === "results" ? <Results {...p} /> : <Personal {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "typing",
      label: "Typing",
      steps: [
        {
          caption: "Modern search starts before Enter. Every keystroke is a query over 50 million products, answered in under 50 ms.",
          tween: 900,
        },
        {
          caption: 'Edge n-grams pre-compute prefixes at index time: nike becomes n, ni, nik, nike, so a typed "n" is an exact token match.',
          tween: 1600,
        },
        {
          caption: 'At "nike ru" the suggestions narrow to nike running shoes and shorts, ranked by text match, popularity and personalization.',
          tween: 1600,
        },
        {
          caption: '"runnign shoes" finds 3 results. The phrase suggester\'s "running shoes" finds 2,400: over 2x and over 10, so we ask "Did you mean".',
          tween: 1800,
          ms: 3400,
        },
      ],
    },
    {
      id: "results",
      label: "Results",
      steps: [
        {
          caption: "Enter: 2,847 results, and aggregations count them by category, brand and more to build the facets.",
          tween: 1200,
        },
        {
          caption: "Pick Running Shoes: 1,234 results and every facet's counts update. Filters run in filter context: no scoring, cacheable.",
          tween: 1400,
        },
        {
          caption: "Pick Nike too. The other facets narrow to Nike, but brand excludes its own filter, so other brands stay pickable.",
          tween: 1400,
        },
        {
          caption: "Synonyms bridge the vocabulary gap: the user says couch, you indexed sofa. couch, sofa, settee all map to sofa.",
          tween: 1400,
        },
        {
          caption: "Index-time synonyms grow the index and need a reindex to change; query-time ones change freely. One-way: ipod also finds mp3 player.",
          tween: 1200,
          ms: 3400,
        },
      ],
    },
    {
      id: "you",
      label: "Language & you",
      steps: [
        {
          caption: 'Switch to Spanish: "zapatillas" matches name_es, "Zapatillas para correr", through a Spanish analyzer. Same products.',
          tween: 1400,
        },
        {
          caption: "Two layouts: an index per language, products_en and products_es, or one index with a field per language.",
          tween: 1000,
        },
        {
          caption: "Language detection picks the fields to search, and the base language fields stay in as a fallback.",
          tween: 1400,
        },
        {
          caption: "Personalization builds a profile from behaviour, purchases weighing 3x views. Nike affinity boosts Nike; other brands still show.",
          tween: 1600,
        },
        {
          caption: "Recently viewed items get weight 0.8, demoted not hidden, and popular results stay mixed in to avoid a filter bubble.",
          tween: 1600,
          ms: 3400,
        },
      ],
    },
  ],
  Scene,
});
