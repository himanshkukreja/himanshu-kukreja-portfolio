/**
 * Case file "Scalable Spam Detection with Bloom Filters" (GlobalForum): the case file's 16-bit toy
 * filter with h1 = x % 16, h2 = 7x % 16, h3 = 13x % 16. Insert evil-phishing-site.com (hash 42 →
 * bits 10, 6, 2), check suspicious-crypto.net (hash 29 → 13, 11, 9: a 0, so definitely clean).
 * The false-positive tab adds a second toy threat (hash 22) so a clean URL (hash 34) hits only 1s
 * and has to be verified against the database.
 */
import { Box, defineExplainer, seg, Token, Txt, Wire, lerp, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
const M = 16;
const CW = 31;
const GAP = 4;
const BX = 22;
const BY = 168;
const BH = 38;
const HX = [24, 220, 416];
const HY = 116;
const VER = { x: 150, y: 266, w: 136, h: 50 };
const DB = { x: 330, y: 266, w: 136, h: 50 };
const hashes = (x: number) => [x % M, (x * 7) % M, (x * 13) % M];
const cellX = (i: number) => BX + i * (CW + GAP);

type Op = { kind: "insert" | "check"; url: string; short: string; h: number };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const fp = variant === "fp";
  let op: Op;
  const on = new Set<number>(fp ? [2, 6, 10] : []);
  let flipping: number[] = [];
  let verdict: { text: string; tone: Tone } | null = null;
  let note = "";
  if (!fp) {
    op = step < 2 ? { kind: "insert", url: "evil-phishing-site.com", short: "evil-phishing-site", h: 42 } : { kind: "check", url: "suspicious-crypto.net", short: "suspicious-crypto", h: 29 };
    if (step === 1) flipping = hashes(42);
    if (step >= 2) {
      hashes(42).forEach((b) => on.add(b));
      if (t > 0.7) verdict = { text: narrow ? "DEFINITELY CLEAN" : "a 0 → DEFINITELY CLEAN · no DB hit", tone: "ok" };
    }
    if (step === 1 && t > 0.8) note = narrow ? "bits only, no URL" : "the filter stores bits, never the URL";
  } else {
    op = step === 0 ? { kind: "insert", url: "second threat · toy hash 22", short: "threat · hash 22", h: 22 } : { kind: "check", url: "a clean URL · toy hash 34", short: "clean · hash 34", h: 34 };
    if (step === 0) {
      flipping = [14];
      if (t > 0.6) note = narrow ? "6, 10 already 1" : "bits 6 and 10 were already 1";
    } else on.add(14);
    if (step >= 1 && (step > 1 || t > 0.7)) verdict = { text: narrow ? "POSSIBLY MALICIOUS" : "all 1 → POSSIBLY MALICIOUS", tone: "warn" };
    if (step === 2 && t > 0.85) verdict = { text: narrow ? "FALSE POSITIVE · posted" : "FALSE POSITIVE · message posted", tone: "ok" };
    if (step === 3) verdict = null;
  }
  const hs = hashes(op.h);
  // a bit is drawn set if it was on before or its flip has happened in this step
  const flipAt = (i: number) => {
    const k = flipping.indexOf(i);
    return k < 0 ? -1 : seg(t, 0.2 + k * 0.2, 0.4 + k * 0.2);
  };
  const isOn = (i: number) => on.has(i) || flipAt(i) >= 1;
  const show = step === 0 || (op.kind === "check" && ((!fp && step === 2) || (fp && step === 1))) ? seg(t, 0, 0.45) : 1;
  const formula = (j: number) => {
    const mult = [1, 7, 13][j];
    const r = hs[j];
    if (narrow) return mult === 1 ? `${op.h}%16=${r}` : `${op.h}×${mult}%16=${r}`;
    return mult === 1 ? `h1: ${op.h} % 16 = ${r}` : `h${j + 1}: ${op.h} × ${mult} % 16 = ${r}`;
  };
  const verifying = fp && step >= 2;
  const vp = fp && step === 2 ? t : 1;
  const tok: { x: number; y: number; tone: Tone }[] = [];
  if (verifying && step === 2) {
    if (vp < 0.35) tok.push({ x: lerp(VER.x + VER.w, DB.x, seg(vp, 0.05, 0.35)), y: VER.y + VER.h / 2 - 8, tone: "warn" });
    else if (vp < 0.7) tok.push({ x: lerp(DB.x, VER.x + VER.w, seg(vp, 0.4, 0.7)), y: VER.y + VER.h / 2 + 8, tone: "ok" });
  }
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={fp && step === 3 ? "lit" : op.kind === "insert" ? "bad" : "sky"}>
        {fp && step === 3 ? "at full scale" : op.kind === "insert" ? "insert a malicious URL" : "check a URL"}
      </Txt>
      {!(fp && step === 3) && (
        <Txt x={24} y={64} anchor="start">
          {narrow ? op.short : fp ? op.url : `${op.url} · hash ${op.h}`}
        </Txt>
      )}
      {!(fp && step === 3) &&
        hs.map((b, j) => {
          const cx = cellX(b) + CW / 2;
          const hx = HX[j] + (formula(j).length * (narrow ? 10.4 : 7.8)) / 2;
          return (
            <g key={j} opacity={show}>
              <Txt x={HX[j]} y={HY - 12} k="s" anchor="start" tone={op.kind === "insert" ? "bad" : "sky"}>
                {formula(j)}
              </Txt>
              <Wire d={`M${hx} ${HY}C${hx} ${HY + 26} ${cx} ${BY - 30} ${cx} ${BY - 4}`} arrow tone={op.kind === "insert" ? "lit" : undefined} />
            </g>
          );
        })}
      {Array.from({ length: M }, (_, i) => {
        const set = isOn(i);
        const target = !(fp && step === 3) && hs.includes(i);
        return (
          <g key={i}>
            <rect x={cellX(i)} y={BY} width={CW} height={BH} className={`bf-bit${set ? " on" : ""}${target ? (op.kind === "check" ? (set ? " hit" : " miss") : " hit") : ""}`} />
            <text x={cellX(i) + CW / 2} y={BY + BH / 2 + 5} textAnchor="middle" className={`ax-t bf-v${set ? " on" : ""}`}>
              {set ? 1 : 0}
            </text>
            <text x={cellX(i) + CW / 2} y={BY + BH + 16} textAnchor="middle" className="ax-s">
              {i}
            </text>
          </g>
        );
      })}
      {note && (
        <Txt x={W / 2} y={BY + BH + 44} k="s" tone="lit">
          {note}
        </Txt>
      )}
      {verdict && (
        <Txt x={W / 2} y={BY + BH + (note ? 70 : 48)} k="k" tone={verdict.tone}>
          {verdict.text}
        </Txt>
      )}
      {verifying && step === 2 && (
        <g>
          <Box x={VER.x} y={VER.y} w={VER.w} h={VER.h} label="Verify" sub="service" tone="warn" />
          <Wire d={`M${VER.x + VER.w} ${VER.y + VER.h / 2}H${DB.x}`} arrow />
          <Box x={DB.x} y={DB.y} w={DB.w} h={DB.h} label="Database" sub={vp > 0.4 ? "not found" : "spam_urls"} tone={vp > 0.4 ? "ok" : undefined} />
          {tok.map((k, i) => (
            <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
          ))}
        </g>
      )}
      {fp && step === 3 && (
        <g>
          <Txt x={24} y={HY - 12} k="s" anchor="start" tone="mute">
            {narrow ? "GlobalForum: n = 1.2B URLs" : "GlobalForum: n = 1.2 billion malicious URLs, p = 0.1%"}
          </Txt>
          <Txt x={W / 2} y={BY + BH + 50} k="t">
            {narrow ? "17.2B bits ≈ 2.15 GB" : "m ≈ 17.2 billion bits ≈ 2.15 GB"}
          </Txt>
          <Txt x={W / 2} y={BY + BH + 76} k="t">
            {narrow ? "k ≈ 10 · p = 0.1%" : "k ≈ 10 hash functions · 1 in 1,000 checks"}
          </Txt>
          <Txt x={W / 2} y={BY + BH + 100} k="s" tone="mute">
            {narrow ? "vs 120 GB+ of URLs" : "vs 120 GB+ to store the URLs themselves"}
          </Txt>
        </g>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.bf-bit{fill:var(--ax-box);stroke:var(--ax-line);stroke-width:1.5}.bf-bit.on{fill:var(--ax-accent);stroke:var(--ax-accent)}.bf-bit.hit{stroke:var(--ax-fg);stroke-width:2.5}.bf-bit.miss{stroke:var(--ax-ok);stroke-width:2.5}.bf-v{fill:var(--ax-fg4)}.bf-v.on{fill:var(--ax-on-accent)}`,
  variants: [
    {
      id: "basic",
      label: "Insert + check",
      steps: [
        { caption: "16 bits, all 0. Insert evil-phishing-site.com, hash 42: the three hash functions give 10, 6 and 2.", tween: 1600, ms: 2800 },
        { caption: "Bits 2, 6 and 10 flip to 1. The filter keeps those bits, never the URL itself.", tween: 1600, ms: 2600 },
        { caption: "Check suspicious-crypto.net, hash 29: bits 13, 11 and 9. One 0 is enough: definitely clean, no database hit.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "fp",
      label: "False positive",
      steps: [
        { caption: "A second threat, toy hash 22, sets bits 6, 10 and 14. Bits 6 and 10 were already 1.", tween: 1400, ms: 2800 },
        { caption: "A clean URL, toy hash 34, checks bits 2, 14 and 10: all 1, set by two other URLs.", tween: 1800, ms: 2800 },
        { caption: "So it is only possibly malicious. The verify service asks the database: not found, false positive, message posted.", tween: 2200, ms: 3000 },
        { caption: "At GlobalForum's scale, 17.2 billion bits (2.15 GB) and 10 hash functions keep false positives to 0.1%.", tween: 800, ms: 3800 },
      ],
    },
  ],
  Scene,
});
