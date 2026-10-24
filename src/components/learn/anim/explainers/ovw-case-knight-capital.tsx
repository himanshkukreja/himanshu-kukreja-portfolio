/**
 * The whole case file "Knight Capital: $440 million in 45 minutes": SMARS splits orders and stops
 * when filled; Power Peg retired in 2003 but left callable, its fill counter moved in 2005; the RLP
 * code reuses Power Peg's flag; the deploy reaches seven servers of eight; 97 unread emails; the
 * 45 minutes, the rollback that spread it, and the layered defences that would each have stopped it.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";


const W = 600;
const H = 340;
type L = string | readonly [string, string];
const pk = (l: L, n: boolean) => (typeof l === "string" ? l : n ? l[1] : l[0]);
const fade = (t: number, i = 0, n = 0.14) => ease(seg(t, 0.1 + i * n, 0.4 + i * n));

function Head({ k, c, tone, narrow }: { k: L; c?: L; tone?: Tone; narrow: boolean }) {
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={tone}>
        {pk(k, narrow)}
      </Txt>
      {c && (
        <Txt x={W - 16} y={28} k="k" anchor="end" tone={tone || "mute"}>
          {pk(c, narrow)}
        </Txt>
      )}
    </g>
  );
}

function Chips({ items, t, y = 290, tone, narrow }: { items: L[]; t: number; y?: number; tone?: Tone; narrow: boolean }) {
  const w = (W - 32 - (items.length - 1) * 8) / items.length;
  return (
    <g>
      {items.map((l, i) => {
        const x = 16 + i * (w + 8);
        return (
          <g key={i} opacity={fade(t, i)}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={32} />
            <Txt x={x + w / 2} y={y + 21} k="s" tone={tone}>
              {pk(l, narrow)}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

function Figs({ items, t, y = 288, narrow }: { items: [L, L, Tone?][]; t: number; y?: number; narrow: boolean }) {
  const w = W / items.length;
  return (
    <g>
      {items.map(([d, s, tone], i) => (
        <g key={i} opacity={fade(t, i, 0.18)}>
          <Txt x={w * (i + 0.5)} y={y} k="d" tone={tone}>
            {pk(d, narrow)}
          </Txt>
          <Txt x={w * (i + 0.5)} y={y + 28} k="s">
            {pk(s, narrow)}
          </Txt>
        </g>
      ))}
    </g>
  );
}

const SX = (i: number) => 150 + (i % 4) * 70;
const SY = (i: number) => 80 + Math.floor(i / 4) * 54;
/** the eight SMARS servers: tone and sub label per server */
function Fleet({ tones, subs, narrow }: { tones: Tone[]; subs: string[]; narrow: boolean }) {
  return (
    <g>
      <Txt x={285} y={70} k="s">
        {narrow ? "SMARS" : "SMARS · eight servers"}
      </Txt>
      {tones.map((tone, i) => (
        <Box key={i} x={SX(i)} y={SY(i)} w={60} h={44} label={`S${i + 1}`} sub={narrow ? undefined : subs[i]} tone={tone} />
      ))}
    </g>
  );
}
const ORD = ({ narrow }: { narrow: boolean }) => <Box x={16} y={100} w={104} h={70} label="Orders" sub={narrow ? "flag" : "flag = yes"} tone="sky" />;
const MKT = (tone?: Tone) => <Box x={456} y={80} w={128} h={98} label="Market" tone={tone} />;
const rep = <T,>(n: number, v: T): T[] => Array.from({ length: n }, () => v);

