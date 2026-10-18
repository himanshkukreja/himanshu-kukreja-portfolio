/**
 * Inverted index (week 7, day 1 · 2.1–2.3): the lesson's five products p1–p5 are tokenized into
 * term → posting lists at index time; the query "running shoes" is two lookups,
 * [p1, p2, p4, p5] and [p1, p2, p3], and one intersection: [p1, p2].
 */
import { defineExplainer, lerp, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 350;
const DOCS: [string, string][] = [
  ["p1", "Red Nike Running Shoes"],
  ["p2", "Blue Adidas Running Shoes"],
  ["p3", "Nike Basketball Shoes White"],
  ["p4", "Red Running Shorts"],
  ["p5", "Professional Running Watch"],
];
const TERMS = ["adidas", "basketball", "blue", "nike", "professional", "red", "running", "shoes", "shorts", "watch", "white"];
const tokens = (s: string) => s.toLowerCase().split(/\W+/).filter(Boolean);
const POSTINGS: Record<string, string[]> = Object.fromEntries(TERMS.map((term) => [term, DOCS.filter(([, s]) => tokens(s).includes(term)).map(([id]) => id)]));
const DX = 24;
const DY = (i: number) => 82 + i * 30;
const IXW = 352; // index column x (wide)
const IXN = 346; // and narrow (postings right-aligned there)
const IY = (i: number) => 66 + i * 24;
const Q = ["running", "shoes"];
const HIT = ["p1", "p2"];

function Scene({ variant, step, t, narrow }: SceneProps) {
  const IX = narrow ? IXN : IXW;
  const query = variant === "query";
  // build: how many documents are indexed so far (fractional during the tween)
  const built = query ? 5 : step === 0 ? seg(t, 0.05, 0.9) : step === 1 ? 1 + seg(t, 0, 0.9) * 4 : 5;
  const doneDocs = Math.floor(built + 1e-6);
  const cur = !query && built < 5 && built % 1 > 0 ? Math.floor(built) : -1; // doc being tokenized
  const curP = built % 1;
  const lookups = query ? (step === 0 ? 0 : step === 1 ? seg(t, 0.1, 0.9) * 2 : 2) : 0;
  const inter = query && step === 2 ? seg(t, 0.1, 0.8) : 0;
  const termTone = (term: string): Tone => {
    if (!query) return cur >= 0 && tokens(DOCS[cur][1]).includes(term) ? "lit" : undefined;
    const qi = Q.indexOf(term);
    return qi >= 0 && lookups > qi ? "lit" : undefined;
  };
  return (
    <g>
      <Txt x={DX} y={36} k="k" anchor="start" tone={query ? "lit" : undefined}>
        {query ? (narrow ? "query: running shoes" : "query: \"running shoes\"") : narrow ? "index time" : "index time · products"}
      </Txt>
      {query && (
        <Txt x={DX} y={58} k="s" anchor="start" tone="lit" opacity={step === 0 ? seg(t, 0.2, 0.7) : 1}>
          → [running, shoes]
        </Txt>
      )}
      {/* documents */}
      {DOCS.map(([id, text], i) => {
        const hit = query && inter >= 1 && HIT.includes(id);
        const on = !query && i === cur;
        const indexed = !query && i < doneDocs;
        return (
          <g key={id} opacity={query ? (inter >= 1 && !hit ? 0.4 : 1) : on || indexed ? 1 : 0.45}>
            {(on || hit) && <rect x={DX - 6} y={DY(i) - 17} width={narrow ? 314 : 300} height={24} className={`ii-row ${hit ? "ok" : "lit"}`} />}
            <Txt x={DX} y={DY(i)} k="s" anchor="start" tone={hit ? "ok" : on ? "lit" : "mute"}>
              {id}
            </Txt>
            <Txt x={DX + (narrow ? 26 : 30)} y={DY(i)} k="s" anchor="start" tone={hit ? "ok" : on ? "lit" : undefined}>
              {text}
            </Txt>
          </g>
        );
      })}
      {/* tokens flying from the current doc to their terms */}
      {cur >= 0 &&
        tokens(DOCS[cur][1]).map((term) => {
          const j = TERMS.indexOf(term);
          const p = seg(curP, 0.15, 0.85);
          return p > 0 && p < 1 ? <Token key={term} x={lerp(DX + 270, IX - 8, p)} y={lerp(DY(cur) - 4, IY(j) - 4, p)} s={8} tone="lit" /> : null;
        })}
      {/* the index */}
      <rect x={IX - 10} y={44} width={W - IX - (narrow ? 0 : 14)} height={IY(10) + 16 - 44} className="ax-box" />
      {TERMS.map((term, j) => {
        const docs = POSTINGS[term].filter((id) => Number(id.slice(1)) <= (query ? 5 : doneDocs));
        const tone = termTone(term);
        const exists = docs.length > 0;
        return (
          <g key={term} opacity={exists ? 1 : 0.3}>
            <Txt x={IX} y={IY(j)} k="s" anchor="start" tone={tone || (exists ? undefined : "mute")}>
              {term}
            </Txt>
            <Txt x={narrow ? 584 : IX + 104} y={IY(j)} k="s" anchor={narrow ? "end" : "start"} tone={tone || "mute"}>
              {exists ? docs.join(" ") : ""}
            </Txt>
          </g>
        );
      })}
      <Txt x={IX - 12} y={36} k="k" anchor="start" tone="mute">
        {narrow ? "term → docs" : `inverted index · ${query ? 11 : TERMS.filter((x) => POSTINGS[x].some((id) => Number(id.slice(1)) <= doneDocs)).length} terms`}
      </Txt>
      {/* the intersection */}
      {query && step >= 1 && (
        <g>
          <Txt x={DX} y={252} k="s" anchor="start" tone={lookups > 0 ? "lit" : "mute"}>
            {`running  ${lookups > 0 ? POSTINGS.running.join(" ") : ""}`}
          </Txt>
          <Txt x={DX} y={276} k="s" anchor="start" tone={lookups > 1 ? "lit" : "mute"}>
            {`shoes    ${lookups > 1 ? POSTINGS.shoes.join(" ") : ""}`}
          </Txt>
          {step === 2 && (
            <g opacity={inter}>
              <line x1={DX} x2={DX + 250} y1={290} y2={290} className="ii-rule" />
              <Txt x={DX} y={316} k="t" anchor="start" tone="ok">
                {`∩  ${HIT.join(" ")}`}
              </Txt>
              <Txt x={DX + 250} y={316} k="s" anchor="end" tone="ok">
                {"< 1 ms"}
              </Txt>
            </g>
          )}
        </g>
      )}
      {!query && step === 2 && (
        <Txt x={DX} y={262} k="s" anchor="start" tone="ok">
          {narrow ? "done once, at index time" : "work done once, at index time"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ii-row{fill:none;stroke-width:1.5}.ii-row.lit{stroke:var(--ax-accent)}.ii-row.ok{stroke:var(--ax-ok)}.ii-rule{stroke:var(--ax-line);stroke-width:1.5}`,
  variants: [
    {
      id: "build",
      label: "Build the index",
      steps: [
        { caption: "Indexing p1, \"Red Nike Running Shoes\": tokenize it and add p1 to each term's posting list.", tween: 2200 },
        { caption: "p2 to p5 follow. Shared words reuse one entry: running now lists p1, p2, p4 and p5.", tween: 5200, ms: 2600 },
        { caption: "Eleven terms, each pointing to the documents that contain it. The work is done once, at index time.", tween: 900, ms: 3400 },
      ],
    },
    {
      id: "query",
      label: "Query",
      steps: [
        { caption: "The query \"running shoes\" is tokenized into running and shoes, in microseconds.", tween: 1200 },
        { caption: "Two direct lookups: running → p1, p2, p4, p5 and shoes → p1, p2, p3.", tween: 2000 },
        { caption: "Intersect the lists: p1 and p2, in under 1 ms. SQL LIKE needs 50 million string comparisons.", tween: 1600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
