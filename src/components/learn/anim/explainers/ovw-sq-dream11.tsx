/**
 * The whole side quest, Dream11 fantasy sports: the scale (15.01M concurrent users on the IPL 2024
 * opener; 308M requests a minute in IPL 2023; 8,000+ joins/s, 18M+ contestants in a match and 7.9M+
 * entries in one contest in IPL 2020), the estimate (~22,000 joins/s between toss and deadline, ~50M
 * teams and ~100M entries in a big match, a ball every ~45 s), the architecture (forecast-driven
 * pre-scaling and tiered shedding at the gateway; team and contest services gated by one match lock;
 * a points engine and rank engine after the lock; a keyed wallet ledger), the deep dives (the
 * toss-to-deadline spike, sharded spot counters and contest templates, lock-time consistency, live
 * points from versioned ball records, histogram ranks with ties, TDS on net winnings) and edge cases
 * (a wrong forecast, a feed correction, a rain-delayed final).
 */
import { at, Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd): P[] {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: ay };
    const p3 = { x: r ? b.x : b.x + b.w, y: by };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = at(step, F[variant] || F[Object.keys(F)[0]]);
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map(([a, b]) => {
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(geo(N[a], N[b]))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr && n.h < 40 ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const fwd = E.some((e) => e[0] === a && e[1] === b);
        const p = fwd ? bz(geo(N[a], N[b]), u) : bz(geo(N[b], N[a]), 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}


const N: Record<string, Nd> = {
  app: { x: 16, y: 40, w: 88, h: 44, l: "Karthik", n: "Fan" },
  scaler: { x: 16, y: 96, w: 88, h: 52, l: "Scaler" },
  feed: { x: 16, y: 152, w: 88, h: 44, l: "Feed" },
  gw: { x: 128, y: 40, w: 92, h: 44, l: "Gateway" },
  team: { x: 128, y: 96, w: 92, h: 52, l: "Teams" },
  pts: { x: 128, y: 152, w: 92, h: 44, l: "Points" },
  con: { x: 248, y: 40, w: 120, h: 44, l: "Contests", n: "Contest" },
  lock: { x: 248, y: 96, w: 120, h: 52, l: "Match lock", n: "Lock" },
  rank: { x: 248, y: 152, w: 120, h: 44, l: "Ranks" },
  wallet: { x: 400, y: 40, w: 184, h: 44, l: "Wallet · ledger", n: "Wallet" },
  store: { x: 400, y: 96, w: 184, h: 52, l: "Team store", n: "Store" },
  cache: { x: 400, y: 152, w: 184, h: 44, l: "Rank cache", n: "Cache" },
};
const E: [string, string][] = [
  ["app", "gw"],
  ["scaler", "gw"],
  ["gw", "team"],
  ["gw", "con"],
  ["con", "wallet"],
  ["team", "lock"],
  ["con", "lock"],
  ["lock", "store"],
  ["lock", "pts"],
  ["feed", "pts"],
  ["pts", "rank"],
  ["rank", "cache"],
  ["rank", "wallet"],
];
const ALL = { app: 1, scaler: 1, feed: 1, gw: 1, team: 1, pts: 1, con: 1, lock: 1, rank: 1, wallet: 1, store: 1, cache: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Dream11 · the scale", on: { app: "lit", gw: 1, con: 1 }, figs: [["15M", ["concurrent users", "concurrent"], "lit"], ["308M", ["requests a minute", "req/min"]], ["7.9M+", ["entries, one contest", "one contest"]]], note: ["IPL 2024 opener; ~5 million requests a second in IPL 2023", "IPL 2024; ~5M req/s"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["edit teams until the deadline", "edit to deadline"], ["contests of 2 to 10M spots", "2 to 10M spots"], ["never oversell a contest", "never oversell"], ["freeze every team at the lock", "freeze at lock"], ["re-rank 100M entries a ball", "rank every ball"], ["credit each prize once", "pay once"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["30 minutes from toss to deadline", "toss to deadline"], kt: "warn", on: { app: "lit", gw: "lit", team: "lit", con: "lit" }, fl: [["app", "gw"], ["gw", "team"], ["gw", "con"]], figs: [["~22K/s", ["joins after the toss", "joins/s"], "warn"], ["30 min", ["the window", "window"]], ["~0.5%", ["of requests are joins", "are joins"]]], note: ["8,000 joins/s at 5.3M concurrent in 2020, scaled to 15M (est.)", "8K/s in 2020, scaled"] },
    { k: ["then everyone reads", "then reads"], on: { feed: "lit", pts: "lit", rank: "lit", cache: 1 }, fl: [["feed", "pts"], ["pts", "rank"], ["rank", "cache"]], figs: [["~45 s", ["between balls", "per ball"]], ["~50M", ["teams (assumed)", "teams"], "lit"], ["60 s", ["to a new rank", "to rank"]]], note: ["one ball moves 2 or 3 players, and most of the match's teams", "one ball, most teams"] },
  ],
  arch: [
    { k: ["1 · forecast, then pre-scale", "1 · pre-scale"], on: { scaler: "lit", gw: "lit", app: 1 }, sub: { scaler: ["5 days out", "5 days"] }, fl: [["scaler", "gw"]], note: ["forecast 5 days out, again 2 h before; scale from 1 h before", "scale from 1 h before"] },
    { k: ["2 · team saves and joins", "2 · saves, joins"], on: { app: 1, gw: "lit", team: "lit", con: "lit", wallet: 1 }, fl: [["app", "gw"], ["gw", "team"], ["gw", "con"], ["con", "wallet"]], note: ["saves and joins are tier 1; lower tiers are shed first", "tier 1: saves, joins"] },
    { k: ["3 · one lock for every write", "3 · one lock"], kt: "warn", on: { team: 1, con: 1, lock: "warn", store: "lit" }, sub: { lock: ["OPEN → LOCKED", "LOCKED"] }, fl: [["team", "lock"], ["con", "lock"], ["lock", "store"]], note: ["each write checks the match state atomically; no clock decides", "state, not clocks"] },
    { k: ["4 · points, ranks, settlement", "4 · after the lock"], on: { feed: 1, lock: 1, pts: "lit", rank: "lit", cache: 1, wallet: 1 }, fl: [["feed", "pts"], ["lock", "pts"], ["pts", "rank"], ["rank", "cache"], ["rank", "wallet"]], note: ["frozen lineups → points per ball → histograms → settlement", "ball → points → ranks"] },
  ],
  deep: [
    { k: ["1 · the toss-to-deadline spike", "1 · the spike"], kt: "warn", on: { app: 1, scaler: 1, gw: "warn", team: 1, con: 1 }, fl: [["app", "gw"], ["gw", "team"], ["gw", "con"]], bars: [[["tier 1 · saves, joins", "tier 1"], 100, 100, "ok"], [["tier 2 · served stale", "tier 2"], 60, 100, "sky"], [["tier 3 · shed first", "tier 3"], 15, 100, "warn"]], note: ["lineups go to the CDN before the push; misses are coalesced", "CDN first, then push"] },
    { k: ["2 · spots from sharded counters", "2 · spot shards"], on: { gw: 1, con: "lit", wallet: 1 }, fl: [["gw", "con"], ["con", "wallet"]], chips: [["10M spots in 100 shards", "100 shards"], ["take one only if above 0", "only if > 0"], ["templates keep a copy open", "open copy"], ["one join id end to end", "one join id"]], ctn: ["lit", "ok", "sky", "lit"] },
    { k: ["3 · lock-time consistency", "3 · the lock"], kt: "warn", on: { team: 1, con: 1, lock: "warn", store: "lit" }, fl: [["team", "lock"], ["con", "lock"], ["lock", "store"]], chips: [["OPEN → LOCKED, flipped once", "one flip"], ["a conditional write, not a clock", "not a clock"], ["rain moves it later, never back", "later only"], ["teams freeze into lineups", "freeze lineups"]], ctn: ["warn", "ok", "sky", "lit"] },
    { k: ["4 · live points, ball by ball", "4 · live points"], on: { feed: "lit", lock: 1, pts: "lit", rank: 1 }, fl: [["feed", "pts"], ["lock", "pts"], ["pts", "rank"]], figs: [["~250", ["balls a match", "balls"]], ["~20M", ["distinct lineups", "lineups"], "lit"], ["2×, 1.5×", ["captain, vice", "C, VC"]]], note: ["recompute from versioned ball records; rescore touched lineups", "rescore touched only"] },
    { k: ["5 · ranks and money", "5 · ranks, money"], on: { rank: "lit", cache: "lit", wallet: "lit" }, fl: [["rank", "cache"], ["rank", "wallet"]], chips: [["histogram: rank in one lookup", "rank: 1 lookup"], ["ties share a rank and split", "ties split"], ["prizes keyed, credited once", "keyed prizes"], ["30% TDS on net winnings", "30% TDS"]], ctn: ["lit", "sky", "ok", "warn"] },
  ],
  scale: [
    { k: ["the forecast is wrong", "wrong forecast"], kt: "bad", on: { scaler: "bad", gw: "warn", team: 1, con: 1 }, fl: [["scaler", "gw", "bad"]], figs: [["~2×", ["the forecast", "forecast"], "bad"], ["2 h", ["re-forecast", "re-forecast"]], ["tier 3", ["shed first", "shed"], "warn"]], note: ["one re-forecast nearly doubled, to ~10 million users", "forecast nearly doubled"] },
    { k: ["a feed correction", "a correction"], kt: "warn", on: { feed: "warn", pts: "lit", rank: 1 }, fl: [["feed", "pts", "warn"], ["pts", "rank"]], chips: [["ball 14.3: four → leg-bye", "4 → leg-bye"], ["a new version of the record", "new version"], ["recompute, don't subtract", "recompute"], ["settle from the verified card", "verified card"]], ctn: ["warn", "lit", "ok", "sky"] },
    { k: ["the final, with rain", "rain at the final"], kt: "warn", on: { ...ALL, lock: "warn", scaler: "warn" }, fl: [["app", "gw"], ["gw", "team"], ["team", "lock", "warn"]], figs: [["8:45", ["new deadline", "deadline"], "warn"], ["2", ["peaks to hold", "peaks"]], ["~190", ["balls in 15 overs", "balls"]]], note: ["an open deadline moves later; a locked match never reopens", "never reopen a lock"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, lock: "ok", rank: "ok", wallet: "ok" }, fl: [["team", "lock", "ok"], ["pts", "rank"], ["rank", "wallet", "ok"]], cols: 3, chips: [["one lock", "one lock"], ["score once", "score once"], ["rank by counting", "count"]], ctn: ["sky", "lit", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Dream11 reported 15.01 million concurrent users on the first day of IPL 2024 and 308 million requests a minute in IPL 2023; one IPL 2020 contest took 7.9 million entries.", tween: 1400 },
      { caption: "Let millions edit teams until the deadline, fill contests of up to millions of spots without overselling, freeze every team at the lock, re-rank every contest after every ball and credit each prize once.", tween: 1400 },
      { caption: "Between the toss and the deadline, about 30 minutes, joins reach ~22,000 a second on stated assumptions, yet they are only ~0.5% of all requests.", tween: 1400, loop: true },
      { caption: "After the lock nobody writes: a ball every ~45 seconds changes two or three players and the scores of most of ~50 million teams, with a new rank due within 60 seconds.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Capacity is forecast 5 days ahead, re-forecast 2 hours before the match and added from 1 hour before, because a surge that arrives in a minute can't wait for autoscaling.", tween: 1200, loop: true },
      { caption: "Team saves and contest joins are tier-1 routes at the gateway; a join takes a spot and debits the wallet under one join id.", tween: 1200, loop: true },
      { caption: "Every team write and entry write checks the match state in the same atomic operation; at the scheduled start one flip makes it LOCKED and later writes fail.", tween: 1200, loop: true },
      { caption: "After the lock, frozen lineups and the ball feed drive the points engine, the rank engine fills the rank cache, and settlement credits prizes to the wallet.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "The spike: lineups are pushed to the CDN before the notification, and under pressure the gateway sheds tier-3 routes and serves tier 2 stale so saves and joins keep their capacity.", tween: 1400, loop: true },
      { caption: "A 10-million-spot contest is split into 100 shards that only decrement while positive, so it can't be oversold; small contests are templates that always keep an open copy.", tween: 1400, loop: true },
      { caption: "The deadline is a state, not a clock: one flip from OPEN to LOCKED, checked by conditional writes; rain can move an open deadline later but never reopen a locked match.", tween: 1400, loop: true },
      { caption: "Each ball updates player points from versioned records, and only lineups holding those players are rescored, with the captain at 2× and the vice-captain at 1.5×.", tween: 1400, loop: true },
      { caption: "Scores come in half-points, so a contest histogram gives any rank in one lookup and ties share a rank; prizes are keyed postings, and withdrawals deduct 30% TDS on net winnings.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "A forecast can be badly wrong (Dream11 once saw one almost double, to about 10 million users): re-forecast 2 hours out, scale the stateful tiers and shed tier 3 early.", tween: 1400, loop: true },
      { caption: "The feed corrects ball 14.3 from a four to a leg-bye: store it as a new version, recompute the player's points instead of subtracting, and settle only from the verified scorecard.", tween: 1400, loop: true },
      { caption: "Rain at the final moves the deadline from 7:30 to 8:45 while the match is still open, so plan for two peaks; a 15-over game is about 190 balls.", tween: 1400, loop: true },
      { caption: "The lesson: decide the deadline in one place, score each distinct thing once, and rank by counting.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
