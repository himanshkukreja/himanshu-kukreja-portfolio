/**
 * The whole case file "The day Facebook disappeared": DNS (the address book) and BGP (the map);
 * on 4 October 2021 a maintenance command the audit tool failed to stop took the whole backbone
 * down, every DNS site's health check withdrew its BGP routes at once, resolvers got SERVFAIL,
 * retries hit 30x, engineers were locked out of their own tools, and recovery came back in stages.
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

type Pt = { x: number; y: number };
function walk(pts: Pt[], p: number): Pt {
  const segs = pts.slice(1).map((q, i) => Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y));
  let d = p * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(1, d / segs[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k) };
    }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

/** phone, resolver, the internet's router table, two edge sites (DNS) and two data centres on the backbone */
type Net = { rows: number; gone?: boolean; bb: "up" | "down" | "off"; edge?: Tone; dc?: Tone; map?: Tone; res?: [string, string]; dim?: boolean };
const LOOK: Pt[] = [{ x: 64, y: 118 }, { x: 64, y: 160 }];
const ASK: Pt[] = [{ x: 112, y: 184 }, { x: 140, y: 184 }, { x: 324, y: 184 }, { x: 350, y: 184 }];
const REQ: Pt[] = [{ x: 112, y: 94 }, { x: 350, y: 82 }, { x: 454, y: 82 }, { x: 490, y: 82 }];
function Map({ s, narrow, t }: { s: Net; narrow: boolean; t: number }) {
  const rows = narrow ? ["DNS block 1", "DNS block 2"] : ["185.89.218.0/23", "129.134.30.0/23"];
  return (
    <g opacity={s.dim ? 0.3 : 1}>
      <Box x={16} y={70} w={96} h={48} label="Phone" />
      <Box x={16} y={160} w={96} h={48} label={narrow ? "DNS" : "Resolver"} sub={s.res ? pk(s.res, narrow) : "1.1.1.1"} tone={s.res ? "bad" : undefined} />
      <Wire d="M64 118V160" />
      <Wire d="M112 94H140" />
      <Wire d="M112 184H140" />
      {!s.dim && <rect className={`ax-box ${s.map || ""}`} x={140} y={60} width={184} height={158} />}
      {!s.dim && <Txt x={232} y={84} k="k" tone="mute">
        {narrow ? "map" : "router table"}
      </Txt>}
      {!s.dim && rows.map((r, i) => (
        <g key={r} opacity={i < s.rows ? 1 : 0.18}>
          <Txt x={232} y={118 + i * 34} k="s" tone={i < s.rows ? "ok" : undefined}>
            {r}
          </Txt>
        </g>
      ))}
      {s.gone && (
        <Txt x={232} y={196} k="s" tone="bad" opacity={ease(t)}>
          {narrow ? "not in table" : "Network not in table"}
        </Txt>
      )}
      <Wire d="M324 82H350" dash={s.gone} />
      <Wire d="M324 184H350" dash={s.gone} />
      {[0, 1].map((i) => (
        <Box key={i} x={350} y={56 + i * 104} w={104} h={52} label="Edge" sub="DNS" tone={s.edge} />
      ))}
      {[0, 1].map((i) => (
        <Box key={i} x={490} y={56 + i * 104} w={94} h={52} label={narrow ? "DC" : "Data ctr"} tone={s.dc} />
      ))}
      {s.bb !== "off" &&
        ["M454 82H490", "M454 186H490", "M454 92L490 176", "M454 176L490 92"].map((d) => <Wire key={d} d={d} tone={s.bb === "up" ? "lit" : "bad"} dash={s.bb === "down"} />)}
      <Txt x={467} y={244} k="s">
        {narrow ? "AS32934" : "Facebook · AS32934"}
      </Txt>
    </g>
  );
}
const Tok = ({ pts, t, a = 0.1, b = 0.9, tone }: { pts: Pt[]; t: number; a?: number; b?: number; tone?: Tone }) => {
  const q = seg(t, a, b);
  if (q <= 0 || q >= 1) return null;
  const p = walk(pts, ease(q));
  return <Token x={p.x} y={p.y} tone={tone} />;
};

