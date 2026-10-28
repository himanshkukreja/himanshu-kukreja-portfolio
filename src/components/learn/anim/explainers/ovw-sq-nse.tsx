/**
 * The whole side quest, NSE's trading core: the scale (21.89B order messages and 201M trades on
 * 24 March 2026; ~5M messages/s of capacity; 36.99B equity derivative contracts in FY2026), the estimate
 * (~973,000 messages/s on average, ~109 per trade, ~4.3M/s in an assumed peak second; ~20 single-threaded
 * partitions), the architecture (a router, gateways and local checks; one sequencer per partition; a
 * deterministic matching thread; outputs that fan out from one sequence), the deep dives (time as a
 * sequenced event and the random pre-open close, output gating on a replicated journal, per-connection
 * throttles, multicast market data with two feeds, replay by sequence after a disconnect) and the day
 * (an expiry Tuesday, clearing and settlement, the February 2021 failure of the systems next door).
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
  brokers: { x: 16, y: 40, w: 88, h: 44, l: "Brokers", n: "Broker" },
  colo: { x: 16, y: 96, w: 88, h: 48, l: "Colo" },
  ops: { x: 16, y: 156, w: 88, h: 40, l: "Ops" },
  router: { x: 128, y: 40, w: 92, h: 44, l: "Router" },
  gw: { x: 128, y: 96, w: 92, h: 48, l: "Gateway", n: "Gate" },
  chk: { x: 128, y: 156, w: 92, h: 40, l: "Checks" },
  journal: { x: 248, y: 40, w: 120, h: 44, l: "Journal" },
  seq: { x: 248, y: 96, w: 120, h: 48, l: "Sequencer", n: "Seq" },
  clr: { x: 248, y: 156, w: 120, h: 40, l: "NSE Clearing", n: "Clearing" },
  near: { x: 400, y: 40, w: 184, h: 44, l: "Near site · DR", n: "Near · DR" },
  me: { x: 400, y: 96, w: 184, h: 48, l: "Matching engine", n: "Matching" },
  md: { x: 400, y: 156, w: 184, h: 40, l: "Market data" },
};
const E: [string, string][] = [
  ["brokers", "router"],
  ["colo", "router"],
  ["router", "gw"],
  ["gw", "chk"],
  ["chk", "seq"],
  ["seq", "journal"],
  ["journal", "near"],
  ["seq", "me"],
  ["me", "md"],
  ["me", "clr"],
  ["clr", "chk"],
  ["ops", "chk"],
];
const ALL = { brokers: 1, colo: 1, ops: 1, router: 1, gw: 1, chk: 1, journal: 1, seq: 1, clr: 1, near: 1, me: 1, md: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "NSE · the scale", on: { seq: 1, me: "lit", md: 1 }, figs: [["21.89B", ["order messages in a day", "messages, a day"], "lit"], ["201M", ["trades that day", "trades"]], ["~5M/s", ["messages, capacity", "capacity"]]], note: ["36.99B equity derivative contracts in FY2026, the most of any exchange", "36.99B contracts, FY26"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["orders from members' gateways", "order entry"], ["checks before the book", "checks"], ["price-time, deterministic", "price-time"], ["the same data to all at once", "fair market data"], ["every trade to clearing once", "clearing once"], ["recover fast, lose nothing", "fast recovery"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["~973,000 messages a second", "~1M a second"], on: { brokers: 1, colo: 1, router: 1, gw: "lit", chk: 1, seq: "lit", me: "lit" }, fl: [["brokers", "router"], ["router", "gw"], ["gw", "chk"], ["chk", "seq"], ["seq", "me"]], figs: [["~973K/s", ["average, record day", "average"]], ["~109", ["messages per trade", "per trade"]], ["~4.3M/s", ["peak second, assumed", "peak, assumed"], "warn"]], note: ["35% in the last 90 minutes and a 3× burst are assumptions", "shape assumed"] },
    { k: ["one queue per instrument", "per instrument"], on: { seq: "lit", me: "lit", journal: 1 }, fl: [["seq", "me"], ["seq", "journal"]], figs: [["~500K/s", ["per partition, assumed", "per partition"]], ["~20", ["partitions, half loaded", "partitions"], "lit"], ["~86K/s", ["hottest contract", "hottest"], "warn"]], note: ["one book can't be split: price-time needs one order of events", "a book can't be split"] },
  ],
  arch: [
    { k: ["1 · order entry", "1 · order entry"], on: { brokers: 1, colo: 1, router: "lit", gw: "lit", chk: "lit" }, sub: { gw: ["msg rate", "rate"] }, fl: [["brokers", "router"], ["colo", "router"], ["router", "gw"], ["gw", "chk"]], note: ["a router assigns a gateway; checks are local, no database calls", "local checks"] },
    { k: ["2 · one line decides first", "2 · the sequencer"], on: { chk: 1, seq: "lit", journal: "lit", me: 1 }, sub: { seq: ["next number", "numbers"] }, fl: [["chk", "seq"], ["seq", "journal"], ["seq", "me"]], note: ["the sequence number, not any clock, decides who was first", "the number decides"] },
    { k: ["3 · a deterministic core", "3 · matching"], on: { seq: 1, me: "lit", journal: 1 }, sub: { me: ["price, then time", "price-time"] }, fl: [["seq", "me"]], note: ["one thread, no clocks: the same log always gives the same trades", "same log, same trades"] },
    { k: ["4 · outputs fan out", "4 · outputs"], on: { me: "lit", md: "lit", clr: "lit", chk: 1 }, fl: [["me", "md"], ["me", "clr"], ["clr", "chk"]], note: ["confirmations, a multicast tick, a clearing record: one sequence", "one sequence, all agree"] },
  ],
  deep: [
    { k: ["1 · time is an event", "1 · determinism"], on: { seq: "lit", me: "lit", journal: 1 }, fl: [["seq", "me"], ["seq", "journal"]], chips: [["one thread per book, no locks", "one thread"], ["the number is the clock", "number = clock"], ["the 3:30 close is sequenced", "close is an event"], ["pre-open closes at random", "random close"]], ctn: ["lit", "ok", "sky", "warn"] },
    { k: ["2 · release only what's durable", "2 · output gating"], on: { seq: 1, journal: "lit", near: "lit", me: 1 }, fl: [["seq", "journal"], ["journal", "near"], ["seq", "me"]], chips: [["a hot standby applies the log", "hot standby"], ["near site: a synchronous copy", "sync near site"], ["outputs wait for both", "gated outputs"], ["book hashes compared", "hash compare"]], ctn: ["sky", "lit", "ok", "warn"] },
    { k: ["3 · push back at the member's door", "3 · throttles"], kt: "warn", on: { colo: "warn", router: 1, gw: "lit", chk: "lit", clr: 1, ops: 1 }, fl: [["colo", "router", "warn"], ["router", "gw"], ["gw", "chk"], ["clr", "chk"], ["ops", "chk"]], figs: [["2,000/s", ["subscribed rate", "subscribed"]], ["200K/s", ["a runaway loop", "runaway"], "bad"], ["2×", ["over it: disconnect", "disconnect"], "warn"]], note: ["illustrative; the runaway loses its own throughput, not the market's", "its own throughput only"] },
    { k: ["4 · one packet for everyone", "4 · market data"], on: { me: 1, md: "lit", colo: 1, brokers: 1 }, sub: { md: ["multicast", "multicast"] }, fl: [["me", "md"]], figs: [["1", ["packet, every subscriber", "one packet"], "lit"], ["A + B", ["two feeds per stream", "two feeds"]], ["TCP", ["recovery for gaps", "recovery"]]], note: ["a loop over TCP connections puts the first one first, every tick", "multicast, not a loop"] },
    { k: ["5 · exactly once across a disconnect", "5 · reconnects"], on: { brokers: "lit", router: 1, gw: "lit", chk: 1, seq: 1 }, fl: [["brokers", "router"], ["router", "gw"]], chips: [["ask, don't resend", "ask, don't resend"], ["replay from the last sequence", "replay by sequence"], ["a modify names its version", "versioned modify"], ["clearing: a high-water mark", "high-water mark"]], ctn: ["lit", "sky", "ok", "warn"] },
  ],
  scale: [
    { k: ["an expiry Tuesday", "expiry Tuesday"], on: { brokers: 1, colo: "lit", router: 1, gw: 1, chk: 1, seq: "lit", me: "lit", md: "lit" }, fl: [["brokers", "router"], ["colo", "router"], ["router", "gw"], ["gw", "chk"], ["chk", "seq"], ["seq", "me"], ["me", "md"]], figs: [["9:00", ["pre-open call auction", "pre-open"]], ["2:00", ["the expiry afternoon", "expiry hours"], "warn"], ["3:30", ["weekly options expire", "close"], "lit"]], note: ["session times are NSE's; the shape of the day is illustrative", "times are NSE's"] },
    { k: ["after the match: clearing", "clearing"], on: { me: 1, clr: "lit", chk: 1 }, fl: [["me", "clr"], ["clr", "chk"]], figs: [["T+1", ["equities settle", "settlement"], "lit"], ["T+0", ["optional, top 500", "optional"]], ["201M", ["trades, netted", "netted"]]], note: ["the counterparty to both sides, margining members in real time", "the counterparty"] },
    { k: ["February 2021 · the systems next door", "next door failed"], kt: "bad", on: { ...ALL, clr: "bad", near: "warn", seq: "ok", me: "ok", ops: "lit", chk: "bad" }, fl: [["ops", "chk", "bad"], ["journal", "near", "warn"]], figs: [["11:40", ["all segments halted", "halted"], "bad"], ["30 min", ["to declare a disaster", "to declare"], "warn"], ["45 min", ["to restore, incl. DR", "to restore"], "lit"]], note: ["the trading system was healthy; risk, clearing and index were not", "trading was healthy"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, seq: "ok", md: "ok", journal: "ok" }, fl: [["chk", "seq", "ok"], ["seq", "journal", "ok"], ["me", "md", "ok"]], cols: 3, chips: [["one sequence a book", "one sequence"], ["one packet for all", "one packet"], ["ack only the durable", "only the durable"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "On 24 March 2026, an expiry day, NSE processed 21.89 billion order messages and 201 million trades; its platform handles about 5 million messages a second with microsecond response times, and FY2026 saw 36.99 billion equity derivative contracts.", tween: 1400 },
      { caption: "Take orders from members' gateways, check each before the book, match by price then time so the same inputs always give the same trades, publish every change to everyone at once, clear every trade exactly once, and recover a site in minutes.", tween: 1400 },
      { caption: "21.89 billion messages over the 22,500-second session is ~973,000 a second, ~109 per trade; assuming 35% of them in the last 90 minutes and a 3× burst, the busiest seconds reach ~4.3 million, close to the ~5 million capacity.", tween: 1400, loop: true },
      { caption: "Assuming one single-threaded partition sustains ~500,000 messages a second, the peak needs at least 9; design for ~20 at half load. The hottest weekly option, at an assumed 2%, is ~86,000 a second, inside one thread, and no book is ever split.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Members connect from brokers' offices and co-location racks; a router assigns each session a gateway, which enforces the member's subscribed message rate, and price bands, quantity and value limits are checked locally before the book.", tween: 1200, loop: true },
      { caption: "Each instrument belongs to one partition, whose sequencer stamps every message with the next number and journals it; that number, not any clock, is an order's place in line.", tween: 1200, loop: true },
      { caption: "One thread per partition applies the sequenced messages to in-memory books by price, then time; with no clocks and no randomness it is a pure function of its log, so replaying the log rebuilds the book exactly.", tween: 1200, loop: true },
      { caption: "One trade becomes confirmations to both members, a tick on the multicast feed and a record for NSE Clearing, which margins members in real time and disables one that breaches at the checks; all come from one sequence, so they agree.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Locks and gateway timestamps can't be replayed, so each book has one thread and the sequence number is its clock; the 3:30 pm close enters as a sequenced event, and NSE's pre-open call auction closes order entry at a random moment in the eighth minute.", tween: 1400, loop: true },
      { caption: "The book lives in memory, so the journal is the only durable thing: a hot standby applies it, a near site keeps a synchronous copy, and acks, trades and ticks leave only once their input is on both. NSE's near site replicates in real time; its DR site is in Chennai.", tween: 1400, loop: true },
      { caption: "A runaway algorithm sending 200,000 modifications a second against a 2,000 subscribed rate (illustrative) is rejected at its own connection and, in our design, disconnected above 2×, so other orders for the same contract are sequenced as usual.", tween: 1400, loop: true },
      { caption: "A sender that writes each tick to connection 1, then 2, then 3 gives the first a head start on every tick; multicast sends one packet and lets the network copy it. NSE's tick-by-tick feed goes out in streams, each on two multicast channels, with recovery over TCP.", tween: 1400, loop: true },
      { caption: "When a session drops mid-burst the member shouldn't resend: in our design it replays its own messages from the last sequence it saw, a modification names the order version it was based on, and clearing ignores any trade at or below its high-water mark.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "An expiry Tuesday: the pre-open auction from 9:00 sets opening prices by 9:12, continuous trading starts at 9:15 with every member held to its rate, message rates climb toward the peak from 2:00, and at 3:30 the weekly options expire.", tween: 1400, loop: true },
      { caption: "NSE Clearing becomes buyer to every seller and seller to every buyer, margins members in real time and nets the day's trades into one amount of money and one quantity per security per member; equities settle on T+1, or T+0 where opted.", tween: 1400, loop: true },
      { caption: "In February 2021 the trading system was healthy, but telecom link issues made the primary storage inaccessible, taking down risk, clearing, index and surveillance; trading halted from 11:40 am, so everything the market can't run without fails over together, on SEBI's 30- and 45-minute clock.", tween: 1400, loop: true },
      { caption: "The lesson: one sequence per book, one packet for everyone, and nothing acknowledged that a surviving copy can't replay; the throttles, the multicast feed and the DR site all exist to protect that one line.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
