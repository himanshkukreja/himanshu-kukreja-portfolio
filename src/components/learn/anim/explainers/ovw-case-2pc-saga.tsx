/**
 * The whole case file "Distributed transactions: 2PC vs saga": WonderTravel's one-click flight,
 * hotel and car booking; two-phase commit's PREPARE and COMMIT; the 12:15 AM coordinator crash
 * (2,000 transactions, 6,000 locked items, 4 hours) and the partition that left a hotel in doubt;
 * the saga that commits locally and compensates; idempotency; and when 2PC still fits.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";


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

const SVC: [string, string, string][] = [
  ["Flight", "New York", "JFK → NRT"],
  ["Hotel", "Amsterdam", "Tokyo, 3 nights"],
  ["Car", "Singapore", "Camry, 3 days"],
];
const SY = (i: number) => 50 + i * 72;
function Coord({ tones, subs, coord, csub, wire, narrow, t, flow }: { tones: Tone[]; subs: string[]; coord?: Tone; csub?: string; wire?: (Tone | "cut")[]; narrow: boolean; t: number; flow?: "out" | "back" }) {
  const q = flow ? ease(seg(t, 0.1, 0.8)) : 0;
  return (
    <g>
      <Box x={16} y={102} w={150} h={70} label={narrow ? "Coord" : "Coordinator"} sub={csub} tone={coord || "lit"} />
      {SVC.map(([l], i) => {
        const w = wire?.[i];
        return <Wire key={l} d={`M166 137H${200 + i * 12}V${SY(i) + 27}H400`} arrow={w !== "cut"} dash={w === "cut"} tone={w === "cut" ? "bad" : w} />;
      })}
      {SVC.map(([l], i) => (
        <Box key={l} x={400} y={SY(i)} w={184} h={54} label={l} sub={subs[i]} tone={tones[i]} />
      ))}
      {flow && q > 0 && q < 1 && [0, 1, 2].map((i) => {
        const p = flow === "out" ? q : 1 - q;
        const x = p < 0.3 ? lerp(166, 200 + i * 12, p / 0.3) : p < 0.5 ? 200 + i * 12 : lerp(200 + i * 12, 400, (p - 0.5) / 0.5);
        const y = p < 0.3 ? 137 : p < 0.5 ? lerp(137, SY(i) + 27, (p - 0.3) / 0.2) : SY(i) + 27;
        return <Token key={i} x={x} y={y} s={8} tone={flow === "back" ? "ok" : "lit"} />;
      })}
    </g>
  );
}

function Ask({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["WonderTravel · Book Everything", "Book Everything"]} c={["Black Friday 2024", "Black Friday"]} narrow={narrow} />
        {SVC.map(([l, c, d], i) => (
          <g key={l} opacity={fade(t, i, 0.16)}>
            <Box x={16 + i * 196} y={60} w={176} h={64} label={l} sub={narrow ? c : d} tone="sky" />
          </g>
        ))}
        <Txt x={300} y={170} k="t" opacity={fade(t, 3)}>
          {narrow ? "all three, or none" : "all three bookings, or none of them"}
        </Txt>
        <Figs items={[["50,000", narrow ? "at once" : "booking attempts at peak"], ["3", narrow ? "continents" : "services, 3 continents"]]} y={256} t={seg(t, 0.4, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["2PC · phase 1: PREPARE", "PREPARE"]} c={["lock everything", "lock"]} narrow={narrow} />
        <Coord narrow={narrow} t={t} flow="out" tones={t > 0.8 ? ["warn", "warn", "warn"] : [undefined, undefined, undefined]} subs={t > 0.8 ? ["PREPARED · locked", "PREPARED · locked", "PREPARED · locked"].map((s) => (narrow ? "locked" : s)) : ["", "", ""]} />
        <Chips items={[["seat, room, car held", "all held"], ["nobody else can take them", "locked"]]} t={seg(t, 0.5, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["2PC · phase 2: COMMIT", "COMMIT"]} c={["all agreed", "all agreed"]} tone="ok" narrow={narrow} />
      <Coord narrow={narrow} t={t} flow="out" tones={t > 0.8 ? ["ok", "ok", "ok"] : ["warn", "warn", "warn"]} subs={t > 0.8 ? ["COMMITTED", "COMMITTED", "COMMITTED"] : ["locked", "locked", "locked"]} wire={["ok", "ok", "ok"]} />
      <Chips items={[["strong consistency", "consistent"], ["but everyone waits", "but blocking"]]} t={seg(t, 0.5, 1)} tone="ok" narrow={narrow} />
    </g>
  );
}

function Break({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["12:15 AM · coordinator crashes", "12:15 AM"]} c={["memory exhausted", "out of memory"]} tone="bad" narrow={narrow} />
        <Coord narrow={narrow} t={t} coord="bad" csub="down" tones={["warn", "warn", "warn"]} subs={narrow ? ["waiting", "waiting", "waiting"] : ["PREPARED · waiting", "PREPARED · waiting", "PREPARED · waiting"]} wire={["cut", "cut", "cut"]} />
        <Figs items={[["2,000", narrow ? "stuck" : "transactions stuck", "bad"], ["6,000", narrow ? "items locked" : "items locked"], ["4 h", narrow ? "to unlock" : "to unlock by hand", "bad"]]} y={286} t={seg(t, 0.3, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["a partition during COMMIT", "partition"]} c={["in doubt", "in doubt"]} tone="bad" narrow={narrow} />
        <Coord narrow={narrow} t={t} tones={["ok", "warn", "ok"]} subs={narrow ? ["booked", "in doubt", "booked"] : ["booked, charged", "locked, in doubt", "booked, charged"]} wire={["ok", "cut", "ok"]} />
        <Chips items={[["flight + car, no hotel", "no hotel"], ["no decision log to retry", "no retry log"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  const rows: [string, string, string][] = [
    ["blocking", "a dead coordinator freezes every lock", "locks freeze"],
    ["CAP", "picks consistency over availability", "C over A"],
    ["partitions", "slow network or crashed node? can't tell", "can't tell"],
  ];
  return (
    <g>
      <Head k={["why 2PC fails in microservices", "why 2PC fails"]} tone="bad" narrow={narrow} />
      {rows.map(([k, v, n], i) => (
        <g key={k} opacity={fade(t, i, 0.16)}>
          <rect className="ax-box bad" x={16} y={52 + i * 58} width={568} height={46} />
          <Txt x={30} y={80 + i * 58} k="k" anchor="start" tone="bad">
            {k}
          </Txt>
          <Txt x={570} y={80 + i * 58} k="s" anchor="end">
            {narrow ? n : v}
          </Txt>
        </g>
      ))}
      <Chips items={[["recovery needs a human", "manual recovery"]]} t={seg(t, 0.5, 1)} tone="bad" narrow={narrow} />
    </g>
  );
}

const CX = (i: number) => 16 + i * 206;
function Chain({ tones, subs, ev }: { tones: Tone[]; subs: string[]; ev: [string, Tone][] }) {
  return (
    <g>
      {SVC.map(([l], i) => (
        <Box key={l} x={CX(i)} y={70} w={156} h={64} label={l} sub={subs[i]} tone={tones[i]} />
      ))}
      {ev.map(([, tone], i) => (
        <g key={i}>
          <Wire d={`M${CX(i) + 156} 102H${CX(i + 1)}`} arrow tone={tone === "bad" ? "bad" : tone === "ok" ? "ok" : undefined} />
        </g>
      ))}
    </g>
  );
}
function Saga({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const k = Math.min(3, Math.floor(ease(t) * 3.2));
    return (
      <g>
        <Head k={["the saga · undo, don't lock", "the saga"]} c="Garcia-Molina & Salem, 1987" narrow={narrow} />
        <Chain tones={[0, 1, 2].map((i) => (i < k ? "ok" : undefined))} subs={[0, 1, 2].map((i) => (i < k ? (narrow ? "booked" : "committed locally") : ""))} ev={[["", k > 1 ? "ok" : undefined], ["", k > 2 ? "ok" : undefined]]} />
        <Txt x={300} y={186} k="s" opacity={fade(t, 3)}>
          {narrow ? "FlightBooked → HotelBooked → CarBooked" : "FlightBooked → HotelBooked → CarBooked: no locks held"}
        </Txt>
        <Chips items={[["commit locally", "local commits"], ["publish an event", "events"], ["eventually consistent", "eventual"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const c1 = seg(t, 0.3, 0.6);
    const c2 = seg(t, 0.6, 0.9);
    return (
      <g>
        <Head k={["the car fails · compensate", "compensate"]} tone="warn" narrow={narrow} />
        <Chain tones={[c2 >= 1 ? "mute" : "ok", c1 >= 1 ? "mute" : "ok", "bad"]} subs={[c2 >= 1 ? "cancelled" : "booked", c1 >= 1 ? "cancelled" : "booked", "failed"]} ev={[["", "ok"], ["", "ok"]]} />
        <Wire d={`M${CX(2) + 78} 134V170H${CX(1) + 78}V134`} arrow tone="lit" />
        <Wire d={`M${CX(1) + 60} 170V190H${CX(0) + 78}V134`} arrow tone="lit" />
        {c1 > 0 && c1 < 1 && <Token x={lerp(CX(2) + 78, CX(1) + 78, c1)} y={170} tone="warn" />}
        {c2 > 0 && c2 < 1 && <Token x={lerp(CX(1) + 60, CX(0) + 78, c2)} y={190} tone="warn" />}
        <Chips items={[["CarBookingFailed", "car failed"], ["cancel hotel", "cancel hotel"], ["cancel flight", "cancel flight"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Head k={["two saga styles", "two styles"]} narrow={narrow} />
        <rect className="ax-box sky" x={16} y={56} width={270} height={120} />
        <Txt x={151} y={90} k="t">
          {narrow ? "Orchestrated" : "Orchestrated"}
        </Txt>
        <Txt x={151} y={120} k="s">
          {narrow ? "one orchestrator" : "a central orchestrator"}
        </Txt>
        <Txt x={151} y={144} k="s">
          {narrow ? "calls each step" : "calls each step, runs undo"}
        </Txt>
        <rect className="ax-box ok" x={314} y={56} width={270} height={120} />
        <Txt x={449} y={90} k="t">
          {narrow ? "Choreographed" : "Choreographed"}
        </Txt>
        <Txt x={449} y={120} k="s">
          {narrow ? "no centre" : "no central coordinator"}
        </Txt>
        <Txt x={449} y={144} k="s">
          {narrow ? "services react" : "services react to events"}
        </Txt>
        <Chips items={[["every action has an undo", "an undo per step"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["idempotency", "idempotency"]} c={["safe retries", "safe retries"]} tone="ok" narrow={narrow} />
      <Box x={16} y={80} w={160} h={90} label="Retry" sub={narrow ? "same key" : "same key, twice"} tone="sky" />
      <Wire d="M176 125H220" arrow />
      <Box x={220} y={80} w={180} h={90} label={narrow ? "Seen key?" : "Key seen?"} sub={narrow ? "cached result" : "return cached result"} tone="ok" />
      <Wire d="M400 125H444" arrow tone="ok" />
      <Box x={444} y={80} w={140} h={90} label="1 booking" tone="ok" />
      <Chips items={[["retry is safe", "safe retry"], ["no double booking", "no doubles"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Pick({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const rows: [string, string, string, string][] = [
      ["consistency", "strong", "eventual", "eventual"],
      ["availability", "poor, blocking", "high", "high"],
      ["recovery", "manual", "self-healing", "automatic"],
    ];
    return (
      <g>
        <Head k={["the decision", "decision"]} c={["travel: saga", "saga"]} tone="ok" narrow={narrow} />
        <Txt x={360} y={62} k="k" tone="bad">
          2PC
        </Txt>
        <Txt x={520} y={62} k="k" tone="ok">
          Saga
        </Txt>
        {rows.map(([k, a, b, nb], i) => (
          <g key={k} opacity={fade(t, i, 0.16)}>
            <rect className="ax-box" x={16} y={74 + i * 52} width={568} height={42} />
            <Txt x={30} y={100 + i * 52} k="s" anchor="start">
              {k}
            </Txt>
            <Txt x={360} y={100 + i * 52} k="s" tone="bad">
              {narrow ? a.split(",")[0] : a}
            </Txt>
            <Txt x={520} y={100 + i * 52} k="s" tone="ok">
              {narrow ? nb : b}
            </Txt>
          </g>
        ))}
        <Chips items={[["2PC still fits: transfers inside one bank", "2PC: inside one bank"]]} t={seg(t, 0.5, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["after the switch", "the result"]} tone="ok" narrow={narrow} />
        <Figs items={[["99.97%", narrow ? "from 99.5%" : "uptime, from 99.5%", "ok"], ["75K", narrow ? "from 10K" : "concurrent, from 10K", "ok"]]} y={120} t={t} narrow={narrow} />
        <Figs items={[["$5.6M", narrow ? "bookings back" : "failed bookings recovered", "ok"], ["4.7★", narrow ? "from 3.2" : "rating, from 3.2"]]} y={220} t={seg(t, 0.3, 1)} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Txt x={300} y={110} k="t">
        {narrow ? "don't avoid failure:" : "it's not about avoiding failure:"}
      </Txt>
      <Txt x={300} y={152} k="d" tone="lit" opacity={fade(t, 1)}>
        {narrow ? "undo it" : "fail, then undo"}
      </Txt>
      <Chips items={[["undo is first-class", "design the undo"], ["eventual is often fine", "eventual is OK"], ["monitor saga health", "watch sagas"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "break") return <Break {...p} />;
  if (p.variant === "saga") return <Saga {...p} />;
  if (p.variant === "pick") return <Pick {...p} />;
  return <Ask {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "ask",
      label: "2PC",
      steps: [
        { caption: "WonderTravel promises one click: a JFK to Tokyo flight, a hotel and a car, booked in New York, Amsterdam and Singapore. All three, or none.", tween: 1400 },
        { caption: "Two-phase commit first sends PREPARE. Flight, Hotel and Car each lock the seat, room and car, and answer PREPARED.", tween: 1800 },
        { caption: "Once all three are prepared, the coordinator sends COMMIT and every booking is finalised together. Strong, but everyone waits on it.", tween: 1800 },
      ],
    },
    {
      id: "break",
      label: "It breaks",
      steps: [
        { caption: "12:15 AM, Black Friday: the coordinator runs out of memory. 2,000 transactions stay prepared, 6,000 items locked, 4 hours to unlock by hand.", tween: 1200, ms: 3600 },
        { caption: "A partition cuts the coordinator off from Hotel mid-commit. Flight and car are booked and charged; the hotel is stuck in doubt.", tween: 1200 },
        { caption: "The root problem: 2PC blocks. It picks consistency over availability, and it can't tell a slow network from a crashed node.", tween: 1400 },
      ],
    },
    {
      id: "saga",
      label: "Saga",
      steps: [
        { caption: "A saga holds no locks. Each service commits locally and publishes an event: FlightBooked, then HotelBooked, then CarBooked.", tween: 1800 },
        { caption: "If the car booking fails, the saga compensates backwards: cancel the hotel, then cancel the flight. The system heals itself.", tween: 2000 },
        { caption: "It can be orchestrated by one coordinator that calls each step, or choreographed, with services reacting to each other's events.", tween: 1200 },
        { caption: "Every step needs an idempotency key, so a retried booking returns the first result instead of booking twice.", tween: 1200 },
      ],
    },
    {
      id: "pick",
      label: "The choice",
      steps: [
        { caption: "Travel tolerates eventual consistency but needs availability, so WonderTravel chose sagas. 2PC still fits rare cases like transfers inside one bank.", tween: 1400, ms: 3400 },
        { caption: "After the switch: uptime from 99.5% to 99.97%, 10K to 75K concurrent bookings, and $5.6M of once-failed bookings now succeeding.", tween: 1400 },
        { caption: "The lesson: you can't avoid failure in distributed systems. Design the undo with the same care as the happy path.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
