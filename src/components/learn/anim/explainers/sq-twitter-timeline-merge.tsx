/**
 * Twitter/X side quest (deep dives 1 and 2): the write path stores every tweet, then pushes it
 * (one fanout_batch of 1,000 follower ids, LPUSH + LTRIM 800 per timeline) for an author with
 * 1,000 followers, but only ZADDs it to celebrity_tweets:{author} (last 100 kept) above 10,000
 * followers; the read path LRANGEs timeline:user123 (501, 499, 495), pulls the followed
 * celebrities' recent ids with ZREVRANGE (503, 500, 498), merges newest first and hydrates the
 * top ids with one MGET.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;

type Pt = { x: number; y: number };
type R = { x: number; y: number; w: number; h: number };
const mid = (r: R): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const mv = (a: Pt, b: Pt, p: number): Pt => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });
/** a there-and-back trip inside [a, b] of t: out on the first half, home on the second */
const trip = (t: number, a: number, b: number, from: Pt, to: Pt): Pt | null => {
  const p = seg(t, a, b);
  if (p <= 0 || p >= 1) return null;
  return p < 0.5 ? mv(from, to, ease(p * 2)) : mv(to, from, ease((p - 0.5) * 2));
};

/* ------------------------------------------------------------------ write path */

const AU: R = { x: 20, y: 118, w: 164, h: 64 };
const FO: R = { x: 214, y: 118, w: 140, h: 64 };
const TS: R = { x: 214, y: 24, w: 140, h: 52 };
const RX = 400;
const RW = 176;
const Q: R = { x: RX, y: 24, w: RW, h: 52 };
const TL = [0, 1, 2, 3].map((i) => ({ x: RX, y: 100 + i * 26, w: RW, h: 20 }));
const CZ: R = { x: RX, y: 220, w: RW, h: 56 };

function WriteScene({ step, t, narrow }: SceneProps) {
  const celeb = step === 2;
  const toks: (Pt & { tone: Tone })[] = [];
  const auR: Pt = { x: AU.x + AU.w, y: mid(AU).y };
  const foL: Pt = { x: FO.x, y: mid(FO).y };
  const foR: Pt = { x: FO.x + FO.w, y: mid(FO).y };
  const foT: Pt = { x: mid(FO).x, y: FO.y };
  const tsB: Pt = { x: mid(TS).x, y: TS.y + TS.h };
  // every step starts with the tweet arriving and being stored
  const arrive = seg(t, 0, 0.25);
  if (arrive > 0 && arrive < 1) toks.push({ ...mv(auR, foL, ease(arrive)), tone: celeb ? "warn" : "lit" });
  const st = trip(t, 0.25, 0.5, foT, tsB);
  if (st) toks.push({ ...st, tone: "sky" });
  const decided = step === 0 ? t >= 0.6 : true;
  let writes = 0;
  if (step === 1) {
    const qp = seg(t, 0.5, 0.65);
    if (qp > 0 && qp < 1) toks.push({ ...mv(foR, { x: Q.x, y: mid(Q).y }, ease(qp)), tone: "lit" });
    TL.forEach((r, i) => {
      const p = seg(t, 0.65 + i * 0.06, 0.82 + i * 0.06);
      if (p > 0 && p < 1) toks.push({ ...mv({ x: mid(Q).x, y: Q.y + Q.h }, { x: r.x + 20, y: mid(r).y }, ease(p)), tone: "lit" });
    });
    writes = Math.round(1000 * seg(t, 0.65, 1));
  }
  if (celeb) {
    const p = seg(t, 0.55, 0.85);
    if (p > 0 && p < 1) toks.push({ ...mv(foR, { x: CZ.x, y: mid(CZ).y }, ease(p)), tone: "warn" });
  }
  const pushed = step === 1 && t >= 0.65;
  const zadded = celeb && t >= 0.85;
  return (
    <g>
      <Wire d={`M${auR.x} ${auR.y}H${foL.x}`} arrow />
      <Wire d={`M${foT.x} ${foT.y}V${tsB.y}`} />
      <Wire d={`M${foR.x} ${foR.y}L${Q.x} ${mid(Q).y}`} tone={step === 1 ? "lit" : undefined} opacity={celeb ? 0.3 : 1} />
      <Wire d={`M${foR.x} ${foR.y}L${CZ.x} ${mid(CZ).y}`} tone={celeb ? "lit" : undefined} opacity={step === 1 ? 0.3 : 1} />
      <Box x={AU.x} y={AU.y} w={AU.w} h={AU.h} label={celeb ? "Celebrity" : "Author"} sub={celeb ? "100M followers" : narrow ? "1K followers" : "1,000 followers"} tone={celeb ? "warn" : "lit"} />
      <Box x={TS.x} y={TS.y} w={TS.w} h={TS.h} label="Tweet store" sub={narrow ? "first" : "stored first"} tone={t >= 0.5 ? "sky" : undefined} />
      <Box x={FO.x} y={FO.y} w={FO.w} h={FO.h} label="Fan-out" sub={!decided ? (narrow ? "> 10K?" : "> 10,000?") : celeb ? (narrow ? "> 10K: pull" : "> 10K → pull") : narrow ? "≤ 10K: push" : "≤ 10K → push"} tone={decided ? (celeb ? "warn" : "lit") : undefined} />
      <Box x={Q.x} y={Q.y} w={Q.w} h={Q.h} label={narrow ? "queue" : "fanout_batch"} sub={narrow ? "1 × 1,000 ids" : "1 batch × 1,000 ids"} tone={step === 1 && t >= 0.6 ? "lit" : undefined} dim={celeb} />
      {TL.map((r, i) => (
        <g key={i} opacity={celeb ? 0.32 : 1}>
          <rect className={`ax-box${pushed && t >= 0.82 + i * 0.06 ? " sky" : ""}`} x={r.x} y={r.y} width={r.w} height={r.h} />
          <text className="ax-s" x={r.x + 10} y={r.y + 14}>
            {i === 3 ? (narrow ? "… ×1,000" : "… 1,000 timelines") : narrow ? `timeline:f${i + 1}` : `timeline:f${i + 1} ← id`}
          </text>
        </g>
      ))}
      <Box x={CZ.x} y={CZ.y} w={CZ.w} h={CZ.h} label={narrow ? "celeb ZSET" : "celebrity_tweets"} sub={narrow ? "ZADD, last 100" : "ZADD · keep last 100"} tone={zadded ? "warn" : undefined} dim={step === 1} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
      <Txt x={24} y={226} k="k" anchor="start" tone="mute">
        timeline writes
      </Txt>
      <Txt x={24} y={264} k="d" anchor="start" tone={celeb ? "ok" : undefined}>
        {celeb ? "0" : step === 0 ? "—" : writes.toLocaleString("en-US")}
      </Txt>
      <Txt x={24} y={288} k="s" anchor="start" tone={celeb ? "mute" : undefined}>
        {celeb ? (narrow ? "push: ~16 min" : "push would take ~16 min") : step === 1 ? (narrow ? "LPUSH, LTRIM 800" : "LPUSH + LTRIM 800") : ""}
      </Txt>
    </g>
  );
}

