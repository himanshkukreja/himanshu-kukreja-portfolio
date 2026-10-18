/**
 * Feed fan-out (week 4, day 4 · 2.1 / 3.1–3.3): fan-out on write pushes A's post into B, C, D and
 * E's feed caches so B's read is one cache read; a celebrity with 300 million followers would need
 * 300 million writes (50 minutes at 100K/s); the hybrid pushes for accounts under 10,000 followers
 * and pulls celebrity posts at read time (490 pushed accounts + 10 celebrities, merged).
 */
import { Box, clamp, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;
const LEFT = { x: 24, y: 118, w: 156, h: 64 };
const MID = { x: 214, y: 118, w: 140, h: 64 };
const RX = 436;
const RW = 140;
const FEEDS = ["B", "C", "D", "E"].map((n, i) => ({ n, y: 22 + i * 60, h: 46 }));
const TALL = { x: RX, y: 22, w: RW, h: 226 };
const FC = { x: RX, y: 34, w: RW, h: 64 }; // hybrid: pre-computed feed cache
const CP = { x: RX, y: 190, w: RW, h: 64 }; // hybrid: celebrity posts, stored once

type Pt = { x: number; y: number };
const MR: Pt = { x: MID.x + MID.w, y: MID.y + MID.h / 2 };
const ML: Pt = { x: MID.x, y: MID.y + MID.h / 2 };
const LR: Pt = { x: LEFT.x + LEFT.w, y: LEFT.y + LEFT.h / 2 };
const mv = (a: Pt, b: Pt, p: number): Pt => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

function Scene({ variant, step, t, clock, narrow, reduced }: SceneProps) {
  const toks: (Pt & { tone: Tone })[] = [];
  const e = ease(t);
  let left = { label: "User A", sub: "posts" };
  let mid = { label: narrow ? "Posts" : "Post service", sub: narrow ? "fan out" : "save + fan out" };
  let kicker = "cache writes";
  let count = "0";
  let countTone: Tone = undefined;
  if (variant === "push") {
    const filled = step === 0 ? 0 : step === 1 ? FEEDS.filter((_, i) => t >= 0.35 + i * 0.12).length : 4;
    if (step === 0) {
      mid.sub = t > 0.5 ? (narrow ? "B, C, D, E" : "followers B, C, D, E") : "save post";
      if (t < 0.5) toks.push({ ...mv(LR, ML, ease(seg(t, 0, 0.5))), tone: "lit" });
    }
    if (step === 1)
      FEEDS.forEach((f, i) => {
        const p = ease(seg(t, 0.05 + i * 0.12, 0.35 + i * 0.12));
        if (p > 0 && p < 1) toks.push({ ...mv(MR, { x: RX, y: f.y + f.h / 2 }, p), tone: "lit" });
      });
    if (step === 2) {
      left = { label: narrow ? "B opens" : "B opens app", sub: "reads feed" };
      mid = { label: narrow ? "Feed" : "Feed service", sub: "1 cache read" };
      const p = ease(seg(t, 0.1, 0.9));
      if (p > 0 && p < 1) toks.push({ ...(p < 0.5 ? mv({ x: RX, y: FEEDS[0].y + FEEDS[0].h / 2 }, MR, p * 2) : mv(ML, LR, (p - 0.5) * 2)), tone: "ok" });
      kicker = "to read B's feed";
      count = "1 read";
      countTone = "ok";
    } else {
      count = String(filled);
    }
    return (
      <g>
        {FEEDS.map((f) => (
          <Wire key={f.n} d={`M${MR.x} ${MR.y}L${RX} ${f.y + f.h / 2}`} tone={step === 2 && f.n === "B" ? "lit" : undefined} opacity={step === 2 && f.n !== "B" ? 0.35 : 1} />
        ))}
        <Wire d={`M${LR.x} ${LR.y}H${ML.x}`} arrow />
        <Box x={LEFT.x} y={LEFT.y} w={LEFT.w} h={LEFT.h} label={left.label} sub={left.sub} tone={step === 2 ? "ok" : "lit"} />
        <Box x={MID.x} y={MID.y} w={MID.w} h={MID.h} label={mid.label} sub={mid.sub} />
        {FEEDS.map((f, i) => {
          const has = step === 2 || (step === 1 && t >= 0.35 + i * 0.12);
          return <Box key={f.n} x={RX} y={f.y} w={RW} h={f.h} label={`${f.n}'s feed`} sub={has ? "A: Hello" : "—"} tone={has ? (step === 2 && f.n === "B" ? "ok" : "sky") : undefined} dim={step === 2 && f.n !== "B"} />;
        })}
        {toks.map((k, i) => (
          <Token key={i} x={k.x} y={k.y} s={11} tone={k.tone} />
        ))}
        <Txt x={24} y={226} k="k" anchor="start" tone="mute">
          {kicker}
        </Txt>
        <Txt x={24} y={264} k="d" anchor="start" tone={countTone}>
          {count}
        </Txt>
      </g>
    );
  }
  if (variant === "celeb") {
    const done = step === 0 ? 0 : step === 1 ? e : 1;
    const backlog = step === 2 ? clamp(e) : 0;
    left = { label: "Celebrity", sub: step === 2 ? "posts again" : "300M followers" };
    mid = { label: "Fan-out", sub: narrow ? "100K/s" : "100K writes/s" };
    const stream = step === 1 || step === 2;
    if (stream && !reduced)
      for (let k = 0; k < 4; k++) {
        const p = (clock * 0.9 + k / 4) % 1;
        toks.push({ ...mv(MR, { x: RX, y: TALL.y + 30 + ((k * 53) % 180) }, p), tone: "lit" });
      }
    if (step === 0 && t < 0.5) toks.push({ ...mv(LR, ML, ease(seg(t, 0, 0.5))), tone: "lit" });
    if (step === 2 && t < 0.5) toks.push({ ...mv(LR, ML, ease(seg(t, 0, 0.5))), tone: "warn" });
    const mins = Math.round(50 * done);
    const meterH = TALL.h - 70;
    return (
      <g>
        <Wire d={`M${LR.x} ${LR.y}H${ML.x}`} arrow />
        <Wire d={`M${MR.x} ${MR.y}H${RX}`} arrow tone={stream ? "lit" : undefined} />
        <Box x={LEFT.x} y={LEFT.y} w={LEFT.w} h={LEFT.h} label={left.label} sub={left.sub} tone={step === 2 ? "warn" : "lit"} />
        <Box x={MID.x} y={MID.y} w={MID.w} h={MID.h} label={mid.label} sub={mid.sub} tone={stream ? "warn" : undefined} />
        <rect className={`ax-box${step === 2 ? " bad" : ""}`} x={TALL.x} y={TALL.y} width={TALL.w} height={TALL.h} />
        <Txt x={TALL.x + TALL.w / 2} y={TALL.y + 24}>
          300M feeds
        </Txt>
        {/* progress through 300 million writes, then post 2's backlog */}
        <rect className="ax-meter" x={TALL.x + 24} y={TALL.y + 44} width={36} height={meterH} />
        <rect className="ax-fill" x={TALL.x + 24} y={TALL.y + 44 + meterH * (1 - done)} width={36} height={meterH * done} />
        <rect className="ax-meter" x={TALL.x + 80} y={TALL.y + 44} width={36} height={meterH} opacity={step === 2 ? 1 : 0.35} />
        <rect className="ax-fill bad" x={TALL.x + 80} y={TALL.y + 44} width={36} height={meterH * backlog} />
        <Txt x={TALL.x + 42} y={TALL.y + TALL.h - 10} k="s">
          {narrow ? "#1" : "post 1"}
        </Txt>
        <Txt x={TALL.x + 98} y={TALL.y + TALL.h - 10} k="s" tone={step === 2 ? "bad" : "mute"}>
          {narrow ? "#2" : "post 2"}
        </Txt>
        {toks.map((k, i) => (
          <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
        ))}
        <Txt x={24} y={226} k="k" anchor="start" tone={step === 2 ? "bad" : "mute"}>
          {step === 2 ? "backlog" : "until all see it"}
        </Txt>
        <Txt x={24} y={264} k="d" anchor="start" tone={step === 2 ? "bad" : done >= 1 ? "warn" : undefined}>
          {step === 2 ? "grows" : `${mins} min`}
        </Txt>
        <Txt x={24} y={56} k="k" anchor="start" tone="mute">
          cache writes
        </Txt>
        <Txt x={24} y={88} anchor="start" tone={step === 0 ? "lit" : undefined}>
          {step === 0 ? "300,000,000" : `${Math.round(300 * done)}M of 300M`}
        </Txt>
      </g>
    );
  }
  // hybrid
  let fcTone: Tone = undefined;
  let cpTone: Tone = undefined;
  if (step === 0) {
    left = { label: narrow ? "Regular" : "Regular user", sub: "200 followers" };
    mid = { label: narrow ? "Posts" : "Post service", sub: narrow ? "<10K: push" : "< 10,000 → push" };
    if (t < 0.4) toks.push({ ...mv(LR, ML, ease(seg(t, 0, 0.4))), tone: "lit" });
    const p = ease(seg(t, 0.45, 0.9));
    if (p > 0 && p < 1) toks.push({ ...mv(MR, { x: RX, y: FC.y + FC.h / 2 }, p), tone: "lit" });
    fcTone = t >= 0.9 ? "sky" : undefined;
    count = t >= 0.9 ? "200" : "0";
  } else if (step === 1) {
    left = { label: "Celebrity", sub: "10M followers" };
    mid = { label: narrow ? "Posts" : "Post service", sub: narrow ? "≥10K: store" : "≥ 10,000 → store" };
    if (t < 0.4) toks.push({ ...mv(LR, ML, ease(seg(t, 0, 0.4))), tone: "warn" });
    const p = ease(seg(t, 0.45, 0.9));
    if (p > 0 && p < 1) toks.push({ ...mv(MR, { x: RX, y: CP.y + CP.h / 2 }, p), tone: "warn" });
    fcTone = "sky";
    cpTone = t >= 0.9 ? "warn" : undefined;
    count = "0";
    countTone = "ok";
  } else {
    left = { label: "Reader", sub: "follows 500" };
    mid = { label: narrow ? "Feed" : "Feed service", sub: "merge + sort" };
    const p = ease(seg(t, 0.05, 0.5));
    const q = ease(seg(t, 0.55, 0.9));
    if (p > 0 && p < 1) {
      toks.push({ ...mv({ x: RX, y: FC.y + FC.h / 2 }, MR, p), tone: "sky" });
      toks.push({ ...mv({ x: RX, y: CP.y + CP.h / 2 }, MR, p), tone: "warn" });
    }
    if (q > 0 && q < 1) toks.push({ ...mv(ML, LR, q), tone: "ok" });
    fcTone = "sky";
    cpTone = "warn";
    kicker = "one feed read";
    count = narrow ? "1 + 10" : "1 + 10 pulls";
    countTone = "ok";
  }
  const read = step === 2;
  return (
    <g>
      <Wire d={`M${LR.x} ${LR.y}H${ML.x}`} arrow tone={read && t >= 0.55 ? "ok" : undefined} />
      <Wire d={`M${MR.x} ${MR.y}L${RX} ${FC.y + FC.h / 2}`} tone={step === 0 || read ? "lit" : undefined} opacity={step === 1 ? 0.35 : 1} />
      <Wire d={`M${MR.x} ${MR.y}L${RX} ${CP.y + CP.h / 2}`} tone={step === 1 || read ? "lit" : undefined} opacity={step === 0 ? 0.35 : 1} />
      <Box x={LEFT.x} y={LEFT.y} w={LEFT.w} h={LEFT.h} label={left.label} sub={left.sub} tone={read ? "ok" : step === 1 ? "warn" : "lit"} />
      <Box x={MID.x} y={MID.y} w={MID.w} h={MID.h} label={mid.label} sub={mid.sub} />
      <Box x={FC.x} y={FC.y} w={FC.w} h={FC.h} label={narrow ? "feed cache" : "feed:{user}"} sub={read ? "490 accounts" : "pushed posts"} tone={fcTone} />
      <Box x={CP.x} y={CP.y} w={CP.w} h={CP.h} label={narrow ? "celebs" : "celeb posts"} sub={read ? "10 pulled" : "stored once"} tone={cpTone} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={11} tone={k.tone} />
      ))}
      <Txt x={24} y={226} k="k" anchor="start" tone="mute">
        {kicker}
      </Txt>
      <Txt x={24} y={264} k="d" anchor="start" tone={countTone}>
        {count}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "push",
      label: "Fan-out on write",
      steps: [
        { caption: "User A posts “Hello World”. The post service saves it and looks up A's followers: B, C, D, E.", tween: 1800 },
        { caption: "It pushes the post into every follower's feed cache: one cache write per follower.", tween: 2200 },
        { caption: "When B opens the app, B's feed is a single cache read. No computation needed.", tween: 1800, ms: 3200 },
      ],
    },
    {
      id: "celeb",
      label: "Celebrity",
      steps: [
        { caption: "A celebrity with 300 million followers posts. Fan-out on write means 300 million cache writes.", tween: 1600 },
        { caption: "At 100K writes per second that takes 50 minutes: followers don't see the post for almost an hour.", tween: 3600, loop: true, ms: 2400 },
        { caption: "Meanwhile she posts again, and the backlog grows. Pure fan-out on write doesn't scale.", tween: 2400, loop: true, ms: 3000 },
      ],
    },
    {
      id: "hybrid",
      label: "Hybrid",
      steps: [
        { caption: "A regular user (under 10,000 followers) still pushes: 200 followers means 200 cache writes, instantly.", tween: 2000 },
        { caption: "A celebrity (10,000 or more) only stores the post: 0 cache writes, indexed for pull.", tween: 2000 },
        { caption: "Reading: the pre-computed feed (490 regular accounts) plus pulls from 10 celebrities, merged and sorted.", tween: 2400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
