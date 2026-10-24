/**
 * The whole case file "Hotstar: 25 million viewers, one match": the 10 July 2019 semi-final chase
 * to 25.3M concurrent; why reactive autoscaling (5 to 6 minutes) is late at ~1M new viewers a
 * minute; the capacity ladder, the scorecard as a forecast, the CDN shock absorber and panic mode;
 * then the thundering herd when the wicket falls, jitter and backoff, and Project HULK rehearsals.
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

/** concurrency over the two days (millions); only the story's own values are labelled */
const PTS: [number, number][] = [
  [40, 0],
  [62, 3.5],
  [150, 13.9],
  [180, 5],
  [244, 5],
  [292, 1.75],
  [350, 15],
  [400, 15],
  [450, 18.2],
  [500, 24.4],
  [540, 25.3],
];
const CY = (m: number) => 232 - m * 6.6;
function Chart({ t, narrow, notes }: { t: number; narrow: boolean; notes: "end" | "all" }) {
  const cut = lerp(40, 540, ease(t));
  const pts: string[] = [];
  for (let i = 0; i < PTS.length; i++) {
    const [x, m] = PTS[i];
    if (x <= cut) pts.push(`${x},${CY(m)}`);
    else {
      const [px, pm] = PTS[i - 1];
      pts.push(`${cut},${CY(lerp(pm, m, (cut - px) / (x - px)))}`);
      break;
    }
  }
  const lab = (x: number, m: number, s: string, tone?: Tone, a: "start" | "middle" | "end" = "middle") =>
    cut >= x ? (
      <Txt x={x} y={CY(m) - 10} k="s" tone={tone} anchor={a}>
        {s}
      </Txt>
    ) : null;
  return (
    <g>
      <Wire d="M40 232H584" />
      <line className="ax-tick" x1={266} x2={266} y1={60} y2={232} />
      <Wire d="M266 60V232" dash />
      <Txt x={150} y={252} k="s">
        {narrow ? "day 1" : "day 1 · 9 July"}
      </Txt>
      <Txt x={420} y={252} k="s">
        {narrow ? "day 2" : "day 2 · reserve day"}
      </Txt>
      <polyline className="ax-wire lit" points={pts.join(" ")} />
      {notes === "all" && (
        <g>
          {lab(62, 3.5, narrow ? "toss" : "toss 3–4M", undefined, "start")}
          {lab(150, 13.9, "13.9M")}
          {lab(212, 5, narrow ? "rain" : "rain ~5M")}
          {lab(330, 15, narrow ? "~1M/min" : "~1M a minute", "warn", "end")}
        </g>
      )}
      {notes === "end" && !narrow && lab(450, 18.2, "18.2M", undefined, "end")}
      {lab(500, 24.4, "24.4M", undefined, "end")}
      {lab(540, 25.3, "25.3M", "lit", "start")}
      {t >= 1 && <Wire d={`M572 ${CY(25.3)}V200`} arrow tone="bad" />}
    </g>
  );
}

