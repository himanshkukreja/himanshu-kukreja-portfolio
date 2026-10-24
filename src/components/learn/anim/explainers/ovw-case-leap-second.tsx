/**
 * The whole case file "The second that broke the internet": what a leap second is (23:59:60, UTC
 * kept within 0.9 s of the Earth), why the wall clock repeats a second while the monotonic clock
 * doesn't; 2012's Linux timer livelock (Reddit, Mozilla, Qantas) and its odd fix; 2017's negative
 * rtt at Cloudflare; then monotonic clocks, the smear, and retiring the leap second by 2035.
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

function Row({ y, items, t, narrow, w = 176, h = 64 }: { y: number; items: [L, L | undefined, Tone?][]; t: number; narrow: boolean; w?: number; h?: number }) {
  const gap = (W - 32 - items.length * w) / Math.max(1, items.length - 1);
  return (
    <g>
      {items.map(([l, s, tone], i) => {
        const x = 16 + i * (w + gap);
        return (
          <g key={i} opacity={fade(t, i, 0.16)}>
            {i > 0 && <Wire d={`M${x - gap} ${y + h / 2}H${x}`} arrow tone={tone === "bad" ? "bad" : undefined} />}
            <Box x={x} y={y} w={w} h={h} label={pk(l, narrow)} sub={s === undefined ? undefined : pk(s, narrow)} tone={tone} />
          </g>
        );
      })}
    </g>
  );
}

function Second({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k="30 June 2012" c="UTC" narrow={narrow} />
        <Txt x={300} y={70} k="s">
          {narrow ? "official clocks" : "official clocks at midnight"}
        </Txt>
        <Row y={90} items={[["23:59:59", undefined], ["23:59:60", "leap second", "lit"], ["00:00:00", "1 July"]]} t={t} narrow={narrow} h={74} />
        <Chips items={[["+1 second", "+1 s"], ["6 months' notice", "6 months"], ["end of June or Dec", "June or Dec"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["why it exists", "why"]} c={["two kinds of day", "two days"]} narrow={narrow} />
        <Box x={16} y={56} w={200} h={56} label={narrow ? "Atomic" : "Atomic · TAI"} sub="steady" tone="sky" />
        <Box x={16} y={140} w={200} h={56} label={narrow ? "Earth" : "Earth · UT1"} sub="wobbly" tone="warn" />
        <Wire d="M216 84H250V126H270" arrow />
        <Wire d="M216 168H250V126H270" arrow />
        <g opacity={fade(t, 1)}>
          <Box x={270} y={98} w={130} h={56} label="IERS" sub={narrow ? "gap" : "watches gap"} />
          <Wire d="M400 126H430" arrow tone="lit" />
          <Box x={430} y={98} w={154} h={56} label="UTC" sub={narrow ? "+ leaps" : "+ leap seconds"} tone="lit" />
        </g>
        <Figs items={[["0.9 s", "max gap"], ["27", narrow ? "since 1972" : "added since 1972", "lit"], ["2016", narrow ? "the last" : "the last, 31 Dec"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["two clocks in every computer", "two clocks"]} narrow={narrow} />
      <Txt x={16} y={64} k="k" anchor="start" tone="bad">
        {narrow ? "wall clock" : "wall clock · what time is it?"}
      </Txt>
      <Row y={74} items={[["…59.995", undefined], ["…59.005", narrow ? "set back" : "set back 1 s", "bad"]]} t={t} narrow={narrow} w={200} h={52} />
      <Txt x={16} y={158} k="k" anchor="start" tone="ok">
        {narrow ? "monotonic clock" : "monotonic clock · how long?"}
      </Txt>
      <Row y={168} items={[["t", undefined], ["t + 10 ms", narrow ? "only up" : "only counts up", "ok"]]} t={t} narrow={narrow} w={200} h={52} />
      <Figs items={[["−990 ms", narrow ? "by wall clock" : "measured by the wall clock", "bad"], ["+10 ms", narrow ? "really" : "what really passed", "ok"]]} t={seg(t, 0.3, 1)} narrow={narrow} />
    </g>
  );
}

function Linux({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["2012 · inside Linux", "2012 · Linux"]} c="23:59:60" tone="bad" narrow={narrow} />
        <Box x={16} y={60} w={176} h={70} label={narrow ? "Clock" : "System clock"} sub={narrow ? "back 1 s" : "set back 1 s"} tone="lit" />
        <Wire d="M192 95H212" arrow tone="bad" />
        <Box x={212} y={60} w={176} h={70} label={narrow ? "Skipped" : "Call skipped"} sub="clock_was_set()" tone="bad" />
        <Wire d="M388 95H408" arrow tone="bad" />
        <g opacity={fade(t, 2)}>
          <Box x={408} y={60} w={176} h={70} label="Timers" sub={narrow ? "+1 s ahead" : "1 s in the future"} tone="bad" />
        </g>
        <Txt x={300} y={186} k="s" opacity={fade(t, 3)}>
          {narrow ? "hrtimer offsets stale" : "the high-resolution timers were never told"}
        </Txt>
        <Chips items={[["removed in 2007", "since 2007"], ["last leap: end of 2008", "last: 2008"], ["barely ever ran", "rare path"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const q = (clock * 1.4) % 1;
    return (
      <g>
        <Head k="the livelock" c={["CPU at 100%", "CPU 100%"]} tone="bad" narrow={narrow} />
        <Box x={16} y={60} w={250} h={64} label="Program" sub={narrow ? "wait 200 ms" : "wake me in 200 ms"} tone="sky" />
        <Box x={334} y={60} w={250} h={64} label="Timer" sub={narrow ? "overdue: fire" : "looks overdue: fires now"} tone="bad" />
        <Wire d="M266 82H334" arrow tone="bad" />
        <Wire d="M334 104H266" arrow tone="bad" />
        {clock > 0 && <Token x={lerp(266, 334, q < 0.5 ? q * 2 : 2 - q * 2)} y={q < 0.5 ? 82 : 104} tone="bad" />}
        <Txt x={16} y={178} k="s" anchor="start">
          CPU
        </Txt>
        <Meter x={60} y={166} w={430} h={18} value={ease(t)} max={1} tone="bad" ticks={10} />
        <Txt x={584} y={182} k="t" anchor="end" tone="bad">
          100%
        </Txt>
        <Chips items={[["busy doing nothing", "busy, idle"], ["Java, MySQL hit hardest", "Java, MySQL"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Head k="who got hit" c={narrow ? "30 Jun 2012" : "30 June – 1 July 2012"} tone="bad" narrow={narrow} />
        <Txt x={300} y={90} k="s">
          {narrow ? "Mozilla · LinkedIn · Yelp" : "Mozilla · LinkedIn · Gawker · Foursquare · Yelp"}
        </Txt>
        <Figs items={[["30–40 min", "Reddit offline", "bad"], ["~1 h", narrow ? "Amadeus" : "Amadeus Altea out"], ["400+", narrow ? "Qantas delays" : "Qantas flights delayed", "bad"]]} y={170} t={t} narrow={narrow} />
        <Chips items={[["manual check-in in Australia", "manual check-in"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the fix: same time, again", "the fix"]} tone="ok" narrow={narrow} />
      <Box x={16} y={56} w={270} h={60} label={narrow ? "Restart app" : "Restart MySQL / Java"} sub="no help" tone="bad" />
      <Box x={314} y={56} w={270} h={60} label="Set the date" sub={narrow ? "to itself" : "to what it already says"} tone="ok" />
      <g opacity={fade(t, 1)}>
        <rect className="ax-box ok" x={16} y={140} width={568} height={50} />
        <Txt x={300} y={170} k="t" tone="ok">
          {narrow ? 'date -s "`date`"' : 'ntpd stop; date -s "`date`"'}
        </Txt>
      </g>
      <Chips items={[["the bad state lived in the kernel", "state in the kernel"], ["kernel fix restores the call", "call restored"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Cloud({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const neg = ease(seg(t, 0.3, 0.9));
    return (
      <g>
        <Head k={["2017 · Cloudflare RRDNS", "2017 · RRDNS"]} c={["1 Jan · 00:00 UTC", "1 Jan 2017"]} tone="bad" narrow={narrow} />
        <rect className="ax-box lit" x={16} y={50} width={568} height={50} />
        <Txt x={300} y={81} k="t">
          {narrow ? "rtt := Now().Sub(start)" : "rtt := time.Now().Sub(start)"}
        </Txt>
        <Wire d="M40 170H560" />
        <Txt x={300} y={196} k="s">
          0
        </Txt>
        <line className="ax-tick" x1={300} x2={300} y1={162} y2={178} />
        <Token x={lerp(330, 150, neg)} y={170} s={14} tone={neg > 0.5 ? "bad" : "ok"} />
        <Txt x={150} y={150} k="t" tone="bad" opacity={neg}>
          rtt &lt; 0
        </Txt>
        <Txt x={330} y={150} k="s" tone="ok" opacity={1 - neg}>
          a few ms
        </Txt>
        <Chips items={[["Go's time.Now(): wall clock only", "wall clock only"], ["clock set back 1 s", "set back 1 s"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["how a negative second spread", "the chain"]} tone="bad" narrow={narrow} />
        <Row y={52} items={[[narrow ? "rtt" : "rtt < 0", narrow ? "< 0" : "a few readings", "bad"], [narrow ? "Average" : "Smoothed", narrow ? "< 0" : "average < 0", "bad"], [narrow ? "Int63n" : "rand.Int63n", narrow ? "(neg)" : "(negative)", "bad"]]} t={t} narrow={narrow} />
        <Wire d="M496 116V140H392V156" arrow tone="bad" />
        <g opacity={fade(t, 3)}>
          <Box x={212} y={156} w={176} h={64} label="Panic" sub="recover()" tone="warn" />
          <Wire d="M212 188H192" arrow tone="bad" />
          <Box x={16} y={156} w={176} h={64} label={narrow ? "Fails" : "CNAME fails"} sub={narrow ? "CNAME" : "some lookups"} tone="bad" />
        </g>
        <Chips items={[["“the belief that time cannot go backwards”", "“time can't go back”"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["impact and fix", "the fix"]} c="00:00 → 06:45 UTC" tone="ok" narrow={narrow} />
      <Meter x={16} y={58} w={568} h={18} value={ease(t)} max={1} tone="warn" />
      <Txt x={16} y={98} k="s" anchor="start">
        00:34 confirmed
      </Txt>
      <Txt x={584} y={98} k="s" anchor="end">
        {narrow ? "01:48 everywhere" : "00:55 canary · 01:48 everywhere"}
      </Txt>
      <Figs items={[["0.2%", narrow ? "DNS at peak" : "DNS queries at peak", "bad"], ["90 min", narrow ? "worst patched" : "worst machines patched"], ["Go 1.9", narrow ? "monotonic" : "monotonic built in", "ok"]]} y={166} t={t} narrow={narrow} />
      <Chips items={[["never record a negative", "drop negatives"], ["restart to clear values", "restart"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Fix({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const rows: [string, string, string, Tone][] = [
      ["how long did it take?", "monotonic clock", "monotonic", "ok"],
      ["when did it happen?", "wall clock, in UTC", "wall (UTC)", "sky"],
      ["two machines' times?", "allow skew, expect < 0", "allow skew", "warn"],
    ];
    return (
      <g>
        <Head k={["which clock?", "which clock?"]} tone="ok" narrow={narrow} />
        {rows.map(([q, a, n, tone], i) => (
          <g key={q} opacity={fade(t, i, 0.16)}>
            <rect className={`ax-box ${tone}`} x={16} y={52 + i * 64} width={568} height={50} />
            <Txt x={32} y={82 + i * 64} k="s" anchor="start">
              {narrow ? q.replace(" did it take", "").replace(" did it happen", "").replace(" machines' times", " machines") : q}
            </Txt>
            <Txt x={570} y={82 + i * 64} k="t" anchor="end" tone={tone}>
              {narrow ? n : a}
            </Txt>
          </g>
        ))}
        <Chips items={[["negative duration? clamp or drop it", "clamp negatives"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const x0 = 40;
    const x1 = 560;
    const mid = (x0 + x1) / 2;
    const yc = 140;
    const a = 56;
    const p = ease(t);
    const pts = [`${x0},${yc}`, `${mid},${yc + a}`, `${mid},${yc - a}`, `${x1},${yc}`];
    return (
      <g>
        <Head k="smear the second" c={["Google: noon to noon", "noon → noon"]} tone="sky" narrow={narrow} />
        <Wire d={`M${x0} ${yc}H${x1}`} dash />
        <Txt x={x0} y={yc - 10} k="s" anchor="start">
          UTC
        </Txt>
        <polyline className="ax-wire ok" points={pts.join(" ")} opacity={p} />
        <Txt x={mid - 40} y={yc + a + 20} k="s" tone="ok">
          −0.5 s
        </Txt>
        <Txt x={mid + 40} y={yc - a - 8} k="s" tone="ok">
          +0.5 s
        </Txt>
        <Txt x={x0} y={yc + 26} k="s" anchor="start">
          12:00
        </Txt>
        <Txt x={x1} y={yc + 26} k="s" anchor="end">
          12:00
        </Txt>
        <Figs items={[["24 h", narrow ? "linear" : "linear smear"], ["11.6 ppm", narrow ? "slower" : "slower clock", "ok"], ["no jump", narrow ? "no repeat" : "no repeated second"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["retiring the leap second", "retiring it"]} c="CGPM · 18 Nov 2022" tone="ok" narrow={narrow} />
      <Row y={60} items={[["Resolution 4", narrow ? "2022" : "18 Nov 2022"], ["By 2035", narrow ? "gap > 0.9 s" : "UT1−UTC > 0.9 s", "ok"], [narrow ? "No leaps" : "No new leaps", narrow ? "drift" : "UTC drifts", "ok"]]} t={t} narrow={narrow} />
      <Txt x={300} y={176} k="s" tone="warn" opacity={fade(t, 3)}>
        {narrow ? "until then, a negative one?" : "until then: still possible, even a first negative one"}
      </Txt>
      <Chips items={[["wall clock for when", "wall: when"], ["monotonic for how long", "monotonic: how long"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "linux") return <Linux {...p} />;
  if (p.variant === "cf") return <Cloud {...p} />;
  if (p.variant === "fix") return <Fix {...p} />;
  return <Second {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "second",
      label: "One second",
      steps: [
        { caption: "30 June 2012 had one extra second. Official clocks went 23:59:59, then 23:59:60, then 00:00:00. That extra second is a leap second.", tween: 1600 },
        { caption: "UTC ticks at the steady atomic rate but is kept within 0.9 seconds of the Earth's wobbly spin. 27 leap seconds have been added since 1972.", tween: 1600 },
        { caption: "Most computers can't show 23:59:60, so the wall clock repeats 23:59:59: a 10 ms wait measures as −990 ms. The monotonic clock never goes back.", tween: 1800, ms: 3600 },
      ],
    },
    {
      id: "linux",
      label: "2012 · Linux",
      steps: [
        { caption: "Linux set its clock back a second but skipped clock_was_set(), so its timers lived one second in the future. The bug dated from 2007.", tween: 1600, ms: 3400 },
        { caption: "A program asks to wake in 200 ms. To the timers that moment has passed, so it fires at once, again and again: CPU at 100%, doing nothing.", tween: 1400, loop: true },
        { caption: "Reddit was offline for 30 to 40 minutes. The Amadeus Altea system was out for about an hour, and more than 400 Qantas flights were delayed.", tween: 1600 },
        { caption: "Restarting MySQL or Java didn't help. Setting the date to what it already said did, because that makes the kernel update its timers.", tween: 1200 },
      ],
    },
    {
      id: "cf",
      label: "2017 · Cloudflare",
      steps: [
        { caption: "1 January 2017. Cloudflare's Go DNS server timed resolvers with time.Now().Sub(start), which read only the wall clock, so rtt went negative.", tween: 1600 },
        { caption: "A few negative readings pulled the smoothed average below zero. rand.Int63n panicked on it, and some CNAME lookups for customers failed.", tween: 1800, ms: 3400 },
        { caption: "At peak 0.2% of DNS queries were hit. The fix: never record a negative, then restart. Since Go 1.9, time.Now() also carries a monotonic reading.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "fix",
      label: "The fix",
      steps: [
        { caption: "Use the monotonic clock for how long, the wall clock in UTC for when, and allow for skew between machines. Clamp or drop any negative duration.", tween: 1400 },
        { caption: "Google smears the second over 24 hours, noon to noon, running clocks about 11.6 parts per million slow. No jump, no repeated second.", tween: 2000 },
        { caption: "In November 2022 the CGPM voted to stop adding leap seconds by 2035. Until then one is still possible, so subtract timestamps safely.", tween: 1400 },
      ],
    },
  ],
  Scene,
});
