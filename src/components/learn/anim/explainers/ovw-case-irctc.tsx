/**
 * The whole case file "The Tatkal gamble": ~2,000,000 people, ~500 seats, about ten seconds at
 * 10:00:00; looking vs buying capacity; the hot-key trap, the bouncer counter and the breathing
 * waiting room; the five-minute hold and late payments; the 2025 war on bots; and the outages
 * that came from looking and buying sharing servers.
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

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function Rush({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["Tatkal · 9:59 a.m.", "9:59 a.m."]} c={["one popular train", "one train"]} narrow={narrow} />
        {Array.from({ length: 40 }, (_, i) => (
          <rect key={i} className="ax-tok warn" x={24 + (i % 10) * 22} y={64 + Math.floor(i / 10) * 26} width={12} height={12} opacity={lerp(0.3, 1, ease(seg(t, i / 60, i / 60 + 0.3)))} />
        ))}
        <Txt x={130} y={186} k="s">
          {narrow ? "~2M people" : "~2,000,000 people"}
        </Txt>
        <Wire d="M256 120H380" arrow tone="lit" />
        <Box x={380} y={80} w={204} h={80} label={narrow ? "~500" : "~500 seats"} sub={narrow ? "seats" : "Tatkal quota"} tone="lit" />
        <Figs items={[["4,000 : 1", "the contest", "lit"], ["~10 s", narrow ? "to decide" : "to decide it"], ["99.975%", narrow ? "will fail" : "told no", "bad"]]} y={250} t={seg(t, 0.3, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["looking vs buying", "looking vs buying"]} c={["per minute, 2026", "per min"]} narrow={narrow} />
        <Txt x={16} y={70} k="s" anchor="start" tone="sky">
          {narrow ? "check availability" : "checking availability: 40 lakh+ a minute"}
        </Txt>
        <Meter x={16} y={82} w={568} h={22} value={ease(t)} max={1} tone="sky" />
        <Txt x={16} y={146} k="s" anchor="start" tone="lit">
          {narrow ? "actually book" : "actually booking: 1.5 lakh+ a minute"}
        </Txt>
        <Meter x={16} y={158} w={568} h={22} value={ease(t) / 27} max={1} tone="lit" />
        <Figs items={[["~27 : 1", "looking : buying", "lit"], ["10 a.m.", narrow ? "AC classes" : "AC · 11 a.m. non-AC"]]} y={254} t={seg(t, 0.3, 1)} narrow={narrow} />
      </g>
    );
  }
  const beats: [string, string, Tone][] = [
    ["10:00:00", narrow ? "press" : "all press", "warn"],
    ["10:00:05", narrow ? "gone" : "quota gone", "bad"],
    ["10:00:10", narrow ? "no" : "told no", "bad"],
    ["10:00:12", narrow ? "booked" : "confirmed", "ok"],
  ];
  return (
    <g>
      <Head k={["the ten seconds", "ten seconds"]} narrow={narrow} />
      {beats.map(([c, l, tone], i) => (
        <g key={c} opacity={fade(t, i, 0.16)}>
          <Box x={16 + i * 146} y={60} w={130} h={64} label={c} sub={l} tone={tone} />
        </g>
      ))}
      <Txt x={300} y={176} k="t" opacity={fade(t, 4)}>
        {narrow ? "not a storage problem" : "500 rows: not a storage problem"}
      </Txt>
      <Txt x={300} y={204} k="s" opacity={fade(t, 4)}>
        {narrow ? "a stampede problem" : "a stampede to reach a few hundred KB"}
      </Txt>
      <Chips items={[["37,410 tickets in one minute (record)", "record: 37,410/min"]]} t={t} narrow={narrow} />
    </g>
  );
}

function Door({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    const q = clock > 0 ? (clock * 0.8) % 1 : 0;
    return (
      <g>
        <Head k={["the naive way", "naive"]} c={["one hot row", "hot key"]} tone="bad" narrow={narrow} />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <Box x={16} y={50 + i * 44} w={110} h={34} label={narrow ? "user" : "user"} tone="sky" />
            <Wire d={`M126 ${67 + i * 44}H${300}V${140}H330`} tone="bad" />
            {clock > 0 && <Token x={lerp(126, 300, q)} y={67 + i * 44} s={7} tone="bad" />}
          </g>
        ))}
        <Box x={330} y={100} w={254} h={80} label={narrow ? "seats_left" : "seats_left row"} sub={narrow ? "everyone" : "everyone touches it"} tone="bad" />
        <Chips items={[["one row = hot key", "hot key"], ["bottleneck for all", "bottleneck"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const n = Math.round(lerp(500, 0, seg(t, 0.15, 0.85)));
    return (
      <g>
        <Head k={["the bouncer", "the bouncer"]} c={["try vs take", "try vs take"]} narrow={narrow} />
        <Box x={16} y={90} w={120} h={90} label={narrow ? "~2M" : "~2,000,000"} sub="press" tone="warn" />
        <Wire d="M136 135H206" arrow />
        <rect className={`ax-box ${n ? "lit" : "bad"}`} x={206} y={80} width={160} height={110} />
        <Txt x={286} y={106}>
          Bouncer
        </Txt>
        <Txt x={286} y={160} k="d" tone={n ? "lit" : "bad"}>
          {fmt(n)}
        </Txt>
        <Wire d="M366 110H420V86H434" arrow tone="ok" />
        <Wire d="M366 160H420V196H434" arrow tone="bad" />
        <Box x={434} y={56} w={150} h={60} label="Booking" sub="~500 yes" tone="ok" />
        <Box x={434} y={166} w={150} h={60} label="Instant no" sub={narrow ? "1,999,500" : "1,999,500 people"} tone="bad" />
        <Chips items={[["is it above zero?", "above zero?"], ["no in milliseconds", "fast no"], ["cheap to reject", "cheap no"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the virtual waiting room", "waiting room"]} c={["it breathes", "breathes"]} tone="sky" narrow={narrow} />
      <Box x={16} y={70} w={200} h={90} label="#84,213" sub={narrow ? "honest wait" : "an honest wait"} tone="sky" />
      <Wire d="M216 115H290" arrow tone="ok" />
      <Box x={290} y={80} w={120} h={70} label="Bouncer" tone="lit" />
      <Wire d="M410 115H464" arrow />
      <Box x={464} y={80} w={120} h={70} label="DB" sub={narrow ? "health" : "response time"} tone="ok" />
      <Wire d="M524 150V200H116V160" arrow dash tone="ok" />
      <Txt x={320} y={222} k="s" tone="ok">
        {narrow ? "coping: wider · slow: tighter" : "coping: admit faster · slowing: tighten within a second"}
      </Txt>
      <Chips items={[["a steady trickle", "trickle"], ["not fastest-click-wins", "not fastest wins"]]} t={t} tone="sky" narrow={narrow} />
    </g>
  );
}

function Hold({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["hold first, charge later", "hold, then pay"]} c="5 min" narrow={narrow} />
        <Box x={16} y={60} w={160} h={70} label={narrow ? "Yes" : "Bouncer: yes"} tone="ok" />
        <Wire d="M176 95H212" arrow tone="ok" />
        <rect className="ax-box lit" x={212} y={60} width={160} height={70} />
        <Txt x={292} y={86} k="t">
          Seat held
        </Txt>
        <Txt x={292} y={116} k="s" tone="lit">
          {narrow ? "5 min" : "for 5 minutes"}
        </Txt>
        <Wire d="M372 80H404V72H420" arrow tone="ok" />
        <Wire d="M372 110H404V168H420" arrow tone="bad" />
        <g opacity={fade(t, 2)}>
          <Box x={420} y={48} w={164} h={50} label={narrow ? "Booked" : "Paid in time"} sub={narrow ? undefined : "permanent"} tone="ok" />
          <Box x={420} y={144} w={164} h={50} label="Expired" sub={narrow ? "back to pool" : "seat back in pool"} tone="bad" />
        </g>
        <Chips items={[["berth · details · OTP · pay", "details + pay"], ["next person gets it", "next in line"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["the late payment", "late payment"]} c={["never guess", "no guessing"]} tone="warn" narrow={narrow} />
        <Box x={16} y={90} w={150} h={70} label="Expired" sub={narrow ? "bank: paid" : "then bank: paid"} tone="bad" />
        <Wire d="M166 125H212" arrow tone="warn" />
        <Box x={212} y={90} w={150} h={70} label="Flagged" sub={narrow ? "check" : "check provider"} tone="warn" />
        <Wire d="M362 110H400V82H420" arrow tone="ok" />
        <Wire d="M362 140H400V170H420" arrow tone="sky" />
        <g opacity={fade(t, 2)}>
          <Box x={420} y={56} w={164} h={52} label="Confirmed" sub={narrow ? "seat free" : "seat still free"} tone="ok" />
          <Box x={420} y={144} w={164} h={52} label="Refunded" sub="automatically" tone="sky" />
        </g>
        <Chips items={[["money and seats always match", "money = seats"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Head k={["the war against bots", "bots"]} c="2025" tone="bad" narrow={narrow} />
        <Txt x={300} y={80} k="s">
          {narrow ? "scripts and touts grab seats" : "scripts and touts grab seats in the opening seconds"}
        </Txt>
        <Figs items={[["3.03 cr", narrow ? "accounts off" : "accounts deactivated", "bad"], ["~13,000", narrow ? "email domains" : "email domains blocked"], ["~4 lakh", narrow ? "PNRs reported" : "suspicious PNRs reported"]]} y={170} t={t} narrow={narrow} />
        <Chips items={[["30.3 million accounts", "30.3M accounts"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  const layers: [string, string, string][] = [
    ["1 Jul 2025", "Aadhaar identity check for Tatkal", "Aadhaar check"],
    ["15 Jul 2025", "Aadhaar OTP: web, app and counters", "Aadhaar OTP"],
    ["10:00–10:30", "no agents in the first 30 minutes", "no agents"],
    ["always", "sub-second forms, shared devices, DC IPs", "bot tells"],
  ];
  return (
    <g>
      <Head k={["layered defences", "layers"]} tone="ok" narrow={narrow} />
      {layers.map(([d, l, n], i) => (
        <g key={d} opacity={fade(t, i, 0.15)}>
          <rect className="ax-box ok" x={16} y={50 + i * 56} width={568} height={44} />
          <Txt x={30} y={77 + i * 56} k="k" anchor="start" tone="mute">
            {d}
          </Txt>
          <Txt x={570} y={77 + i * 56} k="s" anchor="end">
            {narrow ? n : l}
          </Txt>
        </g>
      ))}
      <Chips items={[["raise the cost of cheating", "raise the cost"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Fail({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["when it goes wrong", "outages"]} tone="bad" narrow={narrow} />
        <Box x={16} y={56} w={568} h={64} label={narrow ? "Dec 2024 · ~10 a.m." : "December 2024 · around 10 a.m."} sub={narrow ? "“not available… one hour”" : "“e-ticketing service will not be available for the next one hour”"} tone="bad" />
        <g opacity={fade(t, 1)}>
          <Box x={16} y={140} w={568} h={64} label={narrow ? "17 Oct 2025" : "17 October 2025 · before Diwali"} sub={narrow ? "errors in Tatkal" : "server errors in the Tatkal window again"} tone="bad" />
        </g>
        <Chips items={[["the worst minutes to fail", "worst timing"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["looking drags down buying", "shared servers"]} c={["then → July 2026", "→ 2026"]} tone="warn" narrow={narrow} />
        <Box x={16} y={56} w={200} h={56} label="Looking" sub={narrow ? "~4 lakh/min" : "~4 lakh/min cap"} tone="sky" />
        <Box x={16} y={140} w={200} h={56} label="Buying" sub={narrow ? "~32,000/min" : "~32,000/min cap"} tone="lit" />
        <Wire d="M216 84H260V126H300" arrow />
        <Wire d="M216 168H260V126H300" arrow />
        <Box x={300} y={98} w={140} h={56} label="Same" sub="servers" tone="bad" />
        <Wire d="M440 126H460" arrow tone="bad" />
        <Box x={460} y={98} w={124} h={56} label="Slow" sub="booking" tone="bad" />
        <Figs items={[["40 lakh+", narrow ? "looks/min" : "enquiries a minute", "ok"], ["1.5 lakh+", narrow ? "books/min" : "bookings a minute", "ok"]]} y={262} t={seg(t, 0.3, 1)} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Txt x={300} y={110} k="t">
        {narrow ? "yes to the right 500," : "say yes to exactly the right 500,"}
      </Txt>
      <Txt x={300} y={140} k="t">
        {narrow ? "an honest no to all" : "and an honest, instant no to everyone else"}
      </Txt>
      <Chips items={[["split look / buy", "split traffic"], ["reject fast, cheap", "reject fast"], ["hold, then confirm", "hold first"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "door") return <Door {...p} />;
  if (p.variant === "hold") return <Hold {...p} />;
  if (p.variant === "fail") return <Fail {...p} />;
  return <Rush {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "rush",
      label: "10:00:00",
      steps: [
        { caption: "At 10:00 a.m. about 2,000,000 people try for roughly 500 Tatkal seats on one popular train: a 4,000-to-1 contest, decided in about ten seconds.", tween: 1800, ms: 3400 },
        { caption: "Checking availability and booking are different beasts: since 2026, 40 lakh+ enquiries a minute against 1.5 lakh+ tickets, about 27 to 1.", tween: 1400 },
        { caption: "At 10:00:05 the quota is gone, by 10:00:10 millions are told no, and at 10:00:12 Ananya is confirmed. It's not storage: it's a stampede.", tween: 1800 },
      ],
    },
    {
      id: "door",
      label: "The door",
      steps: [
        { caption: "Build it the obvious way, one seat-count row updated on every try, and that row becomes a hot key: the bottleneck for the whole system.", tween: 1000, loop: true },
        { caption: "Instead a bouncer holds a counter that starts at 500. About 500 people get a yes; the other 1,999,500 get an instant, almost free no.", tween: 1800 },
        { caption: "Before the bouncer, a waiting room gives honest queue numbers and breathes: it admits faster while the database copes, and tightens when it slows.", tween: 1400, loop: true },
      ],
    },
    {
      id: "hold",
      label: "Hold & bots",
      steps: [
        { caption: "A yes is a chance, not a ticket. The seat is held for five minutes: pay in time and it's yours; take too long and it goes back to the pool.", tween: 2000 },
        { caption: "If the bank confirms after the hold expired, the system doesn't guess: it checks the provider, then confirms the seat or refunds automatically.", tween: 1400 },
        { caption: "Bots and touts grab seats in the first seconds. In 2025 Indian Railways deactivated about 3.03 crore suspicious accounts.", tween: 1400 },
        { caption: "The 2025 defences stack up: Aadhaar checks and OTPs, no agents in the first 30 minutes, and tells no human would produce.", tween: 1600 },
      ],
    },
    {
      id: "fail",
      label: "Lessons",
      steps: [
        { caption: "It still broke: in December 2024 a Tatkal morning showed “not available for the next one hour”, and errors returned on 17 October 2025.", tween: 1200 },
        { caption: "When looking and buying share servers, refreshes slow real bookings. The July 2026 rebuild: 40 lakh+ enquiries and 1.5 lakh+ bookings a minute.", tween: 1600, ms: 3400 },
        { caption: "The lesson: separate looking from buying, reject fast and honestly, hold before you charge, and assume some traffic isn't human.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