function Setup({ step, t, narrow }: SceneProps) {
  const e = ease(t);
  if (step === 0) {
    const ex = [
      ["Exch A", "400"],
      ["Exch B", "350"],
      ["Exch C", "250"],
    ];
    return (
      <g>
        <Head k={["Knight Capital · SMARS", "SMARS"]} c={["a normal order", "normal day"]} narrow={narrow} />
        <Box x={16} y={100} w={120} h={60} label="Customer" sub="buy 1,000" tone="sky" />
        <Wire d="M136 130H180" arrow />
        <Box x={180} y={100} w={110} h={60} label="SMARS" sub="router" tone="lit" />
        {ex.map(([l, s], i) => (
          <g key={l} opacity={fade(t, i, 0.1)}>
            <Wire d={`M290 130H310V${74 + i * 56}H330`} arrow />
            <Box x={330} y={52 + i * 56} w={120} h={44} label={l} sub={s} />
            <Wire d={`M450 ${74 + i * 56}H470V130H486`} dash />
          </g>
        ))}
        <g opacity={fade(t, 4)}>
          <Box x={486} y={104} w={98} h={52} label="Stop" sub="filled" tone="ok" />
        </g>
        <Txt x={16} y={238} k="s" anchor="start">
          filled
        </Txt>
        <Meter x={84} y={226} w={400} h={16} value={1000 * e} max={1000} tone="ok" />
        <Txt x={584} y={238} k="s" anchor="end" tone="ok">
          {Math.round(1000 * e).toLocaleString("en-US")}
        </Txt>
        <Chips items={[["parent order", "parent"], ["child orders", "children"], ["stop when filled", "stop"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["dead code that wasn't", "asleep, not dead"]} c="2003 · 2005" tone="warn" narrow={narrow} />
        <Box x={40} y={64} w={230} h={62} label="Power Peg" sub={narrow ? "never deleted" : "retired 2003, still callable"} tone="warn" />
        <Wire d="M270 95H330" arrow tone="bad" />
        <Box x={330} y={64} w={254} h={62} label={narrow ? "Send child" : "Send child order"} sub={narrow ? "again" : "again and again"} tone="bad" />
        <Wire d="M457 126V160H155V126" arrow tone="bad" />
        <g opacity={fade(t, 2)}>
          <rect className="ax-wire ax-dash" x={180} y={184} width={240} height={52} />
          <Txt x={300} y={206} k="t" tone="mute">
            {narrow ? "fill check" : "the fill check"}
          </Txt>
          <Txt x={300} y={225} k="s" tone="mute">
            moved in 2005
          </Txt>
        </g>
        <Chips items={[["2003: retired, kept", "2003: kept"], ["2005: counter moved", "2005: moved"], ["never re-tested", "untested"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the new code, the old switch", "an old switch"]} c="summer 2012" narrow={narrow} />
      <Box x={16} y={100} w={150} h={70} label="RLP order" sub="flag = yes" tone="sky" />
      <Wire d="M166 135H250V86H330" arrow tone="ok" />
      <Wire d="M166 135H250V184H330" arrow tone="bad" />
      <g opacity={fade(t, 1)}>
        <Box x={330} y={56} w={254} h={60} label="New code" sub="flag means RLP" tone="ok" />
      </g>
      <g opacity={fade(t, 2)}>
        <Box x={330} y={154} w={254} h={60} label="Old code" sub={narrow ? "flag = Power Peg" : "flag means Power Peg"} tone="bad" />
      </g>
      <Chips items={[["NYSE RLP · Aug 1", "RLP · Aug 1"], ["reuses Power Peg's flag", "old flag reused"]]} t={t} narrow={narrow} />
    </g>
  );
}

function Deploy({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const done = Math.round(lerp(0, 7, seg(t, 0.1, 0.8)));
    const tones = Array.from({ length: 8 }, (_, i): Tone => (i === 7 ? (t > 0.8 ? "warn" : undefined) : i < done ? "ok" : undefined));
    const subs = Array.from({ length: 8 }, (_, i) => (i === 7 ? "old" : i < done ? "RLP" : ""));
    return (
      <g>
        <Head k={["staged deploy, by hand", "manual deploy"]} c="from Jul 27" narrow={narrow} />
        <Fleet tones={tones} subs={subs} narrow={narrow} />
        <g opacity={fade(t, 3)}>
          <Box x={456} y={92} w={128} h={74} label={narrow ? "7 of 8" : "7 of 8"} sub={narrow ? "got it" : "got the code"} tone="warn" />
        </g>
        <Chips items={[["no second review", "no review"], ["no written procedure", "no procedure"], ["nobody noticed", "unnoticed"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["Aug 1, before the bell", "Aug 1"]} c={["one flag, two meanings", "2 meanings"]} narrow={narrow} />
        <ORD narrow={narrow} />
        <Wire d="M120 135H150" arrow tone="sky" />
        <Fleet tones={[...rep<Tone>(7, "ok"), "bad"]} subs={[...rep(7, "RLP"), "Peg"]} narrow={narrow} />
        <Wire d="M420 129H456" arrow />
        {MKT()}
        <g opacity={fade(t, 2)}>
          <Txt x={SX(7) + 30} y={204} k="s" tone="bad">
            {narrow ? "S8: Power Peg" : "S8 still has Power Peg"}
          </Txt>
        </g>
        <Chips items={[["S1–S7: flag = RLP", "S1–7: RLP"], ["S8: flag = Power Peg", "S8: Power Peg"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  const n = Math.round(lerp(0, 97, seg(t, 0.1, 0.9)));
  return (
    <g>
      <Head k="97 emails" c="8:01 → 9:30 a.m." tone="warn" narrow={narrow} />
      <Fleet tones={[...rep<Tone>(7, "ok"), "bad"]} subs={[...rep(7, "RLP"), "Peg"]} narrow={narrow} />
      <Wire d="M420 156H440V129H456" arrow tone="warn" />
      <Box x={456} y={80} w={128} h={98} label="" tone="warn" />
      <Txt x={520} y={128} k="d" tone="lit">
        {n}
      </Txt>
      <Txt x={520} y={156} k="s">
        inbox
      </Txt>
      <Token x={lerp(420, 456, (t * 6) % 1)} y={156} tone="warn" opacity={t < 0.9 ? 1 : 0} />
      <Chips items={[["“Power Peg disabled”", "“Peg disabled”"], ["not alerts", "not alerts"], ["nobody acted", "ignored"]]} t={t} tone="warn" narrow={narrow} />
    </g>
  );
}

const GUARDS: [string, string, string][] = [
  ["Pre-SMARS checks", "orders were made inside SMARS", "made inside"],
  ["9.5% price cap", "prices moved less than that", "moves < 9.5%"],
  ["33 Account limit", "$2M, not wired to a block", "not automated"],
  ["PMON screen", "a human watching, no alerts", "no alerts"],
  ["Kill switch", "none", "none"],
];
function Loss({ step, t, clock, narrow }: SceneProps) {
  const e = ease(t);
  const stream = (from: number[]) =>
    clock > 0 || t < 1
      ? from.flatMap((i) => [0, 1, 2].map((k) => {
          const q = ((clock > 0 ? clock * 0.8 : t * 2) + k / 3) % 1;
          return <Token key={`${i}${k}`} x={lerp(SX(i) + 60, 456, q)} y={SY(i) + 22} s={7} tone="bad" />;
        }))
      : null;
  if (step === 0) {
    return (
      <g>
        <Head k={["9:30 a.m. · the bell", "9:30 a.m."]} c={["no stop condition", "no stop"]} tone="bad" narrow={narrow} />
        <ORD narrow={narrow} />
        <Wire d="M120 135H150" arrow tone="sky" />
        <Fleet tones={[...rep<Tone>(7, "ok"), "bad"]} subs={[...rep(7, "RLP"), "Peg"]} narrow={narrow} />
        <Wire d="M420 156H456" arrow tone="bad" />
        {MKT("bad")}
        {stream([7])}
        <Figs items={[["212", "orders in", "lit"], ["4M+", "trades out", "bad"], ["154", "stocks hit"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["the guardrails, and why each missed", "why nothing stopped it"]} tone="warn" narrow={narrow} />
        {GUARDS.map(([l, w, n], i) => (
          <g key={l} opacity={fade(t, i, 0.12)}>
            <rect className={`ax-box ${i === 4 ? "bad" : "warn"}`} x={16} y={48 + i * 48} width={568} height={38} />
            <Txt x={30} y={72 + i * 48} k="t" anchor="start">
              {l}
            </Txt>
            <Txt x={570} y={72 + i * 48} k="s" anchor="end" tone={i === 4 ? "bad" : undefined}>
              {narrow ? n : w}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  if (step === 2) {
    const k = Math.round(lerp(0, 7, seg(t, 0.2, 0.9)));
    const tones = Array.from({ length: 8 }, (_, i): Tone => (i === 7 || i < k ? "bad" : "ok"));
    return (
      <g>
        <Head k="the rollback" c={["made it worse", "worse"]} tone="bad" narrow={narrow} />
        <ORD narrow={narrow} />
        <Wire d="M120 135H150" arrow tone="sky" />
        <Fleet tones={tones} subs={tones.map((x) => (x === "bad" ? "Peg" : "RLP"))} narrow={narrow} />
        <Wire d="M420 129H456" arrow tone="bad" />
        {MKT("bad")}
        {stream([7, 0, 5])}
        <Chips items={[["RLP code removed from S1–S7", "RLP removed"], ["flag still = yes", "flag still yes"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["~45 minutes after the open", "~45 minutes"]} c={["it stops", "stops"]} tone="bad" narrow={narrow} />
      <Txt x={16} y={70} k="s" anchor="start">
        {narrow ? "~$9.8M a minute" : "about $9.8M lost per minute"}
      </Txt>
      <Meter x={16} y={82} w={568} h={20} value={e} max={1} tone="bad" ticks={9} />
      <Txt x={16} y={136} k="s" anchor="start">
        {narrow ? "$3.5B long" : "$3.5B long + $3.15B short"}
      </Txt>
      <Txt x={584} y={136} k="s" anchor="end">
        {narrow ? "397M+ shares" : "397M+ shares traded"}
      </Txt>
      <Figs items={[["$6.65B", narrow ? "positions" : "unwanted positions", "bad"], ["4M+", "trades"], ["~$440M", narrow ? "loss" : "loss (Knight)", "bad"]]} y={230} t={t} narrow={narrow} />
    </g>
  );
}

const DEF: [string, string][] = [
  ["Every server reports its version", "verify fleet"],
  ["A fresh flag; dead code deleted", "fresh flag"],
  ["Odd errors page a person", "page a person"],
  ["Orders out vs orders in", "out vs in"],
  ["Kill switch + capital limit", "kill switch"],
];
function After({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const rows: [string, string, string][] = [
      ["Aug 2", "~$440M loss; shares close down 63% at $2.58", "shares −63%"],
      ["Aug 6", "$400M of emergency financing", "$400M rescue"],
      ["Jul 2013", "combines with GETCO as KCG Holdings", "KCG merger"],
      ["Oct 2013", "SEC: $12M penalty, controls review", "SEC: $12M"],
    ];
    return (
      <g>
        <Head k="the aftermath" tone="warn" narrow={narrow} />
        {rows.map(([d, l, n], i) => (
          <g key={d} opacity={fade(t, i, 0.15)}>
            <rect className={`ax-box ${i === 0 ? "bad" : ""}`} x={16} y={50 + i * 58} width={568} height={46} />
            <Txt x={30} y={79 + i * 58} k="k" anchor="start" tone={i === 0 ? "bad" : "mute"}>
              {d}
            </Txt>
            <Txt x={narrow ? 186 : 140} y={79 + i * 58} k="s" anchor="start">
              {narrow ? n : l}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["defence in depth", "defence in depth"]} c={["any one breaks the chain", "any one works"]} tone="ok" narrow={narrow} />
        {DEF.map(([l, n], i) => (
          <g key={l} opacity={fade(t, i, 0.12)}>
            <rect className="ax-box ok" x={16} y={48 + i * 48} width={568} height={38} />
            <Txt x={30} y={72 + i * 48} k="t" anchor="start">
              {narrow ? n : l}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Txt x={300} y={110} k="t">
        {narrow ? "a rollback restores code," : "a rollback restores code, not the world"}
      </Txt>
      {narrow && (
        <Txt x={300} y={140} k="t">
          not the world
        </Txt>
      )}
      <Txt x={300} y={214} k="d" tone="lit" opacity={fade(t, 1)}>
        stop first
      </Txt>
      <Txt x={300} y={244} k="s" opacity={fade(t, 2)}>
        debug second
      </Txt>
      <Chips items={[["verify the fleet", "verify"], ["new job, new flag", "new flags"], ["alerts need owners", "owners"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "deploy") return <Deploy {...p} />;
  if (p.variant === "loss") return <Loss {...p} />;
  if (p.variant === "after") return <After {...p} />;
  return <Setup {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "setup",
      label: "The setup",
      steps: [
        { caption: "August 1, 2012. Knight's router, SMARS, splits a customer's order into child orders for the exchanges, and stops once the parent order is filled.", tween: 1800 },
        { caption: "Power Peg, an old SMARS feature, was retired in 2003 but never deleted. In 2005 its fill counter was moved away, and nobody re-tested it.", tween: 1400 },
        { caption: "For the NYSE's new RLP program, Knight's new code replaced Power Peg and reused its flag. Old code would still read that flag as Power Peg.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "deploy",
      label: "7 of 8",
      steps: [
        { caption: "From July 27 the new code went out by hand, server by server. A technician missed one of the eight, and no second review caught it.", tween: 1800 },
        { caption: "So on launch morning the same flag meant RLP on seven servers and Power Peg on the eighth, whose stop condition had been broken since 2005.", tween: 1200 },
        { caption: "From 8:01 a.m., 97 automated emails said “Power Peg disabled”. They weren't built as alerts, and nobody acted on them before the open.", tween: 1600 },
      ],
    },
    {
      id: "loss",
      label: "45 minutes",
      steps: [
        { caption: "At 9:30 the bell rang. Flagged orders woke Power Peg on server 8, which sent child orders without stopping: 212 orders in, 4 million trades out.", tween: 1600, loop: true, ms: 3400 },
        { caption: "Every guardrail missed: checks sat before SMARS, the price cap and $2M account limit weren't automated blocks, and there was no kill switch.", tween: 1600, ms: 3600 },
        { caption: "The team rolled back the new code on the seven good servers. The orders still carried the flag, so now those servers ran Power Peg too.", tween: 1800, loop: true },
        { caption: "About 45 minutes after the open it stopped: $6.65 billion in unwanted positions and a loss of about $440 million, close to $10 million a minute.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "after",
      label: "Defence",
      steps: [
        { caption: "Knight's shares closed down 63% the next day. It needed $400 million in emergency funding, merged within a year, and paid a $12M SEC penalty.", tween: 1400, ms: 3400 },
        { caption: "Any layer breaks the chain: verify server versions, use a fresh flag, page someone on odd errors, compare orders out with in, keep a kill switch.", tween: 1600, ms: 3600 },
        { caption: "A rollback restores code, not the flags and orders around it. When a system misbehaves, stop it first and debug second.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