function Rush({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["10 July 2019 · semi-final", "10 July 2019"]} c={["India v New Zealand", "IND v NZ"]} narrow={narrow} />
        <Chart t={t} narrow={narrow} notes="end" />
        <Chips items={[["5 for 3", "5 for 3"], ["49th over: record", "49th: record"], ["Dhoni run out", "run out"]]} t={seg(t, 0.5, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["reach vs concurrency", "reach vs now"]} narrow={narrow} />
        <Txt x={16} y={70} k="s" anchor="start">
          {narrow ? "reach: anyone, all day" : "reach: every person, at any time that day"}
        </Txt>
        <Meter x={16} y={82} w={568} h={22} value={1} max={1} tone="sky" />
        <Txt x={16} y={150} k="s" anchor="start" tone="lit">
          {narrow ? "concurrency: right now" : "concurrency: watching at the same instant"}
        </Txt>
        <Meter x={16} y={162} w={568} h={22} value={25.3 * ease(t)} max={100} tone="lit" />
        <Figs items={[["100M+", narrow ? "reach" : "used Hotstar that day"], ["25.3M", narrow ? "at once" : "at the same moment", "lit"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the shape of a match", "the shape"]} c={["a tsunami, not a curve", "a tsunami"]} tone="warn" narrow={narrow} />
      <Chart t={t} narrow={narrow} notes="all" />
      <Chips items={[["~1.1M a minute", "1.1M/min"], ["13M → 25M in ~10 min", "~10 min"], ["then the drop", "the drop"]]} t={seg(t, 0.5, 1)} tone="warn" narrow={narrow} />
    </g>
  );
}

function Late({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const steps = narrow ? ["Busy", "Alarm", "Boot", "App", "LB"] : ["CPU up", "Alarm", "Boot", "App up", "In LB"];
    return (
      <g>
        <Head k={["reactive autoscaling", "autoscaling"]} c={["5 to 6 minutes", "5–6 min"]} tone="bad" narrow={narrow} />
        {steps.map((l, i) => (
          <g key={l} opacity={fade(t, i, 0.12)}>
            <Box x={16 + i * 116} y={60} w={100} h={50} label={l} tone={i === 4 ? "ok" : undefined} />
            {i < 4 && <Wire d={`M${116 + i * 116} 85H${132 + i * 116}`} arrow />}
          </g>
        ))}
        <Txt x={16} y={158} k="s" anchor="start" tone="bad">
          {narrow ? "arrive meanwhile" : "viewers arriving while it boots"}
        </Txt>
        <Meter x={16} y={170} w={568} h={22} value={6 * ease(t)} max={6} tone="bad" ticks={6} />
        <Figs items={[["~1M/min", "new viewers"], ["5–6 min", narrow ? "to serve" : "until serving"], ["5–6M", narrow ? "unserved" : "arrive first", "bad"]]} y={270} t={seg(t, 0.4, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Head k="the core idea" tone="ok" narrow={narrow} />
        <Box x={16} y={60} w={270} h={70} label="React" sub={narrow ? "after it's busy" : "after servers are busy"} tone="bad" />
        <Box x={314} y={60} w={270} h={70} label="Predict" sub={narrow ? "ready before" : "ready before the crowd"} tone="ok" />
        <Txt x={300} y={190} k="s" opacity={fade(t, 2)}>
          {narrow ? "traffic outgrows boot time" : "when traffic grows faster than servers start"}
        </Txt>
        <Chips items={[["autoscaling: \u201ca useless strategy\u201d for spikes", "\u201ca useless strategy\u201d"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  const rows: [string, string, string][] = [
    ["Insufficient capacity", "ask 200, get 50", "200 → 50"],
    ["One machine type", "that type runs out: stuck", "stuck"],
    ["Small steps", "100 → 800 in 10–15 min", "10–15 min"],
  ];
  return (
    <g>
      <Head k={["at Hotstar's scale", "at scale"]} tone="bad" narrow={narrow} />
      {rows.map(([l, w, n], i) => (
        <g key={l} opacity={fade(t, i, 0.15)}>
          <rect className="ax-box bad" x={16} y={50 + i * 56} width={568} height={44} />
          <Txt x={30} y={77 + i * 56} k="t" anchor="start">
            {narrow ? l.replace("Insufficient", "No").replace(" machine", "") : l}
          </Txt>
          <Txt x={570} y={77 + i * 56} k="s" anchor="end" tone="bad">
            {narrow ? n : w}
          </Txt>
        </g>
      ))}
      <Chips items={[["order the food before the guests arrive", "order food early"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
    </g>
  );
}

function Ready({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    const cut = lerp(40, 560, ease(t));
    const vy = (x: number) => 230 - ((x - 40) * 120) / 520;
    const RUNGS = [40, 170, 300, 430];
    const cap = RUNGS.filter((x) => x <= cut + 60)
      .map((x, i) => `${i ? `H${x}V` : `M${x} `}${180 - i * 40}`)
      .join("");
    return (
      <g>
        <Head k="the capacity ladder" c={["a rung ahead", "rung ahead"]} tone="ok" narrow={narrow} />
        <Wire d="M40 232H584" />
        <path className="ax-wire ok" d={`${cap}H${Math.min(560, cut + 60)}`} />
        <Wire d={`M40 ${vy(40)}L${cut} ${vy(cut)}`} tone="lit" />
        <Txt x={100} y={172} k="s" tone="ok">
          {narrow ? "3M" : "3M rung"}
        </Txt>
        <Txt x={235} y={132} k="s" tone="ok" opacity={cut > 110 ? 1 : 0}>
          {narrow ? "10M" : "10M rung"}
        </Txt>
        <Txt x={300} y={194} k="s" tone="lit">
          viewers
        </Txt>
        <Txt x={500} y={96} k="s" opacity={cut > 480 ? 1 : 0}>
          headroom
        </Txt>
        <Chips items={[["scale on concurrency", "concurrency"], ["not CPU", "not CPU"], ["decide in ~90 s", "~90 s"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["read the scorecard", "the scorecard"]} c={["a forecast", "forecast"]} narrow={narrow} />
        <Box x={16} y={56} w={270} h={60} label={narrow ? "Dhoni to bat" : "Dhoni about to bat"} sub="+2 to 3M" tone="lit" />
        <Box x={314} y={56} w={270} h={60} label={narrow ? "Star out" : "A star gets out"} sub="−2 to 3M" tone="sky" />
        <g opacity={fade(t, 2)}>
          <rect className="ax-box warn" x={16} y={140} width={568} height={60} />
          <Txt x={300} y={166} k="t">
            {narrow ? "1 push notification" : "one push notification"}
          </Txt>
          <Txt x={300} y={188} k="s">
            {narrow ? "150–200M × 2–4%" : "150–200M receive it × 2–4% tap it"}
          </Txt>
        </g>
        <Figs items={[["4–6M", narrow ? "extra viewers" : "extra viewers, fast", "lit"]]} y={262} t={seg(t, 0.5, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    const q = (clock * 0.6) % 1;
    return (
      <g>
        <Head k={["the shock absorber", "shock absorber"]} c="10 Tbps+" narrow={narrow} />
        <Box x={16} y={110} w={96} h={60} label="Viewers" tone="sky" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <Wire d={`M112 140H124V${76 + i * 64}H140`} arrow />
            <Box x={140} y={52 + i * 64} w={110} h={48} label="Edge" tone={i === 2 ? "bad" : "ok"} sub={i === 2 ? "down" : undefined} />
            <Wire d={`M250 ${76 + i * 64}H266V140H282`} arrow dash={i < 2} tone={i === 2 ? "bad" : undefined} />
          </g>
        ))}
        <Box x={282} y={110} w={100} h={60} label="Mid" sub="tier" tone="lit" />
        <Wire d="M382 140H400" arrow />
        <Box x={400} y={110} w={90} h={60} label="Origin" />
        <Wire d="M490 140H508" arrow />
        <Box x={508} y={110} w={76} h={60} label="DB" tone="warn" />
        {clock > 0 && <Token x={lerp(250, 282, q)} y={lerp(204, 140, q)} s={8} tone="bad" />}
        <Chips items={[["5% of 10M spill = 0.5M", "5% = 0.5M"], ["TTL cloudburst", "TTL cloudburst"], ["DB sized for peak", "DB pre-sized"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  const svcs: [string, boolean][] = [
    ["Video", true],
    ["Ads", true],
    ["Subscriptions", true],
    ["Payments", true],
    [narrow ? "Recos" : "Recommendations", false],
    [narrow ? "Personal" : "Personalised rows", false],
  ];
  return (
    <g>
      <Head k="panic mode" c={["at 80–90% of rating", "80–90%"]} tone="warn" narrow={narrow} />
      {svcs.map(([l, p0], i) => {
        const off = !p0 && t > 0.5;
        return (
          <g key={l}>
            <Box x={16 + (i % 3) * 192} y={56 + Math.floor(i / 3) * 76} w={184} h={58} label={narrow && l === "Subscriptions" ? "Subs" : l} sub={p0 ? "P0" : off ? "off · 200 OK" : "extra"} tone={p0 ? "ok" : off ? "mute" : undefined} dim={off} />
          </g>
        );
      })}
      <Chips items={[["the video must play on", "video plays on"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
    </g>
  );
}

function Drop({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    const burst = clock > 0 ? (clock * 0.9) % 1 : seg(t, 0.3, 0.95);
    return (
      <g>
        <Head k={["the wicket falls", "wicket falls"]} c={["millions press back", "back button"]} tone="bad" narrow={narrow} />
        <Box x={16} y={70} w={130} h={120} label="Phones" sub="press back" tone="sky" />
        <Wire d="M146 130H230" arrow tone="bad" />
        <Box x={230} y={90} w={170} h={80} label={narrow ? "Home APIs" : "Home page APIs"} sub={narrow ? "banner" : "banner · history"} tone="bad" />
        <Wire d="M400 130H460" arrow tone="bad" />
        <Box x={460} y={90} w={124} h={80} label="DB" sub="slow" tone="bad" />
        {burst > 0 && burst < 1 && [0, 1, 2, 3, 4].map((k) => <Token key={k} x={lerp(146, 230, burst)} y={110 + k * 10} s={7} tone="bad" />)}
        <Txt x={300} y={222} k="s" opacity={fade(t, 3)}>
          {narrow ? "2017 login: 10K → 125K/s" : "2017 login API: 10,000 → 125,000 requests a second"}
        </Txt>
        <Chips items={[["thundering herd", "herd"], ["retries make it worse", "retries hurt"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const tick = (x: number, y: number, k: number) => <rect key={`${y}${k}`} className={`ax-tok ${y < 150 ? "bad" : "ok"}`} x={x - 3} y={y - 12} width={6} height={24} />;
    const spread = ease(t);
    return (
      <g>
        <Head k={["no dumb clients", "smart clients"]} tone="ok" narrow={narrow} />
        <Txt x={16} y={70} k="s" anchor="start" tone="bad">
          {narrow ? "lockstep" : "no jitter: all in the same second"}
        </Txt>
        <Wire d="M16 110H584" />
        {Array.from({ length: 12 }, (_, k) => tick(300 + (k % 3) - 1, 110, k))}
        <Txt x={16} y={160} k="s" anchor="start" tone="ok">
          {narrow ? "jitter + backoff" : "jitter + backoff: spread out"}
        </Txt>
        <Wire d="M16 200H584" />
        {Array.from({ length: 12 }, (_, k) => tick(lerp(300, 40 + k * 46, spread), 200, k))}
        <Chips items={[["jitter", "jitter"], ["backoff", "backoff"], ["cache on phone", "cache"], ["pre-scale home", "pre-scale"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["rehearse the match", "rehearse"]} c="Project HULK" tone="ok" narrow={narrow} />
      <Txt x={16} y={70} k="s" anchor="start">
        25.3M peak
      </Txt>
      <Meter x={16} y={82} w={568} h={20} value={25.3} max={50} tone="lit" />
      <Txt x={16} y={136} k="s" anchor="start" tone="ok">
        {narrow ? "ready for 50M" : "ready for 50M, about twice the peak"}
      </Txt>
      <Meter x={16} y={148} w={568} h={20} value={50 * ease(t)} max={50} tone="ok" />
      <Figs items={[["3,000+", "load machines"], ["108,000", "vCPUs", "lit"], ["8", "AWS regions"]]} y={240} t={t} narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "late") return <Late {...p} />;
  if (p.variant === "ready") return <Ready {...p} />;
  if (p.variant === "drop") return <Drop {...p} />;
  return <Rush {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "rush",
      label: "The rush",
      steps: [
        { caption: "10 July 2019, the World Cup semi-final. As Jadeja and Dhoni fight back, viewers climb from 18.2 million to 25.3 million in the 49th over.", tween: 2400, ms: 3400 },
        { caption: "Over 100 million people used Hotstar that day, but what sizes servers is concurrency: 25.3 million watching at the same instant.", tween: 1400 },
        { caption: "Cricket traffic follows the score: 13.9 million on day 1, about 5 million through the rain, then roughly a million new viewers a minute.", tween: 2400, ms: 3400 },
      ],
    },
    {
      id: "late",
      label: "Too late",
      steps: [
        { caption: "Autoscaling reacts to busy CPUs, and a new server took 5 to 6 minutes to serve. At a million new viewers a minute, 5 to 6 million arrive first.", tween: 2000, ms: 3400 },
        { caption: "At Hotstar's scale the cloud also ran short of a machine type, and growing from 100 to 800 servers could take 10 to 15 minutes.", tween: 1600 },
        { caption: "Hotstar's CTO called autoscaling useless for spikes. If traffic grows faster than servers start, don't react: predict, and order the food early.", tween: 1200 },
      ],
    },
    {
      id: "ready",
      label: "Be ready",
      steps: [
        { caption: "So Hotstar pre-warms and climbs a capacity ladder: servers per app at each concurrency level, stepped up early on viewers and requests, not CPU.", tween: 2000 },
        { caption: "The match is the forecast: Dhoni coming in can mean 2 or 3 million more. One push notification can bring 4 to 6 million extra viewers fast.", tween: 1600 },
        { caption: "A CDN is the shock absorber: edges and a mid-tier keep viewers off the origin, and the databases behind it are sized for the peak in advance.", tween: 1200, loop: true },
        { caption: "Panic mode: near 80 to 90% of a service's rated capacity, extras like recommendations switch off quietly. Video, ads and payments stay on.", tween: 1400 },
      ],
    },
    {
      id: "drop",
      label: "The drop",
      steps: [
        { caption: "The drop hurts more than the peak. Dhoni is run out, millions press back at once, and the home page APIs get a thundering herd.", tween: 1600, loop: true },
        { caption: "No dumb clients: jitter spreads requests out, backoff waits longer between retries, phones reuse a cached home page, and home is pre-scaled.", tween: 1800 },
        { caption: "Project HULK rehearsed the match with 3,000+ machines in 8 regions. On the night Hotstar was ready for 50 million, about twice the peak.", tween: 1600 },
      ],
    },
  ],
  Scene,
});