function Normal({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["DNS · the address book", "DNS"]} c={["a normal lookup", "normal"]} narrow={narrow} />
        <Map s={{ rows: 2, bb: "up" }} narrow={narrow} t={t} />
        <Tok pts={[...LOOK, ...ASK]} t={t} />
        <Chips items={[["facebook.com → IP", "name → IP"], ["saved for a TTL", "TTL"], ["no answer: SERVFAIL", "else SERVFAIL"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["BGP · the map", "BGP"]} c={["announce a prefix", "announce"]} narrow={narrow} />
        <Map s={{ rows: t > 0.55 ? 2 : t > 0.3 ? 1 : 0, bb: "up", map: "lit" }} narrow={narrow} t={1} />
        <Tok pts={[{ x: 350, y: 82 }, { x: 324, y: 82 }]} t={t} a={0.1} b={0.3} tone="ok" />
        <Tok pts={[{ x: 350, y: 184 }, { x: 324, y: 184 }]} t={t} a={0.35} b={0.55} tone="ok" />
        <Chips items={[["announce: send it here", "announce"], ["withdraw: forget it", "withdraw"], ["unannounced = unknown", "unknown"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the backbone", "backbone"]} c={["edge to data centre", "edge → DC"]} narrow={narrow} />
      <Map s={{ rows: 2, bb: "up", edge: "lit" }} narrow={narrow} t={t} />
      <Tok pts={REQ} t={t} />
      <Chips items={[["edge sites answer DNS", "edge = DNS"], ["private fibre backbone", "private fibre"]]} t={t} narrow={narrow} />
    </g>
  );
}

function Trigger({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["4 Oct 2021 · maintenance", "4 Oct 2021"]} c={["two failures", "2 failures"]} tone="warn" narrow={narrow} />
        <Map s={{ rows: 2, bb: t > 0.8 ? "down" : "up", dim: true }} narrow={narrow} t={t} />
        <Box x={140} y={64} w={184} h={56} label="Command" sub={narrow ? "check capacity" : "assess capacity"} tone="warn" />
        <Wire d="M232 120V150" arrow tone="bad" />
        <Box x={140} y={150} w={184} h={56} label={narrow ? "Audit" : "Audit tool"} sub={narrow ? "bug" : "bug: lets it run"} tone="bad" />
        <Wire d="M324 178H337V134H466" arrow tone="bad" />
        <Chips items={[["a risky command", "risky command"], ["a bug in its check", "a buggy check"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["the backbone goes down", "backbone down"]} c={["all at once", "all at once"]} tone="bad" narrow={narrow} />
        <Map s={{ rows: 2, bb: "down", dc: "bad" }} narrow={narrow} t={t} />
        <Chips items={[["every backbone link down", "all links down"], ["data centres cut off", "DCs cut off"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Head k={["the health check", "health check"]} c={["every site, same answer", "every site"]} tone="bad" narrow={narrow} />
        <Map s={{ rows: t > 0.6 ? 0 : 2, gone: t > 0.6, bb: "down", dc: "bad", edge: "warn", map: t > 0.6 ? "bad" : undefined }} narrow={narrow} t={seg(t, 0.6, 1)} />
        <Tok pts={[{ x: 350, y: 82 }, { x: 324, y: 82 }]} t={t} a={0.3} b={0.6} tone="bad" />
        <Tok pts={[{ x: 350, y: 184 }, { x: 324, y: 184 }]} t={t} a={0.3} b={0.6} tone="bad" />
        <Chips items={[["can I reach the DCs?", "reach the DCs?"], ["no → withdraw route", "no: withdraw"], ["all sites withdraw", "all withdraw"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the internet notices", "SERVFAIL"]} c="15:50 UTC" tone="bad" narrow={narrow} />
      <Map s={{ rows: 0, gone: true, bb: "down", dc: "bad", edge: "warn", map: "bad", res: ["SERVFAIL", "fail"] }} narrow={narrow} t={1} />
      <Tok pts={[...LOOK, ...ASK.slice(0, 3)]} t={t} tone="bad" />
      <Chips items={[["DNS servers still running", "still running"], ["just unreachable", "unreachable"]]} t={t} tone="warn" narrow={narrow} />
    </g>
  );
}

function Outage({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    const toks = clock > 0 ? [0, 1, 2, 3, 4].map((k) => ((clock * 0.9 + k / 5) % 1)) : [];
    return (
      <g>
        <Head k="the retry storm" c={["the next hours", "hours"]} tone="warn" narrow={narrow} />
        <Map s={{ rows: 0, gone: true, bb: "down", dc: "bad", edge: "warn", map: "bad", res: ["SERVFAIL", "fail"] }} narrow={narrow} t={1} />
        {toks.map((q, i) => (
          <Token key={i} x={64} y={lerp(122, 156, q)} s={7} tone="warn" />
        ))}
        <Txt x={16} y={272} k="s" anchor="start" tone="warn">
          {narrow ? "DNS load" : "DNS queries vs normal"}
        </Txt>
        <Meter x={16} y={282} w={500} h={20} value={30 * ease(t)} max={30} tone="warn" ticks={30} />
        <Txt x={584} y={300} k="d" anchor="end" tone="lit">
          30x
        </Txt>
      </g>
    );
  }
  const rows: [string, string, string][] = [
    ["Remote access", "runs over the backbone", "backbone"],
    ["Out-of-band access", "also down", "also down"],
    ["Internal tools", "find systems by DNS name", "need DNS"],
  ];
  if (step === 1) {
    return (
      <g>
        <Head k={["locked out of your own house", "locked out"]} tone="bad" narrow={narrow} />
        <Box x={16} y={120} w={130} h={60} label="Engineers" tone="sky" />
        {rows.map(([l, s, n], i) => (
          <g key={l} opacity={fade(t, i, 0.15)}>
            <Wire d={`M146 150H170V${82 + i * 68}H190`} arrow tone="bad" />
            <rect className="ax-box bad" x={190} y={56 + i * 68} width={394} height={52} />
            <Txt x={206} y={87 + i * 68} k="t" anchor="start">
              {narrow ? l.replace(" access", "") : l}
            </Txt>
            <Txt x={570} y={87 + i * 68} k="s" anchor="end" tone="bad">
              {narrow ? n : s}
            </Txt>
          </g>
        ))}
        <Chips items={[["the tools to fix the network needed the network", "tools need the network"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  const p = lerp(146, 380, ease(seg(t, 0.1, 0.7)));
  return (
    <g>
      <Head k={["go there in person", "in person"]} c={["slow by design", "by design"]} tone="warn" narrow={narrow} />
      <Box x={16} y={110} w={130} h={60} label="Engineers" tone="sky" />
      <Wire d="M146 140H380" arrow dash />
      {t < 0.7 && <Token x={p} y={140} tone="sky" />}
      <Box x={380} y={80} w={204} h={120} label={narrow ? "Data ctr" : "Data centre"} sub={narrow ? "secure" : "secure access"} tone={t >= 0.7 ? "warn" : undefined} />
      <Chips items={[["hard to get into", "hard to enter"], ["routers hard to modify", "hard to modify"]]} t={t} tone="warn" narrow={narrow} />
    </g>
  );
}

function Recovery({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["back on the map", "back"]} c="21:20 UTC" tone="ok" narrow={narrow} />
        <Map s={{ rows: t > 0.7 ? 2 : 0, gone: t <= 0.7, bb: t > 0.3 ? "up" : "down", dc: t > 0.3 ? "ok" : "bad", edge: t > 0.5 ? "ok" : "warn", map: t > 0.7 ? "ok" : "bad" }} narrow={narrow} t={1} />
        <Tok pts={[{ x: 350, y: 82 }, { x: 324, y: 82 }]} t={t} a={0.5} b={0.7} tone="ok" />
        <Tok pts={[{ x: 350, y: 184 }, { x: 324, y: 184 }]} t={t} a={0.5} b={0.7} tone="ok" />
        <Chips items={[["backbone restored", "backbone"], ["checks pass", "checks pass"], ["routes announced", "announced"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const stages = [0.25, 0.5, 0.75, 1];
    const lvl = stages[Math.min(3, Math.floor(ease(t) * 4))];
    return (
      <g>
        <Head k={["bring it back in stages", "in stages"]} c={["like a storm drill", "storm drill"]} tone="ok" narrow={narrow} />
        <Txt x={16} y={70} k="s" anchor="start">
          {narrow ? "traffic, step by step" : "traffic, one step at a time"}
        </Txt>
        <Meter x={16} y={82} w={568} h={22} value={t >= 1 ? 1 : lvl} max={1} tone="ok" ticks={4} />
        {[
          ["power", narrow ? "dipped tens of MW" : "dipped by tens of megawatts"],
          ["caches", narrow ? "gone cold" : "cold after hours of silence"],
        ].map(([k, v], i) => (
          <g key={k} opacity={fade(t, i + 1)}>
            <rect className="ax-box warn" x={16} y={130 + i * 62} width={568} height={50} />
            <Txt x={32} y={160 + i * 62} k="k" anchor="start" tone="warn">
              {k}
            </Txt>
            <Txt x={570} y={160 + i * 62} k="s" anchor="end">
              {v}
            </Txt>
          </g>
        ))}
        <Chips items={[["no second systemwide failure", "no second failure"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Box x={16} y={56} w={250} h={60} label={narrow ? "Can't reach DCs" : "I can't reach the DCs"} tone="warn" />
      <Wire d="M266 86H316" arrow />
      <Box x={316} y={56} w={268} h={60} label={narrow ? "Only me?" : "Is it only me?"} sub={narrow ? "else keep a floor" : "if not, keep announcing"} tone="ok" />
      <Figs items={[["~6 h", "apps gone"], ["30x", "DNS load", "bad"], ["10.6M+", narrow ? "reports" : "Downdetector reports"]]} y={196} t={t} narrow={narrow} />
      <Chips items={[["a truly separate back door", "separate back door"], ["a no-DNS kit", "no-DNS kit"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "trigger") return <Trigger {...p} />;
  if (p.variant === "out") return <Outage {...p} />;
  if (p.variant === "back") return <Recovery {...p} />;
  return <Normal {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "map",
      label: "The map",
      steps: [
        { caption: "To open WhatsApp, your phone asks a DNS resolver for the address. With no fresh saved copy, it asks Facebook's own nameservers.", tween: 1800 },
        { caption: "BGP is the map. Facebook's network, AS32934, announces address blocks to its neighbours. A block nobody announces simply doesn't exist to routers.", tween: 1800 },
        { caption: "Your request reaches the nearest Facebook edge site, which also answers DNS, then crosses the private backbone to a big data centre.", tween: 1600 },
      ],
    },
    {
      id: "trigger",
      label: "The command",
      steps: [
        { caption: "4 October 2021. A routine maintenance command meant to assess backbone capacity. An audit tool should have stopped it, but a bug let it run.", tween: 1400 },
        { caption: "It took down every connection in the backbone at once, cutting Facebook's data centres off from each other and from the edge.", tween: 1000 },
        { caption: "Each DNS server had a health check: if I can't reach the data centres, withdraw my BGP route. Every site failed it at the same moment.", tween: 1800, ms: 3400 },
        { caption: "From about 15:50 UTC, resolvers like 1.1.1.1 got SERVFAIL for facebook.com. The DNS servers were still running, just unreachable.", tween: 1600 },
      ],
    },
    {
      id: "out",
      label: "Locked out",
      steps: [
        { caption: "Apps retried and people kept refreshing, so resolvers worldwide handled about 30 times their usual DNS traffic.", tween: 1600, loop: true },
        { caption: "Engineers couldn't fix it remotely: primary and out-of-band access were both down, and internal tools broke without DNS.", tween: 1400 },
        { caption: "So Facebook sent engineers to the data centres in person, where buildings are hard to enter and routers are designed to be hard to modify.", tween: 1800 },
      ],
    },
    {
      id: "back",
      label: "Recovery",
      steps: [
        { caption: "With the backbone back, DNS servers passed their health checks and announced their routes again. facebook.com resolved at 21:20 UTC.", tween: 2000 },
        { caption: "Data centres had dipped by tens of megawatts and caches were cold, so traffic came back in stages, the way Meta's storm drills had practised.", tween: 2000, ms: 3400 },
        { caption: "The lesson: a health check should ask whether it's only me before stepping aside, and repair tools must not depend on what they repair.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
