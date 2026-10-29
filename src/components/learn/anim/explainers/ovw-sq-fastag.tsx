/**
 * The whole side quest, FASTag and NETC: the scale (~120 lakh crossings and ~₹184 crore a day on NH plazas,
 * 11.73 crore tags, 40 issuers, 12 acquirers), the estimate (~139 debits a second on average, ~420 in an
 * assumed busiest hour, ~₹153 a crossing; dozens of reads per crossing), the architecture (a lane that decides
 * alone; crossings flowing in through the acquirer, the NETC Switch and the issuer; exception lists flowing
 * out; NRCS netting three times a day), the deep dives (signed tags, one passage per crossing, the four-party
 * failure rules, the race between lists, offline plazas and settlement, one tag per vehicle) and the edges
 * (Rajesh's night, the Annual Pass, barrier-free Multi-Lane Free Flow).
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
  tag: { x: 16, y: 40, w: 88, h: 44, l: "FASTag", n: "Tag" },
  lane: { x: 16, y: 96, w: 88, h: 48, l: "Lane" },
  outbox: { x: 16, y: 156, w: 88, h: 40, l: "Outbox" },
  list: { x: 128, y: 40, w: 92, h: 44, l: "Lists" },
  plaza: { x: 128, y: 96, w: 92, h: 48, l: "Plaza" },
  op: { x: 128, y: 156, w: 92, h: 40, l: "Operator", n: "Toll op" },
  mapper: { x: 248, y: 40, w: 120, h: 44, l: "NETC Mapper", n: "Mapper" },
  acq: { x: 248, y: 96, w: 120, h: 48, l: "Acquirer" },
  nrcs: { x: 248, y: 156, w: 120, h: 40, l: "NRCS" },
  issuer: { x: 400, y: 40, w: 184, h: 44, l: "Issuer bank", n: "Issuer" },
  sw: { x: 400, y: 96, w: 184, h: 48, l: "NETC Switch", n: "Switch" },
  rtgs: { x: 400, y: 156, w: 184, h: 40, l: "RTGS · banks", n: "RTGS" },
};
const E: [string, string][] = [
  ["tag", "lane"],
  ["list", "lane"],
  ["lane", "outbox"],
  ["lane", "plaza"],
  ["plaza", "list"],
  ["plaza", "acq"],
  ["acq", "mapper"],
  ["acq", "sw"],
  ["sw", "issuer"],
  ["issuer", "mapper"],
  ["sw", "nrcs"],
  ["nrcs", "rtgs"],
  ["acq", "op"],
];
const ALL = { tag: 1, lane: 1, outbox: 1, list: 1, plaza: 1, op: 1, mapper: 1, acq: 1, nrcs: 1, issuer: 1, sw: 1, rtgs: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "FASTag · the scale", on: { tag: "lit", lane: 1, sw: 1, issuer: 1 }, figs: [["~12M", ["a day · 120 lakh", "crossings a day"], "lit"], ["₹184 cr", ["collected a day", "a day"]], ["11.73 cr", ["FASTags issued", "tags issued"]]], note: ["40 issuer banks, 12 acquirer banks; NPCI clears and settles", "40 issuers, 12 acquirers"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["decide in ~1 s, link or no link", "decide in ~1 s"], ["one debit per crossing", "one debit each"], ["bad tags stopped everywhere", "bad tags stopped"], ["late crossings, by written rules", "late, by rules"], ["settle; plaza paid by T+1", "plaza paid T+1"], ["one tag per vehicle", "one tag a vehicle"]],
      ctn: ["lit", "lit", "warn"],
    },
    { k: ["~139 debits a second", "~139 a second"], on: { lane: 1, plaza: 1, acq: 1, sw: "lit", issuer: 1 }, fl: [["lane", "plaza"], ["plaza", "acq"], ["acq", "sw"], ["sw", "issuer"]], figs: [["~139/s", ["average, nationwide", "average"]], ["~420/s", ["busiest hour, assumed 3×", "peak, assumed"], "warn"], ["₹153", ["average fare", "a crossing"]]], note: ["a few hundred debits a second: the edges are the hard part", "the edges are hard"] },
    { k: ["one lane, one plaza", "one lane"], on: { tag: "lit", lane: "lit", list: 1, plaza: 1 }, fl: [["tag", "lane"], ["list", "lane"]], figs: [["~17 s", ["a vehicle, busy lane", "a vehicle, a lane"]], ["20–50", ["reads each, assumed", "reads each"], "warn"], ["~220 KB", ["list diff a plaza, 10 min", "diff, 10 min"]]], note: ["~1,150 plazas, ~10,400 crossings each a day on average", "~1,150 plazas"] },
  ],
  arch: [
    { k: ["1 · the lane decides alone", "1 · the lane"], on: { tag: 1, lane: "lit", list: "lit", outbox: 1 }, sub: { lane: ["~1 s", "~1 s"] }, fl: [["tag", "lane"], ["list", "lane"], ["lane", "outbox"]], note: ["signed tag data and a local list; the link can wait", "the link can wait"] },
    { k: ["2 · crossings flow in", "2 · crossings in"], on: { lane: 1, plaza: "lit", acq: "lit", mapper: 1, sw: "lit", issuer: "lit" }, sub: { acq: ["fare from class", "fare"] }, fl: [["lane", "plaza"], ["plaza", "acq"], ["acq", "mapper"], ["acq", "sw"], ["sw", "issuer"]], note: ["the Mapper's class sets the fare; the issuer debits and sends the SMS", "issuer debits, SMS"] },
    { k: ["3 · lists flow out", "3 · lists out"], on: { issuer: "lit", mapper: "lit", acq: 1, plaza: 1, list: "lit", lane: 1 }, fl: [["issuer", "mapper"], ["mapper", "acq"], ["acq", "plaza"], ["plaza", "list"], ["list", "lane"]], note: ["a diff in every plaza's folder every 10 min, a full list daily", "diffs every 10 min"] },
    { k: ["4 · money moves on a schedule", "4 · settlement"], on: { acq: 1, sw: "lit", nrcs: "lit", rtgs: "lit", op: "lit" }, fl: [["sw", "nrcs"], ["nrcs", "rtgs"], ["acq", "op"]], figs: [["3", ["settlement cycles a day", "cycles a day"], "lit"], ["1", ["net amount per bank", "per bank"]], ["T+1", ["plaza operator paid", "plaza paid"]]] },
  ],
  deep: [
    { k: ["1 · a signature the lane can check", "1 · signed tags"], on: { tag: "lit", lane: "lit", list: 1 }, fl: [["tag", "lane"]], chips: [["issuer signs SHA-256 of TID + EPC", "signed TID + EPC"], ["NPCI certifies issuer keys", "NPCI-certified keys"], ["a copy on a blank chip: wrong TID", "copies fail on TID"], ["8-bit key index: rotation", "key rotation"]], ctn: ["lit", "sky", "warn", "ok"] },
    { k: ["2 · forty reads, one crossing", "2 · one passage"], on: { tag: 1, lane: "lit", plaza: 1, acq: "lit", sw: 1, issuer: "lit" }, fl: [["tag", "lane"], ["lane", "plaza"], ["plaza", "acq"]], figs: [["37", ["reads, one crossing", "reads"], "warn"], ["3 keys", ["lane, acquirer, issuer", "3 hops"], "lit"], ["120", ["km/h apart: a clone", "km/h: clone"], "bad"]] },
    { k: ["3 · four parties and a switch", "3 · the switch"], on: { acq: "lit", sw: "lit", issuer: "warn", nrcs: 1 }, fl: [["acq", "sw"], ["sw", "issuer", "warn"], ["sw", "nrcs"]], chips: [["check status before any retry", "status, then retry"], ["wait 60–180 s, by error", "wait 60–180 s"], ["issuer down: deemed accepted", "deemed accepted"], ["issuer honours all processed", "issuer honours all"]], ctn: ["lit", "sky", "warn", "ok"] },
    { k: ["4 · a race between lists", "4 · stale lists"], kt: "warn", on: { issuer: 1, mapper: "lit", acq: 1, plaza: 1, list: "warn", lane: "warn" }, fl: [["issuer", "mapper"], ["mapper", "acq"], ["acq", "plaza"], ["plaza", "list", "warn"]], figs: [["10 min", ["diff SLA at every plaza", "diff SLA"]], ["20 min", ["issuer still liable", "issuer liable"], "lit"], ["60 min", ["before the read: 176", "code 176"], "bad"]], note: ["the 11:53 top-up missed the plaza's 11:50 list", "top-up missed the list"] },
    { k: ["5 · offline, then settled", "5 · late and settled"], on: { lane: "lit", outbox: "lit", plaza: 1, acq: 1, sw: 1, nrcs: "lit", rtgs: 1 }, fl: [["lane", "outbox"], ["sw", "nrcs"], ["nrcs", "rtgs"]], figs: [["15 min", ["to reach the switch", "on time"]], ["3 days", ["late, still processed", "late window"], "warn"], ["₹0", ["net sum, every window", "net sum"], "ok"]], note: ["write the crossing durably, then lift the barrier", "write, then lift"] },
    { k: ["6 · one vehicle, one tag", "6 · one tag each"], on: { issuer: "lit", mapper: "lit", tag: 1 }, sub: { mapper: ["by VRN", "by VRN"] }, fl: [["issuer", "mapper"]], chips: [["the Mapper: one index by VRN", "index by VRN"], ["activate only if no other is", "conditional write"], ["latest wins; old tags closed", "latest wins"], ["VAHAN check before activation", "VAHAN first"]], ctn: ["lit", "ok", "sky", "warn"] },
  ],
  scale: [
    { k: ["Rajesh's night on NH-19", "Rajesh's night"], on: { ...ALL, list: "warn", outbox: "lit", issuer: "lit" }, fl: [["lane", "outbox"], ["plaza", "acq"], ["acq", "sw"], ["sw", "issuer"]], figs: [["12:04", ["stale list: turned away", "stale list"], "warn"], ["12:31", ["offline: 37 reads, 1 debit", "offline"]], ["9:14", ["the SMS, 9 hours later", "SMS, 9 h later"], "lit"]], note: ["nothing lost: an outbox, one number, a 3-day window", "nothing lost"] },
    { k: ["the Annual Pass", "Annual Pass"], on: { tag: "lit", lane: 1, list: "lit", plaza: 1, acq: 1, mapper: 1 }, fl: [["acq", "plaza"], ["plaza", "list"], ["list", "lane"]], figs: [["₹3,000", ["a year or 200 crossings", "a year"], "lit"], ["56L+", ["pass users, March 2026", "users"]], ["~28%", ["of NH car transactions", "car trips"]]], note: ["an entitlement on the tag, sent in the discount file", "sent like exemptions"] },
    { k: ["no barrier at all", "free flow"], kt: "warn", on: { tag: 1, lane: "warn", plaza: 1, acq: 1, mapper: "lit", sw: 1, issuer: 1 }, fl: [["tag", "lane"], ["lane", "plaza"], ["plaza", "acq"], ["acq", "mapper"]], figs: [["~41,500", ["vehicles on day one", "day one"], "lit"], ["72 h", ["to pay an e-notice", "to pay"]], ["2×", ["the fee after that", "after 72 h"], "warn"]], note: ["nothing to decide in a second; identity becomes enforcement", "identity is enforcement"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, lane: "ok", sw: "ok", nrcs: "ok" }, fl: [["tag", "lane", "ok"], ["acq", "sw", "ok"], ["sw", "nrcs", "ok"]], cols: 3, chips: [["the lane decides alone", "lane decides"], ["one number a crossing", "one number"], ["liability in time", "liability, timed"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "About 120 lakh FASTag crossings a day pass National Highway fee plazas, collecting ~₹184 crore (FY 2025–26 to November 2025), from 11.73 crore tags issued by 40 banks; 12 acquirer banks serve the plazas, and NPCI is the central clearing house.", tween: 1400 },
      { caption: "Decide at the lane in about a second, even with the link down; debit every crossing exactly once from the right account; stop low-balance, stolen and cloned tags everywhere, quickly; accept late crossings by written rules; settle between banks and pay plazas by the next working day; one active tag per vehicle.", tween: 1400 },
      { caption: "12,000,000 ÷ 86,400 is ~139 debits a second on average, ~420 at an assumed 3× busiest hour, and ₹184 crore ÷ 120 lakh is ~₹153 a crossing: small for a payment switch, so the hard parts are at the edges.", tween: 1400, loop: true },
      { caption: "~1,150 plazas average ~10,400 crossings a day; a busy lane sees a vehicle every ~17 seconds, read 20 to 50 times (assumed). An assumed ~20 lakh list changes a day is a ~220 KB diff per plaza every 10 minutes.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The lane checks the issuer's signature on the tag with keys already at the plaza, checks its local exception list, classifies the vehicle and lifts the barrier in about a second, writing the crossing to durable local storage first. The debit can follow seconds or hours later.", tween: 1200, loop: true },
      { caption: "The plaza server sends the crossing to its acquirer, which looks the tag up in NPCI's Mapper, prices it from the registered vehicle class and sends a debit through the NETC Switch to the tag's issuer, which debits the wallet and sends the SMS.", tween: 1200, loop: true },
      { caption: "Issuers add and remove tags on the Mapper's exception lists (low balance, hotlist, blacklist, closed); acquirers pull the changes and must put a diff in every plaza's folder every 10 minutes and a full list daily, and the plaza loads it into its lanes.", tween: 1200, loop: true },
      { caption: "Every transaction the switch processes goes straight to NRCS, which nets every bank's position in three cycles a day and settles one amount per bank through RTGS; the acquirer pays the plaza operator within T+1 working day.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "The issuer signs a SHA-256 hash of the chip's factory TID and the tag ID, locked into the tag; the lane holds NPCI's key and the issuers' certified keys, so it authenticates any of 11.73 crore tags offline, and a copy onto a blank chip fails because its TID differs.", tween: 1400, loop: true },
      { caption: "Reads of one tag in one lane between the loop detector's enter and leave events become one passage with one transaction number; the acquirer drops a resent copy by plaza, transaction number and reader time; and two crossings implying over 120 km/h between plazas mark a cloned tag.", tween: 1400, loop: true },
      { caption: "With no final answer, an acquirer waits 60 to 180 seconds and checks the transaction's status before re-sending, within 72 hours of the read. If an issuer is down, the switch keeps sending debit advice until the settlement cut-off and reports \"deemed accepted\": the issuer must honour everything the switch processed.", tween: 1400, loop: true },
      { caption: "Ankit's top-up cleared the low-balance list at 11:53, but the second plaza's copy was from 11:50, so Rajesh was turned away. The issuer is liable for 20 minutes after it lists a tag; since 17 January 2025 the switch declines a tag listed more than 60 minutes before the read and still listed 10 minutes after (code 176), so a stale plaza's side carries that loss.", tween: 1400, loop: true },
      { caption: "The lane writes each crossing durably before the barrier lifts, so a plaza offline for nine hours loses nothing. A crossing past 15 minutes but inside 3 days is still processed, with the balance risk shifted to the plaza; after 3 days it's declined. NRCS nets each window, and the positions must sum to zero.", tween: 1400, loop: true },
      { caption: "No issuer can see the other thirty-nine, so one active tag per vehicle is checked at the Mapper's index by registration number: only the latest tag stays active, older ones sit in low balance for 15 days and then close, and since 1 February 2026 new car tags are validated against VAHAN before activation.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "Rajesh's night: at 12:04 a list two minutes too old sends him to pay by UPI at 1.25 times the fee; at 12:31 an offline plaza reads his tag 37 times and lifts the barrier once; at 9:14 the next morning the SMS arrives, and the plaza is paid the next day.", tween: 1400, loop: true },
      { caption: "The Annual Pass (from 15 August 2025) is ₹3,000 for a year or 200 crossings at about 1,150 NH plazas, activated on the existing tag within two hours; 56 lakh+ users by March 2026 and about 28% of car transactions on the NH network. Plazas learn of passes the way they learn of exemptions, in the discount file.", tween: 1400, loop: true },
      { caption: "Remove the barrier: the Multi-Lane Free Flow point at Chorayasi on NH-48 took ~41,500 vehicles on its first day in May 2026. Tag reads and plate cameras are fused into one crossing per vehicle after the fact, an unpaid crossing becomes an e-notice (the fee within 72 hours, twice that after), and a tag whose number doesn't match the plate isn't trusted.", tween: 1400, loop: true },
      { caption: "The lesson: the lane decides with what it already holds, one transaction number carries a crossing to settlement, and written windows (15 minutes, 3 days, 20 and 60 minutes) say who pays for every delay.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