/* ------------------------------------------------------------------ read path */

const LA: R = { x: 24, y: 40, w: 150, h: 96 };
const LB: R = { x: 24, y: 172, w: 150, h: 96 };
const GR: R = { x: 214, y: 30, w: 140, h: 52 };
const SV: R = { x: 214, y: 124, w: 140, h: 56 };
const ST: R = { x: 214, y: 220, w: 140, h: 52 };
const MG: R = { x: 400, y: 40, w: 176, h: 228 };
const A_IDS = [501, 499, 495];
const B_IDS = [503, 500, 498];
const MERGED = [...A_IDS, ...B_IDS].sort((a, b) => b - a);
const rowY = (r: R, i: number) => r.y + 22 + i * 24;
const mRowY = (i: number) => MG.y + 24 + i * 33;

function ReadScene({ step, t, narrow }: SceneProps) {
  const toks: (Pt & { tone: Tone })[] = [];
  const svL: Pt = { x: SV.x, y: mid(SV).y };
  const svT: Pt = { x: mid(SV).x, y: SV.y };
  const svB: Pt = { x: mid(SV).x, y: SV.y + SV.h };
  const aR: Pt = { x: LA.x + LA.w, y: mid(LA).y };
  const bR: Pt = { x: LB.x + LB.w, y: mid(LB).y };
  if (step === 0) {
    const p = trip(t, 0, 0.7, svL, aR);
    if (p) toks.push({ ...p, tone: "sky" });
  }
  if (step === 1) {
    const g = trip(t, 0, 0.4, svT, { x: mid(GR).x, y: GR.y + GR.h });
    if (g) toks.push({ ...g, tone: "mute" });
    const b = trip(t, 0.45, 0.95, svL, bR);
    if (b) toks.push({ ...b, tone: "warn" });
  }
  if (step === 3) {
    const h = trip(t, 0, 0.6, svB, { x: mid(ST).x, y: ST.y });
    if (h) toks.push({ ...h, tone: "ok" });
  }
  const aOn = step >= 0 && (step > 0 || t >= 0.35);
  const bOn = step > 1 || (step === 1 && t >= 0.7);
  const hydrated = step === 3 && t >= 0.6;
  const list = (r: R, ids: number[], on: boolean, tone: Tone, head: string) => (
    <g>
      <Txt x={r.x} y={r.y - 8} k="s" anchor="start" tone={on ? tone : "mute"}>
        {head}
      </Txt>
      <rect className={`ax-box${on ? " " + tone : ""}`} x={r.x} y={r.y} width={r.w} height={r.h} />
      {ids.map((id, i) => {
        const gone = step === 2 ? t >= 0.1 + MERGED.indexOf(id) * 0.13 : step > 2;
        return (
          <Txt key={id} x={r.x + 20} y={rowY(r, i) + 5} anchor="start" tone={on ? tone : "mute"} opacity={on ? (gone ? 0.35 : 1) : 0.4}>
            {`tweet_${id}`}
          </Txt>
        );
      })}
      <Txt x={r.x + 20} y={rowY(r, 3)} anchor="start" k="s" tone="mute">
        …
      </Txt>
    </g>
  );
  return (
    <g>
      <Wire d={`M${aR.x} ${aR.y}L${svL.x} ${svL.y}`} tone={step === 0 ? "lit" : undefined} />
      <Wire d={`M${bR.x} ${bR.y}L${svL.x} ${svL.y}`} tone={step === 1 && t >= 0.45 ? "lit" : undefined} />
      <Wire d={`M${svT.x} ${svT.y}V${GR.y + GR.h}`} tone={step === 1 && t < 0.45 ? "lit" : undefined} />
      <Wire d={`M${svB.x} ${svB.y}V${ST.y}`} tone={step === 3 ? "lit" : undefined} />
      <Wire d={`M${SV.x + SV.w} ${mid(SV).y}H${MG.x}`} tone={step >= 2 ? "lit" : undefined} arrow />
      {list(LA, A_IDS, aOn, "sky", narrow ? "timeline (push)" : "timeline:user123")}
      {list(LB, B_IDS, bOn, "warn", narrow ? "celebs (pull)" : "celebrity_tweets ×3")}
      <Box x={GR.x} y={GR.y} w={GR.w} h={GR.h} label={narrow ? "Graph" : "Social graph"} sub={narrow ? "> 10K: 3" : "> 10K: 3 celebs"} tone={step === 1 ? "lit" : undefined} dim={step !== 1} />
      <Box x={SV.x} y={SV.y} w={SV.w} h={SV.h} label={narrow ? "Timeline" : "Timeline svc"} sub={["LRANGE", "ZREVRANGE", "merge", "MGET"][step] ?? ""} tone="lit" />
      <Box x={ST.x} y={ST.y} w={ST.w} h={ST.h} label="Tweet store" sub={narrow ? "1 MGET" : "one MGET"} tone={step === 3 ? "ok" : undefined} dim={step !== 3} />
      <Txt x={MG.x} y={MG.y - 8} k="s" anchor="start" tone={step >= 2 ? "lit" : "mute"}>
        {narrow ? "merged" : "merged · newest first"}
      </Txt>
      <rect className={`ax-box${step >= 2 ? (hydrated ? " ok" : " lit") : ""}`} x={MG.x} y={MG.y} width={MG.w} height={MG.h} />
      {MERGED.map((id, i) => {
        const fromA = A_IDS.includes(id);
        const src = fromA ? LA : LB;
        const si = (fromA ? A_IDS : B_IDS).indexOf(id);
        const p = step < 2 ? 0 : step > 2 ? 1 : ease(seg(t, 0.1 + i * 0.13, 0.3 + i * 0.13));
        if (p <= 0) return null;
        const from: Pt = { x: src.x + 20, y: rowY(src, si) + 5 };
        const to: Pt = { x: MG.x + 20, y: mRowY(i) + 5 };
        const at = mv(from, to, p);
        const tone: Tone = hydrated ? "ok" : fromA ? "sky" : "warn";
        return (
          <g key={id}>
            <Txt x={at.x} y={at.y} anchor="start" tone={tone}>
              {`tweet_${id}`}
            </Txt>
            {p >= 1 && !narrow && (
              <Txt x={MG.x + MG.w - 12} y={mRowY(i) + 5} anchor="end" k="s" tone={hydrated ? "ok" : "mute"}>
                {hydrated ? "full" : fromA ? "push" : "pull"}
              </Txt>
            )}
          </g>
        );
      })}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "write" ? <WriteScene {...p} /> : <ReadScene {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "write",
      label: "Write path",
      steps: [
        { caption: "Every tweet is stored first. Then the fan-out service checks the author's follower count against 10,000.", tween: 1800 },
        { caption: "1,000 followers: push. One batch of 1,000 ids is queued; workers LPUSH it into each timeline, LTRIM to 800.", tween: 2600 },
        { caption: "100M followers: no fan-out. One ZADD to the author's celebrity_tweets set, keeping the last 100.", tween: 2200, ms: 3400 },
      ],
    },
    {
      id: "read",
      label: "Read path",
      steps: [
        { caption: "user123 opens the app. LRANGE timeline:user123 returns the ids pushed by regular accounts: 501, 499, 495…", tween: 1600 },
        { caption: "The graph lists 3 followed accounts above 10K followers; ZREVRANGE pulls each one's recent ids: 503, 500, 498…", tween: 2200 },
        { caption: "Merge both lists by time, newest first: 503, 501, 500, 499… and keep the top N.", tween: 2400 },
        { caption: "Hydrate in one batch: a single MGET fetches the full tweets, then the timeline is returned.", tween: 1600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
