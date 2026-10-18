/**
 * Edge n-gram autocomplete (week 7, day 4 · 1.1–1.3): at index time "nike" becomes n, ni, nik,
 * nike (min_gram 1), so a typed prefix is an exact term. At search time the analyzer only
 * lowercases: "ni" is one token and one lookup, returning nike before nikon on a sports site.
 */
import { defineExplainer, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const X0 = 24;
const IX = 340;
const ROWS = ["n", "ni", "nik", "nike", "niko", "nikon"];
const RY = (i: number) => 74 + i * 34;
const grams = (w: string) => Array.from({ length: w.length }, (_, i) => w.slice(0, i + 1));

function Chip({ x, y, text, tone, narrow }: { x: number; y: number; text: string; tone?: Tone; narrow: boolean }) {
  const w = text.length * (narrow ? 9.8 : 7.6) + 14;
  return (
    <g>
      <rect x={x} y={y - 16} width={w} height={24} className={`ax-box${tone ? ` ${tone}` : ""}`} />
      <Txt x={x + w / 2} y={y + 1} k="s" tone={tone}>
        {text}
      </Txt>
    </g>
  );
}
function chipRow(words: string[], narrow: boolean) {
  let x = X0;
  return words.map((w) => {
    const at = x;
    x += w.length * (narrow ? 9.8 : 7.6) + 14 + 6;
    return { w, x: at };
  });
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const query = variant === "query";
  // index contents: which docs each prefix row points to
  const nikeG = query ? 4 : step === 0 ? 0 : step === 1 ? Math.min(4, Math.floor(seg(t, 0.05, 0.9) * 4) + 1) : 4;
  const nikonG = query ? 5 : step === 2 ? Math.min(5, Math.floor(seg(t, 0.05, 0.9) * 5) + 1) : 0;
  const postings = (row: string) => {
    const out: string[] = [];
    const i = ROWS.indexOf(row);
    if (!query && step === 0) return row === "nike" ? ["nike"] : [];
    if ("nike".startsWith(row) && i < nikeG) out.push("nike");
    if ("nikon".startsWith(row) && row.length <= nikonG) out.push("nikon");
    return out;
  };
  const typed = query ? (step === 2 ? "nike" : "ni") : "";
  const look = query ? (step === 0 ? "" : typed) : "";
  const lookOn = query && step >= 1 ? seg(t, 0.15, 0.6) >= 1 || step === 2 : false;
  return (
    <g>
      {/* left: what is happening */}
      {!query ? (
        <g>
          <Txt x={X0} y={36} k="k" anchor="start">
            index time
          </Txt>
          <Txt x={X0} y={74} k="s" anchor="start">
            {step === 0 ? (narrow ? "standard" : "standard tokenizer") : narrow ? "edge_ngram, min 1" : "edge_ngram filter · min_gram 1"}
          </Txt>
          {step === 0 && <Chip x={X0} y={104} text="nike" narrow={narrow} />}
          {step >= 1 &&
            chipRow(grams("nike"), narrow).map((c, i) => (
              <g key={c.w} opacity={i < nikeG ? 1 : 0.15}>
                <Chip x={c.x} y={104} text={c.w} tone={step === 1 ? "lit" : undefined} narrow={narrow} />
              </g>
            ))}
          {step === 2 &&
            chipRow(grams("nikon"), narrow).map((c, i) => (
              <g key={c.w} opacity={i < nikonG ? 1 : 0.15}>
                <Chip x={c.x} y={148} text={c.w} tone="lit" narrow={narrow} />
              </g>
            ))}
          {step === 0 && (
            <g>
              <Txt x={X0} y={170} k="s" anchor="start">
                {narrow ? "type \"ni\":" : "the user types \"ni\":"}
              </Txt>
              <Txt x={X0} y={194} k="t" anchor="start" tone="bad">
                no term &quot;ni&quot;
              </Txt>
            </g>
          )}
          <Txt x={X0} y={254} k="s" anchor="start" tone={step === 2 ? "warn" : "mute"}>
            {narrow ? "stored" : "tokens stored"}
          </Txt>
          <Txt x={X0} y={296} k="d" anchor="start" tone={step === 2 ? "warn" : undefined}>
            {step === 0 ? "1" : String(nikeG + nikonG)}
          </Txt>
          {step === 2 && (
            <Txt x={X0 + 60} y={296} k="s" anchor="start" tone="warn">
              {narrow ? "vs 2 words" : "vs 2 standard tokens"}
            </Txt>
          )}
        </g>
      ) : (
        <g>
          <Txt x={X0} y={36} k="k" anchor="start">
            search time
          </Txt>
          <rect x={X0} y={52} width={narrow ? 200 : 220} height={36} className="ax-box lit" />
          <Txt x={X0 + 12} y={76} k="t" anchor="start">
            {typed}
          </Txt>
          <rect x={X0 + 14 + typed.length * (narrow ? 11.4 : 8.6)} y={60} width={2} height={20} className="ax-fill" />
          <Txt x={X0} y={116} k="s" anchor="start">
            {narrow ? "analyzer: lowercase" : "search analyzer: lowercase only"}
          </Txt>
          <Txt x={X0} y={146} k="s" anchor="start" tone="mute">
            →
          </Txt>
          <Chip x={X0 + 22} y={146} text={typed} tone="lit" narrow={narrow} />
          {!narrow && (
            <Txt x={X0 + 34 + typed.length * 7.6 + 12} y={146} k="s" anchor="start" tone="mute">
              one token
            </Txt>
          )}
          {step >= 1 && (
            <g opacity={lookOn ? 1 : 0.2}>
              <Txt x={X0} y={190} k="k" anchor="start" tone="ok">
                suggestions
              </Txt>
              {postings(typed).map((d, i) => (
                <g key={d}>
                  <Txt x={X0} y={218 + i * 28} k="s" anchor="start" tone="mute">
                    {`${i + 1}`}
                  </Txt>
                  <Txt x={X0 + 22} y={218 + i * 28} k="t" anchor="start" tone={i === 0 ? "ok" : undefined}>
                    {d}
                  </Txt>
                  {!narrow && (
                    <Txt x={X0 + 100} y={218 + i * 28} k="s" anchor="start" tone="mute">
                      {d === "nike" ? "popular on a sports site" : ""}
                    </Txt>
                  )}
                </g>
              ))}
            </g>
          )}
          <Txt x={X0} y={304} k="s" anchor="start" tone={step >= 1 ? "ok" : "mute"}>
            {step >= 1 ? (narrow ? "1 exact lookup · < 50 ms" : "one exact lookup per keystroke · budget < 50 ms") : narrow ? "no n-grams at search" : "no n-grams at search time"}
          </Txt>
        </g>
      )}
      {/* right: the index */}
      <rect x={IX - 12} y={44} width={W - IX - 12 + 12} height={RY(5) + 22 - 44} className="ax-box" />
      <Txt x={IX - 12} y={34} k="k" anchor="start" tone="mute">
        {narrow ? "term → docs" : "index: term → docs"}
      </Txt>
      {ROWS.map((r, i) => {
        const docs = postings(r);
        const hit = query && lookOn && r === look;
        const fresh = !query && step === 1 && "nike".startsWith(r) && docs.includes("nike");
        const fresh2 = !query && step === 2 && docs.includes("nikon");
        const tone: Tone = hit ? "ok" : fresh || fresh2 ? "lit" : undefined;
        return (
          <g key={r} opacity={docs.length ? 1 : 0.28}>
            {hit && <rect x={IX - 6} y={RY(i) - 18} width={W - IX - 12} height={26} className="en-hit" />}
            <Txt x={IX} y={RY(i)} k="s" anchor="start" tone={tone}>
              {r}
            </Txt>
            <Txt x={IX + (narrow ? 66 : 56)} y={RY(i)} k="s" anchor="start" tone={tone || "mute"}>
              {docs.length ? `→ ${docs.join(", ")}` : ""}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.en-hit{fill:none;stroke:var(--ax-ok);stroke-width:1.5}`,
  variants: [
    {
      id: "index",
      label: "Index time",
      steps: [
        { caption: "Standard tokenization stores \"nike\" as one token, so a typed \"ni\" has no term to match exactly.", tween: 1000 },
        { caption: "Edge n-grams (min 1) store every prefix: n, ni, nik, nike, each pointing to the document.", tween: 2200 },
        { caption: "Same for nikon. More tokens cost storage, but every prefix is now an exact term.", tween: 2400, ms: 3400 },
      ],
    },
    {
      id: "query",
      label: "Search time",
      steps: [
        { caption: "The user types \"ni\". The search analyzer only lowercases: one token, ni, no n-grams.", tween: 1000 },
        { caption: "ni is an exact term: one lookup returns nike and nikon, nike first on a sports site.", tween: 1600 },
        { caption: "Every keystroke is another exact lookup. \"nike\" narrows it to one, inside the 50 ms budget.", tween: 1200, ms: 3400 },
      ],
    },
  ],
  Scene,
});
